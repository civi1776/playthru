import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, RefreshControl, TouchableOpacity, StyleSheet, Alert, Share, ActivityIndicator } from 'react-native';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getReferralStats } from '../lib/referrals';
import { PRO_ENABLED } from '../lib/featureFlags';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';
import VerificationBadge from '../components/VerificationBadge';
import RecentRoundsList from '../components/RecentRoundsList';
import { computeFullRating, extractPlayerRoundStats, fetchClockedRatingForUser, computeNationalRank, DEFAULT_SCORING_BAND } from '../lib/clockedRating';
import { totalPointsFromHoleScores } from '../lib/clockedSport';
import { scoreTier, COLOR, SCORE_TIERS, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';

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

// Same thresholds as LeaderboardScreen's clockedColor() — 0–100 scale.
function clockedColor(score) {
  if (score == null) return COLOR.dim;
  if (score >= 70) return COLOR.green;
  if (score >= 40) return COLOR.gold;
  return COLOR.muted;
}

function ptsColor(pts) {
  if (pts == null) return COLOR.dim;
  if (pts >= 8) return COLOR.green;
  if (pts >= 0) return COLOR.gold;
  return '#C07A6A';
}

const DELAY_DOT = {
  none:     { color: COLOR.green, label: 'No delay'       },
  few:      { color: '#D4B86A', label: 'Some delay'     },
  many:     { color: '#E8924C', label: 'Course delay'   },
  constant: { color: '#C07A6A', label: 'Constant delay' },
};

// ─── Stat Tab ─────────────────────────────────────────────────────────────────
// NOTE: StatTab/StatTabSkeleton/StatBox/calcPaceStreak (a whole earlier
// version of this tab, built around the retired 0–5 pop_score scale) were
// removed here — confirmed dead code, never rendered anywhere in this file.
// The real, currently-rendered hero/stats live further down this component,
// driven by `clockedRating` (the real 0–100 Clocked Score).

// ─── Profile Activity Tab ─────────────────────────────────────────────────────

function ActivityRow({ item }) {
  const typeMap = {
    round_logged:       { icon: 'golf',        color: COLOR.green, label: c => `Logged a round at ${c?.course_name ?? '—'}` },
    live_round_started: { icon: 'golf',        color: COLOR.green, label: c => `Playing live at ${c?.course_name ?? 'a course'} right now` },
    milestone:          { icon: 'trophy',      color: COLOR.gold, label: c => c?.title ?? 'Reached a milestone' },
    leaderboard:        { icon: 'trending-up', color: COLOR.gold, label: c => c?.description ?? 'Moved on the leaderboard' },
    course_review:      { icon: 'location',    color: COLOR.green, label: c => `Reviewed ${c?.course_name ?? 'a course'}` },
    user_post:          { icon: 'chatbubble',  color: COLOR.muted, label: c => c?.text?.slice(0, 80) ?? 'Shared an update' },
    course_leader:      { icon: 'trophy',      color: COLOR.gold, label: c => c?.description ?? 'Set a course record' },
  };
  const info    = typeMap[item.type] ?? { icon: 'ellipsis-horizontal', color: COLOR.dim, label: () => 'Activity' };
  const content = item.content ?? {};
  const pts     = content.team_score;
  return (
    <View style={s.activityRow}>
      <View style={[s.activityIconWrap, { backgroundColor: info.color + '22' }]}>
        <Ionicons name={info.icon} size={16} color={info.color} />
      </View>
      <View style={s.activityContent}>
        <Text style={s.activityLabel}>{info.label(content)}</Text>
        {item.type === 'round_logged' && pts != null && (
          <Text style={[s.activityPop, { color: ptsColor(pts) }]}>{pts > 0 ? `+${pts}` : pts} PTS</Text>
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
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <ActivityIndicator color={COLOR.gold} style={{ marginTop: 40 }} />;
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.gold} />}
      renderItem={({ item }) => <ActivityRow item={item} />}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}

// ─── Score Trend Chart ────────────────────────────────────────────────────────

// Plots average points-per-hole for each of the last 20 clocked rounds —
// the same "SCORING" component the real Clocked Score is built from
// (DEFAULT_SCORING_BAND), rather than the retired 0–5 pop_score scale.
function ScoreTrendChart({ rounds }) {
  const [w, setW]               = useState(0);
  const [tooltipIdx, setTipIdx] = useState(null);

  const data = [...(rounds ?? [])]
    .filter(r => r.round_format === 'clocked' && r.hole_scores?.length)
    .slice(0, 20)
    .reverse()
    .map(r => ({ ...r, avgPts: totalPointsFromHoleScores(r.hole_scores) / r.hole_scores.length }));

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

  const { low, high } = DEFAULT_SCORING_BAND;
  const PAR = 1; // DEFAULT_SCORING_SCALE.par — one point per hole at par
  const H = 110;
  const PX = 24;
  const PY = 12;
  const n  = data.length;
  const toX = i => PX + (i / (n - 1)) * (w - PX * 2);
  const toY = v => PY + (1 - (v - low) / (high - low)) * (H - PY * 2);
  const threshY = toY(PAR);
  const pts = data.map((r, i) => `${toX(i).toFixed(1)},${toY(r.avgPts).toFixed(1)}`).join(' ');

  const half     = Math.max(1, Math.floor(n / 2));
  const avgFirst = data.slice(0, half).reduce((s, r) => s + r.avgPts, 0) / half;
  const avgLast  = data.slice(n - half).reduce((s, r) => s + r.avgPts, 0) / half;
  const lineColor = avgLast > avgFirst + 0.1 ? COLOR.green : avgLast < avgFirst - 0.1 ? '#C07A6A' : COLOR.gold;

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
              cx={toX(i)} cy={toY(r.avgPts)}
              r={tooltipIdx === i ? 6 : 4}
              fill={tooltipIdx === i ? lineColor : COLOR.surface}
              stroke={lineColor} strokeWidth={2}
              onPress={() => setTipIdx(tooltipIdx === i ? null : i)}
            />
          ))}
        </Svg>
        <Text style={[s.chartAxisLabel, { position: 'absolute', left: 0, top: threshY - 8 }]}>PAR</Text>
        {tip != null && (
          <View style={[s.chartTooltip, {
            left: Math.min(Math.max(toX(tooltipIdx) - 55, 0), w - 120),
            top:  Math.max(toY(tip.avgPts) - 60, 0),
          }]}>
            <Text style={s.chartTooltipScore}>{tip.avgPts.toFixed(1)} pts/hole</Text>
            <Text style={s.chartTooltipCourse} numberOfLines={1}>{tip.course_name ?? '—'}</Text>
            <Text style={s.chartTooltipDate}>{formatShortDate(tip.created_at)}</Text>
          </View>
        )}
      </View>
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
              <SkeletonLoader width={36} height={36} style={{ borderRadius: RADIUS.sm }} />
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
        <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('ClockedSetup')} activeOpacity={0.8}>
          <Text style={s.emptyBtnText}>PLAY YOUR FIRST ROUND</Text>
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
        const pts = r.hole_scores?.length ? totalPointsFromHoleScores(r.hole_scores) : null;
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
                  <Text style={[s.roundPop, { color: ptsColor(pts) }]}>
                    {pts != null ? (pts > 0 ? `+${pts}` : pts) : '—'}
                  </Text>
                )}
                <Text style={s.roundTime}>{formatDuration(r.duration_minutes)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 10, gap: 8 }}>
              <VerificationBadge level={r.verification_level} />
              {delayInfo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: RADIUS.xs, backgroundColor: delayInfo.color }} />
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
              <Text style={[s.seasonBetValue, { color: seasonBets.net >= 0 ? COLOR.green : '#C07A6A' }]}>
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

