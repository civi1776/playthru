import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { PROFILE_COLUMNS } from '../lib/profileColumns';
import { CLOCKED_ROUND_STATE_KEY } from '../lib/clockedRoundConstants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null);
  const [profile,      setProfile]      = useState(null);
  const [session,      setSession]      = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Fetch all columns — strip date_of_birth client-side (COPPA: don't hold DOB in memory)
  const loadProfile = async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
    if (error) { setProfile(null); return; }
    if (data) {
      const { date_of_birth: _dob, ...safe } = data;
      setProfile(safe);
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    // Resolve the profile BEFORE clearing `initializing`. The root navigator
    // picks its initial route from (session && profile), so if we flip the
    // flag while the profile is still in flight a returning user sees the
    // Welcome screen flash before being reset to Main.
    // Capped so a hung network can't leave the app on the loading spinner:
    // after the cap we proceed with whatever we have (profile may still land
    // later and the navigator reacts to it).
    const PROFILE_WAIT_CAP_MS = 6000;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.race([
          loadProfile(session.user.id),
          new Promise(resolve => setTimeout(resolve, PROFILE_WAIT_CAP_MS)),
        ]);
      }
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
    const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).maybeSingle();
    if (data) {
      const { date_of_birth: _dob, ...safe } = data;
      setProfile(safe);
    }
    return data ?? null;
  };

  const signOut = async () => {
    await AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY).catch(() => {});
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
