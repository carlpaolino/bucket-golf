-- Idempotent baseline: works on empty DB or existing rounds-only DB.

create table if not exists public.profiles (
  id            text        primary key,
  display_name  text        not null check (char_length(trim(display_name)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Fresh install: full rounds table with profile_id.
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'rounds'
  ) then
    create table public.rounds (
      id          text        primary key,
      profile_id  text        not null references public.profiles (id) on delete cascade,
      course_id   text        not null,
      scores      integer[]   not null check (array_length(scores, 1) = 9),
      total       integer     not null check (total > 0),
      played_at   timestamptz not null default now()
    );
  end if;
end $$;

-- Existing install: add profile_id to older rounds table.
alter table public.rounds
  add column if not exists profile_id text references public.profiles (id) on delete cascade;

create index if not exists rounds_profile_played_idx
  on public.rounds (profile_id, played_at desc);

alter table public.profiles enable row level security;
alter table public.rounds enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to anon using (true);
create policy "profiles_insert" on public.profiles
  for insert to anon with check (true);
create policy "profiles_update" on public.profiles
  for update to anon using (true);

drop policy if exists "rounds_read" on public.rounds;
drop policy if exists "rounds_select" on public.rounds;
drop policy if exists "rounds_insert" on public.rounds;
drop policy if exists "rounds_delete" on public.rounds;
create policy "rounds_select" on public.rounds
  for select to anon using (true);
create policy "rounds_insert" on public.rounds
  for insert to anon with check (true);
create policy "rounds_delete" on public.rounds
  for delete to anon using (true);
