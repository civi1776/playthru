import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PRO_ENABLED } from '../lib/featureFlags';

/**
 * useProAccess
 *
 * Single source of truth for the current user's Pro access state.
 * Combines paid subscriptions (is_pro) and any unexpired free-access window
 * (pro_expires_at) — which covers both signup trials and referral grants.
 *
 * Results are cached for 30 seconds so multiple components can call this hook
 * without hammering Supabase. A Realtime subscription invalidates the cache
 * instantly if the profile row is updated mid-session (e.g. trial expires,
 * RevenueCat webhook fires, referral reward granted).
 *
 * @returns {{
 *   hasProAccess:       boolean,      — true if user may use Pro features (paid OR unexpired free window)
 *   isPaying:           boolean,      — true only if is_pro = true (paid subscriber via RevenueCat)
 *   isOnTrial:          boolean,      — true if not paying but pro_expires_at is still in the future
 *   trialDaysRemaining: number|null,  — days left rounded up if isOnTrial, otherwise null
 *   isLoading:          boolean,      — true while the initial profile fetch is in flight
 *   error:              Error|null,   — populated if the Supabase query fails
 * }}
 */

// ─── Module-level cache (shared across all hook instances) ────────────────────
// Safe because only one user is logged in at a time.
const _cache = { data: null, fetchedAt: 0, userId: null };
const CACHE_TTL_MS = 30_000; // 30 seconds

function computeState(row) {
  if (!row) {
    return {
      hasProAccess: false,
      isPaying: false,
      isOnTrial: false,
      trialDaysRemaining: null,
      isLoading: false,
      error: null,
    };
  }

  const isPaying   = row.is_pro === true;
  const expiresAt  = row.pro_expires_at ? new Date(row.pro_expires_at) : null;
  const now        = new Date();
  const isOnTrial  = !isPaying && expiresAt !== null && expiresAt > now;
  const hasProAccess = isPaying || isOnTrial;

  let trialDaysRemaining = null;
  if (isOnTrial && expiresAt) {
    trialDaysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  return { hasProAccess, isPaying, isOnTrial, trialDaysRemaining, isLoading: false, error: null };
}

export function useProAccess() {
  // When Pro is disabled globally, every user gets full access so Pro-gated
  // logic doesn't break the free experience. No DB fetch needed.
  if (!PRO_ENABLED) {
    return {
      hasProAccess: true,
      isPaying: false,
      isOnTrial: false,
      trialDaysRemaining: null,
      isLoading: false,
      error: null,
    };
  }

  const [state, setState] = useState({
    hasProAccess: false,
    isPaying: false,
    isOnTrial: false,
    trialDaysRemaining: null,
    isLoading: true,
    error: null,
  });

  const userIdRef = useRef(null);

  const fetchProfile = async (userId, forceRefresh = false) => {
    const now = Date.now();
    const cacheHit =
      !forceRefresh &&
      _cache.userId === userId &&
      _cache.data !== null &&
      now - _cache.fetchedAt < CACHE_TTL_MS;

    if (cacheHit) {
      setState(computeState(_cache.data));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_pro, pro_expires_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      _cache.data      = data;
      _cache.fetchedAt = Date.now();
      _cache.userId    = userId;

      setState(computeState(data));
    } catch (e) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: e instanceof Error ? e : new Error(String(e)),
      }));
    }
  };

  useEffect(() => {
    let channel   = null;
    let cancelled = false;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      const userId = session?.user?.id ?? null;
      userIdRef.current = userId;

      if (!userId) {
        setState({
          hasProAccess: false,
          isPaying: false,
          isOnTrial: false,
          trialDaysRemaining: null,
          isLoading: false,
          error: null,
        });
        return;
      }

      await fetchProfile(userId);
      if (cancelled) return;

      // ── Realtime: bust cache + re-fetch on any UPDATE to this profile row ──
      channel = supabase
        .channel(`pro-access-${userId}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'profiles',
            filter: `id=eq.${userId}`,
          },
          () => {
            _cache.data      = null;
            _cache.fetchedAt = 0;
            if (userIdRef.current) fetchProfile(userIdRef.current, true);
          },
        )
        .subscribe();
    };

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return state;
}
