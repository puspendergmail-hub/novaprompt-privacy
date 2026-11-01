/** Private game room lobby: code, share, slots, settings, ready/start, chat. */
import { store } from '../core/store.js';
import { go, back } from '../core/router.js';
import { bindActions, toast, modal, confirmBox, esc, el, $ } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { avatarHTML } from '../core/sprites.js';
import { byCat } from '../core/catalog.js';
import { reportPlayer, blockPlayer, isBlocked } from '../core/social.js';
import { cleanText } from '../engine/moderation.js';
import { SHARE_BASE_URL } from '../firebase-config.js';
import { playSound } from '../core/audio.js';
import * as online from '../net/online.js';

/** Chat modal usable from the room and from inside matches. */
export async function openRoomChat(code) {
  const me = online.currentUser();
  const box = el('div');
  box.innerHTML = `<div class="chat-box glass" style="height:220px;max-height:none"></div>
    <div class="row" style="margin-top:6px;gap:6px">${['GG 🔥', 'Kya baat hai! 😎', 'Jaldi chalo ⏰', 'Hahaha 😂'].map((q) => `<button class="btn sm ghost" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><input class="input grow" maxlength="200" placeholder="Message…"><button class="btn sm primary">Send</button></div>`;
  const log = box.querySelector('.chat-box');
  const input = box.querySelector('input');
  const off = online.watchRoomChat(code, (m) => {
    if (isBlocked(m.uid)) return;
    const d = el('div', { class: 'msg' });
    d.innerHTML = `<b>${m.uid === me?.uid ? 'You' : esc(m.name)}:</b> ${esc(cleanText(m.text))}`;
    log.append(d); log.scrollTop = log.scrollHeight;
  });
  const send = (t) => { t = cleanText(t); if (t) online.sendRoomChat(code, t).catch((e) => toast(e.message, 'error')); input.value = ''; };
  box.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) send(q.dataset.q);
    else if (e.target.closest('button.primary')) send(input.value);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(input.value); });
  await modal({ title: '💬 Room Chat', body: box, buttons: [{ label: 'Close', value: true }] });
  off();
}

export default {
  nav: null,
  async render(root, params) {
    const code = params.code;
    let room = null;
    let navigated = false;
    await online.requireUser();
    const uid = online.currentUser().uid;
    const chatLines = [];

    const draw = () => {
      if (!room) { root.innerHTML = `${topbar('GAME ROOM')}<div class="empty">Connecting…</div>`; return; }
      const players = Object.entries(room.players || {}).map(([id, p]) => ({ uid: id, ...p })).sort((a, b) => a.seat - b.seat);
      const isHost = room.hostUid === uid;
      const me = room.players?.[uid];
      const max = room.settings.maxPlayers;
      const slots = Array.from({ length: max }, (_, i) => players.find((p) => p.seat === i));
      const allReady = players.length === max && players.every((p) => p.ready || p.uid === room.hostUid);
      const themes = byCat(room.game === 'chess' ? 'board_chess' : 'board_ludo');
      const packs = byCat('sound_pack');
      root.innerHTML = `${topbar(room.game === 'chess' ? '♛ CHESS ROOM' : '🎲 LUDO ROOM', { right: '<button class="icon-btn" data-action="chat" aria-label="Chat">💬</button>' })}
        <div class="glass card center">
          <div class="small muted">ROOM CODE</div>
          <div class="room-code">${esc(code)}</div>
          <div class="grid3" style="margin-top:8px">
            <button class="btn sm green" data-action="whatsapp">WhatsApp</button>
            <button class="btn sm ghost" data-action="copy">📋 Copy</button>
            <button class="btn sm primary" data-action="inviteFriends">👥 Invite</button>
          </div>
        </div>
        <div class="slots">${slots.map((p, i) => p ? `
          <div class="slot glass filled ${p.ready || p.uid === room.hostUid ? 'ready' : ''}">
            <div style="position:relative">${p.uid === uid ? avatarHTML(null, 56) : avatarHTML({ avatar: p.avatar, frame: p.frame }, 56)}<span class="status-dot ${room.presence?.[p.uid] !== false ? 'on' : ''}"></span></div>
            <b class="ellipsis" style="max-width:100%">${p.uid === room.hostUid ? '👑 ' : ''}${esc(p.name)}${p.uid === uid ? ' (You)' : ''}</b>
            <div class="small muted">Lv.${p.level || 1}</div>
            <div class="small">${p.uid === room.hostUid ? '<span class="badge gold">HOST</span>' : p.ready ? '<span class="badge green">READY</span>' : '<span class="badge">NOT READY</span>'}</div>
            ${p.uid !== uid ? `<button class="btn sm ghost" data-action="playerMenu" data-uid="${p.uid}" data-name="${esc(p.name)}">⋯</button>` : ''}
          </div>` : `<div class="slot"><div style="font-size:34px;opacity:.5">➕</div><div class="small muted">Waiting for player ${i + 1}…</div></div>`).join('')}</div>
        <div class="glass card" style="margin-top:12px">
          <div class="section-title" style="margin-top:0">Room Settings ${isHost ? '' : '<span class="small muted">(host only)</span>'}</div>
          <div class="list-item"><div class="grow">Game Mode</div><b>${room.game === 'chess' ? 'Neon Chess · 1v1' : `Meme Ludo · ${max} Players`}</b>
            ${isHost && room.game === 'ludo' ? `<button class="btn sm ghost" data-action="toggleMax">⇄ ${max === 2 ? '4P' : '2P'}</button>` : ''}</div>
          <div class="list-item"><div class="grow">Board Theme</div>
            <select class="input" style="width:auto" data-setting="boardTheme" ${isHost ? '' : 'disabled'}>${themes.map((t) => `<option value="${t.id}" ${room.settings.boardTheme === t.id ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}</select></div>
          <div class="list-item"><div class="grow">Meme Sound Pack</div>
            <select class="input" style="width:auto" data-setting="soundPack" ${isHost ? '' : 'disabled'}>${packs.map((t) => `<option value="${t.id}" ${room.settings.soundPack === t.id ? 'selected' : ''}>${t.icon} ${t.name}</option>`).join('')}</select></div>
          ${room.game === 'chess' ? `<div class="list-item"><div class="grow">Clock</div>
            <select class="input" style="width:auto" data-setting="chessMinutes" ${isHost ? '' : 'disabled'}>${[3, 5, 10, 15].map((m) => `<option value="${m}" ${room.settings.chessMinutes === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>` : ''}
        </div>
        ${isHost
          ? `<button class="btn gold block" data-action="start" ${allReady ? '' : 'disabled'} style="font-size:20px">▶ START GAME</button>
             <p class="small muted center">${allReady ? 'Everyone is ready!' : `Waiting for ${max - players.length > 0 ? `${max - players.length} more player(s)` : 'players to get ready'}…`}</p>`
          : `<button class="btn ${me?.ready ? 'ghost' : 'green'} block" data-action="ready" style="font-size:20px">${me?.ready ? '✋ Not Ready' : '✔ READY'}</button>
             <p class="small muted center">The host starts the match when everyone is ready.</p>`}
        <div class="glass card chat-box" id="chat-preview" style="margin-top:10px">${chatLines.slice(-6).join('') || '<span class="muted small">Say hi in chat 👋</span>'}</div>
        <button class="btn ghost block" data-action="leave" style="margin-top:8px">🚪 Leave Room</button>`;
      root.querySelectorAll('[data-setting]').forEach((s) => s.addEventListener('change', async () => {
        const v = s.dataset.setting === 'chessMinutes' ? Number(s.value) : s.value;
        try { await online.call('updateRoom', { code, settings: { ...room.settings, [s.dataset.setting]: v } }); } catch (e) { toast(e.message, 'error'); }
      }));
    };

    const offs = [];
    offs.push(online.watchRoom(code, (r, err) => {
      if (navigated) return;
      if (err || !r) { toast('This room no longer exists', 'error'); navigated = true; go('friends', {}, { replace: true }); return; }
      const prevCount = room ? Object.keys(room.players || {}).length : 0;
      room = r;
      if (!r.players?.[uid]) { toast('You are not in this room', 'error'); navigated = true; go('friends', {}, { replace: true }); return; }
      if (r.status === 'playing') { navigated = true; playSound('airhorn'); go(r.game, { mode: 'online', code }, { replace: true }); return; }
      if (Object.keys(r.players).length > prevCount && prevCount) playSound('pop');
      draw();
    }));
    offs.push(online.watchRoomChat(code, (m) => {
      if (isBlocked(m.uid)) return;
      chatLines.push(`<div class="msg"><b>${m.uid === uid ? 'You' : esc(m.name)}:</b> ${esc(cleanText(m.text))}</div>`);
      const cp = $('#chat-preview', root);
      if (cp) { cp.innerHTML = chatLines.slice(-6).join(''); cp.scrollTop = cp.scrollHeight; }
    }));
    draw();

    const shareText = () => `Aaja bhai, NEON TAKKAR pe ${room?.game === 'chess' ? 'Chess' : 'Ludo'} khelte hain! 🎲🔥\nRoom code: ${code}\n${SHARE_BASE_URL}?room=${code}`;

    const unbind = bindActions(root, {
      back: () => back(),
      chat: () => openRoomChat(code),
      copy: () => navigator.clipboard?.writeText(code).then(() => toast('Room code copied!', 'success')).catch(() => toast(code)),
      whatsapp: async () => {
        const text = shareText();
        const Share = window.Capacitor?.Plugins?.Share;
        if (Share) { Share.share({ text, dialogTitle: 'Invite friends' }).catch(() => {}); return; }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      },
      inviteFriends: async () => {
        if (online.currentUser().anonymous) { toast('Share the room code — friend invites need Google sign-in'); return; }
        const fr = await new Promise((res) => { const off = online.watchFriends((l) => { off?.(); res(l); }); });
        if (!fr.length) { toast('No friends yet — share the room code instead!'); return; }
        const target = await modal({ title: 'Invite a friend', buttons: fr.filter((f) => !isBlocked(f.uid)).slice(0, 12).map((f) => ({ label: `${f.avatar || '🙂'} ${f.name}`, value: f.uid })).concat([{ label: 'Cancel', value: null }]) });
        if (!target) return;
        try { await online.call('inviteFriend', { code, uid: target }); toast('Invite sent!', 'success'); } catch (e) { toast(e.message, 'error'); }
      },
      toggleMax: async () => {
        try { await online.call('updateRoom', { code, settings: { ...room.settings, maxPlayers: room.settings.maxPlayers === 2 ? 4 : 2 } }); } catch (e) { toast(e.message, 'error'); }
      },
      ready: async () => {
        try { await online.call('setReady', { code, ready: !room.players[uid].ready }); playSound('pop'); } catch (e) { toast(e.message, 'error'); }
      },
      start: async (b) => {
        b.disabled = true;
        try { await online.sendIntent(code, { type: 'start' }); } catch (e) { toast(e.message, 'error'); b.disabled = false; }
      },
      playerMenu: async (b) => {
        const { uid: pu, name } = b.dataset;
        const isHost = room.hostUid === uid;
        const v = await modal({ title: name, buttons: [
          ...(isHost ? [{ label: '👢 Remove from room', value: 'kick' }] : []),
          ...(online.currentUser().anonymous ? [] : [{ label: '➕ Add friend', value: 'add', kind: 'primary' }]),
          { label: '🚫 Block', value: 'block', kind: 'danger' }, { label: '🚩 Report', value: 'report' }, { label: 'Close', value: null }] });
        if (v === 'kick') online.call('kickPlayer', { code, uid: pu }).catch((e) => toast(e.message, 'error'));
        if (v === 'add') online.call('sendFriendRequest', { uid: pu }).then(() => toast('Friend request sent!', 'success')).catch((e) => toast(e.message, 'error'));
        if (v === 'block') blockPlayer(pu, name);
        if (v === 'report') reportPlayer(pu, name, `room ${code}`);
      },
      leave: async () => {
        if (!(await confirmBox('Leave room?', 'You can rejoin with the room code while it is open.', 'Leave'))) return;
        navigated = true;
        online.call('leaveRoom', { code }).catch(() => {});
        go('friends', {}, { replace: true });
      },
    });
    return () => { unbind(); offs.forEach((f) => f()); };
  },
};

