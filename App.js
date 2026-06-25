import { useState, useEffect, useRef, useCallback } from 'react';
import Constants from 'expo-constants';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, AppState, Animated, AccessibilityInfo } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { setupNotifications, refreshPushToken } from './lib/notifications';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './context/AuthContext';

import HomeScreen             from './screens/HomeScreen';
import FeedScreen             from './screens/FeedScreen';
import RulesScreen            from './screens/RulesScreen';
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
// GamesScreen retired — the sport is the one game
import PreviewModeScreen    from './screens/PreviewModeScreen';
import SettingsScreen       from './screens/SettingsScreen';
import EditProfileScreen   from './screens/EditProfileScreen';
import PaywallScreen              from './screens/PaywallScreen';
import NotificationCenterScreen  from './screens/NotificationCenterScreen';
import ClockedSetupScreen        from './screens/ClockedSetupScreen';
import ClockedRoundScreen        from './screens/ClockedRoundScreen';
import ConfirmRoundScreen        from './screens/ConfirmRoundScreen';

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
  { name: 'Feed',        icon: 'flash-outline',  label: 'FEED' },
  { name: 'Rules',       icon: 'book-outline',   label: 'RULES' },
  { name: 'Play',        icon: 'timer-outline',  label: 'PLAY', isPlay: true },
  { name: 'Ranks',       icon: 'trophy',         label: 'RANKS' },
  { name: 'You',         icon: 'person',         label: 'YOU' },
];
const CADDY_TABS = [
  { name: 'Home',        icon: 'shield-outline', label: 'HUB' },
  { name: 'Play',        icon: 'timer-outline',  label: 'OPERATE', isPlay: true },
  { name: 'Leaderboard', icon: 'trophy',         label: 'RANKS' },
  { name: 'Log',         icon: 'add-circle',     label: 'LOG' },
];

// ─── Play button glow colors ─────────────────────────────────────────────────
const PLAY_GOLD       = '#F0CB5B'; // brighter, more saturated than #C9A84C
const PLAY_GOLD_TOP   = '#F7DC82'; // lighter highlight for gradient top
const PLAY_GOLD_BOT   = '#D4A832'; // richer shadow for gradient bottom
const TAB_ACTIVE      = '#B8A24A'; // active tabs: gold but a notch below Play
const TAB_INACTIVE    = 'rgba(160,152,130,0.35)'; // greyer than before

function PlayButton({ onPress }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true); // default safe

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => {
      setReduceMotion(!!v);
      if (!v) {
        // Gentle breathing pulse: scale 1→1.12→1, opacity on glow ring
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
          ])
        ).start();
      }
    });
  }, []);

  const glowOpacity = reduceMotion ? 0.25 : pulseAnim.interpolate({
    inputRange: [1, 1.12], outputRange: [0.18, 0.35],
  });

  return (
    <TouchableOpacity
      style={nav.playItem}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Play Clocked"
    >
      {/* Outer glow ring */}
      <Animated.View style={[nav.glowRing, {
        transform: [{ scale: reduceMotion ? 1 : pulseAnim }],
        opacity: glowOpacity,
      }]} />

      {/* Gradient circle */}
      <View style={nav.playCircle}>
        <Svg width={52} height={52} style={nav.gradientSvg}>
          <Defs>
            <LinearGradient id="playGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PLAY_GOLD_TOP} />
              <Stop offset="1" stopColor={PLAY_GOLD_BOT} />
            </LinearGradient>
          </Defs>
          <Circle cx={26} cy={26} r={25} fill="url(#playGrad)" />
        </Svg>
        <View style={nav.playIconWrap}>
          <Ionicons name="timer-outline" size={26} color="#090F0A" />
        </View>
      </View>

      <Text style={nav.playLabel}>PLAY</Text>
    </TouchableOpacity>
  );
}

