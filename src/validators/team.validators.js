import { z } from 'zod';
import { objectId, paginationSchema } from './common.js';
import { ROLES, STAFF_ROLES } from '../utils/roles.js';
import { ACTIVITY_CATEGORIES } from '../models/ActivityLog.js';

/**
 * Staff roles that can be created through the API. Which of these a given
 * caller may actually use is decided per-request by CAN_APPOINT — a principal
 * sending `role: 'admin'` passes this schema and is then refused with a 403.
 */
const APPOINTABLE = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.RECRUITER];

export const appointStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
  role: z.enum(APPOINTABLE, {
    errorMap: () => ({ message: 'Role must be administrator, principal or recruiter' }),
  }),
  department: z.string().trim().max(80).default(''),
});

export const listTeamSchema = paginationSchema.extend({
  role: z.enum(STAFF_ROLES).optional(),
  q: z.string().trim().max(120).optional(),
});

export const staffDetailSchema = z.object({ userId: objectId('userId') });

export const setStaffActiveSchema = z.object({
  userId: objectId('userId'),
  isActive: z.boolean(),
});

export const listActivitySchema = paginationSchema.extend({
  actorId: objectId('actorId').optional(),
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  action: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
