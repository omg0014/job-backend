import { ActivityLog, ACTIVITY_ACTIONS } from '../models/ActivityLog.js';
import { User } from '../models/User.js';
import { Job } from '../models/Job.js';
import { Application } from '../models/Application.js';
import { Interview } from '../models/Interview.js';
import { ROLES } from '../utils/roles.js';

/**
 * Walks up the appointedBy links to build a user's superior chain, nearest
 * first. Depth is capped so a cycle introduced by bad data cannot hang a
 * request.
 */
export const resolveActorChain = async (user) => {
  const chain = [];
  let current = user;
  let depth = 0;

  while (current?.appointedBy && depth < 6) {
    const superior = await User.findById(current.appointedBy)
      .select('_id appointedBy')
      .lean();
    if (!superior || chain.some((id) => String(id) === String(superior._id))) break;
    chain.push(superior._id);
    current = superior;
    depth += 1;
  }

  return chain;
};

/**
 * Records one action. Never throws — an audit write must not be able to fail
 * the operation it is describing.
 */
export const logActivity = async ({
  actor,
  action,
  targetType = null,
  targetId = null,
  targetLabel = '',
  summary = '',
  meta = {},
}) => {
  try {
    // Candidates generate applications, not staff activity.
    if (!actor || actor.role === ROLES.CANDIDATE) return null;

    const actorChain = await resolveActorChain(actor);

    return await ActivityLog.create({
      actorId: actor._id,
      actorName: actor.name,
      actorRole: actor.role,
      actorChain,
      action,
      targetType,
      targetId,
      targetLabel,
      summary,
      meta,
    });
  } catch (err) {
    console.error('[activity] failed to record:', err.message);
    return null;
  }
};

/**
 * The set of users someone may view activity for.
 *
 *  - admin     → every staff member
 *  - principal → themselves and the recruiters they appointed
 *  - recruiter → themselves only
 *
 * Returns user ids, so callers can filter the log without re-deriving the rule.
 */
export const visibleActorIds = async (viewer) => {
  if (viewer.role === ROLES.ADMIN) {
    const staff = await User.find({ role: { $ne: ROLES.CANDIDATE } })
      .select('_id')
      .lean();
    return staff.map((user) => user._id);
  }

  if (viewer.role === ROLES.PRINCIPAL) {
    const reports = await User.find({ appointedBy: viewer._id })
      .select('_id')
      .lean();
    return [viewer._id, ...reports.map((user) => user._id)];
  }

  return [viewer._id];
};

/**
 * Per-actor activity counters.
 *
 * These come from the log, which expires after 30 days — so treat every number
 * here as "in the retention window", not "ever". Lifetime figures that must
 * survive expiry (jobs posted, applicants moved) are counted from the live
 * Jobs and Applications collections instead; see `lifetimeCountsFor`.
 */
export const activityCountsFor = async (actorIds) => {
  const rows = await ActivityLog.aggregate([
    { $match: { actorId: { $in: actorIds } } },
    { $group: { _id: { actorId: '$actorId', action: '$action' }, count: { $sum: 1 } } },
  ]);

  const byActor = new Map();

  for (const row of rows) {
    const key = String(row._id.actorId);
    const entry = byActor.get(key) ?? {
      jobsPosted: 0,
      jobsUpdated: 0,
      jobsClosed: 0,
      applicationsReviewed: 0,
      interviewsScheduled: 0,
      talentPoolSaves: 0,
      logins: 0,
      total: 0,
    };

    switch (row._id.action) {
      case ACTIVITY_ACTIONS.JOB_CREATED:
        entry.jobsPosted += row.count;
        break;
      case ACTIVITY_ACTIONS.JOB_UPDATED:
        entry.jobsUpdated += row.count;
        break;
      case ACTIVITY_ACTIONS.JOB_STATUS_CHANGED:
      case ACTIVITY_ACTIONS.JOB_DELETED:
        entry.jobsClosed += row.count;
        break;
      case ACTIVITY_ACTIONS.APPLICATION_STATUS_CHANGED:
        entry.applicationsReviewed += row.count;
        break;
      case ACTIVITY_ACTIONS.INTERVIEW_SCHEDULED:
        entry.interviewsScheduled += row.count;
        break;
      case ACTIVITY_ACTIONS.TALENT_POOL_ADDED:
        entry.talentPoolSaves += row.count;
        break;
      case ACTIVITY_ACTIONS.LOGIN:
        entry.logins += row.count;
        break;
      default:
        break;
    }

    entry.total += row.count;
    byActor.set(key, entry);
  }

  return byActor;
};

/**
 * Lifetime counters, read from live records rather than the activity log.
 *
 * The log is deliberately short-lived, so anything shown as a running total
 * has to be derived from the rows that actually persist: a Job still knows who
 * created it, and an Application's statusHistory still records who moved it.
 * That keeps "jobs posted: 12" true on day 400.
 */
export const lifetimeCountsFor = async (actorIds) => {
  const [jobRows, moveRows, interviewRows] = await Promise.all([
    Job.aggregate([
      { $match: { createdBy: { $in: actorIds } } },
      {
        $group: {
          _id: '$createdBy',
          posted: { $sum: 1 },
          open: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'open'] }, { $eq: ['$isDeleted', false] }] }, 1, 0] },
          },
        },
      },
    ]),
    // Each statusHistory entry names who made the change, so pipeline moves
    // are still attributable long after the log entry is gone.
    Application.aggregate([
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.changedBy': { $in: actorIds } } },
      { $group: { _id: '$statusHistory.changedBy', moved: { $sum: 1 } } },
    ]),
    Interview.aggregate([
      { $match: { createdBy: { $in: actorIds } } },
      { $group: { _id: '$createdBy', scheduled: { $sum: 1 } } },
    ]),
  ]);

  const byActor = new Map();
  const bump = (id, patch) => {
    const key = String(id);
    byActor.set(key, {
      jobsPosted: 0, jobsOpen: 0, applicationsReviewed: 0, interviewsScheduled: 0,
      ...(byActor.get(key) ?? {}), ...patch,
    });
  };

  jobRows.forEach((r) => bump(r._id, { jobsPosted: r.posted, jobsOpen: r.open }));
  moveRows.forEach((r) => bump(r._id, { applicationsReviewed: r.moved }));
  interviewRows.forEach((r) => bump(r._id, { interviewsScheduled: r.scheduled }));

  return byActor;
};

export { ACTIVITY_ACTIONS };
