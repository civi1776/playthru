// ─── ArcadeHomeScreen — the ARCADE tab ───────────────────────────────────────
// Lobby for the Clocked Arcade: dress your golfer, pick the clock, see the
// board, hit PLAY. The game itself runs full-screen on the root stack
// ('ArcadeGame' → ArcadeScreen) so the tab bar never eats the course.

import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { COLOR, TYPE, SPACING, RADIUS, CARD } from '../lib/theme';
import { formatSeconds } from '../lib/clockedSport';
import {
  DEFAULT_AVATAR, SKIN, SHIRT, PANTS, HAIR, HATS,
  loadAvatar, saveAvatar, loadArcadeDifficulty, saveArcadeDifficulty,
} from '../lib/arcade/avatar';
import { SwingStage } from '../components/arcade/Golfer';
import InitialsAvatar from '../components/InitialsAvatar';

const DIFFICULTIES = [
  { key: 'beginner',     label: 'BEGINNER', sub: 'Roomy clock',  color: COLOR.green },
  { key: 'intermediate', label: 'INTER.',   sub: 'The standard', color: COLOR.amber },
  { key: 'pro',          label: 'PRO',      sub: 'Tour pace',    color: COLOR.red },
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
  const [board, setBoard] = useState(null);
  const [best, setBest] = useState(null);
  const { pose, t } = useDemoSwing();
  const loadedRef = useRef(false);

  useEffect(() => {
    loadAvatar().then(a => { setAvatar(a); loadedRef.current = true; });
    loadArcadeDifficulty(profile?.preferred_difficulty ?? 'intermediate').then(setDifficulty);
  }, []);

  const updateAvatar = (patch) => {
    Haptics.selectionAsync().catch(() => {});
    setAvatar(prev => { const next = { ...prev, ...patch }; saveAvatar(next); return next; });
  };
  const pickDifficulty = (d) => { setDifficulty(d); saveArcadeDifficulty(d); };

  const loadBoard = useCallback(async () => {
    try {
      const { data: rows } = await supabase
        .from('arcade_scores')
        .select('id, user_id, points, total_seconds, difficulty, clocked_score, total_strokes, holes_under_clock')
        .order('points', { ascending: false })
        .order('total_seconds', { ascending: true })
        .limit(10);
      const ids = [...new Set((rows ?? []).map(r => r.user_id).filter(Boolean))];
      let profiles = [];
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids);
        profiles = data ?? [];
      }
      const pmap = {}; profiles.forEach(p => { pmap[p.id] = p; });
      setBoard((rows ?? []).map(r => ({ ...r, profile: pmap[r.user_id] })));
      if (user?.id) {
        const { data: mine } = await supabase
          .from('arcade_scores')
          .select('points, total_seconds, difficulty, clocked_score, holes_under_clock, created_at')
          .eq('user_id', user.id)
          .order('points', { ascending: false }).order('total_seconds', { ascending: true })
          .limit(1);
        setBest(mine?.[0] ?? null);
      }
    } catch { setBoard([]); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadBoard(); }, [loadBoard]));

  const play = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('ArcadeGame', { autostart: true, difficulty, avatar });
  };

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={st.header}>
          <View>
            <Text style={st.wordmark}>CLOCKED ARCADE</Text>
            <Text style={st.tag}>SAME RULES. SAME CLOCK. NO TEE TIME.</Text>
          </View>
          <Ionicons name="game-controller-outline" size={22} color={COLOR.gold} />
        </View>

        {/* Hero: your golfer, swinging */}
        <View style={st.heroCard}>
          <View style={st.stage}>
            <SwingStage avatar={avatar} pose={pose} club="DRIVER" width={148} height={111} idleT={t} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroTitle}>Nine holes.{'\n'}One clock.</Text>
            <Text style={st.heroSub}>Drive the cart, swing on the meter, beat time par. The clock never stops — not even between holes.</Text>
            {best ? (
              <View style={st.bestPill}>
                <Text style={st.bestLabel}>YOUR BEST</Text>
                <Text style={st.bestVal}>{best.points > 0 ? `+${best.points}` : best.points} <Text style={st.bestMeta}>· {formatSeconds(best.total_seconds)} · {String(best.difficulty).toUpperCase()}</Text></Text>
              </View>
            ) : (
              <Text style={[st.bestLabel, { marginTop: 10 }]}>NO ROUNDS POSTED YET</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={st.primaryBtn} onPress={play} activeOpacity={0.85} accessibilityLabel="Play the arcade">
          <Ionicons name="play" size={16} color={COLOR.bg} />
          <Text style={st.primaryBtnText}>PLAY NINE</Text>
        </TouchableOpacity>

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
        <Text style={st.sectionQ}>YOUR GOLFER</Text>
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

        {/* How it plays */}
        <Text style={st.sectionQ}>HOW IT PLAYS</Text>
        <View style={st.card}>
          <HowRow icon="locate-outline" text="Drag from the ball to aim. Release to start the meter — your golfer's backswing grows with the power. Tap to swing." />
          <HowRow icon="timer-outline"  text="Stand over the ball too long and the shot cone widens. Hesitation costs accuracy and clock." />
          <HowRow icon="car-sport-outline" text="Drive to your ball. The cart has real momentum: it drifts wide at speed and slides in sand. Hit TURBO when it's charged." />
          <HowRow icon="trophy-outline" text="Real Clocked scoring: par 1, birdie 3, eagle 6. Over time par costs half a point per 30s. Pick up at double." />
        </View>

        {/* Leaderboard */}
        <Text style={st.sectionQ}>ARCADE LEADERBOARD</Text>
        <View style={[st.card, { padding: 0 }]}>
          {board == null && <ActivityIndicator color={COLOR.gold} style={{ padding: 16 }} />}
          {board?.length === 0 && <Text style={st.emptyText}>No arcade rounds posted yet. Be first.</Text>}
          {board?.map((r, i) => {
            const name = r.profile?.full_name || r.profile?.username || 'Player';
            const isYou = r.user_id === user?.id;
            return (
              <View key={r.id ?? i} style={[st.boardRow, i < board.length - 1 && st.boardRowBorder]}>
                <Text style={[st.rank, i < 3 && { color: COLOR.gold }]}>{i + 1}</Text>
                <InitialsAvatar name={r.profile?.full_name} username={r.profile?.username} avatarUrl={r.profile?.avatar_url} size={32} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[st.boardName, isYou && { color: COLOR.gold }]} numberOfLines={1}>{name}{isYou ? '  (you)' : ''}</Text>
                  <Text style={st.boardMeta}>{formatSeconds(r.total_seconds)} · {String(r.difficulty ?? '').toUpperCase()} · {r.holes_under_clock ?? 0}/9 under</Text>
                </View>
                <Text style={st.boardPts}>{r.points > 0 ? `+${r.points}` : r.points}</Text>
              </View>
            );
          })}
        </View>
        <Text style={st.footnote}>Arcade rounds never touch your real Clocked Score or round history.</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  wordmark: { ...TYPE.labelOn, fontSize: 12, letterSpacing: 3 },
  tag: { fontSize: 8, color: '#C9A84C88', letterSpacing: 1.5, marginTop: 3 },

  heroCard: { ...CARD, flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: COLOR.borderGold, padding: 12 },
  stage: { width: 150, height: 112, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: '#0B1F11', borderWidth: 1, borderColor: COLOR.border, alignItems: 'center', justifyContent: 'flex-end' },
  heroTitle: { color: COLOR.cream, fontSize: 20, fontWeight: '300', lineHeight: 25 },
  heroSub: { color: COLOR.muted, fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  bestPill: { marginTop: 10 },
  bestLabel: { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2 },
  bestVal: { ...TYPE.statNumber, fontSize: 20, color: COLOR.green, marginTop: 2 },
  bestMeta: { fontSize: 10, color: COLOR.dim, letterSpacing: 0.5 },

  primaryBtn: { backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14, flexDirection: 'row', gap: 8 },
  primaryBtnText: { color: COLOR.bg, fontSize: 14, fontWeight: '800', letterSpacing: 3 },

  sectionQ: { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 8, marginTop: 22 },
  difficultyRow: { flexDirection: 'row', gap: 10 },
  diffBtn: { flex: 1, backgroundColor: COLOR.surface, borderRadius: 14, borderWidth: 1, borderColor: COLOR.border, paddingVertical: 14, alignItems: 'center', gap: 4 },
  diffBtnActive: { borderColor: COLOR.gold, backgroundColor: '#C9A84C0F' },
  diffDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  diffLabel: { fontSize: 11, fontWeight: '700', color: COLOR.dim, letterSpacing: 1 },
  diffLabelActive: { color: COLOR.cream },
  diffSub: { fontSize: 10, color: COLOR.dim },

  card: { ...CARD },
  swatchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  swatchLabel: { width: 78, fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5 },
  swatches: { flexDirection: 'row', gap: 10, flex: 1, flexWrap: 'wrap' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: COLOR.cream, transform: [{ scale: 1.12 }] },
  segs: { flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' },
  seg: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLOR.border },
  segActive: { borderColor: COLOR.gold, backgroundColor: '#C9A84C14' },
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
});
