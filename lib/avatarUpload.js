// ─── lib/avatarUpload.js — pick a photo and make it the profile picture ─────
// Shared by onboarding (StepPhoto) and EditProfileScreen so both paths behave
// identically: library permission → square crop → upload to the `avatars`
// bucket under the caller's own uid (storage RLS enforces the folder) →
// cache-busted public URL written to profiles.avatar_url.
//
// Resolves { url } on success, { cancelled: true } if the user backed out,
// or throws an Error with a user-readable message.

import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

const MAX_BYTES = 5 * 1024 * 1024;

function extFor(asset) {
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime.includes('png')) return { ext: 'png', contentType: 'image/png' };
  if (mime.includes('webp')) return { ext: 'webp', contentType: 'image/webp' };
  if (mime.includes('heic') || mime.includes('heif')) return { ext: 'heic', contentType: 'image/heic' };
  const fromUri = asset.uri?.split('?')[0].split('.').pop()?.toLowerCase();
  if (fromUri === 'png') return { ext: 'png', contentType: 'image/png' };
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

export async function pickAndUploadAvatar() {
  // Authoritative uid, fresh from the session (context may be stale).
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error('Please sign in again to upload a photo.');

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('Allow photo library access to set your profile picture.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return { cancelled: true };

  const asset = result.assets[0];
  if (!asset.base64) throw new Error('No image data returned from the picker.');
  const binary = atob(asset.base64);
  if (binary.length > MAX_BYTES) throw new Error('That photo is too large. Please choose one under 5 MB.');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // A fresh object name every time. Re-uploading over the old `avatar.jpg`
  // with upsert needs INSERT + UPDATE + SELECT policies on storage.objects;
  // the bucket only grants INSERT/UPDATE on your own folder, so the second
  // upload ever made by a user failed with "new row violates row-level
  // security policy". A unique name is a plain INSERT, always allowed, and
  // doubles as the cache-buster for RN's image cache.
  const { ext, contentType } = extFor(asset);
  const filePath = `${user.id}/avatar-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(filePath, bytes, { contentType, upsert: false });
  if (upErr) throw new Error(upErr.message || 'Upload failed.');

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  if (!urlData?.publicUrl) throw new Error('Could not get the image URL.');
  const url = urlData.publicUrl;

  const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
  if (dbErr) throw new Error('Photo uploaded but the profile could not be updated.');
  return { url };
}

export default { pickAndUploadAvatar };
