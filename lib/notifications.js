import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// SQL to run in Supabase:
// alter table profiles add column if not exists push_token text;

// Must be set at module load time — controls foreground notification display
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Never show live_round notifications as banners — lock screen only
    if (notification.request.content.data?.type === 'live_round') {
      return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
  },
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

// ─── Leaderboard Move Alert ────────────────────────────────────────────────────
export async function sendRankMoveNotification(oldRank, newRank, popScore) {
  if (!oldRank || !newRank || newRank >= oldRank) return;
  try {
    const moved = oldRank - newRank;
    const user = (await supabase.auth.getUser()).data?.user;
    if (!user?.id) return;
    await sendPushToUser(
      user.id,
      `You moved up ${moved} spot${moved > 1 ? 's' : ''}!`,
      `${(popScore != null && !isNaN(popScore)) ? `New Clocked Score: ${Math.round(popScore)} — ` : ''}You're now ranked #${newRank} nationally. Keep it up!`,
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
        title: 'Your Clocked Score is getting stale',
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
// Round-count milestones only — score-threshold milestones ("crossed 4.0")
// were removed because they compared the old 0–5 pop_score scale against
// summary.totalScore (raw points from lib/clockedSport.js), a different unit
// entirely, and the "bestPOP" comparison was always passed as 0 from the
// round-save flow, so it fired on every qualifying round instead of once.
// Re-add score-based milestones once they're computed against the real
// 0–100 Clocked Score and the caller can supply the player's actual prior best.
export function getMilestoneMessage(totalRounds, popScore) {
  const ps = (popScore != null && !isNaN(popScore)) ? popScore.toFixed(1) : null;

  if (totalRounds === 1) {
    return {
      title: 'First round logged!',
      body: ps ? `Welcome to Clocked. Your Clocked Score is ${ps}. Log more rounds to improve it.` : 'Welcome to Clocked. Log more rounds to build your score.',
    };
  }
  if (totalRounds === 5) {
    return {
      title: 'Five rounds logged!',
      body: ps ? `Your Clocked Score is ${ps}. You're building your reputation as a fast player.` : "You're building your reputation as a fast player.",
    };
  }
  if (totalRounds === 10) {
    return {
      title: "10 rounds! You're on a roll",
      body: ps ? `Double digits. Your Clocked Score is ${ps}. Check your national rank.` : 'Double digits. Check your national rank.',
    };
  }
  if (totalRounds === 25) {
    return {
      title: "25 rounds logged — you're committed",
      body: ps ? `Clocked Score: ${ps}. You're in the top tier of Clocked users.` : "You're in the top tier of Clocked users.",
    };
  }
  return null;
}

// Posts the milestone to the activity feed immediately (that's content for
// other users' feeds, not a push to this user) and sends the notification to
// the player themselves — delayed by delaySeconds so it's a reason to come
// back rather than an instant confirmation. Returns the message, or null.
export async function checkAndSendMilestone(totalRounds, popScore, bestPOP, userId, delaySeconds = 0) {
  const msg = getMilestoneMessage(totalRounds, popScore);
  if (!msg) return null;

  if (userId) {
    try {
      await supabase.from('activity_feed').insert({
        user_id: userId,
        type: 'milestone',
        content: { title: msg.title, body: msg.body, clocked_score: popScore, rounds: totalRounds },
      });
    } catch (e) {
      // silent fail
    }

    try {
      if (delaySeconds > 0) {
        await Notifications.scheduleNotificationAsync({
          content: { title: msg.title, body: msg.body, sound: true, data: { type: 'milestone' } },
          trigger: { seconds: delaySeconds, repeats: false },
        });
      } else {
        await sendPushToUser(userId, msg.title, msg.body, 'milestone');
      }
    } catch (e) {
      // silent fail
    }
  }

  return msg;
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
// Send a push notification + persist it to the recipient's in-app inbox.
// type is optional (defaults to 'push') — use semantic values like 'friend_round',
// 'course_update', 'comment', 'like', 'referral', 'rank_move', 'milestone'.
//
// Everything happens inside the send-push Edge Function: it verifies the
// caller's session, writes the `notifications` row with the service role
// (RLS only lets a user insert rows for themselves, so the old client-side
// insert for another user never landed), looks up the recipient's token and
// rate-limits per sender.
export async function sendPushToUser(recipientUserId, title, body, type = 'push', meta = {}) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { userId: recipientUserId, title, body, type, meta },
    });
  } catch (e) {
    // silent fail
  }
}
