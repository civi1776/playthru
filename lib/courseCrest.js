// ─── lib/courseCrest.js — a course's monogram and colour ────────────────────
// Courses need an identity that reads at 32px in a list. An aerial photo does
// not: a 1.1 km crop centred on the clubhouse is grey parking lot at that size,
// and it only exists when we happen to hold coordinates. A crest always works,
// costs no network, and scales from a list row up to a page header.
//
// Courses are square with a gold hairline; players are circles. The shapes
// keep the two apart at a glance.

const DROP_WORDS = new Set([
  'the', 'at', 'of', 'and', 'a', 'an',
  'golf', 'club', 'course', 'courses', 'resort', 'links', 'cc', 'gc', 'gcc',
  'country', 'spa', 'and', 'the',
]);

// Crest backgrounds: deep, desaturated, all readable under gold text.
const CREST_BG = [
  '#16301A', '#14262F', '#231A33', '#33231A', '#1A3330',
  '#301A24', '#232430', '#2B2C19', '#1C2A1E', '#2A1F2E',
];

// "Hunters Run Country Club - East Course" → "Hunters Run"
function coreName(name) {
  return String(name ?? '')
    .split(/\s+[-–—]\s+/)[0]          // drop the nine / course designation
    .replace(/\([^)]*\)/g, ' ')        // drop parentheticals
    .trim();
}

// Two or three characters that stand for the course.
export function crestInitials(name) {
  const core = coreName(name);
  if (!core) return null;

  const raw = core.split(/[\s/]+/).filter(Boolean);

  // An existing acronym wins outright: "PGA National" → PGA.
  const acronym = raw.find(w => /^[A-Z]{2,4}$/.test(w) && !DROP_WORDS.has(w.toLowerCase()));
  if (acronym) return acronym;

  const words = raw
    .map(w => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter(w => w && !DROP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));

  const pool = words.length ? words : raw.filter(Boolean);
  if (!pool.length) return null;

  if (pool.length === 1) return pool[0].slice(0, 2).toUpperCase();
  return (pool[0][0] + pool[1][0]).toUpperCase();
}

export function crestColor(name) {
  const key = coreName(name) || String(name ?? '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h << 5) - h + key.charCodeAt(i);
  return CREST_BG[Math.abs(h) % CREST_BG.length];
}

export default { crestInitials, crestColor };
