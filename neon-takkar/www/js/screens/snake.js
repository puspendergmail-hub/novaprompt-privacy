/** Neon Snake — classic & portal modes, 3 speeds, swipe / D-pad / keyboard controls. */
import * as S from '../engine/snake.js';
import { store, recordSnake } from '../core/store.js';
import { back, go } from '../core/router.js';
import { bindActions, burst, toast, confirmBox, $ } from '../core/dom.js';
import { resultOverlay } from '../core/ui.js';
import { playSound, playEvent, vibrate } from '../core/audio.js';
import { sayDialogue } from '../core/dialogues.js';
import { ITEM } from '../core/catalog.js';

const GRID = 18;

// roundRect polyfill for older Android WebViews
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr); this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr); this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}
const MODES = [['classic', '🧱 Classic', 'Walls are deadly'], ['portal', '🌀 Portal', 'Walls wrap around']];
const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard + blocks']];

export default {
  nav: null,
  render(root, params) {
    const cfg = { mode: params.mode || 'classic', level: params.level || 'medium' };
    let game = null;
    let timer = null;
    let paused = false;
    let alive = true;
    let running = false;
    let foodEaten = 0;
    let lastDangerTalk = 0;

    const s0 = store.get();
    const headColor = s0.gotiColor || '#00D9FF';
    const face = ITEM[s0.equipped.skin]?.face || '😎';

    const menuHTML = () => {
      const best = store.get().stats.snake.best;
      return `
      <div class="game-top">
        <button class="icon-btn" data-action="leave" aria-label="Back">‹</button>
        <div class="game-title">NEON SNAKE<small>KHAO • BADHO • BACHO</small></div>
        <button class="icon-btn" data-action="mute">${store.get().settings.sfx ? '🔊' : '🔇'}</button>
      </div>
      <div class="glass card center">
        <div style="font-size:64px;line-height:1;animation:bob 2s ease-in-out infinite">🐍</div>
        <p class="small muted">Eat desi snacks 🍕🥭🥟, grab golden coins 🪙 for +5, and don't bite yourself!</p>
        <div class="row" style="justify-content:center;gap:8px"><span class="chip">🧱 Best: ${best.classic || 0}</span><span class="chip">🌀 Best: ${best.portal || 0}</span></div>
      </div>
      <div class="section-title">Mode</div>
      <div class="grid2">${MODES.map(([id, l, d]) => `<button class="btn ${cfg.mode === id ? 'primary' : 'ghost'}" data-action="mode" data-v="${id}" style="flex-direction:column;gap:0">${l}<span class="small" style="font-weight:500;opacity:.8">${d}</span></button>`).join('')}</div>
      <div class="section-title">Speed</div>
      <div class="grid3">${LEVELS.map(([id, l]) => `<button class="btn ${cfg.level === id ? 'pink' : 'ghost'}" data-action="level" data-v="${id}">${l}</button>`).join('')}</div>
      <button class="btn gold block" data-action="start" style="font-size:20px;margin-top:16px">▶ Start Snake</button>
      <p class="small muted center">Swipe on the board, use the arrow pad, or keyboard arrows / WASD.</p>`;
    };

    const gameHTML = () => `
      <div class="game-top">
        <button class="icon-btn" data-action="leave" aria-label="Back">‹</button>
        <div class="game-title">NEON SNAKE<small>${cfg.mode === 'portal' ? 'PORTAL' : 'CLASSIC'} • ${cfg.level.toUpperCase()}</small></div>
        <button class="icon-btn" data-action="pause" aria-label="Pause">⏸</button>
      </div>
      <div class="snake-hud glass">
        <div><span class="muted small">SCORE</span><b id="sc">0</b></div>
        <div><span class="muted small">BEST</span><b id="best">${store.get().stats.snake.best[cfg.mode] || 0}</b></div>
        <div><span class="muted small">LENGTH</span><b id="len">3</b></div>
      </div>
      <div class="snake-wrap"><canvas id="cv" width="720" height="720" aria-label="Snake board"></canvas>
        <div class="snake-pause hidden" id="pz"><b>⏸ PAUSED</b><button class="btn gold" data-action="pause">▶ Resume</button></div></div>
      <div class="dpad">
        <span></span><button data-dir="up" aria-label="Up">▲</button><span></span>
        <button data-dir="left" aria-label="Left">◀</button><button data-dir="down" aria-label="Down">▼</button><button data-dir="right" aria-label="Right">▶</button>
      </div>`;

    const showMenu = () => { running = false; root.innerHTML = menuHTML(); };

    /* ------------------------------ render ------------------------------ */
    function draw() {
      const cv = $('#cv', root);
      if (!cv || !game) return;
      const g = cv.getContext('2d');
      const N = cv.width, c = N / GRID;
      const low = document.body.classList.contains('gfx-low');
      g.clearRect(0, 0, N, N);
      g.fillStyle = '#0b0a24'; g.fillRect(0, 0, N, N);
      g.strokeStyle = 'rgba(155,77,255,.12)'; g.lineWidth = 1;
      for (let i = 1; i < GRID; i++) {
        g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, N); g.stroke();
        g.beginPath(); g.moveTo(0, i * c); g.lineTo(N, i * c); g.stroke();
      }
      if (cfg.mode === 'classic') { g.strokeStyle = '#FF38B8'; g.lineWidth = 6; if (!low) { g.shadowColor = '#FF38B8'; g.shadowBlur = 14; } g.strokeRect(3, 3, N - 6, N - 6); g.shadowBlur = 0; }
      // obstacles
      for (const o of game.obstacles) {
        g.fillStyle = '#3a2a8e'; g.strokeStyle = '#9B4DFF'; g.lineWidth = 3;
        g.beginPath(); g.roundRect(o.x * c + 3, o.y * c + 3, c - 6, c - 6, 6); g.fill(); g.stroke();
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${c * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      if (game.food) g.fillText(game.food.emoji, game.food.x * c + c / 2, game.food.y * c + c / 2 + 2);
      if (game.golden) {
        const pulse = 1 + Math.sin(Date.now() / 120) * 0.12;
        g.save(); g.translate(game.golden.x * c + c / 2, game.golden.y * c + c / 2); g.scale(pulse, pulse);
        if (!low) { g.shadowColor = '#FFC94A'; g.shadowBlur = 20; }
        g.fillText('🪙', 0, 2); g.restore();
      }
      // snake body (tail → head)
      const n = game.snake.length;
      for (let i = n - 1; i >= 0; i--) {
        const p = game.snake[i];
        const t = i / Math.max(1, n - 1);
        g.fillStyle = i === 0 ? headColor : `hsl(${270 - t * 80}, 95%, ${62 - t * 18}%)`;
        if (!low && i < 3) { g.shadowColor = headColor; g.shadowBlur = 16; }
        const pad = i === 0 ? 1 : 3 + t * 3;
        g.beginPath(); g.roundRect(p.x * c + pad, p.y * c + pad, c - pad * 2, c - pad * 2, c * 0.35); g.fill();
        g.shadowBlur = 0;
      }
      const h = game.snake[0];
      g.font = `${c * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.fillText(face, h.x * c + c / 2, h.y * c + c / 2 + 2);
      $('#sc', root).textContent = game.score;
      $('#len', root).textContent = game.snake.length;
    }

    /* ------------------------------- loop -------------------------------- */
    function schedule() {
      clearTimeout(timer);
      if (!alive || !running || paused || game.over) return;
      timer = setTimeout(tick, S.interval(game) * (window.__speed ?? 1));
    }

    function tick() {
      const r = S.step(game);
      game = r.state;
      for (const e of r.events) {
        if (e.type === 'eat') { foodEaten++; playSound('pop'); vibrate(10); }
        if (e.type === 'golden') { playSound('kya_baat'); burst('+5 🪙', { y: 40, cls: 'gold' }); vibrate(40); }
        if (e.type === 'golden-spawn') playSound('chakka');
        if (e.type === 'speed-up') toast('⚡ Speed badh gayi!', 'info', 1200);
        if (e.type === 'portal') playSound('whoosh');
      }
      if (!game.over && game.snake.length > 8 && S.dangerAhead(game) === 1 && Date.now() - lastDangerTalk > 15000) {
        lastDangerTalk = Date.now();
        sayDialogue('lowHealth', { chance: 0.35 });
      }
      draw();
      if (game.over) { finish(); return; }
      schedule();
    }

    async function finish() {
      running = false;
      vibrate(120);
      playEvent('defeat');
      const rewards = S.snakeRewards(game.score);
      const rec = recordSnake({ score: game.score, food: foodEaten, mode: cfg.mode, level: cfg.level, rewards });
      sayDialogue(rec.newBest ? 'win' : 'lose', { force: true, delay: 900 });
      const reasons = { wall: 'Deewar se takra gaye 🧱', self: 'Khud ko hi kaat liya 🐍', obstacle: 'Block se takkar 💥', perfect: 'Poora board bhar diya! 🤯' };
      const v = await resultOverlay({
        win: rec.newBest || game.reason === 'perfect',
        title: rec.newBest ? 'NEW BEST!' : 'GAME OVER',
        subtitle: `Score ${game.score} · ${reasons[game.reason] || ''}`,
        rewards: rec,
        buttons: [{ label: '🔁 Play Again', value: 'again', kind: 'primary' }, { label: '⚙️ Change Mode', value: 'menu' }, { label: '🏠 Home', value: 'home' }],
      });
      if (!alive) return;
      if (v === 'again') start();
      else if (v === 'menu') showMenu();
      else go('home', {}, { replace: true });
    }

    function start() {
      game = S.createSnake({ w: GRID, h: GRID, mode: cfg.mode, level: cfg.level });
      foodEaten = 0; paused = false; running = true;
      root.innerHTML = gameHTML();
      setupSwipe();
      draw();
      sayDialogue(cfg.level === 'hard' ? 'boss' : 'start', { force: true });
      clearTimeout(timer);
      countdown(3);
    }

    /** 3-2-1-GO before the snake starts moving. */
    function countdown(n) {
      const pz = $('#pz', root);
      if (!alive || !running || !pz) return;
      if (n === 0) { pz.classList.add('hidden'); pz.innerHTML = '<b>⏸ PAUSED</b><button class="btn gold" data-action="pause">▶ Resume</button>'; schedule(); return; }
      pz.classList.remove('hidden');
      pz.innerHTML = `<b style="font-size:64px;color:var(--gold)">${n}</b><span class="small">Swipe or use the arrows</span>`;
      playSound('tick');
      timer = setTimeout(() => countdown(n - 1), 550 * (window.__speed ?? 1));
    }

    function setPaused(p) {
      if (!running || game.over) return;
      paused = p;
      $('#pz', root)?.classList.toggle('hidden', !p);
      if (!p) schedule(); else clearTimeout(timer);
    }

    const steer = (dir) => { if (running && !paused && game && !game.over) game = S.turn(game, dir); };

    function setupSwipe() {
      const cv = $('#cv', root);
      let sx = 0, sy = 0, tracking = false;
      cv.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; tracking = true; });
      cv.addEventListener('pointermove', (e) => {
        if (!tracking) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
        steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        sx = e.clientX; sy = e.clientY;
      });
      const end = () => { tracking = false; };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.style.touchAction = 'none';
    }

    const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
    const onKey = (e) => {
      if (KEYS[e.key]) { e.preventDefault(); steer(KEYS[e.key]); }
      if (e.key === ' ' || e.key === 'p') setPaused(!paused);
    };
    window.addEventListener('keydown', onKey);
    const onVis = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onVis);
    root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-dir]');
      if (b) { e.preventDefault(); steer(b.dataset.dir); vibrate(8); }
    });

    showMenu();
    if (params.autostart) start();

    const unbind = bindActions(root, {
      leave: () => back(),
      mute: (b) => { store.update((s) => { s.settings.sfx = !s.settings.sfx; }); b.textContent = store.get().settings.sfx ? '🔊' : '🔇'; },
      mode: (b) => { cfg.mode = b.dataset.v; showMenu(); },
      level: (b) => { cfg.level = b.dataset.v; showMenu(); },
      start: () => start(),
      pause: () => setPaused(!paused),
    });

    return {
      cleanup() {
        alive = false; clearTimeout(timer); unbind();
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVis);
      },
      async canLeave() {
        if (!running || !game || game.over) return true;
        setPaused(true);
        const ok = await confirmBox('Quit Snake?', `Your score of ${game.score} will be lost.`, 'Quit', 'Keep playing');
        if (!ok) setPaused(false);
        return ok;
      },
    };
  },
};

