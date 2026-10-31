import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Platform,
  KeyboardAvoidingView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { sanitizeSearchText } from '../lib/profileColumns';
import { CLOCKED_LAST_TRANSPORT_KEY, CLOCKED_DEFAULT_TRANSPORT } from '../lib/clockedRoundConstants';
import { searchCourses } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import CourseAvatar from '../components/CourseAvatar';
import { fetchClockedConfig } from '../lib/clockedConfig';
import { isPar3Course } from '../lib/popScore';
import InitialsAvatar from '../components/InitialsAvatar';
import Button from '../components/Button';
import { COLOR, RADIUS } from '../lib/theme';

// ─── Tee colors (reused from LiveRoundScreen pattern) ────────────────────────
const TEE_COLORS = {
  black: '#2A2A2A', blue: '#3B6FB6', white: '#E8E8E8', gold: COLOR.gold,
  red: '#C07A6A', green: '#4A7A50', yellow: '#D4B86A', silver: '#A8A8A8',
  bronze: '#B87333', orange: '#D4844A',
};

const PHASE = { COURSE: 0, HOLES: 1, TEE: 2, MODE: 3, PLAYERS: 4, TRANSPORT: 5 };
// Dots are built from the steps this round will actually show (see visibleSteps).

export default function ClockedSetupScreen({ navigation }) {
  const { profile, user } = useAuth();

  // ── State ──
  const [phase, setPhase]             = useState(PHASE.COURSE);
  const [course, setCourse]           = useState(null);
  const [holes, setHoles]             = useState('9');
  const [courseTees, setCourseTees]   = useState(null);
  const [selectedTeeIdx, setSelectedTeeIdx] = useState(null);
  const [selectedNine, setSelectedNine]     = useState('front');
  const [mode, setMode]               = useState(1); // 1=solo, 2/3/4
  // Pre-selected so CONTINUE is live the moment the step appears: last-used
  // transport if we have one, otherwise Cart. The user can still change it.
  const [transport, setTransport]     = useState(CLOCKED_DEFAULT_TRANSPORT);
  const transportTouched = useRef(false);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CLOCKED_LAST_TRANSPORT_KEY).then(saved => {
      if (cancelled || transportTouched.current) return;
      if (saved === 'Walking' || saved === 'Cart') setTransport(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const chooseTransport = (t) => { transportTouched.current = true; setTransport(t); };
  // Defaults to the league picked during onboarding, if set — still fully
  // changeable per round.
  const [difficulty, setDifficulty]   = useState(() => profile?.preferred_difficulty ?? 'intermediate');
  const [players, setPlayers]         = useState([]);
  const [certData, setCertData]       = useState(null); // { timePars, holeInfo }

  // Pre-fetch remote config on mount
  useEffect(() => { fetchClockedConfig(); }, []);

  // ── Course search ──
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await searchCourses(query);
      setResults(r);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── Derived ──
  const selectedTee = (courseTees && selectedTeeIdx != null) ? courseTees[selectedTeeIdx] : null;
  const teeHoles = selectedTee?.holes ?? course?.hole_data ?? null;
  const holeCount = parseInt(holes, 10);
  // Last-resort par when a hole has no measured data. Par-3/executive
  // courses (flagged via is_par3 or name pattern) default to 3, everything
  // else to 4 — mirrors LiveRoundScreen's logic so Clocked never claims a
  // par-3 short course plays to par 4 just because granular hole data is
  // missing.
  const defaultPar = isPar3Course(course) ? 3 : 4;

  // ── Handlers ──
  const handleCourseSelected = async (c) => {
    setCourse(c);
    setCourseTees(null);
    setSelectedTeeIdx(null);
    setSelectedNine('front');
    setCertData(null);
    let hasTees = false;
    if (c.id) {
      try {
        const { data } = await supabase.from('courses').select('raw_data').eq('id', c.id).maybeSingle();
        const maleTees = data?.raw_data?.tees?.male;
        if (maleTees?.length > 0) {
          setCourseTees(maleTees);
          setSelectedTeeIdx(Math.floor(maleTees.length / 2));
          hasTees = true;
        }
      } catch { /* silent */ }
    }
    setPhase(hasTees ? PHASE.TEE : PHASE.MODE);
    if (c.id) {

      // Fetch certified time pars
      try {
        const { data: certRows } = await supabase
          .from('course_time_pars')
          .select('hole_number, par, yardage, time_pars')
          .eq('course_id', c.id)
          .eq('certified', true);
        if (certRows?.length > 0) {
          setCertData({
            timePars: Object.fromEntries(certRows.map(r => [r.hole_number, r.time_pars])),
            holeInfo: Object.fromEntries(certRows.map(r => [r.hole_number, { par: r.par, yardage: r.yardage }])),
          });
        }
      } catch { /* silent — round proceeds on tier fallback */ }
    }
  };


  const handleTeeNext = () => setPhase(PHASE.MODE);

  // Player search state
  const [playerSearchIdx, setPlayerSearchIdx] = useState(null);
  const [playerQuery, setPlayerQuery]         = useState('');
  const [playerResults, setPlayerResults]     = useState([]);

  useEffect(() => {
    if (!playerQuery.trim() || playerQuery.trim().length < 2) { setPlayerResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, handicap_index')
        .or(`username.ilike.%${sanitizeSearchText(playerQuery)}%,full_name.ilike.%${sanitizeSearchText(playerQuery)}%`)
        .neq('id', user?.id ?? '')
        .limit(8);
      setPlayerResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [playerQuery]);

  const linkPlayer = (idx, prof) => {
    const updated = [...players];
    updated[idx] = {
      name: prof.full_name || prof.username || 'Player',
      handicap: prof.handicap_index != null ? String(Math.round(prof.handicap_index)) : '',
      isUser: false,
      userId: prof.id,
      username: prof.username,
    };
    setPlayers(updated);
    setPlayerSearchIdx(null);
    setPlayerQuery('');
    setPlayerResults([]);
  };

  const unlinkPlayer = (idx) => {
    const updated = [...players];
    updated[idx] = { name: '', handicap: '', isUser: false, userId: null, username: null };
    setPlayers(updated);
  };

  const handleModeSelected = (m) => {
    setMode(m);
    const userName = profile?.full_name || profile?.username || 'You';
    const userHcp = profile?.handicap_index != null ? String(Math.round(profile.handicap_index)) : '';
    const initial = [{ name: userName, handicap: userHcp, isUser: true, userId: user?.id }];
    for (let i = 1; i < m; i++) {
      initial.push({ name: '', handicap: '', isUser: false, userId: null, username: null });
    }
    setPlayers(initial);
    if (m === 1) {
      setPlayers([{ name: userName, handicap: userHcp, isUser: true, userId: user?.id }]);
      setPhase(PHASE.TRANSPORT);
    } else {
      setPhase(PHASE.PLAYERS);
    }
  };

  const handlePlayersNext = () => {
    setPhase(PHASE.TRANSPORT);
  };


  const handleStartRound = async () => {
    const config = await fetchClockedConfig();
    let holeDataSlice = buildHoleDataSlice();

    // Remap certified data: for back 9, DB hole 10 → round hole 1
    const holeOffset = (holes === '9' && selectedNine === 'back') ? 9 : 0;
    let officialTimePars = {};
    if (certData?.timePars) {
      officialTimePars = Object.fromEntries(
        Object.entries(certData.timePars).map(([k, v]) => [Number(k) - holeOffset, v])
      );
    }

    // Seed holeData with certified par/yardage where available
    if (certData?.holeInfo && holeDataSlice) {
      holeDataSlice = holeDataSlice.map((h, i) => {
        const dbHole = i + 1 + holeOffset;
        const cert = certData.holeInfo[dbHole];
        if (!cert) return h;
        return {
          ...h,
          par: cert.par ?? h.par,
          yardage: cert.yardage ?? h.yardage,
        };
      });
    }

    // Remember for next time — pre-selects this transport on the next setup.
    AsyncStorage.setItem(CLOCKED_LAST_TRANSPORT_KEY, transport).catch(() => {});

    navigation.navigate('ClockedRound', {
      course,
      holes,
      transport,
      difficulty,
      mode,
      players,
      selectedTee,
      selectedNine,
      holeData: holeDataSlice,
      configSnapshot: config,
      officialTimePars,
      defaultPar,
    });
  };

  const buildHoleDataSlice = () => {
    // Require a full slice's worth of holes before trusting this data —
    // a short/partial array (e.g. 9 holes returned when 18 were requested)
    // would otherwise silently mix real holes with undefined ones. All-or-
    // nothing: if we don't have enough real holes, fall back to defaultPar
    // for every hole in ClockedRoundScreen instead of a mismatched slice.
    if (!teeHoles || teeHoles.length < holeCount) return null;
    const sliceFrom = (holeCount === 9 && teeHoles.length >= 18 && selectedNine === 'back') ? 9 : 0;
    return teeHoles.slice(sliceFrom, sliceFrom + holeCount)
      .map(h => ({ ...h, par: h?.par ?? defaultPar }));
  };

  const handleBack = () => {
    if (phase === PHASE.COURSE) { navigation.goBack(); return; }
    if (phase === PHASE.TEE) { setPhase(PHASE.COURSE); return; }
    if (phase === PHASE.MODE) {
      setPhase((courseTees?.length ?? 0) > 0 ? PHASE.TEE : PHASE.COURSE);
      return;
    }
    if (phase === PHASE.PLAYERS) { setPhase(PHASE.MODE); return; }
    if (phase === PHASE.TRANSPORT) {
      setPhase(mode === 1 ? PHASE.MODE : PHASE.PLAYERS);
      return;
    }
  };

  // ── Tee picker helpers ──
  const maleTees = courseTees ?? [];
  const nineHoleTees = maleTees.filter(t => t.number_of_holes === 9);
  const teesToShow = holes === '9' && nineHoleTees.length > 0 ? nineHoleTees : maleTees;
  const showNinePicker = holes === '9' && nineHoleTees.length === 0;

  // ── Render ──
  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name={phase === PHASE.COURSE ? 'close' : 'arrow-back'} size={20} color={COLOR.gold} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>CLOCKED</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RulesScreen')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.7}>
          <Ionicons name="help-circle-outline" size={22} color={COLOR.gold} />
        </TouchableOpacity>
      </View>

      {/* Step dots */}
      {phase <= PHASE.TRANSPORT && (() => {
        const visibleSteps = [
          PHASE.COURSE,
          (courseTees?.length ?? 0) > 0 ? PHASE.TEE : null,
          PHASE.MODE,
          mode > 1 ? PHASE.PLAYERS : null,
          PHASE.TRANSPORT,
        ].filter(p => p != null);
        const at = Math.max(0, visibleSteps.indexOf(phase));
        return (
          <View style={s.dotsRow}>
            {visibleSteps.map((p, i) => (
              <View key={p} style={[s.dot, i === at && s.dotActive, i < at && s.dotDone]} />
            ))}
          </View>
        );
      })()}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── COURSE ── */}
        {phase === PHASE.COURSE && (
          <View style={{ flex: 1 }}>
            <Text style={s.stepTitle}>Which course?</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search courses..."
              placeholderTextColor="#B8A88266"
              value={query}
              onChangeText={t => { setQuery(t); setCourse(null); }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* Quick-play: skip course selection */}
            <TouchableOpacity
              style={s.skipCourseBtn}
              onPress={() => { setCourse(null); setPhase(PHASE.MODE); }}
              activeOpacity={0.7}
            >
              <Ionicons name="flash-outline" size={14} color="#C9A84C88" />
              <Text style={s.skipCourseText}>Skip. I'll set par manually</Text>
            </TouchableOpacity>
            {/* Not at a course — play the arcade on the same rules */}
            <TouchableOpacity
              style={s.arcadeCard}
              onPress={() => navigation.navigate('Main', { screen: 'Arcade' })}
              activeOpacity={0.8}
              accessibilityLabel="Play Clocked Arcade"
            >
              <Ionicons name="game-controller-outline" size={20} color={COLOR.gold} />
              <View style={{ flex: 1 }}>
                <Text style={s.arcadeTitle}>Not at a course? Play Clocked Arcade →</Text>
                <Text style={s.arcadeSub}>Same rules, same clock. Never touches your real stats.</Text>
              </View>
            </TouchableOpacity>
            {results.map(c => (
              <TouchableOpacity
                key={c.name}
                style={s.courseRow}
                onPress={() => handleCourseSelected(c)}
                activeOpacity={0.8}
              >
                <CourseAvatar courseName={c.name} city={c.city} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.courseName}>{c.name}</Text>
                  {(c.city || c.state) && (
                    <Text style={s.courseSub}>{[c.city, c.state].filter(Boolean).join(', ')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── HOLES ── */}
        {/* ── TEE ── */}
        {phase === PHASE.TEE && (
          <View>
            <Text style={s.stepTitle}>Select your tee</Text>
            {showNinePicker && (
              <>
                <Text style={s.sectionQ}>WHICH NINE?</Text>
                <View style={s.btnGroup}>
                  {['front', 'back'].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[s.groupBtn, s.groupBtnWide, selectedNine === n && s.groupBtnOn]}
                      onPress={() => setSelectedNine(n)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.groupBtnTxt, selectedNine === n && s.groupBtnTxtOn]}>
                        {n === 'front' ? 'Front 9' : 'Back 9'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            {teesToShow.map((tee, i) => {
              const sel = selectedTeeIdx === i || (selectedTeeIdx != null && courseTees[selectedTeeIdx] === tee);
              const actualIdx = courseTees.indexOf(tee);
              const colorKey = tee.tee_name?.toLowerCase().split(' ')[0];
              const dotColor = TEE_COLORS[colorKey] ?? COLOR.muted;
              return (
                <TouchableOpacity
                  key={i}
                  style={[s.teeCard, sel && s.teeCardOn]}
                  onPress={() => setSelectedTeeIdx(actualIdx)}
                  activeOpacity={0.8}
                >
                  <View style={[s.teeDot, { backgroundColor: dotColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.teeName, sel && s.teeNameOn]}>{tee.tee_name}</Text>
                    <Text style={s.teeMeta}>
                      {tee.total_yards ? `${tee.total_yards} yds` : ''}{tee.par_total ? `  ·  Par ${tee.par_total}` : ''}
                      {tee.course_rating ? `  ·  ${tee.course_rating}/${tee.slope_rating}` : ''}
                    </Text>
                  </View>
                  {sel && <Ionicons name="checkmark" size={16} color={COLOR.gold} />}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[s.primaryBtn, { marginTop: 20 }]} onPress={handleTeeNext} activeOpacity={0.8}>
              <Text style={s.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── MODE ── */}
        {phase === PHASE.MODE && (
          <View>
            <Text style={s.stepTitle}>How are you playing?</Text>
            <Text style={s.stepSub}>Everyone's scores combine into one team total.</Text>
            {[
              { v: 1, label: 'Solo',          sub: 'Just you vs the clock' },
              { v: 2, label: '2-Player',      sub: 'Aggregate team score' },
              { v: 3, label: '3-Player',      sub: 'Aggregate team score' },
              { v: 4, label: '4-Player',      sub: 'Aggregate team score' },
            ].map(({ v, label, sub }) => (
              <TouchableOpacity
                key={v}
                style={s.modeCard}
                onPress={() => handleModeSelected(v)}
                activeOpacity={0.8}
              >
                <View style={s.modeIcon}>
                  <Ionicons name={v === 1 ? 'person' : 'people'} size={20} color={COLOR.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modeName}>{label}</Text>
                  <Text style={s.modeSub}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLOR.dim} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── PLAYERS ── */}
        {phase === PHASE.PLAYERS && (
          <View>
            <Text style={s.stepTitle}>Your group</Text>
            <Text style={s.stepSub}>Link teammates by username so they get credit, or enter a name for guests.</Text>
            {players.map((pl, i) => (
              <View key={i}>
                <View style={s.playerRow}>
                  <View style={s.playerNum}>
                    <Text style={s.playerNumTxt}>{i + 1}</Text>
                  </View>
                  {pl.userId && !pl.isUser ? (
                    /* Linked player */
                    <View style={[s.linkedPlayer, { flex: 1 }]}>
                      <InitialsAvatar name={pl.name} size={28} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.linkedName}>{pl.name}</Text>
                        {pl.username && <Text style={s.linkedHandle}>@{pl.username}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => unlinkPlayer(i)} activeOpacity={0.7}>
                        <Ionicons name="close-circle" size={18} color="#C07A6A" />
                      </TouchableOpacity>
                    </View>
                  ) : !pl.isUser ? (
                    /* Unlinked — name input + search button */
                    <TextInput
                      style={[s.playerInput, { flex: 1 }]}
                      placeholder={`Player ${i + 1} name`}
                      placeholderTextColor="#B8A88266"
                      value={pl.name}
                      onChangeText={v => {
                        const updated = [...players];
                        updated[i] = { ...updated[i], name: v };
                        setPlayers(updated);
                      }}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  ) : (
                    /* Self (not editable) */
                    <View style={[s.linkedPlayer, { flex: 1 }]}>
                      <InitialsAvatar name={pl.name} size={28} />
                      <Text style={s.linkedName}>{pl.name}</Text>
                    </View>
                  )}
                  {!pl.isUser && !pl.userId && (
                    <TouchableOpacity
                      style={s.linkBtn}
                      onPress={() => { setPlayerSearchIdx(i); setPlayerQuery(''); setPlayerResults([]); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="person-add-outline" size={16} color={COLOR.gold} />
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={[s.playerInput, s.hcpInput]}
                    placeholder="Hcp"
                    placeholderTextColor="#B8A88266"
                    value={pl.handicap}
                    onChangeText={v => {
                      const updated = [...players];
                      updated[i] = { ...updated[i], handicap: v };
                      setPlayers(updated);
                    }}
                    keyboardType="numeric"
                    maxLength={3}
                    editable={!pl.userId || pl.isUser}
                  />
                </View>
                {/* Inline search dropdown */}
                {playerSearchIdx === i && (
                  <View style={s.searchDropdown}>
                    <TextInput
                      style={s.searchDropdownInput}
                      placeholder="Search by username..."
                      placeholderTextColor="#B8A88266"
                      value={playerQuery}
                      onChangeText={setPlayerQuery}
                      autoFocus
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {playerResults.map(p => (
                      <TouchableOpacity key={p.id} style={s.searchResultRow} onPress={() => linkPlayer(i, p)} activeOpacity={0.8}>
                        <InitialsAvatar name={p.full_name} size={28} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.searchResultName}>{p.full_name || p.username}</Text>
                          {p.username && <Text style={s.searchResultHandle}>@{p.username}</Text>}
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity onPress={() => setPlayerSearchIdx(null)} style={{ paddingVertical: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: COLOR.dim }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 24 },
                !players.every(p => p.name.trim().length > 0) && s.primaryBtnDisabled]}
              onPress={handlePlayersNext}
              disabled={!players.every(p => p.name.trim().length > 0)}
              activeOpacity={0.8}
            >
              <Text style={s.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── TRANSPORT ── */}
        {phase === PHASE.TRANSPORT && (
          <View>
            <Text style={s.stepTitle}>Set up the round</Text>
            <Text style={s.stepSub}>Holes, how you're getting around, and the clock. Walking earns more time per hole.</Text>
            <View style={s.summaryStrip}>
              <Text style={s.summaryMain} numberOfLines={1}>{course?.name ?? 'No course · manual par'}</Text>
              <Text style={s.summaryMeta} numberOfLines={1}>
                {mode === 1 ? 'Solo' : `${mode} players · ${players.map(p => p.name || '—').join(', ')}`}
                {selectedTee ? ` · ${selectedTee.tee_name} tees` : ''}
              </Text>
            </View>
            <Text style={s.sectionQ}>HOLES</Text>
            <View style={s.btnGroup}>
              {[{ label: '9 Holes', v: '9' }, { label: '18 Holes', v: '18' }].map(({ label, v }) => (
                <TouchableOpacity
                  key={v}
                  style={[s.groupBtn, s.groupBtnWide, holes === v && s.groupBtnOn]}
                  onPress={() => setHoles(v)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.groupBtnTxt, holes === v && s.groupBtnTxtOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.sectionQ, { marginTop: 24 }]}>GETTING AROUND</Text>
            <View style={s.btnGroup}>
              {['Walking', 'Cart'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.groupBtn, s.groupBtnWide, transport === t && s.groupBtnOn]}
                  onPress={() => chooseTransport(t)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={t === 'Walking' ? 'walk-outline' : 'car-outline'}
                    size={18}
                    color={transport === t ? COLOR.gold : COLOR.dim}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[s.groupBtnTxt, transport === t && s.groupBtnTxtOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Difficulty picker */}
            <Text style={[s.sectionQ, { marginTop: 24 }]}>SHOT CLOCK DIFFICULTY</Text>
            <View style={s.difficultyRow}>
              {[
                { key: 'beginner',     label: 'BEGINNER', sub: '~4:30 round', color: COLOR.green },
                { key: 'intermediate', label: 'INTER.',   sub: '~3:30 round', color: COLOR.amber },
                { key: 'pro',          label: 'PRO',      sub: '~3:00 round', color: COLOR.red },
              ].map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[s.diffBtn, difficulty === d.key && s.diffBtnActive]}
                  onPress={() => setDifficulty(d.key)}
                  activeOpacity={0.8}
                >
                  <View style={[s.diffDot, { backgroundColor: d.color }]} />
                  <Text style={[s.diffLabel, difficulty === d.key && s.diffLabelActive]}>{d.label}</Text>
                  <Text style={s.diffSub}>{d.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button label="START ROUND" icon="timer-outline" size="lg" onPress={handleStartRound} disabled={!transport} style={{ marginTop: 28 }} />
            <Text style={s.startSub}>Your shot clock begins on hole 1</Text>
          </View>
        )}

      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLOR.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 4 },
  dotsRow:     { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 12 },
  dot:         { width: 8, height: 8, borderRadius: RADIUS.xs, backgroundColor: COLOR.surfaceAlt },
  dotActive:   { backgroundColor: COLOR.gold, width: 18 },
  dotDone:     { backgroundColor: '#4A7A50' },
  content:     { paddingHorizontal: 20, paddingBottom: 40 },

  stepTitle:   { fontSize: 22, fontWeight: '600', color: COLOR.cream, marginBottom: 6, marginTop: 8 },
  stepSub:     { fontSize: 13, color: COLOR.muted, marginBottom: 20, lineHeight: 19 },
  sectionQ:    { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 8, marginTop: 12 },

  searchInput: { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: '#7DC87A33', borderRadius: RADIUS.md, padding: 14, color: COLOR.cream, fontSize: 15, marginBottom: 12 },
  skipCourseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 12 },
  skipCourseText:{ fontSize: 12, color: '#C9A84C88', fontWeight: '500' },
  arcadeCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#C9A84C33', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  arcadeTitle:   { fontSize: 13, color: COLOR.cream, fontWeight: '600' },
  arcadeSub:     { fontSize: 11, color: COLOR.dim, marginTop: 2 },
  courseRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, marginBottom: 8, gap: 12 },
  courseName:  { fontSize: 14, fontWeight: '500', color: COLOR.cream },
  courseSub:   { fontSize: 11, color: COLOR.muted, marginTop: 2 },

  btnGroup:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  groupBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A33', backgroundColor: COLOR.surface },
  groupBtnWide:{ flex: 1 },
  groupBtnOn:  { backgroundColor: '#1E4825', borderColor: COLOR.gold },
  groupBtnTxt: { fontSize: 14, color: COLOR.muted, fontWeight: '500' },
  groupBtnTxtOn: { color: COLOR.gold, fontWeight: '700' },

  primaryBtn:     { backgroundColor: COLOR.gold, borderRadius: RADIUS.md, paddingVertical: 16, alignItems: 'center' },
  primaryBtnDisabled: { backgroundColor: '#C9A84C44' },
  primaryBtnText: { fontSize: 12, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },

  backLink:    { fontSize: 13, color: COLOR.gold, textAlign: 'center' },

  // Tee picker
  teeCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 12 },
  teeCardOn:   { borderColor: COLOR.gold, backgroundColor: COLOR.surfaceAlt },
  teeDot:      { width: 14, height: 14, borderRadius: RADIUS.xs, borderWidth: 1.5, borderColor: '#ffffff33' },
  teeName:     { fontSize: 14, fontWeight: '600', color: COLOR.cream, marginBottom: 2 },
  teeNameOn:   { color: COLOR.gold },
  teeMeta:     { fontSize: 11, color: COLOR.muted },

  // Mode cards
  modeCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10, gap: 14 },
  modeIcon:    { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLOR.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  modeName:    { fontSize: 16, fontWeight: '600', color: COLOR.cream, marginBottom: 2 },
  modeSub:     { fontSize: 12, color: COLOR.muted },

  // Player entry
  playerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  playerNum:   { width: 30, height: 30, borderRadius: 15, backgroundColor: COLOR.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  playerNumTxt:{ fontSize: 13, fontWeight: '700', color: COLOR.gold },
  playerInput: { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: '#C9A84C22', borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10, color: COLOR.cream, fontSize: 14 },
  hcpInput:    { width: 64, textAlign: 'center' },
  linkedPlayer:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLOR.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#7DC87A44', paddingHorizontal: 10, paddingVertical: 8 },
  linkedName:  { fontSize: 14, fontWeight: '500', color: COLOR.cream },
  linkedHandle:{ fontSize: 10, color: COLOR.muted },
  linkBtn:     { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: COLOR.surfaceAlt, borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center' },
  searchDropdown:     { backgroundColor: COLOR.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#C9A84C33', marginBottom: 8, marginLeft: 38, overflow: 'hidden' },
  searchDropdownInput:{ padding: 10, color: COLOR.cream, fontSize: 13, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  searchResultRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  searchResultName:   { fontSize: 13, fontWeight: '500', color: COLOR.cream },
  searchResultHandle: { fontSize: 10, color: COLOR.muted },
  hcpWarning:  { fontSize: 11, color: '#D4844A', marginTop: 8, fontStyle: 'italic' },

  // Difficulty picker
  difficultyRow:  { flexDirection: 'row', gap: 10 },
  diffBtn:        { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 14, alignItems: 'center', gap: 4 },
  diffBtnActive:  { borderColor: COLOR.gold, backgroundColor: '#C9A84C0F' },
  diffDot:        { width: 10, height: 10, borderRadius: RADIUS.xs },
  diffLabel:      { fontSize: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  diffLabelActive:{ color: COLOR.cream },
  diffSub:        { fontSize: 9, color: COLOR.dim },

  // Confirm
  summaryStrip: { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6 },
  summaryMain:  { fontSize: 14, fontWeight: '600', color: COLOR.cream },
  summaryMeta:  { fontSize: 11, color: COLOR.dim, marginTop: 2 },
  confirmWrap:   { alignItems: 'center', paddingTop: 12 },
  confirmCourse: { fontSize: 24, fontWeight: '600', color: COLOR.gold, textAlign: 'center', marginBottom: 16, letterSpacing: 0.5 },
  confirmGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12, width: '100%' },
  confirmItem:   { flex: 1, minWidth: '40%', backgroundColor: COLOR.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#7DC87A22', padding: 12 },
  confirmLabel:  { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  confirmValue:  { fontSize: 15, fontWeight: '500', color: COLOR.cream },

  startBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: 18, width: '100%', marginTop: 20 },
  startBtnTxt: { fontSize: 14, fontWeight: '700', color: COLOR.bg, letterSpacing: 3 },
  startSub:    { fontSize: 11, color: COLOR.dim, marginTop: 10, textAlign: 'center' },
});
