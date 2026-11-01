/** Report / block helpers shared by friends, room and chat screens. */
import { store } from './store.js';
import { modal, toast, confirmBox, esc } from './dom.js';
import * as online from '../net/online.js';

const REASONS = ['Abusive chat', 'Offensive name or avatar', 'Cheating / exploiting', 'Spam', 'Other'];

export async function reportPlayer(uid, name, context = '') {
  const reason = await modal({
    title: `Report ${name}`,
    body: '<p class="small muted">Reports are reviewed by moderators. False reports may lead to action on your account.</p>',
    buttons: REASONS.map((r) => ({ label: r, value: r })).concat([{ label: 'Cancel', value: null }]),
  });
  if (!reason) return false;
  try {
    await online.call('reportUser', { uid, reason, context: String(context).slice(0, 500) });
    toast('Report sent. Thank you for keeping NEON TAKKAR safe 💜', 'success');
    return true;
  } catch (e) { toast(e.message, 'error'); return false; }
}

export async function blockPlayer(uid, name) {
  if (!(await confirmBox(`Block ${name}?`, 'You will no longer see their chat, reactions, invites or friend requests.', 'Block'))) return false;
  store.update((s) => {
    if (!s.blocked.includes(uid)) s.blocked.push(uid);
    s.blockedNames = { ...(s.blockedNames || {}), [uid]: name };
  });
  online.call('blockUser', { uid, block: true }).catch(() => {});
  toast(`${esc(name)} blocked`);
  return true;
}

export const isBlocked = (uid) => store.get().blocked.includes(uid);
