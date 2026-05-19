import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// SQL to run in Supabase:
// alter table profiles add column if not exists push_token text;

// Must be set at module load time — controls foreground notification display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function setupNotifications() {
  // Request permissions
  const permBefore = await Notifications.getPermissionsAsync();
  let finalStatus = permBefore.status;

  if (permBefore.status !== 'granted') {
    const permAfter = await Notifications.requestPermissionsAsync();
    finalStatus = permAfter.status;
  }

  if (finalStatus !== 'granted') {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PlayThru',
      importance: Notifications.AndroidImportance.MAX,
      sound: true,
    });
  }

  // Get and save push token (physical device only)
  if (Device.isDevice) {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ push_token: tokenData.data })
        .eq('id', user.id);
    } catch (e) {
      // silent fail
    }
  }

}

export async function sendLocalNotification(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null, // fire immediately
    });
  } catch (e) {
    // silent fail
  }
}

// ─── Weekly POPScore Digest — every Monday 8am ────────────────────────────────
export async function scheduleWeeklyDigest(popScore, rank, roundsThisMonth) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const tier = rank < 100 ? '100' : rank < 500 ? '500' : '1,000';
    const messages = [
      { title: 'Your weekly PlayThru digest 📊', body: `Your POPScore is ${popScore.toFixed(1)}. You're ranked #${rank} nationally. Keep logging!` },
      { title: 'How fast did you play this week?', body: `You have ${roundsThisMonth} rounds logged this month. Log another to improve your rank.` },
      { title: `POPScore update: ${popScore.toFixed(1)}`, body: `You're in the top ${tier} nationally. Can you climb higher?` },
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];

    await Notifications.scheduleNotificationAsync({
      content: { title: msg.title, body: msg.body, sound: true, data: { type: 'weekly_digest' } },
      trigger: { weekday: 2, hour: 8, minute: 0, repeats: true },
    });

    // Also schedule monthly challenge countdown (28th of every month, 9am)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '3 days left in the monthly challenge ⏱',
        body: 'The leaderboard resets soon. Log your rounds now to lock in your rank!',
        sound: true,
        data: { type: 'monthly_challenge' },
      },
      trigger: { day: 28, hour: 9, minute: 0, repeats: true },
    });
  } catch (e) {
    // silent fail
  }
}

// ─── Leaderboard Move Alert ────────────────────────────────────────────────────
export async function sendRankMoveNotification(oldRank, newRank, popScore) {
  if (!oldRank || !newRank || newRank >= oldRank) return;
  try {
    const moved = oldRank - newRank;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `You moved up ${moved} spot${moved > 1 ? 's' : ''}! 🏆`,
        body: `New POPScore: ${popScore.toFixed(1)} — You're now ranked #${newRank} nationally. Keep it up!`,
        sound: true,
        data: { type: 'rank_move' },
      },
      trigger: { seconds: 60 * 60 * 3 }, // 3 hours later
    });
  } catch (e) {
    // silent fail
  }
}

// ─── Inactivity Reminder — resets 14-day clock on every round save ─────────────
export async function scheduleInactivityReminder() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = scheduled.find(n => n.content.data?.type === 'inactivity');
    if (existing) await Notifications.cancelScheduledNotificationAsync(existing.identifier);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your POPScore is getting stale 🏌️',
        body: "You haven't logged a round in 2 weeks. Get out there and play!",
        sound: true,
        data: { type: 'inactivity' },
      },
      trigger: { seconds: 60 * 60 * 24 * 14 },
    });
  } catch (e) {
    // silent fail
  }
}

// ─── Milestone Notifications ───────────────────────────────────────────────────
export async function checkAndSendMilestone(totalRounds, popScore, bestPOP, userId) {
  let title, body;

  if (totalRounds === 1) {
    title = 'First round logged! 🎉';
    body = `Welcome to PlayThru. Your POPScore is ${popScore.toFixed(1)}. Log more rounds to improve it.`;
  } else if (totalRounds === 5) {
    title = 'Five rounds logged! 🔥';
    body = `Your POPScore is ${popScore.toFixed(1)}. You're building your reputation as a fast player.`;
  } else if (totalRounds === 10) {
    title = "10 rounds! You're on a roll 🏌️";
    body = `Double digits. Your POPScore is ${popScore.toFixed(1)}. Check your national rank.`;
  } else if (totalRounds === 25) {
    title = "25 rounds logged — you're committed 💪";
    body = `POPScore: ${popScore.toFixed(1)}. You're in the top tier of PlayThru users.`;
  } else if (popScore >= 4.0 && bestPOP < 4.0) {
    title = 'You crossed 4.0! Elite pace 🏆';
    body = `POPScore ${popScore.toFixed(1)} — you are now an officially fast golfer. Share it!`;
  } else if (popScore >= 4.5 && bestPOP < 4.5) {
    title = "POPScore 4.5+ — you're elite ⚡";
    body = "Only the fastest golfers reach 4.5. You're one of them.";
  }

  if (!title) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { type: 'milestone' } },
      trigger: { seconds: 60 * 60 * 2 }, // 2 hours later
    });
  } catch (e) {
    // silent fail
  }

  // Post milestone to activity feed
  if (userId) {
    try {
      await supabase.from('activity_feed').insert({
        user_id: userId,
        type: 'milestone',
        content: { title, body, pop_score: popScore, rounds: totalRounds },
      });
    } catch (e) {
      // silent fail
    }
  }
}

// ─── Push to another user ──────────────────────────────────────────────────────
// Send a push notification to another user via their stored Expo push token.
export async function sendPushToUser(recipientUserId, title, body) {
  try {
    const { data } = await supabase
      .from('profiles').select('push_token').eq('id', recipientUserId).maybeSingle();
    if (!data?.push_token) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: data.push_token, title, body, sound: 'default' }),
    });
  } catch (e) {
    // silent fail
  }
}
