/**
 * Create-account / login dialog (email + password). A guest can create an
 * account at any time and their local progress is carried over (server-capped).
 */
import { store } from './store.js';
import { modal, toast, el, esc } from './dom.js';
import { cleanName } from '../engine/moderation.js';
import * as online from '../net/online.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @param {'create'|'login'} mode
 * @returns {Promise<boolean>} true when signed in successfully
 */
export async function openAccountDialog(mode = 'create') {
  if (!online.configured) {
    await modal({
      title: 'Account setup needed',
      body: '<p>Accounts are saved on the game server, which isn\'t set up in this build yet.</p><p class="small muted">The developer needs to add a Firebase project (README → Firebase setup). Until then you can keep playing as a guest — your progress is saved on this phone.</p>',
    });
    return false;
  }
  const s = store.get();
  const wasGuest = s.account.mode === 'guest' || s.account.mode === 'none';
  let current = mode;
  let resolveOuter;
  const done = new Promise((r) => { resolveOuter = r; });

  const box = el('form', { class: 'account-form', novalidate: true });
  const render = () => {
    const create = current === 'create';
    box.innerHTML = `
      <div class="tabs" style="justify-content:center">
        <button type="button" class="tab ${create ? 'active' : ''}" data-m="create">📝 Create Account</button>
        <button type="button" class="tab ${!create ? 'active' : ''}" data-m="login">🔑 Login</button>
      </div>
      ${create ? `<label class="field"><span>Player name</span><input class="input" name="name" maxlength="20" value="${esc(s.name)}" autocomplete="nickname"></label>` : ''}
      <label class="field"><span>Email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required></label>
      <label class="field"><span>Password ${create ? '(min 6 characters)' : ''}</span><input class="input" name="password" type="password" minlength="6" autocomplete="${create ? 'new-password' : 'current-password'}" required></label>
      ${create ? '<label class="field"><span>Confirm password</span><input class="input" name="confirm" type="password" autocomplete="new-password" required></label>' : ''}
      ${wasGuest ? `<label class="row small" style="margin:6px 0"><input type="checkbox" name="import" checked> Move my guest progress (coins, level, items) into this account</label>` : ''}
      <div class="small" style="color:var(--red);min-height:18px" data-err></div>
      <button type="submit" class="btn ${create ? 'gold' : 'primary'} block">${create ? '✔ Create Account' : '🔑 Login'}</button>
      ${!create ? '<button type="button" class="btn ghost block sm" data-forgot style="margin-top:8px">Forgot password?</button>' : ''}
      <p class="small muted center" style="margin-bottom:0">Your account keeps your progress safe and lets you play online & add friends on any phone.</p>`;
  };
  render();

  const err = (m) => { box.querySelector('[data-err]').textContent = m; };
  box.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-m]');
    if (tab) { current = tab.dataset.m; render(); return; }
    if (e.target.closest('[data-forgot]')) {
      const email = box.elements.email.value.trim();
      if (!EMAIL_RE.test(email)) { err('Enter your email above first'); return; }
      try { await online.resetPassword(email); toast('Password reset link sent to your email 📧', 'success', 3500); } catch (er) { err(er.message); }
    }
  });
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = box.elements;
    const email = f.email.value.trim();
    const password = f.password.value;
    if (!EMAIL_RE.test(email)) return err('Please enter a valid email address');
    if (password.length < 6) return err('Password must be at least 6 characters');
    if (current === 'create' && password !== f.confirm.value) return err('Passwords do not match');
    const importGuest = !!f.import?.checked;
    const btn = box.querySelector('[type=submit]');
    btn.disabled = true; err('');
    try {
      if (current === 'create') {
        const name = cleanName(f.name.value || s.name);
        store.update((st) => { st.name = name; });
        await online.createEmailAccount({ email, password, name, importGuest });
        toast('Account created! Progress saved ✔', 'success');
      } else {
        await online.signInEmail({ email, password, importGuest });
        toast('Welcome back! 👋', 'success');
      }
      store.update((st) => { st.account.mode = 'email'; st.account.email = email; });
      document.querySelector('.modal-wrap')?._close?.(true);
      resolveOuter(true);
    } catch (er) { err(er.message); btn.disabled = false; }
  });

  modal({ title: current === 'create' ? 'Create your account' : 'Login', body: box, buttons: [{ label: 'Cancel', value: false }] })
    .then((v) => resolveOuter(!!v));
  return done;
}
