/**
 * Firebase configuration.
 *
 * Offline play (pass-and-play, vs computer, tournaments, studios, shop) works
 * with this left as `null`. To enable Google Sign-In, online rooms, friends,
 * chat and the global leaderboard, create a Firebase project and paste its web
 * config here (Firebase console → Project settings → Your apps → Web app).
 * See README.md → "Firebase setup".
 */
export const firebaseConfig = null;
/* Example:
export const firebaseConfig = {
  apiKey: '...',
  authDomain: 'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '...',
  appId: '...',
};
*/

/**
 * Optional, for very large player counts: extra Realtime Database instances that
 * game rooms are spread across (same list & order as RTDB_ROOM_SHARD_URLS in
 * functions/.env). Leave empty to keep everything in the default database.
 */
export const RTDB_ROOM_SHARD_URLS = [];

/** Region the Cloud Functions are deployed to (must match functions/index.js). */
export const FUNCTIONS_REGION = 'asia-south1';

/** Firebase JS SDK version loaded from the official CDN when online features are used. */
export const FIREBASE_SDK_VERSION = '10.14.1';

/** Public link used when sharing room codes on WhatsApp (optional). */
export const SHARE_BASE_URL = 'https://puspendergmail-hub.github.io/novaprompt-privacy/neon-takkar/www/';
