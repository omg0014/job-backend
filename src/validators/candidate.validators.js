import { z } from 'zod';
import { objectId, paginationSchema } from './common.js';

export const listCandidatesSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(80).optional(),
  skill: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  minExp: z.coerce.number().min(0).max(60).optional(),
  maxExp: z.coerce.number().min(0).max(60).optional(),
  /** true = has uploaded a CV, false = has not, omitted = either. */
  hasCv: z.boolean().optional(),
  /** true = has applied to something, false = never applied, omitted = either. */
  applied: z.boolean().optional(),
});

export const inviteCandidateSchema = z.object({
  candidateId: objectId('candidateId'),
  jobId: objectId('jobId'),
  message: z.string().trim().max(600).optional(),
});
