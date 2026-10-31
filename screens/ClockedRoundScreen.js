import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet,
  Alert, AppState, AccessibilityInfo, KeyboardAvoidingView, Platform, Vibration,
  Animated, Easing, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  scoreHole, summarizeRound, computeTimePar, officialTimeParFor,
  formatSeconds, formatSecondsLong, formatBadge, grossCapForHole,
  timePenalty,
  DEFAULT_SCORING_SCALE, DEFAULT_CLOCK_COEFFICIENTS, DEFAULT_PENALTY_PARAMS,
} from '../lib/clockedSport';
import { CLOCKED_ROUND_STATE_KEY } from '../lib/clockedRoundConstants';
import { fetchClockedRatingForUser } from '../lib/clockedRating';
import { sendPushToUser, sendLocalNotification, sendRankMoveNotification, checkAndSendMilestone, scheduleInactivityReminder, scheduleInteractionLadder, cancelInteractionLadder } from '../lib/notifications';
import * as Notifications from 'expo-notifications';
import {
  startActivity, updateActivity, endActivity,
  getPendingHoleCompletion, clearPendingHoleCompletion,
} from '../modules/clocked-activity/src';
import { COLOR, TYPE, MOTION, ringZone, ringColorForZone, RADIUS } from '../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Colors — Midnight Fairway, from the shared design system ────────────────
const BG         = COLOR.bg;
const CARD       = COLOR.surface;
const GOLD       = COLOR.gold;
const GOLD_ELITE = COLOR.goldBright;
const CREAM      = COLOR.cream;
const MUTED      = COLOR.muted;
const DIM        = COLOR.dim;
const GREEN      = COLOR.green;
const RED_WARN   = COLOR.red;
const BORDER     = COLOR.border;

// ─── Clock color — uses remaining time (countdown perspective) ───────────────
function clockColor(remaining, timePar) {
  return ringColorForZone(ringZone(remaining, timePar));
}

function pointsColor(points) {
  if (points >= 6) return GOLD;
  if (points >= 3) return GREEN;
  if (points >= 1) return CREAM;
  if (points === 0) return MUTED;
  return RED_WARN;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function livePointsForDiff(diff, scoringScale) {
  if (diff <= -3) return { pts: scoringScale.albatross_plus, label: diff === -3 ? 'Albatross' : 'Albatross+' };
  if (diff === -2) return { pts: scoringScale.eagle,         label: 'Eagle' };
  if (diff === -1) return { pts: scoringScale.birdie,        label: 'Birdie' };
  if (diff === 0)  return { pts: scoringScale.par,           label: 'Par' };
  if (diff === 1)  return { pts: scoringScale.bogey,         label: 'Bogey' };
  return { pts: scoringScale.double_plus, label: 'Double+' };
}

// Parse mm:ss string to seconds
function parseTimeInput(str) {
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s > 59) return null;
  return m * 60 + s;
}

// ─── Countdown Ring — the signature element ──────────────────────────────────
// A thin ring drains around the timer as the hole plays. Green -> gold
// (final 25%) -> pulsing red (final 60s or over). A ghost tick shows where
// your personal-best round at this course holed out on this same hole.
const RING_SIZE = 260;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function GhostTick({ progress, size, radius }) {
  if (progress == null) return null;
  const angle = -90 + (1 - progress) * 360; // starts at top, drains clockwise
  const rad = (angle * Math.PI) / 180;
  const cx = size / 2 + radius * Math.cos(rad);
  const cy = size / 2 + radius * Math.sin(rad);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: cx - 4, top: cy - 4,
        width: 8, height: 8, borderRadius: RADIUS.xs,
        backgroundColor: DIM, borderWidth: 1.5, borderColor: CREAM,
      }}
    />
  );
}

