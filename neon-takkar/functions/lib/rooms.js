/** Pure lobby operations for private rooms (validated server-side, unit-tested). */
import { sanitizeSettings } from '../shared/room.js';

export const ROOM_TTL_MS = 6 * 3600_000;

export function newRoom({ code, game, hostUid, host, settings, now = Date.now() }) {
  if (!['ludo', 'chess'].includes(game)) throw new Error('Unknown game');
  return {
    code, game, hostUid, status: 'lobby', createdAt: now,
    settings: sanitizeSettings(game, settings),
    players: { [hostUid]: { ...host, seat: 0, ready: false, joinedAt: now } },
  };
}

export function join(room, uid, player, { blockedByHost = false, now = Date.now() } = {}) {
  if (!room) throw new Error('Room not found');
  if (room.players?.[uid]) return room; // rejoin (reconnect)
  if (room.status !== 'lobby') throw new Error('Match already started');
  if (blockedByHost) throw new Error('You cannot join this room');
  const seats = Object.values(room.players || {}).map((p) => p.seat);
  if (seats.length >= room.settings.maxPlayers) throw new Error('Room is full');
  let seat = 0;
  while (seats.includes(seat)) seat++;
  return { ...room, players: { ...room.players, [uid]: { ...player, seat, ready: false, joinedAt: now } } };
}

/** Returns the updated room, or null when the room should be deleted. */
export function leave(room, uid) {
  if (!room?.players?.[uid]) return room;
  const players = { ...room.players };
  delete players[uid];
  if (!Object.keys(players).length) return null;
  let hostUid = room.hostUid;
  if (hostUid === uid) {
    hostUid = Object.entries(players).sort((a, b) => a[1].seat - b[1].seat)[0][0];
    players[hostUid] = { ...players[hostUid], ready: false };
  }
  return { ...room, players, hostUid };
}

export function setReady(room, uid, ready) {
  if (!room?.players?.[uid]) throw new Error('Not in room');
  if (room.status !== 'lobby') throw new Error('Match already started');
  return { ...room, players: { ...room.players, [uid]: { ...room.players[uid], ready: !!ready } } };
}

export function updateSettings(room, uid, settings) {
  if (room?.hostUid !== uid) throw new Error('Only the host can change settings');
  if (room.status !== 'lobby') throw new Error('Match already started');
  const s = sanitizeSettings(room.game, settings);
  if (Object.keys(room.players).length > s.maxPlayers) throw new Error('Too many players for that mode');
  // Changing the format resets readiness
  const players = Object.fromEntries(Object.entries(room.players).map(([k, p]) => [k, { ...p, ready: s.maxPlayers === room.settings.maxPlayers ? p.ready : false }]));
  return { ...room, settings: s, players };
}

export function kick(room, hostUid, target) {
  if (room?.hostUid !== hostUid) throw new Error('Only the host can remove players');
  if (target === hostUid) throw new Error('Cannot remove yourself');
  if (room.status !== 'lobby') throw new Error('Match already started');
  return leave(room, target);
}
