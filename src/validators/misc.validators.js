import { z } from 'zod';
import { objectId, paginationSchema, chipArray } from './common.js';

export const addTalentPoolSchema = z.object({
  candidateId: objectId('candidateId'),
  tags: chipArray,
  note: z.string().trim().max(1000).default(''),
});

export const removeTalentPoolSchema = z.object({ entryId: objectId('entryId') });

export const listTalentPoolSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(80).optional(),
});

export const listNotificationsSchema = paginationSchema.extend({
  unreadOnly: z.boolean().default(false),
});

export const markReadSchema = z
  .object({
    notificationId: objectId('notificationId').optional(),
    markAll: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.notificationId) || data.markAll === true, {
    message: 'Provide a notificationId or set markAll to true',
    path: ['notificationId'],
  });
