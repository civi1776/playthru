/*
 * SQL — seed courses with realistic POPScore data (run in Supabase):
 *
 * update courses
 * set
 *   pop_score    = round((2.8 + random() * 1.8)::numeric, 1),
 *   total_rounds = floor(50 + random() * 1150)::integer;
 *
 * SQL — add avg duration and coordinate columns:
 *
 * alter table courses add column if not exists avg_duration_minutes numeric;
 * alter table courses add column if not exists latitude  numeric;
 * alter table courses add column if not exists longitude numeric;
 */

import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import { supabase } from '../lib/supabase';
import { searchCourses } from '../lib/courses';

// Fallback local data used when Supabase courses table is empty
const LOCAL_COURSES = [
  { id: 1,  name: 'TPC Sawgrass',      location: 'Ponte Vedra Beach, FL', par: 72, holes: 18, avgPop: 4.1, yourPop: 4.3, rounds: 847,  yourRounds: 3, avgDuration: 242 },
  { id: 2,  name: 'Augusta National',  location: 'Augusta, GA',            par: 72, holes: 18, avgPop: 4.4, yourPop: null, rounds: 312,  yourRounds: 0, avgDuration: 195 },
  { id: 3,  name: 'Pebble Beach',      location: 'Pebble Beach, CA',       par: 72, holes: 18, avgPop: 3.8, yourPop: 3.9, rounds: 1204, yourRounds: 1, avgDuration: 258 },
  { id: 4,  name: 'Pinehurst No. 2',   location: 'Pinehurst, NC',          par: 70, holes: 18, avgPop: 4.0, yourPop: 4.2, rounds: 693,  yourRounds: 2, avgDuration: 237 },
  { id: 5,  name: 'Bethpage Black',    location: 'Farmingdale, NY',        par: 71, holes: 18, avgPop: 3.5, yourPop: 3.6, rounds: 988,  yourRounds: 1, avgDuration: 264 },
  { id: 6,  name: 'Torrey Pines',      location: 'La Jolla, CA',           par: 72, holes: 18, avgPop: 3.9, yourPop: null, rounds: 1541, yourRounds: 0, avgDuration: 252 },
  { id: 7,  name: 'Riviera CC',        location: 'Pacific Palisades, CA',  par: 71, holes: 18, avgPop: 4.2, yourPop: 4.0, rounds: 421,  yourRounds: 1, avgDuration: 231 },
  { id: 8,  name: 'Winged Foot',       location: 'Mamaroneck, NY',         par: 72, holes: 18, avgPop: 3.7, yourPop: null, rounds: 256,  yourRounds: 0, avgDuration: 267 },
  { id: 9,  name: 'Medinah CC',        location: 'Medinah, IL',            par: 72, holes: 18, avgPop: 4.0, yourPop: 3.8, rounds: 374,  yourRounds: 2, avgDuration: 248 },
  { id: 10, name: 'Oakland Hills',     location: 'Bloomfield Hills, MI',   par: 70, holes: 18, avgPop: 3.6, yourPop: null, rounds: 189,  yourRounds: 0, avgDuration: 261 },
];

// ─── Approximate coordinates for Florida cities (fallback when GPS unavailable) ─
const FL_CITY_COORDS = {
  'jacksonville':       { lat: 30.3322, lon: -81.6557 },
  'ponte vedra beach':  { lat: 30.2391, lon: -81.3862 },
  'st augustine':       { lat: 29.8943, lon: -81.3145 },
  'orlando':            { lat: 28.5383, lon: -81.3792 },
  'kissimmee':          { lat: 28.2920, lon: -81.4078 },
  'tampa':              { lat: 27.9506, lon: -82.4572 },
  'st petersburg':      { lat: 27.7676, lon: -82.6403 },
  'clearwater':         { lat: 27.9659, lon: -82.8001 },
  'sarasota':           { lat: 27.3364, lon: -82.5307 },
  'naples':             { lat: 26.1420, lon: -81.7948 },
  'fort lauderdale':    { lat: 26.1224, lon: -80.1373 },
  'miami':              { lat: 25.7617, lon: -80.1918 },
  'miami beach':        { lat: 25.7907, lon: -80.1300 },
  'boca raton':         { lat: 26.3683, lon: -80.1289 },
  'palm beach':         { lat: 26.7056, lon: -80.0364 },
  'west palm beach':    { lat: 26.7153, lon: -80.0534 },
  'jupiter':            { lat: 26.9342, lon: -80.0942 },
  'palm beach gardens': { lat: 26.8235, lon: -80.1220 },
  'pensacola':          { lat: 30.4213, lon: -87.2169 },
  'tallahassee':        { lat: 30.4518, lon: -84.2807 },
  'gainesville':        { lat: 29.6516, lon: -82.3248 },
  'daytona beach':      { lat: 29.2108, lon: -81.0228 },
  'fort myers':         { lat: 26.6406, lon: -81.8723 },
  'bonita springs':     { lat: 26.3398, lon: -81.7787 },
};

