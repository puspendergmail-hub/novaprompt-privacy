/**
 * Meme Ludo match screen. Modes:
 *  ai / local / tournament — rules run on-device with the shared engine (works offline)
 *  online                  — server-authoritative: we send intents & render the room state
 */
import * as L from '../engine/ludo.js';
import { store, recordMatch, bumpMission } from '../core/store.js';
import { back, go } from '../core/router.js';
import { bindActions, toast, burst, confirmBox, esc, $ } from '../core/dom.js';
import { sticker, resultOverlay } from '../core/ui.js';
import { boardSVG, pct, LUDO_THEMES } from '../core/ludoBoard.js';
import { gotiSprite, gotiConfigFor, avatarHTML } from '../core/sprites.js';
import { playEvent, playSound, vibrate } from '../core/audio.js';
import { ITEM } from '../core/catalog.js';
import { rewardsFor } from '../engine/room.js';

// window.__speed lets automated UI tests fast-forward animations.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (window.__speed ?? 1)));
const rnd6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);
const CORNER = { red: 'tl', green: 'tr', blue: 'bl', yellow: 'br' };
const QUICK_REACTIONS = [['😂', 'hahaha'], ['😭', 'wah_wah'], ['😎', 'oye'], ['🔥', 'airhorn']];

export default {
  nav: null,
  async render(root, params) {
    const mode = params.mode || 'ai';
    const isOnline = mode === 'online';
    const s0 = store.get();
    const themeId = s0.equipped.board_ludo;
    const theme = LUDO_THEMES[themeId] || LUDO_THEMES.ludo_neon;
    let alive = true;
    let game = null;
    let room = null;
    let me = null; // my colour
    let net = null;
    let animating = Promise.resolve();
    const stats = { captures: 0, sixes: 0 };
    const sprites = {};
    let waiters = { roll: null, pick: null };
    let finished = false;

    root.innerHTML = `
      <div class="game-top">
        <button class="icon-btn" data-action="leave" aria-label="Back">‹</button>
        <div class="game-title">MEME LUDO<small>CUT • REACT • WIN</small></div>
        <button class="icon-btn" data-action="mute" aria-label="Mute">${s0.settings.sfx ? '🔊' : '🔇'}</button>
      </div>
      <div class="players-row" id="top-row"></div>
      <div class="ludo-wrap"><div class="ludo-board" id="board">${boardSVG(themeId)}</div></div>
      <div class="players-row" id="bottom-row"></div>
      <div class="dice-zone">
        <button class="react-btn" data-action="react" data-i="0" aria-label="Laugh">😂</button>
        <button class="dice-btn" id="dice" data-action="roll" disabled>
          <div class="die ${esc(s0.equipped.dice)}" id="die" data-v="1">${'<i></i>'.repeat(9)}</div>
          <span class="lbl" id="dice-lbl">Roll Dice</span>
        </button>
        <button class="react-btn" data-action="react" data-i="1" aria-label="Cry">😭</button>
      </div>
      <div class="row" style="justify-content:center;gap:8px">
        <button class="btn sm ghost" data-action="react" data-i="2">😎</button>
        <button class="btn sm ghost" data-action="react" data-i="3">🔥</button>
        ${isOnline ? '<button class="btn sm ghost" data-action="chat">💬 Chat</button>' : ''}
      </div>
      <div class="game-log" id="log"></div>`;

    const boardEl = $('#board', root);
    const diceBtn = $('#dice', root);
    const dieEl = $('#die', root);
    const diceLbl = $('#dice-lbl', root);
    const logEl = $('#log', root);
    const log = (t) => { logEl.textContent = t; };

    /* ------------------------------ setup ------------------------------ */
    async function buildSprites(players) {
      for (const p of players) {
        const col = theme.colors[p.color];
        const mine = p.me || (isOnline && p.color === me);
        const cfg = mine ? gotiConfigFor(col) : { color: col, face: '', hat: 'hat_none', frame: 'frame_neon', glow: theme.glow };
        sprites[p.color] = await gotiSprite(cfg, 96);
      }
    }

    function playerMeta(color) {
      if (isOnline) {
        const entry = Object.entries(room.players || {}).find(([, p]) => p.color === color);
        if (!entry) return { name: color, sub: '' };
        const [uid, p] = entry;
        const connected = room.presence?.[uid] !== false;
        return { name: p.name, sub: `Lv.${p.level || 1}${connected ? '' : ' · 📴 offline'}`, avatar: p.avatar, frame: p.frame, uid };
      }
      const p = params.players.find((x) => x.color === color);
      return { name: p.name, sub: p.type === 'ai' ? `🤖 ${p.ai || params.ai}` : (p.me ? 'You' : 'Human'), me: p.me };
    }

    function renderPlayers() {
      const top = $('#top-row', root);
      const bot = $('#bottom-row', root);
      const cards = { tl: '', tr: '', bl: '', br: '' };
      for (const p of game.players) {
        const meta = playerMeta(p.color);
        const active = game.phase !== 'over' && L.currentPlayer(game).color === p.color;
        const homes = p.tokens.filter((t) => t === L.FINISH).length;
        const corner = CORNER[p.color];
        const av = meta.me || (isOnline && p.color === me) ? avatarHTML(null, 38) : avatarHTML({ avatar: meta.avatar || (p.type === 'ai' ? '🤖' : '🙂'), frame: meta.frame }, 38);
        cards[corner] = `<div class="pcard ${active ? 'active' : ''} ${corner.endsWith('r') ? 'right' : ''}" style="--pc:${theme.colors[p.color]}" data-color="${p.color}">
          ${av}<div class="grow" style="min-width:0"><div class="pname ellipsis">${esc(meta.name)}</div>
          <div class="psub">${esc(meta.sub)}</div><div class="homes">🏠 ${homes}/4 ${active && isOnline ? `<span class="turn-timer"></span>` : ''}</div></div></div>`;
      }
      top.innerHTML = (cards.tl || '<div></div>') + (cards.tr || '<div></div>');
      bot.innerHTML = (cards.bl || '<div></div>') + (cards.br || '<div></div>');
    }

    const tokenEls = {};
    function ensureTokens() {
      for (const p of game.players) {
        if (tokenEls[p.color]) continue;
        tokenEls[p.color] = p.tokens.map((_, i) => {
          const d = document.createElement('div');
          d.className = 'token';
          d.dataset.color = p.color;
          d.dataset.idx = i;
          d.innerHTML = `<img src="${sprites[p.color]}" alt="${p.color} goti ${i + 1}" draggable="false">`;
          boardEl.append(d);
          return d;
        });
      }
      // remove tokens of forfeited players
      for (const c of Object.keys(tokenEls)) {
        if (!game.players.some((p) => p.color === c)) { tokenEls[c].forEach((d) => d.remove()); delete tokenEls[c]; }
      }
    }

    function placeAll(skip = null) {
      const groups = new Map();
      for (const p of game.players) {
        p.tokens.forEach((pr, i) => {
          if (skip && skip.color === p.color && skip.idx === i) return;
          const coord = L.tokenCoord(p.color, pr, i);
          const key = coord.join(',');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push({ color: p.color, i, coord });
        });
      }
      for (const list of groups.values()) {
        list.forEach(({ color, i, coord }, k) => {
          const el = tokenEls[color]?.[i];
          if (!el) return;
          const pos = pct(coord);
          const n = list.length;
          const off = n > 1 ? (k - (n - 1) / 2) * 1.6 : 0;
          el.style.left = pos.left + off + '%';
          el.style.top = pos.top + (n > 1 ? (k % 2) * 0.8 : 0) + '%';
          el.classList.toggle('small', n > 1);
          el.style.zIndex = 5 + Math.round(coord[0]);
        });
      }
    }

    function setMovable(list) {
      for (const p of game.players) tokenEls[p.color]?.forEach((el) => el.classList.remove('movable'));
      if (!list) return;
      const color = L.currentPlayer(game).color;
      list.forEach((i) => tokenEls[color][i].classList.add('movable'));
    }

    function trailAt(color, coord) {
      const tr = store.get().equipped.goti_trail;
      const mine = isOnline ? color === me : params.players?.find((p) => p.color === color)?.me;
      if (!mine || tr === 'trail_none' || document.body.classList.contains('gfx-low')) return;
      const n = document.createElement('div');
      n.className = 'trail';
      n.textContent = ITEM[tr]?.icon || '✨';
      const p = pct(coord);
      n.style.left = p.left + '%'; n.style.top = p.top + '%';
      boardEl.append(n);
      setTimeout(() => n.remove(), 900);
    }

    async function animateMove(color, idx, from, to) {
      const el = tokenEls[color]?.[idx];
      if (!el) return;
      const path = [];
      if (from < 0) path.push(0);
      else for (let p = from + 1; p <= to; p++) path.push(p);
      el.style.zIndex = 30;
      for (const pr of path) {
        const c = L.tokenCoord(color, pr, idx);
        const pos = pct(c);
        trailAt(color, L.tokenCoord(color, Math.max(pr - 1, 0), idx));
        el.style.left = pos.left + '%';
        el.style.top = pos.top + '%';
        playSound('tick');
        await sleep(store.get().settings.gfx === 'low' ? 80 : 150);
      }
    }

    function diceFace(v, rolling = false) {
      dieEl.dataset.v = v || 1;
      dieEl.classList.toggle('rolling', rolling);
    }

    function updateControls() {
      if (!game) return;
      const cur = L.currentPlayer(game);
      const meta = playerMeta(cur.color);
      const myTurn = isOnline ? cur.color === me : cur.type === 'human';
      const canRoll = myTurn && game.phase === 'roll' && !finished;
      diceBtn.disabled = !canRoll;
      diceBtn.style.borderColor = theme.colors[cur.color];
      diceBtn.style.boxShadow = canRoll ? `0 0 22px ${theme.colors[cur.color]}` : 'none';
      if (game.phase === 'over') diceLbl.textContent = 'Game Over';
      else if (game.phase === 'move' && myTurn) diceLbl.textContent = 'Tap a goti';
      else if (canRoll) diceLbl.textContent = isOnline || params.players.filter((p) => p.type === 'human').length === 1 ? 'Roll Dice' : `${meta.name}: Roll`;
      else diceLbl.textContent = `${meta.name}…`;
      if (game.phase === 'move' && myTurn) setMovable(L.legalMoves(game)); else setMovable(null);
    }

    function render(skipToken = null) {
      ensureTokens();
      placeAll(skipToken);
      renderPlayers();
      updateControls();
    }

    /* --------------------------- event effects -------------------------- */
    const isLocalHuman = (color) => (isOnline ? color === me : !!params.players.find((p) => p.color === color && p.type === 'human'));
    const isMe = (color) => (isOnline ? color === me : !!params.players.find((p) => p.color === color && p.me));
    const cardPos = (color) => {
      const c = CORNER[color];
      return { x: c.endsWith('l') ? 28 : 72, y: c.startsWith('t') ? 26 : 70 };
    };

    function effects(events) {
      for (const e of events) {
        switch (e.type) {
          case 'six':
            if (isMe(e.color)) { stats.sixes++; bumpMission('sixes'); }
            if (isLocalHuman(e.color)) { playEvent('six'); burst(e.count === 2 ? 'DOUBLE CHAKKA! 🔥' : 'CHAKKA! 6️⃣', { y: 40 }); }
            break;
          case 'three-sixes': toast('Teen chakke = turn khatam! 😵'); playSound('boing'); break;
          case 'no-move': log(`${playerMeta(e.color).name}: no move possible`); break;
          case 'capture': {
            if (isMe(e.by)) { stats.captures++; bumpMission('captures'); }
            playEvent(isMe(e.victim) ? 'captured' : 'capture');
            const p1 = cardPos(e.by), p2 = cardPos(e.victim);
            sticker(['😂', '🤣', '😎', '😜'][Math.floor(Math.random() * 4)], ['KAAT DIYA!', 'GAYA BETA!', 'OYE HOYE!', 'BHAI BOLTI PUBLIC'][Math.floor(Math.random() * 4)], { x: p1.x, y: Math.min(p1.y + 10, 60) });
            setTimeout(() => sticker('😭', ['RONA MAT!', 'ARRE NAHI!', 'BAS KAR PAGLE'][Math.floor(Math.random() * 3)], { sad: true, x: p2.x, y: Math.max(p2.y - 6, 30) }), 500);
            vibrate(80);
            log(`${playerMeta(e.by).name} cut ${playerMeta(e.victim).name}'s goti!`);
            break;
          }
          case 'home':
            if (isLocalHuman(e.color)) playEvent('home');
            burst('🏠 GHAR PAHUNCH GAYA!', { y: 46, cls: 'gold' });
            break;
          case 'near-win':
            playEvent('nearWin');
            sticker('😱', isMe(e.color) ? 'BAS EK AUR!' : 'KHATRA!', { y: 44 });
            break;
          default: break;
        }
      }
    }

    /* ----------------------------- local flow --------------------------- */
    async function doRoll() {
      playEvent('dice');
      diceBtn.disabled = true;
      diceFace(rnd6(), true);
      await sleep(550);
      const v = rnd6();
      diceFace(v);
      const r = L.roll(game, v);
      game = r.state;
      log(`${playerMeta(r.events[0].color).name} rolled ${v}`);
      effects(r.events);
      render();
      await sleep(250);
    }

    async function doMove(t) {
      const cur = L.currentPlayer(game);
      const from = cur.tokens[t];
      const r = L.move(game, t);
      setMovable(null);
      await animateMove(cur.color, t, from, r.state.players.find((p) => p.color === cur.color)?.tokens[t] ?? L.FINISH);
      game = r.state;
      effects(r.events);
      render();
      await sleep(200);
    }

    function waitFor(kind) { return new Promise((res) => { waiters[kind] = res; }); }

    async function localLoop() {
      while (alive && game.phase !== 'over') {
        const cur = L.currentPlayer(game);
        updateControls();
        if (cur.type === 'ai') {
          await sleep(650);
          if (!alive) return;
          await doRoll();
          if (game.phase === 'move') {
            await sleep(450);
            await doMove(L.chooseMove(game, cur.ai || params.ai || 'medium'));
          }
          continue;
        }
        await waitFor('roll');
        if (!alive) return;
        await doRoll();
        if (game.phase === 'move') {
          const moves = L.legalMoves(game);
          const p = L.currentPlayer(game);
          const same = moves.every((i) => p.tokens[i] === p.tokens[moves[0]]);
          let t;
          if (moves.length === 1 || same) { await sleep(300); t = moves[0]; } else { updateControls(); t = await waitFor('pick'); }
          if (!alive) return;
          await doMove(t);
        }
      }
      if (alive) finishLocal();
    }

    async function finishLocal() {
      finished = true;
      updateControls();
      const winner = game.winner;
      const myColor = params.players.find((p) => p.me)?.color;
      const win = winner === myColor;
      const wName = playerMeta(winner).name;
      playEvent(win || mode === 'local' ? 'victory' : 'defeat');
      if (!win && mode !== 'local') sticker('😭', 'AGLI BAAR PAKKA!', { sad: true });
      const result = win ? 'win' : 'loss';
      const rec = recordMatch({
        game: 'ludo', mode: mode === 'tournament' ? 'tournament' : mode, result, ai: mode === 'local' ? null : params.ai,
        opponents: params.players.filter((p) => !p.me).map((p) => p.name), captures: stats.captures, sixes: stats.sixes,
      });
      if (mode === 'tournament') {
        const { tournamentMatchFinished } = await import('./tournament.js');
        tournamentMatchFinished(win);
        await resultOverlay({ win, title: win ? 'ROUND WON!' : 'KNOCKED OUT', subtitle: `${wName} wins`, rewards: rec, buttons: [{ label: 'Back to Stadium', value: 'go', kind: 'gold' }] });
        go('tournament', {}, { replace: true });
        return;
      }
      const v = await resultOverlay({
        win: win || mode === 'local', title: mode === 'local' ? `${wName.toUpperCase()} WINS!` : win ? 'YOU WIN!' : 'YOU LOST',
        subtitle: win ? 'Apna time aa gaya! 🔥' : mode === 'local' ? 'Pass & Play champion' : 'Koi baat nahi, agli baar pakka!',
        rewards: rec,
        buttons: [{ label: '🔁 Play Again', value: 'again', kind: 'primary' }, { label: '🏠 Home', value: 'home' }],
      });
      if (v === 'again') go('ludo', params, { replace: true }); else go('home', {}, { replace: true });
    }

    /* ----------------------------- online flow -------------------------- */
    let lastSeq = -1;
    let timeoutSentFor = null;
    let timerInt = null;
    let serverOffset = 0;
    const recorded = new Set();

    async function onRoom(r, err) {
      if (!alive) return;
      if (err || !r) { toast('Room closed', 'error'); go('friends', {}, { replace: true }); return; }
      const prevGame = game;
      room = r;
      me = r.players?.[net.currentUser().uid]?.color;
      if (!r.state) return;
      const next = r.state;
      // Firebase drops nulls: normalise
      next.dice = next.dice ?? null;
      next.winner = next.winner ?? null;
      if (!prevGame) {
        game = next;
        await buildSprites(game.players);
        render();
      } else {
        const evs = r.lastEvents?.seq > lastSeq ? (r.lastEvents.list || []) : [];
        await animating;
        animating = (async () => {
          const mv = evs.find((e) => e.type === 'move' || e.type === 'unlock');
          const roll = evs.find((e) => e.type === 'roll');
          if (roll) { playEvent('dice'); diceFace(roll.value, true); await sleep(450); diceFace(roll.value); }
          if (mv) {
            game = { ...prevGame, players: prevGame.players };
            await animateMove(mv.color, mv.token, mv.from, mv.to);
          }
          game = next;
          effects(evs);
          render();
        })();
        await animating;
      }
      if (r.lastEvents?.seq != null) lastSeq = r.lastEvents.seq;
      if (r.status === 'over' && !recorded.has(r.code)) {
        recorded.add(r.code);
        finished = true;
        updateControls();
        const uid = net.currentUser().uid;
        const win = r.result?.winnerUid === uid;
        playEvent(win ? 'victory' : 'defeat');
        const rw = rewardsFor(r.result, uid, 'ludo');
        const rec = recordMatch({ game: 'ludo', mode: r.friends ? 'online-friends' : 'online', result: win ? 'win' : 'loss', captures: stats.captures, sixes: stats.sixes, serverRewarded: true,
          opponents: Object.values(r.players).filter((p) => p.color !== me).map((p) => p.name) });
        const winnerName = r.players?.[r.result?.winnerUid]?.name || 'Someone';
        const v = await resultOverlay({
          win, title: win ? 'YOU WIN!' : 'YOU LOST', subtitle: win ? 'Online champion! 🔥' : `${winnerName} wins (${r.result?.reason || 'finished'})`,
          rewards: { ...rw, achievements: rec.achievements },
          buttons: [{ label: '🔁 Back to Room', value: 'room', kind: 'primary' }, { label: '🏠 Home', value: 'home' }],
        });
        if (v === 'room') go('room', { code: r.code }, { replace: true }); else go('home', {}, { replace: true });
      }
    }

    function onlineTimer() {
      const span = root.querySelector('.turn-timer');
      if (!room || room.status !== 'playing') return;
      const left = Math.max(0, Math.ceil((room.turnDeadline - (Date.now() + serverOffset)) / 1000));
      if (span) span.textContent = `⏱ ${left}s`;
      if (left <= 0 && timeoutSentFor !== room.turnDeadline && Date.now() + serverOffset > room.turnDeadline + 1500) {
        timeoutSentFor = room.turnDeadline;
        net.sendIntent(room.code, { type: 'timeout' }).catch(() => {});
      }
    }

    /* ------------------------------- actions ---------------------------- */
    const unbind = bindActions(root, {
      leave: () => back(),
      mute: (b) => {
        store.update((s) => { s.settings.sfx = !s.settings.sfx; });
        b.textContent = store.get().settings.sfx ? '🔊' : '🔇';
      },
      roll: () => {
        if (isOnline) {
          diceBtn.disabled = true;
          net.sendIntent(room.code, { type: 'roll' }).catch((e) => toast(e.message, 'error'));
          return;
        }
        waiters.roll?.(); waiters.roll = null;
      },
      react: (b) => {
        const [emo, snd] = QUICK_REACTIONS[Number(b.dataset.i)];
        bumpMission('reactions');
        if (isOnline) { net.sendReaction(room.code, emo, snd).catch(() => {}); return; }
        playSound(snd);
        burst(emo, { x: 30 + Math.random() * 40, y: 60, big: true });
      },
      chat: async () => {
        const { openRoomChat } = await import('./room.js');
        openRoomChat(room.code);
      },
    });

    boardEl.addEventListener('click', (e) => {
      const tk = e.target.closest('.token.movable');
      if (!tk) return;
      const idx = Number(tk.dataset.idx);
      setMovable(null);
      if (isOnline) { net.sendIntent(room.code, { type: 'move', token: idx }).catch((er) => toast(er.message, 'error')); return; }
      waiters.pick?.(idx); waiters.pick = null;
    });

    /* -------------------------------- start ----------------------------- */
    const offs = [];
    if (isOnline) {
      net = await import('../net/online.js');
      await net.requireUser();
      offs.push(net.serverTimeOffset((o) => { serverOffset = o; }));
      offs.push(net.watchRoom(params.code, onRoom));
      offs.push(net.watchReactions(params.code, (rx) => {
        playSound(rx.sound);
        const p = room?.players?.[rx.uid];
        if (p && store.get().blocked.includes(rx.uid)) return;
        const pos = p ? cardPos(p.color) : { x: 50, y: 50 };
        burst(rx.emoji, { x: pos.x, y: pos.y, big: true });
      }));
      let wasConnected = true;
      offs.push(net.watchConnection((c) => {
        if (!c && wasConnected) toast('📴 Connection lost — reconnecting…', 'error', 4000);
        if (c && !wasConnected) toast('✅ Reconnected', 'success');
        wasConnected = c;
      }));
      timerInt = setInterval(onlineTimer, 500);
    } else {
      game = L.createGame({ players: params.players.map((p) => ({ name: p.name, color: p.color, type: p.type })) });
      await buildSprites(params.players);
      render();
      log(`${playerMeta(L.currentPlayer(game).color).name} starts. Roll a 6 to unlock!`);
      localLoop();
    }

    return {
      cleanup() {
        alive = false;
        waiters.roll?.(); waiters.pick?.(-1);
        clearInterval(timerInt);
        offs.forEach((f) => f && f());
        unbind();
      },
      async canLeave() {
        if (finished || !game || game.phase === 'over') return true;
        const ok = await confirmBox('Leave match?', isOnline ? 'You will forfeit this online match.' : 'Your progress in this match will be lost.', 'Leave', 'Stay');
        if (ok && isOnline && room?.status === 'playing') net.sendIntent(room.code, { type: 'resign' }).catch(() => {});
        return ok;
      },
    };
  },
};
