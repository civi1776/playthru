// ─── Tournament Apply — team sign-up for Clocked at the Par 3 ───────────────
// The same inputs as the sign-up form on clocked.golf: a team name, and for
// each of the two players a full name, email and phone. Social tags are
// optional. Player 1 is the signed-in user (name and email prefilled from the
// profile, editable). Submits to the tournament-apply edge function, which
// writes the same table the website form writes and sends the same emails:
// a confirmation to each player and a notification to hello@clocked.golf.
import { useState } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COLOR, SPACING, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';
import { EVENT, EVENT_ENTRY_NOTE } from '../lib/event';

function Field({ label, children, note }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
      {note && <Text style={s.fieldNote}>{note}</Text>}
    </View>
  );
}

const PLACEHOLDER = '#3A5C3C';
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
// A phone number is anything with at least seven digits in it; the format is
// the player's own (spaces, dashes, a country code).
const isPhone = (v) => (v.match(/\d/g) ?? []).length >= 7;

// supabase-js reports a non-2xx reply as an error whose `context` is the raw
// Response. The function's own message ("Enter a valid email address for
// player 2.") is in that body, and it is the one worth showing.
async function serverMessage(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch { /* not JSON: fall through to the generic line */ }
  return null;
}

export default function TournamentApplyScreen({ navigation }) {
  const { user, profile } = useAuth();

  const [teamName, setTeamName]       = useState('');
  const [p1Name, setP1Name]           = useState(profile?.full_name || '');
  const [p1Email, setP1Email]         = useState(profile?.email || user?.email || '');
  const [p1Phone, setP1Phone]         = useState('');
  const [p1Instagram, setP1Instagram] = useState('');
  const [p2Name, setP2Name]           = useState('');
  const [p2Email, setP2Email]         = useState('');
  const [p2Phone, setP2Phone]         = useState('');
  const [p2Instagram, setP2Instagram] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [errorMsg, setErrorMsg]     = useState(null);

  // The first thing still missing, in form order, or null when it is complete.
  const missing = (() => {
    if (!teamName.trim())          return 'Add a team name.';
    if (!p1Name.trim())            return "Add player 1's full name.";
    if (!isEmail(p1Email.trim()))  return 'Enter a valid email address for player 1.';
    if (!isPhone(p1Phone))         return 'Enter a phone number for player 1.';
    if (!p2Name.trim())            return "Add player 2's full name.";
    if (!isEmail(p2Email.trim()))  return 'Enter a valid email address for player 2.';
    if (!isPhone(p2Phone))         return 'Enter a phone number for player 2.';
    return null;
  })();
  const canSubmit = !missing && !submitting;

  const handleSubmit = async () => {
    if (submitting) return;
    if (missing) { Alert.alert('Almost there', missing); return; }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('tournament-apply', {
        body: {
          form_version: 2,
          source: 'app',
          tournament_slug: EVENT.slug,
          team_name: teamName.trim(),
          // Player 1 is the team's contact, as on the website form.
          contact_email: p1Email.trim(),
          contact_phone: p1Phone.trim(),
          player1_name: p1Name.trim(),
          player1_instagram: p1Instagram.trim(),
          player1_username: profile?.username || null,
          player2_name: p2Name.trim(),
          player2_email: p2Email.trim(),
          player2_phone: p2Phone.trim(),
          player2_instagram: p2Instagram.trim(),
        },
      });
      if (error) throw new Error((await serverMessage(error)) || 'Could not submit your application. Check your connection and try again.');
      if (data?.error) throw new Error(data.error);
      setSubmitted(true);
    } catch (e) {
      setErrorMsg(e?.message || 'Could not submit your application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.successWrap}>
          <Ionicons name="checkmark-circle" size={48} color={COLOR.green} style={{ marginBottom: 20 }} />
          <Text style={s.successTitle}>Thanks for applying.</Text>
          <Text style={s.successBody}>
            A confirmation is on its way to each player's email. We read every application and hand-pick the field. If your team is in, we'll send further details upon entry. Nobody pays until they're in.
          </Text>
          <Text style={s.successClosing}>The game is yours. The clock is running.</Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => navigation.popTo('Main')} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="APPLY TO PLAY" onBack={() => navigation.goBack()} borderless />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Text style={s.eyebrow}>{EVENT.dateLabel.toUpperCase()} {'\u00B7'} {EVENT.venue.toUpperCase()}</Text>
          <Text style={s.title}>Sign up with your partner.</Text>
          <Text style={s.subtitle}>One sign-up per two-player team. {EVENT.teamCap}, hand-picked, with a waitlist. Each player gets a confirmation by email.</Text>

          <Field label="TEAM NAME">
            <TextInput style={s.input} value={teamName} onChangeText={setTeamName} placeholder="Your team name" placeholderTextColor={PLACEHOLDER} maxLength={120} returnKeyType="next" />
          </Field>

          <Text style={s.groupHeader}>PLAYER 1 · YOU</Text>
          <Field label="FULL NAME">
            <TextInput style={s.input} value={p1Name} onChangeText={setP1Name} placeholder="Full name" placeholderTextColor={PLACEHOLDER} autoCapitalize="words" textContentType="name" maxLength={120} />
          </Field>
          <Field label="EMAIL">
            <TextInput style={s.input} value={p1Email} onChangeText={setP1Email} placeholder="you@email.com" placeholderTextColor={PLACEHOLDER} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" maxLength={254} />
          </Field>
          <Field label="PHONE NUMBER">
            <TextInput style={s.input} value={p1Phone} onChangeText={setP1Phone} placeholder="(561) 555-0100" placeholderTextColor={PLACEHOLDER} keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={40} />
          </Field>
          <Field label="INSTAGRAM OR SOCIAL TAG (OPTIONAL)">
            <TextInput style={s.input} value={p1Instagram} onChangeText={setP1Instagram} placeholder="@handle" placeholderTextColor={PLACEHOLDER} autoCapitalize="none" autoCorrect={false} maxLength={80} />
          </Field>

          <Text style={s.groupHeader}>PLAYER 2 · YOUR PARTNER</Text>
          <Field label="FULL NAME">
            <TextInput style={s.input} value={p2Name} onChangeText={setP2Name} placeholder="Full name" placeholderTextColor={PLACEHOLDER} autoCapitalize="words" maxLength={120} />
          </Field>
          <Field label="EMAIL">
            <TextInput style={s.input} value={p2Email} onChangeText={setP2Email} placeholder="partner@email.com" placeholderTextColor={PLACEHOLDER} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} />
          </Field>
          <Field label="PHONE NUMBER">
            <TextInput style={s.input} value={p2Phone} onChangeText={setP2Phone} placeholder="(561) 555-0101" placeholderTextColor={PLACEHOLDER} keyboardType="phone-pad" maxLength={40} />
          </Field>
          <Field label="INSTAGRAM OR SOCIAL TAG (OPTIONAL)">
            <TextInput style={s.input} value={p2Instagram} onChangeText={setP2Instagram} placeholder="@handle" placeholderTextColor={PLACEHOLDER} autoCapitalize="none" autoCorrect={false} maxLength={80} />
          </Field>

          <Text style={s.entryNote}>{EVENT_ENTRY_NOTE} Applying does not guarantee a spot.</Text>

          {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}

          <TouchableOpacity
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
          >
            {submitting
              ? <ActivityIndicator color={COLOR.bg} />
              : <Text style={s.submitBtnText}>SUBMIT APPLICATION →</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOR.bg },
  scroll:       { paddingHorizontal: SPACING.lg, paddingBottom: 60 },

  eyebrow:      { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 10 },
  title:        { fontSize: 26, fontWeight: '300', color: COLOR.cream, marginBottom: 8 },
  subtitle:     { fontSize: 14, color: COLOR.muted, lineHeight: 20, marginBottom: 28 },

  groupHeader:  { fontSize: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5, marginTop: 8, marginBottom: 14 },

  fieldGroup:   { marginBottom: 18 },
  fieldLabel:   { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5, marginBottom: 8 },
  fieldNote:    { fontSize: 11, color: '#5A5344', marginTop: 6 },
  input:        { backgroundColor: '#0F2312', borderWidth: 1, borderColor: '#1E3320', borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, color: '#E8DCC8', fontSize: 15 },

  entryNote:    { fontSize: 13, color: COLOR.muted, lineHeight: 19, marginBottom: 20 },

  errorText:    { fontSize: 13, color: COLOR.red, marginBottom: 16, lineHeight: 19 },

  submitBtn:         { backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { fontSize: 12, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },

  successWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successTitle:    { fontSize: 26, fontWeight: '300', color: COLOR.gold, marginBottom: 16, textAlign: 'center' },
  successBody:     { fontSize: 15, color: COLOR.muted, lineHeight: 24, textAlign: 'center', marginBottom: 32 },
  successClosing:  { fontSize: 17, color: COLOR.cream, fontStyle: 'italic', textAlign: 'center', marginBottom: 40 },
  doneBtn:         { borderWidth: 1, borderColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, paddingHorizontal: 40 },
  doneBtnText:     { fontSize: 12, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
});
