// ─── OnboardingScreen — "The Countdown" ──────────────────────────────────────
// Onboarding runs on the same visual signature as the shot clock itself: a
// ring that fills as you move through it. No typed forms where a tap will
// do. By the end the player knows what Clocked is, that the goal is global
// and achievable, has been welcomed into the athletic side of golf, has
// put a face on their profile, picked a home course and a league, has seen
// the national rules, and has been offered a shot at the first event.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Animated,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { searchCourses } from '../lib/courses';
import CountdownRing from '../components/CountdownRing';
import InitialsAvatar from '../components/InitialsAvatar';
import { pickAndUploadAvatar } from '../lib/avatarUpload';
import { COLOR, RADIUS } from '../lib/theme';

const { bg: BG, surface: CARD, gold: GOLD, goldBright: GOLD_BRIGHT, cream: CREAM, muted: MUTED, dim: DIM, green: GREEN, red: RED_WARN, border: BORDER } = COLOR;

const TOTAL_STEPS = 7;

const DIFFICULTIES = [
  { key: 'beginner',     label: 'BEGINNER',     pace: '~4:30', color: GREEN,  desc: 'Learning the clock. Generous time pars.' },
  { key: 'intermediate', label: 'INTERMEDIATE', pace: '~3:30', color: GOLD,   desc: 'Playing with real pressure.' },
  { key: 'pro',          label: 'PRO',          pace: '~3:00', color: RED_WARN, desc: 'No room for slow play. Full accountability.' },
];

