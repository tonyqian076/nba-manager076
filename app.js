const CAP_START = 154.6;
const CAP_GROWTH = 0.06;
const HARD_CAP_MULT = 1.33;
const INVESTMENT_MULT = 1.12;
const SAVE_KEY = "eightTeamNbaManager.v8";
const CLIENT_ID_KEY = "eightTeamNbaManager.clientId";
const AI_TRADE_SCAN_GAMES = 3;
const TEAM_GAME_WINDOWS = [3, 6, 9];
const MIN_SALARY_PCT = 1;
const MAX_SALARY_PCT = 35;
const SUPERMAX_SALARY_PCT = 40;

const playerPool = window.PLAYER_POOL;
const ageByName = playerPool.ageByName;
const teamSeeds = playerPool.teams;
const playerSeeds = playerPool.rosters;
const draftPlayerPool = playerPool.draftProspects;
const $ = (id) => document.getElementById(id);
const fmt = (n) => `$${n.toFixed(1)}M`;
const pct = (n) => `${Math.round(n)}%`;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clientId = getClientId();
const localTeamKey = (roomKey) => `eightTeamNbaManager.localTeam.${roomKey}`;

let state = migrateState(loadState() || createNewState());
let multiplayerSession = {
  connected: false,
  roomKey: "",
  localTeamId: null,
  version: 0,
  pulling: false,
  pushing: false,
  pollTimer: null,
  lastJson: ""
};

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function createNewState() {
  const teams = teamSeeds.map((team) => ({
    ...team,
    wins: 0,
    losses: 0,
    pf: 0,
    pa: 0,
    cash: 14,
    pickOwner: team.id,
    futurePicks: {},
    deadCap: [],
    players: playerSeeds[team.id].map((seed, index) => makePlayer(seed, team.id, index))
  }));
  const base = {
    season: 1,
    phase: "regular",
    cap: CAP_START,
    schedule: buildSchedule(teams),
    gameIndex: 0,
    tradeWindow: true,
    logs: [],
    playoffLog: [],
    playoffBracket: [],
    aiLog: [],
    news: [],
    yourNews: [],
    mailbox: [],
    trash: [],
    tradeHistory: [],
    freeAgents: [],
    contractOffer: null,
    usedDraftNames: [],
    awards: [],
    scoutTeamId: teams[1].id,
    champions: [],
    draft: null,
    aiMode: true,
    setupMode: null,
    multiplayer: { enabled: false, roomKey: "", claims: {} },
    userTeamId: null,
    pendingTeamId: teams[0].id,
    teamLocked: false,
    setupComplete: false,
    teams
  };
  teams.forEach((team) => normalizeRotation(team));
  return base;
}

function makePlayer(seed, teamId, index) {
  const [name, pos, insideO, outsideO, insideD, outsideD, leadership, clutch, health, salaryPct] = seed;
  const contract = index < 2 ? 3 : index < 5 ? 2 : 1;
  return {
    id: `${teamId}-${index}-${Math.random().toString(16).slice(2)}`,
    name,
    pos,
    insideO,
    outsideO,
    insideD,
    outsideD,
    leadership,
    clutch,
    health,
    maxHealth: health,
    exp: rand(1.02, 1.1),
    form: rand(0.94, 1.06),
    salaryPct,
    contract,
    birdTeam: teamId,
    injury: 0,
    minutes: index < 5 ? 32 : 14,
    starter: index < 5,
    tradeStatus: "normal",
    age: ageByName[name] || clamp(22 + index + Math.floor(rand(0, 8)), 20, 37),
    allLeagueUntil: 0,
    stats: emptyStats()
  };
}

function emptyStats() {
  return { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };
}

function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  pushMultiplayerState();
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

function selectGameMode(mode) {
  if (state.setupComplete) return;
  state.setupMode = mode;
  if (mode === "single") {
    state.multiplayer = { enabled: false, roomKey: "", claims: {} };
    multiplayerSession.connected = false;
    multiplayerSession.roomKey = "";
    multiplayerSession.localTeamId = null;
    stopMultiplayerPolling();
  } else {
    state.multiplayer = { enabled: true, roomKey: state.multiplayer?.roomKey || "", claims: state.multiplayer?.claims || {} };
  }
  saveState();
  render();
}

async function joinMultiplayerRoom() {
  const input = $("roomKeyInput");
  const roomKey = sanitizeRoomKey(input.value);
  if (!roomKey) {
    setRoomStatus("Type a room key first.");
    return;
  }
  if (location.protocol === "file:") {
    setRoomStatus("Multiplayer needs the Node server. Run npm start, then open the server URL on each laptop.");
    return;
  }
  setRoomStatus("Connecting...");
  try {
    const room = await roomRequest("GET", `/api/rooms/${roomKey}`);
    multiplayerSession.connected = true;
    multiplayerSession.roomKey = roomKey;
    multiplayerSession.version = room.version || 0;
    multiplayerSession.lastJson = "";
    const localSavedTeam = localStorage.getItem(localTeamKey(roomKey));
    if (room.state) {
      multiplayerSession.pulling = true;
      state = migrateState(room.state);
      state.setupMode = "multiplayer";
      state.multiplayer = state.multiplayer || { enabled: true, roomKey, claims: {} };
      state.multiplayer.enabled = true;
      state.multiplayer.roomKey = roomKey;
      state.multiplayer.claims = room.claims || state.multiplayer.claims || {};
      multiplayerSession.localTeamId = state.multiplayer.claims?.[localSavedTeam] === clientId ? localSavedTeam : null;
    } else {
      state = createNewState();
      state.setupMode = "multiplayer";
      state.multiplayer = { enabled: true, roomKey, claims: {} };
      multiplayerSession.localTeamId = null;
      await pushMultiplayerState(true);
    }
    startMultiplayerPolling();
    setRoomStatus(`Connected to room ${roomKey}. Choose an open team.`);
    render();
    multiplayerSession.pulling = false;
  } catch (error) {
    multiplayerSession.pulling = false;
    multiplayerSession.connected = false;
    setRoomStatus(`Could not join room. Make sure the server is running. ${error.message || ""}`);
  }
}

async function claimMultiplayerTeam(teamId) {
  if (!multiplayerSession.connected || !multiplayerSession.roomKey) {
    setRoomStatus("Join a multiplayer room before claiming a team.");
    return false;
  }
  try {
    const room = await roomRequest("POST", `/api/rooms/${multiplayerSession.roomKey}/claim`, { teamId, clientId });
    state.multiplayer.claims = room.claims || state.multiplayer.claims || {};
    multiplayerSession.version = room.version || multiplayerSession.version;
    setRoomStatus(`You claimed ${teamById(teamId).name}.`);
    return true;
  } catch (error) {
    setRoomStatus(error.message || "That team is already claimed.");
    await pullMultiplayerState();
    return false;
  }
}

function sanitizeRoomKey(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 18);
}

function setRoomStatus(message) {
  const box = $("roomStatus");
  if (box) box.textContent = message;
}

