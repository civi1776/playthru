// ─── Shared live-round constants ──────────────────────────────────────────────
// Import from here so LiveRoundScreen and HomeScreen can't drift apart.

/** AsyncStorage key for the full in-progress round state. */
export const ROUND_STATE_KEY = 'live_round_state';

/** Rounds older than this (ms) are considered stale and silently discarded. */
export const ROUND_STALENESS_MS = 12 * 60 * 60 * 1000; // 12 hours
