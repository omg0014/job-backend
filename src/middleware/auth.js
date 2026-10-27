import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  ROLES,
  STAFF_ROLES,
  ROLE_LABELS,
  atLeast,
  outranks,
  canAppoint,
} from '../utils/roles.js';

/**
 * Auth travels in the Authorization header, never a cookie. That is what keeps
 * this POST-only API immune to CSRF: a cross-site form post cannot attach it.
 */
const readBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
};

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readBearerToken(req);
  if (!token) throw ApiError.unauthorized('Please sign in to continue');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Your session has expired' : 'Invalid session',
    );
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  req.user = user;
  next();
});

/**
 * Role guard. Every admin endpoint is protected here on the server — hiding a
 * button in the UI is not access control.
 */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Please sign in to continue'));
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have access to this resource'));
  }
  return next();
};

/**
 * Requires a role at or above `minimumRole` in the hierarchy
 * (recruiter < principal < admin). Use this rather than listing roles, so
 * adding a level later does not mean revisiting every route.
 */
export const requireMinRole = (minimumRole) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Please sign in to continue'));
  if (!atLeast(req.user.role, minimumRole)) {
    return next(ApiError.forbidden('You do not have access to this resource'));
  }
  return next();
};

/**
 * Guards an action against a specific user: the actor must strictly outrank
 * the target. Prevents a principal acting on another principal, and anyone
 * acting on themselves through an admin route.
 */
export const assertOutranks = (actor, target) => {
  if (!outranks(actor.role, target.role)) {
    // Peer roles included: one admin cannot suspend or edit another.
    throw ApiError.forbidden(
      `You cannot manage ${ROLE_LABELS[target.role] ?? target.role} accounts`,
    );
  }
};

/**
 * A principal may only act on people they appointed; an admin may act on any
 * staff member. This is the rule behind every "below them" check.
 */
export const assertManages = (actor, target) => {
  assertOutranks(actor, target);

  if (actor.role === ROLES.ADMIN) return;

  if (String(target.appointedBy ?? '') !== String(actor._id)) {
    throw ApiError.forbidden('You can only manage people you appointed');
  }
};

export const assertCanAppoint = (actor, targetRole) => {
  if (!canAppoint(actor.role, targetRole)) {
    throw ApiError.forbidden(
      `A ${ROLE_LABELS[actor.role] ?? actor.role} cannot appoint ${ROLE_LABELS[targetRole] ?? targetRole} accounts`,
    );
  }
};

export const requireAdmin = [requireAuth, requireRole(ROLES.ADMIN)];
export const requireCandidate = [requireAuth, requireRole(ROLES.CANDIDATE)];
/** Any of the three roles that work inside the school. */
export const requireStaff = [requireAuth, requireRole(...STAFF_ROLES)];
/** Principal and above — appointing, and reading subordinate activity. */
export const requirePrincipal = [requireAuth, requireMinRole(ROLES.PRINCIPAL)];
