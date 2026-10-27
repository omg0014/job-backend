import { Router } from 'express';
import { post } from '../utils/route.js';
import { requireStaff } from '../middleware/auth.js';
import { dashboard } from '../controllers/admin.controller.js';

export const adminRoutes = () => {
  const router = Router();

  router.use(...requireStaff);

  post(router, '/dashboard', dashboard);

  return router;
};
