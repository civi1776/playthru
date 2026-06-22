/*
 * google-places Edge Function
 *
 * Proxies Google Places photo lookups server-side so the API key never
 * reaches the client. Accepts courseName + city query params, calls
 * Google's findplacefromtext API to get a photo_reference, then resolves
 * that reference to a clean CDN image URL (lh3.googleusercontent.com)
 * by following the redirect — which contains no API key.
 *
 * Secret required (set via: supabase secrets set GOOGLE_PLACES_API_KEY=...):
 *   GOOGLE_PLACES_API_KEY
 *
 * Client usage:
 *   GET /functions/v1/google-places?courseName=Pebble+Beach&city=Pebble+Beach
 *   → { photoUrl: "https://lh3.googleusercontent.com/..." } | { photoUrl: null }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const apiKeyHeader = req.headers.get('apikey') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const hasValidKey = apiKeyHeader === ANON_KEY ||
                      authHeader === `Bearer ${ANON_KEY}` ||
                      authHeader.startsWith('Bearer ey');

  if (!hasValidKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return Response.json({ photoUrl: null }, { headers: CORS });
    }

    const url        = new URL(req.url);
    const courseName = (url.searchParams.get('courseName') ?? '').trim();
    const city       = (url.searchParams.get('city') ?? '').trim();

    if (!courseName) {
      return Response.json({ photoUrl: null }, { headers: CORS });
    }

    // Step 1 — find place and get photo_reference
    const query     = `${courseName} golf course${city ? ' ' + city : ''}`;
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(query)}` +
      `&inputtype=textquery` +
      `&fields=place_id,photos,name` +
      `&key=${apiKey}`,
    );
    const searchData = await searchRes.json();

    const ref = searchData.candidates?.[0]?.photos?.[0]?.photo_reference;
    if (!ref) {
      return Response.json({ photoUrl: null }, { headers: CORS });
    }

    // Step 2 — resolve photo_reference → CDN URL (no key in redirect target)
    const photoRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=200` +
      `&photo_reference=${ref}` +
      `&key=${apiKey}`,
      { redirect: 'manual' },
    );
    const photoUrl = photoRes.headers.get('location') ?? null;

    return Response.json({ photoUrl }, { headers: CORS });
  } catch (e) {
    return Response.json({ photoUrl: null }, { headers: CORS });
  }
});
