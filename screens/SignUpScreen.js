/*
 * SQL — create profiles table in Supabase:
 *
 * create table public.profiles (
 *   id                 uuid primary key references auth.users(id) on delete cascade,
 *   full_name          text,
 *   username           text unique,
 *   hometown           text,
 *   home_course        text,
 *   handicap           numeric,
 *   avg_score          integer,
 *   typical_round_time text,
 *   pro_trial_active   boolean default false,
 *   pop_score          numeric,
 *   created_at         timestamptz default now()
 * );
 *
 * alter table public.profiles enable row level security;
 *
 * create policy "Users can insert own profile"
 *   on public.profiles for insert
 *   with check (auth.uid() = id);
 *
 * create policy "Users can view own profile"
 *   on public.profiles for select
 *   using (auth.uid() = id);
 *
 * create policy "Users can update own profile"
 *   on public.profiles for update
 *   using (auth.uid() = id);
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import Gauge from '../components/guage';

const ROUND_TIMES = [
  '2:30', '2:45', '3:00', '3:15', '3:30', '3:45',
  '4:00', '4:15', '4:30', '4:45', '5:00', '5:15', '5:30', '5:45', '6:00',
];

const POP_FROM_TIME = {
  '2:30': 5.0, '2:45': 4.8, '3:00': 4.6, '3:15': 4.4, '3:30': 4.2, '3:45': 4.0,
  '4:00': 3.8, '4:15': 3.5, '4:30': 3.2, '4:45': 2.9, '5:00': 2.6, '5:15': 2.3,
  '5:30': 2.0, '5:45': 1.7, '6:00': 1.5,
};

const ITEM_HEIGHT = 72;
const TOTAL_STEPS = 6;

export default function SignUpScreen({ navigation }) {
  // Navigation / UI state
  const [step, setStep]               = useState(0);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [showCongrats, setShowCongrats] = useState(false);

  // Form fields
  const [roundTime, setRoundTime]         = useState('4:00');
  const [handicapMode, setHandicapMode]   = useState('handicap');
  const [handicapValue, setHandicapValue] = useState('');
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [username, setUsername]           = useState('');
  const [hometown, setHometown]           = useState('');
  const [homeCourse, setHomeCourse]       = useState('');
  const [courseResults, setCourseResults] = useState([]);
  const [proTrial, setProTrial]           = useState(false);

  const scrollRef = useRef(null);
  const debounceRef = useRef(null);

  // Scroll picker to default on mount
  useEffect(() => {
    const defaultIndex = ROUND_TIMES.indexOf('4:00');
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: defaultIndex * ITEM_HEIGHT, animated: false });
    }, 50);
  }, []);

  // ----- canAdvance -----
  const canAdvance = () => {
    switch (step) {
      case 0: return true;
      case 1: return handicapValue.length > 0;
      case 2: return name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;
      case 3: return username.length >= 3 && hometown.trim().length > 0;
      case 4: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    setError('');
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setError('');
    if (step === 0) {
      navigation.goBack();
    } else {
      setStep(s => s - 1);
    }
  };

  // ----- Course search -----
  const handleCourseSearch = (text) => {
    clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setCourseResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('courses')
        .select('name,city,state')
        .ilike('name', `%${text}%`)
        .limit(8);
      setCourseResults(data || []);
    }, 300);
  };

  // ----- Sign up -----
  const handleSignUp = async (withTrial = false) => {
    setLoading(true);
    setError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      const popScore = POP_FROM_TIME[roundTime] || 3.8;
      await supabase.from('profiles').insert({
        id: userId,
        full_name: name,
        username: username.replace('@', ''),
        hometown,
        home_course: homeCourse,
        handicap: handicapMode === 'handicap' ? parseFloat(handicapValue) : null,
        avg_score: handicapMode === 'avg_score' ? parseInt(handicapValue) : null,
        typical_round_time: roundTime,
        pro_trial_active: withTrial,
        pop_score: popScore,
      });
      setShowCongrats(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ============================================================
  // CONGRATULATIONS SCREEN
  // ============================================================
  if (showCongrats) {
    const popScore = POP_FROM_TIME[roundTime] || 3.8;
    return (
      <View style={styles.container}>
        <View style={styles.congratsContent}>
          <Text style={styles.congratsEyebrow}>✦ WELCOME TO PLAYTHRU</Text>
          <Text style={styles.congratsName}>{name || 'Golfer'}</Text>
          <View style={styles.gaugeWrap}>
            <Gauge score={popScore} />
          </View>
          <Text style={styles.congratsCaption}>
            Your starting POPScore based on your typical pace
          </Text>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => {/* App.js handles navigation via onAuthStateChange */}}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>LET'S PLAY →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================================
  // PROGRESS BAR
  // ============================================================
  const progressWidth = `${((step + 1) / TOTAL_STEPS) * 100}%`;

  // ============================================================
  // STEP CONTENT
  // ============================================================
  const renderStep = () => {
    switch (step) {

      // ------ STEP 0: Round Time ------
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>
              How long does a typical round take you?
            </Text>
            <View style={styles.pickerWrap}>
              {/* Top selection line */}
              <View style={[styles.selectionLine, { top: ITEM_HEIGHT }]} />
              {/* Bottom selection line */}
              <View style={[styles.selectionLine, { top: ITEM_HEIGHT * 2 }]} />
              <ScrollView
                ref={scrollRef}
                style={{ height: ITEM_HEIGHT * 3 }}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const rawIndex = Math.round(
                    e.nativeEvent.contentOffset.y / ITEM_HEIGHT
                  );
                  const index = Math.max(0, Math.min(14, rawIndex));
                  setRoundTime(ROUND_TIMES[index]);
                }}
              >
                {ROUND_TIMES.map((t, i) => {
                  const selected = t === roundTime;
                  return (
                    <View key={t} style={styles.pickerItem}>
                      <Text
                        style={[
                          styles.pickerItemText,
                          selected
                            ? styles.pickerItemSelected
                            : styles.pickerItemUnselected,
                        ]}
                      >
                        {t}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            <Text style={styles.perHoles}>per 18 holes</Text>
          </View>
        );

      // ------ STEP 1: Handicap / Score ------
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>
              What's your handicap or average score?
            </Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  handicapMode === 'handicap' && styles.toggleBtnActive,
                ]}
                onPress={() => { setHandicapMode('handicap'); setHandicapValue(''); }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    handicapMode === 'handicap' && styles.toggleBtnTextActive,
                  ]}
                >
                  I have a handicap
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  handicapMode === 'avg_score' && styles.toggleBtnActive,
                ]}
                onPress={() => { setHandicapMode('avg_score'); setHandicapValue(''); }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    handicapMode === 'avg_score' && styles.toggleBtnTextActive,
                  ]}
                >
                  I use average score
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder={handicapMode === 'handicap' ? '0–54' : '54–145'}
              placeholderTextColor="#B8A88266"
              value={handicapValue}
              onChangeText={setHandicapValue}
              keyboardType="numeric"
            />
          </View>
        );

      // ------ STEP 2: Name, Email, Password ------
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Create your account</Text>
            <View style={styles.inputStack}>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#B8A88266"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#B8A88266"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Password"
                  placeholderTextColor="#B8A88266"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.eyeIcon}>
                    {showPassword ? '👁' : '🙈'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );

      // ------ STEP 3: Username & Hometown ------
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Set up your profile</Text>
            <View style={styles.inputStack}>
              <View style={styles.prefixRow}>
                <Text style={styles.prefixText}>@</Text>
                <TextInput
                  style={styles.prefixInput}
                  placeholder="username"
                  placeholderTextColor="#B8A88266"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Hometown"
                placeholderTextColor="#B8A88266"
                value={hometown}
                onChangeText={setHometown}
                autoCapitalize="words"
              />
            </View>
          </View>
        );

      // ------ STEP 4: Home Course ------
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your home course?</Text>
            {homeCourse ? (
              <View style={styles.courseChip}>
                <Text style={styles.courseChipText}>{homeCourse}</Text>
                <TouchableOpacity
                  onPress={() => setHomeCourse('')}
                  activeOpacity={0.7}
                  style={styles.courseChipX}
                >
                  <Text style={styles.courseChipXText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Search courses…"
                  placeholderTextColor="#B8A88266"
                  onChangeText={(text) => {
                    handleCourseSearch(text);
                  }}
                  autoCapitalize="words"
                />
                {courseResults.length > 0 && (
                  <View style={styles.courseResults}>
                    {courseResults.map((c, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.courseResultRow}
                        onPress={() => {
                          setHomeCourse(c.name);
                          setCourseResults([]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.courseResultName}>{c.name}</Text>
                        <Text style={styles.courseResultSub}>
                          {[c.city, c.state].filter(Boolean).join(', ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
            <TouchableOpacity
              onPress={handleNext}
              activeOpacity={0.7}
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        );

      // ------ STEP 5: Pro Trial ------
      case 5:
        return (
          <View style={styles.stepContent}>
            <View style={styles.proCard}>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>✦ PRO MEMBER</Text>
              </View>
              <Text style={styles.proPrice}>30 Days Free</Text>
              <Text style={styles.proSubPrice}>
                Then $4.99/month. Cancel anytime.
              </Text>
              {['AI Pace Coach', 'Round Heatmaps', 'Private Groups', 'Priority Leaderboard'].map((f) => (
                <View key={f} style={styles.proFeatureRow}>
                  <Text style={styles.proFeatureDot}>●</Text>
                  <Text style={styles.proFeatureText}>{f}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.btnPrimary, styles.proTrialBtn, loading && styles.btnDisabled]}
                onPress={() => {
                  setProTrial(true);
                  handleSignUp(true);
                }}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Text style={styles.btnPrimaryText}>
                  {loading ? 'CREATING ACCOUNT…' : 'START FREE TRIAL'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSignUp(false)}
                activeOpacity={0.7}
                style={styles.maybeLaterBtn}
                disabled={loading}
              >
                <Text style={styles.maybeLaterText}>MAYBE LATER</Text>
              </TouchableOpacity>
            </View>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      {/* Back / close button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={handleBack}
        activeOpacity={0.7}
      >
        <Text style={styles.backBtnText}>
          {step === 0 ? '✕' : '←'}
        </Text>
      </TouchableOpacity>

      {/* Step content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep()}

        {/* Error */}
        {!!error && step !== 5 && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {/* NEXT button — steps 0-4 only */}
        {step < 5 && step !== 4 && (
          <TouchableOpacity
            style={[styles.btnPrimary, !canAdvance() && styles.btnDisabled]}
            onPress={handleNext}
            activeOpacity={0.8}
            disabled={!canAdvance()}
          >
            <Text style={styles.btnPrimaryText}>NEXT</Text>
          </TouchableOpacity>
        )}

        {/* Step 4: NEXT only if a course is selected (skip is in step content) */}
        {step === 4 && homeCourse !== '' && (
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={styles.btnPrimaryText}>NEXT</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090F0A',
  },
  progressTrack: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(201,168,76,0.12)',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#C9A84C',
  },
  backBtn: {
    marginTop: 16,
    marginLeft: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 22,
    color: '#C9A84C',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 20,
  },
  stepContent: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#F5EDD8',
    marginBottom: 8,
  },

  // ---- Picker ----
  pickerWrap: {
    position: 'relative',
    alignSelf: 'center',
    width: 220,
  },
  selectionLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(201,168,76,0.5)',
    zIndex: 2,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemText: {
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  pickerItemSelected: {
    fontSize: 48,
    color: '#C9A84C',
  },
  pickerItemUnselected: {
    fontSize: 22,
    color: 'rgba(184,168,130,0.33)',
  },
  perHoles: {
    fontSize: 12,
    color: '#B8A882',
    textAlign: 'center',
    marginTop: 4,
  },

  // ---- Toggles ----
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    alignItems: 'center',
    backgroundColor: '#0D1A0F',
  },
  toggleBtnActive: {
    borderColor: '#C9A84C',
    backgroundColor: 'rgba(201,168,76,0.08)',
  },
  toggleBtnText: {
    fontSize: 12,
    color: '#B8A882',
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#C9A84C',
  },

  // ---- Inputs ----
  inputStack: {
    gap: 12,
  },
  input: {
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    borderRadius: 12,
    padding: 16,
    color: '#F5EDD8',
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    color: '#F5EDD8',
    fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  eyeIcon: {
    fontSize: 18,
  },
  prefixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    borderRadius: 12,
  },
  prefixText: {
    fontSize: 16,
    color: '#C9A84C',
    paddingLeft: 16,
  },
  prefixInput: {
    flex: 1,
    padding: 16,
    color: '#F5EDD8',
    fontSize: 16,
  },

  // ---- Course search ----
  courseResults: {
    backgroundColor: '#0D1A0F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
    overflow: 'hidden',
  },
  courseResultRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.08)',
  },
  courseResultName: {
    fontSize: 15,
    color: '#F5EDD8',
    fontWeight: '500',
  },
  courseResultSub: {
    fontSize: 11,
    color: '#B8A882',
    marginTop: 2,
  },
  courseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,168,76,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  courseChipText: {
    fontSize: 14,
    color: '#C9A84C',
    fontWeight: '500',
  },
  courseChipX: {
    paddingHorizontal: 4,
  },
  courseChipXText: {
    fontSize: 13,
    color: '#B8A882',
  },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  skipText: {
    fontSize: 14,
    color: '#C9A84C',
    fontWeight: '600',
  },

  // ---- Pro card ----
  proCard: {
    backgroundColor: '#1A2E1C',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    gap: 0,
  },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0D1A0F',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 16,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 2,
  },
  proPrice: {
    fontSize: 52,
    fontWeight: '300',
    color: '#C9A84C',
    lineHeight: 58,
  },
  proSubPrice: {
    fontSize: 12,
    color: '#B8A882',
    marginBottom: 20,
    marginTop: 4,
  },
  proFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  proFeatureDot: {
    fontSize: 8,
    color: '#C9A84C',
  },
  proFeatureText: {
    fontSize: 14,
    color: '#F5EDD8',
    fontWeight: '500',
  },
  proTrialBtn: {
    marginTop: 24,
  },
  maybeLaterBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  maybeLaterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 2,
  },

  // ---- Shared buttons ----
  btnPrimary: {
    backgroundColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#090F0A',
    letterSpacing: 2,
  },

  // ---- Error ----
  errorText: {
    fontSize: 13,
    color: '#C07A6A',
    textAlign: 'center',
  },

  // ---- Congrats ----
  congratsContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  congratsEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: 3,
  },
  congratsName: {
    fontSize: 34,
    fontWeight: '600',
    color: '#F5EDD8',
    textAlign: 'center',
  },
  gaugeWrap: {
    marginVertical: 8,
  },
  congratsCaption: {
    fontSize: 13,
    color: '#B8A882',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});
