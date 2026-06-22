// ─── Shared Clocked round constants ──────────────────────────────────────────
// Import from here so ClockedSetupScreen, ClockedRoundScreen, and HomeScreen
// can't drift apart.

/** AsyncStorage key for the full in-progress Clocked round state. */
export const CLOCKED_ROUND_STATE_KEY = 'clocked_round_state';

/** Rounds older than this (ms) are considered stale and silently discarded. */
export const CLOCKED_ROUND_STALENESS_MS = 12 * 60 * 60 * 1000; // 12 hours
