/**
 * NEON TAKKAR — Chess rules engine + AI (pure, framework-free).
 * Full FIDE move rules: legal move validation, check, checkmate, stalemate,
 * castling, en passant, promotion, 50-move rule, threefold repetition and
 * insufficient material. Shared by the client and Cloud Functions.
 *
 * Squares: 0..63, index = row*8 + col, row 0 = rank 8, col 0 = file a.
 * Pieces: 'PNBRQK' (white) / 'pnbrqk' (black), null = empty.
 */

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export const colorOf = (p) => (p ? (p < 'a' ? 'w' : 'b') : null);
const opp = (c) => (c === 'w' ? 'b' : 'w');
const typeOf = (p) => p.toLowerCase();
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const sqName = (sq) => FILES[sq % 8] + (8 - Math.floor(sq / 8));
export const sqFromName = (n) => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);

/* ------------------------------ FEN ------------------------------ */

export function fromFEN(fen = START_FEN) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error('Bad FEN');
  rows.forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) c += Number(ch);
      else { board[r * 8 + c] = ch; c += 1; }
    }
  });
  return {
    board,
    turn: turn || 'w',
    castling: castling && castling !== '-' ? castling : '',
    ep: ep && ep !== '-' ? sqFromName(ep) : null,
    halfmove: Number(half || 0),
    fullmove: Number(full || 1),
  };
}

export function toFEN(pos, withClocks = true) {
  let s = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = pos.board[r * 8 + c];
      if (!p) empty++;
      else { if (empty) { s += empty; empty = 0; } s += p; }
    }
    if (empty) s += empty;
    if (r < 7) s += '/';
  }
  s += ` ${pos.turn} ${pos.castling || '-'} ${pos.ep != null ? sqName(pos.ep) : '-'}`;
  if (withClocks) s += ` ${pos.halfmove} ${pos.fullmove}`;
  return s;
}

/* --------------------------- Attacks ----------------------------- */

