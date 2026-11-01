import test from 'node:test';
import assert from 'node:assert/strict';
import * as Rm from '../functions/lib/rooms.js';
import { processIntent } from '../functions/shared/room.js';

const host = { name: 'Host', level: 3 };
const mk = (max = 2, game = 'ludo') => Rm.newRoom({ code: 'ABCDEF', game, hostUid: 'h', host, settings: { maxPlayers: max } });

test('join fills seats and rejects when full/started/blocked', () => {
  let r = mk(2);
  r = Rm.join(r, 'a', { name: 'A' });
  assert.equal(r.players.a.seat, 1);
  assert.throws(() => Rm.join(r, 'b', { name: 'B' }), /full/);
  assert.equal(Rm.join(r, 'a', { name: 'A' }), r, 'rejoin is idempotent');
  assert.throws(() => Rm.join(mk(4), 'x', {}, { blockedByHost: true }), /cannot join/);
  assert.throws(() => Rm.join({ ...mk(4), status: 'playing' }, 'x', {}), /started/);
});

test('host leaving promotes next seat; empty room is deleted', () => {
  let r = Rm.join(Rm.join(mk(4), 'a', { name: 'A' }), 'b', { name: 'B' });
  r = Rm.leave(r, 'h');
  assert.equal(r.hostUid, 'a');
  r = Rm.leave(Rm.leave(r, 'a'), 'b');
  assert.equal(r, null);
});

test('settings are host-only and validated', () => {
  let r = Rm.join(mk(4), 'a', { name: 'A' });
  assert.throws(() => Rm.updateSettings(r, 'a', { maxPlayers: 2 }), /host/);
  r = Rm.updateSettings(r, 'h', { maxPlayers: 2, boardTheme: 'ludo_royal' });
  assert.equal(r.settings.maxPlayers, 2);
  assert.equal(r.settings.boardTheme, 'ludo_royal');
});

test('full lobby → ready → start through the shared protocol', () => {
  let r = Rm.join(mk(2, 'chess'), 'a', { name: 'A' });
  assert.throws(() => processIntent(r, { uid: 'h', type: 'start' }), /ready/);
  r = Rm.setReady(r, 'a', true);
  const p = processIntent(r, { uid: 'h', type: 'start' }, { now: 5 });
  assert.equal(p.status, 'playing');
  assert.equal(p.players.h.color, 'w');
});

test('kick is host-only', () => {
  const r = Rm.join(mk(4), 'a', { name: 'A' });
  assert.throws(() => Rm.kick(r, 'a', 'h'), /host/);
  assert.equal(Rm.kick(r, 'h', 'a').players.a, undefined);
});
