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
      .select('id, full_name, referral_count')
      .eq('referral_code', code.toUpperCase())
      .maybeSingle();

    if (!referrer) return { error: 'Invalid referral code' };
    if (referrer.id === newUserId) return { error: 'You cannot use your own referral code' };

    // Save referred_by on the new user's profile
    await supabase
      .from('profiles')
      .update({ referred_by: referrer.id })
      .eq('id', newUserId);

    // Increment referral count on the referrer
    await supabase
      .from('profiles')
      .update({ referral_count: (referrer.referral_count ?? 0) + 1 })
      .eq('id', referrer.id);

    // Notify referrer
    const firstName = referrer.full_name?.split(' ')[0] || 'Someone';
    await sendPushToUser(
      referrer.id,
      'Someone joined with your code! 🎉',
      `${firstName} joined PlayThru using your referral link. Keep sharing!`,
    );

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
};

// Called when a referred user joins — grants a reward to the referrer (one-time, guarded by referral_reward_granted flag)
export const grantReferralReward = async (newSubscriberId) => {
  try {
    const { data: newUser } = await supabase
      .from('profiles')
      .select('referred_by, referral_reward_granted')
      .eq('id', newSubscriberId)
      .maybeSingle();

    if (!newUser?.referred_by || newUser?.referral_reward_granted) return;

    // Reserve reward slot for the referrer
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    await supabase
      .from('profiles')
      .update({ pro_expires_at: expiry.toISOString() })
      .eq('id', newUser.referred_by);

    // Mark reward as granted on the new user so it can't fire again
    await supabase
      .from('profiles')
      .update({ referral_reward_granted: true })
      .eq('id', newSubscriberId);

    await sendPushToUser(
      newUser.referred_by,
      'Referral reward unlocked! 🏆',
      'Someone you referred just joined PlayThru. Thanks for spreading the word!',
    );
  } catch (e) {
    // silent fail
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
