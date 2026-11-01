/**
 * NEON TAKKAR — Cloud Functions (authoritative backend).
 *
 * - Every game action is an *intent* pushed by a client; `onIntent` validates it
 *   with the same shared engine the client uses and writes the new state.
 * - Dice are rolled here with crypto RNG. Results & rewards are computed here.
 * - Currencies, inventory and XP are only ever changed by these functions
 *   (Firestore/RTDB security rules block client writes).
 */
import { randomInt } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { logger } from 'firebase-functions';

import { processIntent, makeRoomCode, isValidRoomCode, rewardsFor } from './shared/room.js';
import { cleanText, cleanName } from './shared/moderation.js';
import * as Eco from './lib/economy.js';
import * as Lobby from './lib/rooms.js';

/** Region for callables. RTDB triggers must use the database's own region. */
const REGION = 'asia-south1';
const RTDB_REGION = process.env.RTDB_REGION || 'asia-southeast1';

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 20 });
const fs = getFirestore();
const rtdb = getDatabase();

const rand = () => randomInt(0, 1_000_000) / 1_000_000;
const userRef = (uid) => fs.doc(`users/${uid}`);
const privRef = (uid) => fs.doc(`users/${uid}/private/data`);

function authed(req, { google = false } = {}) {
  const a = req.auth;
  if (!a) throw new HttpsError('unauthenticated', 'Please sign in');
  if (google && a.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('permission-denied', 'Create an account or sign in with Google for this feature');
  return a.uid;
}
const wrap = (fn) => async (req) => {
  try { return await fn(req); } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('failed-precondition', e.message || 'Error');
  }
};
const call = (fn) => onCall({ enforceAppCheck: false }, wrap(fn));

async function getProfile(uid) {
  const s = await userRef(uid).get();
  if (!s.exists) throw new HttpsError('not-found', 'Profile missing — reopen the app');
  return s.data();
}
async function isBlocked(byUid, targetUid) {
  const s = await privRef(byUid).get();
  return !!s.data()?.blocked?.includes(targetUid);
}
async function areFriends(a, b) {
  return (await fs.doc(`users/${a}/friends/${b}`).get()).exists;
}
function publicPlayer(p) {
  return { name: p.name, level: p.level || 1, avatar: p.avatar || '😎', frame: p.frame || 'pframe_basic' };
}

/* =============================== profile =============================== */

export const ensureProfile = call(async (req) => {
  const uid = authed(req);
  const ref = userRef(uid);
  const snap = await ref.get();
  const name = cleanName(req.data?.name);
  if (snap.exists) {
    const p = snap.data();
    const patch = { name, nameLower: name.toLowerCase(), ...Eco.sanitizeCosmetics(p, req.data || {}), lastSeen: Date.now() };
    await ref.update(patch);
    return { ...p, ...patch };
  }
  // reserve a unique player id
  let pid = /^NT-[A-Z0-9]{8}$/.test(req.data?.playerId || '') ? req.data.playerId : null;
  for (let i = 0; i < 6; i++) {
    if (!pid) pid = 'NT-' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(0, 32)]).join('');
    try { await fs.doc(`playerIds/${pid}`).create({ uid }); break; } catch { pid = null; }
  }
  if (!pid) throw new HttpsError('internal', 'Could not allocate player id');
  const profile = Eco.newProfile({ name, playerId: pid });
  await ref.set(profile);
  return profile;
});

export const updateProfile = call(async (req) => {
  const uid = authed(req);
  const p = await getProfile(uid);
  const name = cleanName(req.data?.name || p.name);
  const patch = { name, nameLower: name.toLowerCase(), ...Eco.sanitizeCosmetics(p, req.data || {}) };
  await userRef(uid).update(patch);
  return patch;
});

/* =============================== economy =============================== */

export const purchase = call(async (req) => {
  const uid = authed(req, { google: true });
  return fs.runTransaction(async (tx) => {
    const s = await tx.get(userRef(uid));
    const patch = Eco.purchase(s.data(), String(req.data?.itemId || ''));
    tx.update(userRef(uid), patch);
    return { ok: true };
  });
});

