// ─── ConfirmRoundScreen — confirm/decline a round you played in ──────────────
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatSeconds } from '../lib/clockedSport';

const BG     = '#090F0A';
const CARD   = '#0D1A0F';
const GOLD   = '#C9A84C';
const CREAM  = '#F5EDD8';
const MUTED  = '#B8A882';
const DIM    = '#7A6E58';
const GREEN  = '#7DC87A';
const RED    = '#E85D4A';
const BORDER = '#7DC87A22';

function pointsColor(pts) {
  if (pts >= 6) return GOLD;
  if (pts >= 3) return GREEN;
  if (pts >= 1) return CREAM;
  if (pts === 0) return MUTED;
  return RED;
}

export default function ConfirmRoundScreen({ navigation, route }) {
  const { user } = useAuth();
  const roundId   = route.params?.roundId;
  const playerKey = route.params?.playerKey;

  const [loading, setLoading]       = useState(true);
  const [round, setRound]           = useState(null);
  const [participation, setParticipation] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!roundId || !user?.id) return;
    (async () => {
      const [roundRes, partRes] = await Promise.all([
        supabase.from('rounds').select('*').eq('id', roundId).maybeSingle(),
        supabase.from('round_participants').select('*')
          .eq('round_id', roundId).eq('user_id', user.id).maybeSingle(),
      ]);
      setRound(roundRes.data);
      setParticipation(partRes.data);
      setLoading(false);
    })();
  }, [roundId, user?.id]);

  const handleConfirm = async () => {
    setSubmitting(true);
    await supabase.from('round_participants')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('round_id', roundId).eq('user_id', user.id);
    navigation.goBack();
  };

  const handleDecline = async () => {
    setSubmitting(true);
    await supabase.from('round_participants')
      .update({ status: 'declined' })
      .eq('round_id', roundId).eq('user_id', user.id);
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={GOLD} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!round || !participation) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <Text style={s.errorText}>Round not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Text style={s.backBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const myKey = participation.player_key ?? playerKey;
  const holeScores = round.hole_scores ?? [];
  const alreadyHandled = participation.status !== 'pending';

  // Extract this player's holes
  const myHoles = holeScores.map((h, i) => {
    const me = h.players?.find(p => p.name === myKey);
    return { hole: i + 1, par: h.par, strokes: me?.grossStrokes, points: me?.points, label: me?.label, elapsed: h.elapsed, timePar: h.timePar, penalty: h.penalty };
  });

  const totalPoints = myHoles.reduce((s, h) => s + (h.points ?? 0), 0);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Ionicons name="arrow-back" size={20} color={GOLD} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>CONFIRM ROUND</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Round info */}
        <Text style={s.courseName}>{round.course_name}</Text>
        <Text style={s.meta}>
          {round.holes} holes {'\u00B7'} {round.transport}
          {round.created_at ? ` \u00B7 ${new Date(round.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </Text>

        {alreadyHandled && (
          <View style={[s.statusBadge, { borderColor: participation.status === 'confirmed' ? GREEN : RED }]}>
            <Text style={[s.statusText, { color: participation.status === 'confirmed' ? GREEN : RED }]}>
              {participation.status === 'confirmed' ? 'CONFIRMED' : 'DECLINED'}
            </Text>
          </View>
        )}

        {/* Your scorecard */}
        <Text style={s.sectionLabel}>YOUR SCORES ({myKey})</Text>
        <View style={s.card}>
          <View style={s.scHeaderRow}>
            <Text style={[s.scCell, s.scHole]}>HOLE</Text>
            <Text style={[s.scCell, s.scPar]}>PAR</Text>
            <Text style={[s.scCell, s.scStrokes]}>STROKES</Text>
            <Text style={[s.scCell, s.scPts]}>PTS</Text>
            <Text style={[s.scCell, s.scLabel]}>RESULT</Text>
          </View>
          {myHoles.map(h => (
            <View key={h.hole} style={s.scRow}>
              <Text style={[s.scCell, s.scHole, { color: CREAM }]}>{h.hole}</Text>
              <Text style={[s.scCell, s.scPar, { color: CREAM }]}>{h.par}</Text>
              <Text style={[s.scCell, s.scStrokes, { color: CREAM }]}>{h.strokes ?? '\u2014'}</Text>
              <Text style={[s.scCell, s.scPts, { color: pointsColor(h.points ?? 0) }]}>
                {h.points != null ? (h.points > 0 ? `+${h.points}` : h.points) : '\u2014'}
              </Text>
              <Text style={[s.scCell, s.scLabel, { color: pointsColor(h.points ?? 0) }]}>{h.label ?? ''}</Text>
            </View>
          ))}
          <View style={s.scTotalRow}>
            <Text style={[s.scCell, s.scHole, s.scTotalText]}>TOT</Text>
            <Text style={[s.scCell, s.scPar]}></Text>
            <Text style={[s.scCell, s.scStrokes]}></Text>
            <Text style={[s.scCell, s.scPts, s.scTotalText, { color: pointsColor(totalPoints) }]}>
              {totalPoints > 0 ? `+${totalPoints}` : totalPoints}
            </Text>
            <Text style={[s.scCell, s.scLabel]}></Text>
          </View>
        </View>

        {/* Actions */}
        {!alreadyHandled && (
          <View style={s.actions}>
            <Text style={s.actionsHint}>Confirming adds this on-the-clock round to your Clocked Score and history.</Text>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} disabled={submitting} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={20} color={BG} />
              <Text style={s.confirmBtnText}>CONFIRM</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.declineBtn} onPress={handleDecline} disabled={submitting} activeOpacity={0.85}>
              <Text style={s.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: BG },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText:   { fontSize: 14, color: DIM },
  backBtn:     { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  backBtnText: { fontSize: 12, fontWeight: '700', color: BG, letterSpacing: 2 },

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  headerBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 12, fontWeight: '700', color: GOLD, letterSpacing: 3 },

  content:     { paddingHorizontal: 16, paddingBottom: 40 },
  courseName:  { fontSize: 22, fontWeight: '600', color: CREAM, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  meta:        { fontSize: 12, color: DIM, textAlign: 'center', marginBottom: 16 },

  statusBadge: { alignSelf: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  statusText:  { fontSize: 10, fontWeight: '700', letterSpacing: 2 },

  sectionLabel:{ fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 3, marginBottom: 8 },

  card:        { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 20 },
  scHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 6, marginBottom: 4 },
  scRow:       { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#7DC87A0D' },
  scTotalRow:  { flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderTopColor: GOLD + '44', marginTop: 4 },
  scCell:      { fontSize: 11, color: MUTED, textAlign: 'center' },
  scHole:      { width: 36, fontWeight: '700' },
  scPar:       { width: 32 },
  scStrokes:   { width: 52 },
  scPts:       { width: 40, fontWeight: '600', fontVariant: ['tabular-nums'] },
  scLabel:     { flex: 1 },
  scTotalText: { fontSize: 12, fontWeight: '700' },

  actions:     { alignItems: 'center', gap: 12 },
  actionsHint: { fontSize: 12, color: DIM, textAlign: 'center', marginBottom: 4, lineHeight: 18 },
  confirmBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 36, width: '100%', justifyContent: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 2 },
  declineBtn:  { paddingVertical: 10 },
  declineBtnText: { fontSize: 13, color: DIM },
});
