/**
 * NEON TAKKAR — Ludo rules engine (pure, framework-free).
 * Shared by the browser client (offline play + AI) and Cloud Functions
 * (authoritative validation of online matches).
 *
 * Token progress encoding (relative to the token's own colour):
 *   -1        in base (yard)
 *   0..50     on the shared 52-cell main track (0 = own start cell)
 *   51..55    own home column
 *   56        finished (home triangle)
 */

export const COLORS = ['red', 'green', 'yellow', 'blue'];
export const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];
export const TRACK_LEN = 52;
export const LAST_TRACK = 50;
export const HOME_COL_START = 51;
export const FINISH = 56;

/** Board geometry for rendering on a 15x15 grid: [row, col]. */
export const TRACK_COORDS = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];
export const HOME_COORDS = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};
export const BASE_COORDS = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  green: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  blue: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};
export const FINISH_COORDS = {
  red: [7, 6.1], green: [6.1, 7], yellow: [7, 7.9], blue: [7.9, 7],
};

/** Grid coordinate [row, col] of a token for rendering. */
export function tokenCoord(color, progress, tokenIdx = 0) {
  if (progress < 0) return BASE_COORDS[color][tokenIdx];
  if (progress >= FINISH) return FINISH_COORDS[color];
  if (progress >= HOME_COL_START) return HOME_COORDS[color][progress - HOME_COL_START];
  return TRACK_COORDS[absCell(color, progress)];
}

export function absCell(color, progress) {
  return (START_INDEX[color] + progress) % TRACK_LEN;
}

export function isSafe(abs) {
  return SAFE_CELLS.includes(abs);
}

/**
 * Create a new game.
 * @param {{players: Array<{id?:string,name:string,color?:string,type?:string}>}} opts
 */
export function createGame({ players }) {
  if (!players || players.length < 2 || players.length > 4) {
    throw new Error('Ludo needs 2 to 4 players');
  }
  const defaultColors = players.length === 2 ? ['red', 'yellow']
    : players.length === 3 ? ['red', 'green', 'yellow'] : COLORS;
  const used = new Set();
  const ps = players.map((p, i) => {
    const color = p.color && COLORS.includes(p.color) && !used.has(p.color) ? p.color : defaultColors[i];
    if (used.has(color)) throw new Error('Duplicate colour ' + color);
    used.add(color);
    return {
      id: p.id ?? `p${i}`,
      name: p.name ?? `Player ${i + 1}`,
      type: p.type ?? 'human',
      color,
      tokens: [-1, -1, -1, -1],
      nearWin: false,
      captures: 0,
    };
  });
  // Turn order follows the clockwise colour order.
  ps.sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
  return {
    game: 'ludo',
    players: ps,
    turn: 0,
    phase: 'roll', // roll | move | over
    dice: null,
    sixCount: 0,
    winner: null,
    moveNo: 0,
    lastMove: null,
  };
}

export function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function currentPlayer(state) {
  return state.players[state.turn];
}

/** Can token `t` of the current player move with the current dice value? */
function canMoveToken(progress, dice) {
  if (progress >= FINISH) return false;
  if (progress < 0) return dice === 6;
  return progress + dice <= FINISH;
}

/** Indices of tokens of the current player that may legally move. */
export function legalMoves(state) {
  if (state.phase !== 'move' || state.dice == null) return [];
  const p = currentPlayer(state);
  const res = [];
  p.tokens.forEach((pr, i) => { if (canMoveToken(pr, state.dice)) res.push(i); });
  return res;
}

function movablesFor(state, dice) {
  const p = currentPlayer(state);
  return p.tokens.map((pr, i) => (canMoveToken(pr, dice) ? i : -1)).filter((i) => i >= 0);
}

function advanceTurn(state) {
  state.turn = (state.turn + 1) % state.players.length;
  state.sixCount = 0;
  state.phase = 'roll';
  state.dice = null;
}

/**
 * Apply a dice roll for the current player. `value` must be 1..6 and should come
 * from a trusted source (server RNG online, Math.random offline).
 * @returns {{state:object, events:Array}}
 */
export function roll(prev, value) {
  if (prev.phase !== 'roll') throw new Error('Not time to roll');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('Bad dice value');
  const state = clone(prev);
  const events = [];
  const player = currentPlayer(state);
  state.dice = value;
  events.push({ type: 'roll', color: player.color, value });
  if (value === 6) {
    state.sixCount += 1;
    events.push({ type: 'six', color: player.color, count: state.sixCount });
  } else {
    state.sixCount = 0;
  }
  if (state.sixCount >= 3) {
    events.push({ type: 'three-sixes', color: player.color });
    advanceTurn(state);
    return { state, events };
  }
  const movable = movablesFor(state, value);
  if (movable.length === 0) {
    events.push({ type: 'no-move', color: player.color });
    if (value === 6) {
      state.phase = 'roll';
      state.dice = null;
    } else {
      advanceTurn(state);
    }
    return { state, events };
  }
  state.phase = 'move';
  return { state, events };
}

/**
 * Move a token of the current player by the current dice value.
 * @returns {{state:object, events:Array}}
 */
