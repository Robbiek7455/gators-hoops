/*****************************************************
 *  BASIC CONFIG – EDIT THESE FIRST
 *****************************************************/

// IMPORTANT: Do NOT commit your real key to a public repo.
// For testing, keep the repo private, or move this to a serverless function later.
const SPORTSDATA_API_KEY = "635e15cefe1e475c8fdd13bfe3c8f6ef"; // <- REPLACE with your key string

// SportsDataIO College Basketball base (confirmed by public examples) :contentReference[oaicite:3]{index=3}
const CBB_SCORES_BASE = "https://api.sportsdata.io/v3/cbb/scores/json";
const CBB_STATS_BASE  = "https://api.sportsdata.io/v3/cbb/stats/json";

// Florida Gators key in SportsDataIO CBB (you’ll confirm via Teams endpoint).
// Often this is something like "FLA" or similar. We’ll detect it automatically.
let FLORIDA_TEAM_KEY = null;
let FLORIDA_TEAM_ID = null;

// Default season – SportsDataIO uses a single year (e.g. 2025 for 2025-26) :contentReference[oaicite:4]{index=4}
const DEFAULT_SEASON = 2025;

/*****************************************************
 *  UTILS
 *****************************************************/

function $(selector) {
  return document.querySelector(selector);
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function formatDateTime(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/*****************************************************
 *  NAVIGATION (TABS)
 *****************************************************/

function initTabs() {
  const buttons = document.querySelectorAll(".nav-item");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      // Set active nav
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      // Show the right tab
      document.querySelectorAll(".tab").forEach((section) => {
        section.classList.toggle(
          "active",
          section.id === `tab-${tab}`
        );
      });
    });
  });
}

/*****************************************************
 *  SPORTSDataIO FETCH WRAPPER
 *****************************************************/

async function sportsDataFetch(base, path, params = {}) {
  const url = new URL(`${base}/${path}`);
  // API key is passed as query parameter per SportsDataIO docs :contentReference[oaicite:5]{index=5}
  url.searchParams.set("key", SPORTSDATA_API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error("SportsDataIO error", res.status, res.statusText);
    throw new Error(`SportsDataIO error: ${res.status}`);
  }
  return res.json();
}

/*****************************************************
 *  STEP 1 – FIND FLORIDA TEAM KEY/ID
 *
 * Endpoint pattern confirmed:
 *   GET v3/cbb/scores/json/teams?key=... :contentReference[oaicite:6]{index=6}
 *****************************************************/

async function detectFloridaTeam() {
  const teams = await sportsDataFetch(CBB_SCORES_BASE, "teams");
  // Inspect a couple of entries in the browser console to see structure
  console.log("Sample CBB team row:", teams[0]);

  // TRY to find Florida by known fields.
  let florida = teams.find(
    (t) =>
      t.School === "Florida" ||
      t.Name === "Gators" ||
      t.FullName === "Florida Gators" ||
      t.SchoolName === "Florida" ||
      t.City === "Gainesville"
  );

  // Fallback: manually look for "Florida" in any string property
  if (!florida) {
    florida = teams.find((t) => {
      return Object.values(t).some(
        (v) => typeof v === "string" && v.toLowerCase().includes("florida gators")
      );
    });
  }

  if (!florida) {
    console.warn("Could not auto-detect Florida team; check teams JSON structure.");
    alert(
      "Could not automatically find Florida in the SportsDataIO Teams feed.\n" +
        "Open the browser console, inspect the 'teams' array, and manually identify Florida's Key and TeamID."
    );
    return;
  }

  // These property names are based on SportsDataIO’s Team table pattern across leagues. :contentReference[oaicite:7]{index=7}
  FLORIDA_TEAM_KEY = florida.Key || florida.Team || florida.Abbreviation;
  FLORIDA_TEAM_ID = florida.TeamID;

  console.log("Detected Florida:", florida);
  console.log("FLORIDA_TEAM_KEY =", FLORIDA_TEAM_KEY, "FLORIDA_TEAM_ID =", FLORIDA_TEAM_ID);
}

/*****************************************************
 *  STEP 2 – SCHEDULE + COUNTDOWN
 *
 * Pattern from public examples:
 *   GET v3/cbb/scores/json/TeamSchedule/{season}/{teamKey} :contentReference[oaicite:8]{index=8}
 * Verify this path in your CBB Swagger docs (cbb-v3-scores.json).
 *****************************************************/

