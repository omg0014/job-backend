import { SUBJECTS, QUALIFICATIONS, SKILLS, LANGUAGES } from '../../utils/taxonomy.js';
import { parsedProfileSchema } from './parsedProfileSchema.js';

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+91[-\s]?)?[6-9]\d{9}/;
const YEAR_RE = /(19|20)\d{2}/g;

// Section headers as they appear in Indian teaching CVs, mapped to our keys.
const SECTION_PATTERNS = [
  { key: 'education', re: /^\s*(education|academic|qualification)/i },
  { key: 'experience', re: /^\s*(experience|employment|work history|professional)/i },
  { key: 'skills', re: /^\s*(skills?|competenc|strengths)/i },
  { key: 'certifications', re: /^\s*(certification|certificate|licen[cs]e|training)/i },
  { key: 'languages', re: /^\s*(languages?\s*known|languages)/i },
  { key: 'summary', re: /^\s*(summary|objective|profile|about)/i },
  { key: 'personal', re: /^\s*(personal|declaration|reference|hobb)/i },
];

const INDIAN_CITIES = [
  'Mumbai', 'Delhi', 'New Delhi', 'Bengaluru', 'Bangalore', 'Hyderabad', 'Chennai',
  'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore',
  'Bhopal', 'Coimbatore', 'Kochi', 'Chandigarh', 'Noida', 'Gurugram', 'Gurgaon',
  'Thane', 'Surat', 'Vadodara', 'Patna', 'Ludhiana', 'Agra', 'Nashik', 'Mysuru',
  'Madurai', 'Visakhapatnam', 'Varanasi', 'Dehradun', 'Guwahati', 'Ranchi',
];

const clean = (line) => line.replace(/\s+/g, ' ').trim();

/**
 * Splits the CV body into named sections by walking lines and switching the
 * active bucket whenever a line looks like a section header.
 */
const splitSections = (lines) => {
  const sections = { header: [] };
  let current = 'header';

  for (const rawLine of lines) {
    const line = clean(rawLine);
    if (!line) continue;

    // A header line is short and matches one of the known section names.
    const isShort = line.length <= 48;
    const match = isShort ? SECTION_PATTERNS.find((p) => p.re.test(line)) : null;

    if (match) {
      current = match.key;
      sections[current] = sections[current] ?? [];
      continue;
    }

    sections[current] = sections[current] ?? [];
    sections[current].push(line);
  }

  return sections;
};

/** Matches a seeded vocabulary list against the whole document. */
const matchVocabulary = (text, vocabulary) => {
  const haystack = text.toLowerCase();
  return vocabulary.filter((term) => {
    const needle = term.toLowerCase();
    // Short/abbreviated terms (B.Ed, NET) need a boundary check so "NET" does
    // not match inside "internet".
    if (needle.length <= 5) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text);
    }
    return haystack.includes(needle);
  });
};

/**
 * The name is rarely labelled. Heuristic: the first header line that is short,
 * mostly alphabetic, and is not contact information.
 */
const guessName = (headerLines) => {
  for (const line of headerLines.slice(0, 8)) {
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (/curriculum vitae|resume|bio[- ]?data/i.test(line)) continue;
    if (line.length > 45 || line.length < 3) continue;

    const words = line.split(' ').filter(Boolean);
    if (words.length < 2 || words.length > 5) continue;
    if (!/^[A-Za-z.\s']+$/.test(line)) continue;

    return line.replace(/\s+/g, ' ').trim();
  }
  return '';
};

const guessLocation = (text) => {
  const found = INDIAN_CITIES.find((city) =>
    new RegExp(`(^|[^a-z])${city}([^a-z]|$)`, 'i').test(text),
  );
  return found ?? '';
};

/**
 * Total experience: an explicit "N years of experience" statement wins;
 * otherwise the span between the earliest and latest year in the experience
 * section, capped to something believable.
 */
const guessExperienceYears = (text, experienceLines) => {
  const explicit = text.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)[\s\w]{0,20}experience/i);
  if (explicit) {
    const years = Number.parseFloat(explicit[1]);
    if (years >= 0 && years <= 60) return years;
  }

  const years = (experienceLines.join(' ').match(YEAR_RE) ?? [])
    .map(Number)
    .filter((y) => y >= 1960 && y <= new Date().getFullYear());

  if (years.length >= 2) {
    const span = Math.max(...years) - Math.min(...years);
    if (span > 0 && span <= 50) return span;
  }

  return 0;
};

