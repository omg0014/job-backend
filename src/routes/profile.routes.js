import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadCv as uploadCvMiddleware } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { updateProfileSchema } from '../validators/profile.validators.js';
import {
  uploadCv,
  getProfile,
  updateProfile,
  downloadOwnCv,
} from '../controllers/profile.controller.js';

export const profileRoutes = () => {
  const router = Router();

  router.use(requireAuth, requireRole('candidate'));

  // The only multipart endpoint in the API.
  post(router, '/upload-cv', uploadLimiter, uploadCvMiddleware, uploadCv);
  post(router, '/get', getProfile);
  post(router, '/update', validateBody(updateProfileSchema), updateProfile);
  post(router, '/download-cv', downloadOwnCv);

  return router;
};
