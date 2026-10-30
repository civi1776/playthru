// ─── ArcadeScreen — Clocked Arcade: start → game → summary ───────────────────
// A top-down golf game that plays by the real Clocked rules. Scoring, time
// par and the verdict beat all come from the same engine as a live round
// (lib/clockedSport, lib/clockedRating). Results persist ONLY to
// public.arcade_scores — never to rounds / activity_feed / leaderboard.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, PanResponder,
  AppState, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COLOR, TYPE, SPACING, RADIUS, CARD, scoreTier } from '../lib/theme';
import { formatSeconds, formatSecondsLong } from '../lib/clockedSport';
import {
  createGame, tick, setAim, releaseAim, lockPower, drainEvents, requestTurbo, swingPose,
  holeElapsed, roundElapsed, runningPoints, currentDispersion, hintFor, VERDICT_HOLD_MS,
} from '../lib/arcade/engine';
import { turboState, cartMph } from '../lib/arcade/physics';
import { randomSeed, dist } from '../lib/arcade/course';
import { DEFAULT_AVATAR, loadAvatar } from '../lib/arcade/avatar';
import HoleMap, { cameraTargetFor, lerpCamera, screenToWorld } from '../components/arcade/HoleMap';
import Joystick from '../components/arcade/Joystick';
import PowerMeter from '../components/arcade/PowerMeter';
import TurboButton from '../components/arcade/TurboButton';
import { SwingStage } from '../components/arcade/Golfer';
import ArcadeHUD, { VerdictOverlay } from '../components/arcade/ArcadeHUD';
import InitialsAvatar from '../components/InitialsAvatar';

