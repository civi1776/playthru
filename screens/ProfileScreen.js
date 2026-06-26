import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, RefreshControl, TouchableOpacity, StyleSheet, Alert, Share, ActivityIndicator } from 'react-native';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getReferralStats } from '../lib/referrals';
import { PRO_ENABLED } from '../lib/featureFlags';
import Gauge from '../components/guage';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';
import VerificationBadge from '../components/VerificationBadge';
import ClockedScoreCard from '../components/ClockedScoreCard';
import RecentRoundsList from '../components/RecentRoundsList';
import { computeFullRating, extractPlayerRoundStats } from '../lib/clockedRating';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMemberSince(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Member since ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatShortDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(isoStr);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[d.getMonth()]} ${d.getDate()}`;
}

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function paceTier(score) {
  if (score == null) return null;
  if (score >= 5.0) return 'Elite Pacer';
  if (score >= 4.0) return 'Fast Golfer';
  if (score >= 3.0) return 'Average Pace';
  if (score >= 2.0) return 'Slow Player';
  return 'Pace Improvement Needed';
}

const DELAY_DOT = {
  none:     { color: '#7DC87A', label: 'No delay'       },
  few:      { color: '#D4B86A', label: 'Some delay'     },
  many:     { color: '#E8924C', label: 'Course delay'   },
  constant: { color: '#C07A6A', label: 'Constant delay' },
};

// ─── Skeletons ────────────────────────────────────────────────────────────────

function StatTabSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center', gap: 12 }}>
        <SkeletonLoader width={220} height={220} style={{ borderRadius: 110 }} />
        <SkeletonLoader width={80} height={14} />
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <SkeletonLoader width={80} height={10} style={{ marginBottom: 10 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[...Array(4)].map((_, i) => (
            <View key={i} style={{ width: '47%', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, alignItems: 'center', gap: 8 }}>
              <SkeletonLoader width="60%" height={10} />
              <SkeletonLoader width="40%" height={26} />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Handicap helpers ─────────────────────────────────────────────────────────

const HCP_COUNT_MAP = {
  3:1, 4:1, 5:1, 6:2, 7:2, 8:2, 9:3, 10:3,
  11:4, 12:4, 13:5, 14:5, 15:6, 16:6, 17:7, 18:8, 19:9, 20:10,
};

function computeHandicapHistory(rounds) {
  const withDiff = [...rounds]
    .filter(r => r.differential != null)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const history = [];
  for (let i = 2; i < withDiff.length; i++) {
    const window = withDiff.slice(Math.max(0, i - 19), i + 1);
    const n = Math.min(window.length, 20);
    const count = HCP_COUNT_MAP[n] || 10;
    const sorted = [...window].sort((a, b) => a.differential - b.differential);
    const best = sorted.slice(0, count);
    const avg = best.reduce((sum, r) => sum + r.differential, 0) / best.length;
    history.push(Math.max(0, Math.min(54, Math.round(avg * 0.96 * 10) / 10)));
  }
  return history.slice(-10);
}

function formatHandicap(hcp) {
  if (hcp == null) return '—';
  if (hcp < 0) return `+${Math.abs(hcp).toFixed(1)}`;
  return hcp.toFixed(1);
}

// ─── Handicap Line Chart ──────────────────────────────────────────────────────

function HandicapLineChart({ data }) {
  const [chartWidth, setChartWidth] = useState(0);
  if (!data || data.length < 2) return null;
  const H = 52;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 0.5;
  const n = data.length;

  return (
    <View
      style={{ height: H + 16, marginTop: 12 }}
      onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && data.map((val, i) => {
        if (i === 0) return null;
        const prev = data[i - 1];
        const x1 = ((i - 1) / (n - 1)) * chartWidth;
        const y1 = 8 + ((val  - min) / range) * (H - 8); // higher value = lower on chart (worse)
        const x2 = (i / (n - 1)) * chartWidth;
        const y2 = 8 + ((val  - min) / range) * (H - 8);
        const py1 = 8 + ((prev - min) / range) * (H - 8);
        const dx = x2 - x1;
        const dy = y2 - py1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const improving = val <= prev;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (x1 + x2) / 2 - len / 2,
              top: (py1 + y2) / 2 - 1,
              width: len,
              height: 2,
              borderRadius: 1,
              backgroundColor: improving ? '#7DC87A' : '#C07A6A',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
      {chartWidth > 0 && data.map((val, i) => {
        const x = (i / (n - 1)) * chartWidth;
        const y = 8 + ((val - min) / range) * (H - 8);
        return (
          <View
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: x - 4,
              top: y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#7DC87A',
              borderWidth: 1.5,
              borderColor: '#090F0A',
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Stat Tab ─────────────────────────────────────────────────────────────────

// ─── Profile Activity Tab ─────────────────────────────────────────────────────

function ActivityRow({ item }) {
  const typeMap = {
    round_logged:       { icon: 'golf',        color: '#7DC87A', label: c => `Logged a round at ${c?.course_name ?? '—'}` },
    live_round_started: { icon: 'golf',        color: '#7DC87A', label: c => `Playing live at ${c?.course_name ?? 'a course'} right now` },
    milestone:          { icon: 'trophy',      color: '#C9A84C', label: c => c?.title ?? 'Reached a milestone' },
    leaderboard:        { icon: 'trending-up', color: '#C9A84C', label: c => c?.description ?? 'Moved on the leaderboard' },
    course_review:      { icon: 'location',    color: '#7DC87A', label: c => `Reviewed ${c?.course_name ?? 'a course'}` },
    user_post:          { icon: 'chatbubble',  color: '#B8A882', label: c => c?.text?.slice(0, 80) ?? 'Shared an update' },
    course_leader:      { icon: 'trophy',      color: '#C9A84C', label: c => c?.description ?? 'Set a course record' },
  };
  const info    = typeMap[item.type] ?? { icon: 'ellipsis-horizontal', color: '#7A6E58', label: () => 'Activity' };
  const content = item.content ?? {};
  const pop     = content.pop_score;
  return (
    <View style={s.activityRow}>
      <View style={[s.activityIconWrap, { backgroundColor: info.color + '22' }]}>
        <Ionicons name={info.icon} size={16} color={info.color} />
      </View>
      <View style={s.activityContent}>
        <Text style={s.activityLabel}>{info.label(content)}</Text>
        {item.type === 'round_logged' && pop != null && (
          <Text style={[s.activityPop, { color: popColor(pop) }]}>{pop.toFixed(1)} CLK</Text>
        )}
        <Text style={s.activityTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
  );
}

function ActivityTab({ userId }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('activity_feed')
      .select('id, type, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems(data ?? []);
  }, [userId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <ActivityIndicator color="#C9A84C" style={{ marginTop: 40 }} />;
  if (!items.length) return (
    <View style={s.activityEmpty}>
      <Ionicons name="time-outline" size={36} color="rgba(201,168,76,0.2)" style={{ marginBottom: 10 }} />
      <Text style={s.activityEmptyText}>No activity yet.</Text>
    </View>
  );
  return (
    <FlatList
      data={items}
      keyExtractor={i => i.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
      renderItem={({ item }) => <ActivityRow item={item} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}

// ─── Score Trend Chart ────────────────────────────────────────────────────────

function ScoreTrendChart({ rounds }) {
  const [w, setW]               = useState(0);
  const [tooltipIdx, setTipIdx] = useState(null);

  const data = [...(rounds ?? [])]
    .filter(r => r.pop_score != null)
    .slice(0, 20)
    .reverse();

  if (data.length < 3 || w === 0) {
    return (
      <View
        style={s.chartCard}
        onLayout={e => setW(e.nativeEvent.layout.width)}
      >
        <Text style={s.sectionLabel}>SCORE TREND</Text>
      </View>
    );
  }

  const H = 110;
  const PX = 24;
  const PY = 12;
  const n  = data.length;
  const toX = i => PX + (i / (n - 1)) * (w - PX * 2);
  const toY = v => PY + (1 - (v - 1.0) / 4.0) * (H - PY * 2);
  const threshY = toY(3.5);
  const pts = data.map((r, i) => `${toX(i).toFixed(1)},${toY(r.pop_score).toFixed(1)}`).join(' ');

  const half     = Math.max(1, Math.floor(n / 2));
  const avgFirst = data.slice(0, half).reduce((s, r) => s + r.pop_score, 0) / half;
  const avgLast  = data.slice(n - half).reduce((s, r) => s + r.pop_score, 0) / half;
  const lineColor = avgLast > avgFirst + 0.1 ? '#7DC87A' : avgLast < avgFirst - 0.1 ? '#C07A6A' : '#C9A84C';

  const tip = tooltipIdx != null ? data[tooltipIdx] : null;

  return (
    <View style={s.chartCard}>
      <Text style={s.sectionLabel}>SCORE TREND</Text>
      <View
        style={{ height: H + 24, position: 'relative' }}
        onLayout={e => setW(e.nativeEvent.layout.width)}
      >
        <Svg width={w} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Line
            x1={PX} y1={threshY} x2={w - PX} y2={threshY}
            stroke="#C9A84C44" strokeWidth={1} strokeDasharray="4,4"
          />
          <Polyline
            points={pts} fill="none"
            stroke={lineColor} strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round"
          />
          {data.map((r, i) => (
            <Circle
              key={i}
              cx={toX(i)} cy={toY(r.pop_score)}
              r={tooltipIdx === i ? 6 : 4}
              fill={tooltipIdx === i ? lineColor : '#0D1A0F'}
              stroke={lineColor} strokeWidth={2}
              onPress={() => setTipIdx(tooltipIdx === i ? null : i)}
            />
          ))}
        </Svg>
        <Text style={[s.chartAxisLabel, { position: 'absolute', left: 0, top: threshY - 8 }]}>3.5</Text>
        {tip != null && (
          <View style={[s.chartTooltip, {
            left: Math.min(Math.max(toX(tooltipIdx) - 55, 0), w - 120),
            top:  Math.max(toY(tip.pop_score) - 60, 0),
          }]}>
            <Text style={s.chartTooltipScore}>{tip.pop_score.toFixed(1)}</Text>
            <Text style={s.chartTooltipCourse} numberOfLines={1}>{tip.course_name ?? '—'}</Text>
            <Text style={s.chartTooltipDate}>{formatShortDate(tip.created_at)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function StatTab({ stats, roundCount, rounds, navigation }) {
  const { profile, user } = useAuth();
  const pop  = profile?.pop_score ?? null;
  const tier = paceTier(pop);
  const hcpIndex = profile?.handicap_index ?? null;
  const hcpTrend = profile?.handicap_trend ?? null;
  const hcpHistory = computeHandicapHistory(rounds ?? []);
  const roundsWithDiff = (rounds ?? []).filter(r => r.differential != null).length;

  const trendIcon = hcpTrend === 'improving' ? 'arrow-down'
    : hcpTrend === 'rising' ? 'arrow-up'
    : 'remove';
  const trendColor = hcpTrend === 'improving' ? '#7DC87A'
    : hcpTrend === 'rising' ? '#C07A6A'
    : '#B8A882';

  const [referralCode, setReferralCode]   = useState(null);
  const [referralCount, setReferralCount] = useState(0);
  const [challenges, setChallenges]       = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    getReferralStats(user.id).then(({ code, count }) => {
      setReferralCode(code);
      setReferralCount(count);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: rows } = await supabase
        .from('challenges')
        .select('id, challenger_id, challenged_id, course_name, challenger_score, challenged_score, status, winner_id, expires_at, created_at')
        .or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!rows?.length) return;
      const oppIds = [...new Set(rows.map(r => r.challenger_id === user.id ? r.challenged_id : r.challenger_id))];
      const { data: oppProfiles } = await supabase.from('profiles').select('id, username').in('id', oppIds);
      const pMap = Object.fromEntries((oppProfiles ?? []).map(p => [p.id, p]));
      setChallenges(rows.map(r => ({
        ...r,
        opponentUsername: pMap[r.challenger_id === user.id ? r.challenged_id : r.challenger_id]?.username ?? '—',
      })));
    })();
  }, [user?.id]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Compact gauge header row */}
      <View style={s.gaugeRow}>
        <View style={s.gaugeCompact}>
          {pop != null
            ? <Gauge score={pop} size={132} />
            : <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 36, fontWeight: '100', color: '#C9A84C44' }}>—</Text>
              </View>
          }
        </View>
        <View style={s.gaugeInfo}>
          {tier
            ? <Text style={s.tierLabel}>{tier.toUpperCase()}</Text>
            : <Text style={s.tierLabelMuted}>LOG A ROUND TO{'\n'}EARN YOUR SCORE</Text>
          }
          <TouchableOpacity onPress={() => navigation.navigate('POPScoreInfo')} activeOpacity={0.7} style={{ marginTop: 6 }}>
            <Text style={s.popInfoLink}>What is my Clocked Score?</Text>
          </TouchableOpacity>
          <View style={{ marginTop: 10, gap: 8 }}>
            <View>
              <Text style={s.scoreStatLabel}>YOUR SCORE</Text>
              <Text style={s.scoreStatValueLg}>{pop != null ? pop.toFixed(1) : '—'}</Text>
            </View>
            <View>
              <Text style={s.scoreStatLabel}>NAT'L AVG</Text>
              <Text style={s.scoreStatValue}>3.9</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Handicap Index card */}
      <View style={s.hcpCard}>
        <View style={s.hcpTopRow}>
          <View>
            <Text style={s.hcpLabel}>HANDICAP INDEX</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Text style={s.hcpValue}>{formatHandicap(hcpIndex)}</Text>
              {hcpIndex != null && (
                <View style={[s.hcpTrendBadge, { backgroundColor: trendColor + '22', borderColor: trendColor + '44' }]}>
                  <Ionicons name={trendIcon} size={12} color={trendColor} />
                  <Text style={[s.hcpTrendText, { color: trendColor }]}>
                    {hcpTrend === 'improving' ? 'IMPROVING' : hcpTrend === 'rising' ? 'RISING' : 'STABLE'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={s.hcpSub}>
          {hcpIndex != null
            ? `Based on last ${roundsWithDiff} round${roundsWithDiff !== 1 ? 's' : ''}`
            : 'Log 3 rounds to calculate your handicap'}
        </Text>
        {hcpHistory.length >= 2 && (
          <>
            <Text style={[s.hcpLabel, { marginTop: 16, marginBottom: 4 }]}>TREND</Text>
            <HandicapLineChart data={hcpHistory} />
          </>
        )}
      </View>

      {/* Dominant stats grid */}
      <View style={s.statSection}>
        <Text style={s.sectionLabel}>STATS</Text>
        <View style={s.statGrid}>
          <StatBox label="CLOCKED SCORE"      value={pop != null ? pop.toFixed(1) : '—'} />
          <StatBox label="ROUNDS LOGGED"  value={roundCount ?? 0} />
          <StatBox label="AVG ROUND TIME" value={stats?.avgTime ? formatDuration(Math.round(stats.avgTime)) : '—'} />
          <StatBox label="BEST CLOCKED SCORE" value={stats?.bestScore > 0 ? stats.bestScore.toFixed(1) : '—'} />
          <StatBox label="FASTEST ROUND"  value={stats?.fastestRound && stats.fastestRound < 999 ? formatDuration(stats.fastestRound) : '—'} />
          <StatBox label="AVG GROUP SIZE" value={stats?.avgGroupSize != null ? stats.avgGroupSize.toFixed(1) : '—'} />
          <StatBox label="CART VS WALK"   value={roundCount > 0 ? `${stats?.cartRounds ?? 0}C · ${stats?.walkRounds ?? 0}W` : '—'} />
          <StatBox label="COURSES PLAYED" value={stats?.uniqueCourses ?? 0} />
          <StatBox label="MEMBER SINCE"   value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'} />
          <StatBox label="PACE STREAK"    value={`${calcPaceStreak(rounds)}${calcPaceStreak(rounds) >= 3 ? ' 🔥' : ''}`} sub="rounds ≥ 3.5" />
        </View>
      </View>

      {rounds.length >= 3 && <ScoreTrendChart rounds={rounds} />}

      {/* Challenges section */}
      {challenges.length > 0 && (
        <View style={s.statSection}>
          <Text style={s.sectionLabel}>CHALLENGES</Text>
          {challenges.map(ch => {
            const isChallenger  = ch.challenger_id === user.id;
            const myScore       = isChallenger ? ch.challenger_score : ch.challenged_score;
            const theirScore    = isChallenger ? ch.challenged_score : ch.challenger_score;
            const expired       = new Date(ch.expires_at) < new Date() && (ch.status === 'pending' || ch.status === 'accepted');
            const displayStatus = expired ? 'expired' : ch.status;
            const won           = ch.status === 'completed' && ch.winner_id === user.id;
            const statusColor   = displayStatus === 'completed' ? (won ? '#7DC87A' : '#C07A6A')
              : displayStatus === 'accepted'  ? '#C9A84C'
              : displayStatus === 'expired' || displayStatus === 'declined' ? '#7A6E58'
              : '#B8A882';
            const statusLabel   = displayStatus === 'completed' ? (won ? 'WON' : 'LOST')
              : displayStatus === 'accepted'  ? 'ACTIVE'
              : displayStatus === 'expired'   ? 'EXPIRED'
              : displayStatus === 'declined'  ? 'DECLINED'
              : isChallenger ? 'SENT' : 'RECEIVED';
            const daysLeft = Math.max(0, Math.ceil((new Date(ch.expires_at) - new Date()) / 86400000));
            return (
              <View key={ch.id} style={s.challengeRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <Text style={s.challengeOpponent}>@{ch.opponentUsername}</Text>
                    <View style={[s.challengeBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
                      <Text style={[s.challengeBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                  <Text style={s.challengeCourse}>{ch.course_name}</Text>
                  <Text style={s.challengeScores}>You {myScore != null ? myScore.toFixed(1) : '—'}  ·  Them {theirScore != null ? theirScore.toFixed(1) : '—'}</Text>
                  {displayStatus !== 'completed' && displayStatus !== 'expired' && displayStatus !== 'declined' && (
                    <Text style={s.challengeExpiry}>{daysLeft}d remaining</Text>
                  )}
                </View>
                <Ionicons name="flash" size={14} color={statusColor} style={{ marginTop: 2 }} />
              </View>
            );
          })}
        </View>
      )}

      {/* Referral card */}
      <View style={s.referralCard}>
        <View style={s.referralCardHeader}>
          <Ionicons name="gift-outline" size={18} color="#C9A84C" />
          <Text style={s.referralCardTitle}>REFER A FRIEND</Text>
        </View>
        <Text style={s.referralCardSub}>
          Share your code and help grow the Clocked community.
        </Text>
        <View style={s.referralCodeRow}>
          <Text style={s.referralCodeText}>{referralCode ?? '——————'}</Text>
          {referralCode && (
            <TouchableOpacity
              style={s.referralShareBtn}
              activeOpacity={0.8}
              onPress={() => Share.share({
                message: `Join me on Clocked — the app that tracks pace of play. Use my referral code ${referralCode} when you sign up! https://clocked.golf/join?ref=${referralCode}`,
              })}
            >
              <Ionicons name="share-outline" size={16} color="#090F0A" />
              <Text style={s.referralShareBtnText}>SHARE</Text>
            </TouchableOpacity>
          )}
        </View>
        {referralCount > 0 && (
          <Text style={s.referralCountText}>
            {referralCount} {referralCount === 1 ? 'person' : 'people'} joined with your code
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function calcPaceStreak(rounds) {
  let streak = 0;
  for (const r of (rounds ?? [])) {
    if ((r.pop_score ?? 0) >= 3.5) streak++;
    else break;
  }
  return streak;
}

function StatBox({ label, value, sub }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statBoxLabel}>{label}</Text>
      <Text style={s.statBoxValue}>{value}</Text>
      {sub && <Text style={s.statBoxSub}>{sub}</Text>}
    </View>
  );
}

