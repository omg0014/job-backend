/**
 * Pushes the question set in src/seed/screeningTemplate.js into the database,
 * overwriting the live template.
 *
 * The normal seed deliberately will not do this — it only creates a template
 * when none exists, so a restart never discards an edit made through the UI.
 * This script is the explicit "I edited the file, apply it" action.
 *
 *   node scripts-reseed-template.mjs
 */
import mongoose from 'mongoose';
import { env } from './src/config/env.js';
import { ScreeningTemplate } from './src/models/ScreeningTemplate.js';
import { Screening } from './src/models/Screening.js';
import { DEFAULT_QUESTIONS, DEFAULT_TEXT_FIELDS } from './src/seed/screeningTemplate.js';

await mongoose.connect(env.mongoUri);

const inFlight = await Screening.countDocuments({ status: { $in: ['not_started', 'in_progress'] } });

const template = await ScreeningTemplate.findOneAndUpdate(
  { isActive: true },
  { questions: DEFAULT_QUESTIONS, textFields: DEFAULT_TEXT_FIELDS },
  { new: true, upsert: true, setDefaultsOnInsert: true },
);

console.log(`Updated: ${template.questions.length} questions, ${template.textFields.length} fields`);
template.questions.forEach((q) => console.log(`  ${q.order}. ${q.text.slice(0, 62)}…`));

if (inFlight > 0) {
  console.log(
    `\nNote: ${inFlight} candidate(s) are mid-round. They keep the questions they were given — ` +
      'each screening holds its own snapshot.',
  );
}

await mongoose.disconnect();
