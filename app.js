// =====================
// CONFIG – FRONTEND CALLS YOUR CLOUDFLARE WORKER
// =====================

// TODO: change this to your real Worker URL
// Example: "https://gators-proxy.robbiek7455.workers.dev"
const WORKER_BASE = "gators-proxy.robbiek7455.workers.dev/";

const API_CONFIG = {
  // seasons you want to support in the UI
  seasons: [2022, 2023, 2024, 2025],
  defaultSeason: 2025,
  teamKey: "FLA", // Florida Gators key in SportsDataIO

  // these now point to your Worker, NOT directly to api.sportsdata.io
  baseScoresUrl: `${WORKER_BASE}/v3/cbb/scores/json`,
  baseStatsUrl: `${WORKER_BASE}/v3/cbb/stats/json`,
  baseOddsUrl: `${WORKER_BASE}/v3/cbb/odds/json`
};

// Endpoints: multi-season NCAA CBB endpoints (matching your SportsDataIO list)
const ENDPOINTS = {
  // Multi-season schedule for FLA
  schedulesMultiSeason: "TeamSchedule/2022,2023,2024,2025/FLA",

  // Multi-season player season stats for FLA
  playerSeasonStatsMultiSeason: "PlayerSeasonStatsByTeam/2022,2023,2024,2025/FLA",

  // Multi-season team season stats (we filter to FLA)
  teamSeasonStatsMultiSeason: "TeamSeasonStats/2022,2023,2024,2025",

  // All players for FLA
  playersByTeam: "Players/FLA",

  // Utility: Is any game in progress?
  areAnyGamesInProgress: "AreAnyGamesInProgress",

  // Utility: current season
  currentSeason: "CurrentSeason",

  // Odds: list of sportsbooks (names only)
  activeSportsbooks: "ActiveSportsbooks"
};

function urlScores(path) {
  // no ?key here – Worker adds key in header
  return `${API_CONFIG.baseScoresUrl}/${path}`;
}
function urlStats(path) {
  return `${API_CONFIG.baseStatsUrl}/${path}`;
}
function urlOdds(path) {
  return `${API_CONFIG.baseOddsUrl}/${path}`;
}

// =====================
// GLOBAL STATE
// =====================
const state = {
  seasons: API_CONFIG.seasons.slice(),
  currentSeason: API_CONFIG.defaultSeason,

  scheduleAll: [],
  playerSeasonStatsAll: [],
  teamSeasonStatsAll: [],
  playersAll: [],
  gamesInProgress: null,
  activeSportsbooks: [],

  countdownInterval: null
};

// =====================
// INIT
// =====================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  initHeroPills();
  initSeasonSelectors();
  initFilters();
  initPoll();
  loadAllData();
});

// =====================
// THEME TOGGLE
// =====================
const THEME_KEY = "gators_theme";

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const initial = stored === "dark" ? "dark" : "light";
  setTheme(initial);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = document.body.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  }
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }
}

// =====================
// TABS & HERO PILLS
// =====================
function initTabs() {
  const links = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".tab-section");

  links.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      links.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      sections.forEach((sec) => {
        sec.classList.toggle("active", sec.id === targetId);
      });
    });
  });
}

function initHeroPills() {
  const pills = document.querySelectorAll(".pill-btn");
  const sections = document.querySelectorAll(".tab-section");
  const navLinks = document.querySelectorAll(".nav-link");

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetId = pill.dataset.target;
      pills.forEach((p) => p.classList.remove("pill-active"));
      pill.classList.add("pill-active");

      navLinks.forEach((link) =>
        link.classList.toggle("active", link.dataset.target === targetId)
      );
      sections.forEach((sec) => {
        sec.classList.toggle("active", sec.id === targetId);
      });
    });
  });
}

// =====================
// SEASON SELECTORS
// =====================
function initSeasonSelectors() {
  const ids = [
    "hero-season-select",
    "schedule-season-select",
    "roster-season-select",
    "stats-season-select",
    "analytics-season-select"
  ];

  ids.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;

    select.innerHTML = "";
    state.seasons.forEach((season) => {
      const opt = document.createElement("option");
      opt.value = season;
      opt.textContent = season;
      if (season === state.currentSeason) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener("change", (e) => {
      const val = parseInt(e.target.value, 10);
      if (!state.seasons.includes(val)) return;
      state.currentSeason = val;
      syncSeasonSelectors(val);
      renderAll();
    });
  });
}

