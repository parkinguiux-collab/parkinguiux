begin;
alter table public.parking_profiles add column if not exists phone text;
drop policy if exists "Read own verified profile" on public.parking_profiles;
drop policy if exists "Create own verified profile" on public.parking_profiles;
drop policy if exists "Update own verified profile" on public.parking_profiles;
create policy "Read own verified profile" on public.parking_profiles for select to authenticated
  using ((select auth.uid()) = id and (select auth.jwt()->>'email') = contact_email);
create policy "Create own verified profile" on public.parking_profiles for insert to authenticated
  with check ((select auth.uid()) = id and (select auth.jwt()->>'email') = contact_email);
create policy "Update own verified profile" on public.parking_profiles for update to authenticated
  using ((select auth.uid()) = id and (select auth.jwt()->>'email') = contact_email)
  with check ((select auth.uid()) = id and (select auth.jwt()->>'email') = contact_email);
commit;
-- phone is user-provided contact information, not an SMS-verified identity.
