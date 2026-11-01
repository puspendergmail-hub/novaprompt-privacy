/** History-based screen router with Android back-button support. */
import { $, $$ } from './dom.js';
import { t } from './i18n.js';

const loaders = {
  welcome: () => import('../screens/welcome.js'),
  home: () => import('../screens/home.js'),
  'ludo-setup': () => import('../screens/ludoSetup.js'),
  ludo: () => import('../screens/ludoGame.js'),
  'chess-setup': () => import('../screens/chessSetup.js'),
  chess: () => import('../screens/chessGame.js'),
  'character-studio': () => import('../screens/characterStudio.js'),
  'goti-studio': () => import('../screens/gotiStudio.js'),
  'sound-studio': () => import('../screens/soundStudio.js'),
  shop: () => import('../screens/shop.js'),
  rewards: () => import('../screens/rewards.js'),
  map: () => import('../screens/map.js'),
  profile: () => import('../screens/profile.js'),
  settings: () => import('../screens/settings.js'),
  leaderboard: () => import('../screens/leaderboard.js'),
  friends: () => import('../screens/friends.js'),
  room: () => import('../screens/room.js'),
  tournament: () => import('../screens/tournament.js'),
};

let current = null; // {name, params, cleanup, canLeave}
let depth = 0;
let busy = false;

async function mount(name, params, { back = false } = {}) {
  const load = loaders[name] || loaders.home;
  const mod = (await load()).default;
  try { current?.cleanup?.(); } catch (e) { console.error(e); }
  const root = $('#screen');
  root.innerHTML = '';
  const div = document.createElement('section');
  div.className = 'screen' + (mod.nav ? ' with-nav' : '') + (back ? ' back-anim' : '');
  root.append(div);
  const nav = $('#nav');
  nav.classList.toggle('hidden', !mod.nav);
  $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === mod.nav));
  $$('[data-t]', nav).forEach((n) => { n.textContent = t(n.dataset.t); });
  const res = (await mod.render(div, params || {})) || {};
  current = { name, params, cleanup: typeof res === 'function' ? res : res.cleanup, canLeave: res.canLeave };
}

export async function go(name, params = {}, { replace = false } = {}) {
  if (busy) return;
  busy = true;
  try {
    if (current?.canLeave && !(await current.canLeave())) return;
    if (replace) history.replaceState({ name, params, depth }, '');
    else { depth += 1; history.pushState({ name, params, depth }, ''); }
    await mount(name, params);
  } finally { busy = false; }
}

export function back() {
  if (depth > 0) history.back();
  else go('home', {}, { replace: true });
}

export function currentRoute() { return current?.name; }

export function initRouter(start, params = {}) {
  history.replaceState({ name: start, params, depth: 0 }, '');
  window.addEventListener('popstate', async (e) => {
    const st = e.state || { name: 'home', params: {}, depth: 0 };
    if (current?.canLeave && !(await current.canLeave())) {
      history.pushState({ name: current.name, params: current.params, depth }, '');
      return;
    }
    depth = st.depth || 0;
    mount(st.name, st.params, { back: true });
  });
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]');
    if (b && b.dataset.nav !== current?.name) go(b.dataset.nav);
  });
  return mount(start, params);
}

/** Shared [data-action] handlers: data-action="go" data-route="x" / data-action="back". */
export const commonActions = {
  go: (t) => go(t.dataset.route, t.dataset.params ? JSON.parse(t.dataset.params) : {}),
  back: () => back(),
};