let scheduleData = [];
let countdownInterval = null;

async function loadSchedule(season = DEFAULT_SEASON) {
  if (!FLORIDA_TEAM_KEY) return;

  const path = `TeamSchedule/${season}/${FLORIDA_TEAM_KEY}`;
  const games = await sportsDataFetch(CBB_SCORES_BASE, path);
  scheduleData = games;
  console.log("Schedule data sample:", games[0]);
  populateScheduleSeasonSelect(season);
  renderScheduleTable();
  updateNextGameAndCountdown();
  renderTicketsTab();
}

function populateScheduleSeasonSelect(selectedSeason) {
  const seasons = [selectedSeason - 1, selectedSeason, selectedSeason + 1];
  const select = $("#scheduleSeasonSelect");
  if (!select.options.length) {
    seasons.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = `${s}-${String(s + 1).slice(-2)}`;
      if (s === selectedSeason) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      const s = Number(select.value);
      loadSchedule(s).catch(console.error);
    });
  }
}

function renderScheduleTable() {
  const container = $("#scheduleTable");
  container.innerHTML = "";

  const view = $("#scheduleViewSelect").value;
  const now = new Date();

  let filtered = scheduleData.slice();
  filtered.sort(
    (a, b) => new Date(a.DateTime) - new Date(b.DateTime)
  );

  if (view === "upcoming") {
    filtered = filtered.filter((g) => new Date(g.DateTime) > now);
  } else if (view === "completed") {
    filtered = filtered.filter((g) => new Date(g.DateTime) <= now);
  }

  filtered.forEach((game) => {
    const row = createEl("div", "card-row");
    const left = createEl("div", "card-row-left");
    const right = createEl("div");

    const isHome = game.HomeTeam === FLORIDA_TEAM_KEY;
    const opponent = isHome ? game.AwayTeam : game.HomeTeam;
    const opponentName = opponent || "TBD";

    const title = createEl(
      "div",
      "card-row-title",
      `${isHome ? "vs" : "@"} ${opponentName}`
    );
    const meta = createEl(
      "div",
      "card-row-meta",
      `${formatDateTime(game.DateTime)} • ${game.Stadium || ""}`
    );

    left.appendChild(title);
    left.appendChild(meta);

    // Status / result
    const badge = createEl(
      "span",
      "badge " +
        (game.Status === "Final" || game.IsClosed ? "badge-final" : "badge-upcoming"),
      game.Status
    );

    const scoreText =
      game.Status === "Final" || game.IsClosed
        ? `${game.AwayTeam} ${game.AwayTeamScore ?? ""} — ${game.HomeTeam} ${
            game.HomeTeamScore ?? ""
          }`
        : "";

    const scoreDiv = createEl("div", "card-row-meta", scoreText);
    right.appendChild(badge);
    if (scoreText) right.appendChild(scoreDiv);

    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
}

// Find very next future game for countdown
function getNextGame() {
  const now = new Date();
  const futureGames = scheduleData.filter(
    (g) => new Date(g.DateTime) > now
  );
  futureGames.sort(
    (a, b) => new Date(a.DateTime) - new Date(b.DateTime)
  );
  return futureGames[0] || null;
}

function updateNextGameAndCountdown() {
  const nextGame = getNextGame();
  const opponentEl = $("#nextGameOpponent");
  const dateEl = $("#nextGameDate");

  if (!nextGame) {
    opponentEl.textContent = "No upcoming games";
    dateEl.textContent = "";
    clearInterval(countdownInterval);
    return;
  }

  const isHome = nextGame.HomeTeam === FLORIDA_TEAM_KEY;
  const opponent = isHome ? nextGame.AwayTeam : nextGame.HomeTeam;

  opponentEl.textContent = `${isHome ? "vs" : "@"} ${opponent}`;
  dateEl.textContent = formatDateTime(nextGame.DateTime);

  const target = new Date(nextGame.DateTime).getTime();
  clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      clearInterval(countdownInterval);
      $("#countdownDays").textContent = "0";
      $("#countdownHours").textContent = "0";
      $("#countdownMinutes").textContent = "0";
      $("#countdownSeconds").textContent = "0";
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    $("#countdownDays").textContent = days;
    $("#countdownHours").textContent = hours;
    $("#countdownMinutes").textContent = mins;
    $("#countdownSeconds").textContent = secs;
  }, 1000);
}