function syncSeasonSelectors(season) {
  const ids = [
    "hero-season-select",
    "schedule-season-select",
    "roster-season-select",
    "stats-season-select",
    "analytics-season-select"
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = String(season);
  });
}

// =====================
// FILTERS
// =====================
function initFilters() {
  const upcoming = document.getElementById("schedule-upcoming-only");
  const search = document.getElementById("schedule-search");
  const rosterSearch = document.getElementById("roster-search");
  const rosterPos = document.getElementById("roster-position-filter");

  if (upcoming) upcoming.addEventListener("change", renderSchedule);
  if (search) search.addEventListener("input", renderSchedule);

  if (rosterSearch) rosterSearch.addEventListener("input", renderRoster);
  if (rosterPos) rosterPos.addEventListener("change", renderRoster);
}

// =====================
// FAN POLL
// =====================
function initPoll() {
  const form = document.getElementById("fan-poll");
  const resultsDiv = document.getElementById("poll-results");
  if (!form || !resultsDiv) return;

  const STORAGE_KEY = "gators_poll_scoring_leader";

  function loadResults() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { guard: 0, wing: 0, big: 0 };
  }

  function saveResults(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function render() {
    const data = loadResults();
    const total = data.guard + data.wing + data.big;
    if (!total) {
      resultsDiv.textContent = "No votes yet. Be the first!";
      return;
    }
    const pct = (x) => Math.round((x / total) * 100);
    resultsDiv.innerHTML = `
      <p><strong>Results:</strong></p>
      <ul>
        <li>Lead Guard: ${data.guard} (${pct(data.guard)}%)</li>
        <li>Wing Scorer: ${data.wing} (${pct(data.wing)}%)</li>
        <li>Big Man: ${data.big} (${pct(data.big)}%)</li>
      </ul>
    `;
  }

  render();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const choice = form.querySelector("input[name='poll-choice']:checked");
    if (!choice) {
      alert("Please select an option before voting.");
      return;
    }
    const data = loadResults();
    data[choice.value] = (data[choice.value] || 0) + 1;
    saveResults(data);
    render();
  });
}