/**
 * Education entries. Each line that names a known qualification becomes a row;
 * the institution and year are read out of the same line where present.
 */
const parseEducation = (educationLines) => {
  const entries = [];

  for (const line of educationLines) {
    const degrees = matchVocabulary(line, QUALIFICATIONS);
    if (degrees.length === 0) continue;

    const yearMatch = line.match(YEAR_RE);
    const institutionMatch = line.match(
      /(?:from|at|,)\s*([A-Z][A-Za-z.&'\s]{4,60}(?:School|College|University|Institute|Vidyalaya|Academy))/,
    );
    const gradeMatch = line.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:CGPA|GPA)|(\d{1,3}(?:\.\d{1,2})?)\s*%/i);

    entries.push({
      degree: degrees[0],
      specialization: '',
      institution: institutionMatch?.[1]?.trim() ?? '',
      boardOrUniversity: '',
      yearOfPassing: yearMatch ? yearMatch[yearMatch.length - 1] : '',
      percentageOrCgpa: gradeMatch ? (gradeMatch[1] ?? gradeMatch[2] ?? '') : '',
    });

    if (entries.length >= 6) break;
  }

  return entries;
};

const DESIGNATION_RE =
  /(PGT|TGT|PRT|NTT|Principal|Vice Principal|Head of Department|HOD|Coordinator|Teacher|Lecturer|Professor|Instructor|Tutor|Counsellor|Librarian|Administrator)/i;

/**
 * Experience entries. Lines naming a teaching designation start a new row;
 * following lines until the next designation become its description.
 */
const parseExperience = (experienceLines) => {
  const entries = [];
  let current = null;

  const push = () => {
    if (current) entries.push(current);
    current = null;
  };

  for (const line of experienceLines) {
    const designationMatch = line.match(DESIGNATION_RE);

    if (designationMatch) {
      push();

      const years = line.match(YEAR_RE) ?? [];
      const organizationMatch = line.match(
        /(?:at|,|-|–|@)\s*([A-Z][A-Za-z.&'\s]{3,60}(?:School|College|Academy|Vidyalaya|Institute|University))/,
      );

      current = {
        designation: designationMatch[0],
        organization: organizationMatch?.[1]?.trim() ?? '',
        subjectsTaught: matchVocabulary(line, SUBJECTS),
        startDate: years[0] ?? '',
        endDate: /present|current|till date|todate/i.test(line) ? '' : (years[1] ?? ''),
        isCurrent: /present|current|till date|todate/i.test(line),
        description: '',
      };
      continue;
    }

    if (current) {
      current.description = clean(`${current.description} ${line}`).slice(0, 600);
      const subjects = matchVocabulary(line, SUBJECTS);
      current.subjectsTaught = [...new Set([...current.subjectsTaught, ...subjects])];
    }

    if (entries.length >= 8) break;
  }

  push();
  return entries.slice(0, 8);
};

/**
 * Regex/heuristic CV parser. Always returns a valid parsed-profile object —
 * empty fields rather than an error — because parsing is a suggestion the
 * teacher reviews, not a source of truth.
 */
export const parseWithRegex = (rawText) => {
  const text = (rawText ?? '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const sections = splitSections(lines);

  const educationLines = sections.education ?? [];
  const experienceLines = sections.experience ?? [];
  const skillsText = (sections.skills ?? []).join(' ');
  const certificationsText = [...(sections.certifications ?? []), ...educationLines].join(' ');
  const languagesText = (sections.languages ?? []).join(' ') || text;

  const draft = {
    fullName: guessName(sections.header ?? []),
    email: text.match(EMAIL_RE)?.[0] ?? '',
    phone: text.match(PHONE_RE)?.[0] ?? '',
    location: guessLocation(text),
    headline: clean((sections.summary ?? [])[0] ?? '').slice(0, 140),
    totalExperienceYears: guessExperienceYears(text, experienceLines),
    education: parseEducation(educationLines),
    experience: parseExperience(experienceLines),
    subjects: matchVocabulary(text, SUBJECTS),
    skills: [...new Set([
      ...matchVocabulary(skillsText || text, SKILLS),
    ])],
    certifications: matchVocabulary(certificationsText, QUALIFICATIONS),
    languages: matchVocabulary(languagesText, LANGUAGES),
    preferredDepartments: [],
  };

  return parsedProfileSchema.parse(draft);
};
