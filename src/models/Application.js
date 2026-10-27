import mongoose from 'mongoose';

export const APPLICATION_STATUSES = [
  'applied',
  'under_review',
  // Module 2: the asynchronous video screening round.
  'screening',
  'shortlisted',
  'interview_scheduled',
  'selected',
  'rejected',
];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: APPLICATION_STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * Copy of the profile fields as they stood at apply time. An application is a
 * record of what was submitted — later profile edits must not rewrite history.
 */
const profileSnapshotSchema = new mongoose.Schema(
  {
    fullName: String,
    email: String,
    phone: String,
    location: String,
    headline: String,
    totalExperienceYears: Number,
    subjects: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    education: { type: Array, default: [] },
    experience: { type: Array, default: [] },
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    profileSnapshot: { type: profileSnapshotSchema, required: true },
    cvSnapshot: {
      originalName: String,
      storagePath: String,
    },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'applied', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// A candidate may apply to a given job exactly once. This index is what makes
// applications/create idempotent under double-click and refresh.
applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });

export const Application = mongoose.model('Application', applicationSchema);
