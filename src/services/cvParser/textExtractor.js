import mammoth from 'mammoth';
import { createRequire } from 'node:module';

// pdf-parse is CommonJS and its index file runs a debug harness on import, so
// require the library entry point directly.
const require = createRequire(import.meta.url);

/**
 * Last-resort text recovery for PDFs that pdf-parse refuses to open.
 *
 * pdf-parse bundles an old pdf.js that rejects some structurally valid files
 * (notably with "bad XRef entry"). Rather than tell a teacher their CV is
 * unreadable, pull the text-showing operators out of the content streams
 * directly: `(text) Tj` and `[(a) -2 (b)] TJ`. Only uncompressed streams are
 * recoverable this way, which is exactly the case pdf.js tends to trip on.
 */
const extractPdfRaw = (buffer) => {
  const raw = buffer.toString('latin1');
  const pieces = [];

  // Walk each content stream and collect the strings drawn inside it.
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let streamMatch;

  while ((streamMatch = streamRe.exec(raw)) !== null) {
    const content = streamMatch[1];
    // A compressed stream is binary noise — skip rather than emit garbage.
    if (/^[\s]*[\x00-\x08\x0e-\x1f]/.test(content)) continue;

    const showRe = /\((?:\\.|[^\\()])*\)/g;
    let lineStart = 0;

    for (const line of content.split(/\r?\n/)) {
      if (!/\b(Tj|TJ|'|")\s*$/.test(line.trim()) && !/\bT\*/.test(line)) {
        lineStart += 1;
        continue;
      }
      const strings = line.match(showRe) ?? [];
      const text = strings
        .map((token) =>
          token
            .slice(1, -1)
            .replace(/\\([()\\])/g, '$1')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\t/g, ' '),
        )
        .join('');
      if (text.trim().length > 0) pieces.push(text);
    }
  }

  return pieces.join('\n');
};

const extractPdf = async (buffer) => {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');

  try {
    const result = await pdfParse(buffer);
    const text = result.text ?? '';
    if (text.trim().length > 0) return text;
  } catch (err) {
    console.warn(`[cv] pdf-parse failed (${err.message}); trying raw extraction`);
  }

  return extractPdfRaw(buffer);
};

const extractDocx = async (buffer) => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? '';
};

/**
 * Pulls raw text out of an uploaded CV. Never throws: an unreadable file
 * resolves to `{ text: '', ok: false }` so the caller can fall back to a manual
 * profile form rather than failing the upload.
 */
export const extractText = async (buffer, mimeType, originalName = '') => {
  const ext = originalName.toLowerCase().split('.').pop();

  try {
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return { text: await extractPdf(buffer), ok: true };
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      return { text: await extractDocx(buffer), ok: true };
    }

    if (mimeType === 'application/msword' || ext === 'doc') {
      // Legacy .doc is not a format mammoth officially supports; it succeeds on
      // some files and fails on others. A failure here is expected, not a bug.
      try {
        const text = await extractDocx(buffer);
        if (text.trim().length > 0) return { text, ok: true };
      } catch {
        // fall through to the failure result below
      }
      return {
        text: '',
        ok: false,
        reason: 'Legacy .doc files cannot always be read. Please fill your details manually.',
      };
    }

    return { text: '', ok: false, reason: `Unsupported file type: ${mimeType || ext}` };
  } catch (err) {
    console.error('[cv] text extraction failed:', err.message);
    return { text: '', ok: false, reason: 'Could not read the file contents.' };
  }
};
