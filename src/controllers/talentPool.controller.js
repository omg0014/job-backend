import { TalentPoolEntry } from '../models/TalentPoolEntry.js';
import { User } from '../models/User.js';
import { CandidateProfile } from '../models/CandidateProfile.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/response.js';
import { escapeRegex } from '../validators/common.js';
import { logActivity, ACTIVITY_ACTIONS } from '../services/activityService.js';

/** Adding an existing candidate updates their tags/note rather than erroring. */
export const addToTalentPool = asyncHandler(async (req, res) => {
  const { candidateId, tags, note } = req.body;

  const candidate = await User.findOne({ _id: candidateId, role: 'candidate' }).lean();
  if (!candidate) throw ApiError.notFound('Candidate not found');

  const entry = await TalentPoolEntry.findOneAndUpdate(
    { candidateId },
    { candidateId, addedBy: req.user._id, tags, note, addedAt: new Date() },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.TALENT_POOL_ADDED,
    targetType: 'talentPool',
    targetId: entry._id,
    targetLabel: candidate.name,
    summary: `Saved ${candidate.name} to the talent pool`,
    meta: { tags },
  });

  return created(res, { entry: entry.toObject() }, 'Saved to talent pool');
});

export const removeFromTalentPool = asyncHandler(async (req, res) => {
  const entry = await TalentPoolEntry.findByIdAndDelete(req.body.entryId).lean();
  if (!entry) throw ApiError.notFound('Talent pool entry not found');
  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.TALENT_POOL_REMOVED,
    targetType: 'talentPool',
    targetId: entry._id,
    summary: 'Removed a candidate from the talent pool',
  });

  return ok(res, { entryId: req.body.entryId }, 'Removed from talent pool');
});

export const listTalentPool = asyncHandler(async (req, res) => {
  const { q, tag, page, limit } = req.body;

  const filter = {};
  if (tag) filter.tags = new RegExp(escapeRegex(tag), 'i');

  // A keyword narrows by candidate profile, so resolve matching candidates first.
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const profiles = await CandidateProfile.find({
      $or: [{ fullName: rx }, { email: rx }, { skills: rx }, { subjects: rx }, { headline: rx }],
    })
      .select('userId')
      .lean();
    filter.candidateId = { $in: profiles.map((profile) => profile.userId) };
  }

  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    TalentPoolEntry.find(filter)
      .sort({ addedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('candidateId', 'name email')
      .lean(),
    TalentPoolEntry.countDocuments(filter),
  ]);

  const profiles = await CandidateProfile.find({
    userId: { $in: entries.map((entry) => entry.candidateId?._id).filter(Boolean) },
  })
    .select('userId fullName headline totalExperienceYears subjects skills location profileCompletion')
    .lean();

  const profileByUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));

  const items = entries.map((entry) => ({
    ...entry,
    profile: profileByUser.get(String(entry.candidateId?._id)) ?? null,
  }));

  return ok(res, paginated(items, total, page, limit), 'Talent pool');
});
