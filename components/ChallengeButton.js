import { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

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
              await supabase.from('notifications').insert({
                user_id: targetUserId,
                type:    'challenge_received',
                title:   "You've been challenged! ⚡",
                body:    `${myHandle} challenges you at ${courseName}. Beat their ${challengerScore != null ? `${scoreStr} Clocked Score` : 'score'}.`,
                meta:    { challenge_id: ch?.id, challenger_id: user.id, challenger_username: myProfile?.username ?? '', course_name: courseName },
              });
              supabase.functions.invoke('send-push', {
                body: { userId: targetUserId, title: "You've been challenged! ⚡", body: `${courseName} · Beat ${scoreStr} in 30 days.` },
              }).catch(() => {});
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
  btn:       { borderWidth: 1, borderColor: '#C9A84C', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 20, alignItems: 'center' },
  disabled:  { opacity: 0.4 },
  txt:       { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  inlineTxt: { fontSize: 11, fontWeight: '700', color: '#C9A84C' },
});
