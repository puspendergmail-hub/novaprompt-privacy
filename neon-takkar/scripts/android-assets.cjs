// Renders launcher icons & splash screens from www/assets/icon.svg into the
// Capacitor Android project (run after `npx cap add android`).
// Usage: node scripts/android-assets.cjs   (needs Playwright + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const res = path.join(root, 'android/app/src/main/res');
const svg = fs.readFileSync(path.join(root, 'www/assets/icon.svg'), 'utf8');
const ICON = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (w, h, html, file) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
    await p.screenshot({ path: file, omitBackground: true });
  };
  const img = (s, round) => `<div style="width:${s}px;height:${s}px;${round ? 'border-radius:50%;overflow:hidden' : ''}">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>`;
  for (const [d, s] of Object.entries(ICON)) {
    const dir = path.join(res, `mipmap-${d}`);
    await shot(s, s, img(s, false), path.join(dir, 'ic_launcher.png'));
    await shot(s, s, img(s, true), path.join(dir, 'ic_launcher_round.png'));
    const f = Math.round(s * 2.25); // adaptive foreground 108dp with safe zone
    await shot(f, f, `<div style="width:${f}px;height:${f}px;display:grid;place-items:center;background:#080914">${img(Math.round(f * 0.62), false)}</div>`, path.join(dir, 'ic_launcher_foreground.png'));
  }
  // splash screens: keep each file's size
  const sizeOf = (file) => { const buf = fs.readFileSync(file); return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; };
  for (const dir of fs.readdirSync(res).filter((x) => x.startsWith('drawable'))) {
    const file = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { w, h } = sizeOf(file);
    const s = Math.round(Math.min(w, h) * 0.38);
    await shot(w, h, `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#2a1470,#080914 70%)">${img(s, false)}</div>`, file);
  }
  const bgXml = path.join(res, 'values/ic_launcher_background.xml');
  if (fs.existsSync(bgXml)) fs.writeFileSync(bgXml, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#080914</color>\n</resources>\n');
  await b.close();
  console.log('Android icons & splash generated');
})();
