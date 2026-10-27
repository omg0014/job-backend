import { z } from 'zod';

/**
 * Shape a parsed CV must conform to before the app will trust it. Applied to
 * LLM output (which is untrusted text) and to the regex parser alike, so both
 * strategies return the same object to the frontend.
 */
const stringArray = z.array(z.string().trim().min(1)).default([]);

export const educationEntrySchema = z.object({
  degree: z.string().trim().default(''),
  specialization: z.string().trim().default(''),
  institution: z.string().trim().default(''),
  boardOrUniversity: z.string().trim().default(''),
  yearOfPassing: z.string().trim().default(''),
  percentageOrCgpa: z.string().trim().default(''),
});

export const experienceEntrySchema = z.object({
  designation: z.string().trim().default(''),
  organization: z.string().trim().default(''),
  subjectsTaught: stringArray,
  startDate: z.string().trim().default(''),
  endDate: z.string().trim().default(''),
  isCurrent: z.boolean().default(false),
  description: z.string().trim().default(''),
});

export const parsedProfileSchema = z.object({
  fullName: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  email: z.string().trim().default(''),
  location: z.string().trim().default(''),
  headline: z.string().trim().default(''),
  totalExperienceYears: z.coerce.number().min(0).max(60).default(0),
  education: z.array(educationEntrySchema).default([]),
  experience: z.array(experienceEntrySchema).default([]),
  subjects: stringArray,
  skills: stringArray,
  certifications: stringArray,
  languages: stringArray,
  preferredDepartments: stringArray,
});

export const emptyParsedProfile = () => parsedProfileSchema.parse({});
