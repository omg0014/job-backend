import mongoose from 'mongoose';

/**
 * The question set, as a document rather than a constant, so the principal can
 * reword a question next hiring season without a deploy.
 *
 * A Screening snapshots this at invite time — editing the template must never
 * change what a candidate already answered.
 */
const templateQuestionSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    text: { type: String, required: true, trim: true },
    prepSeconds: { type: Number, default: 30, min: 0, max: 120 },
    maxAnswerSeconds: { type: Number, default: 120, min: 15, max: 300 },
  },
  { _id: false },
);

const templateFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['text', 'number', 'select', 'multiselect', 'date'],
      default: 'text',
    },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
  },
  { _id: false },
);

const screeningTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, default: 'Default screening' },
    isActive: { type: Boolean, default: true, index: true },
    questions: { type: [templateQuestionSchema], default: [] },
    textFields: { type: [templateFieldSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const ScreeningTemplate = mongoose.model('ScreeningTemplate', screeningTemplateSchema);
