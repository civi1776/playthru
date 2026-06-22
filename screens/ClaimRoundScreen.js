/*
 * Deep-link setup required to open this screen from a push notification:
 * 1. Configure expo-linking with a scheme (e.g. playthru://).
 * 2. In App.js, add a Notifications.addNotificationResponseReceivedListener
 *    that reads the notification data payload (roundId, courseName, etc.)
 *    and calls navigation.navigate('ClaimRound', { round: ... }).
 * 3. The caddy's Supabase Edge Function should embed the round data
 *    or a round ID in the push payload.
 *
 * For now, this screen is navigable directly for testing via:
 *   navigation.navigate('ClaimRound', { round: { ... } })
 */

import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function DetailRow({ label, value, last }) {
  return (
    <View style={[s.detailRow, !last && s.detailRowBorder]}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

export default function ClaimRoundScreen({ navigation, route }) {
  const { session } = useAuth();
  const { round } = route.params ?? {};
  const [loading, setLoading] = useState(false);

  if (!round) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.errorState}>
          <Ionicons name="alert-circle-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.errorText}>Round data not found.</Text>
          <TouchableOpacity style={s.btn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={s.btnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Caddy-logged rounds receive a 5% POPScore bonus, capped at 5.0
  const basePOP     = round.pop_score ?? 3.5;
  const claimedPOP  = parseFloat(Math.min(5.0, basePOP * 1.05).toFixed(1));

  const handleAccept = async () => {
    setLoading(true);
    try {
      const userId = session?.user?.id;
      if (!userId) { setLoading(false); Alert.alert('Error', 'Not signed in.'); return; }
      const { error } = await supabase.from('rounds').insert({
        course_name:               round.course_name,
        holes:                     round.holes,
        transport:                 round.transport,
        players:                   round.players,
        tee_time:                  round.tee_time,
        finish_time:               round.finish_time,
        duration_minutes:          round.duration_minutes,
        score_vs_handicap:         round.score_vs_handicap,
        pace_delay:                round.pace_delay,
        course_baseline_minutes:   round.course_baseline_minutes,
        adjusted_duration_minutes: round.adjusted_duration_minutes,
        pop_score:                 claimedPOP,
        user_id:                   userId,
        caddy_logged:              true,
        caddy_id:                  round.caddy_id,
      });
      if (error) throw error;

      // Update profile pop_score (rolling 5-round avg)
      const { data: recentRounds } = await supabase
        .from('rounds')
        .select('pop_score')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (recentRounds?.length > 0) {
        const avg = recentRounds.reduce((s, r) => s + r.pop_score, 0) / recentRounds.length;
        await supabase
          .from('profiles')
          .update({ pop_score: parseFloat(avg.toFixed(2)) })
          .eq('id', userId);
      }

      Alert.alert(
        'Round Added',
        `Your Clocked Score for this round is ${claimedPOP.toFixed(1)}. (+5% caddy bonus applied)`,
      );
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Could not add this round. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerLabel}>CADDY ROUND</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 48, paddingTop: 8 }}>

        {/* Course card */}
        <View style={s.courseCard}>
          <View style={s.caddyTag}>
            <Ionicons name="person" size={9} color="#C9A84C" style={{ marginRight: 4 }} />
            <Text style={s.caddyTagText}>CADDY LOGGED</Text>
          </View>
          <Text style={s.courseName}>{round.course_name ?? '—'}</Text>
          <Text style={s.courseMeta}>
            {[round.holes && `${round.holes} holes`, round.transport, round.players && `${round.players}P`].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* POPScore card */}
        <View style={s.popCard}>
          <Text style={s.popLabel}>YOUR CLOCKED SCORE</Text>
          <Text style={[s.popValue, { color: popColor(claimedPOP) }]}>{claimedPOP.toFixed(1)}</Text>
          <View style={s.bonusRow}>
            <Ionicons name="arrow-up-circle" size={12} color="#7DC87A" style={{ marginRight: 4 }} />
            <Text style={s.popBonus}>+5% caddy-logged bonus applied</Text>
          </View>
        </View>

        {/* Round details */}
        <View style={s.detailCard}>
          <DetailRow label="TEE TIME"    value={round.tee_time ?? '—'} />
          <DetailRow label="FINISH TIME" value={round.finish_time ?? '—'} />
          <DetailRow label="DURATION"    value={formatDuration(round.duration_minutes)} />
          <DetailRow label="VS HANDICAP" value={round.score_vs_handicap ?? '—'} last />
        </View>

        <Text style={s.disclaimer}>
          A caddy logged this round for your group at {round.course_name ?? 'this course'}. Adding it to your history will record an Clocked Score of {claimedPOP.toFixed(1)}.
        </Text>

        <TouchableOpacity
          style={[s.btn, s.btnAccept, loading && { opacity: 0.5 }]}
          onPress={handleAccept}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={s.btnText}>{loading ? 'ADDING...' : 'ADD TO MY HISTORY'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.btnDecline}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={s.btnDeclineText}>DECLINE</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#090F0A' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:        { width: 40, height: 40, justifyContent: 'center' },
  backArrow:      { fontSize: 22, color: '#C9A84C' },
  headerLabel:    { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  errorState:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  errorText:      { fontSize: 18, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', marginBottom: 24 },
  courseCard:     { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', padding: 18, marginBottom: 10 },
  caddyTag:       { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#C9A84C22', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 10 },
  caddyTagText:   { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  courseName:     { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 4 },
  courseMeta:     { fontSize: 12, color: '#B8A882' },
  popCard:        { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A33', padding: 24, alignItems: 'center', marginBottom: 10 },
  popLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  popValue:       { fontSize: 64, fontWeight: '300', marginBottom: 8 },
  bonusRow:       { flexDirection: 'row', alignItems: 'center' },
  popBonus:       { fontSize: 11, color: '#7DC87A', fontWeight: '600' },
  detailCard:     { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', overflow: 'hidden', marginBottom: 16 },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  detailRowBorder:{ borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  detailLabel:    { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  detailValue:    { fontSize: 14, color: '#F5EDD8', fontWeight: '500' },
  disclaimer:     { fontSize: 12, color: '#7A6E58', lineHeight: 18, marginBottom: 20, textAlign: 'center', fontFamily: 'serif' },
  btn:            { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnAccept:      { backgroundColor: '#7DC87A', marginBottom: 10 },
  btnText:        { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  btnDecline:     { paddingVertical: 14, alignItems: 'center' },
  btnDeclineText: { fontSize: 11, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
});
