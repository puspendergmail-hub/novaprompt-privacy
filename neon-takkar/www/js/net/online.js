/**
 * Online layer (Firebase). Loaded lazily — offline modes never import the SDK.
 *
 * Trust model:
 *  - Clients NEVER write game state, currencies, XP, inventory or results.
 *  - Room/game changes are sent as intents to RTDB `rooms/{code}/intents`
 *    and applied by the `onIntent` Cloud Function (shared engine validation).
 *  - Economy actions (purchase, daily reward, offline sync) are callables.
 */
import { firebaseConfig, FUNCTIONS_REGION, FIREBASE_SDK_VERSION, RTDB_ROOM_SHARD_URLS } from '../firebase-config.js';
import { shardIndex } from '../engine/room.js';
import { store, guestSummary } from '../core/store.js';
import { publicProfile } from '../core/sprites.js';
import { ITEM } from '../core/catalog.js';

const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
let fb = null; // {app, auth, db, rtdb, fns, m:{...modules}}
let initPromise = null;
let user = null;
const userListeners = new Set();
let profileUnsub = null;
let presenceStarted = false;

export const configured = !!firebaseConfig;

/** Database instance holding a room (rooms may be sharded across several RTDB instances). */
function roomDb(code) {
  if (!RTDB_ROOM_SHARD_URLS.length) return fb.rtdb;
  return fb.dbM.getDatabase(fb.app, RTDB_ROOM_SHARD_URLS[shardIndex(code, RTDB_ROOM_SHARD_URLS.length)]);
}
export const currentUser = () => user;

export function onUser(fn) { userListeners.add(fn); fn(user); return () => userListeners.delete(fn); }