export function isAttacked(board, sq, by) {
  const r = Math.floor(sq / 8), c = sq % 8;
  // pawns
  const pr = by === 'w' ? r + 1 : r - 1;
  const pawn = by === 'w' ? 'P' : 'p';
  for (const dc of [-1, 1]) {
    if (onBoard(pr, c + dc) && board[pr * 8 + c + dc] === pawn) return true;
  }
  const knight = by === 'w' ? 'N' : 'n';
  for (const [dr, dc] of KNIGHT) {
    if (onBoard(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === knight) return true;
  }
  const king = by === 'w' ? 'K' : 'k';
  for (const [dr, dc] of KING) {
    if (onBoard(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === king) return true;
  }
  const bish = by === 'w' ? 'B' : 'b', rook = by === 'w' ? 'R' : 'r', queen = by === 'w' ? 'Q' : 'q';
  for (const [dr, dc] of DIAG) {
    let rr = r + dr, cc = c + dc;
    while (onBoard(rr, cc)) {
      const p = board[rr * 8 + cc];
      if (p) { if (p === bish || p === queen) return true; break; }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of ORTHO) {
    let rr = r + dr, cc = c + dc;
    while (onBoard(rr, cc)) {
      const p = board[rr * 8 + cc];
      if (p) { if (p === rook || p === queen) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

export function kingSquare(board, color) {
  const k = color === 'w' ? 'K' : 'k';
  return board.indexOf(k);
}

export function inCheck(pos, color = pos.turn) {
  const k = kingSquare(pos.board, color);
  return k >= 0 && isAttacked(pos.board, k, opp(color));
}

/* ------------------------ Move generation ------------------------ */

function pseudoMoves(pos, capturesOnly = false) {
  const { board, turn } = pos;
  const moves = [];
  const add = (from, to, extra = {}) => {
    moves.push({ from, to, piece: board[from], captured: board[to] || null, ...extra });
  };
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOf(p) !== turn) continue;
    const r = Math.floor(sq / 8), c = sq % 8;
    const t = typeOf(p);
    if (t === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const startRow = turn === 'w' ? 6 : 1;
      const promoRow = turn === 'w' ? 0 : 7;
      const r1 = r + dir;
      const pushPawn = (to, extra = {}) => {
        if (Math.floor(to / 8) === promoRow) {
          for (const pr of ['q', 'r', 'b', 'n']) add(sq, to, { ...extra, promotion: pr });
        } else add(sq, to, extra);
      };
      if (onBoard(r1, c) && !board[r1 * 8 + c] && (!capturesOnly || r1 === promoRow)) {
        pushPawn(r1 * 8 + c);
        const r2 = r + 2 * dir;
        if (!capturesOnly && r === startRow && !board[r2 * 8 + c]) add(sq, r2 * 8 + c, { flag: 'double' });
      }
      for (const dc of [-1, 1]) {
        if (!onBoard(r1, c + dc)) continue;
        const to = r1 * 8 + c + dc;
        if (board[to] && colorOf(board[to]) !== turn) pushPawn(to);
        else if (pos.ep === to) {
          add(sq, to, { flag: 'ep', captured: turn === 'w' ? 'p' : 'P' });
        }
      }
      continue;
    }
    const steps = t === 'n' ? KNIGHT : t === 'k' ? KING : null;
    if (steps) {
      for (const [dr, dc] of steps) {
        const rr = r + dr, cc = c + dc;
        if (!onBoard(rr, cc)) continue;
        const to = rr * 8 + cc;
        if (!board[to]) { if (!capturesOnly) add(sq, to); } else if (colorOf(board[to]) !== turn) add(sq, to);
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTHO : [...DIAG, ...ORTHO];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
          const to = rr * 8 + cc;
          if (!board[to]) { if (!capturesOnly) add(sq, to); } else {
            if (colorOf(board[to]) !== turn) add(sq, to);
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }
    if (t === 'k' && !capturesOnly) {
      const enemy = opp(turn);
      const home = turn === 'w' ? 60 : 4;
      const rook = turn === 'w' ? 'R' : 'r';
      if (sq === home && !isAttacked(board, home, enemy)) {
        const kRight = turn === 'w' ? 'K' : 'k';
        const qRight = turn === 'w' ? 'Q' : 'q';
        if (pos.castling.includes(kRight) && !board[home + 1] && !board[home + 2] && board[home + 3] === rook
          && !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy)) {
          add(sq, home + 2, { flag: 'castleK' });
        }
        if (pos.castling.includes(qRight) && !board[home - 1] && !board[home - 2] && !board[home - 3]
          && board[home - 4] === rook && !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy)) {
          add(sq, home - 2, { flag: 'castleQ' });
        }
      }
    }
  }
  return moves;
}

const CASTLE_SQ_RIGHTS = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

/** Mutating make; returns undo info. */
function applyMove(pos, m) {
  const undo = {
    castling: pos.castling, ep: pos.ep, halfmove: pos.halfmove, fullmove: pos.fullmove,
    captured: null, capturedSq: m.to,
  };
  const { board } = pos;
  const piece = board[m.from];
  const color = colorOf(piece);
  undo.captured = board[m.to];
  if (m.flag === 'ep') {
    undo.capturedSq = m.to + (color === 'w' ? 8 : -8);
    undo.captured = board[undo.capturedSq];
    board[undo.capturedSq] = null;
  }
  board[m.to] = m.promotion ? (color === 'w' ? m.promotion.toUpperCase() : m.promotion.toLowerCase()) : piece;
  board[m.from] = null;
  if (m.flag === 'castleK') { board[m.from + 1] = board[m.from + 3]; board[m.from + 3] = null; }
  if (m.flag === 'castleQ') { board[m.from - 1] = board[m.from - 4]; board[m.from - 4] = null; }

  let rights = pos.castling;
  if (typeOf(piece) === 'k') rights = rights.replace(color === 'w' ? /[KQ]/g : /[kq]/g, '');
  for (const sq of [m.from, m.to]) if (CASTLE_SQ_RIGHTS[sq]) rights = rights.replace(CASTLE_SQ_RIGHTS[sq], '');
  pos.castling = rights;
  pos.ep = m.flag === 'double' ? (m.from + m.to) / 2 : null;
  pos.halfmove = typeOf(piece) === 'p' || undo.captured ? 0 : pos.halfmove + 1;
  if (color === 'b') pos.fullmove += 1;
  pos.turn = opp(color);
  return undo;
}

function undoMove(pos, m, undo) {
  const { board } = pos;
  const color = opp(pos.turn);
  board[m.from] = m.piece;
  board[m.to] = null;
  if (undo.captured) board[undo.capturedSq] = undo.captured;
  if (m.flag === 'castleK') { board[m.from + 3] = board[m.from + 1]; board[m.from + 1] = null; }
  if (m.flag === 'castleQ') { board[m.from - 4] = board[m.from - 1]; board[m.from - 1] = null; }
  pos.castling = undo.castling;
  pos.ep = undo.ep;
  pos.halfmove = undo.halfmove;
  pos.fullmove = undo.fullmove;
  pos.turn = color;
}

/** Legal moves for the side to move. */
export function legalMoves(pos, capturesOnly = false) {
  const res = [];
  const me = pos.turn;
  for (const m of pseudoMoves(pos, capturesOnly)) {
    const u = applyMove(pos, m);
    if (!inCheck(pos, me)) res.push(m);
    undoMove(pos, m, u);
  }
  return res;
}

/* ------------------------------ SAN ------------------------------ */

function sanFor(pos, m, legal) {
  let san;
  if (m.flag === 'castleK') san = 'O-O';
  else if (m.flag === 'castleQ') san = 'O-O-O';
  else {
    const t = typeOf(m.piece);
    const isCap = !!m.captured;
    if (t === 'p') {
      san = (isCap ? FILES[m.from % 8] + 'x' : '') + sqName(m.to);
      if (m.promotion) san += '=' + m.promotion.toUpperCase();
    } else {
      san = t.toUpperCase();
      const others = legal.filter((o) => o.to === m.to && o.piece === m.piece && o.from !== m.from);
      if (others.length) {
        const sameFile = others.some((o) => o.from % 8 === m.from % 8);
        const sameRank = others.some((o) => Math.floor(o.from / 8) === Math.floor(m.from / 8));
        if (!sameFile) san += FILES[m.from % 8];
        else if (!sameRank) san += 8 - Math.floor(m.from / 8);
        else san += sqName(m.from);
      }
      san += (isCap ? 'x' : '') + sqName(m.to);
    }
  }
  const u = applyMove(pos, m);
  if (inCheck(pos)) san += legalMoves(pos).length ? '+' : '#';
  undoMove(pos, m, u);
  return san;
}

/* --------------------------- Game API ---------------------------- */

/** Create a game state (JSON-serialisable apart from `board` nulls). */
export function createGame(fen = START_FEN) {
  const pos = fromFEN(fen);
  return { game: 'chess', ...pos, history: [], startFen: fen };
}

export function clonePos(state) {
  return { ...state, board: state.board.slice(), history: state.history.slice() };
}

/** Find a legal move matching {from,to,promotion}. */
export function findMove(state, { from, to, promotion }) {
  const f = typeof from === 'string' ? sqFromName(from) : from;
  const t = typeof to === 'string' ? sqFromName(to) : to;
  const cands = legalMoves(clonePos(state)).filter((m) => m.from === f && m.to === t);
  if (!cands.length) return null;
  if (cands.length === 1 && !cands[0].promotion) return cands[0];
  const pr = (promotion || 'q').toLowerCase();
  return cands.find((m) => m.promotion === pr) || null;
}

/**
 * Validate & play a move. Throws on illegal moves.
 * @returns {{state, move, events}}
 */
export function makeMove(prev, req) {
  const state = clonePos(prev);
  const m = findMove(state, req);
  if (!m) throw new Error('Illegal move');
  const legal = legalMoves(state);
  const san = sanFor(state, m, legal);
  const fenBefore = toFEN(state);
  applyMove(state, m);
  const record = {
    from: m.from, to: m.to, piece: m.piece, captured: m.captured || null,
    promotion: m.promotion || null, flag: m.flag || null, san, fenBefore,
  };
  state.history.push(record);
  const st = status(state);
  const events = [{ type: 'move', ...record }];
  if (m.captured) events.push({ type: 'capture', by: colorOf(m.piece), piece: m.captured });
  if (m.promotion) events.push({ type: 'promotion', piece: m.promotion });
  if (m.flag === 'castleK' || m.flag === 'castleQ') events.push({ type: 'castle', side: m.flag });
  if (st.checkmate) events.push({ type: 'checkmate', winner: st.winner });
  else if (st.check) events.push({ type: 'check', color: state.turn });
  else if (st.draw) events.push({ type: 'draw', reason: st.reason });
  return { state, move: record, events };
}

/** Undo the last move (offline only). */
export function undo(prev) {
  if (!prev.history.length) return prev;
  const last = prev.history[prev.history.length - 1];
  const pos = fromFEN(last.fenBefore);
  return { ...prev, ...pos, history: prev.history.slice(0, -1) };
}

function insufficientMaterial(board) {
  const pieces = board.filter((p) => p && typeOf(p) !== 'k');
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && ['b', 'n'].includes(typeOf(pieces[0]))) return true;
  if (pieces.every((p) => typeOf(p) === 'b')) {
    // all bishops on same colour squares
    const colors = new Set();
    board.forEach((p, sq) => { if (p && typeOf(p) === 'b') colors.add((Math.floor(sq / 8) + (sq % 8)) % 2); });
    return colors.size === 1;
  }
  return false;
}

function repetitionCount(state) {
  const key = toFEN(state, false);
  let n = 1;
  for (const h of state.history) if (h.fenBefore.split(' ').slice(0, 4).join(' ') === key) n++;
  return n;
}

/** Game status for the side to move. */
export function status(state) {
  const pos = clonePos(state);
  const check = inCheck(pos);
  const hasMoves = legalMoves(pos).length > 0;
  if (!hasMoves && check) return { over: true, check, checkmate: true, winner: opp(state.turn), reason: 'checkmate' };
  if (!hasMoves) return { over: true, check: false, stalemate: true, draw: true, winner: null, reason: 'stalemate' };
  if (state.halfmove >= 100) return { over: true, check, draw: true, winner: null, reason: '50-move rule' };
  if (insufficientMaterial(state.board)) return { over: true, check, draw: true, winner: null, reason: 'insufficient material' };
  if (repetitionCount(state) >= 3) return { over: true, check, draw: true, winner: null, reason: 'threefold repetition' };
  return { over: false, check, winner: null };
}

/** Serialise for network/storage (RTDB drops nulls in arrays). */
export function serialize(state) {
  return { fen: toFEN(state), startFen: state.startFen, history: state.history.map((h) => ({ ...h })) };
}
export function deserialize(data) {
  const pos = fromFEN(data.fen);
  return { game: 'chess', ...pos, startFen: data.startFen || START_FEN, history: data.history || [] };
}

/** Perft — counts leaf nodes; used by tests to verify move generation. */
export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    const u = applyMove(pos, m);
    n += perft(pos, depth - 1);
    undoMove(pos, m, u);
  }
  return n;
}

/* ------------------------------ AI ------------------------------- */

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables (white's perspective, row 0 = rank 8). Classic "simplified evaluation" values.
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function evaluate(pos) {
  let s = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    const t = typeOf(p);
    if (colorOf(p) === 'w') s += VAL[t] + PST[t][sq];
    else s -= VAL[t] + PST[t][(7 - Math.floor(sq / 8)) * 8 + (sq % 8)];
  }
  return pos.turn === 'w' ? s : -s;
}

const MATE = 100000;

function orderMoves(moves) {
  return moves.sort((a, b) => scoreMove(b) - scoreMove(a));
}
function scoreMove(m) {
  let s = 0;
  if (m.captured) s += 10 * VAL[typeOf(m.captured)] - VAL[typeOf(m.piece)] + 1000;
  if (m.promotion) s += VAL[m.promotion] + 800;
  return s;
}

function quiesce(pos, alpha, beta, depth, ctx) {
  ctx.nodes++;
  const stand = evaluate(pos);
  if (depth === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  for (const m of orderMoves(legalMoves(pos, true))) {
    const u = applyMove(pos, m);
    const sc = -quiesce(pos, -beta, -alpha, depth - 1, ctx);
    undoMove(pos, m, u);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(pos, depth, alpha, beta, ply, ctx) {
  ctx.nodes++;
  const moves = legalMoves(pos);
  if (!moves.length) return inCheck(pos) ? -MATE + ply : 0;
  if (depth === 0) return ctx.qDepth ? quiesce(pos, alpha, beta, ctx.qDepth, ctx) : evaluate(pos);
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    const u = applyMove(pos, m);
    const sc = -negamax(pos, depth - 1, -beta, -alpha, ply + 1, ctx);
    undoMove(pos, m, u);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

export const AI_LEVELS = {
  easy: { depth: 1, qDepth: 0, noise: 120, blunder: 0.25 },
  medium: { depth: 2, qDepth: 2, noise: 25, blunder: 0 },
  hard: { depth: 3, qDepth: 4, noise: 0, blunder: 0 },
};

/** Pick a move for the side to move. Returns {from,to,promotion} or null. */
export function chooseMove(state, level = 'medium', rand = Math.random) {
  const cfg = AI_LEVELS[level] || AI_LEVELS.medium;
  const pos = clonePos(state);
  const moves = orderMoves(legalMoves(pos));
  if (!moves.length) return null;
  if (cfg.blunder && rand() < cfg.blunder) {
    const m = moves[Math.floor(rand() * moves.length)];
    return { from: m.from, to: m.to, promotion: m.promotion };
  }
  const ctx = { nodes: 0, qDepth: cfg.qDepth };
  let best = moves[0], bestScore = -Infinity;
  let alpha = -Infinity;
  for (const m of moves) {
    const u = applyMove(pos, m);
    // With noise we need exact (full-window) scores, otherwise fail-hard bounds tie with real scores.
    let sc = -negamax(pos, cfg.depth - 1, -Infinity, cfg.noise ? Infinity : -alpha, 1, ctx);
    undoMove(pos, m, u);
    if (cfg.noise && Math.abs(sc) < MATE / 2) sc += (rand() - 0.5) * cfg.noise;
    if (sc > bestScore) { bestScore = sc; best = m; }
    if (sc > alpha) alpha = sc;
  }
  return { from: best.from, to: best.to, promotion: best.promotion };
}
