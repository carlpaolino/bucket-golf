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
- **Player picker** — choose your name from a roster (`players.js`, ~100 names);
  the golf app appears after you pick who’s playing.
- Rounds persist to **Supabase** when configured, with a `localStorage`
  fallback so the app still works offline.
- **Simple handicap** on the leaderboard: each course has **difficulty 1–3**; handicap uses the **best round from each group of 3** (difficulty-adjusted), averaged.
- Red & white theme.

### Course difficulty (for handicap)

In `script.js`, each course has a `difficulty` field (`1` = easy, `2` = normal, `3` = hard). Edit these when you know the layouts:

```javascript
{
  id: "mountain-9",
  name: "Mountain Nine",
  difficulty: 3,  // ← change per course
  ...
}
```

Handicap formula (simplified):

1. Per round: `(your score − par) + (difficulty − 2)` — harder courses count a bit worse.
2. Sort your rounds oldest → newest; in each **block of 3**, keep the **best** (lowest) value.
3. Your handicap is the **average** of those bests (need at least **3 rounds** for one number; 6 rounds = 2 bests averaged, etc.).

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
- `players.js` — list of player names (edit `window.BUCKET_GOLF_PLAYERS`)
- `config.example.js` — Supabase config template (copy to `config.js`)
- `supabase/schema.sql` — full database schema (profiles + rounds)
- `supabase/migrate-profiles.sql` — upgrade script if you already have `rounds`

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

### 2. Create the database tables

1. In the left sidebar, open **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.

That creates `profiles` and `rounds` (with `profile_id` foreign key), indexes,
and demo Row Level Security policies.

**Already have an older `rounds` table?** Run
[`supabase/migrate-profiles.sql`](supabase/migrate-profiles.sql) instead. Existing
rows without a `profile_id` will not show until you delete them or backfill a
profile id.

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

### 5. Add your player names

Edit [`players.js`](players.js) and replace the placeholder list with your real
names (one string per player, ~100 entries). Example:

```javascript
window.BUCKET_GOLF_PLAYERS = [
  "Alex Johnson",
  "Sam Rivera",
  // …
];
```

Run migrations if you use the CLI:

```bash
supabase db push
```

### 6. Reload the app

1. Open the app — you should see **Who's playing?** with a searchable list.
2. Pick your name and click **Continue**.
3. The course picker and scorecard appear; the header shows **Playing as …** with
   **Switch player**.
4. **Saved rounds** should show a green **Synced to Supabase** badge when
   `config.js` is set up.

Your last chosen name is remembered on this device. Anyone can pick any name on
the list (honor system).

If you see errors saving rounds, run `supabase db push` so the latest RLS
migration is applied.
