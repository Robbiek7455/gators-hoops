// =======================
// CONFIG
// =======================
const API_CONFIG = {
  apiKey: "635e15cefe1e475c8fdd13bfe3c8f6ef", // <-- put your SportsDataIO key here LOCALLY
  season: 2025,                         // main season year (the year where most games happen)
  seasonOptions: [2025, 2024, 2023,2022],    // add/remove as needed
  teamKey: "FLA",                       // Florida Gators key - verify via Teams endpoint
  baseUrlScores: "https://api.sportsdata.io/v3/cbb/scores/json",
  baseUrlStats: "https://api.sportsdata.io/v3/cbb/stats/json"
  // Endpoints used (to verify in your SportsDataIO portal):
  // - GET /v3/cbb/scores/json/TeamSchedule/{season}/{team}
  // - GET /v3/cbb/stats/json/PlayerSeasonStatsByTeam/{season}/{team}
};

// Global state (kept simple)
const state = {
  scheduleBySeason: {},
  statsBySeason: {},
  currentSeason: API_CONFIG.season,
  countdownInterval: null
};

// =======================
// INITIALIZATION
// =======================

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupSeasonDropdowns();
  setupPoll();
  setupFilters();
  loadSeasonData(API_CONFIG.season); // initial load
});

// =======================
// TABS
// =======================
function setupTabs() {
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

// =======================
// DROPDOWNS
// =======================
function setupSeasonDropdowns() {
  const ids = [
    "schedule-season-select",
    "roster-season-select",
    "stats-season-select",
    "analytics-season-select"
  ];
  ids.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    API_CONFIG.seasonOptions.forEach((yr) => {
      const opt = document.createElement("option");
      opt.value = yr;
      opt.textContent = yr;
      if (yr === API_CONFIG.season) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      const season = parseInt(select.value, 10);
      state.currentSeason = season;
      loadSeasonData(season);
    });
  });
}

// =======================
// FILTER INPUTS
// =======================
function setupFilters() {
  const upcomingCheckbox = document.getElementById("schedule-upcoming-only");
  if (upcomingCheckbox) {
    upcomingCheckbox.addEventListener("change", () => {
      renderScheduleTable();
    });
  }

  const rosterSearch = document.getElementById("roster-search");
  const rosterPos = document.getElementById("roster-position-filter");
  [rosterSearch, rosterPos].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      renderRoster();
    });
    el.addEventListener("change", () => {
      renderRoster();
    });
  });
}

// =======================
// POLL (Fan Hub)
// =======================
function setupPoll() {
  const form = document.getElementById("fan-poll");
  const resultsDiv = document.getElementById("poll-results");
  if (!form || !resultsDiv) return;

  const STORAGE_KEY = "gators_poll_scoring_leader";

  function loadResults() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { guard: 0, wing: 0, big: 0 };
  }

  function saveResults(results) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
  }

  function renderResults() {
    const results = loadResults();
    const total = results.guard + results.wing + results.big;
    if (!total) {
      resultsDiv.textContent = "No votes yet. Be the first!";
      return;
    }
    const pct = (v) => Math.round((v / total) * 100);
    resultsDiv.innerHTML = `
      <p><strong>Results:</strong></p>
      <ul>
        <li>Lead Guard: ${results.guard} (${pct(results.guard)}%)</li>
        <li>Wing Scorer: ${results.wing} (${pct(results.wing)}%)</li>
        <li>Big Man: ${results.big} (${pct(results.big)}%)</li>
      </ul>
      <p style="font-size:0.78rem;color:#6b7280;">Votes are stored locally on this device.</p>
    `;
  }

  renderResults();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const choice = form.querySelector("input[name='poll-choice']:checked");
    if (!choice) {
      alert("Please select an option before voting.");
      return;
    }
    const results = loadResults();
    results[choice.value] = (results[choice.value] || 0) + 1;
    saveResults(results);
    renderResults();
  });
}

