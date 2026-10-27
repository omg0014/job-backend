import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  createInterviewSchema,
  updateInterviewSchema,
  listInterviewsSchema,
} from '../validators/interview.validators.js';
import {
  createInterview,
  updateInterview,
  listInterviews,
} from '../controllers/interview.controller.js';

export const interviewRoutes = () => {
  const router = Router();

  router.use(...requireStaff);

  post(router, '/create', validateBody(createInterviewSchema), createInterview);
  post(router, '/update', validateBody(updateInterviewSchema), updateInterview);
  post(router, '/list', validateBody(listInterviewsSchema), listInterviews);

  return router;
};
