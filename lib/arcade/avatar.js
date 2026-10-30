// ─── Clocked Arcade — golfer avatar ──────────────────────────────────────────
// A flat-vector golfer the player dresses in the Arcade tab. Stored locally
// (it is cosmetic, never scored) so it works signed out and never touches
// profiles. Indices into the palettes below are what gets persisted.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const AVATAR_KEY = 'clocked_arcade_avatar_v1';
export const ARCADE_DIFFICULTY_KEY = 'clocked_arcade_difficulty_v1';

export const SKIN  = ['#F3D5B5', '#E0B088', '#C68E5C', '#9C6440', '#5C3A24'];
export const SHIRT = ['#C9A84C', '#F5EDD8', '#7DC87A', '#E85D4A', '#4C8FC9', '#1E1E1E'];
export const PANTS = ['#F5EDD8', '#2B2B2B', '#3B4A6B', '#8A6C3C'];
export const HAIR  = ['#2B1B12', '#5A3A1E', '#B8863B', '#141414', '#C9C2B4'];
export const HATS  = [
  { key: 'cap',    label: 'CAP' },
  { key: 'visor',  label: 'VISOR' },
  { key: 'bucket', label: 'BUCKET' },
  { key: 'none',   label: 'NO HAT' },
];

export const DEFAULT_AVATAR = { skin: 1, shirt: 0, pants: 1, hair: 0, hat: 'cap', hatColor: 5 };

export function normalizeAvatar(a) {
  const n = { ...DEFAULT_AVATAR, ...(a || {}) };
  const clamp = (v, arr) => (Number.isInteger(v) && v >= 0 && v < arr.length ? v : 0);
  return {
    skin: clamp(n.skin, SKIN), shirt: clamp(n.shirt, SHIRT), pants: clamp(n.pants, PANTS),
    hair: clamp(n.hair, HAIR), hatColor: clamp(n.hatColor, SHIRT),
    hat: HATS.some(h => h.key === n.hat) ? n.hat : 'cap',
  };
}

// Resolved colors the renderers draw with.
export function avatarColors(a) {
  const n = normalizeAvatar(a);
  return {
    skin: SKIN[n.skin], shirt: SHIRT[n.shirt], pants: PANTS[n.pants], hair: HAIR[n.hair],
    hat: SHIRT[n.hatColor], hatStyle: n.hat,
    shirtDark: shade(SHIRT[n.shirt], -0.25),
  };
}

export async function loadAvatar() {
  try { const raw = await AsyncStorage.getItem(AVATAR_KEY); return normalizeAvatar(raw ? JSON.parse(raw) : null); }
  catch { return { ...DEFAULT_AVATAR }; }
}
export async function saveAvatar(a) {
  try { await AsyncStorage.setItem(AVATAR_KEY, JSON.stringify(normalizeAvatar(a))); } catch {}
}

export async function loadArcadeDifficulty(fallback = 'intermediate') {
  try { const v = await AsyncStorage.getItem(ARCADE_DIFFICULTY_KEY); return v || fallback; } catch { return fallback; }
}
export async function saveArcadeDifficulty(d) {
  try { await AsyncStorage.setItem(ARCADE_DIFFICULTY_KEY, d); } catch {}
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export default { loadAvatar, saveAvatar, avatarColors, normalizeAvatar, DEFAULT_AVATAR, SKIN, SHIRT, PANTS, HAIR, HATS };
