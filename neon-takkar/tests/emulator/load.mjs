// Concurrency test: many simultaneous online chess matches through the real functions + rules (emulator).
import { loadRules } from './setup.mjs';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, set, onValue, serverTimestamp } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
const PAIRS = Number(process.argv[2] || 25);
await loadRules();
const cfg = { apiKey: 'demo', projectId: 'demo-neon-takkar', databaseURL: 'http://127.0.0.1:9000/?ns=demo-neon-takkar' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let k = 0;
async function client() {
  const app = initializeApp(cfg, 'L' + k++);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app); connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const fns = getFunctions(app, 'asia-south1'); connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const u = (await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'l' + Date.now() + k + Math.random(), email: `l${k}x${Date.now()}${Math.floor(Math.random() * 1e6)}@gmail.com` })))).user;
  const call = async (n, d = {}) => (await httpsCallable(fns, n)(d)).data;
  await call('ensureProfile', { name: 'Load' + k });
  return { uid: u.uid, db, call };
}
const waitRoom = (c, code, pred, ms = 60000) => new Promise((res, rej) => {
  const t = setTimeout(() => { off(); rej(new Error('timeout')); }, ms);
  const off = onValue(ref(c.db, `rooms/${code}`), (s) => { const v = s.val(); if (v && pred(v)) { clearTimeout(t); off(); res(v); } });
});
async function intent(c, code, d) {
  for (let i = 0; i < 80; i++) { try { await set(ref(c.db, `rooms/${code}/intents/${c.uid}`), { ...d, uid: c.uid, at: serverTimestamp() }); return; } catch { await sleep(100); } }
  throw new Error('slot busy');
}
const lat = [];
async function match() {
  const [a, b] = await Promise.all([client(), client()]);
  const { code } = await a.call('createRoom', { game: 'chess', settings: { chessMinutes: 5 } });
  await b.call('joinRoom', { code }); await b.call('setReady', { code, ready: true });
  await intent(a, code, { type: 'start' });
  const r = await waitRoom(a, code, (v) => v.status === 'playing');
  const W = r.players[a.uid].color === 'w' ? a : b, B = W === a ? b : a;
  for (const [p, f, t] of [[W, 'f2', 'f3'], [B, 'e7', 'e5'], [W, 'g2', 'g4'], [B, 'd8', 'h4']]) {
    const t0 = Date.now();
    const seq = (await waitRoom(a, code, () => true)).lastEvents?.seq || 0;
    await intent(p, code, { type: 'move', from: f, to: t });
    await waitRoom(a, code, (v) => (v.lastEvents?.seq || 0) > seq);
    lat.push(Date.now() - t0);
  }
  const end = await waitRoom(a, code, (v) => v.status === 'over');
  return end.result.reason === 'checkmate';
}
const t0 = Date.now();
const res = await Promise.allSettled(Array.from({ length: PAIRS }, () => match()));
const okN = res.filter((r) => r.status === 'fulfilled' && r.value).length;
lat.sort((x, y) => x - y);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
console.log(`players: ${PAIRS * 2}, matches: ${PAIRS}, completed correctly: ${okN}/${PAIRS}`);
console.log(`moves: ${lat.length}, move round-trip p50 ${pct(0.5)}ms, p95 ${pct(0.95)}ms, max ${lat.at(-1)}ms, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
res.filter((r) => r.status === 'rejected').slice(0, 3).forEach((r) => console.log('fail:', r.reason?.message));
process.exit(0);
