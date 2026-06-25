import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal, StyleSheet,
  Alert, AppState, AccessibilityInfo, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  scoreHole, summarizeRound, computeTimePar,
  formatSeconds, formatSecondsLong, formatBadge, grossCapForHole,
  timePenalty,
  DEFAULT_SCORING_SCALE, DEFAULT_CLOCK_COEFFICIENTS, DEFAULT_PENALTY_PARAMS,
} from '../lib/clockedSport';
import { CLOCKED_ROUND_STATE_KEY } from '../lib/clockedRoundConstants';
import { sendPushToUser } from '../lib/notifications';

// ─── Colors ──────────────────────────────────────────────────────────────────
const BG       = '#090F0A';
const CARD     = '#0D1A0F';
const GOLD     = '#C9A84C';
const CREAM    = '#F5EDD8';
const MUTED    = '#B8A882';
const DIM      = '#7A6E58';
const GREEN    = '#7DC87A';
const RED_WARN = '#E85D4A';
const BORDER   = '#7DC87A22';

// ─── Clock color — uses remaining time (countdown perspective) ───────────────
function clockColor(remaining, timePar) {
  if (remaining > 30) return CREAM;
  if (remaining > 0) return GOLD;
  return RED_WARN;
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

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ClockedRoundScreen({ navigation, route }) {
  const { user } = useAuth();
  const params = route.params;

  const course       = params.course;
  const holeCount    = parseInt(params.holes, 10);
  const transport    = params.transport;
  const mode         = params.mode;
  const configSnap   = params.configSnapshot ?? {};
  const scoringScale = configSnap.scoringScale      ?? DEFAULT_SCORING_SCALE;
  const clockCoeffs  = configSnap.clockCoefficients  ?? DEFAULT_CLOCK_COEFFICIENTS;
  const penaltyParams = configSnap.penaltyParams     ?? DEFAULT_PENALTY_PARAMS;

  const playerDefs       = params.players;
  const playerCount      = playerDefs.length;
  const operatingCaddyId = params.operatingCaddyId ?? null;

  // Build initial per-hole data (par/yardage) — mutable for par edits
  const buildInitialHoleData = () => {
    const src = params.holeData;
    return Array.from({ length: holeCount }, (_, i) => ({
      par:     src?.[i]?.par     ?? 4,
      yardage: src?.[i]?.yardage ?? null,
    }));
  };

  const [holeDataState, setHoleDataState] = useState(buildInitialHoleData);

  // ── Core state ──
  const [currentHole, setCurrentHole]       = useState(1);
  const [holeResults, setHoleResults]       = useState([]);
  const [playerStrokes, setPlayerStrokes]   = useState(
    () => playerDefs.map(() => holeDataState[0]?.par ?? 4)
  );

  // Clock
  const [clockRunning, setClockRunning]     = useState(false);
  const [clockStartedAt, setClockStartedAt] = useState(null);
  const [displayElapsed, setDisplayElapsed] = useState(0);
  const [holeFrozenTime, setHoleFrozenTime] = useState(null);

  const [roundStartTs] = useState(() => Date.now());
  const [showScorecard, setShowScorecard]   = useState(false);

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

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reconcileClock(); });
    return () => sub.remove();
  }, [reconcileClock]);

  // ── Current hole data ──
  const holeIdx     = currentHole - 1;
  const curHoleData = holeDataState[holeIdx] ?? { par: 4, yardage: null, handicap: 18 };
  const curTimePar  = computeTimePar(curHoleData.yardage, curHoleData.par, playerCount, transport, clockCoeffs);

  // ── Persistence ──
  useEffect(() => {
    if (holeResults.length === 0 && !clockRunning) return;
    AsyncStorage.setItem(CLOCKED_ROUND_STATE_KEY, JSON.stringify({
      roundStartTs, course, holeCount, transport, mode,
      holeDataState, playerDefs, configSnap, currentHole, holeResults,
      playerStrokes, clockRunning, clockStartedAt, holeFrozenTime, savedAt: Date.now(),
    })).catch(() => {});
  }, [currentHole, holeResults, playerStrokes, clockRunning, holeFrozenTime, holeDataState]);

  // ── Clock controls ──
  const startClock = () => {
    setClockStartedAt(Date.now());
    setDisplayElapsed(0);
    setHoleFrozenTime(null);
    setClockRunning(true);
  };

  const stopClock = () => {
    const elapsed = clockStartedAt ? Math.floor((Date.now() - clockStartedAt) / 1000) : 0;
    setDisplayElapsed(elapsed);
    setHoleFrozenTime(elapsed);
    setClockRunning(false);
  };

  // ── Change par for current hole ──
  const setCurrentPar = (newPar) => {
    setHoleDataState(prev => {
      const updated = [...prev];
      updated[holeIdx] = { ...updated[holeIdx], par: newPar };
      return updated;
    });
    // Reset strokes to new par
    setPlayerStrokes(playerDefs.map(() => newPar));
  };

  // ── Score this hole ──
  const completeHole = () => {
    const elapsed = holeFrozenTime ?? displayElapsed;
    const playersForScoring = playerDefs.map((p, i) => ({
      name: p.name,
      grossStrokes: playerStrokes[i],
    }));
    const config = { scoringScale, clockCoefficients: clockCoeffs, penaltyParams, transport, playerCount };
    const result = scoreHole(playersForScoring, elapsed, curHoleData, config);
    const newResults = [...holeResults, result];
    setHoleResults(newResults);

    if (currentHole >= holeCount) {
      finishRound(newResults);
    } else {
      const nextPar = holeDataState[currentHole]?.par ?? 4;
      setCurrentHole(currentHole + 1);
      setPlayerStrokes(playerDefs.map(() => nextPar));
      setClockRunning(false);
      setClockStartedAt(null);
      setDisplayElapsed(0);
      setHoleFrozenTime(null);
    }
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
    const config = { scoringScale, clockCoefficients: clockCoeffs, penaltyParams, transport, playerCount };
    const result = scoreHole(playersForScoring, newElapsed, updatedHoleData[idx], config);

    const newResults = [...holeResults];
    newResults[idx] = result;
    setHoleResults(newResults);
  };

  // ── Finish round ──
  const finishRound = async (results) => {
    const summary = summarizeRound(results);
    const holeScoresJson = results.map((r, i) => ({
      hole: i + 1, par: r.par, yardage: r.yardage, yardsUsed: r.yardsUsed,
      yardageSource: r.yardageSource, elapsed: r.elapsed, timePar: r.timePar,
      penalty: r.penalty, holeScore: r.holeScore,
      players: r.playerResults.map(pr => ({
        name: pr.name, grossStrokes: pr.grossStrokes,
        points: pr.points, label: pr.label,
      })),
    }));
    const activeGameJson = {
      format: 'clocked', mode: mode === 1 ? 'solo' : String(mode), transport,
      tee: params.selectedTee ? { tee_name: params.selectedTee.tee_name, total_yards: params.selectedTee.total_yards } : null,
      nine: params.selectedNine, coefficientsSnapshot: configSnap,
      summary: { totalScore: summary.totalScore, totalTimePar: summary.totalTimePar,
        totalElapsed: summary.totalElapsed, totalPenalty: summary.totalPenalty, playerTotals: summary.playerTotals },
    };
    const durationMinutes = Math.round((Date.now() - roundStartTs) / 60000);
    try {
      let row = {
        user_id: user?.id, course_name: course.name, holes: String(holeCount), transport,
        players: String(playerCount), tee_time: new Date(roundStartTs).toISOString(),
        finish_time: new Date().toISOString(), duration_minutes: durationMinutes,
        round_format: 'clocked', hole_scores: holeScoresJson, active_game: activeGameJson,
        flagged: false, verification_level: operatingCaddyId ? 'caddy_operated' : 'self_reported',
        ...(operatingCaddyId ? { caddy_id: operatingCaddyId, caddy_logged: true } : {}),
      };
      let savedRoundId = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await supabase.from('rounds').insert([row]).select('id');
        if (!result.error) {
          savedRoundId = result.data?.[0]?.id ?? null;
          break;
        }
        const match = result.error.message?.match(/Could not find the (\w+) column/);
        if (!match) break;
        const { [match[1]]: _dropped, ...rest } = row;
        row = rest;
      }

      // Create round_participants for linked players
      if (savedRoundId) {
        const participantRows = playerDefs
          .map((p, i) => {
            if (!p.userId) return null; // guest — no account
            return {
              round_id:   savedRoundId,
              user_id:    p.userId,
              player_key: p.name,
              status:     p.userId === user?.id ? 'confirmed' : 'pending',
              confirmed_at: p.userId === user?.id ? new Date().toISOString() : null,
            };
          })
          .filter(Boolean);

        if (participantRows.length > 0) {
          await supabase.from('round_participants').insert(participantRows).catch(() => {});
        }

        // Notify pending participants
        const pending = participantRows.filter(r => r.status === 'pending');
        const loggerName = playerDefs.find(p => p.userId === user?.id)?.name ?? 'Your partner';
        for (const p of pending) {
          sendPushToUser(
            p.user_id,
            'Confirm your round',
            `${loggerName} logged an on-the-clock round at ${course.name} \u2014 confirm your scores.`,
            'round_confirm',
          ).catch(() => {});
          supabase.from('notifications').insert({
            user_id: p.user_id,
            type: 'round_confirm',
            title: 'Confirm your round',
            body: `${loggerName} logged an on-the-clock round at ${course.name}.`,
            meta: { round_id: savedRoundId, player_key: p.player_key },
          }).catch(() => {});
        }
      }

      AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY).catch(() => {});
      const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      navigation.navigate('Share', {
        roundFormat: 'clocked', courseName: course.name, date: dateStr,
        holes: String(holeCount), transport, durationMinutes,
        teamScore: summary.totalScore, totalTimePar: summary.totalTimePar,
        totalElapsed: summary.totalElapsed, totalPenalty: summary.totalPenalty,
        playerTotals: summary.playerTotals, formatBadge: formatBadge(playerCount),
      });
    } catch { Alert.alert('Error', 'Could not save your round. Please try again.'); }
  };

  const handleAbandon = () => {
    Alert.alert('Abandon Round?', 'Your progress will be lost.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => {
        AsyncStorage.removeItem(CLOCKED_ROUND_STATE_KEY).catch(() => {});
        navigation.goBack();
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

  // ── Derived ──
  const runningSummary = summarizeRound(holeResults);
  const elapsed       = clockRunning ? displayElapsed : (holeFrozenTime ?? 0);
  const remaining     = curTimePar - elapsed;
  const clkColor      = clockColor(remaining, curTimePar);
  const holeStopped   = holeFrozenTime != null;

  // ── Countdown display ──
  let clockDisplay, clockSuffix;
  if (remaining >= 0) {
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
        <TouchableOpacity onPress={handleAbandon} style={st.headerBtn} accessibilityLabel="Abandon round">
          <Ionicons name="close" size={20} color={GOLD} />
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Text style={st.headerTitle}>HOLE {currentHole}</Text>
          <Text style={st.headerSub}>
            Par {curHoleData.par}{curHoleData.yardage ? `  ·  ${curHoleData.yardage} yds` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowScorecard(!showScorecard)} style={st.headerBtn} accessibilityLabel="Toggle scorecard">
          <Ionicons name={showScorecard ? 'timer-outline' : 'list-outline'} size={20} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* ── Scorecard overlay ── */}
      {showScorecard ? (
        <ScrollView style={st.scorecardWrap} contentContainerStyle={st.scorecardContent}>
          <Text style={st.scTitle}>SCORECARD</Text>
          <Text style={st.scHint}>Tap a hole to edit</Text>
          <View style={st.scHeaderRow}>
            <Text style={[st.scCell, st.scCellHole]}>HOLE</Text>
            <Text style={[st.scCell, st.scCellPar]}>PAR</Text>
            {playerDefs.map((p, i) => (
              <Text key={i} style={[st.scCell, st.scCellPlayer]} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
            ))}
            <Text style={[st.scCell, st.scCellTime]}>TIME</Text>
            <Text style={[st.scCell, st.scCellPen]}>PEN</Text>
            <Text style={[st.scCell, st.scCellScore]}>SCORE</Text>
          </View>
          {holeResults.map((r, i) => (
            <TouchableOpacity key={i} style={st.scRow} onPress={() => setEditHoleIdx(i)} activeOpacity={0.7}>
              <Text style={[st.scCell, st.scCellHole, st.scValText]}>{i + 1}</Text>
              <Text style={[st.scCell, st.scCellPar, st.scValText]}>{r.par}</Text>
              {r.playerResults.map((pr, j) => (
                <Text key={j} style={[st.scCell, st.scCellPlayer, { color: pointsColor(pr.points) }]}>
                  {pr.points > 0 ? `+${pr.points}` : pr.points}
                </Text>
              ))}
              <Text style={[st.scCell, st.scCellTime, st.scValText]}>{formatSeconds(r.elapsed)}</Text>
              <Text style={[st.scCell, st.scCellPen, { color: r.penalty < 0 ? RED_WARN : DIM }]}>
                {r.penalty < 0 ? r.penalty : '\u2014'}
              </Text>
              <Text style={[st.scCell, st.scCellScore, { color: r.holeScore >= 0 ? GREEN : RED_WARN, fontWeight: '700' }]}>
                {r.holeScore > 0 ? `+${r.holeScore}` : r.holeScore}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={[st.scRow, st.scTotalRow]}>
            <Text style={[st.scCell, st.scCellHole, st.scTotalText]}>TOT</Text>
            <Text style={[st.scCell, st.scCellPar, st.scTotalText]}></Text>
            {runningSummary.playerTotals.map((pt, i) => (
              <Text key={i} style={[st.scCell, st.scCellPlayer, st.scTotalText, { color: pointsColor(pt.totalPoints) }]}>
                {pt.totalPoints > 0 ? `+${pt.totalPoints}` : pt.totalPoints}
              </Text>
            ))}
            <Text style={[st.scCell, st.scCellTime, st.scTotalText]}>{formatSecondsLong(runningSummary.totalElapsed)}</Text>
            <Text style={[st.scCell, st.scCellPen, st.scTotalText, { color: runningSummary.totalPenalty < 0 ? RED_WARN : DIM }]}>
              {runningSummary.totalPenalty < 0 ? runningSummary.totalPenalty : '\u2014'}
            </Text>
            <Text style={[st.scCell, st.scCellScore, st.scTotalText, { color: runningSummary.totalScore >= 0 ? GREEN : RED_WARN, fontWeight: '700' }]}>
              {runningSummary.totalScore > 0 ? `+${runningSummary.totalScore}` : runningSummary.totalScore}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={st.mainContent} showsVerticalScrollIndicator={false}>

          {/* ── Running total strip ── */}
          <View style={st.totalStrip}>
            <Text style={st.totalLabel}>TEAM TOTAL</Text>
            <Text style={[st.totalValue, { color: runningSummary.totalScore >= 0 ? GREEN : RED_WARN }]}>
              {runningSummary.totalScore > 0 ? `+${runningSummary.totalScore}` : runningSummary.totalScore}
            </Text>
            <Text style={st.totalHoles}>{holeResults.length}/{holeCount} holes</Text>
          </View>

          {/* ── Shot Clock (COUNTDOWN) ── */}
          <View style={st.clockWrap}>
            <Text style={[st.clockDigits, { color: clkColor }]}>
              {clockDisplay}
            </Text>
            {clockSuffix && <Text style={st.overLabel}>{clockSuffix}</Text>}
            <Text style={st.clockTimePar}>TIME PAR  {formatSeconds(curTimePar)}</Text>
            {livePenalty < 0 && (
              <View style={st.penaltyBadge}>
                <Text style={st.penaltyText}>{livePenalty}</Text>
              </View>
            )}
          </View>

          {/* ── Clock controls ── */}
          <View style={st.clockControls}>
            {!clockRunning && !holeStopped && (
              <TouchableOpacity style={st.startClockBtn} onPress={startClock} activeOpacity={0.85}>
                <Ionicons name="play" size={24} color={BG} />
                <Text style={st.startClockText}>START</Text>
              </TouchableOpacity>
            )}
            {clockRunning && (
              <TouchableOpacity style={st.stopClockBtn} onPress={stopClock} activeOpacity={0.85}>
                <Ionicons name="stop" size={22} color={CREAM} />
                <Text style={st.stopClockText}>STOP</Text>
              </TouchableOpacity>
            )}
          </View>

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
                    <Text style={st.playerName} numberOfLines={1}>{p.name}</Text>
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

          {/* ── Frozen time display + edit (cross-platform) ── */}
          {holeStopped && (editingTime ? (
            <View style={st.frozenTimeRow}>
              <Text style={st.frozenTimeLabel}>HOLE TIME</Text>
              <TextInput
                style={st.frozenTimeInput}
                value={editTimeStr}
                onChangeText={setEditTimeStr}
                placeholder="m:ss"
                placeholderTextColor="#7A6E58"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                autoFocus
              />
              <TouchableOpacity onPress={() => {
                const secs = parseTimeInput(editTimeStr);
                if (secs != null && secs > 0) { setHoleFrozenTime(secs); setDisplayElapsed(secs); }
                setEditingTime(false);
              }} activeOpacity={0.7}>
                <Ionicons name="checkmark" size={18} color="#7DC87A" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingTime(false)} activeOpacity={0.7}>
                <Ionicons name="close" size={18} color="#7A6E58" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.frozenTimeRow} onPress={() => {
              setEditTimeStr(formatSeconds(holeFrozenTime));
              setEditingTime(true);
            }} activeOpacity={0.7}>
              <Text style={st.frozenTimeLabel}>HOLE TIME</Text>
              <Text style={st.frozenTimeValue}>{formatSeconds(holeFrozenTime)}</Text>
              <Ionicons name="pencil-outline" size={12} color={DIM} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ))}

          {/* ── Next Hole / Finish ── */}
          {holeStopped && (
            <TouchableOpacity style={st.nextHoleBtn} onPress={completeHole} activeOpacity={0.85}>
              <Text style={st.nextHoleText}>
                {currentHole >= holeCount ? 'FINISH ROUND' : 'NEXT HOLE \u2192'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ── Bottom info bar ── */}
      <View style={st.bottomBar}>
        <Text style={st.bottomText}>{course?.name ?? ''}</Text>
        <Text style={st.bottomText}>{formatBadge(playerCount)}</Text>
      </View>

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
    </SafeAreaView>
  );
}

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
  card:      { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: GOLD + '33', padding: 20, width: 320 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:     { fontSize: 12, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  closeBtn:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  label:     { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2, marginBottom: 6, marginTop: 12 },
  pillRow:   { flexDirection: 'row', gap: 8 },
  pill:      { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, alignItems: 'center' },
  pillOn:    { backgroundColor: '#1E4825', borderColor: GOLD },
  pillTxt:   { fontSize: 15, fontWeight: '600', color: DIM },
  pillTxtOn: { color: GOLD },
  strokeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  strokeName:{ fontSize: 13, color: CREAM, flex: 1 },
  strokeAdj: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1A2E1C', borderWidth: 1, borderColor: GOLD + '44', alignItems: 'center', justifyContent: 'center' },
  strokeAdjTxt: { fontSize: 18, color: GOLD, fontWeight: '300' },
  strokeVal: { fontSize: 20, fontWeight: '300', color: CREAM, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  timeInput: { backgroundColor: BG, borderWidth: 1, borderColor: GOLD + '33', borderRadius: 10, padding: 10, color: CREAM, fontSize: 16, textAlign: 'center', fontVariant: ['tabular-nums'] },
  saveBtn:   { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  saveBtnTxt:{ fontSize: 12, fontWeight: '700', color: BG, letterSpacing: 2 },
});

// ─── Main Styles ─────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container:     { flex: 1, backgroundColor: BG },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  headerBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCenter:  { alignItems: 'center', flex: 1 },
  headerTitle:   { fontSize: 13, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  headerSub:     { fontSize: 11, color: DIM, marginTop: 2 },
  mainContent:   { paddingHorizontal: 16, paddingBottom: 20 },

  totalStrip:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 8 },
  totalLabel:    { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  totalValue:    { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalHoles:    { fontSize: 10, color: DIM },

  // Countdown clock
  clockWrap:     { alignItems: 'center', paddingVertical: 20 },
  clockDigits:   { fontSize: 64, fontWeight: '200', fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 70 },
  overLabel:     { fontSize: 11, fontWeight: '700', color: RED_WARN, letterSpacing: 3, marginTop: 2 },
  clockTimePar:  { fontSize: 11, fontWeight: '700', color: DIM, letterSpacing: 2.5, marginTop: 6 },
  penaltyBadge:  { marginTop: 8, backgroundColor: 'rgba(232,93,74,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(232,93,74,0.3)' },
  penaltyText:   { fontSize: 14, fontWeight: '700', color: RED_WARN, fontVariant: ['tabular-nums'] },

  clockControls: { alignItems: 'center', marginBottom: 16 },
  startClockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40 },
  startClockText:{ fontSize: 14, fontWeight: '700', color: BG, letterSpacing: 3 },
  stopClockBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#3A1A1A', borderWidth: 2, borderColor: RED_WARN, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 36 },
  stopClockText: { fontSize: 14, fontWeight: '700', color: CREAM, letterSpacing: 3 },

  // Par selector
  parSelectorWrap:  { paddingBottom: 12 },
  parSelectorLabel: { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2, marginBottom: 8 },
  parSelectorRow:   { flexDirection: 'row', gap: 8 },
  parPill:          { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: 'center' },
  parPillOn:        { backgroundColor: '#1E4825', borderColor: GOLD, borderWidth: 2 },
  parPillTxt:       { fontSize: 15, fontWeight: '600', color: DIM },
  parPillTxtOn:     { color: GOLD },

  // Stroke entry
  strokeSection:    { gap: 10, marginBottom: 12 },
  playerStrokeRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  playerInfo:       { width: 72 },
  playerName:       { fontSize: 13, fontWeight: '600', color: CREAM },
  strokeControls:   { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center', gap: 12 },
  adjBtn:           { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A2E1C', borderWidth: 1, borderColor: GOLD + '44', alignItems: 'center', justifyContent: 'center' },
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
  frozenTimeLabel:  { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  frozenTimeValue:  { fontSize: 14, fontWeight: '600', color: CREAM, fontVariant: ['tabular-nums'] },
  frozenTimeInput:  { fontSize: 14, fontWeight: '600', color: CREAM, fontVariant: ['tabular-nums'], backgroundColor: BG, borderWidth: 1, borderColor: GOLD + '44', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, minWidth: 50, textAlign: 'center' },

  // Next hole
  nextHoleBtn:   { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  nextHoleText:  { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 2 },

  bottomBar:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: BORDER },
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
  scCellHole:       { width: 32, fontWeight: '700', letterSpacing: 1 },
  scCellPar:        { width: 28 },
  scCellPlayer:     { flex: 1, fontWeight: '600', fontVariant: ['tabular-nums'] },
  scCellTime:       { width: 44, fontSize: 10 },
  scCellPen:        { width: 32, fontSize: 10, fontVariant: ['tabular-nums'] },
  scCellScore:      { width: 40, fontVariant: ['tabular-nums'] },
  scValText:        { color: CREAM },
  scTotalText:      { fontSize: 12, fontWeight: '700' },
});
