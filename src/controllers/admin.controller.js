import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';
import { Interview } from '../models/Interview.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { ROLES } from '../utils/roles.js';
import { visibleActorIds } from '../services/activityService.js';
import { ActivityLog } from '../models/ActivityLog.js';

/**
 * The four dashboard counters plus the upcoming interview list. Deliberately
 * the whole of V1 analytics — no charts beyond this.
 */
export const dashboard = asyncHandler(async (req, res) => {
  const now = new Date();

  // Counters reflect what this person is responsible for: an admin sees the
  // whole school, a principal their team's jobs, a recruiter their own.
  const scopeIds = await visibleActorIds(req.user);
  const jobScope = req.user.role === ROLES.ADMIN ? {} : { createdBy: { $in: scopeIds } };
  const scopedJobIds = req.user.role === ROLES.ADMIN
    ? null
    : (await Job.find(jobScope).select('_id').lean()).map((job) => job._id);
  const applicationScope = scopedJobIds ? { jobId: { $in: scopedJobIds } } : {};

  const [activeJobs, totalApplicants, shortlisted, upcomingInterviews, recentApplications, statusBreakdown] =
    await Promise.all([
      Job.countDocuments({
        ...jobScope,
        status: 'open',
        isDeleted: false,
        lastDateToApply: { $gte: now },
      }),
      Application.countDocuments(applicationScope),
      Application.countDocuments({ ...applicationScope, status: 'shortlisted' }),
      Interview.find({ scheduledAt: { $gte: now } })
        .sort({ scheduledAt: 1 })
        .limit(8)
        .populate({
          path: 'applicationId',
          select: 'profileSnapshot.fullName jobId',
          populate: { path: 'jobId', select: 'title department' },
        })
        .lean(),
      Application.find(applicationScope)
        .sort({ appliedAt: -1 })
        .limit(6)
        .populate('jobId', 'title department')
        .select('profileSnapshot.fullName status appliedAt jobId')
        .lean(),
      Application.aggregate([
        ...(scopedJobIds ? [{ $match: applicationScope }] : []),
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

  // Team summary, so the dashboard answers "who works for me and how active
  // are they" without a second call.
  const teamFilter =
    req.user.role === ROLES.ADMIN
      ? { role: { $ne: ROLES.CANDIDATE } }
      : req.user.role === ROLES.PRINCIPAL
        ? { appointedBy: req.user._id }
        : { _id: req.user._id };

  const [teamSize, recentActivity] = await Promise.all([
    User.countDocuments(teamFilter),
    ActivityLog.find({ actorId: { $in: scopeIds } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
  ]);

  return ok(
    res,
    {
      counters: {
        activeJobs,
        totalApplicants,
        shortlisted,
        upcomingInterviews: upcomingInterviews.length,
        teamSize,
      },
      viewer: { role: req.user.role, name: req.user.name },
      recentActivity,
      upcomingInterviews,
      recentApplications,
      statusBreakdown: Object.fromEntries(
        statusBreakdown.map((entry) => [entry._id, entry.count]),
      ),
    },
    'Dashboard',
  );
});
