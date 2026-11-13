-- Event applications now collect contact details for both players:
-- player 1 keeps contact_email / contact_phone, player 2 gets its own pair.
-- Additive and nullable, so the app's existing applications keep working.
alter table public.tournament_applications add column if not exists player2_email text;
alter table public.tournament_applications add column if not exists player2_phone text;