// ─── Friends Tab ──────────────────────────────────────────────────────────────

function FriendsTab({ navigation }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const fetchFriends = async () => {
    setLoading(prev => prev && friends.length === 0);
    setError(false);
    try {
      const uid = user?.id;
      if (!uid) { setLoading(false); return; }
      const { data, error: err } = await supabase
        .from('follows')
        .select('following_id, profiles!follows_following_id_fkey(id, full_name, username, home_course, handicap_index, avatar_url)')
        .eq('follower_id', uid);
      if (err) throw err;
      const followedProfiles = (data || []).map(r => r.profiles).filter(Boolean);
      setFriends(followedProfiles);

      // Batch-compute each followed player's real Clocked Score, matching how
      // the Leaderboard does it — one query for their rounds, one for their
      // confirmed participations, instead of the retired pop_score column.
      const friendIds = followedProfiles.map(p => p.id);
      if (friendIds.length) {
        const { data: ownRounds } = await supabase
          .from('rounds').select('id, user_id, hole_scores')
          .eq('round_format', 'clocked').not('hole_scores', 'is', null)
          .in('user_id', friendIds);
        const byUser = {};
        (ownRounds ?? []).forEach(r => { (byUser[r.user_id] ??= []).push(r); });
        const roundIds = (ownRounds ?? []).map(r => r.id);
        let parts = [];
        if (roundIds.length) {
          const { data: partRows } = await supabase
            .from('round_participants').select('round_id, user_id, player_key')
            .eq('status', 'confirmed').in('round_id', roundIds).in('user_id', friendIds);
          parts = partRows ?? [];
        }
        const roundMap = {};
        (ownRounds ?? []).forEach(r => { roundMap[r.id] = r; });
        parts.forEach(p => {
          if (!byUser[p.user_id]) byUser[p.user_id] = [];
          const already = byUser[p.user_id].some(r => r.id === p.round_id);
          if (!already && roundMap[p.round_id]) byUser[p.user_id].push({ ...roundMap[p.round_id], _playerKey: p.player_key });
        });
        const withScores = followedProfiles.map(p => {
          const playerName = p.full_name || p.username || 'Player';
          const roundStats = (byUser[p.id] ?? [])
            .map(r => extractPlayerRoundStats(r.hole_scores, r._playerKey ?? playerName))
            .filter(Boolean);
          const rating = computeFullRating({ roundStats, handicapIndex: p.handicap_index });
          return { ...p, clockedScore: rating.clockedScore };
        });
        setFriends(withScores);
      }
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
          <InitialsAvatar name={f.full_name} size={40} avatarUrl={f.avatar_url} username={f.username} />
          <View style={s.friendInfo}>
            <Text style={s.friendName}>{f.full_name || '—'}</Text>
            <Text style={s.friendHandle}>@{f.username}{f.home_course ? ` · ${f.home_course}` : ''}</Text>
          </View>
          <View style={s.friendRight}>
            <Text style={[s.friendPop, { color: clockedColor(f.clockedScore) }]}>
              {f.clockedScore ?? '—'}
            </Text>
            <TouchableOpacity
              style={s.vsFriendBtn}
              onPress={(e) => { e.stopPropagation?.(); navigation.navigate('Rivalry', { userId: f.id, username: f.username }); }}
              activeOpacity={0.7}
            >
              <Text style={s.vsFriendText}>VS</Text>
            </TouchableOpacity>
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
  const [clockedRating, setClockedRating] = useState({ clockedScore: null, scoring: null, clock: null, isProvisional: true, roundsUsed: 0, roundsNeeded: 5 });
  const [followingCount, setFollowingCount] = useState(0);
  const [nationalRank, setNationalRank] = useState(null);

  useEffect(() => {
    if (!user) navigation.replace('Welcome');
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);

      const { data: roundsData } = await supabase
        .from('rounds')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      setRounds(roundsData ?? []);
      setRoundCount(roundsData?.length ?? 0);

      // Following count
      const { count: fCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profile.id);
      setFollowingCount(fCount ?? 0);

      if (roundsData && roundsData.length > 0) {
        const avgTime      = roundsData.reduce((sum, r) => sum + (r.duration_minutes || 0), 0) / roundsData.length;
        const clockedPointTotals = roundsData
          .filter(r => r.round_format === 'clocked' && r.hole_scores?.length)
          .map(r => totalPointsFromHoleScores(r.hole_scores));
        const bestScore    = clockedPointTotals.length ? Math.max(...clockedPointTotals) : 0;
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

      // Real Clocked Score (0–100) — canonical computation shared with
      // HomeScreen/LeaderboardScreen so every screen agrees on this number.
      const rating = await fetchClockedRatingForUser(supabase, profile.id, profile);
      setClockedRating(rating);

      // National rank — profiles.national_rank is a retired column (only
      // ever written by the orphaned LiveRoundScreen), so compute it fresh.
      computeNationalRank(supabase, profile.id).then(setNationalRank).catch(() => {});

      setLoading(false);
    };

    loadData();
  }, [profile?.id]));

  const last5Clocked = rounds.filter(r => r.round_format === 'clocked' && r.hole_scores?.length).slice(0, 5);
  const isCertified = PRO_ENABLED && last5Clocked.length === 5
    && last5Clocked.every(r => (totalPointsFromHoleScores(r.hole_scores) ?? -Infinity) >= 8);
  const tabs     = ['stats', 'rounds', 'friends', 'activity'];
  const tabLabel = (t) => t.toUpperCase();

  const handleSettings = () => navigation.navigate('Settings');

  const bestRound = rounds
    .filter(r => r.round_format === 'clocked' && r.hole_scores?.length)
    .map(r => ({ ...r, team_score: totalPointsFromHoleScores(r.hole_scores) }))
    .sort((a, b) => (b.team_score ?? 0) - (a.team_score ?? 0))[0];

  return (
    <SafeAreaView style={s.container}>
      {/* Header — fixed at top */}
      <View style={s.header}>
        <ScreenHeader
          title="CLOCKED" brand
          right={[
            { icon: 'search-outline', onPress: () => navigation.navigate('SearchUsers'), label: 'Search golfers' },
            { icon: 'settings-outline', onPress: handleSettings, label: 'Settings' },
          ]}
        />
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
                  {profile?.created_at
                    ? 'Member since ' + new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : ''}
                </Text>
              </View>
            </View>
        }
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Account under review banner */}
        {(rounds.filter(r => r.flagged).length >= 3) && (
          <View style={s.reviewBanner}>
            <Ionicons name="warning-outline" size={14} color="#C07A6A" style={{ marginRight: 6 }} />
            <Text style={s.reviewBannerText}>Account under review. Contact hello@clocked.golf</Text>
          </View>
        )}

        {isCertified && (
          <View style={s.certifiedBanner}>
            <Ionicons name="checkmark-circle" size={13} color={COLOR.bg} style={{ marginRight: 5 }} />
            <Text style={s.certifiedBannerText}>CLOCKED CERTIFIED</Text>
          </View>
        )}

        {/* Hero score section */}
        {!loading && (() => {
          // A fresh account has no earned score \u2014 computeFullRating returns a
          // cold-start baseline for zero rounds, but we never show it as if it
          // were real. Zero rounds: "\u2014", no pill, no tier, just the first-round
          // prompt. Provisional (1..threshold-1 rounds): real number in its tier
          // color with the PROVISIONAL pill as the single label.
          const hasRounds = (clockedRating.roundsUsed ?? 0) > 0;
          const hasScore = hasRounds && clockedRating.clockedScore != null;
          const tier = scoreTier(clockedRating.clockedScore, clockedRating.isProvisional);
          if (!hasRounds) {
            // One empty state, not three: no chart, no dash, no bar.
            return (
              <View style={s.firstRound}>
                <Text style={s.heroLabel}>CLOCKED SCORE</Text>
                <Text style={s.firstRoundTitle}>Your score starts with your first round.</Text>
                <Text style={s.firstRoundSub}>One number, 0 to 100. Part how you score, part how you handle the clock.</Text>
                <Button label="START A ROUND" icon="timer-outline" onPress={() => navigation.navigate('ClockedSetup')} style={{ marginTop: 16 }} />
              </View>
            );
          }
          return (
          <View style={s.heroScore}>
            <Text style={s.heroLabel}>CLOCKED SCORE</Text>
            <View style={s.heroRow}>
              <Text style={[s.heroNum, { color: hasScore ? tier.color : COLOR.dim }]}>
                {hasScore ? clockedRating.clockedScore : '\u2014'}
              </Text>
              {hasScore && (
                <Text style={s.heroMax}>/100</Text>
              )}
              {hasScore && clockedRating.isProvisional && (
                <View style={s.heroProv}>
                  <Text style={s.heroProvText}>PROVISIONAL</Text>
                </View>
              )}
            </View>
            {hasScore && !clockedRating.isProvisional && (
              <Text style={[s.heroTierName, { color: tier.color }]}>{tier.name}</Text>
            )}

            {/* Gradient progress bar */}
            <View style={s.heroBarTrack}>
              <LinearGradient
                colors={[COLOR.green, COLOR.gold, COLOR.goldBright]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[s.heroBarFill, { width: `${hasScore ? clockedRating.clockedScore : 0}%` }]}
              />
            </View>

            {/* Sub-components or provisional hint */}
            {!clockedRating.isProvisional ? (
              <View style={s.heroSubRow}>
                <View>
                  <Text style={s.heroSubLabel}>SCORING</Text>
                  <Text style={s.heroSubVal}>
                    {clockedRating.scoring != null ? Math.round(clockedRating.scoring) : '\u2014'}
                  </Text>
                </View>
                <Text style={s.heroSubDot}>{'\u00B7'}</Text>
                <View>
                  <Text style={s.heroSubLabel}>CLOCK</Text>
                  <Text style={s.heroSubVal}>
                    {clockedRating.clock != null ? Math.round(clockedRating.clock) : '\u2014'}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={s.heroProvHint}>
                {clockedRating.roundsUsed === 0
                  ? 'Play your first round to start building your score'
                  : `${clockedRating.roundsNeeded} more round${clockedRating.roundsNeeded !== 1 ? 's' : ''} to establish your score`}
              </Text>
            )}
          </View>
          );
        })()}

        {/* Score trend sparkline */}
        {!loading && (() => {
          const clockedRounds = rounds.filter(r => r.round_format === 'clocked' && r.hole_scores?.length);
          if (clockedRounds.length < 3) return null;
          const sparkData = clockedRounds.slice(0, 10).reverse().map(r => {
            const playerName = profile?.full_name || profile?.username || 'Player';
            const rs = extractPlayerRoundStats(r.hole_scores, playerName);
            if (!rs) return null;
            const rating = computeFullRating({ roundStats: [rs], handicapIndex: profile?.handicap_index });
            return rating.clockedScore;
          }).filter(v => v != null);
          if (sparkData.length < 3) return null;
          const W = 280, H = 60, PX = 12, PY = 8;
          const minV = Math.min(...sparkData) - 2, maxV = Math.max(...sparkData) + 2;
          const range = maxV - minV || 1;
          const toX = (i) => PX + (i / (sparkData.length - 1)) * (W - PX * 2);
          const toY = (v) => PY + (1 - (v - minV) / range) * (H - PY * 2);
          const pts = sparkData.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
          const last = sparkData[sparkData.length - 1];
          const first = sparkData[0];
          const lineColor = last > first + 1 ? COLOR.green : last < first - 1 ? COLOR.red : COLOR.gold;
          return (
            <View style={s.sparkCard}>
              <Text style={s.sparkLabel}>SCORE TREND</Text>
              <Svg width={W} height={H}>
                <Polyline points={pts} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <Circle cx={toX(sparkData.length - 1)} cy={toY(last)} r={4} fill={lineColor} />
              </Svg>
            </View>
          );
        })()}

        {/* Stat strip */}
        {!loading && (
          <View style={s.statChipsRow}>
            <View style={s.statChip}>
              <Text style={s.statChipLabel}>ROUNDS</Text>
              <Text style={s.statChipNum}>{rounds.filter(r => r.round_format === 'clocked').length}</Text>
            </View>
            <View style={s.statChip}>
              <Text style={s.statChipLabel}>COURSES</Text>
              <Text style={s.statChipNum}>{stats.uniqueCourses ?? 0}</Text>
            </View>
            <View style={[s.statChip, nationalRank && s.statChipGold]}>
              <Text style={s.statChipLabel}>RANK</Text>
              <Text style={s.statChipNum}>{nationalRank ? `#${nationalRank}` : '\u2014'}</Text>
            </View>
            <View style={s.statChip}>
              <Text style={s.statChipLabel}>FOLLOWING</Text>
              <Text style={s.statChipNum}>{followingCount}</Text>
            </View>
          </View>
        )}

        {/* Tier progress */}
        {!loading && clockedRating.clockedScore != null && !clockedRating.isProvisional && (() => {
          const score = clockedRating.clockedScore;
          const nextTier = [...SCORE_TIERS].reverse().find(t => t.min > score);
          if (!nextTier) return null;
          const gap = nextTier.min - score;
          return (
            <View style={s.tierProgressRow}>
              <Text style={s.tierProgressText}>
                {gap} point{gap !== 1 ? 's' : ''} to <Text style={{ color: nextTier.color, fontWeight: '700' }}>{nextTier.name}</Text>
              </Text>
            </View>
          );
        })()}

        {/* Tournament promo card */}
        {!loading && (
          <TouchableOpacity
            style={s.promoCard}
            onPress={() => navigation.navigate('Tournament')}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.promoTitle}>The first Clocked event is coming.</Text>
              <Text style={s.promoSub}>South Florida. Request an invitation to compete.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLOR.gold} />
          </TouchableOpacity>
        )}

        {/* Best round callout */}
        {!loading && bestRound && (
          <View style={s.bestRound}>
            <View>
              <Text style={s.bestRoundLabel}>BEST ROUND</Text>
              <Text style={s.bestRoundCourse}>
                {bestRound.course_name ?? 'Quick Play'}
                <Text style={s.bestRoundMeta}>{' \u00B7 '}{bestRound.holes}h</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.bestRoundScore}>
                {bestRound.team_score > 0 ? '+' : ''}{bestRound.team_score}
              </Text>
              <Text style={s.bestRoundScoreLabel}>team pts</Text>
            </View>
          </View>
        )}


        {/* Recent clocked rounds */}
        {!loading && (() => {
          const clockedRounds = rounds.filter(r => r.round_format === 'clocked');
          // The first-round card above already covers the empty case.
          return clockedRounds.length > 0 ? (
            <RecentRoundsList rounds={clockedRounds.slice(0, 8)} navigation={navigation} />
          ) : null;
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLOR.bg },
  header:           { borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  headerIdentity:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingBottom: 16 },

  // Hero score section
  heroScore:        { backgroundColor: COLOR.surface, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  heroLabel:        { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 8 },
  heroRow:          { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  heroNum:          { fontSize: 72, fontWeight: '200', fontVariant: ['tabular-nums'], lineHeight: 76 },
  heroMax:          { fontSize: 22, fontWeight: '300', color: COLOR.dim, marginLeft: 4, marginBottom: 4 },
  heroProv:         { marginLeft: 12, backgroundColor: '#C9A84C18', borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#C9A84C33', paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  heroProvText:     { fontSize: 8, fontWeight: '700', color: COLOR.gold, letterSpacing: 1.5 },
  heroTierName:     { fontSize: 11, fontWeight: '800', letterSpacing: 3, marginTop: -6, marginBottom: 12 },
  heroBarTrack:     { height: 6, backgroundColor: COLOR.surfaceAlt, borderRadius: RADIUS.xs, marginTop: 12, marginBottom: 16, overflow: 'hidden' },
  heroBarFill:      { height: 6, borderRadius: RADIUS.xs },
  heroSubRow:       { flexDirection: 'row', gap: 20 },
  heroSubLabel:     { fontSize: 8, color: COLOR.dim, letterSpacing: 1.5, marginBottom: 2 },
  heroSubVal:       { fontSize: 16, fontWeight: '600', color: COLOR.cream },
  heroSubDot:       { fontSize: 16, color: COLOR.dim, alignSelf: 'flex-end', marginBottom: 2 },
  heroProvHint:     { fontSize: 12, color: COLOR.dim, fontStyle: 'italic' },

  // Stat chips
  statChipsRow:     { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  statChip:         { alignItems: 'center', flex: 1 },
  statChipGold:     { borderWidth: 1, borderColor: '#C9A84C44', borderRadius: RADIUS.sm, paddingVertical: 6 },
  statChipLabel:    { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  statChipNum:      { fontSize: 20, fontWeight: '300', color: COLOR.cream, fontVariant: ['tabular-nums'] },

  // Sparkline
  sparkCard:        { marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, alignItems: 'center' },
  sparkLabel:       { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 6, alignSelf: 'flex-start' },

  // Tier progress
  tierProgressRow:  { paddingHorizontal: 22, marginBottom: 6 },
  tierProgressText: { fontSize: 12, color: COLOR.muted, fontStyle: 'italic' },

  // Promo card
  promoCard:        { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 14, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#C9A84C33', paddingVertical: 14, paddingHorizontal: 16 },
  promoTitle:       { fontSize: 13, fontWeight: '600', color: COLOR.cream, marginBottom: 2 },
  promoSub:         { fontSize: 11, color: COLOR.muted },

  // Best round
  bestRound:        { marginHorizontal: 16, marginBottom: 10, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#C9A84C22', paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bestRoundLabel:   { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  bestRoundCourse:  { fontSize: 15, fontWeight: '600', color: COLOR.cream },
  bestRoundMeta:    { fontSize: 12, color: COLOR.dim },
  bestRoundScore:   { fontSize: 24, fontWeight: '700', color: COLOR.green },
  bestRoundScoreLabel: { fontSize: 9, color: COLOR.dim },

  // Rankings row
  rankingsRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 14, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 14, paddingHorizontal: 16 },
  rankingsRowText:  { fontSize: 14, fontWeight: '500', color: COLOR.cream },

  // Empty rounds
  emptyRounds:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  emptyRoundsText:  { fontSize: 13, color: COLOR.dim },
  username:         { fontSize: 11, color: COLOR.gold, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  name:             { fontSize: 22, fontWeight: '600', color: COLOR.cream },
  handle:           { fontSize: 11, color: COLOR.muted, marginTop: 3 },
  avatarLarge:       { width: 52, height: 52, borderRadius: 26, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: COLOR.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarLargeText:   { fontSize: 20, fontWeight: '600', color: COLOR.gold },
  avatarCameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: COLOR.gold, alignItems: 'center', justifyContent: 'center' },
  tabBar:           { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabBtn:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: '#7DC87A22' },
  tabBtnActive:     { borderColor: COLOR.gold, backgroundColor: '#C9A84C22' },
  tabBtnText:       { fontSize: 9, fontWeight: '700', color: COLOR.muted, letterSpacing: 2 },
  tabBtnTextActive: { color: COLOR.gold },
  activityRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', gap: 12 },
  activityIconWrap:  { width: 32, height: 32, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  activityContent:   { flex: 1 },
  activityLabel:     { fontSize: 13, color: COLOR.cream, fontWeight: '500', lineHeight: 18 },
  activityPop:       { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  activityTime:      { fontSize: 10, color: 'rgba(184,168,130,0.5)', marginTop: 3 },
  activityEmpty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  activityEmptyText: { fontSize: 14, color: COLOR.dim },
  challengeRow:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(125,200,122,0.07)', gap: 8 },
  challengeOpponent:  { fontSize: 13, fontWeight: '700', color: COLOR.cream },
  challengeBadge:     { borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  challengeBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  challengeCourse:    { fontSize: 11, color: COLOR.muted, marginBottom: 1 },
  challengeScores:    { fontSize: 11, fontWeight: '600', color: COLOR.green },
  challengeExpiry:    { fontSize: 10, color: 'rgba(184,168,130,0.45)', marginTop: 1 },
  gaugeCard:           { margin: 16, backgroundColor: COLOR.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  gaugeRow:            { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: COLOR.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#7DC87A22', gap: 16 },
  gaugeCompact:        { alignItems: 'center', justifyContent: 'center' },
  gaugeInfo:           { flex: 1, justifyContent: 'center' },
  scoreRow:            { flexDirection: 'row', gap: 32, marginTop: 12 },
  scoreStat:           { alignItems: 'center' },
  scoreStatLabel:      { fontSize: 9, fontWeight: '700', color: '#C9A84C66', letterSpacing: 2, marginBottom: 2 },
  scoreStatValue:      { fontSize: 16, fontWeight: '400', color: COLOR.muted },
  scoreStatValueLg:    { fontSize: 32, fontWeight: '300', color: COLOR.cream },
  tierLabel:           { fontSize: 11, fontWeight: '700', color: COLOR.green, letterSpacing: 1.5 },
  tierLabelMuted:      { fontSize: 9, fontWeight: '700', color: '#C9A84C44', letterSpacing: 1.5, lineHeight: 16 },
  popInfoLink:         { fontSize: 11, color: COLOR.gold, textDecorationLine: 'underline' },
  trendRow:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  trendLabel:          { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
statSection:         { paddingHorizontal: 16, marginBottom: 16 },
  sectionLabel:        { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 10 },
  statGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox:             { width: '47%', backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' },
  statBoxLabel:        { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  statBoxValue:        { fontSize: 28, fontWeight: '300', color: COLOR.cream },
  statBoxSub:          { fontSize: 9, color: COLOR.dim, marginTop: 3, textAlign: 'center' },
  chartCard:           { marginHorizontal: 16, marginBottom: 16, backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#7DC87A22', padding: 16 },
  chartAxisLabel:      { fontSize: 9, color: '#C9A84C88', fontWeight: '600' },
  chartTooltip:        { position: 'absolute', backgroundColor: COLOR.surfaceAlt, borderRadius: RADIUS.sm, padding: 8, borderWidth: 1, borderColor: '#7DC87A33', minWidth: 110 },
  chartTooltipScore:   { fontSize: 18, fontWeight: '300', color: COLOR.cream, marginBottom: 2 },
  chartTooltipCourse:  { fontSize: 11, color: COLOR.muted, marginBottom: 2 },
  chartTooltipDate:    { fontSize: 10, color: COLOR.dim },
  infoCard:         { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', overflow: 'hidden' },
  statRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  statRowBorder:    { borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  statRowLabel:     { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2 },
  firstRound:       { paddingHorizontal: 20, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: '#7DC87A14' },
  firstRoundTitle:  { fontSize: 20, fontWeight: '600', color: COLOR.cream, marginTop: 10, lineHeight: 26 },
  firstRoundSub:    { fontSize: 13, color: COLOR.muted, marginTop: 6, lineHeight: 19 },
  statRowValue:     { fontSize: 15, fontWeight: '500', color: COLOR.cream },
  barRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  barLabel:         { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 1, width: 32 },
  barTrack:         { flex: 1, height: 6, backgroundColor: '#7DC87A22', borderRadius: RADIUS.xs, overflow: 'hidden' },
  barFill:          { height: 6, borderRadius: RADIUS.xs },
  barValue:         { fontSize: 12, color: COLOR.muted, width: 36, textAlign: 'right' },
  roundCard:        { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10 },
  roundTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  roundInfo:        { flex: 1 },
  roundCourse:      { fontSize: 16, fontWeight: '600', color: COLOR.cream, marginBottom: 4 },
  roundMeta:        { fontSize: 11, color: COLOR.muted },
  roundScoreCol:    { alignItems: 'flex-end' },
  roundPop:         { fontSize: 28, fontWeight: '300' },
  roundTime:        { fontSize: 11, color: COLOR.muted },
  delayLabel:       { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  friendCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10 },
  friendAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  friendInitial:    { fontSize: 16, fontWeight: '600', color: COLOR.gold },
  friendInfo:       { flex: 1 },
  friendName:       { fontSize: 15, fontWeight: '500', color: COLOR.cream },
  friendHandle:     { fontSize: 11, color: COLOR.muted, marginTop: 2 },
  friendRight:      { alignItems: 'flex-end', gap: 6 },
  friendPop:        { fontSize: 24, fontWeight: '300' },
  unfollowBtn:      { borderWidth: 1, borderColor: '#C9A84C33', borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  unfollowText:     { fontSize: 9, fontWeight: '700', color: COLOR.muted, letterSpacing: 1.5 },
  vsFriendBtn:      { borderWidth: 1, borderColor: '#7DC87A33', borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 6 },
  vsFriendText:     { fontSize: 9, fontWeight: '700', color: COLOR.green, letterSpacing: 1.5 },
  addFriendBtn:     { borderWidth: 1, borderColor: '#C9A84C44', borderRadius: RADIUS.md, borderStyle: 'dashed', paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  addFriendText:    { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  emptyState:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingVertical: 60 },
  emptyText:        { fontSize: 20, color: COLOR.dim, textAlign: 'center', marginBottom: 20, lineHeight: 28 },
  emptyBtn:         { backgroundColor: COLOR.gold, borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: 24 },
  emptyBtnText:     { fontSize: 11, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },
  // Handicap card
  underReviewBadge: { backgroundColor: 'rgba(192,122,106,0.15)', borderWidth: 1, borderColor: 'rgba(192,122,106,0.4)', borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 3 },
  underReviewText:  { fontSize: 9, fontWeight: '700', color: '#C07A6A', letterSpacing: 0.5 },
  reviewBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(192,122,106,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(192,122,106,0.25)', paddingHorizontal: 16, paddingVertical: 10 },
  reviewBannerText: { fontSize: 11, color: '#C07A6A', flex: 1, fontWeight: '500' },
  referralCard:         { marginHorizontal: 16, marginBottom: 24, backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', padding: 20, gap: 10 },
  referralCardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  referralCardTitle:    { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  referralCardSub:      { fontSize: 12, color: COLOR.muted, lineHeight: 18 },
  referralCodeRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: RADIUS.sm, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', paddingHorizontal: 16, paddingVertical: 12 },
  referralCodeText:     { fontSize: 22, fontWeight: '600', color: COLOR.gold, letterSpacing: 4 },
  referralShareBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLOR.gold, borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 8 },
  referralShareBtnText: { fontSize: 10, fontWeight: '700', color: COLOR.bg, letterSpacing: 1.5 },
  referralCountText:    { fontSize: 11, color: COLOR.green, fontWeight: '500' },
  upgradeNote:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  upgradeNoteText:      { fontSize: 11, color: '#C9A84C66', fontStyle: 'italic' },
  seasonBetsCard:       { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#C9A84C22', padding: 16, marginTop: 10, marginBottom: 10 },
  seasonBetsRow:        { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  seasonBetStat:        { alignItems: 'center' },
  seasonBetValue:       { fontSize: 28, fontWeight: '300', color: COLOR.cream },
  seasonBetLabel:       { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5, marginTop: 3 },
  certifiedBanner:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.gold, paddingVertical: 8 },
  certifiedBannerText:  { fontSize: 10, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },
});
