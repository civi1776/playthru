import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import InitialsAvatar from '../components/InitialsAvatar';

function Field({ label, children }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function EditProfileScreen({ navigation }) {
  const { user, profile, refreshProfile } = useAuth();

  const nameParts = (profile?.full_name ?? '').trim().split(/\s+/);
  const [firstName,  setFirstName]  = useState(profile?.first_name  ?? nameParts[0] ?? '');
  const [lastName,   setLastName]   = useState(profile?.last_name   ?? nameParts.slice(1).join(' ') ?? '');
  const [username,   setUsername]   = useState(profile?.username    ?? '');
  const [email,      setEmail]      = useState(user?.email          ?? '');
  const [homeCourse, setHomeCourse] = useState(profile?.home_course  ?? '');
  const [country,    setCountry]    = useState(profile?.home_country ?? '');
  const [handicap,   setHandicap]   = useState(profile?.handicap != null ? String(profile.handicap) : '');
  const [bio,        setBio]        = useState(profile?.bio          ?? '');

  const [avatarUrl, setAvatarUrl]       = useState(profile?.avatar_url ?? null);
  const [uploading, setUploading]       = useState(false);

  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');

  // 'idle' | 'checking' | 'ok' | 'taken'
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const usernameTimer = useRef(null);

  const pickAndUploadAvatar = async () => {
    try {
      // 1. Get authoritative uid fresh — not from context (may be stale)
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authUser) {
        Alert.alert('Session expired', 'Please sign in again to upload a photo.');
        return;
      }

      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to set your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploading(true);
      const asset = result.assets[0];

      // 2. Build path from authUser.id ONLY
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const contentType = asset.mimeType ?? `image/${ext === 'png' ? 'png' : 'jpeg'}`;
      const filePath = `${authUser.id}/avatar.${ext}`;


      // Decode base64 to binary
      const base64Data = asset.base64;
      if (!base64Data) throw new Error('No image data returned from picker');

      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      // 4. Upload with explicit contentType + upsert
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes, { contentType, upsert: true });

      if (upErr) {
        Alert.alert('Upload failed', upErr.message);
        return;
      }

      // 5. Get public URL, cache-bust, save to profile
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        Alert.alert('Error', 'Could not get image URL.');
        return;
      }

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', authUser.id);
      setAvatarUrl(publicUrl);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Error', 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed === (profile?.username ?? '').toLowerCase()) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', trimmed)
          .neq('id', user.id)
          .maybeSingle();
        setUsernameStatus(data ? 'taken' : 'ok');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
    return () => clearTimeout(usernameTimer.current);
  }, [username]);

  const handleSave = async () => {
    setError('');
    setSuccess('');

    const trimmedFirst    = firstName.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedFirst)                  { setError('First name is required.');            return; }
    if (!trimmedUsername)               { setError('Username is required.');               return; }
    if (usernameStatus === 'taken')     { setError('That username is already taken.');     return; }
    if (usernameStatus === 'checking')  { setError('Still checking username availability.'); return; }

    setSaving(true);
    try {
      const fullName = [trimmedFirst, lastName.trim()].filter(Boolean).join(' ');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name:    fullName,
          first_name:   trimmedFirst,
          last_name:    lastName.trim() || null,
          username:     trimmedUsername,
          home_course:  homeCourse.trim()  || null,
          home_country: country.trim()     || null,
          handicap:     handicap !== ''    ? parseFloat(handicap) : null,
          bio:          bio.trim()         || null,
        })
        .eq('id', user.id);

      if (profileError) {
        if (profileError.code === '23505') {
          setError('That username is already taken.');
        } else {
          setError('Could not save profile: ' + profileError.message);
        }
        return;
      }

      let successMsg = 'Profile updated successfully.';

      const trimmedEmail = email.trim().toLowerCase();
      if (trimmedEmail && trimmedEmail !== (user?.email ?? '').toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (emailError) {
          setError('Profile saved, but email update failed: ' + emailError.message);
          await refreshProfile();
          return;
        }
        successMsg = `Profile updated. Confirmation email sent to ${trimmedEmail}.`;
      }

      await refreshProfile();
      setSuccess(successMsg);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const usernameHint = () => {
    if (usernameStatus === 'checking') return { text: 'Checking availability...', color: '#B8A882' };
    if (usernameStatus === 'ok')       return { text: '✓ Available',              color: '#7DC87A' };
    if (usernameStatus === 'taken')    return { text: '✗ Already taken',          color: '#E05252' };
    return null;
  };
  const hint = usernameHint();

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={s.title}>EDIT PROFILE</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* Avatar picker */}
          <TouchableOpacity style={s.avatarPicker} onPress={pickAndUploadAvatar} disabled={uploading} activeOpacity={0.8}>
            <View style={s.avatarWrap}>
              <InitialsAvatar name={profile?.full_name} size={80} avatarUrl={avatarUrl} username={profile?.username} />
              <View style={s.avatarCameraBadge}>
                {uploading
                  ? <ActivityIndicator size="small" color="#090F0A" />
                  : <Ionicons name="camera" size={14} color="#090F0A" />
                }
              </View>
            </View>
            <Text style={s.avatarHint}>{avatarUrl ? 'Change photo' : 'Add photo'}</Text>
          </TouchableOpacity>

          <Field label="FIRST NAME">
            <TextInput
              style={s.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="#3A5C3C"
              autoCapitalize="words"
            />
          </Field>

          <Field label="LAST NAME">
            <TextInput
              style={s.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="#3A5C3C"
              autoCapitalize="words"
            />
          </Field>

          <Field label="USERNAME">
            <TextInput
              style={s.input}
              value={username}
              onChangeText={v => setUsername(v.replace(/[^a-zA-Z0-9_.]/g, ''))}
              placeholder="username"
              placeholderTextColor="#3A5C3C"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {hint && <Text style={[s.hint, { color: hint.color }]}>{hint.text}</Text>}
          </Field>

          <Field label="EMAIL">
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor="#3A5C3C"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={s.fieldNote}>Changing your email sends a confirmation link to the new address.</Text>
          </Field>

          <Field label="HOME COURSE">
            <TextInput
              style={s.input}
              value={homeCourse}
              onChangeText={setHomeCourse}
              placeholder="Course name"
              placeholderTextColor="#3A5C3C"
            />
          </Field>

          <Field label="COUNTRY">
            <TextInput
              style={s.input}
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor="#3A5C3C"
            />
          </Field>

          <Field label="HANDICAP (MANUAL OVERRIDE)">
            <TextInput
              style={s.input}
              value={handicap}
              onChangeText={setHandicap}
              placeholder="e.g. 12.4"
              placeholderTextColor="#3A5C3C"
              keyboardType="decimal-pad"
            />
            <Text style={s.fieldNote}>Overrides your calculated handicap index.</Text>
          </Field>

          <Field label="BIO">
            <TextInput
              style={[s.input, s.inputMulti]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell other golfers about yourself..."
              placeholderTextColor="#3A5C3C"
              multiline
              numberOfLines={4}
            />
          </Field>

          {!!error   && <Text style={s.errorText}>{error}</Text>}
          {!!success && <Text style={s.successText}>{success}</Text>}

          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#090F0A" />
              : <Text style={s.saveBtnText}>SAVE CHANGES</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0A1A0C' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1A2E1C' },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  body:        { padding: 20, paddingBottom: 60 },
  avatarPicker:    { alignItems: 'center', marginBottom: 24 },
  avatarWrap:      { position: 'relative' },
  avatarCameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0A1A0C' },
  avatarHint:      { fontSize: 11, color: '#C9A84C', marginTop: 8 },
  fieldGroup:  { marginBottom: 22 },
  fieldLabel:  { fontSize: 9, fontWeight: '700', color: '#5A7A5C', letterSpacing: 2, marginBottom: 8 },
  input:       { backgroundColor: '#0F2312', borderWidth: 1, borderColor: '#1E3320', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: '#E8DCC8', fontSize: 15 },
  inputMulti:  { height: 100, textAlignVertical: 'top', paddingTop: 13 },
  hint:        { fontSize: 11, marginTop: 6, marginLeft: 2 },
  fieldNote:   { fontSize: 10, color: '#5A7A5C', marginTop: 6, lineHeight: 15 },
  errorText:   { fontSize: 13, color: '#E05252', textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  successText: { fontSize: 13, color: '#7DC87A', textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  saveBtn:     { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});
