import { z } from 'zod';
import { objectId, paginationSchema } from './common.js';
import { APPLICATION_STATUSES } from '../models/Application.js';

export const createApplicationSchema = z.object({ jobId: objectId('jobId') });

export const myApplicationsSchema = paginationSchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

export const listApplicationsSchema = paginationSchema.extend({
  jobId: objectId('jobId').optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  minExp: z.coerce.number().min(0).max(60).optional(),
  skill: z.string().trim().max(80).optional(),
  subject: z.string().trim().max(80).optional(),
});

export const getApplicationSchema = z.object({ applicationId: objectId('applicationId') });

export const updateApplicationStatusSchema = z.object({
  applicationId: objectId('applicationId'),
  status: z.enum(APPLICATION_STATUSES),
  note: z.string().trim().max(1000).default(''),
});

export const downloadApplicationCvSchema = z.object({
  applicationId: objectId('applicationId'),
});
