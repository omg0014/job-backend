import { env } from '../../config/env.js';
import { parsedProfileSchema } from './parsedProfileSchema.js';

const SYSTEM_PROMPT = `You extract structured data from teaching CVs for an Indian school.
Return ONLY a JSON object. No prose, no markdown fences, no explanation.

Schema:
{
  "fullName": string,
  "phone": string,
  "email": string,
  "location": string,
  "headline": string,
  "totalExperienceYears": number,
  "education": [{ "degree": string, "specialization": string, "institution": string, "boardOrUniversity": string, "yearOfPassing": string, "percentageOrCgpa": string }],
  "experience": [{ "designation": string, "organization": string, "subjectsTaught": string[], "startDate": string, "endDate": string, "isCurrent": boolean, "description": string }],
  "subjects": string[],
  "skills": string[],
  "certifications": string[],
  "languages": string[],
  "preferredDepartments": string[]
}

Rules:
- Use exactly these key names. Do not rename, add or omit keys.
- Use "" for text you cannot find and [] for lists you cannot find. Never invent data.
- Split a qualification into its parts: "M.Sc. Chemistry" becomes
  degree "M.Sc." and specialization "Chemistry".
- "institution" is the college; "boardOrUniversity" is the awarding body.
  If a line names both, put each in its own field.
- "subjects" are the school subjects this person teaches. Collect them from
  their job titles and duties — "PGT Chemistry" means they teach Chemistry.
  A language listed only under "Languages known" is not a taught subject.
- "certifications" are teaching qualifications (B.Ed, M.Ed, CTET, TET, NET...).
- "totalExperienceYears" is a number of years, 0 if unknown.
- Every value is a string except totalExperienceYears (number) and
  isCurrent (boolean).`;

/** Models sometimes wrap JSON in ```json fences despite instructions. */
const stripFences = (text) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

/** Salvages the outermost JSON object when the model adds surrounding prose. */
const extractJsonObject = (text) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
};

/**
 * Ollama — a model running locally, with no API key and no per-CV cost.
 *
 * `format: 'json'` constrains generation to valid JSON, and temperature 0
 * keeps extraction deterministic: the same CV parses the same way every time.
 */
const callOllama = async (rawText, signal) => {
  const response = await fetch(`${env.ollamaUrl}/api/chat`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.llmModel,
      stream: false,
      format: 'json',
      options: { temperature: 0, num_predict: 1200 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract the profile from this CV text:\n\n${rawText.slice(0, 12000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn(`[cv:llm] Ollama returned ${response.status}; falling back to regex parser`);
    return null;
  }

  const payload = await response.json();
  return payload?.message?.content ?? null;
};

/** Anthropic's hosted API — used when an API key is configured. */
const callAnthropic = async (rawText, signal) => {
  const response = await fetch(env.llmApiUrl, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.llmApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.llmModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract the profile from this CV text:\n\n${rawText.slice(0, 40000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn(`[cv:llm] API returned ${response.status}; falling back to regex parser`);
    return null;
  }

  const payload = await response.json();
  return payload?.content?.[0]?.text ?? null;
};

/**
 * LLM extraction strategy. Returns null on any failure — provider unreachable,
 * network error, malformed JSON, or a response that does not satisfy the
 * schema — so the caller can fall through to the regex parser.
 *
 * Provider is chosen by config: `ollama` runs a local model for free, `anthropic`
 * uses the hosted API. Either way the output is untrusted until Zod validates it.
 */
export const parseWithLlm = async (rawText, { signal } = {}) => {
  if (env.llmProvider === 'none') return null;

  try {
    const content =
      env.llmProvider === 'ollama'
        ? await callOllama(rawText, signal)
        : await callAnthropic(rawText, signal);

    if (typeof content !== 'string') return null;

    const candidate = stripFences(content);
    let json;
    try {
      json = JSON.parse(candidate);
    } catch {
      const salvaged = extractJsonObject(candidate);
      if (!salvaged) return null;
      try {
        json = JSON.parse(salvaged);
      } catch {
        return null;
      }
    }

    // The model's output is untrusted: it only counts if it satisfies the schema.
    const result = parsedProfileSchema.safeParse(json);
    if (!result.success) {
      console.warn('[cv:llm] response failed schema validation; falling back to regex parser');
      return null;
    }

    return result.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[cv:llm] timed out; falling back to regex parser');
    } else {
      console.warn('[cv:llm] request failed:', err.message);
    }
    return null;
  }
};
