// Robustness: throw random / malicious input at every pure module — nothing may crash
// with anything other than a clean, expected error, and state must stay valid.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../www/js/engine/ludo.js';
import * as C from '../www/js/engine/chess.js';
import * as R from '../www/js/engine/room.js';
import * as S from '../www/js/engine/snake.js';
import { cleanText, cleanName } from '../www/js/engine/moderation.js';
import * as E from '../functions/lib/economy.js';
import * as Lobby from '../functions/lib/rooms.js';

const GARBAGE = ['__proto__', 'constructor', 'toString', undefined, null, 0, -1, 1e308, NaN, '', 'x', '<script>', [], {}, { __proto__: { admin: true } }, () => 1, '../../etc', 'e2e4', 'A'.repeat(100000), true];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

test('prototype keys never count as a room member', () => {
  const room = { game: 'chess', hostUid: 'a', status: 'playing', players: { a: { color: 'w' }, b: { color: 'b' } }, state: C.serialize(C.createGame()), clocks: { w: 1, b: 1, lastTs: 0 } };
  for (const uid of ['__proto__', 'constructor', 'hasOwnProperty']) assert.throws(() => R.processIntent(room, { uid, type: 'resign' }), /Not in this room/);
});

test('room protocol never crashes on malicious intents', () => {
  const base = () => {
    const players = { a: { name: 'A', seat: 0, ready: true }, b: { name: 'B', seat: 1, ready: true } };
    return { code: 'ABCDEF', game: pick(['ludo', 'chess']), hostUid: 'a', status: 'lobby', settings: { maxPlayers: 2, chessMinutes: 5 }, players };
  };
  let ok = 0, rejected = 0;
  for (let i = 0; i < 5000; i++) {
    let room = base();
    try {
      const p = R.processIntent(room, { uid: 'a', type: 'start' }, { now: 0 });
      room = { ...room, ...p, players: { ...room.players, ...p.players } };
    } catch { /* fine */ }
    const intent = { uid: pick(['a', 'b', 'evil', ...GARBAGE]), type: pick(['roll', 'move', 'start', 'resign', 'timeout', 'win', ...GARBAGE]), token: pick([0, 1, 2, 3, 99, ...GARBAGE]), from: pick(['e2', 'z9', 52, ...GARBAGE]), to: pick(['e4', 'a1', 36, ...GARBAGE]), promotion: pick(['q', 'k', ...GARBAGE]) };
    try {
      R.processIntent(room, intent, { now: pick([0, 1, 1e12, -5, NaN]), rand: Math.random });
      ok++;
    } catch (e) {
      assert.ok(e instanceof Error, 'only clean Errors');
      assert.ok(!/undefined|cannot read|is not a function/i.test(e.message), `unexpected crash: ${e.message}`);
      rejected++;
    }
  }
  assert.ok(ok + rejected === 5000);
});

test('chess engine survives random legal play and garbage requests', () => {
  for (let g = 0; g < 60; g++) {
    let s = C.createGame();
    for (let i = 0; i < 200 && !C.status(s).over; i++) {
      const moves = C.legalMoves(C.clonePos(s));
      const m = pick(moves);
      s = C.makeMove(s, { from: m.from, to: m.to, promotion: m.promotion }).state;
      assert.equal(s.board.filter((p) => p === 'K').length, 1);
      assert.equal(s.board.filter((p) => p === 'k').length, 1);
    }
    for (let i = 0; i < 20; i++) {
      assert.throws(() => C.makeMove(s, { from: pick(GARBAGE), to: pick(GARBAGE) }));
    }
    const back = C.deserialize(JSON.parse(JSON.stringify(C.serialize(s))));
    assert.equal(C.toFEN(back), C.toFEN(s));
  }
});

test('ludo engine invariants hold over thousands of random games', () => {
  for (let g = 0; g < 300; g++) {
    let s = L.createGame({ players: Array.from({ length: pick([2, 3, 4]) }, (_, i) => ({ name: 'P' + i })) });
    for (let i = 0; i < 3000 && s.phase !== 'over'; i++) {
      if (s.phase === 'roll') s = L.roll(s, 1 + Math.floor(Math.random() * 6)).state;
      else {
        assert.throws(() => L.move(s, pick([-1, 4, 99, 'x', null])));
        s = L.move(s, pick(L.legalMoves(s))).state;
      }
      for (const p of s.players) for (const t of p.tokens) assert.ok(Number.isInteger(t) && t >= -1 && t <= L.FINISH);
    }
    assert.equal(s.phase, 'over');
  }
});

