/**
 * Builds the readable half of a share URL: "PGT Physics (CBSE)" -> "pgt-physics-cbse".
 *
 * Diacritics are folded rather than dropped so "Pre-Primary Educaçāo" keeps its
 * letters instead of collapsing to an empty string.
 */
export const slugify = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

/**
 * Appends a short random suffix so two jobs with the same title never collide,
 * and so a slug cannot be guessed by typing a job title into the address bar.
 * Ambiguous characters (0/o, 1/l) are excluded — these get read aloud and
 * retyped off WhatsApp messages.
 */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export const randomSuffix = (length = 6) => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
};

/** "pgt-physics" + "k4m2xq" -> "pgt-physics-k4m2xq" */
export const buildSlug = (title) => {
  const base = slugify(title) || 'role';
  return `${base}-${randomSuffix()}`;
};
