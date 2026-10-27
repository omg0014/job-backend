import { Router } from 'express';
import { post } from '../utils/route.js';
import { ok } from '../utils/response.js';
import { authRoutes } from './auth.routes.js';
import { profileRoutes } from './profile.routes.js';
import { jobRoutes } from './job.routes.js';
import { applicationRoutes } from './application.routes.js';
import { interviewRoutes } from './interview.routes.js';
import { talentPoolRoutes } from './talentPool.routes.js';
import { notificationRoutes } from './notification.routes.js';
import { adminRoutes } from './admin.routes.js';
import { teamRoutes } from './team.routes.js';
import { candidateRoutes } from './candidate.routes.js';
import { metaRoutes } from './meta.routes.js';
import { screeningRoutes } from './screening.routes.js';

export const registerRoutes = (app) => {
  const router = Router();

  // Health check is a POST too — the rule has no exceptions.
  post(router, '/health', (req, res) =>
    ok(res, { status: 'up', time: new Date().toISOString() }, 'Service is healthy'),
  );

  router.use('/auth', authRoutes());
  router.use('/profile', profileRoutes());
  router.use('/jobs', jobRoutes());
  router.use('/applications', applicationRoutes());
  router.use('/interviews', interviewRoutes());
  router.use('/talent-pool', talentPoolRoutes());
  router.use('/notifications', notificationRoutes());
  router.use('/admin', adminRoutes());
  router.use('/team', teamRoutes());
  router.use('/candidates', candidateRoutes());
  router.use('/screening', screeningRoutes());
  router.use('/meta', metaRoutes());

  app.use('/api', router);
};
