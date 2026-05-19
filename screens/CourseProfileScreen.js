/*
 * SQL — run in Supabase:
 *
 * alter table courses add column if not exists pop_score numeric default 3.5;
 * alter table courses add column if not exists total_rounds integer default 0;
 * alter table courses add column if not exists description text;
 * alter table courses add column if not exists website text;
 * alter table courses add column if not exists par integer default 72;
 *
 * -- Course Reviews:
 * CREATE TABLE course_reviews (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
 *   user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
 *   body text NOT NULL CHECK (char_length(body) <= 500),
 *   pace_rating integer CHECK (pace_rating >= 1 AND pace_rating <= 5),
 *   created_at timestamptz DEFAULT now(),
 *   likes integer DEFAULT 0
 * );
 * CREATE INDEX idx_course_reviews_course ON course_reviews(course_id);
 * ALTER TABLE course_reviews ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Anyone can read reviews" ON course_reviews FOR SELECT USING (true);
 * CREATE POLICY "Users can insert own reviews" ON course_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
 * CREATE POLICY "Users can delete own reviews" ON course_reviews FOR DELETE USING (auth.uid() = user_id);
 *
 * create table course_follows (
 *   id         uuid primary key default gen_random_uuid(),
 *   user_id    uuid references profiles(id),
 *   course_id  integer references courses(id),
 *   created_at timestamp default now(),
 *   unique(user_id, course_id)
 * );
 * alter table course_follows enable row level security;
 * create policy "select_course_follows" on course_follows for select using (true);
 * create policy "insert_course_follows" on course_follows for insert with check (true);
 * create policy "delete_course_follows" on course_follows for delete using (true);
 */

import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';

function CourseProfileSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22 }}>
        <SkeletonLoader width="70%" height={28} style={{ marginBottom: 10 }} />
        <SkeletonLoader width="45%" height={13} />
      </View>
      <View style={{ margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center', gap: 12 }}>
        <SkeletonLoader width={220} height={220} style={{ borderRadius: 110 }} />
        <SkeletonLoader width={160} height={42} style={{ borderRadius: 14 }} />
      </View>
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 20, gap: 0 }}>
        {[...Array(4)].map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <SkeletonLoader width={44} height={16} />
            <SkeletonLoader width={36} height={10} />
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <SkeletonLoader width={100} height={10} style={{ marginBottom: 10 }} />
        {[...Array(5)].map((_, i) => (
          <View key={i} style={{ backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SkeletonLoader width={28} height={14} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLoader width="55%" height={14} />
              <SkeletonLoader width="35%" height={10} />
            </View>
            <SkeletonLoader width={36} height={28} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function CourseProfileScreen({ navigation, route }) {
  const { session } = useAuth();
  const { course: initialCourse } = route.params;

  const [courseData, setCourseData]       = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);
  const [followed, setFollowed]           = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [recentRounds, setRecentRounds]   = useState([]);
  const [leaderboard, setLeaderboard]     = useState([]);
  const [avgDuration, setAvgDuration]     = useState(null);
  const [fastestDuration, setFastestDuration] = useState(null);
  const [reviews, setReviews]             = useState([]);
  const [userReview, setUserReview]       = useState(null);
  const [hasPlayedHere, setHasPlayedHere] = useState(false);
  const [reviewInput, setReviewInput]     = useState('');
  const [paceRating, setPaceRating]       = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [submitting, setSubmitting]       = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(false);
    try {
    const uid = session?.user?.id ?? null;

    // Live course data
    const { data: course } = await supabase
      .from('courses')
      .select('id, name, city, state, par, pop_score, total_rounds, description, website')
      .eq('id', initialCourse.id)
      .maybeSingle();
    setCourseData(course);

    // Follow status
    const { data: followRow } = await supabase
      .from('course_follows')
      .select('id')
      .eq('user_id', uid)
      .eq('course_id', initialCourse.id)
      .maybeSingle();
    setFollowed(!!followRow);

    // All rounds at this course (for stats, leaderboard, activity)
    const { data: allRounds } = await supabase
      .from('rounds')
      .select('id, pop_score, duration_minutes, created_at, user_id, profiles!rounds_user_id_fkey(full_name, username)')
      .eq('course_name', initialCourse.name)
      .order('created_at', { ascending: false });

    if (allRounds && allRounds.length > 0) {
      // Stats: avg and fastest duration
      const withDuration = allRounds.filter(r => r.duration_minutes);
      if (withDuration.length > 0) {
        const sum = withDuration.reduce((acc, r) => acc + r.duration_minutes, 0);
        setAvgDuration(Math.round(sum / withDuration.length));
        setFastestDuration(Math.min(...withDuration.map(r => r.duration_minutes)));
      }

      // Leaderboard: best round per unique user, sorted by pop_score desc, top 10
      const sorted = [...allRounds].sort((a, b) => (b.pop_score ?? 0) - (a.pop_score ?? 0));
      const seen = new Set();
      const best = [];
      for (const r of sorted) {
        if (!seen.has(r.user_id)) { seen.add(r.user_id); best.push(r); }
        if (best.length === 10) break;
      }
      setLeaderboard(best);

      // Recent activity: last 10
      setRecentRounds(allRounds.slice(0, 10));
    }

    // Reviews (only if course has a valid UUID id)
    if (initialCourse.id && typeof initialCourse.id === 'string' && initialCourse.id.length > 10) {
      const { data: reviewsData } = await supabase
        .from('course_reviews')
        .select('id, user_id, body, pace_rating, created_at, profiles!course_reviews_user_id_fkey(username, full_name, avatar_url)')
        .eq('course_id', initialCourse.id)
        .order('created_at', { ascending: false })
        .limit(20);
      const revs = reviewsData ?? [];
      setReviews(revs);

      if (uid) {
        setUserReview(revs.find(r => r.user_id === uid) ?? null);
        const { data: playedRound } = await supabase
          .from('rounds')
          .select('id')
          .eq('course_name', initialCourse.name)
          .eq('user_id', uid)
          .limit(1)
          .maybeSingle();
        setHasPlayedHere(!!playedRound);
      }
    }

    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleFollow = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setFollowLoading(true);
    if (followed) {
      setFollowed(false);
      await supabase.from('course_follows').delete()
        .eq('user_id', userId)
        .eq('course_id', initialCourse.id);
    } else {
      setFollowed(true);
      await supabase.from('course_follows').insert({
        user_id: userId,
        course_id: initialCourse.id,
      });
    }
    setFollowLoading(false);
  };

  const submitReview = async () => {
    const uid = session?.user?.id;
    if (!uid || !paceRating || !reviewInput.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('course_reviews').insert({
        course_id: initialCourse.id,
        user_id: uid,
        body: reviewInput.trim(),
        pace_rating: paceRating,
      });
      if (error) { Alert.alert('Error', error.message); return; }
      setReviewInput('');
      setPaceRating(0);
      setShowReviewForm(false);
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteReview = (reviewId) => {
    Alert.alert('Delete review?', 'This will remove your review.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('course_reviews').delete().eq('id', reviewId);
        await fetchAll();
      }},
    ]);
  };

  const pop          = parseFloat(courseData?.pop_score ?? initialCourse.avgPop ?? 3.5) || 3.5;
  const totalRounds  = courseData?.total_rounds ?? initialCourse.rounds ?? 0;
  const par          = courseData?.par ?? initialCourse.par ?? 72;
  const description  = courseData?.description;
  const location     = initialCourse.location
    ?? [initialCourse.city, initialCourse.state].filter(Boolean).join(', ')
    ?? '';

  return (
    <SafeAreaView style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerLabel}>COURSE</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <CourseProfileSkeleton />
      ) : error ? (
        <View style={s.errorState}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.errorText}>Could not load course data.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={fetchAll} activeOpacity={0.8}>
            <Text style={s.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>

          {/* Hero */}
          <View style={s.hero}>
            <View style={{ marginBottom: 12 }}>
              <CourseAvatar
                courseName={initialCourse.name}
                city={location?.split(',')[0]?.trim()}
                size={52}
              />
            </View>
            <Text style={s.courseName}>{initialCourse.name}</Text>
            {!!location && <Text style={s.courseLocation}>{location}</Text>}
          </View>

          {/* POPScore hero */}
          <View style={s.popHeroCard}>
            <Text style={[s.popHeroNum, { color: popColor(pop) }]}>{pop.toFixed(1)}</Text>
            <Text style={s.popHeroLabel}>COURSE POPSCORE</Text>
            {totalRounds > 0 && (
              <Text style={s.popHeroRounds}>Based on {Number(totalRounds).toLocaleString()} rounds</Text>
            )}
            {avgDuration != null && (
              <View style={s.popHeroTimeRow}>
                <Ionicons name="time-outline" size={12} color="#B8A882" />
                <Text style={s.popHeroTime}>avg pace {formatDuration(avgDuration)}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[s.followBtn, followed && s.followingBtn]}
              onPress={toggleFollow}
              disabled={followLoading}
              activeOpacity={0.8}
            >
              {followLoading ? (
                <ActivityIndicator color={followed ? '#C9A84C' : '#090F0A'} size="small" />
              ) : (
                <>
                  <Ionicons
                    name={followed ? 'bookmark' : 'bookmark-outline'}
                    size={13}
                    color={followed ? '#C9A84C' : '#090F0A'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[s.followBtnText, followed && s.followingBtnText]}>
                    {followed ? 'FOLLOWING COURSE' : 'FOLLOW COURSE'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Stats row */}
          <View style={s.statsCard}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{Number(totalRounds).toLocaleString()}</Text>
              <Text style={s.statLabel}>ROUNDS</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{par}</Text>
              <Text style={s.statLabel}>PAR</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{formatDuration(avgDuration)}</Text>
              <Text style={s.statLabel}>AVG TIME</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{formatDuration(fastestDuration)}</Text>
              <Text style={s.statLabel}>FASTEST</Text>
            </View>
          </View>

          {/* Description */}
          {!!description && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>ABOUT</Text>
              <View style={s.descCard}>
                <Text style={s.descText}>{description}</Text>
              </View>
            </View>
          )}

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>TOP PACE PLAYERS</Text>
              {leaderboard.map((round, i) => {
                const name = round.profiles?.full_name?.split(' ')[0]
                          ?? round.profiles?.username
                          ?? 'Unknown';
                return (
                  <View key={round.id} style={[s.leaderRow, i === 0 && s.leaderRowGold]}>
                    <Text style={[s.leaderRank, i === 0 && { color: '#C9A84C' }]}>#{i + 1}</Text>
                    {i === 0 && (
                      <Ionicons name="trophy" size={13} color="#C9A84C" style={{ marginRight: 4 }} />
                    )}
                    <View style={s.leaderInfo}>
                      <Text style={[s.leaderName, i === 0 && { color: '#C9A84C' }]}>{name}</Text>
                      <Text style={s.leaderDate}>{formatDate(round.created_at)}</Text>
                    </View>
                    <Text style={[s.leaderPop, { color: popColor(round.pop_score) }]}>
                      {round.pop_score?.toFixed(1) ?? '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Recent Activity */}
          {recentRounds.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>RECENT ACTIVITY</Text>
              <View style={s.activityCard}>
                {recentRounds.map((round, i) => {
                  const name = round.profiles?.full_name?.split(' ')[0]
                            ?? round.profiles?.username
                            ?? 'Unknown';
                  return (
                    <View
                      key={round.id}
                      style={[s.activityRow, i < recentRounds.length - 1 && s.activityRowBorder]}
                    >
                      <View style={s.activityInfo}>
                        <Text style={s.activityName}>{name}</Text>
                        <Text style={s.activityMeta}>
                          {formatDate(round.created_at)}
                          {round.duration_minutes ? `  ·  ${formatDuration(round.duration_minutes)}` : ''}
                        </Text>
                      </View>
                      <Text style={[s.activityPop, { color: popColor(round.pop_score) }]}>
                        {round.pop_score?.toFixed(1) ?? '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Leaderboard empty state */}
          {leaderboard.length === 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>TOP PACE PLAYERS</Text>
              <View style={s.emptyCard}>
                <Ionicons name="trophy-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 12 }} />
                <Text style={s.emptyText}>No rounds logged here yet. Be the first.</Text>
              </View>
            </View>
          )}

          {/* Activity empty state */}
          {recentRounds.length === 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>RECENT ACTIVITY</Text>
              <View style={s.emptyCard}>
                <Text style={s.emptyTextSmall}>No recent activity at this course.</Text>
              </View>
            </View>
          )}

          {/* ── PACE REVIEWS ── */}
          {initialCourse.id && typeof initialCourse.id === 'string' && initialCourse.id.length > 10 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>PACE REVIEWS</Text>

              {/* Prompt to leave a review */}
              {session?.user?.id && !userReview && (
                <TouchableOpacity
                  style={s.reviewPrompt}
                  onPress={() => setShowReviewForm(v => !v)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={showReviewForm ? 'chevron-up-outline' : 'chatbubble-ellipses-outline'}
                    size={16} color="#C9A84C"
                  />
                  <Text style={s.reviewPromptText}>
                    {hasPlayedHere ? 'You played here — leave a pace review' : 'Played here? Leave a pace review'}
                  </Text>
                  {hasPlayedHere && (
                    <View style={s.playedBadge}>
                      <Ionicons name="checkmark-circle" size={10} color="#7DC87A" />
                      <Text style={s.playedBadgeText}>Verified</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Review form */}
              {showReviewForm && !userReview && (
                <View style={s.reviewForm}>
                  <Text style={s.ratingLabel}>Pace rating</Text>
                  <View style={s.flagRatingRow}>
                    {[1,2,3,4,5].map(i => (
                      <TouchableOpacity key={i} onPress={() => setPaceRating(i)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
                        <Ionicons
                          name={i <= paceRating ? 'flag' : 'flag-outline'}
                          size={26}
                          color={i <= paceRating ? '#C9A84C' : 'rgba(201,168,76,0.25)'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={s.reviewInput}
                    placeholder="How was the pace? Rangers enforcing? Tee times stacked?"
                    placeholderTextColor="#B8A88244"
                    value={reviewInput}
                    onChangeText={setReviewInput}
                    maxLength={500}
                    multiline
                    numberOfLines={3}
                  />
                  <Text style={s.charCount}>{reviewInput.length}/500</Text>
                  <TouchableOpacity
                    style={[s.submitBtn, (!paceRating || !reviewInput.trim() || submitting) && s.submitBtnDisabled]}
                    onPress={submitReview}
                    disabled={!paceRating || !reviewInput.trim() || submitting}
                    activeOpacity={0.8}
                  >
                    <Text style={s.submitBtnText}>{submitting ? 'POSTING...' : 'POST REVIEW'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Reviews list */}
              {reviews.length === 0 ? (
                <View style={s.emptyCard}>
                  <Ionicons name="chatbubble-outline" size={36} color="rgba(201,168,76,0.2)" style={{ marginBottom: 8 }} />
                  <Text style={s.emptyTextSmall}>No reviews yet. Be the first to review this course.</Text>
                </View>
              ) : (
                reviews.map(review => {
                  const uid = session?.user?.id;
                  const isOwn = review.user_id === uid;
                  const name = review.profiles?.full_name ?? review.profiles?.username ?? 'Unknown';
                  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <View key={review.id} style={s.reviewCard}>
                      <View style={s.reviewHeader}>
                        <View style={s.reviewAvatar}>
                          <Text style={s.reviewAvatarText}>{initials}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={s.reviewerName}>{name}</Text>
                            {isOwn && hasPlayedHere && (
                              <View style={s.verifiedBadge}>
                                <Ionicons name="checkmark-circle" size={10} color="#7DC87A" />
                                <Text style={s.verifiedText}>Played here</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.reviewTime}>{timeAgo(review.created_at)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 2, paddingLeft: 6 }}>
                          {[1,2,3,4,5].map(i => (
                            <Ionicons
                              key={i}
                              name={i <= review.pace_rating ? 'flag' : 'flag-outline'}
                              size={11}
                              color={i <= review.pace_rating ? '#C9A84C' : 'rgba(201,168,76,0.2)'}
                            />
                          ))}
                        </View>
                      </View>
                      <Text style={s.reviewBody}>{review.body}</Text>
                      {isOwn && (
                        <TouchableOpacity
                          style={s.deleteReviewBtn}
                          onPress={() => deleteReview(review.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={s.deleteReviewText}>Delete review</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#090F0A' },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:            { width: 40, height: 40, justifyContent: 'center' },
  backArrow:          { fontSize: 22, color: '#C9A84C' },
  headerLabel:        { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },

  // Hero
  hero:               { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  courseName:         { fontSize: 28, fontWeight: '600', color: '#F5EDD8', marginBottom: 6 },
  courseLocation:     { fontSize: 13, color: '#B8A882' },

  // POPScore hero card
  popHeroCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 28, borderWidth: 1, borderColor: '#7DC87A22', alignItems: 'center', gap: 4 },
  popHeroNum:         { fontSize: 80, fontFamily: 'Georgia', lineHeight: 88, textAlign: 'center' },
  popHeroLabel:       { fontSize: 9, fontWeight: '700', color: 'rgba(201,168,76,0.6)', letterSpacing: 4, marginTop: 2, marginBottom: 4 },
  popHeroRounds:      { fontSize: 12, color: '#B8A882', marginBottom: 4 },
  popHeroTimeRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 },
  popHeroTime:        { fontSize: 12, color: '#B8A882', fontFamily: 'monospace' },
  followBtn:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 4 },
  followingBtn:       { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#C9A84C44' },
  followBtnText:      { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  followingBtnText:   { color: '#C9A84C' },

  // Stats
  statsCard:          { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 20 },
  statItem:           { flex: 1, alignItems: 'center' },
  statValue:          { fontSize: 15, fontWeight: '500', color: '#F5EDD8', marginBottom: 4 },
  statLabel:          { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5, textAlign: 'center' },
  statDivider:        { width: 1, backgroundColor: '#7DC87A22', marginVertical: 4 },

  // Section
  section:            { paddingHorizontal: 16, marginBottom: 10 },
  sectionLabel:       { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2, marginBottom: 10 },

  // Description
  descCard:           { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16 },
  descText:           { fontSize: 13, color: '#B8A882', lineHeight: 20 },

  // Leaderboard
  leaderRow:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 6 },
  leaderRowGold:      { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  leaderRank:         { fontSize: 12, fontWeight: '700', color: '#B8A882', width: 28 },
  leaderInfo:         { flex: 1 },
  leaderName:         { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  leaderDate:         { fontSize: 10, color: '#B8A88266', marginTop: 2 },
  leaderPop:          { fontSize: 26, fontWeight: '300' },

  // Recent Activity
  activityCard:       { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', overflow: 'hidden' },
  activityRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  activityRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  activityInfo:       { flex: 1 },
  activityName:       { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  activityMeta:       { fontSize: 10, color: '#B8A88266', marginTop: 2 },
  activityPop:        { fontSize: 26, fontWeight: '300' },

  // Reviews
  reviewPrompt:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C33', padding: 14, marginBottom: 10 },
  reviewPromptText:   { flex: 1, fontSize: 13, color: '#C9A84C', fontWeight: '500' },
  playedBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7DC87A22', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  playedBadgeText:    { fontSize: 9, fontWeight: '700', color: '#7DC87A' },
  reviewForm:         { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, marginBottom: 10, gap: 10 },
  ratingLabel:        { fontSize: 11, fontWeight: '600', color: '#B8A882', letterSpacing: 1 },
  flagRatingRow:      { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  reviewInput:        { backgroundColor: '#090F0A', borderWidth: 1, borderColor: '#7DC87A22', borderRadius: 10, padding: 12, color: '#F5EDD8', fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  charCount:          { fontSize: 10, color: '#B8A88255', textAlign: 'right' },
  submitBtn:          { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitBtnDisabled:  { opacity: 0.4 },
  submitBtnText:      { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  reviewCard:         { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8 },
  reviewHeader:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  reviewAvatar:       { width: 32, height: 32, borderRadius: 16, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText:   { fontSize: 12, fontWeight: '700', color: '#C9A84C' },
  reviewerName:       { fontSize: 13, fontWeight: '600', color: '#F5EDD8' },
  reviewTime:         { fontSize: 10, color: '#B8A88255', marginTop: 2 },
  verifiedBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7DC87A15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  verifiedText:       { fontSize: 9, fontWeight: '700', color: '#7DC87A' },
  reviewBody:         { fontSize: 13, color: '#B8A882', lineHeight: 19 },
  deleteReviewBtn:    { marginTop: 8, alignSelf: 'flex-start' },
  deleteReviewText:   { fontSize: 11, color: '#C07A6A55', fontWeight: '500' },

  // Empty / Error
  emptyCard:          { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 28, alignItems: 'center' },
  emptyText:          { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', lineHeight: 28 },
  emptyTextSmall:     { fontSize: 14, color: '#7A6E58', textAlign: 'center' },
  errorState:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  errorText:          { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', marginBottom: 20 },
  retryBtn:           { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryText:          { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});