export const claimDaily = call(async (req) => {
  const uid = authed(req, { google: true });
  return fs.runTransaction(async (tx) => {
    const s = await tx.get(userRef(uid));
    const r = Eco.claimDaily(s.data());
    tx.update(userRef(uid), r.patch);
    return { reward: r.reward, day: r.day, streak: r.streak };
  });
});

export const syncOfflineProgress = call(async (req) => {
  const uid = authed(req, { google: true });
  return fs.runTransaction(async (tx) => {
    const s = await tx.get(userRef(uid));
    const r = Eco.syncOffline(s.data(), req.data?.entries);
    tx.update(userRef(uid), r.patch);
    return { ...r.applied, rejected: r.rejected };
  });
});

/** Moves a guest's local progress into their newly created account — once, with caps. */
export const importGuestProgress = call(async (req) => {
  const uid = authed(req, { google: true });
  return fs.runTransaction(async (tx) => {
    const s = await tx.get(userRef(uid));
    const r = Eco.importGuest(s.data(), req.data || {});
    tx.update(userRef(uid), r.patch);
    return { ok: true, itemsAdded: r.itemsAdded };
  });
});

/* =============================== friends =============================== */

export const sendFriendRequest = call(async (req) => {
  const uid = authed(req, { google: true });
  let to = req.data?.uid;
  if (!to && req.data?.playerId) {
    const s = await fs.doc(`playerIds/${String(req.data.playerId).toUpperCase()}`).get();
    to = s.data()?.uid;
  }
  if (!to || typeof to !== 'string') throw new HttpsError('not-found', 'No player with that ID');
  if (to === uid) throw new HttpsError('invalid-argument', "That's you! 😄");
  if (await areFriends(uid, to)) throw new HttpsError('already-exists', 'Already friends');
  if (await isBlocked(to, uid)) throw new HttpsError('permission-denied', 'Cannot send request');
  const target = await userRef(to).get();
  if (!target.exists) throw new HttpsError('not-found', 'Player not found');
  const me = await getProfile(uid);
  const id = `${uid}_${to}`;
  // auto-accept if they already requested us
  const reverse = await fs.doc(`friendRequests/${to}_${uid}`).get();
  if (reverse.exists && reverse.data().status === 'pending') {
    await befriend(uid, to);
    await reverse.ref.update({ status: 'accepted' });
    return { accepted: true };
  }
  await fs.doc(`friendRequests/${id}`).set({ from: uid, to, fromName: me.name, fromAvatar: me.avatar || '😎', status: 'pending', createdAt: Date.now() });
  return { sent: true };
});

async function befriend(a, b) {
  const [pa, pb] = await Promise.all([getProfile(a), getProfile(b)]);
  const batch = fs.batch();
  batch.set(fs.doc(`users/${a}/friends/${b}`), { ...publicPlayer(pb), since: Date.now() });
  batch.set(fs.doc(`users/${b}/friends/${a}`), { ...publicPlayer(pa), since: Date.now() });
  await batch.commit();
  const chat = [a, b].sort().join('_');
  await rtdb.ref(`dmAllowed/${chat}`).set({ [a]: true, [b]: true });
}

export const respondFriendRequest = call(async (req) => {
  const uid = authed(req, { google: true });
  const ref = fs.doc(`friendRequests/${String(req.data?.id || '')}`);
  const s = await ref.get();
  if (!s.exists || s.data().to !== uid || s.data().status !== 'pending') throw new HttpsError('not-found', 'Request not found');
  if (req.data.accept) await befriend(s.data().from, uid);
  await ref.update({ status: req.data.accept ? 'accepted' : 'rejected' });
  return { ok: true };
});

async function unfriend(a, b) {
  await Promise.all([fs.doc(`users/${a}/friends/${b}`).delete(), fs.doc(`users/${b}/friends/${a}`).delete()]);
  await rtdb.ref(`dmAllowed/${[a, b].sort().join('_')}`).remove();
}

export const removeFriend = call(async (req) => {
  const uid = authed(req, { google: true });
  await unfriend(uid, String(req.data?.uid || ''));
  return { ok: true };
});

export const blockUser = call(async (req) => {
  const uid = authed(req);
  const target = String(req.data?.uid || '');
  if (!target || target === uid) throw new HttpsError('invalid-argument', 'Bad user');
  await privRef(uid).set({ blocked: req.data.block === false ? FieldValue.arrayRemove(target) : FieldValue.arrayUnion(target) }, { merge: true });
  if (req.data.block !== false) await unfriend(uid, target).catch(() => {});
  return { ok: true };
});

