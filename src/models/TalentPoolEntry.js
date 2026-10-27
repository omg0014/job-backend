import mongoose from 'mongoose';

const talentPoolEntrySchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags: { type: [String], default: [] },
    note: { type: String, default: '' },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// A candidate sits in the pool once; re-adding updates the existing entry.
talentPoolEntrySchema.index({ candidateId: 1 }, { unique: true });

export const TalentPoolEntry = mongoose.model('TalentPoolEntry', talentPoolEntrySchema);
