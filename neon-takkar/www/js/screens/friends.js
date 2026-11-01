/**
 * Friends Lobby — online friends, requests, recent players, private rooms,
 * room codes, quick match; plus offline pass-and-play shortcuts.
 */
import { store } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, toast, modal, promptBox, esc, el } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { avatarHTML } from '../core/sprites.js';
import { reportPlayer, blockPlayer, isBlocked } from '../core/social.js';
import { cleanText } from '../engine/moderation.js';
import { isValidRoomCode } from '../engine/room.js';
import { signUpWithGmail } from '../core/accountUI.js';
import * as online from '../net/online.js';

function offlineHTML() {
  return `<div class="section-title">Offline with friends (same phone)</div>
    <div class="glass card">
      <p class="small muted" style="margin-top:0">No internet or login needed — take turns on one device.</p>
      <div class="grid3">
        <button class="btn pink" data-action="local" data-game="ludo" data-n="2">🎲 Ludo 2P</button>
        <button class="btn pink" data-action="local" data-game="ludo" data-n="4">🎲 Ludo 4P</button>
        <button class="btn blue" data-action="local" data-game="chess">♛ Chess 2P</button>
      </div>
      <p class="small muted" style="margin-bottom:0">📡 Nearby play over local Wi-Fi/Bluetooth is planned — the game's transport layer is ready for it (see README).</p>
    </div>`;
}

