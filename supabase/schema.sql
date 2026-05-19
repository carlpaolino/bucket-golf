-- Bucket Golf — full schema (fresh install)
-- Run in Supabase SQL Editor if starting from scratch.

create table public.profiles (
  id            text        primary key,
  display_name  text        not null check (char_length(trim(display_name)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.rounds (
  id          text        primary key,
  profile_id  text        not null references public.profiles (id) on delete cascade,
  course_id   text        not null,
  scores      integer[]   not null check (array_length(scores, 1) = 9),
  total       integer     not null check (total > 0),
  played_at   timestamptz not null default now()
);

create index rounds_profile_played_idx
  on public.rounds (profile_id, played_at desc);

alter table public.profiles enable row level security;
alter table public.rounds enable row level security;

-- Demo policies: anon key can manage rows (client sends profile_id).
-- Before a public launch, switch to auth.uid() and signed-in users.
create policy "profiles_select" on public.profiles
  for select to anon using (true);
create policy "profiles_insert" on public.profiles
  for insert to anon with check (true);
create policy "profiles_update" on public.profiles
  for update to anon using (true);

create policy "rounds_select" on public.rounds
  for select to anon using (true);
create policy "rounds_insert" on public.rounds
  for insert to anon with check (true);
create policy "rounds_delete" on public.rounds
  for delete to anon using (true);