export function init() {
  if (!configured) return Promise.resolve(null);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [appM, authM, fsM, dbM, fnM] = await Promise.all([
      import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-firestore.js'), import(BASE + 'firebase-database.js'),
      import(BASE + 'firebase-functions.js'),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    fb = {
      app,
      auth: authM.getAuth(app),
      db: fsM.getFirestore(app),
      rtdb: dbM.getDatabase(app),
      fns: fnM.getFunctions(app, FUNCTIONS_REGION),
      m: { ...authM, ...fsM, ...fnM }, // RTDB functions live in fb.dbM (names clash with Firestore)
      dbM,
    };
    authM.onAuthStateChanged(fb.auth, (u) => handleUser(u));
    return fb;
  })().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

async function handleUser(u) {
  user = u ? {
    uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL, anonymous: u.isAnonymous,
    providers: (u.providerData || []).map((p) => p.providerId),
  } : null;
  profileUnsub?.(); profileUnsub = null;
  if (user) {
    store.update((s) => {
      s.account.uid = user.uid;
      if (!user.anonymous) {
        s.account.mode = 'google';
        s.account.email = user.email;
        s.account.photo = user.photo;
      }
    });
    try {
      await call('ensureProfile', { ...publicProfile(), equipped: store.get().equipped });
      if (store.get().account.importGuest && !user.anonymous) {
        try {
          await call('importGuestProgress', guestSummary());
        } catch (e) { console.warn('guest import failed', e); }
        store.update((s) => { s.account.importGuest = false; });
      }
      watchOwnProfile();
      startPresence();
      syncOffline().catch(() => {});
    } catch (e) { console.warn('ensureProfile failed', e); }
  }
  for (const l of userListeners) l(user);
}

/* -------------------------------- auth --------------------------------- */
export async function signInGoogle() {
  const f = await init();
  if (!f) throw new Error('Online features are not configured');
  const { GoogleAuthProvider, signInWithCredential, signInWithPopup, linkWithCredential, linkWithPopup } = f.m;
  const native = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.FirebaseAuthentication;
  const anon = f.auth.currentUser?.isAnonymous ? f.auth.currentUser : null;
  if (native) {
    const res = await window.Capacitor.Plugins.FirebaseAuthentication.signInWithGoogle();
    const cred = GoogleAuthProvider.credential(res.credential?.idToken, res.credential?.accessToken);
    if (anon) {
      try { return await linkWithCredential(anon, cred); } catch { /* account exists: fall through */ }
    }
    return signInWithCredential(f.auth, cred);
  }
  const provider = new GoogleAuthProvider();
  if (anon) {
    try { return await linkWithPopup(anon, provider); } catch { /* fall through */ }
  }
  return signInWithPopup(f.auth, provider);
}

/** Anonymous Firebase account so guests can join online rooms. */
export async function signInGuestOnline() {
  const f = await init();
  if (!f) throw new Error('Online features are not configured');
  if (f.auth.currentUser) return f.auth.currentUser;
  const r = await f.m.signInAnonymously(f.auth);
  return r.user;
}

export async function signOut() {
  if (!fb) return;
  try {
    const { ref, set, serverTimestamp } = fb.dbM;
    if (user) await set(ref(fb.rtdb, `status/${user.uid}`), { state: 'offline', last: serverTimestamp() });
  } catch { /* ignore */ }
  presenceStarted = false;
  if (window.Capacitor?.Plugins?.FirebaseAuthentication) {
    window.Capacitor.Plugins.FirebaseAuthentication.signOut().catch(() => {});
  }
  await fb.m.signOut(fb.auth);
}

/** Ensure there is a signed-in user (Google or anonymous) for online play. */
export async function requireUser() {
  await init();
  if (!fb) throw new Error('Online features are not configured');
  if (!fb.auth.currentUser) await signInGuestOnline();
  if (!user) await new Promise((r) => { const off = onUser((u) => { if (u) { off(); r(); } }); });
  return user;
}

/* ------------------------------ callables ------------------------------ */
export async function call(name, data = {}) {
  const f = await init();
  if (!f) throw new Error('Online features are not configured');
  const fn = f.m.httpsCallable(f.fns, name);
  try {
    const r = await fn(data);
    return r.data;
  } catch (e) {
    throw new Error(e?.message?.replace(/^.*?:\s*/, '') || 'Network error');
  }
}

/* --------------------------- profile mirror ---------------------------- */
function pendingTotals(s) {
  return s.offline.pending.reduce((a, p) => ({ coins: a.coins + (p.coins || 0), xp: a.xp + (p.xp || 0) }), { coins: 0, xp: 0 });
}

function watchOwnProfile() {
  const { doc, onSnapshot } = fb.m;
  profileUnsub = onSnapshot(doc(fb.db, 'users', user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    store.update((s) => {
      const p = pendingTotals(s);
      s.coins = (d.coins ?? s.coins) + p.coins;
      s.diamonds = d.diamonds ?? s.diamonds;
      if (d.level) { s.level = d.level; s.xp = d.xp ?? s.xp; }
      if (d.inventory) {
        const inv = { ...d.inventory };
        for (const it of Object.values(ITEM)) if (!it.cost) inv[it.id] = true;
        s.inventory = inv;
      }
      if (d.playerId) s.playerId = d.playerId;
      s.onlineStats = d.stats || null;
    });
  });
}

/** Send offline-earned progress; the server applies daily caps. */
export async function syncOffline() {
  const s = store.get();
  if (!user || user.anonymous || !s.offline.pending.length) return null;
  const batch = s.offline.pending.slice(0, 50);
  const res = await call('syncOfflineProgress', { entries: batch });
  store.update((st) => { st.offline.pending = st.offline.pending.slice(batch.length); });
  return res;
}

export async function updatePublicProfile() {
  if (!user) return;
  await call('updateProfile', { ...publicProfile(), equipped: store.get().equipped });
}

/* ------------------------------- presence ------------------------------ */
function startPresence() {
  if (presenceStarted || !user) return;
  presenceStarted = true;
  const { ref, onValue, onDisconnect, set, serverTimestamp } = fb.dbM;
  const me = ref(fb.rtdb, `status/${user.uid}`);
  onValue(ref(fb.rtdb, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(me).set({ state: 'offline', last: serverTimestamp() }).then(() => {
      set(me, { state: 'online', last: serverTimestamp() });
    });
  });
}

export function watchPresence(uid, fn) {
  if (!fb) return () => {};
  const { ref, onValue } = fb.dbM;
  return onValue(ref(fb.rtdb, `status/${uid}`), (s) => fn(s.val()?.state === 'online'));
}

export function watchConnection(fn) {
  if (!fb) return () => {};
  const { ref, onValue } = fb.dbM;
  return onValue(ref(fb.rtdb, '.info/connected'), (s) => fn(!!s.val()));
}

/* -------------------------------- friends ------------------------------ */
export function watchFriends(fn) {
  const { collection, onSnapshot } = fb.m;
  return onSnapshot(collection(fb.db, 'users', user.uid, 'friends'), (snap) => {
    fn(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  });
}

export function watchFriendRequests(fn) {
  const { collection, onSnapshot, query, where } = fb.m;
  const q = query(collection(fb.db, 'friendRequests'), where('to', '==', user.uid), where('status', '==', 'pending'));
  return onSnapshot(q, (snap) => fn(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function watchRecent(fn) {
  const { collection, onSnapshot, query, orderBy, limit } = fb.m;
  const q = query(collection(fb.db, 'users', user.uid, 'recent'), orderBy('at', 'desc'), limit(20));
  return onSnapshot(q, (snap) => fn(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))));
}

export async function fetchUser(uid) {
  const { doc, getDoc } = fb.m;
  const s = await getDoc(doc(fb.db, 'users', uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

/* ------------------------------ leaderboard ---------------------------- */
export async function leaderboard(field = 'stats.wins') {
  await init();
  const { collection, getDocs, query, orderBy, limit, doc, getDoc } = fb.m;
  // cached board (rebuilt server-side every 15 min) — 1 read instead of 50
  const cached = await getDoc(doc(fb.db, 'leaderboard', 'global')).catch(() => null);
  if (cached?.exists()) return cached.data().rows.slice(0, 50).map((r) => ({ ...r, stats: { wins: r.wins, played: r.played } }));
  const snap = await getDocs(query(collection(fb.db, 'users'), orderBy(field, 'desc'), limit(50)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/* --------------------------------- rooms ------------------------------- */
export function watchRoom(code, fn) {
  const { ref, onValue, onDisconnect, set } = fb.dbM;
  const db = roomDb(code);
  const roomRef = ref(db, `rooms/${code}`);
  const conn = ref(db, `rooms/${code}/presence/${user.uid}`);
  const offConn = onValue(ref(db, '.info/connected'), (s) => {
    if (s.val() === true) {
      onDisconnect(conn).set(false).then(() => set(conn, true)).catch(() => {});
    }
  });
  const off = onValue(roomRef, (s) => fn(s.val()), (err) => fn(null, err));
  return () => { off(); offConn(); set(conn, false).catch(() => {}); };
}

/**
 * Each player has ONE intent slot (rules reject writes while it's pending), so
 * if the server hasn't consumed the previous intent yet we retry briefly.
 */
export async function sendIntent(code, intent) {
  const { ref, set, serverTimestamp } = fb.dbM;
  const data = { ...intent, uid: user.uid, at: serverTimestamp() };
  for (let i = 0; ; i++) {
    try { await set(ref(roomDb(code), `rooms/${code}/intents/${user.uid}`), data); return; } catch (e) {
      if (i >= 6) throw new Error('Server busy — try again');
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
}

/** Atomic write of a message + the sender's rate-limit stamp (rules enforce spacing). */
async function rateLimitedPush(listPath, ratePath, msg, db = fb.rtdb) {
  const { ref, push, update, serverTimestamp } = fb.dbM;
  const key = push(ref(db, listPath)).key;
  try {
    await update(ref(db), { [`${listPath}/${key}`]: { ...msg, at: serverTimestamp() }, [ratePath]: serverTimestamp() });
  } catch { throw new Error('Slow down a little 🙂'); }
}

export async function sendRoomChat(code, text) {
  await rateLimitedPush(`rooms/${code}/chat`, `rooms/${code}/rate/chat/${user.uid}`, { uid: user.uid, name: store.get().name.slice(0, 20), text: text.slice(0, 200) }, roomDb(code));
}

export async function sendReaction(code, emoji, sound) {
  const msg = { uid: user.uid, emoji: String(emoji).slice(0, 8) };
  if (sound && /^[a-z_]{1,20}$/.test(sound)) msg.sound = sound;
  await rateLimitedPush(`rooms/${code}/reactions`, `rooms/${code}/rate/react/${user.uid}`, msg, roomDb(code));
}

export function watchReactions(code, fn) {
  const { ref, onChildAdded, query, orderByChild, startAt } = fb.dbM;
  const q = query(ref(roomDb(code), `rooms/${code}/reactions`), orderByChild('at'), startAt(Date.now() - 2000));
  return onChildAdded(q, (s) => fn(s.val()));
}

export function watchRoomChat(code, fn) {
  const { ref, onChildAdded, query, limitToLast } = fb.dbM;
  return onChildAdded(query(ref(roomDb(code), `rooms/${code}/chat`), limitToLast(50)), (s) => fn(s.val()));
}

/* ------------------------------- invites ------------------------------- */
export function watchInvites(fn) {
  const { ref, onValue } = fb.dbM;
  return onValue(ref(fb.rtdb, `invites/${user.uid}`), (s) => {
    const v = s.val() || {};
    fn(Object.entries(v).map(([id, x]) => ({ id, ...x })).filter((x) => Date.now() - (x.at || 0) < 30 * 60_000));
  });
}
export async function dismissInvite(id) {
  const { ref, remove } = fb.dbM;
  await remove(ref(fb.rtdb, `invites/${user.uid}/${id}`));
}

export function watchMatchFound(fn) {
  const { ref, onValue, remove } = fb.dbM;
  const r = ref(fb.rtdb, `matchFound/${user.uid}`);
  return onValue(r, (s) => { const v = s.val(); if (v) { fn(v); remove(r).catch(() => {}); } });
}

/* ------------------------------ direct chat ---------------------------- */
export const dmId = (a, b) => [a, b].sort().join('_');
export function watchDM(otherUid, fn) {
  const { ref, onChildAdded, query, limitToLast } = fb.dbM;
  return onChildAdded(query(ref(fb.rtdb, `dms/${dmId(user.uid, otherUid)}`), limitToLast(60)), (s) => fn(s.val()));
}
export async function sendDM(otherUid, text) {
  await rateLimitedPush(`dms/${dmId(user.uid, otherUid)}`, `dmRate/${user.uid}`, { uid: user.uid, text: text.slice(0, 300) });
}

export function serverTimeOffset(fn) {
  if (!fb) return () => {};
  const { ref, onValue } = fb.dbM;
  return onValue(ref(fb.rtdb, '.info/serverTimeOffset'), (s) => fn(s.val() || 0));
}
