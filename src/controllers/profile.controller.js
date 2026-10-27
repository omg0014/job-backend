import { CandidateProfile, computeProfileCompletion } from '../models/CandidateProfile.js';
import { storageService } from '../services/storageService.js';
import { parseCv } from '../services/cvParser/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

const PROFILE_FIELDS = [
  'fullName', 'phone', 'email', 'location', 'headline', 'totalExperienceYears',
  'education', 'experience', 'subjects', 'skills', 'certifications',
  'languages', 'preferredDepartments',
];

/** Loads the caller's profile, creating the shell if it is somehow missing. */
const getOrCreateProfile = async (user) => {
  let profile = await CandidateProfile.findOne({ userId: user._id });
  if (!profile) {
    profile = await CandidateProfile.create({
      userId: user._id,
      fullName: user.name,
      email: user.email,
    });
  }
  return profile;
};

/**
 * Upload + parse in a single request. The parsed draft comes back in the same
 * response so the teacher goes straight to the review form; the draft is NOT
 * committed to the profile until they confirm it via profile/update.
 */
export const uploadCv = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please attach a CV file');

  const { buffer, mimetype, originalname, size } = req.file;

  const parsed = await parseCv(buffer, mimetype, originalname);
  const { fileName, storagePath } = await storageService.save(buffer, {
    originalName: originalname,
    subdir: 'cvs',
  });

  const profile = await getOrCreateProfile(req.user);

  // Replacing a CV leaves the previous file behind otherwise.
  const previousPath = profile.cv?.storagePath;
  if (previousPath && previousPath !== storagePath) {
    await storageService.remove(previousPath);
  }

  profile.cv = {
    fileName,
    originalName: originalname,
    mimeType: mimetype,
    size,
    storagePath,
    uploadedAt: new Date(),
  };
  profile.rawCvText = parsed.rawText;
  profile.parseStatus = parsed.parseStatus;
  await profile.save();

  return ok(
    res,
    {
      // A draft for the review form — not yet saved to the profile.
      parsed: parsed.profile,
      parseStatus: parsed.parseStatus,
      strategy: parsed.strategy,
      reason: parsed.reason,
      cv: {
        originalName: originalname,
        size,
        uploadedAt: profile.cv.uploadedAt,
      },
      // Which fields the parser actually filled, so the UI can badge them.
      autoFilledFields: PROFILE_FIELDS.filter((field) => {
        const value = parsed.profile[field];
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'number') return value > 0;
        return Boolean(value);
      }),
    },
    parsed.parseStatus === 'parsed'
      ? 'CV uploaded and details extracted. Please review them.'
      : 'CV uploaded, but we could not read the details. Please fill them in.',
  );
});

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user);
  return ok(res, { profile: profile.toObject() }, 'Profile');
});

export const updateProfile = asyncHandler(async (req, res) => {
  const profile = await getOrCreateProfile(req.user);

  for (const field of PROFILE_FIELDS) {
    if (req.body[field] !== undefined) profile[field] = req.body[field];
  }

  // Once a human has confirmed the fields, the profile is no longer a machine
  // guess — record that so the review banner stops showing.
  if (profile.parseStatus === 'pending' || profile.parseStatus === 'failed') {
    profile.parseStatus = 'manual';
  }

  await profile.save();

  return ok(res, { profile: profile.toObject() }, 'Profile saved');
});

/**
 * Streams the caller's own CV. POST-only means the browser cannot point an
 * <iframe> or <a download> at this directly — the frontend fetches it as a blob
 * and creates an object URL.
 */
export const downloadOwnCv = asyncHandler(async (req, res) => {
  const profile = await CandidateProfile.findOne({ userId: req.user._id });
  if (!profile?.cv?.storagePath) throw ApiError.notFound('No CV has been uploaded yet');

  const exists = await storageService.exists(profile.cv.storagePath);
  if (!exists) throw ApiError.notFound('The CV file is no longer available');

  res.setHeader('Content-Type', profile.cv.mimeType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(profile.cv.originalName || 'cv.pdf')}"`,
  );

  storageService.createReadStream(profile.cv.storagePath).pipe(res);
});

export { computeProfileCompletion };
