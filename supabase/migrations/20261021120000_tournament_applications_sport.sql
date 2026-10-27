-- Tournament Series: "the tournament for athletes."
-- Each player must have played another organized sport. Store what they played.
-- Nullable so historical rows stay valid; the tournament-apply edge function
-- enforces non-empty values for new applications.
alter table public.tournament_applications
  add column if not exists player1_sport text,
  add column if not exists player2_sport text;
