/**
 * Account sign-up is Gmail (Google) only. Guests just enter a name and play;
 * they can connect Gmail later and their local progress moves into the
 * account once (server-capped).
 */
import { store, isAccount } from './store.js';
import { modal, toast } from './dom.js';
import { cleanName } from '../engine/moderation.js';
import * as online from '../net/online.js';

/** @returns {Promise<boolean>} true when signed in with Google */
export async function signUpWithGmail() {
  if (!online.configured) {
    await modal({
      title: 'Gmail sign-up setup needed',
      body: '<p>Gmail sign-up saves your account on the game server, which isn\'t set up in this build yet.</p><p class="small muted">The developer needs to add a Firebase project (README → Firebase setup). Until then you can keep playing as a guest — your progress is saved on this phone and moves to your Gmail account later.</p>',
    });
    return false;
  }
  const s = store.get();
  const wasGuest = !isAccount(s);
  try {
    store.update((st) => { st.account.importGuest = wasGuest; });
    const cred = await online.signInGoogle();
    const gname = cred?.user?.displayName || online.currentUser()?.name;
    store.update((st) => {
      st.account.mode = 'google';
      // use the Gmail name if the player never chose their own
      if (gname && /^Player\d{4}$/.test(st.name)) st.name = cleanName(gname);
    });
    online.updatePublicProfile().catch(() => {});
    toast(wasGuest ? 'Gmail connected — your progress is saved ✔' : 'Signed in with Gmail ✔', 'success');
    return true;
  } catch (e) {
    store.update((st) => { st.account.importGuest = false; });
    if (!/popup-closed|cancel/i.test(e.message)) toast('Gmail sign-in failed: ' + e.message, 'error', 3500);
    return false;
  }
}
