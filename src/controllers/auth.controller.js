import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { signAccessToken } from '../utils/jwt.js';
import { logActivity, ACTIVITY_ACTIONS } from '../services/activityService.js';

const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
});

/**
 * Public registration creates candidates only. Admin accounts exist solely via
 * the seed script — there is no public admin signup.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const user = await User.create({ name, email, passwordHash, role: 'candidate' });

  // Every candidate gets a profile shell immediately so the CV upload step has
  // somewhere to write and the frontend never has to special-case "no profile".
  await CandidateProfile.create({
    userId: user._id,
    fullName: name,
    email,
    parseStatus: 'pending',
  });

  const token = signAccessToken(user);
  return created(res, { user: publicUser(user), token }, 'Account created');
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password — do not leak which
  // emails are registered.
  if (!user) throw ApiError.unauthorized('Incorrect email or password');

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Incorrect email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  user.loginCount = (user.loginCount ?? 0) + 1;
  await user.save();

  await logActivity({
    actor: user,
    action: ACTIVITY_ACTIONS.LOGIN,
    summary: 'Signed in',
  });

  const token = signAccessToken(user);
  return ok(res, { user: publicUser(user), token }, 'Signed in');
});

export const me = asyncHandler(async (req, res) =>
  ok(res, { user: publicUser(req.user) }, 'Current user'),
);

/**
 * Tokens are stateless and held by the client, so logout is a client-side
 * discard. The endpoint exists so the frontend has one consistent call and a
 * place to hang token revocation later.
 */
export const logout = asyncHandler(async (req, res) => ok(res, null, 'Signed out'));
