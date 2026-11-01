/** Tournament Stadium — 3-round knockout cup vs increasingly strong AI (offline). */
import { store, checkAchievementsNow } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, toast, confirmBox, esc, confetti } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { playSound } from '../core/audio.js';

export const ROUNDS = [
  { name: 'Quarter Final', ai: 'easy', foe: 'Bot Pappu', icon: '🥉' },
  { name: 'Semi Final', ai: 'medium', foe: 'Bot Golu', icon: '🥈' },
  { name: 'Grand Final', ai: 'hard', foe: 'King Bot 👑', icon: '🥇' },
];
export const UNLOCK_LEVEL = 3;

export function tournamentMatchFinished(win) {
  store.update((s) => {
    const t = s.tournament;
    if (!t || !t.active) return;
    if (win) {
      t.round += 1;
      if (t.round >= ROUNDS.length) { t.active = false; t.champion = true; t.cups = (t.cups || 0) + 1; t.lastResult = 'champion'; }
    } else { t.active = false; t.lastResult = `out in ${ROUNDS[t.round].name}`; }
  });
  checkAchievementsNow();
}

export default {
  nav: null,
  render(root) {
    const draw = () => {
      const s = store.get();
      const t = s.tournament;
      const locked = s.level < UNLOCK_LEVEL;
      root.innerHTML = `${topbar('🏟️ TOURNAMENT STADIUM')}
        ${locked ? `<div class="glass card center"><div style="font-size:60px">🔒</div><p>The stadium opens at <b>Level ${UNLOCK_LEVEL}</b>. You're level ${s.level} — win some matches to level up!</p>
          <button class="btn primary" data-action="go" data-route="ludo-setup">Play Ludo</button></div>` : `
        <div class="glass card center">
          <div style="font-size:54px">🏆</div>
          <p>Win 3 knockout rounds in a row against tougher bots to become <b>Champion</b>. Lose once and you're out — try again any time!</p>
          ${t?.cups ? `<div class="chip">🏆 Cups won: ${t.cups}</div>` : ''}
          ${t && !t.active && t.lastResult ? `<p class="small muted">Last cup: ${esc(t.lastResult)}</p>` : ''}
        </div>
        ${t?.active ? `
          <div class="section-title">${t.game === 'chess' ? '♛ Chess Cup' : '🎲 Ludo Cup'}</div>
          ${ROUNDS.map((r, i) => `<div class="list-item" style="${i === t.round ? 'border-color:var(--gold);box-shadow:0 0 14px rgba(255,201,74,.4)' : i < t.round ? 'border-color:var(--green)' : 'opacity:.6'}">
            <div style="font-size:28px">${i < t.round ? '✅' : r.icon}</div>
            <div class="grow"><div class="title">${r.name}</div><div class="small muted">vs ${esc(r.foe)} · ${r.ai} AI</div></div>
            ${i === t.round ? '<button class="btn sm gold" data-action="play">Play ▶</button>' : ''}
          </div>`).join('')}
          <button class="btn ghost block" data-action="quit" style="margin-top:8px">Quit cup</button>
        ` : `
          <div class="section-title">Start a new cup</div>
          <div class="grid2">
            <button class="btn pink" data-action="start" data-game="ludo">🎲 Ludo Cup</button>
            <button class="btn blue" data-action="start" data-game="chess">♛ Chess Cup</button>
          </div>
          <p class="small muted center" style="margin-top:8px">Free entry · Champion earns the 🥇 achievement (1,000 🪙 + 20 💎)</p>`}`}`;
    };
    draw();
    const s0 = store.get();
    if (s0.tournament?.champion && s0.tournament.lastResult === 'champion' && !s0.tournament.celebrated) {
      confetti(90); playSound('dhol');
      store.update((s) => { s.tournament.celebrated = true; });
      toast('🏆 CHAMPION! Cup added to your cabinet', 'success', 3500);
    }
    return bindActions(root, {
      ...commonActions,
      start: (b) => {
        store.update((s) => { s.tournament = { ...(s.tournament || {}), game: b.dataset.game, round: 0, active: true, champion: s.tournament?.champion || false, celebrated: false, lastResult: null }; });
        playSound('airhorn');
        draw();
      },
      quit: async () => {
        if (!(await confirmBox('Quit cup?', 'Your progress in this cup will be lost.', 'Quit'))) return;
        store.update((s) => { s.tournament.active = false; s.tournament.lastResult = 'quit'; });
        draw();
      },
      play: () => {
        const t = store.get().tournament;
        const r = ROUNDS[t.round];
        if (t.game === 'chess') {
          go('chess', { mode: 'tournament', ai: r.ai, side: Math.random() < 0.5 ? 'w' : 'b', minutes: 10 });
        } else {
          go('ludo', { mode: 'tournament', ai: r.ai, players: [
            { name: store.get().name, color: 'red', type: 'human', me: true },
            { name: r.foe, color: 'yellow', type: 'ai', ai: r.ai },
          ] });
        }
      },
    });
  },
};
