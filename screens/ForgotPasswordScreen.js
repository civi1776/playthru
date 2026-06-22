import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';

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
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: 'playthru://auth/callback',
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert(
        'Check your email',
        `We sent a password reset link to ${trimmed}. Tap the link in the email to reset your password.`,
        [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }],
      );
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
            ? <ActivityIndicator size="small" color="#090F0A" />
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
  container:    { flex: 1, backgroundColor: '#090F0A' },
  scroll:       { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 },
  backBtn:      { marginTop: 60, width: 40, height: 40, justifyContent: 'center' },
  backArrow:    { fontSize: 22, color: '#C9A84C' },
  header:       { marginTop: 24, marginBottom: 36 },
  wordmark:     { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 16 },
  title:        { fontSize: 26, fontWeight: '600', color: '#F5EDD8', marginBottom: 8 },
  subtitle:     { fontSize: 14, color: '#B8A882', lineHeight: 20 },
  input:        { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: 'rgba(125,200,122,0.2)', borderRadius: 12, padding: 16, fontSize: 16, color: '#F5EDD8', marginBottom: 16 },
  btn:          { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  btnDisabled:  { opacity: 0.5 },
  btnText:      { fontSize: 13, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  backLink:     { marginTop: 24, alignItems: 'center', padding: 8 },
  backLinkText: { fontSize: 13, color: '#B8A882' },
});
