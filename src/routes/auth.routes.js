import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { registerSchema, loginSchema } from '../validators/auth.validators.js';
import { register, login, me, logout } from '../controllers/auth.controller.js';

export const authRoutes = () => {
  const router = Router();

  router.use(authLimiter);

  post(router, '/register', validateBody(registerSchema), register);
  post(router, '/login', validateBody(loginSchema), login);
  post(router, '/me', requireAuth, me);
  post(router, '/logout', requireAuth, logout);

  return router;
};
