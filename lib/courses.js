import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

const SEARCH_URL = `${supabaseUrl}/functions/v1/search-courses`;
const TIMEOUT_MS = 8000;

const COURSE_COLS =
  'id, name, city, state, country, holes, course_type, pop_score, total_rounds, avg_time, latitude, longitude, par, is_par3, source, hole_data, course_rating, slope_rating, front_course_rating, back_course_rating, front_slope_rating, back_slope_rating';

// Same cleaning the edge function does: the ilike wildcards go, everything a
// course name can legitimately contain stays.
function clean(query) {
  return String(query ?? '').replace(/[%_\\"`*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function rank(courses, q) {
  const needle = q.toLowerCase();
  const band = (c) => {
    const n = String(c.name ?? '').toLowerCase();
    if (n.startsWith(needle)) return 0;
    if (n.includes(needle)) return 1;
    return 2;
  };
  return [...courses].sort((a, b) =>
    band(a) - band(b) ||
    (b.total_rounds ?? 0) - (a.total_rounds ?? 0) ||
    String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

/**
 * Straight read of the courses table. Fast, and it does not depend on the
 * edge function or the outside course API being healthy, so a search always
 * has something to show for a course we already know.
 */
export async function searchCoursesLocal(query) {
  const q = clean(query);
  if (q.length < 2) return [];
  try {
    const [byName, byCity] = await Promise.all([
      supabase.from('courses').select(COURSE_COLS).ilike('name', `%${q}%`)
        .order('total_rounds', { ascending: false, nullsFirst: false }).limit(20),
      supabase.from('courses').select(COURSE_COLS).ilike('city', `%${q}%`)
        .order('total_rounds', { ascending: false, nullsFirst: false }).limit(20),
    ]);
    const seen = new Set();
    const out = [];
    for (const c of [...(byName.data ?? []), ...(byCity.data ?? [])]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return rank(out, q).slice(0, 20);
  } catch (e) {
    console.warn('[searchCoursesLocal] failed:', e?.message ?? e);
    return [];
  }
}

async function searchCoursesRemote(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${SEARCH_URL}?q=${encodeURIComponent(query.trim())}`,
      {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
      },
    );
    if (!res.ok) {
      console.warn(`[searchCourses] function returned HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return Array.isArray(json.courses) ? json.courses : null;
  } catch (e) {
    console.warn('[searchCourses] function failed:', e?.name === 'AbortError' ? 'timed out' : (e?.message ?? e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Course search. Two sources run side by side:
 *   - the courses table, which answers in a fraction of a second;
 *   - the search-courses function, which also pulls new courses in from the
 *     outside course API and can take several seconds, or fail.
 *
 * `onPartial(results)` fires as soon as the table answers so the list is on
 * screen while the slower lookup runs. The promise resolves with the best
 * final list: the function's when it worked, the table's when it did not.
 * It never rejects and never returns a dead empty list because of a server
 * error, which is what made course search look broken.
 */
export async function searchCourses(query, { onPartial } = {}) {
  if (!query || query.trim().length < 2) return [];

  const localP = searchCoursesLocal(query);
  const remoteP = searchCoursesRemote(query);

  let remoteDone = false;
  remoteP.then(() => { remoteDone = true; });
  localP.then((rows) => {
    if (!remoteDone && rows.length > 0 && typeof onPartial === 'function') onPartial(rows);
  });

  const [local, remote] = await Promise.all([localP, remoteP]);
  if (remote && remote.length > 0) return remote;
  return local;
}

export function courseKey(c) {
  return String(c?.id ?? `${c?.name ?? ''}|${c?.city ?? ''}|${c?.state ?? ''}`);
}

export function courseLocation(c) {
  return [c?.city, c?.state].filter(Boolean).join(', ');
}

// ─── Par worth showing ───────────────────────────────────────────────────────
// `courses.par` defaults to 72, and every hand-entered row still carries that
// default (including par-3 courses). Only show a par the data backs up: the
// sum of the hole pars when we have them, otherwise the stored number as long
// as it is not the untouched default on a row with no hole data.
export function coursePar(course) {
  if (!course) return null;
  const holes = Array.isArray(course.hole_data) ? course.hole_data : [];
  const pars = holes.map(h => Number(h?.par)).filter(n => Number.isFinite(n) && n > 0);
  if (pars.length >= 9 && pars.length === holes.length) return pars.reduce((a, b) => a + b, 0);
  const par = Number(course.par);
  if (!Number.isFinite(par) || par <= 0) return null;
  if (par === 72 && (course.source == null || course.source === 'manual')) return null;
  return par;
}
