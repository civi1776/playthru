import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null);
  const [profile,      setProfile]      = useState(null);
  const [session,      setSession]      = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Explicit column list — never fetch date_of_birth (COPPA: don't store/transmit DOB after age gate)
  const PROFILE_COLS = 'id, email, full_name, first_name, last_name, username, hometown, home_state, home_country, home_course, account_type, handicap, handicap_index, avg_score, typical_round_time, pop_score, national_rank, push_token, avatar_url, is_pro, pro_expires_at, trial_started_at, subscription_source, pro_trial_active, referral_code, referral_count, referred_by, age_verified, caddy_course, caddy_courses, caddy_experience, caddy_rating, caddy_total_loops, bio, created_at';

  const loadProfile = async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle();
    if (!error) setProfile(data ? { ...data } : null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      setInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Call after inserting/updating profile row to sync context immediately.
  // Spreads into a new object so React always detects a reference change.
  // Returns the freshly-fetched profile so callers can inspect it.
  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', session.user.id).maybeSingle();
    if (data) setProfile({ ...data });
    return data ?? null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, initializing, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
