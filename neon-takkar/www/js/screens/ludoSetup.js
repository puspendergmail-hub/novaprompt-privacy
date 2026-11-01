import { store } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, esc } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { GOTI_COLORS } from '../core/catalog.js';
import * as online from '../net/online.js';
import { cleanName } from '../engine/moderation.js';

const COLOR_ORDER = ['red', 'green', 'yellow', 'blue'];
const AI_NAMES = ['Bot Pappu', 'Bot Chintu', 'Bot Golu', 'Bot Bablu', 'Bot Munna'];

export default {
  nav: null,
  render(root) {
    const s = store.get();
    const cfg = { mode: 'ai', count: 2, ai: 'medium', color: 'red', names: [s.name, 'Player 2', 'Player 3', 'Player 4'], types: ['human', 'human', 'human', 'human'] };
    const draw = () => {
      const colors = cfg.count === 2 ? ['red', 'yellow'] : COLOR_ORDER;
      if (!colors.includes(cfg.color)) cfg.color = colors[0];
      root.innerHTML = `${topbar('MEME LUDO')}
        <div class="tabs">
          ${[['ai', '🤖 vs Computer'], ['local', '📱 Pass & Play'], ['online', '🌐 Online']].map(([m, l]) =>
            `<button class="tab ${cfg.mode === m ? 'active' : ''}" data-action="mode" data-v="${m}">${l}</button>`).join('')}
        </div>
        ${cfg.mode !== 'online' ? `
        <div class="glass card">
          <div class="section-title" style="margin-top:0">Players</div>
          <div class="grid2">
            <button class="btn ${cfg.count === 2 ? 'primary' : 'ghost'}" data-action="count" data-v="2">2 Players</button>
            <button class="btn ${cfg.count === 4 ? 'primary' : 'ghost'}" data-action="count" data-v="4">4 Players</button>
          </div>
          ${cfg.mode === 'ai' ? `
            <div class="section-title">Difficulty</div>
            <div class="grid3">${['easy', 'medium', 'hard'].map((l) => `<button class="btn ${cfg.ai === l ? 'pink' : 'ghost'}" data-action="ai" data-v="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join('')}</div>
            <div class="section-title">Your colour</div>
            <div class="swatches">${colors.map((c) => `<div class="swatch ${cfg.color === c ? 'active' : ''}" data-action="color" data-v="${c}" style="background:${GOTI_COLORS[c]};color:${GOTI_COLORS[c]}" title="${c}"></div>`).join('')}</div>
          ` : `
            <div class="section-title">Who's playing? (same phone, take turns)</div>
            ${colors.map((c, i) => `<div class="row" style="margin-bottom:8px">
              <div class="swatch" style="background:${GOTI_COLORS[c]};color:${GOTI_COLORS[c]};width:28px;height:28px"></div>
              <input class="input grow" data-name="${i}" maxlength="16" value="${esc(cfg.names[i])}">
              <button class="btn sm ${cfg.types[i] === 'ai' ? 'pink' : 'ghost'}" data-action="toggleType" data-v="${i}">${cfg.types[i] === 'ai' ? '🤖 AI' : '🙂 Human'}</button>
            </div>`).join('')}
            <p class="small muted">No internet or login needed. Mix humans and computer players.</p>
          `}
        </div>
        <button class="btn gold block" data-action="start" style="font-size:20px">▶ Start Match</button>
        ` : `
        <div class="glass card">
          ${online.configured ? `
            <p>Play Meme Ludo online with friends in a private room (2 or 4 players), or get matched with another player.</p>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn primary" data-action="go" data-route="friends" data-params='{"create":"ludo"}'>➕ Create Private Room</button>
              <button class="btn blue" data-action="go" data-route="friends" data-params='{"join":true}'>🔑 Join with Room Code</button>
              <button class="btn pink" data-action="go" data-route="friends" data-params='{"quick":"ludo"}'>⚡ Quick Match</button>
            </div>` : `
            <p><b>Online play isn't configured in this build.</b></p>
            <p class="small muted">The developer needs to add a Firebase project (see README → Firebase setup). Meanwhile you can play Pass & Play or vs Computer — no internet required.</p>`}
        </div>`}
      `;
    };
    draw();
    const readNames = () => root.querySelectorAll('[data-name]').forEach((i) => { cfg.names[Number(i.dataset.name)] = i.value; });
    return bindActions(root, {
      ...commonActions,
      mode: (b) => { readNames(); cfg.mode = b.dataset.v; draw(); },
      count: (b) => { readNames(); cfg.count = Number(b.dataset.v); draw(); },
      ai: (b) => { cfg.ai = b.dataset.v; draw(); },
      color: (b) => { cfg.color = b.dataset.v; draw(); },
      toggleType: (b) => { readNames(); const i = Number(b.dataset.v); cfg.types[i] = cfg.types[i] === 'ai' ? 'human' : 'ai'; draw(); },
      start: () => {
        readNames();
        const colors = cfg.count === 2 ? ['red', 'yellow'] : COLOR_ORDER;
        let players;
        if (cfg.mode === 'ai') {
          let k = 0;
          players = colors.map((c) => (c === cfg.color
            ? { name: store.get().name, color: c, type: 'human', me: true }
            : { name: AI_NAMES[k++], color: c, type: 'ai', ai: cfg.ai }));
        } else {
          players = colors.map((c, i) => ({
            name: cfg.types[i] === 'ai' ? AI_NAMES[i] : cleanName(cfg.names[i] || `Player ${i + 1}`),
            color: c, type: cfg.types[i], ai: 'medium', me: i === 0,
          }));
          if (players.every((p) => p.type === 'ai')) players[0].type = 'human';
        }
        go('ludo', { mode: cfg.mode, ai: cfg.ai, players });
      },
    });
  },
};
