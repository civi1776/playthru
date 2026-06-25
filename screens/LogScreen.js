/*
 * SQL — add new columns to rounds table (run in Supabase):
 *
 * alter table rounds
 *   add column if not exists pace_delay                  text,
 *   add column if not exists caddy_logged                boolean default false,
 *   add column if not exists caddy_group                 jsonb,
 *   add column if not exists caddy_id                    uuid references profiles(id),
 *   add column if not exists expected_minutes            numeric,
 *   add column if not exists adjusted_expected_minutes   numeric,
 *   add column if not exists adjusted_actual_minutes     numeric,
 *   add column if not exists ratio                       numeric;
 *
 * alter table rounds   add column if not exists caddy_rating numeric;
 * alter table profiles add column if not exists caddy_rating numeric;
 */

import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Animated, TouchableOpacity, TextInput, StyleSheet, Alert, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { searchCourses as fetchCourseSearch } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification, sendPushToUser, sendRankMoveNotification, checkAndSendMilestone, scheduleInactivityReminder } from '../lib/notifications';
import * as Notifications from 'expo-notifications';
import { sendCaddyNotifications } from '../lib/caddy';
import CourseAvatar from '../components/CourseAvatar';
import { updateHandicapAfterRound } from '../lib/handicap';
import { isFraudulent, calcPOPScoreCore, calcPOPScorePreview, recalculateProfilePopScore, isPar3Course, getCoursePar } from '../lib/popScore';

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
    if (!match) return result;
    const { [match[1]]: _dropped, ...rest } = row;
    row = rest;
  }
  return { data: null, error: new Error('Schema cache: too many stale columns') };
}

const GOLFER_STEPS = ['Course', 'Date', 'Time', 'Details', 'Pace', 'Score', 'Summary'];
const CADDY_STEPS  = ['Course', 'Date', 'Details', 'Group', 'Tee Time', 'Finish', 'Summary'];

const STEP_DISPLAY = {
  Course: 'COURSE', Date: 'WHEN?', Time: 'TIMES', Details: 'DETAILS',
  Pace: 'PACE', Score: 'SCORE', Summary: 'SUMMARY',
  RoundInfo: 'YOUR ROUND', DateTime: 'DATE & TIMES', ScorePace: 'SCORE & PACE',
  Group: 'GROUP', 'Tee Time': 'TEE TIME', Finish: 'FINISH',
};

// Short keys stored in DB; labels shown in UI
const SCORE_VS_HCP_LABELS = {
  over_5:      '5+ Over',
  within_5:    'Within 5',
  to_handicap: 'To Handicap',
  beat:        'Beat It',
  // Legacy verbose labels (backward compat display)
  'More than 5 over my handicap': '5+ Over',
  'Within 5 of my handicap':      'Within 5',
  'Played to my handicap':        'To Handicap',
  'Beat my handicap':             'Beat It',
};

const PACE_DELAY_OPTIONS = [
  { label: 'Never',                          value: 'none',     color: '#7DC87A', bgTint: 'rgba(125,200,122,0.08)' },
  { label: 'A few holes',                    value: 'few',      color: '#C9A84C', bgTint: 'rgba(201,168,76,0.08)'  },
  { label: 'On a lot of holes',              value: 'many',     color: '#E87C5A', bgTint: 'rgba(232,124,90,0.08)'  },
  { label: 'Constantly / nearly every hole', value: 'constant', color: '#E24B4A', bgTint: 'rgba(226,75,74,0.08)'   },
];

// (POPScore calculation moved to lib/popScore.js)

// ─── Caddy Rating ─────────────────────────────────────────────────────────────

function getTeeWindow(teeTimeStr) {
  if (!teeTimeStr) return 'morning';
  const [hm, period] = teeTimeStr.split(' ');
  const [h] = hm.split(':').map(Number);
  let hour = h % 12;
  if (period === 'PM' && h !== 12) hour += 12;
  if (period === 'AM' && h === 12) hour = 0;
  if (hour < 10) return 'morning';
  if (hour < 14) return 'midday';
  return 'afternoon';
}

function ratioToCaddyRating(ratio) {
  // baseline_ratio = course_baseline / actual_duration (>1 = faster than baseline = better)
  const bp = [
    [0.80, 2.0],
    [0.85, 2.5],
    [0.90, 3.0],
    [0.95, 3.4],
    [1.00, 3.8],
    [1.05, 4.2],
    [1.10, 4.5],
    [1.20, 4.8],
    [1.30, 5.0],
  ];
  if (ratio <= bp[0][0]) return bp[0][1];
  if (ratio >= bp[bp.length - 1][0]) return bp[bp.length - 1][1];
  for (let i = 0; i < bp.length - 1; i++) {
    const [r1, s1] = bp[i];
    const [r2, s2] = bp[i + 1];
    if (ratio >= r1 && ratio <= r2) {
      return s1 + ((ratio - r1) / (r2 - r1)) * (s2 - s1);
    }
  }
  return 3.0;
}

function calcCaddyRatingPreview(durationMinutes) {
  const ratio = 240 / durationMinutes; // default 18-hole baseline
  return parseFloat(Math.min(5.0, Math.max(1.0, ratioToCaddyRating(ratio))).toFixed(1));
}

