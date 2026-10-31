import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLOR, RADIUS } from '../lib/theme';

export default function ForgotPasswordScreen({ navigation }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Email required', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: 'playthru://auth/callback',
      });
      if (error) {
        Alert.alert('Reset link not sent', error.message);
      } else {
        Alert.alert(
          'Check your email',
          `We sent a password reset link to ${trimmed}. Tap the link in the email to reset your password.`,
          [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }],
        );
      }
    } catch (e) {
      Alert.alert('Reset link not sent', e.message || 'Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Back */}
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.wordmark}>CLOCKED</Text>
          <Text style={s.title}>Reset Password</Text>
          <Text style={s.subtitle}>
            Enter your email and we'll send you a reset link.
          </Text>
        </View>

        {/* Email input */}
        <TextInput
          style={s.input}
          placeholder="Email Address"
          placeholderTextColor="#B8A88266"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />

        {/* Send button */}
        <TouchableOpacity
          style={[s.btn, (!email.trim() || loading) && s.btnDisabled]}
          onPress={handleSend}
          activeOpacity={0.8}
          disabled={!email.trim() || loading}
        >
          {loading
            ? <ActivityIndicator size="small" color={COLOR.bg} />
            : <Text style={s.btnText}>SEND RESET LINK</Text>
          }
        </TouchableOpacity>

        {/* Back to sign in */}
        <TouchableOpacity
          style={s.backLink}
          onPress={() => navigation.navigate('SignIn')}
          activeOpacity={0.7}
        >
          <Text style={s.backLinkText}>Back to Sign In</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOR.bg },
  scroll:       { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 },
  backBtn:      { marginTop: 60, width: 40, height: 40, justifyContent: 'center' },
  backArrow:    { fontSize: 22, color: COLOR.gold },
  header:       { marginTop: 24, marginBottom: 36 },
  wordmark:     { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 5, marginBottom: 16 },
  title:        { fontSize: 26, fontWeight: '600', color: COLOR.cream, marginBottom: 8 },
  subtitle:     { fontSize: 14, color: COLOR.muted, lineHeight: 20 },
  input:        { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: 'rgba(125,200,122,0.2)', borderRadius: RADIUS.md, padding: 16, fontSize: 16, color: COLOR.cream, marginBottom: 16 },
  btn:          { backgroundColor: COLOR.gold, borderRadius: RADIUS.md, paddingVertical: 18, alignItems: 'center' },
  btnDisabled:  { opacity: 0.5 },
  btnText:      { fontSize: 13, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },
  backLink:     { marginTop: 24, alignItems: 'center', padding: 8 },
  backLinkText: { fontSize: 13, color: COLOR.muted },
});
