import { useState, useEffect, useRef, useCallback } from 'react';
import Constants from 'expo-constants';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, AppState, Animated, AccessibilityInfo, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { setupNotifications, refreshPushToken } from './lib/notifications';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CLOCKED_ROUND_STATE_KEY } from './lib/clockedRoundConstants';
import { ActiveRoundContext, ACTIVE_ROUND_MAX_AGE_MS } from './lib/activeRound';
import { COLOR } from './lib/theme';

import FeedScreen             from './screens/FeedScreen';
import RulesScreen            from './screens/RulesScreen';
import ProfileScreen      from './screens/ProfileScreen';
import LeaderboardScreen  from './screens/LeaderboardScreen';
import SplashScreen       from './screens/SplashScreen';
import WelcomeScreen      from './screens/WelcomeScreen';
import SignUpScreen        from './screens/SignUpScreen';
import SignInScreen        from './screens/SignInScreen';
import SearchUsersScreen  from './screens/SearchUsersScreen';
import ShareScreen        from './screens/ShareScreen';
import CourseProfileScreen from './screens/CourseProfileScreen';
import PublicProfileScreen   from './screens/PublicProfileScreen';
import ResetPasswordScreen  from './screens/ResetPasswordScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
// GamesScreen retired — the sport is the one game
import PreviewModeScreen    from './screens/PreviewModeScreen';
import SettingsScreen       from './screens/SettingsScreen';
import EditProfileScreen   from './screens/EditProfileScreen';
import NotificationCenterScreen  from './screens/NotificationCenterScreen';
import ClockedSetupScreen        from './screens/ClockedSetupScreen';
import ClockedRoundScreen        from './screens/ClockedRoundScreen';
import ConfirmRoundScreen        from './screens/ConfirmRoundScreen';
import OnboardingScreen          from './screens/OnboardingScreen';
import TournamentScreen          from './screens/TournamentScreen';
import TournamentApplyScreen     from './screens/TournamentApplyScreen';
import RivalryScreen             from './screens/RivalryScreen';
import AdminScreen               from './screens/AdminScreen';
import ArcadeScreen              from './screens/ArcadeScreen';
import ArcadeHomeScreen          from './screens/ArcadeHomeScreen';

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
// Five slots: PLAY in the middle, two tabs either side. Rules lives in the
// feed header (book icon) and in the round/setup screens.
const PLAYER_TABS = [
  { name: 'Feed',   icon: 'flash-outline',           iconActive: 'flash',           label: 'FEED' },
  { name: 'Arcade', icon: 'game-controller-outline', iconActive: 'game-controller', label: 'ARCADE' },
  { name: 'Play',   icon: 'timer-outline',           label: 'PLAY', isPlay: true },
  { name: 'Ranks',  icon: 'trophy-outline',          iconActive: 'trophy',          label: 'RANKS' },
  { name: 'You',    icon: 'person-outline',          iconActive: 'person',          label: 'YOU' },
];
// ─── Play button glow colors ─────────────────────────────────────────────────
const PLAY_GOLD       = '#F0CB5B'; // brighter, more saturated than #C9A84C
const PLAY_GOLD_TOP   = '#F7DC82'; // lighter highlight for gradient top
const PLAY_GOLD_BOT   = '#D4A832'; // richer shadow for gradient bottom
const TAB_ACTIVE      = '#E2C66E'; // active tabs: gold, a notch below the Play button
const TAB_INACTIVE    = 'rgba(184,168,130,0.42)';

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
        <Svg width={56} height={56} style={nav.gradientSvg}>
          <Defs>
            <LinearGradient id="playGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PLAY_GOLD_TOP} />
              <Stop offset="1" stopColor={PLAY_GOLD_BOT} />
            </LinearGradient>
          </Defs>
          <Circle cx={28} cy={28} r={27} fill="url(#playGrad)" />
        </Svg>
        <View style={nav.playIconWrap}>
          <Ionicons name="timer-outline" size={26} color="#090F0A" />
        </View>
      </View>

      <Text style={nav.playLabel}>PLAY</Text>
    </TouchableOpacity>
  );
}

