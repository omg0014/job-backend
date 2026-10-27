import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Populates req.user when a valid token is present and does nothing otherwise.
 * Used by the job endpoints, which serve anonymous visitors, candidates and
 * admins from the same route with different visibility.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();

  const token = header.slice(7).trim();
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user?.isActive) req.user = user;
  } catch {
    // An invalid token on a public endpoint is simply an anonymous visitor.
  }

  return next();
});
