import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen({ navigation }) {
  const [password, setPassword]           = useState('');
  const [confirm, setConfirm]             = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }, 2000);
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>ACCOUNT SECURITY</Text>
          <Text style={s.title}>Set a new password</Text>
          <Text style={s.subtitle}>Choose a password at least 8 characters long.</Text>
        </View>

        {success ? (
          <View style={s.successBox}>
            <Ionicons name="checkmark-circle" size={48} color="#7DC87A" style={{ marginBottom: 12 }} />
            <Text style={s.successText}>Password updated!</Text>
            <Text style={s.successSub}>Taking you back to the app…</Text>
          </View>
        ) : (
          <>
            {/* New password */}
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="New Password"
                placeholderTextColor="#B8A88266"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn} activeOpacity={0.7}>
                <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color="#B8A882" />
              </TouchableOpacity>
            </View>

            {/* Confirm password */}
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="Confirm Password"
                placeholderTextColor="#B8A88266"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn} activeOpacity={0.7}>
                <Ionicons name={showConfirm ? 'eye' : 'eye-off'} size={18} color="#B8A882" />
              </TouchableOpacity>
            </View>

            {!!error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={s.btnText}>{loading ? 'UPDATING…' : 'SET PASSWORD'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#090F0A' },
  scroll:      { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  header:      { marginTop: 80, marginBottom: 36 },
  eyebrow:     { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4, marginBottom: 8 },
  title:       { fontSize: 24, fontWeight: '600', color: '#F5EDD8', marginBottom: 8 },
  subtitle:    { fontSize: 14, color: '#B8A882', lineHeight: 20 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: 'rgba(125,200,122,0.2)', borderRadius: 12, marginBottom: 12 },
  input:       { flex: 1, padding: 16, color: '#F5EDD8', fontSize: 16 },
  eyeBtn:      { paddingHorizontal: 14, paddingVertical: 16 },
  errorText:   { fontSize: 13, color: '#C07A6A', marginBottom: 14, textAlign: 'center' },
  btn:         { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { fontSize: 13, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  successBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  successText: { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 8 },
  successSub:  { fontSize: 14, color: '#B8A882' },
});
