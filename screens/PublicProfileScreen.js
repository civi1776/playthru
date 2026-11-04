// ─── PublicProfileScreen — a player as others see them ───────────────────────
// Built like a scouting card, not a settings page. Top to bottom:
//   who they are        avatar, name, where they play, follows, since
//   what you can do     follow · vs · challenge · arcade duel
//   how good they are   Clocked Score card + tier / rank / handicap strip
//   vs you              head-to-head record (visitors only)
//   by the numbers      six fixed tiles, one line each
//   form                last ten rounds as bars, with a trend
//   recent rounds       own logs + rounds a friend logged with them
// Reference points: GHIN (index + trend + score history), Strava (counts and
// recent activities), chess.com (head-to-head record on every rival).

import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { PROFILE_COLUMNS } from '../lib/profileColumns';
import { useAuth } from '../context/AuthContext';
import { sendPushToUser } from '../lib/notifications';
import ChallengeButton from '../components/ChallengeButton';
import { createArcadeChallenge } from '../lib/arcade/challenges';
import { loadArcadeDifficulty } from '../lib/arcade/avatar';
import InitialsAvatar from '../components/InitialsAvatar';
import ClockedScoreCard from '../components/ClockedScoreCard';
import RecentRoundsList from '../components/RecentRoundsList';
import ScreenHeader from '../components/ScreenHeader';
import { fetchClockedRatingForUser, computeNationalRank } from '../lib/clockedRating';
import { fetchPlayerRounds, fetchHeadToHead, recordFromRounds } from '../lib/headToHead';
import { COLOR, RADIUS, scoreTier } from '../lib/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ptsColor(pts) {
  if (pts == null) return COLOR.muted;
  if (pts >= 8) return COLOR.green;
  if (pts >= 0) return COLOR.gold;
  return COLOR.red;
}
const signed = v => (v == null ? '—' : v > 0 ? `+${v}` : String(v));

