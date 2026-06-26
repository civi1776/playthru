/*
 * SQL — add hole_scores column to rounds table (run in Supabase):
 *
 * alter table rounds add column if not exists hole_scores jsonb;
 */

/*
 * SQL — add game support (run in Supabase):
 *
 * alter table rounds add column if not exists active_game jsonb;
 */

import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Platform, KeyboardAvoidingView, AppState,
  StyleSheet, Alert, ActivityIndicator, Modal, AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { searchCourses } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification, sendPushToUser, sendRankMoveNotification, checkAndSendMilestone, scheduleInactivityReminder, scheduleInteractionLadder, cancelInteractionLadder } from '../lib/notifications';
import * as Notifications from 'expo-notifications';
import CourseAvatar from '../components/CourseAvatar';
import { updateHandicapAfterRound } from '../lib/handicap';
import { GAME_TYPES, calcGame, gameResultToUnitScores, calcSettlement, calcPressStatus } from '../lib/gameEngines';
import { isFraudulent, calcPOPScoreCore, recalculateProfilePopScore, isPar3Course, getCoursePar } from '../lib/popScore';
import RangefinderCard from '../components/RangefinderCard';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useProAccess } from '../hooks/useProAccess';
import { getMockGreensForCourse } from '../lib/mockGreens';
import { ROUND_STATE_KEY, ROUND_STALENESS_MS } from '../lib/roundConstants';
import { PRO_ENABLED } from '../lib/featureFlags';

const ASYNC_KEY = 'live_round_start_ts';

// Retries a rounds insert, stripping any column that PostgREST's schema cache
// doesn't recognise yet (e.g. active_game, flagged_count after a migration).
async function roundsInsert(payload, selectCols) {
  let row = Array.isArray(payload) ? { ...payload[0] } : { ...payload };
  for (let attempt = 0; attempt < 5; attempt++) {
    const q = selectCols
      ? supabase.from('rounds').insert([row]).select(selectCols)
      : supabase.from('rounds').insert([row]);
    const result = await q;
    if (!result.error) return result;
    const match = result.error.message?.match(/Could not find the (\w+) column/);
    if (!match) return result;                      // different error — surface it
    const { [match[1]]: _dropped, ...rest } = row;
    row = rest;
  }
  return { data: null, error: new Error('Schema cache: too many stale columns') };
}

const PACE_DELAY_OPTIONS = [
  { label: 'Never',                          value: 'none',     color: '#7DC87A', bgTint: 'rgba(125,200,122,0.08)'  },
  { label: 'A few holes',                    value: 'few',      color: '#C9A84C', bgTint: 'rgba(201,168,76,0.08)'   },
  { label: 'On a lot of holes',              value: 'many',     color: '#D4844A', bgTint: 'rgba(212,132,74,0.08)'   },
  { label: 'Constantly / nearly every hole', value: 'constant', color: '#C07A6A', bgTint: 'rgba(192,122,106,0.08)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function minutesToTimeStr(totalMinutes) {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const h24     = Math.floor(clamped / 60);
  const m       = clamped % 60;
  const period  = h24 >= 12 ? 'PM' : 'AM';
  let h         = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hm, period] = timeStr.split(' ');
  const [h, m] = hm.split(':').map(Number);
  let total = (h % 12) * 60 + m;
  if (period === 'PM') total += 12 * 60;
  return total;
}

