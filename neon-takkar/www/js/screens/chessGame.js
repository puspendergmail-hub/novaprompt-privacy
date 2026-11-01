/**
 * Neon Chess match screen: vs computer, pass & play, tournament and online.
 */
import * as C from '../engine/chess.js';
import { store, recordMatch, bumpMission } from '../core/store.js';
import { back, go } from '../core/router.js';
import { bindActions, toast, burst, confirmBox, modal, esc, $ } from '../core/dom.js';
import { sticker, resultOverlay } from '../core/ui.js';
import { playEvent, playSound, vibrate } from '../core/audio.js';
import { avatarHTML } from '../core/sprites.js';
import { rewardsFor } from '../engine/room.js';
import { sayDialogue } from '../core/dialogues.js';

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VS = '︎'; // force text (non-emoji) presentation
export const PIECE_NAMES = {
  pieces_neon: { k: 'Neon King', q: 'Neon Queen', r: 'Custom Rook', b: 'Custom Bishop', n: 'Warrior Knight', p: 'Custom Pawn' },
  pieces_warrior: { k: 'Warrior King', q: 'Warrior Queen', r: 'Fort Rook', b: 'Monk Bishop', n: 'Warrior Knight', p: 'Sipahi Pawn' },
  pieces_gold: { k: 'Golden King', q: 'Golden Queen', r: 'Golden Rook', b: 'Golden Bishop', n: 'Golden Knight', p: 'Golden Pawn' },
};
// window.__speed lets automated UI tests fast-forward animations.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (window.__speed ?? 1)));
const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

let worker = null;
let reqId = 0;
function aiMove(state, level) {
  return new Promise((resolve) => {
    const fallback = () => setTimeout(() => resolve(C.chooseMove(state, level)), 20);
    try {
      if (!worker) worker = new Worker(new URL('../engine/chessWorker.js', import.meta.url), { type: 'module' });
      const id = ++reqId;
      const onMsg = (e) => { if (e.data.id === id) { worker.removeEventListener('message', onMsg); resolve(e.data.move); } };
      worker.addEventListener('message', onMsg);
      worker.onerror = () => { worker = null; fallback(); };
      worker.postMessage({ id, state: C.serialize(state), level });
    } catch { fallback(); }
  });
}

