// ─── SettingsScreen ──────────────────────────────────────────────────────────
// Account, round preferences, admin (admins only), about, danger zone.
// Preferences write to the same places the setup wizard reads (profile
// preferred_difficulty, last-transport key) so they pre-fill the next round.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CLOCKED_LAST_TRANSPORT_KEY } from '../lib/clockedRoundConstants';
import { COLOR, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';

const DIFFS = [
  { key: 'beginner',     label: 'BEGINNER', color: COLOR.green },
  { key: 'intermediate', label: 'INTER.',   color: COLOR.amber },
  { key: 'pro',          label: 'PRO',      color: COLOR.red },
];
const SUPPORT_EMAIL = 'hello@clocked.golf';
const PRIVACY_URL = 'https://clocked.golf/privacy_policy';
const TERMS_URL   = 'https://clocked.golf/terms_of_service';

export default function SettingsScreen({ navigation }) {
  const { user, profile, refreshProfile } = useAuth();
  const [difficulty, setDifficulty] = useState(profile?.preferred_difficulty ?? 'intermediate');
  const [transport, setTransport]   = useState('Cart');
  const version = Constants.expoConfig?.version ?? Constants.manifest?.version ?? '';

  useEffect(() => {
    AsyncStorage.getItem(CLOCKED_LAST_TRANSPORT_KEY).then(v => { if (v) setTransport(v); }).catch(() => {});
  }, []);

  const pickDifficulty = async (key) => {
    setDifficulty(key);
    if (!user?.id) return;
    const { error } = await supabase.from('profiles').update({ preferred_difficulty: key }).eq('id', user.id);
    if (error) Alert.alert('Preference not saved', 'Check your connection and try again.');
    else refreshProfile?.();
  };
  const pickTransport = (t) => {
    setTransport(t);
    AsyncStorage.setItem(CLOCKED_LAST_TRANSPORT_KEY, t).catch(() => {});
  };

  const openUrl = (url) => Linking.openURL(url).catch(() => Alert.alert('Could not open link', url));

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const handleDeleteAccount = async () => {
    try {
      await supabase.from('rounds').delete().eq('user_id', user.id);
      await supabase.from('follows').delete().eq('follower_id', user.id);
      await supabase.from('follows').delete().eq('following_id', user.id);
      await supabase.from('activity_feed').delete().eq('user_id', user.id);
      await supabase.from('activity_likes').delete().eq('user_id', user.id);
      await supabase.from('activity_comments').delete().eq('user_id', user.id);
      await supabase.from('course_reviews').delete().eq('user_id', user.id);
      await supabase.from('profiles').delete().eq('id', user.id);
      await supabase.rpc('delete_user');
      await supabase.auth.signOut();
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch (e) {
      Alert.alert('Account not deleted', `Something stopped the deletion. Email ${SUPPORT_EMAIL} and we will remove it for you.`);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data including your Clocked Score history, rounds, and profile. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete My Account', style: 'destructive', onPress: handleDeleteAccount },
      ]
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="SETTINGS" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.card}>
          <Row icon="person-outline" label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} chevron />
          <View style={s.divider} />
          <Row icon="log-out-outline" label="Sign Out" onPress={confirmSignOut} />
        </View>

        <Text style={s.sectionLabel}>ROUND DEFAULTS</Text>
        <View style={s.card}>
          <View style={s.prefBlock}>
            <Text style={s.prefLabel}>SHOT CLOCK DIFFICULTY</Text>
            <View style={s.segRow}>
              {DIFFS.map(d => (
                <TouchableOpacity key={d.key} style={[s.seg, difficulty === d.key && s.segOn]} onPress={() => pickDifficulty(d.key)} activeOpacity={0.8}>
                  <View style={[s.segDot, { backgroundColor: d.color }]} />
                  <Text style={[s.segText, difficulty === d.key && s.segTextOn]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.prefBlock}>
            <Text style={s.prefLabel}>GETTING AROUND</Text>
            <View style={s.segRow}>
              {['Walking', 'Cart'].map(t => (
                <TouchableOpacity key={t} style={[s.seg, transport === t && s.segOn]} onPress={() => pickTransport(t)} activeOpacity={0.8}>
                  <Ionicons name={t === 'Walking' ? 'walk-outline' : 'car-outline'} size={14} color={transport === t ? COLOR.gold : COLOR.dim} />
                  <Text style={[s.segText, transport === t && s.segTextOn]}>{t.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={s.divider} />
          <Row icon="notifications-outline" label="Notifications" sub="Managed in iOS Settings" onPress={() => Linking.openSettings()} chevron />
        </View>

        {profile?.account_type === 'admin' && (
          <>
            <Text style={s.sectionLabel}>ADMIN</Text>
            <View style={s.card}>
              <Row icon="shield-checkmark-outline" label="Review Queue" onPress={() => navigation.navigate('Admin')} chevron />
            </View>
          </>
        )}

        <Text style={s.sectionLabel}>ABOUT</Text>
        <View style={s.card}>
          <Row icon="book-outline" label="The Rules" onPress={() => navigation.navigate('RulesScreen')} chevron />
          <View style={s.divider} />
          <Row icon="mail-outline" label="Contact" sub={SUPPORT_EMAIL} onPress={() => openUrl(`mailto:${SUPPORT_EMAIL}`)} chevron />
          <View style={s.divider} />
          <Row icon="lock-closed-outline" label="Privacy Policy" onPress={() => openUrl(PRIVACY_URL)} chevron external />
          <View style={s.divider} />
          <Row icon="document-text-outline" label="Terms of Service" onPress={() => openUrl(TERMS_URL)} chevron external />
          <View style={s.divider} />
          <View style={s.row}>
            <Ionicons name="information-circle-outline" size={20} color={COLOR.gold} style={s.rowIcon} />
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowValue}>{version}</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>DANGER ZONE</Text>
        <TouchableOpacity style={s.dangerCard} onPress={confirmDelete} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={20} color={COLOR.red} style={s.rowIcon} />
          <View style={{ flex: 1 }}>
            <Text style={s.dangerLabel}>Delete Account</Text>
            <Text style={s.dangerSub}>Permanently removes all your data</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLOR.red + '88'} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, sub, onPress, chevron, external }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={COLOR.gold} style={s.rowIcon} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {!!sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {chevron && <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={16} color={COLOR.dim} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOR.bg },
  title:        { fontSize: 12, fontWeight: '700', color: COLOR.gold, letterSpacing: 3 },
  body:         { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginTop: 26, marginBottom: 10 },
  card:         { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  rowIcon:      { marginRight: 14 },
  rowLabel:     { fontSize: 16, color: COLOR.cream },
  rowSub:       { fontSize: 12, color: COLOR.dim, marginTop: 2 },
  rowValue:     { fontSize: 14, color: COLOR.muted, fontVariant: ['tabular-nums'] },
  divider:      { height: 1, backgroundColor: COLOR.border, marginLeft: 50 },
  prefBlock:    { paddingHorizontal: 16, paddingVertical: 14 },
  prefLabel:    { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 10 },
  segRow:       { flexDirection: 'row', gap: 8 },
  seg:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLOR.border },
  segOn:        { borderColor: COLOR.gold, backgroundColor: '#C9A84C14' },
  segDot:       { width: 7, height: 7, borderRadius: RADIUS.xs },
  segText:      { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  segTextOn:    { color: COLOR.cream },
  dangerCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A0F0F', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.red + '44', paddingHorizontal: 16, paddingVertical: 15 },
  dangerLabel:  { fontSize: 16, color: COLOR.red },
  dangerSub:    { fontSize: 12, color: COLOR.dim, marginTop: 2 },
});
