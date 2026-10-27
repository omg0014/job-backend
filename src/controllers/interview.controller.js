import { Interview } from '../models/Interview.js';
import { createMeetLink, isMeetConfigured } from '../services/meetService.js';
import { Application } from '../models/Application.js';
import { notify } from '../services/notificationService.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/response.js';
import { buildSort } from '../validators/common.js';
import { logActivity, ACTIVITY_ACTIONS } from '../services/activityService.js';

const formatWhen = (date) =>
  new Date(date).toLocaleString('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Scheduling an interview also advances the application to
 * 'interview_scheduled' and notifies the candidate — HR should not have to do
 * three things to accomplish one.
 */
export const createInterview = asyncHandler(async (req, res) => {
  const { applicationId, scheduledAt, mode, locationOrLink, interviewerName } = req.body;

  const application = await Application.findById(applicationId)
    .populate('jobId', 'title')
    .populate('candidateId', 'email');
  if (!application) throw ApiError.notFound('Application not found');

  // An online round two gets a Meet link generated for it, unless the
  // scheduler already supplied one. Conferencing is a convenience — if Google
  // is unconfigured or erroring, scheduling still succeeds.
  let meetingLink = locationOrLink;
  if (mode === 'online' && !locationOrLink && isMeetConfigured()) {
    const meet = await createMeetLink({
      summary: `Interview — ${application.profileSnapshot?.fullName ?? 'Candidate'} (${application.jobId?.title ?? 'Role'})`,
      description: 'Second-round interview at Yugam International School.',
      startAt: scheduledAt,
      attendees: [application.candidateId?.email, req.user.email],
    });
    if (meet?.hangoutLink) meetingLink = meet.hangoutLink;
  }

  // Rescheduling replaces the existing record rather than stacking duplicates.
  const interview = await Interview.findOneAndUpdate(
    { applicationId },
    {
      applicationId,
      scheduledAt,
      mode,
      locationOrLink: meetingLink,
      interviewerName,
      createdBy: req.user._id,
      $setOnInsert: { outcome: 'pending' },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  if (application.status !== 'interview_scheduled') {
    application.status = 'interview_scheduled';
    application.statusHistory.push({
      status: 'interview_scheduled',
      changedBy: req.user._id,
      changedAt: new Date(),
      note: `Interview scheduled for ${formatWhen(scheduledAt)}`,
    });
    await application.save();
  }

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.INTERVIEW_SCHEDULED,
    targetType: 'interview',
    targetId: interview._id,
    targetLabel: application.profileSnapshot?.fullName ?? 'Candidate',
    summary: `Scheduled a ${mode} interview with ${application.profileSnapshot?.fullName ?? 'a candidate'} for ${formatWhen(scheduledAt)}`,
    meta: { mode, scheduledAt, interviewerName, jobTitle: application.jobId?.title },
  });

  await notify({
    userId: application.candidateId,
    type: 'interview_scheduled',
    title: `Interview scheduled — ${application.jobId?.title ?? 'your application'}`,
    message: `Your interview is scheduled for ${formatWhen(scheduledAt)} (${mode}). ${
      mode === 'online' ? `Join here: ${locationOrLink}` : `Venue: ${locationOrLink}`
    }${interviewerName ? ` Interviewer: ${interviewerName}.` : ''}`,
    link: '/applications',
  });

  return created(res, { interview: interview.toObject() }, 'Interview scheduled');
});

export const updateInterview = asyncHandler(async (req, res) => {
  const { interviewId, ...updates } = req.body;

  const interview = await Interview.findById(interviewId);
  if (!interview) throw ApiError.notFound('Interview not found');

  const rescheduled =
    updates.scheduledAt &&
    new Date(updates.scheduledAt).getTime() !== interview.scheduledAt.getTime();

  Object.assign(interview, updates);
  await interview.save();

  if (rescheduled) {
    const application = await Application.findById(interview.applicationId).populate('jobId', 'title');
    if (application) {
      await notify({
        userId: application.candidateId,
        type: 'interview_scheduled',
        title: `Interview rescheduled — ${application.jobId?.title ?? 'your application'}`,
        message: `Your interview has been moved to ${formatWhen(interview.scheduledAt)}.`,
        link: '/applications',
      });
    }
  }

  await logActivity({
    actor: req.user,
    action: ACTIVITY_ACTIONS.INTERVIEW_UPDATED,
    targetType: 'interview',
    targetId: interview._id,
    summary: rescheduled
      ? `Rescheduled an interview to ${formatWhen(interview.scheduledAt)}`
      : `Updated interview notes${interview.rating ? ` (rated ${interview.rating}/5)` : ''}`,
    meta: { rating: interview.rating, outcome: interview.outcome, rescheduled },
  });

  return ok(res, { interview: interview.toObject() }, 'Interview updated');
});

export const listInterviews = asyncHandler(async (req, res) => {
  const { from, to, outcome, page, limit, sortBy, sortOrder } = req.body;

  const filter = {};
  if (outcome) filter.outcome = outcome;
  if (from || to) {
    filter.scheduledAt = {};
    if (from) filter.scheduledAt.$gte = from;
    if (to) filter.scheduledAt.$lte = to;
  }

  const sort = buildSort(sortBy, sortOrder, ['scheduledAt', 'rating'], { scheduledAt: 1 });
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Interview.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'applicationId',
        select: 'profileSnapshot.fullName profileSnapshot.email status jobId',
        populate: { path: 'jobId', select: 'title department' },
      })
      .lean(),
    Interview.countDocuments(filter),
  ]);

  return ok(res, paginated(items, total, page, limit), 'Interviews');
});
