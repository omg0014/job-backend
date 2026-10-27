import mongoose from 'mongoose';

export const MEDIA_JOB_TYPES = ['transcode', 'cleanup'];
export const MEDIA_JOB_STATUSES = ['queued', 'running', 'done', 'failed'];
export const MAX_ATTEMPTS = 3;

/**
 * A small job queue in Mongo. Deliberately not Redis: at a school's volume an
 * extra service to operate costs more than it saves.
 *
 * The worker claims work with an atomic findOneAndUpdate on (status, runAfter),
 * so two workers can never take the same job.
 */
const mediaJobSchema = new mongoose.Schema(
  {
    type: { type: String, enum: MEDIA_JOB_TYPES, required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    payload: { type: Object, default: {} },
    status: { type: String, enum: MEDIA_JOB_STATUSES, default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    runAfter: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// The claim query: oldest runnable job first.
mediaJobSchema.index({ status: 1, runAfter: 1 });

export const MediaJob = mongoose.model('MediaJob', mediaJobSchema);
