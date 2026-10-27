/**
 * Builds a minimal, valid single-page PDF containing a candidate's CV text.
 * Written by hand rather than with a PDF library so the seed has no extra
 * dependency — the output is real enough for pdf-parse to extract text from,
 * which is what the parsing flow needs to be exercisable straight after seeding.
 */
const escapePdfText = (text) =>
  text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const buildCvLines = (profile) => {
  const lines = [
    profile.fullName,
    `${profile.email} | ${profile.phone} | ${profile.location}`,
    '',
    'SUMMARY',
    profile.headline,
    `${profile.totalExperienceYears} years of teaching experience.`,
    '',
    'EDUCATION',
  ];

  for (const entry of profile.education) {
    lines.push(
      `${entry.degree} ${entry.specialization} - ${entry.institution}, ${entry.boardOrUniversity}, ${entry.yearOfPassing}, ${entry.percentageOrCgpa}%`,
    );
  }

  lines.push('', 'EXPERIENCE');
  for (const entry of profile.experience) {
    lines.push(
      `${entry.designation} at ${entry.organization} (${entry.startDate} - ${entry.isCurrent ? 'Present' : entry.endDate})`,
    );
    lines.push(entry.description);
  }

  lines.push('', 'SKILLS', profile.skills.join(', '));
  lines.push('', 'CERTIFICATIONS', profile.certifications.join(', '));
  lines.push('', 'LANGUAGES KNOWN', profile.languages.join(', '));

  return lines;
};

export const makeSampleCvPdf = (profile) => {
  const lines = buildCvLines(profile);

  // Wrap long lines so nothing runs off the page.
  const wrapped = [];
  for (const line of lines) {
    if (line.length <= 95) {
      wrapped.push(line);
      continue;
    }
    let remaining = line;
    while (remaining.length > 95) {
      const breakAt = remaining.lastIndexOf(' ', 95);
      const cut = breakAt > 40 ? breakAt : 95;
      wrapped.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    wrapped.push(remaining);
  }

  const textOps = wrapped
    .map((line, index) =>
      index === 0
        ? `(${escapePdfText(line)}) Tj`
        : `T* (${escapePdfText(line)}) Tj`,
    )
    .join('\n');

  const content = `BT\n/F1 10 Tf\n14 TL\n40 780 Td\n${textOps}\nET`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  // Assembled from Buffers rather than a JS string: xref offsets must be byte
  // positions, and measuring a string that contains escaped parentheses and
  // multi-byte characters does not reliably give those.
  const chunks = [];
  let position = 0;
  const push = (text) => {
    const buffer = Buffer.from(text, 'latin1');
    chunks.push(buffer);
    position += buffer.length;
  };

  push('%PDF-1.4\n');

  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(position);
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefOffset = position;
  // Each xref entry is exactly 20 bytes and ends with CRLF — pdf.js rejects the
  // single-space + LF variant with "bad XRef entry".
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n`);
  for (const offset of offsets) {
    push(`${String(offset).padStart(10, '0')} 00000 n\r\n`);
  }
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.concat(chunks);
};