export const reportUser = call(async (req) => {
  const uid = authed(req);
  const target = String(req.data?.uid || '');
  if (!target) throw new HttpsError('invalid-argument', 'Bad user');
  const recent = await fs.collection('reports').where('by', '==', uid).where('at', '>', Date.now() - 3600_000).count().get();
  if (recent.data().count >= 10) throw new HttpsError('resource-exhausted', 'Too many reports, try later');
  await fs.collection('reports').add({
    by: uid, target, reason: String(req.data.reason || 'Other').slice(0, 60),
    context: String(req.data.context || '').slice(0, 500), at: Date.now(), status: 'open',
  });
  return { ok: true };
});

/* ================================ rooms ================================ */

async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = makeRoomCode(rand);
    if (!(await rtdb.ref(`rooms/${code}/code`).get()).exists()) return code;
  }
  throw new HttpsError('internal', 'Could not create room');
}

export const createRoom = call(async (req) => {
  const uid = authed(req);
  const p = await getProfile(uid);
  const code = await uniqueCode();
  const room = Lobby.newRoom({ code, game: req.data?.game, hostUid: uid, host: publicPlayer(p), settings: req.data?.settings || {} });
  await rtdb.ref(`rooms/${code}`).set(room);
  await rtdb.ref(`userRooms/${uid}`).set({ code, at: Date.now() });
  return { code };
});

async function roomTx(code, fn) {
  if (!isValidRoomCode(code)) throw new HttpsError('invalid-argument', 'Invalid room code');
  let error = null;
  let result = null;
  const res = await rtdb.ref(`rooms/${code}`).transaction((room) => {
    if (room === null) return null; // cache miss → server retries with real data
    try { error = null; result = fn(room); return result === undefined ? room : result; } catch (e) { error = e; return; }
  });
  if (error) throw new HttpsError('failed-precondition', error.message);
  if (!res.snapshot.exists() && result !== null) throw new HttpsError('not-found', 'Room not found');
  return res.snapshot.val();
}

export const joinRoom = call(async (req) => {
  const uid = authed(req);
  const code = String(req.data?.code || '').toUpperCase();
  const p = await getProfile(uid);
  const hostSnap = await rtdb.ref(`rooms/${code}/hostUid`).get();
  if (!hostSnap.exists()) throw new HttpsError('not-found', 'Room not found');
  const blocked = await isBlocked(hostSnap.val(), uid);
  await roomTx(code, (room) => Lobby.join(room, uid, publicPlayer(p), { blockedByHost: blocked }));
  await rtdb.ref(`userRooms/${uid}`).set({ code, at: Date.now() });
  return { code };
});

export const leaveRoom = call(async (req) => {
  const uid = authed(req);
  const code = String(req.data?.code || '').toUpperCase();
  const snap = await rtdb.ref(`rooms/${code}/status`).get();
  if (snap.val() === 'playing') {
    await rtdb.ref(`rooms/${code}/intents`).push({ uid, type: 'resign', at: ServerValue.TIMESTAMP });
  } else {
    await roomTx(code, (room) => Lobby.leave(room, uid));
  }
  await rtdb.ref(`userRooms/${uid}`).remove();
  return { ok: true };
});

export const setReady = call(async (req) => {
  const uid = authed(req);
  await roomTx(String(req.data?.code || ''), (room) => Lobby.setReady(room, uid, req.data?.ready));
  return { ok: true };
});

export const updateRoom = call(async (req) => {
  const uid = authed(req);
  await roomTx(String(req.data?.code || ''), (room) => Lobby.updateSettings(room, uid, req.data?.settings || {}));
  return { ok: true };
});

export const kickPlayer = call(async (req) => {
  const uid = authed(req);
  await roomTx(String(req.data?.code || ''), (room) => Lobby.kick(room, uid, String(req.data?.uid || '')));
  return { ok: true };
});

