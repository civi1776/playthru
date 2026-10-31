// ─── RivalryScreen — the "vs" page ─────────────────────────────────────────
// Golf runs on needling your friends; this is the interface for it. Follow
// someone and the app tracks head-to-head: score vs score, shared-course
// record, and the running challenge tally between you two.

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { fetchClockedRatingForUser } from '../lib/clockedRating';
import { totalPointsFromHoleScores } from '../lib/clockedSport';
import InitialsAvatar from '../components/InitialsAvatar';
import ChallengeButton from '../components/ChallengeButton';
import { COLOR, scoreTier, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';

const { bg: BG, surface: CARD, gold: GOLD, cream: CREAM, muted: MUTED, dim: DIM, green: GREEN, red: RED_WARN, border: BORDER } = COLOR;

// Best round points per course, per user — for shared-course head-to-head.
async function fetchBestByCourse(userId) {
  if (!userId) return {};
  const { data } = await supabase
    .from('rounds')
    .select('course_name, hole_scores')
    .eq('user_id', userId)
    .eq('round_format', 'clocked')
    .not('hole_scores', 'is', null)
    .not('course_name', 'is', null);
  const best = {};
  for (const r of data ?? []) {
    const pts = totalPointsFromHoleScores(r.hole_scores);
    if (pts == null) continue;
    if (best[r.course_name] == null || pts > best[r.course_name]) best[r.course_name] = pts;
  }
  return best;
}

export default function RivalryScreen({ navigation, route }) {
  const { userId: rivalId, username: rivalUsername } = route.params ?? {};
  const { user } = useAuth();
  const myId = user?.id;

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [rival, setRival] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [rivalRating, setRivalRating] = useState(null);
  const [headToHead, setHeadToHead] = useState([]); // [{ course, myPts, rivalPts }]
  const [challengeRecord, setChallengeRecord] = useState({ wins: 0, losses: 0, pending: 0 });

  const load = useCallback(async () => {
    if (!myId || !rivalId) return;
    setLoading(true);
    try {
      const [{ data: meProfile }, { data: rivalProfile }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, username, avatar_url, home_course').eq('id', myId).maybeSingle(),
        supabase.from('profiles').select('id, full_name, username, avatar_url, home_course').eq('id', rivalId).maybeSingle(),
      ]);
      setMe(meProfile);
      setRival(rivalProfile);

      const [myR, rivalR, myBest, rivalBest] = await Promise.all([
        fetchClockedRatingForUser(supabase, myId, meProfile),
        fetchClockedRatingForUser(supabase, rivalId, rivalProfile),
        fetchBestByCourse(myId),
        fetchBestByCourse(rivalId),
      ]);
      setMyRating(myR);
      setRivalRating(rivalR);

      const sharedCourses = Object.keys(myBest).filter(c => rivalBest[c] != null);
      setHeadToHead(
        sharedCourses
          .map(course => ({ course, myPts: myBest[course], rivalPts: rivalBest[course] }))
          .sort((a, b) => Math.abs(b.myPts - b.rivalPts) - Math.abs(a.myPts - a.rivalPts))
      );

      const { data: challenges } = await supabase
        .from('challenges')
        .select('challenger_id, challenged_id, winner_id, status')
        .or(`and(challenger_id.eq.${myId},challenged_id.eq.${rivalId}),and(challenger_id.eq.${rivalId},challenged_id.eq.${myId})`);
      let wins = 0, losses = 0, pending = 0;
      for (const c of challenges ?? []) {
        if (c.status === 'pending' || c.status === 'accepted') { pending++; continue; }
        if (c.winner_id === myId) wins++;
        else if (c.winner_id === rivalId) losses++;
      }
      setChallengeRecord({ wins, losses, pending });
    } catch { /* rivalry data is a bonus layer — fail quiet */ }
    setLoading(false);
  }, [myId, rivalId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !me || !rival) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator color={GOLD} /></View>
      </SafeAreaView>
    );
  }

  const myTier = scoreTier(myRating?.clockedScore, myRating?.isProvisional);
  const rivalTier = scoreTier(rivalRating?.clockedScore, rivalRating?.isProvisional);
  const scoreDiff = (myRating?.clockedScore ?? 0) - (rivalRating?.clockedScore ?? 0);
  const coursesWon = headToHead.filter(h => h.myPts > h.rivalPts).length;
  const coursesLost = headToHead.filter(h => h.myPts < h.rivalPts).length;
  const coursesTied = headToHead.length - coursesWon - coursesLost;
  const mostRecentSharedCourse = headToHead[0]?.course ?? rival.home_course ?? null;

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="RIVALRY" onBack={() => navigation.goBack()} borderless />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── VS matchup ── */}
        <View style={s.vsRow}>
          <View style={s.vsSide}>
            <InitialsAvatar name={me.full_name} size={56} avatarUrl={me.avatar_url} username={me.username} />
            <Text style={s.vsName} numberOfLines={1}>YOU</Text>
            <Text style={[s.vsScore, { color: myTier.color }]}>{myRating?.clockedScore ?? '—'}</Text>
            <Text style={[s.vsTier, { color: myTier.color }]}>{myTier.name}</Text>
          </View>
          <View style={s.vsCenter}>
            <Text style={s.vsLabel}>VS</Text>
            {scoreDiff !== 0 && (
              <Text style={[s.vsDiff, { color: scoreDiff > 0 ? GREEN : RED_WARN }]}>
                {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
              </Text>
            )}
          </View>
          <View style={s.vsSide}>
            <InitialsAvatar name={rival.full_name} size={56} avatarUrl={rival.avatar_url} username={rival.username} />
            <Text style={s.vsName} numberOfLines={1}>{(rivalUsername ?? rival.username ?? 'RIVAL').toUpperCase()}</Text>
            <Text style={[s.vsScore, { color: rivalTier.color }]}>{rivalRating?.clockedScore ?? '—'}</Text>
            <Text style={[s.vsTier, { color: rivalTier.color }]}>{rivalTier.name}</Text>
          </View>
        </View>

        {/* ── Challenge record ── */}
        <View style={s.sectionLabelRow}><Text style={s.sectionLabel}>CHALLENGE RECORD</Text></View>
        <View style={s.recordRow}>
          <View style={s.recordItem}>
            <Text style={[s.recordNum, { color: GREEN }]}>{challengeRecord.wins}</Text>
            <Text style={s.recordLabel}>WINS</Text>
          </View>
          <View style={s.recordItem}>
            <Text style={[s.recordNum, { color: RED_WARN }]}>{challengeRecord.losses}</Text>
            <Text style={s.recordLabel}>LOSSES</Text>
          </View>
          <View style={s.recordItem}>
            <Text style={[s.recordNum, { color: DIM }]}>{challengeRecord.pending}</Text>
            <Text style={s.recordLabel}>PENDING</Text>
          </View>
        </View>

        {/* ── Head-to-head courses ── */}
        <View style={s.sectionLabelRow}>
          <Text style={s.sectionLabel}>SHARED COURSES</Text>
          {headToHead.length > 0 && (
            <Text style={s.sectionSub}>{coursesWon}-{coursesLost}{coursesTied ? `-${coursesTied}` : ''}</Text>
          )}
        </View>
        {headToHead.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>No courses played by both of you yet.</Text>
            <Text style={s.emptySub}>Log a clocked round at the same course to start the record.</Text>
          </View>
        ) : (
          headToHead.map((h) => {
            const iWon = h.myPts > h.rivalPts;
            const tied = h.myPts === h.rivalPts;
            return (
              <View key={h.course} style={s.courseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.courseName} numberOfLines={1}>{h.course}</Text>
                </View>
                <Text style={[s.coursePts, { color: iWon ? GREEN : (tied ? MUTED : RED_WARN) }]}>
                  {h.myPts > 0 ? `+${h.myPts}` : h.myPts}
                </Text>
                <Text style={s.courseDash}>—</Text>
                <Text style={[s.coursePts, { color: !iWon && !tied ? GREEN : (tied ? MUTED : RED_WARN) }]}>
                  {h.rivalPts > 0 ? `+${h.rivalPts}` : h.rivalPts}
                </Text>
              </View>
            );
          })
        )}

        {/* ── Challenge CTA ── */}
        {mostRecentSharedCourse && (
          <View style={s.challengeWrap}>
            <ChallengeButton
              targetUserId={rivalId}
              targetUsername={rivalUsername ?? rival.username}
              courseName={mostRecentSharedCourse}
              challengerScore={headToHead[0]?.myPts ?? null}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: BG },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  vsRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16, gap: 8 },
  vsSide:      { flex: 1, alignItems: 'center', gap: 6 },
  vsName:      { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 1.5, marginTop: 4 },
  vsScore:     { fontSize: 40, fontWeight: '200', fontVariant: ['tabular-nums'] },
  vsTier:      { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  vsCenter:    { alignItems: 'center', width: 56 },
  vsLabel:     { fontSize: 14, fontWeight: '800', color: DIM, letterSpacing: 2 },
  vsDiff:      { fontSize: 12, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },

  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionLabel:    { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 2.5 },
  sectionSub:      { fontSize: 11, fontWeight: '700', color: MUTED, fontVariant: ['tabular-nums'] },

  recordRow:   { flexDirection: 'row', marginHorizontal: 16, backgroundColor: CARD, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER, paddingVertical: 16 },
  recordItem:  { flex: 1, alignItems: 'center' },
  recordNum:   { fontSize: 24, fontWeight: '300', fontVariant: ['tabular-nums'] },
  recordLabel: { fontSize: 8, fontWeight: '700', color: DIM, letterSpacing: 1.5, marginTop: 4 },

  emptyCard:   { marginHorizontal: 16, backgroundColor: CARD, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER, padding: 20, alignItems: 'center' },
  emptyText:   { fontSize: 13, color: CREAM, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
  emptySub:    { fontSize: 11, color: DIM, textAlign: 'center' },

  courseRow:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 8 },
  courseName:  { fontSize: 12, color: CREAM, fontWeight: '600' },
  coursePts:   { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 32, textAlign: 'center' },
  courseDash:  { fontSize: 11, color: DIM },

  challengeWrap: { alignItems: 'center', marginTop: 28, marginBottom: 8 },
});
