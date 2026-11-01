/** Custom Goti Studio — design your Ludo token: colour, skin/face, hat, frame, glow, trail, victory effect. */
import { store } from '../core/store.js';
import { commonActions, go } from '../core/router.js';
import { bindActions, toast, confirmBox, esc, fmt, $ } from '../core/dom.js';
import { topbar, itemPriceHTML, walletHTML, victoryEffect } from '../core/ui.js';
import { byCat, ITEM, CUSTOM_COLORS, GOTI_COLORS } from '../core/catalog.js';
import { gotiSprite, gotiConfigFor, characterImage } from '../core/sprites.js';
import { purchase, equipItem } from '../core/economy.js';
import { playSound } from '../core/audio.js';

const TABS = [
  { id: 'color', name: 'Colour' }, { id: 'skin', name: 'Face' }, { id: 'goti_hat', name: 'Hat' },
  { id: 'goti_frame', name: 'Frame' }, { id: 'goti_trail', name: 'Trail' }, { id: 'victory', name: 'Victory' },
];

export default {
  nav: null,
  render(root) {
    let tab = 'color';
    const draw = async () => {
      const s = store.get();
      const items = tab === 'color' ? [] : byCat(tab);
      root.innerHTML = `${topbar('CUSTOMIZE YOUR GOTI!')}
        <div class="row" style="justify-content:flex-end;margin-bottom:6px">${walletHTML()}</div>
        <div class="glass studio-preview">
          <img class="big-goti ${s.gotiGlow ? 'fx-glow' : ''}" id="big" alt="Goti preview">
          <div class="mini-gotis" id="minis"></div>
          <div class="row small" style="position:absolute;top:10px;right:10px;gap:6px">Glow
            <label class="switch"><input type="checkbox" id="glow" ${s.gotiGlow ? 'checked' : ''}><i></i></label></div>
          <button class="btn sm ghost" style="position:absolute;top:10px;left:10px" data-action="preview">▶ Preview</button>
        </div>
        <div class="tabs" style="margin-top:10px">${TABS.map((t) => `<button class="tab ${tab === t.id ? 'active' : ''}" data-action="tab" data-v="${t.id}">${t.name}</button>`).join('')}</div>
        ${tab === 'color' ? `<div class="glass card"><div class="swatches">${CUSTOM_COLORS.map((c) => `<div class="swatch ${s.gotiColor === c ? 'active' : ''}" data-action="color" data-v="${c}" style="background:${c};color:${c}"></div>`).join('')}
          <label class="swatch" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);display:grid;place-items:center" title="Custom colour"><input type="color" id="custom-color" value="${s.gotiColor}" style="opacity:0;width:100%;height:100%"></label></div>
          <p class="small muted">Your colour is used in Studio previews. In matches your goti keeps your seat colour so everyone can tell players apart — your face, hat, frame & trail always show.</p></div>`
        : `<div class="items">${items.map((it) => {
          const owned = !!s.inventory[it.id];
          const eq = s.equipped[it.cat] === it.id;
          const locked = it.level && s.level < it.level;
          const isChar = it.character;
          const icon = isChar && s.activeCharacter && characterImage(s.activeCharacter) ? `<img src="${esc(characterImage(s.activeCharacter))}" style="width:44px;height:44px;border-radius:50%">` : it.icon;
          return `<div class="item glass ${owned ? 'owned' : ''} ${eq ? 'equipped' : ''}" data-action="item" data-id="${it.id}">
            ${locked ? '<span class="lock">🔒</span>' : ''}<div class="ic">${icon}</div><div class="nm">${esc(it.name)}</div>
            ${eq ? '<span class="badge green">EQUIPPED</span>' : owned ? '<span class="badge">OWNED</span>' : locked ? `<span class="badge red">Lv.${it.level}</span>` : itemPriceHTML(it)}
          </div>`;
        }).join('')}</div>`}
        <div class="grid2" style="margin-top:12px">
          <button class="btn ghost" data-action="go" data-route="character-studio">🧑‍🎨 Characters</button>
          <button class="btn primary" data-action="apply">✔ Apply</button>
        </div>`;
      const glow = $('#glow', root);
      glow.addEventListener('change', () => { store.update((st) => { st.gotiGlow = glow.checked; }); draw(); });
      const cc = $('#custom-color', root);
      if (cc) cc.addEventListener('change', () => { store.update((st) => { st.gotiColor = cc.value; }); draw(); });
      $('#big', root).src = await gotiSprite(gotiConfigFor(s.gotiColor), 192);
      const minis = await Promise.all(Object.values(GOTI_COLORS).map((c) => gotiSprite(gotiConfigFor(c), 96)));
      const m = $('#minis', root);
      if (m) m.innerHTML = minis.map((u) => `<img src="${u}" alt="">`).join('');
    };
    draw();
    return bindActions(root, {
      ...commonActions,
      tab: (b) => { tab = b.dataset.v; draw(); },
      color: (b) => { store.update((s) => { s.gotiColor = b.dataset.v; }); playSound('pop'); draw(); },
      preview: () => {
        const big = $('#big', root);
        big.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-40px) rotate(-10deg)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-20px) rotate(8deg)' }, { transform: 'none' }], { duration: 900 });
        playSound('boing');
        const tr = ITEM[store.get().equipped.goti_trail];
        if (tr && tr.id !== 'trail_none') toast(`Trail: ${tr.icon} ${tr.name}`);
        setTimeout(victoryEffect, 600);
      },
      item: async (b) => {
        const it = ITEM[b.dataset.id];
        const s = store.get();
        if (s.inventory[it.id]) {
          if (it.character && !s.activeCharacter) { toast('Create a character first!'); go('character-studio'); return; }
          await equipItem(it.id); playSound('pop'); draw(); return;
        }
        if (it.level && s.level < it.level) { toast(`Unlocks at level ${it.level}`, 'error'); return; }
        const price = it.cost.diamonds ? `💎 ${it.cost.diamonds}` : `🪙 ${fmt(it.cost.coins)}`;
        if (!(await confirmBox(`Unlock ${it.name}?`, `Price: ${price}. Cosmetic only — no gameplay advantage.`, 'Buy'))) return;
        try {
          const r = await purchase(it.id);
          await equipItem(it.id);
          playSound('tada');
          toast(`Unlocked ${it.name}!${r.achievements?.length ? ` 🏅 ${r.achievements[0].name}` : ''}`, 'success');
          draw();
        } catch (e) { toast(e.message, 'error'); }
      },
      apply: () => { toast('Goti design applied! 🎲', 'success'); playSound('kya_baat'); go('home'); },
    });
  },
};