export const inviteFriend = call(async (req) => {
  const uid = authed(req, { google: true });
  const code = String(req.data?.code || '');
  const to = String(req.data?.uid || '');
  if (!(await areFriends(uid, to))) throw new HttpsError('permission-denied', 'You can only invite friends');
  if (await isBlocked(to, uid)) throw new HttpsError('permission-denied', 'Cannot invite this player');
  const room = (await rtdb.ref(`rooms/${code}`).get()).val();
  if (!room?.players?.[uid]) throw new HttpsError('permission-denied', 'Join the room first');
  const me = await getProfile(uid);
  await rtdb.ref(`invites/${to}`).push({ fromUid: uid, fromName: me.name, code, game: room.game, at: Date.now() });
  await rtdb.ref(`rooms/${code}/friends`).set(true);
  return { ok: true };
});

/* ============================== matchmaking ============================= */

export const quickMatch = call(async (req) => {
  const uid = authed(req);
  const game = req.data?.game === 'chess' ? 'chess' : 'ludo';
  const p = await getProfile(uid);
  const qRef = fs.doc(`matchQueue/${game}`);
  const opponent = await fs.runTransaction(async (tx) => {
    const q = (await tx.get(qRef)).data() || { waiting: [] };
    const waiting = (q.waiting || []).filter((w) => Date.now() - w.at < 120_000 && w.uid !== uid);
    const opp = waiting.shift();
    if (opp) { tx.set(qRef, { waiting }); return opp; }
    waiting.push({ uid, at: Date.now() });
    tx.set(qRef, { waiting });
    return null;
  });
  if (!opponent) return { waiting: true };
  const oppProfile = await getProfile(opponent.uid);
  const code = await uniqueCode();
  let room = Lobby.newRoom({ code, game, hostUid: opponent.uid, host: publicPlayer(oppProfile), settings: { maxPlayers: 2, chessMinutes: 10 } });
  room = Lobby.join(room, uid, publicPlayer(p));
  room.players[uid].ready = true;
  room.quick = true;
  await rtdb.ref(`rooms/${code}`).set(room);
  // auto-start quick matches
  const patch = processIntent(room, { uid: opponent.uid, type: 'start' }, { now: Date.now(), rand });
  await applyPatch(code, room, patch);
  await rtdb.ref(`matchFound/${opponent.uid}`).set({ code, at: Date.now() });
  return { code };
});

export const cancelQuickMatch = call(async (req) => {
  const uid = authed(req);
  for (const game of ['ludo', 'chess']) {
    const qRef = fs.doc(`matchQueue/${game}`);
    await fs.runTransaction(async (tx) => {
      const q = (await tx.get(qRef)).data();
      if (q) tx.set(qRef, { waiting: (q.waiting || []).filter((w) => w.uid !== uid) });
    });
  }
  return { ok: true };
});

/* ============================ game intents ============================= */

function mergePatch(room, patch) {
  const { events, ...rest } = patch;
  const next = { ...room, ...rest };
  if (rest.players) next.players = { ...room.players, ...rest.players };
  next.lastEvents = { seq: (room.lastEvents?.seq || 0) + 1, list: events || [], at: Date.now() };
  return next;
}

async function applyPatch(code, room, patch) {
  await rtdb.ref(`rooms/${code}`).set(mergePatch(room, patch));
}

export const onIntent = onValueCreated({ ref: '/rooms/{code}/intents/{id}', region: RTDB_REGION }, async (event) => {
  const { code, id } = event.params;
  const roomRef = rtdb.ref(`rooms/${code}`);
  let rejected = null;
  const res = await roomRef.transaction((room) => {
    if (room === null) return null;
    const intent = room.intents?.[id];
    if (!intent) return; // already handled
    delete room.intents[id];
    try {
      const patch = processIntent(room, intent, { now: Date.now(), rand });
      rejected = null;
      return mergePatch(room, patch);
    } catch (e) {
      rejected = { uid: intent.uid, message: e.message };
      room.lastError = { ...rejected, at: Date.now() };
      return room;
    }
  });
  if (rejected) logger.info('intent rejected', { code, ...rejected });
  const room = res.snapshot.val();
  if (!res.committed || !room) return;
  if (room.status === 'playing' && room.startedAt && !room.friendsChecked) {
    const uids = Object.keys(room.players);
    let friends = !!room.friends;
    if (!friends && uids.length === 2) friends = await areFriends(uids[0], uids[1]).catch(() => false);
    await roomRef.update({ friendsChecked: true, friends });
  }
  if (room.status === 'over') await settleMatch(code);
});

