/**
 * World Map — a miniature neon city drawn in SVG with a pannable/zoomable
 * camera, drifting clouds, shimmering water and glowing landmarks.
 */
import { store } from '../core/store.js';
import { go, commonActions } from '../core/router.js';
import { bindActions, esc, $, toast } from '../core/dom.js';
import { MAP_LOCATIONS } from '../core/catalog.js';
import { playSound } from '../core/audio.js';
import { sayDialogue } from '../core/dialogues.js';

const W = 1000;
const DESC = {
  plaza: 'The busiest square in town. Roll dice, cut gotis, and laugh out loud in Meme Ludo.',
  kingdom: 'A glowing castle where strategists battle in Neon Chess.',
  meme: 'Funfair of sounds! Pick meme reactions and assign them to your game events.',
  studio: 'Create your own character from a photo and design your goti.',
  island: 'Collect daily login rewards, finish missions and unlock achievements.',
  stadium: 'Compete in 3-round cups against tougher and tougher opponents for big prizes.',
};

function building(x, y, w, h, hue, seed) {
  const d = w * 0.45;
  let windows = '';
  for (let r = 0; r < Math.floor(h / 14); r++) {
    for (let c = 0; c < Math.floor(w / 12); c++) {
      if ((seed * 7 + r * 3 + c * 5) % 4 === 0) continue;
      windows += `<rect x="${x + 4 + c * 12}" y="${y - h + 6 + r * 14}" width="6" height="7" fill="hsl(${hue},100%,75%)" opacity=".9" class="${(r + c + seed) % 5 === 0 ? 'shimmer' : ''}"/>`;
    }
  }
  return `<g>
    <polygon points="${x + w},${y} ${x + w + d},${y - d * 0.5} ${x + w + d},${y - h - d * 0.5} ${x + w},${y - h}" fill="hsl(${hue},45%,14%)"/>
    <polygon points="${x},${y - h} ${x + d},${y - h - d * 0.5} ${x + w + d},${y - h - d * 0.5} ${x + w},${y - h}" fill="hsl(${hue},55%,32%)"/>
    <rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="hsl(${hue},45%,20%)" stroke="hsl(${hue},100%,65%)" stroke-width="1"/>
    ${windows}
  </g>`;
}

function tree(x, y, s = 1) {
  return `<g><rect x="${x - 2 * s}" y="${y - 6 * s}" width="${4 * s}" height="${8 * s}" fill="#5a3a1a"/><circle cx="${x}" cy="${y - 12 * s}" r="${9 * s}" fill="#1fb86a"/><circle cx="${x - 4 * s}" cy="${y - 15 * s}" r="${5 * s}" fill="#3cf08c" opacity=".7"/></g>`;
}

