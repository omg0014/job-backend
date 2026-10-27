import { User } from '../models/User.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { Application } from '../models/Application.js';
import { Job } from '../models/Job.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/response.js';
import { escapeRegex } from '../validators/common.js';
import { ROLES } from '../utils/roles.js';
import { Notification } from '../models/Notification.js';
import { notify } from '../services/notificationService.js';
import { logActivity, ACTIVITY_ACTIONS } from '../services/activityService.js';

/**
 * The candidate directory: every teacher with an account, whether or not they
 * have applied to anything.
 *
 * This is deliberately separate from the applicant list. That one is a work
 * queue — applications to review, each at a pipeline stage. This is a talent
 * search: who is available, what do they teach, and can we point them at a
 * role. A candidate with no applications belongs here and nowhere else.
 */
export const listCandidates = asyncHandler(async (req, res) => {
  const { q, subject, skill, minExp, maxExp, location, hasCv, applied, page, limit } = req.body;

  const profileFilter = {};

  if (minExp !== undefined || maxExp !== undefined) {
    profileFilter.totalExperienceYears = {};
    if (minExp !== undefined) profileFilter.totalExperienceYears.$gte = minExp;
    if (maxExp !== undefined) profileFilter.totalExperienceYears.$lte = maxExp;
  }
  if (subject) profileFilter.subjects = new RegExp(escapeRegex(subject), 'i');
  if (skill) profileFilter.skills = new RegExp(escapeRegex(skill), 'i');
  if (location) profileFilter.location = new RegExp(escapeRegex(location), 'i');
  if (hasCv === true) profileFilter['cv.storagePath'] = { $exists: true, $ne: null };
  if (hasCv === false) profileFilter['cv.storagePath'] = { $in: [null, undefined] };

  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    profileFilter.$or = [
      { fullName: rx },
      { email: rx },
      { headline: rx },
      { subjects: rx },
      { skills: rx },
      { certifications: rx },
      { location: rx },
    ];
  }

  const profiles = await CandidateProfile.find(profileFilter).lean();
  let candidateIds = profiles.map((profile) => profile.userId);

  // "Has applied" is a property of Applications, not of the profile, so it is
  // resolved separately and intersected.
  if (applied !== undefined) {
    const appliedIds = await Application.distinct('candidateId');
    const appliedSet = new Set(appliedIds.map(String));
    candidateIds = candidateIds.filter((id) => appliedSet.has(String(id)) === applied);
  }

  const userFilter = { role: ROLES.CANDIDATE, _id: { $in: candidateIds }, isActive: true };
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(userFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(userFilter),
  ]);

  const pageIds = users.map((user) => user._id);
  const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));

  // Application counts per candidate, so the card can say "2 applications"
  // without a query each.
  const appCounts = await Application.aggregate([
    { $match: { candidateId: { $in: pageIds } } },
    { $group: { _id: '$candidateId', count: { $sum: 1 }, lastAppliedAt: { $max: '$appliedAt' } } },
  ]);
  const appsByUser = new Map(appCounts.map((row) => [String(row._id), row]));

  const items = users.map((user) => {
    const profile = profileByUser.get(String(user._id));
    const apps = appsByUser.get(String(user._id));

    return {
      id: String(user._id),
      name: profile?.fullName || user.name,
      email: profile?.email || user.email,
      phone: profile?.phone ?? '',
      location: profile?.location ?? '',
      headline: profile?.headline ?? '',
      totalExperienceYears: profile?.totalExperienceYears ?? 0,
      subjects: profile?.subjects ?? [],
      skills: profile?.skills ?? [],
      certifications: profile?.certifications ?? [],
      languages: profile?.languages ?? [],
      education: profile?.education ?? [],
      experience: profile?.experience ?? [],
      profileCompletion: profile?.profileCompletion ?? 0,
      hasCv: Boolean(profile?.cv?.storagePath),
      cvName: profile?.cv?.originalName ?? '',
      registeredAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      applicationCount: apps?.count ?? 0,
      lastAppliedAt: apps?.lastAppliedAt ?? null,
    };
  });

  return ok(res, paginated(items, total, page, limit), 'Candidates');
});

/**
 * Invites a candidate to apply for a specific role.
 *
 * Deliberately an invitation rather than an application: the candidate still
 * presses Apply, so their profile and CV are attached the normal way, the
 * pipeline starts where it always does, and nobody ends up having applied to
 * something they never chose.
 */
export const inviteCandidate = asyncHandler(async (req, res) => {
  const { candidateId, jobId, message } = req.body;

  const [candidate, job] = await Promise.all([
    User.findOne({ _id: candidateId, role: ROLES.CANDIDATE }).lean(),
    Job.findOne({ _id: jobId, isDeleted: false }).lean(),
  ]);

  if (!candidate) throw ApiError.notFound('Candidate not found');
  if (!job) throw ApiError.notFound('This job is no longer available');

  if (job.status !== 'open' || new Date(job.lastDateToApply) < new Date()) {
    throw ApiError.badRequest('That job is closed, so it cannot be offered');
  }

  // Inviting someone who already applied would be confusing for both sides.
  const existing = await Application.exists({ jobId, candidateId });
  if (existing) {
    throw ApiError.conflict(`${candidate.name} has already applied to this role`);
  }

  // Nor should a second invitation for the same role go out — a candidate
  // receiving the same message twice reads as a mistake, not enthusiasm.
  const alreadyInvited = await Notification.exists({
    userId: candidate._id,
    type: 'job_posted',
    link: `/jobs/${job._id}`,
  });
  if (alreadyInvited) {
    throw ApiError.conflict(`${candidate.name} has already been invited to this role`);
  }

  await notify({
    userId: candidate._id,
    type: 'job_posted',
    title: `Yugam International School invited you to apply for ${job.title}`,
    message: message?.trim()
      ? `${message.trim()}\n\nOpen the role to apply — your saved profile and CV will be sent with it.`
      : `Our team thinks you would be a good fit for ${job.title} (${job.department}). Open the role to apply — your saved profile and CV will be sent with it.`,
    link: `/jobs/${job._id}`,
  });

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.JOB_CREATED,
    targetType: 'user',
    targetId: candidate._id,
    targetLabel: candidate.name,
    summary: `Invited ${candidate.name} to apply for "${job.title}"`,
    meta: { jobId: String(job._id), jobTitle: job.title },
  });

  return ok(
    res,
    { candidateId: String(candidate._id), jobId: String(job._id) },
    `${candidate.name} has been invited to apply for ${job.title}`,
  );
});
