import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['application_status', 'interview_scheduled', 'job_posted', 'system'],
      default: 'system',
    },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    // Frontend route the notification points at, e.g. /applications
    link: { type: String, default: '' },
    isRead: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
