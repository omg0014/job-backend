import { z } from 'zod';
import { objectId, paginationSchema } from './common.js';

export const createInterviewSchema = z
  .object({
    applicationId: objectId('applicationId'),
    scheduledAt: z.coerce.date({ invalid_type_error: 'Enter a valid date and time' }),
    mode: z.enum(['online', 'offline']),
    locationOrLink: z.string().trim().max(500).default(''),
    interviewerName: z.string().trim().max(120).default(''),
  })
  .refine((data) => data.locationOrLink.length > 0, {
    message: 'Provide a meeting link (online) or an address (offline)',
    path: ['locationOrLink'],
  });

export const updateInterviewSchema = z.object({
  interviewId: objectId('interviewId'),
  scheduledAt: z.coerce.date().optional(),
  mode: z.enum(['online', 'offline']).optional(),
  locationOrLink: z.string().trim().max(500).optional(),
  interviewerName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  outcome: z.enum(['pending', 'passed', 'failed']).optional(),
});

export const listInterviewsSchema = paginationSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  outcome: z.enum(['pending', 'passed', 'failed']).optional(),
});
