import { Screening } from '../models/Screening.js';
import { ScreeningTemplate } from '../models/ScreeningTemplate.js';
import { Application } from '../models/Application.js';
import { Job } from '../models/Job.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/response.js';
import { notify } from '../services/notificationService.js';
import { logActivity, ACTIVITY_ACTIONS, visibleActorIds } from '../services/activityService.js';
import { ROLES } from '../utils/roles.js';
import { env } from '../config/env.js';
import { storage } from '../storage/index.js';
import { MediaJob } from '../models/MediaJob.js';

/** Mirrors the application scoping rule — staff see their own team's jobs. */
const assertCanManage = async (user, application) => {
  if (user.role === ROLES.ADMIN) return;
  const ownerIds = await visibleActorIds(user);
  const jobId = application.jobId?._id ?? application.jobId;
  const job = await Job.findById(jobId).select('createdBy').lean();
  const allowed = job && ownerIds.some((id) => String(id) === String(job.createdBy));
  if (!allowed) throw ApiError.forbidden('This applicant applied to another team’s job');
};

/**
 * Invites a candidate to the video screening round.
 *
 * Idempotent: inviting twice returns the existing screening rather than
 * discarding answers already recorded.
 */
export const inviteToScreening = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.body.applicationId).populate('jobId', 'title lastDateToApply');
  if (!application) throw ApiError.notFound('Application not found');
  await assertCanManage(req.user, application);

  const existing = await Screening.findOne({ applicationId: application._id });
  if (existing) {
    return ok(res, { screening: existing.toObject() }, 'Screening already invited');
  }

  const template = await ScreeningTemplate.findOne({ isActive: true }).lean();
  if (!template) throw ApiError.badRequest('No active screening template is configured');

  // Whichever comes first: the job's deadline, or the standard window. There is
  // no point letting a candidate record after the role has closed.
  const windowEnd = new Date(Date.now() + env.screeningExpiryDays * 24 * 60 * 60 * 1000);
  const jobDeadline = application.jobId?.lastDateToApply
    ? new Date(application.jobId.lastDateToApply)
    : null;
  const expiresAt = jobDeadline && jobDeadline < windowEnd ? jobDeadline : windowEnd;

  const screening = await Screening.create({
    applicationId: application._id,
    jobId: application.jobId?._id ?? application.jobId,
    candidateId: application.candidateId,
    templateSnapshot: {
      templateId: template._id,
      name: template.name,
      questions: template.questions,
      textFields: template.textFields,
    },
    expiresAt,
  });

  // The status move surfaces the call to action on the candidate's application
  // card — but only ever forwards. Inviting someone already shortlisted or
  // scheduled must not drag their pipeline backwards.
  const BEFORE_SCREENING = ['applied', 'under_review'];
  if (BEFORE_SCREENING.includes(application.status)) {
    application.status = 'screening';
    application.statusHistory.push({
      status: 'screening',
      changedBy: req.user._id,
      changedAt: new Date(),
      note: 'Invited to video screening',
    });
    await application.save();
  }

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.APPLICATION_STATUS_CHANGED,
    targetType: 'application',
    targetId: application._id,
    targetLabel: application.profileSnapshot?.fullName ?? 'Candidate',
    summary: `Invited ${application.profileSnapshot?.fullName ?? 'a candidate'} to the video screening round for ${application.jobId?.title ?? 'a role'}`,
    meta: { status: 'screening', jobTitle: application.jobId?.title },
  });

  await notify({
    userId: application.candidateId,
    type: 'application_status',
    title: `Video screening — ${application.jobId?.title ?? 'your application'}`,
    message: `You have been invited to record a short video screening for ${application.jobId?.title ?? 'this role'}. It takes about 10 minutes and can be completed any time before ${expiresAt.toDateString()}.`,
    link: '/applications',
  });

  return created(res, { screening: screening.toObject() }, 'Screening invitation sent');
});

/**
 * The candidate's view of their own screening. Returns the questions and text
 * fields from the snapshot, never the live template.
 */
