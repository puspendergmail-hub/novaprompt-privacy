import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../www/js/engine/ludo.js';

const two = () => L.createGame({ players: [{ name: 'A' }, { name: 'B' }] });

test('board geometry: 52 unique track cells, starts & home entries line up', () => {
  assert.equal(L.TRACK_COORDS.length, 52);
  assert.equal(new Set(L.TRACK_COORDS.map(String)).size, 52);
  // each step on the track is to an orthogonally adjacent cell (or diagonal at arm corners)
  for (let i = 0; i < 52; i++) {
    const [r1, c1] = L.TRACK_COORDS[i], [r2, c2] = L.TRACK_COORDS[(i + 1) % 52];
    assert.ok(Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1, `step ${i}`);
  }
  for (const c of L.COLORS) {
    const [r, col] = L.tokenCoord(c, L.LAST_TRACK);
    const [hr, hc] = L.HOME_COORDS[c][0];
    assert.equal(Math.abs(r - hr) + Math.abs(col - hc), 1, `${c} home entry adjacent`);
  }
});

test('2-player game uses opposite colours', () => {
  const g = two();
  assert.deepEqual(g.players.map((p) => p.color), ['red', 'yellow']);
});

test('need a six to unlock; non-six with all tokens in base passes turn', () => {
  let g = two();
  let r = L.roll(g, 3);
  assert.equal(r.state.turn, 1);
  assert.ok(r.events.some((e) => e.type === 'no-move'));
  r = L.roll(r.state, 6);
  assert.equal(r.state.phase, 'move');
  assert.deepEqual(L.legalMoves(r.state), [0, 1, 2, 3]);
  r = L.move(r.state, 0);
  assert.equal(r.state.players[1].tokens[0], 0);
  assert.equal(r.state.turn, 1, 'six gives extra turn');
  assert.equal(r.state.phase, 'roll');
});

test('three sixes in a row forfeits the turn', () => {
  let g = two();
  g = L.move(L.roll(g, 6).state, 0).state;
  g = L.move(L.roll(g, 6).state, 0).state;
  const r = L.roll(g, 6);
  assert.ok(r.events.some((e) => e.type === 'three-sixes'));
  assert.equal(r.state.turn, 1);
});

test('capture sends opponent home and grants extra turn', () => {
  let g = two();
  // red token at progress 10 (abs 10), yellow token at abs 14 => yellow progress (14-26+52)%52 = 40
  g.players[0].tokens = [10, -1, -1, -1];
  g.players[1].tokens = [40, -1, -1, -1];
  const r1 = L.roll(g, 4);
  const r2 = L.move(r1.state, 0);
  assert.equal(r2.state.players[1].tokens[0], -1);
  assert.ok(r2.events.some((e) => e.type === 'capture' && e.victim === 'yellow'));
  assert.equal(r2.state.turn, 0);
});

test('no capture on safe cells', () => {
  let g = two();
  // abs 8 is a star. red progress 5 -> 8 ; yellow on abs 8 => progress (8-26+52)%52 = 34
  g.players[0].tokens = [5, -1, -1, -1];
  g.players[1].tokens = [34, -1, -1, -1];
  const r = L.move(L.roll(g, 3).state, 0);
  assert.equal(r.state.players[1].tokens[0], 34);
  assert.equal(r.state.turn, 1);
});

test('home column is never captured & exact roll needed to finish', () => {
  let g = two();
  g.players[0].tokens = [53, 56, 56, 56];
  let r = L.roll(g, 5); // 53+5 = 58 > 56 -> no move
  assert.ok(r.events.some((e) => e.type === 'no-move'));
  assert.equal(r.state.turn, 1);
  g.players[0].tokens = [53, 56, 56, 56];
  g.turn = 0;
  r = L.move(L.roll(g, 3).state, 0);
  assert.equal(r.state.winner, 'red');
  assert.equal(r.state.phase, 'over');
});

test('reaching home grants extra turn; near-win fires once', () => {
  let g = two();
  g.players[0].tokens = [50, 52, 56, 30];
  let r = L.move(L.roll(g, 6).state, 0); // 50 -> 56 home
  assert.ok(r.events.some((e) => e.type === 'home'));
  assert.equal(r.state.turn, 0);
  r = L.move(L.roll(r.state, 5).state, 3); // 30 -> 35
  r.state.turn = 0; r.state.phase = 'roll';
  r.state.players[0].tokens = [56, 52, 56, 48];
  r = L.move(L.roll(r.state, 4).state, 3); // 48 -> 52 => all in home column or finished
  assert.ok(r.events.some((e) => e.type === 'near-win'));
});

test('illegal moves rejected', () => {
  const g = two();
  assert.throws(() => L.move(g, 0));
  const r = L.roll(g, 6);
  assert.throws(() => L.roll(r.state, 2));
  assert.throws(() => L.roll(g, 7));
});

test('forfeit leaves last player as winner', () => {
  const g = two();
  const r = L.forfeit(g, 'red');
  assert.equal(r.state.winner, 'yellow');
});

test('AI always picks a legal move and full AI games terminate', () => {
  for (const lvl of ['easy', 'medium', 'hard']) {
    let g = L.createGame({ players: [{}, {}, {}, {}] });
    let steps = 0;
    while (g.phase !== 'over' && steps < 20000) {
      g = L.roll(g, 1 + Math.floor(Math.random() * 6)).state;
      if (g.phase === 'move') {
        const t = L.chooseMove(g, lvl);
        assert.ok(L.legalMoves(g).includes(t));
        g = L.move(g, t).state;
      }
      steps++;
    }
    assert.equal(g.phase, 'over', lvl);
    assert.ok(L.COLORS.includes(g.winner));
  }
});

test('hard AI prefers capture', () => {
  let g = two();
  g.players[0].tokens = [10, 20, -1, -1];
  g.players[1].tokens = [40, -1, -1, -1]; // yellow on abs 14
  g = L.roll(g, 4).state;
  assert.equal(L.chooseMove(g, 'hard'), 0);
});
