/**
 * Custom Character Studio — turn a photo/drawing into a game character:
 * gallery or camera → crop/zoom/rotate → background removal → circular
 * transparent PNG with frame & effect → used as profile avatar and as the
 * face of the player's Ludo goti sprite. Images stay on-device (IndexedDB).
 */
import { store, checkAchievementsNow } from '../core/store.js';
import { commonActions } from '../core/router.js';
import { bindActions, toast, modal, promptBox, confirmBox, esc, $ } from '../core/dom.js';
import { topbar } from '../core/ui.js';
import { idbSet, idbDel } from '../core/idb.js';
import { setCharacterImage, dropCharacterImage, characterImage, gotiSprite, gotiConfigFor } from '../core/sprites.js';
import { cleanName } from '../engine/moderation.js';
import { playSound } from '../core/audio.js';

const SIZE = 512;
const OUT = 256;
const FRAMES = [
  { id: 'none', name: 'None' }, { id: 'neon', name: 'Neon' }, { id: 'gold', name: 'Gold' },
  { id: 'fire', name: 'Fire' }, { id: 'double', name: 'Double' },
];
const EFFECTS = [
  { id: 'none', name: 'Original' }, { id: 'glow', name: 'Glow' }, { id: 'neon', name: 'Neon Pop' },
  { id: 'toon', name: 'Cartoon' }, { id: 'mono', name: 'B&W' },
];
const MAX_CHARACTERS = 12;

/** Flood-fill background removal from the image border. Returns a canvas. */
export function removeBackground(srcCanvas, tolerance = 40) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(srcCanvas, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const seen = new Uint8Array(w * h);
  const bg = new Uint8Array(w * h);
  // average border colour
  let sr = 0, sg = 0, sb = 0, n = 0;
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  for (const i of border) { sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; n++; }
  sr /= n; sg /= n; sb /= n;
  const dist = (i, r, gg, b) => Math.abs(d[i * 4] - r) + Math.abs(d[i * 4 + 1] - gg) + Math.abs(d[i * 4 + 2] - b);
  const stack = [];
  for (const i of border) {
    if (d[i * 4 + 3] < 10 || dist(i, sr, sg, sb) < tolerance * 3) { stack.push(i); seen[i] = 1; }
  }
  while (stack.length) {
    const i = stack.pop();
    bg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    const nbrs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nbrs) {
      if (j < 0 || seen[j]) continue;
      if (d[j * 4 + 3] < 10 || (dist(j, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < tolerance && dist(j, sr, sg, sb) < tolerance * 3.2)) {
        seen[j] = 1; stack.push(j);
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) { d[i * 4 + 3] = 0; continue; }
    // feather edges
    const x = i % w, y = (i / w) | 0;
    if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) d[i * 4 + 3] = Math.min(d[i * 4 + 3], 150);
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function drawFrame(g, size, frame) {
  const c = size / 2;
  const ring = (color, w, r, glow) => {
    g.save();
    if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.06; }
    g.strokeStyle = color; g.lineWidth = w;
    g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); g.restore();
  };
  if (frame === 'neon') ring('#00D9FF', size * 0.035, c - size * 0.03, '#9B4DFF');
  if (frame === 'gold') ring('#FFC94A', size * 0.05, c - size * 0.035, '#ff9a00');
  if (frame === 'fire') { ring('#ff3b00', size * 0.06, c - size * 0.04, '#ff3b00'); ring('#ffc94a', size * 0.02, c - size * 0.04, null); }
  if (frame === 'double') { ring('#FF38B8', size * 0.025, c - size * 0.02, '#FF38B8'); ring('#00D9FF', size * 0.025, c - size * 0.07, '#00D9FF'); }
}