export const getScreening = asyncHandler(async (req, res) => {
  const screening = await Screening.findOne({ applicationId: req.body.applicationId });
  if (!screening) throw ApiError.notFound('No screening round for this application');

  const isOwner = String(screening.candidateId) === String(req.user._id);
  if (!isOwner) {
    // A candidate who is not the owner has no business here at all, and the
    // staff-scoping message would be nonsense shown to them.
    if (req.user.role === ROLES.CANDIDATE) {
      throw ApiError.forbidden('This screening belongs to another candidate');
    }
    const application = await Application.findById(screening.applicationId).populate('jobId', 'title');
    if (!application) throw ApiError.notFound('Application not found');
    await assertCanManage(req.user, application);
  }

  // Expiry is evaluated on read rather than by a scheduled sweep, so a lapsed
  // round reports itself correctly the moment anyone looks at it.
  if (screening.status !== 'completed' && screening.expiresAt.getTime() < Date.now()) {
    if (screening.status !== 'expired') {
      screening.status = 'expired';
      await screening.save();
    }
  }

  const answered = screening.answers.map((answer) => answer.questionOrder);

  return ok(
    res,
    {
      screening: screening.toObject(),
      questions: screening.templateSnapshot?.questions ?? [],
      textFields: screening.templateSnapshot?.textFields ?? [],
      progress: {
        answered,
        total: screening.templateSnapshot?.questions?.length ?? 0,
        // The runner resumes here after a closed browser or a dropped call.
        nextQuestionOrder:
          (screening.templateSnapshot?.questions ?? [])
            .map((question) => question.order)
            .find((order) => !answered.includes(order)) ?? null,
      },
      isOpen: screening.isOpen(),
    },
    'Screening',
  );
});

/** The active question set, for the template editor. */
export const getTemplate = asyncHandler(async (req, res) => {
  const template = await ScreeningTemplate.findOne({ isActive: true })
    .populate('updatedBy', 'name role')
    .lean();
  if (!template) throw ApiError.notFound('No active screening template is configured');

  // How many candidates are mid-round right now — editing is safe for them
  // (they hold a snapshot), but the editor should say so plainly.
  const inFlight = await Screening.countDocuments({
    status: { $in: ['not_started', 'in_progress'] },
  });

  return ok(res, { template, inFlight }, 'Screening template');
});

/**
 * Replaces the question set.
 *
 * Candidates already invited keep the snapshot taken at invite time, so an
 * edit never changes what someone was asked halfway through — the response
 * reports how many that affects.
 */
export const updateTemplate = asyncHandler(async (req, res) => {
  const template = await ScreeningTemplate.findOne({ isActive: true });
  if (!template) throw ApiError.notFound('No active screening template is configured');

  const { name, questions, textFields } = req.body;

  if (name) template.name = name;
  template.questions = [...questions].sort((a, b) => a.order - b.order);
  template.textFields = textFields;
  template.updatedBy = req.user._id;
  await template.save();

  const inFlight = await Screening.countDocuments({
    status: { $in: ['not_started', 'in_progress'] },
  });

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.APPLICATION_STATUS_CHANGED,
    targetType: 'application',
    targetId: template._id,
    targetLabel: template.name,
    summary: `Updated the video screening question set — ${questions.length} question${questions.length === 1 ? '' : 's'}`,
    meta: { questionCount: questions.length, fieldCount: textFields.length },
  });

  return ok(
    res,
    { template: template.toObject(), inFlight },
    inFlight > 0
      ? `Saved. ${inFlight} candidate${inFlight === 1 ? '' : 's'} already invited will finish the questions they were given.`
      : 'Screening template saved',
  );
});

/** Throws unless the caller owns this screening and it is still open. */
const loadOwnScreening = async (user, applicationId, { mustBeOpen = true } = {}) => {
  const screening = await Screening.findOne({ applicationId });
  if (!screening) throw ApiError.notFound('No screening round for this application');
  if (String(screening.candidateId) !== String(user._id)) {
    throw ApiError.forbidden('This screening belongs to another candidate');
  }
  if (mustBeOpen && !screening.isOpen()) {
    throw ApiError.badRequest(
      screening.status === 'completed'
        ? 'You have already submitted this screening'
        : 'This screening round has closed',
    );
  }
  return screening;
};

