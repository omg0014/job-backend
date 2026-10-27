import mongoose from 'mongoose';
import { ALL_ROLES, ROLES } from '../utils/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.CANDIDATE,
      index: true,
    },

    /**
     * Who appointed this user. Admins appoint principals, principals appoint
     * recruiters. This single link is what makes the activity tree walkable:
     * a principal's recruiters are the users whose appointedBy is that
     * principal. Null for candidates and for the seeded root admin.
     */
    appointedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    appointedAt: { type: Date, default: null },

    /** Department a recruiter or principal is responsible for, if scoped. */
    department: { type: String, trim: true, default: '' },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// The password hash is `select: false`, but strip it defensively as well so it
// can never be serialised into a response.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
