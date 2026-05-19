import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Gauge from '../components/guage';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { scheduleWeeklyDigest } from '../lib/notifications';

const UPCOMING_FEATURES = [
  { icon: 'hardware-chip',      title: 'AI Pace Coach',    subtitle: 'Weekly insights' },
  { icon: 'navigate-circle',    title: 'GPS Tracking',     subtitle: 'Automatic pace scoring powered by real-time GPS — no logging required' },
  { icon: 'people-outline',     title: 'Private Groups',   subtitle: 'Play with your crew' },
  { icon: 'school-outline',     title: 'PlayThru Speed School', subtitle: 'Train your pace game' },
  { icon: 'book-outline',       title: 'POP Rules',        subtitle: 'Pace of Play Rules — our simplified ruleset designed to keep your round moving without sacrificing the game.', gold: true },
];

function ComingSoonCard() {
  return (
    <View style={styles.proCard}>
      <View style={styles.proBadge}>
        <Text style={styles.proBadgeText}>COMING SOON</Text>
      </View>
      <View style={styles.proFeatureRow}>
        {UPCOMING_FEATURES.map(f => (
          <TouchableOpacity
            key={f.title}
            style={[styles.proFeature, f.gold && styles.proFeatureGold]}
            onPress={() => Alert.alert('Coming Soon', 'This feature is in development. Stay tuned!')}
            activeOpacity={0.7}
          >
            <View style={styles.proComingSoonBadge}>
              <Text style={styles.proComingSoonText}>IN DEVELOPMENT</Text>
            </View>
            <Ionicons name={f.icon} size={22} color={f.gold ? '#C9A84C' : '#B8A882'} style={{ marginBottom: 6 }} />
            <Text style={[styles.proFeatureTitle, f.gold && { color: '#C9A84C' }]}>{f.title}</Text>
            <Text style={styles.proFeatureSub}>{f.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function HomeSkeleton() {
  return (
    <>
      <View style={styles.scoreCard}>
        <SkeletonLoader width={220} height={220} style={{ borderRadius: 110 }} />
        <View style={[styles.scoreRow, { marginTop: 16 }]}>
          <SkeletonLoader width={48} height={36} />
          <SkeletonLoader width={48} height={36} />
          <SkeletonLoader width={48} height={36} />
        </View>
      </View>
      <View style={styles.card}>
        <SkeletonLoader width="60%" height={12} style={{ marginBottom: 10 }} />
        <SkeletonLoader width="85%" height={20} style={{ marginBottom: 8 }} />
        <SkeletonLoader width="70%" height={12} />
      </View>
      <View style={styles.card}>
        <SkeletonLoader width="50%" height={12} style={{ marginBottom: 10 }} />
        <SkeletonLoader width="75%" height={20} />
      </View>
    </>
  );
}

function formatShortDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatTime(minutes) {
  if (!minutes || isNaN(+minutes)) return '--';
  const total = +minutes;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return `${Math.floor(diff / 86400)} days ago`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function popTierLabel(score) {
  if (score >= 4.0) return 'Fast';
  if (score >= 3.0) return 'Average';
  return 'Slow';
}

function popBgColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#C9A84C';
  return '#C07A6A';
}

function TrendChart({ rounds, color }) {
  const MAX_H = 54;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: MAX_H + 8, gap: 3, marginVertical: 8 }}>
      {rounds.map((r, i) => {
        const h = Math.max(4, ((r.pop_score ?? 0) / 5) * MAX_H);
        const opacity = 0.4 + (i / Math.max(rounds.length - 1, 1)) * 0.6;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{ width: '80%', height: h, backgroundColor: color, borderRadius: 3, opacity }} />
          </View>
        );
      })}
    </View>
  );
}

function PlayerHomeScreen({ navigation }) {
  const { profile, user, refreshProfile } = useAuth();
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(false);
  const [hasRounds, setHasRounds]       = useState(true);
  const [courseOfDay, setCourseOfDay]   = useState(null);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [paceTrend, setPaceTrend]       = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [featuredRound, setFeaturedRound] = useState(null);
  const [lastRound, setLastRound]         = useState(null);
  const [monthlyDelta, setMonthlyDelta]   = useState(undefined);
  const [totalRounds, setTotalRounds]     = useState(0);

  // Fetch Course of the Day — cached for 24 hours via AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const cached     = await AsyncStorage.getItem('course_of_day');
        const cachedTime = await AsyncStorage.getItem('course_of_day_time');
        const hoursSince = cachedTime
          ? (Date.now() - new Date(cachedTime).getTime()) / (1000 * 60 * 60)
          : 999;

        if (cached && hoursSince < 24) {
          setCourseOfDay(JSON.parse(cached));
          setLoadingCourse(false);
          return;
        }

        const { data, error } = await supabase
          .from('courses')
          .select('id, name, city, state, country, holes, avg_time, pop_score, total_rounds, par, latitude, longitude')
          .gt('total_rounds', 0)
          .order('pop_score', { ascending: false })
          .limit(10);
        if (error) throw error;

        let selected = null;
        if (data && data.length > 0) {
          selected = data[Math.floor(Math.random() * data.length)];
        } else {
          const { data: fallback } = await supabase
            .from('courses')
            .select('id, name, city, state, country, holes, avg_time, pop_score, total_rounds, par')
            .limit(1)
            .maybeSingle();
          selected = fallback ?? null;
        }

        if (selected) {
          await AsyncStorage.setItem('course_of_day', JSON.stringify(selected));
          await AsyncStorage.setItem('course_of_day_time', new Date().toISOString());
        }
        setCourseOfDay(selected);
      } catch (e) {
        // silent fail
      } finally {
        setLoadingCourse(false);
      }
    })();
  }, []);

  // Fetch global activity feed preview independently
  useEffect(() => {
    (async () => {
      try {
        const { data: feedItems } = await supabase
          .from('activity_feed')
          .select('id, user_id, type, content, created_at')
          .order('created_at', { ascending: false })
          .limit(3);
        if (!feedItems || feedItems.length === 0) { setRecentActivity([]); return; }
        const uids = [...new Set(feedItems.map(f => f.user_id))];
        const { data: profData } = await supabase
          .from('profiles').select('id, username, full_name').in('id', uids);
        const pmap = {};
        profData?.forEach(p => { pmap[p.id] = p; });
        setRecentActivity(feedItems.map(f => ({
          ...f,
          username: pmap[f.user_id]?.username || null,
          full_name: pmap[f.user_id]?.full_name || null,
        })));
      } catch (e) { /* silent fail */ }
    })();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(false);
    try {
      const uid = user?.id;
      if (!uid) { setLoading(false); return; }

      // Check if user has any rounds (for empty state)
      const { count: roundsCount } = await supabase
        .from('rounds')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
      const total = roundsCount ?? 0;
      setHasRounds(total > 0);
      setTotalRounds(total);

      // Section 4: Pace trend — last 10 rounds ordered ASC
      const { data: trendData } = await supabase
        .from('rounds')
        .select('pop_score, created_at')
        .eq('user_id', uid)
        .not('pop_score', 'is', null)
        .order('created_at', { ascending: true })
        .limit(10);
      setPaceTrend(trendData ?? []);

      // Featured round — best pop_score ever
      const { data: bestRound } = await supabase
        .from('rounds')
        .select('id, course_name, pop_score, holes, transport, players, duration_minutes, created_at, caddy_logged')
        .eq('user_id', uid)
        .not('pop_score', 'is', null)
        .order('pop_score', { ascending: false })
        .limit(1)
        .maybeSingle();
      setFeaturedRound(bestRound ?? null);

      // Last round — most recent (any round, regardless of pop_score)
      const { data: latestRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLastRound(latestRound ?? null);

      // Monthly delta — this month vs last month average pop_score
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentRounds } = await supabase
        .from('rounds')
        .select('pop_score, created_at')
        .eq('user_id', uid)
        .not('pop_score', 'is', null)
        .gte('created_at', sixtyDaysAgo);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const thisMonth = (recentRounds ?? []).filter(r => new Date(r.created_at) >= thirtyDaysAgo);
      const lastMonth = (recentRounds ?? []).filter(r => new Date(r.created_at) < thirtyDaysAgo);
      if (thisMonth.length > 0 && lastMonth.length > 0) {
        const thisAvg = thisMonth.reduce((s, r) => s + r.pop_score, 0) / thisMonth.length;
        const lastAvg = lastMonth.reduce((s, r) => s + r.pop_score, 0) / lastMonth.length;
        setMonthlyDelta(((thisAvg - lastAvg) / lastAvg) * 100);
      } else {
        setMonthlyDelta(null);
      }

    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Schedule weekly digest + monthly challenge whenever profile score is available
  useEffect(() => {
    if (!profile?.pop_score || !user?.id) return;
    (async () => {
      try {
        const ps = profile.pop_score;
        const { count: rankCount } = await supabase
          .from('profiles').select('*', { count: 'exact', head: true })
          .gt('pop_score', ps);
        const rank = (rankCount ?? 0) + 1;
        const startOfMonth = new Date();
        startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const { count: roundsThisMonth } = await supabase
          .from('rounds').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', startOfMonth.toISOString());
        await scheduleWeeklyDigest(ps, rank, roundsThisMonth ?? 0);
      } catch (e) { /* silent fail */ }
    })();
  }, [profile?.pop_score]);

  useFocusEffect(useCallback(() => { refreshProfile(); fetchAll(); }, []));

  const firstName = profile?.full_name?.split(' ')[0] ?? '';
  const popScore  = profile?.pop_score;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.wordmark}>PLAYTHRU</Text>
            {!loading && !error && (
              <Text style={styles.greeting}>{getGreeting()}, {firstName}.</Text>
            )}
            {loading && <SkeletonLoader width={180} height={14} style={{ marginTop: 8 }} />}
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
            style={styles.headerAvatar}
          >
            <InitialsAvatar name={profile?.full_name} size={38} />
          </TouchableOpacity>
        </View>

        {/* Error state */}
        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={32} color="rgba(201,168,76,0.3)" style={{ marginBottom: 12 }} />
            <Text style={styles.errorText}>Could not load your data. Check your connection.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchAll} activeOpacity={0.8}>
              <Text style={styles.retryText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && !error && <HomeSkeleton />}

        {/* Loaded content */}
        {!loading && !error && (
          <>
            {/* POPScore Card */}
            <View style={styles.scoreCard}>
              <TouchableOpacity
                style={styles.scoreInfoBtn}
                onPress={() => navigation.navigate('POPScoreInfo')}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle-outline" size={20} color="#C9A84C" />
              </TouchableOpacity>
              {popScore != null
                ? <Gauge score={popScore} />
                : <View style={{ alignItems: 'center', paddingVertical: 36 }}>
                    <Text style={{ fontSize: 56, fontWeight: '100', color: '#C9A84C44' }}>—</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#C9A84C66', letterSpacing: 2, marginTop: 8 }}>LOG A ROUND TO EARN YOUR SCORE</Text>
                  </View>
              }
              <View style={styles.scoreRow}>
                <View style={styles.scoreStat}>
                  <Text style={styles.scoreStatLabel}>NAT'L AVG</Text>
                  <Text style={styles.scoreStatValue}>3.9</Text>
                </View>
                <View style={styles.scoreStat}>
                  <Text style={styles.scoreStatLabel}>YOU</Text>
                  <Text style={styles.scoreStatValue}>{popScore != null ? popScore.toFixed(1) : '--'}</Text>
                </View>
                <View style={styles.scoreStat}>
                  <Text style={styles.scoreStatLabel}>MONTHLY</Text>
                  {monthlyDelta == null ? (
                    <Text style={styles.scoreStatValue}>--</Text>
                  ) : (
                    <Text style={[styles.scoreStatValue, { color: monthlyDelta >= 0 ? '#7DC87A' : '#C07A6A' }]}>
                      {monthlyDelta >= 0 ? '↑' : '↓'}{Math.abs(monthlyDelta).toFixed(1)}%
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('POPScoreInfo')} activeOpacity={0.7} style={{ marginTop: 12 }}>
                <Text style={styles.popInfoLink}>What is my POPScore?</Text>
              </TouchableOpacity>
            </View>

            {/* Featured Round */}
            {featuredRound && (() => {
              const r = featuredRound;
              const roundDate = new Date(r.created_at);
              const now = new Date();
              const sameMonth = now.getMonth() === roundDate.getMonth() && now.getFullYear() === roundDate.getFullYear();
              const sameYear  = now.getFullYear() === roundDate.getFullYear();
              const label = sameMonth ? 'Best POPScore this month'
                : sameYear ? 'Fastest round this year'
                : 'Best POPScore ever';
              const sc = r.pop_score;
              const badgeColor = sc >= 4.0 ? '#7DC87A' : sc >= 3.0 ? '#C9A84C' : '#C07A6A';
              const detailParts = [
                formatShortDate(r.created_at),
                r.holes ? `${r.holes}h` : null,
                r.transport,
                r.players ? `${r.players}p` : null,
                r.duration_minutes ? formatDuration(r.duration_minutes) : null,
              ].filter(Boolean);
              return (
                <View style={styles.featuredCard}>
                  <View style={styles.featuredLabelRow}>
                    <Ionicons name="flash" size={12} color="#C9A84C" style={{ marginRight: 4 }} />
                    <Text style={styles.featuredLabel}>{label.toUpperCase()}</Text>
                  </View>
                  <View style={styles.featuredBody}>
                    <View style={[styles.featuredBadge, { borderColor: badgeColor }]}>
                      <Text style={[styles.featuredBadgeScore, { color: badgeColor }]}>{sc.toFixed(1)}</Text>
                      <Text style={[styles.featuredBadgePop, { color: badgeColor }]}>POP</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                      <Text style={styles.featuredCourse} numberOfLines={1}>{r.course_name ?? '—'}</Text>
                      <Text style={styles.featuredDetail}>{detailParts.join(' · ')}</Text>
                    </View>
                    {r.caddy_logged && (
                      <View style={styles.featuredVerified}>
                        <Ionicons name="checkmark-circle" size={11} color="#7DC87A" />
                        <Text style={styles.featuredVerifiedText}>VERIFIED</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* No rounds empty state */}
            {!hasRounds && (
              <View style={styles.emptyCard}>
                <Ionicons name="golf" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
                <Text style={styles.emptyText}>Log your first round to get started</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
                  <Text style={styles.emptyBtnText}>LOG A ROUND</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Last Round ── */}
            {lastRound && (() => {
              const lr = lastRound;
              const sc = lr.pop_score;
              const badgeColor = sc == null ? '#B8A882' : sc >= 4.0 ? '#7DC87A' : sc >= 3.0 ? '#C9A84C' : '#C07A6A';
              const parts = [
                formatShortDate(lr.created_at),
                lr.holes ? `${lr.holes}h` : null,
                lr.transport,
                lr.duration_minutes ? formatDuration(lr.duration_minutes) : null,
              ].filter(Boolean);
              return (
                <TouchableOpacity
                  style={styles.lastRoundCard}
                  onPress={() => navigation.navigate('Profile')}
                  activeOpacity={0.85}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lastRoundLabel}>LAST ROUND</Text>
                      <Text style={styles.lastRoundCourse} numberOfLines={1}>{lr.course_name || '—'}</Text>
                      <Text style={styles.lastRoundDetail}>{parts.join(' · ')}</Text>
                    </View>
                    <View style={{ alignItems: 'center', marginLeft: 16 }}>
                      <Text style={[styles.lastRoundScore, { color: badgeColor }]}>
                        {sc != null ? sc.toFixed(1) : '—'}
                      </Text>
                      <Text style={styles.lastRoundScoreLabel}>POP</Text>
                      {lr.caddy_logged && (
                        <View style={styles.lastRoundVerified}>
                          <Ionicons name="checkmark-circle" size={10} color="#7DC87A" />
                          <Text style={styles.lastRoundVerifiedText}>VERIFIED</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })()}

            {/* ── Course of the Day ── */}
            {!loadingCourse && courseOfDay && (() => {
              const cotdPop = courseOfDay.pop_score && courseOfDay.pop_score > 0 ? courseOfDay.pop_score : 3.5;
              const cotdTier = cotdPop >= 4.0 ? 'Fast' : cotdPop >= 3.0 ? 'Average' : 'Slow';
              const cotdAvgTime = courseOfDay.avg_time
                ? `${Math.floor(courseOfDay.avg_time / 60)}h ${courseOfDay.avg_time % 60}m`
                : '--';
              return (
                <TouchableOpacity
                  style={styles.cotdCard}
                  onPress={() => navigation.navigate('CourseProfile', { course: courseOfDay })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cotdSectionLabel}>COURSE OF THE DAY</Text>

                  {/* Identity row */}
                  <View style={styles.cotdIdentityRow}>
                    <CourseAvatar courseName={courseOfDay.name} city={courseOfDay.city} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cotdName} numberOfLines={1}>{courseOfDay.name}</Text>
                      <Text style={styles.cotdLocation}>
                        {[courseOfDay.city, courseOfDay.state].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                  </View>

                  {/* POPScore accent row */}
                  <View style={styles.cotdPopRow}>
                    <Text style={styles.cotdPopNum}>{cotdPop.toFixed(1)}</Text>
                    <View>
                      <Text style={styles.cotdPopLabel}>COURSE POPSCORE</Text>
                      <Text style={styles.cotdPopRounds}>
                        Based on {courseOfDay.total_rounds || 0} round{courseOfDay.total_rounds !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Stats row */}
                  <View style={styles.cotdStatsRow}>
                    <View>
                      <Text style={styles.cotdStatLabel}>AVG TIME</Text>
                      <Text style={styles.cotdStatValue}>{cotdAvgTime}</Text>
                    </View>
                    <View>
                      <Text style={styles.cotdStatLabel}>ROUNDS</Text>
                      <Text style={styles.cotdStatValue}>{courseOfDay.total_rounds || 0}</Text>
                    </View>
                    <View>
                      <Text style={styles.cotdStatLabel}>TIER</Text>
                      <Text style={[styles.cotdStatValue, { color: '#7DC87A' }]}>{cotdTier}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })()}

            {/* ── Community Activity Preview ── */}
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('ActivityFeed')}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={[styles.cardLabel, { marginBottom: 0 }]}>ACTIVITY</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 1 }}>SEE ALL →</Text>
              </View>
              {recentActivity.length === 0 ? (
                <View style={styles.feedEmpty}>
                  <Text style={styles.feedEmptyText}>See what golfers are posting</Text>
                  <Text style={[styles.feedEmptyText, { marginTop: 4, opacity: 0.5 }]}>Tap to explore the community →</Text>
                </View>
              ) : (
                recentActivity.map((item) => {
                  const initials = (item.full_name || item.username || 'G')[0].toUpperCase();
                  const handle = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
                  const pop = item.content?.pop_score != null ? item.content.pop_score.toFixed(1) : null;
                  const course = item.content?.course_name || null;
                  const typeLabel = item.type === 'round_logged' ? 'logged a round'
                    : item.type === 'milestone' ? 'hit a milestone'
                    : item.type === 'post' ? 'posted'
                    : 'was active';
                  return (
                    <View key={item.id} style={[styles.friendRow, { marginBottom: 10 }]}>
                      <View style={[styles.friendAvatar, { width: 36, height: 36, borderRadius: 18 }]}>
                        <Text style={[styles.friendInitial, { fontSize: 15 }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[styles.friendText, { fontWeight: '700' }]}>{handle}</Text>
                          <Text style={[styles.feedTime, { fontSize: 11 }]}>{typeLabel}</Text>
                          {pop != null && (
                            <View style={{ backgroundColor: '#C9A84C22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#C9A84C' }}>{pop}</Text>
                            </View>
                          )}
                        </View>
                        {course && <Text style={[styles.feedTime, { marginTop: 1 }]} numberOfLines={1}>{course}</Text>}
                        <Text style={[styles.feedTime, { marginTop: 2 }]}>{timeAgo(item.created_at)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </TouchableOpacity>

            {/* ── Your Pace Trend ── */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>YOUR PACE TREND</Text>
              {paceTrend.length < 3 ? (
                <View style={styles.feedEmpty}>
                  <Text style={styles.feedEmptyText}>Log 3 rounds to see your trend.</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Log')} style={styles.feedEmptyBtn} activeOpacity={0.8}>
                    <Text style={styles.feedEmptyBtnText}>LOG A ROUND</Text>
                  </TouchableOpacity>
                </View>
              ) : (() => {
                const first = paceTrend[0].pop_score;
                const last  = paceTrend[paceTrend.length - 1].pop_score;
                const trendUp = last >= first;
                const color = trendUp ? '#7DC87A' : '#C07A6A';
                const avg = paceTrend.reduce((s, r) => s + (r.pop_score || 0), 0) / paceTrend.length;
                return (
                  <>
                    <TrendChart rounds={paceTrend} color={color} />
                    <Text style={[styles.trendLabel, { color }]}>
                      {trendUp ? '↑ Trending up' : '↓ Trending down'}
                    </Text>
                    <View style={styles.trendStats}>
                      <View style={styles.cotdStat}>
                        <Text style={styles.scoreStatLabel}>LAST ROUND</Text>
                        <Text style={styles.cotdStatValue}>{last.toFixed(1)}</Text>
                      </View>
                      <View style={styles.cotdStat}>
                        <Text style={styles.scoreStatLabel}>AVG LAST {paceTrend.length}</Text>
                        <Text style={styles.cotdStatValue}>{avg.toFixed(1)}</Text>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>

            {/* Pro Member Teaser — shown only after 5 rounds logged */}
            {totalRounds >= 5 ? (
              <ComingSoonCard />
            ) : (
              <View style={styles.proProgressCard}>
                <Text style={styles.proProgressEyebrow}>MORE COMING SOON</Text>
                <Text style={styles.proProgressBody}>
                  Log {5 - totalRounds} more round{5 - totalRounds !== 1 ? 's' : ''} to unlock upcoming features
                </Text>
                <View style={styles.proProgressTrack}>
                  <View style={[styles.proProgressFill, { width: `${(totalRounds / 5) * 100}%` }]} />
                </View>
                <Text style={styles.proProgressCount}>{totalRounds} of 5 rounds logged</Text>
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* FABs */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
          <Text style={styles.fabText}>+ LOG ROUND</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabLive} onPress={() => navigation.navigate('LiveRound')} activeOpacity={0.8}>
          <Text style={styles.fabLiveText}>▶ LIVE ROUND</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { padding: 22, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#7DC87A22', flexDirection: 'row', alignItems: 'center' },
  headerAvatar:     { marginLeft: 12, paddingTop: 4 },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 4 },
  greeting:         { fontSize: 20, fontFamily: 'Georgia', color: '#F5EDD8' },
  subGreeting:      { fontSize: 11, fontWeight: '600', color: '#7DC87A', marginTop: 3 },
  scoreCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  scoreInfoBtn:     { position: 'absolute', top: 12, right: 12, padding: 4, zIndex: 1 },
  popInfoLink:      { fontSize: 12, color: '#C9A84C', textAlign: 'center', textDecorationLine: 'underline' },
  scoreRow:         { flexDirection: 'row', gap: 32, marginTop: 12 },
  scoreStat:        { alignItems: 'center' },
  scoreStatLabel:   { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 4 },
  scoreStatValue:   { fontSize: 18, fontWeight: '400', color: '#B8A882' },
  card:             { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#7DC87A22' },
  insight:          { fontSize: 11, fontWeight: '600', color: '#7DC87A', marginBottom: 4 },
  courseName:       { fontSize: 19, fontWeight: '600', color: '#F5EDD8' },
  roundDetail:      { fontSize: 11, color: '#B8A882', marginTop: 3 },
  row:              { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  popBadge:         { fontFamily: 'monospace', fontSize: 13, color: '#7DC87A', borderWidth: 1, borderColor: '#7DC87A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  verified:         { fontSize: 9, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
  cardLabel:        { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 8 },
  standingText:     { fontSize: 18, fontWeight: '500', color: '#F5EDD8' },
  // Last Round
  lastRoundCard:         { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#7DC87A22' },
  lastRoundLabel:        { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 6 },
  lastRoundCourse:       { fontSize: 18, fontWeight: '600', color: '#F5EDD8', marginBottom: 4 },
  lastRoundDetail:       { fontSize: 11, color: '#B8A882' },
  lastRoundScore:        { fontSize: 32, fontFamily: 'Georgia', lineHeight: 36 },
  lastRoundScoreLabel:   { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginTop: 1 },
  lastRoundVerified:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  lastRoundVerifiedText: { fontSize: 7, fontWeight: '700', color: '#7DC87A', letterSpacing: 1 },
  // Featured Round
  featuredCard:         { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#7DC87A22' },
  featuredLabelRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  featuredLabel:        { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  featuredBody:         { flexDirection: 'row', alignItems: 'center' },
  featuredBadge:        { width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  featuredBadgeScore:   { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  featuredBadgePop:     { fontSize: 7, fontWeight: '700', letterSpacing: 1 },
  featuredCourse:       { fontSize: 15, fontWeight: '600', color: '#F5EDD8', marginBottom: 4 },
  featuredDetail:       { fontSize: 11, color: '#B8A882' },
  featuredVerified:     { flexDirection: 'column', alignItems: 'center', gap: 2 },
  featuredVerifiedText: { fontSize: 7, fontWeight: '700', color: '#7DC87A', letterSpacing: 1 },
  // Error
  errorCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 28, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  errorText:        { fontSize: 14, color: '#7A6E58', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  retryBtn:         { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryText:        { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  // Empty
  emptyCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 36, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  emptyText:        { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', marginBottom: 20, lineHeight: 28 },
  emptyBtn:         { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  emptyBtnText:     { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  feedTime:        { fontSize: 10, color: '#7A6E58', marginTop: 3 },
  feedEmpty:       { paddingVertical: 16, alignItems: 'center', gap: 12 },
  feedEmptyText:   { fontSize: 13, color: '#7A6E58', textAlign: 'center', lineHeight: 19 },
  feedEmptyBtn:    { backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  feedEmptyBtnText:{ fontSize: 10, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  // friends activity
  friendRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#7DC87A0A' },
  friendAvatar:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  friendInitial:    { fontSize: 13, fontWeight: '600', color: '#C9A84C' },
  friendText:       { fontSize: 13, color: '#F5EDD8' },
  // course of the day
  cotdCard:         { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#7DC87A22' },
  cotdSectionLabel: { fontSize: 9, letterSpacing: 1, color: '#B8A882', fontWeight: '700', marginBottom: 8 },
  cotdIdentityRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
cotdName:         { fontSize: 13, fontWeight: '600', color: '#F5EDD8', lineHeight: 18 },
  cotdLocation:     { fontSize: 10, color: '#B8A882', marginTop: 2 },
  cotdPopRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: '#162B19', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#7DC87A', marginBottom: 10 },
  cotdPopNum:       { fontSize: 22, fontWeight: '700', color: '#F5EDD8', fontFamily: 'Georgia' },
  cotdPopLabel:     { fontSize: 8, letterSpacing: 1, color: '#7DC87A', fontWeight: '600' },
  cotdPopRounds:    { fontSize: 9, color: '#B8A882', marginTop: 1 },
  cotdStatsRow:     { flexDirection: 'row', gap: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)' },
  cotdStatLabel:    { fontSize: 8, color: '#B8A882', letterSpacing: 1 },
  cotdStatValue:    { fontSize: 11, color: '#F5EDD8', marginTop: 2 },
  // pace trend
  trendLabel:       { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 4 },
  trendStats:       { flexDirection: 'row', gap: 24, marginTop: 10 },
  // GPS Tease
  // Pro
  proProgressCard:       { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(125,200,122,0.2)' },
  proProgressEyebrow:    { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#B8A882', marginBottom: 6 },
  proProgressBody:       { fontSize: 14, color: '#F5EDD8', marginBottom: 10, lineHeight: 20 },
  proProgressTrack:      { backgroundColor: '#162B19', borderRadius: 6, height: 6, overflow: 'hidden' },
  proProgressFill:       { backgroundColor: '#C9A84C', height: 6, borderRadius: 6 },
  proProgressCount:      { fontSize: 11, color: '#B8A882', marginTop: 6 },
  proCard:          { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#1A2E1C', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(125,200,122,0.25)' },
  proBadge:         { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 10 },
  proBadgeText:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  proFeatureRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  proFeature:       { width: '47%', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(125,200,122,0.1)' },
  proFeatureGold:   { borderColor: 'rgba(201,168,76,0.45)', backgroundColor: 'rgba(201,168,76,0.07)' },
  proFeatureTitle:  { fontSize: 11, fontWeight: '600', color: '#B8A882', marginBottom: 2 },
  proFeatureSub:    { fontSize: 10, color: '#7A6E58' },
  proComingSoonBadge: { alignSelf: 'flex-end', borderWidth: 1, borderColor: '#C9A84C', backgroundColor: 'transparent', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginBottom: 8 },
  proComingSoonText:  { fontSize: 7, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  fabRow: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    flexDirection: 'row', gap: 10,
  },
  fab: {
    flex: 1, paddingVertical: 14, borderRadius: 50, backgroundColor: '#1E4825',
    borderWidth: 1, borderColor: '#C9A84C66', alignItems: 'center',
    shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  fabText:     { fontSize: 12, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  fabLive: {
    flex: 1, paddingVertical: 14, borderRadius: 50, backgroundColor: '#1B3D25',
    borderWidth: 1.5, borderColor: '#7DC87A88', alignItems: 'center',
    shadowColor: '#7DC87A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  fabLiveText: { fontSize: 12, fontWeight: '700', color: '#7DC87A', letterSpacing: 2 },
});

// ─── Caddy Home Screen ────────────────────────────────────────────────────────

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

function ratingColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function CaddyHomeScreen({ navigation }) {
  const { profile, user, refreshProfile } = useAuth();
  const [rounds, setRounds]             = useState([]);
  const [courseRank, setCourseRank]     = useState(null);
  const [nationalRank, setNationalRank] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError(false);
    try {
      const uid = user?.id;
      if (!uid) { setLoading(false); return; }

      const { data: roundsData } = await supabase
        .from('rounds')
        .select('course_name, tee_time, duration_minutes, caddy_rating, players, created_at')
        .eq('caddy_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);
      setRounds(roundsData || []);

      if (profile?.caddy_course && profile?.caddy_rating != null) {
        const [courseRes, natRes] = await Promise.all([
          supabase.from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('account_type', 'caddy')
            .eq('caddy_course', profile.caddy_course)
            .gt('caddy_rating', profile.caddy_rating),
          supabase.from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('account_type', 'caddy')
            .gt('caddy_rating', profile.caddy_rating),
        ]);
        setCourseRank((courseRes.count ?? 0) + 1);
        setNationalRank((natRes.count ?? 0) + 1);
      }
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { refreshProfile(); fetchAll(); }, []));

  const totalRounds     = rounds.length;
  const avgPaceMinutes  = totalRounds > 0
    ? Math.round(rounds.reduce((s, r) => s + (r.duration_minutes || 0), 0) / totalRounds)
    : null;
  const avgPaceStr      = formatDuration(avgPaceMinutes);

  const windows = { morning: [], midday: [], afternoon: [] };
  for (const r of rounds) {
    const w = teeWindowLabel(r.tee_time);
    if (w && r.caddy_rating != null) windows[w].push(r.caddy_rating);
  }
  let bestWindow = null, bestAvg = -1;
  for (const [w, ratings] of Object.entries(windows)) {
    if (!ratings.length) continue;
    const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
    if (avg > bestAvg) { bestAvg = avg; bestWindow = w; }
  }
  const bestWindowStr = bestWindow ? bestWindow.charAt(0).toUpperCase() + bestWindow.slice(1) : '—';
  const caddyRating   = (profile?.caddy_rating && profile.caddy_rating > 0) ? profile.caddy_rating : null;
  const caddyCourse   = profile?.caddy_course ?? '';

  if (error) {
    return (
      <View style={cs.container}>
        <View style={cs.header}>
          <Text style={cs.wordmark}>PLAYTHRU</Text>
        </View>
        <View style={cs.errorCard}>
          <Ionicons name="cloud-offline-outline" size={32} color="rgba(201,168,76,0.3)" style={{ marginBottom: 12 }} />
          <Text style={cs.errorText}>Could not load your data. Check your connection.</Text>
          <TouchableOpacity style={cs.retryBtn} onPress={fetchAll} activeOpacity={0.8}>
            <Text style={cs.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={cs.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }}>

        {/* Header */}
        <View style={cs.header}>
          <Text style={cs.wordmark}>PLAYTHRU</Text>
          {loading
            ? <SkeletonLoader width={180} height={20} style={{ marginTop: 6 }} />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text style={cs.name}>{profile?.full_name ?? ''}</Text>
                <View style={cs.caddyBadge}>
                  <Text style={cs.caddyBadgeText}>CADDY</Text>
                </View>
              </View>
            )
          }
          {!loading && caddyCourse ? <Text style={cs.courseSub}>{caddyCourse}</Text> : null}
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', padding: 32 }}>
            <SkeletonLoader width={220} height={220} style={{ borderRadius: 110, marginBottom: 20 }} />
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {[0,1,2].map(i => <SkeletonLoader key={i} width={100} height={80} style={{ borderRadius: 14 }} />)}
            </View>
            <SkeletonLoader width="90%" height={100} style={{ borderRadius: 18, marginBottom: 10 }} />
            <SkeletonLoader width="90%" height={200} style={{ borderRadius: 18 }} />
          </View>
        ) : (
          <>
            {/* Caddy Rating Gauge */}
            <View style={cs.gaugeCard}>
              {caddyRating != null ? (
                <>
                  <Gauge score={caddyRating} />
                  <Text style={cs.gaugeLabel}>CADDY RATING</Text>
                </>
              ) : (
                <>
                  <Text style={cs.gaugeLabel}>CADDY RATING</Text>
                  <Text style={cs.unratedText}>Unrated</Text>
                  <Text style={cs.unratedSub}>Log rounds to earn your first rating</Text>
                </>
              )}
            </View>

            {/* Stats row */}
            <View style={cs.statsRow}>
              <View style={cs.statCard}>
                <Text style={cs.statLabel}>ROUNDS{'\n'}LOOPED</Text>
                <Text style={cs.statValue}>{totalRounds}</Text>
              </View>
              <View style={cs.statCard}>
                <Text style={cs.statLabel}>AVG{'\n'}PACE</Text>
                <Text style={[cs.statValue, { fontSize: 15 }]}>{avgPaceStr}</Text>
              </View>
              <View style={cs.statCard}>
                <Text style={cs.statLabel}>BEST{'\n'}WINDOW</Text>
                <Text style={[cs.statValue, { fontSize: 15 }]}>{bestWindowStr}</Text>
              </View>
            </View>

            {/* Ranking card */}
            <View style={cs.card}>
              <Text style={cs.cardLabel}>YOUR CADDY RANKING</Text>
              <View style={cs.rankRow}>
                <View style={cs.rankItem}>
                  <Text style={cs.rankNum}>{courseRank != null ? `#${courseRank}` : '—'}</Text>
                  <Text style={cs.rankSub}>
                    AT {caddyCourse ? caddyCourse.toUpperCase() : 'HOME COURSE'}
                  </Text>
                </View>
                <View style={cs.rankDivider} />
                <View style={cs.rankItem}>
                  <Text style={cs.rankNum}>{nationalRank != null ? `#${nationalRank}` : '—'}</Text>
                  <Text style={cs.rankSub}>NATIONAL</Text>
                </View>
              </View>
            </View>

            {/* Recent rounds */}
            {rounds.length > 0 ? (
              <View style={cs.card}>
                <Text style={cs.cardLabel}>RECENT ROUNDS LOOPED</Text>
                {rounds.slice(0, 5).map((r, i) => (
                  <View key={i} style={[cs.roundRow, i < Math.min(rounds.length, 5) - 1 && cs.roundRowBorder]}>
                    <CourseAvatar courseName={r.course_name} size={32} />
                    <View style={cs.roundInfo}>
                      <Text style={cs.roundCourse}>{r.course_name}</Text>
                      <Text style={cs.roundMeta}>
                        {formatShortDate(r.created_at)} · {r.players}P · {formatDuration(r.duration_minutes)}
                      </Text>
                    </View>
                    <Text style={[cs.roundRating, { color: ratingColor(r.caddy_rating ?? 0) }]}>
                      {r.caddy_rating != null ? r.caddy_rating.toFixed(1) : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={cs.emptyCard}>
                <Ionicons name="person" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
                <Text style={cs.emptyText}>No rounds logged yet.</Text>
                <TouchableOpacity style={cs.emptyBtn} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
                  <Text style={cs.emptyBtnText}>LOG YOUR FIRST ROUND</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* FABs */}
      <View style={cs.fabRow}>
        <TouchableOpacity style={cs.fab} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
          <Text style={cs.fabText}>+ LOG ROUND</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cs.fabLive} onPress={() => navigation.navigate('LiveRound')} activeOpacity={0.8}>
          <Text style={cs.fabLiveText}>▶ LIVE ROUND</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#090F0A' },
  header:         { padding: 22, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  wordmark:       { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 2 },
  name:           { fontSize: 22, fontWeight: '600', color: '#F5EDD8' },
  caddyBadge:     { backgroundColor: '#C9A84C', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  caddyBadgeText: { fontSize: 8, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  courseSub:      { fontSize: 11, color: '#B8A882', marginTop: 3 },
  gaugeCard:      { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  gaugeLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginTop: 10 },
  unratedText:    { fontSize: 28, fontWeight: '300', color: '#B8A88266', marginTop: 12, marginBottom: 4 },
  unratedSub:     { fontSize: 11, color: '#7A6E58', textAlign: 'center' },
  statsRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  statCard:       { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, alignItems: 'center' },
  statLabel:      { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5, textAlign: 'center', marginBottom: 8 },
  statValue:      { fontSize: 18, fontWeight: '300', color: '#F5EDD8', textAlign: 'center' },
  card:           { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#7DC87A22' },
  cardLabel:      { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 12 },
  rankRow:        { flexDirection: 'row', alignItems: 'center' },
  rankItem:       { flex: 1, alignItems: 'center' },
  rankNum:        { fontSize: 36, fontWeight: '300', color: '#F5EDD8', marginBottom: 4 },
  rankSub:        { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1.5, textAlign: 'center' },
  rankDivider:    { width: 1, height: 50, backgroundColor: '#7DC87A22' },
  roundRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  roundRowBorder: { borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  roundInfo:      { flex: 1 },
  roundCourse:    { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  roundMeta:      { fontSize: 11, color: '#B8A882', marginTop: 2 },
  roundRating:    { fontSize: 26, fontWeight: '300' },
  emptyCard:      { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 36, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  emptyText:      { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', marginBottom: 20, lineHeight: 28 },
  emptyBtn:       { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  emptyBtnText:   { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  errorCard:      { margin: 16, marginTop: 32, backgroundColor: '#0D1A0F', borderRadius: 18, padding: 28, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  errorText:      { fontSize: 14, color: '#7A6E58', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  retryBtn:       { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryText:      { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  fabRow: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    flexDirection: 'row', gap: 10,
  },
  fab: {
    flex: 1, paddingVertical: 14, borderRadius: 50, backgroundColor: '#1E4825',
    borderWidth: 1, borderColor: '#C9A84C66', alignItems: 'center',
    shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  fabText:     { fontSize: 12, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  fabLive: {
    flex: 1, paddingVertical: 14, borderRadius: 50, backgroundColor: '#1B3D25',
    borderWidth: 1.5, borderColor: '#7DC87A88', alignItems: 'center',
    shadowColor: '#7DC87A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  fabLiveText: { fontSize: 12, fontWeight: '700', color: '#7DC87A', letterSpacing: 2 },
});

// ─── Router ───────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { profile } = useAuth() ?? {};
  if (profile?.account_type === 'caddy') return <CaddyHomeScreen navigation={navigation} />;
  return <PlayerHomeScreen navigation={navigation} />;
}
