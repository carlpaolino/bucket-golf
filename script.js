/* Bucket Golf — simple 9-hole score tracker */

const COURSES = [
  {
    id: "backyard-classic",
    name: "Backyard Classic",
    description: "Wide open lawn — beginner friendly.",
    pars: [3, 3, 4, 3, 4, 3, 3, 4, 3],
    holes: [
      { x: 60, y: 220 }, { x: 130, y: 160 }, { x: 200, y: 220 },
      { x: 270, y: 140 }, { x: 340, y: 220 }, { x: 410, y: 150 },
      { x: 480, y: 230 }, { x: 540, y: 160 }, { x: 600, y: 220 },
    ],
  },
  {
    id: "park-loop",
    name: "Park Loop",
    description: "A balanced loop through the trees.",
    pars: [4, 3, 4, 4, 3, 5, 3, 4, 4],
    holes: [
      { x: 80, y: 200 }, { x: 160, y: 110 }, { x: 240, y: 200 },
      { x: 320, y: 90 },  { x: 400, y: 200 }, { x: 480, y: 110 },
      { x: 560, y: 200 }, { x: 480, y: 260 }, { x: 320, y: 260 },
    ],
  },
  {
    id: "beach-bash",
    name: "Beach Bash",
    description: "Sandy lies and ocean breeze.",
    pars: [3, 4, 3, 4, 5, 3, 4, 3, 4],
    holes: [
      { x: 60, y: 240 }, { x: 140, y: 180 }, { x: 220, y: 240 },
      { x: 300, y: 160 }, { x: 380, y: 240 }, { x: 460, y: 160 },
      { x: 540, y: 240 }, { x: 600, y: 170 }, { x: 640, y: 240 },
    ],
  },
  {
    id: "mountain-9",
    name: "Mountain Nine",
    description: "Steep elevation, tricky greens.",
    pars: [4, 4, 5, 3, 4, 5, 3, 4, 5],
    holes: [
      { x: 80, y: 250 }, { x: 160, y: 200 }, { x: 240, y: 150 },
      { x: 320, y: 110 }, { x: 400, y: 150 }, { x: 480, y: 110 },
      { x: 560, y: 150 }, { x: 600, y: 210 }, { x: 640, y: 260 },
    ],
  },
];

const STATE = {
  selectedCourseId: null,
  scores: [],
  profile: null, // { id, displayName }
};

const STORAGE_KEY = "bucket-golf-rounds-v1";
const PLAYER_STORAGE_KEY = "bucket-golf-player-v1";

/* -------- Supabase client (optional) --------
 *
 * If `config.js` defines a real Supabase URL + anon key, every save / delete /
 * load goes through the `rounds` table on that project. Otherwise we fall back
 * to localStorage so the app still works with no network.
 */
const ROUNDS_TABLE = "rounds";
const PROFILES_TABLE = "profiles";

function makeSupabaseClient() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey) return null;
  if (cfg.url.includes("YOUR-PROJECT-REF") || cfg.anonKey.includes("YOUR-PUBLIC")) {
    return null;
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.warn("Supabase JS SDK failed to load; falling back to localStorage.");
    return null;
  }
  try {
    return window.supabase.createClient(cfg.url, cfg.anonKey);
  } catch (err) {
    console.warn("Could not init Supabase client:", err);
    return null;
  }
}

const SB = makeSupabaseClient();
const USING_SUPABASE = SB !== null;

function updateStorageBadge() {
  const badge = document.getElementById("storage-badge");
  if (!badge) return;
  if (USING_SUPABASE && getActiveProfile()) {
    badge.textContent = "Synced to Supabase";
    badge.classList.add("synced");
  } else if (USING_SUPABASE) {
    badge.textContent = "Pick a player to sync";
    badge.classList.remove("synced");
  } else {
    badge.textContent = "Local only";
    badge.classList.remove("synced");
  }
}

/* -------- Player picker -------- */

