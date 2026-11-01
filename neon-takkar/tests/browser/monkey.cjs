const { chromium } = require('playwright');
const DURATION = Number(process.argv[2] || 180) * 1000;
const XSS = '<img src=x onerror="window.__xss=1">';
(async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const report = {};
  // ---------- 1. corrupted / hostile saved data ----------
  const corrupt = ['{not json', '[]', 'null', '{"coins":"lots","stats":null,"settings":{"gfx":123},"inventory":"x","history":{"a":1},"equipped":null}', JSON.stringify({ name: XSS, characters: [{ id: XSS, name: XSS }], blocked: 'x' }), '"'.repeat(5000),
    '{"stats":{"ludo":"x","snake":{"best":null}},"settings":"x","daily":[1],"missions":{"list":"abc","progress":[]},"characters":[null,5,{"id":1}],"history":[null,"x"],"sounds":{"custom":"x","assign":[]},"account":{"mode":5},"equipped":{"skin":"__proto__"},"__proto__":{"admin":true},"tournament":"x","level":-3}'];
  report.corruptBoots = [];
  for (const c of corrupt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript((v) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('neon-takkar.profile.v1', v); sessionStorage.setItem('seeded', 1); } }, c);
    await p.goto('http://localhost:5173/');
    await p.waitForTimeout(1500);
    const booted = await p.$('.welcome, .game-cards');
    report.corruptBoots.push({ data: c.slice(0, 30), booted: !!booted, errors: errs.slice(0, 2) });
    await ctx.close();
  }
  // ---------- 2. XSS through every user-controlled string ----------
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('DIALOG ' + d.message()); d.dismiss(); });
  await page.goto('http://localhost:5173/');
  await page.fill('#nm', XSS);
  await page.click('[data-action=guest]');
  await page.waitForSelector('.game-cards');
  await page.evaluate((x) => import('./js/core/store.js').then((m) => m.store.update((s) => {
    s.name = x; s.history.unshift({ id: 'h', at: Date.now(), game: 'ludo', mode: x, result: 'win', opponents: [x], coins: 1, xp: 1 });
    s.sounds.custom.push({ id: 'z', name: x }); s.blocked = ['u1']; s.blockedNames = { u1: x };
  })), XSS);
  const go = (r, p = {}) => page.evaluate(([r, p]) => import('./js/core/router.js').then((m) => { m.go(r, p); }), [r, p]);
  for (const r of ['home', 'profile', 'leaderboard', 'settings', 'sound-studio']) { await go(r); await page.waitForTimeout(400); }
  await go('ludo', { mode: 'local', players: [{ name: XSS, color: 'red', type: 'human', me: true }, { name: XSS, color: 'yellow', type: 'ai', ai: 'easy' }] });
  await page.waitForTimeout(1200);
  await go('chess', { mode: 'local', minutes: 0, names: [XSS, XSS] });
  await page.waitForTimeout(800);
  report.xssExecuted = await page.evaluate(() => !!window.__xss);
  report.cspActive = await page.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  // ---------- 3. monkey test ----------
  await page.evaluate(() => { window.__speed = 0.3; });
  const routes = ['home', 'ludo-setup', 'chess-setup', 'snake', 'goti-studio', 'sound-studio', 'shop', 'rewards', 'map', 'profile', 'settings', 'leaderboard', 'friends', 'tournament', 'character-studio'];
  const mem = () => page.evaluate(() => { try { window.gc?.(); } catch {} return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1; });
  const memStart = await mem();
  const t0 = Date.now();
  let taps = 0, navs = 0;
  const samples = [];
  while (Date.now() - t0 < DURATION) {
    if (Math.random() < 0.08) {
      // dismiss confirmations sometimes, otherwise navigate
      const modalBtn = await page.$('.modal .btn.primary');
      if (modalBtn) await modalBtn.click().catch(() => {});
      await go(routes[Math.floor(Math.random() * routes.length)]); navs++;
      await page.waitForTimeout(150);
      continue;
    }
    const targets = await page.$$('button:not([disabled]), [data-action], .token.movable, .sq, [data-dir], .item, .tab');
    const visible = [];
    for (const t of targets.slice(0, 80)) if (await t.isVisible().catch(() => false)) visible.push(t);
    if (!visible.length) { await page.waitForTimeout(100); continue; }
    const t = visible[Math.floor(Math.random() * visible.length)];
    const txt = (await t.innerText().catch(() => '')) || '';
    if (/Delete|Log out|Upload|Gallery|Camera/i.test(txt)) continue; // don't wipe the test profile / open file pickers
    await t.click({ timeout: 800, force: true }).catch(() => {});
    taps++;
    await page.waitForTimeout(60 + Math.random() * 120);
    if (taps % 150 === 0) samples.push(await mem());
  }
  report.monkey = { seconds: DURATION / 1000, taps, navigations: navs, heapMB: { start: memStart, samples, end: await mem() } };
  report.monkeyErrors = [...new Set(errors)].slice(0, 10);
  report.stillAlive = await page.evaluate(() => !!document.querySelector('#screen .screen'));
  console.log(JSON.stringify(report, null, 1));
  await b.close();
})();