function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortDate(iso) { if (!iso) return ''; const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; }
function monthYear(iso) { if (!iso) return ''; const d = new Date(iso); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return shortDate(iso);
}
const STATE_ABBR = { Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO', Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY' };
function placeLine(p) {
  const st = p.home_state ? (STATE_ABBR[p.home_state] ?? p.home_state) : null;
  return [p.hometown, st].filter(Boolean).join(', ');
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Tile({ label, value, color, sub }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.tileValue, color && { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={s.tileSub} numberOfLines={1}>{sub ?? ' '}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={13} color={COLOR.gold} />
      <Text style={s.actionTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// Last ten rounds as bars. Zero line in the middle; gold/green above, red below.
function FormBars({ points }) {
  const max = Math.max(4, ...points.map(p => Math.abs(p)));
  const H = 44;
  return (
    <View style={s.formBars}>
      {points.map((p, i) => {
        const h = Math.max(3, Math.round((Math.abs(p) / max) * (H / 2)));
        const up = p >= 0;
        return (
          <View key={i} style={s.formCol}>
            <View style={[s.formHalf, { justifyContent: 'flex-end' }]}>{up && <View style={[s.formBar, { height: h, backgroundColor: p >= 8 ? COLOR.green : COLOR.gold }]} />}</View>
            <View style={s.formZero} />
            <View style={s.formHalf}>{!up && <View style={[s.formBar, { height: h, backgroundColor: COLOR.red }]} />}</View>
          </View>
        );
      })}
    </View>
  );
}

function ActRow({ item }) {
  const typeMap = {
    round_logged:       { icon: 'golf',        color: COLOR.green, label: c => `Logged a round at ${c?.course_name ?? '—'}` },
    live_round_started: { icon: 'golf',        color: COLOR.green, label: c => `Playing live at ${c?.course_name ?? 'a course'} right now` },
    milestone:          { icon: 'trophy',      color: COLOR.gold,  label: c => c?.title ?? 'Reached a milestone' },
    leaderboard:        { icon: 'trending-up', color: COLOR.gold,  label: c => c?.description ?? 'Moved on the leaderboard' },
    course_review:      { icon: 'location',    color: COLOR.green, label: c => `Reviewed ${c?.course_name ?? 'a course'}` },
    user_post:          { icon: 'chatbubble',  color: COLOR.muted, label: c => c?.text?.slice(0, 80) ?? 'Shared an update' },
    course_leader:      { icon: 'trophy',      color: COLOR.gold,  label: c => c?.description ?? 'Set a course record' },
  };
  const info = typeMap[item.type] ?? { icon: 'ellipsis-horizontal', color: COLOR.dim, label: () => 'Activity' };
  const content = item.content ?? {};
  const pts = content.team_score;
  return (
    <View style={s.actRow}>
      <View style={[s.actIconWrap, { backgroundColor: info.color + '22' }]}>
        <Ionicons name={info.icon} size={16} color={info.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.actLabel}>{info.label(content)}</Text>
        {item.type === 'round_logged' && pts != null && <Text style={[s.actPts, { color: ptsColor(pts) }]}>{signed(pts)} PTS</Text>}
        <Text style={s.actTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PublicProfileScreen({ navigation, route }) {
  const { userId } = route.params;
  const { user, profile: myProfile } = useAuth();
  const myUid = user?.id;
  const isOwnProfile = myUid === userId;

  const [profile, setProfile] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [tab, setTab] = useState('profile');
  const [activity, setActivity] = useState(null);
  const [rating, setRating] = useState({ clockedScore: null, scoring: null, clock: null, isProvisional: true, roundsUsed: 0, roundsNeeded: 5 });
  const [rank, setRank] = useState(null);
  const [h2h, setH2h] = useState(null);
  const [duelSending, setDuelSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadError(false);
      try {
        const { data: p } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
        if (cancelled) return;
        setProfile(p);
        if (!p) { setLoading(false); return; }
        const name = p.full_name || p.username || 'Player';
        const [playerRounds, r, followRow, followers, followingN] = await Promise.all([
          fetchPlayerRounds(userId, name),
          fetchClockedRatingForUser(supabase, userId, p),
          myUid && !isOwnProfile ? supabase.from('follows').select('id').eq('follower_id', myUid).eq('following_id', userId).maybeSingle() : Promise.resolve({ data: null }),
          supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
        ]);
        if (cancelled) return;
        setRounds(playerRounds);
        setRating(r);
        setFollowing(!!followRow?.data);
        setCounts({ followers: followers?.count ?? 0, following: followingN?.count ?? 0 });
        setLoading(false);

        // Slower extras, off the critical path.
        computeNationalRank(supabase, userId).then(v => { if (!cancelled) setRank(v); }).catch(() => {});
        if (myUid && !isOwnProfile) {
          fetchHeadToHead(myUid, userId, myProfile?.full_name || myProfile?.username, name).then(v => { if (!cancelled) setH2h(v); });
        }
        supabase.from('activity_feed').select('id, type, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
          .then(({ data }) => { if (!cancelled) setActivity(data ?? []); });
      } catch {
        if (!cancelled) { setLoadError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [userId, myUid]);

  const toggleFollow = async () => {
    if (!myUid || followLoading) return;
    setFollowLoading(true);
    const was = following;
    setFollowing(!was);
    setCounts(c => ({ ...c, followers: Math.max(0, c.followers + (was ? -1 : 1)) }));
    if (was) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', myUid).eq('following_id', userId);
      if (error) { setFollowing(true); setCounts(c => ({ ...c, followers: c.followers + 1 })); }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: myUid, following_id: userId });
      if (error) { setFollowing(false); setCounts(c => ({ ...c, followers: Math.max(0, c.followers - 1) })); }
      else {
        const senderName = myProfile?.username ? `@${myProfile.username}` : 'Someone';
        sendPushToUser(userId, 'New Follower', `${senderName} is now following you on Clocked.`, 'new_follower', { follower_id: myUid }).catch(() => {});
      }
    }
    setFollowLoading(false);
  };

  const sendDuel = async () => {
    if (duelSending) return;
    setDuelSending(true);
    try {
      const difficulty = await loadArcadeDifficulty('intermediate');
      await createArcadeChallenge({ me: myUid, myUsername: myProfile?.username, opponentId: userId, opponentUsername: profile.username, difficulty });
      Alert.alert('Duel sent', `${profile.username ? '@' + profile.username : 'They'} will get a notification. Same nine holes, ${difficulty}, seven days. Track it on the Arcade tab.`);
    } catch (e) { Alert.alert('Duel not sent', e?.message ?? 'Check your connection and try again.'); }
    setDuelSending(false);
  };

  // ── Derived numbers ──
  const stats = useMemo(() => {
    const clocked = rounds.filter(r => r.round_format === 'clocked' && r._pts != null && r._confirmed !== false);
    const pts = clocked.map(r => r._pts);
    const avgPts = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null;
    const best = clocked.length ? clocked.reduce((b, r) => (b == null || r._pts > b._pts ? r : b), null) : null;
    const timed = rounds.filter(r => (r.duration_minutes ?? 0) >= 20);
    const avgTime = timed.length ? timed.reduce((a, r) => a + r.duration_minutes, 0) / timed.length : null;
    const record = recordFromRounds(clocked);
    const last10 = pts.slice(0, 10).reverse();
    const recent5 = pts.slice(0, 5), prior5 = pts.slice(5, 10);
    const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const trend = recent5.length >= 3 && prior5.length >= 3 ? mean(recent5) - mean(prior5) : null;
    const legacy = rounds.filter(r => r.round_format !== 'clocked').length;
    return { clocked, avgPts, best, avgTime, record, last10, trend, legacy };
  }, [rounds]);

  // ── Frames ──
  if (loading || loadError || !profile) {
    return (
      <SafeAreaView style={s.container}>
        <ScreenHeader title="PLAYER" onBack={() => navigation.goBack()} borderless />
        <View style={s.center}>
          {loading ? <ActivityIndicator size="large" color={COLOR.gold} />
            : <Text style={s.centerText}>{loadError ? "Couldn't load this profile. Check your connection and try again." : 'Profile not found.'}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const handle = profile.username ? `@${profile.username}` : 'PLAYER';
  const hasScore = rating.clockedScore != null && (rating.roundsUsed ?? 0) > 0;
  const tier = scoreTier(rating.clockedScore, rating.isProvisional || !hasScore);
  const hcp = profile.handicap_index != null ? Number(profile.handicap_index) : null;
  const hcpArrow = profile.handicap_trend === 'up' ? ' ▲' : profile.handicap_trend === 'down' ? ' ▼' : '';
  const place = placeLine(profile);
  const lastCourse = rounds.find(r => r.course_name)?.course_name ?? null;

  const followBtn = !isOwnProfile && myUid ? (
    <TouchableOpacity style={[s.followBtn, following && s.followingBtn]} onPress={toggleFollow} activeOpacity={0.8} disabled={followLoading} accessibilityRole="button" accessibilityLabel={following ? 'Unfollow' : 'Follow'}>
      {following && <Ionicons name="checkmark" size={12} color={COLOR.green} />}
      <Text style={[s.followTxt, following && s.followingTxt]}>{following ? 'FOLLOWING' : 'FOLLOW'}</Text>
    </TouchableOpacity>
  ) : null;

  const h2hTotal = h2h ? h2h.wins + h2h.losses + h2h.ties : 0;
  const h2hChallenges = h2h ? h2h.challenges.wins + h2h.challenges.losses : 0;
  const h2hArcade = h2h ? h2h.arcade.wins + h2h.arcade.losses + h2h.arcade.ties : 0;
  const h2hEmpty = h2h && h2hTotal === 0 && h2h.pendingConfirm === 0 && h2hChallenges === 0 && h2hArcade === 0;
  const h2hLead = h2h ? (h2h.wins > h2h.losses ? 'YOU LEAD' : h2h.losses > h2h.wins ? `${handle.toUpperCase()} LEADS` : h2hTotal ? 'ALL SQUARE' : null) : null;

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title={handle.toUpperCase()} onBack={() => navigation.goBack()} right={followBtn} borderless />

      {/* Identity */}
      <View style={s.identity}>
        <InitialsAvatar name={profile.full_name} size={64} avatarUrl={profile.avatar_url} username={profile.username} />
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{profile.full_name || handle}</Text>
          {!!place && <Text style={s.place} numberOfLines={1}>{place}</Text>}
          {!!profile.home_course && (
            <View style={s.homeRow}>
              <Ionicons name="flag-outline" size={11} color={COLOR.dim} />
              <Text style={s.home} numberOfLines={1}>{profile.home_course}</Text>
            </View>
          )}
        </View>
      </View>
      {!!profile.bio && <Text style={s.bio} numberOfLines={3}>{profile.bio}</Text>}
      <View style={s.countsRow}>
        <Text style={s.count}><Text style={s.countNum}>{counts.followers}</Text> FOLLOWERS</Text>
        <Text style={s.countDot}>{'·'}</Text>
        <Text style={s.count}><Text style={s.countNum}>{counts.following}</Text> FOLLOWING</Text>
        <Text style={s.countDot}>{'·'}</Text>
        <Text style={s.count}>SINCE {monthYear(profile.created_at).toUpperCase()}</Text>
      </View>

      {/* Actions */}
      {!isOwnProfile && myUid && (
        <View style={s.actionRow}>
          <ActionBtn icon="stats-chart" label="VS" onPress={() => navigation.navigate('Rivalry', { userId, username: profile.username ?? profile.full_name })} />
          {!!lastCourse && (
            <ChallengeButton targetUserId={userId} targetUsername={profile.username ?? profile.full_name?.split(' ')[0] ?? 'player'} courseName={lastCourse} challengerScore={null} variant="profile" />
          )}
          <ActionBtn icon="game-controller-outline" label={duelSending ? 'SENDING…' : 'ARCADE DUEL'} onPress={sendDuel} />
        </View>
      )}

      {/* Segments */}
      <View style={s.segRow}>
        {['profile', 'activity'].map(t => (
          <TouchableOpacity key={t} style={[s.seg, tab === t && s.segOn]} onPress={() => setTab(t)} activeOpacity={0.8} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[s.segTxt, tab === t && s.segTxtOn]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'profile' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          <ClockedScoreCard {...rating} />

          {/* Credentials strip — GHIN-style index line, plus tier and rank */}
          <View style={s.credRow}>
            <View style={s.cred}>
              <Text style={s.credLabel}>TIER</Text>
              <Text style={[s.credValue, { color: tier.color }]} numberOfLines={1} adjustsFontSizeToFit>{hasScore ? tier.name : '—'}</Text>
            </View>
            <View style={s.credDiv} />
            <View style={s.cred}>
              <Text style={s.credLabel}>NATIONAL RANK</Text>
              <Text style={[s.credValue, rank && { color: COLOR.gold }]}>{rank ? `#${rank}` : '—'}</Text>
            </View>
            <View style={s.credDiv} />
            <View style={s.cred}>
              <Text style={s.credLabel}>HCP INDEX</Text>
              <Text style={s.credValue}>{hcp != null ? `${hcp < 0 ? '+' : ''}${Math.abs(hcp).toFixed(1)}${hcpArrow}` : '—'}</Text>
              {hcp != null && <Text style={s.credSub}>self-reported</Text>}
            </View>
          </View>

          {/* Head to head — visitors only */}
          {!isOwnProfile && myUid && (
            <TouchableOpacity style={s.h2h} onPress={() => navigation.navigate('Rivalry', { userId, username: profile.username ?? profile.full_name })} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open head to head">
              <View style={s.h2hTop}>
                <Text style={s.sectionLabel}>YOU VS {handle.toUpperCase()}</Text>
                <Ionicons name="chevron-forward" size={14} color={COLOR.dim} />
              </View>
              {h2h == null ? (
                <ActivityIndicator color={COLOR.gold} style={{ marginVertical: 12 }} />
              ) : h2hEmpty ? (
                <>
                  <Text style={s.h2hEmpty}>No rounds together yet.</Text>
                  <Text style={s.h2hEmptySub}>
                    {h2h.challenges.pending ? `${h2h.challenges.pending} open challenge${h2h.challenges.pending === 1 ? '' : 's'}. ` : ''}
                    {h2h.arcade.open ? `${h2h.arcade.open} open arcade duel${h2h.arcade.open === 1 ? '' : 's'}. ` : ''}
                    Add them to a Clocked round, or send a challenge, to start the record.
                  </Text>
                </>
              ) : (
                <>
                  <View style={s.h2hRecordRow}>
                    <Text style={[s.h2hRecord, { color: h2h.wins > h2h.losses ? COLOR.green : h2h.losses > h2h.wins ? COLOR.red : COLOR.cream }]}>
                      {h2h.wins}<Text style={s.h2hDash}>{'–'}</Text>{h2h.losses}{h2h.ties ? <Text style={s.h2hTies}>{'–'}{h2h.ties}</Text> : null}
                    </Text>
                    <View style={{ flex: 1 }}>
                      {!!h2hLead && <Text style={s.h2hLead}>{h2hLead}</Text>}
                      <Text style={s.h2hMeta}>
                        {h2hTotal} round{h2hTotal === 1 ? '' : 's'} together
                        {h2h.pendingConfirm ? ` · ${h2h.pendingConfirm} awaiting confirmation` : ''}
                      </Text>
                      {(h2hChallenges > 0 || h2hArcade > 0) && (
                        <Text style={s.h2hMeta}>
                          {h2hChallenges > 0 ? `Challenges ${h2h.challenges.wins}–${h2h.challenges.losses}` : ''}
                          {h2hChallenges > 0 && h2hArcade > 0 ? ' · ' : ''}
                          {h2hArcade > 0 ? `Arcade ${h2h.arcade.wins}–${h2h.arcade.losses}${h2h.arcade.ties ? `–${h2h.arcade.ties}` : ''}` : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                  {h2h.matchups.slice(0, 3).map(m => {
                    const won = m.myPts > m.theirPts, tied = m.myPts === m.theirPts;
                    return (
                      <View key={m.roundId} style={s.matchRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.matchCourse} numberOfLines={1}>{m.course || 'Quick Play'}</Text>
                          <Text style={s.matchMeta}>{shortDate(m.date)}{m.holes ? ` · ${m.holes} holes` : ''}{m.confirmed ? '' : ' · unconfirmed'}</Text>
                        </View>
                        <Text style={[s.matchPts, { color: tied ? COLOR.muted : won ? COLOR.green : COLOR.red }]}>{signed(m.myPts)}</Text>
                        <Text style={s.matchVs}>vs</Text>
                        <Text style={[s.matchPts, { color: tied ? COLOR.muted : won ? COLOR.red : COLOR.green }]}>{signed(m.theirPts)}</Text>
                      </View>
                    );
                  })}
                </>
              )}
            </TouchableOpacity>
          )}

          {/* By the numbers */}
          <Text style={[s.sectionLabel, s.sectionPad]}>BY THE NUMBERS</Text>
          <View style={s.tiles}>
            <Tile label="ROUNDS" value={String(rounds.length)} sub={stats.legacy ? `${stats.legacy} legacy` : null} />
            <Tile label="AVG PTS / ROUND" value={stats.avgPts != null ? signed(Math.round(stats.avgPts * 10) / 10) : '—'} color={stats.avgPts != null ? ptsColor(stats.avgPts) : null} />
            <Tile label="BEST ROUND" value={stats.best ? signed(stats.best._pts) : '—'} color={stats.best ? ptsColor(stats.best._pts) : null} sub={stats.best ? (stats.best.course_name || 'Quick Play') : null} />
            <Tile label="RECORD" value={stats.record.games ? `${stats.record.wins}–${stats.record.losses}${stats.record.ties ? `–${stats.record.ties}` : ''}` : '—'} color={stats.record.games ? (stats.record.wins >= stats.record.losses ? COLOR.green : COLOR.red) : null} sub={stats.record.games ? 'vs playing partners' : null} />
            <Tile label="UNDER THE CLOCK" value={hasScore && rating.clock != null ? `${Math.round(rating.clock)}%` : '—'} color={hasScore && rating.clock != null ? (rating.clock >= 70 ? COLOR.green : COLOR.gold) : null} sub="holes under time par" />
            <Tile label="AVG TIME" value={formatDuration(stats.avgTime)} sub="per round" />
          </View>

          {/* Form */}
          {stats.last10.length >= 2 && (
            <>
              <View style={[s.formHead, s.sectionPad]}>
                <Text style={s.sectionLabel}>FORM {'·'} LAST {stats.last10.length}</Text>
                {stats.trend != null && (
                  <Text style={[s.trend, { color: stats.trend > 0.5 ? COLOR.green : stats.trend < -0.5 ? COLOR.red : COLOR.muted }]}>
                    {stats.trend > 0.5 ? '▲ TRENDING UP' : stats.trend < -0.5 ? '▼ TRENDING DOWN' : '→ STEADY'}
                  </Text>
                )}
              </View>
              <View style={s.formCard}>
                <FormBars points={stats.last10} />
                <Text style={s.formNote}>Points per round, oldest to newest. Par is 1 a hole, so +9 is level for nine.</Text>
              </View>
            </>
          )}

          <RecentRoundsList rounds={rounds} navigation={navigation} limit={10} />
          {rounds.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="golf-outline" size={36} color="rgba(201,168,76,0.25)" />
              <Text style={s.emptyText}>No rounds logged yet.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        activity == null
          ? <ActivityIndicator color={COLOR.gold} style={{ marginTop: 60 }} />
          : activity.length === 0
            ? <View style={s.empty}><Ionicons name="time-outline" size={36} color="rgba(201,168,76,0.2)" /><Text style={s.emptyText}>No activity yet.</Text></View>
            : <FlatList data={activity} keyExtractor={i => i.id} renderItem={({ item }) => <ActRow item={item} />} contentContainerStyle={{ paddingBottom: 40 }} />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLOR.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  centerText:  { color: COLOR.dim, fontSize: 15, textAlign: 'center', lineHeight: 22 },

  followBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLOR.gold, borderRadius: RADIUS.pill, paddingVertical: 7, paddingHorizontal: 14, marginRight: 8 },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#7DC87A44' },
  followTxt:    { fontSize: 10, fontWeight: '800', color: COLOR.bg, letterSpacing: 1.5 },
  followingTxt: { color: COLOR.green },

  identity:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 4 },
  name:        { fontSize: 22, fontWeight: '700', color: COLOR.cream, letterSpacing: -0.2 },
  place:       { fontSize: 12, color: COLOR.muted, marginTop: 2 },
  homeRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  home:        { fontSize: 11, color: COLOR.dim, flexShrink: 1 },
  bio:         { fontSize: 13, color: COLOR.muted, lineHeight: 18, paddingHorizontal: 20, marginTop: 10 },
  countsRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  count:       { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5 },
  countNum:    { color: COLOR.cream, fontSize: 11 },
  countDot:    { color: COLOR.dim, fontSize: 9 },

  actionRow:   { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 14 },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: COLOR.borderGold, borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: 8 },
  actionTxt:   { fontSize: 10, fontWeight: '800', color: COLOR.gold, letterSpacing: 1.5 },

  segRow:      { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 14, marginBottom: 2 },
  seg:         { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLOR.border },
  segOn:       { borderColor: COLOR.gold, backgroundColor: '#C9A84C18' },
  segTxt:      { fontSize: 9, fontWeight: '800', color: COLOR.dim, letterSpacing: 2 },
  segTxtOn:    { color: COLOR.gold },

  credRow:     { flexDirection: 'row', marginHorizontal: 16, marginTop: -2, marginBottom: 6, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 12 },
  cred:        { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  credDiv:     { width: 1, backgroundColor: COLOR.border },
  credLabel:   { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5, marginBottom: 4 },
  credValue:   { fontSize: 15, fontWeight: '700', color: COLOR.cream, fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  credSub:     { fontSize: 8, color: COLOR.dim, marginTop: 2, fontStyle: 'italic' },

  sectionLabel:{ fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3 },
  sectionPad:  { paddingHorizontal: 16, marginTop: 18, marginBottom: 8 },

  h2h:         { marginHorizontal: 16, marginTop: 12, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderGold, padding: 14 },
  h2hTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  h2hEmpty:    { fontSize: 14, fontWeight: '600', color: COLOR.cream },
  h2hEmptySub: { fontSize: 11, color: COLOR.dim, lineHeight: 16, marginTop: 3 },
  h2hRecordRow:{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  h2hRecord:   { fontSize: 34, fontWeight: '200', fontVariant: ['tabular-nums'], lineHeight: 38 },
  h2hDash:     { color: COLOR.dim },
  h2hTies:     { color: COLOR.dim, fontSize: 22 },
  h2hLead:     { fontSize: 10, fontWeight: '800', color: COLOR.cream, letterSpacing: 1.5 },
  h2hMeta:     { fontSize: 11, color: COLOR.dim, marginTop: 2 },
  matchRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: COLOR.border },
  matchCourse: { fontSize: 12, fontWeight: '600', color: COLOR.cream },
  matchMeta:   { fontSize: 10, color: COLOR.dim, marginTop: 1 },
  matchPts:    { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'center' },
  matchVs:     { fontSize: 9, color: COLOR.dim, letterSpacing: 1 },

  tiles:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 20 },
  tile:        { width: '31.5%', flexGrow: 1, height: 78, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  tileLabel:   { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.2, marginBottom: 4 },
  tileValue:   { fontSize: 20, fontWeight: '300', color: COLOR.cream, fontVariant: ['tabular-nums'] },
  tileSub:     { fontSize: 8, color: COLOR.dim, marginTop: 3, maxWidth: '100%' },

  formHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trend:       { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  formCard:    { marginHorizontal: 16, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 18 },
  formBars:    { flexDirection: 'row', gap: 6, height: 48, alignItems: 'stretch' },
  formCol:     { flex: 1 },
  formHalf:    { flex: 1 },
  formZero:    { height: 1, backgroundColor: COLOR.border },
  formBar:     { borderRadius: 2, width: '100%' },
  formNote:    { fontSize: 9, color: COLOR.dim, marginTop: 10 },

  empty:       { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:   { fontSize: 15, color: COLOR.dim },

  actRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', gap: 12 },
  actIconWrap: { width: 32, height: 32, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  actLabel:    { fontSize: 13, color: COLOR.cream, fontWeight: '500', lineHeight: 18 },
  actPts:      { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  actTime:     { fontSize: 10, color: 'rgba(184,168,130,0.5)', marginTop: 3 },
});
