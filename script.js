/* Bucket Golf — simple 9-hole score tracker */

const COURSES = [
  {
    id: "backyard-classic",
    name: "Backyard Classic",
    description: "Wide open lawn — beginner friendly.",
    difficulty: 2, // 1 = easy, 2 = normal, 3 = hard (edit per course)
    pars: [3, 3, 4, 3, 4, 3, 3, 4, 3],
    // holeDesign: optional SVG string overlaid on the shared map template
  },
  {
    id: "park-loop",
    name: "Park Loop",
    description: "A balanced loop through the trees.",
    difficulty: 2,
    pars: [4, 3, 4, 4, 3, 5, 3, 4, 4],
  },
  {
    id: "beach-bash",
    name: "Beach Bash",
    description: "Sandy lies and ocean breeze.",
    difficulty: 2,
    pars: [3, 4, 3, 4, 5, 3, 4, 3, 4],
  },
  {
    id: "mountain-9",
    name: "Mountain Nine",
    description: "Steep elevation, tricky greens.",
    difficulty: 2,
    pars: [4, 4, 5, 3, 4, 5, 3, 4, 5],
  },
];

/** Shared aerial map: grass | water | grass (top 2/3), house from above (bottom 1/3). */
const MAP_LAYOUT = {
  width: 700,
  height: 420,
  grassWidth: 210,
  terrainRatio: 2 / 3,
};

const STATE = {
  selectedCourseId: null,
  scores: [],
  profile: null, // { id, displayName }
  editingRoundId: null,
  activeTab: "play",
};

const STORAGE_KEY = "bucket-golf-rounds-v1";
const PLAYER_STORAGE_KEY = "bucket-golf-player-v1";
const HANDICAP_WINDOW = 3;
const HANDICAP_BEST_COUNT = 2;

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
  setAppTab("play");
}

function setAppTab(tab) {
  STATE.activeTab = tab;
  const isPlay = tab === "play";
  document.getElementById("panel-play")?.toggleAttribute("hidden", !isPlay);
  document.getElementById("panel-leaderboard")?.toggleAttribute("hidden", isPlay);
  document.getElementById("tab-btn-play")?.classList.toggle("active", isPlay);
  document.getElementById("tab-btn-leaderboard")?.classList.toggle("active", !isPlay);
  document.getElementById("tab-btn-play")?.setAttribute("aria-selected", String(isPlay));
  document.getElementById("tab-btn-leaderboard")?.setAttribute("aria-selected", String(!isPlay));
  if (!isPlay) renderLeaderboard();
}

function clearEditMode() {
  STATE.editingRoundId = null;
  const btn = document.getElementById("save-round-btn");
  const cancel = document.getElementById("cancel-edit-btn");
  if (btn) btn.textContent = "Save round";
  if (cancel) cancel.hidden = true;
}