function StatRow({ label, value, color, last }) {
  return (
    <View style={[s.statRow, !last && s.statRowBorder]}>
      <Text style={s.statRowLabel}>{label}</Text>
      <Text style={[s.statRowValue, color && { color }]}>{value}</Text>
    </View>
  );
}

// ─── Rounds Tab ───────────────────────────────────────────────────────────────

function RoundsTab({ navigation, rounds = [], loading }) {
  const safeRounds = Array.isArray(rounds) ? rounds : [];
  const displayRounds = safeRounds;

  // Betting season history (Pro only)
  const seasonBets = PRO_ENABLED ? (() => {
    const settled = safeRounds.filter(r => r.settlement_data != null);
    let wins = 0, losses = 0, pushes = 0, net = 0;
    for (const r of settled) {
      const d = typeof r.settlement_data === 'string'
        ? (() => { try { return JSON.parse(r.settlement_data); } catch { return null; } })()
        : r.settlement_data;
      if (!d) continue;
      if (d.result === 'win')  { wins++;   net += (d.net_amount ?? 0); }
      else if (d.result === 'loss') { losses++; net += (d.net_amount ?? 0); }
      else if (d.result === 'push') { pushes++; }
    }
    return settled.length > 0 ? { wins, losses, pushes, net, count: settled.length } : null;
  })() : null;

  if (loading) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
        {[...Array(3)].map((_, i) => (
          <View key={i} style={[s.roundCard, { paddingVertical: 22 }]}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SkeletonLoader width={36} height={36} style={{ borderRadius: 8 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <SkeletonLoader width="65%" height={14} />
                <SkeletonLoader width="50%" height={11} />
              </View>
              <SkeletonLoader width={40} height={36} />
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  if (safeRounds.length === 0) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="golf" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
        <Text style={s.emptyText}>No rounds logged yet.</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
          <Text style={s.emptyBtnText}>LOG YOUR FIRST ROUND</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
      <Text style={s.sectionLabel}>{safeRounds.length} ROUND{safeRounds.length !== 1 ? 'S' : ''} LOGGED</Text>
      {displayRounds.map((r, i) => {
        if (!r) return null;
        const delayInfo = r.pace_delay ? DELAY_DOT[r.pace_delay] : null;
        return (
          <View key={i} style={s.roundCard}>
            <View style={s.roundTop}>
              <CourseAvatar courseName={r.course_name || ''} size={36} />
              <View style={s.roundInfo}>
                <Text style={s.roundCourse}>{r.course_name || '—'}</Text>
                <Text style={s.roundMeta}>
                  {formatShortDate(r.created_at)} · {r.holes} holes · {r.transport || '—'} · {r.players ?? '?'}P
                </Text>
              </View>
              <View style={s.roundScoreCol}>
                {r.flagged ? (
                  <View style={s.underReviewBadge}>
                    <Text style={s.underReviewText}>Under Review</Text>
                  </View>
                ) : (
                  <Text style={[s.roundPop, { color: popColor(r.pop_score || 0) }]}>
                    {r.pop_score != null ? r.pop_score.toFixed(1) : '—'}
                  </Text>
                )}
                <Text style={s.roundTime}>{formatDuration(r.duration_minutes)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
              <VerificationBadge level={r.verification_level} />
              {r.caddy_id ? (
                <View style={s.caddyLoggedBadge}>
                  <Ionicons name="person" size={8} color="#090F0A" style={{ marginRight: 3 }} />
                  <Text style={s.caddyLoggedText}>CADDY LOGGED</Text>
                </View>
              ) : null}
              {delayInfo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: delayInfo.color }} />
                  <Text style={[s.delayLabel, { color: delayInfo.color }]}>
                    {delayInfo.label.toUpperCase()}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      {seasonBets && (
        <View style={s.seasonBetsCard}>
          <Text style={s.sectionLabel}>SEASON BETS</Text>
          <View style={s.seasonBetsRow}>
            <View style={s.seasonBetStat}>
              <Text style={s.seasonBetValue}>{seasonBets.wins}</Text>
              <Text style={s.seasonBetLabel}>WINS</Text>
            </View>
            <View style={s.seasonBetStat}>
              <Text style={s.seasonBetValue}>{seasonBets.losses}</Text>
              <Text style={s.seasonBetLabel}>LOSSES</Text>
            </View>
            {seasonBets.pushes > 0 && (
              <View style={s.seasonBetStat}>
                <Text style={s.seasonBetValue}>{seasonBets.pushes}</Text>
                <Text style={s.seasonBetLabel}>PUSHES</Text>
              </View>
            )}
            <View style={s.seasonBetStat}>
              <Text style={[s.seasonBetValue, { color: seasonBets.net >= 0 ? '#7DC87A' : '#C07A6A' }]}>
                {seasonBets.net >= 0 ? '+' : ''}{seasonBets.net.toFixed(0)}
              </Text>
              <Text style={s.seasonBetLabel}>NET ($)</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Caddy helpers ────────────────────────────────────────────────────────────

function teeWindowLabel(teeTimeStr) {
  if (!teeTimeStr) return null;
  const [hm, period] = teeTimeStr.split(' ');
  const [h] = hm.split(':').map(Number);
  let hour = h % 12;
  if (period === 'PM' && h !== 12) hour += 12;
  if (period === 'AM' && h === 12) hour = 0;
  if (hour < 10) return 'morning';
  if (hour < 14) return 'midday';
  return 'afternoon';
}

function getBestWindow(rounds) {
  const windows = { morning: [], midday: [], afternoon: [] };
  for (const r of rounds) {
    const w = teeWindowLabel(r.tee_time);
    if (w && r.caddy_rating != null) windows[w].push(r.caddy_rating);
  }
  let best = null, bestAvg = -1;
  for (const [w, ratings] of Object.entries(windows)) {
    if (ratings.length === 0) continue;
    const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
    if (avg > bestAvg) { bestAvg = avg; best = w; }
  }
  return best;
}

// ─── Caddy Dashboard ──────────────────────────────────────────────────────────

function CaddyDashboard({ caddyCourse, navigation }) {
  const { user } = useAuth();
  const [caddyRounds, setCaddyRounds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [avgRating, setAvgRating]     = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = user?.id;
        if (!uid) { setLoading(false); return; }
        const { data } = await supabase
          .from('rounds')
          .select('course_name, tee_time, holes, players, caddy_rating, created_at')
          .eq('caddy_id', uid)
          .order('created_at', { ascending: false })
          .limit(20);
        const rounds = data || [];
        setCaddyRounds(rounds);
        const rated = rounds.filter(r => r.caddy_rating != null);
        if (rated.length > 0) {
          setAvgRating(parseFloat((rated.reduce((sum, r) => sum + r.caddy_rating, 0) / rated.length).toFixed(1)));
        }
      } catch (e) {
        // silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalRounds = caddyRounds.length;
  const bestWindow  = getBestWindow(caddyRounds);
  const bestWindowLabel = bestWindow === 'morning'   ? 'Best at morning rounds'
    : bestWindow === 'midday'     ? 'Best at midday rounds'
    : bestWindow === 'afternoon'  ? 'Best at afternoon rounds'
    : null;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
      {caddyCourse ? (
        <TouchableOpacity
          style={s.caddyCourseCard}
          onPress={() => navigation.navigate('CourseProfile', { course: { name: caddyCourse } })}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.caddyCourseLabel}>MY COURSE</Text>
            <Text style={s.caddyCourseName}>{caddyCourse}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#C9A84C" />
        </TouchableOpacity>
      ) : null}

      {!loading && avgRating != null && (
        <View style={s.gaugeCard}>
          <Gauge score={avgRating} />
          <View style={s.trendRow}>
            <Text style={s.trendLabel}>CADDY RATING</Text>
          </View>
          {bestWindowLabel && (
            <Text style={{ fontSize: 11, color: '#7DC87A', fontWeight: '600', marginTop: 6 }}>
              {bestWindowLabel.toUpperCase()}
            </Text>
          )}
        </View>
      )}

      <View style={s.statGrid}>
        <StatBox label="ROUNDS CADDIED" value={loading ? '—' : totalRounds} />
        <StatBox label="CADDY RATING"   value={loading ? '—' : avgRating != null ? avgRating.toFixed(1) : '—'} />
      </View>

      {!loading && caddyRounds.length > 0 && (
        <>
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>RECENT ROUNDS CADDIED</Text>
          {caddyRounds.slice(0, 10).map((r, i) => (
            <View key={i} style={s.roundCard}>
              <View style={s.roundTop}>
                <View style={s.roundInfo}>
                  <Text style={s.roundCourse}>{r.course_name}</Text>
                  <Text style={s.roundMeta}>{r.holes} holes · {r.players}P · {r.tee_time}</Text>
                </View>
                <View style={s.roundScoreCol}>
                  <Text style={[s.roundPop, { color: popColor(r.caddy_rating || 0) }]}>
                    {r.caddy_rating != null ? r.caddy_rating.toFixed(1) : '—'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}

      {!loading && caddyRounds.length === 0 && (
        <View style={[s.emptyState, { paddingVertical: 40 }]}>
          <Ionicons name="person" size={40} color="rgba(201,168,76,0.3)" style={{ marginBottom: 12 }} />
          <Text style={[s.emptyText, { fontSize: 16 }]}>No rounds caddied yet.</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
            <Text style={s.emptyBtnText}>LOG A ROUND</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Friends Tab ──────────────────────────────────────────────────────────────

function FriendsTab({ navigation }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const fetchFriends = async () => {
    setLoading(true);
    setError(false);
    try {
      const uid = user?.id;
      if (!uid) { setLoading(false); return; }
      const { data, error: err } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(id, full_name, username, home_course, pop_score)')
        .eq('follower_id', uid);
      if (err) throw err;
      setFriends((data || []).map(r => r.profiles).filter(Boolean));
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchFriends(); }, []));

  const unfollow = async (userId) => {
    setFriends(prev => prev.filter(f => f.id !== userId));
    const uid = user?.id;
    if (!uid) return;
    await supabase.from('follows').delete()
      .eq('follower_id', uid)
      .eq('following_id', userId);
  };

  if (loading) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
        {[...Array(4)].map((_, i) => (
          <View key={i} style={[s.friendCard, { paddingVertical: 18 }]}>
            <SkeletonLoader width={40} height={40} style={{ borderRadius: 20, marginRight: 12 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonLoader width="55%" height={14} />
              <SkeletonLoader width="40%" height={11} />
            </View>
            <SkeletonLoader width={36} height={28} />
          </View>
        ))}
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="cloud-offline-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
        <Text style={s.emptyText}>Could not load your friends.</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={fetchFriends} activeOpacity={0.8}>
          <Text style={s.emptyBtnText}>RETRY</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (friends.length === 0) {
    return (
      <View style={s.emptyState}>
        <Image
          source={require('../assets/PlayThru_Logo.png')}
          style={{ width: 80, height: 80, marginBottom: 16, opacity: 0.35 }}
          resizeMode="contain"
        />
        <Text style={s.emptyText}>No friends added yet.</Text>
        <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('SearchUsers')} activeOpacity={0.8}>
          <Text style={s.emptyBtnText}>FIND GOLFERS</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
      <Text style={s.sectionLabel}>{friends.length} FOLLOWING</Text>
      {friends.map((f) => (
        <TouchableOpacity
          key={f.id}
          style={s.friendCard}
          onPress={() => navigation.navigate('PublicProfile', { userId: f.id })}
          activeOpacity={0.8}
        >
          <InitialsAvatar name={f.full_name} size={40} />
          <View style={s.friendInfo}>
            <Text style={s.friendName}>{f.full_name || '—'}</Text>
            <Text style={s.friendHandle}>@{f.username}{f.home_course ? ` · ${f.home_course}` : ''}</Text>
          </View>
          <View style={s.friendRight}>
            <Text style={[s.friendPop, { color: popColor(f.pop_score) }]}>
              {f.pop_score != null ? f.pop_score.toFixed(1) : '—'}
            </Text>
            <TouchableOpacity style={s.unfollowBtn} onPress={(e) => { e.stopPropagation?.(); unfollow(f.id); }} activeOpacity={0.7}>
              <Text style={s.unfollowText}>UNFOLLOW</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={s.addFriendBtn} onPress={() => navigation.navigate('SearchUsers')}>
        <Text style={s.addFriendText}>+ FIND PLAYERS</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Main ProfileScreen ───────────────────────────────────────────────────────

export default function ProfileScreen({ navigation }) {
  const { profile, user, refreshProfile } = useAuth();

  const [tab, setTab]           = useState('stats');

  // On focus: pull fresh profile from DB
  useFocusEffect(useCallback(() => {
    refreshProfile();
  }, []));
  const [loading, setLoading]   = useState(true);
  const [rounds, setRounds]     = useState([]);
  const [roundCount, setRoundCount] = useState(0);
  const [stats, setStats]       = useState({});
  const [clockedRating, setClockedRating] = useState({ clockedScore: null, game: null, teammate: null, isProvisional: true, roundsUsed: 0, roundsNeeded: 5 });

  useEffect(() => {
    if (!user) navigation.replace('Welcome');
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    if (profile?.account_type === 'caddy') setTab('caddy');

    const loadData = async () => {
      setLoading(true);

      const { data: roundsData } = await supabase
        .from('rounds')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      setRounds(roundsData ?? []);
      setRoundCount(roundsData?.length ?? 0);

      if (roundsData && roundsData.length > 0) {
        const avgTime      = roundsData.reduce((sum, r) => sum + (r.duration_minutes || 0), 0) / roundsData.length;
        const bestScore    = Math.max(...roundsData.map(r => r.pop_score || 0));
        const fastestRound = Math.min(...roundsData.map(r => r.duration_minutes || 999));
        const avgGroupSize = roundsData.reduce((sum, r) => sum + (r.players || 0), 0) / roundsData.length;
        const cartRounds   = roundsData.filter(r => r.transport === 'Cart').length;
        const walkRounds   = roundsData.filter(r => r.transport === 'Walk' || r.transport === 'Walking').length;
        const uniqueCourses = [...new Set(roundsData.map(r => r.course_name))].length;
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const memberSince  = profile?.created_at
          ? (() => { const d = new Date(profile.created_at); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; })()
          : null;
        const newStats = { avgTime, bestScore, fastestRound, avgGroupSize, cartRounds, walkRounds, uniqueCourses, memberSince };
        setStats(newStats);
      }

      // Compute Clocked Score from clocked rounds (own + confirmed participations)
      const myOwnClocked = (roundsData ?? []).filter(r => r.round_format === 'clocked' && r.hole_scores);
      const playerName = profile?.full_name || profile?.username || 'You';

      // Fetch rounds where I'm a confirmed participant (but not the logger)
      let participatedRounds = [];
      try {
        const { data: myParts } = await supabase
          .from('round_participants')
          .select('round_id, player_key')
          .eq('user_id', profile.id)
          .eq('status', 'confirmed');
        if (myParts?.length) {
          const partRoundIds = myParts
            .map(p => p.round_id)
            .filter(rid => !myOwnClocked.some(r => r.id === rid));
          if (partRoundIds.length) {
            const { data: partRounds } = await supabase
              .from('rounds')
              .select('id, hole_scores, round_format')
              .in('id', partRoundIds)
              .eq('round_format', 'clocked');
            participatedRounds = (partRounds ?? []).map(r => {
              const part = myParts.find(p => p.round_id === r.id);
              return { ...r, _playerKey: part?.player_key };
            });
          }
        }
      } catch { /* silent */ }

      const allClockedRounds = [...myOwnClocked, ...participatedRounds];
      const roundStats = allClockedRounds
        .map(r => {
          const key = r._playerKey ?? playerName;
          return extractPlayerRoundStats(r.hole_scores, key);
        })
        .filter(Boolean);
      const rating = computeFullRating({
        roundStats,
        startedRounds: allClockedRounds.length,
        handicapIndex: profile?.handicap_index,
      });
      setClockedRating(rating);

      setLoading(false);
    };

    loadData();
  }, [profile?.id]));

  const isCaddy  = profile?.account_type === 'caddy';
  const last5    = rounds.slice(0, 5);
  const isCertified = PRO_ENABLED && last5.length === 5 && last5.every(r => (r.pop_score ?? 0) >= 4.0);
  const tabs     = isCaddy ? ['caddy', 'rounds', 'friends'] : ['stats', 'rounds', 'friends', 'activity'];
  const tabLabel = (t) => t === 'caddy' ? 'CADDY' : t.toUpperCase();

  const handleSettings = () => navigation.navigate('Settings');

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.wordmark}>CLOCKED</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('SearchUsers')} activeOpacity={0.7} accessibilityLabel="Search golfers" accessibilityRole="button">
              <Ionicons name="search" size={18} color="#C9A84C" />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={handleSettings} activeOpacity={0.7} accessibilityLabel="Settings" accessibilityRole="button">
              <Ionicons name="settings-outline" size={18} color="#C9A84C" />
            </TouchableOpacity>
          </View>
        </View>
        {loading
          ? <View style={{ paddingHorizontal: 22, paddingBottom: 16 }}>
              <SkeletonLoader width={140} height={14} style={{ marginTop: 6, marginBottom: 6 }} />
              <SkeletonLoader width={180} height={20} style={{ marginBottom: 4 }} />
            </View>
          : <View style={s.headerIdentity}>
              <InitialsAvatar name={profile?.full_name} size={48} avatarUrl={profile?.avatar_url} username={profile?.username} />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{profile?.full_name ?? ''}</Text>
                <Text style={s.username}>{'@' + (profile?.username ?? '')}</Text>
                <Text style={s.handle}>
                  {isCaddy && profile?.caddy_course
                    ? profile.caddy_course
                    : profile?.created_at
                      ? 'Member since ' + new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                      : ''}
                </Text>
              </View>
            </View>
        }
      </View>

      {/* Account under review banner */}
      {(rounds.filter(r => r.flagged).length >= 3) && (
        <View style={s.reviewBanner}>
          <Ionicons name="warning-outline" size={14} color="#C07A6A" style={{ marginRight: 6 }} />
          <Text style={s.reviewBannerText}>Account under review — contact hello@clocked.golf</Text>
        </View>
      )}

      {isCertified && (
        <View style={s.certifiedBanner}>
          <Ionicons name="checkmark-circle" size={13} color="#090F0A" style={{ marginRight: 5 }} />
          <Text style={s.certifiedBannerText}>CLOCKED CERTIFIED ✓</Text>
        </View>
      )}

      {/* Clocked Score — headline card */}
      {!isCaddy && (
        <ClockedScoreCard
          clockedScore={clockedRating.clockedScore}
          game={clockedRating.game}
          teammate={clockedRating.teammate}
          isProvisional={clockedRating.isProvisional}
          roundsUsed={clockedRating.roundsUsed}
          roundsNeeded={clockedRating.roundsNeeded}
        />
      )}

      {/* Recent rounds (compact, above tabs) */}
      {!loading && rounds.length > 0 && (
        <RecentRoundsList rounds={rounds.slice(0, 10)} navigation={navigation} />
      )}

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={tabLabel(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>{tabLabel(t)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'stats'   && (loading ? <StatTabSkeleton /> : <StatTab stats={stats} roundCount={roundCount} rounds={rounds} navigation={navigation} />)}
      {tab === 'caddy'   && <CaddyDashboard caddyCourse={profile?.caddy_course || ''} navigation={navigation} />}
      {tab === 'rounds'  && <RoundsTab navigation={navigation} rounds={rounds} loading={loading} />}
      {tab === 'friends'  && <FriendsTab navigation={navigation} />}
      {tab === 'activity' && <ActivityTab userId={user?.id} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  headerTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 6 },
  headerIdentity:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingBottom: 16 },
  iconBtn:          { width: 44, height: 44, borderRadius: 22, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center' },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 2 },
  username:         { fontSize: 11, color: '#C9A84C', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  name:             { fontSize: 22, fontWeight: '600', color: '#F5EDD8' },
  handle:           { fontSize: 11, color: '#B8A882', marginTop: 3 },
  avatarLarge:       { width: 52, height: 52, borderRadius: 26, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarLargeText:   { fontSize: 20, fontWeight: '600', color: '#C9A84C' },
  avatarCameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' },
  tabBar:           { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabBtn:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22' },
  tabBtnActive:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  tabBtnText:       { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  tabBtnTextActive: { color: '#C9A84C' },
  activityRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', gap: 12 },
  activityIconWrap:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activityContent:   { flex: 1 },
  activityLabel:     { fontSize: 13, color: '#F5EDD8', fontWeight: '500', lineHeight: 18 },
  activityPop:       { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  activityTime:      { fontSize: 10, color: 'rgba(184,168,130,0.5)', marginTop: 3 },
  activityEmpty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  activityEmptyText: { fontSize: 14, color: '#7A6E58' },
  challengeRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(125,200,122,0.07)', gap: 8 },
  challengeOpponent:  { fontSize: 13, fontWeight: '700', color: '#F5EDD8' },
  challengeBadge:     { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  challengeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  challengeCourse:    { fontSize: 11, color: '#B8A882', marginBottom: 1 },
  challengeScores:    { fontSize: 11, fontWeight: '600', color: '#7DC87A' },
  challengeExpiry:    { fontSize: 10, color: 'rgba(184,168,130,0.45)', marginTop: 1 },
  gaugeCard:           { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  gaugeRow:            { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#7DC87A22', gap: 16 },
  gaugeCompact:        { alignItems: 'center', justifyContent: 'center' },
  gaugeInfo:           { flex: 1, justifyContent: 'center' },
  scoreRow:            { flexDirection: 'row', gap: 32, marginTop: 12 },
  scoreStat:           { alignItems: 'center' },
  scoreStatLabel:      { fontSize: 9, fontWeight: '700', color: '#C9A84C66', letterSpacing: 2, marginBottom: 2 },
  scoreStatValue:      { fontSize: 16, fontWeight: '400', color: '#B8A882' },
  scoreStatValueLg:    { fontSize: 32, fontWeight: '300', color: '#F5EDD8' },
  tierLabel:           { fontSize: 11, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
  tierLabelMuted:      { fontSize: 9, fontWeight: '700', color: '#C9A84C44', letterSpacing: 1.5, lineHeight: 16 },
  popInfoLink:         { fontSize: 11, color: '#C9A84C', textDecorationLine: 'underline' },
  trendRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  trendLabel:          { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
statSection:         { paddingHorizontal: 16, marginBottom: 16 },
  sectionLabel:        { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },
  statGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox:             { width: '47%', backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' },
  statBoxLabel:        { fontSize: 10, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  statBoxValue:        { fontSize: 28, fontWeight: '300', color: '#F5EDD8' },
  statBoxSub:          { fontSize: 9, color: '#7A6E58', marginTop: 3, textAlign: 'center' },
  chartCard:           { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', padding: 16 },
  chartAxisLabel:      { fontSize: 9, color: '#C9A84C88', fontWeight: '600' },
  chartTooltip:        { position: 'absolute', backgroundColor: '#1A2E1C', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#7DC87A33', minWidth: 110 },
  chartTooltipScore:   { fontSize: 18, fontWeight: '300', color: '#F5EDD8', marginBottom: 2 },
  chartTooltipCourse:  { fontSize: 11, color: '#B8A882', marginBottom: 2 },
  chartTooltipDate:    { fontSize: 10, color: '#7A6E58' },
  infoCard:         { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', overflow: 'hidden' },
  statRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  statRowBorder:    { borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  statRowLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  statRowValue:     { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  barRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  barLabel:         { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1, width: 32 },
  barTrack:         { flex: 1, height: 6, backgroundColor: '#7DC87A22', borderRadius: 3, overflow: 'hidden' },
  barFill:          { height: 6, borderRadius: 3 },
  barValue:         { fontSize: 12, color: '#B8A882', width: 36, textAlign: 'right' },
  roundCard:        { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10 },
  roundTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  roundInfo:        { flex: 1 },
  roundCourse:      { fontSize: 16, fontWeight: '600', color: '#F5EDD8', marginBottom: 4 },
  roundMeta:        { fontSize: 11, color: '#B8A882' },
  roundScoreCol:    { alignItems: 'flex-end' },
  roundPop:         { fontSize: 28, fontWeight: '300' },
  roundTime:        { fontSize: 11, color: '#B8A882' },
  delayLabel:       { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  friendCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10 },
  friendAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  friendInitial:    { fontSize: 16, fontWeight: '600', color: '#C9A84C' },
  friendInfo:       { flex: 1 },
  friendName:       { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  friendHandle:     { fontSize: 11, color: '#B8A882', marginTop: 2 },
  friendRight:      { alignItems: 'flex-end', gap: 6 },
  friendPop:        { fontSize: 24, fontWeight: '300' },
  unfollowBtn:      { borderWidth: 1, borderColor: '#C9A84C33', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  unfollowText:     { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 1.5 },
  addFriendBtn:     { borderWidth: 1, borderColor: '#C9A84C44', borderRadius: 14, borderStyle: 'dashed', paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  addFriendText:    { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  emptyState:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 60 },
  emptyText:        { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', marginBottom: 20, lineHeight: 28 },
  emptyBtn:         { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24 },
  emptyBtnText:     { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  // Handicap card
  hcpCard:          { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', padding: 20 },
  hcpTopRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hcpLabel:         { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  hcpValue:         { fontSize: 44, fontWeight: '200', color: '#F5EDD8' },
  hcpTrendBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  hcpTrendText:     { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  hcpSub:           { fontSize: 11, color: '#7A6E58', marginTop: 6 },
  caddyBadge:       { backgroundColor: '#C9A84C', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  caddyBadgeText:   { fontSize: 8, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  caddyLoggedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#7DC87A', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  caddyLoggedText:  { fontSize: 7, fontWeight: '700', color: '#090F0A', letterSpacing: 1 },
  underReviewBadge: { backgroundColor: 'rgba(192,122,106,0.15)', borderWidth: 1, borderColor: 'rgba(192,122,106,0.4)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  underReviewText:  { fontSize: 9, fontWeight: '700', color: '#C07A6A', letterSpacing: 0.5 },
  reviewBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(192,122,106,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(192,122,106,0.25)', paddingHorizontal: 16, paddingVertical: 10 },
  reviewBannerText: { fontSize: 11, color: '#C07A6A', flex: 1, fontWeight: '500' },
  caddyCourseCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C33', padding: 16, marginBottom: 12 },
  caddyCourseLabel: { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 4 },
  caddyCourseName:  { fontSize: 16, fontWeight: '600', color: '#F5EDD8' },
  referralCard:         { marginHorizontal: 16, marginBottom: 24, backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', padding: 20, gap: 10 },
  referralCardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  referralCardTitle:    { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  referralCardSub:      { fontSize: 12, color: '#B8A882', lineHeight: 18 },
  referralCodeRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', paddingHorizontal: 16, paddingVertical: 12 },
  referralCodeText:     { fontSize: 22, fontWeight: '600', color: '#C9A84C', letterSpacing: 4 },
  referralShareBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#C9A84C', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  referralShareBtnText: { fontSize: 10, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  referralCountText:    { fontSize: 11, color: '#7DC87A', fontWeight: '500' },
  upgradeNote:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  upgradeNoteText:      { fontSize: 11, color: '#C9A84C66', fontStyle: 'italic' },
  seasonBetsCard:       { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 16, marginTop: 10, marginBottom: 10 },
  seasonBetsRow:        { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  seasonBetStat:        { alignItems: 'center' },
  seasonBetValue:       { fontSize: 28, fontWeight: '300', color: '#F5EDD8' },
  seasonBetLabel:       { fontSize: 8, fontWeight: '700', color: '#7A6E58', letterSpacing: 1.5, marginTop: 3 },
  certifiedBanner:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#C9A84C', paddingVertical: 8 },
  certifiedBannerText:  { fontSize: 10, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});
