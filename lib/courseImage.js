// ─── lib/courseImage.js — aerial course imagery, no API key ─────────────────
// Course thumbnails come from the USGS National Map imagery service, which is
// public domain and needs no key or billing. We only need coordinates, which
// GolfCourseAPI already gives us and the courses table stores. Coverage is the
// United States and its territories; anything outside returns null and the UI
// shows the generic course mark instead.
//
// getCoursePhoto(courseName, city) keeps the old google-places call signature
// so every CourseAvatar keeps working unchanged.

import { supabase } from './supabase';

const USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export';
const HALF_KM = 0.55;          // half-width of the square we frame around the course
const coordCache = {};         // courseName → { lat, lng } | null

export function inUsgsCoverage(lat, lng) {
  return lat >= 17 && lat <= 72 && lng >= -180 && lng <= -64;
}

// Square aerial image centred on lat/lng. `px` is the on-screen size; we ask
// for 2x for retina, capped so a 44px avatar does not pull a 1024px tile.
export function courseImageUrl(lat, lng, px = 200) {
  if (lat == null || lng == null || !inUsgsCoverage(lat, lng)) return null;
  const dLat = HALF_KM / 111;
  const dLng = HALF_KM / (111 * Math.cos((lat * Math.PI) / 180));
  const size = Math.max(256, Math.min(1024, Math.round(px * 2)));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map(n => n.toFixed(6)).join(',');
  return `${USGS}?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=${size},${size}&format=jpg&f=image`;
}

export async function getCourseCoords(courseName) {
  const key = (courseName || '').trim();
  if (!key) return null;
  if (key in coordCache) return coordCache[key];
  try {
    const { data } = await supabase
      .from('courses')
      .select('latitude, longitude')
      .ilike('name', key)
      .not('latitude', 'is', null)
      .limit(1);
    const row = data?.[0];
    const coords = row ? { lat: Number(row.latitude), lng: Number(row.longitude) } : null;
    coordCache[key] = coords;
    return coords;
  } catch {
    return null;   // not cached: a transient failure should not hide the image all session
  }
}

export async function getCoursePhoto(courseName, _city, px = 200) {
  const c = await getCourseCoords(courseName);
  return c ? courseImageUrl(c.lat, c.lng, px) : null;
}

export default { getCoursePhoto, getCourseCoords, courseImageUrl, inUsgsCoverage };
