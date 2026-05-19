# Bucket Golf

A simple, single-page web app for tracking your **9-hole** rounds. Pick from a
handful of bundled courses, upload or type in your scores, and save the round
locally in your browser.

Built with vanilla HTML / CSS / JavaScript — no build step required.

## Features

- Choose from 4 pre-built 9-hole courses, each with its own par and map.
- Visual SVG map of the selected course.
- Manual score entry per hole with live total + par comparison.
- Upload a CSV / TXT scorecard (any whitespace- or comma-separated list of 9
  numbers) to auto-fill scores.
- Rounds persist to **Supabase** when configured, with a `localStorage`
  fallback so the app still works offline.
- Red & white theme.

## Run it

Just open `index.html` in your browser. Or serve the folder with any static
server, e.g.:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Without a `config.js`, the app saves rounds to your browser's `localStorage`.
To sync rounds to a real database, follow the Supabase setup below.

## Files

- `index.html` — markup
- `styles.css` — red & white theme
- `script.js` — courses, score logic, persistence
- `config.example.js` — Supabase config template (copy to `config.js`)

## CSV format

Any text file with at least 9 numeric values separated by commas, spaces, tabs,
or newlines. For example:

```
4,3,5,4,3,4,5,3,4
```

## Supabase setup (for cloud-synced rounds)

These steps create a free Supabase project that hosts the `rounds` table the
app reads and writes.

### 1. Create a Supabase project

1. Go to <https://supabase.com> and sign in (GitHub login is easiest).
2. Click **New project**.
3. Pick an org, name the project (e.g. `bucket-golf`), choose a strong DB
   password (you won't need it for the app, but save it anyway), and pick the
   region closest to you.
4. Click **Create new project** and wait ~1 minute for it to provision.

### 2. Create the `rounds` table

1. In the left sidebar, open **SQL Editor** → **New query**.
2. Paste the SQL below and click **Run**.

```sql
create table public.rounds (
  id          text        primary key,
  course_id   text        not null,
  scores      integer[]   not null,
  total       integer     not null,
  played_at   timestamptz not null default now()
);

alter table public.rounds enable row level security;

-- Demo policies: anyone with the anon key can read / write / delete rounds.
-- Tighten these (e.g. require auth.uid()) before going public.
create policy "rounds_read"   on public.rounds for select to anon using (true);
create policy "rounds_insert" on public.rounds for insert to anon with check (true);
create policy "rounds_delete" on public.rounds for delete to anon using (true);
```

### 3. Grab your project URL + anon key

1. In the sidebar, click **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
3. Copy the **anon / public** API key (the long `eyJ...` JWT).

> The anon key is safe to ship in client-side code; Row Level Security
> (configured above) is what actually controls access.

### 4. Wire it up locally

```bash
cp config.example.js config.js
# then edit config.js and paste in the URL + anon key
```

`config.js` is gitignored, so your keys won't be committed.

### 5. Reload the app

Refresh the page. The **Saved rounds** card should now show a green
**"Synced to Supabase"** badge instead of **"Local only"**. Saving a round
will insert a row into `public.rounds`; deleting removes it. You can verify
this in the Supabase dashboard under **Table Editor → rounds**.

If you ever see "Local only" after configuring `config.js`, open the browser
devtools console — the app logs why it fell back (bad URL, network blocked,
SDK failed to load, etc.).
