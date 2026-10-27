import { z } from 'zod';

/**
 * Only the fields a school needs to reach the teacher are checked: name,
 * phone, email and years of experience. Everything else is whatever the
 * teacher wrote, picked, or the CV parser filled in — accepted as given, so a
 * long certification name or a parsed `null` never blocks saving.
 */

/** Optional free text: null or a number from the parser becomes a string. */
const optionalText = z.preprocess(
  (value) => (value === null || value === undefined ? '' : String(value)),
  z.string().trim(),
);

/** Optional chip list: blanks dropped, duplicates removed, nothing rejected. */
const optionalList = z.preprocess(
  (value) => (Array.isArray(value) ? value : []),
  z
    .array(z.any())
    .transform((items) => [
      ...new Set(
        items
          .map((item) => (item === null || item === undefined ? '' : String(item).trim()))
          .filter(Boolean),
      ),
    ]),
);

const optionalRows = (schema) =>
  z.preprocess((value) => (Array.isArray(value) ? value : []), z.array(schema));

const educationSchema = z.object({
  degree: optionalText,
  specialization: optionalText,
  institution: optionalText,
  boardOrUniversity: optionalText,
  yearOfPassing: optionalText,
  percentageOrCgpa: optionalText,
});

const experienceSchema = z.object({
  designation: optionalText,
  organization: optionalText,
  subjectsTaught: optionalList,
  startDate: optionalText,
  endDate: optionalText,
  isCurrent: z.preprocess((value) => Boolean(value), z.boolean()),
  description: optionalText,
});

export const updateProfileSchema = z.object({
  // Required — these are how the school gets back to the teacher.
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91[-\s]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  totalExperienceYears: z.coerce.number().min(0).max(60).default(0),

  // Optional — accepted as written.
  location: optionalText,
  headline: optionalText,
  education: optionalRows(educationSchema),
  experience: optionalRows(experienceSchema),
  subjects: optionalList,
  skills: optionalList,
  certifications: optionalList,
  languages: optionalList,
  preferredDepartments: optionalList,
});