/**
 * Records consent. Stored as a timestamp rather than a boolean so there is an
 * auditable record of when the candidate agreed — required under the DPDP Act.
 */
export const acceptConsent = asyncHandler(async (req, res) => {
  const screening = await loadOwnScreening(req.user, req.body.applicationId);
  if (!screening.consentAcceptedAt) {
    screening.consentAcceptedAt = new Date();
    await screening.save();
  }
  return ok(res, { consentAcceptedAt: screening.consentAcceptedAt }, 'Consent recorded');
});

/**
 * Saves the factual answers. Called repeatedly as the candidate fills the form,
 * so it merges rather than replaces, and only enforces required fields when
 * the candidate says they are done.
 */
export const saveTextAnswers = asyncHandler(async (req, res) => {
  const { textAnswers, isComplete } = req.body;
  const screening = await loadOwnScreening(req.user, req.body.applicationId);

  const fields = screening.templateSnapshot?.textFields ?? [];
  const byKey = new Map(fields.map((field) => [field.key, field]));

  // Anything not in the snapshot is dropped — a crafted body cannot write
  // arbitrary keys onto the document.
  const clean = {};
  for (const [key, value] of Object.entries(textAnswers)) {
    const field = byKey.get(key);
    if (!field) continue;
    if (field.type === 'multiselect') {
      const allowed = new Set(field.options);
      clean[key] = (Array.isArray(value) ? value : []).filter((item) => allowed.has(item));
    } else if (field.type === 'select') {
      clean[key] = field.options.includes(value) ? value : '';
    } else if (field.type === 'number') {
      const parsed = Number(value);
      clean[key] = value === '' || Number.isNaN(parsed) ? '' : parsed;
    } else {
      clean[key] = typeof value === 'string' ? value.trim().slice(0, 500) : '';
    }
  }

  const merged = { ...(screening.textAnswers ?? {}), ...clean };

  if (isComplete) {
    const missing = fields
      .filter((field) => field.required)
      .filter((field) => {
        const value = merged[field.key];
        return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      })
      .map((field) => field.label);

    if (missing.length > 0) {
      throw ApiError.badRequest(`Please complete: ${missing.join(', ')}`);
    }
  }

  screening.textAnswers = merged;
  screening.markModified('textAnswers');
  await screening.save();

  return ok(res, { textAnswers: merged, isComplete: Boolean(isComplete) }, 'Details saved');
});

/** The device check result. A failed check is recorded, not hidden. */
export const saveDeviceCheck = asyncHandler(async (req, res) => {
  const screening = await loadOwnScreening(req.user, req.body.applicationId);
  screening.deviceCheckPassed = Boolean(req.body.passed);
  await screening.save();
  return ok(res, { deviceCheckPassed: screening.deviceCheckPassed }, 'Device check recorded');
});

/**
 * Opens the recording session. Consent and the device check are prerequisites —
 * enforced here rather than only in the UI, since the UI is not a security
 * boundary.
 */
export const startScreening = asyncHandler(async (req, res) => {
  const screening = await loadOwnScreening(req.user, req.body.applicationId);

  if (!screening.consentAcceptedAt) {
    throw ApiError.badRequest('Please accept the consent notice before starting');
  }
  if (!screening.deviceCheckPassed) {
    throw ApiError.badRequest('Please complete the device check before starting');
  }

  if (screening.status === 'not_started') {
    screening.status = 'in_progress';
    screening.startedAt = new Date();
    await screening.save();
  }

  return ok(res, { screening: screening.toObject() }, 'Screening started');
});

/** Extension implied by the browser's chosen container. */
const extensionFor = (mimeType = '') => {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
};

const answerKey = (applicationId, order, ext) =>
  `screening/${applicationId}/q${order}.${ext}`;

/**
 * Receives one ~3-second chunk mid-recording.
 *
 * Deliberately thin: it appends bytes and returns. Nothing here parses the
 * media or touches the database beyond the ownership check, because this runs
 * every three seconds on a phone that may be on 3G.
 */
