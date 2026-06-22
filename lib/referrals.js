import { supabase } from './supabase';
import { sendPushToUser } from './notifications';

// Generate a random 6-character uppercase referral code
export const generateReferralCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// Called at signup when the new user enters a referral code
export const applyReferralCode = async (code, newUserId) => {
  if (!code || !newUserId) return { error: 'Missing code or user' };
  try {
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('referral_code', code.toUpperCase())
      .maybeSingle();

    if (!referrer) return { error: 'Invalid referral code' };
    if (referrer.id === newUserId) return { error: 'You cannot use your own referral code' };

    // Save referred_by on the new user's profile
    await supabase
      .from('profiles')
      .update({ referred_by: referrer.id })
      .eq('id', newUserId);

    // Increment referral count atomically server-side (avoids cross-user client write + race condition)
    await supabase.rpc('increment_referral_count', { referrer_uuid: referrer.id });

    // Notify referrer
    const firstName = referrer.full_name?.split(' ')[0] || 'Someone';
    await sendPushToUser(
      referrer.id,
      'Someone joined with your code! 🎉',
      `${firstName} joined Clocked using your referral link. Keep sharing!`,
    );

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
};


// Fetch referral code and count for display on the profile screen
export const getReferralStats = async (userId) => {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('referral_code, referral_count')
      .eq('id', userId)
      .maybeSingle();
    return {
      code:  data?.referral_code  ?? null,
      count: data?.referral_count ?? 0,
    };
  } catch (e) {
    return { code: null, count: 0 };
  }
};
