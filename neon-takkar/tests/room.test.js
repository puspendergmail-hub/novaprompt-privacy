import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../www/js/engine/room.js';
import * as L from '../www/js/engine/ludo.js';

const roomFor = (game, n = 2, extra = {}) => {
  const players = {};
  for (let i = 0; i < n; i++) players['u' + i] = { name: 'P' + i, seat: i, ready: i > 0 };
  return { code: 'ABC234', game, hostUid: 'u0', status: 'lobby', settings: R.sanitizeSettings(game, { maxPlayers: n, chessMinutes: 5 }), players, ...extra };
};
const apply = (room, patch) => {
  const { events, ...rest } = patch;
  return { ...room, ...rest, players: { ...room.players, ...(rest.players || {}) } };
};

test('room codes are valid', () => {
  for (let i = 0; i < 50; i++) assert.ok(R.isValidRoomCode(R.makeRoomCode()));
  assert.equal(R.isValidRoomCode('abc'), false);
  assert.equal(R.isValidRoomCode('ABCDE1'), false); // 1 is ambiguous & excluded
});

test('only host can start, everyone must be ready, seat count must match', () => {
  let room = roomFor('ludo', 2);
  assert.throws(() => R.processIntent(room, { uid: 'u1', type: 'start' }), /host/);
  room.players.u1.ready = false;
  assert.throws(() => R.processIntent(room, { uid: 'u0', type: 'start' }), /ready/);
  room.players.u1.ready = true;
  const r4 = roomFor('ludo', 2); r4.settings.maxPlayers = 4;
  assert.throws(() => R.processIntent(r4, { uid: 'u0', type: 'start' }), /exactly 4/);
  const p = R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 1000 });
  assert.equal(p.status, 'playing');
  assert.equal(p.players.u0.color, 'red');
});

test('ludo: server rolls dice, rejects out-of-turn & illegal moves', () => {
  let room = roomFor('ludo', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 0 }));
  assert.throws(() => R.processIntent(room, { uid: 'u1', type: 'roll' }), /turn/);
  // force a six from the server RNG
  const p = R.processIntent(room, { uid: 'u0', type: 'roll' }, { now: 1, rand: () => 0.99 });
  assert.equal(p.state.dice, 6);
  room = apply(room, p);
  assert.throws(() => R.processIntent(room, { uid: 'u0', type: 'move', token: 9 }));
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'move', token: 2 }, { now: 2 }));
  assert.equal(room.state.players[0].tokens[2], 0);
});

test('ludo: timeout only after deadline', () => {
  let room = roomFor('ludo', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 0 }));
  assert.throws(() => R.processIntent(room, { uid: 'u1', type: 'timeout' }, { now: 10 }));
  const p = R.processIntent(room, { uid: 'u1', type: 'timeout' }, { now: R.LUDO_TURN_MS + 1 });
  assert.equal(p.state.turn, 1);
});

test('ludo: finishing produces a result with winner uid', () => {
  let room = roomFor('ludo', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 0 }));
  room.state.players[0].tokens = [55, 56, 56, 56];
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'roll' }, { now: 1, rand: () => 0 }));
  const p = R.processIntent(room, { uid: 'u0', type: 'move', token: 0 }, { now: 120_000 });
  assert.equal(p.status, 'over');
  assert.equal(p.result.winnerUid, 'u0');
  assert.deepEqual(R.rewardsFor(p.result, 'u0', 'ludo').coins > R.rewardsFor(p.result, 'u1', 'ludo').coins, true);
});

test('chess: turn ownership, clocks and mate', () => {
  let room = roomFor('chess', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 0 }));
  assert.equal(room.players.u0.color, 'w');
  assert.throws(() => R.processIntent(room, { uid: 'u1', type: 'move', from: 'e7', to: 'e5' }, { now: 1 }), /turn/);
  assert.throws(() => R.processIntent(room, { uid: 'u0', type: 'move', from: 'e2', to: 'e5' }, { now: 1 }), /Illegal/);
  const moves = [['u0', 'f2', 'f3'], ['u1', 'e7', 'e5'], ['u0', 'g2', 'g4'], ['u1', 'd8', 'h4']];
  let t = 0, last;
  for (const [uid, from, to] of moves) { t += 1000; last = R.processIntent(room, { uid, type: 'move', from, to }, { now: t }); room = apply(room, last); }
  assert.equal(room.status, 'over');
  assert.equal(room.result.winnerUid, 'u1');
  assert.equal(room.clocks.w, 5 * 60000 - 2000);
});

test('chess: flag fall', () => {
  let room = roomFor('chess', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 0 }));
  assert.throws(() => R.processIntent(room, { uid: 'u1', type: 'timeout' }, { now: 1000 }));
  const p = R.processIntent(room, { uid: 'u1', type: 'timeout' }, { now: 5 * 60000 + 1 });
  assert.equal(p.result.winnerUid, 'u1');
  assert.equal(p.result.reason, 'timeout');
});

test('strangers cannot act', () => {
  const room = roomFor('ludo', 2);
  assert.throws(() => R.processIntent(room, { uid: 'evil', type: 'start' }), /Not in this room/);
});

test('ludo: three missed turns in a row forfeits the player', () => {
  let room = roomFor('ludo', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 0 }));
  let t = 0;
  for (let i = 0; i < 6 && room.status === 'playing'; i++) {
    const cur = room.state.players[room.state.turn].id;
    if (cur === 'u0') { t += R.LUDO_TURN_MS + 1; room = apply(room, R.processIntent(room, { uid: 'u1', type: 'timeout' }, { now: t })); }
    else { room = apply(room, R.processIntent(room, { uid: 'u1', type: 'roll' }, { now: t, rand: () => 0 })); }
  }
  assert.equal(room.status, 'over');
  assert.equal(room.result.winnerUid, 'u1');
  assert.equal(room.result.reason, 'forfeit');
});

test('anti-farming: instant resign gives no coins', () => {
  let room = roomFor('chess', 2);
  room = apply(room, R.processIntent(room, { uid: 'u0', type: 'start' }, { now: 1000 }));
  const quick = R.processIntent(room, { uid: 'u0', type: 'resign' }, { now: 5000 });
  assert.equal(R.rewardsFor(quick.result, 'u1', 'chess').coins, 0);
  const slow = R.processIntent(room, { uid: 'u0', type: 'resign' }, { now: 1000 + 5 * 60_000 });
  assert.ok(R.rewardsFor(slow.result, 'u1', 'chess').coins > 0);
});

test('room shards: stable and evenly spread', () => {
  assert.equal(R.shardIndex('ABCDEF', 1), 0);
  assert.equal(R.shardIndex('ABCDEF', 4), R.shardIndex('ABCDEF', 4));
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) counts[R.shardIndex(R.makeRoomCode(), 4)]++;
  for (const c of counts) assert.ok(c > 4500 && c < 5500, `uneven: ${counts}`);
});