async function roomRequest(method, path, body = null) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Room request failed (${response.status})`);
  return data;
}

function startMultiplayerPolling() {
  stopMultiplayerPolling();
  multiplayerSession.pollTimer = setInterval(pullMultiplayerState, 1500);
}

function stopMultiplayerPolling() {
  if (multiplayerSession.pollTimer) clearInterval(multiplayerSession.pollTimer);
  multiplayerSession.pollTimer = null;
}

async function pullMultiplayerState() {
  if (!multiplayerSession.connected || !multiplayerSession.roomKey || multiplayerSession.pushing) return;
  try {
    const room = await roomRequest("GET", `/api/rooms/${multiplayerSession.roomKey}`);
    if (!room.state) return;
    if ((room.version || 0) <= multiplayerSession.version) return;
    const localTeam = multiplayerSession.localTeamId;
    multiplayerSession.pulling = true;
    state = migrateState(room.state);
    state.setupMode = "multiplayer";
    state.multiplayer = state.multiplayer || { enabled: true, roomKey: multiplayerSession.roomKey, claims: {} };
    state.multiplayer.enabled = true;
    state.multiplayer.roomKey = multiplayerSession.roomKey;
    state.multiplayer.claims = room.claims || state.multiplayer.claims || {};
    multiplayerSession.localTeamId = state.multiplayer.claims?.[localTeam] === clientId ? localTeam : null;
    multiplayerSession.version = room.version || multiplayerSession.version;
    multiplayerSession.lastJson = JSON.stringify(state);
    render();
    multiplayerSession.pulling = false;
  } catch (error) {
    setRoomStatus(`Room connection paused: ${error.message || "server unavailable"}`);
  }
}

async function pushMultiplayerState(force = false) {
  if (!state.multiplayer?.enabled || !multiplayerSession.connected || !multiplayerSession.roomKey || multiplayerSession.pulling) return;
  const json = JSON.stringify(state);
  if (!force && json === multiplayerSession.lastJson) return;
  multiplayerSession.lastJson = json;
  multiplayerSession.pushing = true;
  try {
    const room = await roomRequest("POST", `/api/rooms/${multiplayerSession.roomKey}/state`, {
      clientId,
      state
    });
    multiplayerSession.version = room.version || multiplayerSession.version;
    if (room.claims) state.multiplayer.claims = room.claims;
  } catch (error) {
    setRoomStatus(`Could not sync room: ${error.message || "server unavailable"}`);
  } finally {
    multiplayerSession.pushing = false;
  }
}

function migrateState(saved) {
  saved.aiMode = saved.aiMode !== false;
  saved.setupMode = saved.setupMode || (saved.setupComplete ? "single" : null);
  saved.multiplayer = saved.multiplayer || { enabled: false, roomKey: "", claims: {} };
  saved.multiplayer.claims = saved.multiplayer.claims || {};
  saved.setupComplete = Boolean(saved.setupComplete || saved.teamLocked || saved.gameIndex > 0 || saved.season > 1 || saved.champions?.length);
  saved.userTeamId = saved.multiplayer.enabled ? (saved.userTeamId || null) : saved.setupComplete ? (saved.userTeamId || saved.teams?.[0]?.id || "bos") : saved.userTeamId;
  saved.pendingTeamId = saved.pendingTeamId || saved.userTeamId || saved.teams?.[0]?.id || "bos";
  saved.teamLocked = Boolean(saved.teamLocked || saved.gameIndex > 0 || saved.season > 1 || saved.champions?.length);
  saved.tradeWindow = saved.tradeWindow !== false && saved.phase === "regular" ? saved.tradeWindow : Boolean(saved.tradeWindow);
  saved.news = Array.isArray(saved.news) ? saved.news : Array.isArray(saved.aiLog) ? saved.aiLog : ["League opened with a roster-freeze trade window before games begin."];
  saved.yourNews = Array.isArray(saved.yourNews) ? saved.yourNews : [];
  saved.mailbox = Array.isArray(saved.mailbox) ? saved.mailbox : [];
  saved.trash = Array.isArray(saved.trash) ? saved.trash : [];
  saved.tradeHistory = Array.isArray(saved.tradeHistory) ? saved.tradeHistory : [];
  saved.freeAgents = Array.isArray(saved.freeAgents) ? saved.freeAgents : [];
  saved.usedDraftNames = Array.isArray(saved.usedDraftNames) ? saved.usedDraftNames : [];
  saved.awards = Array.isArray(saved.awards) ? saved.awards : [];
  saved.contractOffer = saved.contractOffer || null;
  saved.scoutTeamId = saved.scoutTeamId || saved.teams?.find((team) => team.id !== saved.userTeamId)?.id || "nyk";
  saved.playoffBracket = Array.isArray(saved.playoffBracket) ? saved.playoffBracket : [];
  saved.aiLog = Array.isArray(saved.aiLog) ? saved.aiLog : [];
  saved.teams?.forEach((team) => {
    team.pickOwner = team.pickOwner || team.id;
    team.futurePicks = team.futurePicks || {};
    team.deadCap = Array.isArray(team.deadCap) ? team.deadCap : [];
    team.cash = Number.isFinite(team.cash) ? team.cash : 14;
    team.players?.forEach((player) => {
      player.stats = player.stats || emptyStats();
      player.maxHealth = player.maxHealth || player.health || 80;
      player.form = player.form || 1;
      player.exp = player.exp || 1;
      player.tradeStatus = player.tradeStatus || "normal";
      player.age = player.age || ageByName[player.name] || 25;
      player.allLeagueUntil = player.allLeagueUntil || 0;
    });
  });
  return saved;
}

function teamById(id) {
  return state.teams.find((team) => team.id === id);
}

function humanTeam() {
  return teamById(localControlledTeamId()) || teamById(state.userTeamId) || state.teams[0];
}

function setupTeam() {
  return teamById(state.pendingTeamId || state.userTeamId) || state.teams[0];
}

function isHumanTeam(team) {
  return team.id === humanTeam().id;
}

function localControlledTeamId() {
  return state.multiplayer?.enabled ? multiplayerSession.localTeamId : state.userTeamId;
}

function hasLocalControl() {
  return state.setupComplete && (!state.multiplayer?.enabled || Boolean(multiplayerSession.localTeamId));
}

function isClaimedByAnyPlayer(team) {
  return Boolean(state.multiplayer?.claims?.[team.id]);
}

function aiLog(message) {
  state.aiLog.unshift(`S${state.season}: ${message}`);
  state.aiLog = state.aiLog.slice(0, 18);
  newsLog(message);
}

function newsLog(message) {
  state.news.unshift(`Season ${state.season}: ${message}`);
  state.news = state.news.slice(0, 40);
}

function yourNewsLog(message) {
  state.yourNews.unshift(`Season ${state.season}: ${message}`);
  state.yourNews = state.yourNews.slice(0, 40);
  newsLog(message);
}

function int(n) {
  return Math.round(n);
}

function draftYear(offset = 1) {
  return state.season + Number(offset);
}

function pickKey(year, round = 1) {
  return `${year}-R${round}`;
}

function parsePickToken(token) {
  if (!token) return null;
  if (String(token).includes("-R")) {
    const [year, round] = String(token).split("-R");
    return { year: Number(year), round: Number(round), token: String(token) };
  }
  return { year: Number(token), round: 1, token: pickKey(Number(token), 1) };
}

function pickOwner(team, year = state.season, round = 1) {
  const oldOwner = round === 1 ? team.futurePicks?.[year] : null;
  return team.futurePicks?.[pickKey(year, round)] || oldOwner || team.pickOwner || team.id;
}

function setPickOwner(team, year, round, ownerId) {
  team.futurePicks = team.futurePicks || {};
  team.futurePicks[pickKey(year, round)] = ownerId;
}

function capForSeason(season) {
  return CAP_START * Math.pow(1 + CAP_GROWTH, season - 1);
}

function payroll(team, players = team.players) {
  return players.reduce((sum, player) => sum + salaryValue(player), 0) + deadCapTotal(team);
}

function salaryValue(player) {
  return state.cap * player.salaryPct / 100;
}

function deadCapTotal(team) {
  return (team.deadCap || []).reduce((sum, item) => sum + item.amount, 0);
}

function investment(team) {
  const firstYearBoost = state.season === 1 ? 10 : 0;
  return state.cap * INVESTMENT_MULT + team.cash + firstYearBoost;
}

function rating(player) {
  const base = player.insideO * 0.18 + player.outsideO * 0.18 + player.insideD * 0.16 + player.outsideD * 0.16 + player.leadership * 0.12 + player.clutch * 0.12 + player.health * 0.08;
  const healthMod = player.health >= 72 ? 1 : 0.78 + player.health / 330;
  const injuryMod = player.injury > 0 ? 0 : 1;
  return base * player.exp * player.form * healthMod * injuryMod * ageCurve(player);
}

function ageCurve(player) {
  const age = player.age || 25;
  if (age <= 29) return 1;
  if (age <= 35) return clamp(1 - (age - 29) * 0.025, 0.82, 1);
  return clamp(0.82 - (age - 35) * 0.07, 0.45, 0.82);
}

function maxFormForAge(player) {
  const age = player.age || 25;
  if (age <= 29) return 1.16;
  if (age <= 35) return 1.12 - (age - 30) * 0.018;
  return clamp(1.02 - (age - 35) * 0.045, 0.78, 1.02);
}

function agePlayerOneYear(player) {
  player.age = (player.age || 25) + 1;
  player.form = clamp(player.form - Math.max(0, player.age - 29) * 0.008, 0.72, maxFormForAge(player));
  if (player.age > 35) {
    player.health = clamp(player.health - (player.age - 35) * 1.4, 45, player.maxHealth);
  }
  const retireChance = player.age < 36 ? 0 : player.age < 39 ? 0.08 + (player.age - 36) * 0.08 : 0.35 + (player.age - 39) * 0.15;
  return Math.random() < retireChance;
}

function isOnFire(player) {
  const ppg = player.stats.gp ? player.stats.pts / player.stats.gp : 0;
  const expected = (player.insideO + player.outsideO) / 10 * Math.max(0.35, player.minutes / 32);
  return player.form >= 1.08 || (player.stats.gp >= 3 && ppg > expected + 4);
}

function playerIcons(player) {
  const icons = [];
  if (isOnFire(player)) icons.push(`<span class="icon-badge" title="Hot form: playing above expected level">🔥</span>`);
  if (player.tradeStatus === "locked") icons.push(`<span class="icon-badge locked" title="Locked: not for trade">🔒</span>`);
  if (player.tradeStatus === "shop") icons.push(`<span class="icon-badge market" title="On the market">🛒</span>`);
  return icons.join("");
}

function teamIdentity(team) {
  const rotation = team.players.filter((player) => player.injury <= 0 && player.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 9);
  const minutes = rotation.reduce((sum, player) => sum + Math.max(1, player.minutes), 0) || 1;
  const weighted = (fn) => rotation.reduce((sum, player) => sum + fn(player) * Math.max(1, player.minutes) / minutes, 0);
  const insideOff = weighted((p) => p.insideO);
  const outsideOff = weighted((p) => p.outsideO);
  const insideDef = weighted((p) => p.insideD);
  const outsideDef = weighted((p) => p.outsideD);
  const offense = (insideOff + outsideOff) / 2;
  const defense = (insideDef + outsideDef) / 2;
  return {
    insideOff,
    outsideOff,
    insideDef,
    outsideDef,
    offense,
    defense,
    insideOutside: insideOff - outsideOff,
    offenseDefense: offense - defense
  };
}

function teamRecommendations(team) {
  const id = teamIdentity(team);
  const recs = [];
  if (id.insideOutside > 8) recs.push("Add outside shooting to balance the offense.");
  if (id.insideOutside < -8) recs.push("Add rim pressure or a scoring big.");
  if (id.offenseDefense > 7) recs.push("Trade for defensive wings or a rim protector.");
  if (id.offenseDefense < -7) recs.push("Find a creator or high-volume scorer.");
  if (payroll(team) > investment(team) * 0.94) recs.push("Move salary or waive a low-rotation contract.");
  const expiring = team.players.filter((player) => player.contract <= 1 && rating(player) > 76);
  if (expiring.length) recs.push(`Plan extensions for ${expiring.slice(0, 2).map((p) => p.name).join(", ")}.`);
  return recs.length ? recs : ["Roster is balanced. Upgrade by consolidating bench salary for a top-6 player."];
}

function marketValuePct(player) {
  return clamp(Math.round(2 + (rating(player) - 58) * 0.48 + (isOnFire(player) ? 2 : 0)), MIN_SALARY_PCT, maxSalaryPct(player));
}

function maxSalaryPct(player, team = null) {
  const supermax = player.allLeagueUntil && player.allLeagueUntil >= state.season;
  return supermax ? SUPERMAX_SALARY_PCT : MAX_SALARY_PCT;
}

function contractAcceptance(player, team, offer) {
  const mother = player.birdTeam === team.id;
  const maxPct = mother ? maxSalaryPct(player, team) : Math.min(30, maxSalaryPct(player, team));
  if (mother && Number(offer.salaryPct) >= maxPct && Number(offer.years) >= 3) return 100;
  const expected = marketValuePct(player);
  const salaryScore = (Number(offer.salaryPct) - expected) * 5.5;
  const years = Number(offer.years);
  const yearsScore = (years - 1) * 9;
  const option = offer.option || "none";
  const optionScore = option.startsWith("player") ? (option.endsWith("2") ? 10 : 6) : option.startsWith("team") ? (option.endsWith("2") ? -10 : -6) : 0;
  const motherBoost = mother ? 7 : 0;
  const capPenalty = payroll(team) + state.cap * Number(offer.salaryPct) / 100 > investment(team) ? -35 : 0;
  const boundPenalty = Number(offer.salaryPct) > maxPct || Number(offer.salaryPct) < MIN_SALARY_PCT ? -100 : 0;
  return clamp(Math.round(48 + salaryScore + yearsScore + optionScore + motherBoost + capPenalty + boundPenalty), 3, 98);
}

function cloneFreeAgent(player, motherTeamId) {
  return {
    id: `fa-${player.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    player: { ...player, stats: { ...player.stats }, injury: 0, starter: false, minutes: 0, contract: 0 },
    motherTeamId,
    highBid: null,
    bidEndsAt: null,
    signed: false
  };
}

function freeAgentRemaining(fa) {
  if (!fa.bidEndsAt) return "No active bid";
  const seconds = Math.max(0, Math.ceil((fa.bidEndsAt - Date.now()) / 1000));
  const min = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function buildSchedule(teams) {
  const games = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      const sameConf = teams[i].conf === teams[j].conf;
      const count = sameConf ? 2 : 1;
      for (let g = 0; g < count; g += 1) {
        games.push({ home: g % 2 ? teams[j].id : teams[i].id, away: g % 2 ? teams[i].id : teams[j].id, played: false });
      }
    }
  }
  return games.sort(() => Math.random() - 0.5);
}

function normalizeRotation(team) {
  const healthy = team.players.filter((player) => player.injury <= 0).sort((a, b) => rating(b) - rating(a));
  team.players.forEach((player) => { player.starter = false; });
  healthy.slice(0, 5).forEach((player) => { player.starter = true; });
  team.players.forEach((player) => {
    if (player.injury > 0) player.minutes = 0;
    else if (player.starter) player.minutes = clamp(player.minutes || 30, 24, 38);
    else player.minutes = clamp(player.minutes || 12, 0, 22);
  });
}

function teamStrength(team) {
  const active = team.players.filter((player) => player.injury <= 0);
  const sorted = [...active].sort((a, b) => b.minutes - a.minutes || rating(b) - rating(a));
  const rotation = sorted.slice(0, 8);
  const minuteTotal = rotation.reduce((sum, player) => sum + Math.max(player.minutes, 1), 0) || 1;
  const core = rotation.reduce((sum, player) => sum + rating(player) * Math.max(player.minutes, 1) / minuteTotal, 0);
  const lead = rotation.slice(0, 5).reduce((sum, player) => sum + player.leadership, 0) / 5;
  return core + lead * 0.08;
}

function playNextGame() {
  if (!hasLocalControl()) return render();
  if (state.phase !== "regular") return;
  if (!confirmPendingMailbox("advance games")) return;
  lockTeam();
  runAiManagers("pre-game");
  state.tradeWindow = false;
  const finishingRun = minTeamGamesPlayed() >= 9;
  const target = nextTeamGameTarget();
  while (state.phase === "regular" && minTeamGamesPlayed() < target) {
    playScheduledGame();
  }
  if (state.phase === "regular" && finishingRun) {
    while (state.phase === "regular" && state.gameIndex < state.schedule.length) {
      playScheduledGame();
    }
    calculateSeasonAwards();
    if (state.phase === "playoffs-ready") runPlayoffs(true);
  } else if (state.phase === "playoffs-ready" && finishingRun) {
    runPlayoffs(true);
  } else if (state.phase === "regular") {
    state.tradeWindow = true;
    newsLog(`Roster freeze lifted. Every team has played at least ${minTeamGamesPlayed()} games. ${minTeamGamesPlayed() >= 9 ? "Final trade window before the playoff push." : "Trade window is open."}`);
    generateMailboxOffers();
  }
  saveState();
  switchView("dashboard");
  render();
}

function playScheduledGame() {
  const game = state.schedule[state.gameIndex];
  if (!game) {
    state.phase = "playoffs-ready";
    return;
  }
  playGame(game);
  game.played = true;
  state.gameIndex += 1;
  if (state.aiMode && state.gameIndex > 0 && state.gameIndex % AI_TRADE_SCAN_GAMES === 0) runAiTradeMarket();
  if (state.gameIndex >= state.schedule.length) state.phase = "playoffs-ready";
}

function nextTeamGameTarget() {
  const minGames = minTeamGamesPlayed();
  return TEAM_GAME_WINDOWS.find((target) => minGames < target) || 10;
}

function minTeamGamesPlayed() {
  return Math.min(...state.teams.map((team) => team.wins + team.losses));
}

function maxTeamGamesPlayed() {
  return Math.max(...state.teams.map((team) => team.wins + team.losses));
}

function lockTeam() {
  if (!state.setupComplete) return;
  if (!state.teamLocked) {
    state.teamLocked = true;
    newsLog(`${humanTeam().name} is locked as your team for this 10-year run.`);
  }
}

function playGame(game, playoff = false) {
  const home = teamById(game.home);
  const away = teamById(game.away);
  const homePower = teamStrength(home) + 2.3 + rand(-6, 6);
  const awayPower = teamStrength(away) + rand(-6, 6);
  const totalBase = 101 + rand(-7, 9);
  const spread = clamp((homePower - awayPower) / 2.8, -18, 18);
  let homeScore = Math.round(totalBase + spread + rand(-8, 8));
  let awayScore = Math.round(totalBase - spread + rand(-8, 8));
  if (homeScore === awayScore) homeScore += Math.random() > 0.5 ? 1 : -1;
  assignBoxScore(home, homeScore, awayScore, playoff);
  assignBoxScore(away, awayScore, homeScore, playoff);
  updateTeamRecord(home, away, homeScore, awayScore, playoff);
  const log = {
    id: Date.now() + Math.random(),
    type: playoff ? "playoff" : "regular",
    home: home.id,
    away: away.id,
    homeScore,
    awayScore,
    text: `${away.name} ${awayScore}, ${home.name} ${homeScore}`
  };
  if (playoff) state.playoffLog.unshift(log);
  else state.logs.unshift(log);
  state.logs = state.logs.slice(0, 24);
}

function updateTeamRecord(home, away, homeScore, awayScore, playoff) {
  if (!playoff) {
    home.pf += homeScore;
    home.pa += awayScore;
    away.pf += awayScore;
    away.pa += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }
}

function assignBoxScore(team, score, oppScore, playoff) {
  const rotation = team.players
    .filter((player) => player.injury <= 0 && player.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || rating(b) - rating(a))
    .slice(0, 9);
  const totalWeight = rotation.reduce((sum, player) => sum + offensiveWeight(player), 0) || 1;
  rotation.forEach((player) => {
    smoothForm(player);
    const share = offensiveWeight(player) / totalWeight;
    const points = Math.max(0, Math.round(score * share * rand(0.78, 1.25)));
    const rebounds = Math.max(0, Math.round((player.insideD * 0.08 + player.insideO * 0.04) * player.minutes / 28 * rand(0.65, 1.35)));
    const assists = Math.max(0, Math.round((player.leadership * 0.05 + player.outsideO * 0.04) * player.minutes / 30 * rand(0.55, 1.3)));
    const stl = Math.max(0, Math.round(player.outsideD / 62 * rand(0.2, 1.35)));
    const blk = Math.max(0, Math.round(player.insideD / 66 * rand(0.1, 1.25)));
    const tov = Math.max(0, Math.round((100 - player.leadership) / 30 * rand(0.4, 1.5)));
    player.stats.gp += 1;
    player.stats.min += player.minutes;
    player.stats.pts += points;
    player.stats.reb += rebounds;
    player.stats.ast += assists;
    player.stats.stl += stl;
    player.stats.blk += blk;
    player.stats.tov += tov;
    updateExperienceAndHealth(player, playoff);
  });
  team.players.filter((player) => !rotation.includes(player)).forEach((player) => {
    player.exp = clamp(player.exp - 0.004, 0.88, 1.22);
    if (player.injury > 0) {
      player.injury -= 1;
      player.exp = clamp(player.exp - 0.006, 0.88, 1.22);
    }
  });
}

