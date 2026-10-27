import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/response.js';
import { buildSort, escapeRegex } from '../validators/common.js';
import { ROLES, isStaff } from '../utils/roles.js';
import { logActivity, ACTIVITY_ACTIONS, visibleActorIds } from '../services/activityService.js';
import { ApiError as _ApiError } from '../utils/ApiError.js';

/**
 * Which jobs a staff member may see and edit.
 *
 *   admin      every job
 *   principal  their own, plus every job posted by a recruiter they appointed
 *   recruiter  their own
 *
 * Returns a Mongo filter fragment, so listing and per-record checks share one
 * definition of "below me".
 */
const jobScopeFor = async (user) => {
  if (user.role === ROLES.ADMIN) return {};
  const ids = await visibleActorIds(user);
  return { createdBy: { $in: ids } };
};

/** Throws unless the job belongs to the caller or someone beneath them. */
const assertCanManageJob = async (user, job) => {
  if (user.role === ROLES.ADMIN) return;
  const ids = await visibleActorIds(user);
  const allowed = ids.some((id) => String(id) === String(job.createdBy));
  if (!allowed) {
    throw _ApiError.forbidden('This job was posted outside your team');
  }
};

const SORTABLE = ['createdAt', 'lastDateToApply', 'title', 'applicationCount'];

/**
 * One list endpoint serves the public job board and the admin job manager. The
 * caller's role decides what is visible: anonymous and candidate callers only
 * ever see open, undeleted jobs inside their deadline.
 */
export const listJobs = asyncHandler(async (req, res) => {
  const { q, department, location, minExp, maxExp, employmentType, status, page, limit, sortBy, sortOrder } =
    req.body;

  const viewerIsStaff = isStaff(req.user?.role);
  const filter = { isDeleted: false };

  if (viewerIsStaff) {
    // Staff see the jobs within their scope, in any status.
    Object.assign(filter, await jobScopeFor(req.user));
    if (status && status !== 'all') filter.status = status;
  } else {
    // Anonymous visitors and candidates only ever see live openings.
    filter.status = 'open';
    filter.lastDateToApply = { $gte: new Date() };
  }

  if (department) filter.department = new RegExp(`^${escapeRegex(department)}$`, 'i');
  if (location) filter.location = new RegExp(escapeRegex(location), 'i');
  if (employmentType) filter.employmentType = employmentType;

  // minExp is "I have this much experience" — show jobs whose minimum I meet.
  if (minExp !== undefined) filter.experienceMin = { $lte: minExp };
  if (maxExp !== undefined) filter.experienceMax = { $gte: maxExp };

  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { title: rx },
      { description: rx },
      { skills: rx },
      { subjects: rx },
      { department: rx },
    ];
  }

  const sort = buildSort(sortBy, sortOrder, SORTABLE, { createdAt: -1 });
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Job.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter),
  ]);

  // Candidates see which of these they have already applied to, so the board
  // can render an "Applied" state without a call per card.
  let appliedJobIds = [];
  if (req.user?.role === 'candidate' && items.length > 0) {
    const applications = await Application.find({
      candidateId: req.user._id,
      jobId: { $in: items.map((job) => job._id) },
    })
      .select('jobId')
      .lean();
    appliedJobIds = applications.map((app) => String(app.jobId));
  }

  return ok(
    res,
    { ...paginated(items, total, page, limit), appliedJobIds },
    'Jobs',
  );
});

export const getJob = asyncHandler(async (req, res) => {
  // Either key resolves to the same job: slug for shared public links, id for
  // internal navigation and every link shared before slugs existed.
  const { jobId, slug } = req.body;
  const job = await Job.findOne({
    ...(slug ? { slug } : { _id: jobId }),
    isDeleted: false,
  }).lean();
  if (!job) throw ApiError.notFound('This job is no longer available');

  // A draft or closed job is visible to staff within scope only.
  if (!isStaff(req.user?.role) && job.status !== 'open') {
    throw ApiError.notFound('This job is no longer available');
  }

  let hasApplied = false;
  if (req.user?.role === 'candidate') {
    hasApplied = Boolean(
      await Application.exists({ jobId: job._id, candidateId: req.user._id }),
    );
  }

  const isExpired = new Date(job.lastDateToApply).getTime() < Date.now();

  return ok(res, { job, hasApplied, isExpired, canApply: !isExpired && job.status === 'open' }, 'Job');
});

export const createJob = asyncHandler(async (req, res) => {
  const job = await Job.create({ ...req.body, createdBy: req.user._id });

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.JOB_CREATED,
    targetType: 'job',
    targetId: job._id,
    targetLabel: job.title,
    summary: `Posted "${job.title}" (${job.department})`,
    meta: { department: job.department, openings: job.openings, status: job.status },
  });

  return created(res, { job: job.toObject() }, 'Job created');
});

export const updateJob = asyncHandler(async (req, res) => {
  const { jobId, ...updates } = req.body;

  const job = await Job.findOne({ _id: jobId, isDeleted: false });
  if (!job) throw ApiError.notFound('Job not found');
  await assertCanManageJob(req.user, job);

  const changedFields = Object.keys(updates);
  Object.assign(job, updates);

  // A partial update can still produce an invalid range across old and new values.
  if (job.experienceMax < job.experienceMin) {
    throw ApiError.badRequest('Maximum experience must be greater than or equal to minimum');
  }

  await job.save();

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.JOB_UPDATED,
    targetType: 'job',
    targetId: job._id,
    targetLabel: job.title,
    summary: `Edited "${job.title}"`,
    meta: { fields: changedFields },
  });

  return ok(res, { job: job.toObject() }, 'Job updated');
});

export const updateJobStatus = asyncHandler(async (req, res) => {
  const existing = await Job.findOne({ _id: req.body.jobId, isDeleted: false });
  if (!existing) throw ApiError.notFound('Job not found');
  await assertCanManageJob(req.user, existing);

  const previousStatus = existing.status;
  existing.status = req.body.status;
  await existing.save();

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.JOB_STATUS_CHANGED,
    targetType: 'job',
    targetId: existing._id,
    targetLabel: existing.title,
    summary: `Changed "${existing.title}" from ${previousStatus} to ${req.body.status}`,
    meta: { from: previousStatus, to: req.body.status },
  });

  return ok(
    res,
    { job: existing.toObject() },
    `Job ${req.body.status === 'open' ? 'reopened' : req.body.status}`,
  );
});

/** Soft delete — applications reference this job and must keep resolving. */
export const deleteJob = asyncHandler(async (req, res) => {
  const existing = await Job.findOne({ _id: req.body.jobId, isDeleted: false });
  if (!existing) throw ApiError.notFound('Job not found');
  await assertCanManageJob(req.user, existing);

  existing.isDeleted = true;
  existing.status = 'closed';
  await existing.save();

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.JOB_DELETED,
    targetType: 'job',
    targetId: existing._id,
    targetLabel: existing.title,
    summary: `Deleted "${existing.title}"`,
    meta: { department: existing.department },
  });

  return ok(res, { jobId: String(existing._id) }, 'Job deleted');
});
