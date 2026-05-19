import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import InitialsAvatar from '../components/InitialsAvatar';
import CourseAvatar from '../components/CourseAvatar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
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

function formatTime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Signup Gate Modal ────────────────────────────────────────────────────────

function SignupGateModal({ visible, onClose, onSignup, feature }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={p.gateOverlay}>
        <View style={p.gateCard}>
          <Text style={p.gateTitle}>Join PlayThru</Text>
          <Text style={p.gateSub}>
            {feature || 'Create a free account to get your POPScore and compete nationally'}
          </Text>
          <TouchableOpacity style={p.gateBtn} onPress={onSignup} activeOpacity={0.85}>
            <Text style={p.gateBtnText}>CREATE FREE ACCOUNT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={p.gateCancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={p.gateCancelText}>Keep browsing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Persistent top banner ────────────────────────────────────────────────────

function TopBanner({ onSignup }) {
  return (
    <View style={p.banner}>
      <Text style={p.bannerText}>Log your rounds to get your Speed Handicap</Text>
      <TouchableOpacity style={p.bannerBtn} onPress={onSignup} activeOpacity={0.85}>
        <Text style={p.bannerBtnText}>JOIN FREE</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── LEADERBOARD TAB ─────────────────────────────────────────────────────────

function PodiumItem({ entry, rank, height, accentColor, onPress }) {
  const trophyColor = rank === 1 ? '#C9A84C' : rank === 2 ? '#B8A882' : '#D4B86A';
  const marginTop   = rank === 1 ? 0 : rank === 2 ? 24 : 36;
  return (
    <TouchableOpacity style={[p.podiumItem, { marginTop }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="trophy" size={18} color={trophyColor} style={{ marginBottom: 4 }} />
      <View style={[p.podiumAvatar, { borderColor: accentColor, width: rank === 1 ? 52 : 44, height: rank === 1 ? 52 : 44, borderRadius: rank === 1 ? 26 : 22, overflow: 'hidden' }]}>
        <InitialsAvatar name={entry.name} size={rank === 1 ? 50 : 42} />
      </View>
      <Text style={p.podiumName} numberOfLines={1}>{entry.name.split(' ')[0]}</Text>
      <Text style={[p.podiumPop, { color: popColor(entry.pop), fontSize: rank === 1 ? 26 : 22 }]}>
        {entry.pop?.toFixed(1) ?? '—'}
      </Text>
    </TouchableOpacity>
  );
}

function LeaderboardTab({ navigation, showGate }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [total,   setTotal]   = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: profiles }, { count }] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, username, pop_score, hometown')
            .eq('account_type', 'golfer')
            .not('pop_score', 'is', null)
            .order('pop_score', { ascending: false })
            .limit(50),
          supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('account_type', 'golfer'),
        ]);
        setTotal(count ?? 0);

        // Fetch round counts for tiebreaker
        const ids = (profiles ?? []).map(pr => pr.id);
        let roundCounts = {};
        if (ids.length > 0) {
          const { data: rData } = await supabase
            .from('rounds')
            .select('user_id')
            .in('user_id', ids)
            .not('pop_score', 'is', null);
          (rData ?? []).forEach(r => {
            roundCounts[r.user_id] = (roundCounts[r.user_id] ?? 0) + 1;
          });
        }

        const sorted = [...(profiles ?? [])].sort((a, b) => {
          if (b.pop_score !== a.pop_score) return b.pop_score - a.pop_score;
          return (roundCounts[b.id] ?? 0) - (roundCounts[a.id] ?? 0);
        });

        setData(
          sorted.map((pr, i) => ({
            rank:   i + 1,
            userId: pr.id,
            name:   pr.full_name || pr.username || 'Golfer',
            handle: pr.username ? `@${pr.username}` : '',
            pop:    pr.pop_score,
            city:   pr.hometown ?? null,
          }))
        );
      } catch (e) {
        // silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={p.centered}>
        <ActivityIndicator color="#C9A84C" />
      </View>
    );
  }

  const top3  = data.slice(0, 3);
  const rest  = data.slice(3);
  const [second, first, third] = [top3[1], top3[0], top3[2]];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      {total > 0 && (
        <Text style={p.lbCount}>{total.toLocaleString()} golfers competing nationally</Text>
      )}

      {/* Podium */}
      {first && (
        <View style={p.podiumRow}>
          {second && (
            <PodiumItem entry={second} rank={2} height={48} accentColor="#B8A882"
              onPress={() => showGate('Sign up to view full profiles')} />
          )}
          <PodiumItem entry={first} rank={1} height={64} accentColor="#C9A84C"
            onPress={() => showGate('Sign up to view full profiles')} />
          {third && (
            <PodiumItem entry={third} rank={3} height={36} accentColor="#D4B86A"
              onPress={() => showGate('Sign up to view full profiles')} />
          )}
        </View>
      )}

      {/* Rows 4–50 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={p.sectionLabel}>FULL STANDINGS</Text>
        {rest.map(entry => (
          <TouchableOpacity
            key={entry.userId}
            style={p.leaderRow}
            onPress={() => showGate('Sign up to view full profiles')}
            activeOpacity={0.8}
          >
            <Text style={p.leaderRank}>#{entry.rank}</Text>
            <View style={p.leaderAvatar}>
              <InitialsAvatar name={entry.name} size={34} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={p.leaderName}>{entry.name}</Text>
              {(entry.handle || entry.city) && (
                <Text style={p.leaderSub}>{entry.handle || entry.city}</Text>
              )}
            </View>
            <Text style={[p.leaderPop, { color: popColor(entry.pop) }]}>
              {entry.pop?.toFixed(1) ?? '—'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── ACTIVITY TAB ─────────────────────────────────────────────────────────────

function PreviewRoundCard({ content }) {
  const pop   = content?.pop_score;
  const parts = [
    content?.holes    ? `${content.holes}h`  : null,
    content?.transport ?? null,
    content?.players  ? `${content.players}p` : null,
    content?.duration_minutes ? formatTime(content.duration_minutes) : null,
  ].filter(Boolean);

  return (
    <View style={p.roundCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={p.roundCourse} numberOfLines={1}>{content?.course_name ?? '—'}</Text>
          {parts.length > 0 && <Text style={p.roundDetails}>{parts.join(' · ')}</Text>}
        </View>
        {pop != null && (
          <View style={[p.popBadge, { borderColor: popColor(pop) }]}>
            <Text style={[p.popScore, { color: popColor(pop) }]}>{pop.toFixed(1)}</Text>
            <Text style={[p.popLabel, { color: popColor(pop) }]}>POP</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PreviewFeedItem({ item, onLockedAction }) {
  const handle = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');

  const actionLabel = (() => {
    switch (item.type) {
      case 'round_logged':  return `logged a round at ${item.content?.course_name ?? '—'}`;
      case 'milestone':     return null;
      case 'course_review': return `reviewed ${item.content?.course_name ?? 'a course'}`;
      case 'leaderboard':   return null;
      case 'user_post':     return null;
      default:              return 'posted an update';
    }
  })();

  return (
    <View style={p.feedCard}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <TouchableOpacity onPress={() => onLockedAction('Sign up to view golfer profiles')} activeOpacity={0.8}>
          <InitialsAvatar name={item.full_name} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <TouchableOpacity onPress={() => onLockedAction('Sign up to view golfer profiles')} activeOpacity={0.8}>
              <Text style={p.feedHandle}>{handle}</Text>
            </TouchableOpacity>
            <Text style={p.feedTime}>{timeAgo(item.created_at)}</Text>
          </View>

          {actionLabel && <Text style={p.feedAction}>{actionLabel}</Text>}

          {item.type === 'round_logged' && item.content && (
            <PreviewRoundCard content={item.content} />
          )}

          {item.type === 'user_post' && (
            <>
              {item.content?.text && <Text style={p.feedPostText}>{item.content.text}</Text>}
              {item.content?.attached_round && (
                <PreviewRoundCard content={item.content.attached_round} />
              )}
            </>
          )}

          {item.type === 'milestone' && (
            <View style={p.milestoneBanner}>
              <Text style={p.milestoneEmoji}>🏆</Text>
              <Text style={p.milestoneText}>{item.content?.description ?? 'Reached a milestone'}</Text>
            </View>
          )}

          {item.type === 'leaderboard' && (
            <View style={p.leaderBanner}>
              <Ionicons name="trending-up" size={14} color="#C9A84C" />
              <Text style={p.leaderBannerText}>{item.content?.description ?? 'Moved on the leaderboard'}</Text>
            </View>
          )}

          {/* Locked action bar */}
          <View style={p.lockedBar}>
            <TouchableOpacity style={p.lockedBtn} onPress={() => onLockedAction('Sign up to like and comment on posts')} activeOpacity={0.7}>
              <Ionicons name="lock-closed" size={12} color="#7A6E58" />
              <Ionicons name="thumbs-up-outline" size={15} color="#7A6E58" />
              {item.likes > 0 && <Text style={p.lockedCount}>{item.likes}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={p.lockedBtn} onPress={() => onLockedAction('Sign up to like and comment on posts')} activeOpacity={0.7}>
              <Ionicons name="lock-closed" size={12} color="#7A6E58" />
              <Ionicons name="chatbubble-outline" size={14} color="#7A6E58" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function ActivityTab({ showGate }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: rows } = await supabase
        .from('activity_feed')
        .select('id, user_id, type, content, likes, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

      if (rows && rows.length > 0) {
        const uids = [...new Set(rows.map(r => r.user_id))];
        const { data: profs } = await supabase
          .from('profiles').select('id, username, full_name').in('id', uids);
        const pm = {};
        (profs ?? []).forEach(pr => { pm[pr.id] = pr; });
        rows.forEach(r => {
          r.username  = pm[r.user_id]?.username  ?? null;
          r.full_name = pm[r.user_id]?.full_name ?? null;
        });
      }
      setItems(rows ?? []);
    } catch (e) {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return <View style={p.centered}><ActivityIndicator color="#C9A84C" /></View>;
  }

  if (items.length === 0) {
    return (
      <View style={p.centered}>
        <Text style={p.emptyText}>No activity yet.{'\n'}Be the first to log a round!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <PreviewFeedItem item={item} onLockedAction={showGate} />
      )}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
    />
  );
}