export const uploadChunk = asyncHandler(async (req, res) => {
  const { applicationId, questionOrder, chunkIndex } = req.body;
  if (!req.file?.buffer?.length) throw ApiError.badRequest('No chunk received');

  const screening = await loadOwnScreening(req.user, applicationId);

  const question = (screening.templateSnapshot?.questions ?? []).find(
    (item) => item.order === questionOrder,
  );
  if (!question) throw ApiError.badRequest('No such question in this screening');

  // Chunks land in a staging key so a retake never corrupts a finished answer.
  await storage.appendChunk(`screening/${applicationId}/q${questionOrder}.staging`, req.file.buffer, chunkIndex);

  return ok(res, { chunkIndex, received: req.file.buffer.length }, 'Chunk received');
});

/**
 * Seals one answer: promotes the staged bytes to the final key and records the
 * answer on the screening. Progress is persisted here, so a browser that dies
 * mid-round resumes at the next unanswered question rather than the start.
 */
export const finishAnswer = asyncHandler(async (req, res) => {
  const { applicationId, questionOrder, durationSeconds, mimeType, retake, isAudioOnly } = req.body;
  const screening = await loadOwnScreening(req.user, applicationId);

  const question = (screening.templateSnapshot?.questions ?? []).find(
    (item) => item.order === questionOrder,
  );
  if (!question) throw ApiError.badRequest('No such question in this screening');

  const existing = screening.answerFor(questionOrder);
  if (existing && !retake) {
    throw ApiError.conflict('This question has already been answered');
  }
  // One retake only: zero punishes nerves, unlimited rewards the most polished
  // performer rather than the best teacher.
  if (existing && retake && existing.retakeCount >= 1) {
    throw ApiError.badRequest('You have already used your retake for this question');
  }

  const ext = extensionFor(mimeType);
  const stagingKey = `screening/${applicationId}/q${questionOrder}.staging`;
  const finalKey = answerKey(applicationId, questionOrder, ext);

  const staged = await storage.finalizeAs(stagingKey, finalKey);

  const maxBytes = env.maxUploadMb * 1024 * 1024;
  if (staged.sizeBytes > maxBytes) {
    await storage.delete(finalKey);
    throw ApiError.badRequest(`That answer is larger than the ${env.maxUploadMb} MB limit`);
  }
  if (staged.sizeBytes === 0) {
    await storage.delete(finalKey);
    throw ApiError.badRequest('That recording was empty — please try again');
  }

  const record = {
    questionOrder,
    storageKey: finalKey,
    durationSeconds,
    sizeBytes: staged.sizeBytes,
    mimeType,
    isAudioOnly,
    retakeCount: existing ? existing.retakeCount + 1 : 0,
    transcodeStatus: env.enableTranscode ? 'pending' : 'done',
    recordedAt: new Date(),
  };

  if (existing) {
    // Replace in place, keeping answer order stable.
    const index = screening.answers.findIndex((a) => a.questionOrder === questionOrder);
    screening.answers.splice(index, 1, record);
  } else {
    screening.answers.push(record);
  }

  if (screening.status === 'not_started') {
    screening.status = 'in_progress';
    screening.startedAt = screening.startedAt ?? new Date();
  }
  await screening.save();

  if (env.enableTranscode) {
    await MediaJob.create({
      type: 'transcode',
      refId: screening.applicationId,
      payload: { key: finalKey, questionOrder },
    });
  }

  const total = screening.templateSnapshot?.questions?.length ?? 0;
  const answered = screening.answers.map((a) => a.questionOrder);

  return ok(
    res,
    {
      answer: record,
      progress: {
        answered,
        total,
        nextQuestionOrder:
          (screening.templateSnapshot?.questions ?? [])
            .map((q) => q.order)
            .find((order) => !answered.includes(order)) ?? null,
      },
    },
    'Answer saved',
  );
});

