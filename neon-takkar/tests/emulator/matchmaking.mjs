import { loadRules } from './setup.mjs';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, get } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
await loadRules();
const cfg = { apiKey: 'demo', projectId: 'demo-neon-takkar', databaseURL: 'http://127.0.0.1:9000/?ns=demo-neon-takkar' };
let k = 0;
async function client() {
  const app = initializeApp(cfg, 'Q' + k++);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app); connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const fns = getFunctions(app, 'asia-south1'); connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const u = (await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: 'q' + Math.random(), email: `q${Date.now()}${Math.random()}@gmail.com`.replace('0.', '') })))).user;
  const call = async (n, d = {}) => (await httpsCallable(fns, n)(d)).data;
  await call('ensureProfile', { name: 'Q' + k });
  return { uid: u.uid, db, call };
}
const N = Number(process.argv[2] || 20); // 20 players hit quick match at the same moment
const cs = await Promise.all(Array.from({ length: N }, client));
const res = await Promise.allSettled(cs.map((c) => c.call('quickMatch', { game: 'ludo' })));
// waiting players poll again (like the app does every 6s)
for (let round = 0; round < 4; round++) {
  await new Promise((r) => setTimeout(r, 1500));
  const waitingIdx = res.map((r, i) => (r.status === 'fulfilled' && r.value.waiting ? i : -1)).filter((i) => i >= 0);
  const notified = await Promise.all(waitingIdx.map((i) => get(ref(cs[i].db, `matchFound/${cs[i].uid}`)).then((s) => !!s.val()).catch(() => false)));
  const pending = waitingIdx.filter((_, j) => !notified[j]);
  if (!pending.length) break;
  const again = await Promise.allSettled(pending.map((i) => cs[i].call('quickMatch', { game: 'ludo' })));
  again.forEach((r, j) => { if (r.status === 'fulfilled' && r.value.code) res[pending[j]] = r; });
}
const failed = res.filter((r) => r.status === 'rejected');
const roomsOf = new Map(); // uid -> set of room codes they are seated in
const allCodes = new Set();
for (const [i, r] of res.entries()) {
  const own = r.status === 'fulfilled' && r.value.code ? r.value.code : null;
  const mf = (await get(ref(cs[i].db, `matchFound/${cs[i].uid}`)).catch(() => null))?.val()?.code;
  for (const c of [own, mf]) if (c) allCodes.add(JSON.stringify([i, c]));
}
const roomPlayers = new Map();
for (const s of allCodes) {
  const [i, code] = JSON.parse(s);
  if (roomPlayers.has(code)) continue;
  const room = (await get(ref(cs[i].db, `rooms/${code}`))).val();
  roomPlayers.set(code, Object.keys(room.players));
}
for (const [code, uids] of roomPlayers) for (const u of uids) { if (!roomsOf.has(u)) roomsOf.set(u, new Set()); roomsOf.get(u).add(code); }
const doubles = [...roomsOf.values()].filter((s) => s.size > 1).length;
const matched = roomsOf.size;
console.log(`players ${N}: rooms ${roomPlayers.size}, players seated ${matched}, seated in >1 room: ${doubles}, unmatched (still waiting): ${N - matched}, errors ${failed.length}`);
console.log(doubles === 0 ? 'NO DOUBLE-BOOKING ✅' : 'DOUBLE-BOOKING ❌');
failed.slice(0, 2).forEach((f) => console.log('err', f.reason?.message));
process.exit(0);
