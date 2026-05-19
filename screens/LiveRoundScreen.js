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

import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { searchCourses } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification, sendRankMoveNotification, checkAndSendMilestone, scheduleInactivityReminder } from '../lib/notifications';
import * as Notifications from 'expo-notifications';
import CourseAvatar from '../components/CourseAvatar';
import { updateHandicapAfterRound } from '../lib/handicap';
import { GAME_TYPES, calcGame, gameResultToUnitScores, calcSettlement } from '../lib/gameEngines';
import { isFraudulent, calcPOPScoreCore, recalculateProfilePopScore, isPar3Course, getCoursePar } from '../lib/popScore';

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

function elapsedStr(startTs) {
  const diff = Math.max(0, Date.now() - startTs);
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

function GameSetupModal({ visible, onClose, onConfirm, defaultPlayerName, defaultHandicap, holes }) {
  const [step, setStep]             = useState(0); // 0=type, 1=players, 2=settings
  const [selectedType, setType]     = useState(null);
  const [players, setPlayers]       = useState([]);
  const [dollarIdx, setDollarIdx]   = useState(1); // $1 default
  const [useHandicap, setUseHcp]    = useState(false);

  const gameInfo = GAME_TYPES.find(g => g.id === selectedType);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setStep(0); setType(null); setDollarIdx(1); setUseHcp(false);
      setPlayers([
        { name: defaultPlayerName || 'You', handicap: String(defaultHandicap ?? 0) },
        { name: '', handicap: '0' },
      ]);
    }
  }, [visible]);

  const addPlayer = () => {
    if (players.length < (gameInfo?.maxPlayers ?? 8)) {
      setPlayers(p => [...p, { name: '', handicap: '0' }]);
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
    const finalPlayers = players.map(p => ({
      name:     p.name.trim(),
      handicap: parseInt(p.handicap, 10) || 0,
    }));
    onConfirm({
      type:         selectedType,
      players:      finalPlayers,
      dollarPerUnit: parseInt(DOLLAR_OPTIONS[dollarIdx].replace('$', ''), 10),
      useHandicap,
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
                    <TextInput
                      style={[gm.playerInput, gm.hcpInput]}
                      placeholder="Hcp"
                      placeholderTextColor="#B8A88266"
                      value={pl.handicap}
                      onChangeText={v => updatePlayer(i, 'handicap', v)}
                      keyboardType="numeric"
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

                <Text style={gm.settingLabel}>USE HANDICAP</Text>
                <View style={gm.toggleRow}>
                  <Text style={gm.toggleDesc}>Apply handicap strokes to adjust scores</Text>
                  <TouchableOpacity
                    style={[gm.toggle, useHandicap && gm.toggleOn]}
                    onPress={() => setUseHcp(v => !v)}
                    activeOpacity={0.8}
                  >
                    <View style={[gm.toggleThumb, useHandicap && gm.toggleThumbOn]} />
                  </TouchableOpacity>
                </View>

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
                  <Text style={gm.summaryRow}>
                    <Text style={gm.summaryKey}>Handicap: </Text>
                    <Text style={gm.summaryVal}>{useHandicap ? 'On' : 'Off'}</Text>
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

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
function SettlementModal({ visible, onClose, transactions, players, gameType }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={sm.overlay}>
        <View style={sm.card}>
          <Text style={sm.title}>GAME OVER</Text>
          <Text style={sm.gameType}>{gameType}</Text>

          {transactions.length === 0 ? (
            <Text style={sm.noDebt}>All square — no money changes hands.</Text>
          ) : (
            <View style={sm.txList}>
              <Text style={sm.txHeader}>SETTLEMENT</Text>
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

          <TouchableOpacity style={sm.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={sm.doneBtnTxt}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Game results panel (shown inside Scorecard when game is active) ──────────
function GamePanel({ gameConfig, allPlayerScores, pars, currentHole, onUpdateScore }) {
  const [collapsed, setCollapsed] = useState(false);
  const { type, players, useHandicap } = gameConfig;
  const n = players.length;

  const completedPars = pars.slice(0, currentHole - 1);
  const completedScores = allPlayerScores.map(ps => ps.slice(0, currentHole - 1));
  const result = completedPars.length > 0
    ? calcGame(type, completedScores, completedPars, players, useHandicap)
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
        const seg = (val) => val == null ? 'Tie' : players[val].name;
        return `F: ${seg(result.front)}  B: ${seg(result.back)}  T: ${seg(result.total)}`;
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
            <Text style={gp.standingsText} numberOfLines={2}>{summaryLine()}</Text>
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
  courseName, holes, startTs,
  currentHole, setCurrentHole,
  scores, setScores,
  pars, setPars,
  onFinish,
  // Game props (optional)
  gameConfig,
  otherPlayerScores,
  setOtherPlayerScores,
}) {
  const totalHoles     = parseInt(holes, 10);
  const holeIdx        = currentHole - 1;
  const currentScore   = scores[holeIdx];
  const currentPar     = pars[holeIdx] ?? 4;
  const [elapsed, setElapsed]         = useState('');
  const [maxVisited, setMaxVisited]   = useState(1); // highest hole number reached

  // Live timer
  useEffect(() => {
    setElapsed(elapsedStr(startTs));
    const interval = setInterval(() => setElapsed(elapsedStr(startTs)), 1000);
    return () => clearInterval(interval);
  }, [startTs]);

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
const PHASE = { COURSE: 0, TEE_TIME: 1, DETAILS: 2, READY: 3, SCORECARD: 4, PACE: 5, SAVING: 6 };

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

  // Game state
  const [gameConfig, setGameConfig]           = useState(null); // null = no active game
  const [otherPlayerScores, setOtherScores]   = useState([]); // [playerIdx-1][holeIdx]
  const [showGameModal, setShowGameModal]      = useState(false);
  const [showSettlement, setShowSettlement]   = useState(false);
  const [settlementData, setSettlementData]   = useState({ transactions: [], players: [] });

  const handleCourseSelected = (c) => {
    setCourse(c);
    setIsPar3(isPar3Course(c));
    setPhase(PHASE.TEE_TIME);
  };

  const handleTeeTimeNext = () => setPhase(PHASE.DETAILS);

  const handleDetailsNext = () => {
    setPhase(PHASE.READY);
  };

  const handleStartRound = () => {
    const ts = Date.now();
    setStartTs(ts);
    AsyncStorage.setItem(ASYNC_KEY, String(ts)).catch(() => {});
    setCurrentHole(1);
    const holeCount = parseInt(holes, 10);
    const defaultPar = isPar3 ? 3 : 4;
    setPars(Array(holeCount).fill(defaultPar));
    setScores(Array(holeCount).fill(defaultPar));
    // Reinitialize other-player score grids in case game was set up on this screen
    if (gameConfig) {
      const n = gameConfig.players.length;
      setOtherScores(Array(n - 1).fill(null).map(() => Array(holeCount).fill(null)));
    }
    setPhase(PHASE.SCORECARD);
  };

  const handleFinishScorecard = () => setPhase(PHASE.PACE);

  const handlePaceSelected = async (paceDelay) => {
    setPhase(PHASE.SAVING);
    try {
      const uid        = user?.id;
      if (!uid) throw new Error('No user');

      const finishTs   = Date.now();
      const finishTime = nowTimeStr();
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
          ? 'This round has been flagged as potentially invalid. Your account is currently under review. Contact hello@playthrugolf.app with questions.'
          : 'This round has been flagged as potentially invalid and is pending review.');
        AsyncStorage.removeItem(ASYNC_KEY).catch(() => {});
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

      // Calculate WHS handicap differential and update handicap index
      if (newRoundId) {
        const adjustedGrossScore = holeScores.reduce((s, sc) => s + sc, 0);
        await updateHandicapAfterRound(uid, newRoundId, adjustedGrossScore);
      }

      // Update course stats
      const { data: courseRow } = await supabase.from('courses').select('id').eq('name', course.name).maybeSingle();
      if (courseRow) {
        const { data: courseRounds } = await supabase.from('rounds').select('pop_score, duration_minutes').eq('course_name', course.name).eq('flagged', false);
        if (courseRounds && courseRounds.length > 0) {
          const scored = courseRounds.filter(r => r.pop_score != null);
          const avgPop = scored.length > 0 ? parseFloat((scored.reduce((s, r) => s + r.pop_score, 0) / scored.length).toFixed(2)) : null;
          const timed = courseRounds.filter(r => r.duration_minutes != null);
          const avgTime = timed.length > 0 ? parseFloat((timed.reduce((s, r) => s + r.duration_minutes, 0) / timed.length).toFixed(1)) : null;
          const courseUpdate = { total_rounds: courseRounds.length };
          if (avgPop != null) courseUpdate.pop_score = avgPop;
          if (avgTime != null) courseUpdate.avg_time = avgTime;
          await supabase.from('courses').update(courseUpdate).eq('id', courseRow.id);
        }
      }

      // Notify followers
      const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', uid);
      if (followers && followers.length > 0) {
        const { data: followerProfiles } = await supabase
          .from('profiles').select('push_token').in('id', followers.map(f => f.follower_id)).not('push_token', 'is', null);
        const name = profile?.username ? `@${profile.username}` : 'A friend';
        const body = `${name} just finished a live round at ${course.name} — POPScore ${pop.toFixed(1)}.`;
        for (const fp of (followerProfiles || [])) {
          if (fp.push_token) await sendLocalNotification('Friend Activity', body);
        }
      }

      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your round has been scored!',
          body: 'Tap to see your updated POPScore →',
        },
        trigger: { seconds: 6300, repeats: false },
      }).catch(() => {});

      // Clean up AsyncStorage key
      AsyncStorage.removeItem(ASYNC_KEY).catch(() => {});

      // Show game settlement before navigating to share
      if (gameConfig) {
        const totalHolesFinal = parseInt(holes, 10);
        const allScores = [scores.slice(0, totalHolesFinal), ...otherPlayerScores.map(ps => ps.slice(0, totalHolesFinal))];
        const result = calcGame(gameConfig.type, allScores, pars.slice(0, totalHolesFinal), gameConfig.players, gameConfig.useHandicap);
        if (result) {
          const unitScores = gameResultToUnitScores(gameConfig.type, result, gameConfig.players.length);
          const txs = calcSettlement(unitScores, gameConfig.dollarPerUnit, gameConfig.players);
          setSettlementData({ transactions: txs, players: gameConfig.players });
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
          }} style={s.backBtn}>
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
              { text: 'Leave', style: 'destructive', onPress: () => { AsyncStorage.removeItem(ASYNC_KEY).catch(() => {}); navigation.goBack(); } },
            ])}
            style={s.backBtn}
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
        defaultHandicap={profile?.handicap ?? 0}
        onConfirm={(config) => {
          const holeCount = parseInt(holes, 10);
          const n = config.players.length;
          setGameConfig(config);
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
      />

      {/* Pace header */}
      {phase === PHASE.PACE && (
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

          <TouchableOpacity onPress={() => setPhase(PHASE.DETAILS)} activeOpacity={0.7} style={{ marginTop: 16 }}>
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

          {phase === PHASE.SCORECARD && (
            <Scorecard
              courseName={course?.name ?? ''}
              holes={holes}
              startTs={startTs}
              currentHole={currentHole}
              setCurrentHole={setCurrentHole}
              scores={scores}
              setScores={setScores}
              pars={pars}
              setPars={setPars}
              onFinish={handleFinishScorecard}
              gameConfig={gameConfig}
              otherPlayerScores={otherPlayerScores}
              setOtherPlayerScores={setOtherScores}
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
  doneBtn:    { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  doneBtnTxt: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
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
});
