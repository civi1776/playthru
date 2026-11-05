// ─── ArcadeHomeScreen — the ARCADE tab ───────────────────────────────────────
// Lobby for the Clocked Arcade: dress your golfer, pick the clock, see the
// board, hit PLAY. The game itself runs full-screen on the root stack
// ('ArcadeGame' → ArcadeScreen) so the tab bar never eats the course.

import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COLOR, TYPE, SPACING, RADIUS, CARD } from '../lib/theme';
import { formatSeconds } from '../lib/clockedSport';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_AVATAR, SKIN, SHIRT, PANTS, HAIR, HATS, AVATAR_KEY,
  loadAvatar, saveAvatar, loadArcadeDifficulty, saveArcadeDifficulty,
} from '../lib/arcade/avatar';
import { DIFFICULTY as ARCADE_DIFFICULTY } from '../lib/arcade/engine';
import { SwingStage } from '../components/arcade/Golfer';
import { QUALIFY_TOP, currentSeason, seasonLabel, daysLeftInSeason, fetchSeasonBoard, fetchAllTimeBoard, fetchMyQualifiers } from '../lib/arcade/season';
import { createArcadeChallenge, fetchMyArcadeChallenges, respondToArcadeChallenge } from '../lib/arcade/challenges';
import InitialsAvatar from '../components/InitialsAvatar';
import ArcadeBoardRow from '../components/arcade/ArcadeBoardRow';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';

const DIFFICULTIES = [
  { key: 'beginner',     label: 'BEGINNER', sub: ARCADE_DIFFICULTY.beginner.blurb,     color: COLOR.green },
  { key: 'intermediate', label: 'INTER.',   sub: ARCADE_DIFFICULTY.intermediate.blurb, color: COLOR.amber },
  { key: 'pro',          label: 'PRO',      sub: ARCADE_DIFFICULTY.pro.blurb,          color: COLOR.red },
];

