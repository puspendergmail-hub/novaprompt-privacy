/** NEON TAKKAR — app bootstrap. */
import { store } from './core/store.js';
import { initRouter, go } from './core/router.js';
import { loadCharacterImages } from './core/sprites.js';
import { applyVolumes, unlockAudioOnGesture, startMusic, stopMusic } from './core/audio.js';
import { modal, esc, toast, $ } from './core/dom.js';
import * as online from './net/online.js';

function applySettings(s) {
  document.body.classList.toggle('gfx-low', s.settings.gfx === 'low');
  document.documentElement.lang = s.settings.lang === 'hi' ? 'hi' : 'en';
  applyVolumes();
}

let lastMusic = null;
store.on((s) => {
  applySettings(s);
  if (s.settings.music !== lastMusic) {
    lastMusic = s.settings.music;
    if (s.settings.music) startMusic(); else stopMusic();
  }
});

function setupOnlineListeners() {
  let offInv = null;
  let offReq = null;
  const counts = { inv: 0, req: 0 };
  const updateDot = () => {
    const n = counts.inv + counts.req;
    const d = $('#nav-dot');
    if (d) { d.textContent = n; d.classList.toggle('hidden', !n); }
  };
  const seen = new Set();
  online.onUser((u) => {
    offInv?.(); offReq?.(); offInv = offReq = null;
    counts.inv = counts.req = 0; updateDot();
    if (!u) return;
    offInv = online.watchInvites(async (list) => {
      counts.inv = list.length; updateDot();
      for (const inv of list) {
        if (seen.has(inv.id)) continue;
        seen.add(inv.id);
        if (store.get().blocked.includes(inv.fromUid)) { online.dismissInvite(inv.id); continue; }
        const ok = await modal({
          title: '🎮 Game Invite',
          body: `<p><b>${esc(inv.fromName)}</b> invited you to a <b>${inv.game === 'chess' ? 'Neon Chess' : 'Meme Ludo'}</b> room.</p><p class="muted">Room code: <b>${esc(inv.code)}</b></p>`,
          buttons: [{ label: 'Reject', value: false, kind: 'danger' }, { label: 'Join', value: true, kind: 'green' }],
        });
        online.dismissInvite(inv.id).catch(() => {});
        if (ok) {
          try { await online.call('joinRoom', { code: inv.code }); go('room', { code: inv.code }); } catch (e) { toast(e.message, 'error'); }
        }
      }
    });
    if (!u.anonymous) offReq = online.watchFriendRequests((reqs) => { counts.req = reqs.length; updateDot(); });
  });
}

async function boot() {
  applySettings(store.get());
  unlockAudioOnGesture();
  await loadCharacterImages().catch(() => {});
  if (online.configured) {
    online.init().catch((e) => console.warn('Firebase init failed (offline?)', e));
    setupOnlineListeners();
  }
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });

  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const s = store.get();
  const start = s.account.mode === 'none' ? 'welcome' : 'home';
  await initRouter(start, room ? { joinCode: room.toUpperCase() } : {});
  if (room && start === 'home') go('friends', { joinCode: room.toUpperCase() });
}

boot();
