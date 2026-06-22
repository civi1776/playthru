// ─── Rules — the conversion engine ───────────────────────────────────────────
// Pitch-first, skimmable, one interactive showpiece. Calls real engine functions.

import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  computeTimePar, timePenalty, pointsForHole, formatSeconds,
  DEFAULT_CLOCK_COEFFICIENTS, DEFAULT_PENALTY_PARAMS, DEFAULT_SCORING_SCALE,
} from '../lib/clockedSport';

// ─── Representative hole for the demo ────────────────────────────────────────
const DEMO_YARDAGE  = 380;
const DEMO_PAR      = 4;
const DEMO_PLAYERS  = 2;
const DEMO_TRANSPORT = 'Walking';
const DEMO_TIME_PAR = computeTimePar(DEMO_YARDAGE, DEMO_PAR, DEMO_PLAYERS, DEMO_TRANSPORT);

// ─── Worked example (static, computed from real engine) ──────────────────────
const EX_YARDAGE   = 380;
const EX_PAR       = 4;
const EX_PLAYERS   = 2;
const EX_TIME_PAR  = computeTimePar(EX_YARDAGE, EX_PAR, EX_PLAYERS, 'Walking');
const EX_ELAPSED   = EX_TIME_PAR - 28; // beat the clock by 28s
const EX_PENALTY   = timePenalty(EX_ELAPSED, EX_TIME_PAR);
const EX_P1        = pointsForHole(3, EX_PAR); // birdie
const EX_P2        = pointsForHole(4, EX_PAR); // par
const EX_TEAM_PTS  = (EX_P1?.points ?? 0) + (EX_P2?.points ?? 0);
const EX_HOLE_SCORE = EX_TEAM_PTS + EX_PENALTY;

// ─── Scoring table data ──────────────────────────────────────────────────────
const SCORING_ROWS = [
  { result: 'Albatross',            pts: '+9', color: '#C9A84C' },
  { result: 'Eagle',                pts: '+6', color: '#C9A84C' },
  { result: 'Birdie',               pts: '+3', color: '#7DC87A' },
  { result: 'Par',                  pts: '+1', color: '#F5EDD8' },
  { result: 'Bogey',                pts: '0',  color: '#B8A882' },
  { result: 'Double bogey or worse', pts: '\u22122', color: '#E85D4A' },
];

// ─── Colors ──────────────────────────────────────────────────────────────────
const GOLD    = '#C9A84C';
const CREAM   = '#F5EDD8';
const MUTED   = '#B8A882';
const DIM     = '#7A6E58';
const BG      = '#090F0A';
const CARD    = '#0D1A0F';
const GREEN   = '#7DC87A';
const RED     = '#E85D4A';
const BORDER  = '#7DC87A22';

