import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requirePrincipal } from '../middleware/auth.js';
import {
  listCandidatesSchema,
  inviteCandidateSchema,
} from '../validators/candidate.validators.js';
import { listCandidates, inviteCandidate } from '../controllers/candidate.controller.js';

/**
 * The candidate directory is principal-and-above.
 *
 * It spans the whole school rather than one person's jobs, and offering a role
 * is a hiring decision — neither fits a recruiter, whose work is the applicants
 * for jobs they posted.
 */
export const candidateRoutes = () => {
  const router = Router();

  post(router, '/list', ...requirePrincipal, validateBody(listCandidatesSchema), listCandidates);
  post(router, '/invite', ...requirePrincipal, validateBody(inviteCandidateSchema), inviteCandidate);

  return router;
};
