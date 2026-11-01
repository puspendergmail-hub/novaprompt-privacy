/**
 * Player profile store — offline-first. Persisted to localStorage; large
 * blobs (character images, custom sounds) live in IndexedDB (see idb.js).
 *
 * When signed in online, server-authoritative fields (coins, diamonds, xp,
 * inventory, online stats) are overwritten from the Firestore snapshot.
 * Offline-earned progress is queued in `offline.pending` and synchronised
 * through the `syncOfflineProgress` Cloud Function, which applies daily caps.
 */
import {
  ITEM, DEFAULT_EQUIPPED, DAILY_REWARDS, ACHIEVEMENTS, MISSION_POOL,
} from './catalog.js';

const KEY = 'neon-takkar.profile.v1';
const listeners = new Set();

function randomId(len = 8) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint32Array(len));
  for (const n of buf) s += a[n % a.length];
  return s;
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaults() {
  const inventory = {};
  for (const id of Object.values(DEFAULT_EQUIPPED)) inventory[id] = true;
  for (const it of Object.values(ITEM)) if (!it.cost) inventory[it.id] = true;
  return {
    v: 1,
    playerId: 'NT-' + randomId(8),
    name: 'Player' + Math.floor(1000 + Math.random() * 9000),
    level: 1, xp: 0, coins: 1000, diamonds: 20,
    stats: {
      ludo: { played: 0, won: 0, lost: 0, captures: 0, sixes: 0 },
      chess: { played: 0, won: 0, lost: 0, draw: 0, captures: 0 },
      snake: { played: 0, food: 0, best: { classic: 0, portal: 0 } },
    },
    history: [],
    achievements: {},
    inventory,
    equipped: { ...DEFAULT_EQUIPPED },
    gotiColor: '#9B4DFF',
    gotiGlow: true,
    activeCharacter: null, // character used as the face of my Ludo goti
    avatarCharacter: null, // character used as my profile avatar
    avatarUsePhoto: false, // use Google profile photo as avatar
    characters: [],
    sounds: { assign: {}, custom: [] },
    settings: {
      music: true, sfx: true, musicVol: 0.35, sfxVol: 0.8, vibration: true,
      lang: 'en', gfx: 'high', speech: true, dialogues: true,
    },
    daily: { last: null, streak: 0 },
    missions: { date: null, list: [], progress: {}, claimed: {} },
    tournament: null,
    account: { mode: 'none', uid: null, email: null, photo: null },
    offline: { pending: [] },
    blocked: [],
    blockedNames: {},
    onlineStats: null,
    tutorialSeen: false,
    createdAt: Date.now(),
  };
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && v && typeof v === 'object' && !Array.isArray(v)
      ? deepMerge(base[k], v) : v;
  }
  return out;
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return deepMerge(defaults(), JSON.parse(raw));
  } catch { /* corrupted or blocked storage */ }
  return defaults();
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
  }, 60);
}

/** True when the player has signed up with Gmail (Google), not a guest. */
export const isAccount = (s = state) => s.account.mode === 'google';

/** Summary of local guest progress, imported (with caps) into a new account. */
export function guestSummary() {
  return {
    coins: state.coins, diamonds: state.diamonds, level: state.level, xp: state.xp,
    items: Object.keys(state.inventory).filter((k) => state.inventory[k]),
  };
}

export const store = {
  get: () => state,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  update(fn) {
    fn(state);
    persist();
    for (const l of listeners) l(state);
  },
  reset() {
    state = defaults();
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    persist();
    for (const l of listeners) l(state);
  },
  flush() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  },
};

/* ------------------------------- XP -------------------------------- */
export const xpForLevel = (lvl) => 200 + (lvl - 1) * 120;

function addXp(s, amount, out) {
  s.xp += amount;
  while (s.xp >= xpForLevel(s.level)) {
    s.xp -= xpForLevel(s.level);
    s.level += 1;
    s.coins += 150;
    s.diamonds += 5;
    out.levelUps.push(s.level);
  }
}

/* --------------------------- currencies ---------------------------- */
export function canAfford(cost) {
  if (!cost) return true;
  return (cost.coins || 0) <= state.coins && (cost.diamonds || 0) <= state.diamonds;
}