function getPlayerRoster() {
  const list = window.BUCKET_GOLF_PLAYERS;
  if (!Array.isArray(list) || list.length === 0) return [];
  const seen = new Set();
  const names = [];
  for (const raw of list) {
    const name = String(raw).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function playerIdFromName(name) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "player";
}

function getActiveProfile() {
  const p = STATE.profile;
  if (!p?.id) return null;
  const name = (p.displayName || "").trim();
  if (!name) return null;
  return { id: p.id, displayName: name };
}

function readStoredPlayerName() {
  try {
    return localStorage.getItem(PLAYER_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredPlayerName(name) {
  localStorage.setItem(PLAYER_STORAGE_KEY, name);
}

function setPlayerStatus(msg, isError = false) {
  const el = document.getElementById("player-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "var(--red-dark)" : "var(--muted)";
}

function showPlayerGate() {
  document.getElementById("player-gate")?.removeAttribute("hidden");
  document.getElementById("app-content")?.setAttribute("hidden", "");
  document.getElementById("player-bar")?.setAttribute("hidden", "");
  STATE.profile = null;
}

function showAppForPlayer() {
  document.getElementById("player-gate")?.setAttribute("hidden", "");
  document.getElementById("app-content")?.removeAttribute("hidden");
  document.getElementById("player-bar")?.removeAttribute("hidden");
  const nameEl = document.getElementById("active-player-name");
  const profile = getActiveProfile();
  if (nameEl && profile) nameEl.textContent = profile.displayName;
}

async function ensureProfileRow(playerId, displayName) {
  if (!USING_SUPABASE) return;
  const username = playerIdFromName(displayName);
  const { error } = await SB.from(PROFILES_TABLE).upsert({
    id: playerId,
    username,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

function renderPlayerOptions(filterText = "") {
  const select = document.getElementById("player-select");
  if (!select) return;

  const q = filterText.trim().toLowerCase();
  const roster = getPlayerRoster();
  const filtered = q
    ? roster.filter((name) => name.toLowerCase().includes(q))
    : roster;

  select.innerHTML = "";
  if (filtered.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = roster.length === 0 ? "No players in players.js" : "No matches";
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }

  filtered.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  select.selectedIndex = 0;
}

async function selectPlayer(displayName) {
  const name = displayName.trim();
  const roster = getPlayerRoster();
  if (!name) {
    setPlayerStatus("Pick a name from the list.", true);
    return;
  }
  if (!roster.some((n) => n.toLowerCase() === name.toLowerCase())) {
    setPlayerStatus("That name is not on the player list.", true);
    return;
  }

  const canonical = roster.find((n) => n.toLowerCase() === name.toLowerCase());
  const playerId = playerIdFromName(canonical);

  setPlayerStatus("Loading…");
  try {
    if (USING_SUPABASE) await ensureProfileRow(playerId, canonical);
  } catch (err) {
    setPlayerStatus("Could not save profile: " + err.message, true);
    return;
  }

  STATE.profile = { id: playerId, displayName: canonical };
  writeStoredPlayerName(canonical);
  setPlayerStatus("");
  showAppForPlayer();
  updateStorageBadge();
  await renderRounds();
  updateHandicap();
}

function switchPlayer() {
  showPlayerGate();
  updateStorageBadge();
  const list = document.getElementById("rounds-list");
  if (list) list.innerHTML = `<li class="muted">Pick a player to see rounds.</li>`;
  renderPlayerOptions(document.getElementById("player-search")?.value || "");
  document.getElementById("player-search")?.focus();
}

async function initPlayerPicker() {
  const roster = getPlayerRoster();
  if (roster.length === 0) {
    setPlayerStatus("Add names to players.js (window.BUCKET_GOLF_PLAYERS).", true);
    showPlayerGate();
    return;
  }

  renderPlayerOptions();

  const saved = readStoredPlayerName();
  if (saved && roster.some((n) => n.toLowerCase() === saved.toLowerCase())) {
    const select = document.getElementById("player-select");
    if (select) {
      for (const opt of select.options) {
        if (opt.value.toLowerCase() === saved.toLowerCase()) {
          opt.selected = true;
          break;
        }
      }
    }
    await selectPlayer(saved);
    return;
  }

  showPlayerGate();
  document.getElementById("player-search")?.focus();
}

/* -------- Course list -------- */

function renderCourses() {
  const list = document.getElementById("course-list");
  list.innerHTML = "";
  COURSES.forEach((course) => {
    const par = course.pars.reduce((a, b) => a + b, 0);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "course-card";
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", "false");
    card.dataset.courseId = course.id;
    card.innerHTML = `
      <span class="name">${course.name}</span>
      <span class="meta">9 holes · Par ${par}</span>
      <span class="meta">${course.description}</span>
    `;
    card.addEventListener("click", () => selectCourse(course.id));
    list.appendChild(card);
  });
}

function selectCourse(courseId) {
  STATE.selectedCourseId = courseId;
  STATE.scores = Array(9).fill("");

  document.querySelectorAll(".course-card").forEach((el) => {
    const isSelected = el.dataset.courseId === courseId;
    el.classList.toggle("selected", isSelected);
    el.setAttribute("aria-checked", String(isSelected));
  });

  renderMap();
  renderScoreTable();
  setUploadStatus("");
}

/* -------- Map -------- */

function renderMap() {
  const mapEl = document.getElementById("course-map");
  const course = currentCourse();
  if (!course) {
    mapEl.innerHTML = `<p class="map-empty">Select a course above to see the map.</p>`;
    return;
  }

  const w = 700;
  const h = 320;
  const points = course.holes
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  const holesMarkup = course.holes
    .map((p, i) => {
      return `
        <g>
          <circle class="green" cx="${p.x}" cy="${p.y}" r="18" />
          <circle class="hole-marker" cx="${p.x}" cy="${p.y}" r="11" />
          <text class="hole-label" x="${p.x}" y="${p.y + 3}" text-anchor="middle">${i + 1}</text>
        </g>
      `;
    })
    .join("");

  mapEl.innerHTML = `
    <svg class="map-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${course.name} course map">
      <rect x="0" y="0" width="${w}" height="${h}" fill="#fff" />
      <polyline class="fairway" points="${points}" />
      ${holesMarkup}
    </svg>
    <p class="muted" style="text-align:center; margin-top: 10px;">
      <strong>${course.name}</strong> — ${course.description}
    </p>
  `;
}

/* -------- Score table -------- */

function renderScoreTable() {
  const body = document.getElementById("score-body");
  const parTotalEl = document.getElementById("par-total");
  const scoreTotalEl = document.getElementById("score-total");
  body.innerHTML = "";

  const course = currentCourse();
  if (!course) {
    parTotalEl.textContent = "—";
    scoreTotalEl.textContent = "—";
    updateHandicap();
    return;
  }

  course.pars.forEach((par, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${par}</td>
      <td>
        <input type="number" min="1" max="20" inputmode="numeric"
          data-hole="${i}" value="${STATE.scores[i] ?? ""}" />
      </td>
    `;
    body.appendChild(tr);
  });

  parTotalEl.textContent = course.pars.reduce((a, b) => a + b, 0);
  updateScoreTotal();

  body.querySelectorAll('input[type="number"]').forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.hole);
      const val = e.target.value;
      STATE.scores[idx] = val === "" ? "" : Number(val);
      updateScoreTotal();
    });
  });
}

function updateScoreTotal() {
  const total = STATE.scores.reduce((sum, n) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? sum + v : sum;
  }, 0);
  document.getElementById("score-total").textContent = total > 0 ? total : "—";
  updateHandicap();
}

/* -------- Handicap -------- */

// Live handicap = (sum of scores entered so far) - (sum of par for those same holes).
// We only count holes that have a valid score so the number stays meaningful
// while the card is being filled in.
function updateHandicap() {
  const el = document.getElementById("handicap-total");
  const note = document.getElementById("handicap-note");
  if (!el) return;

  const course = currentCourse();
  el.classList.remove("under", "over", "even");

  if (!course) {
    el.textContent = "—";
    if (note) note.textContent = "Pick a course to start tracking your handicap.";
    return;
  }

  let scoreSum = 0;
  let parSum = 0;
  let holesEntered = 0;
  STATE.scores.forEach((s, i) => {
    const v = Number(s);
    if (Number.isFinite(v) && v > 0) {
      scoreSum += v;
      parSum += course.pars[i];
      holesEntered += 1;
    }
  });

  if (holesEntered === 0) {
    el.textContent = "—";
    if (note) {
      note.textContent = "Enter scores above and your handicap updates automatically.";
    }
    return;
  }

  const diff = scoreSum - parSum;
  el.textContent = formatHandicap(diff);

  if (diff < 0) el.classList.add("under");
  else if (diff > 0) el.classList.add("over");
  else el.classList.add("even");

  if (note) {
    const holesLabel = holesEntered === 1 ? "1 hole" : `${holesEntered} holes`;
    const parLabel = diff === 0 ? "even with par" : diff > 0 ? "over par" : "under par";
    note.textContent = `Through ${holesLabel}: ${formatHandicap(diff)} (${parLabel}).`;
  }
}

function formatHandicap(diff) {
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

/* -------- File upload -------- */

function setUploadStatus(msg, isError = false) {
  const el = document.getElementById("upload-status");
  el.textContent = msg;
  el.style.color = isError ? "var(--red-dark)" : "var(--muted)";
}

async function handleFile(file) {
  if (!file) return;
  if (!currentCourse()) {
    setUploadStatus("Pick a course first, then upload your scores.", true);
    return;
  }

  const isText = /\.(csv|txt)$/i.test(file.name) || file.type.startsWith("text/");
  if (isText) {
    try {
      const text = await file.text();
      const numbers = text
        .split(/[\s,;\n\r\t]+/)
        .map((t) => Number(t.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);

      if (numbers.length < 9) {
        setUploadStatus(
          `Found only ${numbers.length} numeric values — need 9. Filling what we can.`,
          true
        );
      } else {
        setUploadStatus(`Loaded 9 hole scores from ${file.name}.`);
      }
      const nine = numbers.slice(0, 9);
      STATE.scores = Array(9)
        .fill("")
        .map((_, i) => (nine[i] != null ? nine[i] : ""));
      renderScoreTable();
    } catch (err) {
      setUploadStatus("Could not read file: " + err.message, true);
    }
  } else if (file.type.startsWith("image/")) {
    setUploadStatus(
      `Image "${file.name}" attached. Enter scores manually below — image parsing isn't supported yet.`
    );
  } else {
    setUploadStatus("Unsupported file type. Use CSV/TXT or an image.", true);
  }
}

/* -------- Saved rounds -------- */

function readLocalRounds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalRounds(rounds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
}

// Normalize a Supabase row to the shape the UI uses everywhere else.
function rowToRound(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    courseId: row.course_id,
    scores: row.scores,
    total: row.total,
    date: row.played_at,
  };
}

function roundToRow(round) {
  return {
    id: round.id,
    profile_id: round.profileId,
    course_id: round.courseId,
    scores: round.scores,
    total: round.total,
    played_at: round.date,
  };
}

function roundsForActiveProfile(rounds) {
  const profile = getActiveProfile();
  if (!profile) return [];
  return rounds.filter(
    (r) => !r.profileId || r.profileId === profile.id
  );
}

async function loadRounds() {
  const profile = getActiveProfile();
  if (!profile) return [];

  if (!USING_SUPABASE) {
    return roundsForActiveProfile(readLocalRounds());
  }

  const { data, error } = await SB
    .from(ROUNDS_TABLE)
    .select("*")
    .eq("profile_id", profile.id)
    .order("played_at", { ascending: true });
  if (error) {
    console.warn("Supabase load failed, using local cache:", error.message);
    return roundsForActiveProfile(readLocalRounds());
  }
  const rounds = data.map(rowToRound);
  writeLocalRounds(rounds);
  return rounds;
}

async function saveRound(round) {
  if (!USING_SUPABASE) {
    const rounds = readLocalRounds();
    rounds.push(round);
    writeLocalRounds(rounds);
    return { ok: true };
  }
  const { error } = await SB.from(ROUNDS_TABLE).insert(roundToRow(round));
  if (error) return { ok: false, error };

  const cached = readLocalRounds();
  cached.push(round);
  writeLocalRounds(cached);
  return { ok: true };
}

async function deleteRound(id) {
  const profile = getActiveProfile();
  if (!profile) return { ok: false, error: { message: "No profile" } };

  if (!USING_SUPABASE) {
    writeLocalRounds(readLocalRounds().filter((r) => r.id !== id));
    return { ok: true };
  }

  const { error } = await SB
    .from(ROUNDS_TABLE)
    .delete()
    .eq("id", id)
    .eq("profile_id", profile.id);
  if (error) return { ok: false, error };
  writeLocalRounds(readLocalRounds().filter((r) => r.id !== id));
  return { ok: true };
}

async function renderRounds() {
  const list = document.getElementById("rounds-list");
  if (!list) return;

  if (!getActiveProfile()) {
    list.innerHTML = `<li class="muted">Pick a player to see your rounds.</li>`;
    return;
  }

  list.innerHTML = `<li class="muted">Loading…</li>`;

  const rounds = await loadRounds();
  list.innerHTML = "";

  if (rounds.length === 0) {
    list.innerHTML = `<li class="muted">No rounds saved yet.</li>`;
    return;
  }

  rounds
    .slice()
    .reverse()
    .forEach((round) => {
      const course = COURSES.find((c) => c.id === round.courseId);
      const courseName = course ? course.name : round.courseId;
      const par = course ? course.pars.reduce((a, b) => a + b, 0) : null;
      const diff = par != null ? round.total - par : null;
      const diffStr =
        diff == null ? "" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;

      const li = document.createElement("li");
      li.innerHTML = `
        <div class="round-info">
          <span class="round-course">${courseName}</span>
          <span class="round-meta">${formatDate(round.date)} · ${round.scores.join("-")}</span>
        </div>
        <span class="round-score">${round.total}${diffStr ? " (" + diffStr + ")" : ""}</span>
        <button type="button" class="round-delete" aria-label="Delete round" data-id="${round.id}">×</button>
      `;
      list.appendChild(li);
    });

  list.querySelectorAll(".round-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      const result = await deleteRound(id);
      if (!result.ok) {
        setUploadStatus("Could not delete round: " + result.error.message, true);
        btn.disabled = false;
        return;
      }
      await renderRounds();
    });
  });
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* -------- Helpers -------- */

function currentCourse() {
  return COURSES.find((c) => c.id === STATE.selectedCourseId) || null;
}

/* -------- Init -------- */

function setupPlayerUI() {
  const search = document.getElementById("player-search");
  search?.addEventListener("input", (e) => {
    renderPlayerOptions(e.target.value);
  });

  document.getElementById("player-continue")?.addEventListener("click", async () => {
    const select = document.getElementById("player-select");
    const btn = document.getElementById("player-continue");
    if (btn) btn.disabled = true;
    await selectPlayer(select?.value || "");
    if (btn) btn.disabled = false;
  });

  select?.addEventListener("dblclick", () => {
    document.getElementById("player-continue")?.click();
  });

  document.getElementById("switch-player-btn")?.addEventListener("click", switchPlayer);
}

async function init() {
  renderCourses();
  setupPlayerUI();
  updateHandicap();
  await initPlayerPicker();

  document.getElementById("file-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleFile(file);
    e.target.value = "";
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!currentCourse()) return;
    STATE.scores = Array(9).fill("");
    renderScoreTable();
    setUploadStatus("");
  });

  document.getElementById("score-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const profile = getActiveProfile();
    if (!profile) {
      setUploadStatus("Pick a player first.", true);
      switchPlayer();
      return;
    }
    const course = currentCourse();
    if (!course) {
      setUploadStatus("Choose a course first.", true);
      return;
    }
    const scores = STATE.scores.map((s) => Number(s));
    if (scores.some((s) => !Number.isFinite(s) || s <= 0)) {
      setUploadStatus("Enter a valid score for all 9 holes.", true);
      return;
    }

    const total = scores.reduce((a, b) => a + b, 0);
    const round = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      profileId: profile.id,
      courseId: course.id,
      scores,
      total,
      date: new Date().toISOString(),
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setUploadStatus(USING_SUPABASE ? "Saving to Supabase…" : "Saving locally…");

    const result = await saveRound(round);
    if (submitBtn) submitBtn.disabled = false;

    if (!result.ok) {
      setUploadStatus("Could not save round: " + result.error.message, true);
      return;
    }

    await renderRounds();
    setUploadStatus(
      USING_SUPABASE
        ? `Round saved to Supabase! Total: ${total}.`
        : `Round saved locally. Total: ${total}. (Set up Supabase to sync across devices.)`
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => console.error(err));
});
