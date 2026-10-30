-- ─── Website inquiries — 2026-10-30 ─────────────────────────────────────────
-- Backs the redesigned clocked.golf forms (edge function: website-forms).
--
--   tournaments.html  "Request an invitation"  → public.website_inquiries (kind = tournament_interest)
--   contact.html      "Send message"           → public.website_inquiries (kind = contact)
--   courses.html      "Partner with us"        → public.course_certification_inquiries (existing table,
--                                                 already shown on the admin COURSES tab)
--
-- All rows are written by the service role from the edge function. Client
-- roles can only read/update as an admin (profiles.account_type = 'admin'),
-- mirroring sponsor_inquiries / course_certification_inquiries. The
-- unauthenticated role gets nothing.

create table if not exists public.website_inquiries (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  kind            text not null check (kind in ('tournament_interest', 'contact')),
  status          text not null default 'pending'
                  check (status in ('pending', 'contacted', 'invited', 'waitlisted', 'closed')),
  first_name      text,
  last_name       text,
  email           text not null,
  phone           text,
  location        text,
  handicap        text,
  home_course     text,
  inquiry_type    text,
  message         text,
  consent         boolean not null default false,
  source_page     text,
  user_agent      text,
  ip_hash         text,
  reviewed_at     timestamptz,
  reviewer_note   text
);

create index if not exists website_inquiries_kind_created_idx on public.website_inquiries (kind, created_at desc);
create index if not exists website_inquiries_ip_created_idx   on public.website_inquiries (ip_hash, created_at desc);
create index if not exists website_inquiries_email_created_idx on public.website_inquiries (lower(email), created_at desc);

alter table public.website_inquiries enable row level security;

drop policy if exists "admins can view website inquiries" on public.website_inquiries;
create policy "admins can view website inquiries" on public.website_inquiries
  for select using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'admin')
  );

drop policy if exists "admins can update website inquiries" on public.website_inquiries;
create policy "admins can update website inquiries" on public.website_inquiries
  for update using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'admin')
  );

-- Least privilege (Supabase's default privileges would hand anon/authenticated
-- full DML on a new table).
revoke all on table public.website_inquiries from anon, authenticated;
grant select, update on table public.website_inquiries to authenticated;

-- Per-IP rate limiting for the partnership form, which writes to the
-- existing course table. Nullable; never shown to clients.
alter table public.course_certification_inquiries add column if not exists ip_hash text;
create index if not exists course_cert_inquiries_ip_created_idx on public.course_certification_inquiries (ip_hash, created_at desc);
-- Tighten the existing table while we are here: anon could SELECT (RLS blocked
-- rows, but the grant was unnecessary) and authenticated could INSERT/DELETE.
revoke all on table public.course_certification_inquiries from anon;
revoke insert, delete on table public.course_certification_inquiries from authenticated;
