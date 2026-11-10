// ─── ArcadeScreen — Clocked Arcade: start → game → summary ───────────────────
// A top-down golf game that plays by the real Clocked rules. Scoring, time
// par and the verdict beat all come from the same engine as a live round
// (lib/clockedSport, lib/clockedRating). Results persist ONLY to
// public.arcade_scores — never to rounds / activity_feed / leaderboard.

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, PanResponder,
  AppState, Alert, ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COLOR, TYPE, SPACING, RADIUS, CARD, scoreTier } from '../lib/theme';
import { formatSeconds, formatSecondsLong } from '../lib/clockedSport';
import {
  createGame, tick, setAim, releaseAim, lockPower, drainEvents, requestTurbo, swingPose, cycleClub,
  holeElapsed, roundElapsed, runningPoints, currentDispersion, hintFor,
  gameNow, pauseGame, resumeGame, skipBeat, RULESET,
} from '../lib/arcade/engine';
import { turboState, cartMph, shotYards, LIE_POWER_MULT } from '../lib/arcade/physics';
import { startPlaySession, endPlaySession, setLiveArcadeSession, closeOrphanArcadeSessions } from '../lib/playSessions';
import { randomSeed, dist } from '../lib/arcade/course';
import { DEFAULT_AVATAR, loadAvatar } from '../lib/arcade/avatar';
import { submitArcadeChallengeScore } from '../lib/arcade/challenges';
import { fetchSeasonBoard, QUALIFY_TOP, QUALIFYING_DIFFICULTIES } from '../lib/arcade/season';
import HoleMap, { cameraTargetFor, lerpCamera, screenToWorld } from '../components/arcade/HoleMap';
import PowerMeter from '../components/arcade/PowerMeter';
import DriveControls from '../components/arcade/DriveControls';
import { SwingStage } from '../components/arcade/Golfer';
import ArcadeHUD, { VerdictOverlay, FINAL_SECONDS } from '../components/arcade/ArcadeHUD';
import InitialsAvatar from '../components/InitialsAvatar';

const APP_VERSION = Constants?.expoConfig?.version ?? null;
const MINUS = '\u2212';
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `${MINUS}${Math.abs(n)}` : '0');
const TOAST_MS = 1700;

const DIFFICULTIES = [
  { key: 'beginner',     label: 'BEGINNER', sub: 'Big cup · slow meter',  color: COLOR.green },
  { key: 'intermediate', label: 'INTER.',   sub: 'The standard',          color: COLOR.amber },
  { key: 'pro',          label: 'PRO',      sub: 'Small cup · fast meter', color: COLOR.red },
];

// Launched from the Arcade tab (ArcadeHomeScreen) with
// { autostart: true, difficulty, avatar }; the legacy start screen below is
// kept for any older entry point that arrives without params.
export default function ArcadeScreen({ navigation, route }) {
  const { profile } = useAuth();
  const autostart = !!route?.params?.autostart;
  const [mode, setMode] = useState(autostart ? 'play' : 'start');   // 'start' | 'play' | 'summary'
  const [difficulty, setDifficulty] = useState(() => route?.params?.difficulty ?? profile?.preferred_difficulty ?? 'intermediate');
  const [avatar, setAvatar] = useState(() => route?.params?.avatar ?? DEFAULT_AVATAR);
  const challenge = route?.params?.challenge ?? null;
  const [seed, setSeed] = useState(() => route?.params?.seed ?? randomSeed());
  const [summary, setSummary] = useState(null);

  useEffect(() => { if (!route?.params?.avatar) loadAvatar().then(setAvatar); }, [route?.params?.avatar]);

  // A challenge run is one shot at one seed: 'play again' starts a free run.
  const startGame = () => { setSeed(randomSeed()); setSummary(null); setMode('play'); };
  const leave = () => { if (autostart) navigation.goBack(); else setMode('start'); };

  if (mode === 'play') {
    return (
      <Game
        key={seed}
        seed={seed}
        difficulty={difficulty}
        avatar={avatar}
        onQuit={leave}
        challengeId={challenge?.id ?? null}
        onDone={(s) => { setSummary(s); setMode('summary'); }}
      />
    );
  }
  if (mode === 'summary' && summary) {
    return (
      <Summary
        summary={summary} challenge={challenge} onPlayAgain={startGame} onBack={leave}
        onSeeBoard={() => navigation.popTo('Main', { screen: 'Ranks', params: { board: 'ARCADE', difficulty, ts: Date.now() } })}
      />
    );
  }
  return (
    <Start
      navigation={navigation}
      difficulty={difficulty}
      setDifficulty={setDifficulty}
      onPlay={startGame}
    />
  );
}

