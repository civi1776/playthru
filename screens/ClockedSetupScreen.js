import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Platform,
  KeyboardAvoidingView, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { searchCourses } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import CourseAvatar from '../components/CourseAvatar';
import { fetchClockedConfig } from '../lib/clockedConfig';
import { isPar3Course } from '../lib/popScore';
import InitialsAvatar from '../components/InitialsAvatar';

// ─── Tee colors (reused from LiveRoundScreen pattern) ────────────────────────
const TEE_COLORS = {
  black: '#2A2A2A', blue: '#3B6FB6', white: '#E8E8E8', gold: '#C9A84C',
  red: '#C07A6A', green: '#4A7A50', yellow: '#D4B86A', silver: '#A8A8A8',
  bronze: '#B87333', orange: '#D4844A',
};

const PHASE = { COURSE: 0, HOLES: 1, TEE: 2, MODE: 3, PLAYERS: 4, TRANSPORT: 5, CONFIRM: 6 };
const STEP_LABELS = ['Course', 'Holes', 'Tee', 'Mode', 'Players', 'Transport', 'Confirm'];

export default function ClockedSetupScreen({ navigation }) {
  const { profile, user } = useAuth();
  const isCaddy = profile?.account_type === 'caddy';

  // ── State ──
  const [phase, setPhase]             = useState(PHASE.COURSE);
  const [course, setCourse]           = useState(null);
  const [holes, setHoles]             = useState('9');
  const [courseTees, setCourseTees]   = useState(null);
  const [selectedTeeIdx, setSelectedTeeIdx] = useState(null);
  const [selectedNine, setSelectedNine]     = useState('front');
  const [mode, setMode]               = useState(1); // 1=solo, 2/3/4
  const [transport, setTransport]     = useState(null);
  const [difficulty, setDifficulty]   = useState('intermediate');
  const [players, setPlayers]         = useState([]);

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

  // ── Handlers ──
  const handleCourseSelected = async (c) => {
    setCourse(c);
    setCourseTees(null);
    setSelectedTeeIdx(null);
    setSelectedNine('front');
    setPhase(PHASE.HOLES);
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

  const handleHolesNext = () => {
    setPhase((courseTees?.length ?? 0) > 0 ? PHASE.TEE : PHASE.MODE);
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
        .or(`username.ilike.%${playerQuery.trim()}%,full_name.ilike.%${playerQuery.trim()}%`)
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

  const handleTransportNext = () => setPhase(PHASE.CONFIRM);

  const handleStartRound = async () => {
    const config = await fetchClockedConfig();
    const holeDataSlice = buildHoleDataSlice();

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
      operatingCaddyId: isCaddy ? user?.id : null,
    });
  };

  const buildHoleDataSlice = () => {
    if (!teeHoles || teeHoles.length === 0) return null;
    const sliceFrom = (holeCount === 9 && teeHoles.length >= 18 && selectedNine === 'back') ? 9 : 0;
    return teeHoles.slice(sliceFrom, sliceFrom + holeCount);
  };

  const handleBack = () => {
    if (phase === PHASE.COURSE) { navigation.goBack(); return; }
    if (phase === PHASE.HOLES) { setPhase(PHASE.COURSE); return; }
    if (phase === PHASE.TEE) { setPhase(PHASE.HOLES); return; }
    if (phase === PHASE.MODE) {
      setPhase((courseTees?.length ?? 0) > 0 ? PHASE.TEE : PHASE.HOLES);
      return;
    }
    if (phase === PHASE.PLAYERS) { setPhase(PHASE.MODE); return; }
    if (phase === PHASE.TRANSPORT) {
      setPhase(mode === 1 ? PHASE.MODE : PHASE.PLAYERS);
      return;
    }
    if (phase === PHASE.CONFIRM) { setPhase(PHASE.TRANSPORT); return; }
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
          <Ionicons name={phase === PHASE.COURSE ? 'close' : 'arrow-back'} size={20} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>CLOCKED</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RulesScreen')} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.7}>
          <Ionicons name="help-circle-outline" size={22} color="#C9A84C" />
        </TouchableOpacity>
      </View>

      {/* Step dots */}
      {phase <= PHASE.CONFIRM && (
        <View style={s.dotsRow}>
          {STEP_LABELS.map((_, i) => (
            <View key={i} style={[s.dot, i === phase && s.dotActive, i < phase && s.dotDone]} />
          ))}
        </View>
      )}

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
              onPress={() => { setCourse(null); setPhase(PHASE.HOLES); }}
              activeOpacity={0.7}
            >
              <Ionicons name="flash-outline" size={14} color="#C9A84C88" />
              <Text style={s.skipCourseText}>Skip — I'll set par manually</Text>
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
        {phase === PHASE.HOLES && (
          <View>
            <Text style={s.stepTitle}>How many holes?</Text>
            <Text style={s.stepSub}>Clocked defaults to 9 — quick, competitive rounds.</Text>
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
            <TouchableOpacity style={[s.primaryBtn, { marginTop: 32 }]} onPress={handleHolesNext} activeOpacity={0.8}>
              <Text style={s.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        )}

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
              const dotColor = TEE_COLORS[colorKey] ?? '#B8A882';
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
                  {sel && <Ionicons name="checkmark" size={16} color="#C9A84C" />}
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
                  <Ionicons name={v === 1 ? 'person' : 'people'} size={20} color="#C9A84C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modeName}>{label}</Text>
                  <Text style={s.modeSub}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#7A6E58" />
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
                      <Ionicons name="person-add-outline" size={16} color="#C9A84C" />
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={[s.playerInput, s.hcpInput]}
                    placeholder="HCP"
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
                      <Text style={{ fontSize: 11, color: '#7A6E58' }}>Cancel</Text>
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
            <Text style={s.stepTitle}>How are you getting around?</Text>
            <Text style={s.stepSub}>This affects your time par — walking gets more time.</Text>
            <View style={s.btnGroup}>
              {['Walking', 'Cart'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.groupBtn, s.groupBtnWide, transport === t && s.groupBtnOn]}
                  onPress={() => setTransport(t)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={t === 'Walking' ? 'walk-outline' : 'car-outline'}
                    size={18}
                    color={transport === t ? '#C9A84C' : '#7A6E58'}
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
                { key: 'beginner',     label: 'BEGINNER', sub: '~4:30 round', color: '#7DC87A' },
                { key: 'intermediate', label: 'INTER.',   sub: '~3:30 round', color: '#C9A84C' },
                { key: 'pro',          label: 'PRO',      sub: '~3:00 round', color: '#E85D4A' },
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

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 32 }, !transport && s.primaryBtnDisabled]}
              onPress={handleTransportNext}
              disabled={!transport}
              activeOpacity={0.8}
            >
              <Text style={s.primaryBtnText}>CONTINUE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── CONFIRM ── */}
        {phase === PHASE.CONFIRM && (
          <View style={s.confirmWrap}>
            <Text style={s.confirmCourse}>{course?.name ?? 'Quick Play'}</Text>

            <View style={s.confirmGrid}>
              <View style={s.confirmItem}>
                <Text style={s.confirmLabel}>HOLES</Text>
                <Text style={s.confirmValue}>{holes}</Text>
              </View>
              <View style={s.confirmItem}>
                <Text style={s.confirmLabel}>MODE</Text>
                <Text style={s.confirmValue}>{mode === 1 ? 'Solo' : `${mode}-Player`}</Text>
              </View>
              <View style={s.confirmItem}>
                <Text style={s.confirmLabel}>TRANSPORT</Text>
                <Text style={s.confirmValue}>{transport}</Text>
              </View>
              <View style={s.confirmItem}>
                <Text style={s.confirmLabel}>DIFFICULTY</Text>
                <Text style={s.confirmValue}>{difficulty === 'pro' ? 'Pro' : difficulty === 'beginner' ? 'Beginner' : 'Intermediate'}</Text>
              </View>
            </View>

            {selectedTee && (
              <View style={s.confirmItem}>
                <Text style={s.confirmLabel}>TEE</Text>
                <Text style={s.confirmValue}>{selectedTee.tee_name}{selectedTee.total_yards ? ` · ${selectedTee.total_yards} yds` : ''}</Text>
              </View>
            )}

            {mode > 1 && (
              <View style={[s.confirmItem, { marginTop: 8 }]}>
                <Text style={s.confirmLabel}>PLAYERS</Text>
                <Text style={s.confirmValue}>{players.map(p => p.name || '—').join(', ')}</Text>
              </View>
            )}

            <TouchableOpacity style={s.startBtn} onPress={handleStartRound} activeOpacity={0.85}>
              <Ionicons name="timer-outline" size={22} color="#090F0A" style={{ marginRight: 10 }} />
              <Text style={s.startBtnTxt}>START ROUND</Text>
            </TouchableOpacity>
            <Text style={s.startSub}>Your shot clock begins on hole 1</Text>

            <TouchableOpacity onPress={() => setPhase(PHASE.TRANSPORT)} style={{ marginTop: 12 }}>
              <Text style={s.backLink}>← Edit details</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#090F0A' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:     { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  dotsRow:     { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 12 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A2E1C' },
  dotActive:   { backgroundColor: '#C9A84C', width: 18 },
  dotDone:     { backgroundColor: '#4A7A50' },
  content:     { paddingHorizontal: 20, paddingBottom: 40 },

  stepTitle:   { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 6, marginTop: 8 },
  stepSub:     { fontSize: 13, color: '#B8A882', marginBottom: 20, lineHeight: 19 },
  sectionQ:    { fontSize: 10, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 8, marginTop: 12 },

  searchInput: { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 14, padding: 14, color: '#F5EDD8', fontSize: 15, marginBottom: 12 },
  skipCourseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 12 },
  skipCourseText:{ fontSize: 12, color: '#C9A84C88', fontWeight: '500' },
  courseRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, marginBottom: 8, gap: 12 },
  courseName:  { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  courseSub:   { fontSize: 11, color: '#B8A882', marginTop: 2 },

  btnGroup:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  groupBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A33', backgroundColor: '#0D1A0F' },
  groupBtnWide:{ flex: 1 },
  groupBtnOn:  { backgroundColor: '#1E4825', borderColor: '#C9A84C' },
  groupBtnTxt: { fontSize: 14, color: '#B8A882', fontWeight: '500' },
  groupBtnTxtOn: { color: '#C9A84C', fontWeight: '700' },

  primaryBtn:     { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnDisabled: { backgroundColor: '#C9A84C44' },
  primaryBtnText: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },

  backLink:    { fontSize: 13, color: '#C9A84C', textAlign: 'center' },

  // Tee picker
  teeCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 12 },
  teeCardOn:   { borderColor: '#C9A84C', backgroundColor: '#1A2E1C' },
  teeDot:      { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#ffffff33' },
  teeName:     { fontSize: 14, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  teeNameOn:   { color: '#C9A84C' },
  teeMeta:     { fontSize: 11, color: '#B8A882' },

  // Mode cards
  modeCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10, gap: 14 },
  modeIcon:    { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  modeName:    { fontSize: 16, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  modeSub:     { fontSize: 12, color: '#B8A882' },

  // Player entry
  playerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  playerNum:   { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  playerNumTxt:{ fontSize: 13, fontWeight: '700', color: '#C9A84C' },
  playerInput: { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#F5EDD8', fontSize: 14 },
  hcpInput:    { width: 64, textAlign: 'center' },
  linkedPlayer:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A44', paddingHorizontal: 10, paddingVertical: 8 },
  linkedName:  { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  linkedHandle:{ fontSize: 10, color: '#B8A882' },
  linkBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A2E1C', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center' },
  searchDropdown:     { backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C33', marginBottom: 8, marginLeft: 38, overflow: 'hidden' },
  searchDropdownInput:{ padding: 10, color: '#F5EDD8', fontSize: 13, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  searchResultRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  searchResultName:   { fontSize: 13, fontWeight: '500', color: '#F5EDD8' },
  searchResultHandle: { fontSize: 10, color: '#B8A882' },
  hcpWarning:  { fontSize: 11, color: '#D4844A', marginTop: 8, fontStyle: 'italic' },

  // Difficulty picker
  difficultyRow:  { flexDirection: 'row', gap: 10 },
  diffBtn:        { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 14, alignItems: 'center', gap: 4 },
  diffBtnActive:  { borderColor: '#C9A84C', backgroundColor: '#C9A84C0F' },
  diffDot:        { width: 10, height: 10, borderRadius: 5 },
  diffLabel:      { fontSize: 11, fontWeight: '700', color: '#7A6E58', letterSpacing: 1 },
  diffLabelActive:{ color: '#F5EDD8' },
  diffSub:        { fontSize: 9, color: '#7A6E58' },

  // Confirm
  confirmWrap:   { alignItems: 'center', paddingTop: 12 },
  confirmCourse: { fontSize: 24, fontWeight: '600', color: '#C9A84C', textAlign: 'center', marginBottom: 16, letterSpacing: 0.5 },
  confirmGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12, width: '100%' },
  confirmItem:   { flex: 1, minWidth: '40%', backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A22', padding: 12 },
  confirmLabel:  { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, marginBottom: 4 },
  confirmValue:  { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },

  startBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#C9A84C', borderRadius: 16, paddingVertical: 18, width: '100%', marginTop: 20 },
  startBtnTxt: { fontSize: 14, fontWeight: '700', color: '#090F0A', letterSpacing: 3 },
  startSub:    { fontSize: 11, color: '#7A6E58', marginTop: 8 },
});