const DIFFICULTIES = [
  { key: 'beginner',     label: 'BEGINNER', sub: 'Roomy clock',  color: COLOR.green },
  { key: 'intermediate', label: 'INTER.',   sub: 'The standard', color: COLOR.amber },
  { key: 'pro',          label: 'PRO',      sub: 'Tour pace',    color: COLOR.red },
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
  const [seed, setSeed] = useState(() => randomSeed());
  const [summary, setSummary] = useState(null);

  useEffect(() => { if (!route?.params?.avatar) loadAvatar().then(setAvatar); }, [route?.params?.avatar]);

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
        onDone={(s) => { setSummary(s); setMode('summary'); }}
      />
    );
  }
  if (mode === 'summary' && summary) {
    return <Summary summary={summary} onPlayAgain={startGame} onBack={leave} />;
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
            Nine procedurally generated holes. Swing, drive the cart to your ball, and beat the time par — the
            clock never stops, not even between holes.
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
          <HowRow icon="car-outline"      text="After every shot, drive the cart to your ball. Carts can't enter the green — park and walk." />
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
function Game({ seed, difficulty, avatar, onDone, onQuit }) {
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = createGame({ seed, difficulty });
  const g = gameRef.current;

  const [, setFrame] = useState(0);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const cameraRef = useRef(null);
  const joyRef = useRef({ dx: 0, dy: 0 });
  const pausedRef = useRef(false);
  const lastTsRef = useRef(null);
  const mapSizeRef = useRef(mapSize);
  mapSizeRef.current = mapSize;

  // Sound identity — shared with the real round.
  const buzzerPlayer = useAudioPlayer(require('../assets/sounds/buzzer.wav'));
  const chimePlayer  = useAudioPlayer(require('../assets/sounds/chime.wav'));
  const playBuzzer = useCallback(() => { try { buzzerPlayer.seekTo(0); buzzerPlayer.play(); } catch {} }, [buzzerPlayer]);
  const playChime  = useCallback(() => { try { chimePlayer.seekTo(0);  chimePlayer.play();  } catch {} }, [chimePlayer]);

  // Verdict beat — identical semantics to ClockedRoundScreen.showVerdict.
  const [verdict, setVerdict] = useState(null);
  const verdictTimer = useRef(null);
  const showVerdict = useCallback((ev) => {
    const color = ev.beat ? COLOR.green : COLOR.red;
    if (ev.beat) {
      playChime();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    clearTimeout(verdictTimer.current);
    const pr = ev.result?.playerResults?.[0];
    setVerdict({
      beat: ev.beat, delta: ev.delta, color, key: Date.now(),
      label: pr?.label, points: ev.result?.holeScore ?? 0, pickedUp: ev.pickedUp,
    });
    verdictTimer.current = setTimeout(() => setVerdict(null), VERDICT_HOLD_MS - 150);
  }, [playChime]);

  const doneRef = useRef(false);
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'tree':
        case 'water':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          break;
        case 'expired':
          playBuzzer();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          break;
        case 'verdict':
          showVerdict(ev);
          break;
        case 'done':
          if (!doneRef.current) { doneRef.current = true; setTimeout(() => onDone(ev.summary), 0); }
          break;
        default: break;
      }
    }
  }, [playBuzzer, showVerdict, onDone]);

  // Game loop — rAF, physics paused in background, clock timestamp-anchored.
  useEffect(() => {
    let raf;
    const loop = () => {
      const now = Date.now();
      const { width, height } = mapSizeRef.current;
      if (!pausedRef.current && width > 0) {
        const dt = lastTsRef.current == null ? 0 : Math.min(0.05, (now - lastTsRef.current) / 1000);
        tick(g, dt, now, joyRef.current);
        const aspect = width / height;
        const target = cameraTargetFor(g, aspect, cameraRef.current);
        cameraRef.current = cameraRef.current
          ? lerpCamera(cameraRef.current, target, 1 - Math.exp(-dt * 4.5))
          : target;
        const events = drainEvents(g);
        if (events.length) handleEvents(events);
        setFrame(f => (f + 1) % 1e9);
      }
      lastTsRef.current = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); clearTimeout(verdictTimer.current); };
  }, [g, handleEvents]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      pausedRef.current = s !== 'active';
      lastTsRef.current = null; // don't integrate the time we were away
    });
    return () => sub.remove();
  }, []);

  // Aim / power gestures on the map.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const game = gameRef.current;
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

  const confirmQuit = () => {
    Alert.alert('Leave the arcade?', 'This round will not be saved.', [
      { text: 'Keep playing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: onQuit },
    ]);
  };

  const now = Date.now();
  const elapsed = holeElapsed(g, now);
  const clockLive = !!g.clock.holeStartTs;
  const dispersion = currentDispersion(g, now);
  const toPin = Math.round(dist(g.ball, g.hole.pin));
  const toBall = Math.round(dist(g.cart, g.ball));
  const isAiming = g.phase === 'aim' || g.phase === 'putt';
  const pose = swingPose(g, now);
  const turbo = turboState(g.cart, now);
  const mph = cartMph(g.cart);
  const showStage = isAiming || g.phase === 'power' || g.phase === 'flight';

  return (
    <SafeAreaView style={st.screen} edges={['top', 'bottom']}>
      <View style={st.gameTop}>
        <TouchableOpacity onPress={confirmQuit} style={st.iconBtn} accessibilityLabel="Leave arcade">
          <Ionicons name="close" size={22} color={COLOR.muted} />
        </TouchableOpacity>
        <Text style={st.gameWordmark}>CLOCKED ARCADE · {difficulty.toUpperCase()}</Text>
        <Text style={st.roundClock}>{formatSeconds(Math.floor(roundElapsed(g, now)))}</Text>
      </View>

      <ArcadeHUD
        holeNumber={g.holeIdx + 1}
        par={g.hole.par}
        strokes={g.strokes}
        points={runningPoints(g)}
        timePar={g.timePar}
        elapsed={elapsed}
        clockLive={clockLive}
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
            <Text style={st.transitionPar}>PAR {g.hole.par} · {g.hole.length} YDS</Text>
            <Text style={st.transitionTp}>TIME PAR {formatSeconds(g.timePar)} — ALREADY RUNNING</Text>
          </View>
        )}
        <VerdictOverlay verdict={verdict} />
      </View>

      <View style={st.controls}>
        {g.phase === 'drive' || g.phase === 'transition' ? (
          <View style={st.driveRow}>
            <Joystick onChange={(v) => { joyRef.current = v; }} disabled={g.phase !== 'drive'} />
            <View style={{ flex: 1, marginHorizontal: 14 }}>
              <Text style={st.hint}>{hintFor(g)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 6 }}>
                <Text style={st.readout}><Text style={[st.readoutNum, { color: turbo.active ? COLOR.goldBright : COLOR.cream }]}>{mph}</Text> MPH</Text>
                <Text style={st.readout}><Text style={st.readoutNum}>{toBall}</Text> YDS</Text>
              </View>
              <Text style={st.subHint}>Steer with the stick. Rough and sand slide. Green's off-limits — park and walk.</Text>
            </View>
            <TurboButton
              charge={turbo.charge} active={turbo.active} ready={turbo.ready}
              disabled={g.phase !== 'drive'}
              onPress={() => requestTurbo(gameRef.current, Date.now())}
            />
          </View>
        ) : showStage ? (
          <View style={st.stageRow}>
            <View style={st.stageBox}>
              <SwingStage avatar={avatar} pose={pose} isPutt={g.isPutt} club={g.club.name} width={150} height={112} idleT={now / 1000} />
            </View>
            <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
              {g.phase === 'power' ? (
                <PowerMeter value={g.power.value} club={g.club} />
              ) : (
                <View style={st.aimRow}>
                  <Readout label="TO PIN" value={`${toPin}`} unit="YDS" />
                  <Readout label="LIE" value={g.lie.toUpperCase()} />
                  <Readout label="CLUB" value={g.club.name} />
                  <Readout label="CONE" value={`${dispersion.toFixed(1)}°`} color={dispersion > 7 ? COLOR.red : dispersion > 4 ? COLOR.amber : COLOR.green} />
                </View>
              )}
              <Text style={[st.hint, { marginTop: 10 }]}>{hintFor(g)}</Text>
            </View>
          </View>
        ) : (
          <Text style={[st.hint, { textAlign: 'center' }]}>{hintFor(g)}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function Readout({ label, value, unit, color = COLOR.cream }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.readoutNum, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}{unit ? <Text style={st.readoutUnit}> {unit}</Text> : null}</Text>
    </View>
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────
function Summary({ summary, onPlayAgain, onBack }) {
  const { user } = useAuth();
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const tier = scoreTier(summary.arcadeScore, false);

  const post = async () => {
    if (!user?.id) { Alert.alert('Sign in to post', 'Arcade scores are tied to your account.'); return; }
    setPosting(true);
    try {
      const { error } = await supabase.from('arcade_scores').insert({
        user_id: user.id,
        holes: 9,
        difficulty: summary.difficulty,
        total_strokes: summary.totalStrokes,
        total_seconds: summary.totalSeconds,
        points: summary.totalScore,
        clocked_score: summary.arcadeScore,
        holes_under_clock: summary.holesUnderClock,
        seed: summary.seed,
      });
      if (error) throw error;
      setPosted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not post', e?.message ?? 'Try again in a moment.');
    } finally { setPosting(false); }
  };

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
          <Text style={st.sectionQ}>ARCADE SCORE</Text>
          <Text style={[st.heroScore, { color: tier.color }]}>{summary.arcadeScore ?? '--'}</Text>
          <Text style={[st.tierLabel, { color: tier.color }]}>{tier.name}</Text>
          <Text style={st.footnote}>Arcade only — not your real Clocked Score.</Text>
        </View>

        <View style={st.statGrid}>
          <BigStat label="POINTS" value={summary.totalScore > 0 ? `+${summary.totalScore}` : String(summary.totalScore)} color={summary.totalScore > 0 ? COLOR.green : summary.totalScore < 0 ? COLOR.red : COLOR.cream} />
          <BigStat label="TOTAL TIME" value={formatSecondsLong(summary.totalSeconds)} />
          <BigStat label="UNDER CLOCK" value={`${summary.holesUnderClock}/${summary.holesPlayed}`} color={summary.holesUnderClock >= 6 ? COLOR.green : summary.holesUnderClock >= 3 ? COLOR.amber : COLOR.red} />
          <BigStat label="STROKES" value={String(summary.totalStrokes)} />
        </View>

        <View style={st.holesCard}>
          <View style={st.holeHead}>
            <Text style={[st.holeCell, st.statLabel]}>HOLE</Text>
            <Text style={[st.holeCell, st.statLabel]}>PAR</Text>
            <Text style={[st.holeCell, st.statLabel]}>STR</Text>
            <Text style={[st.holeCell, st.statLabel, { flex: 1.6 }]}>CLOCK</Text>
            <Text style={[st.holeCell, st.statLabel, { textAlign: 'right' }]}>PTS</Text>
          </View>
          {summary.holes.map(h => {
            const beat = h.elapsed <= h.timePar;
            const d = Math.abs(h.timePar - h.elapsed);
            return (
              <View key={h.hole} style={st.holeRow}>
                <Text style={[st.holeCell, st.holeNum]}>{h.hole}</Text>
                <Text style={[st.holeCell, st.holeTxt]}>{h.par}</Text>
                <Text style={[st.holeCell, st.holeTxt]}>{h.strokes}{h.pickedUp ? '*' : ''}</Text>
                <Text style={[st.holeCell, st.holeTxt, { flex: 1.6, color: beat ? COLOR.green : COLOR.red }]}>
                  {beat ? '−' : '+'}{formatSeconds(d)}{h.penalty ? `  (${h.penalty})` : ''}
                </Text>
                <Text style={[st.holeCell, st.holeTxt, { textAlign: 'right', color: h.holeScore > 0 ? COLOR.green : h.holeScore < 0 ? COLOR.red : COLOR.muted }]}>
                  {h.holeScore > 0 ? `+${h.holeScore}` : h.holeScore}
                </Text>
              </View>
            );
          })}
          <Text style={[st.footnote, { textAlign: 'left', marginTop: 8 }]}>* picked up at double bogey — the real Clocked cap.</Text>
        </View>

        <TouchableOpacity style={st.primaryBtn} onPress={onPlayAgain} activeOpacity={0.85}>
          <Text style={st.primaryBtnText}>PLAY AGAIN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.secondaryBtn, (posted || posting) && { opacity: 0.6 }]}
          onPress={post}
          disabled={posted || posting}
          activeOpacity={0.85}
        >
          {posting ? <ActivityIndicator color={COLOR.gold} /> : (
            <Text style={st.secondaryBtnText}>{posted ? 'POSTED TO ARCADE BOARD' : 'POST TO FEED'}</Text>
          )}
        </TouchableOpacity>
        <Text style={st.footnote}>Posting adds this run to the Arcade Leaderboard only.</Text>
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
  diffBtn: { flex: 1, backgroundColor: COLOR.surface, borderRadius: 14, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 14, alignItems: 'center', gap: 4 },
  diffBtnActive: { borderColor: COLOR.gold, backgroundColor: '#C9A84C0F' },
  diffDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  diffLabel: { fontSize: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  diffLabelActive: { color: COLOR.cream },
  diffSub: { fontSize: 10, color: COLOR.dim },

  primaryBtn: { backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: COLOR.bg, fontSize: 14, fontWeight: '800', letterSpacing: 3 },
  secondaryBtn: { borderRadius: RADIUS.lg, paddingVertical: 15, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: COLOR.gold },
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
  controls: { height: 168, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, backgroundColor: COLOR.surface, borderTopWidth: 1, borderTopColor: COLOR.border, justifyContent: 'center' },
  driveRow: { flexDirection: 'row', alignItems: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center' },
  stageBox: { width: 150, height: 112, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: '#0B1F11', borderWidth: 1, borderColor: COLOR.border },
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
  transitionTp: { ...TYPE.label, color: COLOR.red, marginTop: 8 },

  // summary
  scoreCard: { ...CARD, alignItems: 'center', borderColor: COLOR.borderGold, paddingVertical: 22 },
  heroScore: { ...TYPE.heroNumber, fontSize: 84, lineHeight: 90 },
  tierLabel: { ...TYPE.labelOn, fontSize: 11, letterSpacing: 3 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  bigStat: { ...CARD, width: '48%', flexGrow: 1, paddingVertical: 14 },
  bigStatValue: { ...TYPE.statNumber, fontSize: 26, marginTop: 4 },
  holesCard: { ...CARD, marginTop: 12 },
  holeHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  holeRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  holeCell: { flex: 1 },
  holeNum: { ...TYPE.statNumber, color: COLOR.dim, fontSize: 14 },
  holeTxt: { ...TYPE.statNumber, color: COLOR.cream, fontSize: 14 },
});
