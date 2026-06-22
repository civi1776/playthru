/*
 * Caddy notification utilities.
 *
 * SMS:   Replace sendSMS with a call to a Twilio Supabase Edge Function once
 *        Twilio credentials are set up.
 *
 * Email: Replace the console.log in sendCaddyNotifications with:
 *          await supabase.functions.invoke('caddy-notifications', {
 *            body: { to, subject, body }
 *          });
 *        after deploying the "caddy-notifications" Supabase Edge Function.
 *
 * Push to other users: sendLocalNotification only fires on the CURRENT device.
 * To notify PlayThru users who were in a caddy group, use the Expo Push API
 * via a Supabase Edge Function, sending to their stored push_token.
 */

// SMS placeholder — wire to Twilio when ready.
export async function sendSMS(phone, message) {
  // TODO: await supabase.functions.invoke('send-sms', { body: { to: phone, message } });
}

// Sends email + SMS to non-app players after a caddy logs their round.
export async function sendCaddyNotifications(players, courseName, popScore) {
  for (const player of players) {
    if (player.email) {
      // TODO:
      // await supabase.functions.invoke('caddy-notifications', {
      //   body: {
      //     to:      player.email,
      //     subject: `Your round at ${courseName} has been logged on PlayThru`,
      //     body: [
      //       `Your caddy logged your group's round today at ${courseName}.`,
      //       `Your pace of play earned a POPScore of ${popScore.toFixed(1)}.`,
      //       `Download PlayThru to track your pace, see your full history, and rank against golfers nationwide.`,
      //       `playthrugolf.app`,
      //     ].join(' '),
      //   },
      // });
    }
    if (player.phone) {
      await sendSMS(
        player.phone,
        `Your caddy logged your round at ${courseName} on Clocked. Your Clocked Score: ${popScore.toFixed(1)}. Download the app: clocked.golf`,
      );
    }
  }
}
