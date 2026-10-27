import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireStaff } from '../middleware/auth.js';
import {
  addTalentPoolSchema,
  removeTalentPoolSchema,
  listTalentPoolSchema,
} from '../validators/misc.validators.js';
import {
  addToTalentPool,
  removeFromTalentPool,
  listTalentPool,
} from '../controllers/talentPool.controller.js';

export const talentPoolRoutes = () => {
  const router = Router();

  router.use(...requireStaff);

  post(router, '/list', validateBody(listTalentPoolSchema), listTalentPool);
  post(router, '/add', validateBody(addTalentPoolSchema), addToTalentPool);
  post(router, '/remove', validateBody(removeTalentPoolSchema), removeFromTalentPool);

  return router;
};
