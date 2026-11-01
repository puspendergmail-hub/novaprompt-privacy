/**
 * Content-Security-Policy, applied at runtime instead of in index.html.
 * Capacitor's Android bridge is injected as an inline <script> before the page
 * runs; a static CSP would block it. Adding the policy here (after the bridge
 * has run) still blocks injected inline handlers, foreign scripts, plugins
 * (object-src) and unexpected network destinations for everything that follows.
 */
export const CSP = "default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; media-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.cloudfunctions.net https://www.gstatic.com; frame-src https://*.firebaseapp.com https://accounts.google.com; object-src 'none'; base-uri 'self'";

export function applyCSP() {
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
  const m = document.createElement('meta');
  m.httpEquiv = 'Content-Security-Policy';
  m.content = CSP;
  document.head.prepend(m);
}
