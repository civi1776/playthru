import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { sendPushToUser } from '../lib/notifications';

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ICON = {
  rank_move:          { name: 'trending-up',      color: '#C9A84C' },
  milestone:          { name: 'star',             color: '#C9A84C' },
  friend_round:       { name: 'flag',             color: '#7DC87A' },
  friend_activity:    { name: 'flag',             color: '#7DC87A' },
  course_update:      { name: 'location',         color: '#7DC87A' },
  course_leader:      { name: 'trophy',           color: '#C9A84C' },
  new_follower:       { name: 'person-add',       color: '#7DC87A' },
  comment:            { name: 'chatbubble',       color: '#7DC87A' },
  like:               { name: 'heart',            color: '#e05c5c' },
  referral:           { name: 'people',           color: '#7DC87A' },
  push:               { name: 'notifications',    color: '#B8A882' },
  challenge_received: { name: 'flash',            color: '#C9A84C' },
  challenge_accepted: { name: 'flash',            color: '#7DC87A' },
  challenge_declined: { name: 'flash',            color: '#7A6E58' },
  challenge_result:   { name: 'trophy',           color: '#C9A84C' },
  challenge_won:      { name: 'flash',            color: '#C9A84C' },
  welcome:            { name: 'golf',             color: '#C9A84C' },
  course_update:      { name: 'location',         color: '#7DC87A' },
  friend_round:       { name: 'flag',             color: '#7DC87A' },
  rank_move:          { name: 'trending-up',      color: '#C9A84C' },
  milestone:          { name: 'star',             color: '#C9A84C' },
  course_leader:      { name: 'trophy',           color: '#C9A84C' },
};

function NotifRow({ item, onAccept, onDecline, actioned }) {
  const ic = ICON[item.type] ?? { name: 'notifications', color: '#B8A882' };
  const isChallenge = item.type === 'challenge_received';
  return (
    <View style={[s.row, !item.read && s.unread]}>
      <View style={s.iconWrap}>
        <Ionicons name={ic.name} size={18} color={ic.color} />
      </View>
      <View style={s.content}>
        <Text style={s.title}>{item.title}</Text>
        {!!item.body && <Text style={s.body}>{item.body}</Text>}
        <Text style={s.time}>{timeAgo(item.created_at)}</Text>
        {isChallenge && !actioned && (
          <View style={s.challengeActions}>
            <TouchableOpacity style={s.acceptBtn} onPress={() => onAccept(item)} activeOpacity={0.8}>
              <Text style={s.acceptBtnText}>ACCEPT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.declineBtn} onPress={() => onDecline(item)} activeOpacity={0.8}>
              <Text style={s.declineBtnText}>DECLINE</Text>
            </TouchableOpacity>
          </View>
        )}
        {isChallenge && actioned && (
          <Text style={s.actionedText}>Responded</Text>
        )}
      </View>
      {!item.read && <View style={s.dot} />}
    </View>
  );
}

export default function NotificationCenterScreen({ navigation }) {
  const { session } = useAuth();
  const [notifs,      setNotifs]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [actionedIds, setActionedIds] = useState(new Set());

  useFocusEffect(useCallback(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      setNotifs(data ?? []);
      setLoading(false);
      const ids = (data ?? []).filter(n => !n.read).map(n => n.id);
      if (ids.length) supabase.from('notifications').update({ read: true }).in('id', ids).then(() => {});
    })();
    return () => { cancelled = true; };
  }, [session]));

  const handleAccept = async (item) => {
    const { challenge_id, challenger_id, course_name } = item.meta ?? {};
    if (!challenge_id) return;
    try {
      await supabase.from('challenges').update({ status: 'accepted' }).eq('id', challenge_id);
      if (challenger_id) {
        await sendPushToUser(challenger_id, 'Challenge accepted! ⚡', `Your challenge at ${course_name ?? 'your course'} was accepted. Game on.`, 'challenge_accepted');
      }
    } catch { /* silent fail */ }
    AccessibilityInfo.announceForAccessibility('Challenge accepted');
    setActionedIds(prev => new Set([...prev, item.id]));
  };

  const handleDecline = async (item) => {
    const { challenge_id, challenger_id, course_name } = item.meta ?? {};
    if (!challenge_id) return;
    try {
      await supabase.from('challenges').update({ status: 'declined' }).eq('id', challenge_id);
      if (challenger_id) {
        await sendPushToUser(challenger_id, 'Challenge declined', `Your challenge at ${course_name ?? 'your course'} was declined.`, 'challenge_declined');
      }
    } catch { /* silent fail */ }
    setActionedIds(prev => new Set([...prev, item.id]));
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Ionicons name="chevron-back" size={22} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>NOTIFICATIONS</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#C9A84C" style={{ marginTop: 60 }} />
      ) : notifs.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="notifications-off-outline" size={48} color="rgba(184,168,130,0.2)" />
          <Text style={s.emptyText}>No notifications yet</Text>
          <Text style={s.emptySub}>Activity from your rounds, followers, and rankings will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={n => n.id}
          renderItem={({ item }) => (
            <NotifRow
              item={item}
              onAccept={handleAccept}
              onDecline={handleDecline}
              actioned={actionedIds.has(item.id)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#090F0A' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 64, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.1)' },
  back:        { width: 38, height: 38, justifyContent: 'center' },
  headerTitle: { fontSize: 13, fontFamily: 'Montserrat_700Bold', color: '#C9A84C', letterSpacing: 2.5 },
  row:         { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  unread:      { backgroundColor: 'rgba(201,168,76,0.04)' },
  iconWrap:    { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(201,168,76,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 1 },
  content:     { flex: 1 },
  title:       { fontSize: 14, fontWeight: '600', color: '#F5F0E8', marginBottom: 2 },
  body:        { fontSize: 13, color: '#B8A882', lineHeight: 18, marginBottom: 4 },
  time:        { fontSize: 11, color: 'rgba(184,168,130,0.5)', letterSpacing: 0.3 },
  dot:             { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A84C', marginTop: 5, marginLeft: 8 },
  challengeActions:{ flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptBtn:       { backgroundColor: '#7DC87A22', borderWidth: 1, borderColor: '#7DC87A55', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  acceptBtnText:   { fontSize: 11, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
  declineBtn:      { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  declineBtnText:  { fontSize: 11, fontWeight: '700', color: '#7A6E58', letterSpacing: 1.5 },
  actionedText:    { fontSize: 11, color: 'rgba(184,168,130,0.4)', marginTop: 6, fontStyle: 'italic' },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText:   { fontSize: 16, fontWeight: '600', color: '#B8A882', marginTop: 16, marginBottom: 8 },
  emptySub:    { fontSize: 13, color: 'rgba(184,168,130,0.5)', textAlign: 'center', lineHeight: 19 },
});