/** Final submission. Every question must have an answer. */
export const submitScreening = asyncHandler(async (req, res) => {
  const screening = await loadOwnScreening(req.user, req.body.applicationId);

  const questions = screening.templateSnapshot?.questions ?? [];
  const answered = new Set(screening.answers.map((a) => a.questionOrder));
  const missing = questions.filter((q) => !answered.has(q.order)).map((q) => q.order);
  if (missing.length > 0) {
    throw ApiError.badRequest(`Please answer question ${missing.join(', ')} before submitting`);
  }

  const fields = screening.templateSnapshot?.textFields ?? [];
  const incomplete = fields
    .filter((f) => f.required)
    .filter((f) => {
      const value = screening.textAnswers?.[f.key];
      return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    })
    .map((f) => f.label);
  if (incomplete.length > 0) {
    throw ApiError.badRequest(`Please complete: ${incomplete.join(', ')}`);
  }

  screening.status = env.enableTranscode ? 'processing' : 'completed';
  screening.submittedAt = new Date();
  await screening.save();

  const application = await Application.findById(screening.applicationId).populate('jobId', 'title');

  await notify({
    userId: screening.candidateId,
    type: 'application_status',
    title: `Screening received — ${application?.jobId?.title ?? 'your application'}`,
    message:
      'Thank you — your video screening has been received. The school will review it and be in touch about the next step.',
    link: '/applications',
  });

  return ok(res, { screening: screening.toObject() }, 'Screening submitted');
});

/**
 * Returns a short-lived URL for one clip.
 *
 * The POST route is where authorization happens; the returned URL carries a
 * signed token so the <video> element can issue ordinary GETs with Range
 * headers and the reviewer can actually seek.
 */
export const getPlaybackUrl = asyncHandler(async (req, res) => {
  const { applicationId, questionOrder } = req.body;

  const screening = await Screening.findOne({ applicationId });
  if (!screening) throw ApiError.notFound('No screening round for this application');

  const isOwner = String(screening.candidateId) === String(req.user._id);
  if (!isOwner) {
    if (req.user.role === ROLES.CANDIDATE) {
      throw ApiError.forbidden('This screening belongs to another candidate');
    }
    const application = await Application.findById(screening.applicationId).populate('jobId', 'title');
    if (!application) throw ApiError.notFound('Application not found');
    await assertCanManage(req.user, application);

    // Every staff playback is logged with who and when, as the privacy section
    // requires. Candidates replaying their own answers are not logged.
    screening.playbackLog.push({ userId: req.user._id, questionOrder, playedAt: new Date() });
    await screening.save();
  }

  const answer = screening.answerFor(questionOrder);
  if (!answer?.storageKey) throw ApiError.notFound('No recording for that question');

  const { url, expiresAt } = await storage.getSignedUrl(answer.storageKey, env.signedUrlTtlSeconds);

  return ok(
    res,
    { url, expiresAt, mimeType: answer.mimeType, durationSeconds: answer.durationSeconds },
    'Playback URL',
  );
});

/**
 * Everything the reviewer needs for one candidate: the text answers that do
 * most of the filtering, the clip list, and this reviewer's own saved ratings.
 */
export const reviewScreening = asyncHandler(async (req, res) => {
  const screening = await Screening.findOne({ applicationId: req.body.applicationId })
    .populate('candidateId', 'name email')
    .populate('reviews.reviewerId', 'name role');
  if (!screening) throw ApiError.notFound('No screening round for this application');

  const application = await Application.findById(screening.applicationId).populate('jobId', 'title');
  if (!application) throw ApiError.notFound('Application not found');
  await assertCanManage(req.user, application);

  const mine = screening.reviews.find(
    (review) => String(review.reviewerId?._id ?? review.reviewerId) === String(req.user._id),
  );

  return ok(
    res,
    {
      screening: screening.toObject(),
      questions: screening.templateSnapshot?.questions ?? [],
      textFields: screening.templateSnapshot?.textFields ?? [],
      myReview: mine ?? null,
      // Other reviewers' opinions are visible but separate — nobody's rating
      // overwrites anybody else's.
      otherReviews: screening.reviews.filter(
        (review) => String(review.reviewerId?._id ?? review.reviewerId) !== String(req.user._id),
      ),
    },
    'Screening review',
  );
});

