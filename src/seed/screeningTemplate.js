import { ScreeningTemplate } from '../models/ScreeningTemplate.js';

/**
 * The default question set. Seeded rather than hardcoded so the principal can
 * reword these without a deploy.
 *
 * Five questions, roughly 8 minutes of recording. Adding more is a false
 * economy: completion rates fall sharply past ten minutes and the candidates
 * lost are not the weak ones, just the busy ones.
 */
export const DEFAULT_QUESTIONS = [
  {
    order: 1,
    text: 'Please introduce yourself — your qualifications, and how your teaching career has gone so far.',
    prepSeconds: 30,
    maxAnswerSeconds: 90,
  },
  {
    order: 2,
    text: 'Tell us about your current or most recent school. Which classes and subjects do you handle, and what does a normal working day look like for you?',
    prepSeconds: 30,
    maxAnswerSeconds: 90,
  },
  {
    order: 3,
    text: 'Why are you looking for a change, and what interests you about teaching at Yugam?',
    prepSeconds: 30,
    maxAnswerSeconds: 60,
  },
  {
    order: 4,
    text: 'Pick one topic in your subject that students usually find difficult. How do you teach it to a class that is struggling?',
    prepSeconds: 45,
    maxAnswerSeconds: 120,
  },
  {
    order: 5,
    text: 'Tell us about a time a student was disengaged or disruptive in your class. What did you do, and what happened?',
    prepSeconds: 45,
    maxAnswerSeconds: 120,
  },
];

/**
 * The factual filters. These are what make the round usable at volume — a
 * principal can shortlist or reject on these in ten seconds without opening a
 * single video.
 */
export const DEFAULT_TEXT_FIELDS = [
  { key: 'currentSchool', label: 'Current school and designation', type: 'text', required: true },
  {
    key: 'boards',
    label: 'Boards taught',
    type: 'multiselect',
    options: ['CBSE', 'ICSE', 'State', 'IB', 'IGCSE'],
    required: true,
  },
  {
    key: 'gradeLevels',
    label: 'Grade levels you are comfortable teaching',
    type: 'multiselect',
    options: ['Pre-primary', 'Primary (I–V)', 'Middle (VI–VIII)', 'Secondary (IX–X)', 'Senior (XI–XII)'],
    required: true,
  },
  { key: 'otherSubjects', label: 'Other subjects you could also handle', type: 'text' },
  { key: 'currentSalary', label: 'Current monthly salary (₹)', type: 'number' },
  { key: 'expectedSalary', label: 'Expected monthly salary (₹)', type: 'number', required: true },
  { key: 'noticePeriod', label: 'Notice period', type: 'text', required: true },
  { key: 'earliestJoining', label: 'Earliest joining date', type: 'date' },
  {
    key: 'relocation',
    label: 'Do you currently live in Kanpur, or would you relocate?',
    type: 'select',
    options: ['I live in Kanpur', 'I would relocate', 'I need to discuss this'],
    required: true,
  },
  { key: 'relocationNote', label: 'Anything to add about location', type: 'text' },
];

/** Idempotent: creates the active template once, leaves later edits alone. */
export const seedScreeningTemplate = async () => {
  const existing = await ScreeningTemplate.findOne({ isActive: true });
  if (existing) return existing;

  return ScreeningTemplate.create({
    name: 'Default screening',
    isActive: true,
    questions: DEFAULT_QUESTIONS,
    textFields: DEFAULT_TEXT_FIELDS,
  });
};