function startEditRound(round) {
  STATE.editingRoundId = round.id;
  selectCourse(round.courseId);
  STATE.scores = round.scores.map((s) => s);
  renderScoreTable();
  const btn = document.getElementById("save-round-btn");
  const cancel = document.getElementById("cancel-edit-btn");
  if (btn) btn.textContent = "Update round";
  if (cancel) cancel.hidden = false;
  setAppTab("play");
  setUploadStatus(`Editing round from ${formatDate(round.date)}.`);
  document.getElementById("score-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function prepareNewRoundAfterSave() {
  clearEditMode();
  STATE.scores = Array(9).fill("");
  renderScoreTable();
  setAppTab("play");
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
  updatePlayerHandicapSummary();
}

async function updatePlayerHandicapSummary() {
  const el = document.getElementById("player-handicap-summary");
  if (!el) return;
  const profile = getActiveProfile();
  if (!profile) {
    el.textContent = "";
    return;
  }
  const rounds = await loadRounds();
  const hcap = computeSimpleHandicap(rounds);
  if (hcap.handicap == null) {
    const need = Math.max(0, HANDICAP_WINDOW - rounds.length);
    el.textContent =
      rounds.length === 0
        ? ""
        : need > 0
          ? `Handicap: play ${need} more round${need === 1 ? "" : "s"} to qualify.`
          : "";
    return;
  }
  el.textContent = `Handicap: ${formatHandicap(hcap.handicap)} (avg of best 2 of last 3 rounds)`;
}

function switchPlayer() {
  clearEditMode();
  showPlayerGate();
  updateStorageBadge();
  const list = document.getElementById("rounds-list");
  if (list) list.innerHTML = `<li class="muted">Pick a player to see rounds.</li>`;
  renderPlayerOptions(document.getElementById("player-search")?.value || "");
  document.getElementById("player-search")?.focus();
}

function displayNameForProfileId(profileId) {
  const roster = getPlayerRoster();
  const match = roster.find((n) => playerIdFromName(n) === profileId);
  return match || profileId;
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
    const diff = Math.min(3, Math.max(1, Number(course.difficulty) || 2));
    card.innerHTML = `
      <span class="name">${course.name}</span>
      <span class="meta">9 holes · Par ${par} · Difficulty ${diff}/3</span>
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

/** Tan bunker: in grass only, curves outward away from the water toward the screen edge. */
function renderBunkers(terrainH, gw, grassRightX, w, h) {
  const attrs = 'fill="#c9a060" stroke="none"';
  const span = Math.round((terrainH - Math.round(terrainH * 0.42)) * 0.5);
  const topY = terrainH - span;
  const bulge = 22;
  const grassEdgeL = gw - 4;
  const grassEdgeR = grassRightX + 4;
  const sideGrassW = gw / 2;
  const minX = sideGrassW + 8;
  const maxX = w - sideGrassW - 8;

  const leftBunker = [
    `M ${grassEdgeL} ${topY}`,
    `L ${grassEdgeL} ${terrainH}`,
    `C ${grassEdgeL - bulge} ${terrainH} ${minX + 10} ${terrainH + 6} ${minX} ${terrainH + 14}`,
    `C ${minX + 16} ${topY + 23} ${grassEdgeL - 8} ${topY + 7} ${grassEdgeL} ${topY}`,
    "Z",
  ].join(" ");

  const rightBunker = [
    `M ${grassEdgeR} ${topY}`,
    `L ${grassEdgeR} ${terrainH}`,
    `C ${grassEdgeR + bulge} ${terrainH} ${maxX - 10} ${terrainH + 6} ${maxX} ${terrainH + 14}`,
    `C ${maxX - 16} ${topY + 23} ${grassEdgeR + 8} ${topY + 7} ${grassEdgeR} ${topY}`,
    "Z",
  ].join(" ");

  return `
    <g class="map-bunkers" aria-hidden="true">
      <clipPath id="map-bunker-left-clip"><rect x="0" y="0" width="${gw}" height="${h}" /></clipPath>
      <clipPath id="map-bunker-right-clip"><rect x="${grassRightX}" y="0" width="${gw}" height="${h}" /></clipPath>
      <path ${attrs} clip-path="url(#map-bunker-left-clip)" d="${leftBunker}" />
      <path ${attrs} clip-path="url(#map-bunker-right-clip)" d="${rightBunker}" />
    </g>
  `;
}

function renderMapTerrain(w, terrainH, gw) {
  const waterX = gw;
  const waterW = w - gw * 2;
  const grassRightX = gw + waterW;

  const waves = [];
  for (let y = 20; y < terrainH; y += 26) {
    const amp = y % 52 === 20 ? 7 : 5;
    waves.push(
      `<path class="map-wave" d="M ${waterX} ${y} q ${waterW * 0.14} ${-amp} ${waterW * 0.28} 0 t ${waterW * 0.28} 0 t ${waterW * 0.28} 0" />`
    );
  }

  return `
    <rect fill="url(#map-grass-grad)" x="0" y="0" width="${gw}" height="${terrainH}" />
    <rect fill="url(#map-grass-grad)" x="${grassRightX}" y="0" width="${gw}" height="${terrainH}" />
    <rect fill="url(#map-water-grad)" x="${waterX}" y="0" width="${waterW}" height="${terrainH}" />
    <g clip-path="url(#map-water-clip)" aria-hidden="true">
      ${waves.join("")}
    </g>
    <line class="map-terrain-edge" x1="0" y1="${terrainH}" x2="${w}" y2="${terrainH}" />
  `;
}

/** Single gable roof seen from directly above (dark grey, ridge down the center). */
function renderAerialRoof(cx, roofY, roofW, roofH) {
  const roofX = cx - roofW / 2;
  return `
    <rect fill="#4a4d52" x="${roofX}" y="${roofY}" width="${roofW}" height="${roofH}" rx="3" />
    <rect fill="#2e3136" x="${roofX}" y="${roofY}" width="${roofW / 2}" height="${roofH}" rx="3" />
    <line x1="${cx}" y1="${roofY}" x2="${cx}" y2="${roofY + roofH}" stroke="#1a1c1f" stroke-width="2.5" />
  `;
}

/** Bottom third: grey yard + center roof; extra grass on far left and right. */
function renderMapHouse(w, h, terrainH, gw) {
  const zoneH = h - terrainH;
  const houseY = terrainH;
  const roofW = 158;
  const roofH = 78;
  const roofY = houseY + zoneH * 0.32;
  const sideGrassW = gw / 2;

  return `
    <g class="map-house-zone" aria-hidden="true">
      <rect fill="#a8abb0" x="0" y="${houseY}" width="${w}" height="${zoneH}" />
      <rect fill="url(#map-grass-grad)" x="0" y="${houseY}" width="${sideGrassW}" height="${zoneH}" />
      <rect fill="url(#map-grass-grad)" x="${w - sideGrassW}" y="${houseY}" width="${sideGrassW}" height="${zoneH}" />
      <rect fill="#7a7e85" x="${w / 2 - 32}" y="${houseY + 10}" width="64" height="${zoneH - 14}" rx="2" />
      ${renderAerialRoof(w / 2, roofY, roofW, roofH)}
    </g>
  `;
}

function renderMapTemplate() {
  const { width: w, height: h, grassWidth: gw, terrainRatio } = MAP_LAYOUT;
  const terrainH = Math.round(h * terrainRatio);
  const grassRightX = gw + (w - gw * 2);

  return `
    <defs>
      <linearGradient id="map-grass-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6aab52" />
        <stop offset="100%" stop-color="#3d7a32" />
      </linearGradient>
      <linearGradient id="map-water-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6ec4f0" />
        <stop offset="100%" stop-color="#2a7ab8" />
      </linearGradient>
      <clipPath id="map-water-clip">
        <rect x="${gw}" y="0" width="${w - gw * 2}" height="${terrainH}" />
      </clipPath>
    </defs>
    ${renderMapTerrain(w, terrainH, gw)}
    ${renderMapHouse(w, h, terrainH, gw)}
    ${renderBunkers(terrainH, gw, grassRightX, w, h)}
  `;
}

/** Per-course hole art — set course.holeDesign to an SVG fragment when ready. */
function renderMapHoleOverlays(course) {
  return course.holeDesign || "";
}

function renderMap() {
  const mapEl = document.getElementById("course-map");
  const course = currentCourse();
  if (!course) {
    mapEl.innerHTML = `<p class="map-empty">Select a course above to see the map.</p>`;
    return;
  }

  const { width: w, height: h } = MAP_LAYOUT;

  mapEl.innerHTML = `
    <svg class="map-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${course.name} aerial course map">
      ${renderMapTemplate()}
      <g class="map-holes">${renderMapHoleOverlays(course)}</g>
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
  const n = Math.round(diff * 10) / 10;
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${String(n)}`;
}

/* -------- Handicap (best 2 of last 3 rounds) --------
 *
 * Per round: adjusted score vs par, with course difficulty 1–3
 * (1 = easy, 2 = normal, 3 = hard). Harder courses add strokes to the diff.
 *
 * Handicap = average of the best 2 adjusted diffs from the player's last 3
 * rounds (by date). Need at least 3 rounds for a handicap.
 */
function coursePar(course) {
  return course.pars.reduce((a, b) => a + b, 0);
}

function roundAdjustedDiff(round) {
  const course = COURSES.find((c) => c.id === round.courseId);
  if (!course) return null;
  const par = coursePar(course);
  const difficulty = Math.min(3, Math.max(1, Number(course.difficulty) || 2));
  const raw = round.total - par;
  return raw + (difficulty - 2);
}

function computeSimpleHandicap(rounds) {
  const sorted = [...rounds].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const diffs = sorted.map(roundAdjustedDiff).filter((d) => d !== null);

  if (diffs.length < HANDICAP_WINDOW) {
    return {
      handicap: null,
      roundsUsed: diffs.length,
      roundsAveraged: 0,
    };
  }

  const last = diffs.slice(-HANDICAP_WINDOW);
  const best = [...last].sort((a, b) => a - b).slice(0, HANDICAP_BEST_COUNT);
  const handicap = best.reduce((sum, d) => sum + d, 0) / best.length;

  return {
    handicap,
    roundsUsed: HANDICAP_WINDOW,
    roundsAveraged: best.length,
  };
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
  mergeLocalRoundsForProfile(profile.id, rounds);
  return rounds;
}

function mergeLocalRoundsForProfile(profileId, profileRounds) {
  const all = readLocalRounds().filter((r) => r.profileId && r.profileId !== profileId);
  writeLocalRounds(all.concat(profileRounds));
}

async function loadAllRounds() {
  if (!USING_SUPABASE) return readLocalRounds();
  const { data, error } = await SB
    .from(ROUNDS_TABLE)
    .select("*")
    .order("played_at", { ascending: true });
  if (error) {
    console.warn("Could not load all rounds:", error.message);
    return readLocalRounds();
  }
  return data.map(rowToRound);
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

async function updateRound(round) {
  if (!USING_SUPABASE) {
    const rounds = readLocalRounds();
    const idx = rounds.findIndex((r) => r.id === round.id);
    if (idx === -1) return { ok: false, error: { message: "Round not found" } };
    rounds[idx] = round;
    writeLocalRounds(rounds);
    return { ok: true };
  }
  const { error } = await SB
    .from(ROUNDS_TABLE)
    .update({
      course_id: round.courseId,
      scores: round.scores,
      total: round.total,
      played_at: round.date,
    })
    .eq("id", round.id)
    .eq("profile_id", round.profileId);
  if (error) return { ok: false, error };

  const cached = readLocalRounds();
  const idx = cached.findIndex((r) => r.id === round.id);
  if (idx >= 0) cached[idx] = round;
  else cached.push(round);
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

      const isEditing = STATE.editingRoundId === round.id;
      const li = document.createElement("li");
      li.className = isEditing ? "round-item editing" : "round-item";
      li.innerHTML = `
        <button type="button" class="round-main" data-id="${round.id}">
          <span class="round-info">
            <span class="round-course">${courseName}</span>
            <span class="round-meta">${formatDate(round.date)} · ${round.scores.join("-")}</span>
          </span>
          <span class="round-score">${round.total}${diffStr ? " (" + diffStr + ")" : ""}</span>
        </button>
        <button type="button" class="round-delete" aria-label="Delete round" data-id="${round.id}">×</button>
      `;
      list.appendChild(li);
    });

  list.querySelectorAll(".round-main").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const round = rounds.find((r) => r.id === id);
      if (round) startEditRound(round);
    });
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
      if (STATE.editingRoundId === id) clearEditMode();
      await renderRounds();
      updatePlayerHandicapSummary();
      if (STATE.activeTab === "leaderboard") await renderLeaderboard();
    });
  });
}

function buildLeaderboardRows(allRounds) {
  const byProfile = new Map();

  for (const round of allRounds) {
    const pid = round.profileId;
    if (!pid) continue;
    if (!byProfile.has(pid)) byProfile.set(pid, []);
    byProfile.get(pid).push(round);
  }

  const rows = [];
  for (const [profileId, playerRounds] of byProfile) {
    const hcap = computeSimpleHandicap(playerRounds);
    rows.push({
      profileId,
      name: displayNameForProfileId(profileId),
      roundsPlayed: playerRounds.length,
      handicap: hcap.handicap,
      roundsAveraged: hcap.roundsAveraged,
    });
  }

  for (const name of getPlayerRoster()) {
    const id = playerIdFromName(name);
    if (!byProfile.has(id)) {
      rows.push({
        profileId: id,
        name,
        roundsPlayed: 0,
        handicap: null,
        roundsAveraged: 0,
      });
    }
  }

  rows.sort((a, b) => {
    const aHas = a.handicap != null;
    const bHas = b.handicap != null;
    if (!aHas && !bHas) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (!aHas) return 1;
    if (!bHas) return -1;
    if (a.handicap !== b.handicap) return a.handicap - b.handicap;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return rows;
}

async function renderLeaderboard() {
  const wrap = document.getElementById("leaderboard-wrap");
  if (!wrap) return;

  wrap.innerHTML = `<p class="muted">Loading leaderboard…</p>`;
  const allRounds = await loadAllRounds();
  const rows = buildLeaderboardRows(allRounds);

  if (rows.length === 0) {
    wrap.innerHTML = `<p class="muted">No players on the roster yet.</p>`;
    return;
  }

  const activeId = getActiveProfile()?.id;
  let html = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Rounds</th>
          <th>Handicap</th>
        </tr>
      </thead>
      <tbody>
  `;

  let rankNum = 0;
  rows.forEach((row) => {
    const rank = row.handicap != null ? ++rankNum : "—";
    const hcap =
      row.handicap == null
        ? row.roundsPlayed > 0 && row.roundsPlayed < HANDICAP_WINDOW
          ? `Need ${HANDICAP_WINDOW - row.roundsPlayed} more`
          : "—"
        : formatHandicap(row.handicap);
    const you = row.profileId === activeId ? ' class="leaderboard-you"' : "";
    const methodNote =
      row.roundsAveraged > 0
        ? `<span class="leaderboard-sets">best 2 of last 3</span>`
        : "";
    html += `
      <tr${you}>
        <td>${rank}</td>
        <td>${escapeHtml(row.name)}${methodNote}</td>
        <td>${row.roundsPlayed}</td>
        <td>${hcap}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function setupAppTabs() {
  document.getElementById("tab-btn-play")?.addEventListener("click", () => setAppTab("play"));
  document.getElementById("tab-btn-leaderboard")?.addEventListener("click", () => {
    setAppTab("leaderboard");
  });
  document.getElementById("leaderboard-refresh")?.addEventListener("click", () => {
    renderLeaderboard();
  });
}

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

  document.getElementById("player-select")?.addEventListener("dblclick", () => {
    document.getElementById("player-continue")?.click();
  });

  document.getElementById("switch-player-btn")?.addEventListener("click", switchPlayer);
}

async function init() {
  renderCourses();
  setupAppTabs();
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
    clearEditMode();
    STATE.scores = Array(9).fill("");
    renderScoreTable();
    setUploadStatus("");
  });

  document.getElementById("cancel-edit-btn")?.addEventListener("click", () => {
    clearEditMode();
    STATE.scores = Array(9).fill("");
    renderScoreTable();
    setUploadStatus("Edit cancelled.");
  });

  document.getElementById("score-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const profile = getActiveProfile();
    if (!profile) {
      setUploadStatus("Pick a player first.", true);
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
    const isEdit = Boolean(STATE.editingRoundId);
    let playedAt = new Date().toISOString();
    if (isEdit) {
      const existing = (await loadRounds()).find((r) => r.id === STATE.editingRoundId);
      if (existing?.date) playedAt = existing.date;
    }
    const round = {
      id: isEdit
        ? STATE.editingRoundId
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      profileId: profile.id,
      courseId: course.id,
      scores,
      total,
      date: playedAt,
    };

    const submitBtn = document.getElementById("save-round-btn");
    if (submitBtn) submitBtn.disabled = true;
    setUploadStatus(isEdit ? "Updating round…" : USING_SUPABASE ? "Saving…" : "Saving locally…");

    const result = isEdit ? await updateRound(round) : await saveRound(round);
    if (submitBtn) submitBtn.disabled = false;

    if (!result.ok) {
      setUploadStatus("Could not save round: " + result.error.message, true);
      return;
    }

    prepareNewRoundAfterSave();
    await renderRounds();
    updatePlayerHandicapSummary();
    if (STATE.activeTab === "leaderboard") await renderLeaderboard();

    const par = course.pars.reduce((a, b) => a + b, 0);
    const diffStr = formatHandicap(total - par);
    setUploadStatus(
      isEdit
        ? `Round updated! Total ${total} (${diffStr}). Enter scores for another round below.`
        : `Round saved! Total ${total} (${diffStr}). Enter scores for another round below.`
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => console.error(err));
});
