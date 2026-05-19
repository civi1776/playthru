/*
 * CaddyLeaderboardScreen — standalone caddy leaderboard with club / state / national tabs.
 *
 * SQL — run before first use:
 *
 * CREATE TABLE IF NOT EXISTS caddy_challenges (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   title text NOT NULL,
 *   description text,
 *   challenge_type text CHECK (challenge_type IN ('most_rounds','fastest_avg','course_champion','national')),
 *   prize_amount numeric(10,2),
 *   prize_description text,
 *   start_date date NOT NULL,
 *   end_date date NOT NULL,
 *   scope text CHECK (scope IN ('club','state','national')),
 *   course_id uuid REFERENCES courses(id),
 *   state text,
 *   is_active boolean DEFAULT true,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * CREATE TABLE IF NOT EXISTS caddy_challenge_entries (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   challenge_id uuid REFERENCES caddy_challenges(id),
 *   caddy_id uuid REFERENCES profiles(id),
 *   rounds_logged integer DEFAULT 0,
 *   avg_round_time numeric,
 *   total_minutes numeric DEFAULT 0,
 *   rank integer,
 *   updated_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS caddy_total_loops integer DEFAULT 0;
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS caddy_avg_round_time numeric;
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS caddy_fastest_round integer;
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS caddy_home_club_rank integer;
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS caddy_state_rank integer;
 * ALTER TABLE profiles ADD COLUMN IF NOT EXISTS caddy_national_rank integer;
 *
 * -- Seed active challenges:
 * INSERT INTO caddy_challenges (title, description, challenge_type, prize_amount, prize_description, start_date, end_date, scope, is_active)
 * VALUES
 * ('Most Loops — May 2026','Log the most caddy rounds in May to win','most_rounds',1500.00,'$1,500 Cash Prize','2026-05-01','2026-05-31','national',true),
 * ('Fastest Average — May 2026','Lowest average round time among all caddies','fastest_avg',500.00,'$500 Cash Prize','2026-05-01','2026-05-31','national',true),
 * ('Club Champion — May 2026','Most loops at your home club this month','course_champion',250.00,'$250 Golf Shop Gift Card','2026-05-01','2026-05-31','club',true);
 */

import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import InitialsAvatar from '../components/InitialsAvatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthStart() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysUntil(dateStr) {
  const now = new Date();
  const end = new Date(dateStr + 'T23:59:59');
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
}

function hoursUntil(dateStr) {
  const now = new Date();
  const end = new Date(dateStr + 'T23:59:59');
  return Math.max(0, Math.floor((end - now) / (1000 * 60 * 60)));
}

