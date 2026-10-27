// ─── lib/activeRound.js ────────────────────────────────────────────────────
// Shared "is there a round in progress?" state for the tab screens.
//
// MainApp (App.js) owns the AsyncStorage check and renders the floating
// ROUND IN PROGRESS banner above the tab bar. Tab screens that scroll need
// to know when that banner is on screen so their last items don't end up
// hidden underneath it — they read `useActiveRoundInset()` and add it to
// their bottom padding.

import { createContext, useContext } from 'react';

// Height of the floating banner plus the gap between it and the tab bar.
// Banner: ~44pt tall, anchored 90pt from the bottom; tab bar is 72pt.
export const ACTIVE_ROUND_BANNER_INSET = 72;

// How long a saved round stays resumable. Past this it's treated as
// abandoned and cleared, so a week-old half-round doesn't haunt the app.
export const ACTIVE_ROUND_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export const ActiveRoundContext = createContext({ activeRound: null });

export function useActiveRound() {
  return useContext(ActiveRoundContext).activeRound;
}

export function useActiveRoundInset() {
  const active = useActiveRound();
  return active ? ACTIVE_ROUND_BANNER_INSET : 0;
}
