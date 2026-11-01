/**
 * Server-side economy rules (pure functions, unit-tested).
 * All currency changes for signed-in players go through these.
 */
import { ITEM, ITEMS, DAILY_REWARDS } from '../shared/catalog.js';

export const START_COINS = 1000;
export const START_DIAMONDS = 20;
export const OFFLINE_DAILY_COIN_CAP = 1500;
export const OFFLINE_DAILY_XP_CAP = 1500;
export const MAX_ENTRY = { match: { coins: 200, xp: 100 }, mission: { coins: 200, xp: 0 } };

export const xpForLevel = (lvl) => 200 + (lvl - 1) * 120;

/** Day key in India Standard Time (UTC+5:30). */
export function istDay(now = Date.now()) {
  const d = new Date(now + 5.5 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export function freeInventory() {
  const inv = {};
  for (const it of ITEMS) if (!it.cost) inv[it.id] = true;
  return inv;
}

export function newProfile({ name, playerId, avatar, frame }, now = Date.now()) {
  return {
    name, nameLower: name.toLowerCase(), playerId, avatar: avatar || '😎', frame: frame || 'pframe_basic',
    level: 1, xp: 0, coins: START_COINS, diamonds: START_DIAMONDS,
    inventory: freeInventory(),
    stats: { wins: 0, losses: 0, draws: 0, played: 0, ludoWins: 0, chessWins: 0 },
    daily: { last: null, streak: 0 },
    offlineSync: { day: null, coins: 0, xp: 0 },
    createdAt: now,
  };
}

/** Apply XP with level-ups. Returns new {level, xp, coins, diamonds, levelUps}. */
export function applyXp(p, amount) {
  let { level, xp, coins, diamonds } = p;
  xp += amount;
  const levelUps = [];
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1; coins += 150; diamonds += 5;
    levelUps.push(level);
  }
  return { level, xp, coins, diamonds, levelUps };
}

export function purchase(profile, itemId) {
  const it = ITEM[itemId];
  if (!it) throw new Error('Unknown item');
  if (profile.inventory?.[itemId]) throw new Error('Already owned');
  if (!it.cost) return { inventory: { ...profile.inventory, [itemId]: true } };
  if (it.level && profile.level < it.level) throw new Error(`Unlocks at level ${it.level}`);
  const c = it.cost.coins || 0, d = it.cost.diamonds || 0;
  if (profile.coins < c || profile.diamonds < d) throw new Error('Not enough currency');
  return { coins: profile.coins - c, diamonds: profile.diamonds - d, inventory: { ...profile.inventory, [itemId]: true } };
}

export function claimDaily(profile, now = Date.now()) {
  const today = istDay(now);
  const yesterday = istDay(now - 86400_000);
  const last = profile.daily?.last;
  if (last === today) throw new Error('Already claimed today');
  const streak = last === yesterday ? (profile.daily.streak || 0) : 0;
  const reward = DAILY_REWARDS[streak % 7];
  return {
    patch: {
      coins: profile.coins + (reward.coins || 0),
      diamonds: profile.diamonds + (reward.diamonds || 0),
      daily: { last: today, streak: streak + 1 },
    },
    reward, day: today, streak: streak + 1,
  };
}

/**
 * Offline progress can't be verified, so it is clamped per entry and per day.
 * Returns {patch, applied:{coins,xp}, rejected}.
 */
export function syncOffline(profile, entries, now = Date.now()) {
  const day = istDay(now);
  const used = profile.offlineSync?.day === day ? profile.offlineSync : { day, coins: 0, xp: 0 };
  let coins = 0, xp = 0, rejected = 0;
  for (const e of (Array.isArray(entries) ? entries.slice(0, 50) : [])) {
    const lim = MAX_ENTRY[e?.kind];
    if (!lim) { rejected++; continue; }
    const c = Math.max(0, Math.min(lim.coins, Math.floor(Number(e.coins) || 0)));
    const x = Math.max(0, Math.min(lim.xp, Math.floor(Number(e.xp) || 0)));
    const roomC = Math.max(0, OFFLINE_DAILY_COIN_CAP - used.coins - coins);
    const roomX = Math.max(0, OFFLINE_DAILY_XP_CAP - used.xp - xp);
    coins += Math.min(c, roomC);
    xp += Math.min(x, roomX);
    if (c > roomC || x > roomX) rejected++;
  }
  const lv = applyXp({ level: profile.level, xp: profile.xp, coins: profile.coins + coins, diamonds: profile.diamonds }, xp);
  return {
    patch: { level: lv.level, xp: lv.xp, coins: lv.coins, diamonds: lv.diamonds, offlineSync: { day, coins: used.coins + coins, xp: used.xp + xp } },
    applied: { coins, xp, levelUps: lv.levelUps }, rejected,
  };
}

/** Avatar must be an owned avatar item icon; frame must be an owned profile frame. */
export function sanitizeCosmetics(profile, { avatar, frame }) {
  const out = {};
  const avItem = ITEMS.find((i) => i.cat === 'avatar' && i.icon === avatar);
  if (avItem && profile.inventory?.[avItem.id]) out.avatar = avatar;
  if (ITEM[frame]?.cat === 'profile_frame' && profile.inventory?.[frame]) out.frame = frame;
  return out;
}
