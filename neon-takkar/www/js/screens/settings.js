/** Settings: audio, vibration, language, graphics, privacy, account, logout, delete account. */
import { store } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, toast, confirmBox, modal, esc } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { applyVolumes, playSound, vibrate } from '../core/audio.js';
import { LANGS } from '../core/i18n.js';
import { idbClear } from '../core/idb.js';
import * as online from '../net/online.js';

const toggle = (key, label, icon) => {
  const s = store.get();
  return `<div class="list-item"><span style="font-size:20px">${icon}</span><div class="grow title">${label}</div>
    <label class="switch"><input type="checkbox" data-set="${key}" ${s.settings[key] ? 'checked' : ''}><i></i></label></div>`;
};

export default {
  nav: null,
  render(root) {
    const draw = () => {
      const s = store.get();
      const google = s.account.mode === 'google';
      root.innerHTML = `${topbar('⚙️ Settings')}
        <div class="section-title">Account</div>
        <div class="list-item">
          <span style="font-size:24px;font-weight:900">${google ? '<span style="color:#4285f4">G</span>' : '👤'}</span>
          <div class="grow"><div class="title">${google ? 'Google Account Connected' : s.account.mode === 'guest' ? 'Guest Account' : 'Not signed in'}</div>
            <div class="small muted ellipsis">${google ? esc(s.account.email || '') : 'Progress saved on this device only'}</div></div>
          ${google ? '<span class="badge green">✔</span>' : online.configured ? '<button class="btn sm primary" data-action="google">Connect</button>' : ''}
        </div>
        ${google ? `<div class="list-item"><div class="grow small">Pending offline progress: ${s.offline.pending.length} item(s)</div><button class="btn sm ghost" data-action="sync">⟳ Sync now</button></div>` : ''}
        <div class="section-title">Sound & Feel</div>
        ${toggle('music', 'Music', '🎵')}
        <div class="list-item"><div class="grow"><input type="range" min="0" max="1" step="0.05" data-vol="musicVol" value="${s.settings.musicVol}"></div></div>
        ${toggle('sfx', 'Sound effects', '🔊')}
        <div class="list-item"><div class="grow"><input type="range" min="0" max="1" step="0.05" data-vol="sfxVol" value="${s.settings.sfxVol}"></div></div>
        ${toggle('speech', 'Voice catch-phrases', '🗣️')}
        ${toggle('vibration', 'Vibration', '📳')}
        <div class="section-title">Display</div>
        <div class="list-item"><span style="font-size:20px">🌐</span><div class="grow title">Language</div>
          <select class="input" style="width:auto" data-sel="lang">${LANGS.map((l) => `<option value="${l.id}" ${s.settings.lang === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div>
        <div class="list-item"><span style="font-size:20px">✨</span><div class="grow title">Graphics quality</div>
          <select class="input" style="width:auto" data-sel="gfx"><option value="high" ${s.settings.gfx === 'high' ? 'selected' : ''}>High (glow & effects)</option><option value="low" ${s.settings.gfx === 'low' ? 'selected' : ''}>Low (battery saver)</option></select></div>
        <div class="list-item"><span style="font-size:20px">🎨</span><div class="grow title">Game Theme</div><button class="btn sm ghost" data-action="go" data-route="shop" data-params='{"tab":"Themes"}'>Dark Neon ›</button></div>
        <div class="section-title">Privacy & Security</div>
        <div class="list-item"><span style="font-size:20px">🚫</span><div class="grow title">Blocked players (${s.blocked.length})</div><button class="btn sm ghost" data-action="blocked">Manage</button></div>
        <div class="list-item"><span style="font-size:20px">🔒</span><div class="grow"><div class="title">Your data</div><div class="small muted">Photos & custom sounds never leave your phone. Online play stores your name, level, stats and avatar emoji.</div></div></div>
        <div class="list-item"><span style="font-size:20px">📄</span><div class="grow title">Privacy Policy</div><a class="btn sm ghost" href="privacy.html" target="_blank" rel="noopener">Open ›</a></div>
        <div class="section-title">Danger zone</div>
        ${s.account.mode !== 'none' ? '<button class="btn ghost block" data-action="logout">🚪 Log out</button>' : ''}
        <button class="btn danger block" data-action="delete" style="margin-top:8px">🗑️ Delete account & data</button>
        <div class="section-title">About</div>
        <div class="glass card small muted center">NEON TAKKAR v1.0 · Play • Laugh • Compete • Win<br>Made with 💜 in India. All sounds are synthesised originals.</div>`;
      root.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', () => {
        store.update((st) => { st.settings[i.dataset.set] = i.checked; });
        applyVolumes();
        if (i.dataset.set === 'vibration' && i.checked) vibrate(60);
        if (i.dataset.set === 'sfx' && i.checked) playSound('pop');
      }));
      root.querySelectorAll('[data-vol]').forEach((i) => i.addEventListener('input', () => { store.update((st) => { st.settings[i.dataset.vol] = Number(i.value); }); applyVolumes(); }));
      root.querySelectorAll('[data-sel]').forEach((i) => i.addEventListener('change', () => { store.update((st) => { st.settings[i.dataset.sel] = i.value; }); draw(); }));
    };
    draw();
    return bindActions(root, {
      ...commonActions,
      google: async () => {
        try { await online.signInGoogle(); toast('Google account connected!', 'success'); draw(); } catch (e) { toast(e.message, 'error'); }
      },
      sync: async () => {
        try { const r = await online.syncOffline(); toast(r ? `Synced: +${r.coins || 0} coins applied` : 'Nothing to sync', 'success'); draw(); } catch (e) { toast(e.message, 'error'); }
      },
      blocked: async () => {
        const s = store.get();
        if (!s.blocked.length) { toast('No blocked players'); return; }
        const uid = await modal({ title: 'Blocked players', body: '<p class="small muted">Tap a player to unblock.</p>', buttons: s.blocked.map((b) => ({ label: `Unblock ${String(s.blockedNames?.[b] || b).slice(0, 14)}`, value: b })).concat([{ label: 'Close', value: null }]) });
        if (uid) {
          store.update((st) => { st.blocked = st.blocked.filter((x) => x !== uid); });
          online.call('blockUser', { uid, block: false }).catch(() => {});
          toast('Unblocked');
        }
      },
      logout: async () => {
        if (!(await confirmBox('Log out?', 'Local guest progress on this device is kept. You can sign in again any time.', 'Log out'))) return;
        try { await online.signOut(); } catch { /* offline */ }
        store.update((s) => { s.account = { mode: 'none', uid: null, email: null, photo: null }; s.offline.pending = []; });
        go('welcome', {}, { replace: true });
      },
      delete: async () => {
        const ok = await confirmBox('Delete everything?', 'This permanently deletes your profile, characters, sounds, coins and (if signed in) your online account. This cannot be undone.', 'Delete forever');
        if (!ok) return;
        try {
          if (online.configured && online.currentUser()) await online.call('deleteAccount', {});
          await online.signOut().catch(() => {});
        } catch (e) { toast('Online deletion failed: ' + e.message, 'error'); return; }
        await idbClear().catch(() => {});
        store.reset();
        toast('Account deleted', 'success');
        go('welcome', {}, { replace: true });
      },
    });
  },
};
