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
 *   account_type       text default 'golfer',
 *   caddy_course       text,
 *   caddy_courses      jsonb default '[]',
 *   caddy_experience   text,
 *   created_at         timestamptz default now()
 * );
 *
 * -- Or add columns to existing table:
 * alter table public.profiles
 *   add column if not exists account_type text default 'golfer',
 *   add column if not exists caddy_course text,
 *   add column if not exists caddy_courses jsonb default '[]',
 *   add column if not exists caddy_experience text,
 *   add column if not exists first_name text,
 *   add column if not exists last_name text,
 *   add column if not exists date_of_birth date,
 *   add column if not exists home_state text,
 *   add column if not exists home_country text;
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

import UnderageScreen from './UnderageScreen';
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
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { searchCourses } from '../lib/courses';
import { useAuth } from '../context/AuthContext';
import Gauge from '../components/guage';
import { generateReferralCode, applyReferralCode } from '../lib/referrals';

const ROUND_TIMES = [
  '2:30', '2:45', '3:00', '3:15', '3:30', '3:45',
  '4:00', '4:15', '4:30', '4:45', '5:00', '5:15', '5:30', '5:45', '6:00',
];

const POP_FROM_TIME = {
  '2:30': 5.0, '2:45': 5.0,
  '3:00': 4.5, '3:15': 4.5,
  '3:30': 4.0, '3:45': 4.0,
  '4:00': 3.5, '4:15': 3.5,
  '4:30': 3.0, '4:45': 3.0, '5:00': 3.0,
  '5:15': 2.5, '5:30': 2.5, '5:45': 2.5, '6:00': 2.5,
};

const ITEM_HEIGHT = 72;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = Array.from({ length: 31 }, (_, i) => String(i + 1));
const YEARS  = Array.from({ length: 110 }, (_, i) => String(new Date().getFullYear() - i));

const CADDY_EXPERIENCE_OPTIONS = [
  'Less than 1 year',
  '1-2 years',
  '3-5 years',
  '6-10 years',
  '10+ years',
];

const US_CITIES = [
  'New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio',
  'San Diego','Dallas','San Jose','Austin','Jacksonville','Fort Worth','Columbus',
  'Charlotte','San Francisco','Indianapolis','Seattle','Denver','Nashville',
  'Oklahoma City','El Paso','Washington','Boston','Memphis','Louisville','Portland',
  'Las Vegas','Milwaukee','Albuquerque','Tucson','Fresno','Sacramento','Mesa',
  'Kansas City','Atlanta','Omaha','Colorado Springs','Raleigh','Long Beach',
  'Virginia Beach','Minneapolis','Tampa','New Orleans','Arlington','Wichita',
  'Bakersfield','Aurora','Anaheim','Santa Ana','Corpus Christi','Riverside',
  'St. Louis','Lexington','Pittsburgh','Stockton','Anchorage','Cincinnati',
  'St. Paul','Greensboro','Toledo','Newark','Plano','Henderson','Lincoln',
  'Buffalo','Fort Wayne','Jersey City','Chula Vista','Orlando','St. Petersburg',
  'Norfolk','Chandler','Laredo','Madison','Durham','Lubbock','Winston-Salem',
  'Garland','Glendale','Hialeah','Reno','Baton Rouge','Irvine','Chesapeake',
  'Irving','Scottsdale','North Las Vegas','Fremont','Gilbert','San Bernardino',
  'Birmingham','Boise','Rochester','Richmond','Spokane','Des Moines','Montgomery',
  'Modesto','Fayetteville','Tacoma','Shreveport','Akron','Yonkers','Huntington Beach',
  'Grand Rapids','Salt Lake City','Tallahassee','Huntsville','Worcester','Knoxville',
  'Providence','Brownsville','Santa Clarita','Garden Grove','Oceanside','Chattanooga',
  'Fort Lauderdale','Rancho Cucamonga','Santa Rosa','Tempe','Cape Coral','Oxnard',
  'Eugene','Peoria','Salem','Cary','Springfield','Fort Collins','Jackson',
  'Alexandria','Hayward','Lancaster','Salinas','Palmdale','Sunnyvale','Pomona',
  'Escondido','Savannah','Torrance','Pasadena','Bridgeport','McAllen','Paterson',
  'Rockford','Hollywood','Syracuse','Macon','Killeen','Mesquite','Dayton',
  'Clarksville','Hampton','Warren','West Valley City','Columbia','Sterling Heights',
  'Waco','Cedar Rapids','Elizabeth','New Haven','Roseville','Denton','Visalia',
  'Elk Grove','Gainesville','Corona','Thousand Oaks','Vallejo','Bellevue',
  'Surprise','Concord','Hartford','Murfreesboro','Evansville','Athens','Simi Valley',
  'Topeka','Abilene','Beaumont','Independence','El Monte','Costa Mesa','Ann Arbor',
  'Provo','Lansing','Inglewood','Waterbury','West Jordan','Arvada','Clearwater',
  'Westminster','Miami Gardens','High Point','Pompano Beach','West Palm Beach',
  'Manchester','Pueblo','Midland','Elgin','Joliet','Naperville','Lakewood',
  'Miramar','Metairie','Olathe','Frisco','McKinney','Sioux Falls','Boise City',
];

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

const COUNTRIES = [
  'United States','Canada','United Kingdom','Australia','Ireland','New Zealand',
  'Germany','France','Spain','Italy','Japan','South Korea','China','Brazil',
  'Mexico','Argentina','Sweden','Norway','Denmark','Netherlands','Belgium',
  'Switzerland','Austria','Portugal','South Africa','India','Thailand',
  'Singapore','UAE','Saudi Arabia',
];

