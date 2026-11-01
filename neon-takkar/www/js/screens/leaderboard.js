/** Leaderboard: global (Firebase) when available, plus local records. */
import { store, winRate } from '../core/store.js';
import { commonActions, go } from '../core/router.js';
import { bindActions, esc, toast } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { avatarHTML } from '../core/sprites.js';
import * as online from '../net/online.js';

export default {
  nav: 'leaderboard',
  render(root) {
    let tab = online.configured ? 'global' : 'local';
    let rows = null;
    let err = null;
    const draw = () => {
      const s = store.get();
      root.innerHTML = `${topbar('🏆 LEADERBOARD', { back: false })}
        <div class="tabs">
          ${online.configured ? `<button class="tab ${tab === 'global' ? 'active' : ''}" data-action="tab" data-v="global">🌍 Global</button>` : ''}
          <button class="tab ${tab === 'local' ? 'active' : ''}" data-action="tab" data-v="local">📱 My Records</button>
        </div>
        ${tab === 'global' ? (err ? `<div class="empty glass">${esc(err)}<br><button class="btn sm primary" data-action="retry" style="margin-top:10px">Retry</button></div>`
          : !rows ? '<div class="empty">Loading…</div>'
          : rows.length ? rows.map((r, i) => `<div class="list-item" style="${r.uid === online.currentUser()?.uid ? 'border-color:var(--gold)' : ''}">
              <b style="width:28px;text-align:center;font-size:18px">${['🥇', '🥈', '🥉'][i] || i + 1}</b>
              ${avatarHTML({ avatar: r.avatar, frame: r.frame }, 40)}
              <div class="grow"><div class="title ellipsis">${esc(r.name)}</div><div class="small muted">Lv.${r.level || 1} · ${r.stats?.played || 0} matches</div></div>
              <b style="color:var(--gold)">${r.stats?.wins || 0} 🏆</b></div>`).join('')
            : '<div class="empty glass">No ranked players yet — be the first!</div>')
        : `<div class="glass card">
            <div class="row" style="gap:12px">${avatarHTML(null, 64)}<div class="grow"><b style="font-size:18px">${esc(s.name)}</b><div class="small muted">Lv.${s.level} · Win rate ${winRate()}%</div></div></div>
          </div>
          <div class="grid2">
            <div class="glass card center"><div class="small muted">Ludo wins</div><b style="font-size:26px">${s.stats.ludo.won}</b></div>
            <div class="glass card center"><div class="small muted">Chess wins</div><b style="font-size:26px">${s.stats.chess.won}</b></div>
            <div class="glass card center"><div class="small muted">Gotis cut</div><b style="font-size:26px">${s.stats.ludo.captures}</b></div>
            <div class="glass card center"><div class="small muted">Cups won</div><b style="font-size:26px">${s.tournament?.cups || 0}</b></div>
          </div>
          ${!online.configured ? '<p class="small muted center">Global rankings appear once online play is configured.</p>' : ''}`}`;
    };
    const load = async () => {
      err = null; rows = null; draw();
      try {
        await online.requireUser();
        rows = await online.leaderboard();
      } catch (e) { err = 'Could not load rankings (offline?)'; }
      draw();
    };
    draw();
    if (tab === 'global') load();
    return bindActions(root, {
      ...commonActions,
      tab: (b) => { tab = b.dataset.v; if (tab === 'global' && !rows) load(); else draw(); },
      retry: load,
    });
  },
};