// ─── Haversine distance (miles) ──────────────────────────────────────────────
function getDistance(lat1, lon1, lat2, lon2) {
  const R    = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(miles) {
  if (miles == null) return null;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

// Look up approximate coords for a course from the FL city table
function fallbackCoordsForCourse(course) {
  if ((course.state ?? '').toUpperCase() !== 'FL') return null;
  const cityKey = (course.city ?? '').toLowerCase().trim();
  return FL_CITY_COORDS[cityKey] ?? null;
}

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function popBgColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#C9A84C';
  return '#C07A6A';
}

function formatAvgTime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function normalise(c) {
  return {
    ...c,
    location:    [c.city, c.state].filter(Boolean).join(', '),
    avgPop:      c.pop_score ?? 3.5,
    rounds:      c.total_rounds ?? 0,
    avgDuration: c.avg_duration_minutes ?? c.avg_time ?? null,
    yourRounds:  0,
  };
}

// Attach distance to each course given user coords; use DB coords if present,
// fallback to FL city table, otherwise null.
function attachDistances(courses, userLat, userLon) {
  return courses.map(c => {
    let dist = null;
    if (c.latitude != null && c.longitude != null) {
      dist = getDistance(userLat, userLon, c.latitude, c.longitude);
    } else {
      const fb = fallbackCoordsForCourse(c);
      if (fb) dist = getDistance(userLat, userLon, fb.lat, fb.lon);
    }
    return { ...c, _dist: dist };
  });
}

// Sort by distance (nulls last), then alphabetically
function sortByProximity(courses) {
  return [...courses].sort((a, b) => {
    if (a._dist != null && b._dist != null) return a._dist - b._dist;
    if (a._dist != null) return -1;
    if (b._dist != null) return  1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

function CourseSkeletons() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <View key={i} style={[s.courseCard, { paddingVertical: 22 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonLoader width="65%" height={16} />
              <SkeletonLoader width="45%" height={11} />
            </View>
            <SkeletonLoader width={40} height={40} style={{ borderRadius: 8 }} />
          </View>
          <SkeletonLoader width="50%" height={10} style={{ marginTop: 12 }} />
        </View>
      ))}
    </>
  );
}

export default function CoursesScreen({ navigation }) {
  const [allCourses,    setAllCourses]    = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [query,         setQuery]         = useState('');
  const [loading,       setLoading]       = useState(true);
  const [searching,     setSearching]     = useState(false);
  const [error,         setError]         = useState(false);
  const [userCoords,    setUserCoords]    = useState(null);   // { lat, lon }
  const [userState,     setUserState]     = useState(null);   // fallback: state name
  const [nearbyCourses, setNearbyCourses] = useState([]);
  const [locationGranted, setLocationGranted] = useState(null); // null=unknown, true, false

  // Request location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationGranted(false);
          // Permission denied — fall back to timezone-based state guess
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
          if (tz.includes('Eastern'))    setUserState('Florida');
          else if (tz.includes('Central')) setUserState('Texas');
          else if (tz.includes('Mountain')) setUserState('Arizona');
          else if (tz.includes('Pacific')) setUserState('California');
          return;
        }
        setLocationGranted(true);
        const loc     = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const { latitude, longitude } = loc.coords;
        setUserCoords({ lat: latitude, lon: longitude });

        // Also resolve state for the fallback label
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        const region  = geocode?.[0]?.region ?? null;
        if (region) setUserState(region);
      } catch (e) {
        // silent fail
      }
    })();
  }, []);

  // Load all courses on mount
  const fetchCourses = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error: err } = await supabase
        .from('courses')
        .select('id, name, city, state, course_type, holes, pop_score, total_rounds, avg_time, latitude, longitude')
        .order('total_rounds', { ascending: false, nullsFirst: false })
        .limit(200);
      if (err) throw err;
      const rows = (data && data.length > 0) ? data.map(normalise) : LOCAL_COURSES;
      setAllCourses(rows);
    } catch (e) {
      setAllCourses(LOCAL_COURSES);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCourses(); }, []);

  // Compute "NEAR YOU" courses whenever coords or full course list updates
  useEffect(() => {
    if (!userCoords || allCourses.length === 0) return;
    const withDist = allCourses
      .filter(c => c.latitude != null && c.longitude != null)
      .map(c => ({ ...c, _dist: getDistance(userCoords.lat, userCoords.lon, c.latitude, c.longitude) }))
      .sort((a, b) => a._dist - b._dist);
    let nearby = withDist.filter(c => c._dist <= 20);
    if (nearby.length < 3) nearby = withDist.filter(c => c._dist <= 50);
    if (nearby.length === 0) nearby = withDist.slice(0, 5);
    setNearbyCourses(nearby.slice(0, 5));
  }, [userCoords, allCourses]);

  // Live search via Edge Function when query is long enough
  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchCourses(query);
        setSearchResults(results.map(normalise));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const isSearching = query.trim().length >= 2;
  const baseList    = isSearching ? searchResults : allCourses;

  // Apply proximity sort + distance-based filtering (browse mode only)
  let displayed;
  if (isSearching) {
    // Search: sort by distance if GPS available, otherwise as-is
    displayed = userCoords
      ? sortByProximity(attachDistances(baseList, userCoords.lat, userCoords.lon))
      : baseList;
  } else if (userCoords) {
    // Browse with GPS: show within 40 mi; expand to 100 mi or all if fewer than 10 results
    const sorted    = sortByProximity(attachDistances(baseList, userCoords.lat, userCoords.lon));
    const within40  = sorted.filter(c => c._dist != null && c._dist <= 40);
    if (within40.length >= 10) {
      displayed = within40;
    } else {
      const within100 = sorted.filter(c => c._dist != null && c._dist <= 100);
      displayed = within100.length >= 10 ? within100 : sorted;
    }
  } else if (userState) {
    // No GPS — state match first, then alpha
    const withState = baseList.map(c => ({
      ...c,
      _dist: null,
      _sameState: (c.state ?? '').toLowerCase().includes(userState.toLowerCase()) ||
                  (c.location ?? '').toLowerCase().includes(userState.toLowerCase()),
    }));
    displayed = [...withState].sort((a, b) => {
      if (a._sameState && !b._sameState) return -1;
      if (!a._sameState && b._sameState) return  1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  } else {
    displayed = baseList;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.wordmark}>COURSES</Text>
      </View>
      <View style={s.searchWrapper}>
        <TextInput
          style={s.searchInput}
          placeholder="Search courses..."
          placeholderTextColor="#B8A88266"
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>

        {/* ── NEAR YOU section ── */}
        {!isSearching && locationGranted === true && nearbyCourses.length > 0 && (
          <View style={s.nearbySection}>
            <Text style={s.nearbySectionLabel}>NEAR YOU</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -22, marginTop: 4 }}
              contentContainerStyle={{ paddingHorizontal: 22, gap: 10 }}
            >
              {nearbyCourses.map((c) => {
                const showPop = (c.total_rounds ?? 0) >= 15 && c.pop_score != null;
                const distLabel = c._dist < 10
                  ? `${c._dist.toFixed(1)} mi`
                  : `${Math.round(c._dist)} mi`;
                const nearbyDisplayPop = c.pop_score && c.pop_score > 0 ? c.pop_score : 3.5;
                const nearbyTimeStr = c.avg_time && !isNaN(c.avg_time)
                  ? `${Math.floor(c.avg_time / 60)}h ${Math.round(c.avg_time % 60)}m`
                  : null;
                return (
                  <TouchableOpacity
                    key={c.id ?? c.name}
                    style={s.nearbyCard}
                    onPress={() => navigation.navigate('CourseProfile', { course: c })}
                    activeOpacity={0.8}
                  >
                    <CourseAvatar courseName={c.name} city={c.city} size={52} />
                    <Text style={s.nearbyName} numberOfLines={2}>{c.name}</Text>
                    <Text style={s.nearbyCity}>{[c.city, c.state].filter(Boolean).join(', ')}</Text>
                    <Text style={s.nearbyDist}>{distLabel}</Text>
                    <Text style={[s.nearbyPop, { color: popColor(nearbyDisplayPop) }]}>
                      {nearbyDisplayPop.toFixed(1)}
                    </Text>
                    {nearbyTimeStr != null && (
                      <Text style={s.nearbyTime}>{nearbyTimeStr}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        {!isSearching && locationGranted === false && (
          <View style={s.locationDenied}>
            <Ionicons name="settings-outline" size={16} color="#C9A84C66" />
            <Text style={s.locationDeniedText}>Enable location to see courses near you</Text>
          </View>
        )}

        {error && allCourses.length === 0 && (
          <View style={s.errorCard}>
            <Text style={s.errorText}>Could not load courses.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={fetchCourses} activeOpacity={0.8}>
              <Text style={s.retryText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <CourseSkeletons />
        ) : (isSearching && searching) ? (
          <CourseSkeletons />
        ) : displayed.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="location-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
            <Text style={s.emptyText}>
              {isSearching ? 'No courses found. Try a different name.' : 'No courses available.'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>{displayed.length} COURSES</Text>
            {displayed.map(course => {
              const hasData = (course.rounds ?? 0) >= 15;
              return (
                <TouchableOpacity
                  key={course.name}
                  style={s.courseCard}
                  onPress={() => navigation.navigate('CourseProfile', { course })}
                  activeOpacity={0.8}
                >
                  {/* Identity row */}
                  <View style={s.courseTop}>
                    <CourseAvatar
                      courseName={course.name}
                      city={course.location?.split(',')[0]?.trim()}
                      size={44}
                    />
                    <View style={s.courseInfo}>
                      <Text style={s.courseName} numberOfLines={1}>{course.name}</Text>
                      <Text style={s.courseLocation} numberOfLines={1}>{course.location}</Text>
                    </View>
                  </View>

                  {/* POPScore accent row */}
                  {(() => {
                    const displayPop = course.pop_score && course.pop_score > 0 ? course.pop_score : 3.5;
                    return (
                      <View style={s.popAccentRow}>
                        <Text style={s.popAccentNum}>{displayPop.toFixed(1)}</Text>
                        <View>
                          <Text style={s.popAccentLabel}>COURSE CLOCKED SCORE</Text>
                          <Text style={s.popAccentRounds}>
                            {course.rounds || 0} round{course.rounds !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Your rounds badge */}
                  {course.yourRounds > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <Ionicons name="checkmark-circle" size={11} color="#7DC87A" />
                      <Text style={s.courseYours}>{course.yourRounds} round{course.yourRounds > 1 ? 's' : ''} logged</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#090F0A' },
  header:         { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12 },
  wordmark:       { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5 },
  searchWrapper:  { paddingHorizontal: 16, marginBottom: 8 },
  searchInput:    { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22', borderRadius: 14, padding: 14, color: '#F5EDD8', fontSize: 15 },
  sectionLabel:   { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, paddingHorizontal: 22, marginBottom: 10, marginTop: 4 },
  courseCard:     { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0D1A0F', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderColor: '#7DC87A22' },
  courseTop:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  courseInfo:     { flex: 1 },
  courseName:     { fontSize: 18, fontWeight: '600', color: '#F5EDD8' },
  courseDist:     { fontSize: 11, color: '#7A6E58', fontFamily: 'monospace' },
  courseLocation: { fontSize: 13, color: '#B8A882', marginTop: 4 },
  popAccentRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: '#162B19', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#7DC87A', marginTop: 10 },
  popAccentNum:   { fontSize: 22, fontWeight: '700', color: '#F5EDD8', fontFamily: 'Georgia' },
  popAccentLabel: { fontSize: 8, letterSpacing: 1, color: '#7DC87A', fontWeight: '600' },
  popAccentRounds:{ fontSize: 9, color: '#B8A882', marginTop: 1 },
  courseAvgTime:  { fontSize: 11, color: '#B8A882', fontFamily: 'monospace', marginTop: 3 },
  courseNoData:   { fontSize: 9, color: '#7A6E5888', textAlign: 'center', marginTop: 3, lineHeight: 13 },
  courseMeta:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  courseMetaText: { fontSize: 11, color: '#B8A88288' },
  courseYours:    { fontSize: 10, fontWeight: '600', color: '#7DC87A' },
  errorCard:      { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  errorText:      { fontSize: 13, color: '#7A6E58', flex: 1 },
  retryBtn:       { backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, marginLeft: 12 },
  retryText:      { fontSize: 10, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  emptyState:        { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyText:         { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', lineHeight: 28 },
  // Near You section
  nearbySection:     { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14 },
  nearbySectionLabel:{ fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 8 },
  nearbyCard:        { width: 140, backgroundColor: '#111D12', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, gap: 4 },
  nearbyName:        { fontSize: 13, fontWeight: '600', color: '#F5EDD8', lineHeight: 18 },
  nearbyCity:        { fontSize: 10, color: '#7A6E58' },
  nearbyDist:        { fontSize: 10, color: '#C9A84C88', marginTop: 1 },
  nearbyPop:         { fontSize: 22, fontWeight: '300', color: '#C9A84C44', marginTop: 4 },
  nearbyTime:        { fontSize: 10, color: '#B8A882' },
  locationDenied:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 4 },
  locationDeniedText:{ fontSize: 11, color: '#7A6E58' },
});
