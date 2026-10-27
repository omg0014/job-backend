/**
 * Role hierarchy for Yugam.
 *
 *   admin      appoints principals; posts jobs; sees principal activity,
 *              with each principal's recruiters nested underneath
 *   principal  appointed by an admin; appoints recruiters; posts jobs;
 *              sees their own recruiters' activity
 *   recruiter  appointed by a principal; posts jobs (every action logged)
 *   candidate  applies to jobs
 *
 * Visibility and management flow strictly downward: a user can see and edit
 * anything belonging to someone below them, and never anything above.
 */
export const ROLES = {
  ADMIN: 'admin',
  PRINCIPAL: 'principal',
  RECRUITER: 'recruiter',
  CANDIDATE: 'candidate',
};

export const ALL_ROLES = Object.values(ROLES);

/** The three roles that work inside the school, as opposed to applying to it. */
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.RECRUITER];

/**
 * Rank drives every comparison. A higher number outranks a lower one;
 * candidate sits outside the staff chain at 0.
 */
export const ROLE_RANK = {
  [ROLES.CANDIDATE]: 0,
  [ROLES.RECRUITER]: 1,
  [ROLES.PRINCIPAL]: 2,
  [ROLES.ADMIN]: 3,
};

/**
 * Who each role is allowed to appoint. Recruiters appoint nobody.
 *
 * An admin can appoint a peer admin — a school needs more than one person who
 * can still get in when the first is unavailable. Note this is the one case
 * where the appointer does not outrank the appointee, so appointment is
 * checked against this table rather than against rank.
 */
export const CAN_APPOINT = {
  [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.RECRUITER],
  [ROLES.PRINCIPAL]: [ROLES.RECRUITER],
  [ROLES.RECRUITER]: [],
  [ROLES.CANDIDATE]: [],
};

export const isStaff = (role) => STAFF_ROLES.includes(role);

/** Strictly greater — a principal does not outrank another principal. */
export const outranks = (actorRole, targetRole) =>
  (ROLE_RANK[actorRole] ?? -1) > (ROLE_RANK[targetRole] ?? -1);

export const atLeast = (actorRole, minimumRole) =>
  (ROLE_RANK[actorRole] ?? -1) >= (ROLE_RANK[minimumRole] ?? Infinity);

export const canAppoint = (actorRole, targetRole) =>
  (CAN_APPOINT[actorRole] ?? []).includes(targetRole);

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.PRINCIPAL]: 'Principal',
  [ROLES.RECRUITER]: 'Recruiter',
  [ROLES.CANDIDATE]: 'Candidate',
};
