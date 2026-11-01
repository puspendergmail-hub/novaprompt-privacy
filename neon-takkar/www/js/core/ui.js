/** Shared UI components. */
import { store, xpForLevel } from './store.js';
import { avatarHTML } from './sprites.js';
import { esc, fmt, el, confetti, burst } from './dom.js';
import { ITEM } from './catalog.js';

export function walletHTML() {
  const s = store.get();
  return `<div class="wallet">
    <div class="currency" data-action="go" data-route="rewards" title="Coins">🪙 <span>${fmt(s.coins)}</span><span class="plus">+</span></div>
    <div class="currency" data-action="go" data-route="shop" title="Diamonds">💎 <span>${fmt(s.diamonds)}</span><span class="plus">+</span></div>
  </div>`;
}

export function hudHTML() {
  const s = store.get();
  const need = xpForLevel(s.level);
  const pct = Math.min(100, Math.round((s.xp / need) * 100));
  return `<div class="hud">
    <div data-action="go" data-route="profile" style="cursor:pointer">${avatarHTML(null, 48)}</div>
    <div class="who">
      <div class="name"><span class="ellipsis">${esc(s.name)}</span>${s.account.mode === 'google' ? '<span class="verified" title="Google account">✔</span>' : ''}</div>
      <div class="row small" style="gap:6px"><b style="color:var(--gold)">Lv.${s.level}</b>
        <div class="xpbar grow"><b style="width:${pct}%"></b><span>${s.xp}/${need}</span></div></div>
    </div>
    ${walletHTML()}
  </div>`;
}

export function topbar(title, { back = true, right = '' } = {}) {
  return `<div class="topbar">
    ${back ? '<button class="icon-btn" data-action="back" aria-label="Back">‹</button>' : '<div class="spacer"></div>'}
    <h1>${title.replace(/^(\p{Extended_Pictographic}\uFE0F?)\s*/u, '<span class="em">$1</span> ')}</h1>
    ${right || '<div class="spacer"></div>'}
  </div>`;
}

/** Show a meme sticker reaction (emoji + caption) at a screen position. */
export function sticker(face, label, { sad = false, x = 50, y = 42 } = {}) {
  if (document.body.classList.contains('gfx-low') && document.querySelectorAll('.sticker').length > 1) return;
  const n = el('div', { class: `sticker ${sad ? 'sad' : ''}` });
  n.innerHTML = `<div class="face">${esc(face)}</div>${sad ? '<div class="tears"><i></i><i></i></div>' : ''}<div class="label">${esc(label)}</div>`;
  n.style.left = x + '%';
  n.style.top = y + '%';
  document.body.append(n);
  setTimeout(() => n.remove(), 2300);
}

/** Play the equipped victory effect. */
export function victoryEffect() {
  const v = store.get().equipped.victory;
  if (v === 'victory_fireworks') {
    for (let i = 0; i < 6; i++) setTimeout(() => burst('🎆', { x: 15 + Math.random() * 70, y: 15 + Math.random() * 40, big: true }), i * 250);
    confetti(40);
  } else if (v === 'victory_gold') {
    for (let i = 0; i < 14; i++) setTimeout(() => burst('🪙', { x: Math.random() * 100, y: 10 + Math.random() * 30, cls: 'gold' }), i * 90);
    confetti(30);
  } else if (v === 'victory_emoji') {
    const em = ['🤣', '😎', '🔥', '💯', '🥳', '😂'];
    for (let i = 0; i < 14; i++) setTimeout(() => burst(em[i % em.length], { x: Math.random() * 100, y: 15 + Math.random() * 50 }), i * 100);
  } else {
    confetti(80);
  }
}

/**
 * Result overlay. Returns a promise resolving with the clicked button value.
 */
export function resultOverlay({ win, draw = false, title, subtitle = '', rewards = null, buttons = [] }) {
  return new Promise((resolve) => {
    const wrap = el('div', { class: 'result-overlay' });
    const r = rewards || {};
    wrap.innerHTML = `<div class="result-box glass">
      <div class="big">${draw ? '🤝' : win ? '🏆' : '😭'}</div>
      <h2 class="${win ? 'win' : 'lose'}">${esc(title)}</h2>
      <div class="muted">${esc(subtitle)}</div>
      ${rewards ? `<div class="rewards">
        ${r.coins ? `<span class="chip">🪙 +${fmt(r.coins)}</span>` : ''}
        ${r.xp ? `<span class="chip">⭐ +${r.xp} XP</span>` : ''}
        ${(r.levelUps || []).map((l) => `<span class="chip" style="border-color:var(--gold)">🆙 Level ${l}! +150🪙 +5💎</span>`).join('')}
        ${(r.achievements || []).map((a) => `<span class="chip" style="border-color:var(--green)">${a.icon} ${esc(a.name)}</span>`).join('')}
      </div>` : ''}
      <div class="col" style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        ${buttons.map((b, i) => `<button class="btn ${b.kind || 'ghost'} block" data-i="${i}">${esc(b.label)}</button>`).join('')}
      </div></div>`;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      wrap.remove();
      resolve(buttons[Number(b.dataset.i)].value);
    });
    document.body.append(wrap);
    if (win) victoryEffect();
  });
}

export function itemPriceHTML(it) {
  if (!it.cost) return '<span class="price" style="background:var(--green)">FREE</span>';
  if (it.cost.diamonds) return `<span class="price dia">💎 ${it.cost.diamonds}</span>`;
  return `<span class="price">🪙 ${fmt(it.cost.coins)}</span>`;
}

export const itemName = (id) => ITEM[id]?.name || id;
