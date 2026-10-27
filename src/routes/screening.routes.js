import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { uploadChunk as uploadChunkMiddleware } from '../middleware/upload.js';
import { requireAuth, requireStaff, requirePrincipal, requireCandidate } from '../middleware/auth.js';
import {
  inviteScreeningSchema,
  getScreeningSchema,
  getTemplateSchema,
  updateTemplateSchema,
  acceptConsentSchema,
  saveTextAnswersSchema,
  deviceCheckSchema,
  startScreeningSchema,
  uploadChunkSchema,
  finishAnswerSchema,
  submitScreeningSchema,
  playbackUrlSchema,
  reviewScreeningSchema,
  saveReviewSchema,
  compareSchema,
  deleteRecordingsSchema,
} from '../validators/screening.validators.js';
import {
  inviteToScreening,
  getScreening,
  getTemplate,
  updateTemplate,
  acceptConsent,
  saveTextAnswers,
  saveDeviceCheck,
  startScreening,
  uploadChunk,
  finishAnswer,
  submitScreening,
  getPlaybackUrl,
  reviewScreening,
  saveReview,
  compareByQuestion,
  deleteRecordings,
} from '../controllers/screening.controller.js';

/**
 * Module 2 — video screening round.
 *
 * Inviting is a hiring action, so it follows the same scoping as applications:
 * any staff member, limited to the jobs they can see. `get` is shared by the
 * candidate (their own) and staff (within scope); the controller decides which.
 */
export const screeningRoutes = () => {
  const router = Router();

  post(router, '/invite', ...requireStaff, validateBody(inviteScreeningSchema), inviteToScreening);
  post(router, '/get', requireAuth, validateBody(getScreeningSchema), getScreening);

  // The candidate's own round. Every one of these asserts ownership in the
  // controller — the route guard only establishes that they are a candidate.
  post(router, '/accept-consent', ...requireCandidate, validateBody(acceptConsentSchema), acceptConsent);
  post(router, '/save-text-answers', ...requireCandidate, validateBody(saveTextAnswersSchema), saveTextAnswers);
  post(router, '/device-check', ...requireCandidate, validateBody(deviceCheckSchema), saveDeviceCheck);
  post(router, '/start', ...requireCandidate, validateBody(startScreeningSchema), startScreening);

  // Multipart: the chunk middleware must run before the body is validated,
  // since multer is what populates req.body for a multipart request.
  post(
    router,
    '/upload-chunk',
    ...requireCandidate,
    uploadChunkMiddleware,
    validateBody(uploadChunkSchema),
    uploadChunk,
  );
  post(router, '/finish-answer', ...requireCandidate, validateBody(finishAnswerSchema), finishAnswer);
  post(router, '/submit', ...requireCandidate, validateBody(submitScreeningSchema), submitScreening);

  // Playback is shared: the candidate reviewing their own answers, and staff
  // reviewing them. The controller decides, and logs staff access.
  post(router, '/playback-url', requireAuth, validateBody(playbackUrlSchema), getPlaybackUrl);

  // Review is any staff member, scoped to the jobs they can see.
  post(router, '/review', ...requireStaff, validateBody(reviewScreeningSchema), reviewScreening);
  post(router, '/save-review', ...requireStaff, validateBody(saveReviewSchema), saveReview);
  post(router, '/compare', ...requireStaff, validateBody(compareSchema), compareByQuestion);

  // Erasing someone's recordings is a privacy action, not routine hiring work.
  post(
    router,
    '/delete-recordings',
    ...requirePrincipal,
    validateBody(deleteRecordingsSchema),
    deleteRecordings,
  );

  // The question set is school-wide policy, not one recruiter's job posting,
  // so editing it is principal-and-above — the same bar as appointing staff.
  post(router, '/template/get', ...requirePrincipal, validateBody(getTemplateSchema), getTemplate);
  post(
    router,
    '/template/update',
    ...requirePrincipal,
    validateBody(updateTemplateSchema),
    updateTemplate,
  );

  return router;
};
