import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from './lib/supabase';
import { setupNotifications } from './lib/notifications';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './context/AuthContext';

import HomeScreen             from './screens/HomeScreen';
import CaddyDashboardScreen    from './screens/CaddyDashboardScreen';
import CaddyLeaderboardScreen  from './screens/CaddyLeaderboardScreen';
import LogScreen          from './screens/LogScreen';
import CoursesScreen      from './screens/CoursesScreen';
import ProfileScreen      from './screens/ProfileScreen';
import LeaderboardScreen  from './screens/LeaderboardScreen';
import SplashScreen       from './screens/SplashScreen';
import WelcomeScreen      from './screens/WelcomeScreen';
import SignUpScreen        from './screens/SignUpScreen';
import SignInScreen        from './screens/SignInScreen';
import SearchUsersScreen  from './screens/SearchUsersScreen';
import ShareScreen        from './screens/ShareScreen';
import CourseProfileScreen from './screens/CourseProfileScreen';
import ClaimRoundScreen      from './screens/ClaimRoundScreen';
import POPScoreInfoScreen    from './screens/POPScoreInfoScreen';
import PublicProfileScreen   from './screens/PublicProfileScreen';
import ActivityFeedScreen    from './screens/ActivityFeedScreen';
import LiveRoundScreen      from './screens/LiveRoundScreen';
import ResetPasswordScreen  from './screens/ResetPasswordScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import GamesScreen          from './screens/GamesScreen';
import PreviewModeScreen    from './screens/PreviewModeScreen';
import SettingsScreen       from './screens/SettingsScreen';

// ─── Deep link helpers ────────────────────────────────────────────────────────
function parseUrlParams(url) {
  try {
    // Merge params from both the query string AND the hash fragment,
    // since Supabase may put tokens in either location.
    const parse = (str) => Object.fromEntries(
      str.split('&').filter(Boolean).map(p => {
        const [k, v] = p.split('=');
        return [k, decodeURIComponent(v ?? '')];
      })
    );
    const hash  = (url.split('#')[1] ?? '');
    const query = (url.split('?')[1] ?? '').split('#')[0];
    return { ...parse(query), ...parse(hash) };
  } catch {
    return {};
  }
}

async function handleDeepLink(url, nav) {
  if (!url) return;

  // Referral link: https://playthrugolf.app/join?ref=XXXXXX or playthru://join?ref=XXXXXX
  const params = parseUrlParams(url);
  if (params.ref) {
    try {
      await AsyncStorage.setItem('pending_referral_code', params.ref.toUpperCase());
    } catch {}
  }

  if (!url.startsWith('playthru:')) return;

  if (params.type === 'recovery') {
    if (params.token_hash) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: 'recovery' });
      if (!error) {
        nav?.current?.navigate('ResetPassword');
      }
    } else if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
      if (!error) {
        nav?.current?.navigate('ResetPassword');
      }
    }
  } else if (params.token_hash && params.type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: params.type });
  } else if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
  }
}

// ─── Navigators ───────────────────────────────────────────────────────────────
const Tab       = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

// ─── Tab bar ─────────────────────────────────────────────────────────────────
const PLAYER_TABS = [
  { name: 'Home',        icon: 'home',       label: 'HOME' },
  { name: 'Log',         icon: 'add-circle', label: 'LOG' },
  { name: 'Courses',     icon: 'location',   label: 'COURSES' },
  { name: 'Profile',     icon: 'person',     label: 'PROFILE' },
  { name: 'Leaderboard', icon: 'trophy',     label: 'RANKS' },
];
const CADDY_TABS = [
  { name: 'Home',        icon: 'person',     label: 'CADDY' },
  { name: 'Log',         icon: 'add-circle', label: 'LOG' },
  { name: 'Courses',     icon: 'location',   label: 'COURSES' },
  { name: 'Leaderboard', icon: 'trophy',     label: 'RANKS' },
];

