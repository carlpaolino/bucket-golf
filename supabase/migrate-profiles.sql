-- Bucket Golf — upgrade an existing `rounds`-only database
-- Run this if you already created `rounds` from an older README.

create table if not exists public.profiles (
  id            text        primary key,
  display_name  text        not null check (char_length(trim(display_name)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.rounds
  add column if not exists profile_id text references public.profiles (id) on delete cascade;

-- Optional: delete orphan rounds from before profiles existed
-- delete from public.rounds where profile_id is null;

create index if not exists rounds_profile_played_idx
  on public.rounds (profile_id, played_at desc);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;

create policy "profiles_select" on public.profiles
  for select to anon using (true);
create policy "profiles_insert" on public.profiles
  for insert to anon with check (true);
create policy "profiles_update" on public.profiles
  for update to anon using (true);

-- Re-assert rounds policies (names may differ on older projects)
drop policy if exists "rounds_read" on public.rounds;
drop policy if exists "rounds_insert" on public.rounds;
drop policy if exists "rounds_delete" on public.rounds;
drop policy if exists "rounds_select" on public.rounds;

create policy "rounds_select" on public.rounds
  for select to anon using (true);
create policy "rounds_insert" on public.rounds
  for insert to anon with check (true);
create policy "rounds_delete" on public.rounds
  for delete to anon using (true);