// `colorOverride` pins the stroke to a fixed color (the settled verdict color
// once a hole is holed out). `flash` = { color, key } fires a one-shot double
// pulse of a full ring in that color — the verdict beat — whenever `key`
// changes.
function CountdownRing({ progress, zone, ghostProgress, colorOverride, flash, children }) {
  const animatedProgress = useRef(new Animated.Value(progress)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 950,
      easing: Easing.linear,
      useNativeDriver: false, // SVG stroke props aren't native-driver compatible
    }).start();
  }, [progress]);

  useEffect(() => {
    if (!flash?.key) return;
    flashOpacity.setValue(0);
    // Two sharp pulses inside the verdict hold — timing-board, not fireworks.
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 1,    duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(flashOpacity, { toValue: 0.25, duration: 220, useNativeDriver: false }),
      Animated.timing(flashOpacity, { toValue: 1,    duration: 160, useNativeDriver: false }),
      Animated.timing(flashOpacity, { toValue: 0,    duration: Math.max(100, MOTION.verdictHold - 500), useNativeDriver: false }),
    ]).start();
  }, [flash?.key]);

  useEffect(() => {
    let loop;
    if (zone === 'red' && !colorOverride) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.45, duration: 500, useNativeDriver: false }),
          Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: false }),
        ])
      );
      loop.start();
    } else {
      pulse.setValue(1);
    }
    return () => loop?.stop();
  }, [zone, colorOverride]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });
  const color = colorOverride ?? ringColorForZone(zone);

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          stroke={CARD} strokeWidth={RING_STROKE} fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          stroke={color} strokeWidth={RING_STROKE} fill="none"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          opacity={pulse}
        />
        {flash?.color && (
          <AnimatedCircle
            cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
            stroke={flash.color} strokeWidth={RING_STROKE + 2} fill="none"
            opacity={flashOpacity}
          />
        )}
      </Svg>
      <GhostTick progress={ghostProgress} size={RING_SIZE} radius={RING_RADIUS} />
      {children}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ClockedRoundScreen({ navigation, route }) {
  const { user } = useAuth();
  const params = route.params;
  const resumeState  = params.resumeState ?? null;

  const course       = resumeState?.course ?? params.course;
  const holeCount    = resumeState?.holeCount ?? parseInt(params.holes, 10);
  const transport    = resumeState?.transport ?? params.transport;
  const difficulty   = resumeState?.difficulty ?? params.difficulty ?? 'intermediate';
  const mode         = resumeState?.mode ?? params.mode;
  const configSnap   = resumeState?.configSnap ?? params.configSnapshot ?? {};
  const scoringScale = configSnap.scoringScale      ?? DEFAULT_SCORING_SCALE;
  const clockCoeffs  = configSnap.clockCoefficients  ?? DEFAULT_CLOCK_COEFFICIENTS;
  const penaltyParams = configSnap.penaltyParams     ?? DEFAULT_PENALTY_PARAMS;

  const playerDefs       = resumeState?.playerDefs ?? params.players;
  const playerCount      = playerDefs.length;
  const [officialTimePars, setOfficialTimePars] = useState(
    () => resumeState?.officialTimePars ?? params.officialTimePars ?? {}
  );
  // Last-resort par for any hole with no measured data — 3 for par-3/
  // executive courses, 4 otherwise. Computed once in ClockedSetupScreen
  // (via isPar3Course) and carried through so a short course never shows
  // par 4 just because its hole_data/tee data is incomplete.
  const defaultPar = resumeState?.defaultPar ?? params.defaultPar ?? 4;

  // Build initial per-hole data (par/yardage) — mutable for par edits
  const buildInitialHoleData = () => {
    const src = params.holeData;
    return Array.from({ length: holeCount }, (_, i) => ({
      par:     src?.[i]?.par     ?? defaultPar,
      yardage: src?.[i]?.yardage ?? null,
    }));
  };

  const [holeDataState, setHoleDataState] = useState(buildInitialHoleData);

  // ── Core state ──
  const [currentHole, setCurrentHole]       = useState(1);
  const [holeResults, setHoleResults]       = useState([]);
  const [playerStrokes, setPlayerStrokes]   = useState(
    () => playerDefs.map(() => holeDataState[0]?.par ?? defaultPar)
  );
  const [showHolePicker, setShowHolePicker] = useState(false);
  const [isFinishing, setIsFinishing]       = useState(false); // guards against a double-tap double-inserting the round

  // Clock
  const [clockRunning, setClockRunning]     = useState(false);
  const [clockStartedAt, setClockStartedAt] = useState(null);
  const [displayElapsed, setDisplayElapsed] = useState(0);
  const [holeFrozenTime, setHoleFrozenTime] = useState(null);

  const [roundStartTs] = useState(() => Date.now());
  const [showScorecard, setShowScorecard]   = useState(false);

  // ── Ghost Race — personal best round at this course, per-hole ──
  // Maps hole number -> fraction of that hole's time par remaining when the
  // ghost holed out (0 = used all their time, 1 = instant). Normalized so it
  // still means something even if this round's time par differs slightly.
  const [ghostByHole, setGhostByHole] = useState({});
  useEffect(() => {
    if (!course?.name) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const uid = authUser?.id ?? user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from('rounds')
          .select('id, hole_scores, active_game')
          .eq('user_id', uid)
          .eq('course_name', course.name)
          .eq('round_format', 'clocked')
          .not('hole_scores', 'is', null)
          .limit(25);
        if (cancelled || !data?.length) return;
        let best = null, bestPts = -Infinity;
        for (const r of data) {
          const pts = r.active_game?.summary?.totalScore;
          if (typeof pts === 'number' && pts > bestPts) { bestPts = pts; best = r; }
        }
        if (!best) return;
        const map = {};
        for (const h of best.hole_scores ?? []) {
          if (h?.timePar > 0 && h?.elapsed != null) {
            map[h.hole] = Math.max(0, Math.min(1, (h.timePar - h.elapsed) / h.timePar));
          }
        }
        if (!cancelled) setGhostByHole(map);
      } catch { /* ghost is a bonus, never block the round */ }
    })();
    return () => { cancelled = true; };
  }, [course?.name]);

  // ── Sound identity — buzzer on expiry, chime when you beat the clock ──
  const buzzerPlayer = useAudioPlayer(require('../assets/sounds/buzzer.wav'));
  const chimePlayer  = useAudioPlayer(require('../assets/sounds/chime.wav'));
  const playBuzzer = useCallback(() => {
    try { buzzerPlayer.seekTo(0); buzzerPlayer.play(); } catch {}
  }, [buzzerPlayer]);
  const playChime = useCallback(() => {
    try { chimePlayer.seekTo(0); chimePlayer.play(); } catch {}
  }, [chimePlayer]);

  // ── Holed-out verdict beat — the single most filmable moment in the app ──
  // Fires exactly once per hole-out (button tap, lock-screen "Holed Out", or
  // a cold-start hand-off of that tap). NOT on plain resume/restore of an
  // already-completed hole — the settled delta block below is derived from
  // holeFrozenTime at render time, so restore shows the result without
  // replaying the moment. `verdictBeat` is non-null only during the hold.
  const [verdictBeat, setVerdictBeat] = useState(null); // { beat, delta, color, key }
  const verdictScale   = useRef(new Animated.Value(0.6)).current;
  const verdictOpacity = useRef(new Animated.Value(0)).current;
  const verdictTimer   = useRef(null);
  useEffect(() => () => clearTimeout(verdictTimer.current), []);

  const showVerdict = useCallback((holeTime, timePar) => {
    const delta = timePar - holeTime; // positive = beat the clock
    const beat  = delta >= 0;
    const color = beat ? GREEN : RED_WARN;

    if (beat) {
      playChime();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      // Buzzer already fired at the moment of expiry if the clock ran that
      // long — no need to double up, just the warning tap + red verdict.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    clearTimeout(verdictTimer.current);
    setVerdictBeat({ beat, delta: Math.abs(delta), color, key: Date.now() });
    verdictScale.setValue(0.6);
    verdictOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(verdictOpacity, { toValue: 1, duration: MOTION.fast, useNativeDriver: true }),
      Animated.timing(verdictScale,   { toValue: 1, duration: MOTION.standard, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start();
    verdictTimer.current = setTimeout(() => {
      Animated.timing(verdictOpacity, { toValue: 0, duration: MOTION.fast, useNativeDriver: true })
        .start(() => setVerdictBeat(null));
    }, MOTION.verdictHold);
  }, [playChime, verdictScale, verdictOpacity]);

  // Drop an in-flight hold when the hole changes underneath it.
  const cancelVerdict = useCallback(() => {
    clearTimeout(verdictTimer.current);
    setVerdictBeat(null);
  }, []);

  // Edit modal
  const [editHoleIdx, setEditHoleIdx]       = useState(null); // null = closed
  const [editingTime, setEditingTime]       = useState(false);
  const [editTimeStr, setEditTimeStr]       = useState('');

  // ── Clock tick (timestamp-anchored) ──
  const clockRef = useRef(null);
  const reconcileClock = useCallback(() => {
    if (clockRunning && clockStartedAt) {
      setDisplayElapsed(Math.floor((Date.now() - clockStartedAt) / 1000));
    }
  }, [clockRunning, clockStartedAt]);

  useEffect(() => {
    if (clockRunning && clockStartedAt) {
      reconcileClock();
      clockRef.current = setInterval(reconcileClock, 1000);
    } else {
      clearInterval(clockRef.current);
    }
    return () => clearInterval(clockRef.current);
  }, [clockRunning, clockStartedAt, reconcileClock]);

  // ── Current hole data ──
  const holeIdx     = currentHole - 1;
  const curHoleData = holeDataState[holeIdx] ?? { par: defaultPar, yardage: null, handicap: 18 };
  const curOfficialSeconds = officialTimeParFor(officialTimePars?.[currentHole], transport, playerCount);
  const curTimePar  = computeTimePar(curHoleData.yardage, curHoleData.par, playerCount, transport, difficulty, curOfficialSeconds, clockCoeffs);

  // ── Persistence ──
  const buildRoundState = (overrides = {}) => ({
    roundStartTs, course, holeCount, transport, difficulty, mode,
    holeDataState, playerDefs, configSnap, currentHole, holeResults,
    playerStrokes, clockRunning, clockStartedAt, holeFrozenTime, officialTimePars,
    defaultPar, savedAt: Date.now(), ...overrides,
  });
  const persistRound = (overrides) =>
    AsyncStorage.setItem(CLOCKED_ROUND_STATE_KEY, JSON.stringify(buildRoundState(overrides))).catch(() => {});

  useEffect(() => {
    // Nothing worth saving until the round has actually begun. A frozen hole
    // counts: holing out on hole 1 (before NEXT HOLE pushes a result) must
    // persist, or leaving the screen resumes into a still-running clock.
    const roundHasBegun = holeResults.length > 0 || clockRunning || holeFrozenTime != null;
    if (!roundHasBegun) return;
    persistRound();
  }, [currentHole, holeResults, playerStrokes, clockRunning, holeFrozenTime, holeDataState]);

  // ── Resume from saved state ──
  useEffect(() => {
    if (!resumeState) return;
    setCurrentHole(resumeState.currentHole ?? 1);
    setHoleResults(resumeState.holeResults ?? []);
    setPlayerStrokes(resumeState.playerStrokes ?? playerDefs.map(() => defaultPar));
    setClockRunning(resumeState.clockRunning ?? false);
    setHoleFrozenTime(resumeState.holeFrozenTime ?? null);
    if (resumeState.holeDataState) setHoleDataState(resumeState.holeDataState);
    if (resumeState.officialTimePars) setOfficialTimePars(resumeState.officialTimePars);
    if (resumeState.clockRunning && resumeState.clockStartedAt) {
      setClockStartedAt(resumeState.clockStartedAt);
    }
    sendLocalNotification('Round Resumed', `Back on hole ${resumeState.currentHole}.`);

    // ── Lock-screen "Holed Out" hand-off (cold start) ──
    // If the app was killed (not just backgrounded), the AppState 'active'
    // listener near the clock controls never fires before this screen
    // remounts, so check for a pending lock-screen completion here too —
    // using the resumed values directly, since the setState calls above
    // haven't committed yet within this same effect pass. This IS a real
    // hole-out (the golfer tapped the lock screen), so it gets the same
    // verdict beat as an in-app tap — computed against the resumed hole's
    // time par, since curTimePar still reflects hole 1 here.
    if (resumeState.clockRunning && resumeState.clockStartedAt) {
      (async () => {
        try {
          const pending = await getPendingHoleCompletion();
          if (!pending) return;
          await clearPendingHoleCompletion();
          const resumedHole = resumeState.currentHole ?? 1;
          if (pending.holeNumber === resumedHole) {
            const finalElapsed = Math.max(0, Math.floor((pending.timestamp - resumeState.clockStartedAt) / 1000));
            const hd = (resumeState.holeDataState ?? [])[resumedHole - 1] ?? { par: defaultPar, yardage: null };
            const offSec = officialTimeParFor((resumeState.officialTimePars ?? officialTimePars)?.[resumedHole], transport, playerCount);
            const resumedTimePar = computeTimePar(hd.yardage, hd.par, playerCount, transport, difficulty, offSec, clockCoeffs);
            setDisplayElapsed(finalElapsed);
            setHoleFrozenTime(finalElapsed);
            setClockRunning(false);
            endActivity().catch(() => {});
            showVerdict(finalElapsed, resumedTimePar);
          }
        } catch {}
      })();
    }
  }, []);

  // ── Cleanup Live Activity on unmount ──
  useEffect(() => {
    return () => { endActivity().catch(() => {}); };
  }, []);

  // ── Clock controls ──
  const startClock = () => {
    cancelVerdict();
    setClockStartedAt(Date.now());
    setDisplayElapsed(0);
    setHoleFrozenTime(null);
    setClockRunning(true);
    scheduleInteractionLadder(course?.name ?? 'your course').catch(() => {});
    startActivity(currentHole, curHoleData.par, Date.now() + curTimePar * 1000).catch(() => {});
  };

  // atMs lets a lock-screen "Holed Out" tap freeze the clock at the moment
  // the golfer actually tapped it rather than whenever the app happens to
  // reopen — see the pending-hole-completion handling just below.
  const stopClockAt = (atMs, { verdict = true } = {}) => {
    const finalElapsed = clockStartedAt ? Math.max(0, Math.floor((atMs - clockStartedAt) / 1000)) : 0;
    setDisplayElapsed(finalElapsed);
    setHoleFrozenTime(finalElapsed);
    setClockRunning(false);
    endActivity().catch(() => {});

    // The verdict — instant, emotional, shareable. Skipped when the clock is
    // stopped for a non-golf reason (pausing/minimizing the round).
    if (verdict) showVerdict(finalElapsed, curTimePar);
  };

  const stopClock = (opts) => stopClockAt(Date.now(), opts);

  // ── Lock-screen "Holed Out" hand-off ──
  // The Live Activity's button runs an AppIntent inside the widget extension
  // process and has no Supabase/app-state access there, so it just drops
  // {holeNumber, timestamp} into the shared App Group UserDefaults (see
  // targets/clock-widget/HoledOutIntent.swift). Every time the app comes
  // back to the foreground we check for that signal and, if it matches the
  // hole currently on the clock, freeze the timer at the moment the golfer
  // actually tapped it — not "now" — so a golfer who beat the clock and
  // tapped from the lock screen never sees a false "OVER" verdict just
  // because unlocking the phone took a few extra seconds.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active') return;
      reconcileClock();
      try {
        const pending = await getPendingHoleCompletion();
        if (!pending) return;
        await clearPendingHoleCompletion();
        if (pending.holeNumber === currentHole && clockRunning) {
          stopClockAt(pending.timestamp);
        }
      } catch {}
    });
    return () => sub.remove();
  }, [reconcileClock, currentHole, clockRunning, stopClockAt]);

  // ── Change par for current hole ──
  const applyParChange = (newPar) => {
    setHoleDataState(prev => {
      const updated = [...prev];
      updated[holeIdx] = { ...updated[holeIdx], par: newPar };
      return updated;
    });
    // Reset strokes to new par
    setPlayerStrokes(playerDefs.map(() => newPar));
    // Sync Live Activity endTime if clock is running
    if (clockRunning && clockStartedAt) {
      try {
        const newOfficialSec = officialTimeParFor(officialTimePars?.[currentHole], transport, playerCount);
        const newTP = computeTimePar(curHoleData.yardage, newPar, playerCount, transport, difficulty, newOfficialSec, clockCoeffs);
        const elapsedNow = Math.floor((Date.now() - clockStartedAt) / 1000);
        updateActivity(currentHole, newPar, Date.now() + (newTP - elapsedNow) * 1000).catch(() => {});
      } catch {}
    }
  };

  const setCurrentPar = (newPar) => {
    // Only prompt when someone actually entered strokes that differ from the
    // current par — untouched/default players lose nothing, so no friction.
    const hasEnteredStrokes = playerStrokes.some(s => s !== curHoleData.par);
    if (hasEnteredStrokes) {
      Alert.alert('Change Par?', 'Strokes already entered for this hole will be reset to the new par.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change Anyway', style: 'destructive', onPress: () => applyParChange(newPar) },
      ]);
      return;
    }
    applyParChange(newPar);
  };

  // ── Score this hole ──
  const completeHole = () => {
    const elapsed = holeFrozenTime ?? displayElapsed;
    const playersForScoring = playerDefs.map((p, i) => ({
      name: p.name,
      grossStrokes: playerStrokes[i],
    }));
    const config = { scoringScale, clockCoefficients: clockCoeffs, penaltyParams, transport, playerCount, difficulty, officialTimePars, holeNumber: currentHole };
    const result = scoreHole(playersForScoring, elapsed, curHoleData, config);
    // Store by hole number (index = hole - 1), never by completion order —
    // the hole picker lets players jump around (shotgun starts, joining a
    // round late), so array position must always match the physical hole.
    // Unplayed holes stay undefined/null and summarizeRound() already
    // filters those out, so skipped holes never get a phantom score.
    const newResults = [...holeResults];
    newResults[currentHole - 1] = result;
    setHoleResults(newResults);

    if (currentHole >= holeCount) {
      finishRound(newResults);
    } else {
      cancelVerdict();
      const nextPar = holeDataState[currentHole]?.par ?? defaultPar;
      setCurrentHole(currentHole + 1);
      setPlayerStrokes(playerDefs.map(() => nextPar));
      setClockRunning(false);
      setClockStartedAt(null);
      setDisplayElapsed(0);
      setHoleFrozenTime(null);
    }
  };

  // ── Jump to any hole (shotgun starts, joining a round late, replaying a
  // hole out of order) ── Cleanly resets clock/stroke state for the new
  // hole; par/time-par/timer all re-derive from currentHole + holeDataState
  // on the next render, so nothing carries over stale from the hole we're
  // leaving. Does NOT touch holeResults — an in-progress, unfinished hole
  // never gets scored just because the player navigated away from it.
  const jumpToHole = (n) => {
    if (n === currentHole) { setShowHolePicker(false); return; }
    const doJump = () => {
      cancelVerdict();
      endActivity().catch(() => {});
      setCurrentHole(n);
      setClockRunning(false);
      setClockStartedAt(null);
      setDisplayElapsed(0);
      setHoleFrozenTime(null);
      const parForHole = holeDataState[n - 1]?.par ?? defaultPar;
      setPlayerStrokes(playerDefs.map(() => parForHole));
      setShowHolePicker(false);
    };
    // Only prompt when the clock is actually running — nothing to lose
    // otherwise, so don't add friction to a plain hole jump.
    if (clockRunning) {
      Alert.alert('Jump Hole?', 'The clock is still running on this hole. Jumping away will reset it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Jump Anyway', style: 'destructive', onPress: doJump },
      ]);
      return;
    }
    doJump();
  };

  // ── Edit a past hole ──
  const rescoreHole = (idx, newPar, newStrokes, newElapsed) => {
    const updatedHoleData = [...holeDataState];
    updatedHoleData[idx] = { ...updatedHoleData[idx], par: newPar };
    setHoleDataState(updatedHoleData);

    const playersForScoring = playerDefs.map((p, i) => ({
      name: p.name,
      grossStrokes: newStrokes[i],
    }));
    const config = { scoringScale, clockCoefficients: clockCoeffs, penaltyParams, transport, playerCount, difficulty, officialTimePars, holeNumber: idx + 1 };
    const result = scoreHole(playersForScoring, newElapsed, updatedHoleData[idx], config);

    const newResults = [...holeResults];
    newResults[idx] = result;
    setHoleResults(newResults);
  };

  // ── Finish round ──
  const finishRound = async (results) => {
    setIsFinishing(true);
    endActivity().catch(() => {});
    const summary = summarizeRound(results);
    // `results` is indexed by hole number and may have gaps (holes skipped
    // via the hole picker never got scored) — map with the real index for
    // the hole number, then drop the gaps so we never persist a phantom
    // score for a hole that was never played.
    const holeScoresJson = results
      .map((r, i) => (r == null ? null : {
        hole: i + 1, par: r.par, yardage: r.yardage, yardsUsed: r.yardsUsed,
        yardageSource: r.yardageSource, elapsed: r.elapsed, timePar: r.timePar,
        penalty: r.penalty, holeScore: r.holeScore, difficulty,
        timeParSource: r.timeParSource ?? 'tier',
        players: r.playerResults.map(pr => ({
          name: pr.name, grossStrokes: pr.grossStrokes,
          points: pr.points, label: pr.label,
        })),
      }))
      .filter(Boolean);
    const activeGameJson = {
      format: 'clocked', mode: mode === 1 ? 'solo' : String(mode), transport,
      tee: params.selectedTee ? { tee_name: params.selectedTee.tee_name, total_yards: params.selectedTee.total_yards } : null,
      nine: params.selectedNine, coefficientsSnapshot: configSnap,
      summary: { totalScore: summary.totalScore, totalTimePar: summary.totalTimePar,
        totalElapsed: summary.totalElapsed, totalPenalty: summary.totalPenalty, playerTotals: summary.playerTotals },
    };
    const durationMinutes = Math.max(1, Math.round((Date.now() - roundStartTs) / 60000));
    try {
      // Get fresh auth uid — don't rely on context which may be stale
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const uid = authUser?.id ?? user?.id;
      if (!uid) { Alert.alert('Not signed in', 'Restart the app and sign in again, then save the round.'); return; }

      // Daily rate limit (20 rounds per 24h)
      const { count: todayCount } = await supabase
        .from('rounds').select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if ((todayCount ?? 0) >= 20) {
        Alert.alert('Slow down', "You've logged 20 rounds in the last 24 hours. Take a breather and come back soon!");
        return;
      }

      let row = {
        user_id: uid, course_name: course?.name ?? null, holes: String(holeCount), transport,
        difficulty, players: String(playerCount), tee_time: new Date(roundStartTs).toISOString(),
        finish_time: new Date().toISOString(), duration_minutes: durationMinutes,
        round_format: 'clocked', hole_scores: holeScoresJson, active_game: activeGameJson,
        flagged: false, verification_level: 'self_reported',
      };


      let savedRoundId = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await supabase.from('rounds').insert([row]).select('id');

        if (!result.error) {
          savedRoundId = result.data?.[0]?.id ?? null;
          break;
        }

        // Only retry schema-cache errors (column not found = 42703)
        if (result.error.code !== '42703') {
          Alert.alert('Could not save round', result.error.message);
          return;
        }
        const match = result.error.message.match(/column "([^"]+)" of relation/);
        if (!match) { Alert.alert('Could not save round', result.error.message); return; }
        const { [match[1]]: _dropped, ...rest } = row;
        row = rest;
      }

      // Create round_participants for linked players (with per-player hole_scores)
      if (savedRoundId) {
        const participantRows = playerDefs
          .map((p, i) => {
            if (!p.userId) return null; // guest — no account
            // Build this player's hole_scores from the results — skip holes
            // that were never played (jumped past via the hole picker).
            const playerHoleScores = results
              .map((r, hi) => {
                if (r == null) return null;
                const pr = r.playerResults?.[i];
                return { hole: hi + 1, par: r.par, grossStrokes: pr?.grossStrokes, points: pr?.points, label: pr?.label };
              })
              .filter(Boolean);
            const totalPoints = playerHoleScores.reduce((s, h) => s + (h.points ?? 0), 0);
            return {
              round_id:     savedRoundId,
              user_id:      p.userId,
              player_key:   p.name,
              status:       p.userId === uid ? 'confirmed' : 'pending',
              confirmed_at: p.userId === uid ? new Date().toISOString() : null,
              hole_scores:  playerHoleScores,
              total_points: totalPoints,
            };
          })
          .filter(Boolean);

        if (participantRows.length > 0) {
          const partResult = await supabase.from('round_participants').insert(participantRows);
        }

        // Notify pending participants
        const pending = participantRows.filter(r => r.status === 'pending');
        const loggerName = playerDefs.find(p => p.userId === uid)?.name ?? 'Your partner';
        for (const p of pending) {
          sendPushToUser(
            p.user_id,
            'Confirm your round',
            `${loggerName} logged an on-the-clock round at ${course?.name ?? 'a course'} \u2014 confirm your scores.`,
            'round_confirm',
            { round_id: savedRoundId, player_key: p.player_key },
          ).catch(() => {});
        }
      }

      // Post to activity feed — fire and forget, never block round save
      if (savedRoundId) {
        (async () => { try { await supabase.from('activity_feed').insert({
          user_id:  uid,
          type:     'round_logged',
          round_id: savedRoundId,
          content: {
            course_name:      course?.name ?? null,
            holes:            String(holeCount),
            transport,
            players:          String(playerCount),
            duration_minutes: durationMinutes,
            round_format:     'clocked',
            difficulty,
            team_score:       summary.totalScore,
            total_elapsed:    summary.totalElapsed,
            total_time_par:   summary.totalTimePar,
          },
        }); } catch {} })();
      }

      // Cancel interaction ladder + schedule post-round notifications
      cancelInteractionLadder().catch(() => {});

      // Milestone + inactivity (fire-and-forget, never block save).
      // Exactly one re-engagement notification per round, delayed at least an
      // hour so it's a reason to come back rather than an instant confirmation
      // — milestone-flavored when this round hit one (1/5/10/25 rounds),
      // otherwise the generic score nudge. Never both, so a round never
      // double-buzzes the player.
      (async () => {
        let milestoneHit = null;
        try {
          const { count: totalRoundsCount } = await supabase
            .from('rounds').select('id', { count: 'exact', head: true })
            .eq('user_id', uid).not('flagged', 'is', true);
          // Feed milestone copy must show the same 0–100 Clocked Score as the
          // Profile screen, not the raw per-round points total — compute it
          // the same canonical way (see lib/clockedRating.js).
          let clockedScoreForMilestone = summary.totalScore;
          try {
            const { data: profileRow } = await supabase
              .from('profiles').select('full_name, username, handicap_index').eq('id', uid).maybeSingle();
            const rating = await fetchClockedRatingForUser(supabase, uid, profileRow);
            if (rating?.clockedScore != null) clockedScoreForMilestone = rating.clockedScore;
          } catch {}
          milestoneHit = await checkAndSendMilestone(totalRoundsCount ?? 1, clockedScoreForMilestone, 0, uid, 3600);
        } catch {}
        scheduleInactivityReminder().catch(() => {});

        if (!milestoneHit) {
          Notifications.scheduleNotificationAsync({
            content: { title: 'Check your Clocked Score', body: 'Your round is logged. See how it moved your score →' },
            trigger: { seconds: 3600, repeats: false },
          }).catch(() => {});
        }
      })();

      AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY).catch(() => {});
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      navigation.navigate('Share', {
        roundFormat: 'clocked', courseName: course?.name ?? 'Quick Play', date: dateStr,
        holes: String(holeCount), transport, difficulty, durationMinutes,
        teamScore: summary.totalScore, totalTimePar: summary.totalTimePar,
        totalElapsed: summary.totalElapsed, totalPenalty: summary.totalPenalty,
        playerTotals: summary.playerTotals, formatBadge: formatBadge(playerCount),
        holeScores: results.filter(Boolean).slice(0, holeCount),
      });
    } catch (e) {
      Alert.alert('Round not saved', 'Check your connection and tap Save again. Your scores are still here.');
    } finally {
      setIsFinishing(false);
    }
  };

  // Pause round — navigate away without losing state
  const handlePause = () => {
    if (clockRunning) {
      stopClock({ verdict: false });
      // The setState calls inside stopClock won't commit before we leave the
      // screen, so the persistence effect never sees the paused values. Write
      // the paused snapshot explicitly or resume comes back with the clock
      // still running and penalties piling up.
      const pausedElapsed = clockStartedAt ? Math.max(0, Math.floor((Date.now() - clockStartedAt) / 1000)) : 0;
      persistRound({ clockRunning: false, holeFrozenTime: pausedElapsed });
    }
    navigation.navigate('Main');
  };

  // Abandon round — destructive, clears state
  const handleAbandon = () => {
    Alert.alert('Abandon Round?', 'This round will not be saved.', [
      { text: 'Keep Playing', style: 'cancel' },
      { text: 'Abandon', style: 'destructive', onPress: async () => {
        cancelInteractionLadder().catch(() => {});
        endActivity().catch(() => {});
        await AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY);
        navigation.navigate('Main');
      }},
    ]);
  };

  const adjustStrokes = (playerIdx, delta) => {
    setPlayerStrokes(prev => {
      const updated = [...prev];
      const cap = grossCapForHole(curHoleData.par);
      const newVal = updated[playerIdx] + delta;
      if (newVal < 1) return prev;
      updated[playerIdx] = Math.min(newVal, cap);
      return updated;
    });
  };

  // ── Expiry alarm — fires once per hole, the instant time par runs out ──
  const expiredRef = useRef(false);
  useEffect(() => { expiredRef.current = false; }, [currentHole]);

  // ── Derived ──
  const runningSummary = summarizeRound(holeResults);
  const elapsed       = clockRunning ? displayElapsed : (holeFrozenTime ?? 0);
  const remaining     = curTimePar - elapsed;
  const ringZoneNow    = ringZone(remaining, curTimePar);

  // Sharp buzzer + strong haptic the instant time par expires (broadcast-grade,
  // unmistakable — also a sponsorable asset: "the [Sponsor] buzzer").
  useEffect(() => {
    if (clockRunning && remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      playBuzzer();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Vibration.vibrate([0, 250, 100, 250]);
    }
  }, [remaining, clockRunning]);

  // Subtle haptic heartbeat in the final minute — the phone itself gets tense.
  useEffect(() => {
    if (!clockRunning || remaining > 60 || remaining <= 0) return;
    const beat = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 1000);
    return () => clearInterval(beat);
  }, [clockRunning, remaining > 60, remaining <= 0]);

  const holeStopped   = holeFrozenTime != null;
  const ghostProgress = ghostByHole[currentHole];

  // Settled verdict — derived, not stored, so it's correct on restore and
  // tracks a hand-edited hole time. positive delta = beat the clock.
  const settledDelta  = holeStopped ? curTimePar - holeFrozenTime : 0;
  const settledBeat   = settledDelta >= 0;
  const settledColor  = settledBeat ? GREEN : RED_WARN;

  // Once holed out the ring stops being a countdown and becomes the record:
  // the arc is the share of time par actually used, in the verdict color,
  // and the digits are the hole time. (Showing leftover time there read as
  // "the hole took 4:38" on screen — it didn't.)
  const clkColor      = holeStopped ? settledColor : clockColor(remaining, curTimePar);
  const ringProgress  = holeStopped
    ? Math.max(0, Math.min(1, holeFrozenTime / Math.max(1, curTimePar)))
    : Math.max(0, Math.min(1, remaining / Math.max(1, curTimePar)));

  // Live ghost race pill — "ahead of" / "behind" ghost while the clock runs
  const ghostDeltaLabel = useMemo(() => {
    if (ghostProgress == null || !clockRunning) return null;
    const ghostElapsedEquiv = (1 - ghostProgress) * curTimePar;
    const diff = Math.round(ghostElapsedEquiv - elapsed);
    if (Math.abs(diff) < 1) return { text: 'DEAD EVEN WITH GHOST', color: GOLD };
    return diff > 0
      ? { text: `AHEAD OF GHOST BY ${formatSeconds(diff)}`, color: GREEN }
      : { text: `BEHIND GHOST BY ${formatSeconds(Math.abs(diff))}`, color: RED_WARN };
  }, [ghostProgress, elapsed, clockRunning, curTimePar]);

  // ── Countdown display ──
  let clockDisplay, clockSuffix;
  if (holeStopped) {
    clockDisplay = formatSeconds(holeFrozenTime);
    clockSuffix  = 'HOLE TIME';
  } else if (remaining >= 0) {
    clockDisplay = formatSeconds(remaining);
    clockSuffix  = null;
  } else {
    clockDisplay = formatSeconds(Math.abs(remaining));
    clockSuffix  = 'OVER';
  }

  // Live penalty for current hole (while clock is running or stopped)
  const livePenalty = timePenalty(elapsed, curTimePar, penaltyParams);

  return (
    <SafeAreaView style={st.container}>
      {/* ── Header ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={handlePause} style={st.headerBtn} accessibilityLabel="Pause round">
          <Ionicons name="chevron-down-outline" size={22} color={GOLD} />
        </TouchableOpacity>
        <TouchableOpacity
          style={st.headerCenter}
          onPress={() => setShowHolePicker(true)}
          activeOpacity={0.7}
          accessibilityLabel="Jump to a different hole"
          accessibilityRole="button"
        >
          <View style={st.headerTitleRow}>
            <Text style={st.headerTitle}>HOLE {currentHole}</Text>
            <Ionicons name="chevron-expand-outline" size={12} color={GOLD} style={{ marginLeft: 4 }} />
          </View>
          <Text style={st.headerSub}>
            Par {curHoleData.par}{curHoleData.yardage ? `  ·  ${curHoleData.yardage} yds` : ''}
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity onPress={() => navigation.navigate('RulesScreen')} style={st.headerBtn} accessibilityLabel="Rules">
            <Ionicons name="help-circle-outline" size={20} color={GOLD} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowScorecard(!showScorecard)} style={st.headerBtn} accessibilityLabel="Toggle scorecard">
            <Ionicons name={showScorecard ? 'timer-outline' : 'list-outline'} size={20} color={GOLD} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Round context chips: course · format · transport · difficulty ── */}
      <View style={st.chipRow}>
        {!!course?.name && <Text style={[st.chip, st.chipCourse]} numberOfLines={1}>{course.name}</Text>}
        <Text style={st.chip}>{formatBadge(playerCount)}</Text>
        <Text style={st.chip}>{String(transport ?? '').toUpperCase()}</Text>
        <Text style={st.chip}>{String(difficulty ?? '').toUpperCase()}</Text>
      </View>

      {/* ── Scorecard overlay ── */}
      {showScorecard ? (
        <ScrollView style={st.scorecardWrap} contentContainerStyle={st.scorecardContent}>
          <Text style={st.scTitle}>SCORECARD</Text>
          <Text style={st.scHint}>Tap a hole to edit</Text>
          <View style={st.scHeaderRow}>
            <Text style={[st.scCell, st.scCellHole]} numberOfLines={1}>#</Text>
            <Text style={[st.scCell, st.scCellPar]}>PAR</Text>
            {playerDefs.map((p, i) => (
              <Text key={i} style={[st.scCell, st.scCellPlayer]} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
            ))}
            <Text style={[st.scCell, st.scCellTime]}>TIME</Text>
            <Text style={[st.scCell, st.scCellScore]}>PTS</Text>
          </View>
          {/* Sparse array \u2014 holes can be scored out of order via the hole
              picker, so index into holeResults by real hole number and skip
              any hole that hasn't been played yet rather than mis-labeling
              rows by completion order. */}
          {Array.from({ length: holeCount }, (_, i) => i)
            .map(i => {
              const r = holeResults[i];
              if (r == null) {
                // Unplayed: show the row so the card reads as a scorecard from hole 1.
                const isCurrent = i + 1 === currentHole;
                const par = holeDataState?.[i]?.par ?? defaultPar;
                return (
                  <View key={i} style={[st.scRow, isCurrent && st.scRowCurrent]}>
                    <Text style={[st.scCell, st.scCellHole, isCurrent ? st.scValText : st.scDimText]}>{i + 1}</Text>
                    <Text style={[st.scCell, st.scCellPar, st.scDimText]}>{par ?? '\u2014'}</Text>
                    {playerDefs.map((_, j) => <Text key={j} style={[st.scCell, st.scCellPlayer, st.scDimText]}>{'\u2014'}</Text>)}
                    <Text style={[st.scCell, st.scCellTime, st.scDimText]}>{isCurrent ? 'LIVE' : '\u2014'}</Text>
                    <Text style={[st.scCell, st.scCellScore, st.scDimText]}>{'\u2014'}</Text>
                  </View>
                );
              }
              return (
                <TouchableOpacity key={i} style={st.scRow} onPress={() => setEditHoleIdx(i)} activeOpacity={0.7}>
                  <Text style={[st.scCell, st.scCellHole, st.scValText]}>{i + 1}</Text>
                  <Text style={[st.scCell, st.scCellPar, st.scValText]}>{r.par}</Text>
                  {r.playerResults.map((pr, j) => (
                    <Text key={j} style={[st.scCell, st.scCellPlayer, { color: pointsColor(pr.points) }]}>
                      {pr.points > 0 ? `+${pr.points}` : pr.points}
                    </Text>
                  ))}
                  <Text style={[st.scCell, st.scCellTime, st.scValText]} numberOfLines={1}>
                    {formatSeconds(r.elapsed)}{r.penalty < 0 ? <Text style={{ color: RED_WARN }}> {r.penalty}</Text> : null}
                  </Text>
                  <Text style={[st.scCell, st.scCellScore, { color: r.holeScore >= 0 ? GREEN : RED_WARN, fontWeight: '700' }]}>
                    {r.holeScore > 0 ? `+${r.holeScore}` : r.holeScore}
                  </Text>
                </TouchableOpacity>
              );
            })}
          <View style={[st.scRow, st.scTotalRow]}>
            <Text style={[st.scCell, st.scCellHole, st.scTotalText]} numberOfLines={1}>Σ</Text>
            <Text style={[st.scCell, st.scCellPar, st.scTotalText]}>{Array.from({ length: holeCount }, (_, i) => holeDataState?.[i]?.par ?? defaultPar).reduce((a, b) => a + (b ?? 0), 0)}</Text>
            {runningSummary.playerTotals.map((pt, i) => (
              <Text key={i} style={[st.scCell, st.scCellPlayer, st.scTotalText, { color: pointsColor(pt.totalPoints) }]}>
                {pt.totalPoints > 0 ? `+${pt.totalPoints}` : pt.totalPoints}
              </Text>
            ))}
            <Text style={[st.scCell, st.scCellTime, st.scTotalText]} numberOfLines={1}>
              {formatSeconds(runningSummary.totalElapsed)}{runningSummary.totalPenalty < 0 ? <Text style={{ color: RED_WARN }}> {runningSummary.totalPenalty}</Text> : null}
            </Text>
            <Text style={[st.scCell, st.scCellScore, st.scTotalText, { color: runningSummary.totalScore >= 0 ? GREEN : RED_WARN, fontWeight: '700' }]}>
              {runningSummary.totalScore > 0 ? `+${runningSummary.totalScore}` : runningSummary.totalScore}
            </Text>
          </View>

          {/* Abandon button — only in scorecard */}
          <TouchableOpacity style={st.abandonBtn} onPress={handleAbandon} activeOpacity={0.8}>
            <Text style={st.abandonBtnText}>ABANDON ROUND</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={st.mainContent} showsVerticalScrollIndicator={false}>

          {/* ── Running total strip ── */}
          <View style={st.totalStrip}>
            <Text style={st.totalLabel}>{playerDefs.length > 1 ? 'TEAM TOTAL' : 'TOTAL'}</Text>
            <Text style={[st.totalValue, { color: runningSummary.totalScore >= 0 ? GREEN : RED_WARN }]}>
              {runningSummary.totalScore > 0 ? `+${runningSummary.totalScore}` : runningSummary.totalScore}
            </Text>
            <Text style={st.totalHoles}>{runningSummary.holesPlayed}/{holeCount} holes</Text>
          </View>

          {/* ── Shot Clock (COUNTDOWN) — the signature element ── */}
          <View style={st.clockWrap}>
            <CountdownRing
              progress={ringProgress}
              zone={ringZoneNow}
              ghostProgress={ghostProgress}
              colorOverride={holeStopped ? settledColor : null}
              flash={verdictBeat ? { color: verdictBeat.color, key: verdictBeat.key } : null}
            >
              {verdictBeat ? (
                <Animated.View
                  style={[st.verdictCenter, { opacity: verdictOpacity, transform: [{ scale: verdictScale }] }]}
                  pointerEvents="none"
                  accessibilityLiveRegion="polite"
                >
                  <Text style={[st.verdictHeadline, { color: verdictBeat.color }]}>
                    {verdictBeat.beat ? 'BEAT THE CLOCK' : 'OVER THE CLOCK'}
                  </Text>
                  <View style={st.verdictDeltaRow}>
                    <Text style={[st.verdictBy, { color: verdictBeat.color }]}>by</Text>
                    <Text style={[st.verdictDelta, { color: verdictBeat.color }]}>
                      {formatSeconds(verdictBeat.delta)}
                    </Text>
                  </View>
                </Animated.View>
              ) : (
                <>
                  <Text style={[st.clockDigits, { color: clkColor }]}>
                    {clockDisplay}
                  </Text>
                  {clockSuffix && (
                    <Text style={[st.overLabel, holeStopped && { color: settledColor }]}>{clockSuffix}</Text>
                  )}
                </>
              )}
            </CountdownRing>
            <Text style={st.clockTimePar}>TIME PAR  {formatSeconds(curTimePar)}</Text>
            {curOfficialSeconds != null && (
              <View style={st.certifiedPill}>
                <Text style={st.certifiedText}>OFFICIAL TIME PAR</Text>
              </View>
            )}
            {livePenalty < 0 && (
              <View style={st.penaltyBadge}>
                <Text style={st.penaltyText}>{livePenalty}</Text>
              </View>
            )}
            {ghostDeltaLabel && (
              <View style={st.ghostPill}>
                <Ionicons name="body-outline" size={10} color={ghostDeltaLabel.color} />
                <Text style={[st.ghostPillText, { color: ghostDeltaLabel.color }]}>{ghostDeltaLabel.text}</Text>
              </View>
            )}
          </View>

          {/* ── Clock controls — START HOLE / HOLED OUT ── */}
          {!holeStopped && (
            <TouchableOpacity
              style={[st.holedOutBtn, clockRunning ? st.holedOutBtnActive : st.holedOutBtnIdle]}
              onPress={clockRunning ? stopClock : startClock}
              activeOpacity={0.85}
            >
              {!clockRunning ? (
                <>
                  <Ionicons name="play" size={20} color={GREEN} />
                  <View>
                    <Text style={st.holedOutLabel}>START HOLE</Text>
                    <Text style={st.holedOutSub}>Tap when group tees off</Text>
                  </View>
                </>
              ) : (
                <>
                  {/* Ionicons, not the U+26F3 emoji \u2014 that glyph is missing from
                      the system font and rendered as a "?" box. */}
                  <Ionicons name="flag" size={20} color={BG} />
                  <View>
                    <Text style={[st.holedOutLabel, { color: BG }]}>HOLED OUT</Text>
                    <Text style={[st.holedOutSub, { color: BG + '88' }]}>Tap when last putt drops</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Par selector ── */}
          <View style={st.parSelectorWrap}>
            <Text style={st.parSelectorLabel}>PAR</Text>
            <View style={st.parSelectorRow}>
              {[3, 4, 5].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[st.parPill, curHoleData.par === p && st.parPillOn]}
                  onPress={() => setCurrentPar(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[st.parPillTxt, curHoleData.par === p && st.parPillTxtOn]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Stroke entry (per player) ── */}
          <View style={st.strokeSection}>
            {playerDefs.map((p, i) => {
              const strokes = playerStrokes[i];
              const cap = grossCapForHole(curHoleData.par);
              const atCap = strokes >= cap;
              const diff = strokes - curHoleData.par;
              const { pts, label } = livePointsForDiff(diff, scoringScale);

              return (
                <View key={i} style={st.playerStrokeRow}>
                  <View style={st.playerInfo}>
                    <Text style={st.playerName} numberOfLines={1}>{(p.name || '').split(' ')[0] || p.name}</Text>
                  </View>
                  <View style={st.strokeControls}>
                    <TouchableOpacity style={[st.adjBtn, strokes <= 1 && st.adjBtnDisabled]} onPress={() => adjustStrokes(i, -1)} disabled={strokes <= 1} activeOpacity={0.7}>
                      <Text style={st.adjBtnText}>{'\u2212'}</Text>
                    </TouchableOpacity>
                    <View style={st.strokeDisplay}>
                      <Text style={st.strokeNum}>{strokes}</Text>
                      {atCap && <Text style={st.pickupLabel}>PICK UP</Text>}
                    </View>
                    <TouchableOpacity style={[st.adjBtn, atCap && st.adjBtnDisabled]} onPress={() => adjustStrokes(i, 1)} disabled={atCap} activeOpacity={0.7}>
                      <Text style={st.adjBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={st.pointsPreview}>
                    <Text style={[st.pointsLabel, { color: pointsColor(pts) }]}>{label.toUpperCase()}</Text>
                    <Text style={[st.pointsPts, { color: pointsColor(pts) }]}>
                      {pts > 0 ? `+${pts}` : pts} pt{Math.abs(pts) !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Settled hole time + verdict delta, edit (cross-platform) ──
              Held back until the verdict beat finishes so the moment lands
              before NEXT HOLE / FINISH ROUND is offered. */}
          {holeStopped && !verdictBeat && (editingTime ? (
            <View style={st.frozenTimeRow}>
              <Text style={st.frozenTimeLabel}>HOLE TIME</Text>
              <TextInput
                style={st.frozenTimeInput}
                value={editTimeStr}
                onChangeText={setEditTimeStr}
                placeholder="m:ss"
                placeholderTextColor={COLOR.dim}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                autoFocus
              />
              <TouchableOpacity onPress={() => {
                const secs = parseTimeInput(editTimeStr);
                if (secs != null && secs > 0) {
                  setHoleFrozenTime(secs);
                  setDisplayElapsed(secs);
                  if (clockRunning) {
                    try { updateActivity(currentHole, curHoleData.par, Date.now() + (curTimePar - secs) * 1000).catch(() => {}); } catch {}
                  }
                }
                setEditingTime(false);
              }} activeOpacity={0.7}>
                <Ionicons name="checkmark" size={18} color={COLOR.green} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingTime(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color={COLOR.dim} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.settledBlock} onPress={() => {
              setEditTimeStr(formatSeconds(holeFrozenTime));
              setEditingTime(true);
            }} activeOpacity={0.7} accessibilityLabel="Edit hole time">
              <Text style={st.frozenTimeLabel}>HOLE TIME</Text>
              <View style={st.settledRow}>
                <Text style={[st.settledValue, { color: settledColor }]}>
                  {formatSeconds(holeFrozenTime)}
                  <Text style={st.settledDot}>  {'·'}  </Text>
                  {settledBeat ? 'BEAT BY ' : 'OVER BY '}{formatSeconds(Math.abs(settledDelta))}
                </Text>
                <Ionicons name="pencil-outline" size={12} color={DIM} style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>
          ))}

          {/* ── Next Hole / Finish ── */}
          {holeStopped && !verdictBeat && (
            <TouchableOpacity
              style={[st.nextHoleBtn, isFinishing && st.adjBtnDisabled]}
              onPress={completeHole}
              activeOpacity={0.85}
              disabled={isFinishing}
            >
              {isFinishing ? (
                <ActivityIndicator color={BG} />
              ) : (
                <Text style={st.nextHoleText}>
                  {currentHole >= holeCount ? 'FINISH ROUND' : 'NEXT HOLE \u2192'}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}


      {/* ── Edit Past Hole Modal ── */}
      <EditHoleModal
        visible={editHoleIdx != null}
        holeResult={editHoleIdx != null ? holeResults[editHoleIdx] : null}
        holeNumber={(editHoleIdx ?? 0) + 1}
        playerDefs={playerDefs}
        onSave={(newPar, newStrokes, newElapsed) => {
          rescoreHole(editHoleIdx, newPar, newStrokes, newElapsed);
          setEditHoleIdx(null);
        }}
        onClose={() => setEditHoleIdx(null)}
      />

      {/* ── Hole Picker — jump to any hole (shotgun starts, joining late) ── */}
      <HolePickerModal
        visible={showHolePicker}
        holeCount={holeCount}
        currentHole={currentHole}
        holeDataState={holeDataState}
        defaultPar={defaultPar}
        holeResults={holeResults}
        onSelect={jumpToHole}
        onClose={() => setShowHolePicker(false)}
      />
    </SafeAreaView>
  );
}

// ─── Hole Picker Modal — jump to any hole in the round ───────────────────────
function HolePickerModal({ visible, holeCount, currentHole, holeDataState, defaultPar, holeResults, onSelect, onClose }) {
  if (!visible) return null;
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={hp.overlay}>
        <View style={hp.card}>
          <View style={hp.headerRow}>
            <Text style={hp.title}>JUMP TO HOLE</Text>
            <TouchableOpacity onPress={onClose} style={hp.closeBtn}>
              <Ionicons name="close" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={hp.grid}>
            {holes.map(n => {
              const par = holeDataState[n - 1]?.par ?? defaultPar;
              const isCurrent = n === currentHole;
              const isPlayed  = holeResults[n - 1] != null;
              return (
                <TouchableOpacity
                  key={n}
                  style={[hp.tile, isCurrent && hp.tileCurrent]}
                  onPress={() => onSelect(n)}
                  activeOpacity={0.8}
                >
                  <Text style={[hp.tileNum, isCurrent && hp.tileNumCurrent]}>{n}</Text>
                  <Text style={[hp.tilePar, isCurrent && hp.tileParCurrent]}>PAR {par}</Text>
                  {isPlayed && !isCurrent && (
                    <Ionicons name="checkmark-circle" size={12} color={GREEN} style={hp.tileCheck} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Hole Picker Modal Styles ─────────────────────────────────────────────────
const hp = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  card:      { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '33', padding: 20, width: 320, maxHeight: 440 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:     { fontSize: 12, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  closeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4 },
  tile:      { width: 66, height: 64, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  tileCurrent: { backgroundColor: '#1E4825', borderColor: GOLD, borderWidth: 2 },
  tileNum:   { fontSize: 18, fontWeight: '700', color: CREAM, fontVariant: ['tabular-nums'] },
  tileNumCurrent: { color: GOLD },
  tilePar:   { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 0.5, marginTop: 2 },
  tileParCurrent: { color: GOLD },
  tileCheck: { position: 'absolute', top: 4, right: 4 },
});

// ─── Edit Past Hole Modal ────────────────────────────────────────────────────
function EditHoleModal({ visible, holeResult, holeNumber, playerDefs, onSave, onClose }) {
  const [par, setPar]           = useState(4);
  const [strokes, setStrokes]   = useState([]);
  const [timeStr, setTimeStr]   = useState('');

  useEffect(() => {
    if (visible && holeResult) {
      setPar(holeResult.par);
      setStrokes(holeResult.playerResults.map(pr => pr.grossStrokes));
      setTimeStr(formatSeconds(holeResult.elapsed));
    }
  }, [visible, holeResult]);

  const handleSave = () => {
    const secs = parseTimeInput(timeStr);
    if (secs == null || secs <= 0) { Alert.alert('Invalid time', 'Enter time as m:ss'); return; }
    onSave(par, strokes, secs);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={em.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={em.card}>
          <View style={em.headerRow}>
            <Text style={em.title}>EDIT HOLE {holeNumber}</Text>
            <TouchableOpacity onPress={onClose} style={em.closeBtn}><Ionicons name="close" size={20} color={MUTED} /></TouchableOpacity>
          </View>

          {/* Par */}
          <Text style={em.label}>PAR</Text>
          <View style={em.pillRow}>
            {[3, 4, 5].map(p => (
              <TouchableOpacity key={p} style={[em.pill, par === p && em.pillOn]} onPress={() => setPar(p)} activeOpacity={0.8}>
                <Text style={[em.pillTxt, par === p && em.pillTxtOn]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Strokes per player */}
          <Text style={em.label}>STROKES</Text>
          {playerDefs.map((p, i) => (
            <View key={i} style={em.strokeRow}>
              <Text style={em.strokeName} numberOfLines={1}>{p.name}</Text>
              <TouchableOpacity style={em.strokeAdj} onPress={() => setStrokes(prev => { const u = [...prev]; u[i] = Math.max(1, u[i] - 1); return u; })}>
                <Text style={em.strokeAdjTxt}>{'\u2212'}</Text>
              </TouchableOpacity>
              <Text style={em.strokeVal}>{strokes[i]}</Text>
              <TouchableOpacity style={em.strokeAdj} onPress={() => setStrokes(prev => { const u = [...prev]; u[i]++; return u; })}>
                <Text style={em.strokeAdjTxt}>+</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Time */}
          <Text style={em.label}>TIME (m:ss)</Text>
          <TextInput style={em.timeInput} value={timeStr} onChangeText={setTimeStr} keyboardType="numbers-and-punctuation" maxLength={6} />

          <TouchableOpacity style={em.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={em.saveBtnTxt}>SAVE</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Edit Modal Styles ───────────────────────────────────────────────────────
const em = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  card:      { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '33', padding: 20, width: 320 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:     { fontSize: 12, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  closeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2, marginBottom: 6, marginTop: 12 },
  pillRow:   { flexDirection: 'row', gap: 8 },
  pill:      { flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, alignItems: 'center' },
  pillOn:    { backgroundColor: '#1E4825', borderColor: GOLD },
  pillTxt:   { fontSize: 15, fontWeight: '600', color: DIM },
  pillTxtOn: { color: GOLD },
  strokeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  strokeName:{ fontSize: 13, color: CREAM, flex: 1 },
  strokeAdj: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLOR.surfaceAlt, borderWidth: 1, borderColor: GOLD + '44', alignItems: 'center', justifyContent: 'center' },
  strokeAdjTxt: { fontSize: 18, color: GOLD, fontWeight: '300' },
  strokeVal: { fontSize: 20, fontWeight: '300', color: CREAM, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  timeInput: { backgroundColor: BG, borderWidth: 1, borderColor: GOLD + '33', borderRadius: RADIUS.sm, padding: 10, color: CREAM, fontSize: 16, textAlign: 'center', fontVariant: ['tabular-nums'] },
  saveBtn:   { backgroundColor: GOLD, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  saveBtnTxt:{ fontSize: 12, fontWeight: '700', color: BG, letterSpacing: 2 },
});

// ─── Main Styles ─────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:     { flex: 1, backgroundColor: BG },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  headerBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter:  { alignItems: 'center', flex: 1 },
  headerTitleRow:{ flexDirection: 'row', alignItems: 'center' },
  headerTitle:   { fontSize: 13, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  headerSub:     { fontSize: 11, color: DIM, marginTop: 2 },
  mainContent:   { paddingHorizontal: 16, paddingBottom: 20 },

  totalStrip:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 8 },
  totalLabel:    { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  totalValue:    { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalHoles:    { fontSize: 10, color: DIM },

  // Countdown clock
  clockWrap:     { alignItems: 'center', paddingVertical: 12 },
  clockDigits:   { fontSize: 56, fontWeight: '200', fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 60 },
  overLabel:     { fontSize: 11, fontWeight: '700', color: RED_WARN, letterSpacing: 3, marginTop: 2 },
  clockTimePar:  { fontSize: 11, fontWeight: '700', color: DIM, letterSpacing: 2.5, marginTop: 10 },
  ghostPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 },
  ghostPillText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  // Holed-out verdict beat (ring center, ~MOTION.verdictHold)
  verdictCenter:   { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  verdictHeadline: { ...TYPE.label, fontSize: 12, letterSpacing: 3, textAlign: 'center' },
  verdictDeltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  verdictBy:       { fontSize: 18, fontWeight: '300', letterSpacing: 0.5, opacity: 0.85 },
  verdictDelta:    { ...TYPE.heroNumber, fontSize: 56, lineHeight: 60 },
  certifiedPill: { borderWidth: 1, borderColor: COLOR.gold, borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  certifiedText: { fontSize: 8, fontWeight: '700', color: COLOR.gold, letterSpacing: 1.5 },
  penaltyBadge:  { marginTop: 8, backgroundColor: 'rgba(232,93,74,0.12)', borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(232,93,74,0.3)' },
  penaltyText:   { fontSize: 14, fontWeight: '700', color: RED_WARN, fontVariant: ['tabular-nums'] },

  // Holed Out button
  holedOutBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 20, paddingVertical: 20, paddingHorizontal: 40, marginVertical: 16 },
  holedOutBtnIdle:   { backgroundColor: '#1A3A1C', borderWidth: 2, borderColor: GREEN },
  holedOutBtnActive: { backgroundColor: GOLD },
  holedOutLabel:     { fontSize: 16, fontWeight: '700', color: CREAM, letterSpacing: 1 },
  holedOutSub:       { fontSize: 10, color: DIM, marginTop: 2 },

  // Par selector
  parSelectorWrap:  { paddingBottom: 12 },
  parSelectorLabel: { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2, marginBottom: 8 },
  parSelectorRow:   { flexDirection: 'row', gap: 8 },
  parPill:          { flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: 'center' },
  parPillOn:        { backgroundColor: '#1E4825', borderColor: GOLD, borderWidth: 2 },
  parPillTxt:       { fontSize: 15, fontWeight: '600', color: DIM },
  parPillTxtOn:     { color: GOLD },

  // Stroke entry
  strokeSection:    { gap: 10, marginBottom: 12 },
  playerStrokeRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  playerInfo:       { width: 72 },
  playerName:       { fontSize: 13, fontWeight: '600', color: CREAM },
  strokeControls:   { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 12 },
  adjBtn:           { width: 44, height: 44, borderRadius: 22, backgroundColor: COLOR.surfaceAlt, borderWidth: 1, borderColor: GOLD + '44', alignItems: 'center', justifyContent: 'center' },
  adjBtnDisabled:   { opacity: 0.3 },
  adjBtnText:       { fontSize: 22, color: GOLD, fontWeight: '300' },
  strokeDisplay:    { alignItems: 'center', minWidth: 36 },
  strokeNum:        { fontSize: 28, fontWeight: '300', color: CREAM, fontVariant: ['tabular-nums'] },
  pickupLabel:      { fontSize: 8, fontWeight: '700', color: RED_WARN, letterSpacing: 1, marginTop: -2 },
  // Fix 6: label primary, pts secondary
  pointsPreview:    { alignItems: 'center', width: 56 },
  pointsLabel:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  pointsPts:        { fontSize: 9, fontWeight: '600', marginTop: 2, opacity: 0.7 },

  // Frozen time (tappable to edit)
  frozenTimeRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, paddingVertical: 6 },
  frozenTimeLabel:  { ...TYPE.label, letterSpacing: 2 },
  // Settled verdict block — "0:22 · BEAT BY 4:38", persistent after the hold
  settledBlock:     { alignItems: 'center', marginBottom: 10, paddingVertical: 6, gap: 4 },
  settledRow:       { flexDirection: 'row', alignItems: 'center' },
  settledValue:     { ...TYPE.statNumber, fontSize: 20, fontWeight: '600', letterSpacing: 1 },
  settledDot:       { color: DIM, fontWeight: '400' },
  frozenTimeInput:  { fontSize: 14, fontWeight: '600', color: CREAM, fontVariant: ['tabular-nums'], backgroundColor: BG, borderWidth: 1, borderColor: GOLD + '44', borderRadius: RADIUS.xs, paddingHorizontal: 8, paddingVertical: 4, minWidth: 50, textAlign: 'center' },

  // Next hole
  nextHoleBtn:   { backgroundColor: GOLD, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  nextHoleText:  { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 2 },

  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 6, justifyContent: 'center' },
  chip:          { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: MUTED, borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
  chipCourse:    { color: CREAM, maxWidth: 180 },
  bottomText:    { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 1.5 },

  // Scorecard
  scorecardWrap:    { flex: 1 },
  scorecardContent: { paddingHorizontal: 12, paddingBottom: 20 },
  scTitle:          { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 4, textAlign: 'center', marginTop: 12, marginBottom: 2 },
  scHint:           { fontSize: 9, color: DIM, textAlign: 'center', marginBottom: 10 },
  scHeaderRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 8, marginBottom: 4 },
  scRow:            { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#7DC87A0D' },
  scTotalRow:       { borderTopWidth: 1, borderTopColor: GOLD + '44', marginTop: 4 },
  scCell:           { fontSize: 11, color: MUTED, textAlign: 'center' },
  scCellHole:       { width: 26, fontWeight: '700', letterSpacing: 1 },
  scCellPar:        { width: 28 },
  scCellPlayer:     { flex: 1, fontWeight: '600', fontVariant: ['tabular-nums'] },
  scCellTime:       { width: 64, fontSize: 10, fontVariant: ['tabular-nums'] },
  scCellScore:      { width: 40, fontVariant: ['tabular-nums'] },
  scValText:        { color: CREAM },
  scTotalText:      { fontSize: 12, fontWeight: '700' },
  scDimText:        { color: DIM },
  scRowCurrent:     { backgroundColor: '#C9A84C0F' },
  abandonBtn:       { marginTop: 24, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E85D4A44', borderRadius: RADIUS.md },
  abandonBtnText:   { color: RED_WARN, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
});
