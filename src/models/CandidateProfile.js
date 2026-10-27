import mongoose from 'mongoose';

const educationSchema = new mongoose.Schema(
  {
    degree: { type: String, trim: true, default: '' },
    specialization: { type: String, trim: true, default: '' },
    institution: { type: String, trim: true, default: '' },
    boardOrUniversity: { type: String, trim: true, default: '' },
    yearOfPassing: { type: String, trim: true, default: '' },
    percentageOrCgpa: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const experienceSchema = new mongoose.Schema(
  {
    designation: { type: String, trim: true, default: '' },
    organization: { type: String, trim: true, default: '' },
    subjectsTaught: { type: [String], default: [] },
    startDate: { type: String, trim: true, default: '' },
    endDate: { type: String, trim: true, default: '' },
    isCurrent: { type: Boolean, default: false },
    description: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const cvSchema = new mongoose.Schema(
  {
    fileName: String,
    originalName: String,
    mimeType: String,
    size: Number,
    storagePath: String,
    uploadedAt: Date,
  },
  { _id: false },
);

const candidateProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    fullName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    location: { type: String, trim: true, default: '' },
    headline: { type: String, trim: true, default: '' },
    totalExperienceYears: { type: Number, default: 0, min: 0 },
    education: { type: [educationSchema], default: [] },
    experience: { type: [experienceSchema], default: [] },
    subjects: { type: [String], default: [], index: true },
    skills: { type: [String], default: [], index: true },
    certifications: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    preferredDepartments: { type: [String], default: [] },
    cv: { type: cvSchema, default: null },
    parseStatus: {
      type: String,
      enum: ['pending', 'parsed', 'failed', 'manual'],
      default: 'pending',
    },
    // Large blob of CV text kept for re-parsing and admin search; never sent to
    // the client by default.
    rawCvText: { type: String, default: '', select: false },
    profileCompletion: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true },
);

/**
 * Profile completion is derived, never client-supplied. Weighted so the fields
 * that matter for an application (identity, CV, experience) dominate.
 */
export const computeProfileCompletion = (profile) => {
  const checks = [
    [Boolean(profile.fullName), 15],
    [Boolean(profile.email), 10],
    [Boolean(profile.phone), 10],
    [Boolean(profile.location), 5],
    [Boolean(profile.headline), 5],
    [Number(profile.totalExperienceYears) > 0, 5],
    [(profile.education?.length ?? 0) > 0, 15],
    [(profile.experience?.length ?? 0) > 0, 15],
    [(profile.subjects?.length ?? 0) > 0, 5],
    [(profile.skills?.length ?? 0) > 0, 5],
    [Boolean(profile.cv?.storagePath), 10],
  ];

  return checks.reduce((total, [met, weight]) => total + (met ? weight : 0), 0);
};

candidateProfileSchema.pre('save', function recomputeCompletion(next) {
  this.profileCompletion = computeProfileCompletion(this);
  next();
});

export const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);
