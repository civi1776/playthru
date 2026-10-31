// ─── Tournament Apply — team invitation request for the first Clocked event ──
// Two-player team application (the website's /tournaments page collects
// individual interest via the website-forms function; both land in admin review). Player 1
// is always the signed-in user (name/handicap prefilled from their profile,
// editable) since applying in-app requires an account. Submits to the shared
// tournament-apply edge function — the same backend the website form posts
// to — so every application lands in one place for review.
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

function Field({ label, children, note }) {
  return (
    <View style={s.fieldGroup}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
      {note && <Text style={s.fieldNote}>{note}</Text>}
    </View>
  );
}

export default function TournamentApplyScreen({ navigation }) {
  const { user, profile } = useAuth();

  const [teamName, setTeamName]       = useState('');
  const [email, setEmail]             = useState(profile?.email || user?.email || '');
  const [p1Name, setP1Name]           = useState(profile?.full_name || '');
  const [p1Handicap, setP1Handicap]   = useState(profile?.handicap_index != null ? String(profile.handicap_index) : '');
  const [p1Sport, setP1Sport]         = useState('');
  const [p1Instagram, setP1Instagram] = useState('');
  const [p2Name, setP2Name]           = useState('');
  const [p2Handicap, setP2Handicap]   = useState('');
  const [p2Sport, setP2Sport]         = useState('');
  const [p2Instagram, setP2Instagram] = useState('');
  const [p2Username, setP2Username]   = useState('');
  const [whyCompete, setWhyCompete]   = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [errorMsg, setErrorMsg]     = useState(null);

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const canSubmit = teamName.trim() && isEmail(email.trim()) && p1Name.trim() && p1Sport.trim() && p2Name.trim() && p2Sport.trim() && whyCompete.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert('Missing info', 'Team name, email, both player names, the sport each player played, and why your team should compete are required.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('tournament-apply', {
        body: {
          source: 'app',
          tournament_slug: 'tournament-series',
          team_name: teamName.trim(),
          contact_email: email.trim(),
          player1_name: p1Name.trim(),
          player1_handicap: p1Handicap.trim(),
          player1_sport: p1Sport.trim(),
          player1_instagram: p1Instagram.trim(),
          player1_username: profile?.username || null,
          player2_name: p2Name.trim(),
          player2_handicap: p2Handicap.trim(),
          player2_sport: p2Sport.trim(),
          player2_instagram: p2Instagram.trim(),
          player2_username: p2Username.trim(),
          why_compete: whyCompete.trim(),
        },
      });
      if (error) throw error;
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
          <Text style={s.successTitle}>You're on the list.</Text>
          <Text style={s.successBody}>
            Your request has been received. We'll share the date, venue, and format for the first Clocked event in South Florida as they're set, and invitations go out from this list first. Requesting an invitation expresses interest and doesn't guarantee a spot.
          </Text>
          <Text style={s.successClosing}>The game is yours. The clock is running.</Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => navigation.navigate('Main')} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="REQUEST AN INVITATION" onBack={() => navigation.goBack()} borderless />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Text style={s.eyebrow}>REQUEST AN INVITATION</Text>
          <Text style={s.title}>The first Clocked event.</Text>
          <Text style={s.subtitle}>South Florida. Date and venue to be announced. Clocked tournaments are for athletes: tell us what you played, tell us about your game, and we'll reach out as details are set.</Text>

          <Field label="TEAM NAME">
            <TextInput style={s.input} value={teamName} onChangeText={setTeamName} placeholder="Your team name" placeholderTextColor="#3A5C3C" />
          </Field>

          <Field label="CONTACT EMAIL">
            <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="your@email.com" placeholderTextColor="#3A5C3C" autoCapitalize="none" keyboardType="email-address" />
          </Field>

          <Text style={s.groupHeader}>PLAYER 1 · YOU</Text>
          <Field label="FULL NAME">
            <TextInput style={s.input} value={p1Name} onChangeText={setP1Name} placeholder="Full name" placeholderTextColor="#3A5C3C" autoCapitalize="words" />
          </Field>
          <Field label="HANDICAP">
            <TextInput style={s.input} value={p1Handicap} onChangeText={setP1Handicap} placeholder="e.g. 4.2" placeholderTextColor="#3A5C3C" keyboardType="numbers-and-punctuation" />
          </Field>
          <Field label="SPORT YOU PLAYED" note="Any sport, any level. High school, college, club, rec league, or pro.">
            <TextInput style={s.input} value={p1Sport} onChangeText={setP1Sport} placeholder="Lacrosse, college" placeholderTextColor="#3A5C3C" autoCapitalize="words" />
          </Field>
          <Field label="INSTAGRAM (OPTIONAL)">
            <TextInput style={s.input} value={p1Instagram} onChangeText={setP1Instagram} placeholder="@handle" placeholderTextColor="#3A5C3C" autoCapitalize="none" />
          </Field>

          <Text style={s.groupHeader}>PLAYER 2 · YOUR PARTNER</Text>
          <Field label="FULL NAME">
            <TextInput style={s.input} value={p2Name} onChangeText={setP2Name} placeholder="Full name" placeholderTextColor="#3A5C3C" autoCapitalize="words" />
          </Field>
          <Field label="HANDICAP">
            <TextInput style={s.input} value={p2Handicap} onChangeText={setP2Handicap} placeholder="e.g. 8.7" placeholderTextColor="#3A5C3C" keyboardType="numbers-and-punctuation" />
          </Field>
          <Field label="SPORT THEY PLAYED" note="Any sport, any level.">
            <TextInput style={s.input} value={p2Sport} onChangeText={setP2Sport} placeholder="Soccer, high school" placeholderTextColor="#3A5C3C" autoCapitalize="words" />
          </Field>
          <Field label="INSTAGRAM (OPTIONAL)">
            <TextInput style={s.input} value={p2Instagram} onChangeText={setP2Instagram} placeholder="@handle" placeholderTextColor="#3A5C3C" autoCapitalize="none" />
          </Field>
          <Field label="CLOCKED GOLF USERNAME (OPTIONAL)" note="If your partner has the app.">
            <TextInput style={s.input} value={p2Username} onChangeText={setP2Username} placeholder="username" placeholderTextColor="#3A5C3C" autoCapitalize="none" />
          </Field>

          <Field label="WHY SHOULD YOUR TEAM COMPETE?">
            <TextInput
              style={[s.input, s.inputMulti]}
              value={whyCompete}
              onChangeText={setWhyCompete}
              placeholder="Tell us about your background, your game, and why you belong in this field."
              placeholderTextColor="#3A5C3C"
              multiline
              numberOfLines={4}
            />
          </Field>

          {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}

          <TouchableOpacity
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.85}
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
  inputMulti:   { minHeight: 100, textAlignVertical: 'top' },

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
