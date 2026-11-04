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
import { fetchHeadToHead } from '../lib/headToHead';
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
  const [h2h, setH2h] = useState(null); // rounds together, arcade duels

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

      const record = await fetchHeadToHead(myId, rivalId, meProfile?.full_name || meProfile?.username, rivalProfile?.full_name || rivalProfile?.username);
      setH2h(record);
      setChallengeRecord(record.challenges);
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

  // No rounds → no earned score. computeFullRating returns a cold-start
  // baseline for zero rounds; never show it as if it were a Clocked Score.
  const myScore = (myRating?.roundsUsed ?? 0) > 0 ? myRating?.clockedScore : null;
  const rivalScore = (rivalRating?.roundsUsed ?? 0) > 0 ? rivalRating?.clockedScore : null;
  const myTier = scoreTier(myScore, myRating?.isProvisional || myScore == null);
  const rivalTier = scoreTier(rivalScore, rivalRating?.isProvisional || rivalScore == null);
  const scoreDiff = myScore != null && rivalScore != null ? myScore - rivalScore : 0;
  const coursesWon = headToHead.filter(h => h.myPts > h.rivalPts).length;
  const coursesLost = headToHead.filter(h => h.myPts < h.rivalPts).length;
  const coursesTied = headToHead.length - coursesWon - coursesLost;
  const mostRecentSharedCourse = headToHead[0]?.course ?? rival.home_course ?? null;
  const together = h2h ? h2h.wins + h2h.losses + h2h.ties : 0;
  const arcadeTotal = h2h ? h2h.arcade.wins + h2h.arcade.losses + h2h.arcade.ties : 0;
  const fmtDate = iso => { const d = new Date(iso); return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`; };
  const sgn = v => (v > 0 ? `+${v}` : String(v));

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="RIVALRY" onBack={() => navigation.goBack()} borderless />

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── VS matchup ── */}
        <View style={s.vsRow}>
          <View style={s.vsSide}>
            <InitialsAvatar name={me.full_name} size={56} avatarUrl={me.avatar_url} username={me.username} />
            <Text style={s.vsName} numberOfLines={1}>YOU</Text>
            <Text style={[s.vsScore, { color: myTier.color }]}>{myScore ?? '\u2014'}</Text>
            <Text style={[s.vsTier, { color: myTier.color }]}>{myScore == null ? 'NO ROUNDS' : myTier.name}</Text>
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
            <Text style={[s.vsScore, { color: rivalTier.color }]}>{rivalScore ?? '\u2014'}</Text>
            <Text style={[s.vsTier, { color: rivalTier.color }]}>{rivalScore == null ? 'NO ROUNDS' : rivalTier.name}</Text>
          </View>
        </View>

        {/* ── Record ── */}
        <View style={s.sectionLabelRow}><Text style={s.sectionLabel}>RECORD</Text></View>
        <View style={s.recordRow}>
          <View style={s.recordItem}>
            <Text style={[s.recordNum, { color: together ? (h2h.wins > h2h.losses ? GREEN : h2h.losses > h2h.wins ? RED_WARN : CREAM) : DIM }]}>
              {together ? `${h2h.wins}\u2013${h2h.losses}${h2h.ties ? `\u2013${h2h.ties}` : ''}` : '\u2014'}
            </Text>
            <Text style={s.recordLabel}>ROUNDS TOGETHER</Text>
          </View>
          <View style={s.recordItem}>
            <Text style={[s.recordNum, { color: challengeRecord.wins + challengeRecord.losses ? (challengeRecord.wins >= challengeRecord.losses ? GREEN : RED_WARN) : DIM }]}>
              {challengeRecord.wins + challengeRecord.losses ? `${challengeRecord.wins}\u2013${challengeRecord.losses}` : '\u2014'}
            </Text>
            <Text style={s.recordLabel}>CHALLENGES{challengeRecord.pending ? ` \u00B7 ${challengeRecord.pending} OPEN` : ''}</Text>
          </View>
          <View style={s.recordItem}>
            <Text style={[s.recordNum, { color: arcadeTotal ? (h2h.arcade.wins >= h2h.arcade.losses ? GREEN : RED_WARN) : DIM }]}>
              {arcadeTotal ? `${h2h.arcade.wins}\u2013${h2h.arcade.losses}${h2h.arcade.ties ? `\u2013${h2h.arcade.ties}` : ''}` : '\u2014'}
            </Text>
            <Text style={s.recordLabel}>ARCADE{h2h?.arcade.open ? ` \u00B7 ${h2h.arcade.open} OPEN` : ''}</Text>
          </View>
        </View>

        {/* ── Rounds together ── */}
        <View style={s.sectionLabelRow}>
          <Text style={s.sectionLabel}>ROUNDS TOGETHER</Text>
          {!!h2h?.pendingConfirm && <Text style={s.sectionSub}>{h2h.pendingConfirm} awaiting confirmation</Text>}
        </View>
        {!h2h?.matchups?.length ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>No rounds on the same card yet.</Text>
            <Text style={s.emptySub}>Add {rivalUsername ? '@' + rivalUsername : 'them'} as a player when you set up a Clocked round.</Text>
          </View>
        ) : (
          h2h.matchups.map(m => {
            const iWon = m.myPts > m.theirPts, tied = m.myPts === m.theirPts;
            return (
              <View key={m.roundId} style={s.courseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.courseName} numberOfLines={1}>{m.course || 'Quick Play'}</Text>
                  <Text style={s.courseMeta}>{fmtDate(m.date)}{m.holes ? ` \u00B7 ${m.holes} holes` : ''}{m.confirmed ? '' : ' \u00B7 unconfirmed'}</Text>
                </View>
                <Text style={[s.coursePts, { color: tied ? MUTED : iWon ? GREEN : RED_WARN }]}>{sgn(m.myPts)}</Text>
                <Text style={s.courseDash}>vs</Text>
                <Text style={[s.coursePts, { color: tied ? MUTED : iWon ? RED_WARN : GREEN }]}>{sgn(m.theirPts)}</Text>
              </View>
            );
          })
        )}

        {/* ── Head-to-head courses ── */}
        <View style={s.sectionLabelRow}>
          <Text style={s.sectionLabel}>BEST AT SHARED COURSES</Text>
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
  courseMeta:  { fontSize: 10, color: DIM, marginTop: 1 },
  coursePts:   { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 32, textAlign: 'center' },
  courseDash:  { fontSize: 11, color: DIM },

  challengeWrap: { alignItems: 'center', marginTop: 28, marginBottom: 8 },
});