/** Upserts this reviewer's own entry, leaving other reviewers untouched. */
export const saveReview = asyncHandler(async (req, res) => {
  const { applicationId, ratings, overallRating, notes } = req.body;

  const screening = await Screening.findOne({ applicationId });
  if (!screening) throw ApiError.notFound('No screening round for this application');

  const application = await Application.findById(screening.applicationId).populate('jobId', 'title');
  if (!application) throw ApiError.notFound('Application not found');
  await assertCanManage(req.user, application);

  const entry = {
    reviewerId: req.user._id,
    ratings,
    overallRating,
    notes,
    reviewedAt: new Date(),
  };

  const index = screening.reviews.findIndex(
    (review) => String(review.reviewerId) === String(req.user._id),
  );
  if (index >= 0) screening.reviews.splice(index, 1, entry);
  else screening.reviews.push(entry);

  await screening.save();

  return ok(res, { review: entry }, 'Review saved');
});

/**
 * Comparison mode: one question, every candidate, back to back.
 *
 * This is the feature that makes a round of forty reviewable. Judging twenty
 * answers to the same question is both faster and more consistent than opening
 * twenty profiles, because the comparison is direct.
 */
export const compareByQuestion = asyncHandler(async (req, res) => {
  const { jobId, questionOrder, status } = req.body;

  const job = await Job.findById(jobId).select('title createdBy').lean();
  if (!job) throw ApiError.notFound('Job not found');

  if (req.user.role !== ROLES.ADMIN) {
    const ownerIds = await visibleActorIds(req.user);
    if (!ownerIds.some((id) => String(id) === String(job.createdBy))) {
      throw ApiError.forbidden('This job belongs to another team');
    }
  }

  const applicationFilter = { jobId };
  if (status !== 'all') applicationFilter.status = status;
  const applications = await Application.find(applicationFilter).select('_id status profileSnapshot.fullName').lean();
  const byApplication = new Map(applications.map((item) => [String(item._id), item]));

  const screenings = await Screening.find({
    applicationId: { $in: applications.map((item) => item._id) },
    'answers.questionOrder': questionOrder,
  }).lean();

  const question = screenings[0]?.templateSnapshot?.questions?.find(
    (item) => item.order === questionOrder,
  );

  const clips = screenings
    .map((screening) => {
      const answer = screening.answers.find((item) => item.questionOrder === questionOrder);
      if (!answer?.storageKey) return null;
      const application = byApplication.get(String(screening.applicationId));
      const mine = screening.reviews?.find(
        (review) => String(review.reviewerId) === String(req.user._id),
      );
      return {
        applicationId: screening.applicationId,
        candidateName: application?.profileSnapshot?.fullName ?? 'Candidate',
        applicationStatus: application?.status,
        durationSeconds: answer.durationSeconds,
        isAudioOnly: answer.isAudioOnly,
        // The rating this reviewer already gave, so the control shows state.
        myRating:
          mine?.ratings?.find((rating) => rating.questionOrder === questionOrder)?.rating ?? null,
      };
    })
    .filter(Boolean);

  return ok(
    res,
    { jobTitle: job.title, questionOrder, questionText: question?.text ?? '', clips },
    'Comparison set',
  );
});

/**
 * Erases a candidate's recordings on request — the deletion path the privacy
 * section requires. The screening document is kept so the review history is
 * not silently rewritten; only the media goes.
 */
export const deleteRecordings = asyncHandler(async (req, res) => {
  const screening = await Screening.findOne({ applicationId: req.body.applicationId });
  if (!screening) throw ApiError.notFound('No screening round for this application');

  const application = await Application.findById(screening.applicationId).populate('jobId', 'title');
  if (!application) throw ApiError.notFound('Application not found');
  await assertCanManage(req.user, application);

  let removed = 0;
  for (const answer of screening.answers) {
    if (answer.storageKey) {
      await storage.delete(answer.storageKey);
      answer.storageKey = '';
      removed += 1;
    }
  }
  await screening.save();

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.APPLICATION_STATUS_CHANGED,
    targetType: 'application',
    targetId: application._id,
    targetLabel: application.profileSnapshot?.fullName ?? 'Candidate',
    summary: `Deleted ${removed} screening recording${removed === 1 ? '' : 's'} for ${application.profileSnapshot?.fullName ?? 'a candidate'}`,
    meta: { removed },
  });

  return ok(res, { removed }, `Deleted ${removed} recording${removed === 1 ? '' : 's'}`);
});