/*****************************************************
 *  STEP 3 – ROSTER (CURRENT + FORMER)
 *
 * SportsDataIO supports “Players” and roster/team profile feeds. :contentReference[oaicite:9]{index=9}
 * A common pattern is:
 *   GET v3/cbb/scores/json/Players
 *   or PlayersByTeam/{teamId}
 * Check the CBB Swagger docs for exact path names.
 *****************************************************/

let allPlayers = [];

async function loadPlayers() {
  // START SIMPLE: fetch all players, filter to Florida.
  // This endpoint path is inferred from NFL/NBA patterns; verify it in the docs.
  const players = await sportsDataFetch(CBB_SCORES_BASE, "Players");
  allPlayers = players;
  console.log("Sample player row:", players[0]);

  populateRosterSeasonSelect(DEFAULT_SEASON);
  renderRosterTables(DEFAULT_SEASON);
  initFanHubPoll();
}

function populateRosterSeasonSelect(selectedSeason) {
  const select = $("#rosterSeasonSelect");
  if (select.options.length) return;

  const seasons = [selectedSeason - 1, selectedSeason, selectedSeason + 1];
  seasons.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = `${s}-${String(s + 1).slice(-2)}`;
    if (s === selectedSeason) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const s = Number(select.value);
    renderRosterTables(s);
  });

  $("#rosterPositionFilter").addEventListener("change", () => {
    renderRosterTables(Number(select.value));
  });
}

function filterFloridaPlayersForSeason(season) {
  if (!FLORIDA_TEAM_KEY && !FLORIDA_TEAM_ID) return [];

  return allPlayers.filter((p) => {
    const teamMatch =
      p.Team === FLORIDA_TEAM_KEY ||
      p.TeamKey === FLORIDA_TEAM_KEY ||
      p.TeamID === FLORIDA_TEAM_ID;
    // Many feeds include a Season or LastSeason field – inspect your sample row and adjust.
    const seasonMatch =
      p.Season === season ||
      p.LastSeason === season ||
      typeof p.Season === "undefined";

    return teamMatch && seasonMatch;
  });
}

function renderRosterTables(season) {
  const currentBody = $("#currentRosterTable tbody");
  const formerBody = $("#formerPlayersTable tbody");
  currentBody.innerHTML = "";
  formerBody.innerHTML = "";

  const positionFilter = $("#rosterPositionFilter").value;
  const players = filterFloridaPlayersForSeason(season);

  players.forEach((p) => {
    const tr = document.createElement("tr");
    const jersey = p.Jersey || p.Number || "";
    const fullName = [p.FirstName, p.LastName].filter(Boolean).join(" ");
    const pos = p.Position || "";
    const height = p.Height || "";
    const weight = p.Weight || "";
    const classYear = p.Class || p.Experience || "";
    const hometown = p.Hometown || "";

    if (positionFilter !== "all" && pos !== positionFilter) {
      return;
    }

    tr.innerHTML = `
      <td>${jersey}</td>
      <td>${fullName}</td>
      <td>${pos}</td>
      <td>${height}</td>
      <td>${weight}</td>
      <td>${classYear}</td>
      <td>${hometown}</td>
    `;
    currentBody.appendChild(tr);
  });

  // Very simple "former players" list:
  // players who have Florida in history but whose Season is < selectedSeason.
  const former = allPlayers.filter((p) => {
    const hasFlorida =
      p.Team === FLORIDA_TEAM_KEY ||
      p.TeamKey === FLORIDA_TEAM_KEY ||
      p.PastTeams?.includes?.(FLORIDA_TEAM_KEY);
    const lastSeason = p.LastSeason || p.Season;
    return hasFlorida && lastSeason && lastSeason < season;
  });

  former.slice(0, 50).forEach((p) => {
    const tr = document.createElement("tr");
    const fullName = [p.FirstName, p.LastName].filter(Boolean).join(" ");
    const pos = p.Position || "";
    const years = p.CollegeYears || `${p.FirstSeason || "?"}-${p.LastSeason || "?"}`;

    tr.innerHTML = `
      <td>${fullName}</td>
      <td>${years}</td>
      <td>${pos}</td>
    `;
    formerBody.appendChild(tr);
  });
}

