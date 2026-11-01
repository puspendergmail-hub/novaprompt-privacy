/**
 * NEON TAKKAR — Snake rules engine (pure, deterministic given an RNG).
 * Grid coordinates {x, y}; head is snake[0].
 *
 * Modes:
 *   classic — hitting a wall ends the game
 *   portal  — walls wrap around to the other side
 * Difficulty adds speed and (hard) obstacle blocks.
 */

export const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const FOODS = ['🍕', '🥭', '🍫', '🥟', '🍩', '🌶️', '🍌', '🧃'];
export const SPEED = { easy: 140, medium: 105, hard: 80 }; // ms per tick at start
export const GOLDEN_TTL = 40; // ticks a golden coin stays on the board
export const GOLDEN_POINTS = 5;

const key = (p) => `${p.x},${p.y}`;

export function createSnake({ w = 18, h = 18, mode = 'classic', level = 'medium', rand = Math.random } = {}) {
  const cy = Math.floor(h / 2);
  const state = {
    w, h, mode, level,
    snake: [{ x: 4, y: cy }, { x: 3, y: cy }, { x: 2, y: cy }],
    dir: 'right',
    queue: [],
    obstacles: [],
    food: null,
    golden: null,
    score: 0,
    eaten: 0,
    tick: 0,
    over: false,
    reason: null,
  };
  if (level === 'hard') state.obstacles = makeObstacles(state, rand);
  state.food = { ...freeCell(state, rand), emoji: FOODS[Math.floor(rand() * FOODS.length)] };
  return state;
}

function makeObstacles(state, rand) {
  const out = [];
  const blocked = new Set(state.snake.map(key));
  // keep the starting row and the cells ahead of the snake free
  for (let x = 0; x < state.w; x++) blocked.add(key({ x, y: state.snake[0].y }));
  const count = Math.round((state.w * state.h) / 40);
  let guard = 0;
  while (out.length < count && guard++ < 1000) {
    const p = { x: 1 + Math.floor(rand() * (state.w - 2)), y: 1 + Math.floor(rand() * (state.h - 2)) };
    if (blocked.has(key(p))) continue;
    out.push(p);
    blocked.add(key(p));
  }
  return out;
}

export function occupied(state) {
  const s = new Set(state.snake.map(key));
  for (const o of state.obstacles) s.add(key(o));
  if (state.food) s.add(key(state.food));
  if (state.golden) s.add(key(state.golden));
  return s;
}

export function freeCell(state, rand = Math.random) {
  const occ = occupied(state);
  const free = [];
  for (let y = 0; y < state.h; y++) for (let x = 0; x < state.w; x++) if (!occ.has(`${x},${y}`)) free.push({ x, y });
  if (!free.length) return null;
  return free[Math.floor(rand() * free.length)];
}

/** Queue a direction change (ignores reversals and duplicates; max 2 buffered). */
export function turn(state, dir) {
  if (!DIRS[dir] || state.over) return state;
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= 2) return state;
  return { ...state, queue: [...state.queue, dir] };
}

/** Current tick interval in ms — speeds up every 5 foods. */
export function interval(state) {
  const base = SPEED[state.level] || SPEED.medium;
  return Math.max(45, base - Math.floor(state.eaten / 5) * 6);
}

/**
 * Advance one tick.
 * @returns {{state, events: Array<{type:string}>}}
 */
export function step(prev, rand = Math.random) {
  if (prev.over) return { state: prev, events: [] };
  const state = { ...prev, snake: prev.snake.slice(), queue: prev.queue.slice() };
  const events = [];
  if (state.queue.length) state.dir = state.queue.shift();
  const d = DIRS[state.dir];
  let head = { x: state.snake[0].x + d.x, y: state.snake[0].y + d.y };
  state.tick += 1;

  if (head.x < 0 || head.y < 0 || head.x >= state.w || head.y >= state.h) {
    if (state.mode === 'portal') {
      head = { x: (head.x + state.w) % state.w, y: (head.y + state.h) % state.h };
      events.push({ type: 'portal' });
    } else {
      return die(state, 'wall', events);
    }
  }
  if (state.obstacles.some((o) => o.x === head.x && o.y === head.y)) return die(state, 'obstacle', events);

  const eatsFood = state.food && head.x === state.food.x && head.y === state.food.y;
  const eatsGolden = state.golden && head.x === state.golden.x && head.y === state.golden.y;
  const grows = eatsFood || eatsGolden;
  // the tail moves away this tick unless we grow, so it's not a collision
  const body = grows ? state.snake : state.snake.slice(0, -1);
  if (body.some((s) => s.x === head.x && s.y === head.y)) return die(state, 'self', events);

  state.snake.unshift(head);
  if (!grows) state.snake.pop();

  if (eatsFood) {
    state.score += 1;
    state.eaten += 1;
    events.push({ type: 'eat', emoji: state.food.emoji, score: state.score });
    const cell = freeCell({ ...state, food: null }, rand);
    state.food = cell ? { ...cell, emoji: FOODS[Math.floor(rand() * FOODS.length)] } : null;
    if (!state.food) { state.over = true; state.reason = 'perfect'; events.push({ type: 'perfect' }); return { state, events }; }
    if (!state.golden && state.eaten % 7 === 0) {
      const g = freeCell(state, rand);
      if (g) { state.golden = { ...g, ttl: GOLDEN_TTL }; events.push({ type: 'golden-spawn' }); }
    }
    if (state.eaten % 5 === 0) events.push({ type: 'speed-up' });
  }
  if (eatsGolden) {
    state.score += GOLDEN_POINTS;
    state.golden = null;
    events.push({ type: 'golden', score: state.score });
  } else if (state.golden) {
    const ttl = state.golden.ttl - 1;
    state.golden = ttl > 0 ? { ...state.golden, ttl } : null;
    if (!state.golden) events.push({ type: 'golden-gone' });
  }
  return { state, events };
}

function die(state, reason, events) {
  state.over = true;
  state.reason = reason;
  events.push({ type: 'die', reason });
  return { state, events };
}

/** How close (in free cells straight ahead) the head is to a crash — used for "danger" reactions. */
export function dangerAhead(state) {
  const d = DIRS[state.queue[0] || state.dir];
  let { x, y } = state.snake[0];
  const body = new Set(state.snake.slice(0, -1).map(key));
  const obs = new Set(state.obstacles.map(key));
  for (let i = 1; i <= 3; i++) {
    x += d.x; y += d.y;
    if (state.mode === 'portal') { x = (x + state.w) % state.w; y = (y + state.h) % state.h; } else if (x < 0 || y < 0 || x >= state.w || y >= state.h) return i;
    if (body.has(`${x},${y}`) || obs.has(`${x},${y}`)) return i;
  }
  return 0;
}

/** Local rewards for a finished run (cosmetic currency only). */
export function snakeRewards(score) {
  return { coins: Math.min(150, Math.floor(score * 2.5)), xp: Math.min(100, score * 3) };
}
