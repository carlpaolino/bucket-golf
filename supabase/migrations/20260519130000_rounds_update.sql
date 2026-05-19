-- Allow editing saved rounds from the app
create policy "rounds_update" on public.rounds
  for update to anon, authenticated
  using (true)
  with check (true);