// =======================
// DATA LOADING
// =======================
async function loadSeasonData(season) {
  const loading = document.getElementById("global-loading");
  const errorDiv = document.getElementById("global-error");
  if (loading) loading.classList.remove("hidden");
  if (errorDiv) errorDiv.classList.add("hidden");

  try {
    const schedulePromise =
      state.scheduleBySeason[season]
        ? Promise.resolve(state.scheduleBySeason[season])
        : fetchJson(`${API_CONFIG.baseUrlScores}/TeamSchedule/${season}/${API_CONFIG.teamKey}`);

    const statsPromise =
      state.statsBySeason[season]
        ? Promise.resolve(state.statsBySeason[season])
        : fetchJson(
            `${API_CONFIG.baseUrlStats}/PlayerSeasonStatsByTeam/${season}/${API_CONFIG.teamKey}`
          );

    const [schedule, stats] = await Promise.all([schedulePromise, statsPromise]);

    state.scheduleBySeason[season] = Array.isArray(schedule) ? schedule : [];
    state.statsBySeason[season] = Array.isArray(stats) ? stats : [];

    // Render everything
    renderScheduleTable();
    renderNextGameAndQuickGlance();
    renderRoster();
    renderStats();
    renderAnalytics();
    renderTicketsSection();
  } catch (err) {
    console.error("Error loading season data:", err);
    if (errorDiv) {
      errorDiv.textContent =
        "Error loading data from SportsDataIO. Open the console for details and check your endpoints/key.";
      errorDiv.classList.remove("hidden");
    }
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

// Generic fetch helper using API key in header
async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": API_CONFIG.apiKey
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

// =======================
// SCHEDULE + HERO
// =======================
function renderScheduleTable() {
  const season = state.currentSeason;
  const tbody = document.getElementById("schedule-table-body");
  if (!tbody) return;

  const schedule = state.scheduleBySeason[season] || [];
  const upcomingOnly = document.getElementById("schedule-upcoming-only")?.checked;

  tbody.innerHTML = "";

  const now = new Date();
  const rows = schedule
    .filter((game) => {
      if (!upcomingOnly) return true;
      const dt = parseSportsDataDate(game.Day || game.DateTime);
      return dt && dt >= now;
    })
    .sort((a, b) => {
      const da = parseSportsDataDate(a.Day || a.DateTime);
      const db = parseSportsDataDate(b.Day || b.DateTime);
      return (da?.getTime() || 0) - (db?.getTime() || 0);
    });

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "placeholder";
    td.textContent = "No games found for this season.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((game) => {
    const tr = document.createElement("tr");
    const date = parseSportsDataDate(game.Day || game.DateTime);
    const opponentName = getOpponentName(game);
    const location = game.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away";

    const resultString = buildResultString(game);
    const recordString = game.HomeTeam === API_CONFIG.teamKey
      ? `${game.HomeTeamWins || ""}-${game.HomeTeamLosses || ""}`
      : `${game.AwayTeamWins || ""}-${game.AwayTeamLosses || ""}`;

    tr.innerHTML = `
      <td>${date ? formatDate(date) : "-"}</td>
      <td>${opponentName}</td>
      <td>${location}</td>
      <td>${resultString}</td>
      <td>${recordString}</td>
    `;
    tr.addEventListener("click", () => showGameDetail(game));
    tbody.appendChild(tr);
  });
}

function getOpponentName(game) {
  const ourKey = API_CONFIG.teamKey;
  const isHome = game.HomeTeam === ourKey;
  const oppKey = isHome ? game.AwayTeam : game.HomeTeam;
  // Many schedules include AwayTeam / HomeTeam plus detail fields like AwayTeamName, etc.
  const name =
    (isHome ? game.AwayTeamName : game.HomeTeamName) ||
    oppKey ||
    "Opponent TBA";
  return name;
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
  const box = document.getElementById("game-detail");
  const content = document.getElementById("game-detail-content");
  if (!box || !content) return;

  const date = parseSportsDataDate(game.Day || game.DateTime);
  const opponentName = getOpponentName(game);
  const location = game.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away";
  const result = buildResultString(game);

  content.innerHTML = `
    <p><strong>${opponentName}</strong> (${location})</p>
    <p>Date/Time: ${date ? date.toLocaleString() : "TBA"}</p>
    <p>Status/Result: ${result}</p>
    <p>Attendance: ${game.Attendance ?? "N/A"}</p>
    <p>TV: ${game.Channel || "TBA"}</p>
  `;
  box.classList.remove("hidden");
}

