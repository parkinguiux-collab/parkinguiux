-- Run in the intended Supabase project before setting AUTH_READY=true.
create table if not exists public.parking_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  contact_email text not null check (char_length(contact_email) <= 254),
  birth_year integer not null check (birth_year between 1900 and 2100),
  plate text not null check (char_length(plate) between 7 and 12),
  vehicle_id text not null,
  vehicle_brand text not null,
  vehicle_model text not null,
  created_at timestamptz not null default now()
);
alter table public.parking_profiles enable row level security;
revoke all on public.parking_profiles from anon;
grant select, insert, update on public.parking_profiles to authenticated;
create policy "Read own verified profile" on public.parking_profiles for select to authenticated
  using ((select auth.uid()) = id and (select auth.jwt()->>'phone') <> '');
create policy "Create own verified profile" on public.parking_profiles for insert to authenticated
  with check ((select auth.uid()) = id and (select auth.jwt()->>'phone') <> '');
create policy "Update own verified profile" on public.parking_profiles for update to authenticated
  using ((select auth.uid()) = id and (select auth.jwt()->>'phone') <> '')
  with check ((select auth.uid()) = id and (select auth.jwt()->>'phone') <> '');
-- Phone lives in auth.users, never trust a phone sent with profile fields.
-- contact_email is a contact field, not an email-verified login identity.