export default {
  nav: null,
  render(root) {
    const ed = { img: null, processed: null, scale: 1, x: 0, y: 0, rot: 0, tol: 40, bgOn: false, frame: 'neon', effect: 'glow', name: '' };
    let view = 'list';
    let consent = false;

    const listHTML = () => {
      const s = store.get();
      return `${topbar('CHARACTER STUDIO')}
        <div class="glass card center">
          <div style="font-size:54px">🧑‍🎨</div>
          <p>Create your own playable character from a photo or drawing. It becomes your profile avatar and the face of your Ludo goti!</p>
          <label class="row small" style="text-align:left;align-items:flex-start;margin:8px 0">
            <input type="checkbox" id="consent" ${consent ? 'checked' : ''} style="margin-top:4px">
            <span>I own this image or have permission to use it. It contains no nudity, violence, hate or another person's photo without their consent.</span>
          </label>
          <div class="grid2">
            <label class="btn primary">🖼️ Gallery<input type="file" accept="image/*" id="pick-gallery" hidden></label>
            <label class="btn blue">📷 Camera<input type="file" accept="image/*" capture="user" id="pick-camera" hidden></label>
          </div>
          <p class="small muted">Tip: transparent PNGs keep their transparency. Photos stay on your phone.</p>
        </div>
        <div class="section-title">My Characters (${s.characters.length}/${MAX_CHARACTERS})</div>
        ${s.characters.length ? `<div class="char-list">${s.characters.map((c) => `
          <div class="char glass ${s.activeCharacter === c.id || s.avatarCharacter === c.id ? 'active' : ''}" data-action="charMenu" data-id="${c.id}">
            <img src="${esc(characterImage(c.id) || '')}" alt="">
            <div class="nm ellipsis">${esc(c.name)}</div>
            <div class="small muted">${s.avatarCharacter === c.id ? '👤 Avatar ' : ''}${s.activeCharacter === c.id ? '🎲 Goti' : ''}</div>
          </div>`).join('')}</div>` : '<div class="empty glass">No characters yet — upload a photo to create one!</div>'}`;
    };

    const editorHTML = () => `${topbar('EDIT CHARACTER', { right: '<button class="icon-btn" data-action="cancel" aria-label="Cancel">✕</button>' })}
      <div class="editor" id="editor"><canvas id="cv" width="${SIZE}" height="${SIZE}"></canvas></div>
      <div class="glass card" style="margin-top:12px">
        <label class="field"><span>Zoom</span><input type="range" id="zoom" min="0.2" max="4" step="0.01" value="${ed.scale}"></label>
        <div class="grid4">
          <button class="btn sm ghost" data-action="rot" data-v="-90">⟲ Rotate</button>
          <button class="btn sm ghost" data-action="rot" data-v="90">⟳ Rotate</button>
          <button class="btn sm ghost" data-action="center">⌖ Center</button>
          <button class="btn sm ${ed.bgOn ? 'green' : 'pink'}" data-action="bg">${ed.bgOn ? '✔ BG off' : '✂ Remove BG'}</button>
        </div>
        ${ed.bgOn ? `<label class="field"><span>Background removal strength</span><input type="range" id="tol" min="8" max="110" value="${ed.tol}"></label>` : ''}
        <div class="section-title">Frame</div>
        <div class="tabs">${FRAMES.map((f) => `<button class="tab ${ed.frame === f.id ? 'active' : ''}" data-action="frame" data-v="${f.id}">${f.name}</button>`).join('')}</div>
        <div class="section-title" style="margin-top:6px">Effect</div>
        <div class="tabs">${EFFECTS.map((f) => `<button class="tab ${ed.effect === f.id ? 'active' : ''}" data-action="effect" data-v="${f.id}">${f.name}</button>`).join('')}</div>
        <label class="field"><span>Character name</span><input class="input" id="cname" maxlength="16" value="${esc(ed.name)}" placeholder="e.g. Rohan Bhai"></label>
        <div class="section-title">Preview</div>
        <div class="row" style="justify-content:space-around">
          <div class="center"><img id="pv-avatar" style="width:88px;height:88px" alt="avatar preview"><div class="small muted">Avatar</div></div>
          <div class="center"><img id="pv-goti" style="width:96px;height:96px" alt="goti preview"><div class="small muted">Ludo Goti</div></div>
        </div>
        <button class="btn gold block" data-action="save" style="margin-top:12px">💾 Save Character</button>
      </div>`;

    function draw() {
      root.innerHTML = view === 'list' ? listHTML() : editorHTML();
      if (view === 'list') {
        const c = $('#consent', root);
        c.addEventListener('change', () => { consent = c.checked; });
        for (const id of ['pick-gallery', 'pick-camera']) {
          const inp = $('#' + id, root);
          inp.addEventListener('click', (e) => { if (!consent) { e.preventDefault(); toast('Please confirm the image rules first ☝️', 'error'); } });
          inp.addEventListener('change', () => inp.files[0] && loadFile(inp.files[0]));
        }
      } else {
        setupEditor();
        paint();
      }
    }

    async function loadFile(file) {
      if (!file.type.startsWith('image/')) { toast('Please choose an image file', 'error'); return; }
      if (file.size > 15 * 1024 * 1024) { toast('Image is too large (max 15 MB)', 'error'); return; }
      if (store.get().characters.length >= MAX_CHARACTERS) { toast(`Max ${MAX_CHARACTERS} characters — delete one first`, 'error'); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        // downscale to working size
        const k = Math.min(1, 900 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        ed.img = cv; ed.processed = null; ed.bgOn = false;
        ed.scale = SIZE / Math.min(cv.width, cv.height);
        ed.x = 0; ed.y = 0; ed.rot = 0;
        ed.name = '';
        view = 'edit';
        draw();
      };
      img.onerror = () => toast('Could not read that image', 'error');
      img.src = url;
    }

    function source() { return ed.bgOn ? (ed.processed ||= removeBackground(ed.img, ed.tol)) : ed.img; }

    function renderTo(size, { mask = true } = {}) {
      const cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      const g = cv.getContext('2d');
      const k = size / SIZE;
      const filters = { neon: 'saturate(1.8) contrast(1.15) brightness(1.05)', toon: 'saturate(1.5) contrast(1.4)', mono: 'grayscale(1) contrast(1.2)' };
      g.save();
      if (filters[ed.effect]) g.filter = filters[ed.effect];
      g.translate(size / 2 + ed.x * k, size / 2 + ed.y * k);
      g.rotate((ed.rot * Math.PI) / 180);
      g.scale(ed.scale * k, ed.scale * k);
      const src = source();
      g.drawImage(src, -src.width / 2, -src.height / 2);
      g.restore();
      if (mask) {
        g.globalCompositeOperation = 'destination-in';
        g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
      if (ed.effect === 'glow') {
        const out = document.createElement('canvas');
        out.width = size; out.height = size;
        const o = out.getContext('2d');
        o.shadowColor = '#00D9FF'; o.shadowBlur = size * 0.05;
        o.drawImage(cv, size * 0.05, size * 0.05, size * 0.9, size * 0.9);
        o.shadowColor = '#9B4DFF';
        o.drawImage(cv, size * 0.05, size * 0.05, size * 0.9, size * 0.9);
        drawFrame(o, size, ed.frame);
        return out;
      }
      drawFrame(g, size, ed.frame);
      return cv;
    }

    let pvTimer;
    function paint() {
      const cv = $('#cv', root);
      if (!cv || !ed.img) return;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, SIZE, SIZE);
      g.drawImage(renderTo(SIZE, { mask: false }), 0, 0);
      clearTimeout(pvTimer);
      pvTimer = setTimeout(async () => {
        const out = renderTo(OUT).toDataURL('image/png');
        const a = $('#pv-avatar', root); if (a) a.src = out;
        setCharacterImage('__preview', out);
        const gp = $('#pv-goti', root);
        if (gp) gp.src = await gotiSprite({ ...gotiConfigFor(store.get().gotiColor), character: '__preview', face: '' }, 128);
      }, 120);
    }

    function setupEditor() {
      const box = $('#editor', root);
      const pts = new Map();
      let startDist = 0, startScale = 1;
      box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startScale = ed.scale; } });
      box.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const k = SIZE / box.clientWidth;
        if (pts.size === 1) { ed.x += (e.clientX - prev.x) * k; ed.y += (e.clientY - prev.y) * k; }
        else if (pts.size === 2) { const [a, b] = [...pts.values()]; ed.scale = Math.max(0.1, Math.min(6, startScale * (Math.hypot(a.x - b.x, a.y - b.y) / startDist))); const z = $('#zoom', root); if (z) z.value = ed.scale; }
        paint();
      });
      const up = (e) => pts.delete(e.pointerId);
      box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
      box.addEventListener('wheel', (e) => { e.preventDefault(); ed.scale = Math.max(0.1, Math.min(6, ed.scale * (e.deltaY < 0 ? 1.08 : 0.93))); paint(); }, { passive: false });
      $('#zoom', root).addEventListener('input', (e) => { ed.scale = Number(e.target.value); paint(); });
      const tol = $('#tol', root);
      if (tol) tol.addEventListener('change', (e) => { ed.tol = Number(e.target.value); ed.processed = null; paint(); });
      $('#cname', root).addEventListener('input', (e) => { ed.name = e.target.value; });
    }

    const unbind = bindActions(root, {
      ...commonActions,
      cancel: () => { view = 'list'; draw(); },
      rot: (b) => { ed.rot = (ed.rot + Number(b.dataset.v)) % 360; paint(); },
      center: () => { ed.x = 0; ed.y = 0; paint(); },
      bg: () => { ed.bgOn = !ed.bgOn; ed.processed = null; ed.name = $('#cname', root)?.value || ed.name; draw(); },
      frame: (b) => { ed.frame = b.dataset.v; ed.name = $('#cname', root)?.value || ed.name; draw(); },
      effect: (b) => { ed.effect = b.dataset.v; ed.name = $('#cname', root)?.value || ed.name; draw(); },
      save: async () => {
        const name = cleanName(($('#cname', root).value || '').trim() || 'My Hero');
        const id = 'c' + Date.now().toString(36);
        const data = renderTo(OUT).toDataURL('image/png');
        try {
          await idbSet('char:' + id, data);
        } catch { toast('Could not save — storage full?', 'error'); return; }
        setCharacterImage(id, data);
        dropCharacterImage('__preview');
        store.update((s) => {
          s.characters.push({ id, name, frame: ed.frame, effect: ed.effect, createdAt: Date.now() });
          if (!s.avatarCharacter) s.avatarCharacter = id;
          if (!s.activeCharacter) s.activeCharacter = id;
        });
        const ach = checkAchievementsNow();
        playSound('tada');
        toast(`${name} saved! ${ach.length ? `🏅 ${ach[0].name}` : ''}`, 'success');
        view = 'list'; draw();
      },
      charMenu: async (b) => {
        const id = b.dataset.id;
        const c = store.get().characters.find((x) => x.id === id);
        const choice = await modal({
          title: c.name,
          body: `<div class="center"><img src="${esc(characterImage(id))}" style="width:120px;height:120px" alt=""></div>`,
          buttons: [
            { label: '👤 Avatar', value: 'avatar', kind: 'primary' },
            { label: '🎲 Goti', value: 'goti', kind: 'blue' },
            { label: '⋯', value: 'more' },
          ],
        });
        if (choice === 'avatar') { store.update((s) => { s.avatarCharacter = id; s.avatarUsePhoto = false; }); toast('Profile avatar updated', 'success'); }
        if (choice === 'goti') {
          store.update((s) => { s.activeCharacter = id; s.equipped.skin = 'skin_character'; });
          toast('Your Ludo goti now wears this character!', 'success');
        }
        if (choice === 'more') {
          const m = await modal({ title: c.name, buttons: [{ label: '✏️ Rename', value: 'rename' }, { label: '🗑️ Delete', value: 'delete', kind: 'danger' }] });
          if (m === 'rename') {
            const nn = await promptBox('Rename character', { value: c.name, maxlength: 16 });
            if (nn) store.update((s) => { s.characters.find((x) => x.id === id).name = cleanName(nn); });
          }
          if (m === 'delete' && await confirmBox('Delete character?', `${c.name} will be removed from this device.`, 'Delete')) {
            await idbDel('char:' + id).catch(() => {});
            dropCharacterImage(id);
            store.update((s) => {
              s.characters = s.characters.filter((x) => x.id !== id);
              if (s.avatarCharacter === id) s.avatarCharacter = null;
              if (s.activeCharacter === id) { s.activeCharacter = null; if (s.equipped.skin === 'skin_character') s.equipped.skin = 'skin_classic'; }
            });
          }
        }
        draw();
      },
    });
    draw();
    return () => { unbind(); clearTimeout(pvTimer); };
  },
};
