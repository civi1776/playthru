// ─── google-places — course photo lookup proxy ──────────────────────────────
// Keeps GOOGLE_PLACES_API_KEY server-side. Returns { photoUrl } only.
//
// Auth: the gateway verifies the JWT (verify_jwt = true in config.toml);
// requestHasProjectKey() additionally checks the token is for this project.
// A bare "Bearer ey…" prefix used to be accepted and is no longer.
import { requestHasProjectKey } from '../_shared/callerKey.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_NAME = 120;
const MAX_CITY = 80;

const noPhoto = () => Response.json({ photoUrl: null }, { headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!(await requestHasProjectKey(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return noPhoto();

    const url        = new URL(req.url);
    const courseName = (url.searchParams.get('courseName') ?? '').trim().slice(0, MAX_NAME);
    const city       = (url.searchParams.get('city') ?? '').trim().slice(0, MAX_CITY);
    if (!courseName) return noPhoto();

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
    if (!ref || typeof ref !== 'string') return noPhoto();

    // Step 2 — resolve photo_reference → CDN URL (no key in redirect target)
    const photoRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=200` +
      `&photo_reference=${encodeURIComponent(ref)}` +
      `&key=${apiKey}`,
      { redirect: 'manual' },
    );
    const location = photoRes.headers.get('location');
    const photoUrl = location && /^https:\/\/[a-z0-9.-]+\.(googleusercontent|gstatic|googleapis)\.com\//i.test(location)
      ? location : null;
    return Response.json({ photoUrl }, { headers: CORS });
  } catch (e) {
    console.error('google-places error:', e);
    return noPhoto();
  }
});
