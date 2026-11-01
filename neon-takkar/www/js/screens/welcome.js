import { store } from '../core/store.js';
import { go } from '../core/router.js';
import { bindActions } from '../core/dom.js';
import { cleanName } from '../engine/moderation.js';
import { signUpWithGmail } from '../core/accountUI.js';

export default {
  nav: null,
  render(root, params) {
    const s = store.get();
    root.innerHTML = `<div class="welcome">
      <div class="logo"><span class="crown">👑</span><span class="l1">NEON</span><span class="l2">TAKKAR</span>
        <div class="tag">PLAY • LAUGH • COMPETE • WIN</div></div>
      <img src="assets/hero.webp" alt="" style="border-radius:18px;margin:6px 0;box-shadow:0 0 24px rgba(155,77,255,.5)">
      <div class="glass card">
        <div class="section-title" style="margin-top:0">🎮 Play as Guest</div>
        <label class="field"><span>Your player name</span>
          <input class="input" id="nm" maxlength="20" value="${s.name.replace(/"/g, '')}" autocomplete="nickname" placeholder="Apna naam likho"></label>
        <button class="btn primary block" data-action="guest">🎮 Play as Guest</button>
        <p class="small muted center" style="margin:8px 0 0">No login needed — progress is saved on this phone.</p>
      </div>
      <div class="glass card">
        <div class="section-title" style="margin-top:0">📧 Sign up with Gmail</div>
        <button class="btn google-btn block" data-action="google"><span class="g">G</span> Sign up / Login with Gmail</button>
        <p class="small muted center" style="margin:8px 0 0">Save progress on your Gmail account, play online & add friends on any phone.</p>
      </div>
      <p class="small muted center">By playing you agree to our fair-play & chat-safety rules. <a href="privacy.html" style="color:var(--blue)">Privacy</a></p>
    </div>`;
    const nameVal = () => cleanName(root.querySelector('#nm').value || s.name);
    return bindActions(root, {
      guest: () => {
        store.update((st) => { st.name = nameVal(); st.account.mode = 'guest'; });
        go('home', params, { replace: true });
      },
      google: async (b) => {
        b.disabled = true;
        store.update((st) => { st.name = nameVal(); });
        if (await signUpWithGmail()) go('home', params, { replace: true });
        else b.disabled = false;
      },
    });
  },
};
