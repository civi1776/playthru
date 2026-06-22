import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();

  const handleEditProfile = () => navigation.navigate('EditProfile');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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
      Alert.alert('Error', 'Could not delete account. Please contact hello@clocked.golf');
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
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={s.title}>SETTINGS</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.body}>
        {/* Account section */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={handleEditProfile} activeOpacity={0.7}>
            <Ionicons name="person-outline" size={20} color="#C9A84C" style={s.rowIcon} />
            <Text style={s.rowLabel}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={16} color="#4A5C4B" />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.row} onPress={handleSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color="#C9A84C" style={s.rowIcon} />
            <Text style={s.rowLabel}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={16} color="#4A5C4B" />
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <Text style={[s.sectionLabel, { marginTop: 32 }]}>DANGER ZONE</Text>
        <View style={[s.card, s.dangerCard]}>
          <TouchableOpacity style={s.row} onPress={confirmDelete} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color="#E05252" style={s.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: '#E05252' }]}>Delete Account</Text>
              <Text style={s.rowSub}>Permanently removes all your data</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#4A3B3B" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0A1A0C' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1A2E1C' },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  body:        { flex: 1, padding: 20 },
  sectionLabel:{ fontSize: 10, fontWeight: '700', color: '#5A7A5C', letterSpacing: 2, marginBottom: 8 },
  card:        { backgroundColor: '#0F2312', borderRadius: 14, borderWidth: 1, borderColor: '#1E3320', overflow: 'hidden' },
  dangerCard:  { borderColor: '#3B1E1E', backgroundColor: '#140F0F' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon:     { marginRight: 12 },
  rowLabel:    { flex: 1, fontSize: 15, color: '#E8DCC8', fontWeight: '500' },
  rowSub:      { fontSize: 11, color: '#7A6E58', marginTop: 2 },
  divider:     { height: 1, backgroundColor: '#1E3320', marginHorizontal: 16 },
});