function formatTime(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function isActiveRecently(isoStr) {
  if (!isoStr) return false;
  return Date.now() - new Date(isoStr).getTime() < 48 * 60 * 60 * 1000;
}

function sortCaddies(caddies, filter) {
  const sorted = [...caddies];
  switch (filter) {
    case 'loops':
      return sorted.sort((a, b) => (b.loops_this_month || 0) - (a.loops_this_month || 0));
    case 'fastest':
      return sorted.sort((a, b) => {
        if (!a.avg_time && !b.avg_time) return 0;
        if (!a.avg_time) return 1;
        if (!b.avg_time) return -1;
        return a.avg_time - b.avg_time;
      });
    case 'rated':
      return sorted.sort((a, b) => (b.caddy_rating || 0) - (a.caddy_rating || 0));
    case 'alltime':
      return sorted.sort((a, b) => (b.total_loops || 0) - (a.total_loops || 0));
    default:
      return sorted;
  }
}

function rankValue(caddy, filter) {
  switch (filter) {
    case 'loops':   return caddy.loops_this_month || 0;
    case 'fastest': return caddy.avg_time ? formatTime(caddy.avg_time) : '—';
    case 'rated':   return caddy.caddy_rating ? caddy.caddy_rating.toFixed(1) : '—';
    case 'alltime': return caddy.total_loops || 0;
    default:        return '—';
  }
}

// ─── Challenge Banner ─────────────────────────────────────────────────────────

function ChallengeBanner({ challenge, myCaddyId, sortedCaddies, navigation }) {
  if (!challenge) return null;

  const days    = daysUntil(challenge.end_date);
  const hrs     = hoursUntil(challenge.end_date) % 24;
  const leader  = sortedCaddies[0];
  const myIdx   = sortedCaddies.findIndex(c => c.id === myCaddyId);
  const me      = myIdx >= 0 ? sortedCaddies[myIdx] : null;
  const myLoops = me?.loops_this_month || 0;
  const leaderLoops = leader?.loops_this_month || 0;
  const progress = leaderLoops > 0 ? Math.min(1, myLoops / leaderLoops) : 0;

  let progressMsg;
  if (myLoops === 0) {
    progressMsg = 'You have 0 loops · Log your first round!';
  } else if (leader && leader.id !== myCaddyId) {
    const gap = leaderLoops - myLoops;
    progressMsg = `${myLoops} loop${myLoops !== 1 ? 's' : ''} logged · ${gap} behind ${leader.full_name?.split(' ')[0] || 'leader'}`;
  } else {
    progressMsg = `${myLoops} loop${myLoops !== 1 ? 's' : ''} logged · You are leading!`;
  }

  return (
    <View style={lb.banner}>
      <View style={lb.bannerHeader}>
        <View style={lb.bannerTrophyWrap}>
          <Ionicons name="trophy" size={20} color="#C9A84C" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={lb.bannerTitle}>{challenge.title}</Text>
          <Text style={lb.bannerPrize}>{challenge.prize_description || `$${challenge.prize_amount}`}</Text>
        </View>
        <View style={lb.bannerCountdown}>
          <Text style={lb.bannerDays}>{days}</Text>
          <Text style={lb.bannerDaysLabel}>DAYS</Text>
          {hrs > 0 && <Text style={lb.bannerHrs}>{hrs}h left</Text>}
        </View>
      </View>

      <View style={lb.bannerProgressTrack}>
        <View style={[lb.bannerProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={[lb.bannerProgressLabel, { marginTop: 6, marginBottom: 10 }]}>{progressMsg}</Text>

      <TouchableOpacity
        style={lb.bannerLogBtn}
        onPress={() => navigation.navigate('Log')}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle" size={14} color="#090F0A" />
        <Text style={lb.bannerLogBtnTxt}>LOG A ROUND</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Rank Badge ───────────────────────────────────────────────────────────────

const RANK_COLORS = { 1: '#C9A84C', 2: '#B8B8B8', 3: '#CD7F32' };

function RankBadge({ rank, isMe }) {
  const color = RANK_COLORS[rank] || (isMe ? '#7DC87A' : '#B8A882');
  const isTop = rank <= 3;
  return (
    <View style={[
      lb.rankCircle,
      { borderColor: color, backgroundColor: isTop ? color + '22' : 'transparent' },
    ]}>
      <Text style={[lb.rankCircleNum, { color }]}>{rank}</Text>
    </View>
  );
}

// ─── Leaderboard Row ──────────────────────────────────────────────────────────

function LeaderboardRow({ caddy, rank, myId, filter, navigation }) {
  const isMe   = caddy.id === myId;
  const active = isActiveRecently(caddy.last_active);
  const val    = rankValue(caddy, filter);
  const hasRating = caddy.caddy_rating && caddy.caddy_rating > 0 && caddy.caddy_rating !== 2.5;

  return (
    <TouchableOpacity
      style={[lb.row, isMe && lb.rowMe]}
      onPress={() => navigation.navigate('PublicProfile', { userId: caddy.id })}
      activeOpacity={0.75}
    >
      {/* Rank */}
      <View style={lb.rankWrap}>
        <RankBadge rank={rank} isMe={isMe} />
      </View>

      {/* Avatar */}
      <InitialsAvatar name={caddy.full_name} size={36} />

      {/* Name + course + rating */}
      <View style={lb.rowInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[lb.rowName, isMe && { color: '#7DC87A' }]} numberOfLines={1}>
            {caddy.full_name || caddy.username || 'Caddy'}
          </Text>
          {isMe && <Text style={lb.meBadge}>YOU</Text>}
          {active && <Ionicons name="flame" size={12} color="#E8834A" />}
        </View>
        {caddy.caddy_course ? (
          <Text style={lb.rowCourse} numberOfLines={1}>{caddy.caddy_course}</Text>
        ) : null}
        {hasRating ? (
          <View style={{ flexDirection: 'row', gap: 1, marginTop: 2 }}>
            {[1,2,3,4,5].map(i => (
              <Ionicons
                key={i}
                name={i <= Math.round(caddy.caddy_rating) ? 'star' : 'star-outline'}
                size={9}
                color="#C9A84C"
              />
            ))}
          </View>
        ) : (
          <Text style={lb.unratedTxt}>Unrated</Text>
        )}
      </View>

      {/* Stat value */}
      <Text style={[lb.rowVal, isMe && { color: '#7DC87A' }]}>{val}</Text>
    </TouchableOpacity>
  );
}

// ─── My Stats Section ─────────────────────────────────────────────────────────

function rankLabel(rank, total) {
  if (!rank) return '—';
  if (total <= 1) return `1 of 1`;
  return `#${rank} of ${total}`;
}

function MyStatsSection({ myId, clubCaddies, stateCaddies, nationalCaddies, filter }) {
  const findRank = (list) => { const i = list.findIndex(c => c.id === myId); return i >= 0 ? i + 1 : null; };
  const me = nationalCaddies.find(c => c.id === myId);

  const clubRank     = findRank(clubCaddies);
  const stateRank    = findRank(stateCaddies);
  const nationalRank = findRank(nationalCaddies);

  // Motivational message based on loops and rank
  let motivation = null;
  let motivationIcon = 'trending-up';
  const loops = me?.loops_this_month || 0;
  if (loops === 0) {
    motivation = 'Log your first round to start climbing the leaderboard!';
    motivationIcon = 'add-circle-outline';
  } else if (nationalRank === 1 && nationalCaddies.length > 1) {
    motivation = 'You are leading the national challenge — defend your spot!';
    motivationIcon = 'trophy';
  } else if (nationalRank != null && nationalRank <= 10 && nationalCaddies.length >= 10) {
    motivation = 'You are in the Top 10 nationally — push for the prize!';
    motivationIcon = 'flame';
  } else if (loops <= 5) {
    motivation = 'You are building momentum — keep logging!';
    motivationIcon = 'trending-up';
  } else if (nationalRank != null) {
    motivation = `${nationalRank - 10 > 0 ? `${nationalRank - 10} rounds from Top 10` : 'Keep logging to climb!'} `;
    motivationIcon = 'trending-up';
  }

  if (!me) return null;

  return (
    <View style={lb.myStats}>
      <Text style={lb.myStatsLabel}>MY RANKINGS</Text>
      <View style={lb.myStatsRow}>
        <View style={lb.myStatCard}>
          <Text style={lb.myStatNum}>{rankLabel(clubRank, clubCaddies.length)}</Text>
          <Text style={lb.myStatSub}>CLUB</Text>
        </View>
        <View style={lb.myStatCard}>
          <Text style={lb.myStatNum}>{rankLabel(stateRank, stateCaddies.length)}</Text>
          <Text style={lb.myStatSub}>STATE</Text>
        </View>
        <View style={lb.myStatCard}>
          <Text style={lb.myStatNum}>{rankLabel(nationalRank, nationalCaddies.length)}</Text>
          <Text style={lb.myStatSub}>NATIONAL</Text>
        </View>
      </View>

      <View style={lb.myStatGrid}>
        <View style={lb.myStatGridItem}>
          <Text style={lb.myStatGridNum}>{me.loops_this_month || 0}</Text>
          <Text style={lb.myStatGridLabel}>THIS MONTH</Text>
        </View>
        <View style={lb.myStatGridItem}>
          <Text style={lb.myStatGridNum}>{me.total_loops || 0}</Text>
          <Text style={lb.myStatGridLabel}>CAREER LOOPS</Text>
        </View>
        <View style={lb.myStatGridItem}>
          <Text style={lb.myStatGridNum}>{me.avg_time ? formatTime(me.avg_time) : '—'}</Text>
          <Text style={lb.myStatGridLabel}>AVG ROUND</Text>
        </View>
      </View>

      {motivation && (
        <View style={lb.motivationRow}>
          <Ionicons name={motivationIcon} size={14} color="#7DC87A" />
          <Text style={lb.motivationTxt}>{motivation}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'club',     label: 'MY CLUB'  },
  { key: 'state',    label: 'MY STATE' },
  { key: 'national', label: 'NATIONAL' },
];

const FILTERS = [
  { key: 'loops',   label: 'Most Loops'  },
  { key: 'fastest', label: 'Fastest Avg' },
  { key: 'rated',   label: 'Best Rated'  },
  { key: 'alltime', label: 'All Time'    },
];

export default function CaddyLeaderboardScreen({ navigation }) {
  const { profile, user } = useAuth();
  const myId = user?.id;

  const [tab, setTab]         = useState('club');
  const [filter, setFilter]   = useState('loops');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statBar, setStatBar] = useState({ total: 0, activeThisMonth: 0, prizePool: 0 });

  const [challenges, setChallenges]           = useState([]);
  const [clubCaddies, setClubCaddies]         = useState([]);
  const [stateCaddies, setStateCaddies]       = useState([]);
  const [nationalCaddies, setNationalCaddies] = useState([]);

  useFocusEffect(useCallback(() => {
    load(true);
  }, [profile?.caddy_course, profile?.home_state]));

  const load = async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      await Promise.all([fetchChallenges(), fetchLeaderboards()]);
    } catch (e) {
      // silent fail
    }
    if (initial) setLoading(false); else setRefreshing(false);
  };

  const onRefresh = () => load(false);

  const fetchChallenges = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('caddy_challenges')
      .select('*')
      .eq('is_active', true)
      .gte('end_date', today)
      .order('prize_amount', { ascending: false });
    const list = data || [];
    setChallenges(list);
    const pool = list.reduce((s, c) => s + (c.prize_amount || 0), 0);
    setStatBar(prev => ({ ...prev, prizePool: pool }));
  };

  const fetchLeaderboards = async () => {
    // Fetch this month's rounds (one query)
    const { data: rounds } = await supabase
      .from('rounds')
      .select('caddy_id, duration_minutes, created_at')
      .not('caddy_id', 'is', null)
      .gte('created_at', monthStart());

    // Aggregate by caddy_id
    const roundMap = {};
    for (const r of (rounds || [])) {
      if (!r.caddy_id) continue;
      if (!roundMap[r.caddy_id]) {
        roundMap[r.caddy_id] = { count: 0, totalMin: 0, lastActive: null };
      }
      roundMap[r.caddy_id].count++;
      if (r.duration_minutes) roundMap[r.caddy_id].totalMin += r.duration_minutes;
      if (!roundMap[r.caddy_id].lastActive || r.created_at > roundMap[r.caddy_id].lastActive) {
        roundMap[r.caddy_id].lastActive = r.created_at;
      }
    }

    // Fetch all caddy profiles
    const { data: allCaddies } = await supabase
      .from('profiles')
      .select('id, full_name, username, caddy_course, caddy_rating, home_state, caddy_total_loops')
      .eq('account_type', 'caddy');

    // Merge
    const enriched = (allCaddies || []).map(c => {
      const rm = roundMap[c.id] || { count: 0, totalMin: 0, lastActive: null };
      return {
        ...c,
        loops_this_month: rm.count,
        avg_time: rm.count > 0 ? rm.totalMin / rm.count : null,
        last_active: rm.lastActive,
        total_loops: c.caddy_total_loops || 0,
      };
    });

    setNationalCaddies(enriched);
    setClubCaddies(
      profile?.caddy_course
        ? enriched.filter(c => c.caddy_course === profile.caddy_course)
        : []
    );
    setStateCaddies(
      profile?.home_state
        ? enriched.filter(c => c.home_state === profile.home_state)
        : []
    );

    // Stat bar
    const activeThisMonth = enriched.filter(c => c.loops_this_month > 0).length;
    setStatBar(prev => ({ ...prev, total: enriched.length, activeThisMonth }));
  };

  // Current tab's caddy list sorted by active filter
  const listForTab = tab === 'club' ? clubCaddies : tab === 'state' ? stateCaddies : nationalCaddies;
  const sorted = sortCaddies(listForTab, filter);

  // Active challenge for current tab scope
  const challengeScope = tab === 'national' ? 'national' : tab === 'state' ? 'state' : 'club';
  const activeChallenge = challenges.find(c => c.scope === challengeScope || c.scope === 'national') || challenges[0] || null;

  const isClubEmpty = tab === 'club' && sorted.length === 0;
  const myLoopsThisMonth = nationalCaddies.find(c => c.id === myId)?.loops_this_month || 0;
  const leaderLoopsThisMonth = sorted[0]?.loops_this_month || 0;

  return (
    <SafeAreaView style={lb.container}>

      {/* Header + stat bar */}
      <View style={lb.header}>
        <Text style={lb.wordmark}>PLAYTHRU</Text>
        <Text style={lb.title}>CADDY LEADERBOARD</Text>
        <View style={lb.statBar}>
          <View style={lb.statBarItem}>
            <Text style={lb.statBarNum}>{statBar.total}</Text>
            <Text style={lb.statBarLabel}>CADDIES</Text>
          </View>
          <View style={lb.statBarDivider} />
          <View style={lb.statBarItem}>
            <Text style={lb.statBarNum}>{statBar.activeThisMonth}</Text>
            <Text style={lb.statBarLabel}>ACTIVE THIS MONTH</Text>
          </View>
          <View style={lb.statBarDivider} />
          <View style={lb.statBarItem}>
            <Text style={lb.statBarNum}>${statBar.prizePool.toLocaleString()}</Text>
            <Text style={lb.statBarLabel}>PRIZE POOL</Text>
          </View>
        </View>
      </View>

      {/* Tab bar */}
      <View style={lb.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[lb.tabBtn, tab === t.key && lb.tabBtnActive]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[lb.tabTxt, tab === t.key && lb.tabTxtActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#7DC87A" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7DC87A"
              colors={['#7DC87A']}
            />
          }
        >
          {/* Challenge Banner — full width, prominent */}
          {activeChallenge && (
            <View style={{ margin: 16, padding: 16, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 22 }}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: '#C9A84C', letterSpacing: 1.5, fontWeight: '700' }}>ACTIVE CHALLENGE</Text>
                  <Text style={{ fontSize: 15, color: '#F5EDD8', fontWeight: '600', marginTop: 1 }}>{activeChallenge.title}</Text>
                </View>
                <View style={{ backgroundColor: '#162B19', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', minWidth: 48 }}>
                  <Text style={{ fontSize: 20, color: '#C9A84C', fontWeight: '700' }}>{daysUntil(activeChallenge.end_date)}</Text>
                  <Text style={{ fontSize: 8, color: '#B8A882', letterSpacing: 1 }}>DAYS LEFT</Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, color: '#7DC87A', fontWeight: '600', marginBottom: 10 }}>
                {activeChallenge.prize_description || `$${activeChallenge.prize_amount}`}
              </Text>
              <View style={{ backgroundColor: '#162B19', borderRadius: 6, height: 6, marginBottom: 6 }}>
                <View style={{
                  backgroundColor: '#7DC87A', height: 6, borderRadius: 6,
                  width: `${Math.min((myLoopsThisMonth / Math.max(leaderLoopsThisMonth, 1)) * 100, 100)}%`,
                }} />
              </View>
              <Text style={{ fontSize: 11, color: '#B8A882', marginBottom: 12 }}>
                {myLoopsThisMonth === 0
                  ? 'Log your first round to enter the challenge'
                  : leaderLoopsThisMonth > myLoopsThisMonth
                  ? `${myLoopsThisMonth} loop${myLoopsThisMonth !== 1 ? 's' : ''} · ${leaderLoopsThisMonth - myLoopsThisMonth} behind the leader`
                  : `${myLoopsThisMonth} loop${myLoopsThisMonth !== 1 ? 's' : ''} · You are leading!`}
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#7DC87A', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                onPress={() => navigation.navigate('Log')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 }}>LOG A ROUND NOW</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: 8 }}
          >
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[lb.filterPill, filter === f.key && lb.filterPillActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[lb.filterTxt, filter === f.key && lb.filterTxtActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Club empty state — enriched */}
          {isClubEmpty ? (
            <View style={lb.emptyBox}>
              <Ionicons name="flag-outline" size={44} color="#7DC87A33" style={{ marginBottom: 14 }} />
              <Text style={lb.emptyTitle}>
                You're the first caddy from{'\n'}{profile?.caddy_course || 'your club'} on PlayThru!
              </Text>
              <Text style={[lb.emptyTxt, { marginTop: 6, marginBottom: 20 }]}>Invite your fellow caddies to compete</Text>
              <TouchableOpacity
                style={lb.inviteBtn}
                onPress={() => Share.share({ message: `Join me on PlayThru — the caddy app. Download at playthrugolf.app` })}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={14} color="#090F0A" />
                <Text style={lb.inviteBtnTxt}>INVITE CADDIES</Text>
              </TouchableOpacity>
            </View>
          ) : sorted.length === 0 ? (
            <View style={lb.emptyBox}>
              <Ionicons name="people-outline" size={40} color="#7DC87A33" style={{ marginBottom: 12 }} />
              <Text style={lb.emptyTxt}>
                {tab === 'state' ? 'No caddies found in your state yet.' : 'No caddies on the leaderboard yet.'}
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              {/* Column header */}
              <View style={lb.colHeader}>
                <Text style={[lb.colHeaderTxt, { width: 44 }]}>#</Text>
                <Text style={[lb.colHeaderTxt, { flex: 1 }]}>CADDY</Text>
                <Text style={lb.colHeaderTxt}>
                  {filter === 'loops' ? 'LOOPS' : filter === 'fastest' ? 'AVG TIME' : filter === 'rated' ? 'RATING' : 'CAREER'}
                </Text>
              </View>

              {sorted.map((caddy, i) => (
                <LeaderboardRow
                  key={caddy.id}
                  caddy={caddy}
                  rank={i + 1}
                  myId={myId}
                  filter={filter}
                  navigation={navigation}
                />
              ))}
            </View>
          )}

          {/* My Stats */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <MyStatsSection
              myId={myId}
              clubCaddies={sortCaddies(clubCaddies, filter)}
              stateCaddies={sortCaddies(stateCaddies, filter)}
              nationalCaddies={sortCaddies(nationalCaddies, filter)}
              filter={filter}
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const lb = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#090F0A' },

  header:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  wordmark:   { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 5 },
  title:      { fontSize: 18, fontWeight: '600', color: '#F5EDD8', marginTop: 2 },

  // Stat bar
  statBar:        { flexDirection: 'row', paddingTop: 12, paddingBottom: 4 },
  statBarItem:    { flex: 1, alignItems: 'center' },
  statBarNum:     { fontSize: 18, fontWeight: '600', color: '#F5EDD8' },
  statBarLabel:   { fontSize: 8, fontWeight: '700', color: '#7A6E58', letterSpacing: 1.5, marginTop: 2 },
  statBarDivider: { width: 1, backgroundColor: '#7DC87A22', marginVertical: 4 },

  // Tab bar
  tabBar:     { flexDirection: 'row', backgroundColor: '#090F0A', borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  tabBtn:     { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#7DC87A' },
  tabTxt:     { fontSize: 10, fontWeight: '600', color: '#B8A882', letterSpacing: 1.5 },
  tabTxtActive: { color: '#F5EDD8', fontWeight: '700' },

  // Filter pills
  filterScroll: { flexGrow: 0 },
  filterPill:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(125,200,122,0.2)', backgroundColor: '#0D1A0F' },
  filterPillActive: { borderColor: '#7DC87A', backgroundColor: 'rgba(125,200,122,0.12)' },
  filterTxt:    { fontSize: 11, fontWeight: '600', color: '#B8A882' },
  filterTxtActive: { color: '#7DC87A' },

  // Challenge banner
  banner:           { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#C9A84C44', padding: 16, marginBottom: 8 },
  bannerHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  bannerTrophyWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center' },
  bannerTitle:      { fontSize: 14, fontWeight: '700', color: '#F5EDD8', marginBottom: 3 },
  bannerPrize:      { fontSize: 12, color: '#C9A84C', fontWeight: '600' },
  bannerCountdown:  { alignItems: 'center', minWidth: 44 },
  bannerDays:       { fontSize: 28, fontWeight: '300', color: '#7DC87A', lineHeight: 30 },
  bannerDaysLabel:  { fontSize: 8, fontWeight: '700', color: '#7DC87A88', letterSpacing: 1.5 },
  bannerHrs:        { fontSize: 10, color: '#7DC87A66', marginTop: 1 },
  bannerProgressTrack: { height: 4, backgroundColor: 'rgba(125,200,122,0.15)', borderRadius: 2, marginTop: 4 },
  bannerProgressFill:  { height: 4, backgroundColor: '#7DC87A', borderRadius: 2 },
  bannerProgressLabel: { fontSize: 10, color: '#B8A882' },
  bannerGap:        { fontSize: 11, color: '#C9A84C', marginTop: 6, fontWeight: '500' },
  bannerLogBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7DC87A', borderRadius: 10, paddingVertical: 10 },
  bannerLogBtnTxt:  { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // Column header
  colHeader:    { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', marginBottom: 4 },
  colHeaderTxt: { fontSize: 9, fontWeight: '700', color: '#B8A88244', letterSpacing: 1.5 },

  // Leaderboard row
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowMe:        { backgroundColor: 'rgba(125,200,122,0.05)', borderRadius: 12, marginHorizontal: -4 },
  rankWrap:     { width: 36, alignItems: 'center' },
  rankCircle:   { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rankCircleNum:{ fontSize: 12, fontWeight: '700' },
  rowInfo:      { flex: 1 },
  rowName:      { fontSize: 15, fontWeight: '600', color: '#F5EDD8', flexShrink: 1 },
  rowCourse:    { fontSize: 10, color: '#7A6E58', marginTop: 1 },
  rowVal:       { fontSize: 20, fontWeight: '700', color: '#F5EDD8', minWidth: 48, textAlign: 'right' },
  meBadge:      { fontSize: 8, fontWeight: '700', color: '#090F0A', backgroundColor: '#7DC87A', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 0.5 },
  unratedTxt:   { fontSize: 9, color: '#7A6E58', marginTop: 2, fontStyle: 'italic' },

  // Empty
  emptyBox:    { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 16, fontWeight: '600', color: '#F5EDD8', textAlign: 'center', lineHeight: 24 },
  emptyTxt:    { fontSize: 14, color: '#7A6E58', textAlign: 'center', lineHeight: 22 },
  inviteBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7DC87A', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  inviteBtnTxt:{ fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // My stats
  myStats:         { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginTop: 8 },
  myStatsLabel:    { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 12 },
  myStatsRow:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
  myStatCard:      { flex: 1, backgroundColor: '#162B19', borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#7DC87A', padding: 10, alignItems: 'center' },
  myStatNum:       { fontSize: 14, fontWeight: '600', color: '#7DC87A' },
  myStatSub:       { fontSize: 8, fontWeight: '700', color: '#B8A88266', letterSpacing: 1.5, marginTop: 2 },
  myStatGrid:      { flexDirection: 'row', gap: 8 },
  myStatGridItem:  { flex: 1, alignItems: 'center' },
  myStatGridNum:   { fontSize: 16, fontWeight: '500', color: '#F5EDD8' },
  myStatGridLabel: { fontSize: 9, color: '#7A6E58', letterSpacing: 1, marginTop: 2, textAlign: 'center' },
  motivationRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#7DC87A22' },
  motivationTxt:   { fontSize: 12, color: '#7DC87A', fontWeight: '500', flex: 1 },
});
