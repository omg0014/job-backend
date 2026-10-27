import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';
import { Interview } from '../models/Interview.js';
import { TalentPoolEntry } from '../models/TalentPoolEntry.js';
import { Notification } from '../models/Notification.js';
import { ActivityLog, ACTIVITY_ACTIONS } from '../models/ActivityLog.js';
import { ROLES, ROLE_LABELS } from '../utils/roles.js';
import { storageService } from '../services/storageService.js';
import { extractText } from '../services/cvParser/textExtractor.js';
import { jobs, candidates } from './seedData.js';
import { makeSampleCvPdf } from './makeSampleCv.js';

/**
 * Wipes and rebuilds the development dataset: 1 admin, 1 principal,
 * 2 recruiters, 5 jobs and 8 candidates with parsed profiles and real CV files
 * on disk, plus applications spread across every pipeline stage so no admin
 * screen opens empty on first run.
 *
 * One candidate (Ritu Chaudhary) deliberately never applies, so the Candidates
 * directory's "Never applied" filter and the Offer a role flow have something
 * real to work against.
 */
const run = async () => {
  await connectDb();

  console.log('[seed] clearing existing data');
  await Promise.all([
    User.deleteMany({}),
    CandidateProfile.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    Interview.deleteMany({}),
    TalentPoolEntry.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);

  // --- Admin -------------------------------------------------------------
  const admin = await User.create({
    name: env.seedAdmin.name,
    email: env.seedAdmin.email,
    passwordHash: await bcrypt.hash(env.seedAdmin.password, env.bcryptRounds),
    role: 'admin',
  });
  console.log(`[seed] admin: ${admin.email} / ${env.seedAdmin.password}`);

  // --- Principal and recruiters ------------------------------------------
  // admin -> principal -> recruiters, which is the chain every activity query
  // walks.
  const staffPassword = 'Staff@123';
  const staffHash = await bcrypt.hash(staffPassword, env.bcryptRounds);

  const principal = await User.create({
    name: 'Latha Raman',
    email: 'principal@yugam.edu.in',
    passwordHash: staffHash,
    role: ROLES.PRINCIPAL,
    department: 'Senior Secondary',
    appointedBy: admin._id,
    appointedAt: new Date(),
  });
  console.log(`[seed] principal: ${principal.email} / ${staffPassword}`);

  const recruiters = await User.create([
    {
      name: 'Deepa Iyer',
      email: 'recruiter1@yugam.edu.in',
      passwordHash: staffHash,
      role: ROLES.RECRUITER,
      department: 'Science',
      appointedBy: principal._id,
      appointedAt: new Date(),
    },
    {
      name: 'Vikram Shetty',
      email: 'recruiter2@yugam.edu.in',
      passwordHash: staffHash,
      role: ROLES.RECRUITER,
      department: 'Primary',
      appointedBy: principal._id,
      appointedAt: new Date(),
    },
  ]);
  for (const recruiter of recruiters) {
    console.log(`[seed] recruiter: ${recruiter.email} / ${staffPassword}`);
  }

  // --- Jobs --------------------------------------------------------------
  // Spread across the hierarchy so each role's scoped view has real content.
  const posters = [admin, principal, recruiters[0], recruiters[1], recruiters[0]];
  const createdJobs = [];

  for (const [index, job] of jobs.entries()) {
    const poster = posters[index % posters.length];
    const created = await Job.create({ ...job, createdBy: poster._id });
    createdJobs.push(created);

    await ActivityLog.create({
      actorId: poster._id,
      actorName: poster.name,
      actorRole: poster.role,
      actorChain:
        poster.role === ROLES.RECRUITER
          ? [principal._id, admin._id]
          : poster.role === ROLES.PRINCIPAL
            ? [admin._id]
            : [],
      action: ACTIVITY_ACTIONS.JOB_CREATED,
      targetType: 'job',
      targetId: created._id,
      targetLabel: created.title,
      summary: `Posted "${created.title}" (${created.department})`,
      meta: { department: created.department, openings: created.openings },
    });
  }
  console.log(`[seed] ${createdJobs.length} jobs created across the hierarchy`);

  // Appointment events, so the activity log reads as a history from day one.
  await ActivityLog.create([
    {
      actorId: admin._id,
      actorName: admin.name,
      actorRole: admin.role,
      actorChain: [],
      action: ACTIVITY_ACTIONS.USER_APPOINTED,
      targetType: 'user',
      targetId: principal._id,
      targetLabel: principal.name,
      summary: `Appointed ${principal.name} as ${ROLE_LABELS[ROLES.PRINCIPAL]}`,
      meta: { role: ROLES.PRINCIPAL },
    },
    ...recruiters.map((recruiter) => ({
      actorId: principal._id,
      actorName: principal.name,
      actorRole: principal.role,
      actorChain: [admin._id],
      action: ACTIVITY_ACTIONS.USER_APPOINTED,
      targetType: 'user',
      targetId: recruiter._id,
      targetLabel: recruiter.name,
      summary: `Appointed ${recruiter.name} as ${ROLE_LABELS[ROLES.RECRUITER]}`,
      meta: { role: ROLES.RECRUITER, department: recruiter.department },
    })),
  ]);
  console.log('[seed] appointment history recorded');

  // --- Candidates + profiles + CV files ----------------------------------
  const createdCandidates = [];

  for (const entry of candidates) {
    const user = await User.create({
      name: entry.user.name,
      email: entry.user.email,
      passwordHash: await bcrypt.hash(entry.user.password, env.bcryptRounds),
      role: 'candidate',
    });

    // A real PDF on disk so CV preview and download work immediately after seeding.
    const pdfBuffer = makeSampleCvPdf(entry.profile);
    const originalName = `${entry.profile.fullName.replace(/\s+/g, '-').toLowerCase()}-cv.pdf`;
    const { fileName, storagePath } = await storageService.save(pdfBuffer, {
      originalName,
      subdir: 'cvs',
    });

    const extraction = await extractText(pdfBuffer, 'application/pdf', originalName);

    const profile = await CandidateProfile.create({
      userId: user._id,
      ...entry.profile,
      cv: {
        fileName,
        originalName,
        mimeType: 'application/pdf',
        size: pdfBuffer.length,
        storagePath,
        uploadedAt: new Date(),
      },
      rawCvText: extraction.text,
      parseStatus: 'parsed',
    });

    createdCandidates.push({ user, profile });
    console.log(`[seed] candidate: ${user.email} / ${entry.user.password}`);
  }

  // --- Applications ------------------------------------------------------
  const snapshotOf = (profile) => ({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    headline: profile.headline,
    totalExperienceYears: profile.totalExperienceYears,
    subjects: profile.subjects,
    skills: profile.skills,
    certifications: profile.certifications,
    languages: profile.languages,
    education: profile.education,
    experience: profile.experience,
  });

  // Each sample candidate applies to the job matching their subject.
  // Jobs, in seed order: 0 PGT Physics, 1 TGT Mathematics,
  // 2 Primary Teacher, 3 Computer Science, 4 Physical Education.
  //
  // Spread across every pipeline stage and every job, so each admin screen
  // has real content rather than an empty state — including a rejection and
  // a selection, which are the two ends nothing else exercises.
  const pairings = [
    { candidate: 0, job: 0, status: 'shortlisted' },   // Anjali  → PGT Physics
    { candidate: 1, job: 1, status: 'under_review' },  // Rahul   → TGT Maths
    { candidate: 2, job: 2, status: 'applied' },       // Fatima  → Primary
    { candidate: 0, job: 3, status: 'applied' },       // Anjali  → Computer Science
    { candidate: 3, job: 3, status: 'shortlisted' },   // Karthik → Computer Science
    { candidate: 4, job: 4, status: 'selected' },      // Priya   → Physical Education
    { candidate: 5, job: 1, status: 'applied' },       // Sneha   → TGT Maths (fresher)
    { candidate: 6, job: 0, status: 'under_review' },  // Joseph  → PGT Physics (senior)
    { candidate: 5, job: 2, status: 'rejected' },      // Sneha   → Primary

    // Joseph applies across three subjects, each at a different stage — the
    // case where one teacher sits in several pipelines at once and the admin
    // needs to see each decision separately.
    { candidate: 6, job: 3, status: 'applied' },       // Joseph  → Computer Science
    { candidate: 6, job: 2, status: 'shortlisted' },   // Joseph  → Primary
  ];

  for (const pairing of pairings) {
    const { user, profile } = createdCandidates[pairing.candidate];
    const job = createdJobs[pairing.job];

    await Application.create({
      jobId: job._id,
      candidateId: user._id,
      profileSnapshot: snapshotOf(profile),
      cvSnapshot: { originalName: profile.cv.originalName, storagePath: profile.cv.storagePath },
      status: pairing.status,
      statusHistory: [
        { status: 'applied', changedBy: user._id, changedAt: new Date() },
        ...(pairing.status !== 'applied'
          ? [{ status: pairing.status, changedBy: admin._id, changedAt: new Date() }]
          : []),
      ],
      appliedAt: new Date(),
    });

    await Job.updateOne({ _id: job._id }, { $inc: { applicationCount: 1 } });
  }
  console.log(`[seed] ${pairings.length} applications created`);

  // --- One scheduled interview so the admin views are not empty ----------
  const shortlisted = await Application.findOne({ status: 'shortlisted' });
  if (shortlisted) {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 3);
    scheduledAt.setHours(11, 0, 0, 0);

    await Interview.create({
      applicationId: shortlisted._id,
      scheduledAt,
      mode: 'offline',
      locationOrLink: 'Yugam International School, Principal Office, Coimbatore',
      interviewerName: 'Mrs. Latha Raman (Principal)',
      outcome: 'pending',
      createdBy: admin._id,
    });

    shortlisted.status = 'interview_scheduled';
    shortlisted.statusHistory.push({
      status: 'interview_scheduled',
      changedBy: admin._id,
      changedAt: new Date(),
      note: 'Demo interview scheduled by the seed script',
    });
    await shortlisted.save();

    await Notification.create({
      userId: shortlisted.candidateId,
      type: 'interview_scheduled',
      title: 'Interview scheduled — PGT Physics',
      message: 'Your interview has been scheduled. Please check your applications for details.',
      link: '/applications',
    });
    console.log('[seed] 1 interview scheduled');
  }

  // --- Talent pool -------------------------------------------------------
  const poolEntries = [
    {
      candidateId: createdCandidates[2].user._id,
      addedBy: admin._id,
      tags: ['Primary', 'Montessori'],
      note: 'Strong primary candidate — consider for the next primary opening.',
    },
    {
      candidateId: createdCandidates[6].user._id,
      addedBy: principal._id,
      tags: ['Science', 'Senior Secondary', 'Leadership'],
      note: 'Fourteen years and a current HOD. Worth approaching if a science lead role opens.',
    },
    {
      candidateId: createdCandidates[3].user._id,
      addedBy: recruiters[0]._id,
      tags: ['Computer Science'],
      note: 'Good fit for the computer science opening; keep on file either way.',
    },
  ];
  await TalentPoolEntry.create(poolEntries);
  console.log(`[seed] ${poolEntries.length} talent pool entries created`);

  console.log('\n[seed] done. Sign in with:');
  console.log(`  admin      ${env.seedAdmin.email} / ${env.seedAdmin.password}`);
  console.log(`  principal  principal@yugam.edu.in / ${staffPassword}`);
  console.log(`  recruiter  recruiter1@yugam.edu.in / ${staffPassword}`);
  console.log(`  recruiter  recruiter2@yugam.edu.in / ${staffPassword}`);
  console.log(`  candidate  ${candidates[0].user.email} / ${candidates[0].user.password}`);

  await disconnectDb();
};

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