// Hero / Quick glance / Countdown
function renderNextGameAndQuickGlance() {
  const season = state.currentSeason;
  const schedule = state.scheduleBySeason[season] || [];
  const nextGame = findNextGame(schedule);
  const opponentEl = document.getElementById("next-game-opponent");
  const metaEl = document.getElementById("next-game-meta");

  if (!opponentEl || !metaEl) return;

  if (!nextGame) {
    opponentEl.textContent = "No upcoming games.";
    metaEl.textContent = "";
    clearCountdown();
  } else {
    const date = parseSportsDataDate(nextGame.Day || nextGame.DateTime);
    opponentEl.textContent = getOpponentName(nextGame);
    metaEl.textContent = date
      ? `${date.toLocaleString()} • ${
          nextGame.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away"
        }`
      : `${nextGame.HomeTeam === API_CONFIG.teamKey ? "Home" : "Away"}`;

    startCountdown(date);
  }

  // Quick glance from stats/schedule
  renderQuickGlance(schedule);
}

function findNextGame(schedule) {
  const now = new Date();
  const upcoming = schedule
    .map((g) => ({ game: g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .filter((x) => x.dt && x.dt >= now)
    .sort((a, b) => a.dt - b.dt);
  return upcoming.length ? upcoming[0].game : null;
}

function startCountdown(targetDate) {
  const timerEl = document.getElementById("countdown-timer");
  clearCountdown();
  if (!timerEl || !targetDate) return;

  function update() {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) {
      timerEl.textContent = "00:00:00:00";
      clearCountdown();
      return;
    }
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff / (60 * 60 * 1000)) % 24);
    const mins = Math.floor((diff / (60 * 1000)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    timerEl.textContent = `${pad2(days)}d ${pad2(hours)}h ${pad2(mins)}m ${pad2(secs)}s`;
  }

  update();
  state.countdownInterval = setInterval(update, 1000);
}

function clearCountdown() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

function renderQuickGlance(schedule) {
  const stats = state.statsBySeason[state.currentSeason] || [];
  const recordEl = document.getElementById("quick-record");
  const ppgEl = document.getElementById("quick-ppg");
  const rpgEl = document.getElementById("quick-rpg");
  const last5El = document.getElementById("quick-last5");

  // Record from schedule
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
  if (recordEl) {
    recordEl.textContent = wins + losses > 0 ? `${wins}-${losses}` : "–";
  }

  // PPG/RPG from players
  let totalPoints = 0;
  let totalReb = 0;
  let totalGames = 0;
  stats.forEach((p) => {
    const games = p.Games || p.GamesPlayed || 0;
    totalPoints += p.Points || 0;
    totalReb += p.Rebounds || 0;
    totalGames = Math.max(totalGames, games);
  });
  if (ppgEl) {
    const teamPPG = totalGames ? (totalPoints / totalGames).toFixed(1) : "–";
    ppgEl.textContent = teamPPG;
  }
  if (rpgEl) {
    const teamRPG = totalGames ? (totalReb / totalGames).toFixed(1) : "–";
    rpgEl.textContent = teamRPG;
  }

  // Last 5 W/L
  const finals = schedule
    .filter((g) => g.Status === "Final")
    .map((g) => {
      const isHome = g.HomeTeam === API_CONFIG.teamKey;
      const ourScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
      const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
      if (ourScore == null || oppScore == null) return null;
      return ourScore > oppScore ? "W" : ourScore < oppScore ? "L" : "T";
    })
    .filter(Boolean)
    .slice(-5);

  if (last5El) {
    last5El.textContent = finals.length ? finals.join(" ") : "–";
  }
}

// =======================
// ROSTER
// =======================
function renderRoster() {
  const season = state.currentSeason;
  const stats = state.statsBySeason[season] || [];
  const currentContainer = document.getElementById("roster-current");
  const formerContainer = document.getElementById("roster-former");
  if (!currentContainer || !formerContainer) return;

  const searchValue = (document.getElementById("roster-search")?.value || "")
    .trim()
    .toLowerCase();
  const posFilter = document.getElementById("roster-position-filter")?.value || "all";

  // Current season players from stats
  const players = dedupePlayers(stats);

  const filtered = players.filter((p) => {
    if (searchValue && !p.Name.toLowerCase().includes(searchValue)) return false;
    if (posFilter !== "all" && p.Position && p.Position !== posFilter) return false;
    return true;
  });

  currentContainer.innerHTML = "";
  if (!filtered.length) {
    currentContainer.innerHTML =
      '<p class="placeholder">No players match your filters yet.</p>';
  } else {
    filtered.forEach((p) => {
      const card = document.createElement("div");
      card.className = "roster-card";
      card.innerHTML = `
        <h4>${p.Jersey ? "#" + p.Jersey + " " : ""}${p.Name}</h4>
        <div class="roster-meta">
          <div>${p.Position || "Pos TBA"} • ${p.Class || ""}</div>
          <div>${p.Height || ""} ${p.Weight ? "• " + p.Weight + " lbs" : ""}</div>
        </div>
      `;
      currentContainer.appendChild(card);
    });
  }

  // Former players: union of all selected past seasons – for now just use other seasons
  const former = new Map();
  API_CONFIG.seasonOptions.forEach((yr) => {
    if (yr === season) return;
    const s = state.statsBySeason[yr] || [];
    dedupePlayers(s).forEach((p) => {
      const key = p.PlayerID || p.Name;
      if (!former.has(key)) former.set(key, { ...p, season: yr });
    });
  });

  formerContainer.innerHTML = "";
  if (!former.size) {
    formerContainer.innerHTML =
      '<p class="placeholder">Load a previous season to populate former players.</p>';
  } else {
    Array.from(former.values())
      .sort((a, b) => a.season - b.season)
      .forEach((p) => {
        const card = document.createElement("div");
        card.className = "roster-card";
        card.innerHTML = `
          <h4>${p.Name}</h4>
          <div class="roster-meta">
            <div>Season: ${p.season}</div>
            <div>${p.Position || "Pos TBA"}${p.Jersey ? " • #" + p.Jersey : ""}</div>
          </div>
        `;
        formerContainer.appendChild(card);
      });
  }
}

function dedupePlayers(statsArr) {
  const map = new Map();
  statsArr.forEach((p) => {
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

// =======================
// STATS
// =======================
function renderStats() {
  const season = state.currentSeason;
  const stats = state.statsBySeason[season] || [];
  const tbody = document.getElementById("stats-table-body");
  const leadersDiv = document.getElementById("stats-leaders");
  const propsList = document.getElementById("props-ideas");
  if (!tbody || !leadersDiv || !propsList) return;

  tbody.innerHTML = "";

  if (!stats.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "placeholder";
    td.textContent =
      "No stats yet. Check your Stats endpoint and make sure the season is correct.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    leadersDiv.textContent = "";
    propsList.innerHTML = "";
    return;
  }

  const rows = stats.slice().sort((a, b) => {
    const apgA = (a.Points || 0) / (a.Games || a.GamesPlayed || 1);
    const apgB = (b.Points || 0) / (b.Games || b.GamesPlayed || 1);
    return apgB - apgA;
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

  // Leaders
  const leaderBy = (getVal) =>
    rows.reduce(
      (best, p) => {
        const games = p.Games || p.GamesPlayed || 0;
        if (!games) return best;
        const val = getVal(p, games);
        return val > best.value ? { player: p, value: val } : best;
      },
      { player: null, value: -Infinity }
    );

  const ptsLeader = leaderBy((p, g) => (p.Points || 0) / g);
  const rebLeader = leaderBy((p, g) => (p.Rebounds || 0) / g);
  const astLeader = leaderBy((p, g) => (p.Assists || 0) / g);

  leadersDiv.innerHTML = "";
  [ ["PPG", ptsLeader], ["RPG", rebLeader], ["APG", astLeader] ].forEach(
    ([label, obj]) => {
      if (!obj.player) return;
      const el = document.createElement("div");
      el.className = "leader";
      el.innerHTML = `
        <span>${label}: ${obj.player.Name}</span>
        <strong>${obj.value.toFixed(1)}</strong>
      `;
      leadersDiv.appendChild(el);
    }
  );

  // Simple props ideas (for fun, not gambling)
  propsList.innerHTML = "";
  rows.slice(0, 5).forEach((p) => {
    const games = p.Games || p.GamesPlayed || 0;
    if (!games) return;
    const ppg = (p.Points || 0) / games;
    const propLine = Math.round(ppg - 0.5);
    const li = document.createElement("li");
    li.textContent = `${p.Name}: Over/Under ${propLine}.5 points`;
    propsList.appendChild(li);
  });
}

// =======================
// ANALYTICS
// =======================
function renderAnalytics() {
  const season = state.currentSeason;
  const schedule = state.scheduleBySeason[season] || [];

  const recordList = document.getElementById("analytics-record-split");
  const scoringList = document.getElementById("analytics-scoring");
  const last5List = document.getElementById("analytics-last5");
  if (!recordList || !scoringList || !last5List) return;

  const finals = schedule.filter((g) => g.Status === "Final");

  // Record splits
  let homeW = 0, homeL = 0, awayW = 0, awayL = 0;
  let totalPts = 0, totalAllowed = 0, totalGames = 0;
  const gamesSorted = finals
    .map((g) => ({ g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0));

  gamesSorted.forEach(({ g }) => {
    const isHome = g.HomeTeam === API_CONFIG.teamKey;
    const ourScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    if (ourScore == null || oppScore == null) return;
    if (isHome) {
      if (ourScore > oppScore) homeW++;
      else if (ourScore < oppScore) homeL++;
    } else {
      if (ourScore > oppScore) awayW++;
      else if (ourScore < oppScore) awayL++;
    }
    totalPts += ourScore;
    totalAllowed += oppScore;
    totalGames++;
  });

  recordList.innerHTML = `
    <li>Home: ${homeW}-${homeL}</li>
    <li>Away: ${awayW}-${awayL}</li>
    <li>Total: ${homeW + awayW}-${homeL + awayL}</li>
  `;

  const avgFor = totalGames ? totalPts / totalGames : 0;
  const avgAgainst = totalGames ? totalAllowed / totalGames : 0;
  const margin = avgFor - avgAgainst;

  scoringList.innerHTML = `
    <li>Offensive PPG (approx): ${avgFor.toFixed(1)}</li>
    <li>Defensive PPG (approx): ${avgAgainst.toFixed(1)}</li>
    <li>Average Margin: ${margin >= 0 ? "+" : ""}${margin.toFixed(1)}</li>
  `;

  // Last 5
  last5List.innerHTML = "";
  gamesSorted.slice(-5).forEach(({ g }) => {
    const dt = parseSportsDataDate(g.Day || g.DateTime);
    const isHome = g.HomeTeam === API_CONFIG.teamKey;
    const ourScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    if (ourScore == null || oppScore == null) return;
    const result = ourScore > oppScore ? "W" : ourScore < oppScore ? "L" : "T";
    const marginGame = ourScore - oppScore;
    const li = document.createElement("li");
    li.textContent = `${dt ? formatDate(dt) : ""} vs ${getOpponentName(g)}: ${result} ${
      ourScore
    }-${oppScore} (margin ${marginGame >= 0 ? "+" : ""}${marginGame})`;
    last5List.appendChild(li);
  });
}

// =======================
// TICKETS (static price placeholders)
// =======================
function renderTicketsSection() {
  const season = state.currentSeason;
  const schedule = state.scheduleBySeason[season] || [];
  const grid = document.getElementById("tickets-grid");
  if (!grid) return;

  const homeUpcoming = schedule
    .filter((g) => g.HomeTeam === API_CONFIG.teamKey)
    .map((g) => ({ g, dt: parseSportsDataDate(g.Day || g.DateTime) }))
    .filter((x) => x.dt && x.dt >= new Date())
    .sort((a, b) => a.dt - b.dt)
    .slice(0, 6);

  grid.innerHTML = "";

  if (!homeUpcoming.length) {
    grid.innerHTML = '<p class="placeholder">No upcoming home games.</p>';
    return;
  }

  homeUpcoming.forEach(({ g, dt }) => {
    const card = document.createElement("div");
    card.className = "ticket-card";
    const opp = getOpponentName(g);
    card.innerHTML = `
      <h4>${opp}</h4>
      <div class="ticket-meta">
        <div>${dt ? dt.toLocaleString() : "Date TBA"}</div>
        <div>Location: Home (Gainesville)</div>
      </div>
      <div class="ticket-pricing">
        <div>Lowest: <strong>TBD</strong></div>
        <div>Average: <strong>TBD</strong></div>
      </div>
      <a class="btn primary" href="https://shop.floridagators.com/" target="_blank" rel="noopener noreferrer">
        Find Tickets & Gear
      </a>
    `;
    grid.appendChild(card);
  });
}

// =======================
// HELPERS
// =======================
function parseSportsDataDate(value) {
  if (!value) return null;
  // SportsDataIO uses ISO strings or "YYYY-MM-DDT..." formats.
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

function formatPct(value) {
  if (value == null) return "–";
  return (value * 100).toFixed(1) + "%";
}