export default {
  nav: null,
  async render(root, params) {
    const mode = params.mode || 'ai';
    const isOnline = mode === 'online';
    const s0 = store.get();
    const boardTheme = s0.equipped.board_chess.replace('chess_', 'chess-');
    const pieceSet = s0.equipped.chess_pieces;
    let game = C.createGame();
    let mySide = mode === 'ai' || mode === 'tournament' ? params.side || 'w' : 'w';
    let flipped = mySide === 'b';
    let selected = null;
    let targets = [];
    let hint = null;
    let thinking = false;
    let finished = false;
    let alive = true;
    let clocks = params.minutes ? { w: params.minutes * 60000, b: params.minutes * 60000 } : null;
    let lastTick = Date.now();
    let started = false;
    let room = null; let net = null; let serverOffset = 0; let flagSentFor = null;
    let captures = 0;
    let lowTalked = false;
    const recorded = new Set();

    const names = () => {
      if (isOnline && room) {
        const by = (c) => Object.values(room.players || {}).find((p) => p.color === c) || {};
        return { w: by('w').name || 'White', b: by('b').name || 'Black', wa: by('w').avatar, ba: by('b').avatar };
      }
      if (mode === 'local') return { w: params.names?.[0] || 'White', b: params.names?.[1] || 'Black' };
      const ai = `🤖 ${params.ai || 'medium'} AI`;
      return mySide === 'w' ? { w: s0.name, b: ai } : { w: ai, b: s0.name };
    };

    root.innerHTML = `
      <div class="game-top">
        <button class="icon-btn" data-action="leave" aria-label="Back">‹</button>
        <div class="game-title">NEON CHESS<small>CHECKMATE IS THE GOAL!</small></div>
        <button class="icon-btn" data-action="mute">${s0.settings.sfx ? '🔊' : '🔇'}</button>
      </div>
      <div class="chess-meta" id="top-meta"></div>
      <div class="captured" id="cap-top"></div>
      <div class="chess-board ${boardTheme} ${pieceSet}" id="board"></div>
      <div class="captured" id="cap-bot"></div>
      <div class="chess-meta" id="bot-meta"></div>
      <div class="small muted center" id="status"></div>
      <div class="moves glass" id="moves"></div>
      <div class="tool-row">
        <button class="tool glass" data-action="undo" ${isOnline || mode === 'tournament' ? 'disabled' : ''}><span class="ic">↶</span>Undo</button>
        <button class="tool glass" data-action="hint" ${isOnline || mode === 'tournament' ? 'disabled' : ''}><span class="ic">💡</span>Hint</button>
        <button class="tool glass" data-action="chat"><span class="ic">💬</span>${isOnline ? 'Chat' : 'React'}</button>
        <button class="tool glass" data-action="resign"><span class="ic">🏳️</span>Resign</button>
      </div>`;
    const boardEl = $('#board', root);

    function sideInfoHTML(color) {
      const n = names();
      const isMine = (isOnline || mode !== 'local') && color === mySide;
      const av = isMine ? avatarHTML(null, 36) : avatarHTML({ avatar: (color === 'w' ? n.wa : n.ba) || (mode === 'ai' || mode === 'tournament' ? '🤖' : color === 'w' ? '♔' : '♚') }, 36);
      const active = game.turn === color && !finished;
      const ms = clocks ? (active && started ? clocks[color] - (isOnline ? 0 : Date.now() - lastTick) : clocks[color]) : null;
      return `<div class="row grow">${av}<div class="grow" style="min-width:0"><div class="pname ellipsis" style="font-weight:800">${esc(color === 'w' ? n.w : n.b)}</div>
        <div class="small muted">${color === 'w' ? 'White' : 'Black'}${active ? ' · to move' : ''}</div></div></div>
        ${clocks ? `<div class="clock ${active ? 'active' : ''} ${ms != null && ms < 20000 ? 'low' : ''}" data-clock="${color}">${fmtClock(ms)}</div>` : ''}`;
    }

    function capturedHTML(color) {
      const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
      const have = { p: 0, n: 0, b: 0, r: 0, q: 0 };
      game.board.forEach((p) => { if (p && C.colorOf(p) === color && p.toLowerCase() !== 'k') have[p.toLowerCase()]++; });
      return Object.keys(start).map((t) => `<span class="pc ${color}" style="font-size:18px">${(GLYPH[t] + VS).repeat(Math.max(0, start[t] - have[t]))}</span>`).join('');
    }

    function render(animateFrom = null, animateTo = null) {
      const st = C.status(game);
      const kingSq = st.check ? C.kingSquare(game.board, game.turn) : -1;
      const last = game.history[game.history.length - 1];
      const order = [...Array(64).keys()];
      if (flipped) order.reverse();
      boardEl.innerHTML = order.map((sq) => {
        const r = Math.floor(sq / 8), c = sq % 8;
        const p = game.board[sq];
        const cls = ['sq', (r + c) % 2 ? 'dark' : 'light'];
        if (sq === selected) cls.push('sel');
        if (last && (sq === last.from || sq === last.to)) cls.push('last');
        if (sq === kingSq) cls.push('check');
        if (hint && (sq === hint.from || sq === hint.to)) cls.push('hint');
        const tgt = targets.find((m) => m.to === sq);
        const coordLbl = (flipped ? r === 0 : r === 7) ? `<span class="coord">${'abcdefgh'[c]}</span>` : '';
        return `<div class="${cls.join(' ')}" data-sq="${sq}">${p ? `<span class="pc ${C.colorOf(p)}">${GLYPH[p.toLowerCase()]}${VS}</span>` : ''}${tgt ? `<span class="dot ${p || tgt.flag === 'ep' ? 'cap' : ''}"></span>` : ''}${coordLbl}</div>`;
      }).join('');
      const top = flipped ? 'w' : 'b';
      const bot = flipped ? 'b' : 'w';
      $('#top-meta', root).innerHTML = sideInfoHTML(top);
      $('#bot-meta', root).innerHTML = sideInfoHTML(bot);
      $('#cap-top', root).innerHTML = capturedHTML(bot);
      $('#cap-bot', root).innerHTML = capturedHTML(top);
      const mv = $('#moves', root);
      mv.innerHTML = game.history.length ? game.history.map((h, i) => `${i % 2 === 0 ? `<span><b>${i / 2 + 1}.</b>` : '<span>'}${esc(h.san)}</span>`).join('') : '<span class="muted">Move history will appear here</span>';
      mv.scrollTop = mv.scrollHeight;
      const status = $('#status', root);
      const sel = selected != null ? game.board[selected] : null;
      status.textContent = finished ? '' : sel ? `Selected: ${PIECE_NAMES[pieceSet]?.[sel.toLowerCase()] || ''}` : st.check ? 'Check! ⚠️' : thinking ? 'Computer is thinking… 🤔' : '';
      if (animateFrom != null && animateTo != null && store.get().settings.gfx !== 'low') {
        const a = boardEl.querySelector(`[data-sq="${animateFrom}"]`)?.getBoundingClientRect();
        const bEl = boardEl.querySelector(`[data-sq="${animateTo}"] .pc`);
        const b = boardEl.querySelector(`[data-sq="${animateTo}"]`)?.getBoundingClientRect();
        if (a && b && bEl?.animate) bEl.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(1.15)` }, { transform: 'none' }], { duration: 230, easing: 'ease-out' });
      }
    }

    function canInteract() {
      if (finished || thinking) return false;
      if (isOnline) return room?.status === 'playing' && game.turn === mySide;
      if (mode === 'local') return true;
      return game.turn === mySide;
    }

    function handleEvents(events, byMe) {
      for (const e of events) {
        if (e.type === 'capture') {
          if (byMe) { captures++; bumpMission('chess_captures'); }
          playEvent('chessCapture');
          const myPiece = mode === 'local' || C.colorOf(e.piece) === mySide;
          if (!lowTalked && myPiece && ['q', 'r'].includes(e.piece.toLowerCase())) { lowTalked = true; sayDialogue('lowHealth', { chance: 0.8, delay: 600 }); }
          if (byMe || mode === 'local') burst(['😎 OYE!', '💥 KHATAM!', '😂 GAYA!'][Math.floor(Math.random() * 3)], { y: 40 });
        } else if (e.type === 'promotion') { burst('👑 PROMOTED!', { y: 44, cls: 'gold' }); playSound('kya_baat'); }
        else if (e.type === 'castle') playSound('whoosh');
        else if (e.type === 'check') { playEvent('check'); sticker('😨', 'CHECK!', { y: 40 }); vibrate(60); }
        else if (e.type === 'move' && !events.some((x) => x.type === 'capture')) playEvent('move');
      }
    }

    async function choosePromotion(color) {
      const opts = ['q', 'r', 'b', 'n'];
      return modal({
        title: 'Promote pawn',
        body: `<p class="center muted">Choose your new piece</p>`,
        buttons: opts.map((o) => ({ label: GLYPH[o] + VS, value: o, kind: 'primary' })),
        dismissible: false,
        className: `promo ${color}`,
      });
    }

    async function playMove(req, { fromAI = false } = {}) {
      const before = game;
      let res;
      try { res = C.makeMove(game, req); } catch { return false; }
      if (clocks && started && !isOnline) {
        clocks[before.turn] -= Date.now() - lastTick;
      }
      lastTick = Date.now();
      started = true;
      game = res.state;
      selected = null; targets = []; hint = null;
      render(res.move.from, res.move.to);
      const byMe = mode === 'local' ? true : before.turn === mySide;
      handleEvents(res.events, byMe && !fromAI);
      const st = C.status(game);
      if (st.over) { await sleep(500); finishLocal(st); }
      return true;
    }

    async function maybeAI() {
      if (!alive || finished || isOnline || mode === 'local' || game.turn === mySide) return;
      thinking = true; render();
      const t0 = Date.now();
      const m = await aiMove(game, params.ai || 'medium');
      await sleep(Math.max(0, 450 - (Date.now() - t0)));
      thinking = false;
      if (!alive || finished || !m) return;
      await playMove(m, { fromAI: true });
    }

    async function finishLocal(st, reason = null) {
      if (finished) return;
      finished = true;
      render();
      const winner = st?.winner ?? null;
      const draw = !winner;
      const me = mode === 'local' ? 'w' : mySide;
      const win = winner === me;
      const result = draw ? 'draw' : win ? 'win' : 'loss';
      playEvent(win || (mode === 'local' && !draw) ? 'victory' : draw ? 'move' : 'defeat');
      sayDialogue(win || (mode === 'local' && !draw) ? 'win' : 'lose', { force: true, delay: 1200 });
      const rec = recordMatch({ game: 'chess', mode: mode === 'tournament' ? 'tournament' : mode, result, ai: mode === 'local' ? null : params.ai, captures, opponents: [mode === 'local' ? names().b : 'Computer'] });
      const why = reason || st?.reason || '';
      if (mode === 'tournament') {
        const { tournamentMatchFinished } = await import('./tournament.js');
        tournamentMatchFinished(win);
        await resultOverlay({ win, draw, title: win ? 'ROUND WON!' : draw ? 'DRAW — OUT' : 'KNOCKED OUT', subtitle: why, rewards: rec, buttons: [{ label: 'Back to Stadium', value: 1, kind: 'gold' }] });
        go('tournament', {}, { replace: true });
        return;
      }
      const wName = winner ? (winner === 'w' ? names().w : names().b) : '';
      const v = await resultOverlay({
        win: win || (mode === 'local' && !draw), draw,
        title: draw ? 'DRAW' : mode === 'local' ? `${wName.toUpperCase()} WINS!` : win ? 'CHECKMATE! YOU WIN' : 'YOU LOST',
        subtitle: draw ? `By ${why}` : `${why}${win ? ' — Shatranj ke khiladi! ♛' : ''}`,
        rewards: rec,
        buttons: [{ label: '🔁 Rematch', value: 'again', kind: 'primary' }, { label: '🏠 Home', value: 'home' }],
      });
      if (v === 'again') go('chess', params, { replace: true }); else go('home', {}, { replace: true });
    }

    /* ------------------------------ clicks ------------------------------ */
    boardEl.addEventListener('click', async (e) => {
      const sqEl = e.target.closest('[data-sq]');
      if (!sqEl || !canInteract()) return;
      const sq = Number(sqEl.dataset.sq);
      const p = game.board[sq];
      const tgt = targets.find((m) => m.to === sq);
      if (tgt && selected != null) {
        let promotion;
        if (targets.some((m) => m.to === sq && m.promotion)) promotion = await choosePromotion(game.turn);
        const req = { from: selected, to: sq, promotion };
        if (isOnline) {
          const optimistic = C.makeMove(game, req);
          if (optimistic) {
            selected = null; targets = [];
            net.sendIntent(room.code, { type: 'move', from: C.sqName(req.from), to: C.sqName(req.to), promotion: promotion || null }).catch((er) => toast(er.message, 'error'));
            game = optimistic.state; render(req.from, req.to);
            handleEvents(optimistic.events, true);
          }
          return;
        }
        await playMove(req);
        maybeAI();
        return;
      }
      if (p && C.colorOf(p) === game.turn) {
        selected = sq;
        targets = C.legalMoves(C.clonePos(game)).filter((m) => m.from === sq);
        playSound('tick');
      } else { selected = null; targets = []; }
      render();
    });

    /* ------------------------------ timers ------------------------------ */
    const tick = setInterval(() => {
      if (!alive || finished || !clocks) return;
      let left;
      if (isOnline) {
        if (!room || room.status !== 'playing') return;
        left = room.clocks[game.turn] - (Date.now() + serverOffset - room.clocks.lastTs);
        if (left <= -1500 && flagSentFor !== room.clocks.lastTs) {
          flagSentFor = room.clocks.lastTs;
          net.sendIntent(room.code, { type: 'timeout' }).catch(() => {});
        }
      } else {
        if (!started) return;
        left = clocks[game.turn] - (Date.now() - lastTick);
        if (left <= 0) {
          clocks[game.turn] = 0;
          const winner = game.turn === 'w' ? 'b' : 'w';
          finishLocal({ winner, reason: 'time out' }, 'Lost on time ⏱');
          return;
        }
      }
      if (left < 20000 && !lowTalked && game.turn === mySide && mode !== 'local') { lowTalked = true; sayDialogue('lowHealth', { force: true }); }
      const el = boardEl.parentElement.querySelector(`[data-clock="${game.turn}"]`);
      if (el) { el.textContent = fmtClock(left); el.classList.toggle('low', left < 20000); }
    }, 250);

    /* ------------------------------ online ------------------------------ */
    async function onRoom(r, err) {
      if (!alive) return;
      if (err || !r) { toast('Room closed', 'error'); go('friends', {}, { replace: true }); return; }
      const prevLen = game.history.length;
      room = r;
      const uid = net.currentUser().uid;
      mySide = r.players?.[uid]?.color || 'w';
      flipped = mySide === 'b';
      if (r.clocks) clocks = { w: r.clocks.w, b: r.clocks.b };
      if (r.state) {
        const next = C.deserialize(r.state);
        const lastMove = next.history[next.history.length - 1];
        const opponentMoved = next.history.length > prevLen && lastMove && C.colorOf(lastMove.piece) !== mySide;
        game = next;
        started = true;
        render(opponentMoved ? lastMove.from : null, opponentMoved ? lastMove.to : null);
        if (opponentMoved) {
          const evs = r.lastEvents?.list || [];
          handleEvents(evs.length ? evs : [{ type: 'move' }], false);
        }
      }
      if (r.status === 'over' && !recorded.has(r.code)) {
        recorded.add(r.code);
        finished = true; render();
        const win = r.result?.winnerUid === uid;
        const draw = !!r.result?.draw;
        playEvent(win ? 'victory' : draw ? 'move' : 'defeat');
        sayDialogue(win ? 'win' : 'lose', { force: true, delay: 1200 });
        const rec = recordMatch({ game: 'chess', mode: r.friends ? 'online-friends' : 'online', result: draw ? 'draw' : win ? 'win' : 'loss', captures, serverRewarded: true,
          opponents: Object.values(r.players).filter((p) => p.color !== mySide).map((p) => p.name) });
        const v = await resultOverlay({
          win, draw, title: draw ? 'DRAW' : win ? 'YOU WIN!' : 'YOU LOST', subtitle: r.result?.reason || '',
          rewards: { ...rewardsFor(r.result, uid, 'chess'), achievements: rec.achievements },
          buttons: [{ label: '🔁 Back to Room', value: 'room', kind: 'primary' }, { label: '🏠 Home', value: 'home' }],
        });
        if (v === 'room') go('room', { code: r.code }, { replace: true }); else go('home', {}, { replace: true });
      }
    }

    /* ------------------------------ actions ----------------------------- */
    const unbind = bindActions(root, {
      leave: () => back(),
      mute: (b) => { store.update((s) => { s.settings.sfx = !s.settings.sfx; }); b.textContent = store.get().settings.sfx ? '🔊' : '🔇'; },
      undo: () => {
        if (isOnline || mode === 'tournament' || finished || thinking || !game.history.length) return;
        game = C.undo(game);
        if (mode === 'ai' && game.turn !== mySide && game.history.length) game = C.undo(game);
        if (mode === 'ai' && game.turn !== mySide) { render(); maybeAI(); return; }
        selected = null; targets = []; hint = null; lastTick = Date.now();
        playSound('whoosh');
        render();
      },
      hint: async () => {
        if (isOnline || mode === 'tournament' || finished || thinking || !canInteract()) return;
        thinking = true; render();
        const m = await aiMove(game, 'medium');
        thinking = false;
        hint = m; render();
        if (m) toast(`Try ${PIECE_NAMES[pieceSet][game.board[m.from].toLowerCase()]} → ${C.sqName(m.to)}`);
      },
      chat: async () => {
        bumpMission('reactions');
        if (isOnline) { const { openRoomChat } = await import('./room.js'); openRoomChat(room.code); return; }
        const em = ['😂', '😎', '🔥', '😭'][Math.floor(Math.random() * 4)];
        burst(em, { y: 55, big: true }); playSound(em === '😭' ? 'wah_wah' : 'hahaha');
      },
      resign: async () => {
        if (finished) return;
        if (!(await confirmBox('Resign?', 'Do you really want to give up this game?', 'Resign', 'Keep playing'))) return;
        if (isOnline) { net.sendIntent(room.code, { type: 'resign' }).catch(() => {}); return; }
        const loser = mode === 'local' ? game.turn : mySide;
        finishLocal({ winner: loser === 'w' ? 'b' : 'w', reason: 'resignation' }, 'by resignation');
      },
    });

    const offs = [];
    if (isOnline) {
      net = await import('../net/online.js');
      await net.requireUser();
      offs.push(net.serverTimeOffset((o) => { serverOffset = o; }));
      offs.push(net.watchRoom(params.code, onRoom));
      sayDialogue('start', { force: true, delay: 600 });
      offs.push(net.watchReactions(params.code, (rx) => { playSound(rx.sound); burst(rx.emoji, { y: 45, big: true }); }));
      let was = true;
      offs.push(net.watchConnection((c) => { if (!c && was) toast('📴 Reconnecting…', 'error', 4000); if (c && !was) toast('✅ Reconnected', 'success'); was = c; }));
    } else {
      render();
      sayDialogue(params.ai === 'hard' && mode !== 'local' ? 'boss' : 'start', { force: true, delay: 400 });
      maybeAI();
    }

    return {
      cleanup() { alive = false; clearInterval(tick); offs.forEach((f) => f && f()); unbind(); },
      async canLeave() {
        if (finished || (!isOnline && !game.history.length)) return true;
        const ok = await confirmBox('Leave match?', isOnline ? 'You will forfeit this online match.' : 'This game will be abandoned.', 'Leave', 'Stay');
        if (ok && isOnline && room?.status === 'playing') net.sendIntent(room.code, { type: 'resign' }).catch(() => {});
        return ok;
      },
    };
  },
};
