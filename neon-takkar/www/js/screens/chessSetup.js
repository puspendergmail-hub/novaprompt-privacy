import { store } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, esc } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import * as online from '../net/online.js';
import { cleanName } from '../engine/moderation.js';

export default {
  nav: null,
  render(root) {
    const cfg = { mode: 'ai', ai: 'medium', side: 'w', minutes: 0, names: [store.get().name, 'Player 2'] };
    const draw = () => {
      root.innerHTML = `${topbar('NEON CHESS')}
        <div class="tabs">
          ${[['ai', '🤖 vs Computer'], ['local', '📱 Pass & Play'], ['online', '🌐 Online']].map(([m, l]) =>
            `<button class="tab ${cfg.mode === m ? 'active' : ''}" data-action="mode" data-v="${m}">${l}</button>`).join('')}
        </div>
        ${cfg.mode !== 'online' ? `<div class="glass card">
          ${cfg.mode === 'ai' ? `
            <div class="section-title" style="margin-top:0">Difficulty</div>
            <div class="grid3">${['easy', 'medium', 'hard'].map((l) => `<button class="btn ${cfg.ai === l ? 'pink' : 'ghost'}" data-action="ai" data-v="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>
            <div class="section-title">Play as</div>
            <div class="grid3">${[['w', '♔ White'], ['b', '♚ Black'], ['r', '🎲 Random']].map(([v, l]) => `<button class="btn ${cfg.side === v ? 'blue' : 'ghost'}" data-action="side" data-v="${v}">${l}</button>`).join('')}</div>
          ` : `
            <div class="section-title" style="margin-top:0">Players (same phone)</div>
            <label class="field"><span>♔ White</span><input class="input" data-name="0" maxlength="16" value="${esc(cfg.names[0])}"></label>
            <label class="field"><span>♚ Black</span><input class="input" data-name="1" maxlength="16" value="${esc(cfg.names[1])}"></label>
          `}
          <div class="section-title">Chess timer</div>
          <div class="grid4">${[[0, 'Off'], [3, '3 min'], [5, '5 min'], [10, '10 min']].map(([v, l]) => `<button class="btn sm ${cfg.minutes === v ? 'gold' : 'ghost'}" data-action="min" data-v="${v}">${l}</button>`).join('')}</div>
        </div>
        <button class="btn gold block" data-action="start" style="font-size:20px">▶ Start Match</button>`
        : `<div class="glass card">${online.configured ? `
            <p>Challenge a friend to Neon Chess with a shared server clock. All moves are validated on the server.</p>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn primary" data-action="go" data-route="friends" data-params='{"create":"chess"}'>➕ Create Private Room</button>
              <button class="btn blue" data-action="go" data-route="friends" data-params='{"join":true}'>🔑 Join with Room Code</button>
              <button class="btn pink" data-action="go" data-route="friends" data-params='{"quick":"chess"}'>⚡ Quick Match</button>
            </div>` : `<p><b>Online play isn't configured in this build.</b></p>
            <p class="small muted">Add a Firebase project (README → Firebase setup) to enable online chess. Pass & Play and vs Computer work offline.</p>`}</div>`}`;
    };
    draw();
    const readNames = () => root.querySelectorAll('[data-name]').forEach((i) => { cfg.names[Number(i.dataset.name)] = i.value; });
    return bindActions(root, {
      ...commonActions,
      mode: (b) => { readNames(); cfg.mode = b.dataset.v; draw(); },
      ai: (b) => { cfg.ai = b.dataset.v; draw(); },
      side: (b) => { cfg.side = b.dataset.v; draw(); },
      min: (b) => { readNames(); cfg.minutes = Number(b.dataset.v); draw(); },
      start: () => {
        readNames();
        const side = cfg.side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : cfg.side;
        go('chess', {
          mode: cfg.mode, ai: cfg.ai, side, minutes: cfg.minutes,
          names: cfg.mode === 'local' ? cfg.names.map((n, i) => cleanName(n || `Player ${i + 1}`)) : null,
        });
      },
    });
  },
};