// ─── Start screen ────────────────────────────────────────────────────────────
function Start({ navigation, difficulty, setDifficulty, onPlay }) {
  const { user } = useAuth();
  const [board, setBoard] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: rows } = await supabase
          .from('arcade_scores')
          .select('id, user_id, points, total_seconds, difficulty, clocked_score, total_strokes, holes_under_clock')
          .order('points', { ascending: false })
          .order('total_seconds', { ascending: true })
          .limit(10);
        const ids = [...new Set((rows ?? []).map(r => r.user_id).filter(Boolean))];
        let profiles = [];
        if (ids.length) {
          const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids);
          profiles = data ?? [];
        }
        const pmap = {};
        profiles.forEach(p => { pmap[p.id] = p; });
        if (!cancelled) setBoard((rows ?? []).map(r => ({ ...r, profile: pmap[r.user_id] })));
      } catch { if (!cancelled) setBoard([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView style={st.screen}>
      <View style={st.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={COLOR.muted} />
        </TouchableOpacity>
        <Text style={st.wordmark}>CLOCKED ARCADE</Text>
        <View style={st.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={st.heroCard}>
          <Ionicons name="game-controller-outline" size={34} color={COLOR.gold} />
          <Text style={st.heroTitle}>Same rules. Same clock.{'\n'}No tee time.</Text>
          <Text style={st.heroSub}>
            Nine procedurally generated holes. Swing, drive the cart to your ball, and beat the time par. Every
            hole has its own clock: it starts on the tee and stops in the cup.
          </Text>
        </View>

        <Text style={st.sectionQ}>SHOT CLOCK DIFFICULTY</Text>
        <View style={st.difficultyRow}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity
              key={d.key}
              style={[st.diffBtn, difficulty === d.key && st.diffBtnActive]}
              onPress={() => setDifficulty(d.key)}
              activeOpacity={0.8}
            >
              <View style={[st.diffDot, { backgroundColor: d.color }]} />
              <Text style={[st.diffLabel, difficulty === d.key && st.diffLabelActive]}>{d.label}</Text>
              <Text style={st.diffSub}>{d.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={st.primaryBtn} onPress={onPlay} activeOpacity={0.85}>
          <Text style={st.primaryBtnText}>PLAY</Text>
        </TouchableOpacity>

        <View style={st.howCard}>
          <Text style={st.sectionQ}>HOW IT PLAYS</Text>
          <HowRow icon="locate-outline"   text="Drag from the ball to aim. Release to start the power meter, tap to lock." />
          <HowRow icon="timer-outline"    text="Stand over the ball too long and your shot cone widens. Hesitation costs accuracy and clock." />
          <HowRow icon="car-outline"      text="After every shot, drive the cart to your ball. Carts can't enter the green. Park and walk." />
          <HowRow icon="trophy-outline"   text="Real Clocked scoring: par 1, birdie 3, eagle 6. Over time par costs half a point per 30s." />
        </View>

        <Text style={[st.sectionQ, { marginTop: 24 }]}>ARCADE LEADERBOARD</Text>
        <View style={st.boardCard}>
          {board == null && <ActivityIndicator color={COLOR.gold} style={{ padding: 16 }} />}
          {board?.length === 0 && <Text style={st.emptyText}>No arcade rounds posted yet. Be first.</Text>}
          {board?.map((r, i) => {
            const name = r.profile?.full_name || r.profile?.username || 'Player';
            const isYou = r.user_id === user?.id;
            return (
              <View key={r.id ?? i} style={[st.boardRow, i < board.length - 1 && st.boardRowBorder]}>
                <Text style={[st.rank, i < 3 && { color: COLOR.gold }]}>{i + 1}</Text>
                <InitialsAvatar name={r.profile?.full_name} username={r.profile?.username} avatarUrl={r.profile?.avatar_url} size={32} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[st.boardName, isYou && { color: COLOR.gold }]} numberOfLines={1}>{name}{isYou ? '  (you)' : ''}</Text>
                  <Text style={st.boardMeta}>{formatSeconds(r.total_seconds)} · {String(r.difficulty ?? '').toUpperCase()} · {r.holes_under_clock ?? 0}/9 under</Text>
                </View>
                <Text style={st.boardPts}>{r.points > 0 ? `+${r.points}` : r.points}</Text>
              </View>
            );
          })}
        </View>
        <Text style={st.footnote}>Arcade rounds never touch your real Clocked Score or round history.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function HowRow({ icon, text }) {
  return (
    <View style={st.howRow}>
      <Ionicons name={icon} size={16} color={COLOR.gold} style={{ marginTop: 1 }} />
      <Text style={st.howText}>{text}</Text>
    </View>
  );
}

// ─── Game ────────────────────────────────────────────────────────────────────
function Game({ seed, difficulty, avatar, onDone, onQuit, challengeId = null }) {
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = createGame({ seed, difficulty });
  const g = gameRef.current;

  // A started round is a fact worth recording whether or not it finishes.
  // Every started round is closed exactly once: completed, or abandoned when
  // the player leaves, the screen is torn down, or the next launch finds it open.
  const sessionRef = useRef(null);
  const endedRef = useRef(false);
  const doneRef = useRef(false);
  const endSession = useCallback((outcome) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const holesCompleted = outcome === 'completed' ? 9 : (gameRef.current?.holeResults?.length ?? 0);
    endPlaySession(sessionRef.current, { outcome, holesCompleted });
    setLiveArcadeSession(null);
  }, []);
  useEffect(() => {
    let gone = false;
    // A re-run of this effect (dev refresh) opens a new session; it must be closable too.
    endedRef.current = false;
    (async () => {
      await closeOrphanArcadeSessions();
      const id = await startPlaySession({ kind: 'arcade', difficulty, holesPlanned: 9, seed: String(seed), challengeId });
      if (gone) {
        // Left before the row landed: close it now, nothing else will.
        endPlaySession(id, { outcome: 'abandoned', holesCompleted: gameRef.current?.holeResults?.length ?? 0 });
        return;
      }
      sessionRef.current = id;
      setLiveArcadeSession(id);
    })();
    return () => { gone = true; endSession('abandoned'); };
  }, []);

  const [, setFrame] = useState(0);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const cameraRef = useRef(null);
  const joyRef = useRef({ dx: 0, dy: 0 });
  const lastTsRef = useRef(null);
  const lastRemRef = useRef(null);
  const turboCountRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const mapSizeRef = useRef(mapSize);
  mapSizeRef.current = mapSize;

  // Sound identity — shared with the real round.
  const buzzerPlayer = useAudioPlayer(require('../assets/sounds/buzzer.wav'));
  const chimePlayer  = useAudioPlayer(require('../assets/sounds/chime.wav'));
  const playBuzzer = useCallback(() => { try { buzzerPlayer.seekTo(0); buzzerPlayer.play(); } catch {} }, [buzzerPlayer]);
  const playChime  = useCallback(() => { try { chimePlayer.seekTo(0);  chimePlayer.play();  } catch {} }, [chimePlayer]);

  // Verdict beat — identical semantics to ClockedRoundScreen.showVerdict.
  // Shown for as long as the engine holds the verdict phase, so a tap that
  // skips the beat and a pause that freezes it both stay in step.
  const [verdict, setVerdict] = useState(null);
  const showVerdict = useCallback((ev) => {
    const color = ev.beat ? COLOR.green : COLOR.red;
    if (ev.bonus > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (ev.beat) {
      playChime();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    const pr = ev.result?.playerResults?.[0];
    clearTimeout(toastTimer.current);
    setToast(null);
    setVerdict({
      key: Date.now(), beat: ev.beat, timedOut: !!ev.timedOut, delta: ev.delta, color,
      label: pr?.label ?? 'Hole', strokePoints: pr?.points ?? 0,
      penalty: ev.result?.penalty ?? 0, bonus: ev.bonus ?? 0, total: ev.result?.holeScore ?? 0,
      pickedUp: !!ev.pickedUp, streak: ev.streak ?? 0,
    });
  }, [playChime]);

  // Where the last shot finished, said once, briefly.
  const showResult = useCallback((ev) => {
    const lie = String(ev.lie ?? '').toUpperCase();
    const text = ev.isPutt
      ? `${Math.max(1, Math.round(ev.yards * 3))} FT PUTT \u00B7 ${Math.max(1, Math.round(ev.toPin * 3))} FT LEFT`
      : ev.lie === 'green'
        ? `${Math.round(ev.yards)} YDS \u00B7 GREEN \u00B7 ${Math.max(1, Math.round(ev.toPin * 3))} FT TO PIN`
        : `${Math.round(ev.yards)} YDS \u00B7 ${lie} \u00B7 ${Math.round(ev.toPin)} YDS TO PIN`;
    clearTimeout(toastTimer.current);
    setToast({ key: Date.now(), text, lie: ev.lie });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const handleEvents = useCallback((events) => {
    for (const ev of events) {
      switch (ev.type) {
        case 'swing':
          Haptics.selectionAsync().catch(() => {});
          break;
        case 'impact':
          Haptics.impactAsync(ev.isPutt ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          break;
        case 'bump':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          break;
        case 'turbo':
          turboCountRef.current += 1;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'tree':
        case 'water':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          break;
        case 'flagstick':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
          break;
        case 'club':
          Haptics.selectionAsync().catch(() => {});
          break;
        case 'expired':
          playBuzzer();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          break;
        case 'result':
          showResult(ev);
          break;
        case 'verdict':
          showVerdict(ev);
          break;
        case 'done':
          if (!doneRef.current) {
            doneRef.current = true;
            endSession('completed');
            setTimeout(() => onDone({ ...ev.summary, playSessionId: sessionRef.current }), 0);
          }
          break;
        default: break;
      }
    }
  }, [playBuzzer, showVerdict, showResult, endSession, onDone]);

  // Game loop — rAF. While paused nothing ticks and nothing re-renders.
  useEffect(() => {
    let raf;
    const loop = () => {
      const now = Date.now();
      const { width, height } = mapSizeRef.current;
      if (!g.pausedAt && width > 0) {
        const dt = lastTsRef.current == null ? 0 : Math.min(0.05, (now - lastTsRef.current) / 1000);
        // Outside the drive phase the stick is dead, whatever the row last
        // reported. A thumb still on the stick when the cart arrived used to
        // leave a stale push that drove the cart on its own after the shot.
        if (g.phase !== 'drive') joyRef.current = { dx: 0, dy: 0 };
        tick(g, dt, now, joyRef.current);
        const aspect = width / height;
        const target = cameraTargetFor(g, aspect, cameraRef.current);
        cameraRef.current = cameraRef.current
          ? lerpCamera(cameraRef.current, target, 1 - Math.exp(-dt * 4.5))
          : target;
        const events = drainEvents(g);
        if (events.length) handleEvents(events);
        // Last ten seconds: one light tick a second, felt without looking up.
        if (g.clock.holeStartTs) {
          const rem = Math.ceil(g.timePar - holeElapsed(g, now));
          if (rem !== lastRemRef.current) {
            if (lastRemRef.current != null && rem > 0 && rem <= FINAL_SECONDS) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            lastRemRef.current = rem;
          }
        } else lastRemRef.current = null;
        setFrame(f => (f + 1) % 1e9);
      }
      lastTsRef.current = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); clearTimeout(toastTimer.current); };
  }, [g, handleEvents]);

  // Pause stops everything: clock, meter, ball, cart, beats. The cover hides
  // the hole, so a pause cannot be used to read a putt for free.
  const pause = useCallback(() => {
    if (doneRef.current || !pauseGame(gameRef.current, Date.now())) return;
    joyRef.current = { dx: 0, dy: 0 };
    setPaused(true);
  }, []);
  const resume = useCallback(() => {
    resumeGame(gameRef.current, Date.now());
    lastTsRef.current = null;
    joyRef.current = { dx: 0, dy: 0 };
    setPaused(false);
  }, []);
  // A call, a notification pull, the app switcher: all of them pause, and the
  // round stays paused until the player says go.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') pause();
      lastTsRef.current = null; // don't integrate the time we were away
    });
    return () => sub.remove();
  }, [pause]);

  // Aim / power gestures on the map.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const game = gameRef.current;
      if (game.pausedAt) return;
      // The verdict and the hole card are beats, not waits: a tap moves on.
      if (game.phase === 'verdict' || game.phase === 'transition') {
        if (skipBeat(game, Date.now())) Haptics.selectionAsync().catch(() => {});
        return;
      }
      if (game.phase === 'power') { lockPower(game, Date.now()); return; }
      if (game.phase === 'aim' || game.phase === 'putt') {
        aimFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
      }
    },
    onPanResponderMove: (e) => {
      const game = gameRef.current;
      if (game.phase === 'aim' || game.phase === 'putt') {
        aimFromTouch(e.nativeEvent.locationX, e.nativeEvent.locationY);
      }
    },
    onPanResponderRelease: () => {
      const game = gameRef.current;
      if (game.phase === 'aim' || game.phase === 'putt') releaseAim(game, Date.now());
    },
  }), []);

  function aimFromTouch(px, py) {
    const game = gameRef.current;
    const cam = cameraRef.current;
    const { width, height } = mapSizeRef.current;
    if (!cam || !width) return;
    const wp = screenToWorld(cam, game.hole, px, py, width, height);
    const dx = wp.x - game.ball.x, dy = wp.y - game.ball.y;
    if (Math.hypot(dx, dy) < 1.5) { setAim(game, game.aimAngle, Date.now()); return; }
    setAim(game, Math.atan2(dy, dx), Date.now());
  }

  const leaveRound = () => { endSession('abandoned'); onQuit(); };

  const now = gameNow(g);
  const elapsed = holeElapsed(g, now);
  const remaining = Math.ceil(g.timePar - elapsed);
  const clockState = g.clock.holeStartTs ? 'live' : g.clock.frozen != null ? 'stopped' : 'armed';
  const dispersion = currentDispersion(g, now);
  const pinYards = dist(g.ball, g.hole.pin);
  const toBall = Math.round(dist(g.cart, g.ball));
  const isAiming = g.phase === 'aim' || g.phase === 'putt';
  const fullYards = shotYards(g.club, g.lie, g.isPutt, 1);
  const lieMult = g.isPutt ? 1 : (LIE_POWER_MULT[g.lie] ?? 1);
  const spreadWord = g.phase === 'flight' ? 'LOCKED' : dispersion > 7 ? 'WIDE' : dispersion > 4 ? 'WIDENING' : 'STEADY';
  const spreadColor = dispersion > 7 ? COLOR.red : dispersion > 4 ? COLOR.amber : COLOR.green;
  // Driving tips are for learning the cart, not for every hole after.
  const showTips = g.holeIdx === 0 || (turboCountRef.current < 2 && g.holeIdx < 3);
  const pose = swingPose(g, now);
  const turbo = turboState(g.cart, now);
  const mph = cartMph(g.cart);
  const showStage = isAiming || g.phase === 'power' || g.phase === 'flight';

  return (
    <SafeAreaView style={st.screen} edges={['top', 'bottom']}>
      <View style={st.gameTop}>
        <TouchableOpacity onPress={pause} style={st.iconBtn} accessibilityRole="button" accessibilityLabel="Pause">
          <Ionicons name="pause" size={20} color={COLOR.muted} />
        </TouchableOpacity>
        <Text style={st.gameWordmark}>CLOCKED ARCADE · {difficulty.toUpperCase()}</Text>
        <Text style={st.roundClock}>{formatSeconds(Math.floor(roundElapsed(g, now)))}</Text>
      </View>

      <ArcadeHUD
        holeNumber={g.holeIdx + 1}
        par={g.hole.par}
        strokes={g.strokes}
        points={runningPoints(g)}
        streak={g.clockStreak}
        timePar={g.timePar}
        remaining={remaining}
        clockState={clockState}
      />

      <View
        style={st.mapWrap}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0 && (width !== mapSize.width || height !== mapSize.height)) setMapSize({ width, height });
        }}
        {...pan.panHandlers}
      >
        {mapSize.width > 0 && cameraRef.current && (
          <HoleMap
            game={g}
            camera={cameraRef.current}
            width={mapSize.width}
            height={mapSize.height}
            dispersionDeg={dispersion}
            powerValue={g.power.value}
            avatar={avatar}
            swingPose={pose}
            now={now}
          />
        )}
        {g.phase === 'transition' && (
          <View style={st.transitionCard} pointerEvents="none">
            <Text style={st.transitionHole}>HOLE {g.holeIdx + 1}</Text>
            <Text style={st.transitionPar}>PAR {g.hole.par} · PLAYS {g.hole.length} YDS</Text>
            <Text style={st.transitionTp}>TIME PAR {formatSeconds(g.timePar)} · CLOCK STARTS ON THE TEE</Text>
            <Text style={st.tapOn}>TAP TO CONTINUE</Text>
          </View>
        )}
        {toast && g.phase !== 'verdict' && g.phase !== 'transition' && (
          <View style={st.toastWrap} pointerEvents="none">
            <View style={st.toast}><Text style={st.toastText} numberOfLines={1}>{toast.text}</Text></View>
          </View>
        )}
        <VerdictOverlay verdict={g.phase === 'verdict' ? verdict : null} />
      </View>

      <View style={st.controls}>
        {g.phase === 'drive' || g.phase === 'transition' ? (
          <DriveControls
            onChange={(v) => { joyRef.current = v; }}
            onTurbo={() => requestTurbo(gameRef.current, Date.now())}
            turbo={turbo}
            disabled={g.phase !== 'drive'}
          >
            <Text style={st.hint}>{hintFor(g)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 6 }}>
              <Text style={st.readout}><Text style={[st.readoutNum, { color: turbo.active ? COLOR.goldBright : COLOR.cream }]}>{mph}</Text> MPH</Text>
              <Text style={st.readout}><Text style={st.readoutNum}>{toBall}</Text> YDS</Text>
            </View>
            {showTips && <Text style={st.subHint}>Green's off-limits: park and walk. Hit TURBO when the ring fills.</Text>}
          </DriveControls>
        ) : showStage ? (
          <View>
            <View style={st.statsRow}>
              <ShotStat
                label="TO PIN"
                value={g.lie === 'green' ? String(Math.max(1, Math.round(pinYards * 3))) : String(Math.round(pinYards))}
                unit={g.lie === 'green' ? 'FT' : 'YDS'}
                note={g.hole.par ? `PAR ${g.hole.par}` : ' '}
              />
              <ShotStat
                label="LIE"
                value={String(g.lie).toUpperCase()}
                note={g.isPutt ? 'PUTTING' : lieMult < 1 ? `${Math.round(lieMult * 100)}% POWER` : 'FULL POWER'}
                noteColor={lieMult < 1 ? COLOR.amber : undefined}
              />
              <ClubButton
                name={g.club.name}
                note={g.isPutt ? `FULL ${Math.round(fullYards * 3)} FT` : `FULL ${Math.round(fullYards)} YDS`}
                manual={g.clubManual}
                canChange={g.phase === 'aim'}
                onPress={() => { cycleClub(gameRef.current); }}
              />
              <ShotStat label="SPREAD" value={`${dispersion.toFixed(1)}\u00B0`} color={spreadColor} note={spreadWord} noteColor={spreadColor} />
            </View>
            <View style={st.stageRow}>
              <View style={st.stageBox}>
                <SwingStage avatar={avatar} pose={pose} isPutt={g.isPutt} club={g.club.name} width={STAGE_W} height={STAGE_H} idleT={now / 1000} />
              </View>
              <View style={st.stageSide}>
                {g.phase === 'power' ? (
                  <PowerMeter value={g.power.value} club={g.club} maxYards={fullYards} toPin={pinYards} feet={g.isPutt} />
                ) : (
                  <>
                    <Text style={st.hint}>{hintFor(g)}</Text>
                    {isAiming && <Text style={st.subHint}>Spread widens while you wait.{g.phase === 'aim' ? ' Tap CLUB to change it.' : ''}</Text>}
                  </>
                )}
              </View>
            </View>
          </View>
        ) : (
          <Text style={[st.hint, { textAlign: 'center' }]}>{hintFor(g)}</Text>
        )}
      </View>

      {paused && (
        <View style={st.pauseCover} accessibilityViewIsModal>
          <Ionicons name="pause-circle-outline" size={44} color={COLOR.gold} />
          <Text style={st.pauseTitle}>PAUSED</Text>
          <Text style={st.pauseSub}>
            HOLE {g.holeIdx + 1} · {clockState === 'armed' ? 'CLOCK NOT STARTED' : `${formatSeconds(Math.max(0, remaining))} LEFT ON THE CLOCK`}
          </Text>
          <Text style={st.pauseNote}>The clock is stopped. Nothing moves until you resume.</Text>
          <TouchableOpacity style={[st.primaryBtn, st.pauseBtn]} onPress={resume} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Resume round">
            <Text style={st.primaryBtnText}>RESUME</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.secondaryBtn, st.pauseBtn, { borderColor: COLOR.border }]} onPress={leaveRound} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Leave round. This round will not be saved.">
            <Text style={[st.secondaryBtnText, { color: COLOR.muted }]}>LEAVE ROUND</Text>
          </TouchableOpacity>
          <Text style={st.footnote}>Leaving ends this round. It will not be saved.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const STAGE_W = 124, STAGE_H = 93;

