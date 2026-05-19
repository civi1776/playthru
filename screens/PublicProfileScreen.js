import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification } from '../lib/notifications';
import Gauge from '../components/guage';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paceTier(score) {
  if (score == null) return null;
  if (score >= 5.0) return 'Elite Pacer';
  if (score >= 4.0) return 'Fast Golfer';
  if (score >= 3.0) return 'Average Pace';
  if (score >= 2.0) return 'Slow Player';
  return 'Pace Improvement Needed';
}

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

function formatShortDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PublicProfileScreen({ navigation, route }) {
  const { userId } = route.params;
  const { user, profile: myProfile, signOut } = useAuth();
  const myUid = user?.id;

  const [profile, setProfile]         = useState(null);
  const [rounds, setRounds]           = useState([]);
  const [caddyRounds, setCaddyRounds] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [following, setFollowing]     = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: profileData }, { data: roundsData }, { data: followData }, { data: caddyRoundsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('rounds')
          .select('course_name, created_at, holes, duration_minutes, pop_score')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(3),
        myUid
          ? supabase.from('follows').select('id').eq('follower_id', myUid).eq('following_id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
        // Fetch rounds where this user was the caddy (to derive "Also caddied at")
        supabase.from('rounds')
          .select('course_name')
          .eq('caddy_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setProfile(profileData);
      setRounds(roundsData ?? []);
      setCaddyRounds(caddyRoundsData ?? []);
      setFollowing(!!followData);
      setLoading(false);
    };
    load();
  }, [userId, myUid]);

  const toggleFollow = async () => {
    if (!myUid || followLoading) return;
    setFollowLoading(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing); // optimistic update

    if (wasFollowing) {
      const { error } = await supabase.from('follows').delete()
        .eq('follower_id', myUid).eq('following_id', userId);
      if (error) setFollowing(true); // revert
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id:  myUid,
        following_id: userId,
      });
      if (error) { setFollowing(false); } // revert
      else {
        // Notify the followed user
        const { data: followedProfile } = await supabase
          .from('profiles').select('push_token').eq('id', userId).single();
        if (followedProfile?.push_token) {
          const senderName = myProfile?.username ? `@${myProfile.username}` : 'Someone';
          await sendLocalNotification('New Follower', `${senderName} is now following you on PlayThru.`);
        }
      }
    }
    setFollowLoading(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#C9A84C" />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#7A6E58', fontSize: 16 }}>Profile not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pop      = profile.pop_score ?? null;
  const tier     = paceTier(pop);
  const isCaddy  = profile.account_type === 'caddy';
  const initials = getInitials(profile.full_name);

  // Caddy-specific computed values
  const primaryCourse = profile.caddy_course || null;
  const alsoCaddiedAt = isCaddy
    ? [...new Set(caddyRounds.map(r => r.course_name).filter(Boolean))]
        .filter(name => name !== primaryCourse)
        .slice(0, 5)
    : [];

  // Stat card values from rounds
  const bestPop  = rounds.length > 0
    ? Math.max(...rounds.map(r => r.pop_score ?? 0))
    : null;
  const avgTime  = rounds.length > 0
    ? Math.round(rounds.reduce((s, r) => s + (r.duration_minutes || 0), 0) / rounds.length)
    : null;

  const isOwnProfile = myUid === userId;

  return (
    <SafeAreaView style={s.container}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color="#C9A84C" />
          <Text style={s.backText}>BACK</Text>
        </TouchableOpacity>

        {!isOwnProfile && (
          <TouchableOpacity
            style={[s.followBtn, following && s.followingBtn]}
            onPress={toggleFollow}
            activeOpacity={0.7}
            disabled={followLoading}
          >
            {following
              ? <Ionicons name="checkmark" size={13} color="#7DC87A" style={{ marginRight: 4 }} />
              : null}
            <Text style={[s.followBtnText, following && s.followingBtnText]}>
              {following ? 'FOLLOWING' : 'FOLLOW'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar + identity */}
        <View style={s.identityRow}>
          <InitialsAvatar name={profile.full_name} size={60} />
          <View style={s.identityInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={s.fullName}>{profile.full_name || '—'}</Text>
              {isCaddy && (
                <View style={s.caddyBadge}>
                  <Text style={s.caddyBadgeText}>CADDY</Text>
                </View>
              )}
            </View>
            <Text style={s.username}>@{profile.username || '—'}</Text>
            {!isCaddy && profile.home_course ? (
              <Text style={s.homeCourse}>{profile.home_course}</Text>
            ) : null}
          </View>
        </View>

        {/* Caddy info card */}
        {isCaddy && (
          <View style={s.caddyInfoCard}>
            {primaryCourse ? (
              <View style={s.caddyInfoRow}>
                <Ionicons name="home-outline" size={14} color="#7DC87A" />
                <View style={{ flex: 1 }}>
                  <Text style={s.caddyInfoLabel}>HOME BASE</Text>
                  <Text style={s.caddyInfoValue}>{primaryCourse}</Text>
                </View>
              </View>
            ) : null}
            {profile.caddy_experience ? (
              <View style={s.caddyInfoRow}>
                <Ionicons name="time-outline" size={14} color="#7DC87A" />
                <View style={{ flex: 1 }}>
                  <Text style={s.caddyInfoLabel}>EXPERIENCE</Text>
                  <Text style={s.caddyInfoValue}>{profile.caddy_experience}</Text>
                </View>
              </View>
            ) : null}
            {alsoCaddiedAt.length > 0 && (
              <View style={s.caddyInfoRow}>
                <Ionicons name="golf-outline" size={14} color="#7DC87A" />
                <View style={{ flex: 1 }}>
                  <Text style={s.caddyInfoLabel}>ALSO CADDIED AT</Text>
                  <Text style={s.caddyInfoValue}>{alsoCaddiedAt.join(', ')}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Gauge row — golfers only */}
        {!isCaddy && <View style={s.gaugeCard}>
          <View style={s.gaugeLeft}>
            {pop != null
              ? <Gauge score={pop} size={120} />
              : <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 32, fontWeight: '100', color: '#C9A84C44' }}>—</Text>
                </View>
            }
          </View>
          <View style={s.gaugeRight}>
            {tier
              ? <Text style={s.tierLabel}>{tier.toUpperCase()}</Text>
              : <Text style={s.tierLabelMuted}>NO SCORE YET</Text>
            }
            <View style={{ marginTop: 10, gap: 8 }}>
              <View>
                <Text style={s.scoreLabel}>POPSCORE</Text>
                <Text style={s.scoreValue}>{pop != null ? pop.toFixed(1) : '—'}</Text>
              </View>
              <View>
                <Text style={s.scoreLabel}>NAT'L AVG</Text>
                <Text style={[s.scoreValue, { fontSize: 16 }]}>3.9</Text>
              </View>
            </View>
          </View>
        </View>}

        {/* Stat cards — golfers */}
        {!isCaddy && <View style={s.statRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>ROUNDS{'\n'}LOGGED</Text>
            <Text style={s.statValue}>{rounds.length > 0 ? profile.total_rounds ?? rounds.length : 0}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>BEST{'\n'}POPSCORE</Text>
            <Text style={s.statValue}>{bestPop != null && bestPop > 0 ? bestPop.toFixed(1) : '—'}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>AVG ROUND{'\n'}TIME</Text>
            <Text style={s.statValue}>{formatDuration(avgTime)}</Text>
          </View>
        </View>}

        {/* Stat cards — caddies */}
        {isCaddy && <View style={s.statRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>ROUNDS{'\n'}CADDIED</Text>
            <Text style={s.statValue}>{caddyRounds.length}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>COURSES{'\n'}WORKED</Text>
            <Text style={s.statValue}>{[...new Set(caddyRounds.map(r => r.course_name).filter(Boolean))].length}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>CADDY{'\n'}RATING</Text>
            <Text style={s.statValue}>{profile.caddy_rating ? profile.caddy_rating.toFixed(1) : '—'}</Text>
          </View>
        </View>}

        {/* Recent rounds */}
        {rounds.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>RECENT ROUNDS</Text>
            {rounds.map((r, i) => (
              <View key={i} style={s.roundCard}>
                <CourseAvatar courseName={r.course_name || ''} size={32} />
                <View style={s.roundInfo}>
                  <Text style={s.roundCourse}>{r.course_name || '—'}</Text>
                  <Text style={s.roundMeta}>
                    {formatShortDate(r.created_at)} · {r.holes} holes · {formatDuration(r.duration_minutes)}
                  </Text>
                </View>
                <Text style={[s.roundPop, { color: popColor(r.pop_score ?? 0) }]}>
                  {r.pop_score != null ? r.pop_score.toFixed(1) : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {rounds.length === 0 && (
          <View style={s.emptyRounds}>
            <Ionicons name="golf-outline" size={36} color="rgba(201,168,76,0.25)" style={{ marginBottom: 10 }} />
            <Text style={s.emptyRoundsText}>No rounds logged yet.</Text>
          </View>
        )}

        {/* Sign out — only on own caddy profile */}
        {isOwnProfile && isCaddy && (
          <View style={s.accountSection}>
            <TouchableOpacity
              style={s.switchModeBtn}
              onPress={() =>
                Alert.alert(
                  'Switch to Golfer Mode',
                  'Sign in with a golfer account to access the golfer experience.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: signOut },
                  ]
                )
              }
              activeOpacity={0.8}
            >
              <Ionicons name="swap-horizontal-outline" size={15} color="#B8A882" />
              <Text style={s.switchModeTxt}>Switch to Golfer Mode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.signOutBtn}
              onPress={() =>
                Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign Out', style: 'destructive', onPress: signOut },
                ])
              }
              activeOpacity={0.8}
            >
              <Text style={s.signOutTxt}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#090F0A' },
  topBar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText:       { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  followBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  followingBtn:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#7DC87A44' },
  followBtnText:  { fontSize: 10, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  followingBtnText: { color: '#7DC87A' },
  scroll:         { paddingHorizontal: 16, paddingBottom: 48 },

  identityRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', marginBottom: 16 },
  avatar:         { width: 60, height: 60, borderRadius: 30, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C55', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 22, fontWeight: '600', color: '#C9A84C' },
  identityInfo:   { flex: 1 },
  fullName:       { fontSize: 20, fontWeight: '600', color: '#F5EDD8' },
  username:       { fontSize: 12, color: '#C9A84C', marginTop: 2 },
  homeCourse:     { fontSize: 11, color: '#7A6E58', marginTop: 2 },
  caddyBadge:     { backgroundColor: '#C9A84C', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  caddyBadgeText: { fontSize: 8, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  caddyInfoCard:  { backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', borderLeftWidth: 3, borderLeftColor: '#7DC87A', padding: 14, marginBottom: 14, gap: 12 },
  caddyInfoRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  caddyInfoLabel: { fontSize: 9, fontWeight: '700', color: '#7DC87A88', letterSpacing: 1.5, marginBottom: 2 },
  caddyInfoValue: { fontSize: 14, color: '#F5EDD8', fontWeight: '500', lineHeight: 20 },

  gaugeCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 20, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, gap: 16, marginBottom: 14 },
  gaugeLeft:      { alignItems: 'center', justifyContent: 'center' },
  gaugeRight:     { flex: 1 },
  tierLabel:      { fontSize: 11, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
  tierLabelMuted: { fontSize: 9, fontWeight: '700', color: '#C9A84C44', letterSpacing: 1.5 },
  scoreLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C66', letterSpacing: 2, marginBottom: 2 },
  scoreValue:     { fontSize: 30, fontWeight: '300', color: '#F5EDD8' },

  statRow:        { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard:       { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
  statLabel:      { fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, textAlign: 'center', marginBottom: 8 },
  statValue:      { fontSize: 22, fontWeight: '300', color: '#F5EDD8' },

  section:        { marginBottom: 20 },
  sectionLabel:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },
  roundCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, marginBottom: 8, gap: 10 },
  roundInfo:      { flex: 1 },
  roundCourse:    { fontSize: 14, fontWeight: '500', color: '#F5EDD8', marginBottom: 2 },
  roundMeta:      { fontSize: 11, color: '#B8A882' },
  roundPop:       { fontSize: 22, fontWeight: '300' },

  emptyRounds:    { alignItems: 'center', paddingVertical: 40 },
  emptyRoundsText:{ fontSize: 16, color: '#7A6E58', fontFamily: 'serif' },

  // Own caddy profile account actions
  accountSection: { marginTop: 32, gap: 10, paddingBottom: 12 },
  switchModeBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#B8A88244', borderRadius: 8, padding: 12 },
  switchModeTxt:  { fontSize: 13, fontWeight: '600', color: '#B8A882' },
  signOutBtn:     { borderWidth: 1, borderColor: '#E24B4A', borderRadius: 8, padding: 12, alignItems: 'center' },
  signOutTxt:     { color: '#E24B4A', fontSize: 14, fontWeight: '600' },
});
