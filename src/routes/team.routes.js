import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireStaff, requirePrincipal } from '../middleware/auth.js';
import {
  appointStaffSchema,
  listTeamSchema,
  staffDetailSchema,
  setStaffActiveSchema,
  listActivitySchema,
} from '../validators/team.validators.js';
import {
  appointStaff,
  listTeam,
  getStaffDetail,
  setStaffActive,
  listActivity,
} from '../controllers/team.controller.js';

export const teamRoutes = () => {
  const router = Router();

  // Appointing and suspending require principal or above; which roles may be
  // appointed by whom is enforced per-request in the controller.
  post(router, '/appoint', ...requirePrincipal, validateBody(appointStaffSchema), appointStaff);
  post(router, '/set-active', ...requirePrincipal, validateBody(setStaffActiveSchema), setStaffActive);

  // Any staff member can read these; each sees only their own scope.
  post(router, '/list', ...requireStaff, validateBody(listTeamSchema), listTeam);
  post(router, '/get', ...requireStaff, validateBody(staffDetailSchema), getStaffDetail);
  post(router, '/activity', ...requireStaff, validateBody(listActivitySchema), listActivity);

  return router;
};
