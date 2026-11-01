/** Shop — unlock cosmetics with coins/diamonds earned by playing. */
import { store } from '../core/store.js';
import { commonActions, go } from '../core/router.js';
import { bindActions, toast, confirmBox, esc, fmt } from '../core/dom.js';
import { topbar, itemPriceHTML, walletHTML } from '../core/ui.js';
import { CATEGORIES, ITEMS, ITEM } from '../core/catalog.js';
import { purchase, equipItem } from '../core/economy.js';
import { playSound } from '../core/audio.js';
import { PIECE_NAMES } from './chessGame.js';

const TABS = ['Skins', 'Themes', 'Effects', 'Sounds', 'Frames', 'Characters'];

export default {
  nav: null,
  render(root, params) {
    let tab = params.tab || 'Skins';
    const draw = () => {
      const s = store.get();
      const cats = CATEGORIES.filter((c) => c.tab === tab);
      root.innerHTML = `${topbar('SHOP & REWARDS')}
        <div class="row between" style="margin-bottom:6px"><button class="btn sm gold" data-action="go" data-route="rewards">🎁 Free Rewards</button>${walletHTML()}</div>
        <div class="tabs">${TABS.map((t) => `<button class="tab ${tab === t ? 'active' : ''}" data-action="tab" data-v="${t}">${t}</button>`).join('')}</div>
        ${cats.map((c) => `<div class="section-title">${c.name}</div><div class="items">${ITEMS.filter((i) => i.cat === c.id).map((it) => {
          const owned = !!s.inventory[it.id];
          const eq = s.equipped[it.cat] === it.id;
          const locked = it.level && s.level < it.level;
          return `<div class="item glass ${owned ? 'owned' : ''} ${eq ? 'equipped' : ''}" data-action="item" data-id="${it.id}">
            ${locked ? '<span class="lock">🔒</span>' : ''}<div class="ic">${it.icon}</div><div class="nm">${esc(it.name)}</div>
            ${eq ? '<span class="badge green">EQUIPPED</span>' : owned ? '<span class="badge">TAP TO USE</span>' : locked ? `<span class="badge red">Lv.${it.level}</span>` : itemPriceHTML(it)}
          </div>`;
        }).join('')}</div>`).join('')}
        <div class="glass card small muted" style="margin-top:14px">💡 Everything here is cosmetic — no item changes dice, AI or match results. Earn coins from daily rewards, missions, achievements and winning matches; diamonds from level-ups, streaks and achievements.</div>`;
    };
    draw();
    const off = store.on(() => draw());
    const unbind = bindActions(root, {
      ...commonActions,
      tab: (b) => { tab = b.dataset.v; draw(); },
      item: async (b) => {
        const it = ITEM[b.dataset.id];
        const s = store.get();
        if (s.inventory[it.id]) {
          if (it.character && !s.activeCharacter) { toast('Create a character first!'); go('character-studio'); return; }
          await equipItem(it.id);
          playSound('pop');
          toast(`${it.name} equipped`, 'success');
          return;
        }
        if (it.level && s.level < it.level) { toast(`Unlocks at level ${it.level}`, 'error'); return; }
        const price = it.cost.diamonds ? `💎 ${it.cost.diamonds}` : `🪙 ${fmt(it.cost.coins)}`;
        const extra = it.cat === 'chess_pieces' ? ` Includes ${Object.values(PIECE_NAMES[it.id] || {}).join(', ')}.` : '';
        if (!(await confirmBox(`Unlock ${it.name}?`, `Price: ${price}.${extra}`, 'Buy'))) return;
        try {
          const r = await purchase(it.id);
          await equipItem(it.id);
          playSound('tada');
          toast(`Unlocked ${it.name}!${r.achievements?.length ? ` 🏅 ${r.achievements[0].name}` : ''}`, 'success');
        } catch (e) { toast(e.message, 'error'); }
      },
    });
    return () => { off(); unbind(); };
  },
};
