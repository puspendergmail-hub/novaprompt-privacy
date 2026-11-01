/** Reward Island — daily login calendar, daily missions, achievements. */
import { store, dailyStatus, ensureMissions, claimMission } from '../core/store.js';
import { commonActions } from '../core/router.js';
import { bindActions, toast, confetti, esc, fmt } from '../core/dom.js';
import { topbar, walletHTML } from '../core/ui.js';
import { DAILY_REWARDS, ACHIEVEMENTS } from '../core/catalog.js';
import { playSound } from '../core/audio.js';
import { claimDaily } from './home.js';

export default {
  nav: null,
  render(root) {
    const draw = () => {
      const s = store.get();
      const d = dailyStatus();
      const missions = ensureMissions();
      root.innerHTML = `${topbar('🎁 REWARD ISLAND')}
        <div class="row" style="justify-content:flex-end;margin-bottom:8px">${walletHTML()}</div>
        <div class="glass card">
          <div class="row between"><b>Daily Login Reward</b><span class="chip">🔥 Streak ${d.streak}</span></div>
          <div class="day-grid" style="margin:10px 0">${DAILY_REWARDS.map((r, i) => {
            const done = d.canClaim ? i < d.dayIndex : i <= d.dayIndex;
            const today = d.canClaim && i === d.dayIndex;
            return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''}">Day ${i + 1}<b>${done ? '✅' : r.diamonds ? '💎' : '🪙'}</b>${fmt(r.coins)}${r.diamonds ? `+${r.diamonds}💎` : ''}</div>`;
          }).join('')}</div>
          <button class="btn gold block" data-action="daily" ${d.canClaim ? '' : 'disabled'}>${d.canClaim ? `Claim ${fmt(d.reward.coins)} Coins` : 'Come back tomorrow ⏰'}</button>
        </div>
        <div class="section-title">Daily Missions</div>
        ${missions.map((m) => `<div class="list-item">
          <div style="font-size:28px">${m.claimed ? '✅' : '🎯'}</div>
          <div class="grow"><div class="title">${esc(m.name)}</div>
            <div class="progress" style="margin:4px 0"><b style="width:${(m.progress / m.target) * 100}%"></b></div>
            <div class="small muted">${m.progress}/${m.target} · 🪙 ${m.reward.coins}</div></div>
          <button class="btn sm ${m.progress >= m.target && !m.claimed ? 'green' : 'ghost'}" data-action="mission" data-id="${m.id}" ${m.progress >= m.target && !m.claimed ? '' : 'disabled'}>${m.claimed ? 'Done' : 'Claim'}</button>
        </div>`).join('')}
        <div class="section-title">Achievements (${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length})</div>
        ${ACHIEVEMENTS.map((a) => `<div class="list-item" style="${s.achievements[a.id] ? 'border-color:var(--gold)' : 'opacity:.7'}">
          <div style="font-size:28px;${s.achievements[a.id] ? '' : 'filter:grayscale(1)'}">${a.icon}</div>
          <div class="grow"><div class="title">${esc(a.name)}</div><div class="small muted">${esc(a.desc)}</div></div>
          <div class="small" style="text-align:right">${s.achievements[a.id] ? '<span class="badge gold">UNLOCKED</span>' : `${a.reward.coins ? `🪙${a.reward.coins}` : ''} ${a.reward.diamonds ? `💎${a.reward.diamonds}` : ''}`}</div>
        </div>`).join('')}`;
    };
    draw();
    const off = store.on(() => draw());
    const unbind = bindActions(root, {
      ...commonActions,
      daily: async (b) => {
        b.disabled = true;
        try {
          const r = await claimDaily();
          playSound('tada'); confetti(60);
          toast(`+${r.reward.coins} coins!`, 'success');
        } catch (e) { toast(e.message, 'error'); b.disabled = false; }
      },
      mission: (b) => {
        try {
          const r = claimMission(b.dataset.id);
          playSound('kya_baat');
          toast(`+${r.coins} coins!`, 'success');
        } catch (e) { toast(e.message, 'error'); }
      },
    });
    return () => { off(); unbind(); };
  },
};
