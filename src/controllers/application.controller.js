import { Application, APPLICATION_STATUSES } from '../models/Application.js';
import { Job } from '../models/Job.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { Interview } from '../models/Interview.js';
import { storageService } from '../services/storageService.js';
import { notify } from '../services/notificationService.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/response.js';
import { buildSort, escapeRegex } from '../validators/common.js';
import { logActivity, ACTIVITY_ACTIONS, visibleActorIds } from '../services/activityService.js';
import { ROLES } from '../utils/roles.js';

const MIN_COMPLETION_TO_APPLY = 60;

const STATUS_LABELS = {
  applied: 'Applied',
  under_review: 'Under review',
  screening: 'Video screening',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  selected: 'Selected',
  rejected: 'Not selected',
};

/** Frozen copy of the profile as submitted — later edits must not rewrite it. */
const buildSnapshot = (profile) => ({
  fullName: profile.fullName,
  email: profile.email,
  phone: profile.phone,
  location: profile.location,
  headline: profile.headline,
  totalExperienceYears: profile.totalExperienceYears,
  subjects: profile.subjects ?? [],
  skills: profile.skills ?? [],
  certifications: profile.certifications ?? [],
  languages: profile.languages ?? [],
  education: profile.education ?? [],
  experience: profile.experience ?? [],
});

/**
 * One-click apply. Idempotency rests on the unique (jobId, candidateId) index,
 * so a double-click or refresh yields a clean 409 rather than a duplicate row.
 */
export const createApplication = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.body.jobId, isDeleted: false });
  if (!job) throw ApiError.notFound('This job is no longer available');
  if (!job.isAcceptingApplications()) {
    throw ApiError.badRequest('Applications for this job are closed');
  }

  const profile = await CandidateProfile.findOne({ userId: req.user._id });
  if (!profile) throw ApiError.badRequest('Please complete your profile before applying');
  if (!profile.cv?.storagePath) {
    throw ApiError.badRequest('Please upload your CV before applying');
  }
  if (profile.profileCompletion < MIN_COMPLETION_TO_APPLY) {
    throw ApiError.badRequest(
      `Your profile is ${profile.profileCompletion}% complete. Please complete it to at least ${MIN_COMPLETION_TO_APPLY}% before applying.`,
    );
  }

  let application;
  try {
    application = await Application.create({
      jobId: job._id,
      candidateId: req.user._id,
      profileSnapshot: buildSnapshot(profile),
      cvSnapshot: {
        originalName: profile.cv.originalName,
        storagePath: profile.cv.storagePath,
      },
      status: 'applied',
      statusHistory: [{ status: 'applied', changedBy: req.user._id, changedAt: new Date() }],
      appliedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw ApiError.conflict('You have already applied to this job');
    }
    throw err;
  }

  await Job.updateOne({ _id: job._id }, { $inc: { applicationCount: 1 } });

  await notify({
    userId: req.user._id,
    type: 'application_status',
    title: `Application received — ${job.title}`,
    message: `Your application for ${job.title} at Yugam International School has been received. We will update you as it progresses.`,
    link: '/applications',
  });

  return created(res, { application: application.toObject() }, 'Application submitted');
});

export const myApplications = asyncHandler(async (req, res) => {
  const { status, page, limit, sortBy, sortOrder } = req.body;

  const filter = { candidateId: req.user._id };
  if (status) filter.status = status;

  const sort = buildSort(sortBy, sortOrder, ['appliedAt', 'status'], { appliedAt: -1 });
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Application.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('jobId', 'title department location employmentType status lastDateToApply')
      .lean(),
    Application.countDocuments(filter),
  ]);

  // Candidates need to see a scheduled interview on their application card.
  const interviews = await Interview.find({
    applicationId: { $in: items.map((item) => item._id) },
  })
    .select('applicationId scheduledAt mode locationOrLink interviewerName outcome')
    .lean();

  const interviewsByApplication = new Map(
    interviews.map((interview) => [String(interview.applicationId), interview]),
  );

  const withInterviews = items.map((item) => ({
    ...item,
    interview: interviewsByApplication.get(String(item._id)) ?? null,
  }));

  return ok(res, paginated(withInterviews, total, page, limit), 'My applications');
});

