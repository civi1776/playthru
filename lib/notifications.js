import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
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

// ─── Internal: save/refresh push token for the current user ──────────────────
// Called by setupNotifications() on login and refreshPushToken() on foreground.
async function saveExpoPushToken() {
  if (!Device.isDevice) return; // simulators can't receive push notifications

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('[notifications] saveExpoPushToken: projectId not found in app config');
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (!token) {
      console.error('[notifications] saveExpoPushToken: empty token returned');
      return;
    }

    let user = (await supabase.auth.getUser()).data?.user;
    if (!user?.id) {
      await new Promise(r => setTimeout(r, 1000));
      user = (await supabase.auth.getUser()).data?.user;
    }
    if (!user?.id) {
      console.error('[notifications] saveExpoPushToken: no authenticated user, skipping');
      return;
    }

    const doSave = async () => supabase
      .from('profiles')
      .upsert({ id: user.id, push_token: token }, { onConflict: 'id' });

    let { error } = await doSave();
    if (error) {
      console.error('[notifications] saveExpoPushToken: first attempt failed:', error.message, '— retrying in 2s');
      await new Promise(r => setTimeout(r, 2000));
      ({ error } = await doSave());
    }

    if (error) {
      console.error('[notifications] saveExpoPushToken: retry failed:', error.message);
    } else {
      console.log('[notifications] push_token saved for', user.id, '→', token);
    }
  } catch (e) {
    console.error('[notifications] saveExpoPushToken threw:', e.message);
  }
}

export async function setupNotifications() {
  const permBefore = await Notifications.getPermissionsAsync();
  let finalStatus = permBefore.status;

  if (permBefore.status !== 'granted') {
    const permAfter = await Notifications.requestPermissionsAsync();
    finalStatus = permAfter.status;
  }

  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Clocked',
      importance: Notifications.AndroidImportance.MAX,
      sound: true,
    });
  }

  await saveExpoPushToken();
}

// Call this when the app returns to foreground — tokens can rotate between sessions.
export async function refreshPushToken() {
  const perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted') return;
  await saveExpoPushToken();
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
      { title: 'Your weekly Clocked digest 📊', body: `Your Clocked Score is ${popScore.toFixed(1)}. You're ranked #${rank} nationally. Keep logging!` },
      { title: 'How fast did you play this week?', body: `You have ${roundsThisMonth} rounds logged this month. Log another to improve your rank.` },
      { title: `Clocked Score update: ${popScore.toFixed(1)}`, body: `You're in the top ${tier} nationally. Can you climb higher?` },
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
    const user = (await supabase.auth.getUser()).data?.user;
    if (!user?.id) return;
    await sendPushToUser(
      user.id,
      `You moved up ${moved} spot${moved > 1 ? 's' : ''}! 🏆`,
      `New Clocked Score: ${popScore.toFixed(1)} — You're now ranked #${newRank} nationally. Keep it up!`,
      'rank_move',
    );
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
        title: 'Your Clocked Score is getting stale 🏌️',
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
    body = `Welcome to Clocked. Your Clocked Score is ${popScore.toFixed(1)}. Log more rounds to improve it.`;
  } else if (totalRounds === 5) {
    title = 'Five rounds logged! 🔥';
    body = `Your Clocked Score is ${popScore.toFixed(1)}. You're building your reputation as a fast player.`;
  } else if (totalRounds === 10) {
    title = "10 rounds! You're on a roll 🏌️";
    body = `Double digits. Your Clocked Score is ${popScore.toFixed(1)}. Check your national rank.`;
  } else if (totalRounds === 25) {
    title = "25 rounds logged — you're committed 💪";
    body = `Clocked Score: ${popScore.toFixed(1)}. You're in the top tier of Clocked users.`;
  } else if (popScore >= 4.0 && bestPOP < 4.0) {
    title = 'You crossed 4.0! Elite pace 🏆';
    body = `Clocked Score ${popScore.toFixed(1)} — you are now an officially fast golfer. Share it!`;
  } else if (popScore >= 4.5 && bestPOP < 4.5) {
    title = "Clocked Score 4.5+ — you're elite ⚡";
    body = "Only the fastest golfers reach 4.5. You're one of them.";
  }

  if (!title) return;

  try {
    if (userId) {
      await sendPushToUser(userId, title, body, 'milestone');
    }
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

// ─── Interaction-ladder dead-man's-switch ─────────────────────────────────────
// Rescheduled from zero on every meaningful user interaction (score change,
// hole navigation, app foreground). Cancel on finish / abandon.
//
// Tier 1 — 10 min: soft nudge
// Tier 2 — 20 min: stronger nudge
// Tier 3 — 25 min: reopen prompt (actual auto-pause is detected app-side on
//                  next foreground / rehydration — not triggered by this banner)
const LADDER_TYPE = 'interaction_ladder';

export async function scheduleInteractionLadder(courseName) {
  try {
    await cancelInteractionLadder();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Still on the course?',
        body: `Tap to jump back to your round at ${courseName}.`,
        sound: true,
        data: { type: LADDER_TYPE, tier: 1 },
      },
      trigger: { seconds: 10 * 60 },
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Your round at ${courseName} is still running`,
        body: 'Tap to keep going or finish up.',
        sound: true,
        data: { type: LADDER_TYPE, tier: 2 },
      },
      trigger: { seconds: 20 * 60 },
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Round paused',
        body: `Your round at ${courseName} has been paused. Tap to resume.`,
        sound: false,
        data: { type: LADDER_TYPE, tier: 3 },
      },
      trigger: { seconds: 25 * 60 },
    });
  } catch (e) {
    // silent fail
  }
}

export async function cancelInteractionLadder() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const targets = all.filter(n => n.content.data?.type === LADDER_TYPE);
    await Promise.all(targets.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch (e) {
    // silent fail
  }
}

// ─── Push to another user ──────────────────────────────────────────────────────
// Send a push notification + persist to notifications table for the inbox.
// type is optional (defaults to 'push') — use semantic values like 'friend_round',
// 'course_update', 'comment', 'like', 'referral', 'rank_move', 'milestone'.
export async function sendPushToUser(recipientUserId, title, body, type = 'push') {
  try {
    // Insert into notifications table for the in-app inbox
    supabase.from('notifications').insert({
      user_id: recipientUserId,
      type,
      title,
      body,
    }).then(() => {});

    // Send device push via authenticated Edge Function (token lookup is server-side)
    await supabase.functions.invoke('send-push', {
      body: { userId: recipientUserId, title, body },
    });
  } catch (e) {
    // silent fail
  }
}