function offensiveWeight(player) {
  return Math.max(1, player.minutes) * (player.insideO * 0.35 + player.outsideO * 0.4 + player.clutch * 0.12 + player.form * 20);
}

function smoothForm(player) {
  player.form = clamp(player.form * 0.82 + rand(0.9, 1.1) * 0.18, 0.72, maxFormForAge(player));
}

function updateExperienceAndHealth(player, playoff) {
  const min = player.minutes;
  if (min >= 26) player.exp = clamp(player.exp + 0.006 + min / 8500, 0.88, 1.24);
  else if (min >= 10) player.exp = clamp(player.exp + 0.002, 0.88, 1.24);
  else player.exp = clamp(player.exp - 0.004, 0.88, 1.24);
  const fatigue = Math.max(0, min - 24) / 820 + (playoff ? 0.003 : 0);
  player.health = clamp(player.health - fatigue, 35, player.maxHealth);
  const risk = Math.max(0.003, (min / 34) * (100 - player.health) / 1300);
  if (Math.random() < risk) {
    player.injury = Math.ceil(rand(1, 4) + (100 - player.health) / 28);
  }
}

function runRegularSeason() {
  if (!hasLocalControl()) return render();
  if (state.phase !== "regular") return;
  if (!confirmPendingMailbox("finish the season")) return;
  lockTeam();
  runAiManagers("season");
  state.tradeWindow = false;
  while (state.phase === "regular" && state.gameIndex < state.schedule.length) playScheduledGame();
  if (state.phase === "playoffs-ready") {
    calculateSeasonAwards();
    runPlayoffs(true);
  }
  render();
}

function runPlayoffs(auto = false) {
  if (!hasLocalControl()) return render();
  if (state.phase !== "playoffs-ready") return;
  runAiManagers("playoffs");
  state.phase = "playoffs";
  state.playoffLog = [];
  state.playoffBracket = [];
  const east = standings("East").slice(0, 4);
  const west = standings("West").slice(0, 4);
  const eastFinalists = [playSeries(east[0], east[3], "East Semi"), playSeries(east[1], east[2], "East Semi")];
  const westFinalists = [playSeries(west[0], west[3], "West Semi"), playSeries(west[1], west[2], "West Semi")];
  const eastChamp = playSeries(eastFinalists[0], eastFinalists[1], "East Final");
  const westChamp = playSeries(westFinalists[0], westFinalists[1], "West Final");
  const champ = playSeries(eastChamp, westChamp, "Final");
  const runner = champ.id === eastChamp.id ? westChamp : eastChamp;
  state.champions.push({ season: state.season, champ: champ.id, runner: runner.id, east: eastChamp.id, west: westChamp.id });
  newsLog(`${champ.name} won the championship over ${runner.name}.`);
  state.phase = "draft-ready";
  state.tradeWindow = true;
  saveState();
  switchView("playoffs");
  render();
}

