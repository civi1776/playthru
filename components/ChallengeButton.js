import { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { sendPushToUser } from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { COLOR, RADIUS } from '../lib/theme';

export default function ChallengeButton({ targetUserId, targetUsername, courseName, challengerScore, variant }) {
  const { user, profile: myProfile } = useAuth();
  const [sending, setSending] = useState(false);

  if (!user?.id || user.id === targetUserId || !courseName) return null;

  const onPress = () => {
    const scoreStr = challengerScore != null ? challengerScore.toFixed(1) : '—';
    Alert.alert(
      'Send Challenge',
      `Challenge @${targetUsername} at ${courseName}?\n\nYour best Clocked Score there is ${scoreStr}. They have 30 days to beat it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Challenge',
          onPress: async () => {
            if (sending) return;
            setSending(true);
            try {
              const { data: ch } = await supabase
                .from('challenges')
                .insert({
                  challenger_id:    user.id,
                  challenged_id:    targetUserId,
                  course_name:      courseName,
                  challenger_score: challengerScore ?? null,
                  status:           'pending',
                  expires_at:       new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                })
                .select('id')
                .maybeSingle();
              const myHandle = myProfile?.username ? `@${myProfile.username}` : 'Someone';
              // Push + inbox row are both written server-side by send-push.
              await sendPushToUser(
                targetUserId,
                "You've been challenged! ⚡",
                `${myHandle} challenges you at ${courseName}. Beat their ${challengerScore != null ? `${scoreStr} Clocked Score` : 'score'}.`,
                'challenge_received',
                { challenge_id: ch?.id, challenger_id: user.id, challenger_username: myProfile?.username ?? '', course_name: courseName },
              );
            } catch { /* silent fail */ }
            setSending(false);
          },
        },
      ]
    );
  };

  if (variant === 'inline') {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={sending} style={sending ? { opacity: 0.4 } : null} accessibilityLabel={`Challenge ${targetUsername ?? 'this player'}`} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="flash" size={11} color="#C9A84C" />
          <Text style={c.inlineTxt}>Challenge</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (variant === 'profile') {
    return (
      <TouchableOpacity style={[c.profileBtn, sending && c.disabled]} onPress={onPress} activeOpacity={0.8} disabled={sending} accessibilityLabel={`Challenge ${targetUsername ?? 'this player'}`} accessibilityRole="button">
        <Ionicons name="flash" size={13} color={COLOR.gold} />
        <Text style={c.profileTxt}>CHALLENGE</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[c.btn, sending && c.disabled]} onPress={onPress} activeOpacity={0.8} disabled={sending} accessibilityLabel={`Challenge ${targetUsername ?? 'this player'}`} accessibilityRole="button">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="flash" size={11} color="#C9A84C" />
        <Text style={c.txt}>CHALLENGE</Text>
      </View>
    </TouchableOpacity>
  );
}

const c = StyleSheet.create({
  profileBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: COLOR.borderGold, borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: 8 },
  profileTxt: { fontSize: 10, fontWeight: '800', color: COLOR.gold, letterSpacing: 1.5 },
  btn:       { borderWidth: 1, borderColor: COLOR.gold, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 20, alignItems: 'center' },
  disabled:  { opacity: 0.4 },
  txt:       { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  inlineTxt: { fontSize: 11, fontWeight: '700', color: COLOR.gold },
});
