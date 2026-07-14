import UnderageScreen from './UnderageScreen';
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generateReferralCode, applyReferralCode } from '../lib/referrals';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = Array.from({ length: 31 }, (_, i) => String(i + 1));
const YEARS  = Array.from({ length: 110 }, (_, i) => String(new Date().getFullYear() - i));

// ─── Welcome email builder ────────────────────────────────────────────────────
function buildWelcomeEmail({ firstName, username, referralCode }) {
  const name = firstName || username || 'Golfer';
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#090F0A;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#0D1A0F;border-radius:16px;border:1px solid rgba(201,168,76,0.25);padding:40px 36px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#C9A84C;letter-spacing:5px;font-family:Arial,sans-serif;">CLOCKED GOLF</p>
    <p style="margin:0 0 28px;font-size:9px;color:rgba(201,168,76,0.5);letter-spacing:3px;font-family:Arial,sans-serif;">GOLF ON THE CLOCK</p>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:400;color:#F5EDD8;">Welcome, ${name}.</h1>
    <p style="margin:0 0 24px;font-size:13px;color:rgba(245,237,216,0.6);letter-spacing:1px;font-family:Arial,sans-serif;">YOUR ACCOUNT IS READY</p>
    <hr style="border:none;border-top:1px solid rgba(201,168,76,0.15);margin:0 0 24px;" />
    <p style="margin:0 0 20px;font-size:15px;color:#F5EDD8;line-height:1.6;">Log your first round to get your official Clocked Score and see where you rank nationally.</p>
    ${referralCode ? `
    <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:rgba(201,168,76,0.6);letter-spacing:3px;font-family:Arial,sans-serif;">YOUR REFERRAL CODE</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:4px;font-family:Arial,sans-serif;">${referralCode}</p>
      <p style="margin:6px 0 0;font-size:12px;color:rgba(245,237,216,0.5);font-family:Arial,sans-serif;">Share with friends.</p>
    </div>` : ''}
    <p style="margin:0 0 6px;font-size:12px;color:rgba(245,237,216,0.4);font-family:Arial,sans-serif;">Questions? <a href="mailto:hello@clocked.golf" style="color:#C9A84C;">hello@clocked.golf</a></p>
    <p style="margin:0;font-size:11px;color:rgba(245,237,216,0.25);font-family:Arial,sans-serif;">Clocked Golf</p>
  </div>
</body>
</html>`;
}

export default function SignUpScreen({ navigation }) {
  const { refreshProfile } = useAuth();

  // COPPA age gate
  const [ageGatePassed, setAgeGatePassed]   = useState(false);
  const [ageGateBlocked, setAgeGateBlocked] = useState(false);
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay]     = useState('');
  const [dobYear, setDobYear]   = useState('');
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Form fields
  const [fullName, setFullName]   = useState('');
  const [username, setUsername]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle|checking|ok|taken
  const [usernameHint, setUsernameHint]     = useState('');
  const usernameDebounce = useRef(null);

  // Pre-fill referral code from deep link
  useEffect(() => {
    AsyncStorage.getItem('pending_referral_code').then(code => {
      if (code) setReferralCodeInput(code);
    });
  }, []);

  // Username availability check
  useEffect(() => {
    const trimmed = username.replace('@', '').trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    if (usernameDebounce.current) clearTimeout(usernameDebounce.current);
    usernameDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles').select('id').eq('username', trimmed).maybeSingle();
      setUsernameStatus(data ? 'taken' : 'ok');
    }, 500);
    return () => { if (usernameDebounce.current) clearTimeout(usernameDebounce.current); };
  }, [username]);

  const getAge = (month, day, year) => {
    const m = MONTHS.indexOf(month);
    const d = parseInt(day, 10);
    const y = parseInt(year, 10);
    if (m < 0 || isNaN(d) || isNaN(y)) return 0;
    const dob = new Date(y, m, d);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) age--;
    return age;
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError('');
    try {
      const fullNameVal = fullName.trim();
      const usernameVal = username.replace('@', '').trim().toLowerCase();
      const emailVal    = email.trim();
      const passwordVal = password.trim();

      if (!fullNameVal) throw new Error('Please enter your name.');
      if (!usernameVal || usernameVal.length < 3) throw new Error('Username must be at least 3 characters.');
      if (!emailVal) throw new Error('Please enter your email.');
      if (passwordVal.length < 8) throw new Error('Password must be at least 8 characters.');
      if (usernameStatus === 'taken') throw new Error('That username is already taken.');

      // 1. Create auth account
      const { error: signUpError } = await supabase.auth.signUp({
        email: emailVal, password: passwordVal,
      });
      if (signUpError) {
        if (signUpError.message?.includes('already registered')) throw new Error('An account with this email already exists. Try signing in.');
        throw new Error('Could not create account. Please try again.');
      }

      // 2. Sign in immediately
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailVal, password: passwordVal,
      });
      if (signInError) throw new Error('Account created but sign-in failed. Try signing in manually.');

      const userId = signInData.session.user.id;

      // 3. Create profile
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        email: emailVal,
        full_name: fullNameVal,
        username: usernameVal,
        age_verified: true,
        account_type: 'golfer',
        tos_agreed_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (profileError) {
        if (profileError.code === '23505' && profileError.message?.includes('username')) {
          throw new Error('That username is already taken.');
        }
        throw new Error('Could not save your profile. Please try again.');
      }

      // 4. Generate referral code
      const refCode = generateReferralCode();
      await supabase.from('profiles').update({ referral_code: refCode }).eq('id', userId);

      // 5. Apply referral code if entered
      const trimmedRef = referralCodeInput.trim();
      if (trimmedRef) {
        applyReferralCode(trimmedRef, userId).catch(() => {});
        AsyncStorage.removeItem('pending_referral_code').catch(() => {});
      }

      // 6. Welcome notification
      supabase.from('notifications').insert({
        user_id: userId,
        type: 'welcome',
        title: 'Welcome to Clocked Golf',
        body: 'Log your first round to get your Clocked Score and see where you rank nationally.',
        read: false,
      }).catch(() => {});

      // 7. Welcome email (fire-and-forget)
      const nameParts = fullNameVal.split(' ');
      supabase.functions.invoke('send-email', {
        body: {
          to: emailVal,
          subject: "Welcome to Clocked Golf",
          html: buildWelcomeEmail({
            firstName: nameParts[0] || '',
            username: usernameVal,
            referralCode: refCode,
          }),
        },
      }).catch(() => {});

      await refreshProfile();
      navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── COPPA age gate ──
  if (ageGateBlocked) return <UnderageScreen />;

  if (!ageGatePassed) {
    const canContinue = dobMonth !== '' && dobDay !== '' && dobYear !== '';
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#F5EDD8" />
        </TouchableOpacity>
        <View style={s.ageGateContent}>
          <Text style={s.ageTitle}>When were you born?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[s.selectorBtn, { flex: 2 }]} onPress={() => setActiveDropdown(activeDropdown === 'month' ? null : 'month')} activeOpacity={0.8}>
              <Text style={[s.selectorText, !dobMonth && s.selectorPlaceholder]}>{dobMonth || 'Month'}</Text>
              <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.selectorBtn, { flex: 1 }]} onPress={() => setActiveDropdown(activeDropdown === 'day' ? null : 'day')} activeOpacity={0.8}>
              <Text style={[s.selectorText, !dobDay && s.selectorPlaceholder]}>{dobDay || 'Day'}</Text>
              <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
            </TouchableOpacity>
            <TouchableOpacity style={[s.selectorBtn, { flex: 2 }]} onPress={() => setActiveDropdown(activeDropdown === 'year' ? null : 'year')} activeOpacity={0.8}>
              <Text style={[s.selectorText, !dobYear && s.selectorPlaceholder]}>{dobYear || 'Year'}</Text>
              <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
            </TouchableOpacity>
          </View>
          {activeDropdown && (
            <View style={s.dropdownList}>
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                {(activeDropdown === 'month' ? MONTHS : activeDropdown === 'day' ? DAYS : YEARS).map(val => {
                  const current = activeDropdown === 'month' ? dobMonth : activeDropdown === 'day' ? dobDay : dobYear;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[s.dropdownItem, current === val && s.dropdownItemActive]}
                      onPress={() => {
                        if (activeDropdown === 'month') setDobMonth(val);
                        else if (activeDropdown === 'day') setDobDay(val);
                        else setDobYear(val);
                        setActiveDropdown(null);
                      }}
                    >
                      <Text style={[s.dropdownItemText, current === val && s.dropdownItemTextActive]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <Text style={s.ageNote}>We use this to verify you meet the minimum age requirement.</Text>
          <TouchableOpacity
            style={[s.primaryBtn, !canContinue && s.primaryBtnDisabled]}
            onPress={() => {
              if (!canContinue) return;
              if (getAge(dobMonth, dobDay, dobYear) < 13) {
                setActiveDropdown(null);
                setAgeGateBlocked(true);
              } else {
                setActiveDropdown(null);
                setAgeGatePassed(true);
              }
            }}
            disabled={!canContinue}
            activeOpacity={0.8}
          >
            <Text style={s.primaryBtnText}>CONTINUE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main signup form ──
  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.wordmark}>CLOCKED</Text>

          <Text style={s.headline}>Create your account.</Text>
          <Text style={s.subhead}>30 seconds. Then you're on the clock.</Text>

          {/* Full Name */}
          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>FULL NAME</Text>
            <TextInput
              style={s.input}
              placeholder="Your name"
              placeholderTextColor="#7A6E58"
              autoCapitalize="words"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          {/* Username */}
          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>USERNAME</Text>
            <TextInput
              style={s.input}
              placeholder="@yourhandle"
              placeholderTextColor="#7A6E58"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(raw) => {
                const sanitized = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
                setUsername(sanitized);
                setUsernameHint(raw !== sanitized ? 'Letters, numbers, underscores only' : '');
              }}
            />
            {usernameHint ? <Text style={s.fieldHint}>{usernameHint}</Text> : null}
            {usernameStatus === 'taken' && (
              <Text style={s.fieldError}>Username is taken</Text>
            )}
            {usernameStatus === 'ok' && (
              <Text style={s.fieldOk}>Available</Text>
            )}
          </View>

          {/* Email */}
          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>EMAIL</Text>
            <TextInput
              style={s.input}
              placeholder="you@email.com"
              placeholderTextColor="#7A6E58"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Password */}
          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>PASSWORD</Text>
            <TextInput
              style={s.input}
              placeholder="Min. 8 characters"
              placeholderTextColor="#7A6E58"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Referral code (optional, subtle) */}
          <View style={s.inputWrap}>
            <Text style={[s.inputLabel, { color: '#7A6E58' }]}>REFERRAL CODE (OPTIONAL)</Text>
            <TextInput
              style={s.input}
              placeholder="Enter code"
              placeholderTextColor="#7A6E5844"
              autoCapitalize="characters"
              autoCorrect={false}
              value={referralCodeInput}
              onChangeText={setReferralCodeInput}
            />
          </View>

          {/* Error */}
          {error ? <Text style={s.error}>{error}</Text> : null}

          {/* Create Account */}
          <TouchableOpacity
            style={[s.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={handleSignUp}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>
              {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
            </Text>
          </TouchableOpacity>

          {/* Sign in link */}
          <TouchableOpacity style={s.signInLink} onPress={() => navigation.navigate('SignIn')}>
            <Text style={s.signInText}>
              Already have an account?<Text style={{ color: '#C9A84C' }}> Sign in</Text>
            </Text>
          </TouchableOpacity>

          {/* Terms */}
          <Text style={s.terms}>
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  backBtn:      { position: 'absolute', top: 60, left: 16, zIndex: 10, width: 40, height: 40, justifyContent: 'center' },

  // Wordmark + headlines
  wordmark:     { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4, marginBottom: 48, textAlign: 'center' },
  headline:     { fontSize: 28, fontWeight: '300', color: '#F5EDD8', marginBottom: 8, lineHeight: 36 },
  subhead:      { fontSize: 14, color: '#7A6E58', marginBottom: 40 },

  // Inputs
  inputWrap:    { marginBottom: 20 },
  inputLabel:   { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 8 },
  input:        { backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, color: '#F5EDD8', fontSize: 15 },
  fieldError:   { fontSize: 11, color: '#E85D4A', marginTop: 4 },
  fieldOk:      { fontSize: 11, color: '#7DC87A', marginTop: 4 },
  fieldHint:    { fontSize: 11, color: '#C9A84C88', marginTop: 4 },

  // Error
  error:        { color: '#E85D4A', fontSize: 13, marginBottom: 16 },

  // Primary button
  primaryBtn:       { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnDisabled:{ opacity: 0.4 },
  primaryBtnText:   { fontSize: 14, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },

  // Links
  signInLink:   { marginTop: 24, alignItems: 'center' },
  signInText:   { fontSize: 13, color: '#7A6E58' },
  terms:        { fontSize: 10, color: '#7A6E5888', textAlign: 'center', marginTop: 24, lineHeight: 16 },

  // Age gate
  ageGateContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  ageTitle:       { fontSize: 22, fontWeight: '600', color: '#F5EDD8', marginBottom: 12 },
  ageNote:        { fontSize: 12, color: '#7A6E58', marginTop: 16, marginBottom: 24, lineHeight: 18 },

  // DOB selectors
  selectorBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A22', paddingHorizontal: 14, paddingVertical: 12 },
  selectorText:      { fontSize: 15, color: '#F5EDD8' },
  selectorPlaceholder:{ color: '#7A6E58' },
  dropdownList:      { backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C33', marginTop: 8, overflow: 'hidden' },
  dropdownItem:      { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  dropdownItemActive:{ backgroundColor: '#C9A84C22' },
  dropdownItemText:  { fontSize: 14, color: '#F5EDD8' },
  dropdownItemTextActive: { color: '#C9A84C', fontWeight: '600' },
});
