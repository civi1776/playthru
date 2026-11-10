/*
 * SQL — add hole/tee data columns to courses table (run in Supabase):
 *
 * alter table courses add column if not exists hole_data           jsonb;
 * alter table courses add column if not exists course_rating       numeric;
 * alter table courses add column if not exists slope_rating        numeric;
 * alter table courses add column if not exists front_course_rating numeric;
 * alter table courses add column if not exists back_course_rating  numeric;
 * alter table courses add column if not exists front_slope_rating  numeric;
 * alter table courses add column if not exists back_slope_rating   numeric;
 */

/*
 * SQL — create upsert_course RPC (run in Supabase SQL editor):
 *
 * create or replace function upsert_course(course_data jsonb)
 * returns void language plpgsql security definer as $$
 * begin
 *   insert into courses (
 *     name, city, state, country, latitude, longitude,
 *     holes, par, hole_data,
 *     course_rating, slope_rating,
 *     front_course_rating, back_course_rating,
 *     front_slope_rating, back_slope_rating,
 *     source, external_id, last_fetched_at, raw_data
 *   ) values (
 *     course_data->>'name',
 *     course_data->>'city',
 *     course_data->>'state',
 *     course_data->>'country',
 *     (course_data->>'latitude')::numeric,
 *     (course_data->>'longitude')::numeric,
 *     (course_data->>'holes')::integer,
 *     (course_data->>'par')::integer,
 *     course_data->'hole_data',
 *     (course_data->>'course_rating')::numeric,
 *     (course_data->>'slope_rating')::numeric,
 *     (course_data->>'front_course_rating')::numeric,
 *     (course_data->>'back_course_rating')::numeric,
 *     (course_data->>'front_slope_rating')::numeric,
 *     (course_data->>'back_slope_rating')::numeric,
 *     course_data->>'source',
 *     course_data->>'external_id',
 *     (course_data->>'last_fetched_at')::timestamptz,
 *     course_data->'raw_data'
 *   )
 *   on conflict (source, external_id) do update set
 *     hole_data           = excluded.hole_data,
 *     course_rating       = excluded.course_rating,
 *     slope_rating        = excluded.slope_rating,
 *     front_course_rating = excluded.front_course_rating,
 *     back_course_rating  = excluded.back_course_rating,
 *     front_slope_rating  = excluded.front_slope_rating,
 *     back_slope_rating   = excluded.back_slope_rating,
 *     last_fetched_at     = excluded.last_fetched_at,
 *     raw_data            = excluded.raw_data,
 *     holes               = excluded.holes,
 *     par                 = excluded.par;
 * end;
 * $$;
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requestHasProjectKey } from '../_shared/callerKey.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COURSE_COLS =
  'id, name, city, state, country, holes, course_type, pop_score, total_rounds, avg_time, latitude, longitude, par, is_par3, source, hole_data, course_rating, slope_rating, front_course_rating, back_course_rating, front_slope_rating, back_slope_rating, last_fetched_at';

// GolfCourseAPI does not always send `tees.male` / `tees.female` as arrays:
// some courses come back with an object keyed by tee, or a bare tee, or null.
// Calling .find() on those threw and turned the whole search into a 500.
function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    // A single tee box has tee_name / holes on it; a keyed map does not.
    if ('tee_name' in v || 'holes' in v) return [v];
    return Object.values(v).filter((x) => x && typeof x === 'object');
  }
  return [];
}

// Name matches that start with the query first, then other name matches,
// then city matches; busier courses first inside each band.
function rank(courses: any[], query: string): any[] {
  const q = query.toLowerCase();
  const band = (c: any) => {
    const n = String(c.name ?? '').toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.includes(q)) return 1;
    return 2;
  };
  return [...courses].sort((a, b) =>
    band(a) - band(b) ||
    (b.total_rounds ?? 0) - (a.total_rounds ?? 0) ||
    String(a.name ?? '').localeCompare(String(b.name ?? '')));
}

async function searchLocal(supabase: any, query: string): Promise<any[]> {
  // Name matches and city matches are fetched apart so a city with dozens of
  // courses cannot crowd the course actually named out of the 20 row cap.
  const [byName, byCity] = await Promise.all([
    supabase.from('courses').select(COURSE_COLS).ilike('name', `%${query}%`)
      .order('total_rounds', { ascending: false, nullsFirst: false }).limit(20),
    supabase.from('courses').select(COURSE_COLS).ilike('city', `%${query}%`)
      .order('total_rounds', { ascending: false, nullsFirst: false }).limit(20),
  ]);
  if (byName.error) console.error('Local name search error:', byName.error);
  if (byCity.error) console.error('Local city search error:', byCity.error);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of [...(byName.data ?? []), ...(byCity.data ?? [])]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return rank(out, query).slice(0, 20);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Auth — the caller must present a project API key / session JWT (see
  // _shared/callerKey.ts). verify_jwt is off at the gateway for this function
  // so the website can call it; a bare "Bearer ey…" prefix used to be
  // accepted here, which was a prefix test rather than a check.
  if (!(await requestHasProjectKey(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  try {
    const url = new URL(req.url);
    // The query goes into ilike filters as a value (not into an `.or()` string),
    // so only the ilike wildcards and escapes are stripped. Dots and
    // apostrophes stay: "St. Andrews" and "O'Bannon" have to match.
    const query = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '')
      .replace(/[%_\\"`*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);

    if (query.length < 2) {
      return Response.json({ courses: [], source: 'local' }, { headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Search local courses table ────────────────────────────────────────
    const local = await searchLocal(supabase, query);

    // Short-circuit only when all local results are fully enriched and fresh (≤30 days).
    // Fall through to GolfCourseAPI if any course is missing hole_data or last_fetched_at.
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const allFresh = local.every(c =>
      c.hole_data != null &&
      c.last_fetched_at != null &&
      new Date(c.last_fetched_at).getTime() >= thirtyDaysAgo
    );
    if (local.length >= 3 && allFresh) {
      return Response.json({ courses: local, source: 'local' }, { headers: CORS });
    }

    // ── 2. Fall back to GolfCourseAPI ────────────────────────────────────────
    const apiKey = Deno.env.get('GOLFCOURSEAPI_KEY');
    if (!apiKey) {
      console.error('GOLFCOURSEAPI_KEY not set');
      return Response.json({ courses: local, source: 'local' }, { headers: CORS });
    }

    // Everything from here on is enrichment. If the outside API is slow, down,
    // or sends a shape we do not expect, the golfer still gets the local
    // matches instead of an error.
    try {
      const apiRes = await fetch(
        `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Key ${apiKey}` }, signal: AbortSignal.timeout(5000) },
      );

      if (!apiRes.ok) {
        console.error('GolfCourseAPI error:', apiRes.status, await apiRes.text());
        return Response.json({ courses: local, source: 'local' }, { headers: CORS });
      }

      const apiBody = await apiRes.json();
      const apiCourses: any[] = apiBody.courses ?? [];

      // ── 3. Map API shape → our schema ────────────────────────────────────────
      // API shape: { id, club_name, course_name, location: { city, state, country, latitude, longitude },
      //              tees: { male: [TeeBox], female: [TeeBox] } }
      // TeeBox: { tee_name, course_rating, slope_rating, bogey_rating, total_yards, par_total,
      //           number_of_holes, front_course_rating, front_slope_rating, back_course_rating,
      //           back_slope_rating, holes: [{ par, yardage, handicap }] }
      const mapOne = (c: any) => {
        const clubName   = c.club_name ?? '';
        const courseName = c.course_name ?? '';
        // Build a readable name: "Club Name — Course Name" unless they're the same or one is empty
        const name =
          !courseName || courseName === clubName
            ? clubName
            : `${clubName} — ${courseName}`;

        const loc = c.location ?? {};

        // ── Select the best representative tee from male tees ──────────────────
        // Prefer "White" tee (most common mid-handicap standard); fall back to
        // middle index when no white tee exists.
        // Courses with no male tees listed fall back to the female set so they
        // still get a par and hole data.
        const male = asArray(c.tees?.male);
        const tees: any[] = male.length > 0 ? male : asArray(c.tees?.female);
        const bestTee: any =
          tees.find((t: any) => String(t?.tee_name ?? '').toLowerCase().includes('white')) ??
          tees[Math.floor(tees.length / 2)] ??
          null;
        const teeHoles = asArray(bestTee?.holes);

        // Map per-hole data: [{ par, yardage, handicap }]
        const holeData: any[] | null =
          teeHoles.length > 0
            ? teeHoles.map((h: any) => ({
                par:      h?.par      ?? null,
                yardage:  h?.yardage  ?? null,
                handicap: h?.handicap ?? null,
              }))
            : null;

        const parseNum = (v: any) => {
          if (v == null || v === '') return null;
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };

        return {
          name:                name || 'Unknown Course',
          city:                loc.city      ?? null,
          state:               loc.state     ?? null,
          country:             loc.country   ?? null,
          latitude:            parseNum(loc.latitude),
          longitude:           parseNum(loc.longitude),
          holes:               bestTee?.number_of_holes ?? null,
          par:                 bestTee?.par_total        ?? null,
          hole_data:           holeData,
          course_rating:       parseNum(bestTee?.course_rating),
          slope_rating:        parseNum(bestTee?.slope_rating),
          front_course_rating: parseNum(bestTee?.front_course_rating),
          back_course_rating:  parseNum(bestTee?.back_course_rating),
          front_slope_rating:  parseNum(bestTee?.front_slope_rating),
          back_slope_rating:   parseNum(bestTee?.back_slope_rating),
          source:              'golfcourseapi',
          external_id:         String(c.id),
          last_fetched_at:     new Date().toISOString(),
          raw_data:            c,
        };
      };

      // One malformed course must not take the rest of the result set with it.
      const mapped: any[] = [];
      for (const c of apiCourses) {
        if (c?.id == null) continue;
        try { mapped.push(mapOne(c)); }
        catch (e) { console.error('Map error:', c?.id, String(e)); }
      }

      // ── 4. Upsert new courses via raw SQL RPC to guarantee ON CONFLICT DO UPDATE ─
      // The Supabase JS client .upsert() was silently failing on existing rows.
      // upsert_course() is a SECURITY DEFINER Postgres function that executes the
      // exact INSERT ... ON CONFLICT (source, external_id) DO UPDATE SET ... SQL.
      // Name conflicts (23505) on new rows are suppressed — they mean the course
      // already exists under a different source/external_id and should be skipped.
      // Rows are independent, so they go in parallel: a 20 course result used to
      // cost 20 round trips in series, which pushed the search past the app's
      // timeout.
      await Promise.allSettled(mapped.map(async (course) => {
        const { error: rowError } = await supabase.rpc('upsert_course', { course_data: course });
        if (rowError && rowError.code !== '23505') console.error('Upsert error:', course.external_id, JSON.stringify(rowError));
      }));

      // ── 5. Re-query local to get freshly enriched records ────────────────────
      const refreshed = await searchLocal(supabase, query);

      return Response.json({ courses: refreshed.length > 0 ? refreshed : local, source: 'merged' }, { headers: CORS });
    } catch (apiErr) {
      console.error('GolfCourseAPI stage failed, serving local:', String(apiErr));
      return Response.json({ courses: local, source: 'local' }, { headers: CORS });
    }
  } catch (err) {
    console.error('search-courses unhandled error:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS },
    );
  }
});
