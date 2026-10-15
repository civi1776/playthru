// ─── Shared Clocked round constants ──────────────────────────────────────────
// Import from here so ClockedSetupScreen, ClockedRoundScreen, and HomeScreen
// can't drift apart.

/** AsyncStorage key for the full in-progress Clocked round state. */
export const CLOCKED_ROUND_STATE_KEY = 'clocked_round_state';

/**
 * AsyncStorage key for the transport ('Walking' | 'Cart') the user chose for
 * their most recent Clocked round — pre-selected on the next setup.
 */
export const CLOCKED_LAST_TRANSPORT_KEY = 'clocked_last_transport';

/** Transport pre-selected when there is no stored last-used value. */
export const CLOCKED_DEFAULT_TRANSPORT = 'Cart';

/** Rounds older than this (ms) are considered stale and silently discarded. */
export const CLOCKED_ROUND_STALENESS_MS = 12 * 60 * 60 * 1000; // 12 hours
