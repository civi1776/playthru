import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView } from 'react-native';
import { supabase } from '../lib/supabase';

const STEPS = ['Course', 'Date', 'Details', 'Tee Time', 'Finish', 'Score', 'Summary'];

const SCORE_OPTIONS = [
  { label: 'More than 5 over my handicap', modifier: 0.15 },
  { label: 'Within 5 of my handicap',      modifier: 0.25 },
  { label: 'Played to my handicap',         modifier: 0.35 },
  { label: 'Beat my handicap',              modifier: 0.50 },
];

const BASE_POP = 3.8;

function calcPOPScore(scoreVsHandicap) {
  const option = SCORE_OPTIONS.find(o => o.label === scoreVsHandicap);
  const modifier = option ? option.modifier : 0;
  return Math.min(5.0, BASE_POP + modifier).toFixed(1);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function StepIndicator({ current }) {
  return (
    <View style={s.stepRow}>
      {STEPS.map((label, i) => (
        <View key={i} style={s.stepItem}>
          <View style={[s.stepDot, i < current && s.stepDone, i === current && s.stepActive]}>
            {i < current
              ? <Text style={s.stepCheck}>✓</Text>
              : <Text style={[s.stepNum, i === current && s.stepNumActive]}>{i + 1}</Text>
            }
          </View>
          {i < STEPS.length - 1 && <View style={[s.stepLine, i < current && s.stepLineDone]} />}
        </View>
      ))}
    </View>
  );
}

function StepCourse({ data, onChange, onNext }) {
  const [query, setQuery] = useState('');
  const [courseResults, setCourseResults] = useState([]);

  const searchCourses = async (text) => {
    const { data, error } = await supabase
      .from('courses')
      .select('name, city, state')
      .ilike('name', `%${text}%`)
      .limit(10);
    if (error) console.log('Supabase error:', error);
    if (data) setCourseResults(data);
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
            onChange({ ...data, course: course.name });
            onNext();
          }}
        >
          <View>
            <Text style={[s.optionText, data.course === course.name && s.optionTextSelected]}>
              {course.name}
            </Text>
            {(course.city || course.state) && (
              <Text style={s.optionSubtext}>
                {[course.city, course.state].filter(Boolean).join(', ')}
              </Text>
            )}
          </View>
          {data.course === course.name && <Text style={s.checkmark}>✓</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StepDate({ data, onChange }) {
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
            onPress={() => onChange({ ...data, date: val })}
          >
            <Text style={[s.optionText, data.date === val && s.optionTextSelected]}>{label}</Text>
            {data.date === val && <Text style={s.checkmark}>✓</Text>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StepDetails({ data, onChange }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Round details</Text>

      <Text style={s.groupLabel}>HOLES</Text>
      <View style={s.buttonGroup}>
        {['9', '18'].map(h => (
          <TouchableOpacity
            key={h}
            style={[s.groupBtn, data.holes === h && s.groupBtnActive]}
            onPress={() => onChange({ ...data, holes: h })}
          >
            <Text style={[s.groupBtnText, data.holes === h && s.groupBtnTextActive]}>{h}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.groupLabel}>TRANSPORT</Text>
      <View style={s.buttonGroup}>
        {['Walking', 'Cart', 'Caddie'].map(t => (
          <TouchableOpacity
            key={t}
            style={[s.groupBtn, data.transport === t && s.groupBtnActive]}
            onPress={() => onChange({ ...data, transport: t })}
          >
            <Text style={[s.groupBtnText, data.transport === t && s.groupBtnTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.groupLabel}>PLAYERS IN GROUP</Text>
      <View style={s.buttonGroup}>
        {['1', '2', '3', '4'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.groupBtn, data.players === p && s.groupBtnActive]}
            onPress={() => onChange({ ...data, players: p })}
          >
            <Text style={[s.groupBtnText, data.players === p && s.groupBtnTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hm, period] = timeStr.split(' ');
  const [h, m] = hm.split(':').map(Number);
  let total = (h % 12) * 60 + m;
  if (period === 'PM') total += 12 * 60;
  return total;
}

function formatElapsed(teeTime, finishTime) {
  let start = parseTimeToMinutes(teeTime);
  let end = parseTimeToMinutes(finishTime);
  if (end <= start) end += 24 * 60; // midnight crossing
  const diff = end - start;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function TimePickerControls({ value, onChange }) {
  const hours = Array.from({ length: 13 }, (_, i) => i + 6); // 6am–6pm
  const mins = ['00', '15', '30', '45'];
  const [h, m, period] = value ? value.split(/[: ]/) : ['7', '00', 'AM'];

  return (
    <View style={s.timeRow}>
      <View style={s.timeCol}>
        <Text style={s.groupLabel}>HOUR</Text>
        <ScrollView style={s.timeScroll} showsVerticalScrollIndicator={false}>
          {hours.map(hr => {
            const display = hr > 12 ? hr - 12 : hr;
            const per = hr >= 12 ? 'PM' : 'AM';
            const selected = parseInt(h) === display && period === per;
            return (
              <TouchableOpacity
                key={hr}
                style={[s.timeItem, selected && s.timeItemActive]}
                onPress={() => onChange(`${display}:${m} ${per}`)}
              >
                <Text style={[s.timeText, selected && s.timeTextActive]}>{display}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <Text style={s.timeColon}>:</Text>
      <View style={s.timeCol}>
        <Text style={s.groupLabel}>MIN</Text>
        {mins.map(mn => (
          <TouchableOpacity
            key={mn}
            style={[s.timeItem, m === mn && s.timeItemActive]}
            onPress={() => onChange(`${h}:${mn} ${period}`)}
          >
            <Text style={[s.timeText, m === mn && s.timeTextActive]}>{mn}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.timeCol}>
        <Text style={s.groupLabel}>  </Text>
        {['AM', 'PM'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.timeItem, period === p && s.timeItemActive]}
            onPress={() => onChange(`${h}:${m} ${p}`)}
          >
            <Text style={[s.timeText, period === p && s.timeTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function TimePicker({ label, value, onChange }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>{label}</Text>
      <TimePickerControls value={value} onChange={onChange} />
    </View>
  );
}

function StepFinishTime({ teeTime, finishTime, onChange }) {
  const elapsed = formatElapsed(teeTime, finishTime);
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>What time did you finish?</Text>
      <TimePickerControls value={finishTime} onChange={onChange} />
      <View style={s.elapsedCard}>
        <Text style={s.elapsedValue}>{elapsed}</Text>
        <Text style={s.elapsedLabel}>ROUND DURATION</Text>
      </View>
    </View>
  );
}

function StepScoreVsHandicap({ data, onChange }) {
  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>How did you score relative to your handicap?</Text>
      {SCORE_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.label}
          style={[s.optionRow, data.scoreVsHandicap === opt.label && s.optionSelected]}
          onPress={() => onChange({ ...data, scoreVsHandicap: opt.label })}
        >
          <Text style={[s.optionText, data.scoreVsHandicap === opt.label && s.optionTextSelected]}>
            {opt.label}
          </Text>
          {data.scoreVsHandicap === opt.label && <Text style={s.checkmark}>✓</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StepSummary({ data }) {
  const option = SCORE_OPTIONS.find(o => o.label === data.scoreVsHandicap);
  const modifier = option ? option.modifier : 0;
  const estimatedScore = calcPOPScore(data.scoreVsHandicap);

  return (
    <View style={s.stepContent}>
      <Text style={s.stepTitle}>Review your round</Text>
      <View style={s.summaryCard}>
        <Row label="COURSE" value={data.course || '—'} />
        <Row label="DATE" value={data.date || '—'} />
        <Row label="HOLES" value={data.holes || '—'} />
        <Row label="TRANSPORT" value={data.transport || '—'} />
        <Row label="PLAYERS" value={data.players || '—'} />
        <Row label="TEE TIME" value={data.teeTime || '—'} />
        <Row label="FINISH TIME" value={data.finishTime || '—'} />
        <Row label="VS HANDICAP" value={data.scoreVsHandicap || '—'} />
      </View>
      <View style={s.scorePreview}>
        <Text style={s.scorePreviewLabel}>ESTIMATED POPSCORE</Text>
        <Text style={s.scorePreviewValue}>{estimatedScore}</Text>
        {modifier > 0 && (
          <Text style={s.scoreBonus}>+{modifier.toFixed(2)} score bonus</Text>
        )}
        <Text style={s.scorePreviewNote}>Final score calculated after verification</Text>
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

export default function LogScreen() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [data, setData] = useState({
    course: '', date: '', holes: '18', transport: 'Cart', players: '4',
    teeTime: '7:00 AM', finishTime: '11:00 AM', scoreVsHandicap: '',
  });

  const canAdvance = () => {
    if (step === 0) return !!data.course;
    if (step === 1) return !!data.date;
    return true;
  };

  if (submitted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successContainer}>
          <Text style={s.successIcon}>⛳</Text>
          <Text style={s.successTitle}>Round Logged!</Text>
          <Text style={s.successSub}>Your POPScore will be updated once verified.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => { setStep(0); setSubmitted(false); setData({ course: '', date: '', holes: '18', transport: 'Cart', players: '4', teeTime: '7:00 AM', finishTime: '11:00 AM', scoreVsHandicap: '' }); }}>
            <Text style={s.primaryBtnText}>LOG ANOTHER ROUND</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.wordmark}>LOG ROUND</Text>
        <Text style={s.stepLabel}>{STEPS[step].toUpperCase()}</Text>
      </View>
      <StepIndicator current={step} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 120 }}>
        {step === 0 && <StepCourse data={data} onChange={setData} onNext={() => setStep(1)} />}
        {step === 1 && <StepDate data={data} onChange={setData} />}
        {step === 2 && <StepDetails data={data} onChange={setData} />}
        {step === 3 && <TimePicker label="What time did you tee off?" value={data.teeTime} onChange={v => setData({ ...data, teeTime: v })} />}
        {step === 4 && <StepFinishTime teeTime={data.teeTime} finishTime={data.finishTime} onChange={v => setData({ ...data, finishTime: v })} />}
        {step === 5 && <StepScoreVsHandicap data={data} onChange={setData} />}
        {step === 6 && <StepSummary data={data} />}
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
              onPress={() => canAdvance() && setStep(step + 1)}
            >
              <Text style={s.nextBtnText}>NEXT →</Text>
            </TouchableOpacity>
          : <TouchableOpacity style={s.submitBtn} onPress={() => setSubmitted(true)}>
              <Text style={s.submitBtnText}>SUBMIT ROUND</Text>
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
  stepDot:            { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center' },
  stepActive:         { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  stepDone:           { borderColor: '#7DC87A', backgroundColor: '#7DC87A22' },
  stepNum:            { fontSize: 10, color: '#B8A882' },
  stepNumActive:      { color: '#C9A84C' },
  stepCheck:          { fontSize: 10, color: '#7DC87A' },
  stepLine:           { flex: 1, height: 1, backgroundColor: '#C9A84C22', marginHorizontal: 2 },
  stepLineDone:       { backgroundColor: '#7DC87A44' },
  scroll:             { flex: 1 },
  stepContent:        { paddingHorizontal: 22 },
  stepTitle:          { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 20 },
  searchInput:        { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 12, padding: 14, color: '#F5EDD8', fontSize: 15, marginBottom: 12 },
  loadingText:        { fontSize: 12, color: '#B8A88266', marginBottom: 8 },
  optionRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 12, padding: 16, marginBottom: 8 },
  optionSelected:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C11' },
  optionText:         { fontSize: 15, color: '#B8A882' },
  optionTextSelected: { color: '#F5EDD8', fontWeight: '500' },
  optionSubtext:      { fontSize: 11, color: '#B8A88266', marginTop: 2 },
  checkmark:          { fontSize: 14, color: '#C9A84C' },
  groupLabel:         { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10, marginTop: 20 },
  buttonGroup:        { flexDirection: 'row', gap: 10 },
  groupBtn:           { flex: 1, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  groupBtnActive:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  groupBtnText:       { fontSize: 14, color: '#B8A882', fontWeight: '500' },
  groupBtnTextActive: { color: '#F5EDD8' },
  timeRow:            { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  timeCol:            { flex: 1 },
  timeColon:          { fontSize: 24, color: '#C9A84C', marginTop: 38 },
  timeScroll:         { maxHeight: 220 },
  timeItem:           { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 6 },
  timeItemActive:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  timeText:           { fontSize: 18, color: '#B8A882', fontWeight: '300' },
  timeTextActive:     { color: '#F5EDD8' },
  elapsedCard:        { alignItems: 'center', marginTop: 32, paddingVertical: 28, borderTopWidth: 1, borderTopColor: '#C9A84C22' },
  elapsedValue:       { fontSize: 72, fontWeight: '400', color: '#C9A84C', fontFamily: 'monospace', lineHeight: 80 },
  elapsedLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginTop: 8, opacity: 0.6 },
  summaryCard:        { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#C9A84C22', overflow: 'hidden', marginBottom: 20 },
  summaryRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#C9A84C11' },
  summaryLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  summaryValue:       { fontSize: 14, color: '#F5EDD8', fontWeight: '500' },
  scorePreview:       { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A44', padding: 24, alignItems: 'center' },
  scorePreviewLabel:  { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  scorePreviewValue:  { fontSize: 56, fontWeight: '300', color: '#7DC87A', marginBottom: 6 },
  scoreBonus:         { fontSize: 13, fontWeight: '600', color: '#C9A84C', marginBottom: 6 },
  scorePreviewNote:   { fontSize: 11, color: '#B8A882', textAlign: 'center' },
  navRow:             { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 20, backgroundColor: '#090F0A', borderTopWidth: 1, borderTopColor: '#C9A84C11' },
  backBtn:            { paddingVertical: 14, paddingHorizontal: 20 },
  backBtnText:        { fontSize: 12, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  nextBtn:            { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  nextBtnDisabled:    { backgroundColor: '#C9A84C44' },
  nextBtnText:        { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  submitBtn:          { backgroundColor: '#7DC87A', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  submitBtnText:      { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  successContainer:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  successIcon:        { fontSize: 56, marginBottom: 20 },
  successTitle:       { fontSize: 28, fontWeight: '600', color: '#F5EDD8', marginBottom: 10 },
  successSub:         { fontSize: 13, color: '#B8A882', textAlign: 'center', marginBottom: 40, lineHeight: 20 },
  primaryBtn:         { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  primaryBtnText:     { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});
