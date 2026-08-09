-- ═════════════════════════════════════════════════════════════════════════════
-- Roaster login + gated pricing — database setup
--
-- Run this ONCE in the Supabase project (SQL Editor → paste → Run) for the
-- SAME project the AIS software uses: lwsxxobinajquhvdryci.
--
-- What it creates:
--   • roaster_profiles  — one row per roaster account, with an `approved` gate
--   • a trigger that auto-creates that row when someone signs up on the website
--   • roaster_prices    — the wholesale prices the website reveals to approved
--                         roasters, keyed by the catalog's own lot slugs
--   • Row Level Security so ONLY signed-in, approved roasters can read prices
--
-- Safe to re-run: everything uses IF NOT EXISTS / CREATE OR REPLACE / DROP..CREATE.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Roaster profiles ──────────────────────────────────────────────────────
create table if not exists public.roaster_profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  company      text,
  contact_name text,
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.roaster_profiles is
  'Website roaster accounts. approved=false until an AIS admin unlocks pricing.';

-- Auto-create a profile row whenever a new auth user signs up, copying the
-- company / contact_name captured on the signup form (raw_user_meta_data).
create or replace function public.handle_new_roaster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roaster_profiles (id, company, contact_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'company',
    new.raw_user_meta_data ->> 'contact_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_roaster();

-- ── 2. Wholesale prices (keyed by the website's lot slugs) ────────────────────
-- lot_slug matches the `data-lot="…"` attribute on each catalog card
-- (e.g. 'frinsa-collective-natural', 'pkni-washed').
create table if not exists public.roaster_prices (
  lot_slug      text primary key,
  price_display text,           -- optional pre-formatted string, e.g. 'USD $7.20 / lb'
  price_amount  numeric(12,2),  -- used if price_display is null
  currency      text default 'USD',
  price_unit    text default 'lb',
  updated_at    timestamptz not null default now()
);

comment on table public.roaster_prices is
  'Wholesale prices shown to APPROVED roasters only (enforced by RLS). Keyed by website lot slug.';

-- ── 3. Row Level Security ─────────────────────────────────────────────────────
alter table public.roaster_profiles enable row level security;
alter table public.roaster_prices   enable row level security;

-- Roasters can read (only) their own profile row.
drop policy if exists "read own profile" on public.roaster_profiles;
create policy "read own profile"
  on public.roaster_profiles for select
  using (auth.uid() = id);

-- NOTE: no INSERT/UPDATE/DELETE policies for roasters. Profiles are created by
-- the signup trigger (security definer), and only an admin using the service
-- role (or the Supabase dashboard) can flip `approved`. RLS denies everything
-- not explicitly allowed, so roasters cannot approve themselves.

-- Prices are readable ONLY by a signed-in roaster whose profile is approved.
drop policy if exists "approved roasters read prices" on public.roaster_prices;
create policy "approved roasters read prices"
  on public.roaster_prices for select
  using (
    exists (
      select 1 from public.roaster_profiles p
      where p.id = auth.uid() and p.approved = true
    )
  );

-- ── 4. Sample prices (optional — edit or delete) ──────────────────────────────
-- Seed a couple so you can verify the reveal end-to-end. Remove or replace with
-- real numbers. lot_slug values must match the catalog cards.
insert into public.roaster_prices (lot_slug, price_display) values
  ('frinsa-collective-natural', 'USD $7.20 / lb'),
  ('pkni-washed',               'USD $6.85 / lb')
on conflict (lot_slug) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- APPROVING A ROASTER (run when you want to unlock pricing for an account):
--
--   update public.roaster_profiles
--   set approved = true
--   where id = (select id from auth.users where email = 'them@roastery.com');
--
-- Or just flip the `approved` checkbox on their row in the Table Editor.
-- ═════════════════════════════════════════════════════════════════════════════
