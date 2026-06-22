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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Lightweight auth — accept either anon key or any Bearer JWT
  // This blocks random web requests without crashing on JWT verification
  const authHeader = req.headers.get('Authorization') ?? '';
  const apiKeyHeader = req.headers.get('apikey') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const hasValidKey = apiKeyHeader === ANON_KEY ||
                      authHeader === `Bearer ${ANON_KEY}` ||
                      authHeader.startsWith('Bearer ey'); // valid JWT format

  if (!hasValidKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim();

    if (query.length < 2) {
      return Response.json({ courses: [], source: 'local' }, { headers: CORS });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 1. Search local courses table ────────────────────────────────────────
    const { data: localResults, error: localError } = await supabase
      .from('courses')
      .select('id, name, city, state, country, holes, course_type, pop_score, total_rounds, avg_time, latitude, longitude, par, is_par3, source, hole_data, course_rating, slope_rating, front_course_rating, back_course_rating, front_slope_rating, back_slope_rating, last_fetched_at')
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20);

    if (localError) {
      console.error('Local search error:', localError);
    }

    const local = localResults ?? [];

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

    const apiRes = await fetch(
      `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Key ${apiKey}` } },
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
    const mapped = apiCourses.map((c) => {
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
      const maleTees: any[] = c.tees?.male ?? [];
      const bestTee: any =
        maleTees.find((t: any) => t.tee_name?.toLowerCase().includes('white')) ??
        maleTees[Math.floor(maleTees.length / 2)] ??
        null;

      // Map per-hole data: [{ par, yardage, handicap }]
      const holeData: any[] | null =
        bestTee?.holes?.length > 0
          ? bestTee.holes.map((h: any) => ({
              par:      h.par      ?? null,
              yardage:  h.yardage  ?? null,
              handicap: h.handicap ?? null,
            }))
          : null;

      const parseNum = (v: any) => (v != null ? parseFloat(v) : null);

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
    });

    // ── 4. Upsert new courses via raw SQL RPC to guarantee ON CONFLICT DO UPDATE ─
    // The Supabase JS client .upsert() was silently failing on existing rows.
    // upsert_course() is a SECURITY DEFINER Postgres function that executes the
    // exact INSERT ... ON CONFLICT (source, external_id) DO UPDATE SET ... SQL.
    // Name conflicts (23505) on new rows are suppressed — they mean the course
    // already exists under a different source/external_id and should be skipped.
    for (const course of mapped) {
      const { error: rowError } = await supabase.rpc('upsert_course', { course_data: course });
      if (rowError && rowError.code !== '23505') console.error('Upsert error:', course.external_id, JSON.stringify(rowError));
    }

    // ── 5. Re-query local to get freshly enriched records ────────────────────
    const { data: refreshed } = await supabase
      .from('courses')
      .select('id, name, city, state, country, holes, course_type, pop_score, total_rounds, avg_time, latitude, longitude, par, is_par3, source, hole_data, course_rating, slope_rating, front_course_rating, back_course_rating, front_slope_rating, back_slope_rating')
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20);

    return Response.json({ courses: refreshed ?? [], source: 'merged' }, { headers: CORS });
  } catch (err) {
    console.error('search-courses unhandled error:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS },
    );
  }
});
