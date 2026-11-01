/** Player profile: avatar, name, ID, level, stats, achievements, match history. */
import { store, xpForLevel, winRate, isAccount } from '../core/store.js';
import { signUpWithGmail } from '../core/accountUI.js';
import { commonActions } from '../core/router.js';
import { bindActions, toast, promptBox, modal, esc, timeAgo, fmt } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { avatarHTML, characterImage } from '../core/sprites.js';
import { ACHIEVEMENTS, byCat, ITEM } from '../core/catalog.js';
import { cleanName } from '../engine/moderation.js';
import { equipItem } from '../core/economy.js';
import * as online from '../net/online.js';

export default {
  nav: 'profile',
  render(root) {
    const draw = () => {
      const s = store.get();
      const need = xpForLevel(s.level);
      const wins = s.stats.ludo.won + s.stats.chess.won;
      const played = s.stats.ludo.played + s.stats.chess.played;
      root.innerHTML = `${topbar('My Profile', { back: false, right: '<button class="icon-btn" data-action="go" data-route="settings" aria-label="Settings">⚙️</button>' })}
        <div class="glass card center">
          <div style="display:flex;justify-content:center;margin:10px 0" data-action="avatar">${avatarHTML(null, 110)}</div>
          <div style="font-size:22px;font-weight:800">${esc(s.name)} ${isAccount(s) ? '<span class="verified">✔</span>' : ''}</div>
          <div class="small muted" data-action="copyId" style="cursor:pointer">ID: <b>${esc(s.playerId)}</b> 📋</div>
          <div class="row" style="margin:8px 20px"><b style="color:var(--gold)">Lv.${s.level}</b><div class="xpbar grow"><b style="width:${(s.xp / need) * 100}%"></b><span>${s.xp}/${need}</span></div></div>
          <div class="small muted">${isAccount(s) ? `🔗 Gmail: ${esc(s.account.email || '')}` : '👤 Guest (saved on this phone)'}</div>
          ${isAccount(s) ? '' : '<button class="btn sm google-btn" data-action="createAccount" style="margin-top:8px"><span class="g">G</span> Sign up with Gmail — save progress</button>'}
        </div>
        <div class="grid3">
          <div class="glass card center"><div style="font-size:22px">🏆</div><b style="font-size:22px">${wins}</b><div class="small muted">Wins</div></div>
          <div class="glass card center"><div style="font-size:22px">⚔️</div><b style="font-size:22px">${played}</b><div class="small muted">Matches</div></div>
          <div class="glass card center"><div style="font-size:22px">⭐</div><b style="font-size:22px">${winRate()}%</b><div class="small muted">Win rate</div></div>
        </div>
        <div class="glass card small">
          <div class="row between"><span>🎲 Ludo</span><span>${s.stats.ludo.won}W / ${s.stats.ludo.lost}L · ${s.stats.ludo.captures} cuts · ${s.stats.ludo.sixes} sixes</span></div>
          <div class="row between" style="margin-top:4px"><span>♛ Chess</span><span>${s.stats.chess.won}W / ${s.stats.chess.lost}L / ${s.stats.chess.draw}D</span></div>
          <div class="row between" style="margin-top:4px"><span>🐍 Snake</span><span>Best ${s.stats.snake.best.classic} / 🌀 ${s.stats.snake.best.portal} · ${s.stats.snake.played} runs</span></div>
          ${s.onlineStats ? `<div class="row between" style="margin-top:4px"><span>🌐 Online</span><span>${s.onlineStats.wins || 0}W / ${s.onlineStats.played || 0} played</span></div>` : ''}
        </div>
        <div class="section-title">My Achievements</div>
        <div class="row" style="flex-wrap:wrap;gap:8px">${ACHIEVEMENTS.map((a) => `<div class="chip" title="${esc(a.desc)}" style="${s.achievements[a.id] ? 'border-color:var(--gold)' : 'opacity:.4;filter:grayscale(1)'}">${a.icon} ${esc(a.name)}</div>`).join('')}</div>
        <button class="btn primary block" data-action="edit" style="margin-top:14px">✏️ Edit Profile</button>
        <div class="section-title">Match History</div>
        ${s.history.length ? s.history.slice(0, 25).map((h) => `<div class="list-item">
          <div style="font-size:26px">${h.game === 'chess' ? '♛' : h.game === 'snake' ? '🐍' : '🎲'}</div>
          <div class="grow"><div class="title">${h.game === 'snake' ? `Snake score <b style="color:var(--gold)">${h.score ?? 0}</b>${h.result === 'win' ? ' · <span style="color:var(--green)">New best!</span>' : ''}` : h.result === 'win' ? '<span style="color:var(--green)">Victory</span>' : h.result === 'draw' ? 'Draw' : '<span style="color:var(--red)">Defeat</span>'} · ${esc(h.mode)}${h.ai ? ` (${h.ai})` : ''}</div>
          <div class="small muted ellipsis">vs ${esc((h.opponents || []).join(', ') || '—')} · ${timeAgo(h.at)}</div></div>
          <div class="small">${h.coins ? `🪙+${fmt(h.coins)}` : ''}</div></div>`).join('') : '<div class="empty glass">No matches yet — go play!</div>'}`;
    };
    draw();
    const off = store.on(() => draw());
    const pickAvatar = async () => {
      const s = store.get();
      const owned = byCat('avatar').filter((a) => s.inventory[a.id]);
      const box = document.createElement('div');
      box.innerHTML = `<div class="grid4">${owned.map((a) => `<button class="btn ghost" data-av="${a.id}" style="font-size:28px">${a.icon}</button>`).join('')}
        ${s.characters.map((c) => `<button class="btn ghost" data-ch="${c.id}" style="padding:4px"><img src="${esc(characterImage(c.id) || '')}" style="width:40px;height:40px;border-radius:50%"></button>`).join('')}
        ${s.account.photo ? `<button class="btn ghost" data-photo="1" style="padding:4px"><img src="${esc(s.account.photo)}" referrerpolicy="no-referrer" style="width:40px;height:40px;border-radius:50%"></button>` : ''}</div>
        <p class="small muted">More characters in the Shop & Character Studio.</p>`;
      let close;
      box.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.av) { store.update((st) => { st.avatarCharacter = null; st.avatarUsePhoto = false; }); await equipItem(b.dataset.av); }
        if (b.dataset.ch) store.update((st) => { st.avatarCharacter = b.dataset.ch; st.avatarUsePhoto = false; });
        if (b.dataset.photo) store.update((st) => { st.avatarCharacter = null; st.avatarUsePhoto = true; });
        close?.();
      });
      const p = modal({ title: 'Choose Avatar', body: box, buttons: [{ label: 'Done', value: true }] });
      close = () => document.querySelector('.modal-wrap')?._close?.(true);
      await p;
    };
    const unbind = bindActions(root, {
      ...commonActions,
      copyId: () => { navigator.clipboard?.writeText(store.get().playerId).then(() => toast('Player ID copied!', 'success')).catch(() => toast(store.get().playerId)); },
      avatar: pickAvatar,
      createAccount: () => signUpWithGmail(),
      edit: async () => {
        const v = await modal({ title: 'Edit Profile', body: '', buttons: [{ label: '✏️ Change name', value: 'name', kind: 'primary' }, { label: '😎 Change avatar', value: 'avatar', kind: 'blue' }, { label: '🖼️ Frame', value: 'frame' }] });
        if (v === 'name') {
          const n = await promptBox('Your player name', { value: store.get().name, maxlength: 20 });
          if (n) {
            store.update((s) => { s.name = cleanName(n); });
            online.updatePublicProfile().catch(() => {});
            toast('Name updated', 'success');
          }
        }
        if (v === 'avatar') pickAvatar();
        if (v === 'frame') {
          const s = store.get();
          const frames = byCat('profile_frame').filter((f) => s.inventory[f.id]);
          const f = await modal({ title: 'Profile Frame', buttons: frames.map((x) => ({ label: `${x.icon} ${x.name}`, value: x.id })) });
          if (f) { await equipItem(f); toast(`${ITEM[f].name} equipped`, 'success'); }
        }
      },
    });
    return () => { off(); unbind(); };
  },
};