function worldSVG() {
  const p = [];
  p.push(`<defs>
    <radialGradient id="sea" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#0d4a7a"/><stop offset="1" stop-color="#061633"/></radialGradient>
    <linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a8f5a"/><stop offset="1" stop-color="#14583a"/></linearGradient>
    <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8aa0c8"/><stop offset="1" stop-color="#2a3560"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`);
  p.push(`<rect width="${W}" height="${W}" fill="url(#sea)"/>`);
  for (let i = 0; i < 26; i++) {
    const x = (i * 137) % W, y = (i * 251) % W;
    p.push(`<path d="M${x} ${y} q10 -6 20 0 t20 0" stroke="#5fd8ff" stroke-width="2" fill="none" opacity=".5" class="shimmer" style="animation-delay:${i * 0.2}s"/>`);
  }
  // main island + beach
  const island = 'M120 160 C260 60 520 70 700 110 C860 150 930 300 900 470 C880 600 820 700 700 760 C560 830 360 840 230 780 C110 720 60 560 70 420 C80 300 60 220 120 160 Z';
  p.push(`<path d="${island}" fill="#e8d19a" transform="translate(-10 12) scale(1.02)"/>`);
  p.push(`<path d="${island}" fill="url(#land)" stroke="#5cffb0" stroke-width="2" stroke-opacity=".5"/>`);
  // reward island
  p.push(`<ellipse cx="800" cy="850" rx="120" ry="70" fill="#e8d19a"/><ellipse cx="800" cy="842" rx="108" ry="60" fill="url(#land)"/>`);
  p.push(tree(740, 840, 1.1) + tree(860, 830, 1) + tree(830, 870, 0.9));
  p.push(`<text x="800" y="830" font-size="40" text-anchor="middle">🏝️</text>`);
  // mountains
  for (const [x, y, s] of [[150, 300, 1.2], [230, 260, 1.5], [310, 300, 1.1], [200, 340, 0.9]]) {
    p.push(`<polygon points="${x - 60 * s},${y + 50 * s} ${x},${y - 50 * s} ${x + 60 * s},${y + 50 * s}" fill="url(#mtn)"/><polygon points="${x - 18 * s},${y - 20 * s} ${x},${y - 50 * s} ${x + 18 * s},${y - 20 * s}" fill="#fff"/>`);
  }
  // river
  p.push(`<path d="M300 90 C340 220 420 300 470 420 C520 540 470 640 520 800" stroke="#1c8fd0" stroke-width="36" fill="none" stroke-linecap="round"/>`);
  p.push(`<path d="M300 90 C340 220 420 300 470 420 C520 540 470 640 520 800" stroke="#7fe3ff" stroke-width="3" fill="none" stroke-dasharray="10 18" class="shimmer"/>`);
  // roads
  const roads = [
    'M300 580 C380 520 450 470 520 440', 'M520 440 C600 400 660 340 720 300', 'M220 260 C300 330 400 380 520 440',
    'M520 440 C540 560 560 700 560 820', 'M300 580 C420 640 520 700 560 820', 'M720 300 C800 420 840 600 790 790',
  ];
  for (const r of roads) {
    p.push(`<path d="${r}" stroke="#2b2350" stroke-width="22" fill="none" stroke-linecap="round"/><path d="${r}" stroke="#FFC94A" stroke-width="2" fill="none" stroke-dasharray="12 12" opacity=".8"/>`);
  }
  // bridges over river
  for (const [x, y, a] of [[482, 448, -20], [505, 690, 10], [395, 300, 30]]) {
    p.push(`<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-34" y="-12" width="68" height="24" rx="4" fill="#6b4a2a" stroke="#ffd27a" stroke-width="2"/><line x1="-30" y1="-12" x2="30" y2="-12" stroke="#00D9FF" stroke-width="3" filter="url(#glow)"/><line x1="-30" y1="12" x2="30" y2="12" stroke="#00D9FF" stroke-width="3" filter="url(#glow)"/></g>`);
  }
  p.push(`<path d="M690 800 C720 830 760 840 780 840" stroke="#6b4a2a" stroke-width="18" fill="none"/>`);
  // city plaza buildings
  [[210, 640, 34, 90, 280], [250, 655, 30, 60, 200], [330, 650, 40, 120, 320], [380, 640, 28, 70, 190], [180, 560, 30, 70, 260], [370, 560, 34, 100, 300]].forEach(([x, y, w, h, hue], i) => p.push(building(x, y, w, h, hue, i)));
  // downtown near studio
  [[560, 520, 30, 110, 180], [600, 500, 36, 150, 270], [450, 520, 26, 80, 330], [640, 540, 28, 70, 200]].forEach(([x, y, w, h, hue], i) => p.push(building(x, y, w, h, hue, i + 9)));
  // chess castle
  p.push(`<g transform="translate(720 300)" filter="url(#glow)">
    <rect x="-70" y="-40" width="140" height="70" fill="#2a1d6e" stroke="#9B4DFF" stroke-width="3"/>
    ${[-70, -30, 10, 50].map((x) => `<rect x="${x}" y="-52" width="20" height="14" fill="#2a1d6e" stroke="#9B4DFF" stroke-width="2"/>`).join('')}
    <rect x="-90" y="-90" width="34" height="120" fill="#3a2a8e" stroke="#00D9FF" stroke-width="3"/><rect x="56" y="-90" width="34" height="120" fill="#3a2a8e" stroke="#00D9FF" stroke-width="3"/>
    <polygon points="-95,-90 -73,-130 -51,-90" fill="#FF38B8"/><polygon points="51,-90 73,-130 95,-90" fill="#FF38B8"/>
    <rect x="-14" y="-6" width="28" height="36" rx="14" fill="#FFC94A"/></g>`);
  // meme park: ferris wheel + trees
  p.push(`<g transform="translate(220 250)"><circle r="46" fill="none" stroke="#FF38B8" stroke-width="4" filter="url(#glow)"/>
    ${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<line x1="0" y1="0" x2="${Math.cos(a) * 46}" y2="${Math.sin(a) * 46}" stroke="#ff9ad8" stroke-width="2"/><circle cx="${Math.cos(a) * 46}" cy="${Math.sin(a) * 46}" r="6" fill="#FFC94A"/>`; }).join('')}
    <line x1="0" y1="0" x2="-20" y2="70" stroke="#ccc" stroke-width="4"/><line x1="0" y1="0" x2="20" y2="70" stroke="#ccc" stroke-width="4"/></g>`);
  [[150, 400], [180, 420], [280, 360], [620, 640], [660, 660], [600, 690], [400, 760], [430, 780], [760, 560], [800, 520]].forEach(([x, y]) => p.push(tree(x, y)));
  // stadium
  p.push(`<g transform="translate(560 820)"><ellipse rx="90" ry="44" fill="#3a2a8e" stroke="#FFC94A" stroke-width="4" filter="url(#glow)"/><ellipse rx="64" ry="28" fill="#1fb86a"/><ellipse rx="64" ry="28" fill="none" stroke="#fff" stroke-width="2"/><line x1="0" y1="-28" x2="0" y2="28" stroke="#fff" stroke-width="2"/></g>`);
  // studio dome
  p.push(`<g transform="translate(520 440)"><ellipse rx="56" ry="14" fill="#1a1440"/><path d="M-50 0 A50 50 0 0 1 50 0 Z" fill="#00D9FF" opacity=".55" stroke="#00D9FF" stroke-width="3" filter="url(#glow)"/></g>`);
  // beacons
  for (const l of MAP_LOCATIONS) p.push(`<circle cx="${l.x * 10}" cy="${l.y * 10}" r="26" fill="#00D9FF" opacity=".35" class="beacon"/>`);
  // clouds
  for (const [y, d, s] of [[120, 0, 1], [380, -12, 1.4], [700, -24, 1.1], [520, -30, 0.8]]) {
    p.push(`<g class="cloud" style="animation-delay:${d}s"><g transform="translate(0 ${y}) scale(${s})" opacity=".75"><ellipse cx="0" cy="0" rx="50" ry="20" fill="#fff"/><ellipse cx="30" cy="-12" rx="30" ry="20" fill="#fff"/><ellipse cx="-26" cy="-8" rx="24" ry="16" fill="#fff"/></g></g>`);
  }
  return `<svg viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">${p.join('')}</svg>`;
}

