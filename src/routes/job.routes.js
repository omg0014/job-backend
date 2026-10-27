import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import {
  listJobsSchema,
  getJobSchema,
  createJobSchema,
  updateJobSchema,
  updateJobStatusSchema,
  deleteJobSchema,
} from '../validators/job.validators.js';
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  updateJobStatus,
  deleteJob,
} from '../controllers/job.controller.js';

export const jobRoutes = () => {
  const router = Router();
  // Admin, principal and recruiter can all post. Which jobs each may see and
  // edit is decided per-record in the controller, by hierarchy.
  const staff = requireStaff;

  // Public board + candidate/admin views share these two, gated by optionalAuth.
  post(router, '/list', optionalAuth, validateBody(listJobsSchema), listJobs);
  post(router, '/get', optionalAuth, validateBody(getJobSchema), getJob);

  post(router, '/create', ...staff, validateBody(createJobSchema), createJob);
  post(router, '/update', ...staff, validateBody(updateJobSchema), updateJob);
  post(router, '/update-status', ...staff, validateBody(updateJobStatusSchema), updateJobStatus);
  post(router, '/delete', ...staff, validateBody(deleteJobSchema), deleteJob);

  return router;
};
