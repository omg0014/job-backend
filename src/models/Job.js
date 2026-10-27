import mongoose from 'mongoose';
import { buildSlug } from '../utils/slug.js';

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    // The readable half of the public share URL. Unique and immutable once
    // set: a shared link must not rot because someone edited the title.
    slug: { type: String, unique: true, index: true },
    department: { type: String, required: true, trim: true, index: true },
    location: { type: String, required: true, trim: true },
    employmentType: {
      type: String,
      enum: ['full_time', 'part_time', 'contract', 'temporary'],
      default: 'full_time',
    },
    experienceMin: { type: Number, default: 0, min: 0 },
    experienceMax: { type: Number, default: 0, min: 0 },
    qualification: { type: String, trim: true, default: '' },
    skills: { type: [String], default: [] },
    subjects: { type: [String], default: [] },
    description: { type: String, default: '' },
    openings: { type: Number, default: 1, min: 1 },
    lastDateToApply: { type: Date, required: true },
    status: {
      type: String,
      enum: ['open', 'closed', 'draft'],
      default: 'open',
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false, index: true },
    // Denormalised counter kept in step with Application creation so job lists
    // do not need an aggregate per row.
    applicationCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

/**
 * Slug is assigned once, on creation. Retried on the off-chance of a collision
 * with an existing suffix — the unique index is the real guarantee.
 */
jobSchema.pre('validate', function assignSlug(next) {
  if (!this.slug) this.slug = buildSlug(this.title);
  next();
});

// Text index backing the keyword search on job lists.
jobSchema.index({ title: 'text', description: 'text', skills: 'text', subjects: 'text' });
jobSchema.index({ status: 1, isDeleted: 1, lastDateToApply: 1 });

/**
 * A job is applyable only while it is open, undeleted, and inside its deadline.
 */
jobSchema.methods.isAcceptingApplications = function isAcceptingApplications() {
  return (
    this.status === 'open' &&
    !this.isDeleted &&
    this.lastDateToApply instanceof Date &&
    this.lastDateToApply.getTime() >= Date.now()
  );
};

export const Job = mongoose.model('Job', jobSchema);
