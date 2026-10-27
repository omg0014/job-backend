import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Job } from '../models/Job.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/response.js';
import { ROLES, ROLE_LABELS, isStaff } from '../utils/roles.js';
import { assertManages, assertCanAppoint } from '../middleware/auth.js';
import {
  logActivity,
  ACTIVITY_ACTIONS,
  visibleActorIds,
  activityCountsFor,
  lifetimeCountsFor,
} from '../services/activityService.js';
import { notify } from '../services/notificationService.js';

const publicStaff = (user, counts = null) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  roleLabel: ROLE_LABELS[user.role],
  department: user.department ?? '',
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  loginCount: user.loginCount ?? 0,
  appointedBy: user.appointedBy ? String(user.appointedBy) : null,
  appointedAt: user.appointedAt,
  activity: counts ?? null,
});

/**
 * Appoint a staff member.
 *
 * An admin appoints principals (and may appoint recruiters directly);
 * a principal appoints recruiters. The appointer is recorded on the new
 * account, which is what makes the activity tree walkable later.
 */
export const appointStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role, department } = req.body;

  assertCanAppoint(req.user, role);

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    department: department ?? '',
    appointedBy: req.user._id,
    appointedAt: new Date(),
  });

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.USER_APPOINTED,
    targetType: 'user',
    targetId: user._id,
    targetLabel: user.name,
    summary: `Appointed ${user.name} as ${ROLE_LABELS[role]}`,
    meta: { role, department: department ?? '', email },
  });

  await notify({
    userId: user._id,
    type: 'system',
    title: `You have been appointed ${ROLE_LABELS[role]}`,
    message: `${req.user.name} has given you ${ROLE_LABELS[role]} access to the Yugam recruitment portal.`,
    link: '/admin',
  });

  return created(res, { user: publicStaff(user) }, `${ROLE_LABELS[role]} appointed`);
});

/**
 * The staff visible to the caller, with their activity counters.
 * Admin sees everyone; a principal sees the recruiters they appointed.
 */
export const listTeam = asyncHandler(async (req, res) => {
  const { role, page, limit, q } = req.body;

  const filter = { role: { $ne: ROLES.CANDIDATE } };

  if (req.user.role === ROLES.PRINCIPAL) {
    filter.appointedBy = req.user._id;
  } else if (req.user.role === ROLES.RECRUITER) {
    filter._id = req.user._id;
  }

  if (role) filter.role = role;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { department: rx }];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ role: 1, name: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const userIds = users.map((user) => user._id);

  // Two sources, deliberately: the log covers the last 30 days (sign-ins,
  // recent events), while lifetime totals come from live Jobs and Applications
  // so they stay correct after log entries expire.
  const [recent, lifetime] = await Promise.all([
    activityCountsFor(userIds),
    lifetimeCountsFor(userIds),
  ]);

  const items = users.map((user) => {
    const key = String(user._id);
    const life = lifetime.get(key);
    const entry = publicStaff(user, {
      ...(recent.get(key) ?? {}),
      jobsPosted: life?.jobsPosted ?? 0,
      applicationsReviewed: life?.applicationsReviewed ?? 0,
      interviewsScheduled: life?.interviewsScheduled ?? 0,
    });
    entry.jobs = { total: life?.jobsPosted ?? 0, open: life?.jobsOpen ?? 0 };
    return entry;
  });

  return ok(res, paginated(items, total, page, limit), 'Team');
});

/**
 * One staff member's full record: their counters, their recent activity, and
 * — for a principal — the recruiters beneath them with their own counters.
 * This is the "admin sees the principal, and the recruiters inside" view.
 */
