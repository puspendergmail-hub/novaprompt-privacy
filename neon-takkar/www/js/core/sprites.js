/**
 * Runtime sprite renderer. Goti (token) designs — including uploaded
 * characters — are rendered to real bitmap sprites (PNG data URLs) that the
 * board uses as game pieces, not just profile icons.
 */
import { ITEM, GOTI_COLORS } from './catalog.js';
import { store } from './store.js';
import { idbGet } from './idb.js';
import { esc } from './dom.js';

const spriteCache = new Map();
const charImages = new Map(); // id -> dataURL
const imgEls = new Map();

export async function loadCharacterImages() {
  const chars = store.get().characters;
  await Promise.all(chars.map(async (c) => {
    if (!charImages.has(c.id)) {
      const d = await idbGet('char:' + c.id);
      if (d) charImages.set(c.id, d);
    }
  }));
}
export const characterImage = (id) => charImages.get(id) || null;
export function setCharacterImage(id, dataUrl) { charImages.set(id, dataUrl); spriteCache.clear(); }
export function dropCharacterImage(id) { charImages.delete(id); spriteCache.clear(); }

function loadImg(src) {
  if (imgEls.has(src)) return imgEls.get(src);
  const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  imgEls.set(src, p);
  return p;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

/**
 * Build the goti config for a player.
 * @param {string} color hex colour
 * @param {object} [eq] equipped map (defaults to local player's)
 */
export function gotiConfigFor(color, eq = null, opts = {}) {
  const s = store.get();
  const e = eq || s.equipped;
  const skin = ITEM[e.skin] || ITEM.skin_classic;
  return {
    color,
    face: skin.face || '',
    tricolor: !!skin.tricolor,
    character: skin.character ? (opts.characterId ?? s.activeCharacter) : null,
    hat: e.goti_hat,
    frame: e.goti_frame,
    glow: opts.glow ?? s.gotiGlow,
  };
}

export function defaultGoti(colorName) {
  return { color: GOTI_COLORS[colorName] || colorName, face: '', hat: 'hat_none', frame: 'frame_neon', glow: true };
}

/** Render a goti sprite and return a PNG data URL. */
export async function gotiSprite(cfg, size = 128) {
  const key = JSON.stringify(cfg) + size;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d');
  const s = size / 128;
  const col = cfg.color || '#9B4DFF';
  const cx = 64 * s, headY = 52 * s, headR = 30 * s;

  // base / body
  g.save();
  if (cfg.glow) { g.shadowColor = col; g.shadowBlur = 18 * s; }
  const bodyGrad = g.createLinearGradient(0, 60 * s, 0, 120 * s);
  bodyGrad.addColorStop(0, shade(col, 40)); bodyGrad.addColorStop(1, shade(col, -70));
  g.fillStyle = bodyGrad;
  g.beginPath();
  g.moveTo(cx - 20 * s, 70 * s);
  g.quadraticCurveTo(cx - 36 * s, 104 * s, cx - 40 * s, 112 * s);
  g.quadraticCurveTo(cx, 126 * s, cx + 40 * s, 112 * s);
  g.quadraticCurveTo(cx + 36 * s, 104 * s, cx + 20 * s, 70 * s);
  g.closePath(); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,.25)';
  g.beginPath(); g.ellipse(cx, 112 * s, 34 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();

  // head
  g.save();
  if (cfg.glow) { g.shadowColor = col; g.shadowBlur = 22 * s; }
  const hg = g.createRadialGradient(cx - 10 * s, headY - 12 * s, 4 * s, cx, headY, headR);
  hg.addColorStop(0, shade(col, 90)); hg.addColorStop(0.6, col); hg.addColorStop(1, shade(col, -60));
  g.fillStyle = hg;
  g.beginPath(); g.arc(cx, headY, headR, 0, Math.PI * 2); g.fill();
  g.restore();

  if (cfg.tricolor) {
    g.save(); g.beginPath(); g.arc(cx, headY, headR - 3 * s, 0, Math.PI * 2); g.clip();
    const h3 = (headR * 2) / 3;
    g.fillStyle = '#FF9933'; g.fillRect(cx - headR, headY - headR, headR * 2, h3);
    g.fillStyle = '#FFFFFF'; g.fillRect(cx - headR, headY - headR + h3, headR * 2, h3);
    g.fillStyle = '#138808'; g.fillRect(cx - headR, headY - headR + 2 * h3, headR * 2, h3);
    g.strokeStyle = '#000080'; g.lineWidth = 2 * s; g.beginPath(); g.arc(cx, headY, 7 * s, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // face: uploaded character image or emoji
  const charSrc = cfg.character ? characterImage(cfg.character) : null;
  if (charSrc) {
    try {
      const img = await loadImg(charSrc);
      g.save(); g.beginPath(); g.arc(cx, headY, headR - 3 * s, 0, Math.PI * 2); g.clip();
      g.fillStyle = 'rgba(8,9,20,.55)'; g.fill();
      g.drawImage(img, cx - headR, headY - headR, headR * 2, headR * 2);
      g.restore();
    } catch { /* ignore broken image */ }
  } else if (cfg.face && !cfg.tricolor) {
    g.font = `${38 * s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(cfg.face, cx, headY + 2 * s);
  } else if (!cfg.tricolor) {
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.ellipse(cx - 9 * s, headY - 11 * s, 9 * s, 6 * s, -0.5, 0, Math.PI * 2); g.fill();
  }

  // frame
  const frames = {
    frame_neon: [{ c: '#FFFFFF', w: 3 }],
    frame_gold: [{ c: '#FFC94A', w: 5 }],
    frame_double: [{ c: '#00D9FF', w: 3 }, { c: '#FF38B8', w: 3, r: 5 }],
    frame_fire: [{ c: '#FF8A00', w: 5, glow: '#FF3B00' }],
  };
  for (const f of frames[cfg.frame] || []) {
    g.save();
    if (f.glow) { g.shadowColor = f.glow; g.shadowBlur = 14 * s; }
    g.strokeStyle = f.c; g.lineWidth = f.w * s;
    g.beginPath(); g.arc(cx, headY, headR + (f.r || 0) * s - 1 * s, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // hat
  const hat = ITEM[cfg.hat];
  if (hat && hat.id !== 'hat_none') {
    g.font = `${30 * s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(hat.icon, cx + (hat.id === 'hat_cap' ? 2 : 0) * s, headY - headR - 2 * s);
  }

  const url = cv.toDataURL('image/png');
  spriteCache.set(key, url);
  return url;
}

/** Avatar HTML for a profile-like object {avatar, avatarCharacter, frame, name}. */
export function avatarHTML(p = null, size = 48, extraClass = '') {
  const s = store.get();
  const prof = p || {
    avatar: ITEM[s.equipped.avatar]?.icon || '😎',
    character: s.avatarCharacter ? characterImage(s.avatarCharacter) : null,
    photo: s.account.photo && s.avatarUsePhoto ? s.account.photo : null,
    frame: s.equipped.profile_frame,
  };
  const inner = prof.character || prof.photo
    ? `<img src="${esc(prof.character || prof.photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span>${esc(prof.avatar || '😎')}</span>`;
  return `<div class="avatar ${esc(prof.frame || 'pframe_basic')} ${extraClass}" style="--sz:${size}px">${inner}</div>`;
}

/** Compact public profile used in rooms/leaderboards. */
export function publicProfile() {
  const s = store.get();
  return {
    name: s.name,
    level: s.level,
    avatar: ITEM[s.equipped.avatar]?.icon || '😎',
    frame: s.equipped.profile_frame,
    playerId: s.playerId,
  };
}
