import mongoose from 'mongoose';

/**
 * Append-only record of what staff do. This is the substance behind
 * "how many jobs has this recruiter posted" and everything else a principal
 * or admin needs to review.
 *
 * Two design points:
 *
 * 1. `actorChain` stores the actor's superiors at write time. Querying a
 *    principal's whole subtree is then a single indexed lookup rather than a
 *    recursive walk, and the log stays truthful about who someone reported to
 *    when the action happened — reassigning a recruiter later does not rewrite
 *    history.
 * 2. `meta` is deliberately loose. Each action records what is useful for that
 *    action; the log is for reading, not for joining against.
 */

export const ACTIVITY_CATEGORIES = ['job', 'applicant', 'account', 'auth'];

export const ACTIVITY_ACTIONS = {
  // Job actions
  JOB_CREATED: 'job.created',
  JOB_UPDATED: 'job.updated',
  JOB_STATUS_CHANGED: 'job.status_changed',
  JOB_DELETED: 'job.deleted',

  // Applicant pipeline actions
  APPLICATION_STATUS_CHANGED: 'applicant.status_changed',
  APPLICATION_VIEWED: 'applicant.viewed',
  INTERVIEW_SCHEDULED: 'applicant.interview_scheduled',
  INTERVIEW_UPDATED: 'applicant.interview_updated',
  TALENT_POOL_ADDED: 'applicant.talent_pool_added',
  TALENT_POOL_REMOVED: 'applicant.talent_pool_removed',

  // Account actions
  USER_APPOINTED: 'account.appointed',
  USER_DEACTIVATED: 'account.deactivated',
  USER_REACTIVATED: 'account.reactivated',
  USER_ROLE_CHANGED: 'account.role_changed',

  // Sign-in activity
  LOGIN: 'auth.login',
};

/** Category is derived from the action prefix, so the two can never disagree. */
const categoryOf = (action) => {
  const prefix = action.split('.')[0];
  return prefix === 'applicant' ? 'applicant' : prefix === 'auth' ? 'auth' : prefix;
};

const activityLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Denormalised so a log entry still reads correctly if the account is
    // later deactivated or renamed.
    actorName: { type: String, default: '' },
    actorRole: { type: String, required: true, index: true },

    /** Superiors at the time of the action, nearest first. */
    actorChain: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
      index: true,
    },

    action: { type: String, required: true, index: true },
    category: { type: String, enum: ACTIVITY_CATEGORIES, required: true, index: true },

    /** What was acted upon, for deep-linking from the log. */
    targetType: {
      type: String,
      enum: ['job', 'application', 'user', 'interview', 'talentPool', null],
      default: null,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: '' },

    /** Human-readable sentence, composed at write time. */
    summary: { type: String, default: '' },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Indexed by the TTL declaration below — not here, or the plain
    // index wins and expiry never happens.
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: false } },
);

// The three shapes this log is actually read in.
activityLogSchema.index({ actorId: 1, createdAt: -1 });
activityLogSchema.index({ actorChain: 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });

/**
 * Entries expire after 30 days.
 *
 * A TTL index hands the work to MongoDB — it sweeps expired documents itself,
 * roughly once a minute — so there is no cron job to schedule, monitor, or
 * forget to restart. Without it the collection only grows: every sign-in and
 * every status change is a row, and a busy hiring season would leave a log
 * nobody can read.
 *
 * What survives expiry: the per-person counters on the Team page are counted
 * from live Jobs and Applications, not from this log, so "jobs posted: 12"
 * stays correct after the individual entries are gone. Appointments also
 * remain visible through User.appointedBy. What is lost is the dated narrative
 * — "Deepa posted X on 3 August" — which is the part that stops being useful
 * long before it stops taking up space.
 */
export const ACTIVITY_RETENTION_DAYS = 30;

activityLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ACTIVITY_RETENTION_DAYS * 24 * 60 * 60, name: 'activity_ttl' },
);

activityLogSchema.pre('validate', function setCategory(next) {
  if (!this.category && this.action) this.category = categoryOf(this.action);
  next();
});

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
export { categoryOf };
