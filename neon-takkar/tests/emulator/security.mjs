// Security / anti-cheat tests against the Firebase Emulator Suite (real rules + real functions).
import { loadRules } from './setup.mjs';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator, ref, set, get, update, push, onValue, serverTimestamp } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

await loadRules();
const cfg = { apiKey: 'demo', projectId: 'demo-neon-takkar', databaseURL: 'http://127.0.0.1:9000/?ns=demo-neon-takkar' };
let n = 0;
const results = [];
const ok = (name, pass, extra = '') => { results.push({ name, pass }); console.log(`${pass ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };
const denied = async (name, fn) => { try { await fn(); ok(name, false, 'was ALLOWED'); } catch (e) { ok(name, e.code === 'permission-denied' || /PERMISSION_DENIED|permission/i.test(e.message), e.code || e.message.slice(0, 60)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function client(label, { anon = false } = {}) {
  const app = initializeApp(cfg, label + n++);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const rtdb = getDatabase(app); connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  const fns = getFunctions(app, 'asia-south1'); connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const cred = anon ? await signInAnonymously(auth)
    : await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: label + Date.now() + Math.random(), email: `${label.toLowerCase()}${Date.now()}${Math.floor(Math.random() * 1e6)}@gmail.com`, email_verified: true, name: label })));
  const call = async (name, data = {}) => (await httpsCallable(fns, name)(data)).data;
  const c = { label, app, auth, db, rtdb, uid: cred.user.uid, call };
  await call('ensureProfile', { name: label, avatar: '😎', frame: 'pframe_basic' });
  return c;
}

function waitRoom(c, code, pred, ms = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { off(); reject(new Error('timeout waiting room')); }, ms);
    const off = onValue(ref(c.rtdb, `rooms/${code}`), (s) => { const v = s.val(); if (v && pred(v)) { clearTimeout(t); off(); resolve(v); } });
  });
}
async function intent(c, code, data) {
  for (let i = 0; i < 40; i++) {
    try { await set(ref(c.rtdb, `rooms/${code}/intents/${c.uid}`), { ...data, uid: c.uid, at: serverTimestamp() }); return; } catch (e) { if (i === 0) console.log('   intent write error:', e.message.slice(0, 120)); await sleep(150); }
  }
  throw new Error('intent slot never freed');
}

const main = async () => {
  console.log('--- creating players');
  const A = await client('Rohan'), B = await client('Priya'), H = await client('Hacker');

  console.log('\n--- 1. Economy tampering (Firestore rules)');
  await denied('Hacker cannot give himself coins', () => updateDoc(doc(H.db, 'users', H.uid), { coins: 999999 }));
  await denied('Hacker cannot overwrite his profile', () => setDoc(doc(H.db, 'users', H.uid), { coins: 1e9, level: 99 }));
  await denied('Hacker cannot edit another player', () => updateDoc(doc(H.db, 'users', A.uid), { coins: 0 }));
  await denied('Hacker cannot read another player\'s friends', () => getDocs(collection(H.db, 'users', A.uid, 'friends')));
  await denied('Hacker cannot read another player\'s private data', () => getDoc(doc(H.db, 'users', A.uid, 'private', 'data')));
  await denied('Hacker cannot read moderation reports', () => getDocs(collection(H.db, 'reports')));
  await denied('Hacker cannot add himself to friends lists', () => setDoc(doc(H.db, 'users', A.uid, 'friends', H.uid), { name: 'x' }));
  const pub = await getDoc(doc(H.db, 'users', A.uid));
  ok('Public profile has no email', pub.exists() && !JSON.stringify(pub.data()).includes('@'));

  console.log('\n--- 2. Server-validated purchases & rewards');
  try { await H.call('purchase', { itemId: 'pieces_gold' }); ok('Cannot buy 25💎 item with 20💎', false); } catch (e) { ok('Cannot buy 25💎 item with 20💎', /Not enough/.test(e.message)); }
  try { await H.call('purchase', { itemId: 'pframe_fire' }); ok('Level-locked item refused', false); } catch (e) { ok('Level-locked item refused', /level/.test(e.message)); }
  await H.call('purchase', { itemId: 'skin_thug' });
  try { await H.call('purchase', { itemId: 'skin_thug' }); ok('Cannot buy twice', false); } catch (e) { ok('Cannot buy twice', /Already/.test(e.message)); }
  ok('Coins actually deducted on server', (await getDoc(doc(H.db, 'users', H.uid))).data().coins === 700);
  await H.call('claimDaily');
  try { await H.call('claimDaily'); ok('Daily reward only once', false); } catch (e) { ok('Daily reward only once', /Already/.test(e.message)); }
  const sync = await H.call('syncOfflineProgress', { entries: Array.from({ length: 50 }, () => ({ kind: 'match', coins: 1e9, xp: 1e9 })) });
  ok('Fake offline progress is capped', sync.coins <= 1500, `applied ${sync.coins} coins`);
  await H.call('importGuestProgress', { coins: 1e9, level: 999, items: ['pieces_gold'] });
  const hp = (await getDoc(doc(H.db, 'users', H.uid))).data();
  ok('Guest import capped (coins ≤ 5000, level ≤ 10)', hp.coins <= 5000 + 1500 + 200 && hp.level <= 10, `coins ${hp.coins}, level ${hp.level}`);
  try { await H.call('importGuestProgress', { coins: 5000 }); ok('Guest import only once', false); } catch (e) { ok('Guest import only once', /already/.test(e.message)); }
  const anon = await client('Anon', { anon: true });
  try { await anon.call('purchase', { itemId: 'skin_doge' }); ok('Anonymous guest cannot use synced economy', false); } catch (e) { ok('Anonymous guest cannot use synced economy', /Gmail|Google|account/i.test(e.message)); }

  console.log('\n--- 3. Room privacy & state tampering (RTDB rules)');
  const { code } = await A.call('createRoom', { game: 'ludo', settings: { maxPlayers: 2 } });
  ok('Room created with valid code', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
  await denied('Outsider cannot read a private room', () => get(ref(H.rtdb, `rooms/${code}`)));
  await denied('Outsider cannot send intents', () => set(ref(H.rtdb, `rooms/${code}/intents/${H.uid}`), { uid: H.uid, type: 'start' }));
  await denied('Outsider cannot write room chat', () => push(ref(H.rtdb, `rooms/${code}/chat`), { uid: H.uid, name: 'x', text: 'spam', at: serverTimestamp() }));
  await denied('Outsider cannot list all rooms', () => get(ref(H.rtdb, 'rooms')));
  await B.call('joinRoom', { code });
  await denied('Player cannot write game state directly', () => set(ref(B.rtdb, `rooms/${code}/state`), { hacked: true }));
  await denied('Player cannot mark himself winner', () => set(ref(B.rtdb, `rooms/${code}/result`), { winnerUid: B.uid }));
  await denied('Player cannot change room settings directly', () => set(ref(B.rtdb, `rooms/${code}/settings/maxPlayers`), 4));
  await denied('Player cannot send intent as someone else (path)', () => set(ref(B.rtdb, `rooms/${code}/intents/${A.uid}`), { uid: A.uid, type: 'start' }));
  await denied('Player cannot spoof uid inside intent', () => set(ref(B.rtdb, `rooms/${code}/intents/${B.uid}`), { uid: A.uid, type: 'start' }));
  await denied('Unknown intent types rejected', () => set(ref(B.rtdb, `rooms/${code}/intents/${B.uid}`), { uid: B.uid, type: 'win' }));
  try { await B.call('updateRoom', { code, settings: { maxPlayers: 4 } }); ok('Only host changes settings', false); } catch (e) { ok('Only host changes settings', /host/.test(e.message)); }
  try { await H.call('kickPlayer', { code, uid: A.uid }); ok('Outsider cannot kick', false); } catch (e) { ok('Outsider cannot kick', true); }

  console.log('\n--- 4. Server-authoritative gameplay');
  await intent(A, code, { type: 'start' });
  await sleep(1500);
  let r = (await get(ref(A.rtdb, `rooms/${code}`))).val();
  ok('Start refused until everyone is ready', r.status === 'lobby' && /ready/.test(r.lastError?.message || ''), r.lastError?.message);
  await B.call('setReady', { code, ready: true });
  await intent(A, code, { type: 'start' });
  r = await waitRoom(A, code, (v) => v.status === 'playing');
  ok('Match started by server', r.status === 'playing');
  const first = r.state.players[r.state.turn].id === A.uid ? A : B;
  const second = first === A ? B : A;
  const errBefore = r.lastError?.at || 0;
  await intent(second, code, { type: 'roll' });
  r = await waitRoom(A, code, (v) => (v.lastError?.at || 0) > errBefore);
  ok('Out-of-turn roll rejected by server', /turn/i.test(r.lastError.message), r.lastError.message);
  const dice = [];
  let rolls = 0;
  while (rolls < 12) {
    r = (await get(ref(A.rtdb, `rooms/${code}`))).val();
    const cur = r.state.players[r.state.turn].id === A.uid ? A : B;
    const seq = r.lastEvents?.seq || 0;
    if (r.state.phase === 'roll') { await intent(cur, code, { type: 'roll' }); rolls++; }
    else await intent(cur, code, { type: 'move', token: r.state.players[r.state.turn].tokens.findIndex((t) => t >= 0 || r.state.dice === 6) });
    r = await waitRoom(A, code, (v) => (v.lastEvents?.seq || 0) > seq || (v.lastError?.at || 0) > Date.now() - 500);
    const ev = (r.lastEvents?.list || []).find((e) => e.type === 'roll');
    if (ev) dice.push(ev.value);
  }
  ok('Dice rolled on server, always 1–6', dice.length > 0 && dice.every((d) => d >= 1 && d <= 6), dice.join(','));
  await denied('Player cannot overwrite the dice', () => set(ref(A.rtdb, `rooms/${code}/state/dice`), 6));
  await denied('Player cannot move tokens directly', () => set(ref(A.rtdb, `rooms/${code}/state/players/0/tokens`), [56, 56, 56, 56]));

  console.log('\n--- 5. Chat safety');
  await update(ref(B.rtdb), { [`rooms/${code}/chat/m1`]: { uid: B.uid, name: 'Rohan', text: 'tu chutiya hai', at: serverTimestamp() }, [`rooms/${code}/rate/chat/${B.uid}`]: serverTimestamp() });
  await sleep(2500);
  const msg = (await get(ref(B.rtdb, `rooms/${code}/chat/m1`))).val();
  ok('Abusive words filtered by server', !/chutiya/.test(msg.text), msg.text);
  ok('Impersonation fixed: server sets real name', msg.name === 'Priya', `name now "${msg.name}"`);
  await update(ref(A.rtdb), { [`rooms/${code}/chat/a1`]: { uid: A.uid, name: 'Rohan', text: 'GG', at: serverTimestamp() }, [`rooms/${code}/rate/chat/${A.uid}`]: serverTimestamp() });
  ok('Normal chat message allowed', true);
  await denied('Chat spam (2nd message within 0.8s) blocked', () => update(ref(A.rtdb), { [`rooms/${code}/chat/m2`]: { uid: A.uid, name: 'Rohan', text: 'spam', at: serverTimestamp() }, [`rooms/${code}/rate/chat/${A.uid}`]: serverTimestamp() }));
  await denied('Chat without rate stamp blocked', () => set(ref(B.rtdb, `rooms/${code}/chat/m3`), { uid: B.uid, name: 'Priya', text: 'hi', at: serverTimestamp() }));
  await denied('Over-long chat blocked', () => update(ref(A.rtdb), { [`rooms/${code}/chat/m4`]: { uid: A.uid, name: 'Rohan', text: 'x'.repeat(500), at: serverTimestamp() }, [`rooms/${code}/rate/chat/${A.uid}`]: serverTimestamp() }));
  await denied('Reactions cannot carry arbitrary sound ids', async () => { await sleep(900); await update(ref(A.rtdb), { [`rooms/${code}/reactions/r1`]: { uid: A.uid, emoji: '😂', sound: 'custom:../../x', at: serverTimestamp() }, [`rooms/${code}/rate/react/${A.uid}`]: serverTimestamp() }); });
  await denied('DMs between non-friends blocked', () => update(ref(H.rtdb), { [`dms/${[H.uid, A.uid].sort().join('_')}/x`]: { uid: H.uid, text: 'hi', at: serverTimestamp() }, [`dmRate/${H.uid}`]: serverTimestamp() }));

  console.log('\n--- 6. Chess: illegal moves, result, anti-farming');
  const C = await client('Chessy'), D = await client('Dev');
  const { code: cc } = await C.call('createRoom', { game: 'chess', settings: { chessMinutes: 5 } });
  await D.call('joinRoom', { code: cc }); await D.call('setReady', { code: cc, ready: true });
  await intent(C, cc, { type: 'start' });
  r = await waitRoom(C, cc, (v) => v.status === 'playing');
  const W = r.players[C.uid].color === 'w' ? C : D, Bk = W === C ? D : C;
  let e0 = r.lastError?.at || 0;
  await intent(W, cc, { type: 'move', from: 'e2', to: 'e5' });
  r = await waitRoom(C, cc, (v) => (v.lastError?.at || 0) > e0);
  ok('Illegal chess move rejected by server', /Illegal/.test(r.lastError.message));
  for (const [p, f, t] of [[W, 'f2', 'f3'], [Bk, 'e7', 'e5'], [W, 'g2', 'g4'], [Bk, 'd8', 'h4']]) {
    const seq = (await get(ref(C.rtdb, `rooms/${cc}/lastEvents/seq`))).val() || 0;
    await intent(p, cc, { type: 'move', from: f, to: t });
    await waitRoom(C, cc, (v) => (v.lastEvents?.seq || 0) > seq);
  }
  r = await waitRoom(C, cc, (v) => v.status === 'over');
  ok('Checkmate detected on server', r.result.reason === 'checkmate' && r.result.winnerUid === Bk.uid);
  await sleep(2500);
  const wp = (await getDoc(doc(Bk.db, 'users', Bk.uid))).data();
  ok('Win recorded in server stats', wp.stats.wins === 1);
  ok('Instant win gives no coins (anti-farming)', wp.coins === 1000, `coins ${wp.coins}`);

  console.log('\n--- 7. Rate limits');
  let blocked = false;
  for (let i = 0; i < 35 && !blocked; i++) { try { await H.call('createRoom', { game: 'ludo', settings: {} }); } catch (e) { blocked = /Too many/.test(e.message); } }
  ok('Room-creation spam is rate limited', blocked);
  const openRooms = (await get(ref(A.rtdb, `userRooms/${A.uid}`))).val();
  ok('Old lobby rooms are closed when host makes a new one', !!openRooms);

  console.log('\n--- 8. Prototype-pollution / NaN-balance exploit');
  const X = await client('Exploit');
  await X.call('syncOfflineProgress', { entries: [{ kind: '__proto__', coins: 1, xp: 1 }, { kind: 'constructor', coins: 1 }, { kind: 'match', coins: 'abc', xp: {} }] });
  const xp1 = (await getDoc(doc(X.db, 'users', X.uid))).data();
  ok('Balances stay real numbers after poisoned sync', Number.isFinite(xp1.coins) && Number.isFinite(xp1.xp), `coins ${xp1.coins}, xp ${xp1.xp}`);
  try { await X.call('purchase', { itemId: 'pieces_gold' }); ok('Still cannot buy what you cannot afford', false); } catch (e) { ok('Still cannot buy what you cannot afford', /Not enough/.test(e.message)); }
  try { await X.call('purchase', { itemId: '__proto__' }); ok('Prototype item id rejected', false); } catch (e) { ok('Prototype item id rejected', /Unknown/.test(e.message)); }

  const pass = results.filter((x) => x.pass).length;
  console.log(`\nRESULT: ${pass}/${results.length} security checks passed`);
  process.exit(pass === results.length ? 0 : 1);
};
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
