import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, requireStaff } from '../middleware/auth.js';
import {
  createApplicationSchema,
  myApplicationsSchema,
  listApplicationsSchema,
  getApplicationSchema,
  updateApplicationStatusSchema,
  downloadApplicationCvSchema,
} from '../validators/application.validators.js';
import {
  createApplication,
  myApplications,
  listApplications,
  getApplication,
  updateApplicationStatus,
  downloadApplicationCv,
} from '../controllers/application.controller.js';

export const applicationRoutes = () => {
  const router = Router();
  const candidate = [requireAuth, requireRole('candidate')];
  const staff = requireStaff;

  post(router, '/create', ...candidate, validateBody(createApplicationSchema), createApplication);
  post(router, '/my-list', ...candidate, validateBody(myApplicationsSchema), myApplications);

  post(router, '/list', ...staff, validateBody(listApplicationsSchema), listApplications);
  post(router, '/get', ...staff, validateBody(getApplicationSchema), getApplication);
  post(router, '/update-status', ...staff, validateBody(updateApplicationStatusSchema), updateApplicationStatus);
  post(router, '/download-cv', ...staff, validateBody(downloadApplicationCvSchema), downloadApplicationCv);

  return router;
};
