import { store, dailyStatus, claimDailyLocal, ensureMissions } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, toast, confetti, fmt } from '../core/dom.js';
import { hudHTML } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { playSound } from '../core/audio.js';
import * as online from '../net/online.js';

export async function claimDaily() {
  const s = store.get();
  if (online.configured && s.account.mode === 'google' && online.currentUser()) {
    const r = await online.call('claimDaily', {});
    store.update((st) => { st.daily = { last: r.day, streak: r.streak }; });
    return { reward: r.reward, achievements: [] };
  }
  return claimDailyLocal();
}

export default {
  nav: 'home',
  render(root) {
    const draw = () => {
      const d = dailyStatus();
      const missions = ensureMissions();
      const missionReady = missions.filter((m) => m.progress >= m.target && !m.claimed).length;
      root.innerHTML = `
        <div class="row" style="gap:8px">${hudHTML()}</div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px">
          <button class="icon-btn" data-action="go" data-route="rewards" aria-label="Missions">🔔${missionReady || d.canClaim ? `<span class="dot">${missionReady + (d.canClaim ? 1 : 0)}</span>` : ''}</button>
          <button class="icon-btn" data-action="go" data-route="settings" aria-label="Settings">⚙️</button>
        </div>
        <div class="hero" style="margin-top:-52px">
          <img class="art" src="assets/hero.webp" alt="">
          <div class="logo"><span class="crown">👑</span><span class="l1">NEON</span><span class="l2">TAKKAR</span><div class="tag">${t('tagline')}</div></div>
        </div>
        <div class="game-cards">
          <div class="game-card ludo" data-action="go" data-route="ludo-setup">
            <div class="art">🎲</div><h3>MEME<br>LUDO</h3><div class="play">${t('playNow')} ›</div></div>
          <div class="game-card chess" data-action="go" data-route="chess-setup">
            <div class="art">♛</div><h3>NEON<br>CHESS</h3><div class="play">${t('playNow')} ›</div></div>
        </div>
        <div class="quick-grid">
          <div class="quick glass" data-action="go" data-route="friends"><span class="ic">👥</span>${t('playFriends')}</div>
          <div class="quick glass" data-action="go" data-route="goti-studio"><span class="ic">🎨</span>${t('gotiStudio')}</div>
          <div class="quick glass" data-action="go" data-route="sound-studio"><span class="ic">😆</span>${t('memeStudio')}</div>
          <div class="quick glass" data-action="go" data-route="shop"><span class="ic">🧰</span>${t('shop')}</div>
          <div class="quick glass" data-action="go" data-route="character-studio"><span class="ic">🧑‍🎨</span>${t('charStudio')}</div>
          <div class="quick glass" data-action="go" data-route="leaderboard"><span class="ic">🏆</span>${t('leaderboard')}</div>
          <div class="quick glass" data-action="go" data-route="tournament"><span class="ic">🏟️</span>Tournament</div>
          <div class="quick glass" data-action="go" data-route="map"><span class="ic">🗺️</span>${t('worldMap')}</div>
        </div>
        <div class="daily-banner glass">
          <div class="gift">🎁</div>
          <div class="grow"><div style="font-weight:800">${t('daily')}</div>
            <div class="small">Day ${d.dayIndex + 1} · <b>Claim ${fmt(d.reward.coins)} Coins${d.reward.diamonds ? ` + ${d.reward.diamonds}💎` : ''}</b></div></div>
          <button class="btn gold" data-action="daily" ${d.canClaim ? '' : 'disabled'}>${d.canClaim ? t('claim') : '✔ ' + t('claimed')}</button>
        </div>
        <div class="explore-card glass" data-action="go" data-route="map">
          <img src="assets/map-preview.webp" alt="">
          <div class="txt">🧭 Explore the World Map & unlock new challenges ›</div>
        </div>`;
    };
    draw();
    const off = store.on(() => draw());
    const unbind = bindActions(root, {
      ...commonActions,
      daily: async (b) => {
        b.disabled = true;
        try {
          const r = await claimDaily();
          playSound('tada');
          confetti(50);
          toast(`+${r.reward.coins} coins${r.reward.diamonds ? ` +${r.reward.diamonds}💎` : ''}!`, 'success');
        } catch (e) { toast(e.message, 'error'); b.disabled = false; }
      },
    });
    return () => { off(); unbind(); };
  },
};
