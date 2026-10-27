// ─── google-places — course photo lookup proxy ──────────────────────────────
// Keeps GOOGLE_PLACES_API_KEY server-side. Returns { photoUrl } plus a
// `reason` string when there is no photo (Google's status text — never the
// key) so the client/CLI can tell "no photo" from "API not enabled".
//
// Uses Places API (New) — keys created after March 2025 cannot call the
// legacy findplacefromtext endpoint — with a legacy fallback for older keys.
//
// Auth: the gateway verifies the JWT (verify_jwt = true in config.toml);
// requestHasProjectKey() additionally checks the token is for this project.
import { requestHasProjectKey } from '../_shared/callerKey.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_NAME = 120;
const MAX_CITY = 80;
const PHOTO_WIDTH = 400;
const GOOGLE_HOST_RE = /^https:\/\/[a-z0-9.-]+\.(googleusercontent|gstatic|googleapis)\.com\//i;

const reply = (photoUrl: string | null, reason?: string) =>
  Response.json(reason ? { photoUrl, reason } : { photoUrl }, { headers: CORS });

const scrub = (s: unknown, key: string) => String(s ?? '').split(key).join('[key]').slice(0, 160);

// Places API (New): text search → photo resource name → media URI.
async function lookupNew(query: string, apiKey: string): Promise<{ url: string | null; reason?: string }> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.photos',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, includedType: 'golf_course' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { url: null, reason: `new:${res.status}:${scrub(data?.error?.message ?? data?.error?.status, apiKey)}` };
  const name = data?.places?.[0]?.photos?.[0]?.name;
  if (!name || typeof name !== 'string' || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) {
    return { url: null, reason: 'new:no_photo' };
  }
  const media = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${PHOTO_WIDTH}&skipHttpRedirect=true`,
    { headers: { 'X-Goog-Api-Key': apiKey } },
  );
  const mdata = await media.json().catch(() => ({}));
  if (!media.ok) return { url: null, reason: `new-media:${media.status}:${scrub(mdata?.error?.message, apiKey)}` };
  const uri = typeof mdata?.photoUri === 'string' && GOOGLE_HOST_RE.test(mdata.photoUri) ? mdata.photoUri : null;
  return { url: uri, reason: uri ? undefined : 'new:bad_photo_uri' };
}

// Legacy Places API (works only for keys that pre-date the deprecation).
async function lookupLegacy(query: string, apiKey: string): Promise<{ url: string | null; reason?: string }> {
  const searchRes = await fetch(
    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json' +
    `?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,photos,name&key=${apiKey}`,
  );
  const searchData = await searchRes.json().catch(() => ({}));
  if (searchData?.status && searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    return { url: null, reason: `legacy:${searchData.status}:${scrub(searchData.error_message, apiKey)}` };
  }
  const ref = searchData.candidates?.[0]?.photos?.[0]?.photo_reference;
  if (!ref || typeof ref !== 'string') return { url: null, reason: 'legacy:no_photo' };
  const photoRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${PHOTO_WIDTH}&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`,
    { redirect: 'manual' },
  );
  const location = photoRes.headers.get('location');
  const url = location && GOOGLE_HOST_RE.test(location) ? location : null;
  return { url, reason: url ? undefined : `legacy-photo:${photoRes.status}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!(await requestHasProjectKey(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
  }

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return reply(null, 'no_api_key_configured');

  try {
    const url        = new URL(req.url);
    const courseName = (url.searchParams.get('courseName') ?? '').trim().slice(0, MAX_NAME);
    const city       = (url.searchParams.get('city') ?? '').trim().slice(0, MAX_CITY);
    if (!courseName) return reply(null, 'missing_course_name');

    const query = `${courseName} golf course${city ? ' ' + city : ''}`;

    const fresh = await lookupNew(query, apiKey);
    if (fresh.url) return reply(fresh.url);

    const legacy = await lookupLegacy(query, apiKey);
    if (legacy.url) return reply(legacy.url);

    return reply(null, `${fresh.reason ?? 'new:unknown'} | ${legacy.reason ?? 'legacy:unknown'}`);
  } catch (e) {
    console.error('google-places error:', e);
    return reply(null, 'exception');
  }
});