// ─── Welcome email builder ────────────────────────────────────────────────────
function buildWelcomeEmail({ firstName, username, referralCode, isCaddy }) {
  const name = firstName || username || (isCaddy ? 'Caddy' : 'Golfer');
  const role = isCaddy ? 'caddy' : 'golfer';
  const cta  = isCaddy
    ? 'Start caddying rounds to build your Caddy Rating on Clocked.'
    : 'Log your first round to get your official Clocked Score — your pace of play rating.';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#090F0A;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#0D1A0F;border-radius:16px;border:1px solid rgba(201,168,76,0.25);padding:40px 36px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#C9A84C;letter-spacing:5px;font-family:Arial,sans-serif;">CLOCKED GOLF</p>
    <p style="margin:0 0 28px;font-size:9px;color:rgba(201,168,76,0.5);letter-spacing:3px;font-family:Arial,sans-serif;">GOLF ON THE CLOCK</p>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:400;color:#F5EDD8;">Welcome, ${name}.</h1>
    <p style="margin:0 0 24px;font-size:13px;color:rgba(245,237,216,0.6);letter-spacing:1px;font-family:Arial,sans-serif;">YOUR ${role.toUpperCase()} ACCOUNT IS READY</p>
    <hr style="border:none;border-top:1px solid rgba(201,168,76,0.15);margin:0 0 24px;" />
    <p style="margin:0 0 20px;font-size:15px;color:#F5EDD8;line-height:1.6;">${cta}</p>
    ${referralCode ? `
    <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:rgba(201,168,76,0.6);letter-spacing:3px;font-family:Arial,sans-serif;">YOUR REFERRAL CODE</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#C9A84C;letter-spacing:4px;font-family:Arial,sans-serif;">${referralCode}</p>
      <p style="margin:6px 0 0;font-size:12px;color:rgba(245,237,216,0.5);font-family:Arial,sans-serif;">Share with friends — they'll thank you when they stop holding up the course.</p>
    </div>` : ''}
    <p style="margin:0 0 6px;font-size:12px;color:rgba(245,237,216,0.4);font-family:Arial,sans-serif;">Questions? Reply to this email or reach us at <a href="mailto:hello@clocked.golf" style="color:#C9A84C;">hello@clocked.golf</a></p>
    <p style="margin:0;font-size:11px;color:rgba(245,237,216,0.25);font-family:Arial,sans-serif;">Clocked Golf · Golf On The Clock</p>
  </div>
</body>
</html>`;
}

export default function SignUpScreen({ navigation }) {
  const { refreshProfile } = useAuth();

  // Navigation / UI state
  const [step, setStep]                 = useState(0);
  const [loading, setLoading]           = useState(false);
  const [authLoading, setAuthLoading]   = useState(false);
  const [error, setError]               = useState('');
  const [showCongrats, setShowCongrats] = useState(false);
  const [pendingUserId, setPendingUserId]   = useState(null);
  const [pendingEmail, setPendingEmail]     = useState(null);
  const [letsPlayLoading, setLetsPlayLoading] = useState(false);
  const [ageGatePassed,  setAgeGatePassed]   = useState(false);
  const [ageGateBlocked, setAgeGateBlocked]  = useState(false);
  const [tosAgreed, setTosAgreed] = useState(false);

  // Account type
  const [accountType, setAccountType] = useState(''); // 'golfer' | 'caddy'

  // Shared form fields
  const [roundTime, setRoundTime]         = useState('4:00');
  const [handicapMode, setHandicapMode]   = useState('handicap');
  const [handicapValue, setHandicapValue] = useState('');
  const [firstName, setFirstName]         = useState('');
  const [lastName, setLastName]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [username, setUsername]           = useState('');
  const [dobMonth, setDobMonth]           = useState('');
  const [dobDay, setDobDay]               = useState('');
  const [dobYear, setDobYear]             = useState('');
  const [homeCity, setHomeCity]           = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [homeState, setHomeState]         = useState('');
  const [homeCountry, setHomeCountry]     = useState('United States');
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [homeCourse, setHomeCourse]       = useState('');
  const [courseResults, setCourseResults] = useState([]);

  // Username availability
  const [usernameError,   setUsernameError]   = useState(null);  // string | null
  const [usernameOk,      setUsernameOk]      = useState(false); // true when confirmed available
  const [usernameConflict, setUsernameConflict] = useState(false); // set on 23505 at upsert

  // Referral
  const [referralCodeInput, setReferralCodeInput] = useState('');

  // Caddy-specific state
  const [caddyCourses, setCaddyCourses]           = useState([]); // [{id, name, city, state}]
  const [caddyCourseQuery, setCaddyCourseQuery]   = useState('');
  const [caddyCourseResults, setCaddyCourseResults] = useState([]);
  const [caddyExperience, setCaddyExperience]     = useState('3-5 years');

  const scrollRef       = useRef(null);
  const expScrollRef    = useRef(null);
  const debounceRef     = useRef(null);
  const cadDebounce     = useRef(null);
  const usernameDebounce = useRef(null);

  const isCaddy = accountType === 'caddy';

  // caddy: 5 steps (0–4), golfer: 6 steps (0–5)
  const TOTAL_STEPS = isCaddy ? 5 : 6;

  // Scroll round-time picker to default when step 1 becomes active (golfer only)
  useEffect(() => {
    if (!isCaddy && step === 1) {
      const defaultIndex = ROUND_TIMES.indexOf('4:00');
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: defaultIndex * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, [step, isCaddy]);

  // Pre-fill referral code saved from a deep link
  useEffect(() => {
    AsyncStorage.getItem('pending_referral_code').then(code => {
      if (code) setReferralCodeInput(code);
    }).catch(() => {});
  }, []);

  // Scroll experience picker to default when caddy step 4 becomes active
  useEffect(() => {
    if (isCaddy && step === 4) {
      const defaultIndex = CADDY_EXPERIENCE_OPTIONS.indexOf(caddyExperience);
      setTimeout(() => {
        expScrollRef.current?.scrollTo({ y: defaultIndex * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, [step, isCaddy]);

  // ----- canAdvance -----
  const canAdvance = () => {
    if (isCaddy) {
      switch (step) {
        case 0: return accountType !== '';
        case 1: return (firstName || '').trim().length > 0 && (lastName || '').trim().length > 0 && (email || '').trim().length > 0 && (password || '').length >= 6;
        case 2: return (username || '').length >= 3 && !usernameError && (firstName || '').trim().length > 0 && (lastName || '').trim().length > 0 && dobMonth !== '' && dobDay !== '' && dobYear !== '' && (homeCity || '').trim().length > 0;
        case 3: return caddyCourses.length >= 1;
        case 4: return true;
        default: return false;
      }
    }
    // golfer
    switch (step) {
      case 0: return accountType !== '';
      case 1: return true;
      case 2: return handicapValue.length > 0;
      case 3: return (firstName || '').trim().length > 0 && (lastName || '').trim().length > 0 && (email || '').trim().length > 0 && (password || '').length >= 6;
      case 4: return (username || '').length >= 3 && !usernameError && (firstName || '').trim().length > 0 && (lastName || '').trim().length > 0 && dobMonth !== '' && dobDay !== '' && dobYear !== '' && (homeCity || '').trim().length > 0 && homeState !== '';
      default: return false;
    }
  };

  const handleUsernameChange = (text) => {
    const clean = text.replace('@', '').toLowerCase();
    setUsername(clean);
    setUsernameOk(false);
    setUsernameError(null);
    clearTimeout(usernameDebounce.current);
    if (clean.length < 3) return;
    usernameDebounce.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', clean)
          .maybeSingle();
        if (data) {
          setUsernameError('Username already taken — try another');
          setUsernameOk(false);
        } else {
          setUsernameError(null);
          setUsernameOk(true);
        }
      } catch { /* silent fail — don't block the user */ }
    }, 500);
  };

  const handleNext = () => {
    setError('');
    setStep(s => s + 1);
  };

  const getAgeFromDob = (month, day, year) => {
    const dob = new Date(parseInt(year), MONTHS.indexOf(month), parseInt(day));
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  };

  const handleBack = () => {
    setError('');
    if (step === 0) {
      navigation.goBack();
    } else {
      setStep(s => s - 1);
    }
  };

  // ----- Home course search (golfer) -----
  const handleCourseSearch = (text) => {
    clearTimeout(debounceRef.current);
    if (!text.trim()) { setCourseResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await searchCourses(text);
      setCourseResults(results);
    }, 300);
  };

  // ----- Caddy course search -----
  const handleCaddyCourseSearch = (text) => {
    setCaddyCourseQuery(text);
    clearTimeout(cadDebounce.current);
    if (!text.trim()) { setCaddyCourseResults([]); return; }
    cadDebounce.current = setTimeout(async () => {
      const results = await searchCourses(text);
      setCaddyCourseResults(results);
    }, 300);
  };

  const addCaddyCourse = (course) => {
    if (caddyCourses.length >= 3) return;
    if (caddyCourses.find(c => c.name === course.name)) return;
    setCaddyCourses(prev => [...prev, course]);
    setCaddyCourseQuery('');
    setCaddyCourseResults([]);
  };

  const removeCaddyCourse = (name) => {
    setCaddyCourses(prev => prev.filter(c => c.name !== name));
  };

  // ----- STEP AUTH: Create auth account -----
  const handleCreateAuth = async () => {
    setAuthLoading(true);
    setError('');
    try {
      const emailVal    = (email || '').trim();
      const passwordVal = (password || '').trim();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: emailVal,
        password: passwordVal,
      });
      if (signUpError) { throw signUpError; }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: emailVal,
        password: passwordVal,
      });
      if (signInError) { throw signInError; }

      const userId    = signInData.session.user.id;
      const userEmail = signInData.session.user.email;
      setPendingUserId(userId);
      setPendingEmail(userEmail);
      setStep(s => s + 1);
    } catch (e) {
      setError(e.message);
    }
    setAuthLoading(false);
  };

  const handleCreateProfile = () => {
    setShowCongrats(true);
  };

  // ----- LET'S PLAY / START CADDYING: save profile → navigate -----
  const handleLetsPlay = async () => {
    setLetsPlayLoading(true);
    setError('');
    try {
      const userId = pendingUserId;
      if (!userId) throw new Error('Session lost — please go back and try again.');

      // ── Upsert profile ──
      const popScore = isCaddy ? 3.5 : (POP_FROM_TIME[roundTime] || 3.8);
      const dobMonthNum = dobMonth ? String(MONTHS.indexOf(dobMonth) + 1).padStart(2, '0') : null;
      const dobDayPad   = dobDay   ? String(dobDay).padStart(2, '0') : null;
      const dateOfBirth = dobYear && dobMonthNum && dobDayPad
        ? `${dobYear}-${dobMonthNum}-${dobDayPad}` : null;

      const profilePayload = {
        id:                 userId,
        email:              pendingEmail,
        full_name:          `${(firstName || '').trim()} ${(lastName || '').trim()}`,
        first_name:         (firstName || '').trim(),
        last_name:          (lastName || '').trim(),
        username:           (username || '').replace('@', '').trim(),
        hometown:           (homeCity || '').trim(),
        date_of_birth:      dateOfBirth,
        pro_trial_active:   false,
        account_type:       accountType || 'golfer',
        // golfer-specific
        home_state:         !isCaddy ? (homeState || null) : null,
        home_country:       !isCaddy ? (homeCountry || 'United States') : null,
        home_course:        !isCaddy ? (homeCourse || null) : null,
        handicap:           !isCaddy && handicapMode === 'handicap' ? parseFloat(handicapValue) : null,
        handicap_index:     !isCaddy && handicapMode === 'handicap' ? parseFloat(handicapValue) : null,
        avg_score:          !isCaddy && handicapMode === 'avg_score' ? parseInt(handicapValue) : null,
        typical_round_time: !isCaddy ? roundTime : null,
        pop_score:          popScore,
        // caddy-specific
        caddy_course:       isCaddy ? (caddyCourses[0]?.name || null) : null,
        caddy_courses:      isCaddy ? caddyCourses : [],
        caddy_experience:   isCaddy ? caddyExperience : null,
        tos_agreed_at:      new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profileError) {
        if (profileError.code === '23505' && profileError.message?.includes('username')) {
          setUsernameConflict(true);
          setError('That username is already taken. Tap below to choose a different one.');
          setLetsPlayLoading(false);
          return;
        }
        throw new Error('Could not save your profile: ' + profileError.message);
      }

      // Generate and save a referral code for this new user
      const refCode = generateReferralCode();
      await supabase.from('profiles').update({ referral_code: refCode }).eq('id', userId);

      // Start 14-day Pro trial — only for brand-new signups.
      // The .is('trial_started_at', null) guard makes this a no-op if trial is already set,
      // protecting against re-runs (username conflict retry, duplicate signup attempts, etc.).
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      await supabase
        .from('profiles')
        .update({
          trial_started_at:    now.toISOString(),
          pro_expires_at:      trialEnd.toISOString(),
          subscription_source: 'signup_trial',
          is_pro:              false,
        })
        .eq('id', userId)
        .is('trial_started_at', null);

      // Apply any entered referral code (fire-and-forget, no fatal error)
      const trimmedRef = referralCodeInput.trim();
      if (trimmedRef) {
        applyReferralCode(trimmedRef, userId).catch(() => {});
        AsyncStorage.removeItem('pending_referral_code').catch(() => {});
      }

      // Compute initial rank for golfers
      if (!isCaddy) {
        const { count: rankCount } = await supabase
          .from('profiles').select('id', { count: 'exact', head: true })
          .eq('account_type', 'golfer').gt('pop_score', popScore);
        await supabase.from('profiles')
          .update({ national_rank: (rankCount ?? 0) + 1 })
          .eq('id', userId);
      }

      // Insert welcome notification into bell inbox
      supabase.from('notifications').insert({
        user_id: userId,
        type:    'welcome',
        title:   'Welcome to Clocked Golf 🕐',
        body:    'Log your first round to get your Clocked Score and see where you rank nationally.',
        read:    false,
      }).catch(() => {});

      // Send welcome email — fire-and-forget, never block navigation on failure
      supabase.functions.invoke('send-email', {
        body: {
          to:      pendingEmail,
          subject: "Welcome to Clocked Golf — You're On The Clock ⛳",
          html:    buildWelcomeEmail({
            firstName:    (firstName || '').trim(),
            username:     (username  || '').replace('@', '').trim(),
            referralCode: refCode,
            isCaddy,
          }),
        },
      }).catch(() => {});

      await refreshProfile();
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setError(e.message);
    }
    setLetsPlayLoading(false);
  };

  // ============================================================
  // COPPA AGE GATE — must pass before any signup content
  // ============================================================
  if (ageGateBlocked) return <UnderageScreen />;

  if (!ageGatePassed) {
    const canContinue = dobMonth !== '' && dobDay !== '' && dobYear !== '';
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color="#F5EDD8" />
        </TouchableOpacity>
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>When were you born?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={[styles.selectorBtn, { flex: 2 }]} onPress={() => setActiveDropdown(activeDropdown === 'month' ? null : 'month')} activeOpacity={0.8}>
              <Text style={[styles.selectorText, !dobMonth && styles.selectorPlaceholder]}>{dobMonth || 'Month'}</Text>
              <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selectorBtn, { flex: 1 }]} onPress={() => setActiveDropdown(activeDropdown === 'day' ? null : 'day')} activeOpacity={0.8}>
              <Text style={[styles.selectorText, !dobDay && styles.selectorPlaceholder]}>{dobDay || 'Day'}</Text>
              <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selectorBtn, { flex: 2 }]} onPress={() => setActiveDropdown(activeDropdown === 'year' ? null : 'year')} activeOpacity={0.8}>
              <Text style={[styles.selectorText, !dobYear && styles.selectorPlaceholder]}>{dobYear || 'Year'}</Text>
              <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
            </TouchableOpacity>
          </View>
          {(activeDropdown === 'month' || activeDropdown === 'day' || activeDropdown === 'year') && (
            <View style={styles.dropdownList}>
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                {(activeDropdown === 'month' ? MONTHS : activeDropdown === 'day' ? DAYS : YEARS).map((val) => {
                  const current = activeDropdown === 'month' ? dobMonth : activeDropdown === 'day' ? dobDay : dobYear;
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[styles.dropdownItem, current === val && styles.dropdownItemActive]}
                      onPress={() => {
                        if (activeDropdown === 'month') setDobMonth(val);
                        else if (activeDropdown === 'day') setDobDay(val);
                        else setDobYear(val);
                        setActiveDropdown(null);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, current === val && styles.dropdownItemTextActive]}>{val}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <Text style={styles.ageGateNote}>
            We use this to verify you meet the minimum age requirement.
          </Text>
          <TouchableOpacity
            style={[styles.btnPrimary, !canContinue && styles.btnDisabled]}
            onPress={() => {
              if (!canContinue) return;
              if (getAgeFromDob(dobMonth, dobDay, dobYear) < 13) {
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
            <Text style={styles.btnPrimaryText}>CONTINUE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================================
  // CONGRATULATIONS SCREEN
  // ============================================================
  if (showCongrats) {
    const popScore = POP_FROM_TIME[roundTime] || 3.8;
    return (
      <View style={styles.container}>
        <View style={styles.congratsContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="star" size={9} color="#C9A84C" />
            <Text style={styles.congratsEyebrow}>WELCOME TO CLOCKED</Text>
          </View>
          <Text style={styles.congratsName}>{firstName || (isCaddy ? 'Caddy' : 'Golfer')}</Text>

          {!isCaddy && (
            <>
              <View style={styles.gaugeWrap}>
                <Gauge score={popScore} />
              </View>
              <Text style={styles.congratsCaption}>
                Your starting Clocked Score based on your typical pace
              </Text>
            </>
          )}

          {isCaddy && (
            <Text style={styles.congratsCaption}>
              Start logging rounds to build your caddy reputation.{'\n'}
              {caddyCourses[0] ? `Home base: ${caddyCourses[0].name}` : ''}
            </Text>
          )}

          {!!error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>}

          <TouchableOpacity
            style={styles.tosRow}
            onPress={() => setTosAgreed(v => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: tosAgreed }}
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          >
            <View style={[styles.checkbox, tosAgreed && styles.checkboxChecked]}>
              {tosAgreed && <Ionicons name="checkmark" size={14} color="#C9A84C" />}
            </View>
            <Text style={styles.tosText}>
              {'I agree to the Clocked Golf '}
              <Text style={styles.tosLink} onPress={() => Linking.openURL('https://clocked.golf/terms_of_service.html')}>Terms of Service</Text>
              {' and '}
              <Text style={styles.tosLink} onPress={() => Linking.openURL('https://clocked.golf/privacy_policy.html')}>Privacy Policy</Text>
              {'. I confirm I am 13 years of age or older.'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPrimary, (letsPlayLoading || !tosAgreed) && { opacity: 0.5 }]}
            onPress={() => {
              if (usernameConflict) {
                setUsernameConflict(false);
                setError('');
                setUsernameError('Username already taken — try another');
                setUsernameOk(false);
                setShowCongrats(false);
                setStep(isCaddy ? 2 : 4);
              } else {
                if (!tosAgreed) {
                  setError('Please agree to the Terms of Service and Privacy Policy to continue');
                  return;
                }
                handleLetsPlay();
              }
            }}
            disabled={letsPlayLoading}
            activeOpacity={0.8}
          >
            {letsPlayLoading ? (
              <ActivityIndicator size="small" color="#090F0A" />
            ) : (
              <Text style={styles.btnPrimaryText}>
                {usernameConflict ? 'CHOOSE NEW USERNAME' : error ? 'TRY AGAIN' : isCaddy ? "START CADDYING →" : "LET'S PLAY →"}
              </Text>
            )}
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

  // ---- Shared Step 0: Account Type ----
  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>How will you use Clocked?</Text>
      <TouchableOpacity
        style={[styles.acctCard, accountType === 'golfer' && styles.acctCardActive]}
        onPress={() => setAccountType('golfer')}
        activeOpacity={0.8}
      >
        <View style={styles.acctCardIcon}>
          <Ionicons name="golf" size={28} color={accountType === 'golfer' ? '#C9A84C' : '#7A6E58'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.acctCardTitle, accountType === 'golfer' && styles.acctCardTitleActive]}>
            I am a Golfer
          </Text>
          <Text style={styles.acctCardSub}>Track your pace, log rounds, earn an Clocked Score</Text>
        </View>
        {accountType === 'golfer' && (
          <Ionicons name="checkmark-circle" size={20} color="#C9A84C" />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.acctCard, accountType === 'caddy' && styles.acctCardActive]}
        onPress={() => setAccountType('caddy')}
        activeOpacity={0.8}
      >
        <View style={styles.acctCardIcon}>
          <Ionicons name="person" size={28} color={accountType === 'caddy' ? '#C9A84C' : '#7A6E58'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.acctCardTitle, accountType === 'caddy' && styles.acctCardTitleActive]}>
            I am a Caddy
          </Text>
          <Text style={styles.acctCardSub}>Log rounds for your groups and notify players of their pace</Text>
        </View>
        {accountType === 'caddy' && (
          <Ionicons name="checkmark-circle" size={20} color="#C9A84C" />
        )}
      </TouchableOpacity>
    </View>
  );

  // ---- Golfer Step 1: Round Time ----
  const renderGolferStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>How long does a typical round take you?</Text>
      <View style={styles.pickerWrap}>
        <View style={[styles.selectionLine, { top: ITEM_HEIGHT }]} />
        <View style={[styles.selectionLine, { top: ITEM_HEIGHT * 2 }]} />
        <ScrollView
          ref={scrollRef}
          style={{ height: ITEM_HEIGHT * 3 }}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const rawIndex = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
            const index    = Math.max(0, Math.min(14, rawIndex));
            setRoundTime(ROUND_TIMES[index]);
          }}
        >
          {ROUND_TIMES.map((t) => {
            const selected = t === roundTime;
            return (
              <View key={t} style={styles.pickerItem}>
                <Text style={[
                  styles.pickerItemText,
                  selected ? styles.pickerItemSelected : styles.pickerItemUnselected,
                ]}>
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

  // ---- Golfer Step 2: Handicap ----
  const renderGolferStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What's your handicap or average score?</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, handicapMode === 'handicap' && styles.toggleBtnActive]}
          onPress={() => { setHandicapMode('handicap'); setHandicapValue(''); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.toggleBtnText, handicapMode === 'handicap' && styles.toggleBtnTextActive]}>
            I have a handicap
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, handicapMode === 'avg_score' && styles.toggleBtnActive]}
          onPress={() => { setHandicapMode('avg_score'); setHandicapValue(''); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.toggleBtnText, handicapMode === 'avg_score' && styles.toggleBtnTextActive]}>
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

  // ---- Shared Auth Step (golfer step 3, caddy step 1) ----
  const renderAuthStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Create your account</Text>
      <View style={styles.inputStack}>
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="First Name"
            placeholderTextColor="#B8A88266"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            accessibilityLabel="First name"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Last Name"
            placeholderTextColor="#B8A88266"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            accessibilityLabel="Last name"
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor="#B8A88266"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Email address"
          accessibilityHint="Enter your email address"
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
            accessibilityLabel="Password"
            accessibilityHint="Must be at least 8 characters"
          />
          <TouchableOpacity
            onPress={() => setShowPassword(v => !v)}
            style={styles.eyeBtn}
            activeOpacity={0.7}
          >
            <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={18} color="#B8A882" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ---- Caddy Step 2: Username, DOB, Hometown ----
  const renderCaddyProfileStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Set up your profile</Text>

      <View style={styles.prefixRow}>
        <Text style={styles.prefixText}>@</Text>
        <TextInput
          style={styles.prefixInput}
          placeholder="username"
          placeholderTextColor="#B8A88266"
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Username"
          accessibilityHint="Letters, numbers, underscores, and dots only"
        />
        {usernameOk && <Ionicons name="checkmark-circle" size={18} color="#7DC87A" style={{ marginRight: 12 }} />}
      </View>
      {!!usernameError && (
        <Text style={styles.usernameErrorText} accessibilityLiveRegion="polite">{usernameError}</Text>
      )}

      <Text style={styles.fieldLabel}>Date of Birth</Text>
      <View style={styles.dobRow}>
        <TouchableOpacity
          style={[styles.selectorBtn, { flex: 2 }]}
          onPress={() => setActiveDropdown(activeDropdown === 'month' ? null : 'month')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, !dobMonth && styles.selectorPlaceholder]}>
            {dobMonth || 'Month'}
          </Text>
          <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, { flex: 1 }]}
          onPress={() => setActiveDropdown(activeDropdown === 'day' ? null : 'day')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, !dobDay && styles.selectorPlaceholder]}>
            {dobDay || 'Day'}
          </Text>
          <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, { flex: 2 }]}
          onPress={() => setActiveDropdown(activeDropdown === 'year' ? null : 'year')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, !dobYear && styles.selectorPlaceholder]}>
            {dobYear || 'Year'}
          </Text>
          <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
        </TouchableOpacity>
      </View>
      {(activeDropdown === 'month' || activeDropdown === 'day' || activeDropdown === 'year') && (
        <View style={styles.dropdownList}>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {(activeDropdown === 'month' ? MONTHS : activeDropdown === 'day' ? DAYS : YEARS).map((val) => {
              const current = activeDropdown === 'month' ? dobMonth : activeDropdown === 'day' ? dobDay : dobYear;
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.dropdownItem, current === val && styles.dropdownItemActive]}
                  onPress={() => {
                    if (activeDropdown === 'month') setDobMonth(val);
                    else if (activeDropdown === 'day') setDobDay(val);
                    else setDobYear(val);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, current === val && styles.dropdownItemTextActive]}>{val}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Text style={styles.fieldLabel}>Hometown City</Text>
      <TextInput
        style={styles.input}
        placeholder="City…"
        placeholderTextColor="#B8A88266"
        value={homeCity}
        onChangeText={(text) => {
          setHomeCity(text);
          setActiveDropdown(null);
          if (text.length >= 2) {
            const matches = US_CITIES.filter(c =>
              c.toLowerCase().startsWith(text.toLowerCase())
            ).slice(0, 5);
            setCitySuggestions(matches);
          } else {
            setCitySuggestions([]);
          }
        }}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {citySuggestions.length > 0 && (
        <View style={styles.courseResults}>
          {citySuggestions.map((city) => (
            <TouchableOpacity
              key={city}
              style={styles.courseResultRow}
              onPress={() => { setHomeCity(city); setCitySuggestions([]); }}
              activeOpacity={0.7}
            >
              <Text style={styles.courseResultName}>{city}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // ---- Golfer Step 4: Username, DOB, Location ----
  const renderGolferProfileStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Set up your profile</Text>

      <View style={styles.prefixRow}>
        <Text style={styles.prefixText}>@</Text>
        <TextInput
          style={styles.prefixInput}
          placeholder="username"
          placeholderTextColor="#B8A88266"
          value={username}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Username"
          accessibilityHint="Letters, numbers, underscores, and dots only"
        />
        {usernameOk && <Ionicons name="checkmark-circle" size={18} color="#7DC87A" style={{ marginRight: 12 }} />}
      </View>
      {!!usernameError && (
        <Text style={styles.usernameErrorText} accessibilityLiveRegion="polite">{usernameError}</Text>
      )}

      <Text style={styles.fieldLabel}>Date of Birth</Text>
      <View style={styles.dobRow}>
        <TouchableOpacity
          style={[styles.selectorBtn, { flex: 2 }]}
          onPress={() => setActiveDropdown(activeDropdown === 'month' ? null : 'month')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, !dobMonth && styles.selectorPlaceholder]}>
            {dobMonth || 'Month'}
          </Text>
          <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, { flex: 1 }]}
          onPress={() => setActiveDropdown(activeDropdown === 'day' ? null : 'day')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, !dobDay && styles.selectorPlaceholder]}>
            {dobDay || 'Day'}
          </Text>
          <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, { flex: 2 }]}
          onPress={() => setActiveDropdown(activeDropdown === 'year' ? null : 'year')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, !dobYear && styles.selectorPlaceholder]}>
            {dobYear || 'Year'}
          </Text>
          <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
        </TouchableOpacity>
      </View>
      {(activeDropdown === 'month' || activeDropdown === 'day' || activeDropdown === 'year') && (
        <View style={styles.dropdownList}>
          <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {(activeDropdown === 'month' ? MONTHS : activeDropdown === 'day' ? DAYS : YEARS).map((val) => {
              const current = activeDropdown === 'month' ? dobMonth : activeDropdown === 'day' ? dobDay : dobYear;
              return (
                <TouchableOpacity
                  key={val}
                  style={[styles.dropdownItem, current === val && styles.dropdownItemActive]}
                  onPress={() => {
                    if (activeDropdown === 'month') setDobMonth(val);
                    else if (activeDropdown === 'day') setDobDay(val);
                    else setDobYear(val);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={[styles.dropdownItemText, current === val && styles.dropdownItemTextActive]}>{val}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Text style={styles.fieldLabel}>Hometown City</Text>
      <TextInput
        style={styles.input}
        placeholder="City…"
        placeholderTextColor="#B8A88266"
        value={homeCity}
        onChangeText={(text) => {
          setHomeCity(text);
          setActiveDropdown(null);
          if (text.length >= 2) {
            const matches = US_CITIES.filter(c =>
              c.toLowerCase().startsWith(text.toLowerCase())
            ).slice(0, 5);
            setCitySuggestions(matches);
          } else {
            setCitySuggestions([]);
          }
        }}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {citySuggestions.length > 0 && (
        <View style={styles.courseResults}>
          {citySuggestions.map((city) => (
            <TouchableOpacity
              key={city}
              style={styles.courseResultRow}
              onPress={() => { setHomeCity(city); setCitySuggestions([]); }}
              activeOpacity={0.7}
            >
              <Text style={styles.courseResultName}>{city}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.fieldLabel}>State</Text>
      <TouchableOpacity
        style={styles.selectorBtn}
        onPress={() => setActiveDropdown(activeDropdown === 'state' ? null : 'state')}
        activeOpacity={0.8}
      >
        <Text style={[styles.selectorText, !homeState && styles.selectorPlaceholder]}>
          {homeState || 'Select state…'}
        </Text>
        <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
      </TouchableOpacity>
      {activeDropdown === 'state' && (
        <View style={styles.dropdownList}>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {US_STATES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.dropdownItem, homeState === st && styles.dropdownItemActive]}
                onPress={() => { setHomeState(st); setActiveDropdown(null); }}
              >
                <Text style={[styles.dropdownItemText, homeState === st && styles.dropdownItemTextActive]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={styles.fieldLabel}>Country</Text>
      <TouchableOpacity
        style={styles.selectorBtn}
        onPress={() => setActiveDropdown(activeDropdown === 'country' ? null : 'country')}
        activeOpacity={0.8}
      >
        <Text style={styles.selectorText}>{homeCountry}</Text>
        <Ionicons name="chevron-down" size={13} color="#C9A84C66" />
      </TouchableOpacity>
      {activeDropdown === 'country' && (
        <View style={styles.dropdownList}>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.dropdownItem, homeCountry === c && styles.dropdownItemActive]}
                onPress={() => { setHomeCountry(c); setActiveDropdown(null); }}
              >
                <Text style={[styles.dropdownItemText, homeCountry === c && styles.dropdownItemTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // ---- Golfer Step 5: Home Course ----
  const renderGolferHomeCourse = () => (
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
            <Ionicons name="close" size={14} color="#B8A882" />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search courses…"
            placeholderTextColor="#B8A88266"
            onChangeText={handleCourseSearch}
            autoCapitalize="words"
          />
          {courseResults.length > 0 && (
            <View style={styles.courseResults}>
              {courseResults.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.courseResultRow}
                  onPress={() => { setHomeCourse(c.name); setCourseResults([]); }}
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
        onPress={handleCreateProfile}
        activeOpacity={0.7}
        style={styles.skipBtn}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <View style={styles.referralSection}>
        <Text style={styles.referralLabel}>Have a referral code?</Text>
        <TextInput
          style={styles.referralInput}
          placeholder="Enter code (optional)"
          placeholderTextColor="#B8A88266"
          value={referralCodeInput}
          onChangeText={v => setReferralCodeInput(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
        />
      </View>
    </View>
  );

  // ---- Caddy Step 3: Home Courses (multi-select up to 3) ----
  const renderCaddyCoursesStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What course do you caddy at?</Text>
      <Text style={styles.stepSubtitle}>Select up to 3 courses. The first will be your home base.</Text>

      {/* Selected courses chips */}
      {caddyCourses.length > 0 && (
        <View style={styles.caddyChipsRow}>
          {caddyCourses.map((c, i) => (
            <View key={c.name} style={[styles.caddyCourseChip, i === 0 && styles.caddyCourseChipPrimary]}>
              {i === 0 && (
                <Ionicons name="home" size={11} color="#090F0A" style={{ marginRight: 2 }} />
              )}
              <Text style={[styles.caddyCourseChipText, i === 0 && styles.caddyCourseChipTextPrimary]} numberOfLines={1}>
                {c.name}
              </Text>
              <TouchableOpacity onPress={() => removeCaddyCourse(c.name)} activeOpacity={0.7} style={styles.courseChipX}>
                <Ionicons name="close" size={13} color={i === 0 ? '#090F0A' : '#B8A882'} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Search input (hide when 3 selected) */}
      {caddyCourses.length < 3 && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search courses…"
            placeholderTextColor="#B8A88266"
            value={caddyCourseQuery}
            onChangeText={handleCaddyCourseSearch}
            autoCapitalize="words"
          />
          {caddyCourseResults.length > 0 && (
            <View style={styles.courseResults}>
              {caddyCourseResults
                .filter(c => !caddyCourses.find(s => s.name === c.name))
                .map((c, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.courseResultRow}
                    onPress={() => addCaddyCourse(c)}
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

      <Text style={styles.caddyCourseHint}>
        This will be your home base on Clocked
      </Text>
    </View>
  );

  // ---- Caddy Step 4: Experience ----
  const renderCaddyExperienceStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>How long have you been caddying?</Text>
      <View style={styles.pickerWrap}>
        <View style={[styles.selectionLine, { top: ITEM_HEIGHT }]} />
        <View style={[styles.selectionLine, { top: ITEM_HEIGHT * 2 }]} />
        <ScrollView
          ref={expScrollRef}
          style={{ height: ITEM_HEIGHT * 3 }}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const rawIndex = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
            const index    = Math.max(0, Math.min(CADDY_EXPERIENCE_OPTIONS.length - 1, rawIndex));
            setCaddyExperience(CADDY_EXPERIENCE_OPTIONS[index]);
          }}
        >
          {CADDY_EXPERIENCE_OPTIONS.map((opt) => {
            const selected = opt === caddyExperience;
            return (
              <View key={opt} style={styles.pickerItem}>
                <Text style={[
                  styles.expPickerText,
                  selected ? styles.expPickerSelected : styles.expPickerUnselected,
                ]}>
                  {opt}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.referralSection}>
        <Text style={styles.referralLabel}>Have a referral code?</Text>
        <TextInput
          style={styles.referralInput}
          placeholder="Enter code (optional)"
          placeholderTextColor="#B8A88266"
          value={referralCodeInput}
          onChangeText={v => setReferralCodeInput(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
        />
      </View>
    </View>
  );

  const renderStep = () => {
    if (isCaddy) {
      switch (step) {
        case 0: return renderStep0();
        case 1: return renderAuthStep();
        case 2: return renderCaddyProfileStep();
        case 3: return renderCaddyCoursesStep();
        case 4: return renderCaddyExperienceStep();
        default: return null;
      }
    }
    // golfer
    switch (step) {
      case 0: return renderStep0();
      case 1: return renderGolferStep1();
      case 2: return renderGolferStep2();
      case 3: return renderAuthStep();
      case 4: return renderGolferProfileStep();
      case 5: return renderGolferHomeCourse();
      default: return null;
    }
  };

  // Which step triggers handleCreateAuth?
  const isAuthStep = (isCaddy && step === 1) || (!isCaddy && step === 3);
  // Last step before congrats for each flow
  const isLastStep = (isCaddy && step === 4) || (!isCaddy && step === 5);
  // Golfer home-course step has special button handling inside renderStep
  const isGolferCourseStep = !isCaddy && step === 5;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
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
          {step === 0
            ? <Ionicons name="close" size={22} color="#C9A84C" />
            : <Text style={styles.backBtnText}>←</Text>
          }
        </TouchableOpacity>

        {/* Step content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}

          {!!error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>}

          {/* NEXT / FINISH SETUP button — shown for all steps except the golfer home-course step */}
          {!isGolferCourseStep && (
            <TouchableOpacity
              style={[styles.btnPrimary, (!canAdvance() || authLoading) && styles.btnDisabled]}
              onPress={() => {
                if (isAuthStep) {
                  handleCreateAuth();
                } else if (isLastStep) {
                  handleCreateProfile();
                } else {
                  handleNext();
                }
              }}
              activeOpacity={0.8}
              disabled={!canAdvance() || authLoading}
            >
              {authLoading && isAuthStep ? (
                <ActivityIndicator size="small" color="#090F0A" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {isLastStep ? 'FINISH SETUP' : 'NEXT'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Golfer home-course step: show FINISH SETUP only when course selected */}
          {isGolferCourseStep && homeCourse !== '' && (
            <TouchableOpacity
              style={[styles.btnPrimary, loading && styles.btnDisabled]}
              onPress={handleCreateProfile}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#090F0A" />
              ) : (
                <Text style={styles.btnPrimaryText}>FINISH SETUP</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    backgroundColor: 'rgba(125,200,122,0.12)',
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
  stepSubtitle: {
    fontSize: 13,
    color: '#B8A882',
    marginTop: -8,
  },

  // ---- Account type cards ----
  acctCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0D1A0F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.2)',
    padding: 20,
  },
  acctCardActive: {
    borderColor: '#C9A84C',
    backgroundColor: 'rgba(201,168,76,0.06)',
  },
  acctCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0A1A0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#B8A882',
    marginBottom: 3,
  },
  acctCardTitleActive: {
    color: '#F5EDD8',
  },
  acctCardSub: {
    fontSize: 12,
    color: '#7A6E58',
    lineHeight: 16,
  },

  // ---- Picker ----
  pickerWrap: {
    position: 'relative',
    alignSelf: 'center',
    width: 260,
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
  expPickerText: {
    textAlign: 'center',
    fontWeight: '600',
  },
  expPickerSelected: {
    fontSize: 22,
    color: '#C9A84C',
  },
  expPickerUnselected: {
    fontSize: 16,
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
    borderColor: 'rgba(125,200,122,0.2)',
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
    borderColor: 'rgba(125,200,122,0.2)',
    borderRadius: 12,
    padding: 16,
    color: '#F5EDD8',
    fontSize: 16,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C9A84C99',
    letterSpacing: 2,
    marginBottom: -4,
  },
  dobRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  selectorText: {
    fontSize: 15,
    color: '#F5EDD8',
    flex: 1,
  },
  selectorPlaceholder: {
    color: '#B8A88266',
  },
  ageGateNote: {
    fontSize: 12,
    color: 'rgba(184,168,130,0.5)',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 28,
    lineHeight: 18,
  },
  dropdownList: {
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.2)',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: -8,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125,200,122,0.06)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(201,168,76,0.08)',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#B8A882',
  },
  dropdownItemTextActive: {
    color: '#C9A84C',
    fontWeight: '600',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.2)',
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
  prefixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1A0F',
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.2)',
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
    borderColor: 'rgba(125,200,122,0.2)',
    overflow: 'hidden',
  },
  courseResultRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125,200,122,0.08)',
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

  // ---- Caddy course chips ----
  caddyChipsRow: {
    flexDirection: 'column',
    gap: 8,
  },
  caddyCourseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(125,200,122,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  caddyCourseChipPrimary: {
    backgroundColor: '#7DC87A',
    borderColor: '#7DC87A',
  },
  caddyCourseChipText: {
    fontSize: 14,
    color: '#7DC87A',
    fontWeight: '500',
    flex: 1,
  },
  caddyCourseChipTextPrimary: {
    color: '#090F0A',
    fontWeight: '700',
  },
  caddyCourseHint: {
    fontSize: 12,
    color: '#7DC87A',
    marginTop: 4,
    fontWeight: '500',
  },

  usernameErrorText: {
    fontSize: 12,
    color: '#C07A6A',
    marginTop: -8,
  },

  // ---- Referral ----
  referralSection: {
    marginTop: 8,
    gap: 8,
  },
  referralLabel: {
    fontSize: 12,
    color: '#B8A882',
    letterSpacing: 0.5,
  },
  referralInput: {
    backgroundColor: '#0D1A0F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(125,200,122,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F5EDD8',
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

  // ---- Onboarding photo picker ----
  photoPickerWrap:   { alignItems: 'center', marginTop: 24, marginBottom: 8, gap: 10 },
  photoPickerCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A44', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoPickerImage:  { width: 88, height: 88, borderRadius: 44 },
  photoPickerLabel:  { fontSize: 12, color: '#B8A882', textAlign: 'center' },

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

  // ---- ToS consent ----
  tosRow:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 20, marginBottom: 4, paddingHorizontal: 4 },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#7DC87A', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked: { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  tosText:         { flex: 1, fontSize: 12, color: '#B8A882', lineHeight: 18 },
  tosLink:         { color: '#C9A84C', textDecorationLine: 'underline' },
});
