import mongoose from 'mongoose';

const interviewSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    scheduledAt: { type: Date, required: true, index: true },
    mode: { type: String, enum: ['online', 'offline'], required: true },
    locationOrLink: { type: String, trim: true, default: '' },
    interviewerName: { type: String, trim: true, default: '' },
    notes: { type: String, default: '' },
    rating: { type: Number, min: 1, max: 5, default: null },
    outcome: {
      type: String,
      enum: ['pending', 'passed', 'failed'],
      default: 'pending',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Interview = mongoose.model('Interview', interviewSchema);