export default function OnboardingScreen({ navigation }) {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [homeCourse, setHomeCourse] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [saving, setSaving] = useState(false);
  const progress = (step + 1) / TOTAL_STEPS;

  const fade = useRef(new Animated.Value(1)).current;
  const advance = useCallback((toStep) => {
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setStep(toStep);
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }, [fade]);

  const next = () => advance(Math.min(step + 1, TOTAL_STEPS - 1));

  const finishOnboarding = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    await refreshProfile?.();
  };

  const goToMain = async () => {
    await finishOnboarding();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const goApply = async () => {
    await finishOnboarding();
    navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'TournamentApply' }] });
  };

  const saveHomeCourse = async (course) => {
    setHomeCourse(course);
    if (user?.id && course?.name) {
      supabase.from('profiles').update({ home_course: course.name }).eq('id', user.id).then(() => {});
    }
    next();
  };

  const saveDifficulty = async (key) => {
    setDifficulty(key);
    if (user?.id) {
      supabase.from('profiles').update({ preferred_difficulty: key }).eq('id', user.id).then(() => {});
    }
    next();
  };

  return (
    <SafeAreaView style={st.container}>
      {/* Progress ring — top center, small. The signature element, scaled down. */}
      <View style={st.ringRow}>
        <CountdownRing progress={progress} size={40} strokeWidth={3} color={GOLD}>
          <Text style={st.ringStep}>{step + 1}</Text>
        </CountdownRing>
        {step < TOTAL_STEPS - 1 && (
          <TouchableOpacity onPress={goToMain} style={st.skipBtn} accessibilityLabel="Skip onboarding">
            <Text style={st.skipText}>SKIP</Text>
          </TouchableOpacity>
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fade }}>
        {step === 0 && <StepProblem onNext={next} />}
        {step === 1 && <StepFix onNext={next} />}
        {step === 2 && <StepPhoto profile={profile} avatarUrl={avatarUrl} onUploaded={(url) => { setAvatarUrl(url); refreshProfile?.(); }} onNext={next} />}
        {step === 3 && <StepHomeCourse selected={homeCourse} onSelect={saveHomeCourse} onSkip={next} />}
        {step === 4 && <StepDifficulty selected={difficulty} onSelect={saveDifficulty} />}
        {step === 5 && <StepRules onNext={next} />}
        {step === 6 && <StepWelcomeFinal onEnter={goToMain} />}
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Shared step chrome ──────────────────────────────────────────────────────
function StepShell({ eyebrow, headline, line, children, cta, onCta, ctaColor = GOLD }) {
  return (
    <View style={st.page}>
      <ScrollView contentContainerStyle={st.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={st.eyebrow}>{eyebrow}</Text>
        <Text style={st.headline}>{headline}</Text>
        {!!line && <Text style={st.line}>{line}</Text>}
        {children}
      </ScrollView>
      {cta && (
        <TouchableOpacity style={[st.ctaBtn, { backgroundColor: ctaColor }]} onPress={onCta} activeOpacity={0.85}>
          <Text style={st.ctaText}>{cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Step 0 — The Problem ────────────────────────────────────────────────────
function StepProblem({ onNext }) {
  return (
    <StepShell
      eyebrow="GOLF'S #1 COMPLAINT"
      headline="Golf has never had real accountability for pace."
      line="A typical 18 takes about four and a half hours. Nobody tracks it, nobody owns it. Until now."
      cta="CONTINUE →"
      onCta={onNext}
    >
      <View style={st.statBlock}>
        <Text style={[st.bigStat, { color: CREAM }]}>4½ hrs</Text>
        <Text style={st.bigStatLabel}>A TYPICAL ROUND TODAY</Text>
      </View>
    </StepShell>
  );
}

// ─── Step 1 — The Fix ────────────────────────────────────────────────────────
function StepFix({ onNext }) {
  return (
    <StepShell
      eyebrow="THE FIX"
      headline="We built the shot clock."
      line="Every hole has a time par. Every round earns one score, 0 to 100: part how you score, part how you beat the clock. This is golf for people who compete."
      cta="CONTINUE →"
      onCta={onNext}
    >
      <View style={st.splitRow}>
        <View style={st.splitItem}>
          <Text style={st.splitNum}>65%</Text>
          <Text style={st.splitLabel}>SCORING</Text>
        </View>
        <View style={st.splitItem}>
          <Text style={st.splitNum}>35%</Text>
          <Text style={st.splitLabel}>CLOCK</Text>
        </View>
      </View>
    </StepShell>
  );
}

// ─── Step 2 — The Vision ─────────────────────────────────────────────────────
function StepVision({ onNext }) {
  return (
    <StepShell
      eyebrow="THE VISION"
      headline="This starts in the U.S. It doesn't end there."
      line="Our signature tournaments — starting in South Florida — are the proving ground. The goal: one pace standard for every course and every golfer, everywhere the game is played."
      cta="CONTINUE →"
      onCta={onNext}
    />
  );
}

// ─── Step 3 — Welcome to the athletic side ───────────────────────────────────
function StepWelcome({ onNext }) {
  return (
    <StepShell
      eyebrow="WELCOME"
      headline="This isn't a casual round."
      line="Competitive golfers. Former athletes. Club champions. People who compete. You're one of them now."
      cta="I'M IN →"
      onCta={onNext}
    />
  );
}

// ─── Step 4 — Profile photo ──────────────────────────────────────────────────
// Leaderboards, rivalries and the feed all show the player's face; asking for
// it here means the first thing a new player posts already looks like them.
function StepPhoto({ profile, avatarUrl, onUploaded, onNext }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const pick = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await pickAndUploadAvatar();
      if (!res.cancelled) onUploaded(res.url);
    } catch (e) {
      setError(e?.message ?? 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={st.page}>
      <ScrollView contentContainerStyle={st.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={st.eyebrow}>SHOW YOUR FACE</Text>
        <Text style={st.headline}>Put a face on the board.</Text>
        <Text style={st.line}>Your photo shows on leaderboards, rivalries and the feed. Athletes don't hide behind initials.</Text>
        <TouchableOpacity style={st.photoWrap} onPress={pick} disabled={uploading} activeOpacity={0.85} accessibilityLabel={avatarUrl ? 'Change profile photo' : 'Add profile photo'}>
          <InitialsAvatar name={profile?.full_name} username={profile?.username} avatarUrl={avatarUrl} size={128} />
          <View style={st.photoBadge}>
            {uploading ? <ActivityIndicator size="small" color={BG} /> : <Ionicons name="camera" size={18} color={BG} />}
          </View>
        </TouchableOpacity>
        <Text style={st.photoHint}>{uploading ? 'UPLOADING…' : avatarUrl ? 'TAP TO CHANGE' : 'TAP TO ADD A PHOTO'}</Text>
        {!!error && <Text style={st.photoError}>{error}</Text>}
      </ScrollView>
      {avatarUrl ? (
        <TouchableOpacity style={[st.ctaBtn, { backgroundColor: GOLD }]} onPress={onNext} activeOpacity={0.85} disabled={uploading}>
          <Text style={st.ctaText}>LOOKS GOOD →</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity style={[st.ctaBtn, { backgroundColor: GOLD }]} onPress={pick} activeOpacity={0.85} disabled={uploading}>
            <Text style={st.ctaText}>{uploading ? 'UPLOADING…' : 'ADD A PHOTO'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.skipInline} onPress={onNext} activeOpacity={0.7} disabled={uploading}>
            <Text style={st.skipInlineText}>I'LL ADD ONE LATER</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Step 5 — Home course ────────────────────────────────────────────────────
function StepHomeCourse({ selected, onSelect, onSkip }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchCourses(query);
      setResults(r);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <View style={st.page}>
      <ScrollView contentContainerStyle={st.pageScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={st.eyebrow}>YOUR HOME TURF</Text>
        <Text style={st.headline}>Where do you usually play?</Text>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.searchWrap}>
            <Ionicons name="search" size={16} color={DIM} />
            <TextInput
              style={st.searchInput}
              placeholder="Search courses"
              placeholderTextColor={DIM}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {loading && <ActivityIndicator size="small" color={GOLD} />}
          </View>
          {results.map((c) => (
            <TouchableOpacity key={c.id ?? c.name} style={st.courseRow} onPress={() => onSelect(c)} activeOpacity={0.7}>
              <Text style={st.courseName} numberOfLines={1}>{c.name}</Text>
              {!!c.city && <Text style={st.courseMeta} numberOfLines={1}>{c.city}{c.state ? `, ${c.state}` : ''}</Text>}
            </TouchableOpacity>
          ))}
        </KeyboardAvoidingView>
      </ScrollView>
      <TouchableOpacity style={st.skipInline} onPress={onSkip} activeOpacity={0.7}>
        <Text style={st.skipInlineText}>I'LL SET THIS LATER</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 6 — Choose your league ─────────────────────────────────────────────
function StepDifficulty({ selected, onSelect }) {
  return (
    <View style={st.page}>
      <ScrollView contentContainerStyle={st.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={st.eyebrow}>CHOOSE YOUR LEAGUE</Text>
        <Text style={st.headline}>How do you want to compete?</Text>
        <Text style={st.line}>You can change this any time you set up a round.</Text>
        <View style={{ marginTop: 24, gap: 12, width: '100%' }}>
          {DIFFICULTIES.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[st.leagueCard, { borderColor: d.color + '55' }]}
              onPress={() => onSelect(d.key)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={[st.leagueLabel, { color: d.color }]}>{d.label}</Text>
                <Text style={st.leagueDesc}>{d.desc}</Text>
              </View>
              <Text style={[st.leaguePace, { color: d.color }]}>{d.pace}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Step 6 — The Rules ──────────────────────────────────────────────────────
function StepRules({ onNext }) {
  return (
    <StepShell
      eyebrow="HOW IT WORKS NATIONALLY"
      headline="The rules are the same for everyone."
      cta="CONTINUE →"
      onCta={onNext}
    >
      <View style={st.rulesList}>
        <RuleRow label="CLOCKED SCORE" value="Scoring 65% + Clock 35% = one number, 0–100" />
        <RuleRow label="TIERS" value="APEX 80+ · CONTENDER 65+ · GRINDER 40+ · ON TRIAL for your first 5 rounds" />
        <RuleRow label="COURSES" value="Ranked by real, verified pace, not popularity" />
        <RuleRow label="LEADERBOARD" value="One national board. Same rules, every course, every golfer" />
      </View>
    </StepShell>
  );
}

function RuleRow({ label, value }) {
  return (
    <View style={st.ruleRow}>
      <Text style={st.ruleLabel}>{label}</Text>
      <Text style={st.ruleValue}>{value}</Text>
    </View>
  );
}

// ─── Step 8 — The Invitation ─────────────────────────────────────────────────
function StepInvitation({ onApply, onLater, saving }) {
  return (
    <View style={st.page}>
      <ScrollView contentContainerStyle={st.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={st.eyebrow}>THE FIRST CLOCKED EVENT</Text>
        <Text style={st.headline}>Want in on the first one?</Text>
        <Text style={st.line}>The first Clocked tournament is coming to South Florida. Date and venue are still being set. Request an invitation now and you'll hear first — it expresses interest and doesn't guarantee a spot.</Text>
      </ScrollView>
      <View style={{ gap: 10 }}>
        <TouchableOpacity style={[st.ctaBtn, { backgroundColor: GOLD }]} onPress={onApply} disabled={saving} activeOpacity={0.85}>
          <Text style={st.ctaText}>REQUEST AN INVITATION →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.laterBtn} onPress={onLater} activeOpacity={0.7}>
          <Text style={st.laterText}>MAYBE LATER</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Step 8 — Final welcome ──────────────────────────────────────────────────
function StepWelcomeFinal({ onEnter }) {
  return (
    <View style={st.page}>
      <ScrollView contentContainerStyle={st.pageScroll} showsVerticalScrollIndicator={false}>
        <View style={st.finalRingWrap}>
          <CountdownRing progress={1} size={140} strokeWidth={4} color={GOLD_BRIGHT}>
            <Ionicons name="checkmark" size={44} color={GOLD_BRIGHT} />
          </CountdownRing>
        </View>
        <Text style={st.eyebrow}>YOU'RE ON THE CLOCK</Text>
        <Text style={st.headline}>Welcome to Clocked Golf.</Text>
        <Text style={st.line}>You're on the national board, provisional until your first 5 rounds. Go log one.</Text>
      </ScrollView>
      <TouchableOpacity style={[st.ctaBtn, { backgroundColor: GOLD }]} onPress={onEnter} activeOpacity={0.85}>
        <Text style={st.ctaText}>ENTER THE CLUBHOUSE →</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container:  { flex: 1, backgroundColor: BG },
  ringRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4 },
  ringStep:   { fontSize: 12, fontWeight: '700', color: GOLD, fontVariant: ['tabular-nums'] },
  skipBtn:    { padding: 8 },
  skipText:   { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 1.5 },

  page:        { flex: 1, paddingHorizontal: 28, paddingBottom: 20 },
  pageScroll:  { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },

  eyebrow:    { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 3, marginBottom: 14 },
  headline:   { fontSize: 26, fontWeight: '300', color: CREAM, lineHeight: 33, marginBottom: 12 },
  line:       { fontSize: 15, color: MUTED, lineHeight: 22 },

  statBlock:      { alignItems: 'flex-start', marginTop: 28 },
  bigStat:        { fontSize: 72, fontWeight: '200', color: RED_WARN, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  bigStatLabel:   { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 2, marginTop: 4 },

  splitRow:   { flexDirection: 'row', gap: 2, marginTop: 28, backgroundColor: BORDER },
  splitItem:  { flex: 1, backgroundColor: BG, paddingVertical: 20, alignItems: 'center' },
  splitNum:   { fontSize: 36, fontWeight: '200', color: GOLD, fontVariant: ['tabular-nums'] },
  splitLabel: { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2, marginTop: 4 },

  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, marginTop: 20 },
  searchInput:  { flex: 1, color: CREAM, fontSize: 15 },
  courseRow:    { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: BORDER },
  courseName:   { fontSize: 14, color: CREAM, fontWeight: '600' },
  courseMeta:   { fontSize: 11, color: DIM, marginTop: 2 },
  skipInline:   { alignItems: 'center', paddingVertical: 14 },
  skipInlineText: { fontSize: 10, fontWeight: '700', color: DIM, letterSpacing: 1.5 },

  leagueCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: RADIUS.md, borderWidth: 1, padding: 16 },
  leagueLabel:  { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  leagueDesc:   { fontSize: 12, color: MUTED, lineHeight: 17, maxWidth: 200 },
  leaguePace:   { fontSize: 20, fontWeight: '200', fontVariant: ['tabular-nums'] },

  rulesList:  { marginTop: 24, gap: 16 },
  ruleRow:    { borderLeftWidth: 2, borderLeftColor: GOLD + '55', paddingLeft: 14 },
  ruleLabel:  { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 1.5, marginBottom: 3 },
  ruleValue:  { fontSize: 13, color: MUTED, lineHeight: 19 },

  laterBtn:   { alignItems: 'center', paddingVertical: 14 },
  laterText:  { fontSize: 11, fontWeight: '700', color: DIM, letterSpacing: 1.5 },

  finalRingWrap: { alignItems: 'center', marginBottom: 8 },

  photoWrap:  { alignSelf: 'center', marginTop: 32, position: 'relative' },
  photoBadge: { position: 'absolute', bottom: 2, right: 2, width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: BG },
  photoHint:  { alignSelf: 'center', marginTop: 14, fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 2 },
  photoError: { alignSelf: 'center', marginTop: 10, fontSize: 12, color: RED_WARN, textAlign: 'center' },

  ctaBtn:   { borderRadius: RADIUS.md, paddingVertical: 17, alignItems: 'center' },
  ctaText:  { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 1.5 },
});
