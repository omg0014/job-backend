import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { sendMail } from './emailService.js';

/**
 * Creates an in-app notification and mirrors it to email. Notification delivery
 * is best-effort: a failure here is logged but never propagated, so it cannot
 * break the status change or interview booking that triggered it.
 */
export const notify = async ({ userId, type, title, message, link = '', email = true }) => {
  try {
    const notification = await Notification.create({ userId, type, title, message, link });

    if (email) {
      const user = await User.findById(userId).select('email name').lean();
      if (user?.email) {
        await sendMail({
          to: user.email,
          subject: title,
          text: `Hi ${user.name || 'there'},\n\n${message}\n\n— Yugam International School`,
        });
      }
    }

    return notification;
  } catch (err) {
    console.error('[notify] failed:', err.message);
    return null;
  }
};