export const getStaffDetail = asyncHandler(async (req, res) => {
  const target = await User.findById(req.body.userId).lean();
  if (!target || !isStaff(target.role)) throw ApiError.notFound('Staff member not found');

  // A caller may view themselves, or anyone they manage.
  const isSelf = String(target._id) === String(req.user._id);
  if (!isSelf) assertManages(req.user, target);

  const [counts, lifetime] = await Promise.all([
    activityCountsFor([target._id]),
    lifetimeCountsFor([target._id]),
  ]);
  const targetLife = lifetime.get(String(target._id));

  const recentActivity = await ActivityLog.find({ actorId: target._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const jobs = await Job.find({ createdBy: target._id, isDeleted: false })
    .select('title department status applicationCount lastDateToApply createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  // Recruiters appointed by this person, each with their own counters —
  // the nesting you asked for.
  let reports = [];
  if (target.role === ROLES.PRINCIPAL) {
    const reportDocs = await User.find({ appointedBy: target._id }).lean();
    const reportIds = reportDocs.map((user) => user._id);
    const [reportCounts, reportLife] = await Promise.all([
      activityCountsFor(reportIds),
      lifetimeCountsFor(reportIds),
    ]);

    reports = reportDocs.map((user) => {
      const key = String(user._id);
      const life = reportLife.get(key);
      const entry = publicStaff(user, {
        ...(reportCounts.get(key) ?? {}),
        jobsPosted: life?.jobsPosted ?? 0,
        applicationsReviewed: life?.applicationsReviewed ?? 0,
        interviewsScheduled: life?.interviewsScheduled ?? 0,
      });
      entry.jobs = { total: life?.jobsPosted ?? 0, open: life?.jobsOpen ?? 0 };
      return entry;
    });
  }

  const appointer = target.appointedBy
    ? await User.findById(target.appointedBy).select('name role').lean()
    : null;

  return ok(
    res,
    {
      staff: publicStaff(target, {
        ...(counts.get(String(target._id)) ?? {}),
        jobsPosted: targetLife?.jobsPosted ?? 0,
        applicationsReviewed: targetLife?.applicationsReviewed ?? 0,
        interviewsScheduled: targetLife?.interviewsScheduled ?? 0,
      }),
      appointedByUser: appointer
        ? { name: appointer.name, role: appointer.role, roleLabel: ROLE_LABELS[appointer.role] }
        : null,
      recentActivity,
      jobs,
      reports,
    },
    'Staff detail',
  );
});

/** Suspend or restore access. Only ever downward through the hierarchy. */
export const setStaffActive = asyncHandler(async (req, res) => {
  const { userId, isActive } = req.body;

  const target = await User.findById(userId);
  if (!target || !isStaff(target.role)) throw ApiError.notFound('Staff member not found');
  assertManages(req.user, target);

  target.isActive = isActive;
  await target.save();

  await logActivity({
    actor: req.user,
    action: isActive ? ACTIVITY_ACTIONS.USER_REACTIVATED : ACTIVITY_ACTIONS.USER_DEACTIVATED,
    targetType: 'user',
    targetId: target._id,
    targetLabel: target.name,
    summary: `${isActive ? 'Restored' : 'Suspended'} access for ${target.name} (${ROLE_LABELS[target.role]})`,
    meta: { role: target.role },
  });

  return ok(res, { user: publicStaff(target) }, isActive ? 'Access restored' : 'Access suspended');
});

/**
 * The activity feed, scoped to what the caller may see:
 *   admin     → all staff
 *   principal → themselves and their recruiters
 *   recruiter → themselves
 */
export const listActivity = asyncHandler(async (req, res) => {
  const { actorId, category, action, from, to, page, limit } = req.body;

  const allowedIds = await visibleActorIds(req.user);
  const allowedSet = new Set(allowedIds.map(String));

  const filter = { actorId: { $in: allowedIds } };

  if (actorId) {
    if (!allowedSet.has(String(actorId))) {
      throw ApiError.forbidden('You cannot view this person’s activity');
    }
    filter.actorId = actorId;
  }

  if (category) filter.category = category;
  if (action) filter.action = action;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);

  return ok(res, paginated(items, total, page, limit), 'Activity');
});
