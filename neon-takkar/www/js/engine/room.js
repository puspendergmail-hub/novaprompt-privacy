/**
 * NEON TAKKAR — authoritative online room protocol (pure).
 *
 * Clients never write game state. They push *intents* (roll / move / resign /
 * start / timeout). The Cloud Function `onIntent` loads the room, calls
 * `processIntent`, and writes the result back with admin privileges. The same
 * function runs in unit tests, so the server rules are tested without Firebase.
 */
import * as Ludo from './ludo.js';
import * as Chess from './chess.js';

export const LUDO_TURN_MS = 30_000;
export const MAX_MISSED_TURNS = 3;
export const MIN_CHESS_MINUTES = 1;
export const MAX_CHESS_MINUTES = 30;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
export function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}

export function sanitizeSettings(game, s = {}) {
  const out = {
    boardTheme: typeof s.boardTheme === 'string' ? s.boardTheme.slice(0, 32) : 'neon',
    soundPack: typeof s.soundPack === 'string' ? s.soundPack.slice(0, 32) : 'desi',
  };
  if (game === 'ludo') {
    out.maxPlayers = s.maxPlayers === 4 ? 4 : 2;
  } else {
    out.maxPlayers = 2;
    const m = Number(s.chessMinutes) || 10;
    out.chessMinutes = Math.min(MAX_CHESS_MINUTES, Math.max(MIN_CHESS_MINUTES, Math.round(m)));
  }
  return out;
}

function seatedPlayers(room) {
  return Object.entries(room.players || {})
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
}

function uidForColor(room, color) {
  const p = seatedPlayers(room).find((x) => x.color === color);
  return p ? p.uid : null;
}

/** Decode the stored game state for the room's game. */
export function loadState(room) {
  if (!room.state) return null;
  return room.game === 'chess' ? Chess.deserialize(room.state) : room.state;
}

class IntentError extends Error {}

/**
 * Validate & apply one intent.
 * @param {object} room   current room snapshot
 * @param {object} intent {uid, type, ...}
 * @param {{now:number, rand:()=>number}} env
 * @returns {object} patch: fields to merge into the room + `events`
 */
