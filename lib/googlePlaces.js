import { supabaseUrl, supabaseAnonKey } from './supabase';

const PLACES_URL = `${supabaseUrl}/functions/v1/google-places`;

export async function getCoursePhoto(courseName, city) {
  try {
    const params = new URLSearchParams({ courseName });
    if (city) params.set('city', city);

    const res = await fetch(`${PLACES_URL}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
    });
    const data = await res.json();
    return data.photoUrl ?? null;
  } catch (e) {
    return null;
  }
}
