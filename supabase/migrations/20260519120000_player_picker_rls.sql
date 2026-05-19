-- Player picker mode: no Supabase Auth — anon key + profile slug per name

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "rounds_select" on public.rounds;
drop policy if exists "rounds_insert" on public.rounds;
drop policy if exists "rounds_delete" on public.rounds;

create policy "profiles_select" on public.profiles
  for select to anon, authenticated using (true);
create policy "profiles_insert" on public.profiles
  for insert to anon, authenticated with check (true);
create policy "profiles_update" on public.profiles
  for update to anon, authenticated using (true);

create policy "rounds_select" on public.rounds
  for select to anon, authenticated using (true);
create policy "rounds_insert" on public.rounds
  for insert to anon, authenticated with check (true);
create policy "rounds_delete" on public.rounds
  for delete to anon, authenticated using (true);