// ─── COURSES TAB ──────────────────────────────────────────────────────────────

function CoursesTab({ navigation }) {
  const [courses,  setCourses]  = useState([]);
  const [results,  setResults]  = useState([]);
  const [query,    setQuery]    = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('courses')
          .select('id, name, city, state, pop_score, total_rounds, avg_time')
          .not('pop_score', 'is', null)
          .order('total_rounds', { ascending: false })
          .limit(60);
        setCourses(
          (data ?? []).map(c => ({
            ...c,
            location: [c.city, c.state].filter(Boolean).join(', '),
            avgPop:   c.pop_score,
            rounds:   c.total_rounds ?? 0,
            avgTime:  c.avg_time ?? null,
          }))
        );
      } catch (e) {
        // silent fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSearch = (text) => {
    setQuery(text);
    if (!text.trim()) { setResults([]); return; }
    const q = text.toLowerCase();
    setResults(courses.filter(c => c.name?.toLowerCase().includes(q) || c.location?.toLowerCase().includes(q)).slice(0, 20));
  };

  const displayList = query.trim() ? results : courses;

  return (
    <View style={{ flex: 1 }}>
      <View style={p.searchBar}>
        <Ionicons name="search" size={16} color="#7A6E58" style={{ marginRight: 8 }} />
        <TextInput
          style={p.searchInput}
          placeholder="Search courses…"
          placeholderTextColor="#7A6E58"
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color="#7A6E58" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={p.centered}><ActivityIndicator color="#C9A84C" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {displayList.map(course => (
            <TouchableOpacity
              key={course.id}
              style={p.courseCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('CourseProfile', { course: { name: course.name } })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CourseAvatar courseName={course.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={p.courseName} numberOfLines={1}>{course.name}</Text>
                  {course.location ? <Text style={p.courseLocation}>{course.location}</Text> : null}
                </View>
                {course.avgPop != null && (
                  <View style={[p.coursePopBadge, { borderColor: popColor(course.avgPop) + '66' }]}>
                    <Text style={[p.coursePopText, { color: popColor(course.avgPop) }]}>
                      {course.avgPop.toFixed(1)}
                    </Text>
                    <Text style={[p.coursePopLabel, { color: popColor(course.avgPop) }]}>AVG POP</Text>
                  </View>
                )}
              </View>
              {course.rounds > 0 && (
                <Text style={p.courseRounds}>{course.rounds.toLocaleString()} rounds logged</Text>
              )}
            </TouchableOpacity>
          ))}
          {displayList.length === 0 && query.trim().length > 0 && (
            <Text style={[p.emptyText, { marginTop: 40 }]}>No courses found for "{query}"</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'leaderboard', label: 'LEADERBOARD', icon: 'trophy',        iconOff: 'trophy-outline'   },
  { key: 'activity',    label: 'ACTIVITY',    icon: 'radio',         iconOff: 'radio-outline'    },
  { key: 'courses',     label: 'COURSES',     icon: 'location',      iconOff: 'location-outline' },
];

export default function PreviewModeScreen({ navigation }) {
  const [activeTab,    setActiveTab]    = useState('leaderboard');
  const [gateVisible,  setGateVisible]  = useState(false);
  const [gateFeature,  setGateFeature]  = useState(null);

  const showGate = (feature) => {
    setGateFeature(feature ?? null);
    setGateVisible(true);
  };

  const goSignup = () => {
    setGateVisible(false);
    navigation.navigate('SignUp');
  };

  return (
    <SafeAreaView style={p.container} edges={['top', 'left', 'right']}>
      {/* Persistent signup banner */}
      <TopBanner onSignup={goSignup} />

      {/* Back / close */}
      <View style={p.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={p.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={p.headerTitle}>EXPLORE PLAYTHRU</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Custom tab bar */}
      <View style={p.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={p.tabBtn}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={active ? tab.icon : tab.iconOff}
                size={18}
                color={active ? '#C9A84C' : 'rgba(184,168,130,0.4)'}
              />
              <Text style={[p.tabLabel, active && p.tabLabelActive]}>{tab.label}</Text>
              {active && <View style={p.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'leaderboard' && (
          <LeaderboardTab navigation={navigation} showGate={showGate} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab showGate={showGate} />
        )}
        {activeTab === 'courses' && (
          <CoursesTab navigation={navigation} />
        )}
      </View>

      {/* Signup gate modal */}
      <SignupGateModal
        visible={gateVisible}
        onClose={() => setGateVisible(false)}
        onSignup={goSignup}
        feature={gateFeature}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const p = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#090F0A' },

  // Banner
  banner:     { backgroundColor: '#1E3D22', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.3)' },
  bannerText: { color: '#F5EDD8', fontSize: 12, flex: 1, lineHeight: 16 },
  bannerBtn:  { backgroundColor: '#C9A84C', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, marginLeft: 12 },
  bannerBtnText: { color: '#090F0A', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  // Header
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },

  // Tab bar
  tabBar:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, position: 'relative' },
  tabLabel:     { fontSize: 8, fontWeight: '700', color: 'rgba(184,168,130,0.4)', letterSpacing: 1.5 },
  tabLabelActive: { color: '#C9A84C' },
  tabUnderline: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, backgroundColor: '#C9A84C', borderRadius: 1 },

  // Gate modal
  gateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  gateCard:    { backgroundColor: '#0D1A0F', borderRadius: 16, padding: 24, width: '100%', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  gateTitle:   { fontSize: 22, fontWeight: '700', color: '#F5EDD8', fontFamily: 'Georgia', marginBottom: 8, textAlign: 'center' },
  gateSub:     { fontSize: 14, color: '#B8A882', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  gateBtn:     { backgroundColor: '#C9A84C', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  gateBtnText: { color: '#090F0A', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  gateCancel:  { padding: 10, alignItems: 'center' },
  gateCancelText: { color: '#B8A882', fontSize: 13 },

  // General
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText:   { fontSize: 15, color: '#7A6E58', textAlign: 'center', lineHeight: 22 },
  sectionLabel: { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },

  // Leaderboard
  lbCount:     { textAlign: 'center', fontSize: 11, color: '#B8A882', fontWeight: '600', paddingVertical: 10, letterSpacing: 0.5 },
  podiumRow:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 },
  podiumItem:  { flex: 1, alignItems: 'center' },
  podiumAvatar: { borderWidth: 2, marginBottom: 4 },
  podiumName:  { fontSize: 11, fontWeight: '600', color: '#F5EDD8', textAlign: 'center', marginBottom: 2 },
  podiumPop:   { fontWeight: '300', textAlign: 'center', marginBottom: 4 },
  podiumBase:  { width: '100%', borderRadius: 6, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  podiumRankText: { fontSize: 20, fontWeight: '200', color: '#B8A882' },
  leaderRow:   { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  leaderRank:  { fontSize: 12, fontWeight: '700', color: '#7A6E58', width: 32 },
  leaderAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#7DC87A33' },
  leaderName:  { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  leaderSub:   { fontSize: 11, color: '#7A6E58', marginTop: 2 },
  leaderPop:   { fontSize: 24, fontWeight: '300' },

  // Activity
  feedCard:    { borderBottomWidth: 1, borderBottomColor: '#7DC87A11', paddingHorizontal: 16, paddingVertical: 14 },
  feedHandle:  { fontSize: 13, fontWeight: '700', color: '#F5EDD8' },
  feedTime:    { fontSize: 11, color: '#7A6E58' },
  feedAction:  { fontSize: 12, color: '#B8A882', marginBottom: 6 },
  feedPostText: { fontSize: 14, color: '#F5EDD8', lineHeight: 20, marginBottom: 8 },
  roundCard:   { backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, marginVertical: 6 },
  roundCourse: { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  roundDetails: { fontSize: 11, color: '#B8A882', marginTop: 2 },
  popBadge:    { alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginLeft: 10 },
  popScore:    { fontSize: 20, fontWeight: '300' },
  popLabel:    { fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  milestoneBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 10, padding: 10, marginVertical: 6 },
  milestoneEmoji:  { fontSize: 20 },
  milestoneText:   { fontSize: 13, color: '#D4B86A', flex: 1, lineHeight: 18 },
  leaderBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 10, padding: 10, marginVertical: 6 },
  leaderBannerText: { fontSize: 13, color: '#C9A84C', flex: 1 },
  lockedBar:   { flexDirection: 'row', gap: 16, marginTop: 10 },
  lockedBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.6 },
  lockedCount: { fontSize: 12, color: '#7A6E58' },

  // Courses
  searchBar:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 12, backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#F5EDD8' },
  courseCard:  { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10 },
  courseName:  { fontSize: 15, fontWeight: '600', color: '#F5EDD8' },
  courseLocation: { fontSize: 11, color: '#B8A882', marginTop: 2 },
  coursePopBadge: { alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  coursePopText:  { fontSize: 18, fontWeight: '300' },
  coursePopLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 1 },
  courseRounds:   { fontSize: 10, color: '#7A6E58', marginTop: 8, fontWeight: '500' },
});
