import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../www/js/engine/snake.js';

const fixed = (v) => () => v;

test('moves forward and keeps length', () => {
  const g = S.createSnake({ rand: fixed(0.99) });
  const { state } = S.step(g);
  assert.deepEqual(state.snake[0], { x: 5, y: 9 });
  assert.equal(state.snake.length, 3);
});

test('cannot reverse; turns are buffered (max 2)', () => {
  let g = S.createSnake();
  g = S.turn(g, 'left');
  assert.equal(g.queue.length, 0);
  g = S.turn(S.turn(S.turn(g, 'up'), 'left'), 'down');
  assert.deepEqual(g.queue, ['up', 'left']);
  g = S.step(g).state;
  assert.equal(g.dir, 'up');
});

test('eating food grows the snake and scores', () => {
  let g = S.createSnake({ rand: fixed(0) });
  g = { ...g, food: { x: 5, y: g.snake[0].y, emoji: '🍕' } };
  const r = S.step(g, fixed(0));
  assert.equal(r.state.score, 1);
  assert.equal(r.state.snake.length, 4);
  assert.ok(r.events.some((e) => e.type === 'eat'));
  assert.ok(r.state.food && !(r.state.food.x === 5 && r.state.food.y === g.snake[0].y));
});

test('classic: wall kills; portal: wraps around', () => {
  let g = S.createSnake({ w: 6, h: 6 });
  g = { ...g, food: { x: 0, y: 0, emoji: '🍕' } };
  let r = { state: g };
  for (let i = 0; i < 3 && !r.state.over; i++) r = S.step(r.state);
  assert.equal(r.state.over, true);
  assert.equal(r.state.reason, 'wall');
  let p = { ...S.createSnake({ w: 6, h: 6, mode: 'portal' }), food: { x: 0, y: 0, emoji: '🍕' } };
  for (let i = 0; i < 3; i++) p = S.step(p).state;
  assert.equal(p.over, false);
  assert.equal(p.snake[0].x, 1);
});

test('hitting own body ends the game, but moving into the vacating tail is fine', () => {
  let g = { ...S.createSnake({ w: 10, h: 10 }), food: { x: 9, y: 0, emoji: '🍕' } };
  g.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  g.dir = 'down';
  const r = S.step(g);
  assert.equal(r.state.reason, 'self');
  let t = { ...S.createSnake({ w: 10, h: 10 }), food: { x: 9, y: 0, emoji: '🍕' } };
  t.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }];
  t.dir = 'left';
  assert.equal(S.step(t).state.over, false);
});

test('hard mode has obstacles that kill, start row is clear', () => {
  const g = S.createSnake({ level: 'hard' });
  assert.ok(g.obstacles.length > 0);
  assert.ok(g.obstacles.every((o) => o.y !== g.snake[0].y));
  const h = { ...g, obstacles: [{ x: 5, y: g.snake[0].y }] };
  assert.equal(S.step(h).state.reason, 'obstacle');
});

test('golden coin spawns every 7 foods, gives bonus, expires', () => {
  let g = S.createSnake({ w: 20, h: 20 });
  g = { ...g, eaten: 6, food: { x: 5, y: g.snake[0].y, emoji: '🍕' } };
  let r = S.step(g);
  assert.ok(r.events.some((e) => e.type === 'golden-spawn'));
  assert.ok(r.state.golden);
  const gold = r.state.golden;
  const h = { ...r.state, golden: { ...gold, x: r.state.snake[0].x + 1, y: r.state.snake[0].y } };
  const r2 = S.step(h);
  assert.equal(r2.state.score, 1 + S.GOLDEN_POINTS);
  let e = { ...r.state, golden: { x: 0, y: 0, ttl: 1 } };
  assert.ok(S.step(e).events.some((x) => x.type === 'golden-gone'));
});

test('speed increases and rewards are capped', () => {
  const g = S.createSnake({ level: 'easy' });
  assert.ok(S.interval({ ...g, eaten: 20 }) < S.interval(g));
  assert.deepEqual(S.snakeRewards(1000), { coins: 150, xp: 100 });
});

test('random games always terminate without errors', () => {
  for (const mode of ['classic', 'portal']) {
    let g = S.createSnake({ mode, level: 'hard' });
    const dirs = Object.keys(S.DIRS);
    for (let i = 0; i < 5000 && !g.over; i++) {
      if (Math.random() < 0.3) g = S.turn(g, dirs[Math.floor(Math.random() * 4)]);
      g = S.step(g).state;
    }
    assert.ok(g.score >= 0);
  }
});