/** Local purchase (used offline / when not signed in). */
export function buyLocal(itemId) {
  const it = ITEM[itemId];
  if (!it) throw new Error('Unknown item');
  if (state.inventory[itemId]) throw new Error('Already owned');
  if (it.level && state.level < it.level) throw new Error(`Unlocks at level ${it.level}`);
  if (!canAfford(it.cost)) throw new Error('Not enough currency');
  const result = { achievements: [] };
  store.update((s) => {
    s.coins -= it.cost?.coins || 0;
    s.diamonds -= it.cost?.diamonds || 0;
    s.inventory[itemId] = true;
    checkAchievements(s, result);
  });
  return result;
}

export function equip(itemId) {
  const it = ITEM[itemId];
  if (!it || !state.inventory[itemId]) throw new Error('Not owned');
  store.update((s) => { s.equipped[it.cat] = itemId; });
}

/* -------------------------- daily reward --------------------------- */
export function dailyStatus() {
  const today = todayKey();
  const last = state.daily.last;
  const yesterday = todayKey(new Date(Date.now() - 86400000));
  const canClaim = last !== today;
  const streak = last === yesterday || last === today ? state.daily.streak : 0;
  const dayIndex = canClaim ? streak % 7 : (streak - 1 + 7) % 7;
  return { canClaim, streak, dayIndex, reward: DAILY_REWARDS[dayIndex] };
}

export function claimDailyLocal() {
  const st = dailyStatus();
  if (!st.canClaim) throw new Error('Already claimed today');
  const result = { reward: st.reward, achievements: [] };
  store.update((s) => {
    s.coins += st.reward.coins || 0;
    s.diamonds += st.reward.diamonds || 0;
    s.daily = { last: todayKey(), streak: st.streak + 1 };
    checkAchievements(s, result);
  });
  return result;
}

/* ----------------------------- missions ---------------------------- */
function seededPick(seed, arr, n) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

export function ensureMissions() {
  const today = todayKey();
  if (state.missions.date !== today) {
    store.update((s) => {
      s.missions = { date: today, list: seededPick(today, MISSION_POOL, 3).map((m) => m.id), progress: {}, claimed: {} };
    });
  }
  return state.missions.list.map((id) => {
    const m = MISSION_POOL.find((x) => x.id === id);
    return { ...m, progress: Math.min(m.target, state.missions.progress[id] || 0), claimed: !!state.missions.claimed[id] };
  });
}

export function bumpMission(id, by = 1) {
  if (state.missions.date !== todayKey()) ensureMissions();
  if (!state.missions.list.includes(id)) return;
  store.update((s) => { s.missions.progress[id] = (s.missions.progress[id] || 0) + by; });
}

export function claimMission(id) {
  const m = ensureMissions().find((x) => x.id === id);
  if (!m) throw new Error('Unknown mission');
  if (m.claimed) throw new Error('Already claimed');
  if (m.progress < m.target) throw new Error('Mission not complete');
  store.update((s) => {
    s.missions.claimed[id] = true;
    s.coins += m.reward.coins || 0;
    s.diamonds += m.reward.diamonds || 0;
    queueOffline(s, { kind: 'mission', id, coins: m.reward.coins || 0 });
  });
  return m.reward;
}

/* --------------------------- achievements -------------------------- */
function achievementMet(s, id) {
  const owned = Object.keys(s.inventory).filter((k) => ITEM[k]?.cost).length;
  switch (id) {
    case 'first_win': return s.stats.ludo.won + s.stats.chess.won >= 1;
    case 'ludo_wins_10': return s.stats.ludo.won >= 10;
    case 'captures_25': return s.stats.ludo.captures >= 25;
    case 'chess_win': return s.stats.chess.won >= 1;
    case 'beat_hard': return s.history.some((h) => h.result === 'win' && h.ai === 'hard');
    case 'collector_5': return owned >= 5;
    case 'creator': return s.characters.length >= 1;
    case 'streak_7': return s.daily.streak >= 7;
    case 'level_5': return s.level >= 5;
    case 'champion': return !!s.tournament?.champion;
    case 'snake_master': return Math.max(s.stats.snake?.best?.classic || 0, s.stats.snake?.best?.portal || 0) >= 30;
    case 'social': return s.history.some((h) => h.mode === 'online-friends');
    default: return false;
  }
}