export function move(prev, tokenIdx) {
  if (prev.phase !== 'move') throw new Error('Not time to move');
  if (!legalMoves(prev).includes(tokenIdx)) throw new Error('Illegal token move');
  const state = clone(prev);
  const events = [];
  const player = currentPlayer(state);
  const from = player.tokens[tokenIdx];
  const dice = state.dice;
  const to = from < 0 ? 0 : from + dice;
  player.tokens[tokenIdx] = to;
  state.moveNo += 1;
  state.lastMove = { color: player.color, token: tokenIdx, from, to };
  events.push({ type: from < 0 ? 'unlock' : 'move', color: player.color, token: tokenIdx, from, to });

  let captured = false;
  if (to <= LAST_TRACK) {
    const abs = absCell(player.color, to);
    if (!isSafe(abs)) {
      for (const opp of state.players) {
        if (opp.color === player.color) continue;
        opp.tokens.forEach((pr, i) => {
          if (pr >= 0 && pr <= LAST_TRACK && absCell(opp.color, pr) === abs) {
            opp.tokens[i] = -1;
            captured = true;
            player.captures += 1;
            events.push({ type: 'capture', by: player.color, victim: opp.color, token: i, cell: abs, lostProgress: pr });
          }
        });
      }
    }
  }

  const reachedHome = to === FINISH;
  if (reachedHome) events.push({ type: 'home', color: player.color, token: tokenIdx });

  if (player.tokens.every((pr) => pr === FINISH)) {
    state.winner = player.color;
    state.phase = 'over';
    state.dice = null;
    events.push({ type: 'win', color: player.color });
    return { state, events };
  }

  if (!player.nearWin && player.tokens.every((pr) => pr >= HOME_COL_START)) {
    player.nearWin = true;
    events.push({ type: 'near-win', color: player.color });
  }

  if (dice === 6 || captured || reachedHome) {
    state.phase = 'roll';
    state.dice = null;
    events.push({ type: 'extra-turn', color: player.color });
  } else {
    advanceTurn(state);
  }
  return { state, events };
}

/** Skip the current player's turn (timeout / disconnect). */
export function skipTurn(prev) {
  if (prev.phase === 'over') return { state: prev, events: [] };
  const state = clone(prev);
  const color = currentPlayer(state).color;
  advanceTurn(state);
  return { state, events: [{ type: 'skip', color }] };
}

/** Remove a player who resigned / left. If one remains, they win. */
export function forfeit(prev, color) {
  const state = clone(prev);
  const idx = state.players.findIndex((p) => p.color === color);
  if (idx < 0 || state.phase === 'over') return { state: prev, events: [] };
  const events = [{ type: 'forfeit', color }];
  const wasTurn = idx === state.turn;
  state.players.splice(idx, 1);
  if (state.players.length === 1) {
    state.winner = state.players[0].color;
    state.phase = 'over';
    state.turn = 0;
    events.push({ type: 'win', color: state.winner });
    return { state, events };
  }
  if (idx < state.turn) state.turn -= 1;
  if (wasTurn) {
    state.turn = state.turn % state.players.length;
    state.phase = 'roll';
    state.dice = null;
    state.sixCount = 0;
  }
  return { state, events };
}

/** Total progress score, used for ranking unfinished players. */
export function score(player) {
  return player.tokens.reduce((s, pr) => s + (pr < 0 ? 0 : pr + 1), 0);
}

export function ranking(state) {
  return [...state.players].sort((a, b) => {
    if (state.winner === a.color) return -1;
    if (state.winner === b.color) return 1;
    return score(b) - score(a);
  }).map((p) => p.color);
}

/* ----------------------------- AI ----------------------------- */

/** Could an opponent token land on `abs` with a single roll? */
function dangerAt(state, color, abs) {
  if (isSafe(abs)) return 0;
  let danger = 0;
  for (const opp of state.players) {
    if (opp.color === color) continue;
    for (const pr of opp.tokens) {
      if (pr < 0) {
        // Opponent can unlock onto its start cell with a 6 — only risky if abs is their start (safe anyway).
        continue;
      }
      if (pr > LAST_TRACK) continue;
      const oppAbs = absCell(opp.color, pr);
      const dist = (abs - oppAbs + TRACK_LEN) % TRACK_LEN;
      // opponent must not pass its own home entry before reaching abs
      if (dist >= 1 && dist <= 6 && pr + dist <= LAST_TRACK) danger += 1;
    }
  }
  return danger;
}

/**
 * Choose a token to move for an AI player.
 * @param {'easy'|'medium'|'hard'} level
 */
export function chooseMove(state, level = 'medium', rand = Math.random) {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  if (level === 'easy') {
    return moves[Math.floor(rand() * moves.length)];
  }
  const player = currentPlayer(state);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const t of moves) {
    const { state: next, events } = move(state, t);
    const from = player.tokens[t];
    const to = next.players.find((p) => p.color === player.color)?.tokens[t] ?? FINISH;
    let s = 0;
    for (const e of events) {
      if (e.type === 'capture') s += 60 + e.lostProgress;
      if (e.type === 'home') s += 45;
      if (e.type === 'win') s += 1000;
      if (e.type === 'unlock') s += 35;
    }
    if (to >= HOME_COL_START && from <= LAST_TRACK) s += 30; // reaching safety of home column
    s += (to - Math.max(from, 0)) * 0.6;
    if (level === 'hard') {
      if (to <= LAST_TRACK) {
        const absTo = absCell(player.color, to);
        s -= dangerAt(next, player.color, absTo) * (18 + to * 0.6);
        if (isSafe(absTo)) s += 12;
      }
      if (from >= 0 && from <= LAST_TRACK) {
        const absFrom = absCell(player.color, from);
        s += dangerAt(state, player.color, absFrom) * (14 + from * 0.5);
      }
    } else {
      s += rand() * 10;
    }
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}
