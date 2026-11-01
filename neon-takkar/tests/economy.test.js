import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../functions/lib/economy.js';

const prof = () => E.newProfile({ name: 'Rohan', playerId: 'NT-AAAA2222' });

test('new profile owns all free items', () => {
  const p = prof();
  assert.equal(p.coins, E.START_COINS);
  assert.ok(p.inventory.skin_classic && p.inventory.ludo_neon && p.inventory.av_cool);
  assert.ok(!p.inventory.skin_thug);
});

test('purchase checks balance, ownership and level', () => {
  const p = prof();
  const r = E.purchase(p, 'skin_thug');
  assert.equal(r.coins, E.START_COINS - 300);
  assert.ok(r.inventory.skin_thug);
  assert.throws(() => E.purchase({ ...p, ...r }, 'skin_thug'), /Already/);
  assert.throws(() => E.purchase({ ...p, coins: 10 }, 'skin_thug'), /Not enough/);
  assert.throws(() => E.purchase(p, 'pframe_crown'), /level 3/);
  assert.throws(() => E.purchase(p, 'nope'), /Unknown/);
});

test('daily reward streak and once-per-day', () => {
  const day0 = Date.UTC(2026, 10, 1, 6);
  let p = prof();
  const a = E.claimDaily(p, day0);
  assert.equal(a.streak, 1);
  p = { ...p, ...a.patch };
  assert.throws(() => E.claimDaily(p, day0 + 3600_000), /Already/);
  const b = E.claimDaily(p, day0 + 86400_000);
  assert.equal(b.streak, 2);
  assert.equal(b.reward.coins, 150);
  const c = E.claimDaily(p, day0 + 3 * 86400_000); // missed days resets
  assert.equal(c.streak, 1);
});

test('offline sync is clamped per entry and per day', () => {
  const p = prof();
  const r = E.syncOffline(p, [{ kind: 'match', coins: 99999, xp: 99999 }, { kind: 'hack', coins: 5000 }]);
  assert.equal(r.applied.coins, 200);
  assert.equal(r.applied.xp, 100);
  assert.equal(r.rejected, 1);
  const many = Array.from({ length: 50 }, () => ({ kind: 'match', coins: 200, xp: 100 }));
  const r2 = E.syncOffline(p, many);
  assert.equal(r2.applied.coins, E.OFFLINE_DAILY_COIN_CAP);
  const r3 = E.syncOffline({ ...p, ...r2.patch }, many);
  assert.equal(r3.applied.coins, 0);
});

test('xp level-ups grant coins & diamonds', () => {
  const r = E.applyXp({ level: 1, xp: 0, coins: 0, diamonds: 0 }, 200 + 320 + 5);
  assert.deepEqual(r.levelUps, [2, 3]);
  assert.equal(r.xp, 5);
  assert.equal(r.coins, 300);
});

test('cosmetics must be owned', () => {
  const p = prof();
  assert.deepEqual(E.sanitizeCosmetics(p, { avatar: '😎', frame: 'pframe_basic' }), { avatar: '😎', frame: 'pframe_basic' });
  assert.deepEqual(E.sanitizeCosmetics(p, { avatar: '🦁', frame: 'pframe_fire' }), {});
});

test('guest progress import is capped and allowed once', () => {
  const p = prof();
  const r = E.importGuest(p, { coins: 999999, diamonds: 5, level: 50, xp: 99999, items: ['skin_thug', 'nope', 'pframe_fire', 'skin_classic'] });
  assert.equal(r.patch.coins, E.GUEST_IMPORT_CAPS.coins);
  assert.equal(r.patch.diamonds, p.diamonds, 'never lowers existing balance');
  assert.equal(r.patch.level, E.GUEST_IMPORT_CAPS.level);
  assert.ok(r.patch.xp < E.xpForLevel(r.patch.level));
  assert.ok(r.patch.inventory.skin_thug && r.patch.inventory.pframe_fire);
  assert.equal(r.itemsAdded, 2);
  assert.throws(() => E.importGuest({ ...p, ...r.patch }, {}), /already/);
});