function checkAchievements(s, out) {
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements[a.id] && achievementMet(s, a.id)) {
      s.achievements[a.id] = Date.now();
      s.coins += a.reward.coins || 0;
      s.diamonds += a.reward.diamonds || 0;
      out.achievements.push(a);
    }
  }
}

export function checkAchievementsNow() {
  const out = { achievements: [] };
  store.update((s) => checkAchievements(s, out));
  return out.achievements;
}

/* ----------------------------- matches ----------------------------- */
const LOCAL_REWARDS = {
  ai: { win: { easy: 60, medium: 100, hard: 160 }, loss: 15, xpWin: 60, xpLoss: 20 },
  local: { win: 25, loss: 10, xpWin: 30, xpLoss: 15 },
  tournament: { win: 120, loss: 20, xpWin: 80, xpLoss: 25 },
};

function queueOffline(s, entry) {
  if (!isAccount(s)) return;
  s.offline.pending.push({ ...entry, at: Date.now() });
  if (s.offline.pending.length > 100) s.offline.pending.shift();
}

/**
 * Record a finished match and apply local rewards.
 * @param {{game:'ludo'|'chess', mode:string, result:'win'|'loss'|'draw', ai?:string,
 *          opponents?:string[], captures?:number, sixes?:number, serverRewarded?:boolean}} m
 */
export function recordMatch(m) {
  const out = { coins: 0, xp: 0, levelUps: [], achievements: [] };
  store.update((s) => {
    const st = s.stats[m.game];
    st.played += 1;
    if (m.result === 'win') st.won += 1;
    else if (m.result === 'loss') st.lost += 1;
    else if (st.draw != null) st.draw += 1;
    if (m.captures) st.captures += m.captures;
    if (m.sixes && m.game === 'ludo') st.sixes += m.sixes;

    if (!m.serverRewarded) {
      const table = LOCAL_REWARDS[m.mode === 'ai' ? 'ai' : m.mode === 'tournament' ? 'tournament' : 'local'];
      if (m.result === 'win') out.coins = typeof table.win === 'object' ? table.win[m.ai || 'medium'] : table.win;
      else out.coins = m.result === 'draw' ? Math.round(table.loss * 1.5) : table.loss;
      out.xp = m.result === 'win' ? table.xpWin : table.xpLoss;
      s.coins += out.coins;
      addXp(s, out.xp, out);
      queueOffline(s, { kind: 'match', game: m.game, mode: m.mode, result: m.result, coins: out.coins, xp: out.xp });
    }

    s.history.unshift({
      id: randomId(6), at: Date.now(), game: m.game, mode: m.mode, result: m.result,
      ai: m.ai || null, opponents: m.opponents || [], coins: out.coins, xp: out.xp,
    });
    s.history = s.history.slice(0, 60);
    checkAchievements(s, out);
  });
  if (m.game === 'ludo') bumpMission('play_ludo');
  if (m.game === 'chess') bumpMission('play_chess');
  if (m.result === 'win') bumpMission('win_any');
  return out;
}

/**
 * Record a finished Snake run. Returns rewards + whether it's a new best.
 * @param {{score:number, food:number, mode:'classic'|'portal', level:string, rewards:{coins:number,xp:number}}} r
 */
export function recordSnake({ score, food, mode, level, rewards }) {
  const out = { coins: rewards.coins, xp: rewards.xp, levelUps: [], achievements: [], newBest: false };
  store.update((s) => {
    const st = s.stats.snake;
    st.played += 1;
    st.food += food;
    if (score > (st.best[mode] || 0)) { st.best[mode] = score; out.newBest = score > 0; }
    s.coins += out.coins;
    addXp(s, out.xp, out);
    queueOffline(s, { kind: 'match', game: 'snake', mode, coins: out.coins, xp: out.xp });
    s.history.unshift({ id: randomId(6), at: Date.now(), game: 'snake', mode: `${mode} · ${level}`, result: out.newBest ? 'win' : 'loss', score, opponents: [], coins: out.coins, xp: out.xp });
    s.history = s.history.slice(0, 60);
    checkAchievements(s, out);
  });
  bumpMission('snake_play');
  if (food) bumpMission('snake_food', food);
  return out;
}

export function winRate() {
  const s = state.stats;
  const played = s.ludo.played + s.chess.played;
  const won = s.ludo.won + s.chess.won;
  return played ? Math.round((won / played) * 100) : 0;
}