function nowTimeStr() {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function elapsedStr(startTs, endTs = null) {
  const diff = Math.max(0, (endTs ?? Date.now()) - startTs);
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function scoreVsParLabel(diff) {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function scoreColor(score, par) {
  const diff = score - par;
  if (diff <= -2) return '#C9A84C'; // eagle or better — gold
  if (diff === -1) return '#7DC87A'; // birdie — green
  if (diff === 0)  return '#F5EDD8'; // par — cream
  if (diff === 1)  return '#D4B86A'; // bogey — yellow
  return '#C07A6A';                  // double bogey+ — red
}

function scoreVsParColor(diff) {
  if (diff < 0)  return '#7DC87A';
  if (diff === 0) return '#F5EDD8';
  if (diff <= 2) return '#D4B86A';
  return '#C07A6A';
}

function deriveScoreVsHandicap(totalScoreVsPar, holes, handicap, isPar3 = false) {
  const hcp = handicap ?? 0;
  // Par 3 courses are shorter — halve the expected handicap strokes
  const hcpAdj = isPar3 ? Math.round(hcp / (holes === '9' ? 4 : 2)) : (holes === '9' ? Math.round(hcp / 2) : hcp);
  const diff = totalScoreVsPar - hcpAdj;
  if (diff > 5)  return 'over_5';
  if (diff > 0)  return 'within_5';
  if (diff === 0) return 'to_handicap';
  return 'beat';
}

// ─── Tee time picker (simple +/- buttons for live round) ─────────────────────
function TeeTimePicker({ value, onChange }) {
  const adjust = (deltaMin) => {
    const current = parseTimeToMinutes(value);
    onChange(minutesToTimeStr(current + deltaMin));
  };
  return (
    <View style={s.teePickerRow}>
      <TouchableOpacity style={s.teeAdj} onPress={() => adjust(-15)} activeOpacity={0.7}>
        <Text style={s.teeAdjText}>−</Text>
      </TouchableOpacity>
      <Text style={s.teeValue}>{value}</Text>
      <TouchableOpacity style={s.teeAdj} onPress={() => adjust(15)} activeOpacity={0.7}>
        <Text style={s.teeAdjText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 1: Course Search ────────────────────────────────────────────────────
function StepCourse({ onNext }) {
  const [query, setQuery]               = useState('');
  const [results, setResults]           = useState([]);
  const [selectedCourse, setSelected]   = useState(null);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const results = await searchCourses(query);
      setResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={s.stepTitle}>Which course?</Text>
      <TextInput
        style={s.searchInput}
        placeholder="Search courses..."
        placeholderTextColor="#B8A88266"
        value={query}
        onChangeText={t => { setQuery(t); setSelected(null); }}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {results.map(c => (
          <TouchableOpacity
            key={c.name}
            style={[s.courseRow, selectedCourse?.name === c.name && s.courseRowSelected]}
            onPress={() => { setSelected(c); onNext(c); }}
            activeOpacity={0.8}
          >
            <CourseAvatar courseName={c.name} city={c.city} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[s.courseName, selectedCourse?.name === c.name && s.courseNameSelected]}>{c.name}</Text>
              {(c.city || c.state) && (
                <Text style={s.courseSub}>{[c.city, c.state].filter(Boolean).join(', ')}</Text>
              )}
            </View>
            {selectedCourse?.name === c.name && <Ionicons name="checkmark" size={14} color="#C9A84C" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Step 2: Tee Time ─────────────────────────────────────────────────────────
function StepTeeTime({ teeTime, setTeeTime, onNext, onBack }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.stepTitle}>Tee time</Text>
      <Text style={s.stepSub}>Auto-filled with current time. Adjust if needed.</Text>
      <TeeTimePicker value={teeTime} onChange={setTeeTime} />
      <TouchableOpacity style={s.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={s.primaryBtnText}>CONTINUE</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={{ marginTop: 16 }}>
        <Text style={s.backLink}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 3: Round Details ────────────────────────────────────────────────────
function StepDetails({ holes, setHoles, transport, setTransport, players, setPlayers, onNext, onBack }) {
  const ready = holes && transport && players;
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.stepTitle}>About your round</Text>

      <Text style={s.sectionQ}>How many holes?</Text>
      <View style={s.btnGroup}>
        {[{ label: '9 Holes', v: '9' }, { label: '18 Holes', v: '18' }].map(({ label, v }) => (
          <TouchableOpacity key={v} style={[s.groupBtn, holes === v && s.groupBtnOn]} onPress={() => setHoles(v)} activeOpacity={0.8}>
            <Text style={[s.groupBtnTxt, holes === v && s.groupBtnTxtOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionQ}>How did you get around?</Text>
      <View style={s.btnGroup}>
        {['Walking', 'Cart'].map(t => (
          <TouchableOpacity key={t} style={[s.groupBtn, transport === t && s.groupBtnOn]} onPress={() => setTransport(t)} activeOpacity={0.8}>
            <Text style={[s.groupBtnTxt, transport === t && s.groupBtnTxtOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionQ}>How many players?</Text>
      <View style={s.btnGroup}>
        {['1', '2', '3', '4', '5'].map(p => (
          <TouchableOpacity key={p} style={[s.groupBtn, players === p && s.groupBtnOn]} onPress={() => setPlayers(p)} activeOpacity={0.8}>
            <Text style={[s.groupBtnTxt, players === p && s.groupBtnTxtOn]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[s.primaryBtn, !ready && s.primaryBtnDisabled, { marginTop: 24 }]} onPress={onNext} disabled={!ready} activeOpacity={0.8}>
        <Text style={s.primaryBtnText}>START ROUND ▶</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={{ marginTop: 16, alignSelf: 'center' }}>
        <Text style={s.backLink}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 3b: Tee Selector ────────────────────────────────────────────────────
const TEE_COLORS = {
  black: '#2A2A2A', blue: '#3B6FB6', white: '#E8E8E8', gold: '#C9A84C',
  red: '#C07A6A', green: '#4A7A50', yellow: '#D4B86A', silver: '#A8A8A8',
  bronze: '#B87333', orange: '#D4844A',
};

function StepTeePicker({ courseTees, holes, selectedTeeIdx, onSelectTee, selectedNine, onSelectNine, onNext, onBack }) {
  const maleTees = courseTees ?? [];
  const nineHoleTees = maleTees.filter(t => t.number_of_holes === 9);
  // For 9-hole rounds prefer tees explicitly marked 9 holes; fall back to all tees
  const teesToShow = holes === '9' && nineHoleTees.length > 0 ? nineHoleTees : maleTees;
  // Show front/back picker only when playing 9 holes but no dedicated 9-hole tees exist
  const showNinePicker = holes === '9' && nineHoleTees.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <Text style={s.stepTitle}>Select Tee</Text>
      {showNinePicker && (
        <>
          <Text style={s.sectionQ}>WHICH 9 HOLES?</Text>
          <View style={[s.btnGroup, { marginBottom: 20 }]}>
            {[{ label: 'Front 9', v: 'front' }, { label: 'Back 9', v: 'back' }].map(({ label, v }) => (
              <TouchableOpacity
                key={v}
                style={[s.groupBtn, selectedNine === v && s.groupBtnOn]}
                onPress={() => onSelectNine(v)}
                activeOpacity={0.7}
              >
                <Text style={[s.groupBtnTxt, selectedNine === v && s.groupBtnTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.sectionQ}>TEE BOX</Text>
        </>
      )}
      <ScrollView keyboardShouldPersistTaps="handled">
        {teesToShow.map((tee, i) => {
          const sel = selectedTeeIdx === i;
          const colorKey = tee.tee_name?.toLowerCase().split(' ')[0];
          const dotColor = TEE_COLORS[colorKey] ?? '#B8A882';
          return (
            <TouchableOpacity
              key={i}
              style={[tp.teeRow, sel && tp.teeRowOn]}
              onPress={() => onSelectTee(i)}
              activeOpacity={0.8}
            >
              <View style={[tp.teeColorDot, { backgroundColor: dotColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={[tp.teeName, sel && tp.teeNameOn]}>{tee.tee_name ?? `Tee ${i + 1}`}</Text>
                <Text style={tp.teeMeta}>
                  {[
                    tee.total_yards  ? `${tee.total_yards} yds` : null,
                    tee.par_total    ? `Par ${tee.par_total}`   : null,
                    tee.course_rating ? `${tee.course_rating} / ${tee.slope_rating}` : null,
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
              {sel && <Ionicons name="checkmark" size={14} color="#C9A84C" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={[s.primaryBtn, { marginTop: 16 }]} onPress={onNext} activeOpacity={0.8}>
        <Text style={s.primaryBtnText}>CONTINUE</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={{ marginTop: 16, alignSelf: 'center' }}>
        <Text style={s.backLink}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Shot name from score vs par ─────────────────────────────────────────────
function shotName(diff) {
  if (diff <= -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0)  return 'Par';
  if (diff === 1)  return 'Bogey';
  if (diff === 2)  return 'Double Bogey';
  return 'Triple+';
}

// ─── Game Setup Modal ─────────────────────────────────────────────────────────
const DOLLAR_OPTIONS = ['$0', '$1', '$2', '$5', '$10', '$20', '$50'];

function GameSetupModal({ visible, onClose, onConfirm, defaultPlayerName, holes }) {
  const [step, setStep]             = useState(0); // 0=type, 1=players, 2=settings
  const [selectedType, setType]     = useState(null);
  const [players, setPlayers]       = useState([]);
  const [dollarIdx, setDollarIdx]   = useState(1); // $1 default

  const gameInfo = GAME_TYPES.find(g => g.id === selectedType);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setStep(0); setType(null); setDollarIdx(1);
      setPlayers([
        { name: defaultPlayerName || 'You' },
        { name: '' },
      ]);
    }
  }, [visible]);

  const addPlayer = () => {
    if (players.length < (gameInfo?.maxPlayers ?? 8)) {
      setPlayers(p => [...p, { name: '' }]);
    }
  };

  const removePlayer = (idx) => {
    setPlayers(p => p.filter((_, i) => i !== idx));
  };

  const updatePlayer = (idx, field, val) => {
    setPlayers(p => p.map((pl, i) => i === idx ? { ...pl, [field]: val } : pl));
  };

  const canProceedType    = !!selectedType;
  const canProceedPlayers = players.length >= (gameInfo?.minPlayers ?? 2)
    && players.every(p => p.name.trim().length > 0);

  const handleConfirm = () => {
    const finalPlayers = players.map(p => ({ name: p.name.trim() }));
    onConfirm({
      type:         selectedType,
      players:      finalPlayers,
      dollarPerUnit: parseInt(DOLLAR_OPTIONS[dollarIdx].replace('$', ''), 10),
    });
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={gm.overlay}>
        <View style={gm.sheet}>
          {/* Sheet header */}
          <View style={gm.sheetHeader}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={gm.closeBtn}>
              <Ionicons name="close" size={20} color="#B8A882" />
            </TouchableOpacity>
            <Text style={gm.sheetTitle}>
              {step === 0 ? 'CHOOSE GAME' : step === 1 ? 'PLAYERS' : 'SETTINGS'}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Step dots */}
          <View style={gm.dots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[gm.dot, i === step && gm.dotActive, i < step && gm.dotDone]} />
            ))}
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={gm.stepContent} keyboardShouldPersistTaps="handled">

            {/* Step 0: Game type */}
            {step === 0 && GAME_TYPES.map(game => {
              // Disable if holes=9 and game needs 18 holes specifically (Nassau back 9 still works partially)
              const sel = selectedType === game.id;
              return (
                <TouchableOpacity
                  key={game.id}
                  style={[gm.typeCard, sel && gm.typeCardOn]}
                  onPress={() => setType(game.id)}
                  activeOpacity={0.8}
                >
                  <View style={[gm.typeIcon, sel && gm.typeIconOn]}>
                    <Ionicons name={game.icon} size={20} color={sel ? '#090F0A' : '#C9A84C'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[gm.typeName, sel && gm.typeNameOn]}>{game.id}</Text>
                    <Text style={gm.typeDesc} numberOfLines={2}>{game.desc}</Text>
                  </View>
                  <Text style={gm.typePlayers}>
                    {game.minPlayers === game.maxPlayers ? `${game.minPlayers}P` : `${game.minPlayers}–${game.maxPlayers}P`}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Step 1: Players */}
            {step === 1 && (
              <View>
                <Text style={gm.stepNote}>
                  {gameInfo?.minPlayers}–{gameInfo?.maxPlayers} players required for {selectedType}.
                </Text>
                {players.map((pl, i) => (
                  <View key={i} style={gm.playerRow}>
                    <View style={gm.playerNum}>
                      <Text style={gm.playerNumTxt}>{i + 1}</Text>
                    </View>
                    <TextInput
                      style={[gm.playerInput, { flex: 1 }]}
                      placeholder={i === 0 ? 'Your name' : `Player ${i + 1}`}
                      placeholderTextColor="#B8A88266"
                      value={pl.name}
                      onChangeText={v => updatePlayer(i, 'name', v)}
                      editable={i !== 0}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                    {i > 1 && (
                      <TouchableOpacity onPress={() => removePlayer(i)} style={gm.removeBtn} activeOpacity={0.7}>
                        <Ionicons name="close-circle" size={20} color="#C07A6A" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {players.length < (gameInfo?.maxPlayers ?? 8) && (
                  <TouchableOpacity style={gm.addPlayerBtn} onPress={addPlayer} activeOpacity={0.7}>
                    <Ionicons name="add-circle-outline" size={18} color="#C9A84C" />
                    <Text style={gm.addPlayerTxt}>Add Player</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Step 2: Settings */}
            {step === 2 && (
              <View>
                <Text style={gm.settingLabel}>DOLLAR AMOUNT PER UNIT</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
                >
                  {DOLLAR_OPTIONS.map((opt, i) => (
                    <TouchableOpacity
                      key={opt}
                      style={[gm.dollarPill, i === dollarIdx && gm.dollarPillOn]}
                      onPress={() => setDollarIdx(i)}
                      activeOpacity={0.7}
                    >
                      <Text style={[gm.dollarTxt, i === dollarIdx && gm.dollarTxtOn]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={gm.summaryCard}>
                  <Text style={gm.summaryLabel}>GAME SUMMARY</Text>
                  <Text style={gm.summaryRow}>
                    <Text style={gm.summaryKey}>Game: </Text>
                    <Text style={gm.summaryVal}>{selectedType}</Text>
                  </Text>
                  <Text style={gm.summaryRow}>
                    <Text style={gm.summaryKey}>Players: </Text>
                    <Text style={gm.summaryVal}>{players.map(p => p.name || '—').join(', ')}</Text>
                  </Text>
                  <Text style={gm.summaryRow}>
                    <Text style={gm.summaryKey}>Stake: </Text>
                    <Text style={gm.summaryVal}>{DOLLAR_OPTIONS[dollarIdx]} per unit</Text>
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
          </KeyboardAvoidingView>

          {/* Navigation buttons */}
          <View style={gm.btnRow}>
            {step > 0 && (
              <TouchableOpacity style={gm.secondaryBtn} onPress={() => setStep(s => s - 1)} activeOpacity={0.7}>
                <Text style={gm.secondaryBtnTxt}>Back</Text>
              </TouchableOpacity>
            )}
            {step < 2 ? (
              <TouchableOpacity
                style={[gm.primaryBtn, !(step === 0 ? canProceedType : canProceedPlayers) && gm.primaryBtnOff]}
                onPress={() => setStep(s => s + 1)}
                disabled={!(step === 0 ? canProceedType : canProceedPlayers)}
                activeOpacity={0.8}
              >
                <Text style={gm.primaryBtnTxt}>NEXT</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={gm.primaryBtn} onPress={handleConfirm} activeOpacity={0.8}>
                <Text style={gm.primaryBtnTxt}>START GAME</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Settlement Modal ─────────────────────────────────────────────────────────
function SettlementModal({ visible, onClose, transactions, players, gameType, pressResults }) {
  const hasPresses = pressResults?.length > 0;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={sm.overlay}>
        <View style={sm.card}>
          <Text style={sm.title}>GAME OVER</Text>
          <Text style={sm.gameType}>{gameType}</Text>

          {/* Main settlement */}
          {hasPresses && <Text style={sm.txHeader}>MAIN BET</Text>}
          {transactions.length === 0 ? (
            <Text style={sm.noDebt}>All square — no money changes hands.</Text>
          ) : (
            <View style={sm.txList}>
              {!hasPresses && <Text style={sm.txHeader}>SETTLEMENT</Text>}
              {transactions.map((tx, i) => (
                <View key={i} style={sm.txRow}>
                  <Text style={sm.txFrom}>{tx.fromName}</Text>
                  <Text style={sm.txArrow}> owes </Text>
                  <Text style={sm.txTo}>{tx.toName}</Text>
                  <Text style={sm.txAmt}> ${tx.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Press results */}
          {hasPresses && (
            <View style={sm.pressSection}>
              <Text style={sm.txHeader}>PRESSES</Text>
              {pressResults.map((pr, i) => (
                <View key={i} style={sm.pressBlock}>
                  <Text style={sm.pressLabel}>
                    H{pr.press.startHole}–{pr.press.endHole}  ·  ${pr.press.stake}  ·  {
                      pr.result.status === 0 ? 'All Square' :
                      pr.result.status > 0  ? `${players[0]?.name ?? 'P1'} wins` :
                                              `${players[1]?.name ?? 'P2'} wins`
                    }
                  </Text>
                  {pr.txs.length === 0 ? (
                    <Text style={sm.pressNoDebt}>No money changes hands</Text>
                  ) : pr.txs.map((tx, j) => (
                    <View key={j} style={sm.txRow}>
                      <Text style={sm.txFrom}>{tx.fromName}</Text>
                      <Text style={sm.txArrow}> owes </Text>
                      <Text style={sm.txTo}>{tx.toName}</Text>
                      <Text style={sm.txAmt}> ${tx.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={sm.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={sm.doneBtnTxt}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Press Modal ──────────────────────────────────────────────────────────────
const PRESS_STAKE_OPTIONS = [1, 2, 5, 10, 20, 50];

function PressModal({ visible, onClose, onConfirm, currentHole, totalHoles }) {
  const [stake, setStake] = useState(PRESS_STAKE_OPTIONS[3]); // $10 default
  const [scope, setScope] = useState('this9');

  // Reset when opened
  useEffect(() => { if (visible) { setStake(PRESS_STAKE_OPTIONS[3]); setScope('this9'); } }, [visible]);

  const isBack = currentHole > 9;
  const showTwoScopes = totalHoles > 9;

  const endHole = scope === 'this9'
    ? (currentHole <= 9 ? Math.min(9, totalHoles) : totalHoles)
    : totalHoles;

  const scopeLabel = (sc) => {
    if (sc === 'this9') return isBack ? `Rest of Back 9 (H${currentHole}–${endHole})` : `Rest of Front 9 (H${currentHole}–${endHole})`;
    return `Overall to H${totalHoles} (H${currentHole}–${totalHoles})`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={pm.card}>
          <Text style={pm.title}>PRESS</Text>
          <Text style={pm.sub}>Starts from Hole {currentHole}</Text>

          {showTwoScopes && (
            <View style={pm.scopeGroup}>
              {['this9', 'overall'].map(sc => (
                <TouchableOpacity
                  key={sc}
                  style={[pm.scopeBtn, scope === sc && pm.scopeBtnOn]}
                  onPress={() => setScope(sc)}
                  activeOpacity={0.7}
                >
                  <Text style={[pm.scopeTxt, scope === sc && pm.scopeTxtOn]}>{scopeLabel(sc)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={pm.label}>STAKE</Text>
          <View style={pm.stakeRow}>
            {PRESS_STAKE_OPTIONS.map(v => (
              <TouchableOpacity
                key={v}
                style={[pm.stakeChip, stake === v && pm.stakeChipOn]}
                onPress={() => setStake(v)}
                activeOpacity={0.7}
              >
                <Text style={[pm.stakeTxt, stake === v && pm.stakeTxtOn]}>${v}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={pm.confirmBtn}
            onPress={() => { onConfirm({ scope, stake, endHole }); onClose(); }}
            activeOpacity={0.8}
          >
            <Text style={pm.confirmTxt}>PRESS  H{currentHole + 1}–{endHole}  ${stake}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 12, alignSelf: 'center' }}>
            <Text style={pm.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Game results panel (shown inside Scorecard when game is active) ──────────
function GamePanel({ gameConfig, allPlayerScores, pars, currentHole, onUpdateScore, presses, onAddPress }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPress, setShowPress] = useState(false);
  const { type, players, useHandicap } = gameConfig;
  const n = players.length;
  const totalHoles = pars.length;

  const completedPars = pars.slice(0, currentHole - 1);
  const completedScores = allPlayerScores.map(ps => ps.slice(0, currentHole - 1));
  const result = completedPars.length > 0
    ? calcGame(type, completedScores, completedPars, players)
    : null;

  // Compact summary line
  const summaryLine = () => {
    if (!result) return 'Waiting for scores…';
    switch (type) {
      case 'Skins': {
        const { skins, carryOver } = result;
        return skins.map((s, i) => `${players[i].name}: ${s}`).join('  ') + (carryOver > 0 ? `  (+${carryOver} carry)` : '');
      }
      case 'Nassau': {
        const ns = (seg) => !seg ? '—' : seg.status === 0 ? 'AS' : seg.status > 0 ? `+${seg.status}` : `${seg.status}`;
        return `F:${ns(result.front)}  B:${ns(result.back)}  T:${ns(result.total)}`;
      }
      case 'Match Play':
        return result.statusStr ?? 'All Square';
      case 'Stableford':
        return result.map(r => `${players[r.playerIdx].name}: ${r.total}pts`).join('  ');
      case 'Wolf':
        return result.points.map((p, i) => `${players[i].name}: ${p > 0 ? '+' : ''}${p}`).join('  ');
      case '9 Point':
        return result.totals.map((t, i) => `${players[i].name}: ${t}`).join('  ');
      default: return '';
    }
  };

  // "Up N" / "Down N" / "All Square" from P0's perspective
  const p0StatusLabel = (n) => {
    if (n > 0) return `Up ${n}`;
    if (n < 0) return `Down ${Math.abs(n)}`;
    return 'All Square';
  };

  const renderStatus = () => {
    if (!result) return <Text style={gp.standingsText}>Waiting for scores…</Text>;
    switch (type) {

      case 'Match Play': {
        const label = result.matchOver ? result.statusStr : p0StatusLabel(result.status);
        return <Text style={[gp.standingsText, gp.statusBig]}>{label}</Text>;
      }

      case 'Skins': {
        const { skins, carryOver } = result;
        const best = Math.max(...skins.slice(1));
        return (
          <View style={gp.statusRow}>
            <Text style={[gp.standingsText, gp.statusBig]}>{p0StatusLabel(skins[0] - best)}</Text>
            <Text style={gp.statusDetail}>
              {skins.map((s, i) => `${players[i].name} ${s}`).join(' · ')}
              {carryOver > 0 ? `  · +${carryOver} carry` : ''}
            </Text>
          </View>
        );
      }

      case 'Nassau': {
        // result.back is null when back 9 not yet started (engine handles this — no display-side check needed)
        const segLabel = (seg) => !seg ? '—' : p0StatusLabel(seg.status);
        const p0Scores = allPlayerScores[0];
        const p1Scores = allPlayerScores[1];
        const canPress = currentHole < totalHoles;
        return (
          <View>
            <View style={gp.nassauGrid}>
              {[
                { label: 'FRONT', seg: result.front },
                { label: 'BACK',  seg: result.back  },
                { label: 'TOTAL', seg: result.total },
              ].map(({ label, seg }) => (
                <View key={label} style={gp.nassauSeg}>
                  <Text style={gp.nassauSegLabel}>{label}</Text>
                  <Text style={[
                    gp.nassauSegValue,
                    !seg              && gp.nassauDim,
                    seg?.status === 0 && gp.nassauTie,
                  ]}>
                    {segLabel(seg)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Active presses */}
            {(presses ?? []).length > 0 && (
              <View style={gp.pressSection}>
                <Text style={gp.pressSectionLabel}>PRESSES</Text>
                {(presses ?? []).map(press => {
                  const pr = calcPressStatus(press, p0Scores, p1Scores);
                  return (
                    <View key={press.id} style={gp.pressRow}>
                      <Text style={gp.pressRange}>H{press.startHole}–{press.endHole}</Text>
                      <Text style={gp.pressStake}>${press.stake}</Text>
                      <Text style={[
                        gp.pressStatus,
                        pr.status > 0 && gp.pressUp,
                        pr.status < 0 && gp.pressDown,
                      ]}>
                        {p0StatusLabel(pr.status)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* PRESS button */}
            {canPress && onAddPress && (
              <TouchableOpacity
                style={gp.pressBtn}
                onPress={() => setShowPress(true)}
                activeOpacity={0.7}
              >
                <Text style={gp.pressBtnTxt}>+ PRESS</Text>
              </TouchableOpacity>
            )}

            <PressModal
              visible={showPress}
              onClose={() => setShowPress(false)}
              onConfirm={(cfg) => onAddPress(cfg)}
              currentHole={currentHole}
              totalHoles={totalHoles}
            />
          </View>
        );
      }

      case 'Stableford': {
        const p0pts = result[0]?.total ?? 0;
        const best  = Math.max(...result.slice(1).map(r => r.total));
        return (
          <View style={gp.statusRow}>
            <Text style={[gp.standingsText, gp.statusBig]}>{p0StatusLabel(p0pts - best)} pts</Text>
            <Text style={gp.statusDetail}>
              {result.map(r => `${players[r.playerIdx].name} ${r.total}`).join(' · ')}
            </Text>
          </View>
        );
      }

      case 'Wolf': {
        const best = Math.max(...result.points.slice(1));
        return (
          <View style={gp.statusRow}>
            <Text style={[gp.standingsText, gp.statusBig]}>{p0StatusLabel(result.points[0] - best)}</Text>
            <Text style={gp.statusDetail}>
              {result.points.map((p, i) => `${players[i].name} ${p >= 0 ? '+' : ''}${p}`).join(' · ')}
            </Text>
          </View>
        );
      }

      case '9 Point': {
        const best = Math.max(...result.totals.slice(1));
        return (
          <View style={gp.statusRow}>
            <Text style={[gp.standingsText, gp.statusBig]}>{p0StatusLabel(result.totals[0] - best)} pts</Text>
            <Text style={gp.statusDetail}>
              {result.totals.map((t, i) => `${players[i].name} ${t}`).join(' · ')}
            </Text>
          </View>
        );
      }

      default: return null;
    }
  };

  return (
    <View style={gp.container}>
      <TouchableOpacity style={gp.header} onPress={() => setCollapsed(c => !c)} activeOpacity={0.7}>
        <View style={gp.headerLeft}>
          <Ionicons name="dice-outline" size={14} color="#C9A84C" />
          <Text style={gp.headerTitle}>{type.toUpperCase()}</Text>
        </View>
        <Ionicons name={collapsed ? 'chevron-up' : 'chevron-down'} size={14} color="#7A6E58" />
      </TouchableOpacity>

      {!collapsed && (
        <>
          {/* Other players' scores for this hole */}
          {n > 1 && (
            <View style={gp.playerScores}>
              {players.slice(1).map((pl, pIdx) => {
                const realIdx = pIdx + 1;
                const score = allPlayerScores[realIdx]?.[currentHole - 1] ?? null;
                return (
                  <View key={realIdx} style={gp.playerRow}>
                    <Text style={gp.playerName} numberOfLines={1}>{pl.name}</Text>
                    <View style={gp.adjRow}>
                      <TouchableOpacity
                        style={gp.adjBtn}
                        onPress={() => onUpdateScore(realIdx, Math.max(1, (score ?? 4) - 1))}
                        activeOpacity={0.7}
                      >
                        <Text style={gp.adjTxt}>−</Text>
                      </TouchableOpacity>
                      <Text style={gp.scoreVal}>{score ?? '—'}</Text>
                      <TouchableOpacity
                        style={gp.adjBtn}
                        onPress={() => onUpdateScore(realIdx, (score ?? 4) + 1)}
                        activeOpacity={0.7}
                      >
                        <Text style={gp.adjTxt}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Current standings */}
          <View style={gp.standings}>
            <Text style={gp.standingsLabel}>STANDINGS</Text>
            {renderStatus()}
          </View>
        </>
      )}

      {collapsed && (
        <Text style={gp.collapsedSummary} numberOfLines={1}>{summaryLine()}</Text>
      )}
    </View>
  );
}

// ─── Live Scorecard ───────────────────────────────────────────────────────────
function Scorecard({
  courseName, holes, startTs, pausedAt,
  currentHole, setCurrentHole,
  scores, setScores,
  pars, setPars,
  onFinish,
  onLockedPress,
  // Game props (optional)
  gameConfig,
  otherPlayerScores,
  setOtherPlayerScores,
  presses,
  onAddPress,
}) {
  const totalHoles     = parseInt(holes, 10);
  const holeIdx        = currentHole - 1;
  const currentScore   = scores[holeIdx];
  const currentPar     = pars[holeIdx] ?? 4;
  const [elapsed, setElapsed]         = useState('');
  const [maxVisited, setMaxVisited]   = useState(1); // highest hole number reached

  // ── Rangefinder ──────────────────────────────────────────────────────────────
  const { location: currentLocation } = useCurrentLocation();
  const { hasProAccess, isOnTrial, trialDaysRemaining } = useProAccess();
  const greenHoles = getMockGreensForCourse(courseName);
  const greenCoords = greenHoles ? (greenHoles.find(h => h.hole_number === currentHole) ?? null) : null;

  // Live timer — freezes when paused
  useEffect(() => {
    if (pausedAt) {
      setElapsed(elapsedStr(startTs, pausedAt));
      return;
    }
    setElapsed(elapsedStr(startTs));
    const interval = setInterval(() => setElapsed(elapsedStr(startTs)), 1000);
    return () => clearInterval(interval);
  }, [startTs, pausedAt]);

  // Running score vs par — only holes visited so far (1..maxVisited)
  const totalVsPar = scores.slice(0, maxVisited).reduce((sum, sc, i) => {
    return sum + ((sc ?? (pars[i] ?? 4)) - (pars[i] ?? 4));
  }, 0);

  const setScore = (val) => {
    const next = [...scores];
    next[holeIdx] = Math.max(1, val);
    setScores(next);
  };

  const changePar = (val) => {
    const nextPars = [...pars];
    nextPars[holeIdx] = val;
    setPars(nextPars);
    // Reset score to new par value
    const nextScores = [...scores];
    nextScores[holeIdx] = val;
    setScores(nextScores);
  };

  const isLastHole = currentHole === totalHoles;

  const handleNext = () => {
    if (!currentScore) {
      Alert.alert('Enter Score', 'Please enter your score for this hole before continuing.');
      return;
    }
    if (isLastHole) {
      onFinish();
    } else {
      setMaxVisited(v => Math.max(v, currentHole + 1));
      setCurrentHole(h => h + 1);
    }
  };

  const handlePrev = () => {
    if (currentHole > 1) setCurrentHole(h => h - 1);
  };

  const diff = currentScore ? currentScore - currentPar : null;
  const scoreCol = currentScore ? scoreColor(currentScore, currentPar) : '#3A3A3A';

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.scHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.scCourse} numberOfLines={1}>{courseName}</Text>
          <Text style={s.scElapsed}>{elapsed}</Text>
        </View>
        <View style={s.scVsParBig}>
          <Text style={[s.scVsParNum, { color: scoreVsParColor(totalVsPar) }]}>
            {scoreVsParLabel(totalVsPar)}
          </Text>
          <Text style={s.scVsParLabel}>VS PAR</Text>
        </View>
      </View>

      {/* Hole number */}
      <View style={s.holeHeader}>
        <Text style={s.holeNum}>Hole {currentHole}</Text>
      </View>

      {/* Rangefinder */}
      <RangefinderCard
        currentLocation={currentLocation}
        greenCoords={greenCoords}
        holeNumber={currentHole}
        par={currentPar}
        hasProAccess={hasProAccess}
        isOnTrial={isOnTrial}
        trialDaysRemaining={trialDaysRemaining}
        onLockedPress={onLockedPress}
      />

      {/* Par selector — always visible, 3 large pills */}
      <View style={s.parSelectorWrap}>
        <Text style={s.parSelectorLabel}>SELECT PAR</Text>
        <View style={s.parSelectorRow}>
          {[3, 4, 5].map(p => (
            <TouchableOpacity
              key={p}
              style={[s.parPill, currentPar === p && s.parPillOn]}
              onPress={() => changePar(p)}
              activeOpacity={0.7}
            >
              <Text style={[s.parPillTxt, currentPar === p && s.parPillTxtOn]}>Par {p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Score input */}
      <View style={s.scoreInputArea}>
        <TouchableOpacity style={s.adjBtn} onPress={() => setScore((currentScore || currentPar) - 1)} activeOpacity={0.7}>
          <Text style={s.adjBtnTxt}>−</Text>
        </TouchableOpacity>
        <View style={s.scoreDisplay}>
          <Text style={[s.scoreBig, { color: scoreCol }]}>
            {currentScore || currentPar}
          </Text>
          <Text style={[s.scoreRelative, { color: scoreCol }]}>
            {diff === null ? 'E' : scoreVsParLabel(diff)}
          </Text>
          <Text style={[s.shotNameTxt, { color: scoreCol }]}>
            {shotName(diff ?? 0)}
          </Text>
        </View>
        <TouchableOpacity style={s.adjBtn} onPress={() => setScore((currentScore || currentPar) + 1)} activeOpacity={0.7}>
          <Text style={s.adjBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Past holes horizontal scroll — shows all visited holes */}
      {maxVisited > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pastHolesScroll}
        >
          {scores.slice(0, maxVisited).map((sc, i) => {
            const par = pars[i] ?? 4;
            return (
              <TouchableOpacity
                key={i}
                style={[s.pastHoleChip, i === holeIdx && s.pastHoleChipActive]}
                onPress={() => setCurrentHole(i + 1)}
                activeOpacity={0.7}
              >
                <Text style={s.pastHoleNum}>{i + 1}</Text>
                <Text style={[s.pastHoleScore, { color: scoreColor(sc ?? par, par) }]}>{sc ?? par}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Active game panel */}
      {gameConfig && (
        <GamePanel
          gameConfig={gameConfig}
          allPlayerScores={[scores, ...(otherPlayerScores ?? [])]}
          pars={pars}
          currentHole={currentHole}
          onUpdateScore={(playerIdx, val) => {
            const next = (otherPlayerScores ?? []).map((ps, i) =>
              i === playerIdx - 1 ? ps.map((v, h) => h === holeIdx ? val : v) : ps
            );
            setOtherPlayerScores(next);
          }}
          presses={presses}
          onAddPress={onAddPress}
        />
      )}

      {/* Bottom nav */}
      <View style={s.bottomNav}>
        <TouchableOpacity
          style={[s.navBtn, currentHole === 1 && s.navBtnDisabled]}
          onPress={handlePrev}
          disabled={currentHole === 1}
          activeOpacity={0.7}
        >
          <Text style={[s.navBtnTxt, currentHole === 1 && s.navBtnTxtDisabled]}>← Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtnPrimary} onPress={handleNext} activeOpacity={0.8}>
          <Text style={s.navBtnPrimaryTxt}>{isLastHole ? 'Finish Round ✓' : 'Next Hole →'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Edit Times step ─────────────────────────────────────────────────────────
// Shown between SCORECARD and PACE so users can correct a runaway finish time
// (e.g. "forgot to close the app, it ran 8 hours"). Adjusts in 15-min steps.
function EditTimesStep({ startTs, onConfirm }) {
  const capturedNow = useRef(Date.now()).current;
  const [adjustMin, setAdjustMin] = useState(0);

  const finishTs    = capturedNow + adjustMin * 60 * 1000;
  const durationMin = Math.max(1, Math.round((finishTs - startTs) / 60000));
  const finishDate  = new Date(finishTs);
  const finishStr   = minutesToTimeStr(finishDate.getHours() * 60 + finishDate.getMinutes());
  const hrs         = Math.floor(durationMin / 60);
  const min         = durationMin % 60;

  return (
    <View style={{ flex: 1 }}>
      <Text style={s.stepTitle}>Correct Finish Time</Text>
      <Text style={s.stepSub}>
        If the timer ran past when you actually finished, adjust it here.
      </Text>

      <Text style={[s.sectionQ, { marginTop: 24 }]}>Finish time</Text>
      <View style={s.teePickerRow}>
        <TouchableOpacity style={s.teeAdj} onPress={() => setAdjustMin(v => v - 15)} activeOpacity={0.7}>
          <Text style={s.teeAdjText}>−</Text>
        </TouchableOpacity>
        <Text style={s.teeValue}>{finishStr}</Text>
        <TouchableOpacity style={s.teeAdj} onPress={() => setAdjustMin(v => v + 15)} activeOpacity={0.7}>
          <Text style={s.teeAdjText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.stepSub, { textAlign: 'center', marginTop: 12, fontSize: 15 }]}>
        Duration: {hrs > 0 ? `${hrs}h ` : ''}{min}m
      </Text>

      <TouchableOpacity
        style={[s.primaryBtn, { marginTop: 32 }]}
        onPress={() => onConfirm(finishTs)}
        activeOpacity={0.8}
      >
        <Text style={s.primaryBtnText}>LOOKS RIGHT — CONTINUE →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Pace Delay step ─────────────────────────────────────────────────────────
function PaceStep({ holes, onSelect }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.stepTitle}>One last thing</Text>
      <Text style={s.stepSub}>During your round, how often were you waiting on the group ahead?</Text>
      <View style={{ marginTop: 8 }}>
        {PACE_DELAY_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[s.paceRow, { backgroundColor: opt.bgTint, borderColor: opt.color + '44' }]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.8}
          >
            <View style={[s.paceDot, { backgroundColor: opt.color }]} />
            <Text style={[s.paceTxt, { color: opt.color }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
const PHASE = { COURSE: 0, TEE_TIME: 1, DETAILS: 2, TEE_SELECT: 3, READY: 4, SCORECARD: 5, EDIT_TIMES: 6, PACE: 7, SAVING: 8 };

export default function LiveRoundScreen({ navigation }) {
  const { user, profile, refreshProfile } = useAuth();

  // Setup state
  const [phase, setPhase]       = useState(PHASE.COURSE);
  const [course, setCourse]     = useState(null); // { name, city, state, is_par3 }
  const [isPar3, setIsPar3]     = useState(false);
  const [teeTime, setTeeTime]   = useState(nowTimeStr);
  const [holes, setHoles]       = useState('18');
  const [transport, setTransport] = useState('Cart');
  const [players, setPlayers]   = useState('4');

  // Scorecard state
  const [currentHole, setCurrentHole] = useState(1);
  const [scores, setScores]           = useState(Array(18).fill(4));
  const [pars, setPars]               = useState(Array(18).fill(4));
  const [startTs, setStartTs]         = useState(null);

  // Optional finish timestamp override — set by EditTimesStep, consumed by handlePaceSelected
  const [customFinishTs, setCustomFinishTs] = useState(null);

  // Auto-pause: null = running, timestamp = frozen at last interaction
  const [pausedAt, setPausedAt] = useState(null);

  // Dead-man's-switch interaction tracking
  const lastInteractionTsRef = useRef(null);
  const ladderTimerRef       = useRef(null);

  // Game state
  const [gameConfig, setGameConfig]           = useState(null); // null = no active game
  const [otherPlayerScores, setOtherScores]   = useState([]); // [playerIdx-1][holeIdx]
  const [showGameModal, setShowGameModal]      = useState(false);
  const [showSettlement, setShowSettlement]   = useState(false);
  const [settlementData, setSettlementData]   = useState({ transactions: [], players: [], pressResults: [] });
  const [presses, setPresses]                 = useState([]);

  // Tee selection state (populated async when course is chosen)
  const [courseTees, setCourseTees]           = useState(null); // male tees array or null
  const [selectedTeeIdx, setSelectedTeeIdx]   = useState(null);
  const [selectedNine, setSelectedNine]       = useState('front'); // 'front' | 'back'

  // ── Round rehydration — restore state after app kill/crash ──────────────────
  useEffect(() => {
    AsyncStorage.getItem(ROUND_STATE_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (!saved?.startTs || !saved?.course) return;
        // Stale rounds (> 12 h) — clear silently, no prompt
        if (Date.now() - saved.startTs > ROUND_STALENESS_MS) {
          AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {});
          return;
        }
        // Seed last-interaction timestamp
        lastInteractionTsRef.current = saved.lastInteractionTs ?? Date.now();
        // Auto-pause if gap ≥ 25 min at rehydration time
        const sinceInteraction = Date.now() - lastInteractionTsRef.current;
        if (sinceInteraction >= 25 * 60 * 1000) {
          setPausedAt(lastInteractionTsRef.current);
        }
        // Restore scorecard state
        setCourse(saved.course);
        setIsPar3(saved.isPar3 ?? false);
        setTeeTime(saved.teeTime ?? nowTimeStr());
        setHoles(saved.holes ?? '18');
        setTransport(saved.transport ?? 'Cart');
        setPlayers(saved.players ?? '4');
        setCurrentHole(saved.currentHole ?? 1);
        setScores(saved.scores ?? Array(18).fill(4));
        setPars(saved.pars ?? Array(18).fill(4));
        setStartTs(saved.startTs);
        if (saved.gameConfig) setGameConfig(saved.gameConfig);
        if (saved.otherPlayerScores?.length) setOtherScores(saved.otherPlayerScores);
        if (saved.presses?.length) setPresses(saved.presses);
        setPhase(PHASE.SCORECARD);
      } catch { AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {}); }
    }).catch(() => {});
  }, []);

  // ── Round state persistence — write on every scorecard change ────────────────
  useEffect(() => {
    if (phase !== PHASE.SCORECARD || !startTs || !course) return;
    // Any scorecard interaction un-pauses the round
    if (pausedAt !== null) setPausedAt(null);
    lastInteractionTsRef.current = Date.now();
    AsyncStorage.setItem(ROUND_STATE_KEY, JSON.stringify({
      startTs, course, isPar3, teeTime, holes, transport, players,
      currentHole, scores, pars, gameConfig, otherPlayerScores, presses,
      lastInteractionTs: lastInteractionTsRef.current,
      isPaused: false,
      pausedAt: null,
    })).catch(() => {});
    // Debounced ladder reschedule — 2 s delay to avoid hammering on every keystroke
    clearTimeout(ladderTimerRef.current);
    ladderTimerRef.current = setTimeout(() => {
      scheduleInteractionLadder(course.name).catch(() => {});
    }, 2000);
  }, [phase, startTs, course, currentHole, scores, pars, gameConfig, otherPlayerScores, presses]);

  // ── AppState foreground listener — auto-pause or reschedule ladder ────────────
  useEffect(() => {
    if (phase !== PHASE.SCORECARD) return;
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      const sinceInteraction = Date.now() - (lastInteractionTsRef.current ?? Date.now());
      if (sinceInteraction >= 25 * 60 * 1000) {
        setPausedAt(lastInteractionTsRef.current);
      } else {
        lastInteractionTsRef.current = Date.now();
        scheduleInteractionLadder(course?.name ?? 'your course').catch(() => {});
      }
    });
    return () => sub.remove();
  }, [phase, course]);

  const handleCourseSelected = async (c) => {
    setCourse(c);
    setIsPar3(isPar3Course(c));
    setCourseTees(null);
    setSelectedTeeIdx(null);
    setSelectedNine('front');
    setPhase(PHASE.TEE_TIME);
    // Fetch tee data in background — user navigates through TEE_TIME/DETAILS before needing it
    if (c.id) {
      try {
        const { data } = await supabase.from('courses').select('raw_data').eq('id', c.id).maybeSingle();
        const maleTees = data?.raw_data?.tees?.male;
        if (maleTees?.length > 0) {
          setCourseTees(maleTees);
          setSelectedTeeIdx(Math.floor(maleTees.length / 2));
        }
      } catch { /* silent */ }
    }
  };

  const handleTeeTimeNext = () => setPhase(PHASE.DETAILS);

  const handleDetailsNext = () => {
    setPhase((courseTees?.length ?? 0) > 0 ? PHASE.TEE_SELECT : PHASE.READY);
  };

  const handleStartRound = () => {
    const ts = Date.now();
    setStartTs(ts);
    AsyncStorage.setItem(ASYNC_KEY, String(ts)).catch(() => {});
    setCustomFinishTs(null);                            // clear any prior override
    setPresses([]);
    setCurrentHole(1);
    const holeCount = parseInt(holes, 10);
    const defaultPar = isPar3 ? 3 : 4;
    // Seed per-hole pars from user's selected tee; fall back to cached hole_data, then default par.
    const selectedTee = (courseTees && selectedTeeIdx != null) ? courseTees[selectedTeeIdx] : null;
    const teeHoles = selectedTee?.holes ?? course?.hole_data ?? null;
    let initialPars;
    if (teeHoles && teeHoles.length >= holeCount) {
      const sliceFrom = (holeCount === 9 && teeHoles.length >= 18 && selectedNine === 'back') ? 9 : 0;
      initialPars = teeHoles.slice(sliceFrom, sliceFrom + holeCount).map(h => h.par ?? defaultPar);
    } else {
      initialPars = Array(holeCount).fill(defaultPar);
    }
    setPars(initialPars);
    setScores([...initialPars]);
    // Reinitialize other-player score grids in case game was set up on this screen
    if (gameConfig) {
      const n = gameConfig.players.length;
      setOtherScores(Array(n - 1).fill(null).map(() => Array(holeCount).fill(null)));
    }
    setPhase(PHASE.SCORECARD);
    lastInteractionTsRef.current = Date.now();
    scheduleInteractionLadder(course?.name ?? 'your course').catch(() => {});
    supabase.from('activity_feed').insert({
      user_id: user?.id,
      type: 'live_round_started',
      content: {
        course_name: course?.name,
        holes,
        transport,
        started_at: new Date().toISOString(),
      },
      is_live: true,
    }).then(() => {}).catch(() => {});
  };

  const handleFinishScorecard = () => setPhase(PHASE.EDIT_TIMES);

  const handlePaceSelected = async (paceDelay) => {
    setPhase(PHASE.SAVING);
    try {
      const uid        = user?.id;
      if (!uid) throw new Error('No user');

      const finishTs   = customFinishTs ?? Date.now();
      const finishDate = new Date(finishTs);
      const finishTime = minutesToTimeStr(finishDate.getHours() * 60 + finishDate.getMinutes());
      const durationMinutes = Math.max(1, Math.round((finishTs - startTs) / 60000));

      // Calculate score vs par
      const totalHoles   = parseInt(holes, 10);
      const holeScores   = scores.slice(0, totalHoles);
      const holePars     = pars.slice(0, totalHoles);
      const totalScoreVsPar = holeScores.reduce((sum, sc, i) => sum + (sc - (holePars[i] ?? (isPar3 ? 3 : 4))), 0);

      // Derive score vs handicap (short key)
      const scoreVsHandicap = deriveScoreVsHandicap(totalScoreVsPar, holes, profile?.handicap, isPar3);

      const today = new Date();
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const dateStr = `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

      // Capture old rank before this round changes the leaderboard
      let oldRank = null;
      try {
        const { count } = await supabase
          .from('profiles').select('*', { count: 'exact', head: true })
          .gt('pop_score', profile?.pop_score ?? 0);
        oldRank = (count ?? 0) + 1;
      } catch (e) { /* silent fail */ }

      // Fraud detection
      if (isFraudulent(durationMinutes, holes, players, isPar3, transport, paceDelay)) {
        const { count: existingFlags } = await supabase.from('rounds')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid).eq('flagged', true);
        const flaggedCount = (existingFlags || 0) + 1;
        const flaggedPayload = {
          user_id: uid, course_name: course.name, holes, transport, players,
          tee_time: teeTime, finish_time: finishTime, duration_minutes: durationMinutes,
          score_vs_handicap: scoreVsHandicap, pace_delay: paceDelay,
          hole_scores: holeScores, active_game: gameConfig ?? null,
          pop_score: null, flagged: true, flagged_count: flaggedCount,
          verification_level: 'self_reported',
        };
        const { error: flagErr } = await roundsInsert(flaggedPayload);
        Alert.alert('Round Flagged', flaggedCount >= 3
          ? 'This round has been flagged as potentially invalid. Your account is currently under review. Contact hello@clocked.golf with questions.'
          : 'This round has been flagged as potentially invalid and is pending review.');
        cancelInteractionLadder().catch(() => {});
        AsyncStorage.removeItem(ASYNC_KEY).catch(() => {});
        AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {});
        setPhase(PHASE.DONE);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }

      // Fetch course avg_time for pace forgiveness scaling
      let courseAvgMinutes = null;
      try {
        const { data: courseAvgRow } = await supabase.from('courses').select('avg_time').eq('name', course.name).maybeSingle();
        courseAvgMinutes = courseAvgRow?.avg_time || null;
      } catch (e) { // silent fail
      }

      const { pop_score: pop, adjusted_expected_minutes: adjustedExpectedMinutes,
              adjusted_actual_minutes: adjustedActualMinutes, ratio } = calcPOPScoreCore({
        durationMinutes,
        holes,
        transport,
        players,
        paceDelay,
        scoreVsHandicap,
        caddyLogged: false,
        courseAvgMinutes,
        isPar3,
      });

      const roundData = {
        user_id:                     uid,
        course_name:                 course.name,
        holes,
        transport,
        players,
        tee_time:                    teeTime,
        finish_time:                 finishTime,
        duration_minutes:            durationMinutes,
        score_vs_handicap:           scoreVsHandicap,
        pace_delay:                  paceDelay,
        adjusted_expected_minutes:   adjustedExpectedMinutes,
        adjusted_actual_minutes:     adjustedActualMinutes,
        ratio,
        pop_score:                   pop,
        flagged:                     false,
        verification_level:          'self_reported',
        hole_scores:                 holeScores,
        active_game:                 gameConfig ?? null,
      };

      const { data: insertedRoundRows, error } = await roundsInsert(roundData, 'id');
      const newRoundId = insertedRoundRows?.[0]?.id;
      if (error) {
        throw new Error(error.message);
      }

      // Recalculate profile POPScore as weighted rolling average of last 20 rounds
      await recalculateProfilePopScore(uid, supabase);

      await refreshProfile();

      // Retention notifications — fire-and-forget, never block save flow
      (async () => {
        try {
          const { count: newRankCount } = await supabase
            .from('profiles').select('*', { count: 'exact', head: true })
            .gt('pop_score', pop);
          const newRank = (newRankCount ?? 0) + 1;
          await sendRankMoveNotification(oldRank, newRank, pop);

          const { count: totalRoundsCount } = await supabase
            .from('rounds').select('*', { count: 'exact', head: true })
            .eq('user_id', uid).not('pop_score', 'is', null);
          await checkAndSendMilestone(totalRoundsCount ?? 1, pop, profile?.pop_score ?? 0, uid);
        } catch (e) { /* silent fail */ }
        scheduleInactivityReminder().catch(() => {});
      })();

      // Update handicap index from last 20 rounds
      await updateHandicapAfterRound(uid, supabase);

      // Update course stats
      const { data: courseRow } = await supabase.from('courses').select('id').eq('name', course.name).maybeSingle();
      if (courseRow) {
        const { data: courseRounds } = await supabase.from('rounds').select('pop_score, duration_minutes, pace_delay, holes').eq('course_name', course.name).eq('flagged', false);
        if (courseRounds && courseRounds.length > 0) {
          const scored = courseRounds.filter(r => r.pop_score != null);
          const courseAvg = scored.length > 0 ? scored.reduce((s, r) => s + (Number(r.pop_score) || 0), 0) / scored.length : null;
          const constantCount     = courseRounds.filter(r => r.pace_delay === 'constant').length;
          const managementPenalty = parseFloat((constantCount / courseRounds.length * 0.5).toFixed(2));
          const avgPop  = courseAvg != null
            ? parseFloat(Math.max(1.0, Math.min(5.0, courseAvg - managementPenalty)).toFixed(2))
            : null;
          const timed = courseRounds.filter(r => r.duration_minutes != null);
          const avgTime = timed.length > 0 ? parseFloat((timed.reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0) / timed.length).toFixed(1)) : null;
          const fullRounds = courseRounds.filter(r => r.duration_minutes != null && (r.holes === '18' || r.holes === 18));
          const fastestTime = fullRounds.length > 0 ? Math.min(...fullRounds.map(r => Number(r.duration_minutes) || 0)) : null;
          const courseUpdate = { total_rounds: courseRounds.length, management_penalty: managementPenalty };
          if (avgPop != null && !isNaN(avgPop)) courseUpdate.pop_score = avgPop;
          if (avgTime != null && !isNaN(avgTime)) courseUpdate.avg_time = avgTime;
          if (fastestTime != null && !isNaN(fastestTime)) courseUpdate.fastest_time = fastestTime;
          await supabase.from('courses').update(courseUpdate).eq('id', String(courseRow.id));
        }

        // Feature 4 — Course #1 check
        if (pop != null && newRoundId) {
          try {
            const { data: prevBest } = await supabase
              .from('rounds').select('user_id, pop_score')
              .eq('course_name', course.name).eq('flagged', false)
              .not('pop_score', 'is', null).neq('id', newRoundId)
              .order('pop_score', { ascending: false }).limit(1).maybeSingle();
            const beatsAll         = !prevBest || pop > (prevBest.pop_score ?? 0);
            const wasAlreadyLeader = prevBest?.user_id === uid;
            if (beatsAll && !wasAlreadyLeader) {
              const handle = profile?.username ? `@${profile.username}` : 'a player';
              await sendPushToUser(uid, `You're the fastest at ${course.name}`, `Your Clocked Score of ${pop.toFixed(1)} is now #1 at ${course.name}. Own it.`, 'course_leader');
              supabase.from('activity_feed').insert({ user_id: uid, type: 'course_leader', content: { description: `${handle} is now the fastest player at ${course.name}`, course_name: course.name, pop_score: pop } }).then(() => {});
            }
          } catch (e) { /* silent fail */ }
        }
      }

      // Notify followers
      const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', uid);
      if (followers && followers.length > 0) {
        const { data: followerProfiles } = await supabase
          .from('profiles').select('id').in('id', followers.map(f => f.follower_id));
        const name = profile?.username ? `@${profile.username}` : 'A friend';
        const body = `${name} just finished a live round at ${course.name} — Clocked Score ${pop.toFixed(1)}.`;
        for (const fp of (followerProfiles || [])) {
          await sendPushToUser(fp.id, 'Friend Activity', body, 'friend_round');
        }
      }

      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your round has been scored!',
          body: 'Tap to see your updated Clocked Score →',
        },
        trigger: { seconds: 18000, repeats: false },
      }).catch(() => {});

      // Challenge auto-settlement
      if (pop != null && newRoundId) {
        try {
          const { data: activeChallenges } = await supabase
            .from('challenges')
            .select('id, challenger_id, challenged_id, challenger_score, challenged_score')
            .or(`challenger_id.eq.${uid},challenged_id.eq.${uid}`)
            .eq('course_name', course.name)
            .eq('status', 'accepted');
          for (const ch of (activeChallenges ?? [])) {
            const isChallenger = ch.challenger_id === uid;
            const opponentId   = isChallenger ? ch.challenged_id : ch.challenger_id;
            const otherScore   = isChallenger ? ch.challenged_score : ch.challenger_score;
            const updateField  = isChallenger ? 'challenger_score' : 'challenged_score';
            const roundField   = isChallenger ? 'challenger_round_id' : 'challenged_round_id';
            if (otherScore != null) {
              const iWin     = pop > otherScore;
              const winnerId = iWin ? uid : opponentId;
              await supabase.from('challenges').update({ [updateField]: pop, [roundField]: newRoundId, status: 'completed', winner_id: winnerId }).eq('id', ch.id);
              const { data: opp } = await supabase.from('profiles').select('username').eq('id', opponentId).maybeSingle();
              const myHandle  = profile?.username ? `@${profile.username}` : 'a player';
              const oppHandle = opp?.username ? `@${opp.username}` : 'their opponent';
              await sendPushToUser(uid, iWin ? `You won the challenge at ${course.name}` : `You lost the challenge at ${course.name}`, iWin ? `Your ${pop.toFixed(1)} beat the ${otherScore.toFixed(1)}. Own it.` : `${oppHandle} had a better score. Rematch?`, 'challenge_result');
              await sendPushToUser(opponentId, iWin ? `You lost the challenge at ${course.name}` : `You won the challenge at ${course.name}`, iWin ? `${myHandle} had a better score. Rematch?` : `Your score held up! ${myHandle} couldn't beat it.`, 'challenge_result');
              supabase.from('activity_feed').insert({ user_id: winnerId, type: 'challenge_won', content: { description: `${iWin ? myHandle : oppHandle} beat ${iWin ? oppHandle : myHandle}'s challenge at ${course.name}`, course_name: course.name, winner_score: iWin ? pop : otherScore } }).then(() => {}).catch(() => {});
            } else {
              await supabase.from('challenges').update({ [updateField]: pop, [roundField]: newRoundId }).eq('id', ch.id);
            }
          }
        } catch { /* silent fail */ }
      }

      // Clean up AsyncStorage keys
      cancelInteractionLadder().catch(() => {});
      AsyncStorage.removeItem(ASYNC_KEY).catch(() => {});
      AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {});

      // Show game settlement before navigating to share
      if (gameConfig) {
        const totalHolesFinal = parseInt(holes, 10);
        const allScores = [scores.slice(0, totalHolesFinal), ...otherPlayerScores.map(ps => ps.slice(0, totalHolesFinal))];
        const result = calcGame(gameConfig.type, allScores, pars.slice(0, totalHolesFinal), gameConfig.players);
        if (result) {
          const unitScores = gameResultToUnitScores(gameConfig.type, result, gameConfig.players.length);
          const txs = calcSettlement(unitScores, gameConfig.dollarPerUnit, gameConfig.players);

          // Press settlement (Nassau only, 2-player)
          // A press is a straight winner-takes-stake bet — generate the transaction directly
          // rather than using calcSettlement (which normalises by average and would pay out
          // only half the stake for a binary [1,0] unit score).
          let pressResults = [];
          if (gameConfig.type === 'Nassau' && presses.length > 0 && allScores.length >= 2) {
            pressResults = presses.map(press => {
              const pr = calcPressStatus(press, allScores[0], allScores[1]);
              const pl = gameConfig.players;
              const pressTxs = pr.winner != null ? [{
                from:     pr.winner === 0 ? 1 : 0,
                to:       pr.winner,
                fromName: pl[pr.winner === 0 ? 1 : 0]?.name ?? 'P2',
                toName:   pl[pr.winner]?.name ?? 'P1',
                amount:   press.stake,
              }] : [];
              return { press, result: pr, txs: pressTxs };
            });
          }

          setSettlementData({ transactions: txs, players: gameConfig.players, pressResults });
          setShowSettlement(true);
        }
      }

      // Auto-post to activity feed — fire and forget, never block round save
      try {
        await supabase.from('activity_feed').insert({
          user_id:  uid,
          type:     'round_logged',
          round_id: newRoundId,
          content: {
            course_name:      course.name,
            pop_score:        pop,
            duration_minutes: durationMinutes,
            holes,
            transport,
            players,
            verified:         false,
          },
        });
      } catch (e) { /* silent fail */ }

      AccessibilityInfo.announceForAccessibility(`Your Clocked Score is ${pop.toFixed(1)}`);
      navigation.navigate('Share', {
        popScore:          pop,
        courseName:        course.name,
        date:              dateStr,
        holes,
        transport,
        durationMinutes,
        verificationLevel: 'self_reported',
        grossScore:        holeScores.reduce((s, sc) => s + sc, 0),
        holeScores:        holeScores,
        holePars:          holePars,
        isPar3,
        avgCourseMinutes:  courseAvgMinutes ?? null,
      });
    } catch (e) {
      setPhase(PHASE.PACE); // allow retry
      Alert.alert('Error', 'Could not save your round. Please try again.');
    }
  };

  // ── Step indicator (phases 0-2) ─────────────────────────────────────────────
  const stepLabels = ['Course', 'Tee Time', 'Details'];

  return (
    <SafeAreaView style={s.container}>
      {/* Header — shown during setup phases */}
      {phase <= PHASE.DETAILS && (
        <View style={s.header}>
          <TouchableOpacity onPress={() => {
            if (phase === PHASE.COURSE) navigation.goBack();
            else setPhase(p => p - 1);
          }} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>LIVE ROUND</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      {/* Scorecard header back button */}
      {phase === PHASE.SCORECARD && (
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => Alert.alert('Abandon Round?', 'Your progress will be lost.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: () => { cancelInteractionLadder().catch(() => {}); AsyncStorage.removeItem(ASYNC_KEY).catch(() => {}); AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {}); navigation.goBack(); } },
            ])}
            style={s.backBtn}
            accessibilityLabel="Abandon round"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color="#C9A84C" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>LIVE ROUND</Text>
          <TouchableOpacity
            style={[s.gamesBtn, gameConfig && s.gamesBtnActive]}
            onPress={() => setShowGameModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="dice-outline" size={16} color={gameConfig ? '#090F0A' : '#C9A84C'} />
            <Text style={[s.gamesBtnTxt, gameConfig && s.gamesBtnTxtActive]}>
              {gameConfig ? gameConfig.type.split(' ')[0].toUpperCase() : 'GAMES'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Game setup modal */}
      <GameSetupModal
        visible={showGameModal}
        onClose={() => setShowGameModal(false)}
        holes={holes}
        defaultPlayerName={profile?.username ?? profile?.full_name ?? 'You'}
        onConfirm={(config) => {
          const holeCount = parseInt(holes, 10);
          const n = config.players.length;
          setGameConfig(config);
          setPresses([]);
          // Initialize other-player scores to null (unscored)
          setOtherScores(Array(n - 1).fill(null).map(() => Array(holeCount).fill(null)));
        }}
      />

      {/* Settlement modal */}
      <SettlementModal
        visible={showSettlement}
        onClose={() => setShowSettlement(false)}
        transactions={settlementData.transactions}
        players={settlementData.players}
        gameType={gameConfig?.type ?? ''}
        pressResults={settlementData.pressResults}
      />

      {/* Pace header */}
      {(phase === PHASE.EDIT_TIMES || phase === PHASE.PACE) && (
        <View style={s.header}>
          <View style={{ width: 40 }} />
          <Text style={s.headerTitle}>FINISH ROUND</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      {/* Step dots — setup phases only */}
      {phase <= PHASE.DETAILS && (
        <View style={s.dotsRow}>
          {stepLabels.map((_, i) => (
            <View key={i} style={[s.dot, i === phase && s.dotActive, i < phase && s.dotDone]} />
          ))}
        </View>
      )}

      {/* Content */}
      {phase === PHASE.SAVING ? (
        <View style={s.savingState}>
          <ActivityIndicator color="#C9A84C" size="large" />
          <Text style={s.savingText}>Saving your round…</Text>
        </View>
      ) : phase === PHASE.READY ? (
        /* ── Start Round screen ── */
        <View style={s.readyContainer}>
          <Text style={s.readyCourseName}>{course?.name ?? ''}</Text>
          <Text style={s.readyMeta}>
            {teeTime}  ·  {holes} holes  ·  {transport}  ·  {players}P
          </Text>

          <View style={s.readyBtns}>
            <TouchableOpacity style={s.startBtn} onPress={handleStartRound} activeOpacity={0.85}>
              <Ionicons name="play-circle" size={26} color="#090F0A" style={{ marginRight: 10 }} />
              <Text style={s.startBtnTxt}>START ROUND</Text>
            </TouchableOpacity>
            <Text style={s.startBtnSub}>Your timer starts when you tap</Text>

            <TouchableOpacity
              style={[s.gamePickBtn, gameConfig && s.gamePickBtnActive]}
              onPress={() => setShowGameModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={gameConfig ? 'checkmark-circle' : 'trophy-outline'}
                size={18}
                color={gameConfig ? '#7DC87A' : '#C9A84C'}
                style={{ marginRight: 8 }}
              />
              <Text style={[s.gamePickBtnTxt, gameConfig && s.gamePickBtnTxtActive]}>
                {gameConfig ? `${gameConfig.type} — Ready` : 'PLAY A GAME'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => setPhase((courseTees?.length ?? 0) > 0 ? PHASE.TEE_SELECT : PHASE.DETAILS)}
            activeOpacity={0.7}
            style={{ marginTop: 16 }}
          >
            <Text style={s.backLink}>← Edit details</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            s.content,
            phase === PHASE.SCORECARD && { flexGrow: 1, paddingHorizontal: 0, paddingBottom: 0 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {phase === PHASE.COURSE && <StepCourse onNext={handleCourseSelected} />}

          {phase === PHASE.TEE_TIME && (
            <StepTeeTime
              teeTime={teeTime}
              setTeeTime={setTeeTime}
              onNext={handleTeeTimeNext}
              onBack={() => setPhase(PHASE.COURSE)}
            />
          )}

          {phase === PHASE.DETAILS && (
            <StepDetails
              holes={holes} setHoles={setHoles}
              transport={transport} setTransport={setTransport}
              players={players} setPlayers={setPlayers}
              onNext={handleDetailsNext}
              onBack={() => setPhase(PHASE.TEE_TIME)}
            />
          )}

          {phase === PHASE.TEE_SELECT && (
            <StepTeePicker
              courseTees={courseTees}
              holes={holes}
              selectedTeeIdx={selectedTeeIdx}
              onSelectTee={setSelectedTeeIdx}
              selectedNine={selectedNine}
              onSelectNine={setSelectedNine}
              onNext={() => setPhase(PHASE.READY)}
              onBack={() => setPhase(PHASE.DETAILS)}
            />
          )}

          {phase === PHASE.SCORECARD && (
            <Scorecard
              courseName={course?.name ?? ''}
              holes={holes}
              startTs={startTs}
              pausedAt={pausedAt}
              currentHole={currentHole}
              setCurrentHole={setCurrentHole}
              scores={scores}
              setScores={setScores}
              pars={pars}
              setPars={setPars}
              onFinish={handleFinishScorecard}
              onLockedPress={PRO_ENABLED ? () => navigation.navigate('Paywall') : undefined}
              gameConfig={gameConfig}
              otherPlayerScores={otherPlayerScores}
              setOtherPlayerScores={setOtherScores}
              presses={presses}
              onAddPress={(cfg) => {
                const newPress = {
                  id: String(Date.now()),
                  startHole: currentHole + 1, // first hole counted — press does NOT count the hole it was initiated on
                  endHole: cfg.endHole,
                  scope: cfg.scope,
                  stake: cfg.stake,
                  initiator: 0,
                  createdAtHole: currentHole,
                };
                setPresses(prev => [...prev, newPress]);
              }}
            />
          )}

          {phase === PHASE.EDIT_TIMES && (
            <EditTimesStep
              startTs={startTs}
              onConfirm={(ts) => { setCustomFinishTs(ts); setPhase(PHASE.PACE); }}
            />
          )}

          {phase === PHASE.PACE && (
            <PaceStep holes={holes} onSelect={handlePaceSelected} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#090F0A' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  backArrow:   { fontSize: 22, color: '#C9A84C' },
  headerTitle: { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  dotsRow:     { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 12 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A2E1C' },
  dotActive:   { backgroundColor: '#C9A84C', width: 20 },
  dotDone:     { backgroundColor: '#4A7A50' },
  content:     { paddingHorizontal: 20, paddingBottom: 40 },

  // Setup shared
  stepTitle:   { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 6, marginTop: 8 },
  stepSub:     { fontSize: 13, color: '#B8A882', marginBottom: 24, lineHeight: 19 },
  searchInput: { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 14, padding: 14, color: '#F5EDD8', fontSize: 15, marginBottom: 12 },
  courseRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, marginBottom: 8, gap: 12 },
  courseRowSelected: { borderColor: '#C9A84C88' },
  courseName:  { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  courseNameSelected: { color: '#C9A84C' },
  courseSub:   { fontSize: 11, color: '#B8A882', marginTop: 2 },
  backLink:    { fontSize: 13, color: '#C9A84C', textAlign: 'center' },

  // Tee time picker
  teePickerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 36 },
  teeAdj:        { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  teeAdjText:    { fontSize: 24, color: '#C9A84C', fontWeight: '300' },
  teeValue:      { fontSize: 32, fontWeight: '300', color: '#F5EDD8', letterSpacing: 1, minWidth: 120, textAlign: 'center' },

  // Details
  sectionQ:    { fontSize: 12, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5, marginTop: 20, marginBottom: 8 },
  btnGroup:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupBtn:    { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A33', backgroundColor: '#0D1A0F' },
  groupBtnOn:  { backgroundColor: '#1E4825', borderColor: '#C9A84C' },
  groupBtnTxt: { fontSize: 13, color: '#B8A882', fontWeight: '500' },
  groupBtnTxtOn: { color: '#C9A84C', fontWeight: '700' },

  // Primary button
  primaryBtn:  { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  primaryBtnDisabled: { backgroundColor: '#C9A84C44' },
  primaryBtnText: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },

  // Scorecard
  scHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A18' },
  scCourse:    { fontSize: 15, fontWeight: '600', color: '#F5EDD8', marginBottom: 3 },
  scElapsed:   { fontSize: 11, color: '#B8A882', letterSpacing: 0.5 },
  scVsParBig:  { alignItems: 'center' },
  scVsParNum:  { fontSize: 28, fontWeight: '700' },
  scVsParLabel:{ fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 1.5, marginTop: 1 },

  holeHeader:  { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  holeNum:     { fontSize: 36, fontFamily: 'Georgia', color: '#C9A84C', fontWeight: '400' },

  // Par selector
  parSelectorWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  parSelectorLabel:{ fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 8 },
  parSelectorRow:  { flexDirection: 'row', gap: 10 },
  parPill:         { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A33', backgroundColor: '#0D1A0F', alignItems: 'center' },
  parPillOn:       { backgroundColor: '#1E4825', borderColor: '#C9A84C', borderWidth: 2 },
  parPillTxt:      { fontSize: 15, fontWeight: '600', color: '#7A6E58' },
  parPillTxtOn:    { color: '#C9A84C' },

  scoreInputArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 20, gap: 24 },
  adjBtn:      { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  adjBtnTxt:   { fontSize: 32, color: '#C9A84C', fontWeight: '300', lineHeight: 36 },
  scoreDisplay:{ alignItems: 'center', flex: 1 },
  scoreBig:    { fontSize: 72, fontWeight: '200', lineHeight: 76 },
  scoreRelative:   { fontSize: 20, fontWeight: '700', marginTop: -4 },
  shotNameTxt:     { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },

  pastHolesScroll: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  pastHoleChip:    { alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C22', paddingHorizontal: 12, paddingVertical: 8, minWidth: 44 },
  pastHoleChipActive: { borderColor: '#C9A84C66', backgroundColor: '#1A2E1C' },
  pastHoleNum: { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginBottom: 4 },
  pastHoleScore:   { fontSize: 18, fontWeight: '300' },

  bottomNav:   { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#C9A84C18' },
  navBtn:      { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center' },
  navBtnDisabled: { borderColor: '#1A2E1C', opacity: 0.4 },
  navBtnTxt:   { fontSize: 12, fontWeight: '600', color: '#C9A84C' },
  navBtnTxtDisabled: { color: '#3A4A3A' },
  navBtnPrimary:    { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#C9A84C', alignItems: 'center' },
  navBtnPrimaryTxt: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1 },

  // Pace
  paceRow:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 10, gap: 12 },
  paceDot:     { width: 10, height: 10, borderRadius: 5 },
  paceTxt:     { fontSize: 14, fontWeight: '500', flex: 1 },

  // Saving
  savingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  savingText:  { fontSize: 14, color: '#B8A882' },

  // Start Round (READY phase)
  readyContainer:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 40 },
  readyCourseName: { fontSize: 28, fontFamily: 'Georgia', color: '#C9A84C', textAlign: 'center', marginBottom: 10, lineHeight: 36 },
  readyMeta:       { fontSize: 13, color: '#B8A882', letterSpacing: 0.5, marginBottom: 52 },
  readyBtns:       { width: '100%', alignItems: 'center', gap: 0 },
  startBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E4825', borderWidth: 2, borderColor: '#7DC87A', borderRadius: 18, paddingVertical: 20, width: '100%' },
  startBtnTxt:     { fontSize: 15, fontWeight: '700', color: '#7DC87A', letterSpacing: 3 },
  startBtnSub:     { fontSize: 11, color: '#7A6E58', marginTop: 10, marginBottom: 24 },
  gamePickBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9A84C55', borderRadius: 14, paddingVertical: 14, width: '100%' },
  gamePickBtnActive: { borderColor: '#7DC87A55', backgroundColor: 'rgba(125,200,122,0.06)' },
  gamePickBtnTxt:  { fontSize: 12, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  gamePickBtnTxtActive: { color: '#7DC87A' },

  // Games button in scorecard header
  gamesBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#C9A84C55' },
  gamesBtnActive:  { backgroundColor: '#C9A84C', borderColor: '#C9A84C' },
  gamesBtnTxt:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1 },
  gamesBtnTxtActive: { color: '#090F0A' },
});

// ─── Game Setup Modal styles ──────────────────────────────────────────────────
const gm = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#090F0A', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#C9A84C22', maxHeight: '90%', minHeight: '60%' },
  sheetHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  closeBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sheetTitle:   { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  dots:         { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 16 },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A2E1C' },
  dotActive:    { backgroundColor: '#C9A84C', width: 20 },
  dotDone:      { backgroundColor: '#4A7A50' },
  stepContent:  { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  stepNote:     { fontSize: 12, color: '#B8A882', marginBottom: 8 },

  // Type cards
  typeCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C22', padding: 12, gap: 12 },
  typeCardOn:   { borderColor: '#C9A84C', backgroundColor: '#1A2E1C' },
  typeIcon:     { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  typeIconOn:   { backgroundColor: '#C9A84C' },
  typeName:     { fontSize: 14, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  typeNameOn:   { color: '#C9A84C' },
  typeDesc:     { fontSize: 11, color: '#B8A882', lineHeight: 16 },
  typePlayers:  { fontSize: 10, fontWeight: '700', color: '#7A6E58', letterSpacing: 0.5 },

  // Player entry
  playerRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  playerNum:    { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  playerNumTxt: { fontSize: 12, fontWeight: '700', color: '#C9A84C' },
  playerInput:  { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#F5EDD8', fontSize: 14 },
  hcpInput:     { width: 60 },
  removeBtn:    { padding: 4 },
  addPlayerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, alignSelf: 'flex-start' },
  addPlayerTxt: { fontSize: 13, color: '#C9A84C', fontWeight: '600' },

  // Settings
  settingLabel: { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 6, marginTop: 8 },
  dollarPill:   { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C33', backgroundColor: '#0D1A0F' },
  dollarPillOn: { backgroundColor: '#1E4825', borderColor: '#C9A84C' },
  dollarTxt:    { fontSize: 14, fontWeight: '600', color: '#B8A882' },
  dollarTxtOn:  { color: '#C9A84C' },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C22', padding: 14 },
  toggleDesc:   { fontSize: 13, color: '#B8A882', flex: 1 },
  toggle:       { width: 44, height: 26, borderRadius: 13, backgroundColor: '#1A2E1C', borderWidth: 1, borderColor: '#C9A84C33', justifyContent: 'center', paddingHorizontal: 3 },
  toggleOn:     { backgroundColor: '#C9A84C', borderColor: '#C9A84C' },
  toggleThumb:  { width: 20, height: 20, borderRadius: 10, backgroundColor: '#3A4A3A' },
  toggleThumbOn:{ backgroundColor: '#090F0A', alignSelf: 'flex-end' },
  summaryCard:  { backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C22', padding: 14, marginTop: 12, gap: 6 },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 4 },
  summaryRow:   { fontSize: 13, color: '#B8A882' },
  summaryKey:   { color: '#7A6E58', fontWeight: '600' },
  summaryVal:   { color: '#F5EDD8' },

  // Buttons
  btnRow:       { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#C9A84C18' },
  primaryBtn:   { flex: 1, backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnOff:{ backgroundColor: '#C9A84C44' },
  primaryBtnTxt:{ fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  secondaryBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#C9A84C33' },
  secondaryBtnTxt: { fontSize: 12, fontWeight: '600', color: '#C9A84C' },
});

// ─── Press Modal styles ───────────────────────────────────────────────────────
const pm = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, width: '100%', borderWidth: 1, borderColor: '#C9A84C44' },
  title:       { fontSize: 12, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, textAlign: 'center', marginBottom: 4 },
  sub:         { fontSize: 13, color: '#7A6E58', textAlign: 'center', marginBottom: 20 },
  label:       { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 10, marginTop: 4 },
  scopeGroup:  { gap: 8, marginBottom: 16 },
  scopeBtn:    { borderWidth: 1, borderColor: '#C9A84C33', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  scopeBtnOn:  { backgroundColor: '#C9A84C22', borderColor: '#C9A84C' },
  scopeTxt:    { fontSize: 13, color: '#7A6E58' },
  scopeTxtOn:  { color: '#F5EDD8', fontWeight: '600' },
  stakeRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  stakeChip:   { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#C9A84C33', backgroundColor: '#0D1A0F' },
  stakeChipOn: { backgroundColor: '#C9A84C', borderColor: '#C9A84C' },
  stakeTxt:    { fontSize: 14, color: '#B8A882', fontWeight: '500' },
  stakeTxtOn:  { color: '#090F0A', fontWeight: '700' },
  confirmBtn:  { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmTxt:  { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1 },
  cancelTxt:   { fontSize: 13, color: '#7A6E58' },
});

// ─── Settlement Modal styles ──────────────────────────────────────────────────
const sm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:       { width: '100%', backgroundColor: '#0D1A0F', borderRadius: 20, borderWidth: 1, borderColor: '#C9A84C33', padding: 28 },
  title:      { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4, textAlign: 'center', marginBottom: 4 },
  gameType:   { fontSize: 20, fontWeight: '600', color: '#F5EDD8', textAlign: 'center', marginBottom: 20 },
  noDebt:     { fontSize: 14, color: '#B8A882', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  txList:     { marginBottom: 20 },
  txHeader:   { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 12 },
  txRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' },
  txFrom:     { fontSize: 14, fontWeight: '600', color: '#C07A6A' },
  txArrow:    { fontSize: 13, color: '#7A6E58' },
  txTo:       { fontSize: 14, fontWeight: '600', color: '#7DC87A' },
  txAmt:      { fontSize: 14, fontWeight: '700', color: '#C9A84C' },
  doneBtn:      { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  doneBtnTxt:   { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  pressSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#C9A84C22', paddingTop: 12 },
  pressBlock:   { marginBottom: 12 },
  pressLabel:   { fontSize: 12, fontWeight: '600', color: '#B8A882', marginBottom: 4 },
  pressNoDebt:  { fontSize: 12, color: '#7A6E58', marginBottom: 4 },
});

// ─── Tee Picker styles ────────────────────────────────────────────────────────
const tp = StyleSheet.create({
  teeRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 12 },
  teeRowOn:    { borderColor: '#C9A84C88', backgroundColor: '#1A1F14' },
  teeColorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#FFFFFF22' },
  teeName:     { fontSize: 14, fontWeight: '500', color: '#B8A882', marginBottom: 2 },
  teeNameOn:   { color: '#C9A84C', fontWeight: '700' },
  teeMeta:     { fontSize: 11, color: '#7A6E58' },
});

// ─── Game Panel styles ────────────────────────────────────────────────────────
const gp = StyleSheet.create({
  container:       { marginHorizontal: 20, marginTop: 8, backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C33', overflow: 'hidden' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  headerLeft:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:     { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  collapsedSummary:{ fontSize: 11, color: '#B8A882', paddingHorizontal: 14, paddingBottom: 10 },

  playerScores:    { borderTopWidth: 1, borderTopColor: '#C9A84C18', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  playerRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerName:      { fontSize: 13, color: '#F5EDD8', fontWeight: '500', flex: 1 },
  adjRow:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adjBtn:          { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1A2E1C', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  adjTxt:          { fontSize: 18, color: '#C9A84C', fontWeight: '300', lineHeight: 22 },
  scoreVal:        { fontSize: 18, fontWeight: '600', color: '#F5EDD8', minWidth: 26, textAlign: 'center' },

  standings:       { borderTopWidth: 1, borderTopColor: '#C9A84C18', paddingHorizontal: 14, paddingVertical: 10 },
  standingsLabel:  { fontSize: 8, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 4 },
  standingsText:   { fontSize: 12, color: '#B8A882', lineHeight: 18 },

  statusBig:      { fontSize: 16, fontWeight: '700', color: '#F5EDD8' },
  statusRow:      { gap: 4 },
  statusDetail:   { fontSize: 11, color: '#7A6E58', marginTop: 2 },
  nassauGrid:     { flexDirection: 'row', justifyContent: 'space-between' },
  nassauSeg:      { alignItems: 'center', flex: 1 },
  nassauSegLabel: { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 1.5, marginBottom: 4 },
  nassauSegValue: { fontSize: 13, fontWeight: '700', color: '#F5EDD8' },
  nassauTie:      { color: '#B8A882' },
  nassauDim:      { color: '#7A6E58' },

  pressSection:       { borderTopWidth: 1, borderTopColor: '#C9A84C18', marginTop: 8, paddingTop: 8 },
  pressSectionLabel:  { fontSize: 8, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 6 },
  pressRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pressRange:         { fontSize: 11, color: '#B8A882', fontWeight: '500' },
  pressStake:         { fontSize: 11, color: '#7A6E58' },
  pressStatus:        { fontSize: 11, fontWeight: '700', color: '#F5EDD8' },
  pressUp:            { color: '#7DC87A' },
  pressDown:          { color: '#C07A6A' },
  pressBtn:           { marginTop: 10, marginHorizontal: 14, marginBottom: 4, borderWidth: 1, borderColor: '#C9A84C66', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  pressBtnTxt:        { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
});
