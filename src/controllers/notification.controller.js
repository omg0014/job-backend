import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/response.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, unreadOnly } = req.body;

  const filter = { userId: req.user._id };
  if (unreadOnly) filter.isRead = false;

  const skip = (page - 1) * limit;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: req.user._id, isRead: false }),
  ]);

  return ok(res, { ...paginated(items, total, page, limit), unreadCount }, 'Notifications');
});

export const markRead = asyncHandler(async (req, res) => {
  const { notificationId, markAll } = req.body;

  if (markAll) {
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true },
    );
    return ok(res, { updated: result.modifiedCount }, 'All notifications marked as read');
  }

  // Scoped to the caller so one user cannot mark another's notification read.
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: req.user._id },
    { isRead: true },
    { new: true },
  ).lean();

  if (!notification) throw ApiError.notFound('Notification not found');
  return ok(res, { notification }, 'Marked as read');
});
