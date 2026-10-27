import { Router } from 'express';
import { post } from '../utils/route.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { listNotificationsSchema, markReadSchema } from '../validators/misc.validators.js';
import { listNotifications, markRead } from '../controllers/notification.controller.js';

export const notificationRoutes = () => {
  const router = Router();

  // Both roles receive notifications, so this is auth-only, not role-gated.
  router.use(requireAuth);

  post(router, '/list', validateBody(listNotificationsSchema), listNotifications);
  post(router, '/mark-read', validateBody(markReadSchema), markRead);

  return router;
};