function calculateSeasonAwards() {
  if (state.awards.some((row) => row.season === state.season)) return;
  const players = state.teams.flatMap((team) => team.players.map((player) => ({ team, player })));
  const scored = players
    .filter(({ player }) => player.stats.gp >= 5)
    .map(({ team, player }) => ({
      team,
      player,
      score: (player.stats.pts / player.stats.gp) * 1.2 + (player.stats.reb / player.stats.gp) * 0.7 + (player.stats.ast / player.stats.gp) * 0.8 + team.wins * 0.35
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  scored.forEach(({ player }) => { player.allLeagueUntil = state.season + 2; });
  state.awards.push({ season: state.season, lineup: scored.map(({ team, player }) => ({ team: team.id, playerId: player.id, name: player.name })) });
  newsLog(`Best lineup named: ${scored.map(({ player }) => player.name).join(", ")}. These players can receive supermax offers.`);
}

function playSeries(a, b, round) {
  let winsA = 0;
  let winsB = 0;
  let games = 0;
  while (winsA < 4 && winsB < 4) {
    const home = games % 2 === 0 ? a : b;
    const away = games % 2 === 0 ? b : a;
    const game = { home: home.id, away: away.id };
    playGame(game, true);
    const latest = state.playoffLog[0];
    if ((latest.home === a.id && latest.homeScore > latest.awayScore) || (latest.away === a.id && latest.awayScore > latest.homeScore)) winsA += 1;
    else winsB += 1;
    games += 1;
  }
  const winner = winsA > winsB ? a : b;
  const loser = winsA > winsB ? b : a;
  const result = `${round}: ${winner.name} beat ${loser.name}, ${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`;
  state.playoffLog.unshift({ text: result });
  state.playoffBracket.push({
    round,
    winner: winner.id,
    loser: loser.id,
    score: `${Math.max(winsA, winsB)}-${Math.min(winsA, winsB)}`,
    key: topPlayoffStat(winner)
  });
  return winner;
}

function topPlayoffStat(team) {
  const top = [...team.players].sort((a, b) => (b.stats.pts / Math.max(1, b.stats.gp)) - (a.stats.pts / Math.max(1, a.stats.gp)))[0];
  return top ? `${top.name}: ${statLine(top)}` : "";
}

function standings(conf) {
  return state.teams
    .filter((team) => !conf || team.conf === conf)
    .sort((a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa));
}

function startDraft() {
  if (!hasLocalControl()) return render();
  if (state.phase !== "draft-ready") return;
  lockTeam();
  runAiManagers("draft prep");
  const reverse = [...state.teams].sort((a, b) => a.wins - b.wins || (a.pf - a.pa) - (b.pf - b.pa));
  const picks = [];
  const year = state.season + 1;
  for (let round = 1; round <= 2; round += 1) {
    reverse.forEach((original, index) => {
      const ownerId = pickOwner(original, year, round);
      const owner = teamById(ownerId) || original;
      picks.push({ round, pick: index + 1, original: original.id, owner: owner.id, made: false });
    });
  }
  state.draft = { year, picks, current: 0, prospects: makeProspects(state.season) };
  state.phase = "draft";
  aiDraftUntilHuman();
  saveState();
  switchView("draft");
  render();
}

function makeProspects(season) {
  const first = ["Amari", "Kian", "Darius", "Malik", "Jonah", "Nico", "Tariq", "Eli", "Jalen", "Milan", "Kobe", "Andre", "Luka", "Mateo", "Isaiah", "Noah"];
  const last = ["Cross", "Holland", "Ivey", "Bishop", "Reed", "Banks", "Stone", "Foster", "Hayes", "Porter", "Dawson", "Knight", "Warren", "Fields", "Powell", "Brooks"];
  const positions = ["G", "G/F", "F", "F/C", "C"];
  const trashPool = Array.from({ length: 40 }, (_, i) => {
    const base = rand(48, 63);
    return [`${pick(first)} ${pick(last)} ${season + i}`, pick(positions), base + rand(-4, 5), base + rand(-5, 6), base + rand(-5, 6), base + rand(-5, 6), base + rand(-7, 5), base + rand(-6, 6), rand(74, 88), rand(1, 2.4)];
  });
  const available = [...draftPlayerPool, ...trashPool].filter((seed) => !state.usedDraftNames.includes(seed[0]));
  return available.map((seed, index) => {
    const player = makePlayer(seed, `external${season}`, index);
    player.contract = 2;
    player.age = Math.floor(rand(20, 23));
    player.exp = rand(0.98, 1.08);
    player.form = rand(0.94, 1.06);
    return player;
  }).sort((a, b) => rating(b) - rating(a));
}

function draftPlayer(playerId, silent = false) {
  if (state.phase !== "draft" || !state.draft) return;
  const pickInfo = state.draft.picks[state.draft.current];
  const team = teamById(pickInfo.owner);
  const prospectIndex = state.draft.prospects.findIndex((player) => player.id === playerId);
  if (prospectIndex < 0) return;
  const [player] = state.draft.prospects.splice(prospectIndex, 1);
  player.id = `${team.id}-draft-${state.season}-${Math.random().toString(16).slice(2)}`;
  player.birdTeam = team.id;
  player.contract = 2;
  player.salaryPct = rookieSalaryPct(pickInfo.round, pickInfo.pick);
  player.age = player.age || Math.floor(rand(20, 23));
  player.minutes = 0;
  player.starter = false;
  team.players.push(player);
  pickInfo.made = true;
  pickInfo.player = player.name;
  state.usedDraftNames.push(player.name);
  state.draft.current += 1;
  if (state.draft.current >= state.draft.picks.length) state.phase = "offseason";
  if (!silent) aiDraftUntilHuman();
  saveState();
  if (!silent) render();
}

function rookieSalaryPct(round, pickNumber) {
  if (round === 1) return clamp(5.5 - (pickNumber - 1) * 0.25, 3.5, 5.5);
  return clamp(1.8 - (pickNumber - 1) * 0.08, MIN_SALARY_PCT, 1.8);
}

function openContractOffer(type, playerId, freeAgentId = null, preset = null) {
  if (!hasLocalControl()) return;
  const team = humanTeam();
  const player = freeAgentId
    ? state.freeAgents.find((fa) => fa.id === freeAgentId)?.player
    : team.players.find((p) => p.id === playerId);
  if (!player) return;
  const base = preset || { salaryPct: marketValuePct(player), years: Math.min(3, Math.max(1, player.contract || 2)), option: "none" };
  state.contractOffer = { type, playerId, freeAgentId, teamId: team.id, salaryPct: int(base.salaryPct), years: int(base.years), option: base.option || "none" };
  renderContractModal();
}

function closeContractOffer() {
  state.contractOffer = null;
  renderContractModal();
}

function activeContractPlayer() {
  const offer = state.contractOffer;
  if (!offer) return null;
  if (offer.freeAgentId) return state.freeAgents.find((fa) => fa.id === offer.freeAgentId)?.player || null;
  return teamById(offer.teamId)?.players.find((p) => p.id === offer.playerId) || null;
}

function renderContractModal() {
  const modal = $("contractModal");
  const offer = state.contractOffer;
  if (!offer) {
    modal.classList.add("hidden");
    return;
  }
  const player = activeContractPlayer();
  const team = teamById(offer.teamId);
  if (!player || !team) {
    modal.classList.add("hidden");
    return;
  }
  modal.classList.remove("hidden");
  $("contractTitle").textContent = offer.type === "freeAgent" ? `Bid: ${player.name}` : `Extend: ${player.name}`;
  const maxPct = maxSalaryPct(player, team);
  $("contractContext").textContent = `${team.name} offer. Market estimate: ${marketValuePct(player)}% of cap. Maximum allowed: ${maxPct}%${maxPct > MAX_SALARY_PCT ? " (all-league supermax right)" : ""}. Players usually prefer longer deals and player options.`;
  $("contractSalary").max = maxPct;
  $("contractSalary").value = offer.salaryPct;
  $("contractYears").value = offer.years;
  $("contractOption").value = offer.option;
  const prob = contractAcceptance(player, team, offer);
  $("contractProbability").textContent = `Estimated signing chance: ${prob}%. ${player.birdTeam === team.id ? "Mother-team relationship improves odds." : "Open-market bid."}`;
}

function updateContractOfferFromInputs() {
  if (!state.contractOffer) return;
  const player = activeContractPlayer();
  const team = teamById(state.contractOffer.teamId);
  state.contractOffer.salaryPct = clamp(Number($("contractSalary").value || 1), MIN_SALARY_PCT, player && team ? maxSalaryPct(player, team) : MAX_SALARY_PCT);
  state.contractOffer.years = clamp(Number($("contractYears").value || 1), 1, 3);
  state.contractOffer.option = $("contractOption").value;
  renderContractModal();
}

function submitContractOffer() {
  const offer = state.contractOffer;
  if (!offer) return;
  const team = teamById(offer.teamId);
  const player = activeContractPlayer();
  if (!team || !player) return;
  const prob = contractAcceptance(player, team, offer);
  if (offer.type === "extension") {
    const accepted = Math.random() * 100 < prob;
    if (accepted) {
      player.salaryPct = Number(offer.salaryPct);
      player.contract = Number(offer.years);
      player.option = offer.option;
      player.birdTeam = team.id;
      newsLog(`${player.name} signed an extension with ${team.name}: ${offer.salaryPct}% cap for ${offer.years} years.`);
    } else {
      newsLog(`${player.name} declined ${team.name}'s extension offer.`);
      player.extensionNotice = false;
    }
    closeContractOffer();
    yourNewsLog(`${player.name} responded to your extension offer.`);
    saveState();
    render();
    return;
  }
  const fa = state.freeAgents.find((item) => item.id === offer.freeAgentId);
  if (!fa || fa.signed) return;
  const bidValue = Number(offer.salaryPct) * Number(offer.years);
  const highValue = fa.highBid ? Number(fa.highBid.salaryPct) * Number(fa.highBid.years) : 0;
  if (bidValue <= highValue) {
    alert("Bid must beat the current high offer.");
    return;
  }
  fa.highBid = { teamId: team.id, salaryPct: Number(offer.salaryPct), years: Number(offer.years), option: offer.option, probability: prob };
  fa.bidEndsAt = Date.now() + 180000;
  newsLog(`${team.name} placed the high bid for ${player.name}: ${offer.salaryPct}% cap for ${offer.years} years.`);
  closeContractOffer();
  saveState();
  render();
}

function resolveFreeAgentBids() {
  const now = Date.now();
  state.freeAgents.forEach((fa) => {
    if (fa.signed || !fa.highBid || !fa.bidEndsAt || fa.bidEndsAt > now) return;
    const team = teamById(fa.highBid.teamId);
    if (!team) return;
    const accepted = Math.random() * 100 < fa.highBid.probability;
    if (accepted && payroll(team) + state.cap * fa.highBid.salaryPct / 100 <= investment(team)) {
      const player = fa.player;
      player.id = `${team.id}-fa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      player.salaryPct = fa.highBid.salaryPct;
      player.contract = fa.highBid.years;
      player.option = fa.highBid.option;
      player.birdTeam = team.id;
      player.stats = emptyStats();
      team.players.push(player);
      fa.signed = true;
      newsLog(`${player.name} signed with ${team.name}.`);
      if (!isHumanTeam(team)) aiSetRotation(team);
    } else {
      newsLog(`${fa.player.name} rejected the high bid and remains in free agency.`);
      fa.highBid = null;
      fa.bidEndsAt = null;
    }
  });
  state.freeAgents = state.freeAgents.filter((fa) => !fa.signed);
}

function nextSeason() {
  if (!hasLocalControl()) return render();
  if (!["offseason", "draft-ready"].includes(state.phase)) return;
  if (!confirmPendingMailbox("advance to next season")) return;
  if (state.season >= 10) {
    state.phase = "complete";
    saveState();
    render();
    return;
  }
  state.season += 1;
  state.cap = capForSeason(state.season);
  state.phase = "regular";
  state.gameIndex = 0;
  state.logs = [];
  state.playoffLog = [];
  state.draft = null;
  state.teams.forEach((team) => {
    team.wins = 0;
    team.losses = 0;
    team.pf = 0;
    team.pa = 0;
    team.cash += 8;
    team.deadCap = (team.deadCap || [])
      .map((item) => ({ ...item, years: item.years - 1 }))
      .filter((item) => item.years > 0);
    team.players.forEach((player) => {
      if (agePlayerOneYear(player)) {
        player.release = true;
        newsLog(`${player.name} retired at age ${player.age}.`);
        return;
      }
      player.contract -= 1;
      player.health = player.maxHealth;
      player.injury = 0;
      player.stats = emptyStats();
      player.form = clamp(player.form * 0.7 + rand(0.94, 1.06) * 0.3, 0.9, 1.12);
    });
    team.players = team.players.filter((player) => !player.release);
    resolveContracts(team);
    trimRoster(team);
    if (state.aiMode && !isHumanTeam(team) && !isClaimedByAnyPlayer(team)) aiSetRotation(team);
    else normalizeRotation(team);
  });
  state.schedule = buildSchedule(state.teams);
  state.tradeWindow = true;
  state.playoffBracket = [];
  runAiManagers("new season");
  saveState();
  switchView("dashboard");
  render();
}

function confirmPendingMailbox(action) {
  const count = state.mailbox.filter((offer) => offer.status === "open").length;
  if (!count) return true;
  return confirm(`You still have ${count} open mailbox item(s). Continue to ${action}?`);
}

function resolveContracts(team) {
  team.players.forEach((player) => {
    if (player.contract > 0) return;
    if (!isHumanTeam(team) && !isClaimedByAnyPlayer(team)) {
      const askPct = marketValuePct(player);
      const offer = { salaryPct: askPct, years: rating(player) > 78 ? 3 : 2, option: "none" };
      const chance = contractAcceptance(player, team, offer) + 6;
      if (Math.random() * 100 < chance && payroll(team) - salaryValue(player) + state.cap * askPct / 100 <= investment(team)) {
        player.salaryPct = askPct;
        player.contract = offer.years;
        player.birdTeam = team.id;
        return;
      }
    }
    state.freeAgents.push(cloneFreeAgent(player, team.id));
    player.release = true;
  });
  team.players = team.players.filter((player) => !player.release);
}

function checkExtensionNotices() {
  const team = humanTeam();
  team.players.filter((player) => player.contract === 1 && !player.extensionNotice).forEach((player) => {
    player.extensionNotice = true;
    const proposal = playerExtensionProposal(player);
    state.mailbox.unshift({
      id: `ext-${player.id}-${Date.now()}`,
      status: "open",
      type: "extension",
      playerId: player.id,
      from: team.id,
      to: team.id,
      text: `${player.name} is extension eligible. His camp suggests ${proposal.salaryPct}% of cap for ${proposal.years} years with ${optionText(proposal.option)}.`,
      proposal
    });
  });
}

function playerExtensionProposal(player) {
  return {
    salaryPct: clamp(marketValuePct(player) + rand(1, 4), 2, 35),
    years: rating(player) > 78 ? 3 : 2,
    option: rating(player) > 80 ? "player1" : "none"
  };
}

function optionText(option) {
  const map = {
    none: "no option",
    team1: "team choice in the last year",
    player1: "player choice in the last year",
    team2: "team choice in the last two years",
    player2: "player choice in the last two years"
  };
  return map[option] || "no option";
}

function trimRoster(team) {
  if (team.players.length <= 10) return;
  team.players = team.players.sort((a, b) => rating(b) - rating(a)).slice(0, 10);
}

function runAiManagers(reason) {
  if (!state.setupComplete || !state.aiMode) return;
  state.teams.filter((team) => !isHumanTeam(team) && !isClaimedByAnyPlayer(team)).forEach((team) => aiSetRotation(team));
  if (["season", "new season", "draft prep"].includes(reason)) runAiTradeMarket();
  aiBidFreeAgents();
  if (state.tradeWindow) generateMailboxOffers();
}

function aiBidFreeAgents() {
  if (!state.freeAgents?.length) return;
  state.freeAgents.filter((fa) => !fa.signed).forEach((fa) => {
    if (Math.random() > 0.28) return;
    const bidders = state.teams.filter((team) => !isHumanTeam(team) && !isClaimedByAnyPlayer(team) && payroll(team) < investment(team) * 0.96).sort((a, b) => rosterNeedScore(b, fa.player.pos) - rosterNeedScore(a, fa.player.pos));
    const team = bidders[0];
    if (!team) return;
    const base = marketValuePct(fa.player);
    const salaryPct = clamp(base + rand(-1, 3), 2, fa.player.birdTeam === team.id ? 35 : 30);
    const years = rating(fa.player) > 78 ? 3 : 2;
    const bidValue = salaryPct * years;
    const highValue = fa.highBid ? fa.highBid.salaryPct * fa.highBid.years : 0;
    if (bidValue <= highValue) return;
    const offer = { salaryPct, years, option: "none" };
    fa.highBid = { teamId: team.id, salaryPct: int(salaryPct), years, option: "none", probability: contractAcceptance(fa.player, team, offer) };
    fa.bidEndsAt = Date.now() + 180000;
    newsLog(`${team.name} placed a free-market bid for ${fa.player.name}.`);
  });
}

function aiSetRotation(team) {
  const active = team.players.filter((player) => player.injury <= 0).sort((a, b) => aiCourtValue(b) - aiCourtValue(a));
  const starters = chooseBalancedStarters(active);
  const bench = active.filter((player) => !starters.includes(player)).sort((a, b) => aiCourtValue(b) - aiCourtValue(a));
  team.players.forEach((player) => {
    player.starter = false;
    player.minutes = player.injury > 0 ? 0 : 0;
  });
  starters.forEach((player, index) => {
    player.starter = true;
    const healthCap = player.health < 68 ? 30 : player.health < 76 ? 34 : 38;
    player.minutes = clamp(36 - index * 2, 28, healthCap);
  });
  bench.slice(0, 4).forEach((player, index) => {
    const healthGuard = player.health < 70 ? -3 : 0;
    player.minutes = clamp(22 - index * 4 + healthGuard, 8, 24);
  });
  balanceRotationMinutes(team);
}

function aiCourtValue(player) {
  const availability = player.injury > 0 ? -100 : 0;
  const healthMod = player.health < 70 ? -5 : player.health < 78 ? -2 : 0;
  const twoWay = player.insideD * 0.12 + player.outsideD * 0.12;
  return rating(player) + twoWay + player.leadership * 0.04 + healthMod + availability;
}

function chooseBalancedStarters(active) {
  const chosen = [];
  const addBest = (predicate) => {
    const player = active.filter((candidate) => !chosen.includes(candidate) && predicate(candidate)).sort((a, b) => aiCourtValue(b) - aiCourtValue(a))[0];
    if (player) chosen.push(player);
  };
  addBest((player) => player.pos.includes("G"));
  addBest((player) => player.pos.includes("G") || player.pos.includes("F"));
  addBest((player) => player.pos.includes("F"));
  addBest((player) => player.pos.includes("F") || player.pos.includes("C"));
  addBest((player) => player.pos.includes("C"));
  active.filter((player) => !chosen.includes(player)).sort((a, b) => aiCourtValue(b) - aiCourtValue(a)).forEach((player) => {
    if (chosen.length < 5) chosen.push(player);
  });
  return chosen.slice(0, 5);
}

function balanceRotationMinutes(team) {
  const rotation = team.players.filter((player) => player.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  let total = rotation.reduce((sum, player) => sum + player.minutes, 0);
  while (total > 240 && rotation.length) {
    const player = rotation.find((candidate) => candidate.minutes > (candidate.starter ? 28 : 8));
    if (!player) break;
    player.minutes -= 1;
    total -= 1;
  }
  while (total < 240 && rotation.length) {
    const player = rotation.find((candidate) => candidate.minutes < (candidate.starter ? 38 : 24));
    if (!player) break;
    player.minutes += 1;
    total += 1;
  }
}

function aiPlayerValue(player, team) {
  const contractValue = rating(player) - player.salaryPct * 1.35;
  const healthValue = player.health * 0.12 - (player.injury > 0 ? 18 : 0);
  const need = rosterNeedScore(team, player.pos) * 2.5;
  const market = player.tradeStatus === "shop" ? -3 : player.tradeStatus === "locked" ? 10 : 0;
  const fire = isOnFire(player) ? 4 : 0;
  return contractValue + healthValue + need + player.contract * 0.7 + market + fire;
}

function rosterNeedScore(team, pos) {
  const healthy = team.players.filter((player) => player.injury <= 0);
  const guards = healthy.filter((player) => player.pos.includes("G")).length;
  const wings = healthy.filter((player) => player.pos.includes("F")).length;
  const bigs = healthy.filter((player) => player.pos.includes("C")).length;
  if (pos.includes("C")) return clamp(4 - bigs, -1, 4);
  if (pos.includes("F")) return clamp(5 - wings, -1, 4);
  if (pos.includes("G")) return clamp(4 - guards, -1, 4);
  return 0;
}

function runAiTradeMarket() {
  if (!state.aiMode || state.phase === "draft" || state.phase === "complete") return;
  if (!state.tradeWindow) return;
  let deals = 0;
  const bots = state.teams.filter((team) => !isHumanTeam(team) && !isClaimedByAnyPlayer(team)).sort(() => Math.random() - 0.5);
  bots.forEach((team) => {
    if (deals >= 3 || Math.random() > 0.62) return;
    const deal = findAiTrade(team);
    if (deal && applyTradeProposal(deal)) {
      deals += 1;
      newsLog(`${deal.a.name} traded ${assetText(deal.aPlayers, deal.aPick)} to ${deal.b.name} for ${assetText(deal.bPlayers, deal.bPick)}. ${tradeNewsDetails(deal.aPlayers, deal.bPlayers)}`);
    }
  });
}

function generateMailboxOffers() {
  if (!state.setupComplete || !state.aiMode || !canTradeNow()) return;
  const openOffers = state.mailbox.filter((offer) => offer.status === "open").length;
  if (openOffers >= 6) return;
  const human = humanTeam();
  const teams = state.teams.filter((team) => !isHumanTeam(team)).sort(() => Math.random() - 0.5);
  for (const team of teams) {
    if (state.mailbox.filter((offer) => offer.status === "open").length >= 6) break;
    if (Math.random() > 0.68) continue;
    const proposal = findOfferForHuman(team, human);
    if (!proposal) continue;
    state.mailbox.unshift(serializeOffer(proposal));
  }
  state.mailbox = state.mailbox.slice(0, 16);
}

function findOfferForHuman(aiTeam, human) {
  const humanTargets = human.players
    .filter((player) => player.tradeStatus !== "locked")
    .sort((a, b) => humanTradePriority(b, aiTeam) - humanTradePriority(a, aiTeam))
    .slice(0, 5);
  const aiAssets = aiTeam.players
    .filter((player) => player.tradeStatus !== "locked")
    .sort((a, b) => aiPlayerValue(b, human) - aiPlayerValue(a, human))
    .slice(0, 6);
  for (const wanted of humanTargets) {
    for (const offered of aiAssets) {
      const wantsPick = wanted.tradeStatus !== "shop" && (isOnFire(wanted) || rating(wanted) > rating(offered) + 5);
      const givesPick = offered.tradeStatus === "shop" || rating(wanted) > rating(offered) + 9;
      const proposal = {
        a: human,
        b: aiTeam,
        aPlayers: [wanted],
        bPlayers: [offered],
        cashA: 0,
        cashB: 0,
        aPick: wantsPick && pickOwner(human, state.season + 1, 1) === human.id ? pickKey(state.season + 1, 1) : null,
        bPick: givesPick && pickOwner(aiTeam, state.season + 1, 1) === aiTeam.id ? pickKey(state.season + 1, 1) : null
      };
      const legal = validateTradeProposal(proposal);
      const humanChance = estimateTradeChance(human, aiTeam, proposal.aPlayers, proposal.bPlayers, proposal.aPick, proposal.bPick, legal);
      const aiGain = aiPlayerValue(wanted, aiTeam) - aiPlayerValue(offered, aiTeam) + (proposal.aPick ? 9 : 0) - (proposal.bPick ? 8 : 0);
      if (legal.ok && aiGain > 2 && humanChance >= 25) return proposal;
    }
  }
  return null;
}

function humanTradePriority(player, aiTeam) {
  let score = aiPlayerValue(player, aiTeam);
  if (player.tradeStatus === "shop") score += 16;
  if (isOnFire(player)) score += 8;
  return score;
}

function serializeOffer(proposal) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: "open",
    from: proposal.b.id,
    to: proposal.a.id,
    aPlayerIds: proposal.aPlayers.map((player) => player.id),
    bPlayerIds: proposal.bPlayers.map((player) => player.id),
    aPick: proposal.aPick,
    bPick: proposal.bPick,
    cashA: proposal.cashA,
    cashB: proposal.cashB,
    createdSeason: state.season,
    text: `${proposal.b.name} offered ${assetText(proposal.bPlayers, proposal.bPick)} for ${assetText(proposal.aPlayers, proposal.aPick)}.`
  };
}

function proposalFromOffer(offer) {
  const a = teamById(offer.to);
  const b = teamById(offer.from);
  if (!a || !b) return null;
  return {
    a,
    b,
    aPlayers: a.players.filter((player) => offer.aPlayerIds.includes(player.id)),
    bPlayers: b.players.filter((player) => offer.bPlayerIds.includes(player.id)),
    cashA: offer.cashA || 0,
    cashB: offer.cashB || 0,
    aPick: offer.aPick,
    bPick: offer.bPick
  };
}

function acceptOffer(offerId) {
  const offer = state.mailbox.find((item) => item.id === offerId);
  if (!offer || offer.status !== "open") return;
  const proposal = proposalFromOffer(offer);
  if (!proposal || !validateTradeProposal(proposal).ok) {
    moveOfferToTrash(offer, "expired");
    render();
    return;
  }
  applyTradeProposal(proposal);
  moveOfferToTrash(offer, "accepted");
  newsLog(`${humanTeam().name} accepted a trade request from ${teamById(offer.from).name}. ${tradeNewsDetails(proposal.aPlayers, proposal.bPlayers)}`);
  saveState();
  render();
}

function declineOffer(offerId) {
  const offer = state.mailbox.find((item) => item.id === offerId);
  if (!offer) return;
  if (offer.type === "extension") {
    const player = humanTeam().players.find((p) => p.id === offer.playerId);
    if (player) player.extensionNotice = false;
  }
  moveOfferToTrash(offer, "declined");
  if (offer.type !== "extension") createCounterOfferNotice(offer);
  saveState();
  render();
}

function moveOfferToTrash(offer, status) {
  offer.status = status;
  state.mailbox = state.mailbox.filter((item) => item.id !== offer.id);
  state.trash.unshift(offer);
  state.trash = state.trash.slice(0, 30);
}

function cleanupInvalidMailbox() {
  [...state.mailbox].forEach((offer) => {
    if (offer.type === "notice") return;
    if (offer.type === "extension") {
      if (!humanTeam().players.some((p) => p.id === offer.playerId)) moveOfferToTrash(offer, "expired");
      return;
    }
    const proposal = proposalFromOffer(offer);
    if (!proposal || !proposal.aPlayers.length || !proposal.bPlayers.length || !validateTradeProposal(proposal).ok) {
      moveOfferToTrash(offer, "expired");
    }
  });
}

function createCounterOfferNotice(offer) {
  const team = teamById(offer.from);
  if (!team) return;
  const ask = pickOwner(humanTeam(), state.season + 1, 2) === humanTeam().id ? `add your ${pickLabel(pickKey(state.season + 1, 2))}` : "add cash or a rotation player";
  state.mailbox.unshift({
    id: `counter-${offer.id}-${Date.now()}`,
    type: "notice",
    status: "open",
    from: offer.from,
    to: humanTeam().id,
    text: `${team.name} declined. Their follow-up: ${ask}.`
  });
}

function findAiTrade(team) {
  const partners = state.teams.filter((other) => other.id !== team.id && !isHumanTeam(other) && !isClaimedByAnyPlayer(other)).sort(() => Math.random() - 0.5);
  const sellers = [...team.players].sort((a, b) => aiTradeAwayScore(b, team) - aiTradeAwayScore(a, team)).slice(0, 4);
  for (const partner of partners) {
    const targets = [...partner.players].sort((a, b) => aiPlayerValue(b, team) - aiPlayerValue(a, team)).slice(0, 5);
    for (const outPlayer of sellers) {
      for (const inPlayer of targets) {
        const aPick = shouldAttachPick(team, outPlayer, inPlayer);
        const bPick = shouldAttachPick(partner, inPlayer, outPlayer);
        const proposal = { a: team, b: partner, aPlayers: [outPlayer], bPlayers: [inPlayer], cashA: 0, cashB: 0, aPick, bPick };
        const legal = validateTradeProposal(proposal);
        const gainA = aiPlayerValue(inPlayer, team) - aiPlayerValue(outPlayer, team) - (aPick ? 9 : 0) + (bPick ? 7 : 0);
        const gainB = aiPlayerValue(outPlayer, partner) - aiPlayerValue(inPlayer, partner) - (bPick ? 9 : 0) + (aPick ? 7 : 0);
        if (legal.ok && gainA > 3.5 && gainB > 1.5) return proposal;
      }
    }
  }
  return null;
}

function aiTradeAwayScore(player, team) {
  const salaryPressure = payroll(team) > investment(team) * 0.94 ? player.salaryPct * 1.2 : player.salaryPct * 0.35;
  const depthPenalty = rosterNeedScore(team, player.pos) < 1 ? 7 : 0;
  return salaryPressure + depthPenalty + Math.max(0, 74 - rating(player)) - player.contract * 0.6;
}

function shouldAttachPick(team, outgoing, incoming) {
  const year = state.season + 1;
  if (pickOwner(team, year, 1) !== team.id) return null;
  const contender = team.wins >= team.losses || teamStrength(team) > 86;
  return contender && rating(incoming) - rating(outgoing) > 7 && Math.random() < 0.35 ? pickKey(year, 1) : null;
}

function validateTradeProposal(proposal) {
  const { a, b, aPlayers, bPlayers, cashA, cashB } = proposal;
  const messages = [];
  if (!aPlayers.length && !bPlayers.length && !cashA && !cashB && !proposal.aPick && !proposal.bPick) messages.push("Add at least one asset.");
  if (cashA > a.cash) messages.push(`${a.name} does not have that much cash.`);
  if (cashB > b.cash) messages.push(`${b.name} does not have that much cash.`);
  if (proposal.aPick && ownerOfPickToken(a, proposal.aPick) !== a.id) messages.push(`${a.name} already traded ${pickLabel(proposal.aPick)}.`);
  if (proposal.bPick && ownerOfPickToken(b, proposal.bPick) !== b.id) messages.push(`${b.name} already traded ${pickLabel(proposal.bPick)}.`);
  const aIds = aPlayers.map((player) => player.id);
  const bIds = bPlayers.map((player) => player.id);
  const aAfterPlayers = [...a.players.filter((p) => !aIds.includes(p.id)), ...bPlayers];
  const bAfterPlayers = [...b.players.filter((p) => !bIds.includes(p.id)), ...aPlayers];
  const aAfterPay = payroll(a, aAfterPlayers);
  const bAfterPay = payroll(b, bAfterPlayers);
  if (aAfterPay > investment(a) + cashB - cashA) messages.push(`${a.name} would exceed investment.`);
  if (bAfterPay > investment(b) + cashA - cashB) messages.push(`${b.name} would exceed investment.`);
  if (aAfterPay > state.cap * HARD_CAP_MULT) messages.push(`${a.name} would exceed the hard cap.`);
  if (bAfterPay > state.cap * HARD_CAP_MULT) messages.push(`${b.name} would exceed the hard cap.`);
  const aOut = aPlayers.reduce((sum, p) => sum + salaryValue(p), 0);
  const bOut = bPlayers.reduce((sum, p) => sum + salaryValue(p), 0);
  if (Math.max(aOut, bOut) > 0 && Math.abs(aOut - bOut) > Math.max(8, Math.min(aOut, bOut) * 0.25 + 5)) messages.push("Salary matching fails.");
  return { ok: messages.length === 0, messages };
}

function applyTradeProposal(proposal) {
  if (!validateTradeProposal(proposal).ok) return false;
  const { a, b, aPlayers, bPlayers, cashA, cashB } = proposal;
  const aIds = aPlayers.map((player) => player.id);
  const bIds = bPlayers.map((player) => player.id);
  a.players = a.players.filter((player) => !aIds.includes(player.id)).concat(bPlayers);
  b.players = b.players.filter((player) => !bIds.includes(player.id)).concat(aPlayers);
  a.cash = a.cash - cashA + cashB;
  b.cash = b.cash - cashB + cashA;
  if (proposal.aPick) {
    const parsed = parsePickToken(proposal.aPick);
    setPickOwner(a, parsed.year, parsed.round, b.id);
  }
  if (proposal.bPick) {
    const parsed = parsePickToken(proposal.bPick);
    setPickOwner(b, parsed.year, parsed.round, a.id);
  }
  if (isHumanTeam(a)) normalizeRotation(a);
  else aiSetRotation(a);
  if (isHumanTeam(b)) normalizeRotation(b);
  else aiSetRotation(b);
  return true;
}

function assetText(players, pickIncluded) {
  const names = players.map((player) => player.name);
  if (pickIncluded) names.push(pickLabel(pickIncluded));
  return names.join(", ") || "cash";
}

function aiDraftUntilHuman() {
  if (!state.aiMode || state.phase !== "draft" || !state.draft) return;
  while (state.phase === "draft") {
    const pickInfo = state.draft.picks[state.draft.current];
    if (!pickInfo) break;
    const team = teamById(pickInfo.owner);
    if (!team || isHumanTeam(team)) break;
    const prospect = aiChooseProspect(team);
    draftPlayer(prospect.id, true);
    aiLog(`${team.name} drafted ${prospect.name} at ${pickInfo.round}.${pickInfo.pick}.`);
  }
}

function aiChooseProspect(team) {
  return [...state.draft.prospects].sort((a, b) => {
    const scoreA = rating(a) + rosterNeedScore(team, a.pos) * 3.2 - a.salaryPct * 0.35 + rand(-1.5, 1.5);
    const scoreB = rating(b) + rosterNeedScore(team, b.pos) * 3.2 - b.salaryPct * 0.35 + rand(-1.5, 1.5);
    return scoreB - scoreA;
  })[0];
}

function validateTrade() {
  const a = teamById($("teamSelect").value);
  const b = teamById($("tradeTarget").value);
  if (!a || !b || a.id === b.id) return { ok: false, messages: ["Choose a different target team."] };
  const aIds = checkedValues("tradeAPlayers");
  const bIds = checkedValues("tradeBPlayers");
  const aPlayers = a.players.filter((player) => aIds.includes(player.id));
  const bPlayers = b.players.filter((player) => bIds.includes(player.id));
  const cashA = Number($("cashA").value || 0);
  const cashB = Number($("cashB").value || 0);
  const messages = [];
  const pickA = selectedPickYear("pickA");
  const pickB = selectedPickYear("pickB");
  if (!aPlayers.length && !bPlayers.length && !cashA && !cashB && !pickA && !pickB) messages.push("Add at least one asset.");
  if (cashA > a.cash) messages.push(`${a.name} does not have that much cash.`);
  if (cashB > b.cash) messages.push(`${b.name} does not have that much cash.`);
  if (pickA && ownerOfPickToken(a, pickA) !== a.id) messages.push(`${a.name} already traded ${pickLabel(pickA)}.`);
  if (pickB && ownerOfPickToken(b, pickB) !== b.id) messages.push(`${b.name} already traded ${pickLabel(pickB)}.`);
  if (!canTradeNow()) messages.push("Trading is closed while rosters are frozen.");
  const aAfterPlayers = [...a.players.filter((p) => !aIds.includes(p.id)), ...bPlayers];
  const bAfterPlayers = [...b.players.filter((p) => !bIds.includes(p.id)), ...aPlayers];
  const aAfterPay = payroll(a, aAfterPlayers);
  const bAfterPay = payroll(b, bAfterPlayers);
  if (aAfterPay > investment(a) + cashB - cashA) messages.push(`${a.name} would exceed investment.`);
  if (bAfterPay > investment(b) + cashA - cashB) messages.push(`${b.name} would exceed investment.`);
  if (aAfterPay > state.cap * HARD_CAP_MULT) messages.push(`${a.name} would exceed the hard cap.`);
  if (bAfterPay > state.cap * HARD_CAP_MULT) messages.push(`${b.name} would exceed the hard cap.`);
  const aOut = aPlayers.reduce((sum, p) => sum + salaryValue(p), 0);
  const bOut = bPlayers.reduce((sum, p) => sum + salaryValue(p), 0);
  if (Math.max(aOut, bOut) > 0 && Math.abs(aOut - bOut) > Math.max(8, Math.min(aOut, bOut) * 0.25 + 5)) messages.push("Salary matching fails. Keep exchanged salaries within roughly 125% plus $5M.");
  return { ok: messages.length === 0, messages: messages.length ? messages : ["Trade is legal."] };
}

function selectedPickYear(id) {
  const value = $(id)?.value;
  return value || null;
}

function ownerOfPickToken(team, token) {
  const parsed = parsePickToken(token);
  return parsed ? pickOwner(team, parsed.year, parsed.round) : team.id;
}

function pickLabel(token) {
  const parsed = parsePickToken(token);
  return parsed ? `Season ${parsed.year} round ${parsed.round} pick` : "draft pick";
}

function canTradeNow() {
  return hasLocalControl() && ["regular", "draft-ready", "offseason"].includes(state.phase) && state.tradeWindow;
}

function executeTrade() {
  if (!hasLocalControl()) return render();
  const result = validateTrade();
  if (!result.ok) return renderTradeResult(result);
  const a = teamById($("teamSelect").value);
  const b = teamById($("tradeTarget").value);
  const aIds = checkedValues("tradeAPlayers");
  const bIds = checkedValues("tradeBPlayers");
  const aPlayers = a.players.filter((player) => aIds.includes(player.id));
  const bPlayers = b.players.filter((player) => bIds.includes(player.id));
  const chance = estimateTradeChance(a, b, aPlayers, bPlayers, selectedPickYear("pickA"), selectedPickYear("pickB"), result);
  if (Math.random() * 100 > chance) {
    const ask = selectedPickYear("pickA") ? "a better player or more cash" : `your ${pickLabel(pickKey(state.season + 1, 2))}`;
    state.mailbox.unshift({
      id: `reject-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: "notice",
      status: "open",
      from: b.id,
      to: a.id,
      text: `${b.name} rejected your proposal. They want you to add ${ask}.`
    });
    state.tradeHistory.unshift({ season: state.season, status: "rejected", text: `${b.name} rejected offer: ${assetText(aPlayers, selectedPickYear("pickA"))} for ${assetText(bPlayers, selectedPickYear("pickB"))}.` });
    saveState();
    render();
    return;
  }
  a.players = a.players.filter((player) => !aIds.includes(player.id)).concat(bPlayers);
  b.players = b.players.filter((player) => !bIds.includes(player.id)).concat(aPlayers);
  const cashA = Number($("cashA").value || 0);
  const cashB = Number($("cashB").value || 0);
  a.cash = a.cash - cashA + cashB;
  b.cash = b.cash - cashB + cashA;
  const pickA = selectedPickYear("pickA");
  const pickB = selectedPickYear("pickB");
  if (pickA) {
    const parsed = parsePickToken(pickA);
    setPickOwner(a, parsed.year, parsed.round, b.id);
  }
  if (pickB) {
    const parsed = parsePickToken(pickB);
    setPickOwner(b, parsed.year, parsed.round, a.id);
  }
  normalizeRotation(a);
  if (state.aiMode && !isHumanTeam(b) && !isClaimedByAnyPlayer(b)) aiSetRotation(b);
  else normalizeRotation(b);
  yourNewsLog(`${a.name} completed a trade with ${b.name}. ${tradeNewsDetails(aPlayers, bPlayers)}`);
  state.tradeHistory.unshift({ season: state.season, status: "accepted", text: `${a.name} traded ${assetText(aPlayers, selectedPickYear("pickA"))} to ${b.name} for ${assetText(bPlayers, selectedPickYear("pickB"))}.` });
  saveState();
  render();
}

function checkedValues(containerId) {
  return [...$(containerId).querySelectorAll("input:checked")].map((input) => input.value);
}

function render() {
  const active = hasLocalControl() ? humanTeam() : setupTeam();
  if (hasLocalControl()) {
    cleanupInvalidMailbox();
    checkExtensionNotices();
    resolveFreeAgentBids();
  }
  renderTeamSelect(active.id);
  renderChrome(active);
  renderDashboard(active);
  renderRoster(active);
  renderLeague();
  renderTrade(active);
  renderTradePanels();
  renderPlayoffs();
  renderDraft();
  renderFreeMarket();
  renderNews();
  renderMailbox();
  renderHistory();
  renderContractModal();
  renderSetupModal();
  saveState();
}

function renderSetupModal() {
  const modal = $("teamChoiceModal");
  if (!modal) return;
  if (hasLocalControl()) {
    modal.classList.add("hidden");
    return;
  }
  state.pendingTeamId = state.pendingTeamId || state.teams[0].id;
  modal.classList.remove("hidden");
  const mode = state.setupMode;
  $("setupTitle").textContent = mode === "multiplayer" ? "Join Multiplayer Room" : mode === "single" ? "Choose Your Team" : "Start League";
  $("setupBadge").textContent = mode === "multiplayer" ? (multiplayerSession.connected ? `Room ${multiplayerSession.roomKey}` : "Room setup") : "Season 1 setup";
  $("setupNotice").textContent = mode === "multiplayer"
    ? "Join a room key, then claim one unclaimed team. Claimed teams are controlled by other laptops."
    : mode === "single"
      ? "Pick one team to control for this 10-year run. The league will not begin until you confirm."
      : "Choose one-player mode or multiplayer mode before selecting a team.";
  $("modeChoiceGrid").classList.toggle("hidden", Boolean(mode));
  $("multiplayerSetup").classList.toggle("hidden", mode !== "multiplayer");
  $("singleModeBtn").classList.toggle("active", mode === "single");
  $("multiModeBtn").classList.toggle("active", mode === "multiplayer");
  if (!mode || (mode === "multiplayer" && !multiplayerSession.connected)) {
    $("teamChoiceGrid").innerHTML = "";
    $("confirmTeamBtn").disabled = true;
    $("confirmTeamBtn").textContent = mode === "multiplayer" ? "Join Room First" : "Choose Mode First";
    return;
  }
  $("teamChoiceGrid").innerHTML = state.teams.map((team) => `
    <button class="team-choice-card ${team.id === state.pendingTeamId ? "active" : ""}" data-choose-team="${team.id}" ${teamClaimDisabled(team) ? "disabled" : ""} style="border-top: 4px solid ${team.color}">
      <strong>${team.name}</strong>
      <span class="muted">${team.conf} Conference${teamClaimLabel(team)}</span>
    </button>
  `).join("");
  $("confirmTeamBtn").textContent = mode === "multiplayer" ? "Claim Team" : "Start League";
  $("confirmTeamBtn").disabled = !state.pendingTeamId || teamClaimDisabled(setupTeam());
  document.querySelectorAll("[data-choose-team]").forEach((button) => button.addEventListener("click", () => {
    state.pendingTeamId = button.dataset.chooseTeam;
    saveState();
    renderSetupModal();
    renderTeamSelect(state.pendingTeamId);
    renderChrome(setupTeam());
  }));
}

function teamClaimDisabled(team) {
  if (state.setupMode !== "multiplayer") return false;
  const claimedBy = state.multiplayer?.claims?.[team.id];
  return Boolean(claimedBy && claimedBy !== clientId);
}

function teamClaimLabel(team) {
  if (state.setupMode !== "multiplayer") return "";
  const claimedBy = state.multiplayer?.claims?.[team.id];
  if (!claimedBy) return " - open";
  return claimedBy === clientId ? " - yours" : " - claimed";
}

async function confirmTeamSelection() {
  if (hasLocalControl()) return;
  const selectedTeamId = state.pendingTeamId || state.teams[0].id;
  if (state.setupMode === "multiplayer") {
    const claimed = await claimMultiplayerTeam(selectedTeamId);
    if (!claimed) return;
    multiplayerSession.localTeamId = selectedTeamId;
    localStorage.setItem(localTeamKey(multiplayerSession.roomKey), selectedTeamId);
    state.userTeamId = null;
  } else {
    state.setupMode = "single";
    state.userTeamId = selectedTeamId;
  }
  state.pendingTeamId = selectedTeamId;
  state.teamLocked = true;
  state.setupComplete = true;
  state.scoutTeamId = state.teams.find((team) => team.id !== selectedTeamId)?.id || state.teams[0].id;
  if (!state.news.length) state.news = [`Season ${state.season}: League opened after ${teamById(selectedTeamId).name} was selected.`];
  state.yourNews.unshift(`Season ${state.season}: You chose ${teamById(selectedTeamId).name}. The first roster window is open.`);
  normalizeRotation(humanTeam());
  saveState();
  render();
}

function renderTradePanels() {
  const pending = state.mailbox.filter((offer) => offer.status === "open" && offer.type !== "extension");
  $("tradePendingPanel").innerHTML = pending.map((offer) => `<article class="news-item"><strong>${teamById(offer.from)?.name || "Team"} proposal</strong><span>${offer.text}</span></article>`).join("") || `<article class="news-item">No pending trade proposals.</article>`;
  $("tradeRecordsPanel").innerHTML = state.tradeHistory.map((row) => `<article class="news-item"><strong>Season ${row.season}: ${row.status}</strong><span>${row.text}</span></article>`).join("") || `<article class="news-item">No trade records yet.</article>`;
  $("mailboxDot").classList.toggle("hidden", !state.mailbox.some((offer) => offer.status === "open"));
}

function renderTeamSelect(activeId) {
  $("teamSelect").innerHTML = state.teams.map((team) => `<option value="${team.id}" ${team.id === activeId ? "selected" : ""}>${team.name}</option>`).join("");
  $("teamSelect").disabled = !state.setupComplete || state.teamLocked;
}

function renderChrome(active) {
  if (!hasLocalControl()) {
    $("seasonLabel").textContent = "Choose team";
    $("phaseLabel").textContent = "Team Selection";
    $("activeTeamName").textContent = active.name;
    $("teamSummary").textContent = state.setupMode === "multiplayer"
      ? "Join a room and claim one team. Shared league actions unlock after this laptop has a team."
      : "Season 1 has not started. No AI manager, trade, free-agent, mailbox, draft, or game activity will run until you confirm your team.";
    $("playNextBtn").textContent = "Choose Team First";
    ["playNextBtn", "simSeasonBtn", "playoffsBtn", "draftBtn", "newSeasonBtn"].forEach((id) => { $(id).disabled = true; });
    return;
  }
  $("seasonLabel").textContent = state.phase === "complete" ? "Dynasty complete" : `Season ${state.season} of 10`;
  $("phaseLabel").textContent = phaseText();
  $("activeTeamName").textContent = active.name;
  const leader = [...active.players].sort((a, b) => (b.stats.pts / Math.max(1, b.stats.gp)) - (a.stats.pts / Math.max(1, a.stats.gp)))[0];
  $("teamSummary").textContent = `${active.wins}-${active.losses}, payroll ${fmt(payroll(active))}, investment ${fmt(investment(active))}. Stat leader: ${leader.name} (${statLine(leader)}).`;
  $("playNextBtn").textContent = minTeamGamesPlayed() >= 9 ? "Finish Regular + Playoffs" : `Play Until Each Team Has ${nextTeamGameTarget()} Games`;
  $("playNextBtn").disabled = state.phase !== "regular";
  $("simSeasonBtn").disabled = state.phase !== "regular";
  $("playoffsBtn").disabled = state.phase !== "playoffs-ready";
  $("draftBtn").disabled = state.phase !== "draft-ready";
  $("newSeasonBtn").disabled = !["offseason", "draft-ready"].includes(state.phase);
}

function phaseText() {
  const map = {
    regular: "Regular Season",
    "playoffs-ready": "Regular Season Complete",
    playoffs: "Playoffs",
    "draft-ready": "Draft Ready",
    draft: "Draft Night",
    offseason: "Offseason",
    complete: "10-Year Results"
  };
  return map[state.phase] || state.phase;
}

function renderDashboard(active) {
  const game = state.schedule[state.gameIndex];
  $("scheduleProgress").textContent = `Team games ${minTeamGamesPlayed()}-${maxTeamGamesPlayed()} / 10`;
  $("nextGameBox").innerHTML = game ? `
    <div class="list-row"><strong>${teamById(game.away).name}</strong><span>at</span><strong>${teamById(game.home).name}</strong></div>
    <div class="status-line"><span class="pill">${state.tradeWindow ? "Trade window open" : "Roster frozen"}</span><span class="pill">Next stop: ${minTeamGamesPlayed() >= 9 ? "playoffs" : `all teams at ${nextTeamGameTarget()} games`}</span><span class="pill">Hidden form active</span></div>
  ` : `<div class="list-row"><strong>No regular season games left</strong><span>${phaseText()}</span></div>`;
  $("capSeason").textContent = `Cap ${fmt(state.cap)}`;
  $("financeBox").innerHTML = [
    ["Payroll", fmt(payroll(active))],
    ["Investment", fmt(investment(active))],
    ["Hard Cap", fmt(state.cap * HARD_CAP_MULT)],
    ["Cash", fmt(active.cash)],
    ["Dead Cap", fmt(deadCapTotal(active))]
  ].map(([label, value]) => `<div class="metric"><span class="muted">${label}</span><strong>${value}</strong></div>`).join("");
  $("gameLog").innerHTML = [...state.playoffLog, ...state.logs].slice(0, 10).map((log) => `<div class="log-row">${log.text}</div>`).join("") || `<div class="log-row">No games yet.</div>`;
  $("dashboardNews").innerHTML = state.news.slice(0, 8).map((line) => `<div class="log-row">${line}</div>`).join("") || `<div class="log-row">No news yet.</div>`;
  renderTeamIdentity(active);
  $("scoreStrip").innerHTML = state.teams.map((team) => `
    <div class="score-tile" style="border-top: 4px solid ${team.color}">
      <div class="score-line"><span>${shortName(team.name)}</span><span>${team.wins}-${team.losses}</span></div>
      <div class="muted">Payroll ${fmt(payroll(team))}</div>
    </div>
  `).join("");
}

function renderTeamIdentity(team) {
  const id = teamIdentity(team);
  const recs = teamRecommendations(team);
  $("teamIdentity").innerHTML = `
    <div class="metric"><span class="muted">Shot Profile</span><strong>${id.insideOutside > 6 ? "Inside" : id.insideOutside < -6 ? "Outside" : "Balanced"}</strong></div>
    <div class="metric"><span class="muted">Team Lean</span><strong>${id.offenseDefense > 6 ? "Offense" : id.offenseDefense < -6 ? "Defense" : "Balanced"}</strong></div>
    <div class="metric"><span class="muted">Payroll</span><strong>${fmt(payroll(team))}</strong></div>
    <div class="metric"><span class="muted">Trade Ideas</span><strong>${recs.length}</strong></div>
    <div class="summary-card wide">
      ${recs.map((rec) => `<div class="list-row"><span>${rec}</span><strong>Recommendation</strong></div>`).join("")}
    </div>
  `;
}

function renderRoster(team) {
  $("rosterTable").innerHTML = `
    ${renderCapHealth(team)}
    <table>
      <thead><tr><th>Player</th><th>Role</th><th>Trade Tag</th><th>Salary</th><th>Yrs</th><th>Stats</th><th>Actions</th></tr></thead>
      <tbody>
        ${team.players.sort((a, b) => b.starter - a.starter || b.minutes - a.minutes || rating(b) - rating(a)).map((player) => `
          <tr>
            <td><strong>${player.name}</strong>${playerIcons(player)}<br><span class="muted">${player.pos}, age ${player.age}${player.injury > 0 ? `, injured ${player.injury}g` : ""}</span></td>
            <td>
              <label class="check-row"><input type="checkbox" data-player="${player.id}" class="starterToggle" ${player.starter ? "checked" : ""} ${player.injury > 0 ? "disabled" : ""}> Starter</label>
              <input type="number" data-player="${player.id}" class="minutesInput" min="0" max="38" value="${Math.round(player.minutes)}" ${player.injury > 0 ? "disabled" : ""}>
            </td>
            <td>
              <select class="tradeStatusInput" data-player="${player.id}">
                <option value="normal" ${player.tradeStatus === "normal" ? "selected" : ""}>Normal</option>
                <option value="locked" ${player.tradeStatus === "locked" ? "selected" : ""}>Locked</option>
                <option value="shop" ${player.tradeStatus === "shop" ? "selected" : ""}>Supermarket</option>
              </select>
            </td>
            <td>${fmt(salaryValue(player))}<br><span class="muted">${int(player.salaryPct)}% cap</span></td>
            <td>${player.contract}</td>
            <td>${statLine(player)}</td>
            <td><div class="mini-actions">${player.contract <= 1 && !hasOpenExtension(player) ? `<button data-extend="${player.id}">Extend</button>` : ""}<button data-waive="${player.id}">Waive</button></div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
  document.querySelectorAll(".starterToggle").forEach((input) => input.addEventListener("change", updateRotation));
  document.querySelectorAll(".minutesInput").forEach((input) => input.addEventListener("change", updateRotation));
  document.querySelectorAll(".tradeStatusInput").forEach((input) => input.addEventListener("change", updateTradeStatus));
  document.querySelectorAll("[data-extend]").forEach((button) => button.addEventListener("click", () => openContractOffer("extension", button.dataset.extend)));
  document.querySelectorAll("[data-waive]").forEach((button) => button.addEventListener("click", () => waivePlayer(button.dataset.waive)));
}

function hasOpenExtension(player) {
  return state.mailbox.some((offer) => offer.type === "extension" && offer.playerId === player.id && offer.status === "open") ||
    (state.contractOffer?.type === "extension" && state.contractOffer?.playerId === player.id);
}

function renderCapHealth(team) {
  const pay = payroll(team);
  const capPct = clamp(pay / state.cap * 100, 0, 160);
  const investPct = clamp(pay / investment(team) * 100, 0, 160);
  const status = pay > state.cap * HARD_CAP_MULT ? "bad" : pay > investment(team) ? "warn" : pay > state.cap ? "warn" : "";
  return `
    <div class="cap-bars">
      <div class="summary-line"><span class="pill ${status}">Payroll ${fmt(pay)}</span><span class="pill">Cap ${fmt(state.cap)}</span><span class="pill">Investment ${fmt(investment(team))}</span><span class="pill">Hard cap ${fmt(state.cap * HARD_CAP_MULT)}</span></div>
      <div class="cap-bar"><div class="cap-fill ${status}" style="width:${Math.min(100, capPct)}%"></div></div>
      <div class="muted">${pay > state.cap ? `Above cap by ${fmt(pay - state.cap)}` : `Under cap by ${fmt(state.cap - pay)}`}; ${pay > investment(team) ? `over investment by ${fmt(pay - investment(team))}` : `investment room ${fmt(investment(team) - pay)}`}.</div>
    </div>`;
}

function updateRotation(event) {
  const team = teamById($("teamSelect").value);
  const player = team.players.find((p) => p.id === event.target.dataset.player);
  if (!player) return;
  if (event.target.classList.contains("starterToggle")) player.starter = event.target.checked;
  if (event.target.classList.contains("minutesInput")) player.minutes = clamp(Number(event.target.value), 0, 38);
  const starters = team.players.filter((p) => p.starter);
  if (starters.length > 5) {
    player.starter = false;
    alert("Only five starters allowed.");
  }
  saveState();
  render();
}

function updateTradeStatus(event) {
  const team = humanTeam();
  const player = team.players.find((p) => p.id === event.target.dataset.player);
  if (!player) return;
  player.tradeStatus = event.target.value;
  newsLog(`${player.name} is now marked ${player.tradeStatus === "shop" ? "on the supermarket" : player.tradeStatus}.`);
  if (player.tradeStatus === "shop") generateMailboxOffers();
  saveState();
  render();
}

function waivePlayer(playerId) {
  const team = humanTeam();
  if (!canTradeNow()) {
    alert("Waivers are only allowed during trade windows.");
    return;
  }
  const player = team.players.find((p) => p.id === playerId);
  if (!player) return;
  const remainingSalary = salaryValue(player) * Math.max(1, player.contract);
  const buyout = remainingSalary * 0.25;
  if (team.cash < buyout) {
    alert(`Not enough cash. Waiving ${player.name} requires ${fmt(buyout)} compensation.`);
    return;
  }
  if (!confirm(`Waive ${player.name}? You pay ${fmt(buyout)} cash and stretch ${fmt(remainingSalary)} over ${player.contract * 2 + 1} seasons as dead cap.`)) return;
  team.cash -= buyout;
  const years = player.contract * 2 + 1;
  team.deadCap.push({ name: player.name, amount: remainingSalary / years, years });
  team.players = team.players.filter((p) => p.id !== player.id);
  normalizeRotation(team);
  newsLog(`${team.name} waived ${player.name}. Dead cap: ${fmt(remainingSalary / years)} for ${years} seasons.`);
  saveState();
  render();
}

function statLine(player) {
  if (!player.stats.gp) return "0 GP";
  return `${(player.stats.pts / player.stats.gp).toFixed(1)} PPG, ${(player.stats.reb / player.stats.gp).toFixed(1)} RPG, ${(player.stats.ast / player.stats.gp).toFixed(1)} APG`;
}

function renderLeague() {
  $("standingsBox").innerHTML = ["East", "West"].map((conf) => `
    <section class="panel">
      <div class="panel-heading"><h3>${conf}</h3><span>W-L, diff</span></div>
      ${standings(conf).map((team, i) => `<button class="list-row" data-scout="${team.id}"><span>${i + 1}. ${team.name}</span><strong>${team.wins}-${team.losses} (${team.pf - team.pa})</strong></button>`).join("")}
    </section>
  `).join("");
  document.querySelectorAll("[data-scout]").forEach((button) => button.addEventListener("click", () => {
    state.scoutTeamId = button.dataset.scout;
    saveState();
    renderLeague();
  }));
  renderLeagueTeamDetail();
  $("profilesBox").innerHTML = state.teams.map((team) => `
    <section class="profile">
      <h3><span>${team.name}</span><span class="pill">${team.conf}</span></h3>
      <div class="status-line"><span class="pill">Payroll ${fmt(payroll(team))}</span><span class="pill">Cash ${fmt(team.cash)}</span><span class="pill">Next R1: ${shortName(teamById(pickOwner(team, state.season + 1, 1))?.name || team.name)}</span><span class="pill">Next R2: ${shortName(teamById(pickOwner(team, state.season + 1, 2))?.name || team.name)}</span></div>
      <table class="mini-table">
        <thead><tr><th>Player</th><th>Avg</th><th>Salary</th><th>Health</th></tr></thead>
        <tbody>${team.players.slice().sort((a, b) => rating(b) - rating(a)).slice(0, 8).map((player) => `<tr><td>${player.name}${playerIcons(player)}<br><span class="muted">Age ${player.age}</span></td><td>${statLine(player)}</td><td>${fmt(salaryValue(player))}</td><td>${Math.round(player.health)}${player.injury > 0 ? ` (${player.injury}g)` : ""}</td></tr>`).join("")}</tbody>
      </table>
    </section>
  `).join("");
}

function renderLeagueTeamDetail() {
  const team = teamById(state.scoutTeamId) || state.teams.find((item) => !isHumanTeam(item)) || state.teams[0];
  const id = teamIdentity(team);
  $("leagueTeamDetail").innerHTML = `
    <div class="panel-heading"><h3>${team.name} Detailed Roster</h3><span>${team.conf}</span></div>
    <div class="status-line">
      <span class="pill">Payroll ${fmt(payroll(team))}</span>
      <span class="pill">Dead cap ${fmt(deadCapTotal(team))}</span>
      <span class="pill">${id.insideOutside > 6 ? "Inside-heavy" : id.insideOutside < -6 ? "Outside-heavy" : "Balanced scoring"}</span>
      <span class="pill">${id.offenseDefense > 6 ? "Offense-first" : id.offenseDefense < -6 ? "Defense-first" : "Two-way balance"}</span>
    </div>
    <table class="mini-table">
      <thead><tr><th>Player</th><th>Role</th><th>Salary</th><th>Contract</th><th>Stats</th><th>Tag</th></tr></thead>
      <tbody>${team.players.slice().sort((a, b) => rating(b) - rating(a)).map((player) => `
        <tr>
          <td>${player.name}${playerIcons(player)}<br><span class="muted">${player.pos}, age ${player.age}</span></td>
          <td>${player.starter ? "Starter" : player.minutes > 0 ? "Rotation" : "Bench"} (${int(player.minutes)}m)</td>
          <td>${fmt(salaryValue(player))}</td>
          <td>${player.contract} yrs</td>
          <td>${statLine(player)}</td>
          <td>${player.tradeStatus === "shop" ? "Supermarket" : player.tradeStatus === "locked" ? "Locked" : "Normal"}</td>
        </tr>
      `).join("")}</tbody>
    </table>
  `;
}

function renderTrade(active) {
  $("tradeTeamA").textContent = active.name;
  const targetId = $("tradeTarget").value && $("tradeTarget").value !== active.id ? $("tradeTarget").value : state.teams.find((team) => team.id !== active.id).id;
  $("tradeTarget").innerHTML = state.teams.filter((team) => team.id !== active.id).map((team) => `<option value="${team.id}" ${team.id === targetId ? "selected" : ""}>${team.name}</option>`).join("");
  const target = teamById($("tradeTarget").value);
  $("tradeWindowNotice").textContent = canTradeNow()
    ? `Trade window open. Teams have played ${minTeamGamesPlayed()}-${maxTeamGamesPlayed()} games. Rosters freeze again when you play the next window.`
    : "Trading is closed. Play to the next roster-freeze window.";
  renderPickSelect("pickA", active);
  renderPickSelect("pickB", target);
  $("tradeAPlayers").innerHTML = tradeChecks(active);
  $("tradeBPlayers").innerHTML = tradeChecks(target);
  ["cashA", "cashB", "pickA", "pickB"].forEach((id) => $(id).oninput = () => renderTradeResult(validateTrade()));
  document.querySelectorAll("#tradeAPlayers input, #tradeBPlayers input").forEach((input) => input.addEventListener("change", () => renderTradeResult(validateTrade())));
  renderTradeResult(validateTrade());
}

function renderPickSelect(id, team) {
  const years = [1, 2, 3].map((offset) => draftYear(offset));
  $(id).innerHTML = `<option value="">No pick</option>${years.flatMap((year) => [1, 2].map((round) => {
    const token = pickKey(year, round);
    const owner = teamById(pickOwner(team, year, round));
    const disabled = owner?.id !== team.id ? "disabled" : "";
    const label = `Season ${year} round ${round} pick${disabled ? ` (${owner?.name || "traded"})` : ""}`;
    return `<option value="${token}" ${disabled}>${label}</option>`;
  })).join("")}`;
}

function tradeChecks(team) {
  return team.players.slice().sort((a, b) => rating(b) - rating(a)).map((player) => `
    <label class="check-row"><input type="checkbox" value="${player.id}"> <span>${player.name}${playerIcons(player)} <span class="muted">Age ${player.age}, ${fmt(salaryValue(player))}, ${statLine(player)}</span></span></label>
  `).join("");
}

function renderTradeResult(result) {
  $("tradeResult").innerHTML = `<div class="status-line">${result.messages.map((msg) => `<span class="pill ${result.ok ? "good" : "bad"}">${msg}</span>`).join("")}</div>`;
  $("tradeSummary").innerHTML = renderTradeSummary(result);
  $("submitTradeBtn").disabled = !result.ok;
}

function renderTradeSummary(result) {
  const a = humanTeam();
  const b = teamById($("tradeTarget").value);
  if (!a || !b) return "";
  const aIds = checkedValues("tradeAPlayers");
  const bIds = checkedValues("tradeBPlayers");
  const aPlayers = a.players.filter((player) => aIds.includes(player.id));
  const bPlayers = b.players.filter((player) => bIds.includes(player.id));
  const aSalary = aPlayers.reduce((sum, player) => sum + salaryValue(player), 0);
  const bSalary = bPlayers.reduce((sum, player) => sum + salaryValue(player), 0);
  const chance = estimateTradeChance(a, b, aPlayers, bPlayers, selectedPickYear("pickA"), selectedPickYear("pickB"), result);
  return `
    <div class="summary-card">
      <h4>${a.name} sends</h4>
      ${summaryAssets(aPlayers, selectedPickYear("pickA"), Number($("cashA").value || 0))}
      <div class="summary-line"><span class="pill">Total salary ${fmt(aSalary)}</span></div>
    </div>
    <div class="summary-card">
      <h4>${b.name} sends</h4>
      ${summaryAssets(bPlayers, selectedPickYear("pickB"), Number($("cashB").value || 0))}
      <div class="summary-line"><span class="pill">Total salary ${fmt(bSalary)}</span></div>
    </div>
    <div class="summary-card">
      <h4>Estimated Acceptance</h4>
      <div class="status-line"><span class="pill ${chance >= 65 ? "good" : chance >= 35 ? "warn" : "bad"}">${chance}%</span><span class="pill">${result.ok ? "Legal framework" : "Blocked by rules"}</span></div>
    </div>
  `;
}

function summaryAssets(players, pickYear, cash) {
  const playerRows = players.map((player) => `<div class="list-row"><span>${player.name}${playerIcons(player)} <span class="muted">Age ${player.age}</span></span><strong>${fmt(salaryValue(player))}, ${statLine(player)}</strong></div>`).join("");
  const pickRow = pickYear ? `<div class="list-row"><span>${pickLabel(pickYear)}</span><strong>future asset</strong></div>` : "";
  const cashRow = cash ? `<div class="list-row"><span>Cash</span><strong>${fmt(cash)}</strong></div>` : "";
  return playerRows + pickRow + cashRow || `<div class="muted">No assets selected.</div>`;
}

function estimateTradeChance(a, b, aPlayers, bPlayers, pickA, pickB, result) {
  if (!result.ok) return 0;
  const outgoing = bPlayers.reduce((sum, player) => sum + aiPlayerValue(player, b), 0) + (pickB ? 8 : 0);
  const incoming = aPlayers.reduce((sum, player) => sum + aiPlayerValue(player, b), 0) + (pickA ? 10 : 0);
  const salaryRelief = Math.max(0, payroll(b) - investment(b) * 0.95) / 2;
  const score = 45 + (incoming - outgoing) * 3 + salaryRelief;
  return clamp(Math.round(score), 5, 95);
}

function tradeNewsDetails(sent, received) {
  const left = sent.map(playerTradeLine).join("; ") || "no players";
  const right = received.map(playerTradeLine).join("; ") || "no players";
  return `Key stats: ${left} for ${right}.`;
}

function playerTradeLine(player) {
  return `${player.name} (${statLine(player)}, ${fmt(salaryValue(player))})`;
}

function playerNameLine(player) {
  return `${player.name}${playerIcons(player)} <span class="muted">Age ${player.age || "?"}</span>`;
}

function renderDraft() {
  aiDraftUntilHuman();
  if (!state.draft) {
    $("draftStatus").textContent = phaseText();
    $("draftBoard").innerHTML = `<div class="list-row"><strong>Draft is not active</strong><span>Finish playoffs first</span></div>`;
    $("prospectList").innerHTML = "";
    return;
  }
  const current = state.draft.picks[state.draft.current];
  $("draftStatus").textContent = current ? `Season ${state.draft.year}, round ${current.round}, pick ${current.pick}: ${teamById(current.owner).name}` : `Season ${state.draft.year} complete`;
  const currentTeam = current ? teamById(current.owner) : null;
  const humanOnClock = currentTeam && isHumanTeam(currentTeam);
  $("draftBoard").innerHTML = state.draft.picks.map((p, i) => `<div class="list-row"><span>${p.round}.${p.pick} ${teamById(p.owner).name}</span><strong>${i < state.draft.current ? p.player || "Made" : i === state.draft.current ? "On clock" : "Waiting"}</strong></div>`).join("");
  $("prospectList").innerHTML = state.draft.prospects.map((player) => `
    <div class="prospect">
      <div><strong>${player.name}</strong>${playerIcons(player)}<br><span class="muted">${player.pos}, age ${player.age}, estimated ability ${int(rating(player))}, rookie salary ${int(player.salaryPct)}% cap</span></div>
      <button data-draft="${player.id}" ${state.phase !== "draft" || !humanOnClock ? "disabled" : ""}>Draft</button>
    </div>
  `).join("");
  document.querySelectorAll("[data-draft]").forEach((button) => button.addEventListener("click", () => draftPlayer(button.dataset.draft)));
}

function renderPlayoffs() {
  if (!state.playoffBracket.length) {
    $("playoffBracket").innerHTML = `<section class="panel"><h3>No Playoff Results</h3><p class="muted">Run playoffs after the regular season to fill the bracket.</p></section>`;
    return;
  }
  const rounds = ["East Semi", "West Semi", "East Final", "West Final", "Final"];
  $("playoffBracket").innerHTML = rounds.map((round) => {
    const games = state.playoffBracket.filter((series) => series.round === round);
    return `
      <section class="bracket-round">
        <h3>${round}</h3>
        ${games.map((series) => `
          <div class="bracket-card">
            <strong>${teamById(series.winner).name} ${series.score}</strong>
            <div class="muted">over ${teamById(series.loser).name}</div>
            <div class="status-line"><span class="pill good">Winner</span></div>
            <p class="muted">${series.key}</p>
          </div>
        `).join("") || `<div class="bracket-card"><span class="muted">Waiting</span></div>`}
      </section>`;
  }).join("");
}

function renderNews() {
  $("yourNewsBox").innerHTML = state.yourNews.map((line) => `<article class="news-item"><strong>${line.split(": ")[0]}</strong><span>${line.split(": ").slice(1).join(": ") || line}</span></article>`).join("") || `<article class="news-item">No personal news yet.</article>`;
  $("newsBox").innerHTML = state.news.map((line) => `<article class="news-item"><strong>${line.split(": ")[0]}</strong><span>${line.split(": ").slice(1).join(": ") || line}</span></article>`).join("") || `<article class="news-item">No news yet.</article>`;
}

function renderFreeMarket() {
  $("freeMarketBox").innerHTML = state.freeAgents.map((fa) => {
    const bid = fa.highBid;
    return `
      <article class="news-item">
        <strong>${fa.player.name}${playerIcons(fa.player)} <span class="pill">${fa.player.pos}</span></strong>
        <div class="status-line">
          <span class="pill">Stats: ${statLine(fa.player)}</span>
          <span class="pill">Mother team: ${teamById(fa.motherTeamId)?.name || "Unknown"}</span>
          <span class="pill">${bid ? `High bid: ${teamById(bid.teamId)?.name}, ${bid.salaryPct}% for ${bid.years}y` : "No bids"}</span>
          <span class="pill">${freeAgentRemaining(fa)}</span>
        </div>
        <div class="mini-actions"><button data-bid-fa="${fa.id}">Open Bid Window</button></div>
      </article>
    `;
  }).join("") || `<article class="news-item">No free players yet. Expired contracts enter this market after the offseason rollover.</article>`;
  document.querySelectorAll("[data-bid-fa]").forEach((button) => {
    button.addEventListener("click", () => {
      const fa = state.freeAgents.find((item) => item.id === button.dataset.bidFa);
      if (fa) openContractOffer("freeAgent", fa.player.id, fa.id);
    });
  });
}

function renderMailbox() {
  const offers = state.mailbox || [];
  const activeHtml = offers.map((offer) => {
    if (offer.type === "extension") {
      const player = humanTeam().players.find((p) => p.id === offer.playerId);
      return `
        <article class="news-item">
          <strong>Extension notice <span class="pill ${offer.status === "open" ? "good" : "warn"}">${offer.status}</span></strong>
          <p class="muted">${offer.text}</p>
          <div class="mini-actions">
            <button data-open-extension="${offer.id}" ${offer.status !== "open" || !player ? "disabled" : ""}>Open Extension Window</button>
            <button data-decline-offer="${offer.id}" ${offer.status !== "open" ? "disabled" : ""}>Dismiss</button>
          </div>
        </article>
      `;
    }
    if (offer.type === "notice") {
      return `
        <article class="news-item">
          <strong>${teamById(offer.from)?.name || "Manager"} notice <span class="pill warn">${offer.status}</span></strong>
          <p class="muted">${offer.text}</p>
          <div class="mini-actions"><button data-decline-offer="${offer.id}">Move to Trash</button></div>
        </article>
      `;
    }
    const proposal = proposalFromOffer(offer);
    const legal = proposal ? validateTradeProposal(proposal) : { ok: false };
    const incoming = proposal ? summaryAssets(proposal.bPlayers, proposal.bPick, proposal.cashB || 0) : "";
    const outgoing = proposal ? summaryAssets(proposal.aPlayers, proposal.aPick, proposal.cashA || 0) : "";
    return `
      <article class="news-item">
        <strong>${teamById(offer.from)?.name || "Unknown Team"} trade request <span class="pill ${offer.status === "open" ? "good" : "warn"}">${offer.status}</span></strong>
        <p class="muted">${offer.text}</p>
        <div class="summary-card"><h4>You receive</h4>${incoming}</div>
        <div class="summary-card"><h4>You send</h4>${outgoing}</div>
        <div class="status-line"><span class="pill ${legal.ok ? "good" : "bad"}">${legal.ok ? "Still legal" : "No longer legal"}</span></div>
        <div class="mini-actions">
          <button data-accept-offer="${offer.id}" ${offer.status !== "open" || !legal.ok ? "disabled" : ""}>Accept</button>
          <button data-decline-offer="${offer.id}" ${offer.status !== "open" ? "disabled" : ""}>Decline</button>
        </div>
      </article>
    `;
  }).join("") || `<article class="news-item">No trade requests yet. Mark a player as supermarket or wait for the next trade window.</article>`;
  const trashHtml = (state.trash || []).slice(0, 8).map((offer) => `<article class="news-item"><strong>Trash: ${offer.status}</strong><span>${offer.text || "Old mailbox item"}</span></article>`).join("");
  $("mailboxBox").innerHTML = `${activeHtml}${trashHtml ? `<article class="news-item"><strong>Trash</strong><span>Declined and expired mail.</span></article>${trashHtml}` : ""}`;
  document.querySelectorAll("[data-open-extension]").forEach((button) => button.addEventListener("click", () => {
    const offer = state.mailbox.find((item) => item.id === button.dataset.openExtension);
    if (!offer) return;
    openContractOffer("extension", offer.playerId, null, offer.proposal);
  }));
  document.querySelectorAll("[data-accept-offer]").forEach((button) => button.addEventListener("click", () => acceptOffer(button.dataset.acceptOffer)));
  document.querySelectorAll("[data-decline-offer]").forEach((button) => button.addEventListener("click", () => declineOffer(button.dataset.declineOffer)));
}

function renderHistory() {
  const totals = state.teams.map((team) => {
    const champs = state.champions.filter((row) => row.champ === team.id).length;
    const runners = state.champions.filter((row) => row.runner === team.id).length;
    const confFinals = state.champions.filter((row) => row.east === team.id || row.west === team.id).length;
    return { team, champs, runners, confFinals };
  }).sort((a, b) => b.champs - a.champs || b.runners - a.runners || b.confFinals - a.confFinals || b.team.wins - a.team.wins);
  $("historyBox").innerHTML = `
    <section class="panel">
      <div class="panel-heading"><h3>Final Ranking</h3><span>${state.champions.length} seasons completed</span></div>
      ${totals.map((row, i) => `<div class="list-row"><span>${i + 1}. ${row.team.name}</span><strong>${row.champs} titles, ${row.runners} 2nd, ${row.confFinals} CF</strong></div>`).join("")}
    </section>
    <section class="panel">
      <div class="panel-heading"><h3>Championship Log</h3><span>Season by season</span></div>
      ${state.champions.map((row) => `<div class="list-row"><span>Season ${row.season}</span><strong>${teamById(row.champ).name} over ${teamById(row.runner).name}</strong></div>`).join("") || `<div class="list-row"><span>No champions yet</span><strong>Play on</strong></div>`}
    </section>`;
}

function shortName(name) {
  return name.replace("Oklahoma City", "OKC").replace("Los Angeles", "LA").replace("Minnesota", "MIN").replace("Milwaukee", "MIL").replace("Cleveland", "CLE").replace("New York", "NY").replace("Boston", "BOS").replace("Denver", "DEN");
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

document.querySelectorAll("[data-trade-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-trade-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.tradeTab === button.dataset.tradeTab));
    $("tradeBuilderPanel").classList.toggle("hidden", button.dataset.tradeTab !== "builder");
    $("tradePendingPanel").classList.toggle("hidden", button.dataset.tradeTab !== "pending");
    $("tradeRecordsPanel").classList.toggle("hidden", button.dataset.tradeTab !== "records");
  });
});

document.querySelectorAll("[data-news-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-news-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.newsTab === button.dataset.newsTab));
    $("yourNewsBox").classList.toggle("hidden", button.dataset.newsTab !== "your");
    $("newsBox").classList.toggle("hidden", button.dataset.newsTab !== "all");
  });
});

