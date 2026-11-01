import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../www/js/engine/chess.js';

const perft = (fen, d) => C.perft(C.fromFEN(fen), d);

test('perft: start position', () => {
  assert.equal(perft(C.START_FEN, 1), 20);
  assert.equal(perft(C.START_FEN, 2), 400);
  assert.equal(perft(C.START_FEN, 3), 8902);
});

test('perft: kiwipete (castling, ep, promotion)', () => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  assert.equal(perft(fen, 1), 48);
  assert.equal(perft(fen, 2), 2039);
  assert.equal(perft(fen, 3), 97862);
});

test('perft: position 3 (ep pins)', () => {
  assert.equal(perft('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4), 43238);
});

test('perft: position 4 (promotions)', () => {
  assert.equal(perft('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3), 9467);
});

function play(g, ...sans) {
  for (const s of sans) {
    const [from, to, promotion] = [s.slice(0, 2), s.slice(2, 4), s[4]];
    g = C.makeMove(g, { from, to, promotion }).state;
  }
  return g;
}

test("fool's mate is checkmate", () => {
  const g = play(C.createGame(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  const st = C.status(g);
  assert.equal(st.checkmate, true);
  assert.equal(st.winner, 'b');
  assert.equal(g.history.at(-1).san, 'Qh4#');
});

test('illegal moves are rejected', () => {
  const g = C.createGame();
  assert.throws(() => C.makeMove(g, { from: 'e2', to: 'e5' }));
  assert.throws(() => C.makeMove(g, { from: 'e7', to: 'e5' })); // not black's turn
  assert.throws(() => C.makeMove(g, { from: 'e1', to: 'e2' }));
});

test('castling kingside moves rook and updates rights', () => {
  const g = play(C.createGame(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1');
  assert.equal(g.board[C.sqFromName('g1')], 'K');
  assert.equal(g.board[C.sqFromName('f1')], 'R');
  assert.equal(g.castling.includes('K'), false);
  assert.equal(g.history.at(-1).san, 'O-O');
});

test('cannot castle through check', () => {
  const g = C.createGame('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
  assert.equal(C.findMove(g, { from: 'e1', to: 'g1' }), null);
});

test('en passant capture', () => {
  const g = play(C.createGame(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  assert.equal(g.board[C.sqFromName('d5')], null);
  assert.equal(g.board[C.sqFromName('d6')], 'P');
  assert.equal(g.history.at(-1).san, 'exd6');
});

test('pawn promotion with choice', () => {
  const g = C.createGame('8/P7/8/8/8/8/8/k6K w - - 0 1');
  const q = C.makeMove(g, { from: 'a7', to: 'a8' }).state;
  assert.equal(q.board[0], 'Q');
  const n = C.makeMove(g, { from: 'a7', to: 'a8', promotion: 'n' }).state;
  assert.equal(n.board[0], 'N');
});

test('stalemate detected', () => {
  const g = C.createGame('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
  const st = C.status(g);
  assert.equal(st.stalemate, true);
  assert.equal(st.draw, true);
});

test('insufficient material and threefold repetition', () => {
  assert.equal(C.status(C.createGame('k7/8/8/8/8/8/8/6NK w - - 0 1')).reason, 'insufficient material');
  const g = play(C.createGame(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(C.status(g).reason, 'threefold repetition');
});

test('undo restores position', () => {
  const g0 = C.createGame();
  const g1 = play(g0, 'e2e4', 'e7e5');
  const g2 = C.undo(C.undo(g1));
  assert.equal(C.toFEN(g2), C.START_FEN);
  assert.equal(g2.history.length, 0);
});

test('serialize roundtrip', () => {
  const g = play(C.createGame(), 'e2e4', 'c7c5');
  const g2 = C.deserialize(JSON.parse(JSON.stringify(C.serialize(g))));
  assert.equal(C.toFEN(g2), C.toFEN(g));
  assert.equal(g2.history.length, 2);
});

test('AI finds mate in one (hard & medium) and plays legal moves (easy)', () => {
  const g = C.createGame('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  for (const lvl of ['medium', 'hard']) {
    const m = C.chooseMove(g, lvl);
    const s = C.makeMove(g, m).state;
    assert.equal(C.status(s).checkmate, true, lvl);
  }
  const e = C.chooseMove(C.createGame(), 'easy');
  assert.ok(C.findMove(C.createGame(), e));
});

test('AI takes a hanging queen', () => {
  const g = C.createGame('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
  const m = C.chooseMove(g, 'hard');
  assert.equal(C.sqName(m.to), 'd5');
});
