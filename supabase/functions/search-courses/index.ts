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
      .select('id, name, city, state, country, holes, course_type, pop_score, total_rounds, avg_time, latitude, longitude, par, is_par3, source')
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(20);

    if (localError) {
      console.error('Local search error:', localError);
    }

    const local = localResults ?? [];

    if (local.length >= 3) {
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
    // API shape: { id, club_name, course_name, location: { city, state, country, latitude, longitude }, tees }
    // Our name column holds the full course name. Use club_name if course_name is absent or identical.
    const mapped = apiCourses.map((c) => {
      const clubName   = c.club_name ?? '';
      const courseName = c.course_name ?? '';
      // Build a readable name: "Club Name — Course Name" unless they're the same or one is empty
      const name =
        !courseName || courseName === clubName
          ? clubName
          : `${clubName} — ${courseName}`;

      const loc = c.location ?? {};

      return {
        name:            name || 'Unknown Course',
        city:            loc.city ?? null,
        state:           loc.state ?? null,
        country:         loc.country ?? null,
        latitude:        loc.latitude  != null ? parseFloat(loc.latitude)  : null,
        longitude:       loc.longitude != null ? parseFloat(loc.longitude) : null,
        source:          'golfcourseapi',
        external_id:     String(c.id),
        last_fetched_at: new Date().toISOString(),
        raw_data:        c,
      };
    });

    // ── 4. Upsert new courses (conflict on source + external_id) ─────────────
    let upserted: any[] = [];
    if (mapped.length > 0) {
      const { data: upsertData, error: upsertError } = await supabase
        .from('courses')
        .upsert(mapped, {
          onConflict: 'source,external_id',
          ignoreDuplicates: false,
        })
        .select('id, name, city, state, country, holes, course_type, pop_score, total_rounds, avg_time, latitude, longitude, par, is_par3, source');

      if (upsertError) {
        console.error('Upsert error:', upsertError);
      } else {
        upserted = upsertData ?? [];
      }
    }

    // ── 5. Merge local + upserted, deduplicate by id ─────────────────────────
    const seen = new Set<string>();
    const merged = [...local, ...upserted].filter((c) => {
      const key = String(c.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return Response.json({ courses: merged, source: 'merged' }, { headers: CORS });
  } catch (err) {
    console.error('search-courses unhandled error:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS },
    );
  }
});
