-- ─── Avatar storage policies — 2026-10-30 ───────────────────────────────────
-- storage.objects had INSERT and UPDATE policies for a user's own folder in
-- the `avatars` bucket but no SELECT policy, so an upsert over an existing
-- avatar (INSERT … ON CONFLICT DO UPDATE) failed RLS. The app now uploads a
-- new object name each time, so this is hygiene rather than a hard fix:
--   - everyone may list/read avatar objects through the API (the bucket is
--     already public via the CDN URL, so this grants nothing new);
--   - users may delete objects in their own folder (lets the app clean up
--     superseded photos later).
drop policy if exists "Avatars are readable" on storage.objects;
create policy "Avatars are readable" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