// ─── Reusable pieces ─────────────────────────────────────────────────────────
function SectionHead({ icon, title }) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionDot}><Ionicons name={icon} size={16} color={GOLD} /></View>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function Bullet({ children }) {
  return (
    <View style={s.bulletRow}>
      <View style={s.bulletDot} />
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

// ─── Playable Shot Clock ─────────────────────────────────────────────────────
// Compressed timescale: the full arc (countdown → zero → penalty → cap at -3)
// plays out in ~10 real seconds. Displays real time-par numbers and uses real
// penalty math — only the tick rate is accelerated. The actual round clock is
// unaffected (this speedup is demo-only).

// Target: ~10 real seconds to reach -3 cap.
// -3 cap hits at timePar + (6 intervals × 30s) = timePar + 180s of game-time.
// Total game-time to show = timePar + 180. We want that in ~10 real seconds.
const DEMO_TOTAL_GAME_SECONDS = DEMO_TIME_PAR + 180;
const DEMO_REAL_DURATION = 10; // seconds of real time for the full arc
const DEMO_SPEED = DEMO_TOTAL_GAME_SECONDS / DEMO_REAL_DURATION;
const DEMO_TICK_INTERVAL = 50; // ms — smooth ticking

function ShotClockDemo() {
  const [phase, setPhase]     = useState('idle'); // idle | running | stopped
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const clockRef = useRef(null);

  const remaining = DEMO_TIME_PAR - elapsed;
  const penalty   = timePenalty(elapsed, DEMO_TIME_PAR);

  // Clock color
  const clkColor = remaining > 30 ? CREAM : remaining > 0 ? GOLD : RED;

  // Compressed tick: each real ms = DEMO_SPEED game-seconds
  const tick = useCallback(() => {
    if (startedAt) {
      const realElapsed = (Date.now() - startedAt) / 1000;
      const gameElapsed = Math.floor(realElapsed * DEMO_SPEED);
      setElapsed(Math.min(gameElapsed, DEMO_TOTAL_GAME_SECONDS));
    }
  }, [startedAt]);

  useEffect(() => {
    if (phase === 'running' && startedAt) {
      tick();
      clockRef.current = setInterval(tick, DEMO_TICK_INTERVAL);
    } else {
      clearInterval(clockRef.current);
    }
    return () => clearInterval(clockRef.current);
  }, [phase, startedAt, tick]);

  // Auto-stop at penalty cap
  useEffect(() => {
    if (phase === 'running' && elapsed >= DEMO_TOTAL_GAME_SECONDS) {
      setPhase('stopped');
    }
  }, [elapsed, phase]);

  const start = () => { setStartedAt(Date.now()); setElapsed(0); setPhase('running'); };
  const stop  = () => { tick(); setPhase('stopped'); };
  const reset = () => { setPhase('idle'); setElapsed(0); setStartedAt(null); };

  // Display
  let clockDisplay, clockSuffix;
  if (remaining >= 0) {
    clockDisplay = formatSeconds(remaining);
    clockSuffix  = null;
  } else {
    clockDisplay = formatSeconds(Math.abs(remaining));
    clockSuffix  = 'OVER';
  }

  return (
    <View style={d.wrap}>
      {/* Context */}
      <Text style={d.context}>{DEMO_YARDAGE} YDS {'\u00B7'} PAR {DEMO_PAR} {'\u00B7'} {DEMO_PLAYERS} PLAYERS {'\u00B7'} WALKING</Text>
      <Text style={d.timeParLabel}>TIME PAR  {formatSeconds(DEMO_TIME_PAR)}</Text>

      {/* Clock face */}
      <View style={d.clockFace}>
        <Text style={[d.digits, { color: clkColor }]}>{clockDisplay}</Text>
        {clockSuffix && <Text style={d.overLabel}>{clockSuffix}</Text>}
      </View>

      {/* Live penalty */}
      {penalty < 0 && phase !== 'idle' && (
        <View style={d.penaltyBadge}>
          <Text style={d.penaltyText}>{penalty} pts</Text>
        </View>
      )}

      {/* Controls */}
      <View style={d.controls}>
        {phase === 'idle' && (
          <TouchableOpacity style={d.startBtn} onPress={start} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color={BG} />
            <Text style={d.startBtnText}>Start</Text>
          </TouchableOpacity>
        )}
        {phase === 'running' && (
          <TouchableOpacity style={d.stopBtn} onPress={stop} activeOpacity={0.85}>
            <Ionicons name="flag" size={16} color={CREAM} />
            <Text style={d.stopBtnText}>Holed out</Text>
          </TouchableOpacity>
        )}
        {phase === 'stopped' && (
          <View style={d.resultBlock}>
            <Text style={[d.resultText, { color: remaining >= 0 ? GREEN : RED }]}>
              {remaining >= 0
                ? `Beat the clock \u2014 ${formatSeconds(remaining)} to spare`
                : `Over by ${formatSeconds(Math.abs(remaining))}`}
            </Text>
            <Text style={d.resultPenalty}>
              {penalty < 0 ? `Penalty: ${penalty} pts` : 'No penalty'}
            </Text>
            <TouchableOpacity style={d.resetBtn} onPress={reset} activeOpacity={0.7}>
              <Ionicons name="refresh" size={14} color={DIM} />
              <Text style={d.resetBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Worked Example Card ─────────────────────────────────────────────────────
function WorkedExample() {
  const spare = EX_TIME_PAR - EX_ELAPSED;
  return (
    <View style={ex.card}>
      <Text style={ex.title}>HOW A HOLE PLAYS</Text>
      <View style={ex.divider} />

      <View style={ex.row}>
        <Text style={ex.label}>HOLE</Text>
        <Text style={ex.value}>Par {EX_PAR} {'\u00B7'} {EX_YARDAGE} yds {'\u00B7'} {EX_PLAYERS} players walking</Text>
      </View>

      <View style={ex.row}>
        <Text style={ex.label}>TIME PAR</Text>
        <Text style={ex.value}>{formatSeconds(EX_TIME_PAR)}</Text>
      </View>

      <View style={ex.row}>
        <Text style={ex.label}>FINISH</Text>
        <Text style={[ex.value, { color: GREEN }]}>{formatSeconds(EX_ELAPSED)} — {formatSeconds(spare)} to spare</Text>
      </View>

      <View style={ex.divider} />

      <View style={ex.playersRow}>
        <View style={ex.playerCol}>
          <Text style={ex.playerLabel}>PLAYER 1</Text>
          <Text style={[ex.playerScore, { color: GREEN }]}>3 (Birdie)</Text>
          <Text style={ex.playerPts}>+{EX_P1.points} pts</Text>
        </View>
        <View style={ex.playerDivider} />
        <View style={ex.playerCol}>
          <Text style={ex.playerLabel}>PLAYER 2</Text>
          <Text style={[ex.playerScore, { color: CREAM }]}>4 (Par)</Text>
          <Text style={ex.playerPts}>+{EX_P2.points} pt</Text>
        </View>
      </View>

      <View style={ex.divider} />

      <View style={ex.totalRow}>
        <View style={ex.totalItem}>
          <Text style={ex.totalLabel}>TEAM POINTS</Text>
          <Text style={ex.totalValue}>+{EX_TEAM_PTS}</Text>
        </View>
        <View style={ex.totalItem}>
          <Text style={ex.totalLabel}>CLOCK PENALTY</Text>
          <Text style={[ex.totalValue, { color: EX_PENALTY < 0 ? RED : GREEN }]}>{EX_PENALTY === 0 ? '0' : EX_PENALTY}</Text>
        </View>
        <View style={ex.totalItem}>
          <Text style={ex.totalLabel}>HOLE SCORE</Text>
          <Text style={[ex.totalValue, { color: GREEN, fontSize: 22 }]}>+{EX_HOLE_SCORE}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function RulesScreen({ navigation }) {
  const playCTA = () => {
    const root = navigation.getParent();
    if (root) root.navigate('ClockedSetup');
    else navigation.navigate('ClockedSetup');
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.tabHeader}>
        <Text style={s.tabHeaderText}>The On-the-Clock Rules</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── 1. The hook ── */}
        <View style={s.hookBlock}>
          <Text style={s.hookHeadline}>Golf has a clock now.</Text>
          <Text style={s.hookSub}>
            A faster game you can play on any course.{'\n'}Same clubs, same fairways — the clock is part of the score.
          </Text>
        </View>

        {/* ── 2. Why it exists ── */}
        <View style={s.whyBlock}>
          <Text style={s.whyText}>
            A round takes too long. We're not speeding up golf — we built a new game on top of it, where pace is a skill instead of a complaint.
          </Text>
        </View>

        {/* ── 3. How it works ── */}

        {/* The Format */}
        <SectionHead icon="people-outline" title="The Format" />
        <View style={s.card}>
          <Bullet>9 holes, teams of 2.</Bullet>
          <Bullet>You each play your own ball — your points add up to one team score.</Bullet>
          <Bullet>Your score is your strokes against par — no handicap math. The clock is the equalizer.</Bullet>
        </View>

        {/* ── Hook stat divider ── */}
        <View style={s.statDivider}>
          <View style={s.statDividerLine} />
          <Text style={s.statDividerText}>The average round: about four hours.{'\n'}On the clock: nine holes, done.</Text>
          <View style={s.statDividerLine} />
        </View>

        {/* The Shot Clock */}
        <SectionHead icon="timer-outline" title="The Shot Clock" />
        <View style={s.card}>
          <Bullet>Every hole has a time par, set by its length and par.</Bullet>
          <Bullet>The clock counts down from there. Beat it.</Bullet>
          <Bullet>Run over and it costs your team points. No grace window, no excuses.</Bullet>
        </View>

        {/* ── Playable shot clock demo ── */}
        <ShotClockDemo />

        {/* Scoring */}
        <SectionHead icon="flash-outline" title="Scoring — Modified Stableford" />
        <View style={s.card}>
          <Text style={s.cardIntro}>Points per player, per hole:</Text>

          <View style={s.tableWrap}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>RESULT</Text>
              <Text style={[s.tableHeaderCell, { width: 56, textAlign: 'right' }]}>PTS</Text>
            </View>
            {SCORING_ROWS.map((row, i) => (
              <View key={i} style={[s.tableRow, i === SCORING_ROWS.length - 1 && s.tableRowLast]}>
                <Text style={[s.tableResult, { flex: 1 }]}>{row.result}</Text>
                <Text style={[s.tablePts, { color: row.color }]}>{row.pts}</Text>
              </View>
            ))}
            <View style={s.tableFootnote}>
              <Text style={s.footnoteText}>Double or worse = pick up. Don't grind out an 8.</Text>
            </View>
          </View>

          <View style={s.penaltyBlock}>
            <Text style={s.penaltyLine}>Team hole score = both players' points {'\u2212'} time penalty.</Text>
            <Text style={s.penaltyLine}>Time penalty: {'\u22120.5'} pts for every 30s over time par, up to {'\u22123'}.</Text>
            <Text style={s.penaltyEmphasis}>Scores can go negative. That's the point.</Text>
          </View>
        </View>

        {/* ── Worked example ── */}
        <WorkedExample />

        {/* Rules that keep it moving */}
        <SectionHead icon="flag-outline" title="Rules That Keep It Moving" />
        <View style={s.card}>
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>3-PUTT MAX</Text>
            <Text style={s.ruleBody}>After three putts it's holed. Pick up.</Text>
          </View>
          <View style={s.ruleDivider} />
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>TROUBLE IS SIMPLE</Text>
            <Text style={s.ruleBody}>Water, OB, lost, unplayable — all the same. One penalty stroke, drop within two club-lengths, play on. You never walk back to re-hit.</Text>
          </View>
          <View style={s.ruleDivider} />
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>IMPROVE YOUR LIE</Text>
            <Text style={s.ruleBody}>Move the ball one club-length. No relocating to a different spot.</Text>
          </View>
          <View style={s.ruleDivider} />
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>READY GOLF</Text>
            <Text style={s.ruleBody}>Whoever's ready, hits. Always.</Text>
          </View>
        </View>

        {/* ── 4. CTA ── */}
        <View style={s.ctaBlock}>
          <TouchableOpacity style={s.ctaBtn} onPress={playCTA} activeOpacity={0.85}>
            <Ionicons name="timer-outline" size={20} color={BG} />
            <Text style={s.ctaBtnTxt}>PLAY ON THE CLOCK</Text>
          </TouchableOpacity>
          <Text style={s.ctaSub}>Grab a partner. Start the clock.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Shot Clock Demo Styles ──────────────────────────────────────────────────
const d = StyleSheet.create({
  wrap:        { marginHorizontal: 16, marginBottom: 20, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: GOLD + '33', padding: 20, alignItems: 'center' },
  context:     { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2, marginBottom: 4 },
  timeParLabel:{ fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 2, marginBottom: 16 },
  clockFace:   { alignItems: 'center', marginBottom: 12 },
  digits:      { fontSize: 56, fontWeight: '200', fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 62 },
  overLabel:   { fontSize: 10, fontWeight: '700', color: RED, letterSpacing: 3, marginTop: 2 },
  penaltyBadge:{ backgroundColor: 'rgba(232,93,74,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(232,93,74,0.3)', marginBottom: 8 },
  penaltyText: { fontSize: 13, fontWeight: '700', color: RED, fontVariant: ['tabular-nums'] },
  controls:    { alignItems: 'center', marginTop: 4 },
  startBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  startBtnText:{ fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 2 },
  stopBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3A1A1A', borderWidth: 1.5, borderColor: RED, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  stopBtnText: { fontSize: 13, fontWeight: '700', color: CREAM, letterSpacing: 2 },
  resultBlock: { alignItems: 'center', gap: 6 },
  resultText:  { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  resultPenalty:{ fontSize: 12, color: DIM },
  resetBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingVertical: 6 },
  resetBtnText:{ fontSize: 11, color: DIM },
});

// ─── Worked Example Styles ───────────────────────────────────────────────────
const ex = StyleSheet.create({
  card:          { marginHorizontal: 16, marginBottom: 20, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: GOLD + '22', padding: 16 },
  title:         { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 3, marginBottom: 8 },
  divider:       { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  label:         { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  value:         { fontSize: 13, fontWeight: '500', color: CREAM },
  playersRow:    { flexDirection: 'row' },
  playerCol:     { flex: 1, alignItems: 'center', gap: 3 },
  playerDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 10 },
  playerLabel:   { fontSize: 8, fontWeight: '700', color: DIM, letterSpacing: 2 },
  playerScore:   { fontSize: 15, fontWeight: '600' },
  playerPts:     { fontSize: 10, color: MUTED },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-around' },
  totalItem:     { alignItems: 'center', gap: 3 },
  totalLabel:    { fontSize: 7, fontWeight: '700', color: DIM, letterSpacing: 1.5 },
  totalValue:    { fontSize: 17, fontWeight: '700', color: CREAM, fontVariant: ['tabular-nums'] },
});

// ─── Main Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  tabHeader:     { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  tabHeaderText: { fontSize: 13, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  content:   { paddingBottom: 40 },

  hookBlock:    { alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  hookHeadline: { fontSize: 28, fontWeight: '700', color: CREAM, textAlign: 'center', letterSpacing: -0.5, marginBottom: 12 },
  hookSub:      { fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 22 },

  whyBlock:     { paddingHorizontal: 24, paddingBottom: 28 },
  whyText:      { fontSize: 15, color: MUTED, lineHeight: 23, textAlign: 'center', fontStyle: 'italic' },

  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginTop: 8, marginBottom: 10 },
  sectionDot:   { width: 28, height: 28, borderRadius: 8, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: GOLD, letterSpacing: 2, textTransform: 'uppercase' },

  card:       { marginHorizontal: 16, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 16 },
  cardIntro:  { fontSize: 13, color: MUTED, marginBottom: 12 },

  bulletRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  bulletDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 14, color: CREAM, lineHeight: 20 },

  // Stat divider
  statDivider:     { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 32 },
  statDividerLine: { width: 40, height: 1, backgroundColor: GOLD + '44' },
  statDividerText: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 22, marginVertical: 10, fontStyle: 'italic' },

  // Scoring table
  tableWrap:      { backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '33', overflow: 'hidden', marginBottom: 14 },
  tableHeaderRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: GOLD + '22' },
  tableHeaderCell:{ fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  tableRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A0D' },
  tableRowLast:   { borderBottomWidth: 0 },
  tableResult:    { fontSize: 14, color: CREAM, fontWeight: '500' },
  tablePts:       { width: 56, fontSize: 16, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  tableFootnote:  { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#E85D4A0A', borderTopWidth: 1, borderTopColor: '#E85D4A22' },
  footnoteText:   { fontSize: 11, color: '#E85D4A', fontStyle: 'italic' },

  penaltyBlock:    { gap: 6 },
  penaltyLine:     { fontSize: 13, color: MUTED, lineHeight: 19 },
  penaltyEmphasis: { fontSize: 14, fontWeight: '700', color: CREAM, marginTop: 4 },

  ruleItem:    { paddingVertical: 4 },
  ruleLabel:   { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 2, marginBottom: 4 },
  ruleBody:    { fontSize: 13, color: CREAM, lineHeight: 19 },
  ruleDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },

  ctaBlock:   { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  ctaBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GOLD, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 36 },
  ctaBtnTxt:  { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 2 },
  ctaSub:     { fontSize: 12, color: DIM, marginTop: 10, fontStyle: 'italic' },
});
