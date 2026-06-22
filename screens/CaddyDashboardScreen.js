/*
 * CaddyDashboardScreen — 3-tab dashboard for caddy account_type users.
 *
 * SQL additions needed in Supabase:
 *
 * alter table rounds add column if not exists caddy_logged boolean default false;
 * alter table rounds add column if not exists client_name text;        -- for non-PlayThru clients
 * alter table rounds add column if not exists client_user_id uuid references profiles(id);
 * alter table rounds add column if not exists caddy_notes text;        -- private caddy notes
 *
 * -- Reset caddy default POPScore:
 * UPDATE profiles SET pop_score = 3.5 WHERE account_type = 'caddy' AND (pop_score IS NULL OR pop_score = 0 OR pop_score = 2.5);
 * alter table profiles add column if not exists caddy_course text;
 * alter table profiles add column if not exists caddy_rating numeric default 0;
 * alter table profiles add column if not exists caddy_experience_years integer;
 *
 * RLS: caddies can insert rounds where caddy_id = auth.uid()
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Animated,
  StyleSheet, Alert, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { searchCourses } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import CourseAvatar from '../components/CourseAvatar';
import SkeletonLoader from '../components/SkeletonLoader';
import Gauge from '../components/guage';
import InitialsAvatar from '../components/InitialsAvatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatShortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function parseTimeToMinutes(str) {
  // Accepts "H:MM AM/PM" (12h) or "HH:MM" (24h fallback)
  if (!str) return null;
  const parts = str.trim().split(' ');
  if (parts.length === 2) {
    // 12h format: "8:30 AM" / "12:00 PM"
    const [hm, period] = parts;
    const [h, mm] = hm.split(':').map(Number);
    if (isNaN(h) || isNaN(mm)) return null;
    let total = (h % 12) * 60 + mm;
    if (period === 'PM') total += 12 * 60;
    return total;
  }
  // 24h fallback
  const [h, mm] = str.split(':').map(Number);
  if (isNaN(h) || isNaN(mm)) return null;
  return h * 60 + mm;
}

function ratingColor(r) {
  if (r >= 4) return '#7DC87A';
  if (r >= 3) return '#C9A84C';
  return '#C07A6A';
}

function StarRow({ rating, size = 14 }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? 'star' : 'star-outline'}
          size={size}
          color="#C9A84C"
        />
      ))}
    </View>
  );
}

// ─── Time picker helpers ──────────────────────────────────────────────────────

function minutesToTimeStr(totalMinutes) {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const h24     = Math.floor(clamped / 60);
  const min     = clamped % 60;
  const period  = h24 >= 12 ? 'PM' : 'AM';
  let   h       = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(min).padStart(2, '0')} ${period}`;
}

function generateTimeSlots(startMin, endMin) {
  const slots = [];
  for (let t = startMin; t <= endMin; t += 15) slots.push(minutesToTimeStr(t));
  return slots;
}

const CADDY_START_TIMES = generateTimeSlots(300, 1140); // 5:00 AM – 7:00 PM
const CADDY_END_TIMES   = generateTimeSlots(375, 1320); // 6:15 AM – 10:00 PM

const SLOT_H   = 72;
const PICKER_H = SLOT_H * 5;

function CaddySlotPicker({ times, value, onChange }) {
  const scrollRef   = useRef(null);
  const scrollY     = useRef(new Animated.Value(0)).current;
  const selectedIdx = Math.max(0, times.indexOf(value));

  useEffect(() => {
    const y = selectedIdx * SLOT_H;
    scrollY.setValue(y);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 80);
  }, []);

  const handleSnap = (e) => {
    const raw     = Math.round(e.nativeEvent.contentOffset.y / SLOT_H);
    const clipped = Math.max(0, Math.min(times.length - 1, raw));
    onChange(times[clipped]);
  };

  return (
    <View style={{ height: PICKER_H, overflow: 'hidden' }}>
      <View style={m.pickerBand} pointerEvents="none" />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={SLOT_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: SLOT_H * 2 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (e) => {
              const raw     = Math.round(e.nativeEvent.contentOffset.y / SLOT_H);
              const clipped = Math.max(0, Math.min(times.length - 1, raw));
              onChange(times[clipped]);
            },
          }
        )}
        onMomentumScrollEnd={handleSnap}
        onScrollEndDrag={handleSnap}
      >
        {times.map((time, i) => {
          const center = i * SLOT_H;
          const range  = [center - 2*SLOT_H, center - SLOT_H, center, center + SLOT_H, center + 2*SLOT_H];
          const opacity  = scrollY.interpolate({ inputRange: range, outputRange: [0.1, 0.35, 1, 0.35, 0.1],  extrapolate: 'clamp' });
          const scale    = scrollY.interpolate({ inputRange: range, outputRange: [0.72, 0.86, 1, 0.86, 0.72], extrapolate: 'clamp' });
          const fontSize = scrollY.interpolate({ inputRange: range, outputRange: [15, 19, 26, 19, 15],         extrapolate: 'clamp' });
          const color    = scrollY.interpolate({
            inputRange:  [center - SLOT_H * 0.4, center, center + SLOT_H * 0.4],
            outputRange: ['#B8A882', '#C9A84C', '#B8A882'],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View key={time} style={{ height: SLOT_H, justifyContent: 'center', alignItems: 'center', opacity, transform: [{ scale }] }}>
              <Animated.Text style={{ fontFamily: 'monospace', fontSize, color, fontWeight: '300', letterSpacing: 0.5 }}>
                {time}
              </Animated.Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

// ─── Quick Log Modal ───────────────────────────────────────────────────────────

function QuickLogModal({ visible, onClose, caddyId, onSuccess }) {
  const [step, setStep]               = useState(0);
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null); // { id, name } or null for manual
  const [courseQuery, setCourseQuery]     = useState('');
  const [courseResults, setCourseResults] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null); // full course object or null
  const [courseName, setCourseName]       = useState('');     // explicit name string
  const [startTime, setStartTime]         = useState('8:00 AM');
  const [endTime, setEndTime]             = useState('12:00 PM');
  const [holes, setHoles]                 = useState('18');
  const [transport, setTransport]         = useState('Cart');
  const [players, setPlayers]             = useState('1');
  const [caddyNotes, setCaddyNotes]       = useState('');
  const [submitting, setSubmitting]       = useState(false);

  const reset = () => {
    setStep(0); setClientQuery(''); setClientResults([]); setSelectedClient(null);
    setCourseQuery(''); setCourseResults([]); setSelectedCourse(null); setCourseName('');
    setStartTime('8:00 AM'); setEndTime('12:00 PM'); setHoles('18'); setTransport('Cart');
    setPlayers('1'); setCaddyNotes(''); setSubmitting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  // Client search
  useEffect(() => {
    if (clientQuery.trim().length < 2) { setClientResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username, pop_score')
        .or(`full_name.ilike.%${clientQuery.trim()}%,username.ilike.%${clientQuery.trim()}%`)
        .limit(8);
      setClientResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery]);

  // Course search
  useEffect(() => {
    if (courseQuery.trim().length < 2) { setCourseResults([]); return; }
    const t = setTimeout(async () => {
      const results = await searchCourses(courseQuery);
      setCourseResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [courseQuery]);

  const handleSubmit = async () => {
    if (!courseName) { Alert.alert('Missing', 'Please select a course.'); return; }
    const startMins = parseTimeToMinutes(startTime);
    const endMins   = parseTimeToMinutes(endTime);
    if (startMins == null || endMins == null) {
      Alert.alert('Error', 'Could not read selected times. Please try again.');
      return;
    }
    let duration = endMins - startMins;
    if (duration <= 0) duration += 24 * 60; // handle midnight crossover
    setSubmitting(true);
    try {
      const payload = {
        course_name: courseName,
        holes,
        transport,
        players: parseInt(players) || 1,
        duration_minutes: duration,
        tee_time: startTime,
        caddy_id: caddyId,
        caddy_logged: true,
        verification_level: 'caddy_corroborated',
        caddy_notes: caddyNotes.trim() || null,
        created_at: new Date().toISOString(),
      };
      if (selectedClient?.id) {
        payload.user_id = selectedClient.id;
        payload.client_user_id = selectedClient.id;
      } else {
        payload.client_name = selectedClient?.name || clientQuery.trim() || 'Manual Entry';
        // Create a placeholder user_id — use caddy's id so the round still saves
        // (In production you'd handle anonymous rounds properly)
        payload.user_id = caddyId;
      }
      const { error } = await supabase.from('rounds').insert(payload);
      if (error) throw error;
      const isGuest = selectedClient?.isGuest;
      const guestName = selectedClient?.name;
      reset();
      onSuccess?.();
      if (isGuest && guestName) {
        Alert.alert(
          '✓ Round Logged',
          `${courseName} · ${formatDuration(duration)}\n\nInvite ${guestName} to Clocked so they can see their pace stats!`,
          [
            { text: 'Invite →', onPress: () => {} },
            { text: 'Done', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('✓ Round Logged', `${courseName} · ${formatDuration(duration)}`);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = ['Client', 'Course', 'Details'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={m.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

          {/* Header */}
          <View style={m.header}>
            <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
              <Ionicons name="close" size={22} color="#B8A882" />
            </TouchableOpacity>
            <Text style={m.title}>LOG A ROUND</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Step indicator */}
          <View style={m.stepRow}>
            {STEPS.map((s, i) => (
              <View key={s} style={m.stepItem}>
                <View style={[m.stepDot, i <= step && m.stepDotActive]}>
                  <Text style={[m.stepDotNum, i <= step && { color: '#090F0A' }]}>{i + 1}</Text>
                </View>
                <Text style={[m.stepLabel, i <= step && { color: '#7DC87A' }]}>{s}</Text>
              </View>
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }}>

            {/* Step 0: Client */}
            {step === 0 && (
              <View>
                <Text style={m.sectionLabel}>WHO DID YOU LOOP FOR?</Text>
                <TextInput
                  style={m.input}
                  placeholder="Search Clocked users or enter name..."
                  placeholderTextColor="#B8A88266"
                  value={clientQuery}
                  onChangeText={setClientQuery}
                  autoFocus
                />
                {clientResults.length > 0 && (
                  <View style={m.dropdown}>
                    {clientResults.map(u => (
                      <TouchableOpacity
                        key={u.id}
                        style={m.dropdownItem}
                        onPress={() => {
                          setSelectedClient({ id: u.id, name: u.full_name || u.username });
                          setClientQuery(u.full_name || u.username || '');
                          setClientResults([]);
                        }}
                      >
                        <CourseAvatar courseName={u.full_name || u.username} size={28} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={m.dropdownName}>{u.full_name || u.username}</Text>
                          {u.pop_score != null && (
                            <Text style={m.dropdownSub}>Clocked Score {u.pop_score.toFixed(1)}</Text>
                          )}
                        </View>
                        <Ionicons name="checkmark-circle" size={16} color="#7DC87A" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {clientResults.length === 0 && clientQuery.trim().length >= 2 && !selectedClient && (
                  <View style={m.dropdown}>
                    <TouchableOpacity
                      style={m.dropdownItem}
                      onPress={() => {
                        setSelectedClient({ id: null, name: clientQuery.trim(), isGuest: true });
                        setClientResults([]);
                      }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#162B19', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person-outline" size={14} color="#7DC87A" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={m.dropdownName}>Log for Guest: {clientQuery.trim()}</Text>
                        <Text style={m.dropdownSub}>Not on Clocked · still counts toward your loops</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={m.primaryBtn}
                  onPress={() => {
                    if (!selectedClient && clientQuery.trim()) {
                      setSelectedClient({ id: null, name: clientQuery.trim() });
                    }
                    setStep(1);
                  }}
                >
                  <Text style={m.primaryBtnTxt}>
                    {selectedClient?.id ? `Continue with ${selectedClient.name}` : selectedClient?.isGuest ? `Log for Guest: ${selectedClient.name}` : 'Continue as Manual Entry'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 1: Course */}
            {step === 1 && (
              <View>
                <Text style={m.sectionLabel}>WHICH COURSE?</Text>
                <TextInput
                  style={m.input}
                  placeholder="Search courses..."
                  placeholderTextColor="#B8A88266"
                  value={courseQuery}
                  onChangeText={t => { setCourseQuery(t); setSelectedCourse(null); setCourseName(''); }}
                  autoFocus
                />
                {courseResults.length > 0 && (
                  <View style={m.dropdown}>
                    {courseResults.map(c => (
                      <TouchableOpacity
                        key={c.name}
                        style={m.dropdownItem}
                        onPress={() => {
                          setSelectedCourse(c);
                          setCourseName(c.name);
                          setCourseQuery(c.name);
                          setCourseResults([]);
                        }}
                      >
                        <CourseAvatar courseName={c.name} size={28} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={m.dropdownName}>{c.name}</Text>
                          <Text style={m.dropdownSub}>{[c.city, c.state].filter(Boolean).join(', ')}</Text>
                        </View>
                        {courseName === c.name && (
                          <Ionicons name="checkmark-circle" size={16} color="#7DC87A" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={m.navRow}>
                  <TouchableOpacity style={m.backBtn} onPress={() => setStep(0)}>
                    <Text style={m.backBtnTxt}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[m.primaryBtn, { flex: 1 }]}
                    onPress={() => {
                      if (!courseName && courseQuery.trim()) setCourseName(courseQuery.trim());
                      setStep(2);
                    }}
                  >
                    <Text style={m.primaryBtnTxt}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 2: Details */}
            {step === 2 && (
              <View>
                <Text style={m.sectionLabel}>ROUND DETAILS</Text>

                {/* Time pickers — side by side */}
                <View style={m.timePickerRow}>
                  <View style={m.timePickerCol}>
                    <Text style={m.timePickerLabel}>TEE TIME</Text>
                    <View style={m.timePickerBox}>
                      <CaddySlotPicker
                        times={CADDY_START_TIMES}
                        value={startTime}
                        onChange={setStartTime}
                      />
                    </View>
                    <Text style={m.timePickerValue}>{startTime}</Text>
                  </View>
                  <View style={m.timePickerArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#7DC87A66" />
                  </View>
                  <View style={m.timePickerCol}>
                    <Text style={m.timePickerLabel}>FINISH</Text>
                    <View style={m.timePickerBox}>
                      <CaddySlotPicker
                        times={CADDY_END_TIMES}
                        value={endTime}
                        onChange={setEndTime}
                      />
                    </View>
                    <Text style={m.timePickerValue}>{endTime}</Text>
                  </View>
                </View>

                <Text style={m.fieldLabel}>HOLES</Text>
                <View style={m.toggleRow}>
                  {['9', '18'].map(h => (
                    <TouchableOpacity
                      key={h} style={[m.toggleBtn, holes === h && m.toggleBtnActive]}
                      onPress={() => setHoles(h)}
                    >
                      <Text style={[m.toggleTxt, holes === h && m.toggleTxtActive]}>{h} Holes</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={m.fieldLabel}>TRANSPORT</Text>
                <View style={m.toggleRow}>
                  {['Cart', 'Walk'].map(t => (
                    <TouchableOpacity
                      key={t} style={[m.toggleBtn, transport === t && m.toggleBtnActive]}
                      onPress={() => setTransport(t)}
                    >
                      <Text style={[m.toggleTxt, transport === t && m.toggleTxtActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={m.fieldLabel}>PLAYERS IN GROUP</Text>
                <View style={m.toggleRow}>
                  {['1', '2', '3', '4', '5'].map(p => (
                    <TouchableOpacity
                      key={p} style={[m.toggleBtn, m.toggleBtnSm, players === p && m.toggleBtnActive]}
                      onPress={() => setPlayers(p)}
                    >
                      <Text style={[m.toggleTxt, players === p && m.toggleTxtActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes */}
                <Text style={m.fieldLabel}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[m.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
                  placeholder="e.g. Course was backed up, ranger on duty, fast group..."
                  placeholderTextColor="#B8A88266"
                  value={caddyNotes}
                  onChangeText={t => setCaddyNotes(t.slice(0, 200))}
                  multiline
                  maxLength={200}
                />
                {caddyNotes.length > 0 && (
                  <Text style={{ fontSize: 10, color: '#7A6E58', textAlign: 'right', marginTop: 2, marginBottom: 8 }}>
                    {caddyNotes.length}/200
                  </Text>
                )}

                {/* Summary */}
                <View style={m.summaryCard}>
                  <Text style={m.summaryRow}>
                    <Text style={m.summaryLabel}>Client   </Text>
                    <Text style={m.summaryVal}>{selectedClient?.name || clientQuery || '—'}</Text>
                  </Text>
                  <Text style={m.summaryRow}>
                    <Text style={m.summaryLabel}>Course  </Text>
                    <Text style={m.summaryVal}>{courseName || courseQuery || '—'}</Text>
                  </Text>
                  <Text style={m.summaryRow}>
                    <Text style={m.summaryLabel}>Time     </Text>
                    <Text style={m.summaryVal}>{startTime || '—'} → {endTime || '—'}</Text>
                  </Text>
                  <Text style={m.summaryRow}>
                    <Text style={m.summaryLabel}>Format  </Text>
                    <Text style={m.summaryVal}>{holes} holes · {transport} · {players}P</Text>
                  </Text>
                </View>

                <View style={m.navRow}>
                  <TouchableOpacity style={m.backBtn} onPress={() => setStep(1)}>
                    <Text style={m.backBtnTxt}>← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[m.primaryBtn, { flex: 1 }, submitting && { opacity: 0.5 }]}
                    onPress={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting
                      ? <ActivityIndicator color="#090F0A" />
                      : <Text style={m.primaryBtnTxt}>✓ LOG ROUND</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Today Tab ─────────────────────────────────────────────────────────────────

function TodayTab({ caddyId, navigation, onLogSuccess, profile }) {
  const [todayRounds, setTodayRounds]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [timerActive, setTimerActive]   = useState(false);
  const [timerStart, setTimerStart]     = useState(null);
  const [elapsed, setElapsed]           = useState(0);
  const [showLogModal, setShowLogModal] = useState(false);
  const [challenge, setChallenge]       = useState(null);
  const [myLoops, setMyLoops]           = useState(0);
  const [leaderLoops, setLeaderLoops]   = useState(0);
  const [myNatRank, setMyNatRank]       = useState(null);
  const intervalRef = useRef(null);

  const fetchToday = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('rounds')
        .select('id, course_name, client_name, client_user_id, duration_minutes, holes, transport, players, tee_time, created_at, caddy_rating')
        .eq('caddy_id', caddyId)
        .gte('created_at', todayStart())
        .order('created_at', { ascending: false });
      setTodayRounds(data ?? []);
    } catch (e) {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  const fetchChallenge = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const ms = new Date(); ms.setDate(1); ms.setHours(0,0,0,0);

      // Get national challenge
      const { data: challenges } = await supabase
        .from('caddy_challenges')
        .select('*')
        .eq('is_active', true)
        .gte('end_date', today)
        .order('prize_amount', { ascending: false })
        .limit(1)
        .maybeSingle();
      setChallenge(challenges || null);

      if (!challenges) return;

      // Count this month's rounds for all caddies
      const { data: rounds } = await supabase
        .from('rounds')
        .select('caddy_id')
        .not('caddy_id', 'is', null)
        .gte('created_at', ms.toISOString());

      const countMap = {};
      for (const r of (rounds || [])) {
        countMap[r.caddy_id] = (countMap[r.caddy_id] || 0) + 1;
      }
      const myCnt = countMap[caddyId] || 0;
      const maxCnt = Math.max(0, ...Object.values(countMap));
      setMyLoops(myCnt);
      setLeaderLoops(maxCnt);

      // My national rank by loops
      const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
      const myRankIdx = sorted.findIndex(([id]) => id === caddyId);
      setMyNatRank(myRankIdx >= 0 ? myRankIdx + 1 : null);
    } catch (e) {
      // silent fail
    }
  };

  useFocusEffect(useCallback(() => { fetchToday(); fetchChallenge(); }, []));

  // Timer
  useEffect(() => {
    if (timerActive && timerStart) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerActive, timerStart]);

  const handleStartTimer = () => {
    setTimerStart(new Date());
    setElapsed(0);
    setTimerActive(true);
  };

  const handleStopTimer = () => {
    setTimerActive(false);
    const mins = Math.round(elapsed / 60);
    Alert.alert(
      'Round Complete',
      `Elapsed: ${formatDuration(mins)}\nWould you like to log this round?`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => { setTimerStart(null); setElapsed(0); } },
        { text: 'Log it →', onPress: () => { setTimerStart(null); setElapsed(0); setShowLogModal(true); } },
      ]
    );
  };

  const daysLeft = challenge
    ? Math.max(0, Math.ceil((new Date(challenge.end_date + 'T23:59:59') - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;
  const gap = leaderLoops > myLoops ? leaderLoops - myLoops : 0;
  const progress = leaderLoops > 0 ? Math.min(1, myLoops / leaderLoops) : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* Challenge Widget */}
      {challenge && (
        <View style={d.challengeWidget}>
          <View style={d.challengeWidgetTop}>
            <View style={d.challengeWidgetIcon}>
              <Ionicons name="trophy" size={16} color="#C9A84C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={d.challengeWidgetTitle}>{challenge.title}</Text>
              <Text style={d.challengeWidgetPrize}>{challenge.prize_description}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={d.challengeWidgetDays}>{daysLeft}</Text>
              <Text style={d.challengeWidgetDaysLabel}>DAYS</Text>
            </View>
          </View>
          {/* Progress bar */}
          <View style={d.challengeProgressTrack}>
            <View style={[d.challengeProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 }}>
            <Text style={d.challengeProgressLabel}>
              {myNatRank != null ? `#${myNatRank} nationally` : 'Not ranked yet'}
            </Text>
            <Text style={d.challengeProgressLabel}>
              {gap > 0 ? `${gap} rounds behind leader` : myLoops > 0 ? 'You are the leader!' : 'Log first round'}
            </Text>
          </View>
          <TouchableOpacity style={d.challengeLogBtn} onPress={() => setShowLogModal(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={14} color="#090F0A" />
            <Text style={d.challengeLogBtnTxt}>LOG A ROUND NOW</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active Round Timer */}
      <View style={d.timerCard}>
        <Text style={d.timerLabel}>ROUND TIMER</Text>
        {timerActive ? (
          <>
            <Text style={d.timerDisplay}>{formatElapsed(elapsed)}</Text>
            <TouchableOpacity style={d.timerStopBtn} onPress={handleStopTimer} activeOpacity={0.8}>
              <Ionicons name="stop-circle" size={18} color="#090F0A" />
              <Text style={d.timerStopTxt}>STOP & LOG</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={d.timerIdle}>00:00:00</Text>
            <TouchableOpacity style={d.timerStartBtn} onPress={handleStartTimer} activeOpacity={0.8}>
              <Ionicons name="play-circle" size={18} color="#090F0A" />
              <Text style={d.timerStartTxt}>START ROUND</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Quick Log */}
      <TouchableOpacity style={d.logBtn} onPress={() => setShowLogModal(true)} activeOpacity={0.8}>
        <Ionicons name="add-circle" size={20} color="#090F0A" />
        <Text style={d.logBtnTxt}>LOG A COMPLETED ROUND</Text>
      </TouchableOpacity>

      {/* Today's rounds */}
      <Text style={d.sectionLabel}>TODAY'S ROUNDS</Text>
      {loading ? (
        <>
          {[0,1].map(i => <SkeletonLoader key={i} width="100%" height={72} style={{ borderRadius: 12, marginBottom: 8 }} />)}
        </>
      ) : todayRounds.length === 0 ? (
        <View style={d.welcomeCard}>
          <Ionicons name="sunny" size={32} color="#C9A84C" style={{ marginBottom: 12 }} />
          <Text style={d.welcomeTitle}>Ready to start your day?</Text>
          <Text style={d.welcomeSub}>
            Every round you log builds your reputation and enters you in the $1,500 national challenge.
          </Text>
          <TouchableOpacity style={d.welcomeLogBtn} onPress={() => setShowLogModal(true)} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={18} color="#090F0A" />
            <Text style={d.welcomeLogBtnTxt}>LOG YOUR FIRST ROUND</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Quick stats bar — Improvement 2 */}
          {(() => {
            const totalMins = todayRounds.reduce((s, r) => s + (r.duration_minutes || 0), 0);
            const avgMins = Math.round(totalMins / todayRounds.length);
            return (
              <View style={d.todayStatsBar}>
                <View style={d.todayStatItem}>
                  <Text style={d.todayStatNum}>{todayRounds.length}</Text>
                  <Text style={d.todayStatLabel}>ROUNDS TODAY</Text>
                </View>
                <View style={d.todayStatDivider} />
                <View style={d.todayStatItem}>
                  <Text style={d.todayStatNum}>{formatDuration(totalMins)}</Text>
                  <Text style={d.todayStatLabel}>HOURS ON COURSE</Text>
                </View>
                <View style={d.todayStatDivider} />
                <View style={d.todayStatItem}>
                  <Text style={d.todayStatNum}>{formatDuration(avgMins)}</Text>
                  <Text style={d.todayStatLabel}>AVG PACE</Text>
                </View>
              </View>
            );
          })()}
          {todayRounds.map((r, i) => (
            <View key={r.id ?? i} style={d.roundCard}>
              <CourseAvatar courseName={r.course_name} size={36} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={d.roundCourse}>{r.course_name}</Text>
                <Text style={d.roundMeta}>
                  {r.client_name || 'Client'} · {r.holes || '18'}H · {r.transport || ''} · {formatDuration(r.duration_minutes)}
                </Text>
              </View>
              {r.caddy_rating != null && (
                <View style={{ alignItems: 'flex-end' }}>
                  <StarRow rating={r.caddy_rating} size={11} />
                  <Text style={[d.roundRating, { color: ratingColor(r.caddy_rating) }]}>
                    {r.caddy_rating.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      <QuickLogModal
        visible={showLogModal}
        onClose={() => setShowLogModal(false)}
        caddyId={caddyId}
        onSuccess={() => { setShowLogModal(false); fetchToday(); onLogSuccess?.(); }}
      />
    </ScrollView>
  );
}

// ─── My Clients Tab ───────────────────────────────────────────────────────────

function ClientsTab({ caddyId }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // expanded client id
  const [clientRounds, setClientRounds] = useState([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('rounds')
          .select('id, course_name, client_name, client_user_id, duration_minutes, created_at, caddy_rating')
          .eq('caddy_id', caddyId)
          .order('created_at', { ascending: false });

        if (!data) { setClients([]); return; }

        // Group by client_user_id (PlayThru) or client_name (manual)
        const map = {};
        for (const r of data) {
          const key = r.client_user_id ?? `manual:${r.client_name ?? 'Unknown'}`;
          if (!map[key]) {
            map[key] = {
              key,
              userId: r.client_user_id,
              name: r.client_name || 'Manual Client',
              rounds: 0,
              lastDate: r.created_at,
              totalRating: 0,
              ratingCount: 0,
            };
          }
          map[key].rounds++;
          if (r.created_at > map[key].lastDate) map[key].lastDate = r.created_at;
          if (r.caddy_rating != null) {
            map[key].totalRating += r.caddy_rating;
            map[key].ratingCount++;
          }
        }

        // Fetch PlayThru profile names + POPScores for known users
        const userIds = Object.values(map)
          .filter(c => c.userId)
          .map(c => c.userId);
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, username, pop_score')
            .in('id', userIds);
          profiles?.forEach(p => {
            const key = p.id;
            if (map[key]) {
              map[key].name = p.full_name || p.username || map[key].name;
              map[key].popScore = p.pop_score;
            }
          });
        }

        setClients(Object.values(map).sort((a, b) => b.lastDate.localeCompare(a.lastDate)));
      } catch (e) {
        // silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  const loadClientRounds = async (key, userId, clientName) => {
    if (selected === key) { setSelected(null); return; }
    setSelected(key);
    const q = supabase
      .from('rounds')
      .select('id, course_name, duration_minutes, caddy_rating, created_at')
      .eq('caddy_id', caddyId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (userId) q.eq('client_user_id', userId);
    else        q.eq('client_name', clientName);
    const { data } = await q;
    setClientRounds(data ?? []);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={d.sectionLabel}>ALL CLIENTS ({clients.length})</Text>
      {loading ? (
        <>
          {[0,1,2,3].map(i => <SkeletonLoader key={i} width="100%" height={72} style={{ borderRadius: 12, marginBottom: 8 }} />)}
        </>
      ) : clients.length === 0 ? (
        <View style={d.emptyBox}>
          <Ionicons name="people-outline" size={36} color="#7DC87A44" style={{ marginBottom: 10 }} />
          <Text style={d.emptyTxt}>No clients yet. Log your first round to get started.</Text>
        </View>
      ) : (
        clients.map(c => (
          <View key={c.key}>
            <TouchableOpacity
              style={d.clientCard}
              onPress={() => loadClientRounds(c.key, c.userId, c.name)}
              activeOpacity={0.8}
            >
              {/* Avatar initial */}
              <View style={d.clientAvatar}>
                <Text style={d.clientInitial}>{(c.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={d.clientName}>{c.name}</Text>
                <Text style={d.clientMeta}>
                  {c.rounds} round{c.rounds !== 1 ? 's' : ''}
                  {c.popScore != null ? ` · Clocked Score ${c.popScore.toFixed(1)}` : ''}
                  {' · Last '}
                  {formatShortDate(c.lastDate)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {c.ratingCount > 0 && (
                  <StarRow rating={c.totalRating / c.ratingCount} size={11} />
                )}
                <Ionicons
                  name={selected === c.key ? 'chevron-up' : 'chevron-down'}
                  size={14} color="#B8A882"
                />
              </View>
            </TouchableOpacity>

            {/* Expanded round history */}
            {selected === c.key && (
              <View style={d.expandedBox}>
                {clientRounds.map((r, i) => (
                  <View key={r.id ?? i} style={[d.miniRound, i > 0 && d.miniRoundBorder]}>
                    <Ionicons name="golf" size={11} color="#7DC87A" style={{ marginRight: 6 }} />
                    <Text style={d.miniRoundCourse} numberOfLines={1}>{r.course_name}</Text>
                    <Text style={d.miniRoundMeta}>{formatShortDate(r.created_at)}</Text>
                    <Text style={d.miniRoundDuration}>{formatDuration(r.duration_minutes)}</Text>
                  </View>
                ))}
                {!c.userId && (
                  <TouchableOpacity style={d.inviteBtn} activeOpacity={0.8}
                    onPress={() => Alert.alert('Invite', `Share link for ${c.name} — coming soon.`)}>
                    <Ionicons name="share-outline" size={13} color="#7DC87A" />
                    <Text style={d.inviteTxt}>INVITE TO CLOCKED</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────────────────────

function StatsTab({ caddyId, profile, courseRank, nationalRank, signOut }) {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('rounds')
          .select('id, course_name, client_user_id, client_name, duration_minutes, caddy_rating, created_at')
          .eq('caddy_id', caddyId);
        if (!data) { setStats(null); setLoading(false); return; }

        const totalRounds = data.length;
        const uniqueClients = new Set(
          data.map(r => r.client_user_id ?? `m:${r.client_name}`)
        ).size;

        // Most worked course
        const courseCounts = {};
        data.forEach(r => { courseCounts[r.course_name] = (courseCounts[r.course_name] || 0) + 1; });
        const topCourse = Object.entries(courseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

        // Avg client POPScore (from PlayThru clients only)
        const clientIds = [...new Set(data.filter(r => r.client_user_id).map(r => r.client_user_id))];
        let avgClientPop = null;
        if (clientIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles').select('pop_score').in('id', clientIds);
          const scores = (profs ?? []).filter(p => p.pop_score != null).map(p => p.pop_score);
          if (scores.length > 0) avgClientPop = scores.reduce((a, b) => a + b, 0) / scores.length;
        }

        // Ratings breakdown
        const rated = data.filter(r => r.caddy_rating != null);
        const avgRating = rated.length > 0
          ? rated.reduce((s, r) => s + r.caddy_rating, 0) / rated.length
          : null;

        setStats({ totalRounds, uniqueClients, topCourse, avgClientPop, avgRating, ratedCount: rated.length });
      } catch (e) {
        // silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  const caddyRating = (profile?.caddy_rating && profile.caddy_rating > 0) ? profile.caddy_rating : null;
  const caddyCourse = profile?.caddy_course ?? '';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>

      {/* Rating Gauge */}
      <View style={d.gaugeCard}>
        {caddyRating != null ? (
          <>
            <Gauge score={caddyRating} />
            <Text style={d.gaugeLabel}>CADDY RATING</Text>
            <StarRow rating={caddyRating} size={18} />
            <Text style={d.gaugeSubtext}>{caddyRating.toFixed(1)} / 5.0</Text>
          </>
        ) : (
          <>
            <Text style={d.gaugeLabel}>CADDY RATING</Text>
            <Text style={d.unratedText}>Unrated</Text>
            <Text style={d.unratedSub}>Log rounds to earn your first rating</Text>
          </>
        )}
      </View>

      {loading ? (
        <View style={{ gap: 10 }}>
          {[0,1,2].map(i => <SkeletonLoader key={i} width="100%" height={80} style={{ borderRadius: 14 }} />)}
        </View>
      ) : stats ? (
        <>
          {/* Stats grid */}
          <View style={d.statsGrid}>
            <View style={d.statCard}>
              <Text style={d.statVal}>{stats.totalRounds}</Text>
              <Text style={d.statLbl}>ROUNDS{'\n'}LOOPED</Text>
            </View>
            <View style={d.statCard}>
              <Text style={d.statVal}>{stats.uniqueClients}</Text>
              <Text style={d.statLbl}>UNIQUE{'\n'}CLIENTS</Text>
            </View>
            <View style={d.statCard}>
              <Text style={[d.statVal, { fontSize: 15 }]}>
                {stats.avgClientPop != null ? stats.avgClientPop.toFixed(1) : '—'}
              </Text>
              <Text style={d.statLbl}>AVG CLIENT{'\n'}CLOCKED SCORE</Text>
            </View>
          </View>

          {/* Top course */}
          <View style={d.infoCard}>
            <Ionicons name="location" size={16} color="#7DC87A" style={{ marginRight: 8 }} />
            <View>
              <Text style={d.infoLabel}>MOST WORKED COURSE</Text>
              <Text style={d.infoValue}>{stats.topCourse}</Text>
            </View>
          </View>

          {/* Ranking */}
          <View style={d.card}>
            <Text style={d.cardLabel}>YOUR CADDY RANKING</Text>
            <View style={d.rankRow}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={d.rankNum}>{courseRank != null ? `#${courseRank}` : '—'}</Text>
                <Text style={d.rankSub}>
                  AT {caddyCourse ? caddyCourse.toUpperCase() : 'COURSE'}
                </Text>
              </View>
              <View style={{ width: 1, height: 50, backgroundColor: '#7DC87A22' }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={d.rankNum}>{nationalRank != null ? `#${nationalRank}` : '—'}</Text>
                <Text style={d.rankSub}>NATIONAL</Text>
              </View>
            </View>
          </View>

          {/* Ratings breakdown */}
          {stats.ratedCount > 0 && (
            <View style={d.card}>
              <Text style={d.cardLabel}>RATING BREAKDOWN</Text>
              {[5,4,3,2,1].map(star => {
                // We don't have per-star counts here so just show avg + count
                return null;
              })}
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={[d.rankNum, { color: ratingColor(stats.avgRating ?? 0) }]}>
                  {stats.avgRating?.toFixed(2) ?? '—'}
                </Text>
                <Text style={d.rankSub}>AVERAGE FROM {stats.ratedCount} RATINGS</Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={d.emptyBox}>
          <Text style={d.emptyTxt}>Log rounds to see your stats.</Text>
        </View>
      )}

      {/* Account actions */}
      <View style={d.accountSection}>
        <TouchableOpacity
          style={d.switchModeBtn}
          onPress={() =>
            Alert.alert(
              'Switch to Golfer Mode',
              'Sign in with a golfer account to access the golfer experience.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: signOut },
              ]
            )
          }
          activeOpacity={0.8}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color="#B8A882" />
          <Text style={d.switchModeTxt}>Switch to Golfer Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={d.signOutBtn}
          onPress={() =>
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: signOut },
            ])
          }
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={16} color="#E24B4A" />
          <Text style={d.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

// ─── Ambassador Rewards Tab ──────────────────────────────────────────────────
function RewardsTab({ caddyId }) {
  const [tiers, setTiers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [myScore, setMyScore]   = useState(0);

  useEffect(() => {
    (async () => {
      try {
        // Fetch rewards config
        const { data: configRow } = await supabase
          .from('app_config').select('value')
          .eq('key', 'clocked_ambassador_rewards').maybeSingle();
        if (configRow?.value) {
          const parsed = JSON.parse(configRow.value);
          setTiers(parsed.tiers ?? []);
        }

        // Compute ambassador score: rounds operated + referrals
        if (caddyId) {
          const [roundsRes, profileRes] = await Promise.all([
            supabase.from('rounds').select('id', { count: 'exact', head: true })
              .eq('caddy_id', caddyId).eq('round_format', 'clocked'),
            supabase.from('profiles').select('referral_count').eq('id', caddyId).maybeSingle(),
          ]);
          setMyScore((roundsRes.count ?? 0) + (profileRes.data?.referral_count ?? 0));
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [caddyId]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
        <ActivityIndicator color="#C9A84C" />
      </View>
    );
  }

  // Determine current tier
  const sortedTiers = [...tiers].sort((a, b) => b.threshold - a.threshold);
  const currentTier = sortedTiers.find(t => myScore >= t.threshold) ?? null;

  return (
    <ScrollView contentContainerStyle={rw.container}>
      {/* Score header */}
      <View style={rw.scoreCard}>
        <Text style={rw.scoreLabel}>YOUR AMBASSADOR SCORE</Text>
        <Text style={rw.scoreValue}>{myScore}</Text>
        <Text style={rw.scoreSub}>rounds operated + players referred</Text>
      </View>

      {/* Tiers */}
      {tiers.map((tier, i) => {
        const isCurrent = currentTier?.name === tier.name;
        const isLocked = myScore < tier.threshold;
        return (
          <View key={i} style={[rw.tierCard, isCurrent && rw.tierCardCurrent, isLocked && rw.tierCardLocked]}>
            <View style={rw.tierHeader}>
              <View style={rw.tierNameRow}>
                <Ionicons
                  name={isCurrent ? 'checkmark-circle' : isLocked ? 'lock-closed-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={isCurrent ? '#7DC87A' : isLocked ? '#7A6E58' : '#C9A84C'}
                />
                <Text style={[rw.tierName, isCurrent && rw.tierNameCurrent, isLocked && rw.tierNameLocked]}>
                  {tier.name}
                </Text>
              </View>
              <Text style={[rw.tierThreshold, isLocked && rw.tierThresholdLocked]}>
                {tier.threshold === 0 ? 'Start' : `${tier.threshold}+ pts`}
              </Text>
            </View>
            {(tier.perks ?? []).map((perk, j) => (
              <View key={j} style={rw.perkRow}>
                <View style={[rw.perkDot, isLocked && rw.perkDotLocked]} />
                <Text style={[rw.perkText, isLocked && rw.perkTextLocked]}>{perk}</Text>
              </View>
            ))}
            {isCurrent && (
              <View style={rw.currentBadge}>
                <Text style={rw.currentBadgeText}>CURRENT TIER</Text>
              </View>
            )}
          </View>
        );
      })}

      {tiers.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Text style={{ fontSize: 14, color: '#7A6E58' }}>Rewards coming soon.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const rw = StyleSheet.create({
  container:      { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  scoreCard:      { alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#C9A84C33', padding: 20, marginBottom: 16 },
  scoreLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 6 },
  scoreValue:     { fontSize: 48, fontWeight: '200', color: '#F5EDD8', fontVariant: ['tabular-nums'] },
  scoreSub:       { fontSize: 10, color: '#7A6E58', marginTop: 4 },
  tierCard:       { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10 },
  tierCardCurrent:{ borderColor: '#7DC87A', backgroundColor: '#7DC87A08' },
  tierCardLocked: { opacity: 0.55 },
  tierHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tierNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierName:       { fontSize: 15, fontWeight: '700', color: '#F5EDD8' },
  tierNameCurrent:{ color: '#7DC87A' },
  tierNameLocked: { color: '#7A6E58' },
  tierThreshold:  { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 1 },
  tierThresholdLocked: { color: '#7A6E58' },
  perkRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  perkDot:        { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#C9A84C' },
  perkDotLocked:  { backgroundColor: '#7A6E58' },
  perkText:       { fontSize: 13, color: '#B8A882', lineHeight: 18 },
  perkTextLocked: { color: '#7A6E58' },
  currentBadge:   { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#7DC87A22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  currentBadgeText:{ fontSize: 8, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
});

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function CaddyDashboardScreen({ navigation }) {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const [activeTab, setActiveTab]         = useState('today');
  const [courseRank, setCourseRank]       = useState(null);
  const [nationalRank, setNationalRank]   = useState(null);
  const [logTick, setLogTick]             = useState(0); // bump to refresh stats

  useFocusEffect(useCallback(() => {
    refreshProfile();
    if (profile?.caddy_course && profile?.caddy_rating != null) {
      Promise.all([
        supabase.from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('account_type', 'caddy')
          .eq('caddy_course', profile.caddy_course)
          .gt('caddy_rating', profile.caddy_rating),
        supabase.from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('account_type', 'caddy')
          .gt('caddy_rating', profile.caddy_rating),
      ]).then(([courseRes, natRes]) => {
        setCourseRank((courseRes.count ?? 0) + 1);
        setNationalRank((natRes.count ?? 0) + 1);
      });
    }
  }, [profile?.caddy_rating, profile?.caddy_course]));

  const caddyId    = user?.id;
  const firstName  = profile?.full_name?.split(' ')[0] ?? '';
  const caddyCourse = profile?.caddy_course ?? '';
  const TABS = [
    { key: 'today',   label: 'TODAY',      icon: 'sunny-outline' },
    { key: 'clients', label: 'MY CLIENTS', icon: 'people-outline' },
    { key: 'rewards', label: 'REWARDS',    icon: 'gift-outline' },
    { key: 'stats',   label: 'STATS',      icon: 'stats-chart-outline' },
  ];

  return (
    <SafeAreaView style={d.container}>

      {/* Header */}
      <View style={d.header}>
        <View>
          <Text style={d.wordmark}>CLOCKED</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <Text style={d.name}>{firstName}</Text>
            <View style={d.ambassadorBadge}><Text style={d.ambassadorBadgeText}>AMBASSADOR</Text></View>
          </View>
          {!!caddyCourse && <Text style={d.courseSub}>{caddyCourse}</Text>}
        </View>
        <InitialsAvatar name={profile?.full_name} size={44} avatarUrl={profile?.avatar_url} />
      </View>

      {/* Operate a round CTA */}
      <TouchableOpacity
        style={d.operateBtn}
        onPress={() => navigation.getParent()?.navigate('ClockedSetup') ?? navigation.navigate('ClockedSetup')}
        activeOpacity={0.85}
      >
        <Ionicons name="timer-outline" size={18} color="#090F0A" />
        <Text style={d.operateBtnText}>OPERATE ON THE CLOCK</Text>
      </TouchableOpacity>

      {/* Tab bar */}
      <View style={d.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[d.tab, activeTab === t.key && d.tabActive]}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.8}
          >
            <Ionicons name={t.icon} size={14} color={activeTab === t.key ? '#7DC87A' : '#B8A88266'} />
            <Text style={[d.tabTxt, activeTab === t.key && d.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'today' && (
        <TodayTab
          caddyId={caddyId}
          navigation={navigation}
          profile={profile}
          onLogSuccess={() => setLogTick(n => n + 1)}
        />
      )}
      {activeTab === 'clients' && (
        <ClientsTab caddyId={caddyId} />
      )}
      {activeTab === 'rewards' && (
        <RewardsTab caddyId={caddyId} />
      )}
      {activeTab === 'stats' && (
        <StatsTab
          caddyId={caddyId}
          profile={profile}
          courseRank={courseRank}
          nationalRank={nationalRank}
          signOut={signOut}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  header:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  wordmark:     { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 2 },
  name:         { fontSize: 20, fontWeight: '600', color: '#F5EDD8' },
  caddyBadge:   { backgroundColor: '#7DC87A', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  caddyBadgeText:{ fontSize: 8, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  ambassadorBadge:   { backgroundColor: '#7DC87A', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2 },
  ambassadorBadgeText:{ fontSize: 8, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  operateBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginVertical: 10, backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14 },
  operateBtnText:{ fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  courseSub:    { fontSize: 10, color: '#B8A882', marginTop: 2 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#7DC87A22', borderWidth: 1, borderColor: '#7DC87A', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarInitials:{ fontSize: 16, fontWeight: '600', color: '#7DC87A' },
  avatarCameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: '#7DC87A', alignItems: 'center', justifyContent: 'center' },

  // Tab bar
  tabBar:       { flexDirection: 'row', backgroundColor: '#0D1A0F', borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  tab:          { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, flexDirection: 'row', justifyContent: 'center' },
  tabActive:    { borderBottomWidth: 2, borderBottomColor: '#7DC87A' },
  tabTxt:       { fontSize: 9, fontWeight: '700', color: '#B8A88266', letterSpacing: 1.5 },
  tabTxtActive: { color: '#7DC87A' },

  // Section labels
  sectionLabel: { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 10, marginTop: 4 },

  // Challenge widget
  challengeWidget:        { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#C9A84C44', padding: 14, marginBottom: 14 },
  challengeWidgetTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  challengeWidgetIcon:    { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center' },
  challengeWidgetTitle:   { fontSize: 13, fontWeight: '700', color: '#F5EDD8', marginBottom: 2 },
  challengeWidgetPrize:   { fontSize: 11, color: '#C9A84C', fontWeight: '500' },
  challengeWidgetDays:    { fontSize: 22, fontWeight: '300', color: '#7DC87A', lineHeight: 24 },
  challengeWidgetDaysLabel: { fontSize: 8, fontWeight: '700', color: '#7DC87A88', letterSpacing: 1.5 },
  challengeProgressTrack: { height: 4, backgroundColor: 'rgba(125,200,122,0.15)', borderRadius: 2 },
  challengeProgressFill:  { height: 4, backgroundColor: '#7DC87A', borderRadius: 2 },
  challengeProgressLabel: { fontSize: 10, color: '#B8A882' },
  challengeLogBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7DC87A', borderRadius: 10, paddingVertical: 9 },
  challengeLogBtnTxt:     { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // Timer card
  timerCard:    { backgroundColor: '#0D1A0F', borderRadius: 16, padding: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#7DC87A22' },
  timerLabel:   { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 8 },
  timerDisplay: { fontSize: 48, fontFamily: 'Georgia', color: '#7DC87A', lineHeight: 54, marginBottom: 14 },
  timerIdle:    { fontSize: 48, fontFamily: 'Georgia', color: '#B8A88244', lineHeight: 54, marginBottom: 14 },
  timerStartBtn:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7DC87A', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  timerStartTxt:{ fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  timerStopBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#C07A6A', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  timerStopTxt: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // Log button
  logBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#7DC87A', borderRadius: 14, paddingVertical: 14, marginBottom: 18 },
  logBtnTxt:    { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // Round card (today + stats)
  roundCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#7DC87A22' },
  roundCourse:  { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  roundMeta:    { fontSize: 11, color: '#B8A882', marginTop: 2 },
  roundRating:  { fontSize: 11, fontWeight: '600' },

  // Client card
  clientCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: '#7DC87A22' },
  clientAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#162B19', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#7DC87A33', marginRight: 10 },
  clientInitial:{ fontSize: 16, fontWeight: '700', color: '#7DC87A' },
  clientName:   { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  clientMeta:   { fontSize: 11, color: '#B8A882', marginTop: 2 },
  expandedBox:  { backgroundColor: '#111D12', borderRadius: 10, padding: 10, marginBottom: 8, marginTop: -4 },
  miniRound:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  miniRoundBorder: { borderTopWidth: 1, borderTopColor: '#7DC87A11' },
  miniRoundCourse: { flex: 1, fontSize: 12, color: '#F5EDD8' },
  miniRoundMeta:   { fontSize: 10, color: '#B8A882', marginRight: 8 },
  miniRoundDuration:{ fontSize: 11, color: '#7DC87A' },
  inviteBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#7DC87A22' },
  inviteTxt:    { fontSize: 10, fontWeight: '700', color: '#7DC87A', letterSpacing: 1 },

  // Stats tab
  gaugeCard:    { backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: '#7DC87A22' },
  gaugeLabel:   { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 3, marginTop: 8, marginBottom: 8 },
  gaugeSubtext: { fontSize: 12, color: '#B8A882', marginTop: 6 },
  unratedText:  { fontSize: 28, fontWeight: '300', color: '#B8A88266', marginTop: 12, marginBottom: 4 },
  unratedSub:   { fontSize: 11, color: '#7A6E58', textAlign: 'center' },
  statsGrid:    { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard:     { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#7DC87A22' },
  statVal:      { fontSize: 26, fontWeight: '300', color: '#F5EDD8', fontFamily: 'Georgia', marginBottom: 4 },
  statLbl:      { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1, textAlign: 'center' },
  infoCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#7DC87A22' },
  infoLabel:    { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1.5, marginBottom: 3 },
  infoValue:    { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  card:         { backgroundColor: '#0D1A0F', borderRadius: 16, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: '#7DC87A22' },
  cardLabel:    { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 12 },
  rankRow:      { flexDirection: 'row', alignItems: 'center' },
  rankNum:      { fontSize: 36, fontWeight: '300', color: '#F5EDD8', marginBottom: 4 },
  rankSub:      { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1.5, textAlign: 'center' },

  // Empty
  emptyBox:     { alignItems: 'center', paddingVertical: 40 },
  emptyTxt:     { fontSize: 14, color: '#7A6E58', textAlign: 'center', lineHeight: 20 },

  // Account actions (Stats tab bottom)
  accountSection: { marginTop: 24, gap: 10, paddingBottom: 8 },
  switchModeBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#B8A88244', borderRadius: 12, paddingVertical: 14 },
  switchModeTxt:  { fontSize: 13, fontWeight: '600', color: '#B8A882' },
  signOutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#E24B4A66', borderRadius: 12, paddingVertical: 14 },
  signOutTxt:     { fontSize: 13, fontWeight: '600', color: '#E24B4A' },

  // Welcome card (Improvement 4 — first-time empty state)
  welcomeCard:      { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A33', padding: 24, alignItems: 'center', marginBottom: 12 },
  welcomeTitle:     { fontSize: 18, fontWeight: '700', color: '#F5EDD8', textAlign: 'center', marginBottom: 8 },
  welcomeSub:       { fontSize: 13, color: '#B8A882', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  welcomeLogBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7DC87A', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  welcomeLogBtnTxt: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // Today quick stats bar (Improvement 2)
  todayStatsBar:   { flexDirection: 'row', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 12, marginBottom: 12 },
  todayStatItem:   { flex: 1, alignItems: 'center' },
  todayStatNum:    { fontSize: 15, fontWeight: '600', color: '#F5EDD8' },
  todayStatLabel:  { fontSize: 8, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginTop: 2 },
  todayStatDivider:{ width: 1, backgroundColor: '#7DC87A22', marginVertical: 4 },
});

// ─── Modal styles ─────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  closeBtn:     { padding: 4 },
  title:        { fontSize: 11, fontWeight: '700', color: '#7DC87A', letterSpacing: 3 },
  stepRow:      { flexDirection: 'row', justifyContent: 'center', gap: 32, padding: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  stepItem:     { alignItems: 'center', gap: 4 },
  stepDot:      { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A44', alignItems: 'center', justifyContent: 'center' },
  stepDotActive:{ backgroundColor: '#7DC87A', borderColor: '#7DC87A' },
  stepDotNum:   { fontSize: 11, fontWeight: '700', color: '#7DC87A' },
  stepLabel:    { fontSize: 9, fontWeight: '700', color: '#B8A88266', letterSpacing: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 12 },
  input:        { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 12, padding: 14, color: '#F5EDD8', fontSize: 15, marginBottom: 12 },
  fieldLabel:   { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 1.5, marginBottom: 6, marginTop: 4 },
  dropdown:     { backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', marginBottom: 12, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  dropdownName: { fontSize: 14, color: '#F5EDD8', fontWeight: '500' },
  dropdownSub:  { fontSize: 11, color: '#B8A882', marginTop: 1 },
  toggleRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toggleBtn:    { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  toggleBtnSm:  { flex: 0, width: 48 },
  toggleBtnActive:{ backgroundColor: '#7DC87A33', borderColor: '#7DC87A' },
  toggleTxt:    { fontSize: 13, color: '#B8A882', fontWeight: '500' },
  toggleTxtActive:{ color: '#7DC87A', fontWeight: '700' },
  summaryCard:  { backgroundColor: '#0D1A0F', borderRadius: 12, padding: 16, marginVertical: 14, gap: 8, borderWidth: 1, borderColor: '#7DC87A22' },
  summaryRow:   { fontSize: 13, color: '#F5EDD8', lineHeight: 20 },
  summaryLabel: { color: '#B8A882', fontWeight: '700' },
  summaryVal:   { color: '#F5EDD8' },
  navRow:       { flexDirection: 'row', gap: 10, marginTop: 8 },
  backBtn:      { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A33' },
  backBtnTxt:   { fontSize: 13, color: '#7DC87A', fontWeight: '600' },
  primaryBtn:   { backgroundColor: '#7DC87A', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnTxt:{ fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 1 },

  // Time scroll picker
  timePickerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  timePickerCol:   { flex: 1, alignItems: 'center' },
  timePickerLabel: { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 6 },
  timePickerBox:   { width: '100%', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A33', overflow: 'hidden' },
  timePickerValue: { fontSize: 11, color: '#C9A84C', fontWeight: '600', marginTop: 6, letterSpacing: 0.5 },
  timePickerArrow: { paddingHorizontal: 8, paddingTop: 20 },
  pickerBand:      {
    position: 'absolute', left: 0, right: 0,
    top: PICKER_H / 2 - SLOT_H / 2,
    height: SLOT_H,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#C9A84C33',
    backgroundColor: 'rgba(201,168,76,0.04)',
    zIndex: 1,
  },
});
