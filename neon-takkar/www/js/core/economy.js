/** Purchases go to the server when signed in (anti-cheat), otherwise local. */
import { store, buyLocal, equip, checkAchievementsNow } from './store.js';
import { ITEM } from './catalog.js';
import * as online from '../net/online.js';

export function isServerEconomy() {
  return online.configured && store.get().account.mode === 'google' && !!online.currentUser();
}

export async function purchase(itemId) {
  const it = ITEM[itemId];
  if (!it) throw new Error('Unknown item');
  if (isServerEconomy()) {
    if (!navigator.onLine) throw new Error('Connect to the internet to buy items on a synced account');
    await online.call('purchase', { itemId });
    store.update((s) => {
      s.inventory[itemId] = true;
      s.coins -= it.cost?.coins || 0;
      s.diamonds -= it.cost?.diamonds || 0;
    });
    return { achievements: checkAchievementsNow() };
  }
  return buyLocal(itemId);
}

export async function equipItem(itemId) {
  equip(itemId);
  if (isServerEconomy()) online.updatePublicProfile().catch(() => {});
}
