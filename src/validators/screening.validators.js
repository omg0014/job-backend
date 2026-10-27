import { z } from 'zod';
import { objectId } from './common.js';

export const inviteScreeningSchema = z.object({
  applicationId: objectId('applicationId'),
});

export const getScreeningSchema = z.object({
  applicationId: objectId('applicationId'),
});

export const acceptConsentSchema = z.object({
  applicationId: objectId('applicationId'),
  // Consent must be an affirmative act — the client cannot send `false` and
  // have it recorded as agreement.
  accepted: z.literal(true, { message: 'Consent is required to continue' }),
});

export const saveTextAnswersSchema = z.object({
  applicationId: objectId('applicationId'),
  // Shape is validated against the snapshot's own fields in the controller,
  // since the template is editable and this schema cannot know its keys.
  textAnswers: z.record(z.string(), z.unknown()),
  // A partial save as the candidate types; only a final submit enforces
  // required fields.
  isComplete: z.boolean().default(false),
});

export const deviceCheckSchema = z.object({
  applicationId: objectId('applicationId'),
  passed: z.boolean(),
});

export const startScreeningSchema = z.object({
  applicationId: objectId('applicationId'),
});

/**
 * Template editing. The question set is what every candidate is asked, so the
 * bounds here are deliberate: too many questions or too long a time limit and
 * completion rates collapse, which costs good candidates rather than weak ones.
 */
const templateQuestion = z.object({
  order: z.coerce.number().int().min(1).max(20),
  text: z.string().trim().min(10, 'A question needs to be a real sentence').max(500),
  prepSeconds: z.coerce.number().int().min(0).max(120).default(30),
  maxAnswerSeconds: z.coerce.number().int().min(15).max(300).default(120),
});

const templateField = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'Field key must be a plain camelCase identifier'),
  label: z.string().trim().min(2).max(160),
  type: z.enum(['text', 'number', 'select', 'multiselect', 'date']).default('text'),
  options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  required: z.boolean().default(false),
});

export const getTemplateSchema = z.object({}).strip();

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    questions: z.array(templateQuestion).min(1, 'Keep at least one question').max(10),
    textFields: z.array(templateField).max(25).default([]),
  })
  .superRefine((body, ctx) => {
    const orders = body.questions.map((question) => question.order);
    if (new Set(orders).size !== orders.length) {
      ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Question order must be unique' });
    }
    const keys = body.textFields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['textFields'], message: 'Field keys must be unique' });
    }
    // A select with nothing to select is a dead end for the candidate.
    body.textFields.forEach((field, index) => {
      if (['select', 'multiselect'].includes(field.type) && field.options.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['textFields', index, 'options'],
          message: `"${field.label}" is a choice field, so it needs at least one option`,
        });
      }
    });
    // Eight minutes is the working limit; past ten, candidates drop out.
    const total = body.questions.reduce((sum, q) => sum + q.maxAnswerSeconds, 0);
    if (total > 900) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: `That is ${Math.round(total / 60)} minutes of recording. Keep the total under 15.`,
      });
    }
  });

/**
 * Multipart bodies arrive as strings, so every numeric field is coerced.
 */
export const uploadChunkSchema = z.object({
  applicationId: objectId('applicationId'),
  questionOrder: z.coerce.number().int().min(1).max(20),
  chunkIndex: z.coerce.number().int().min(0).max(2000),
  isLast: z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true'),
});

export const finishAnswerSchema = z.object({
  applicationId: objectId('applicationId'),
  questionOrder: z.coerce.number().int().min(1).max(20),
  durationSeconds: z.coerce.number().min(0).max(600),
  mimeType: z.string().trim().max(80).default('video/webm'),
  retake: z.coerce.boolean().default(false),
  isAudioOnly: z.coerce.boolean().default(false),
});

export const submitScreeningSchema = z.object({
  applicationId: objectId('applicationId'),
});

export const playbackUrlSchema = z.object({
  applicationId: objectId('applicationId'),
  questionOrder: z.coerce.number().int().min(1).max(20),
});

export const reviewScreeningSchema = z.object({
  applicationId: objectId('applicationId'),
});

export const saveReviewSchema = z.object({
  applicationId: objectId('applicationId'),
  ratings: z
    .array(
      z.object({
        questionOrder: z.coerce.number().int().min(1).max(20),
        rating: z.coerce.number().int().min(1).max(5),
      }),
    )
    .max(20)
    .default([]),
  overallRating: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(4000).default(''),
});

export const compareSchema = z.object({
  jobId: objectId('jobId'),
  questionOrder: z.coerce.number().int().min(1).max(20),
  // Comparison is normally run over the people still in contention.
  status: z.enum(['screening', 'shortlisted', 'all']).default('all'),
});

export const deleteRecordingsSchema = z.object({
  applicationId: objectId('applicationId'),
});