function BottomNav({ state, navigation, isCaddy }) {
  const tabs = isCaddy ? CADDY_TABS : PLAYER_TABS;
  return (
    <View style={nav.container}>
      {tabs.map((tab, i) => {
        const active = state.index === i;
        return (
          <TouchableOpacity
            key={tab.name}
            style={nav.item}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.7}
          >
            <Ionicons name={tab.icon} size={24}
              color={active ? '#C9A84C' : 'rgba(184,168,130,0.4)'} />
            <Text style={[nav.label, { color: active ? '#C9A84C' : 'rgba(184,168,130,0.4)' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const nav = StyleSheet.create({
  container: {
    width: '100%', height: 72, backgroundColor: '#090D0A',
    borderTopWidth: 1, borderTopColor: '#7DC87A33',
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
  },
  item:  { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 4 },
  label: { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1.5, marginTop: 3 },
});

// ─── Main app (tab navigator) ─────────────────────────────────────────────────
// Rendered as the 'Main' screen in the root stack.
function MainApp() {
  const { profile } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const isCaddy = profile?.account_type === 'caddy';

  return (
    <>
      {isCaddy ? (
        <Tab.Navigator
          tabBar={props => <BottomNav {...props} isCaddy />}
          screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
        >
          <Tab.Screen name="Home"        component={CaddyDashboardScreen} />
          <Tab.Screen name="Log"         component={LogScreen} />
          <Tab.Screen name="Courses"     component={CoursesScreen} />
          <Tab.Screen name="Leaderboard" component={CaddyLeaderboardScreen} />
        </Tab.Navigator>
      ) : (
        <Tab.Navigator
          tabBar={props => <BottomNav {...props} />}
          screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
        >
          <Tab.Screen name="Home"        component={HomeScreen} />
          <Tab.Screen name="Log"         component={LogScreen} />
          <Tab.Screen name="Courses"     component={CoursesScreen} />
          <Tab.Screen name="Profile"     component={ProfileScreen} />
          <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
        </Tab.Navigator>
      )}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </>
  );
}

// ─── Biometric gate ───────────────────────────────────────────────────────────

function BiometricGate({ onUnlock }) {
  const [failed, setFailed] = useState(false);

  const tryAuth = async () => {
    setFailed(false);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock PlayThru',
      fallbackLabel: 'Use Password',
      cancelLabel: 'Cancel',
    });
    if (result.success) {
      onUnlock();
    } else {
      setFailed(true);
    }
  };

  useEffect(() => { tryAuth(); }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={gate.container}>
      <Text style={gate.wordmark}>PLAYTHRU</Text>
      <Ionicons name="finger-print" size={64} color="#C9A84C" style={{ marginBottom: 24 }} />
      <Text style={gate.subtitle}>
        {failed ? 'Face ID failed. Try again.' : 'Tap to unlock with Face ID'}
      </Text>
      <TouchableOpacity style={gate.unlockBtn} onPress={tryAuth} activeOpacity={0.8}>
        <Text style={gate.unlockBtnText}>{failed ? 'TRY AGAIN' : 'UNLOCK'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleSignOut} activeOpacity={0.7} style={{ marginTop: 32 }}>
        <Text style={gate.signOutLink}>Sign in with password instead</Text>
      </TouchableOpacity>
    </View>
  );
}

const gate = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#090F0A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  wordmark:      { fontSize: 22, fontWeight: '700', color: '#C9A84C', letterSpacing: 6, marginBottom: 48 },
  subtitle:      { fontSize: 15, color: '#B8A882', textAlign: 'center', marginBottom: 32 },
  unlockBtn:     { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
  unlockBtnText: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  signOutLink:   { fontSize: 13, color: '#B8A88266' },
});

// ─── Root navigator ───────────────────────────────────────────────────────────
// Single flat stack: all auth screens + Main live here so navigation.reset()
// can always navigate between them without rebuilding the navigator tree.
function AppNavigator() {
  const { session, profile, initializing } = useAuth();
  const navRef   = useRef(null);
  const [navReady, setNavReady]             = useState(false);
  const [showBiometricGate, setShowBiometricGate] = useState(false);
  const biometricCheckedRef = useRef(false); // only gate once per launch

  useFonts({ Montserrat_700Bold });

  useEffect(() => { setupNotifications(); }, []);

  // Warm Supabase schema cache for the rounds table so new columns (e.g.
  // active_game) are recognised without a manual PostgREST cache reload.
  useEffect(() => {
    supabase.from('rounds').select('id').limit(1).then(() => {});
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url, navRef); });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url, navRef));
    return () => sub.remove();
  }, []);

  // Navigate into the app when user taps a notification
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const type = response.notification.request.content.data?.type;
      if (type === 'inactivity') {
        navRef.current?.navigate('Log');
      } else {
        navRef.current?.navigate('Home');
      }
    });
    return () => sub.remove();
  }, []);

  // Reactively handle all auth state transitions.
  // Guard against resetting to Main on every refreshProfile() call by checking
  // whether we are already on the correct root route before calling reset().
  useEffect(() => {
    if (!navReady || initializing) return;
    const state    = navRef.current?.getRootState();
    const topRoute = state?.routes?.[state.index ?? 0]?.name;

    if (!session) {
      setShowBiometricGate(false);
      biometricCheckedRef.current = false;
      if (topRoute !== 'Welcome') {
        navRef.current?.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      }
      return;
    }

    if (session && profile) {
      if (topRoute !== 'Main') {
        navRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
      // Check biometric gate once after login/app-open with an active session
      if (!biometricCheckedRef.current) {
        biometricCheckedRef.current = true;
        (async () => {
          const stored = await AsyncStorage.getItem('faceIdEnabled');
          if (stored === 'true') {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
            if (hasHardware && isEnrolled) setShowBiometricGate(true);
          }
        })();
      }
      return;
    }
    // session exists but no profile yet — stay on Welcome/SignUp (onboarding in progress)
  }, [session, profile, initializing, navReady]);

  // Block render until AuthContext has resolved session + profile
  if (initializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#C9A84C" />
      </View>
    );
  }

  // session + profile → land on Main; anything else → land on Welcome
  const initialRouteName = (session && profile) ? 'Main' : 'Welcome';

  return (
    <>
    {showBiometricGate && (
      <View style={StyleSheet.absoluteFill}>
        <BiometricGate onUnlock={() => setShowBiometricGate(false)} />
      </View>
    )}
    <NavigationContainer ref={navRef} onReady={() => setNavReady(true)}>
      <RootStack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRouteName}
      >
        {/* Auth / onboarding screens */}
        <RootStack.Screen name="Welcome"     component={WelcomeScreen} />
        <RootStack.Screen name="SignUp"      component={SignUpScreen} />
        <RootStack.Screen name="SignIn"      component={SignInScreen} />
        <RootStack.Screen name="PreviewMode" component={PreviewModeScreen} />

        {/* Main app — reached via navigation.reset({ routes: [{ name: 'Main' }] }) */}
        <RootStack.Screen name="Main"     component={MainApp} />

        {/* Modal / push screens accessible from the main app */}
        <RootStack.Screen name="SearchUsers"   component={SearchUsersScreen} />
        <RootStack.Screen name="Share"         component={ShareScreen} />
        <RootStack.Screen name="CourseProfile" component={CourseProfileScreen} />
        <RootStack.Screen name="ClaimRound"    component={ClaimRoundScreen} />
        <RootStack.Screen name="POPScoreInfo"   component={POPScoreInfoScreen} />
        <RootStack.Screen name="PublicProfile"  component={PublicProfileScreen} />
        <RootStack.Screen name="ActivityFeed"   component={ActivityFeedScreen} />
        <RootStack.Screen name="LiveRound"       component={LiveRoundScreen} />
        <RootStack.Screen name="ResetPassword"   component={ResetPasswordScreen} />
        <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <RootStack.Screen name="Games"          component={GamesScreen} />
        <RootStack.Screen name="Settings"       component={SettingsScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, backgroundColor: '#090F0A',
    justifyContent: 'center', alignItems: 'center',
  },
});
