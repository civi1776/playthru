import { supabaseUrl, supabaseAnonKey } from './supabase';

const SEARCH_URL = `${supabaseUrl}/functions/v1/search-courses`;
const TIMEOUT_MS = 8000;

export async function searchCourses(query) {
  if (!query || query.trim().length < 2) return [];

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
      console.error(`[searchCourses] error: HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    return json.courses ?? [];
  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('[searchCourses] error: request timed out after 8s');
    } else {
      console.error('[searchCourses] error:', e);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