function switchView(viewName) {
  document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const view = $(`${viewName}View`);
  if (view) view.classList.add("active");
}

$("teamSelect").addEventListener("change", () => {
  if (!state.setupComplete) {
    state.pendingTeamId = $("teamSelect").value;
    render();
    return;
  }
  if (state.teamLocked) {
    render();
    return;
  }
  state.userTeamId = $("teamSelect").value;
  newsLog(`You selected ${humanTeam().name}. This team will lock when the first games are played.`);
  runAiManagers("new user team");
  render();
});
$("tradeTarget").addEventListener("change", () => renderTrade(teamById($("teamSelect").value)));
$("playNextBtn").addEventListener("click", playNextGame);
$("simSeasonBtn").addEventListener("click", runRegularSeason);
$("playoffsBtn").addEventListener("click", runPlayoffs);
$("draftBtn").addEventListener("click", startDraft);
$("newSeasonBtn").addEventListener("click", nextSeason);
$("submitTradeBtn").addEventListener("click", executeTrade);
$("closeContractBtn").addEventListener("click", closeContractOffer);
$("submitContractBtn").addEventListener("click", submitContractOffer);
["contractSalary", "contractYears", "contractOption"].forEach((id) => $(id).addEventListener("input", updateContractOfferFromInputs));
$("confirmTeamBtn").addEventListener("click", confirmTeamSelection);
$("singleModeBtn").addEventListener("click", () => selectGameMode("single"));
$("multiModeBtn").addEventListener("click", () => selectGameMode("multiplayer"));
$("joinRoomBtn").addEventListener("click", joinMultiplayerRoom);
$("roomKeyInput").addEventListener("input", (event) => {
  event.target.value = sanitizeRoomKey(event.target.value);
});
$("resetBtn").addEventListener("click", () => {
  if (confirm("Reset the full 10-year league?")) {
    localStorage.removeItem(SAVE_KEY);
    stopMultiplayerPolling();
    multiplayerSession.connected = false;
    multiplayerSession.roomKey = "";
    multiplayerSession.localTeamId = null;
    multiplayerSession.version = 0;
    state = createNewState();
    render();
  }
});

render();
setInterval(() => {
  if (state.freeAgents?.some((fa) => fa.bidEndsAt && !fa.signed)) render();
}, 5000);