export default {
  nav: 'friends',
  async render(root, params) {
    let tab = 'friends';
    let friends = [];
    let requests = [];
    let recent = [];
    const presence = {};
    const presOffs = new Map();
    const offs = [];
    let user = online.currentUser();

    const draw = () => {
      const s = store.get();
      if (!online.configured) {
        root.innerHTML = `${topbar('👥 PLAY WITH FRIENDS', { back: false })}
          <div class="glass card"><b>🌐 Online play is not configured in this build.</b>
          <p class="small muted">To enable online rooms, invites, chat & friend lists the developer adds a Firebase project (README → Firebase setup).</p></div>
          ${offlineHTML()}`;
        return;
      }
      if (!user) {
        root.innerHTML = `${topbar('👥 PLAY WITH FRIENDS', { back: false })}
          <div class="glass card center"><div style="font-size:48px">🤝</div>
            <p>Sign in to add friends, create private rooms and play online.</p>
            <button class="btn google-btn block" data-action="google"><span class="g">G</span> Continue with Google</button>
            <button class="btn ghost block" data-action="anon" style="margin-top:8px">🎮 Play online as Guest</button>
            <p class="small muted">Guests can create & join rooms. Friends list needs a Google account.</p></div>
          ${offlineHTML()}`;
        return;
      }
      const visibleFriends = friends.filter((f) => !isBlocked(f.uid));
      const online1st = [...visibleFriends].sort((a, b) => (presence[b.uid] ? 1 : 0) - (presence[a.uid] ? 1 : 0));
      root.innerHTML = `${topbar('👥 FRIENDS LOBBY', { back: false })}
        <div class="glass card row">
          <div class="grow"><div class="small muted">Your Player ID</div><b style="font-size:18px;letter-spacing:1px">${esc(s.playerId)}</b></div>
          <button class="btn sm ghost" data-action="copyId">📋 Copy</button>
        </div>
        <div class="grid3">
          <button class="btn primary" data-action="create">➕ Room</button>
          <button class="btn blue" data-action="join">🔑 Join</button>
          <button class="btn pink" data-action="quick">⚡ Match</button>
        </div>
        <div class="tabs" style="margin-top:10px">
          <button class="tab ${tab === 'friends' ? 'active' : ''}" data-action="tab" data-v="friends">Friends (${visibleFriends.length})</button>
          <button class="tab ${tab === 'requests' ? 'active' : ''}" data-action="tab" data-v="requests">Requests ${requests.length ? `<span class="badge red">${requests.length}</span>` : ''}</button>
          <button class="tab ${tab === 'recent' ? 'active' : ''}" data-action="tab" data-v="recent">Recent Players</button>
        </div>
        ${user.anonymous && tab !== 'recent' ? `<div class="glass card center small">Friends need a Google account.<br><button class="btn sm google-btn" data-action="google" style="margin-top:8px"><span class="g">G</span> Connect Google</button></div>` : ''}
        ${tab === 'friends' && !user.anonymous ? (online1st.length ? online1st.map((f) => `<div class="list-item">
            <div style="position:relative">${avatarHTML({ avatar: f.avatar, frame: f.frame }, 44)}<span class="status-dot ${presence[f.uid] ? 'on' : ''}"></span></div>
            <div class="grow"><div class="title ellipsis">${esc(f.name)}</div><div class="small muted">Lv.${f.level || 1} · ${presence[f.uid] ? '<span style="color:var(--green)">Online</span>' : 'Offline'}</div></div>
            <button class="btn sm green" data-action="invite" data-uid="${f.uid}" data-name="${esc(f.name)}">Invite</button>
            <button class="btn sm ghost" data-action="dm" data-uid="${f.uid}" data-name="${esc(f.name)}">💬</button>
            <button class="btn sm ghost" data-action="more" data-uid="${f.uid}" data-name="${esc(f.name)}">⋯</button>
          </div>`).join('') : '<div class="empty glass">No friends yet. Share your Player ID or add a friend from the Requests tab!</div>') : ''}
        ${tab === 'requests' && !user.anonymous ? `
          <div class="glass card row"><input class="input grow" id="pid" placeholder="Friend's Player ID (NT-XXXXXXXX)" maxlength="12"><button class="btn sm primary" data-action="sendReq">Add</button></div>
          ${requests.filter((r) => !isBlocked(r.from)).map((r) => `<div class="list-item">${avatarHTML({ avatar: r.fromAvatar }, 40)}
            <div class="grow"><div class="title">${esc(r.fromName)}</div><div class="small muted">wants to be friends</div></div>
            <button class="btn sm green" data-action="accept" data-id="${r.id}">✔</button><button class="btn sm danger" data-action="reject" data-id="${r.id}">✕</button></div>`).join('') || '<div class="empty">No pending requests</div>'}` : ''}
        ${tab === 'recent' ? (recent.filter((r) => !isBlocked(r.uid)).map((r) => `<div class="list-item">${avatarHTML({ avatar: r.avatar }, 40)}
            <div class="grow"><div class="title">${esc(r.name)}</div><div class="small muted">${esc(r.game || '')} · Lv.${r.level || 1}</div></div>
            ${!user.anonymous && !friends.some((f) => f.uid === r.uid) ? `<button class="btn sm primary" data-action="addRecent" data-uid="${r.uid}">➕ Add</button>` : ''}
            <button class="btn sm ghost" data-action="more" data-uid="${r.uid}" data-name="${esc(r.name)}">⋯</button></div>`).join('') || '<div class="empty">Play online matches to see recent players here.</div>') : ''}
        ${offlineHTML()}`;
    };

    function watchPresenceOf(list) {
      for (const f of list) {
        if (presOffs.has(f.uid)) continue;
        presOffs.set(f.uid, online.watchPresence(f.uid, (on) => { presence[f.uid] = on; draw(); }));
      }
    }

    function subscribe() {
      offs.splice(0).forEach((f) => f());
      if (!user) return;
      if (!user.anonymous) {
        offs.push(online.watchFriends((l) => { friends = l; watchPresenceOf(l); draw(); }));
        offs.push(online.watchFriendRequests((l) => { requests = l; draw(); }));
      }
      offs.push(online.watchRecent((l) => { recent = l; draw(); }));
    }

    async function createRoom(game, maxPlayers) {
      await online.requireUser();
      const r = await online.call('createRoom', { game, settings: { maxPlayers, boardTheme: store.get().equipped[game === 'chess' ? 'board_chess' : 'board_ludo'], soundPack: store.get().equipped.sound_pack, chessMinutes: 10 } });
      go('room', { code: r.code });
      return r.code;
    }

    async function chooseAndCreate(gameHint) {
      const v = gameHint === 'chess' ? 'chess' : await modal({
        title: 'Create Private Room',
        buttons: gameHint === 'ludo'
          ? [{ label: '🎲 Ludo 2 Players', value: 'ludo2', kind: 'pink' }, { label: '🎲 Ludo 4 Players', value: 'ludo4', kind: 'pink' }]
          : [{ label: '🎲 Ludo 2P', value: 'ludo2', kind: 'pink' }, { label: '🎲 Ludo 4P', value: 'ludo4', kind: 'pink' }, { label: '♛ Chess', value: 'chess', kind: 'blue' }],
      });
      if (!v) return null;
      try { return await createRoom(v === 'chess' ? 'chess' : 'ludo', v === 'ludo4' ? 4 : 2); } catch (e) { toast(e.message, 'error'); return null; }
    }

    async function joinCode(code) {
      code = String(code || '').trim().toUpperCase();
      if (!isValidRoomCode(code)) { toast('Room codes are 6 letters/numbers', 'error'); return; }
      try { await online.requireUser(); await online.call('joinRoom', { code }); go('room', { code }); } catch (e) { toast(e.message, 'error'); }
    }

    async function quickMatch(game) {
      try {
        await online.requireUser();
        const g = game || await modal({ title: 'Quick Match', buttons: [{ label: '🎲 Ludo', value: 'ludo', kind: 'pink' }, { label: '♛ Chess', value: 'chess', kind: 'blue' }] });
        if (!g) return;
        let done = false;
        const off = online.watchMatchFound((m) => { if (done) return; done = true; off(); document.querySelector('.modal-wrap')?._close?.('found'); go('room', { code: m.code }); });
        const r = await online.call('quickMatch', { game: g });
        if (r.code) { done = true; off(); go('room', { code: r.code }); return; }
        // keep looking while the player waits (pairs waiting players with each other)
        const poll = setInterval(async () => {
          if (done) { clearInterval(poll); return; }
          try {
            const again = await online.call('quickMatch', { game: g });
            if (again.code && !done) { done = true; clearInterval(poll); off(); document.querySelector('.modal-wrap')?._close?.('found'); go('room', { code: again.code }); }
          } catch { /* transient — next poll */ }
        }, 6000);
        setTimeout(() => clearInterval(poll), 120_000);
        const v = await modal({ title: '⚡ Finding a player…', body: '<div class="center"><div class="die rolling" data-v="6" style="margin:10px auto">' + '<i></i>'.repeat(9) + '</div><p class="muted">Waiting for an opponent</p></div>', buttons: [{ label: 'Cancel', value: 'cancel', kind: 'danger' }], dismissible: false });
        clearInterval(poll);
        if (v === 'cancel' && !done) { done = true; off(); online.call('cancelQuickMatch', {}).catch(() => {}); }
      } catch (e) { toast(e.message, 'error'); }
    }

    async function openDM(uid, name) {
      const box = el('div');
      box.innerHTML = '<div class="chat-box glass" id="dm-log" style="height:240px;max-height:none"></div><div class="row" style="margin-top:8px"><input class="input grow" id="dm-in" maxlength="300" placeholder="Message…"><button class="btn sm primary" id="dm-send">Send</button></div><p class="small muted">Be kind. Messages are filtered; report abuse via ⋯.</p>';
      const log = box.querySelector('#dm-log');
      const off = online.watchDM(uid, (m) => {
        const d = el('div', { class: 'msg' });
        d.innerHTML = `<b>${m.uid === user.uid ? 'You' : esc(name)}:</b> ${esc(cleanText(m.text, 300))}`;
        log.append(d); log.scrollTop = log.scrollHeight;
      });
      const send = () => {
        const inp = box.querySelector('#dm-in');
        const t = cleanText(inp.value, 300);
        if (!t) return;
        online.sendDM(uid, t).catch((e) => toast(e.message, 'error'));
        inp.value = '';
      };
      box.querySelector('#dm-send').addEventListener('click', send);
      box.querySelector('#dm-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      await modal({ title: `💬 ${name}`, body: box, buttons: [{ label: 'Close', value: true }] });
      off();
    }

    draw();
    if (online.configured) {
      offs.push(online.onUser((u) => { user = u; subscribe(); draw(); }));
      online.init().catch(() => {});
      if (params.joinCode) setTimeout(() => joinCode(params.joinCode), 300);
      if (params.create) setTimeout(() => chooseAndCreate(params.create), 200);
      if (params.join) setTimeout(async () => { const c = await promptBox('Join with Room Code', { placeholder: 'ABC123', maxlength: 6, ok: 'Join' }); if (c) joinCode(c); }, 200);
      if (params.quick) setTimeout(() => quickMatch(params.quick), 200);
    }

    const unbind = bindActions(root, {
      ...commonActions,
      tab: (b) => { tab = b.dataset.v; draw(); },
      local: (b) => {
        if (b.dataset.game === 'chess') { go('chess', { mode: 'local', minutes: 0, names: [store.get().name, 'Player 2'] }); return; }
        const n = Number(b.dataset.n);
        const colors = n === 2 ? ['red', 'yellow'] : ['red', 'green', 'yellow', 'blue'];
        go('ludo', { mode: 'local', players: colors.map((c, i) => ({ name: i === 0 ? store.get().name : `Player ${i + 1}`, color: c, type: 'human', me: i === 0 })) });
      },
      google: () => signUpWithGmail(),
      anon: async () => { try { await online.signInGuestOnline(); } catch (e) { toast(e.message, 'error'); } },
      copyId: () => {
        const id = store.get().playerId;
        navigator.clipboard?.writeText(id).then(() => toast('Player ID copied!', 'success')).catch(() => toast(id));
      },
      create: () => chooseAndCreate(null),
      join: async () => { const c = await promptBox('Join with Room Code', { placeholder: 'ABC123', maxlength: 6, ok: 'Join' }); if (c) joinCode(c); },
      quick: () => quickMatch(null),
      sendReq: async () => {
        const pid = root.querySelector('#pid').value.trim().toUpperCase();
        if (!/^NT-[A-Z0-9]{8}$/.test(pid)) { toast('Player IDs look like NT-AB12CD34', 'error'); return; }
        try { await online.call('sendFriendRequest', { playerId: pid }); toast('Friend request sent!', 'success'); } catch (e) { toast(e.message, 'error'); }
      },
      addRecent: async (b) => { try { await online.call('sendFriendRequest', { uid: b.dataset.uid }); toast('Friend request sent!', 'success'); } catch (e) { toast(e.message, 'error'); } },
      accept: async (b) => { try { await online.call('respondFriendRequest', { id: b.dataset.id, accept: true }); toast('New friend added! 🤝', 'success'); } catch (e) { toast(e.message, 'error'); } },
      reject: async (b) => { try { await online.call('respondFriendRequest', { id: b.dataset.id, accept: false }); } catch (e) { toast(e.message, 'error'); } },
      invite: async (b) => {
        const code = await chooseAndCreate(null);
        if (!code) return;
        try { await online.call('inviteFriend', { code, uid: b.dataset.uid }); toast(`Invite sent to ${b.dataset.name}`, 'success'); } catch (e) { toast(e.message, 'error'); }
      },
      dm: (b) => openDM(b.dataset.uid, b.dataset.name),
      more: async (b) => {
        const { uid, name } = b.dataset;
        const isFriend = friends.some((f) => f.uid === uid);
        const v = await modal({ title: name, buttons: [
          ...(isFriend ? [{ label: '➖ Remove friend', value: 'remove' }] : []),
          { label: '🚫 Block', value: 'block', kind: 'danger' }, { label: '🚩 Report', value: 'report' }, { label: 'Close', value: null }] });
        if (v === 'remove') { await online.call('removeFriend', { uid }).catch((e) => toast(e.message, 'error')); }
        if (v === 'block') { if (await blockPlayer(uid, name)) draw(); }
        if (v === 'report') reportPlayer(uid, name, 'friends-lobby');
      },
    });

    return () => { unbind(); offs.forEach((f) => f()); presOffs.forEach((f) => f()); };
  },
};