export default {
  nav: 'map',
  render(root) {
    const lvl = store.get().level;
    root.innerHTML = `<div class="topbar"><div class="spacer"></div><h1>🌍 WORLD MAP</h1><button class="icon-btn" data-action="fit" aria-label="Zoom out">⤢</button></div>
      <div class="map-viewport" id="vp">
        <div class="map-world" id="world">${worldSVG()}
          ${MAP_LOCATIONS.map((l) => `<div class="loc ${lvl < l.level ? 'locked' : ''}" data-loc="${l.id}" style="left:${l.x * 10}px;top:${l.y * 10}px">
            <div class="pin">${l.icon}</div><div class="lbl">${esc(l.name)}<small>${esc(l.sub)}</small></div></div>`).join('')}
        </div>
        <div id="card"></div>
      </div>`;
    const vp = $('#vp', root);
    const world = $('#world', root);
    const cam = { x: 0, y: 0, z: 1 };
    const minZ = () => Math.max(vp.clientWidth, vp.clientHeight) / W;
    const clamp = () => {
      cam.z = Math.max(minZ(), Math.min(2.2, cam.z));
      cam.x = Math.min(0, Math.max(vp.clientWidth - W * cam.z, cam.x));
      cam.y = Math.min(0, Math.max(vp.clientHeight - W * cam.z, cam.y));
    };
    const apply = () => { clamp(); world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`; };
    const flyTo = (wx, wy, z) => {
      world.classList.add('fly');
      cam.z = z;
      cam.x = vp.clientWidth / 2 - wx * z;
      cam.y = vp.clientHeight / 2 - wy * z;
      apply();
      setTimeout(() => world.classList.remove('fly'), 820);
    };
    // intro camera move
    cam.z = minZ(); cam.x = 0; cam.y = 0; apply();
    setTimeout(() => flyTo(520, 480, Math.max(minZ() * 1.5, 0.75)), 250);

    // pan / pinch
    const pts = new Map();
    let moved = 0, pinch = null;
    vp.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; } });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { cam.x += e.clientX - prev.x; cam.y += e.clientY - prev.y; moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y); }
      else if (pinch) {
        const [a, b] = [...pts.values()];
        const rect = vp.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
        const nz = Math.max(minZ(), Math.min(2.2, pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
        cam.x = cx - ((cx - cam.x) / cam.z) * nz; cam.y = cy - ((cy - cam.y) / cam.z) * nz; cam.z = nz; moved = 99;
      }
      apply();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const nz = Math.max(minZ(), Math.min(2.2, cam.z * (e.deltaY < 0 ? 1.12 : 0.9)));
      cam.x = cx - ((cx - cam.x) / cam.z) * nz; cam.y = cy - ((cy - cam.y) / cam.z) * nz; cam.z = nz; apply();
    }, { passive: false });

    world.addEventListener('click', (e) => {
      const l = e.target.closest('[data-loc]');
      if (!l || moved > 8) return;
      const loc = MAP_LOCATIONS.find((x) => x.id === l.dataset.loc);
      playSound('whoosh');
      sayDialogue('npc', { chance: 0.7, delay: 500 });
      flyTo(loc.x * 10, loc.y * 10 - 40, 1.3);
      const locked = store.get().level < loc.level;
      $('#card', root).innerHTML = `<div class="map-card glass">
        <div class="row"><div style="font-size:40px">${loc.icon}</div><div class="grow"><b style="font-size:18px">${esc(loc.name)}</b><div class="small muted">${esc(loc.sub)}</div></div>
        <button class="icon-btn" data-action="closeCard" aria-label="Close">✕</button></div>
        <p class="small">${esc(DESC[loc.id])}</p>
        ${locked ? `<button class="btn ghost block" disabled>🔒 Unlocks at Level ${loc.level}</button>` : `<button class="btn gold block" data-action="enter" data-route="${loc.route}">Enter ${esc(loc.name)} ›</button>`}
      </div>`;
    });

    return bindActions(root, {
      ...commonActions,
      fit: () => { world.classList.add('fly'); cam.z = minZ(); cam.x = 0; cam.y = 0; apply(); setTimeout(() => world.classList.remove('fly'), 820); },
      closeCard: () => { $('#card', root).innerHTML = ''; },
      enter: (b) => {
        if (b.dataset.route === 'tournament' && store.get().level < 3) { toast('Reach level 3 first'); return; }
        go(b.dataset.route);
      },
    });
  },
};
