import { z } from 'zod';
import mongoose from 'mongoose';

/**
 * Every id arrives in the JSON body — this API has no route params — so id
 * validation happens here rather than in a param middleware.
 */
export const objectId = (label = 'id') =>
  z
    .string({ required_error: `${label} is required` })
    .refine((value) => mongoose.Types.ObjectId.isValid(value), {
      message: `Invalid ${label}`,
    });

/** Shared pagination/sort block accepted by every list endpoint. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const emptyBodySchema = z.object({}).passthrough();

/** Accepts a trimmed, de-duplicated array of non-empty strings. */
export const chipArray = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .transform((values) => [...new Set(values)])
  .default([]);

/**
 * Builds a Mongo sort object from a validated sortBy/sortOrder pair, restricted
 * to an allowlist so a request body cannot sort by an arbitrary field.
 */
export const buildSort = (sortBy, sortOrder, allowed, fallback) => {
  const direction = sortOrder === 'asc' ? 1 : -1;
  if (sortBy && allowed.includes(sortBy)) return { [sortBy]: direction };
  return fallback;
};

/** Escapes user input before it is used inside a RegExp. */
export const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