async function settleMatch(code) {
  const flag = await rtdb.ref(`rooms/${code}/rewarded`).transaction((v) => (v ? undefined : true));
  if (!flag.committed) return;
  const room = (await rtdb.ref(`rooms/${code}`).get()).val();
  const uids = Object.keys(room.players || {});
  await Promise.all(uids.map((uid) => fs.runTransaction(async (tx) => {
    const ref = userRef(uid);
    const s = await tx.get(ref);
    if (!s.exists) return;
    const p = s.data();
    const r = rewardsFor(room.result, uid, room.game);
    const lv = Eco.applyXp({ level: p.level, xp: p.xp, coins: p.coins + r.coins, diamonds: p.diamonds }, r.xp);
    const win = room.result?.winnerUid === uid;
    const draw = !!room.result?.draw;
    tx.update(ref, {
      level: lv.level, xp: lv.xp, coins: lv.coins, diamonds: lv.diamonds,
      'stats.played': FieldValue.increment(1),
      'stats.wins': FieldValue.increment(win ? 1 : 0),
      'stats.losses': FieldValue.increment(!win && !draw ? 1 : 0),
      'stats.draws': FieldValue.increment(draw ? 1 : 0),
      [`stats.${room.game}Wins`]: FieldValue.increment(win ? 1 : 0),
    });
  })));
  const batch = fs.batch();
  batch.set(fs.collection('matches').doc(`${code}_${room.startedAt}`), {
    code, game: room.game, players: uids, result: room.result || null, startedAt: room.startedAt || null, endedAt: Date.now(), friends: !!room.friends,
  });
  for (const a of uids) for (const b of uids) {
    if (a !== b) batch.set(fs.doc(`users/${a}/recent/${b}`), { ...publicPlayer(room.players[b]), game: room.game, at: Date.now() });
  }
  await batch.commit();
  await Promise.all(uids.map((u) => rtdb.ref(`userRooms/${u}`).remove()));
  // room returns to lobby for a rematch after a short delay (clients show results first)
}

/* =============================== chat safety =============================== */

export const moderateRoomChat = onValueCreated({ ref: '/rooms/{code}/chat/{id}', region: RTDB_REGION }, async (event) => {
  const v = event.data.val();
  const clean = cleanText(v?.text);
  if (clean !== v?.text) await event.data.ref.update({ text: clean, filtered: true });
});

export const moderateDM = onValueCreated({ ref: '/dms/{chat}/{id}', region: RTDB_REGION }, async (event) => {
  const v = event.data.val();
  const clean = cleanText(v?.text, 300);
  if (clean !== v?.text) await event.data.ref.update({ text: clean, filtered: true });
});

/* ============================ account deletion ============================ */

export const deleteAccount = call(async (req) => {
  const uid = authed(req);
  const p = (await userRef(uid).get()).data();
  const friends = await fs.collection(`users/${uid}/friends`).get();
  await Promise.all(friends.docs.map((d) => unfriend(uid, d.id)));
  await fs.recursiveDelete(userRef(uid));
  if (p?.playerId) await fs.doc(`playerIds/${p.playerId}`).delete().catch(() => {});
  const reqs = await fs.collection('friendRequests').where('from', '==', uid).get();
  await Promise.all(reqs.docs.map((d) => d.ref.delete()));
  await Promise.all([`status/${uid}`, `invites/${uid}`, `userRooms/${uid}`, `matchFound/${uid}`].map((r) => rtdb.ref(r).remove()));
  await getAuth().deleteUser(uid);
  return { ok: true };
});

/* ================================ cleanup ================================ */

export const cleanupRooms = onSchedule({ schedule: 'every 60 minutes', region: REGION }, async () => {
  const snap = await rtdb.ref('rooms').orderByChild('createdAt').endAt(Date.now() - Lobby.ROOM_TTL_MS).limitToFirst(500).get();
  const updates = {};
  snap.forEach((c) => { updates[c.key] = null; });
  if (Object.keys(updates).length) await rtdb.ref('rooms').update(updates);
  logger.info(`cleaned ${Object.keys(updates).length} rooms`);
});
