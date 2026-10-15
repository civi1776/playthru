import { supabaseUrl, supabaseAnonKey } from './supabase';

const PLACES_URL = `${supabaseUrl}/functions/v1/google-places`;
const TIMEOUT_MS = 6000;

export async function getCoursePhoto(courseName, city) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const params = new URLSearchParams({ courseName });
    if (city) params.set('city', city);

    const res = await fetch(`${PLACES_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
    });
    const data = await res.json();
    return data.photoUrl ?? null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