// Demo swing loop for the lobby: idle → backswing → down → finish → hold.
function useDemoSwing() {
  const [pose, setPose] = useState(0);
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now();
    const ease = (x) => x * x * (3 - 2 * x);
    const loop = (ts) => {
      const c = ((ts - start) / 1000) % 3.6;
      let p = 0;
      if (c < 1.1) p = 0;
      else if (c < 1.9) p = -ease((c - 1.1) / 0.8);
      else if (c < 2.2) p = -(1 - ((c - 1.9) / 0.3) ** 2);
      else if (c < 2.55) p = ease((c - 2.2) / 0.35);
      else p = 1;
      setPose(p); setT((ts - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return { pose, t };
}

export default function ArcadeHomeScreen({ navigation }) {
  const { user, profile } = useAuth();
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [difficulty, setDifficulty] = useState(profile?.preferred_difficulty ?? 'intermediate');
  const [boardMode, setBoardMode] = useState('season');   // 'season' | 'alltime'
  const [season, setSeason] = useState(null);
  const [allTime, setAllTime] = useState(null);
  const [qualifiers, setQualifiers] = useState([]);
  const [challenges, setChallenges] = useState(null);
  const [friends, setFriends] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [customize, setCustomize] = useState(false);
  const { pose, t } = useDemoSwing();
  const loadedRef = useRef(false);

  useEffect(() => {
    loadAvatar().then(a => { setAvatar(a); loadedRef.current = true; });
    // First visit: open the customizer. After that it stays collapsed.
    AsyncStorage.getItem(AVATAR_KEY).then(v => { if (!v) setCustomize(true); }).catch(() => {});
    loadArcadeDifficulty(profile?.preferred_difficulty ?? 'intermediate').then(setDifficulty);
  }, []);

  const updateAvatar = (patch) => {
    Haptics.selectionAsync().catch(() => {});
    setAvatar(prev => { const next = { ...prev, ...patch }; saveAvatar(next); return next; });
  };
  const pickDifficulty = (d) => { setDifficulty(d); saveArcadeDifficulty(d); };

  const loadBoard = useCallback(async () => {
    try {
      const [s, a, q, c] = await Promise.all([
        fetchSeasonBoard().catch(() => []),
        fetchAllTimeBoard(10).catch(() => []),
        fetchMyQualifiers(user?.id).catch(() => []),
        fetchMyArcadeChallenges(user?.id).catch(() => []),
      ]);
      setSeason(s); setAllTime(a); setQualifiers(q); setChallenges(c);
    } catch { setSeason([]); setAllTime([]); setChallenges([]); }
  }, [user?.id]);

  const loadFriends = useCallback(async () => {
    if (!user?.id) { setFriends([]); return; }
    const { data } = await supabase
      .from('follows')
      .select('following_id, profiles!follows_following_id_fkey(id, full_name, username, avatar_url)')
      .eq('follower_id', user.id);
    setFriends((data ?? []).map(r => r.profiles).filter(Boolean));
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadBoard(); }, [loadBoard]));

  const play = (challenge = null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (challenge) {
      navigation.navigate('ArcadeGame', { autostart: true, difficulty: challenge.difficulty, avatar, seed: Number(challenge.seed), challenge });
    } else {
      navigation.navigate('ArcadeGame', { autostart: true, difficulty, avatar });
    }
  };

  const openPicker = () => {
    if (!user?.id) { Alert.alert('Sign in to challenge', 'Arcade challenges are tied to your account.'); return; }
    setPickerOpen(true);
    if (friends == null) loadFriends();
  };

  const challengeFriend = async (friend) => {
    setPickerOpen(false);
    setBusyId(friend.id);
    try {
      await createArcadeChallenge({ me: user.id, myUsername: profile?.username, opponentId: friend.id, opponentUsername: friend.username, difficulty });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await loadBoard();
    } catch (e) {
      Alert.alert('Challenge not sent', e?.message ?? 'Check your connection and try again.');
    } finally { setBusyId(null); }
  };

  const respond = async (ch, accept) => {
    setBusyId(ch.id);
    try {
      await respondToArcadeChallenge(ch, user.id, profile?.username, accept);
      await loadBoard();
      if (accept) play({ ...ch, status: 'accepted' });
    } catch (e) {
      Alert.alert('Could not respond', e?.message ?? 'Check your connection and try again.');
    } finally { setBusyId(null); }
  };

  const myRank = season?.find(r => r.user_id === user?.id)?.rank ?? null;
  const open = (challenges ?? []).filter(c => ['respond', 'play', 'waiting'].includes(c.action));
  const finished = (challenges ?? []).filter(c => ['done', 'declined', 'expired'].includes(c.action)).slice(0, 5);
  const board = boardMode === 'season' ? season : allTime;
  const nameOf = (p) => p?.full_name || p?.username || 'Player';

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="ARCADE" subtitle="Same rules. Same clock. No tee time." brand style={{ paddingHorizontal: 0, paddingTop: 0 }} />

        {/* Hero: your golfer, swinging */}
        <View style={st.heroCard}>
          <View style={st.stage}>
            <SwingStage avatar={avatar} pose={pose} club="DRIVER" width={148} height={111} idleT={t} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroTitle}>Nine holes.{'\n'}One clock.</Text>
            <Text style={st.heroSub}>Drive the cart, swing on the meter, beat time par. The clock never stops, not even between holes.</Text>
            {myRank ? (
              <View style={st.bestPill}>
                <Text style={st.bestLabel}>THIS MONTH</Text>
                <Text style={st.bestVal}>#{myRank} <Text style={st.bestMeta}>· {myRank <= QUALIFY_TOP ? 'qualifying' : `top ${QUALIFY_TOP} qualifies`} · {daysLeftInSeason()}d left</Text></Text>
              </View>
            ) : (
              <Text style={[st.bestLabel, { marginTop: 10 }]}>NO QUALIFYING RUN THIS MONTH</Text>
            )}
          </View>
        </View>

        <Button label="PLAY NINE" icon="play" size="lg" onPress={() => play()} style={{ marginTop: 14 }} accessibilityLabel="Play the arcade" />

        {/* Difficulty */}
        <Text style={st.sectionQ}>SHOT CLOCK</Text>
        <View style={st.difficultyRow}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity key={d.key} style={[st.diffBtn, difficulty === d.key && st.diffBtnActive]} onPress={() => pickDifficulty(d.key)} activeOpacity={0.8}>
              <View style={[st.diffDot, { backgroundColor: d.color }]} />
              <Text style={[st.diffLabel, difficulty === d.key && st.diffLabelActive]}>{d.label}</Text>
              <Text style={st.diffSub}>{d.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Avatar */}
        <TouchableOpacity style={st.sectionToggle} onPress={() => setCustomize(c => !c)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: customize }}>
          <Text style={[st.sectionQ, { marginTop: 0, marginBottom: 0 }]}>YOUR GOLFER</Text>
          <Text style={st.sectionToggleText}>{customize ? 'DONE' : 'CUSTOMIZE'}</Text>
        </TouchableOpacity>
        {customize && (
        <View style={st.card}>
          <SwatchRow label="SKIN"  colors={SKIN}  value={avatar.skin}  onPick={(i) => updateAvatar({ skin: i })} />
          <SwatchRow label="SHIRT" colors={SHIRT} value={avatar.shirt} onPick={(i) => updateAvatar({ shirt: i })} />
          <SwatchRow label="PANTS" colors={PANTS} value={avatar.pants} onPick={(i) => updateAvatar({ pants: i })} />
          <SwatchRow label="HAIR"  colors={HAIR}  value={avatar.hair}  onPick={(i) => updateAvatar({ hair: i })} />
          <View style={st.swatchRow}>
            <Text style={st.swatchLabel}>HAT</Text>
            <View style={st.segs}>
              {HATS.map(h => (
                <TouchableOpacity key={h.key} style={[st.seg, avatar.hat === h.key && st.segActive]} onPress={() => updateAvatar({ hat: h.key })} activeOpacity={0.8}>
                  <Text style={[st.segText, avatar.hat === h.key && st.segTextActive]}>{h.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {avatar.hat !== 'none' && (
            <SwatchRow label="HAT COLOR" colors={SHIRT} value={avatar.hatColor} onPick={(i) => updateAvatar({ hatColor: i })} />
          )}
        </View>
        )}

        {/* How it plays */}
        <Text style={st.sectionQ}>HOW IT PLAYS</Text>
        <View style={st.card}>
          <HowRow icon="locate-outline" text="Drag from the ball to aim. Release to start the meter, and your golfer's backswing grows with the power. Tap to swing. Tap the club readout to pick any club, from a chip to the driver." />
          <HowRow icon="timer-outline"  text="Stand over the ball too long and the shot cone widens. Hesitation costs accuracy and clock." />
          <HowRow icon="car-sport-outline" text="Drive to your ball. The cart has real momentum: it drifts wide at speed and slides in sand. Turbo with the button, or drop a second finger while you steer. Hole out and you're already on the next tee." />
          <HowRow icon="flag-outline" text="The flagstick is real. Hit it hard and the ball bounces off; catch it right and it drops in." />
          <HowRow icon="trophy-outline" text="Real Clocked scoring: par 1, birdie 3, eagle 6. Pick up at double." />
          <HowRow icon="alarm-outline" text="The clock is a buzzer. Hit zero and the hole is over: double bogey and one more, −3. A ball already in the air gets to land." />
          <HowRow icon="flame-outline" text="HEAT. Beat the clock three holes in a row for +1, six for +2, all nine for +3. One slow hole and the streak is gone." />
        </View>

        {/* Qualifier banner */}
        {qualifiers.length > 0 && (
          <View style={st.qualCard}>
            <Ionicons name="ribbon" size={22} color={COLOR.goldBright} />
            <View style={{ flex: 1 }}>
              <Text style={st.qualTitle}>You qualified.</Text>
              <Text style={st.qualSub}>
                {qualifiers.map(q => `${seasonLabel(q.season)} · #${q.rank}`).join('  ·  ')}
                {'\n'}A spot in the first Clocked event's qualifier is yours. We'll reach out with details.
              </Text>
            </View>
          </View>
        )}

        {/* Challenges */}
        <View style={st.sectionToggle}>
          <Text style={[st.sectionQ, { marginTop: 0, marginBottom: 0 }]}>CHALLENGES</Text>
          <TouchableOpacity onPress={openPicker} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Challenge a friend">
            <Text style={st.sectionToggleText}>+ CHALLENGE A FRIEND</Text>
          </TouchableOpacity>
        </View>
        <View style={[st.card, { padding: 0 }]}>
          {challenges == null && <ActivityIndicator color={COLOR.gold} style={{ padding: 16 }} />}
          {challenges?.length === 0 && (
            <Text style={st.emptyText}>Same nine holes, same clock, seven days. Challenge someone you follow and see who posts the better run.</Text>
          )}
          {open.map((c, i) => (
            <View key={c.id} style={[st.chRow, (i < open.length - 1 || finished.length > 0) && st.boardRowBorder]}>
              <InitialsAvatar name={c.opponent?.full_name} username={c.opponent?.username} avatarUrl={c.opponent?.avatar_url} size={34} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={st.boardName} numberOfLines={1}>{c.iAmChallenger ? 'You' : nameOf(c.opponent)} challenged {c.iAmChallenger ? nameOf(c.opponent) : 'you'}</Text>
                <Text style={st.boardMeta}>{String(c.difficulty).toUpperCase()} · {c.action === 'waiting' ? `your run is in · waiting on ${nameOf(c.opponent).split(' ')[0]}` : c.action === 'respond' ? 'accept to play the same nine' : 'your turn to post a run'}</Text>
              </View>
              {c.action === 'respond' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[st.miniBtn, st.miniBtnOn]} onPress={() => respond(c, true)} disabled={busyId === c.id} activeOpacity={0.8}><Text style={[st.miniBtnText, { color: COLOR.bg }]}>ACCEPT</Text></TouchableOpacity>
                  <TouchableOpacity style={st.miniBtn} onPress={() => respond(c, false)} disabled={busyId === c.id} activeOpacity={0.8}><Text style={st.miniBtnText}>PASS</Text></TouchableOpacity>
                </View>
              )}
              {c.action === 'play' && (
                <TouchableOpacity style={[st.miniBtn, st.miniBtnOn]} onPress={() => play(c)} activeOpacity={0.8}><Text style={[st.miniBtnText, { color: COLOR.bg }]}>PLAY</Text></TouchableOpacity>
              )}
              {c.action === 'waiting' && <Ionicons name="hourglass-outline" size={18} color={COLOR.dim} />}
            </View>
          ))}
          {finished.map((c, i) => {
            const won = c.status === 'complete' && c.winner_id === user?.id;
            const tie = c.status === 'complete' && !c.winner_id;
            const label = c.status === 'complete' ? (tie ? 'TIED' : won ? 'WON' : 'LOST') : c.action === 'declined' ? 'DECLINED' : 'EXPIRED';
            const color = c.status === 'complete' ? (tie ? COLOR.amber : won ? COLOR.green : COLOR.red) : COLOR.dim;
            return (
              <View key={c.id} style={[st.chRow, i < finished.length - 1 && st.boardRowBorder, { opacity: 0.85 }]}>
                <InitialsAvatar name={c.opponent?.full_name} username={c.opponent?.username} avatarUrl={c.opponent?.avatar_url} size={34} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={st.boardName} numberOfLines={1}>vs {nameOf(c.opponent)}</Text>
                  <Text style={st.boardMeta}>
                    {c.status === 'complete'
                      ? `${c.myPoints > 0 ? '+' : ''}${c.myPoints} · ${formatSeconds(c.mySeconds)}   vs   ${c.theirPoints > 0 ? '+' : ''}${c.theirPoints} · ${formatSeconds(c.theirSeconds)}`
                      : String(c.difficulty).toUpperCase()}
                  </Text>
                </View>
                <Text style={[st.resultTag, { color }]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {/* Leaderboard */}
        <View style={st.sectionToggle}>
          <Text style={[st.sectionQ, { marginTop: 0, marginBottom: 0 }]}>{boardMode === 'season' ? seasonLabel(currentSeason()).toUpperCase() : 'ALL TIME'}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[['season', 'THIS MONTH'], ['alltime', 'ALL TIME']].map(([k, l]) => (
              <TouchableOpacity key={k} style={[st.seg, boardMode === k && st.segActive]} onPress={() => setBoardMode(k)} activeOpacity={0.8}>
                <Text style={[st.segText, boardMode === k && st.segTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {boardMode === 'season' && (
          <Text style={st.qualifyNote}>Top {QUALIFY_TOP} at month end earn a spot in the first Clocked event's qualifier. Best run per player; intermediate and pro only. {daysLeftInSeason()} days left.</Text>
        )}
        <View style={[st.card, { padding: 0 }]}>
          {board == null && <ActivityIndicator color={COLOR.gold} style={{ padding: 16 }} />}
          {board?.length === 0 && <Text style={st.emptyText}>{boardMode === 'season' ? 'No qualifying runs yet this month. Play intermediate or pro and be first.' : 'No arcade rounds posted yet. Be first.'}</Text>}
          {board?.map((r, i) => {
            const rank = r.rank ?? i + 1;
            const cut = boardMode === 'season' && rank === QUALIFY_TOP && board.length > QUALIFY_TOP;
            return (
              <View key={r.score_id ?? r.id ?? i}>
                <ArcadeBoardRow row={r} rank={rank} isYou={r.user_id === user?.id} last={i === board.length - 1 || cut}
                  onPress={r.user_id === user?.id ? undefined : () => navigation.navigate('PublicProfile', { userId: r.user_id })} />
                {cut && (
                  <View style={st.cutLine}><Text style={st.cutText}>QUALIFYING LINE</Text></View>
                )}
              </View>
            );
          })}
        </View>
        <Text style={st.footnote}>Arcade rounds never touch your real Clocked Score or round history.</Text>

        {/* Friend picker */}
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <View style={st.modalBack}>
            <View style={st.modalCard}>
              <Text style={st.modalTitle}>CHALLENGE A FRIEND</Text>
              <Text style={st.modalSub}>Nine holes on the same course, {String(difficulty).toUpperCase()}. They have seven days.</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {friends == null && <ActivityIndicator color={COLOR.gold} style={{ padding: 16 }} />}
                {friends?.length === 0 && <Text style={st.emptyText}>You're not following anyone yet. Follow players from the feed or search, then challenge them here.</Text>}
                {friends?.map(f => (
                  <TouchableOpacity key={f.id} style={[st.boardRow, st.boardRowBorder]} onPress={() => challengeFriend(f)} activeOpacity={0.8}>
                    <InitialsAvatar name={f.full_name} username={f.username} avatarUrl={f.avatar_url} size={34} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={st.boardName}>{nameOf(f)}</Text>
                      {!!f.username && <Text style={st.boardMeta}>@{f.username}</Text>}
                    </View>
                    <Ionicons name="flash" size={16} color={COLOR.gold} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={st.modalClose} onPress={() => setPickerOpen(false)} activeOpacity={0.7}><Text style={st.segText}>CANCEL</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function SwatchRow({ label, colors, value, onPick }) {
  return (
    <View style={st.swatchRow}>
      <Text style={st.swatchLabel}>{label}</Text>
      <View style={st.swatches}>
        {colors.map((c, i) => (
          <TouchableOpacity key={c} onPress={() => onPick(i)} activeOpacity={0.8} accessibilityLabel={`${label} option ${i + 1}`}
            style={[st.swatch, { backgroundColor: c }, value === i && st.swatchActive]} />
        ))}
      </View>
    </View>
  );
}

function HowRow({ icon, text }) {
  return (
    <View style={st.howRow}>
      <Ionicons name={icon} size={16} color={COLOR.gold} style={{ marginTop: 1 }} />
      <Text style={st.howText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.bg },

  heroCard: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: COLOR.borderGold, padding: 12 },
  stage: { width: 150, height: 112, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: '#0B1F11', borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'flex-end' },
  heroTitle: { color: COLOR.cream, fontSize: 20, fontWeight: '300', lineHeight: 25 },
  heroSub: { color: COLOR.muted, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  bestPill: { marginTop: 10 },
  bestLabel: { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2 },
  bestVal: { ...TYPE.statNumber, fontSize: 20, color: COLOR.green, marginTop: 2 },
  bestMeta: { fontSize: 10, color: COLOR.dim, letterSpacing: 0.5 },

  sectionQ: { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 8, marginTop: 22 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 },
  sectionToggleText: { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  difficultyRow: { flexDirection: 'row', gap: 10 },
  diffBtn: { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 14, alignItems: 'center', gap: 4 },
  diffBtnActive: { borderColor: COLOR.gold, backgroundColor: '#E8CC6E0F' },
  diffDot: { width: 8, height: 8, borderRadius: RADIUS.xs, marginBottom: 2 },
  diffLabel: { fontSize: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  diffLabelActive: { color: COLOR.cream },
  diffSub: { fontSize: 10, color: COLOR.dim },

  card: { ...CARD },
  swatchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  swatchLabel: { width: 78, fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5 },
  swatches: { flexDirection: 'row', gap: 10, flex: 1, flexWrap: 'wrap' },
  swatch: { width: 28, height: 28, borderRadius: RADIUS.md, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: COLOR.cream, transform: [{ scale: 1.12 }] },
  segs: { flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' },
  seg: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLOR.border },
  segActive: { borderColor: COLOR.gold, backgroundColor: '#E8CC6E14' },
  segText: { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  segTextActive: { color: COLOR.gold },

  howRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  howText: { color: COLOR.muted, fontSize: 12, lineHeight: 17, flex: 1 },

  boardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  boardRowBorder: { borderBottomWidth: 1, borderBottomColor: COLOR.border },
  rank: { ...TYPE.statNumber, width: 24, fontSize: 15, color: COLOR.dim },
  boardName: { color: COLOR.cream, fontSize: 14, fontWeight: '600' },
  boardMeta: { color: COLOR.dim, fontSize: 10, marginTop: 1, letterSpacing: 0.5 },
  boardPts: { ...TYPE.statNumber, fontSize: 20, color: COLOR.green },
  emptyText: { color: COLOR.dim, fontSize: 12, textAlign: 'center', padding: 18 },
  footnote: { color: COLOR.dim, fontSize: 10, textAlign: 'center', marginTop: 12, letterSpacing: 0.3 },
  qualCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E8CC6E14', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.borderGold, padding: 14, marginTop: 22 },
  qualTitle: { color: COLOR.goldBright, fontSize: 15, fontWeight: '700' },
  qualSub: { color: COLOR.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  qualifyNote: { color: COLOR.dim, fontSize: 11, lineHeight: 15, marginBottom: 8 },
  chRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLOR.gold },
  miniBtnOn: { backgroundColor: COLOR.gold },
  miniBtnText: { fontSize: 9, fontWeight: '800', color: COLOR.gold, letterSpacing: 1 },
  resultTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  cutLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLOR.borderGold, backgroundColor: '#E8CC6E0A' },
  cutText: { fontSize: 8, fontWeight: '800', color: COLOR.gold, letterSpacing: 2 },
  modalBack: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, padding: 16 },
  modalTitle: { fontSize: 12, fontWeight: '800', color: COLOR.gold, letterSpacing: 3, textAlign: 'center' },
  modalSub: { fontSize: 12, color: COLOR.muted, textAlign: 'center', marginTop: 6, marginBottom: 10, lineHeight: 17 },
  modalClose: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
});
