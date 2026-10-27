import { z } from 'zod';
import { objectId, paginationSchema, chipArray } from './common.js';
import { EMPLOYMENT_TYPES } from '../utils/taxonomy.js';

export const listJobsSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  department: z.string().trim().max(80).optional(),
  location: z.string().trim().max(80).optional(),
  minExp: z.coerce.number().min(0).max(60).optional(),
  maxExp: z.coerce.number().min(0).max(60).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  // Admin-only filter; ignored for public callers, who always see open jobs.
  status: z.enum(['open', 'closed', 'draft', 'all']).optional(),
});

/**
 * A job is fetched by id (internal links, staff screens) or by slug (the
 * public share URL). Exactly one is required — accepting neither would return
 * an arbitrary job, and the refine keeps that from being possible.
 */
export const getJobSchema = z
  .object({
    jobId: objectId('jobId').optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Not a valid job link')
      .optional(),
  })
  .refine((body) => Boolean(body.jobId) !== Boolean(body.slug), {
    message: 'Provide either jobId or slug',
  });

const jobFields = {
  title: z.string().trim().min(3, 'Title is required').max(140),
  department: z.string().trim().min(2, 'Department is required').max(80),
  location: z.string().trim().min(2, 'Location is required').max(120),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('full_time'),
  experienceMin: z.coerce.number().min(0).max(60).default(0),
  experienceMax: z.coerce.number().min(0).max(60).default(0),
  qualification: z.string().trim().max(200).default(''),
  skills: chipArray,
  subjects: chipArray,
  description: z.string().trim().min(10, 'Description is required').max(20000),
  openings: z.coerce.number().int().min(1).max(500).default(1),
  lastDateToApply: z.coerce.date({ invalid_type_error: 'Enter a valid last date to apply' }),
  status: z.enum(['open', 'closed', 'draft']).default('open'),
};

const experienceRangeIsValid = (data) =>
  data.experienceMax === undefined ||
  data.experienceMin === undefined ||
  data.experienceMax >= data.experienceMin;

export const createJobSchema = z
  .object(jobFields)
  .refine(experienceRangeIsValid, {
    message: 'Maximum experience must be greater than or equal to minimum',
    path: ['experienceMax'],
  });

// Update accepts a partial patch alongside the required jobId.
export const updateJobSchema = z
  .object({ jobId: objectId('jobId') })
  .extend(
    Object.fromEntries(
      Object.entries(jobFields).map(([key, schema]) => [key, schema.optional()]),
    ),
  )
  .refine(experienceRangeIsValid, {
    message: 'Maximum experience must be greater than or equal to minimum',
    path: ['experienceMax'],
  });

export const updateJobStatusSchema = z.object({
  jobId: objectId('jobId'),
  status: z.enum(['open', 'closed', 'draft']),
});

export const deleteJobSchema = z.object({ jobId: objectId('jobId') });
