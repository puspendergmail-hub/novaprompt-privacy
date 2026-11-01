import { store } from '../core/store.js';
import { go } from '../core/router.js';
import { bindActions, toast } from '../core/dom.js';
import * as online from '../net/online.js';
import { cleanName } from '../engine/moderation.js';

export default {
  nav: null,
  render(root, params) {
    const s = store.get();
    root.innerHTML = `<div class="welcome">
      <div class="logo"><span class="crown">👑</span><span class="l1">NEON</span><span class="l2">TAKKAR</span>
        <div class="tag">PLAY • LAUGH • COMPETE • WIN</div></div>
      <img src="assets/hero.webp" alt="" style="border-radius:18px;margin:6px 0;box-shadow:0 0 24px rgba(155,77,255,.5)">
      <div class="glass card">
        <label class="field"><span>Your player name</span>
          <input class="input" id="nm" maxlength="20" value="${s.name.replace(/"/g, '')}" autocomplete="nickname"></label>
        ${online.configured
          ? `<button class="btn google-btn block" data-action="google"><span class="g">G</span> Continue with Google</button>
             <div class="center small muted" style="margin:8px 0">or</div>`
          : ''}
        <button class="btn primary block" data-action="guest">🎮 Play as Guest</button>
        <p class="small muted center" style="margin-top:10px">Guest mode works fully offline — pass-and-play, vs computer, studios & shop.
        ${online.configured ? 'Sign in with Google to sync progress and play online with friends.' : 'Online play becomes available once Firebase is configured (see README).'}</p>
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
        try {
          store.update((st) => { st.name = nameVal(); });
          await online.signInGoogle();
          store.update((st) => { st.account.mode = 'google'; });
          toast('Signed in! Progress will sync.', 'success');
          go('home', params, { replace: true });
        } catch (e) {
          toast('Google sign-in failed: ' + e.message, 'error', 3500);
          b.disabled = false;
        }
      },
    });
  },
};