function BottomNav({ state, navigation, activeRound, onResume, onAbandon }) {
  const tabs = PLAYER_TABS;
  const insets = useSafeAreaInsets();

  const startNewRound = () => {
    const root = navigation.getParent();
    if (root) root.navigate('ClockedSetup');
    else navigation.navigate('ClockedSetup');
  };

  // With a round already saved, PLAY must not silently start a fresh setup —
  // the new round's first autosave would overwrite the old one. Offer the
  // choice explicitly.
  const onPlayPress = () => {
    if (!activeRound) { startNewRound(); return; }
    const where = `Hole ${activeRound.currentHole ?? 1} · ${activeRound.course?.name ?? 'Quick Play'}`;
    Alert.alert('Round in progress', where, [
      { text: 'Resume', onPress: onResume },
      { text: 'Abandon & start new', style: 'destructive', onPress: async () => { await onAbandon(); startNewRound(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[nav.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tabs.map((tab, i) => {
        const active = state.index === i;

        if (tab.isPlay) {
          return <PlayButton key={tab.name} onPress={onPlayPress} />;
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
            <View style={[nav.iconWrap, active && nav.iconWrapActive]}>
              <Ionicons name={active ? (tab.iconActive ?? tab.icon) : tab.icon} size={22}
                color={active ? TAB_ACTIVE : TAB_INACTIVE} />
            </View>
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
    width: '100%', backgroundColor: '#090D0A', paddingTop: 8,
    borderTopWidth: 1, borderTopColor: '#C9A84C2E',
    flexDirection: 'row', alignItems: 'flex-end',
  },
  item:  { alignItems: 'center', justifyContent: 'flex-end', flex: 1, paddingBottom: 2 },
  iconWrap: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: 'rgba(226,198,110,0.10)' },
  label: { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1.4, marginTop: 4 },

  // Play button — raised out of the bar, same label baseline as the tabs
  playItem: { alignItems: 'center', justifyContent: 'flex-end', flex: 1, paddingBottom: 2 },
  glowRing: {
    position: 'absolute', top: -16, width: 72, height: 72, borderRadius: 36,
    backgroundColor: PLAY_GOLD,
  },
  playCircle: {
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden', marginTop: -24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: PLAY_GOLD, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10,
    borderWidth: 3, borderColor: '#090D0A',
  },
  gradientSvg: { position: 'absolute', top: 0, left: 0 },
  playIconWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 56, height: 56 },
  playLabel: { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1.4, marginTop: 4, color: PLAY_GOLD },

  // Active round banner — floating card anchored above the tab bar (72px
  // tall) instead of docked to the top of the screen, so it sits in the
  // easy-to-reach lower third of the display on any phone size.
  roundBanner: {
    position: 'absolute', left: 16, right: 16, bottom: 104,
    backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.gold,
    borderRadius: 16, paddingVertical: 12, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: COLOR.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    zIndex: 999,
  },
  roundBannerText:        { color: COLOR.gold, fontWeight: '700', fontSize: 11, letterSpacing: 1, marginBottom: 2 },
  roundBannerSub:         { color: COLOR.cream, fontSize: 12 },
  roundBannerAbandon:     { paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#E85D4A33', borderRadius: 8, marginLeft: 8 },
  roundBannerAbandonText: { fontSize: 10, color: '#E85D4A', fontWeight: '600', letterSpacing: 0.5 },
  roundBannerResume:      { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: COLOR.gold, borderRadius: 8, marginLeft: 8 },
  roundBannerResumeText:  { fontSize: 11, color: COLOR.bg, fontWeight: '700' },
});

// ─── Main app (tab navigator) ─────────────────────────────────────────────────
// Rendered as the 'Main' screen in the root stack.
function MainApp({ navigation }) {
  const [showSplash, setShowSplash] = useState(true);
  // The parsed saved round, or null. This is the single source of truth for
  // "round in progress" across the tabs: the floating banner, the PLAY button
  // and the tab screens' bottom inset all read from it.
  const [activeRound, setActiveRound] = useState(null);

  // Read the saved round, applying the staleness rule here \u2014 the one place it
  // is applied \u2014 so the banner can never advertise a round that no longer
  // exists. Re-checked whenever Main regains focus (back from ClockedRound,
  // where the state is written and cleared) and when the app foregrounds.
  const checkActiveRound = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(CLOCKED_ROUND_STATE_KEY);
      if (!saved) { setActiveRound(null); return; }
      const state = JSON.parse(saved);
      const age = Date.now() - (state?.savedAt ?? 0);
      if (!state || age > ACTIVE_ROUND_MAX_AGE_MS) {
        await AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY);
        setActiveRound(null);
        return;
      }
      setActiveRound(state);
    } catch {
      setActiveRound(null);
    }
  }, []);

  useEffect(() => {
    checkActiveRound();
    const appSub = AppState.addEventListener('change', s => { if (s === 'active') checkActiveRound(); });
    const focusSub = navigation.addListener('focus', checkActiveRound);
    return () => { appSub.remove(); focusSub(); };
  }, [navigation, checkActiveRound]);

  const resumeActiveRound = () => {
    if (!activeRound) return;
    navigation.navigate('ClockedRound', { resumeState: activeRound });
  };

  const abandonActiveRound = async () => {
    await AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY).catch(() => {});
    setActiveRound(null);
  };

  const confirmAbandon = () => {
    Alert.alert('Abandon Round?', 'This round will not be saved.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Abandon', style: 'destructive', onPress: abandonActiveRound },
    ]);
  };

  return (
    <ActiveRoundContext.Provider value={{ activeRound }}>
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        tabBar={props => (
          <BottomNav {...props} activeRound={activeRound} onResume={resumeActiveRound} onAbandon={abandonActiveRound} />
        )}
        screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      >
        <Tab.Screen name="Feed"  component={FeedScreen} />
        <Tab.Screen name="Arcade" component={ArcadeHomeScreen} />
        <Tab.Screen name="Play"  component={FeedScreen} />
        <Tab.Screen name="Ranks" component={LeaderboardScreen} />
        <Tab.Screen name="You"   component={ProfileScreen} />
      </Tab.Navigator>
      {/* Floating "round in progress" banner \u2014 anchored low, above the tab
          bar, so it's reachable one-handed instead of pinned to the very
          top of the screen where a thumb can't comfortably reach it. */}
      {activeRound && (
        <View style={nav.roundBanner}>
          <TouchableOpacity style={{ flex: 1 }} onPress={resumeActiveRound} activeOpacity={0.8}>
            <Text style={nav.roundBannerText}>ROUND IN PROGRESS</Text>
            <Text style={nav.roundBannerSub} numberOfLines={1}>
              Hole {activeRound.currentHole ?? 1} {'\u00b7'} {activeRound.course?.name ?? 'Quick Play'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={nav.roundBannerAbandon} onPress={confirmAbandon} activeOpacity={0.7} hitSlop={8}>
            <Text style={nav.roundBannerAbandonText}>ABANDON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={nav.roundBannerResume} onPress={resumeActiveRound} activeOpacity={0.8}>
            <Text style={nav.roundBannerResumeText}>RESUME {'\u2192'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
    </View>
    </ActiveRoundContext.Provider>
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

  useFonts({ Montserrat_700Bold, Montserrat_800ExtraBold });

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
        navRef.current.navigate('Leaderboard');
        break;
      case 'still_playing':
      case 'interaction_ladder':
        navRef.current.navigate('Feed');
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

  // In-progress round detection lives in MainApp (one banner, one staleness
  // rule) — see checkActiveRound there.

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
      // Only route into the app when we're coming from the signed-out flow.
      // refreshProfile() (avatar upload, profile save) must not yank the
      // user off EditProfile / Settings / ArcadeGame back to the feed.
      const AUTH_ROUTES = ['Welcome', 'SignUp', 'SignIn', 'PreviewMode', 'ForgotPassword', 'ResetPassword', 'Underage'];
      if (!topRoute || AUTH_ROUTES.includes(topRoute)) {
        // Check if onboarding is needed
        AsyncStorage.getItem('onboarding_complete').then(val => {
          if (!val) {
            navRef.current?.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
          } else {
            navRef.current?.reset({ index: 0, routes: [{ name: 'Main' }] });
          }
        });
        return;
      }
      // Set up push notifications once after auth is confirmed
      if (!notificationsSetupRef.current) {
        notificationsSetupRef.current = true;
        // setupNotifications() saves the device's current Expo push token to
        // the profile every time it runs, so there is no need to read
        // push_token back first (and the client can no longer read it).
        setupNotifications();
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
    <View style={{ flex: 1, backgroundColor: '#090F0A' }}>
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
        <RootStack.Screen name="PublicProfile"  component={PublicProfileScreen} />
        <RootStack.Screen name="Rivalry"        component={RivalryScreen} />
        <RootStack.Screen name="Admin"          component={AdminScreen} />
        <RootStack.Screen name="ResetPassword"   component={ResetPasswordScreen} />
        <RootStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        {/* Games screen retired — the sport is the one game */}
        {/* LiveRound retired 2026-07-14 — ClockedRound (ClockedSetup → ClockedRound)
            is the one way to play. Untimed logging (Log/ClaimRound) also retired. */}
        <RootStack.Screen name="Settings"       component={SettingsScreen} />
        <RootStack.Screen name="EditProfile"    component={EditProfileScreen} />
        <RootStack.Screen name="Notifications"  component={NotificationCenterScreen} />
        <RootStack.Screen name="Onboarding"     component={OnboardingScreen} />
        <RootStack.Screen name="RulesScreen" component={RulesScreen} />
        <RootStack.Screen name="Leaderboard"   component={LeaderboardScreen} />
        <RootStack.Screen name="ClockedSetup"   component={ClockedSetupScreen} />
        <RootStack.Screen name="ClockedRound"   component={ClockedRoundScreen} />
        <RootStack.Screen name="ConfirmRound"  component={ConfirmRoundScreen} />
        <RootStack.Screen name="ArcadeGame"    component={ArcadeScreen} />
        <RootStack.Screen name="Tournament"       component={TournamentScreen} />
        <RootStack.Screen name="TournamentApply"  component={TournamentApplyScreen} />
      </RootStack.Navigator>
    </NavigationContainer>

    </View>
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