/** Admin applicant list — filterable across the frozen profile snapshot. */
export const listApplications = asyncHandler(async (req, res) => {
  const { jobId, status, q, minExp, skill, subject, page, limit, sortBy, sortOrder } = req.body;

  const filter = {};

  // Applicants are visible through the jobs you own: an admin sees every job,
  // a principal their own plus their recruiters', a recruiter only their own.
  // Without this every staff member could read every application.
  if (req.user.role !== ROLES.ADMIN) {
    const ownerIds = await visibleActorIds(req.user);
    const scopedJobs = await Job.find({ createdBy: { $in: ownerIds } }).select('_id').lean();
    filter.jobId = { $in: scopedJobs.map((job) => job._id) };
  }

  // An explicit jobId narrows further, but only inside that scope.
  if (jobId) {
    if (filter.jobId && !filter.jobId.$in.some((id) => String(id) === String(jobId))) {
      return ok(res, paginated([], 0, page, limit), 'Applications');
    }
    filter.jobId = jobId;
  }

  if (status) filter.status = status;
  if (minExp !== undefined) filter['profileSnapshot.totalExperienceYears'] = { $gte: minExp };
  if (skill) filter['profileSnapshot.skills'] = new RegExp(escapeRegex(skill), 'i');
  if (subject) filter['profileSnapshot.subjects'] = new RegExp(escapeRegex(subject), 'i');

  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { 'profileSnapshot.fullName': rx },
      { 'profileSnapshot.email': rx },
      { 'profileSnapshot.headline': rx },
      { 'profileSnapshot.skills': rx },
      { 'profileSnapshot.subjects': rx },
    ];
  }

  const sort = buildSort(sortBy, sortOrder, ['appliedAt', 'status'], { appliedAt: -1 });
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Application.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('jobId', 'title department location')
      .lean(),
    Application.countDocuments(filter),
  ]);

  return ok(res, paginated(items, total, page, limit), 'Applications');
});

/** Throws unless the application belongs to a job the caller can see. */
const assertCanViewApplication = async (user, application) => {
  if (user.role === ROLES.ADMIN) return;
  const ownerIds = await visibleActorIds(user);
  const jobId = application.jobId?._id ?? application.jobId;
  const job = await Job.findById(jobId).select('createdBy').lean();
  const allowed = job && ownerIds.some((id) => String(id) === String(job.createdBy));
  if (!allowed) throw ApiError.forbidden('This applicant applied to another team’s job');
};

export const getApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.body.applicationId)
    .populate('jobId', 'title department location employmentType experienceMin experienceMax')
    .populate('candidateId', 'name email lastLoginAt')
    .lean();

  if (!application) throw ApiError.notFound('Application not found');
  await assertCanViewApplication(req.user, application);

  // The live profile is shown alongside the snapshot — HR wants the current CV
  // and current contact details even when the snapshot is older.
  const profile = await CandidateProfile.findOne({ userId: application.candidateId._id }).lean();
  const interview = await Interview.findOne({ applicationId: application._id }).lean();

  return ok(res, { application, profile, interview }, 'Application');
});

export const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { applicationId, status, note } = req.body;

  const application = await Application.findById(applicationId).populate('jobId', 'title');
  if (!application) throw ApiError.notFound('Application not found');
  await assertCanViewApplication(req.user, application);

  if (application.status === status) {
    return ok(res, { application: application.toObject() }, 'Status unchanged');
  }

  application.status = status;
  application.statusHistory.push({
    status,
    changedBy: req.user._id,
    changedAt: new Date(),
    note,
  });
  await application.save();

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.APPLICATION_STATUS_CHANGED,
    targetType: 'application',
    targetId: application._id,
    targetLabel: application.profileSnapshot?.fullName ?? 'Candidate',
    summary: `Moved ${application.profileSnapshot?.fullName ?? 'a candidate'} to "${STATUS_LABELS[status]}" for ${application.jobId?.title ?? 'a role'}`,
    meta: { status, jobTitle: application.jobId?.title, note },
  });

  await notify({
    userId: application.candidateId,
    type: 'application_status',
    title: `Application update — ${application.jobId?.title ?? 'your application'}`,
    message: note
      ? `Your application is now "${STATUS_LABELS[status]}". ${note}`
      : `Your application is now "${STATUS_LABELS[status]}".`,
    link: '/applications',
  });

  return ok(res, { application: application.toObject() }, 'Status updated');
});

/**
 * Streams an applicant's CV to an admin. CV files are never served from a
 * public path — this endpoint is the only way to reach them.
 */
export const downloadApplicationCv = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.body.applicationId).lean();
  if (!application) throw ApiError.notFound('Application not found');
  await assertCanViewApplication(req.user, application);

  const storagePath = application.cvSnapshot?.storagePath;
  if (!storagePath) throw ApiError.notFound('No CV was attached to this application');

  const exists = await storageService.exists(storagePath);
  if (!exists) throw ApiError.notFound('The CV file is no longer available');

  const originalName = application.cvSnapshot.originalName || 'cv.pdf';
  const ext = originalName.toLowerCase().split('.').pop();
  const mimeType =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/msword';

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);

  storageService.createReadStream(storagePath).pipe(res);
});

export { APPLICATION_STATUSES };