function BottomNav({ state, navigation, isCaddy }) {
  const tabs = isCaddy ? CADDY_TABS : PLAYER_TABS;
  return (
    <View style={nav.container}>
      {tabs.map((tab, i) => {
        const active = state.index === i;

        if (tab.isPlay) {
          return (
            <PlayButton
              key={tab.name}
              onPress={() => {
                const root = navigation.getParent();
                if (root) root.navigate('ClockedSetup');
                else navigation.navigate('ClockedSetup');
              }}
            />
          );
        }

        return (
          <TouchableOpacity
            key={tab.name}
            style={nav.item}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Ionicons name={tab.icon} size={24}
              color={active ? TAB_ACTIVE : TAB_INACTIVE} />
            <Text style={[nav.label, { color: active ? TAB_ACTIVE : TAB_INACTIVE }]}>
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

  // Play button
  playItem: { alignItems: 'center', justifyContent: 'center', flex: 1, marginTop: -18 },
  glowRing: {
    position: 'absolute', top: -6, width: 68, height: 68, borderRadius: 34,
    backgroundColor: PLAY_GOLD,
  },
  playCircle: {
    width: 52, height: 52, borderRadius: 26, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PLAY_GOLD, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55, shadowRadius: 18, elevation: 10,
    borderWidth: 2, borderColor: '#090D0A',
  },
  gradientSvg: { position: 'absolute', top: 0, left: 0 },
  playIconWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 52, height: 52 },
  playLabel: { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1.5, marginTop: 3, color: PLAY_GOLD },
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
          {/* Play/Operate — the BottomNav button pushes ClockedSetup on the root stack */}
          <Tab.Screen name="Play"        component={CaddyDashboardScreen} />
          <Tab.Screen name="Leaderboard" component={CaddyLeaderboardScreen} />
          <Tab.Screen name="Log"         component={LogScreen} />
          <Tab.Screen name="Courses"     component={CoursesScreen} />
        </Tab.Navigator>
      ) : (
        <Tab.Navigator
          tabBar={props => <BottomNav {...props} />}
          screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
        >
          <Tab.Screen name="Feed"        component={FeedScreen} />
          <Tab.Screen name="Rules"       component={RulesScreen} />
          {/* Play tab has no screen — the BottomNav button pushes ClockedSetup on the root stack */}
          <Tab.Screen name="Play"        component={FeedScreen} />
          <Tab.Screen name="Ranks"       component={LeaderboardScreen} />
          <Tab.Screen name="You"         component={ProfileScreen} />
          {/* Hidden: reachable via navigate() from links/FABs, no visible tab */}
          <Tab.Screen name="Log"         component={LogScreen} />
        </Tab.Navigator>
      )}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </>
  );
}

// ─── Update gate ─────────────────────────────────────────────────────────────

function UpdateGateScreen() {
  return (
    <View style={ug.container}>
      <Text style={ug.wordmark}>CLOCKED</Text>
      <View style={ug.badge}>
        <Text style={ug.badgeText}>UPDATE REQUIRED</Text>
      </View>
      <Text style={ug.message}>
        A new version of Clocked Golf is available. Please update to continue.
      </Text>
      <TouchableOpacity
        style={ug.btn}
        onPress={() => Linking.openURL('https://apps.apple.com/app/id6761913592')}
        activeOpacity={0.85}
      >
        <Text style={ug.btnText}>UPDATE NOW</Text>
      </TouchableOpacity>
    </View>
  );
}

const ug = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090F0A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  wordmark:  { fontSize: 22, fontWeight: '700', color: '#C9A84C', letterSpacing: 6, marginBottom: 40 },
  badge:     { backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 28 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 3 },
  message:   { fontSize: 15, color: '#B8A882', textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  btn:       { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 52 },
  btnText:   { fontSize: 13, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});

// ─── Root navigator ───────────────────────────────────────────────────────────
// Single flat stack: all auth screens + Main live here so navigation.reset()
// can always navigate between them without rebuilding the navigator tree.
function AppNavigator() {
  const { session, profile, initializing } = useAuth();
  const navRef   = useRef(null);
  const [navReady, setNavReady]             = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const notificationsSetupRef  = useRef(false);  // only run setupNotifications once per session

  useFonts({ Montserrat_700Bold });

  // Warm Supabase schema cache for the rounds table so new columns (e.g.
  // active_game) are recognised without a manual PostgREST cache reload.
  useEffect(() => {
    supabase.from('rounds').select('id').limit(1).then(() => {});
  }, []);

  // Version gate — block outdated builds
  useEffect(() => {
    (async () => {
      try {
        const CACHE_KEY = 'min_build_check';
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { blocked, ts } = JSON.parse(cached);
          if (Date.now() - ts < 5 * 60 * 1000) { setUpdateRequired(blocked); return; }
        }
        const { data } = await supabase
          .from('app_config').select('value')
          .eq('key', 'min_build_number').maybeSingle();
        if (!data?.value) return;
        const buildStr = Constants.nativeBuildVersion;
        if (!buildStr) return;
        const thisBuild = parseInt(buildStr, 10);
        const minBuild  = parseInt(data.value, 10);
        if (isNaN(thisBuild) || isNaN(minBuild)) return;
        const blocked = thisBuild < minBuild;
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ blocked, ts: Date.now() }));
        setUpdateRequired(blocked);
      } catch (e) { /* fail silently */ }
    })();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url, navRef); });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url, navRef));
    return () => sub.remove();
  }, []);

  // Refresh push token whenever the app returns to foreground — tokens can rotate.
  useEffect(() => {
    if (!session) return;
    const appStateRef = { current: AppState.currentState };
    const sub = AppState.addEventListener('change', nextState => {
      const wasBackground = /inactive|background/.test(appStateRef.current);
      appStateRef.current = nextState;
      if (wasBackground && nextState === 'active') {
        refreshPushToken().catch(() => {});
        AsyncStorage.removeItem('min_build_check').catch(() => {});
      }
    });
    return () => sub.remove();
  }, [session]);

  // ── Notification deep-linking ────────────────────────────────────────────────
  // Dispatches to the correct screen based on notification type + meta.
  // Used for both foreground taps and cold-start launches.
  const handleNotificationNav = useCallback((response) => {
    if (!response || !navRef.current) return;
    const data = response.notification.request.content.data ?? {};
    const type = data.type;

    switch (type) {
      case 'round_confirm':
        navRef.current.navigate('ConfirmRound', { roundId: data.round_id, playerKey: data.player_key });
        break;
      case 'comment':
      case 'like':
        // Route to Feed (activity_id is in data for future scroll-to support)
        navRef.current.navigate('Feed');
        break;
      case 'new_follower':
        if (data.follower_id) navRef.current.navigate('PublicProfile', { userId: data.follower_id });
        else navRef.current.navigate('Feed');
        break;
      case 'challenge_received':
      case 'challenge_accepted':
      case 'challenge_declined':
      case 'challenge_result':
        navRef.current.navigate('Notifications');
        break;
      case 'milestone':
      case 'clocked_score':
        navRef.current.navigate('You');
        break;
      case 'rank_move':
      case 'course_leader':
        navRef.current.navigate('Ranks');
        break;
      case 'still_playing':
      case 'interaction_ladder':
        navRef.current.navigate('LiveRound');
        break;
      case 'inactivity':
      case 'weekly_digest':
      case 'monthly_challenge':
      case 'friend_round':
      case 'course_update':
      default:
        navRef.current.navigate('Feed');
        break;
    }
  }, []);

  // Foreground tap: listener fires when user taps a notification while app is open
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationNav);
    return () => sub.remove();
  }, [handleNotificationNav]);

  // Cold start: check if the app was launched from a notification tap
  useEffect(() => {
    if (!navReady) return;
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationNav(response);
    });
  }, [navReady, handleNotificationNav]);

  // Reactively handle all auth state transitions.
  // Guard against resetting to Main on every refreshProfile() call by checking
  // whether we are already on the correct root route before calling reset().
  useEffect(() => {
    if (!navReady || initializing) return;
    const state    = navRef.current?.getRootState();
    const topRoute = state?.routes?.[state.index ?? 0]?.name;

    if (!session) {
      notificationsSetupRef.current = false;
      if (topRoute !== 'Welcome') {
        navRef.current?.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      }
      return;
    }

    if (session && profile) {
      if (topRoute !== 'Main') {
        navRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
      // Set up push notifications once after auth is confirmed
      if (!notificationsSetupRef.current) {
        notificationsSetupRef.current = true;
        setupNotifications();
        // One-time token save for existing users who have no token
        (async () => {
          const { data: profileCheck } = await supabase
            .from('profiles')
            .select('push_token')
            .eq('id', session.user.id)
            .maybeSingle();
          if (!profileCheck?.push_token) {
            refreshPushToken().catch(() => {});
          }
        })();
      }
      return;
    }
    // session exists but no profile yet — stay on Welcome/SignUp (onboarding in progress)
  }, [session, profile, initializing, navReady]);

  if (updateRequired) return <UpdateGateScreen />;

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
        {/* Games screen retired — the sport is the one game */}
        <RootStack.Screen name="Settings"       component={SettingsScreen} />
        <RootStack.Screen name="EditProfile"    component={EditProfileScreen} />
        <RootStack.Screen name="Paywall"        component={PaywallScreen} />
        <RootStack.Screen name="Notifications"  component={NotificationCenterScreen} />
        <RootStack.Screen name="ClockedSetup"   component={ClockedSetupScreen} />
        <RootStack.Screen name="ClockedRound"   component={ClockedRoundScreen} />
        <RootStack.Screen name="ConfirmRound"  component={ConfirmRoundScreen} />
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
