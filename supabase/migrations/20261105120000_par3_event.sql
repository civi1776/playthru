-- The first Clocked event: Palm Beach Par 3, 19 Nov 2026, 6:00 PM.
-- Two-player teams, $100 per player (Zelle/Venmo), 12–13 teams, field hand-picked
-- from applications with a waitlist. Applications come from the app
-- (tournament-apply, source 'app') and clocked.golf (website-forms, source 'website').

insert into public.tournaments (slug, name, city, state, venue, event_date, application_deadline, field_limit, status, series_order, description)
values (
  'par3-2026-11-19',
  'Clocked at the Par 3',
  'Palm Beach',
  'FL',
  'Palm Beach Par 3',
  '2026-11-19',
  '2026-11-16',
  13,
  'applications_open',
  1,
  'A test run of the Clocked format on a par 3 before the first full 18-hole event. Two-player teams, a time par on every hole, $100 per player, cash prize set by the size of the field. The field is hand-picked from applications; everyone else is waitlisted.'
)
on conflict (slug) do update set
  name = excluded.name, city = excluded.city, state = excluded.state, venue = excluded.venue,
  event_date = excluded.event_date, application_deadline = excluded.application_deadline,
  field_limit = excluded.field_limit, status = excluded.status, series_order = excluded.series_order,
  description = excluded.description, updated_at = now();

-- The website form asks for a phone number (the app has the account instead).
alter table public.tournament_applications add column if not exists contact_phone text;