// One column of the shot panel. Four of these share the row equally, every
// value is the same size, and nothing shrinks to fit.
const ShotStat = memo(function ShotStat({ label, value, unit, note = ' ', color = COLOR.cream, noteColor = COLOR.dim }) {
  return (
    <View style={st.shotStat}>
      <Text style={st.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={[st.shotValue, { color }]} numberOfLines={1}>{value}{unit ? <Text style={st.shotUnit}> {unit}</Text> : null}</Text>
      <Text style={[st.shotNote, { color: noteColor }]} numberOfLines={1}>{note}</Text>
    </View>
  );
});

const ClubButton = memo(function ClubButton({ name, note, manual, canChange, onPress }) {
  return (
    <TouchableOpacity
      style={[st.shotStat, st.clubBtn, canChange && st.clubBtnOn, manual && st.clubBtnManual]}
      onPress={onPress} disabled={!canChange} activeOpacity={0.6}
      accessibilityRole="button" accessibilityLabel={canChange ? `Club: ${name}. Tap to change.` : `Club: ${name}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={[st.statLabel, canChange && { color: COLOR.gold }]} numberOfLines={1}>CLUB</Text>
        {canChange && <Ionicons name="swap-horizontal" size={10} color={COLOR.gold} />}
      </View>
      <Text style={[st.shotValue, { color: manual ? COLOR.gold : COLOR.cream }]} numberOfLines={1}>{name}</Text>
      <Text style={st.shotNote} numberOfLines={1}>{note}</Text>
    </TouchableOpacity>
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
function Summary({ summary, challenge, onPlayAgain, onBack, onSeeBoard }) {
  const { user, profile } = useAuth();
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [unverified, setUnverified] = useState(false);   // saved, but the server could not match it to a run
  const [duel, setDuel] = useState(null);        // settled challenge row after posting
  const [seasonRank, setSeasonRank] = useState(null);
  const tier = scoreTier(summary.arcadeScore, false);
  const qualifying = QUALIFYING_DIFFICULTIES.includes(summary.difficulty);

  const post = async () => {
    if (!user?.id) { Alert.alert('Sign in to post', 'Arcade scores are tied to your account.'); return; }
    setPosting(true);
    try {
      const base = {
        user_id: user.id,
        holes: 9,
        difficulty: summary.difficulty,
        total_strokes: summary.totalStrokes,
        total_seconds: summary.totalSeconds,
        points: summary.totalScore,
        clocked_score: summary.arcadeScore,
        holes_under_clock: summary.holesUnderClock,
        seed: String(summary.seed),
        challenge_id: challenge?.id ?? null,
      };
      // Each run records the build and the ruleset it was played under, so a
      // tuning change never mixes old and new numbers without a trace.
      let { data: row, error } = await supabase.from('arcade_scores')
        .insert({
          ...base, app_version: APP_VERSION, ruleset_version: RULESET,
          pause_count: summary.pauseCount ?? 0, paused_seconds: summary.pausedSeconds ?? 0,
        }).select('id, verified').single();
      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        // The columns are not on the server yet: post the run without them.
        ({ data: row, error } = await supabase.from('arcade_scores').insert(base).select('id').single());
      }
      // The server takes one score per run. A second attempt for the same
      // run means the first one landed: treat it as posted.
      if (error?.code === '23505') { setPosted(true); return; }
      if (error) throw error;
      setPosted(true);
      setUnverified(row?.verified === false);
      endPlaySession(summary.playSessionId, { scoreId: row.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (challenge) {
        try { setDuel(await submitArcadeChallengeScore(challenge, user.id, profile?.username, row.id)); }
        catch (e) { Alert.alert('Run posted, duel not updated', e?.message ?? 'Open the Arcade tab to check the challenge.'); }
      }
      if (qualifying) {
        fetchSeasonBoard().then(b => { const mine = b.find(r => r.user_id === user.id); setSeasonRank(mine?.rank ?? null); }).catch(() => {});
      }
    } catch (e) {
      Alert.alert('Could not post', e?.message ?? 'Try again in a moment.');
    } finally { setPosting(false); }
  };

  // Every run posts itself. A completed nine belongs on the board; the only
  // choice a player makes is which level to play.
  useEffect(() => { if (user?.id && !posted && !posting) post(); }, []);

  return (
    <SafeAreaView style={st.screen}>
      <View style={st.topBar}>
        <TouchableOpacity onPress={onBack} style={st.iconBtn} accessibilityLabel="Back to arcade">
          <Ionicons name="chevron-back" size={22} color={COLOR.muted} />
        </TouchableOpacity>
        <Text style={st.wordmark}>ROUND COMPLETE</Text>
        <View style={st.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={st.scoreCard}>
          <Text style={[st.sectionQ, { marginTop: 0 }]}>POINTS · {String(summary.difficulty).toUpperCase()}</Text>
          <Text style={[st.heroScore, { color: summary.totalScore > 0 ? COLOR.green : summary.totalScore < 0 ? COLOR.red : COLOR.cream }]}>{signed(summary.totalScore)}</Text>
          <Text style={st.heroCaption}>This is the number the leaderboard ranks.</Text>
          <View style={st.scoreRule} />
          <View style={st.ratingRow}>
            <Text style={st.statLabel}>ARCADE SCORE</Text>
            <Text style={[st.ratingValue, { color: tier.color }]}>{summary.arcadeScore ?? '--'}<Text style={st.ratingOf}> / 100</Text></Text>
            <Text style={[st.tierLabel, { color: tier.color }]}>{tier.name}</Text>
          </View>
          <Text style={[st.footnote, { marginTop: 8 }]}>A 0 to 100 rating of this run from points and holes under the clock. Arcade only: it never touches your Clocked Score.</Text>
        </View>

        <View style={st.statGrid}>
          <BigStat label="STROKES" value={String(summary.totalStrokes)} />
          <BigStat label="TOTAL TIME" value={formatSecondsLong(summary.totalSeconds)} />
          <BigStat label="UNDER CLOCK" value={`${summary.holesUnderClock}/${summary.holesPlayed}`} color={summary.holesUnderClock >= 6 ? COLOR.green : summary.holesUnderClock >= 3 ? COLOR.amber : COLOR.red} />
          <BigStat label="HEAT" value={summary.bonusPoints ? `+${summary.bonusPoints}` : '0'} color={summary.bonusPoints ? COLOR.gold : COLOR.cream} />
        </View>

        <View style={st.holesCard}>
          <View style={st.holeHead}>
            <Text style={[st.holeCell, st.statLabel]}>HOLE</Text>
            <Text style={[st.holeCell, st.statLabel]}>PAR</Text>
            <Text style={[st.holeCell, st.statLabel]}>STR</Text>
            <Text style={[st.holeCell, st.statLabel, { flex: 1.5 }]}>CLOCK</Text>
            <Text style={[st.holeCell, st.statLabel, { textAlign: 'center' }]}>HEAT</Text>
            <Text style={[st.holeCell, st.statLabel, { textAlign: 'right' }]}>PTS</Text>
          </View>
          {summary.holes.map(h => {
            const beat = h.beat ?? (!h.timedOut && h.elapsed <= h.timePar);
            const d = Math.abs(h.timePar - h.elapsed);
            return (
              <View key={h.hole} style={st.holeRow}>
                <Text style={[st.holeCell, st.holeNum]}>{h.hole}</Text>
                <Text style={[st.holeCell, st.holeTxt]}>{h.par}</Text>
                <Text style={[st.holeCell, st.holeTxt]}>{h.strokes}{h.pickedUp ? '*' : ''}</Text>
                <Text style={[st.holeCell, st.holeTxt, { flex: 1.5, color: h.timedOut ? COLOR.red : beat ? COLOR.green : COLOR.red }]} numberOfLines={1}>
                  {h.timedOut ? 'OUT OF TIME' : `${beat ? MINUS : '+'}${formatSeconds(d)}`}
                </Text>
                <View style={[st.holeCell, { alignItems: 'center', justifyContent: 'center' }]}>
                  {h.bonus ? <View style={st.heatChip}><Text style={st.heatChipText}>+{h.bonus}</Text></View> : null}
                </View>
                <Text style={[st.holeCell, st.holeTxt, { textAlign: 'right', color: h.holeScore > 0 ? COLOR.green : h.holeScore < 0 ? COLOR.red : COLOR.muted }]}>
                  {signed(h.holeScore)}
                </Text>
              </View>
            );
          })}
          <Text style={[st.footnote, { textAlign: 'left', marginTop: 8 }]}>* Picked up at double bogey ({MINUS}2). OUT OF TIME is double bogey {MINUS}2 and {MINUS}1 more. Finishing over the clock costs CLOCK points. HEAT adds +1, +2, +3 on the third, sixth and ninth hole in a row under the clock.</Text>
        </View>

        {challenge && (
          <View style={st.duelCard}>
            <Text style={st.sectionQ}>ARCADE DUEL</Text>
            {!duel ? (
              <Text style={st.duelText}>{posting ? 'Posting your run…' : 'Your run is in.'}</Text>
            ) : duel.status === 'complete' ? (
              <>
                <Text style={[st.duelResult, { color: !duel.winner_id ? COLOR.amber : duel.winner_id === user?.id ? COLOR.green : COLOR.red }]}>
                  {!duel.winner_id ? 'DEAD HEAT' : duel.winner_id === user?.id ? 'YOU WON' : 'YOU LOST'}
                </Text>
                <Text style={st.duelText}>
                  You {summary.totalScore > 0 ? '+' : ''}{summary.totalScore} · {formatSeconds(summary.totalSeconds)}   vs   {(() => { const tp = duel.challenger_id === user?.id ? duel.challenged_points : duel.challenger_points; const ts = duel.challenger_id === user?.id ? duel.challenged_seconds : duel.challenger_seconds; return `${tp > 0 ? '+' : ''}${tp} · ${formatSeconds(ts)}`; })()}
                </Text>
              </>
            ) : (
              <Text style={st.duelText}>Your run is in. Waiting on your opponent. You'll get a notification when it's settled.</Text>
            )}
          </View>
        )}
        {posted && !unverified && qualifying && seasonRank != null && (
          <Text style={[st.footnote, { color: seasonRank <= QUALIFY_TOP ? COLOR.green : COLOR.muted, marginTop: 10 }]}>
            {seasonRank <= QUALIFY_TOP ? `#${seasonRank} this month. Inside the qualifying line.` : `#${seasonRank} this month. Top ${QUALIFY_TOP} at month end qualify.`}
          </Text>
        )}
        {posted && unverified && (
          <Text style={[st.footnote, { marginTop: 10 }]}>Run saved. The server could not match it to a started round, so it stays off the board.</Text>
        )}
        {posted && !unverified && !qualifying && (
          <Text style={[st.footnote, { marginTop: 10 }]}>Beginner runs post to the all-time board but don't count toward qualifying.</Text>
        )}
        <TouchableOpacity style={st.primaryBtn} onPress={onPlayAgain} activeOpacity={0.85}>
          <Text style={st.primaryBtnText}>PLAY AGAIN</Text>
        </TouchableOpacity>
        {posting ? (
          <View style={[st.secondaryBtn, { opacity: 0.7 }]}><ActivityIndicator color={COLOR.gold} /></View>
        ) : posted ? (
          <TouchableOpacity style={st.secondaryBtn} onPress={onSeeBoard} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="See the arcade leaderboard">
            <View style={st.btnRow}>
              <Ionicons name="trophy-outline" size={15} color={COLOR.gold} />
              <Text style={st.secondaryBtnText}>SEE LEADERBOARD{seasonRank != null ? `  \u00B7  #${seasonRank}` : ''}</Text>
            </View>
          </TouchableOpacity>
        ) : !user?.id ? (
          <View style={st.secondaryBtn}><Text style={st.secondaryBtnText}>SIGN IN TO POST RUNS</Text></View>
        ) : (
          <TouchableOpacity style={st.secondaryBtn} onPress={post} activeOpacity={0.85}>
            <Text style={st.secondaryBtnText}>RETRY POSTING</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={st.secondaryBtn}
          onPress={() => {
            const pts = signed(summary.totalScore);
            const line = `${pts} on Clocked Arcade \u00B7 ${formatSecondsLong(summary.totalSeconds)} \u00B7 ${summary.holesUnderClock}/${summary.holesPlayed} under the clock \u00B7 ${String(summary.difficulty).toUpperCase()}`;
            Share.share({ message: `${line}\n\nNine holes, a shot clock on every one. clocked.golf` }).catch(() => {});
          }}
          activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Share this run"
        >
          <View style={st.btnRow}>
            <Ionicons name="share-outline" size={15} color={COLOR.gold} />
            <Text style={st.secondaryBtnText}>SHARE</Text>
          </View>
        </TouchableOpacity>
        <Text style={st.footnote}>Every run posts to the arcade board. Arcade runs never touch your Clocked Score.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function BigStat({ label, value, color = COLOR.cream }) {
  return (
    <View style={st.bigStat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.bigStatValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  wordmark: { ...TYPE.labelOn, fontSize: 11, letterSpacing: 3 },

  heroCard: { ...CARD, alignItems: 'center', paddingVertical: 24, gap: 10, borderColor: COLOR.borderGold },
  heroTitle: { color: COLOR.cream, fontSize: 22, fontWeight: '300', textAlign: 'center', lineHeight: 28 },
  heroSub: { color: COLOR.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },

  sectionQ: { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 8, marginTop: 20 },
  difficultyRow: { flexDirection: 'row', gap: 10 },
  diffBtn: { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 14, alignItems: 'center', gap: 4 },
  diffBtnActive: { borderColor: COLOR.gold, backgroundColor: '#E8CC6E0F' },
  diffDot: { width: 8, height: 8, borderRadius: RADIUS.xs, marginBottom: 2 },
  diffLabel: { fontSize: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  diffLabelActive: { color: COLOR.cream },
  diffSub: { fontSize: 10, color: COLOR.dim },

  primaryBtn: { backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: COLOR.bg, fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  secondaryBtn: { borderRadius: RADIUS.lg, paddingVertical: 15, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: COLOR.gold },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryBtnText: { color: COLOR.gold, fontSize: 13, fontWeight: '800', letterSpacing: 3 },

  howCard: { ...CARD, marginTop: 20, paddingTop: 0 },
  howRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  howText: { color: COLOR.muted, fontSize: 12, lineHeight: 17, flex: 1 },

  boardCard: { ...CARD, padding: 0 },
  boardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  boardRowBorder: { borderBottomWidth: 1, borderBottomColor: COLOR.border },
  rank: { ...TYPE.statNumber, width: 24, fontSize: 15, color: COLOR.dim },
  boardName: { color: COLOR.cream, fontSize: 14, fontWeight: '600' },
  boardMeta: { color: COLOR.dim, fontSize: 10, marginTop: 1, letterSpacing: 0.5 },
  boardPts: { ...TYPE.statNumber, fontSize: 20, color: COLOR.green },
  emptyText: { color: COLOR.dim, fontSize: 12, textAlign: 'center', padding: 18 },
  footnote: { color: COLOR.dim, fontSize: 10, textAlign: 'center', marginTop: 12, letterSpacing: 0.3 },

  // game
  gameTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, height: 40 },
  gameWordmark: { ...TYPE.labelOn, fontSize: 9, letterSpacing: 2.5 },
  roundClock: { ...TYPE.statNumber, color: COLOR.muted, fontSize: 14, width: 56, textAlign: 'right', paddingRight: 8 },
  mapWrap: { flex: 1, backgroundColor: '#0B1F11', overflow: 'hidden' },
  controls: { height: 178, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, backgroundColor: COLOR.surface, borderTopWidth: 1, borderTopColor: COLOR.border, justifyContent: 'center' },
  driveRow: { flexDirection: 'row', alignItems: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center' },
  stageSide: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  shotStat: { flex: 1, flexBasis: 0, alignItems: 'center', paddingVertical: 4, borderRadius: RADIUS.sm ?? 8, borderWidth: 1, borderColor: 'transparent' },
  shotValue: { ...TYPE.statNumber, color: COLOR.cream, fontSize: 16, lineHeight: 21, marginTop: 1 },
  shotUnit: { fontSize: 10, color: COLOR.muted, letterSpacing: 1, fontWeight: '700' },
  shotNote: { fontSize: 8, lineHeight: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  clubBtn: { borderColor: COLOR.border, backgroundColor: COLOR.bg },
  clubBtnOn: { borderColor: COLOR.borderGold },
  clubBtnManual: { borderColor: COLOR.gold },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  toast: { backgroundColor: '#090F0AE6', borderRadius: 999, borderWidth: 1, borderColor: COLOR.borderGold, paddingHorizontal: 14, paddingVertical: 7, maxWidth: '92%' },
  toastText: { ...TYPE.label, color: COLOR.cream, fontSize: 10, letterSpacing: 1.5 },
  tapOn: { ...TYPE.label, fontSize: 9, color: COLOR.cream, opacity: 0.7, letterSpacing: 2.5, marginTop: 12 },
  pauseCover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: COLOR.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  pauseTitle: { ...TYPE.heroNumber, color: COLOR.cream, fontSize: 34, letterSpacing: 6, marginTop: 10 },
  pauseSub: { ...TYPE.labelOn, marginTop: 10, textAlign: 'center' },
  pauseNote: { color: COLOR.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, marginBottom: 8 },
  pauseBtn: { alignSelf: 'stretch' },
  stageBox: { width: STAGE_W, height: STAGE_H, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: '#0B1F11', borderWidth: 1, borderColor: COLOR.border },
  hint: { ...TYPE.label, color: COLOR.gold, fontSize: 9, letterSpacing: 2, lineHeight: 14 },
  subHint: { color: COLOR.dim, fontSize: 10, marginTop: 6, lineHeight: 14 },
  readout: { color: COLOR.muted, fontSize: 10, letterSpacing: 1.5, marginTop: 8 },
  readoutNum: { ...TYPE.statNumber, color: COLOR.cream, fontSize: 20 },
  readoutUnit: { fontSize: 10, color: COLOR.dim, letterSpacing: 1 },
  aimRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 },
  statLabel: { ...TYPE.label },

  transitionCard: {
    position: 'absolute', left: 24, right: 24, top: '38%', alignItems: 'center',
    backgroundColor: '#090F0ACC', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderGold, paddingVertical: 18,
  },
  transitionHole: { ...TYPE.heroNumber, color: COLOR.cream, fontSize: 36 },
  transitionPar: { ...TYPE.labelOn, marginTop: 4 },
  transitionTp: { ...TYPE.label, color: COLOR.muted, marginTop: 8 },

  // summary
  scoreCard: { ...CARD, alignItems: 'center', borderColor: COLOR.borderGold, paddingVertical: 22 },
  heroScore: { ...TYPE.heroNumber, fontSize: 84, lineHeight: 90 },
  tierLabel: { ...TYPE.labelOn, fontSize: 10, letterSpacing: 2.5 },
  heroCaption: { color: COLOR.muted, fontSize: 11, letterSpacing: 0.3 },
  scoreRule: { alignSelf: 'stretch', height: 1, backgroundColor: COLOR.border, marginTop: 16, marginBottom: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 12 },
  ratingValue: { ...TYPE.statNumber, fontSize: 24 },
  ratingOf: { fontSize: 12, color: COLOR.dim, fontWeight: '600' },
  heatChip: { borderRadius: 999, borderWidth: 1, borderColor: COLOR.gold, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: '#E8CC6E14' },
  heatChipText: { ...TYPE.statNumber, color: COLOR.gold, fontSize: 11, fontWeight: '700' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  bigStat: { ...CARD, width: '48%', flexGrow: 1, paddingVertical: 14 },
  bigStatValue: { ...TYPE.statNumber, fontSize: 26, marginTop: 4 },
  holesCard: { ...CARD, marginTop: 12 },
  duelCard: { ...CARD, marginTop: 12, borderColor: COLOR.borderGold },
  duelResult: { ...TYPE.heroNumber, fontSize: 28, fontWeight: '700', letterSpacing: 2, marginTop: 4 },
  duelText: { color: COLOR.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  holeHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  holeRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  holeCell: { flex: 1 },
  holeNum: { ...TYPE.statNumber, color: COLOR.dim, fontSize: 14 },
  holeTxt: { ...TYPE.statNumber, color: COLOR.cream, fontSize: 14 },
});
