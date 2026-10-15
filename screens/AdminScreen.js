// ─── AdminScreen — review queue for tournament applications, sponsor ────────
// inquiries, and course certification requests. Gated by
// profiles.account_type === 'admin' (both here and via RLS on the tables
// themselves — this screen is a convenience, not the security boundary).

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COLOR } from '../lib/theme';

const { bg: BG, surface: CARD, gold: GOLD, cream: CREAM, muted: MUTED, dim: DIM, green: GREEN, red: RED_WARN, border: BORDER } = COLOR;

const TABS = [
  { key: 'applications', label: 'APPLICATIONS', table: 'tournament_applications' },
  { key: 'sponsors',     label: 'SPONSORS',     table: 'sponsor_inquiries' },
  { key: 'courses',      label: 'COURSES',      table: 'course_certification_inquiries' },
];

function statusColor(status) {
  if (['accepted', 'certified', 'contacted'].includes(status)) return GREEN;
  if (['rejected', 'declined', 'closed'].includes(status)) return RED_WARN;
  if (status === 'waitlisted') return GOLD;
  return MUTED; // pending
}

export default function AdminScreen({ navigation }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('applications');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const activeTab = TABS.find(t => t.key === tab);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from(activeTab.table)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error) setItems(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [activeTab.table]);

  useEffect(() => { setLoading(true); load(); }, [tab]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const updateStatus = async (id, status, extra = {}) => {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from(activeTab.table)
        .update({ status, reviewed_at: new Date().toISOString(), ...extra })
        .eq('id', id);
      if (error) throw error;
      setItems(prev => prev.map(it => it.id === id ? { ...it, status, ...extra } : it));
    } catch (e) {
      Alert.alert('Could not update', e.message ?? 'Please try again.');
    }
    setBusyId(null);
  };

  const certifyCourse = async (item) => {
    setBusyId(item.id);
    try {
      if (item.existing_course_id) {
        await supabase.from('courses').update({
          clocked_certified: true,
          certified_at: new Date().toISOString(),
        }).eq('id', item.existing_course_id);
      }
      await updateStatus(item.id, 'certified');
    } catch (e) {
      Alert.alert('Could not certify', e.message ?? 'Please try again.');
    }
    setBusyId(null);
  };

  if (profile && profile.account_type !== 'admin') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={28} color={DIM} />
          <Text style={s.deniedText}>Admins only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color={GOLD} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>ADMIN</Text>
        <View style={s.headerBtn} />
      </View>

      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={GOLD} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        >
          {items.length === 0 && (
            <Text style={s.emptyText}>Nothing here yet.</Text>
          )}
          {items.map((item) => (
            <View key={item.id} style={s.card}>
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle} numberOfLines={1}>
                  {tab === 'applications' ? item.team_name : tab === 'sponsors' ? item.company : item.course_name}
                </Text>
                <View style={[s.statusPill, { borderColor: statusColor(item.status) }]}>
                  <Text style={[s.statusPillText, { color: statusColor(item.status) }]}>{item.status?.toUpperCase()}</Text>
                </View>
              </View>

              {tab === 'applications' && (
                <>
                  <Text style={s.cardLine}>{item.player1_name} & {item.player2_name}</Text>
                  <Text style={s.cardMeta}>{item.contact_email} · {item.tournament_slug}</Text>
                  {!!item.why_compete && <Text style={s.cardBody} numberOfLines={4}>{item.why_compete}</Text>}
                </>
              )}
              {tab === 'sponsors' && (
                <>
                  <Text style={s.cardLine}>{item.full_name}{item.tier ? ` · ${item.tier}` : ''}</Text>
                  <Text style={s.cardMeta}>{item.email}{item.phone ? ` · ${item.phone}` : ''}</Text>
                  {!!item.message && <Text style={s.cardBody} numberOfLines={4}>{item.message}</Text>}
                </>
              )}
              {tab === 'courses' && (
                <>
                  <Text style={s.cardLine}>{item.contact_name}{item.role ? ` · ${item.role}` : ''}</Text>
                  <Text style={s.cardMeta}>
                    {item.email}{item.city ? ` · ${item.city}${item.state ? `, ${item.state}` : ''}` : ''}
                    {item.existing_course_id ? ' · matched in database' : ''}
                  </Text>
                  {!!item.message && <Text style={s.cardBody} numberOfLines={4}>{item.message}</Text>}
                </>
              )}

              <Text style={s.cardDate}>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>

              {item.status === 'pending' && (
                <View style={s.actionsRow}>
                  {tab === 'applications' && (
                    <>
                      <ActionBtn label="ACCEPT" color={GREEN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'accepted')} />
                      <ActionBtn label="WAITLIST" color={GOLD} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'waitlisted')} />
                      <ActionBtn label="REJECT" color={RED_WARN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'rejected')} />
                    </>
                  )}
                  {tab === 'sponsors' && (
                    <>
                      <ActionBtn label="CONTACTED" color={GREEN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'contacted')} />
                      <ActionBtn label="CLOSE" color={RED_WARN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'closed')} />
                    </>
                  )}
                  {tab === 'courses' && (
                    <>
                      <ActionBtn label="CERTIFY" color={GOLD} busy={busyId === item.id} onPress={() => certifyCourse(item)} />
                      <ActionBtn label="CONTACTED" color={GREEN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'contacted')} />
                      <ActionBtn label="DECLINE" color={RED_WARN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'declined')} />
                    </>
                  )}
                </View>
              )}
              {tab === 'courses' && item.status === 'contacted' && (
                <View style={s.actionsRow}>
                  <ActionBtn label="CERTIFY" color={GOLD} busy={busyId === item.id} onPress={() => certifyCourse(item)} />
                  <ActionBtn label="DECLINE" color={RED_WARN} busy={busyId === item.id} onPress={() => updateStatus(item.id, 'declined')} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ActionBtn({ label, color, busy, onPress }) {
  return (
    <TouchableOpacity style={[s.actionBtn, { borderColor: color }]} onPress={onPress} disabled={busy} activeOpacity={0.8}>
      {busy ? <ActivityIndicator size="small" color={color} /> : <Text style={[s.actionBtnText, { color }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: BG },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  deniedText:  { fontSize: 13, color: DIM, fontWeight: '600' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10 },
  headerBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 12, fontWeight: '700', color: GOLD, letterSpacing: 4 },

  tabBar:      { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab:         { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  tabActive:   { backgroundColor: '#1E4825', borderColor: GOLD },
  tabText:     { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 1 },
  tabTextActive: { color: GOLD },

  emptyText:   { textAlign: 'center', color: DIM, fontSize: 13, marginTop: 40 },

  card:        { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 12 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  cardTitle:   { flex: 1, fontSize: 14, fontWeight: '700', color: CREAM },
  statusPill:  { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  cardLine:    { fontSize: 12, color: MUTED, fontWeight: '600', marginBottom: 2 },
  cardMeta:    { fontSize: 11, color: DIM, marginBottom: 6 },
  cardBody:    { fontSize: 12, color: MUTED, lineHeight: 18, marginBottom: 6 },
  cardDate:    { fontSize: 9, color: DIM, letterSpacing: 1 },

  actionsRow:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn:   { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  actionBtnText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
});