export function processIntent(room, intent, { now = Date.now(), rand = Math.random } = {}) {
  const fail = (msg) => { throw new IntentError(msg); };
  if (!intent || typeof intent.uid !== 'string') fail('Bad intent');
  const me = room.players?.[intent.uid];
  if (!me) fail('Not in this room');

  if (intent.type === 'start') {
    if (room.status !== 'lobby') fail('Already started');
    if (intent.uid !== room.hostUid) fail('Only the host can start');
    const players = seatedPlayers(room);
    const need = room.settings.maxPlayers;
    if (players.length !== need) fail(`Need exactly ${need} players`);
    if (!players.every((p) => p.ready || p.uid === room.hostUid)) fail('Everyone must be ready');
    const playersPatch = {};
    if (room.game === 'ludo') {
      const colors = need === 2 ? ['red', 'yellow'] : Ludo.COLORS;
      const state = Ludo.createGame({
        players: players.map((p, i) => ({ id: p.uid, name: p.name, color: colors[i], type: 'remote' })),
      });
      players.forEach((p, i) => { playersPatch[p.uid] = { ...room.players[p.uid], color: colors[i] }; });
      return {
        status: 'playing', state, players: playersPatch, startedAt: now,
        turnDeadline: now + LUDO_TURN_MS, events: [{ type: 'start' }],
      };
    }
    const state = Chess.serialize(Chess.createGame());
    const ms = room.settings.chessMinutes * 60_000;
    players.forEach((p, i) => { playersPatch[p.uid] = { ...room.players[p.uid], color: i === 0 ? 'w' : 'b' }; });
    return {
      status: 'playing', state, players: playersPatch, startedAt: now,
      clocks: { w: ms, b: ms, lastTs: now }, events: [{ type: 'start' }],
    };
  }

  if (room.status !== 'playing') fail('Match not running');

  if (room.game === 'ludo') {
    let state = room.state;
    const cur = Ludo.currentPlayer(state);
    let res;
    let skips = room.skips?.[intent.uid] ? { ...room.skips, [intent.uid]: 0 } : (room.skips || {});
    switch (intent.type) {
      case 'roll':
        if (cur.id !== intent.uid) fail('Not your turn');
        res = Ludo.roll(state, 1 + Math.floor(rand() * 6));
        break;
      case 'move':
        if (cur.id !== intent.uid) fail('Not your turn');
        try { res = Ludo.move(state, intent.token); } catch (e) { fail(e.message); }
        break;
      case 'timeout': {
        if (now < room.turnDeadline) fail('Turn not expired');
        // 3 missed turns in a row (e.g. disconnected) = forfeit
        const missed = (room.skips?.[cur.id] || 0) + 1;
        skips = { ...(room.skips || {}), [cur.id]: missed };
        res = missed >= MAX_MISSED_TURNS ? Ludo.forfeit(state, cur.color) : Ludo.skipTurn(state);
        break;
      }
      case 'resign':
        if (!me.color) fail('No colour');
        res = Ludo.forfeit(state, me.color);
        break;
      default: fail('Unknown intent');
    }
    state = res.state;
    const patch = { state, events: res.events, turnDeadline: now + LUDO_TURN_MS, skips };
    if (state.phase === 'over') {
      patch.status = 'over';
      patch.result = {
        winnerUid: uidForColor(room, state.winner),
        ranking: Ludo.ranking(state).map((c) => uidForColor(room, c)).filter(Boolean),
        reason: res.events.some((e) => e.type === 'forfeit') ? 'forfeit' : 'finished',
        endedAt: now,
      };
    }
    return patch;
  }

  // ----- chess -----
  const state = Chess.deserialize(room.state);
  const clocks = { ...room.clocks };
  const elapsed = Math.max(0, now - clocks.lastTs);
  const loserUidOnTime = () => uidForColor(room, state.turn);
  const winnerOf = (c) => uidForColor(room, c);
  const over = (winnerColor, reason, extra = {}) => ({
    ...extra,
    status: 'over',
    clocks,
    result: { winnerUid: winnerColor ? winnerOf(winnerColor) : null, draw: !winnerColor, reason, endedAt: now },
  });

  if (intent.type === 'timeout') {
    if (clocks[state.turn] - elapsed > 0) fail('Clock not expired');
    clocks[state.turn] = 0;
    const loser = loserUidOnTime();
    return over(state.turn === 'w' ? 'b' : 'w', 'timeout', { events: [{ type: 'flag', loserUid: loser }] });
  }
  if (intent.type === 'resign') {
    return over(me.color === 'w' ? 'b' : 'w', 'resign', { events: [{ type: 'resign', color: me.color }] });
  }
  if (intent.type !== 'move') fail('Unknown intent');
  if (me.color !== state.turn) fail('Not your turn');
  clocks[state.turn] -= elapsed;
  if (clocks[state.turn] <= 0) {
    clocks[state.turn] = 0;
    return over(state.turn === 'w' ? 'b' : 'w', 'timeout', { events: [{ type: 'flag' }] });
  }
  clocks.lastTs = now;
  let res;
  try {
    res = Chess.makeMove(state, { from: intent.from, to: intent.to, promotion: intent.promotion });
  } catch (e) { fail(e.message); }
  const patch = { state: Chess.serialize(res.state), events: res.events, clocks };
  const st = Chess.status(res.state);
  if (st.over) return { ...patch, ...over(st.winner, st.reason, { state: patch.state, events: res.events }) };
  return patch;
}

/** Reward rules (server side) — deliberately modest & not pay-to-win. */
export function rewardsFor(result, uid, game) {
  if (!result) return { coins: 0, xp: 0 };
  if (result.draw) return { coins: 40, xp: 30 };
  if (result.winnerUid === uid) return { coins: game === 'chess' ? 150 : 120, xp: 80 };
  return { coins: 20, xp: 25 };
}

export { IntentError };
