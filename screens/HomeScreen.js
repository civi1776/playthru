import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Gauge from '../components/guage';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import ChallengeButton from '../components/ChallengeButton';
import InitialsAvatar from '../components/InitialsAvatar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { scheduleWeeklyDigest } from '../lib/notifications';
import { ROUND_STATE_KEY, ROUND_STALENESS_MS } from '../lib/roundConstants';


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
  const [myScoreMap,     setMyScoreMap]     = useState({});
  const [featuredRound, setFeaturedRound] = useState(null);
  const [lastRound, setLastRound]         = useState(null);
  const [monthlyDelta, setMonthlyDelta]   = useState(undefined);
  const [totalRounds, setTotalRounds]     = useState(0);
  const [savedRound, setSavedRound]       = useState(null);
  const [unreadCount, setUnreadCount]     = useState(0);

  // Fetch Course of the Day — server picks a shared course daily via RPC;
  // client caches by date so the DB is hit at most once per day per device.
  useEffect(() => {
    (async () => {
      try {
        const cached     = await AsyncStorage.getItem('course_of_day');
        const cachedDate = await AsyncStorage.getItem('course_of_day_date');
        const today      = new Date().toISOString().slice(0, 10);

        if (cached && cachedDate === today) {
          setCourseOfDay(JSON.parse(cached));
          setLoadingCourse(false);
          return;
        }

        const { data: cotd } = await supabase.rpc('get_or_set_course_of_the_day');
        if (cotd && cotd.length > 0) {
          const { data: courseData } = await supabase
            .from('courses')
            .select('*')
            .eq('id', cotd[0].course_id)
            .maybeSingle();
          if (courseData) {
            await AsyncStorage.setItem('course_of_day', JSON.stringify(courseData));
            await AsyncStorage.setItem('course_of_day_date', today);
          }
          setCourseOfDay(courseData ?? null);
        }
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

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('rounds').select('course_name, pop_score')
      .eq('user_id', user.id).not('pop_score', 'is', null)
      .order('pop_score', { ascending: false }).limit(100)
      .then(({ data }) => {
        const map = {};
        for (const r of data ?? []) {
          if (r.course_name && map[r.course_name] == null) map[r.course_name] = r.pop_score;
        }
        setMyScoreMap(map);
      });
  }, [user?.id]);

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
        .select('id, course_name, pop_score, holes, transport, players, duration_minutes, created_at')
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

      // Unread notification count for bell badge
      if (uid) {
        const { count: nc } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('read', false);
        setUnreadCount(nc ?? 0);
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

  const handleDiscard = () => {
    Alert.alert(
      'Discard round?',
      'Your in-progress round will be permanently discarded.',
      [
        { text: 'Keep Round', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {});
            setSavedRound(null);
          },
        },
      ],
    );
  };

  useFocusEffect(useCallback(() => {
    refreshProfile();
    fetchAll();
    // Check for a saved live round — same 12-hour staleness threshold as LiveRoundScreen rehydration
    AsyncStorage.getItem(ROUND_STATE_KEY).then(raw => {
      if (!raw) { setSavedRound(null); return; }
      try {
        const saved = JSON.parse(raw);
        if (!saved?.startTs || !saved?.course) { setSavedRound(null); return; }
        if (Date.now() - saved.startTs > ROUND_STALENESS_MS) {
          AsyncStorage.removeItem(ROUND_STATE_KEY).catch(() => {});
          setSavedRound(null);
          return;
        }
        setSavedRound({ courseName: saved.course.name, currentHole: saved.currentHole ?? 1 });
      } catch {
        setSavedRound(null);
      }
    }).catch(() => {});
  }, []));

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
            <Text style={styles.wordmark}>CLOCKED</Text>
            <Text style={styles.brandTagline}>ON THE CLOCK</Text>
            {!loading && !error && (
              <Text style={styles.greeting}>{getGreeting()}, {firstName}.</Text>
            )}
            {loading && <SkeletonLoader width={180} height={14} style={{ marginTop: 8 }} />}
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            activeOpacity={0.8}
            style={styles.headerBell}
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            accessibilityRole="button"
          >
            <Ionicons name="notifications-outline" size={22} color="#B8A882" />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.8}
            style={styles.headerAvatar}
            accessibilityLabel="View your profile"
            accessibilityRole="button"
          >
            <InitialsAvatar name={profile?.full_name} size={38} avatarUrl={profile?.avatar_url} />
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
                accessibilityLabel="About Clocked Score"
                accessibilityRole="button"
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
                <View style={styles.scoreStat} accessible={true} accessibilityLabel={`National average 3.9`}>
                  <Text style={styles.scoreStatLabel}>NAT'L AVG</Text>
                  <Text style={styles.scoreStatValue} accessibilityRole="text">3.9</Text>
                </View>
                <View style={styles.scoreStat} accessible={true} accessibilityLabel={`Your Clocked Score ${popScore != null ? popScore.toFixed(1) : 'not yet earned'}`}>
                  <Text style={styles.scoreStatLabel}>YOU</Text>
                  <Text style={styles.scoreStatValue} accessibilityRole="text">{popScore != null ? popScore.toFixed(1) : '--'}</Text>
                </View>
                <View style={styles.scoreStat} accessible={true} accessibilityLabel={`Monthly change ${monthlyDelta == null ? 'not available' : `${monthlyDelta >= 0 ? 'up' : 'down'} ${Math.abs(monthlyDelta).toFixed(1)} percent`}`}>
                  <Text style={styles.scoreStatLabel}>MONTHLY</Text>
                  {monthlyDelta == null ? (
                    <Text style={styles.scoreStatValue} accessibilityRole="text">--</Text>
                  ) : (
                    <Text style={[styles.scoreStatValue, { color: monthlyDelta >= 0 ? '#7DC87A' : '#C07A6A' }]} accessibilityRole="text">
                      {monthlyDelta >= 0 ? '↑' : '↓'}{Math.abs(monthlyDelta).toFixed(1)}%
                    </Text>
                  )}
                </View>
              </View>
              {profile?.handicap_index != null && (
                <View style={styles.hcpRow}>
                  <Text style={styles.hcpLabel}>HANDICAP INDEX</Text>
                  <Text style={styles.hcpValue}>{profile.handicap_index.toFixed(1)}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => navigation.navigate('POPScoreInfo')} activeOpacity={0.7} style={{ marginTop: 12 }}>
                <Text style={styles.popInfoLink}>What is my Clocked Score?</Text>
              </TouchableOpacity>
            </View>

            {/* Featured Round */}
            {featuredRound && (() => {
              const r = featuredRound;
              const roundDate = new Date(r.created_at);
              const now = new Date();
              const sameMonth = now.getMonth() === roundDate.getMonth() && now.getFullYear() === roundDate.getFullYear();
              const sameYear  = now.getFullYear() === roundDate.getFullYear();
              const label = sameMonth ? 'Best Clocked Score this month'
                : sameYear ? 'Fastest round this year'
                : 'Best Clocked Score ever';
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
                      <Text style={[styles.featuredBadgePop, { color: badgeColor }]}>CLK</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                      <Text style={styles.featuredCourse} numberOfLines={1}>{r.course_name ?? '—'}</Text>
                      <Text style={styles.featuredDetail}>{detailParts.join(' · ')}</Text>
                    </View>
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
                      <Text style={styles.lastRoundScoreLabel}>CLK</Text>
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
                      <Text style={styles.cotdPopLabel}>COURSE CLOCKED SCORE</Text>
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
                <Text style={[styles.cardLabel, { marginBottom: 0, color: '#7A6E58' }]}>ACTIVITY</Text>
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
                  const handle   = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
                  const popRaw   = item.content?.pop_score != null ? parseFloat(item.content.pop_score) : null;
                  const pop      = popRaw != null ? popRaw.toFixed(1) : null;
                  const course   = item.content?.course_name || null;
                  const isLive   = item.type === 'live_round_started';
                  const isMilestone = item.type === 'milestone';
                  const holesDetail     = item.content?.holes;
                  const transportDetail = item.content?.transport;
                  const milestoneTitle  = item.content?.title ?? null;

                  const leftBorderColor = popRaw == null
                    ? '#2A3B2C'
                    : popRaw >= 4.0 ? '#7DC87A'
                    : popRaw >= 3.0 ? '#C9A84C'
                    : '#8B4040';

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.feedCard,
                        { borderLeftColor: leftBorderColor },
                        isLive && { borderLeftColor: '#7DC87A' },
                      ]}
                    >
                      {/* Avatar */}
                      <View style={{ position: 'relative' }}>
                        <View style={styles.friendAvatar}>
                          <Text style={styles.friendInitial}>{initials}</Text>
                        </View>
                        {isLive && (
                          <View style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#7DC87A', borderWidth: 1.5, borderColor: '#0D1A0F' }} />
                        )}
                      </View>

                      {/* Content */}
                      <View style={{ flex: 1 }}>
                        {isMilestone ? (
                          /* ── Milestone card ── */
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <Ionicons name="star" size={14} color="#C9A84C" />
                              <Text style={styles.feedHandle}>{handle}</Text>
                            </View>
                            {milestoneTitle ? (
                              <Text style={styles.feedMilestoneTitle}>{milestoneTitle}</Text>
                            ) : (
                              <Text style={styles.feedMuted}>hit a milestone</Text>
                            )}
                            <Text style={[styles.feedMuted, { marginTop: 4 }]}>{timeAgo(item.created_at)}</Text>
                          </>
                        ) : (
                          /* ── Round / live card ── */
                          <>
                            {/* Row 1: handle + action */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                              <Text style={styles.feedHandle}>{handle}</Text>
                              <Text style={styles.feedMuted}>
                                {isLive ? 'is playing live' : 'logged a round'}
                              </Text>
                            </View>

                            {/* Row 2: course name */}
                            {course != null && (
                              <Text style={styles.feedCourse} numberOfLines={1}>{course}</Text>
                            )}
                            {isLive && (holesDetail || transportDetail) && (
                              <Text style={styles.feedMuted}>{[holesDetail && `${holesDetail} holes`, transportDetail].filter(Boolean).join(' · ')}</Text>
                            )}

                            {/* CLK score badge */}
                            {pop != null && (
                              <View style={styles.feedScoreBadge}>
                                <Text style={styles.feedScoreLabel}>CLK</Text>
                                <Text style={styles.feedScoreValue}>{pop}</Text>
                              </View>
                            )}

                            {/* Bottom row: timestamp + challenge */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                              <Text style={styles.feedTime}>{timeAgo(item.created_at)}</Text>
                              {item.type === 'round_logged' && (
                                <ChallengeButton
                                  targetUserId={item.user_id}
                                  targetUsername={item.username ?? item.full_name?.split(' ')[0] ?? 'player'}
                                  courseName={course}
                                  challengerScore={myScoreMap[course] ?? null}
                                  variant="inline"
                                />
                              )}
                            </View>
                          </>
                        )}
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

            {/* Invite Friends card */}
            <TouchableOpacity
              style={styles.inviteCard}
              onPress={() => navigation.navigate('SearchUsers')}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={22} color="#C9A84C" style={{ marginBottom: 8 }} />
              <Text style={styles.inviteTitle}>Invite Friends to Clocked</Text>
              <Text style={styles.inviteSub}>See how your pace compares to your crew. Find golfers you know.</Text>
            </TouchableOpacity>
          </>
        )}

      </ScrollView>

      {/* FABs */}
      <View style={styles.fabRow}>
        <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Log')} activeOpacity={0.8}>
          <Text style={styles.fabText}>+ LOG PACE ROUND</Text>
        </TouchableOpacity>
        {savedRound ? (
          <View style={[styles.fabLive, styles.fabLiveResume]}>
            <TouchableOpacity
              style={{ flex: 1, alignItems: 'center' }}
              onPress={() => navigation.navigate('LiveRound')}
              activeOpacity={0.8}
            >
              <Text style={styles.fabLiveText}>▶ RESUME</Text>
              <Text style={styles.fabResumeSub}>{savedRound.courseName} · Hole {savedRound.currentHole}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDiscard} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 0 }}>
              <Ionicons name="close-outline" size={18} color="#7DC87A" style={{ opacity: 0.6, paddingLeft: 12 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.fabLive} onPress={() => navigation.navigate('LiveRound')} activeOpacity={0.8}>
            <Text style={styles.fabLiveText}>▶ LIVE ROUND</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { padding: 22, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#7DC87A22', flexDirection: 'row', alignItems: 'center' },
  headerBell:       { position: 'relative', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  bellBadge:        { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText:    { fontSize: 9, fontWeight: '700', color: '#090F0A' },
  headerAvatar:     { marginLeft: 4, paddingTop: 4 },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 2 },
  brandTagline:     { fontSize: 9, fontWeight: '600', color: '#C9A84C88', letterSpacing: 3, marginBottom: 6 },
  greeting:         { fontSize: 20, fontFamily: 'Georgia', color: '#F5EDD8' },
  subGreeting:      { fontSize: 11, fontWeight: '600', color: '#7DC87A', marginTop: 3 },
  scoreCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center' },
  scoreInfoBtn:     { position: 'absolute', top: 6, right: 6, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  hcpRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  hcpLabel:         { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  hcpValue:         { fontSize: 14, fontWeight: '600', color: '#C9A84C' },
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
  feedTime:        { fontSize: 10, color: 'rgba(184,168,130,0.6)', marginTop: 3 },
  feedEmpty:       { paddingVertical: 16, alignItems: 'center', gap: 12 },
  feedEmptyText:   { fontSize: 13, color: '#7A6E58', textAlign: 'center', lineHeight: 19 },
  feedEmptyBtn:    { backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  feedEmptyBtnText:{ fontSize: 10, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  // friends activity feed cards
  feedCard:             { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#7DC87A0A', borderLeftWidth: 3, paddingLeft: 12, marginLeft: -12 },
  friendAvatar:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  friendInitial:        { fontSize: 14, fontWeight: '600', color: '#C9A84C' },
  feedHandle:           { fontSize: 15, fontWeight: '700', color: '#F5EDD8' },
  feedMuted:            { fontSize: 13, color: '#B8A882' },
  feedCourse:           { fontSize: 13, color: '#B8A882', marginBottom: 6 },
  feedScoreBadge:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C55', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2 },
  feedScoreLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  feedScoreValue:       { fontSize: 16, fontWeight: '700', color: '#C9A84C' },
  feedMilestoneTitle:   { fontSize: 15, fontWeight: '600', color: '#F5EDD8', lineHeight: 22 },
  // invite card
  inviteCard:      { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#C9A84C22', alignItems: 'center' },
  inviteTitle:     { fontSize: 14, fontWeight: '700', color: '#F5EDD8', marginBottom: 6, textAlign: 'center' },
  inviteSub:       { fontSize: 12, color: '#7A6E58', textAlign: 'center', lineHeight: 18 },
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
  fabLiveText:   { fontSize: 12, fontWeight: '700', color: '#7DC87A', letterSpacing: 2 },
  fabLiveResume: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  fabResumeSub:  { fontSize: 9, fontWeight: '600', color: '#7DC87A', opacity: 0.75, letterSpacing: 0.5, marginTop: 2 },
});

export default function HomeScreen({ navigation }) {
  return <PlayerHomeScreen navigation={navigation} />;
}