async function calcCaddyRatingAsync(courseName, durationMinutes, players, teeTime) {
  const DEFAULT_BASELINE = 240;
  let baseline = DEFAULT_BASELINE;
  const window = getTeeWindow(teeTime);
  const WINDOW_RANGES = { morning: [0, 599], midday: [600, 840], afternoon: [841, 1440] };
  const [winStart, winEnd] = WINDOW_RANGES[window];

  try {
    // Level 1: course + tee window + player count
    const { data: l1 } = await supabase
      .from('rounds')
      .select('duration_minutes')
      .eq('course_name', courseName)
      .eq('players', players)
      .gte('tee_time_minutes', winStart)
      .lte('tee_time_minutes', winEnd)
      .limit(50);

    if (l1 && l1.length >= 5) {
      baseline = l1.reduce((s, r) => s + r.duration_minutes, 0) / l1.length;
    } else {
      // Level 2: course + player count
      const { data: l2 } = await supabase
        .from('rounds')
        .select('duration_minutes')
        .eq('course_name', courseName)
        .eq('players', players)
        .limit(50);

      if (l2 && l2.length >= 5) {
        baseline = l2.reduce((s, r) => s + r.duration_minutes, 0) / l2.length;
      } else {
        // Level 3: course only
        const { data: l3 } = await supabase
          .from('rounds')
          .select('duration_minutes')
          .eq('course_name', courseName)
          .limit(100);
        if (l3 && l3.length >= 3) {
          baseline = l3.reduce((s, r) => s + r.duration_minutes, 0) / l3.length;
        }
      }
    }
  } catch (e) {
    // silent fail
  }

  const ratio  = baseline / durationMinutes;
  const rating = parseFloat(Math.min(5.0, Math.max(1.0, ratioToCaddyRating(ratio))).toFixed(1));
  return { rating, baselineMinutes: parseFloat(baseline.toFixed(1)) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDurationMinutes(teeTime, finishTime) {
  let start = parseTimeToMinutes(teeTime);
  let end   = parseTimeToMinutes(finishTime);
  if (end <= start) end += 24 * 60;
  return end - start;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function minutesToTimeStr(totalMinutes) {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const h24     = Math.floor(clamped / 60);
  const m       = clamped % 60;
  const period  = h24 >= 12 ? 'PM' : 'AM';
  let   h       = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(' ');
  if (parts.length < 2) return 0;
  const [hm, period] = parts;
  const hmParts = hm.split(':');
  if (hmParts.length < 2) return 0;
  const h = parseInt(hmParts[0], 10);
  const m = parseInt(hmParts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  let total = (h % 12) * 60 + m;
  if (period === 'PM') total += 12 * 60;
  return total;
}

function generateSlots(startMin, endMin) {
  const slots = [];
  for (let m = startMin; m <= endMin; m += 15) slots.push(minutesToTimeStr(m));
  return slots;
}

const TEE_TIMES    = generateSlots(300, 1200);
const FINISH_TIMES = generateSlots(360, 1380);

const ITEM_H   = 44;
const PICKER_H = ITEM_H * 5;

// ─── SlotTimePicker ───────────────────────────────────────────────────────────

function SlotTimePicker({ times, value, onChange, onLive, visibleItems = 5 }) {
  const pickerH     = ITEM_H * visibleItems;
  const bandTop     = ITEM_H * Math.floor(visibleItems / 2); // center row offset
  const scrollRef   = useRef(null);
  const scrollY     = useRef(new Animated.Value(0)).current;
  const selectedIdx = Math.max(0, times.indexOf(value));

  useEffect(() => {
    const y = selectedIdx * ITEM_H;
    scrollY.setValue(y);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 60);
  }, []);

  const handleSnap = (e) => {
    const raw     = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const clipped = Math.max(0, Math.min(times.length - 1, raw));
    onChange(times[clipped]);
  };

  return (
    <View style={{ height: pickerH, overflow: 'hidden' }}>
      <View style={[s.pickerBand, { top: bandTop }]} pointerEvents="none" />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(visibleItems / 2) }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (e) => {
              if (!onLive) return;
              const raw     = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
              const clipped = Math.max(0, Math.min(times.length - 1, raw));
              onLive(times[clipped]);
            },
          }
        )}
        onMomentumScrollEnd={handleSnap}
        onScrollEndDrag={handleSnap}
      >
        {times.map((time, i) => {
          const center = i * ITEM_H;
          const range  = [
            center - 2 * ITEM_H,
            center - ITEM_H,
            center,
            center + ITEM_H,
            center + 2 * ITEM_H,
          ];
          const opacity  = scrollY.interpolate({ inputRange: range, outputRange: [0.1, 0.35, 1, 0.35, 0.1],  extrapolate: 'clamp' });
          const scale    = scrollY.interpolate({ inputRange: range, outputRange: [0.72, 0.86, 1, 0.86, 0.72], extrapolate: 'clamp' });
          const fontSize = scrollY.interpolate({ inputRange: range, outputRange: [13, 16, 20, 16, 13],         extrapolate: 'clamp' });
          const color    = scrollY.interpolate({ inputRange: [center - ITEM_H * 0.4, center, center + ITEM_H * 0.4], outputRange: ['#B8A882', '#C9A84C', '#B8A882'], extrapolate: 'clamp' });

          return (
            <Animated.View key={time} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center', opacity, transform: [{ scale }] }}>
              <Animated.Text style={{ fontFamily: 'monospace', fontSize, color, fontWeight: '300', letterSpacing: 1 }}>
                {time}
              </Animated.Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepIndicator({ current, steps }) {
  return (
    <View style={s.stepRow}>
      {steps.map((label, i) => (
        <View key={i} style={s.stepItem}>
          <View style={[s.stepDot, i < current && s.stepDone, i === current && s.stepActive]}>
            {i < current
              ? <Ionicons name="checkmark" size={10} color="#7DC87A" />
              : <Text style={[s.stepNum, i === current && s.stepNumActive]}>{i + 1}</Text>
            }
          </View>
          {i < steps.length - 1 && <View style={[s.stepLine, i < current && s.stepLineDone]} />}
        </View>
      ))}
    </View>
  );
}

function StepCourse({ data, onChange, onNext }) {
  const [query, setQuery] = useState('');
  const [courseResults, setCourseResults] = useState([]);

  const searchCourses = async (text) => {
    if (!text || text.trim().length < 2) { setCourseResults([]); return; }
    const results = await fetchCourseSearch(text);
    setCourseResults(results);
  };

  useEffect(() => {
    const timeout = setTimeout(() => searchCourses(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Which course?</Text>
      <TextInput
        style={s.searchInput}
        placeholder="Search courses..."
        placeholderTextColor="#B8A88266"
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      {courseResults.map(course => (
        <TouchableOpacity
          key={course.name}
          style={[s.optionRow, data.course === course.name && s.optionSelected]}
          onPress={() => {
            onChange({
              ...data,
              course:       course.name,
              isPar3:       isPar3Course(course),
              courseRating: course.course_rating ?? null,
              slopeRating:  course.slope_rating  ?? null,
            });
            onNext();
          }}
        >
          <CourseAvatar courseName={course.name} city={course.city} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={[s.optionText, data.course === course.name && s.optionTextSelected]}>
              {course.name}
            </Text>
            {(course.city || course.state) && (
              <Text style={s.optionSubtext}>
                {[course.city, course.state].filter(Boolean).join(', ')}
              </Text>
            )}
            {((course.avg_time && !isNaN(course.avg_time) && (course.total_rounds ?? 0) >= 5) || course.pop_score != null) && (
              <Text style={s.optionPaceHint}>
                {[
                  course.avg_time && !isNaN(course.avg_time) && (course.total_rounds ?? 0) >= 5
                    ? `Avg ${Math.floor(course.avg_time / 60)}h ${Math.round(course.avg_time % 60)}m`
                    : null,
                  course.pop_score != null
                    ? `Clocked Score ${course.pop_score.toFixed(1)}`
                    : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
          {data.course === course.name && <Ionicons name="checkmark" size={14} color="#C9A84C" />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StepDate({ data, onChange, onNext }) {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d;
  });
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>When did you play?</Text>
      {days.map((d, i) => {
        const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday'
          : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
        const val = d.toDateString();
        return (
          <TouchableOpacity
            key={val}
            style={[s.optionRow, data.date === val && s.optionSelected]}
            onPress={() => {
              onChange({ ...data, date: val });
              if (onNext) setTimeout(onNext, 180);
            }}
          >
            <Text style={[s.optionText, data.date === val && s.optionTextSelected]}>{label}</Text>
            {data.date === val && <Ionicons name="checkmark" size={14} color="#C9A84C" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StepDateTime({ data, onChange }) {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d;
  });

  const [liveTee,    setLiveTee]    = useState(data.teeTime);
  const [liveFinish, setLiveFinish] = useState(data.finishTime);

  const elapsed = formatElapsed(liveTee, liveFinish);

  const handleTeeCommit = (v) => {
    setLiveTee(v);
    onChange({ ...data, teeTime: v });
  };

  const handleFinishCommit = (v) => {
    setLiveFinish(v);
    onChange({ ...data, finishTime: v });
  };

  return (
    <View style={s.stepContent}>
      <Text style={[s.stepTitle, { marginBottom: 8 }]}>When did you play?</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 10 }}
        contentContainerStyle={{ gap: 6, paddingRight: 16 }}
      >
        {days.map((d, i) => {
          const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday'
            : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
          const val = d.toDateString();
          const selected = data.date === val;
          return (
            <TouchableOpacity
              key={val}
              style={[s.dateChip, selected && s.dateChipActive]}
              onPress={() => onChange({ ...data, date: val })}
              activeOpacity={0.8}
            >
              <Text style={[s.dateChipText, selected && s.dateChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[s.sectionQuestion, { marginBottom: 4 }]}>Tee time</Text>
      <SlotTimePicker
        times={TEE_TIMES}
        value={data.teeTime}
        onChange={handleTeeCommit}
        onLive={setLiveTee}
        visibleItems={3}
      />

      <Text style={[s.sectionQuestion, { marginTop: 8, marginBottom: 4 }]}>Finish time</Text>
      <SlotTimePicker
        times={FINISH_TIMES}
        value={data.finishTime}
        onChange={handleFinishCommit}
        onLive={setLiveFinish}
        visibleItems={3}
      />

      <View style={[s.elapsedCard, { marginTop: 10, paddingVertical: 10 }]}>
        <Text style={s.elapsedValue}>{elapsed}</Text>
        <Text style={s.elapsedLabel}>ROUND TIME</Text>
      </View>
    </View>
  );
}

function StepTime({ data, onChange }) {
  const [liveTee,    setLiveTee]    = useState(data.teeTime);
  const [liveFinish, setLiveFinish] = useState(data.finishTime);
  const elapsed = formatElapsed(liveTee, liveFinish);

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Tee time and finish time</Text>

      <Text style={[s.sectionQuestion, { marginBottom: 4 }]}>Tee time</Text>
      <SlotTimePicker
        times={TEE_TIMES}
        value={data.teeTime}
        onChange={v => { setLiveTee(v); onChange({ ...data, teeTime: v }); }}
        onLive={setLiveTee}
        visibleItems={3}
      />

      <Text style={[s.sectionQuestion, { marginTop: 16, marginBottom: 4 }]}>Finish time</Text>
      <SlotTimePicker
        times={FINISH_TIMES}
        value={data.finishTime}
        onChange={v => { setLiveFinish(v); onChange({ ...data, finishTime: v }); }}
        onLive={setLiveFinish}
        visibleItems={3}
      />

      <View style={s.elapsedCard}>
        <Text style={s.elapsedValue}>{elapsed}</Text>
        <Text style={s.elapsedLabel}>ROUND TIME</Text>
      </View>
    </View>
  );
}

function StepRoundInfo({ data, onChange, handicap }) {
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return d;
  });

  const [liveTee,    setLiveTee]    = useState(data.teeTime);
  const [liveFinish, setLiveFinish] = useState(data.finishTime);
  const elapsed = formatElapsed(liveTee, liveFinish);

  const par      = getCoursePar(data.holes, data.isPar3);
  const minScore = data.holes === '9' ? 9 : 18;
  const maxScore = data.holes === '9' ? (data.isPar3 ? 60 : 99) : (data.isPar3 ? 90 : 150);
  const scores   = Array.from({ length: maxScore - minScore + 1 }, (_, i) => String(minScore + i));
  const [liveScore, setLiveScore] = useState(data.grossScore ?? par);
  const diff = liveScore - par;
  const diffLabel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor = diff < 0 ? '#7DC87A' : diff === 0 ? '#F5EDD8' : '#D4B86A';

  return (
    <View style={s.stepContent}>
      {/* ── Date ── */}
      <Text style={[s.stepTitle, { marginBottom: 8 }]}>When did you play?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ gap: 6, paddingRight: 16 }}
        nestedScrollEnabled
      >
        {days.map((d, i) => {
          const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday'
            : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
          const val = d.toDateString();
          return (
            <TouchableOpacity
              key={val}
              style={[s.dateChip, data.date === val && s.dateChipActive]}
              onPress={() => onChange({ ...data, date: val })}
              activeOpacity={0.8}
            >
              <Text style={[s.dateChipText, data.date === val && s.dateChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Times ── */}
      <Text style={[s.sectionQuestion, { marginBottom: 4 }]}>Tee time</Text>
      <SlotTimePicker
        times={TEE_TIMES}
        value={data.teeTime}
        onChange={v => { setLiveTee(v); onChange({ ...data, teeTime: v }); }}
        onLive={setLiveTee}
        visibleItems={3}
      />
      <Text style={[s.sectionQuestion, { marginTop: 8, marginBottom: 4 }]}>Finish time</Text>
      <SlotTimePicker
        times={FINISH_TIMES}
        value={data.finishTime}
        onChange={v => { setLiveFinish(v); onChange({ ...data, finishTime: v }); }}
        onLive={setLiveFinish}
        visibleItems={3}
      />
      <View style={[s.elapsedCard, { marginTop: 10, paddingVertical: 10, marginBottom: 16 }]}>
        <Text style={s.elapsedValue}>{elapsed}</Text>
        <Text style={s.elapsedLabel}>ROUND TIME</Text>
      </View>

      {/* ── Details ── */}
      <View style={s.scorePaceDivider} />
      <Text style={s.sectionQuestion}>How many holes?</Text>
      <View style={s.buttonGroup}>
        {[{ label: '9 Holes', value: '9' }, { label: '18 Holes', value: '18' }].map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[s.groupBtn, data.holes === value && s.groupBtnActive]}
            onPress={() => onChange({ ...data, holes: value })}
          >
            <Text style={[s.groupBtnText, data.holes === value && s.groupBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.sectionQuestion}>How did you get around?</Text>
      <View style={s.buttonGroup}>
        {['Walking', 'Cart'].map(t => (
          <TouchableOpacity
            key={t}
            style={[s.groupBtn, data.transport === t && s.groupBtnActive]}
            onPress={() => onChange({ ...data, transport: t })}
          >
            <Text style={[s.groupBtnText, data.transport === t && s.groupBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.sectionQuestion}>How many players?</Text>
      <View style={[s.buttonGroup, { marginBottom: 16 }]}>
        {['1', '2', '3', '4', '5'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.groupBtn, data.players === p && s.groupBtnActive]}
            onPress={() => onChange({ ...data, players: p })}
          >
            <Text style={[s.groupBtnText, data.players === p && s.groupBtnTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Pace & Score ── */}
      <View style={s.scorePaceDivider} />
      <Text style={s.scorePaceTitle}>How often were you waiting on the group ahead?</Text>
      <Text style={s.scorePaceHelper}>This affects your Clocked Score calculation</Text>
      {PACE_DELAY_OPTIONS.map(opt => {
        const selected = data.paceDelay === opt.value;
        return (
          <View key={opt.value}>
            <TouchableOpacity
              style={[s.paceBtn, { borderLeftColor: opt.color, backgroundColor: selected ? opt.color + '33' : opt.bgTint }]}
              onPress={() => onChange({ ...data, paceDelay: opt.value })}
              activeOpacity={0.8}
            >
              <Text style={[s.paceBtnText, selected && { color: '#F5EDD8' }]}>{opt.label}</Text>
              {selected && <Ionicons name="checkmark-circle" size={18} color={opt.color} />}
            </TouchableOpacity>
            {opt.value === 'constant' && (
              <Text style={s.paceDelayWarning}>This will significantly reduce your time penalty</Text>
            )}
          </View>
        );
      })}

      <View style={s.scorePaceDivider} />
      <Text style={s.sectionQuestion}>What did you shoot?</Text>
      <SlotTimePicker
        times={scores}
        value={String(data.grossScore ?? par)}
        onChange={v => {
          const n = parseInt(v, 10);
          setLiveScore(n);
          onChange({ ...data, grossScore: n, scoreVsHandicap: deriveScoreVsHandicap(n, handicap, data.holes, data.isPar3) });
        }}
        onLive={v => setLiveScore(parseInt(v, 10))}
      />
      <Text style={[s.grossDiff, { color: diffColor, marginTop: 12 }]}>{diffLabel}</Text>
      <Text style={s.grossParLabel}>Par {par}</Text>
    </View>
  );
}

function StepDetails({ data, onChange, onNext }) {
  const handleChange = (newData) => {
    onChange(newData);
    if (onNext && newData.holes && newData.transport && newData.players) {
      setTimeout(onNext, 280);
    }
  };

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>About your round</Text>

      <Text style={s.sectionQuestion}>How many holes?</Text>
      <View style={s.buttonGroup}>
        {[{ label: '9 Holes', value: '9' }, { label: '18 Holes', value: '18' }].map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[s.groupBtn, data.holes === value && s.groupBtnActive]}
            onPress={() => handleChange({ ...data, holes: value })}
          >
            <Text style={[s.groupBtnText, data.holes === value && s.groupBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionQuestion}>How did you get around?</Text>
      <View style={s.buttonGroup}>
        {['Walking', 'Cart'].map(t => (
          <TouchableOpacity
            key={t}
            style={[s.groupBtn, data.transport === t && s.groupBtnActive]}
            onPress={() => handleChange({ ...data, transport: t })}
          >
            <Text style={[s.groupBtnText, data.transport === t && s.groupBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sectionQuestion}>How many players?</Text>
      <View style={s.buttonGroup}>
        {['1', '2', '3', '4', '5'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.groupBtn, data.players === p && s.groupBtnActive]}
            onPress={() => handleChange({ ...data, players: p })}
          >
            <Text style={[s.groupBtnText, data.players === p && s.groupBtnTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function StepGroup({ caddyGroup, setCaddyGroup }) {
  const [mode, setMode]           = useState('search'); // 'search' | 'manual'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [manualName, setManualName]   = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const debounceRef = useRef(null);

  const handleSearch = (text) => {
    setSearchQuery(text);
    clearTimeout(debounceRef.current);
    if (!text.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .or(`full_name.ilike.%${text}%,username.ilike.%${text}%`)
        .limit(8);
      setSearchResults(data || []);
    }, 300);
  };

  const addAppUser = (user) => {
    if (caddyGroup.find(m => m.id === user.id)) return;
    setCaddyGroup(prev => [...prev, { type: 'app', id: user.id, name: user.full_name, username: user.username }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addManualPlayer = () => {
    if (!manualName.trim()) return;
    setCaddyGroup(prev => [...prev, { type: 'manual', name: manualName.trim(), email: manualEmail.trim() || null, phone: manualPhone.trim() || null }]);
    setManualName('');
    setManualEmail('');
    setManualPhone('');
  };

  const removePlayer = (index) => {
    setCaddyGroup(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Who was in your group?</Text>

      {/* Current group members */}
      {caddyGroup.length > 0 && (
        <View style={s.groupList}>
          {caddyGroup.map((member, i) => (
            <View key={i} style={s.groupMemberRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.groupMemberName}>{member.name}</Text>
                {member.username && (
                  <Text style={s.groupMemberSub}>@{member.username}</Text>
                )}
                {member.type === 'manual' && (member.email || member.phone) && (
                  <Text style={s.groupMemberSub}>{member.email || member.phone}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => removePlayer(i)} activeOpacity={0.7} style={{ padding: 6 }}>
                <Ionicons name="close-circle" size={18} color="#7A6E58" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Mode toggle */}
      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, mode === 'search' && s.toggleBtnActive]}
          onPress={() => setMode('search')}
          activeOpacity={0.8}
        >
          <Text style={[s.toggleBtnText, mode === 'search' && s.toggleBtnTextActive]}>Clocked Users</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, mode === 'manual' && s.toggleBtnActive]}
          onPress={() => setMode('manual')}
          activeOpacity={0.8}
        >
          <Text style={[s.toggleBtnText, mode === 'manual' && s.toggleBtnTextActive]}>Add Manually</Text>
        </TouchableOpacity>
      </View>

      {mode === 'search' && (
        <>
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or @username..."
            placeholderTextColor="#B8A88266"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCorrect={false}
          />
          {searchResults.map(user => (
            <TouchableOpacity
              key={user.id}
              style={s.optionRow}
              onPress={() => addAppUser(user)}
              activeOpacity={0.8}
            >
              <View>
                <Text style={s.optionText}>{user.full_name}</Text>
                {user.username && <Text style={s.optionSubtext}>@{user.username}</Text>}
              </View>
              <Ionicons name="add-circle-outline" size={18} color="#C9A84C" />
            </TouchableOpacity>
          ))}
        </>
      )}

      {mode === 'manual' && (
        <View style={{ gap: 10 }}>
          <TextInput
            style={s.searchInput}
            placeholder="Player name *"
            placeholderTextColor="#B8A88266"
            value={manualName}
            onChangeText={setManualName}
            autoCapitalize="words"
          />
          <TextInput
            style={s.searchInput}
            placeholder="Email (optional)"
            placeholderTextColor="#B8A88266"
            value={manualEmail}
            onChangeText={setManualEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={s.searchInput}
            placeholder="Phone (optional)"
            placeholderTextColor="#B8A88266"
            value={manualPhone}
            onChangeText={setManualPhone}
            keyboardType="phone-pad"
          />
          <TouchableOpacity
            style={[s.addPlayerBtn, !manualName.trim() && { opacity: 0.4 }]}
            onPress={addManualPlayer}
            disabled={!manualName.trim()}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#090F0A" />
            <Text style={s.addPlayerBtnText}>ADD PLAYER</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function StepTeeTime({ value, onChange }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>What time did you tee off?</Text>
      <SlotTimePicker times={TEE_TIMES} value={value} onChange={onChange} />
    </View>
  );
}

function formatElapsed(teeTime, finishTime) {
  let start = parseTimeToMinutes(teeTime);
  let end   = parseTimeToMinutes(finishTime);
  if (end <= start) end += 24 * 60;
  const diff = end - start;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function StepFinishTime({ teeTime, finishTime, onChange }) {
  const [liveFinish, setLiveFinish] = useState(finishTime);

  useEffect(() => { setLiveFinish(finishTime); }, [finishTime]);

  const elapsed = formatElapsed(teeTime, liveFinish);

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>What time did you finish?</Text>
      <SlotTimePicker
        times={FINISH_TIMES}
        value={finishTime}
        onChange={onChange}
        onLive={setLiveFinish}
      />
      <View style={s.elapsedCard}>
        <Text style={s.elapsedValue}>{elapsed}</Text>
        <Text style={s.elapsedLabel}>ROUND DURATION</Text>
      </View>
    </View>
  );
}

function StepPaceDelay({ data, onChange, onNext }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>How often were you waiting on the group ahead?</Text>
      {PACE_DELAY_OPTIONS.map(opt => {
        const selected = data.paceDelay === opt.value;
        const bgColor  = selected
          ? opt.bgTint.replace('0.08)', '0.20)')
          : opt.bgTint;
        const borderColor = selected ? opt.color : opt.color + '66';
        return (
          <View key={opt.value}>
            <TouchableOpacity
              style={[s.optionRow, { backgroundColor: bgColor, borderColor }]}
              onPress={() => {
                onChange({ ...data, paceDelay: opt.value });
                if (onNext) setTimeout(onNext, 220);
              }}
              activeOpacity={0.8}
            >
              <Text style={[s.optionText, selected && s.optionTextSelected]}>
                {opt.label}
              </Text>
              {selected && <Ionicons name="checkmark" size={14} color={opt.color} />}
            </TouchableOpacity>
            {opt.value === 'constant' && (
              <Text style={s.paceDelayWarning}>
                This will significantly reduce your time penalty
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function StepScorePace({ data, onChange, handicap }) {
  const par      = getCoursePar(data.holes, data.isPar3);
  const minScore = data.holes === '9' ? (data.isPar3 ? 9  : 9)  : (data.isPar3 ? 18 : 18);
  const maxScore = data.holes === '9' ? (data.isPar3 ? 60 : 99) : (data.isPar3 ? 90 : 150);
  const scores   = Array.from({ length: maxScore - minScore + 1 }, (_, i) => String(minScore + i));

  const grossScore = data.grossScore ?? par;
  const [liveScore, setLiveScore] = useState(grossScore);

  const diff      = liveScore - par;
  const diffLabel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor = diff < 0 ? '#7DC87A' : diff === 0 ? '#F5EDD8' : '#D4B86A';

  const commitScore = (val) => {
    const svh = deriveScoreVsHandicap(val, handicap, data.holes, data.isPar3);
    onChange({ ...data, grossScore: val, scoreVsHandicap: svh });
  };

  return (
    <View style={s.stepContent}>
      {/* ── Pace delay FIRST ── */}
      <Text style={s.scorePaceTitle}>How often were you waiting on the group ahead?</Text>
      <Text style={s.scorePaceHelper}>This affects your Clocked Score calculation</Text>

      {PACE_DELAY_OPTIONS.map(opt => {
        const selected = data.paceDelay === opt.value;
        return (
          <View key={opt.value}>
            <TouchableOpacity
              style={[s.paceBtn, {
                borderLeftColor: opt.color,
                backgroundColor: selected ? opt.color + '33' : opt.bgTint,
              }]}
              onPress={() => onChange({ ...data, paceDelay: opt.value })}
              activeOpacity={0.8}
            >
              <Text style={[s.paceBtnText, selected && { color: '#F5EDD8' }]}>{opt.label}</Text>
              {selected && <Ionicons name="checkmark-circle" size={18} color={opt.color} />}
            </TouchableOpacity>
            {opt.value === 'constant' && (
              <Text style={s.paceDelayWarning}>This will significantly reduce your time penalty</Text>
            )}
          </View>
        );
      })}

      {/* ── Divider ── */}
      <View style={s.scorePaceDivider} />

      {/* ── Score wheel SECOND ── */}
      <Text style={s.sectionQuestion}>What did you shoot?</Text>
      <SlotTimePicker
        times={scores}
        value={String(grossScore)}
        onChange={(v) => { const n = parseInt(v, 10); setLiveScore(n); commitScore(n); }}
        onLive={(v) => setLiveScore(parseInt(v, 10))}
      />
      <Text style={[s.grossDiff, { color: diffColor, marginTop: 12 }]}>{diffLabel}</Text>
      <Text style={s.grossParLabel}>Par {par}</Text>
    </View>
  );
}

function deriveScoreVsHandicap(grossScore, handicap, holes, isPar3 = false) {
  const hcp = handicap ?? 18;
  const par = getCoursePar(holes, isPar3);
  const base = holes === '9' ? Math.round(hcp / 2) : hcp;
  const expected = par + base;
  if (grossScore <= expected - 2) return 'beat';
  if (grossScore <= expected)     return 'to_handicap';
  if (grossScore <= expected + 5) return 'within_5';
  return 'over_5';
}

function StepGrossScore({ data, onChange, handicap }) {
  const par      = getCoursePar(data.holes, data.isPar3);
  const minScore = data.holes === '9' ? (data.isPar3 ? 9  : 9)  : (data.isPar3 ? 18 : 18);
  const maxScore = data.holes === '9' ? (data.isPar3 ? 60 : 99) : (data.isPar3 ? 90 : 150);
  const scores   = Array.from({ length: maxScore - minScore + 1 }, (_, i) => String(minScore + i));

  const grossScore  = data.grossScore ?? par;
  const [liveScore, setLiveScore] = useState(grossScore);

  const diff      = liveScore - par;
  const diffLabel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  const diffColor = diff < 0 ? '#7DC87A' : diff === 0 ? '#F5EDD8' : '#D4B86A';

  const commit = (val) => {
    const svh = deriveScoreVsHandicap(val, handicap, data.holes, data.isPar3);
    onChange({ ...data, grossScore: val, scoreVsHandicap: svh });
  };

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>What did you shoot?</Text>
      <Text style={s.grossScoreSubtitle}>Enter your total score for the round</Text>
      <SlotTimePicker
        times={scores}
        value={String(grossScore)}
        onChange={(v) => { const n = parseInt(v, 10); setLiveScore(n); commit(n); }}
        onLive={(v) => setLiveScore(parseInt(v, 10))}
      />
      <Text style={[s.grossDiff, { color: diffColor, marginTop: 16 }]}>{diffLabel}</Text>
      <Text style={s.grossParLabel}>Par {par}</Text>
    </View>
  );
}

function StepSummary({ data, caddyGroup, isCaddy }) {
  const durationMinutes = calcDurationMinutes(data.teeTime, data.finishTime);
  const estimatedScore  = isCaddy
    ? calcCaddyRatingPreview(durationMinutes)
    : calcPOPScorePreview(durationMinutes, data.holes, data.transport, data.players, data.paceDelay, data.scoreVsHandicap);
  const delayOpt        = PACE_DELAY_OPTIONS.find(o => o.value === data.paceDelay);

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Review your round</Text>
      <View style={s.summaryCard}>
        <Row label="COURSE"      value={data.course || '—'} />
        <Row label="DATE"        value={data.date || '—'} />
        <Row label="HOLES"       value={data.holes || '—'} />
        <Row label="TRANSPORT"   value={data.transport || '—'} />
        <Row label="PLAYERS"     value={data.players || '—'} />
        {isCaddy && caddyGroup.length > 0 && (
          <Row label="GROUP" value={`${caddyGroup.length} player${caddyGroup.length > 1 ? 's' : ''} added`} />
        )}
        <Row label="TEE TIME"    value={data.teeTime || '—'} />
        <Row label="FINISH TIME" value={data.finishTime || '—'} />
        {!isCaddy && <Row label="PACE DELAY"  value={delayOpt?.label || '—'} />}
        {!isCaddy && <Row label="VS HANDICAP" value={SCORE_VS_HCP_LABELS[data.scoreVsHandicap] || data.scoreVsHandicap || '—'} />}
      </View>
      <View style={s.scorePreview}>
        <Text style={s.scorePreviewLabel}>{isCaddy ? 'ESTIMATED CADDY RATING' : 'ESTIMATED CLOCKED SCORE'}</Text>
        <Text style={s.scorePreviewValue}>{estimatedScore}</Text>
        <Text style={s.scorePreviewNote}>
          {isCaddy ? 'Final rating uses course pace baseline' : 'Final score uses course baseline comparison'}
        </Text>
      </View>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}

const BLANK_DATA = {
  course: '', date: '', holes: '', transport: '', players: '',
  teeTime: '8:00 AM', finishTime: '12:00 PM', paceDelay: '', scoreVsHandicap: '', grossScore: null,
  isPar3: false,
};

export default function LogScreen({ navigation }) {
  const { user, session, profile: authProfile, refreshProfile } = useAuth();
  const [step, setStep]           = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [popScore, setPopScore]   = useState(null);
  const [data, setData]           = useState({ ...BLANK_DATA });
  const [accountType, setAccountType] = useState('golfer');
  const [caddyGroup, setCaddyGroup]   = useState([]);

  const STEPS = accountType === 'caddy' ? CADDY_STEPS : GOLFER_STEPS;

  // Sync account type from auth context
  useEffect(() => {
    if (authProfile?.account_type) setAccountType(authProfile.account_type);
  }, [authProfile?.account_type]);

  const canAdvance = () => {
    const stepName = STEPS[step];
    switch (stepName) {
      case 'Course':    return !!data.course;
      case 'Date':      return !!data.date;
      case 'Time':      return true;
      case 'Details':   return !!data.holes && !!data.transport && !!data.players;
      case 'Pace':      return !!data.paceDelay;
      case 'Score':     return true;
      case 'RoundInfo': return !!data.date && !!data.holes && !!data.transport && !!data.players && !!data.paceDelay;
      case 'DateTime':  return !!data.date;
      case 'Group':     return true;
      case 'ScorePace': return !!data.paceDelay;
      default:          return true;
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const durationMinutes = calcDurationMinutes(data.teeTime, data.finishTime);
      const userId = user?.id;
      if (!userId) { setSaving(false); Alert.alert('Not signed in', 'Please sign in again'); return; }

      // ── Caddy path ──────────────────────────────────────────────────────────
      if (accountType === 'caddy') {
        const { rating, baselineMinutes } = await calcCaddyRatingAsync(
          data.course, durationMinutes, data.players, data.teeTime,
        );

        const roundData = {
          course_name:             data.course,
          holes:                   data.holes,
          transport:               data.transport,
          players:                 data.players,
          tee_time:                data.teeTime,
          finish_time:             data.finishTime,
          duration_minutes:        durationMinutes,
          course_baseline_minutes: baselineMinutes,
          caddy_rating:            rating,
          user_id:                 userId,
          caddy_id:                userId,
          caddy_group:             caddyGroup.length > 0 ? caddyGroup : null,
        };

        const { error } = await supabase.from('rounds').insert(roundData);
        if (error) {
          setSaving(false); Alert.alert('Error', 'Could not save your round. Please try again.'); return;
        }

        // Update profile caddy_rating (rolling 5-round avg)
        const { data: recentRounds } = await supabase
          .from('rounds')
          .select('caddy_rating')
          .eq('user_id', userId)
          .not('caddy_rating', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (recentRounds && recentRounds.length > 0) {
          const avg = recentRounds.reduce((s, r) => s + r.caddy_rating, 0) / recentRounds.length;
          await supabase.from('profiles').update({ caddy_rating: parseFloat(avg.toFixed(2)) }).eq('id', userId);
        }

        // Notify non-app players
        if (caddyGroup.length > 0) {
          const nonAppPlayers = caddyGroup.filter(m => m.type === 'manual');
          if (nonAppPlayers.length > 0) await sendCaddyNotifications(nonAppPlayers, data.course, rating);
        }

        await sendLocalNotification('Caddy Rating Updated', `Your new Caddy Rating is ${rating.toFixed(1)} — great pace.`);
        setPopScore(rating);
        AccessibilityInfo.announceForAccessibility(`Your Caddy Rating is ${rating.toFixed(1)}`);
        setSubmitted(true);
        navigation.navigate('Share', { popScore: rating, courseName: data.course, date: data.date, holes: data.holes, transport: data.transport, durationMinutes });
        return;
      }

      // ── Golfer (POPScore) path ───────────────────────────────────────────────

      // Daily rate limit (3 rounds per 24h)
      const { count: todayRoundCount } = await supabase
        .from('rounds').select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if ((todayRoundCount ?? 0) >= 3) {
        setSaving(false);
        Alert.alert('Daily limit reached', 'You can log a maximum of 3 rounds per day.');
        return;
      }

      // Capture old rank before this round changes the leaderboard
      let oldRank = null;
      try {
        const { count } = await supabase
          .from('profiles').select('*', { count: 'exact', head: true })
          .gt('pop_score', authProfile?.pop_score ?? 0);
        oldRank = (count ?? 0) + 1;
      } catch (e) { /* silent fail */ }

      // Step 3 — Fraud detection
      if (isFraudulent(durationMinutes, data.holes, data.players, data.isPar3 ?? false, data.transport, data.paceDelay)) {
        const { count: existingFlags } = await supabase
          .from('rounds')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('flagged', true);
        const flaggedCount = (existingFlags || 0) + 1;

        const { error: flagErr } = await roundsInsert({
          course_name:       data.course,
          holes:             data.holes,
          transport:         data.transport,
          players:           data.players,
          tee_time:          data.teeTime,
          finish_time:       data.finishTime,
          duration_minutes:  durationMinutes,
          score_vs_handicap: data.scoreVsHandicap,
          gross_score:       data.grossScore ?? null,
          pace_delay:        data.paceDelay,
          pop_score:         null,
          flagged:           true,
          flagged_count:     flaggedCount,
          verification_level: 'self_reported',
          user_id:           userId,
        });

        const flagMsg = flaggedCount >= 3
          ? 'Your round time was flagged as unusually fast. This account has been flagged 3 or more times and is under review. Contact hello@clocked.golf'
          : 'Your round time was flagged as unusually fast. Your score has been submitted but is pending review.';
        Alert.alert('Round Flagged', flagMsg);
        setSubmitted(true);
        setSaving(false);
        return;
      }

      // Fetch course avg_time for pace forgiveness scaling
      let courseAvgMinutes = null;
      try {
        const { data: courseRow } = await supabase
          .from('courses').select('avg_time').eq('name', data.course).maybeSingle();
        courseAvgMinutes = courseRow?.avg_time || null;
      } catch (e) { // silent fail
      }

      const { pop_score: pop, adjusted_expected_minutes: adjustedExpectedMinutes,
              adjusted_actual_minutes: adjustedActualMinutes, ratio } = calcPOPScoreCore({
        durationMinutes,
        holes:           data.holes,
        transport:       data.transport,
        players:         data.players,
        paceDelay:       data.paceDelay,
        scoreVsHandicap: data.scoreVsHandicap,
        caddyLogged:     false,
        courseAvgMinutes,
        isPar3:          data.isPar3 ?? false,
      });

      const roundData = {
        course_name:               data.course,
        holes:                     data.holes,
        transport:                 data.transport,
        players:                   data.players,
        tee_time:                  data.teeTime,
        finish_time:               data.finishTime,
        duration_minutes:          durationMinutes,
        score_vs_handicap:         data.scoreVsHandicap,
        gross_score:               data.grossScore ?? null,
        pace_delay:                data.paceDelay,
        adjusted_expected_minutes: adjustedExpectedMinutes,
        adjusted_actual_minutes:   adjustedActualMinutes,
        ratio,
        pop_score:                 pop,
        flagged:                   false,
        verification_level:        'self_reported',
        user_id:                   userId,
      };

      const { data: insertedRoundRows, error } = await roundsInsert(roundData, 'id');
      const newRoundId = insertedRoundRows?.[0]?.id;
      if (error) {
        setSaving(false); Alert.alert('Error', 'Could not save your round. Please try again.'); return;
      }

      // Recalculate profile POPScore as weighted rolling average of last 20 rounds
      await recalculateProfilePopScore(userId, supabase);

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
            .eq('user_id', userId).not('pop_score', 'is', null);
          await checkAndSendMilestone(totalRoundsCount ?? 1, pop, authProfile?.pop_score ?? 0, userId);
        } catch (e) { /* silent fail */ }
        scheduleInactivityReminder().catch(() => {});
      })();

      // Update handicap index from last 20 rounds
      await updateHandicapAfterRound(userId, supabase);

      // Update course pop_score + total_rounds, then notify course followers
      const { data: courseRow } = await supabase.from('courses').select('id').eq('name', data.course).maybeSingle();
      if (courseRow) {
        const { data: courseRounds } = await supabase.from('rounds').select('pop_score, duration_minutes, pace_delay, holes').eq('course_name', data.course).eq('flagged', false);
        if (courseRounds && courseRounds.length > 0) {
          const scored = courseRounds.filter(r => r.pop_score != null);
          const courseAvg = scored.length > 0 ? scored.reduce((s, r) => s + (Number(r.pop_score) || 0), 0) / scored.length : null;
          const constantCount     = courseRounds.filter(r => r.pace_delay === 'constant').length;
          const managementPenalty = parseFloat((constantCount / courseRounds.length * 0.5).toFixed(2));
          const newCourseScore    = courseAvg != null
            ? parseFloat(Math.max(1.0, Math.min(5.0, courseAvg - managementPenalty)).toFixed(2))
            : null;
          const timed = courseRounds.filter(r => r.duration_minutes != null);
          const newAvgTime = timed.length > 0 ? parseFloat((timed.reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0) / timed.length).toFixed(1)) : null;
          const fullRounds = courseRounds.filter(r => r.duration_minutes != null && (r.holes === '18' || r.holes === 18));
          const fastestTime = fullRounds.length > 0 ? Math.min(...fullRounds.map(r => Number(r.duration_minutes) || 0)) : null;
          const courseUpdate = { total_rounds: courseRounds.length, management_penalty: managementPenalty };
          if (newCourseScore != null && !isNaN(newCourseScore)) courseUpdate.pop_score = newCourseScore;
          if (newAvgTime != null && !isNaN(newAvgTime)) courseUpdate.avg_time = newAvgTime;
          if (fastestTime != null && !isNaN(fastestTime)) courseUpdate.fastest_time = fastestTime;
          await supabase.from('courses').update(courseUpdate).eq('id', String(courseRow.id));

          // Feature 4 — Course #1 check
          if (pop != null && newRoundId) {
            try {
              const { data: prevBest } = await supabase
                .from('rounds').select('user_id, pop_score')
                .eq('course_name', data.course).eq('flagged', false)
                .not('pop_score', 'is', null).neq('id', newRoundId)
                .order('pop_score', { ascending: false }).limit(1).maybeSingle();
              const beatsAll        = !prevBest || pop > (prevBest.pop_score ?? 0);
              const wasAlreadyLeader = prevBest?.user_id === userId;
              if (beatsAll && !wasAlreadyLeader) {
                const handle = authProfile?.username ? `@${authProfile.username}` : 'a player';
                await sendPushToUser(userId, `You're the fastest at ${data.course} 🏆`, `Your Clocked Score of ${pop.toFixed(1)} is now #1 at ${data.course}. Own it.`, 'course_leader');
                supabase.from('activity_feed').insert({ user_id: userId, type: 'course_leader', content: { description: `${handle} is now the fastest player at ${data.course} 🏆`, course_name: data.course, pop_score: pop } }).then(() => {});
              }
            } catch (e) { /* silent fail */ }
          }

          const { data: courseFollowers } = await supabase
            .from('course_follows').select('profiles!course_follows_user_id_fkey(id)').eq('course_id', courseRow.id);
          if (courseFollowers && courseFollowers.length > 0) {
            const body = newCourseScore != null ? `${data.course} Clocked Score just updated to ${newCourseScore.toFixed(1)} based on ${courseRounds.length} rounds logged.` : `${data.course} now has ${courseRounds.length} rounds on Clocked.`;
            for (const cf of courseFollowers) {
              if (cf.profiles?.id) await sendPushToUser(cf.profiles.id, 'Course Update', body, 'course_update');
            }
          }

          // Course milestone notifications
          const milestones = [10, 25, 50];
          if (milestones.includes(courseRounds.length)) {
            const { data: homeCourseUsers } = await supabase
              .from('profiles')
              .select('id')
              .eq('home_course', data.course);
            if (homeCourseUsers && homeCourseUsers.length > 0) {
              const milestoneBody = `${data.course} just hit ${courseRounds.length} rounds on Clocked.${newCourseScore != null ? ` Current Clocked Score: ${newCourseScore.toFixed(1)}` : ''}`;
              for (const p of homeCourseUsers) {
                await sendPushToUser(p.id, 'Course Milestone', milestoneBody, 'course_update');
              }
            }
          }
        }
      }

      // Notify followers
      const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', userId);
      if (followers && followers.length > 0) {
        const followerIds = followers.map(f => f.follower_id);
        const { data: followerProfiles } = await supabase
          .from('profiles').select('id').in('id', followerIds);
        const name      = authProfile?.username ? `@${authProfile.username}` : 'A friend';
        const notifBody = `${name} just logged a round at ${data.course} — Clocked Score ${pop.toFixed(1)}. See how you compare.`;
        for (const fp of (followerProfiles || [])) {
          await sendPushToUser(fp.id, 'Friend Activity', notifBody, 'friend_round');
        }
      }

      // Challenge auto-settlement
      if (pop != null && newRoundId) {
        try {
          const { data: activeChallenges } = await supabase
            .from('challenges')
            .select('id, challenger_id, challenged_id, challenger_score, challenged_score')
            .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
            .eq('course_name', data.course)
            .eq('status', 'accepted');
          for (const ch of (activeChallenges ?? [])) {
            const isChallenger = ch.challenger_id === userId;
            const opponentId   = isChallenger ? ch.challenged_id : ch.challenger_id;
            const otherScore   = isChallenger ? ch.challenged_score : ch.challenger_score;
            const updateField  = isChallenger ? 'challenger_score' : 'challenged_score';
            const roundField   = isChallenger ? 'challenger_round_id' : 'challenged_round_id';
            if (otherScore != null) {
              const iWin     = pop > otherScore;
              const winnerId = iWin ? userId : opponentId;
              await supabase.from('challenges').update({ [updateField]: pop, [roundField]: newRoundId, status: 'completed', winner_id: winnerId }).eq('id', ch.id);
              const { data: opp } = await supabase.from('profiles').select('username').eq('id', opponentId).maybeSingle();
              const myHandle  = authProfile?.username ? `@${authProfile.username}` : 'a player';
              const oppHandle = opp?.username ? `@${opp.username}` : 'their opponent';
              await sendPushToUser(userId, iWin ? `You won the challenge at ${data.course} 🏆` : `You lost the challenge at ${data.course}`, iWin ? `Your ${pop.toFixed(1)} beat the ${otherScore.toFixed(1)}. Own it.` : `${oppHandle} had a better score. Rematch?`, 'challenge_result');
              await sendPushToUser(opponentId, iWin ? `You lost the challenge at ${data.course}` : `You won the challenge at ${data.course} 🏆`, iWin ? `${myHandle} had a better score. Rematch?` : `Your score held up! ${myHandle} couldn't beat it.`, 'challenge_result');
              supabase.from('activity_feed').insert({ user_id: winnerId, type: 'challenge_won', content: { description: `${iWin ? myHandle : oppHandle} beat ${iWin ? oppHandle : myHandle}'s challenge at ${data.course}`, course_name: data.course, winner_score: iWin ? pop : otherScore } }).then(() => {}).catch(() => {});
            } else {
              await supabase.from('challenges').update({ [updateField]: pop, [roundField]: newRoundId }).eq('id', ch.id);
            }
          }
        } catch { /* silent fail */ }
      }

      // Schedule POPScore notification for 1h 45m after round (6300 seconds)
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Your round has been scored!',
          body: 'Tap to see your updated Clocked Score →',
        },
        trigger: { seconds: 18000, repeats: false },
      }).catch(() => {});
      // Auto-post to activity feed — fire and forget, never block round save
      try {
        await supabase.from('activity_feed').insert({
          user_id:  userId,
          type:     'round_logged',
          round_id: newRoundId,
          content: {
            course_name:      data.course,
            pop_score:        pop,
            duration_minutes: durationMinutes,
            holes:            data.holes,
            transport:        data.transport,
            players:          data.players,
            verified:         false,
          },
        });
      } catch (e) { /* silent fail */ }

      setPopScore(pop);
      AccessibilityInfo.announceForAccessibility(`Your Clocked Score is ${pop.toFixed(1)}`);
      setSubmitted(true);
      navigation.navigate('Share', {
        popScore:         pop,
        courseName:       data.course,
        date:             data.date,
        holes:            data.holes,
        transport:        data.transport,
        durationMinutes,
        grossScore:       data.grossScore ?? null,
        isPar3:           data.isPar3 ?? false,
        avgCourseMinutes: courseAvgMinutes ?? null,
      });
    } catch (e) {
      Alert.alert('Error', 'Could not save your round. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setStep(0);
    setSubmitted(false);
    setPopScore(null);
    setData({ ...BLANK_DATA });
    setCaddyGroup([]);
  };

  if (submitted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <Ionicons name="golf" size={56} color="#C9A84C" style={{ marginBottom: 20 }} />
          <Text style={s.successTitle}>Round Logged!</Text>
          {popScore !== null && (
            <View style={s.popScoreCard}>
              <Text style={s.popScoreLabel}>{accountType === 'caddy' ? 'YOUR CADDY RATING' : 'YOUR CLOCKED SCORE'}</Text>
              <Text style={s.popScoreValue}>{popScore.toFixed(1)}</Text>
            </View>
          )}
          <Text style={s.successSub}>
            {accountType === 'caddy' ? 'Your Caddy Rating has been updated.' : 'Your profile Clocked Score has been updated.'}
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={resetAll}>
            <Text style={s.primaryBtnText}>LOG ANOTHER ROUND</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const stepName = STEPS[step];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.wordmark}>LOG ROUND</Text>
        <Text style={s.stepLabel}>{STEP_DISPLAY[stepName] ?? stepName.toUpperCase()}</Text>
      </View>
      <StepIndicator current={step} steps={STEPS} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 120 }}>
        {stepName === 'Course'    && <StepCourse data={data} onChange={setData} onNext={() => setStep(1)} />}
        {stepName === 'Date'      && <StepDate data={data} onChange={setData} onNext={() => setStep(step + 1)} />}
        {stepName === 'Time'      && <StepTime data={data} onChange={setData} />}
        {stepName === 'Details'   && <StepDetails data={data} onChange={setData} onNext={() => setStep(step + 1)} />}
        {stepName === 'Pace'      && <StepPaceDelay data={data} onChange={setData} onNext={() => setStep(step + 1)} />}
        {stepName === 'Score'     && <StepGrossScore data={data} onChange={setData} handicap={authProfile?.handicap} />}
        {stepName === 'RoundInfo' && <StepRoundInfo data={data} onChange={setData} handicap={authProfile?.handicap} />}
        {stepName === 'DateTime'  && <StepDateTime data={data} onChange={setData} />}
        {stepName === 'Group'     && <StepGroup caddyGroup={caddyGroup} setCaddyGroup={setCaddyGroup} />}
        {stepName === 'Tee Time'  && <StepTeeTime value={data.teeTime} onChange={v => setData({ ...data, teeTime: v })} />}
        {stepName === 'Finish'    && <StepFinishTime teeTime={data.teeTime} finishTime={data.finishTime} onChange={v => setData({ ...data, finishTime: v })} />}
        {stepName === 'ScorePace' && <StepScorePace data={data} onChange={setData} handicap={authProfile?.handicap} />}
        {stepName === 'Summary'   && <StepSummary data={data} caddyGroup={caddyGroup} isCaddy={accountType === 'caddy'} />}
      </ScrollView>
      <View style={s.navRow}>
        {step > 0
          ? <TouchableOpacity style={s.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={s.backBtnText}>← BACK</Text>
            </TouchableOpacity>
          : <View />
        }
        {step < STEPS.length - 1
          ? <TouchableOpacity
              style={[s.nextBtn, !canAdvance() && s.nextBtnDisabled]}
              onPress={() => {
                if (!canAdvance()) return;
                setStep(step + 1);
              }}
            >
              <Text style={s.nextBtnText}>NEXT →</Text>
            </TouchableOpacity>
          : <TouchableOpacity
              style={[s.submitBtn, saving && s.nextBtnDisabled]}
              onPress={() => { if (!saving) handleSubmit(); }}
            >
              <Text style={s.submitBtnText}>{saving ? 'SAVING...' : 'SUBMIT ROUND'}</Text>
            </TouchableOpacity>
        }
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#090F0A' },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 10 },
  wordmark:           { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5 },
  stepLabel:          { fontSize: 11, fontWeight: '600', color: '#B8A882', letterSpacing: 2 },
  stepRow:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, marginBottom: 20 },
  stepItem:           { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepDot:            { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A44', alignItems: 'center', justifyContent: 'center' },
  stepActive:         { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  stepDone:           { borderColor: '#7DC87A', backgroundColor: '#7DC87A22' },
  stepNum:            { fontSize: 10, color: '#B8A882' },
  stepNumActive:      { color: '#C9A84C' },
  stepLine:           { flex: 1, height: 1, backgroundColor: '#7DC87A22', marginHorizontal: 2 },
  stepLineDone:       { backgroundColor: '#7DC87A44' },
  scroll:             { flex: 1 },
  stepContent:        { paddingHorizontal: 22 },
  stepTitle:          { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 8 },
  grossScoreSubtitle: { fontSize: 13, color: '#B8A882', marginBottom: 16 },
  grossDiff:          { fontSize: 28, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  grossParLabel:      { fontSize: 12, fontWeight: '700', color: '#7A6E58', letterSpacing: 2, textAlign: 'center' },
  searchInput:        { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22', borderRadius: 12, padding: 14, color: '#F5EDD8', fontSize: 15, marginBottom: 12 },
  optionRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22', borderRadius: 12, padding: 16, marginBottom: 8 },
  optionSelected:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C11' },
  optionText:         { fontSize: 15, color: '#B8A882' },
  optionTextSelected: { color: '#F5EDD8', fontWeight: '500' },
  optionSubtext:      { fontSize: 11, color: '#B8A88266', marginTop: 2 },
  optionPaceHint:     { fontSize: 10, color: '#7DC87A99', marginTop: 3, fontWeight: '500' },
  paceDelayWarning:   { fontSize: 11, color: '#E24B4A99', marginTop: -4, marginBottom: 8, paddingHorizontal: 4 },
  scorePaceTitle:     { fontSize: 20, fontWeight: '700', color: '#F5EDD8', lineHeight: 26, marginBottom: 6 },
  scorePaceHelper:    { fontSize: 12, color: '#B8A88299', marginBottom: 16 },
  paceBtn:            { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderLeftWidth: 4, borderRadius: 12, marginBottom: 8 },
  paceBtnText:        { fontSize: 15, color: '#B8A882', fontWeight: '500' },
  scorePaceDivider:   { height: 1, backgroundColor: '#7DC87A22', marginVertical: 24 },
  sectionQuestion:    { fontSize: 16, fontWeight: '500', color: '#F5EDD8', marginTop: 28, marginBottom: 12 },
  buttonGroup:        { flexDirection: 'row', gap: 10 },
  groupBtn:           { flex: 1, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  groupBtnActive:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  groupBtnText:       { fontSize: 14, color: '#B8A882', fontWeight: '500' },
  groupBtnTextActive: { color: '#F5EDD8' },
  toggleRow:          { flexDirection: 'row', gap: 10, marginBottom: 12 },
  toggleBtn:          { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center', backgroundColor: '#0D1A0F' },
  toggleBtnActive:    { borderColor: '#C9A84C', backgroundColor: '#C9A84C11' },
  toggleBtnText:      { fontSize: 12, color: '#B8A882', fontWeight: '600' },
  toggleBtnTextActive:{ color: '#C9A84C' },
  groupList:          { backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', overflow: 'hidden', marginBottom: 12 },
  groupMemberRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  groupMemberName:    { fontSize: 14, color: '#F5EDD8', fontWeight: '500' },
  groupMemberSub:     { fontSize: 11, color: '#B8A882', marginTop: 2 },
  addPlayerBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12 },
  addPlayerBtnText:   { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  pickerBand:         { position: 'absolute', left: 24, right: 24, height: ITEM_H, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#7DC87A55', zIndex: 10 },
  dateChip:           { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10 },
  dateChipActive:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  dateChipText:       { fontSize: 11, color: '#B8A882', fontWeight: '500' },
  dateChipTextActive: { color: '#F5EDD8' },
  elapsedCard:        { alignItems: 'center', marginTop: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#7DC87A22' },
  elapsedValue:       { fontSize: 72, fontWeight: '400', color: '#C9A84C', fontFamily: 'monospace', lineHeight: 80 },
  elapsedLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginTop: 8, opacity: 0.6 },
  summaryCard:        { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', overflow: 'hidden', marginBottom: 20 },
  summaryRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  summaryLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  summaryValue:       { fontSize: 14, color: '#F5EDD8', fontWeight: '500' },
  scorePreview:       { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A44', padding: 24, alignItems: 'center' },
  scorePreviewLabel:  { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  scorePreviewValue:  { fontSize: 56, fontWeight: '300', color: '#7DC87A', marginBottom: 6 },
  scorePreviewNote:   { fontSize: 11, color: '#B8A882', textAlign: 'center' },
  navRow:             { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 20, backgroundColor: '#090F0A', borderTopWidth: 1, borderTopColor: '#7DC87A11' },
  backBtn:            { paddingVertical: 14, paddingHorizontal: 20 },
  backBtnText:        { fontSize: 12, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  nextBtn:            { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  nextBtnDisabled:    { backgroundColor: '#C9A84C44' },
  nextBtnText:        { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  submitBtn:          { backgroundColor: '#7DC87A', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  submitBtnText:      { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  successContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  successTitle:       { fontSize: 28, fontWeight: '600', color: '#F5EDD8', marginBottom: 20 },
  popScoreCard:       { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A44', paddingVertical: 24, paddingHorizontal: 48, alignItems: 'center', marginBottom: 20 },
  popScoreLabel:      { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  popScoreValue:      { fontSize: 64, fontWeight: '300', color: '#7DC87A' },
  successSub:         { fontSize: 13, color: '#B8A882', textAlign: 'center', marginBottom: 40, lineHeight: 20 },
  primaryBtn:         { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  primaryBtnText:     { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});