/*****************************************************
 *  STEP 4 – STATS TAB
 *
 * SportsDataIO has Player Season Stats feeds:
 *   e.g. PlayerSeasonStats, PlayerSeasonStatsByTeam/{season}/{team}
 *      (pattern from other leagues + CBB data dictionary) :contentReference[oaicite:10]{index=10}
 * Confirm the exact endpoint in your docs!
 *****************************************************/

let seasonStats = [];

async function loadStats(season = DEFAULT_SEASON) {
  if (!FLORIDA_TEAM_KEY) return;

  // Guessing endpoint pattern – verify in SportsDataIO docs.
  // Common pattern: PlayerSeasonStatsByTeam/{season}/{team}
  const path = `PlayerSeasonStatsByTeam/${season}/${FLORIDA_TEAM_KEY}`;

  try {
    const stats = await sportsDataFetch(CBB_STATS_BASE, path);
    seasonStats = stats;
    console.log("Sample season stats row:", stats[0]);
    populateStatsSeasonSelect(season);
    renderStatsTable(season);
    computeAnalyticsFromStats();
  } catch (err) {
    console.warn(
      "Stats endpoint path might be different. Check CBB stats docs for the correct URL.",
      err
    );
  }
}

function populateStatsSeasonSelect(selectedSeason) {
  const select = $("#statsSeasonSelect");
  if (select.options.length) return;

  const seasons = [selectedSeason - 1, selectedSeason, selectedSeason + 1];
  seasons.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = `${s}-${String(s + 1).slice(-2)}`;
    if (s === selectedSeason) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const s = Number(select.value);
    loadStats(s).catch(console.error);
  });
}

