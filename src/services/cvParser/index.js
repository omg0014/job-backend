import { env } from '../../config/env.js';
import { extractText } from './textExtractor.js';
import { parseWithLlm } from './llmParser.js';
import { parseWithRegex } from './regexParser.js';
import { emptyParsedProfile } from './parsedProfileSchema.js';

/**
 * Parses an uploaded CV into a structured profile draft.
 *
 * Two strategies sit behind this one interface: LLM extraction when LLM_API_KEY
 * is configured, and a regex/heuristic parser otherwise or whenever the LLM
 * path fails. The whole operation is wrapped in a timeout and a try/catch —
 * upload must return promptly and must never fail because parsing did.
 *
 * @returns {{ profile, rawText, parseStatus, strategy, reason }}
 *   parseStatus: 'parsed' when structure was extracted, 'failed' when the file
 *   could not be read at all (the user then fills the form manually).
 */
export const parseCv = async (buffer, mimeType, originalName) => {
  const extraction = await extractText(buffer, mimeType, originalName);

  if (!extraction.ok || extraction.text.trim().length < 20) {
    return {
      profile: emptyParsedProfile(),
      rawText: extraction.text ?? '',
      parseStatus: 'failed',
      strategy: 'none',
      reason:
        extraction.reason ??
        'We could not read enough text from this file. Please fill in your details manually.',
    };
  }

  const rawText = extraction.text;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.cvParseTimeoutMs);

  try {
    // 'none' means no provider is reachable — skip straight to regex.
    if (env.llmProvider !== 'none') {
      const llmProfile = await parseWithLlm(rawText, { signal: controller.signal });
      if (llmProfile) {
        return {
          profile: llmProfile,
          rawText,
          parseStatus: 'parsed',
          strategy: 'llm',
          reason: '',
        };
      }
    }

    return {
      profile: parseWithRegex(rawText),
      rawText,
      parseStatus: 'parsed',
      strategy: 'regex',
      reason: '',
    };
  } catch (err) {
    console.error('[cv] parse failed:', err.message);
    // Text was readable, so a manual form pre-filled with nothing still beats
    // an error — return an empty draft rather than failing the upload.
    return {
      profile: emptyParsedProfile(),
      rawText,
      parseStatus: 'failed',
      strategy: 'none',
      reason: 'Automatic extraction failed. Please fill in your details manually.',
    };
  } finally {
    clearTimeout(timeout);
  }
};

export { emptyParsedProfile };
