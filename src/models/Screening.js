import mongoose from 'mongoose';

export const SCREENING_STATUSES = [
  'not_started',
  'in_progress',
  'processing',
  'completed',
  'expired',
];

const answerSchema = new mongoose.Schema(
  {
    questionOrder: { type: Number, required: true },
    storageKey: { type: String, default: '' },
    durationSeconds: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    // A broken webcam must not disqualify a good teacher.
    isAudioOnly: { type: Boolean, default: false },
    // One retake is allowed: zero punishes nerves, unlimited turns the round
    // into an audition won by the most polished performer.
    retakeCount: { type: Number, default: 0, min: 0 },
    transcodeStatus: {
      type: String,
      enum: ['pending', 'done', 'failed'],
      default: 'pending',
    },
    recordedAt: { type: Date },
  },
  { _id: false },
);

/**
 * One review per reviewer, so the principal and an HR coordinator can rate the
 * same candidate independently without overwriting each other.
 */
const reviewSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ratings: {
      type: [
        new mongoose.Schema(
          {
            questionOrder: { type: Number, required: true },
            rating: { type: Number, min: 1, max: 5 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    overallRating: { type: Number, min: 1, max: 5 },
    notes: { type: String, default: '' },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** Who played which recording, and when. Required by the privacy section. */
const playbackLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questionOrder: { type: Number },
    playedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const screeningSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      unique: true,
    },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Frozen copy of the template as it was at invite time. Later edits to the
    // question set must not change what this candidate was actually asked.
    templateSnapshot: { type: Object, default: {} },

    status: { type: String, enum: SCREENING_STATUSES, default: 'not_started', index: true },
    invitedAt: { type: Date, default: Date.now },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    expiresAt: { type: Date, required: true },

    deviceCheckPassed: { type: Boolean, default: false },
    consentAcceptedAt: { type: Date },

    textAnswers: { type: Object, default: {} },
    answers: { type: [answerSchema], default: [] },
    reviews: { type: [reviewSchema], default: [] },
    playbackLog: { type: [playbackLogSchema], default: [] },
  },
  { timestamps: true },
);

/** Open for recording only while unexpired and not already submitted. */
screeningSchema.methods.isOpen = function isOpen() {
  return (
    ['not_started', 'in_progress'].includes(this.status) &&
    this.expiresAt.getTime() > Date.now()
  );
};

screeningSchema.methods.answerFor = function answerFor(order) {
  return this.answers.find((answer) => answer.questionOrder === Number(order));
};

export const Screening = mongoose.model('Screening', screeningSchema);