function renderStatsTable(season) {
  const tbody = $("#statsTable tbody");
  tbody.innerHTML = "";

  seasonStats.forEach((row) => {
    // Field names are based on SportsDataIO’s typical basketball schema. :contentReference[oaicite:11]{index=11}
    const name = [row.FirstName, row.LastName].filter(Boolean).join(" ");
    const gp = row.Games || row.GamesPlayed || 0;
    const min = row.Minutes || row.MinutesPerGame || 0;
    const pts = row.PointsPerGame ?? (row.Points && gp ? row.Points / gp : 0);
    const reb = row.ReboundsPerGame ?? (row.Rebounds && gp ? row.Rebounds / gp : 0);
    const ast = row.AssistsPerGame ?? (row.Assists && gp ? row.Assists / gp : 0);
    const fgPct = row.FieldGoalsPercentage ?? row.FieldGoalPercentage ?? 0;
    const threePct = row.ThreePointersPercentage ?? row.ThreePointPercentage ?? 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td>${gp}</td>
      <td>${min.toFixed ? min.toFixed(1) : min}</td>
      <td>${pts.toFixed ? pts.toFixed(1) : pts}</td>
      <td>${reb.toFixed ? reb.toFixed(1) : reb}</td>
      <td>${ast.toFixed ? ast.toFixed(1) : ast}</td>
      <td>${fgPct ? (fgPct * 100).toFixed(1) + "%" : "-"}</td>
      <td>${threePct ? (threePct * 100).toFixed(1) + "%" : "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/*****************************************************
 *  STEP 5 – ANALYTICS (TEMPO, RATINGS, SPLITS)
 *
 * For a deeper version, you’d pull box scores and compute advanced stats from
 * team/game tables. The CBB data dict shows BoxScore + TeamGame + PlayerGame. :contentReference[oaicite:12]{index=12}
 * Here we just do a simple approximate version using season stats & schedule.
 *****************************************************/

function computeAnalyticsFromStats() {
  if (!seasonStats.length) return;

  // Basic tempo & ratings using team totals if available; fallback to per-player aggregation.
  // For full accuracy you’d use TeamGame stats across all games.
  const teamRow = seasonStats.find((r) => r.Type === "TeamTotal") || null;

  let totalPoints = 0;
  let totalOppPoints = 0;
  let totalPossessions = 0;
  let games = 0;

  if (teamRow) {
    games = teamRow.Games || teamRow.GamesPlayed || 0;
    totalPoints = teamRow.Points || 0;
    totalOppPoints = teamRow.OpponentPoints || 0;

    // Possessions estimate: FGA + 0.44*FTA - ORB + TO (simplified)
    const fga = teamRow.FieldGoalsAttempted || 0;
    const fta = teamRow.FreeThrowsAttempted || 0;
    const orb = teamRow.OffensiveRebounds || 0;
    const to = teamRow.Turnovers || 0;
    totalPossessions = fga + 0.44 * fta - orb + to;
  } else {
    // Very rough fallback: sum players
    seasonStats.forEach((p) => {
      games = Math.max(games, p.Games || p.GamesPlayed || 0);
      totalPoints += p.Points || 0;
    });
    totalPossessions = games * 70; // assume 70 poss/game if we don’t have the fields
  }

  if (!games || !totalPossessions) return;

  const tempoPer40 = (totalPossessions / games) * (40 / 40); // already per game
  const offRtg = (totalPoints / totalPossessions) * 100;
  const defRtg = (totalOppPoints / totalPossessions) * 100 || null;

  $("#tempoMetric").textContent = tempoPer40.toFixed(1);
  $("#offRtgMetric").textContent = offRtg.toFixed(1);
  $("#defRtgMetric").textContent = defRtg ? defRtg.toFixed(1) : "--";

  // Simple home/away from schedule
  const now = new Date();
  const completedGames = scheduleData.filter(
    (g) => new Date(g.DateTime) <= now && (g.Status === "Final" || g.IsClosed)
  );

  let homeGames = 0,
    awayGames = 0,
    homeWins = 0,
    awayWins = 0,
    homePts = 0,
    awayPts = 0;

  completedGames.forEach((g) => {
    const isHome = g.HomeTeam === FLORIDA_TEAM_KEY;
    const floridaScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    if (typeof floridaScore !== "number" || typeof oppScore !== "number") return;

    if (isHome) {
      homeGames++;
      homePts += floridaScore;
      if (floridaScore > oppScore) homeWins++;
    } else {
      awayGames++;
      awayPts += floridaScore;
      if (floridaScore > oppScore) awayWins++;
    }
  });

  const homePPG = homeGames ? homePts / homeGames : 0;
  const awayPPG = awayGames ? awayPts / awayGames : 0;

  $("#homeAwayMetric").textContent = `Home: ${homeWins}-${homeGames - homeWins} (${homePPG.toFixed(
    1
  )} PPG) • Away: ${awayWins}-${awayGames - awayWins} (${awayPPG.toFixed(1)} PPG)`;

  // Game summaries
  const summariesContainer = $("#gameSummaries");
  summariesContainer.innerHTML = "";
  const last10 = completedGames
    .slice()
    .sort((a, b) => new Date(b.DateTime) - new Date(a.DateTime))
    .slice(0, 10);

  last10.forEach((g) => {
    const isHome = g.HomeTeam === FLORIDA_TEAM_KEY;
    const floridaScore = isHome ? g.HomeTeamScore : g.AwayTeamScore;
    const oppScore = isHome ? g.AwayTeamScore : g.HomeTeamScore;
    const opp = isHome ? g.AwayTeam : g.HomeTeam;

    const margin = floridaScore - oppScore;
    const resultText = margin > 0 ? `W ${floridaScore}-${oppScore}` : `L ${floridaScore}-${oppScore}`;

    const row = createEl("div", "card-row");
    const left = createEl("div", "card-row-left");
    left.appendChild(
      createEl(
        "div",
        "card-row-title",
        `${formatDate(g.DateTime)} • ${isHome ? "vs" : "@"} ${opp}`
      )
    );
    left.appendChild(createEl("div", "card-row-meta", resultText));

    row.appendChild(left);
    summariesContainer.appendChild(row);
  });
}

/*****************************************************
 *  STEP 6 – TICKETS TAB
 *
 * SportsDataIO focuses on odds and stats; ticket prices usually come from
 * separate APIs (VividSeats, SeatGeek, Ticketmaster, etc.). :contentReference[oaicite:13]{index=13}
 * Here we:
 *   – Show each upcoming game
 *   – Provide a button to the official UF tickets site / ESPN tickets
 *   – Placeholder for “Lowest” and “Avg” price (you can manually fill or later
 *     integrate a ticket API).
 *****************************************************/

function renderTicketsTab() {
  const container = $("#ticketsList");
  container.innerHTML = "";

  const now = new Date();
  const upcoming = scheduleData
    .filter((g) => new Date(g.DateTime) > now)
    .sort((a, b) => new Date(a.DateTime) - new Date(b.DateTime));

  if (!upcoming.length) {
    const msg = createEl("p", "small-text", "No upcoming games found.");
    container.appendChild(msg);
    return;
  }

  upcoming.forEach((g) => {
    const row = createEl("div", "card-row");
    const left = createEl("div", "card-row-left");
    const isHome = g.HomeTeam === FLORIDA_TEAM_KEY;
    const opponent = isHome ? g.AwayTeam : g.HomeTeam;

    left.appendChild(
      createEl(
        "div",
        "card-row-title",
        `${formatDateTime(g.DateTime)} • ${isHome ? "vs" : "@"} ${opponent}`
      )
    );
    left.appendChild(
      createEl(
        "div",
        "card-row-meta",
        g.Stadium ? g.Stadium : isHome ? "Home – O'Connell Center" : "Away"
      )
    );

    const right = createEl("div");
    const prices = createEl(
      "div",
      "card-row-meta",
      "Lowest: $— • Avg: $— (connect a ticket API later)"
    );

    // Link to official Gators tickets landing page :contentReference[oaicite:14]{index=14}
    const link = document.createElement("a");
    link.href = "https://floridagators.com/sports/mens-basketball?path=basketball-men";
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "btn-secondary";
    link.textContent = "Tickets";

    right.appendChild(prices);
    right.appendChild(link);

    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
}

/*****************************************************
 *  STEP 7 – FAN HUB: POLL + LOCAL NOTES
 *****************************************************/

function initFanHubPoll() {
  const pollContainer = $("#pollOptions");
  const pollResults = $("#pollResults");

  if (!allPlayers.length || !FLORIDA_TEAM_KEY) return;

  const currentSeasonPlayers = filterFloridaPlayersForSeason(DEFAULT_SEASON);

  pollContainer.innerHTML = "";
  currentSeasonPlayers.slice(0, 8).forEach((p, idx) => {
    const fullName = [p.FirstName, p.LastName].filter(Boolean).join(" ");
    const id = `poll-player-${idx}`;
    const wrapper = createEl("div");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "mvpPoll";
    input.id = id;
    input.value = fullName;

    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.textContent = fullName;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    pollContainer.appendChild(wrapper);
  });

  const stored = localStorage.getItem("gators_mvp_vote");
  if (stored) {
    pollResults.textContent = `You voted for: ${stored}`;
  }

  $("#pollForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const selected = document.querySelector('input[name="mvpPoll"]:checked');
    if (!selected) return;
    localStorage.setItem("gators_mvp_vote", selected.value);
    pollResults.textContent = `You voted for: ${selected.value}`;
  });

  // Fan notes
  const notesKey = "gators_fan_notes";
  const notesInput = $("#fanNotesInput");
  const notesSaved = $("#fanNotesSaved");
  const saved = localStorage.getItem(notesKey);
  if (saved) {
    notesInput.value = saved;
    notesSaved.textContent = "Notes loaded from this browser.";
  }

  $("#saveFanNotesBtn").addEventListener("click", () => {
    localStorage.setItem(notesKey, notesInput.value);
    notesSaved.textContent = "Notes saved locally in this browser.";
  });
}

/*****************************************************
 *  INITIALIZATION
 *****************************************************/

async function init() {
  initTabs();

  try {
    await detectFloridaTeam();        // Finds FLORIDA_TEAM_KEY + FLORIDA_TEAM_ID
    await loadSchedule(DEFAULT_SEASON);
    await loadPlayers();
    await loadStats(DEFAULT_SEASON);
  } catch (err) {
    console.error(err);
    alert(
      "Something went wrong loading SportsDataIO data. " +
        "Open DevTools (F12), check the Console tab, and see the error message."
    );
  }
}

document.addEventListener("DOMContentLoaded", init);