test('snake engine survives random input', () => {
  for (let g = 0; g < 200; g++) {
    let s = S.createSnake({ mode: pick(['classic', 'portal']), level: pick(['easy', 'medium', 'hard']) });
    for (let i = 0; i < 2000 && !s.over; i++) {
      s = S.turn(s, pick(['up', 'down', 'left', 'right', ...GARBAGE]));
      s = S.step(s).state;
      for (const p of s.snake) assert.ok(p.x >= 0 && p.y >= 0 && p.x < s.w && p.y < s.h);
    }
  }
});

test('moderation handles hostile strings', () => {
  for (let i = 0; i < 3000; i++) {
    const len = Math.floor(Math.random() * 400);
    let str = '';
    for (let j = 0; j < len; j++) str += String.fromCodePoint(Math.floor(Math.random() * 0x2FFFF));
    const t = cleanText(str);
    assert.ok(typeof t === 'string' && t.length <= 200 + 20);
    assert.ok(typeof cleanName(str) === 'string');
  }
  for (const g of GARBAGE) { assert.equal(typeof cleanText(g), 'string'); assert.equal(typeof cleanName(g), 'string'); }
});

test('economy rejects malformed payloads cleanly', () => {
  const p = E.newProfile({ name: 'X', playerId: 'NT-AAAA2222' });
  for (const g of GARBAGE) {
    try { E.purchase(p, g); } catch (e) { assert.ok(e instanceof Error); }
    const r = E.syncOffline(p, g);
    assert.equal(r.applied.coins, 0);
    const imp = E.importGuest(p, typeof g === 'object' && g ? g : {});
    assert.ok(imp.patch.coins >= p.coins && imp.patch.coins <= E.GUEST_IMPORT_CAPS.coins);
  }
  const weird = E.syncOffline(p, [{ kind: 'match', coins: -500, xp: -9 }, { kind: 'match', coins: '200', xp: '1e9' }, { kind: '__proto__' }]);
  assert.ok(weird.applied.coins >= 0 && weird.applied.coins <= 200);
  assert.ok(Number.isFinite(weird.patch.coins) && Number.isFinite(weird.patch.xp), 'balances can never become NaN');
  assert.throws(() => E.purchase({ ...p, coins: NaN }, 'skin_thug'), /balance|Not enough/);
  assert.throws(() => E.purchase(p, '__proto__'), /Unknown/);
});

test('lobby ops reject garbage', () => {
  const room = Lobby.newRoom({ code: 'ABCDEF', game: 'ludo', hostUid: 'h', host: { name: 'H' }, settings: { maxPlayers: 4 } });
  for (const g of GARBAGE) {
    try { Lobby.updateSettings(room, 'h', g); } catch (e) { assert.ok(e instanceof Error); }
    const s = Lobby.updateSettings(room, 'h', { maxPlayers: g, boardTheme: g, chessMinutes: g });
    assert.ok([2, 4].includes(s.settings.maxPlayers));
    assert.ok(typeof s.settings.boardTheme === 'string' && s.settings.boardTheme.length <= 32);
  }
  assert.throws(() => Lobby.newRoom({ code: 'X', game: 'poker', hostUid: 'h', host: {} }));
});

test('server logic throughput (single core)', () => {
  const players = { a: { name: 'A', seat: 0, ready: true }, b: { name: 'B', seat: 1, ready: true } };
  let room = { code: 'ABCDEF', game: 'ludo', hostUid: 'a', status: 'lobby', settings: { maxPlayers: 2 }, players };
  const p = R.processIntent(room, { uid: 'a', type: 'start' }, { now: 0 });
  room = { ...room, ...p, players: { ...players, ...p.players } };
  const t0 = performance.now();
  let n = 0;
  while (performance.now() - t0 < 1000) {
    const cur = room.state.players[room.state.turn].id;
    const intent = room.state.phase === 'roll' ? { uid: cur, type: 'roll' } : { uid: cur, type: 'move', token: L.legalMoves(room.state)[0] };
    const q = R.processIntent(room, intent, { now: n });
    room = { ...room, ...q };
    if (room.status === 'over') room = { ...room, status: 'playing', state: L.createGame({ players: [{ id: 'a' }, { id: 'b' }] }) };
    n++;
  }
  console.log(`   ludo intents validated per second per core: ${n.toLocaleString()}`);
  assert.ok(n > 2000);
});