// =====================
// DATA LOADING (ALL AT ONCE THROUGH WORKER)
// =====================
async function loadAllData() {
  const loading = document.getElementById("global-loading");
  const errorDiv = document.getElementById("global-error");
  if (loading) loading.classList.remove("hidden");
  if (errorDiv) errorDiv.classList.add("hidden");

  try {
    const results = await Promise.allSettled([
      fetchJson(urlScores(ENDPOINTS.schedulesMultiSeason)),           // 0
      fetchJson(urlStats(ENDPOINTS.playerSeasonStatsMultiSeason)),    // 1
      fetchJson(urlScores(ENDPOINTS.teamSeasonStatsMultiSeason)),     // 2
      fetchJson(urlScores(ENDPOINTS.playersByTeam)),                  // 3
      fetchJson(urlScores(ENDPOINTS.currentSeason)),                  // 4
      fetchJson(urlScores(ENDPOINTS.areAnyGamesInProgress)),          // 5
      fetchJson(urlOdds(ENDPOINTS.activeSportsbooks))                 // 6
    ]);

    const get = (i) => (results[i].status === "fulfilled" ? results[i].value : null);

    const scheduleAll = get(0) || [];
    const playerStatsAll = get(1) || [];
    const teamSeasonStatsAll = get(2) || [];
    const playersAll = get(3) || [];
    const currentSeasonVal = get(4);
    const gamesInProgressVal = get(5);
    const activeSportsbooks = get(6) || [];

    state.scheduleAll = Array.isArray(scheduleAll) ? scheduleAll : [];
    state.playerSeasonStatsAll = Array.isArray(playerStatsAll) ? playerStatsAll : [];
    state.teamSeasonStatsAll = Array.isArray(teamSeasonStatsAll) ? teamSeasonStatsAll : [];
    state.playersAll = Array.isArray(playersAll) ? playersAll : [];
    state.gamesInProgress = gamesInProgressVal;
    state.activeSportsbooks = Array.isArray(activeSportsbooks) ? activeSportsbooks : [];

    // Use CurrentSeason endpoint if it returns a season we support
    let seasonFromApi = null;
    if (typeof currentSeasonVal === "number") {
      seasonFromApi = currentSeasonVal;
    } else if (currentSeasonVal && typeof currentSeasonVal.Season === "number") {
      seasonFromApi = currentSeasonVal.Season;
    }
    if (seasonFromApi && state.seasons.includes(seasonFromApi)) {
      state.currentSeason = seasonFromApi;
    }

    syncSeasonSelectors(state.currentSeason);
    renderAll();
  } catch (err) {
    console.error("Error loading data:", err);
    if (errorDiv) {
      errorDiv.textContent =
        "Error loading data from SportsDataIO (via Worker) – check Worker URL and endpoints.";
      errorDiv.classList.remove("hidden");
    }
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

async function fetchJson(url) {
  const res = await fetch(url); // no headers; Worker adds key & CORS
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// =====================
// RENDER ALL
// =====================
function renderAll() {
  renderSchedule();
  renderHeroFromState();
  renderRoster();
  renderStats();
  renderAnalytics();
  renderTickets();
}

// =====================
// SCHEDULE + HERO
// =====================
function getSeasonSchedule() {
  return (state.scheduleAll || []).filter((g) => g.Season === state.currentSeason);
}

function getSeasonPlayerStats() {
  return (state.playerSeasonStatsAll || []).filter((p) => p.Season === state.currentSeason);
}

function getSeasonTeamSeasonStats() {
  const season = state.currentSeason;
  return (state.teamSeasonStatsAll || []).find(
    (t) =>
      t.Season === season &&
      (t.Team === "Florida" || t.Key === API_CONFIG.teamKey || t.School === "Florida")
  );
}

function renderSchedule() {
  const tbody = document.getElementById("schedule-table-body");
  if (!tbody) return;

  const schedule = getSeasonSchedule();
  const upcomingOnly = document.getElementById("schedule-upcoming-only")?.checked;
  const searchValue = (document.getElementById("schedule-search")?.value || "").toLowerCase();
  const now = new Date();

  tbody.innerHTML = "";

  const rows = schedule
    .map((g) => ({ g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .filter(({ g, dt }) => {
      if (upcomingOnly && dt && dt < now) return false;
      const oppName = getOpponentName(g).toLowerCase();
      if (searchValue && !oppName.includes(searchValue)) return false;
      return true;
    })
    .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0));

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="5" class="placeholder">No games found. Check filters and season.</td>';
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(({ g, dt }) => {
    const tr = document.createElement("tr");
    const loc = g.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away";
    const result = buildResultString(g);
    const record =
      g.HomeTeam === API_CONFIG.teamKey
        ? `${g.HomeTeamWins ?? ""}-${g.HomeTeamLosses ?? ""}`
        : `${g.AwayTeamWins ?? ""}-${g.AwayTeamLosses ?? ""}`;

    tr.innerHTML = `
      <td>${dt ? formatDate(dt) : "-"}</td>
      <td>${getOpponentName(g)}</td>
      <td>${loc}</td>
      <td>${result}</td>
      <td>${record}</td>
    `;
    tr.addEventListener("click", () => showGameDetail(g));
    tbody.appendChild(tr);
  });
}

function getOpponentName(game) {
  const ourKey = API_CONFIG.teamKey;
  const isHome = game.HomeTeam === ourKey;
  const oppKey = isHome ? game.AwayTeam : game.HomeTeam;
  return (
    (isHome ? game.AwayTeamName : game.HomeTeamName) ||
    game.GlobalAwayTeamName ||
    game.GlobalHomeTeamName ||
    oppKey ||
    "TBA"
  );
}

function buildResultString(game) {
  if (game.Status === "Scheduled" || game.Status === "InProgress") {
    return game.Status || "Scheduled";
  }
  const ourKey = API_CONFIG.teamKey;
  const isHome = game.HomeTeam === ourKey;
  const ourScore = isHome ? game.HomeTeamScore : game.AwayTeamScore;
  const oppScore = isHome ? game.AwayTeamScore : game.HomeTeamScore;
  if (ourScore == null || oppScore == null) return "Final (score unavailable)";
  const result = ourScore > oppScore ? "W" : ourScore < oppScore ? "L" : "T";
  return `${result} ${ourScore}-${oppScore}`;
}

function showGameDetail(game) {
  const card = document.getElementById("game-detail-card");
  const body = document.getElementById("game-detail-body");
  if (!card || !body) return;

  const dt = parseSportsDataDate(game.Day || game.DateTime);
  const loc = game.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away";
  const result = buildResultString(game);

  body.innerHTML = `
    <p><strong>${getOpponentName(game)}</strong> (${loc})</p>
    <p>Date / Time: ${dt ? dt.toLocaleString() : "TBA"}</p>
    <p>Status / Result: ${result}</p>
    <p>TV: ${game.Channel || "TBA"}</p>
    <p>Attendance: ${game.Attendance ?? "N/A"}</p>
  `;
  card.classList.remove("hidden");
}

function renderHeroFromState() {
  const schedule = getSeasonSchedule();
  const stats = getSeasonPlayerStats();

  // Live badge from AreAnyGamesInProgress
  const liveBadge = document.getElementById("live-badge");
  if (liveBadge) {
    const val = state.gamesInProgress;
    const isLive = val === true || val === "true";
    liveBadge.classList.toggle("hidden", !isLive);
  }

  // Next game + countdown
  const nextGame = findNextGame(schedule);
  const oppEl = document.getElementById("next-game-opponent");
  const metaEl = document.getElementById("next-game-meta");

  if (nextGame && oppEl && metaEl) {
    const dt = parseSportsDataDate(nextGame.Day || nextGame.DateTime);
    oppEl.textContent = getOpponentName(nextGame);
    metaEl.textContent = dt
      ? `${dt.toLocaleString()} • ${
          nextGame.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away"
        }`
      : nextGame.HomeTeam === API_CONFIG.teamKey
      ? "Home"
      : "Away";
    startCountdown(dt);
  } else if (oppEl && metaEl) {
    oppEl.textContent = "No upcoming games.";
    metaEl.textContent = "";
    stopCountdown();
  }

  // Quick record + PPG/RPG + last 5
  const recordEl = document.getElementById("quick-record");
  const ppgEl = document.getElementById("quick-ppg");
  const rpgEl = document.getElementById("quick-rpg");
  const last5El = document.getElementById("quick-last5");

  let wins = 0;
  let losses = 0;

  schedule.forEach((g) => {
    if (g.Status !== "Final") return;
    const isHome = g.HomeTeam === API_CONFIG.teamKey;
    const ourScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    if (ourScore == null || oppScore == null) return;
    if (ourScore > oppScore) wins++;
    else if (ourScore < oppScore) losses++;
  });

  if (recordEl) recordEl.textContent = wins + losses ? `${wins}-${losses}` : "–";

  // Prefer team-level stats if available
  const teamSeason = getSeasonTeamSeasonStats();
  let ppg = null;
  let rpg = null;
  if (teamSeason && typeof teamSeason.PointsPerGame === "number") {
    ppg = teamSeason.PointsPerGame;
  }
  if (teamSeason && typeof teamSeason.ReboundsPerGame === "number") {
    rpg = teamSeason.ReboundsPerGame;
  }

  if (ppg == null || rpg == null) {
    let totalPoints = 0;
    let totalReb = 0;
    let totalGames = 0;
    stats.forEach((p) => {
      const g = p.Games || p.GamesPlayed || 0;
      totalPoints += p.Points || 0;
      totalReb += p.Rebounds || 0;
      totalGames = Math.max(totalGames, g);
    });
    if (ppg == null) ppg = totalGames ? totalPoints / totalGames : null;
    if (rpg == null) rpg = totalGames ? totalReb / totalGames : null;
  }

  if (ppgEl) ppgEl.textContent = ppg != null ? ppg.toFixed(1) : "–";
  if (rpgEl) rpgEl.textContent = rpg != null ? rpg.toFixed(1) : "–";

  const last5 = schedule
    .filter((g) => g.Status === "Final")
    .slice(-5)
    .map((g) => {
      const isHome = g.HomeTeam === API_CONFIG.teamKey;
      const our = isHome ? g.HomeTeamScore : g.AwayTeamScore;
      const opp = isHome ? g.AwayTeamScore : g.HomeTeamScore;
      if (our == null || opp == null) return null;
      return our > opp ? "W" : our < opp ? "L" : "T";
    })
    .filter(Boolean);

  if (last5El) last5El.textContent = last5.length ? last5.join(" ") : "–";
}

function findNextGame(schedule) {
  const now = new Date();
  const upcoming = schedule
    .map((g) => ({ g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .filter(({ dt }) => dt && dt >= now)
    .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0));
  return upcoming.length ? upcoming[0].g : null;
}

function startCountdown(target) {
  const el = document.getElementById("countdown-timer");
  stopCountdown();
  if (!el || !target) return;

  function tick() {
    const now = new Date();
    const diff = target - now;
    if (diff <= 0) {
      el.textContent = "00d 00h 00m 00s";
      stopCountdown();
      return;
    }
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff / (60 * 60 * 1000)) % 24);
    const mins = Math.floor((diff / (60 * 1000)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    el.textContent = `${pad2(days)}d ${pad2(hours)}h ${pad2(mins)}m ${pad2(secs)}s`;
  }

  tick();
  state.countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

// =====================
// ROSTER
// =====================
function renderRoster() {
  const currentSeason = state.currentSeason;
  const statsThisSeason = getSeasonPlayerStats();

  const currentEl = document.getElementById("roster-current");
  const formerEl = document.getElementById("roster-former");
  if (!currentEl || !formerEl) return;

  const searchValue = (document.getElementById("roster-search")?.value || "")
    .trim()
    .toLowerCase();
  const posFilter = document.getElementById("roster-position-filter")?.value || "all";

  const playersMap = new Map();
  (state.playersAll || []).forEach((p) => {
    const key = p.PlayerID || `${p.FirstName || ""} ${p.LastName || ""}`.trim();
    if (!key) return;
    playersMap.set(key, p);
  });

  const currentPlayers = dedupePlayers(statsThisSeason).filter((p) => {
    if (searchValue && !p.Name.toLowerCase().includes(searchValue)) return false;
    if (posFilter !== "all" && p.Position && p.Position !== posFilter) return false;
    return true;
  });

  currentEl.innerHTML = "";
  if (!currentPlayers.length) {
    currentEl.innerHTML = '<p class="placeholder">No players match your filters.</p>';
  } else {
    currentPlayers.forEach((p) => {
      const fullPlayer = playersMap.get(p.PlayerID) || playersMap.get(p.Name) || {};
      const card = document.createElement("div");
      card.className = "roster-card";
      card.innerHTML = `
        <h4>${p.Jersey ? "#" + p.Jersey + " " : ""}${p.Name}</h4>
        <div class="roster-meta">
          <div>${p.Position || fullPlayer.Position || "Pos"}${
        p.Class ? " • " + p.Class : ""
      }</div>
          <div>${fullPlayer.Height || p.Height || ""}${
        fullPlayer.Weight || p.Weight ? " • " + (fullPlayer.Weight || p.Weight) + " lbs" : ""
      }</div>
        </div>
      `;
      currentEl.appendChild(card);
    });
  }

  const formerMap = new Map();
  (state.playerSeasonStatsAll || []).forEach((p) => {
    if (p.Season === currentSeason) return;
    const key = p.PlayerID || p.Name;
    if (!key) return;
    if (!formerMap.has(key)) {
      formerMap.set(key, {
        PlayerID: p.PlayerID,
        Name: p.Name || `${p.FirstName || ""} ${p.LastName || ""}`.trim(),
        Position: p.Position,
        Jersey: p.Jersey,
        season: p.Season
      });
    }
  });

  formerEl.innerHTML = "";
  if (!formerMap.size) {
    formerEl.innerHTML =
      '<p class="placeholder">Load another season to see former players.</p>';
  } else {
    Array.from(formerMap.values())
      .sort((a, b) => a.season - b.season)
      .forEach((p) => {
        const card = document.createElement("div");
        card.className = "roster-card";
        card.innerHTML = `
          <h4>${p.Name}</h4>
          <div class="roster-meta">
            <div>Season: ${p.season}</div>
            <div>${p.Position || "Pos"}${p.Jersey ? " • #" + p.Jersey : ""}</div>
          </div>
        `;
        formerEl.appendChild(card);
      });
  }
}

function dedupePlayers(statsArr) {
  const map = new Map();
  (statsArr || []).forEach((p) => {
    const key = p.PlayerID || p.Name;
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        PlayerID: p.PlayerID,
        Name: p.Name || `${p.FirstName || ""} ${p.LastName || ""}`.trim(),
        Position: p.Position,
        Jersey: p.Jersey,
        Class: p.Class,
        Height: p.Height,
        Weight: p.Weight
      });
    }
  });
  return Array.from(map.values());
}

// =====================
// STATS
// =====================
function renderStats() {
  const stats = getSeasonPlayerStats();
  const tbody = document.getElementById("stats-table-body");
  const leadersEl = document.getElementById("stats-leaders");
  const propsList = document.getElementById("props-ideas");
  const sportsbooksNote = document.getElementById("sportsbooks-note");
  if (!tbody || !leadersEl || !propsList) return;

  tbody.innerHTML = "";
  leadersEl.innerHTML = "";
  propsList.innerHTML = "";
  if (sportsbooksNote) sportsbooksNote.textContent = "";

  if (!stats.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="placeholder">No stats loaded. Check season or plan permissions.</td></tr>';
    return;
  }

  const rows = stats.slice().sort((a, b) => {
    const ga = a.Games || a.GamesPlayed || 0;
    const gb = b.Games || b.GamesPlayed || 0;
    const ppgA = ga ? (a.Points || 0) / ga : 0;
    const ppgB = gb ? (b.Points || 0) / gb : 0;
    return ppgB - ppgA;
  });

  rows.forEach((p) => {
    const games = p.Games || p.GamesPlayed || 0;
    const ppg = games ? (p.Points || 0) / games : 0;
    const rpg = games ? (p.Rebounds || 0) / games : 0;
    const apg = games ? (p.Assists || 0) / games : 0;
    const threePct = p.ThreePointersPercentage ?? p.ThreePointPercentage ?? null;
    const ftPct = p.FreeThrowsPercentage ?? p.FreeThrowPercentage ?? null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.Name || `${p.FirstName || ""} ${p.LastName || ""}`.trim()}</td>
      <td>${games}</td>
      <td>${ppg.toFixed(1)}</td>
      <td>${rpg.toFixed(1)}</td>
      <td>${apg.toFixed(1)}</td>
      <td>${formatPct(threePct)}</td>
      <td>${formatPct(ftPct)}</td>
    `;
    tbody.appendChild(tr);
  });

  const leaderBy = (getVal) =>
    rows.reduce(
      (best, p) => {
        const g = p.Games || p.GamesPlayed || 0;
        if (!g) return best;
        const v = getVal(p, g);
        return v > best.value ? { player: p, value: v } : best;
      },
      { player: null, value: -Infinity }
    );

  const ptsLeader = leaderBy((p, g) => (p.Points || 0) / g);
  const rebLeader = leaderBy((p, g) => (p.Rebounds || 0) / g);
  const astLeader = leaderBy((p, g) => (p.Assists || 0) / g);

  [
    ["PPG", ptsLeader],
    ["RPG", rebLeader],
    ["APG", astLeader]
  ].forEach(([label, obj]) => {
    if (!obj.player) return;
    const div = document.createElement("div");
    div.className = "leader";
    div.innerHTML = `
      <span>${label}: ${obj.player.Name}</span>
      <strong>${obj.value.toFixed(1)}</strong>
    `;
    leadersEl.appendChild(div);
  });

  rows.slice(0, 5).forEach((p) => {
    const g = p.Games || p.GamesPlayed || 0;
    if (!g) return;
    const ppg = (p.Points || 0) / g;
    const line = Math.round(ppg - 0.5);
    const li = document.createElement("li");
    li.textContent = `${p.Name}: Over/Under ${line}.5 points`;
    propsList.appendChild(li);
  });

  if (sportsbooksNote && state.activeSportsbooks.length) {
    const names = state.activeSportsbooks
      .map((sb) => sb.Name)
      .filter(Boolean)
      .slice(0, 5);
    if (names.length) {
      sportsbooksNote.textContent = `SportsDataIO active sportsbooks feed currently includes: ${names.join(
        ", "
      )}.`;
    }
  }
}

// =====================
// ANALYTICS
// =====================
function renderAnalytics() {
  const schedule = getSeasonSchedule();
  const recordEl = document.getElementById("analytics-record");
  const scoringEl = document.getElementById("analytics-scoring");
  const last5El = document.getElementById("analytics-last5");

  if (!recordEl || !scoringEl || !last5El) return;

  const finals = schedule
    .filter((g) => g.Status === "Final")
    .map((g) => ({ g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0));

  let homeW = 0,
    homeL = 0,
    awayW = 0,
    awayL = 0;
  let totalPts = 0,
    totalAllow = 0,
    gamesCount = 0;

  finals.forEach(({ g }) => {
    const isHome = g.HomeTeam === API_CONFIG.teamKey;
    const our = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const opp = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    if (our == null || opp == null) return;
    if (isHome) {
      if (our > opp) homeW++;
      else if (our < opp) homeL++;
    } else {
      if (our > opp) awayW++;
      else if (our < opp) awayL++;
    }
    totalPts += our;
    totalAllow += opp;
    gamesCount++;
  });

  recordEl.innerHTML = `
    <li>Home: ${homeW}-${homeL}</li>
    <li>Away: ${awayW}-${awayL}</li>
    <li>Total: ${homeW + awayW}-${homeL + awayL}</li>
  `;

  const avgFor = gamesCount ? totalPts / gamesCount : 0;
  const avgAgainst = gamesCount ? totalAllow / gamesCount : 0;
  const margin = avgFor - avgAgainst;
  const tempoApprox = avgFor + avgAgainst;

  scoringEl.innerHTML = `
    <li>Offensive PPG (approx): ${avgFor.toFixed(1)}</li>
    <li>Defensive PPG (approx): ${avgAgainst.toFixed(1)}</li>
    <li>Average Margin: ${margin >= 0 ? "+" : ""}${margin.toFixed(1)}</li>
    <li>Tempo-ish (combined PPG): ${tempoApprox.toFixed(1)}</li>
  `;

  last5El.innerHTML = "";
  finals.slice(-5).forEach(({ g, dt }) => {
    const isHome = g.HomeTeam === API_CONFIG.teamKey;
    const our = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const opp = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    if (our == null || opp == null) return;
    const res = our > opp ? "W" : our < opp ? "L" : "T";
    const marginGame = our - opp;
    const li = document.createElement("li");
    li.textContent = `${dt ? formatDate(dt) : ""} vs ${getOpponentName(g)}: ${res} ${our}-${opp} (margin ${
      marginGame >= 0 ? "+" : ""
    }${marginGame})`;
    last5El.appendChild(li);
  });
}

// =====================
// TICKETS
// =====================
function renderTickets() {
  const schedule = getSeasonSchedule();
  const grid = document.getElementById("tickets-grid");
  if (!grid) return;

  const now = new Date();
  const homeUpcoming = schedule
    .filter((g) => g.HomeTeam === API_CONFIG.teamKey)
    .map((g) => ({ g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .filter(({ dt }) => dt && dt >= now)
    .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0))
    .slice(0, 6);

  grid.innerHTML = "";
  if (!homeUpcoming.length) {
    grid.innerHTML =
      '<div class="card"><p class="placeholder">No upcoming home games found.</p></div>';
    return;
  }

  homeUpcoming.forEach(({ g, dt }) => {
    const card = document.createElement("div");
    card.className = "ticket-card";
    card.innerHTML = `
      <div class="ticket-head">
        <strong>${getOpponentName(g)}</strong>
      </div>
      <div class="ticket-meta">
        <div>${dt ? dt.toLocaleString() : "Date TBA"}</div>
        <div>Location: Gainesville (Home)</div>
      </div>
      <div class="ticket-price">
        Lowest: <strong>TBD</strong> · Average: <strong>TBD</strong>
      </div>
      <div style="margin-top:6px;">
        <a class="btn btn-primary" href="https://shop.floridagators.com/"
           target="_blank" rel="noopener noreferrer">
          Find Tickets & Gear
        </a>
      </div>
    `;
    grid.appendChild(card);
  });
}

// =====================
// HELPERS
// =====================
function parseSportsDataDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}

function formatPct(v) {
  if (v == null) return "–";
  return (v * 100).toFixed(1) + "%";
}
