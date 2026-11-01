/** SVG Ludo board renderer with themes. Grid unit = 10 (viewBox 150x150). */
import { TRACK_COORDS, HOME_COORDS, SAFE_CELLS, START_INDEX } from '../engine/ludo.js';

export const LUDO_THEMES = {
  ludo_neon: { bg: '#0d0b2a', cell: '#1b1452', stroke: '#9B4DFF', inner: '#0a0820', colors: { red: '#FF3B5C', green: '#2EF2A0', yellow: '#FFC94A', blue: '#00D9FF' }, glow: true },
  ludo_royal: { bg: '#3a2405', cell: '#fff3d0', stroke: '#c79a2a', inner: '#fff8e6', colors: { red: '#d7263d', green: '#1b998b', yellow: '#f4b400', blue: '#2e5eaa' }, glow: false },
  ludo_cyber: { bg: '#1a0420', cell: '#2c0b3d', stroke: '#FF38B8', inner: '#12021a', colors: { red: '#ff2e88', green: '#7CFF3B', yellow: '#FFE14A', blue: '#3BC9FF' }, glow: true },
  ludo_classic: { bg: '#f7f7f7', cell: '#ffffff', stroke: '#444', inner: '#ffffff', colors: { red: '#e53935', green: '#43a047', yellow: '#fdd835', blue: '#1e88e5' }, glow: false },
};

const BASES = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
const BASE_SPOTS = [[2, 2], [2, 4], [4, 2], [4, 4]];

export function boardSVG(themeId = 'ludo_neon') {
  const th = LUDO_THEMES[themeId] || LUDO_THEMES.ludo_neon;
  const U = 10;
  const parts = [];
  parts.push(`<defs>
    <filter id="lg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${Object.entries(th.colors).map(([k, c]) => `<radialGradient id="bg-${k}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".55"/></radialGradient>`).join('')}
  </defs>`);
  parts.push(`<rect width="150" height="150" rx="6" fill="${th.bg}"/>`);
  // bases
  for (const [color, [r, c]] of Object.entries(BASES)) {
    const col = th.colors[color];
    parts.push(`<rect x="${c * U + 1}" y="${r * U + 1}" width="${6 * U - 2}" height="${6 * U - 2}" rx="5" fill="url(#bg-${color})" ${th.glow ? 'filter="url(#lg)"' : ''}/>`);
    parts.push(`<rect x="${c * U + 9}" y="${r * U + 9}" width="${4 * U - 18 + 20}" height="${4 * U - 18 + 20}" rx="5" fill="${th.inner}" stroke="${col}" stroke-width="1"/>`);
    for (const [sr, sc] of BASE_SPOTS) {
      parts.push(`<circle cx="${(c + sc) * U}" cy="${(r + sr) * U}" r="5.2" fill="${col}" fill-opacity=".25" stroke="${col}" stroke-width="1.2"/>`);
    }
  }
  // track
  TRACK_COORDS.forEach(([r, c], i) => {
    let fill = th.cell;
    for (const [color, idx] of Object.entries(START_INDEX)) if (idx === i) fill = th.colors[color];
    parts.push(`<rect x="${c * U + 0.4}" y="${r * U + 0.4}" width="${U - 0.8}" height="${U - 0.8}" rx="1.6" fill="${fill}" stroke="${th.stroke}" stroke-width=".5" stroke-opacity=".8"/>`);
    if (SAFE_CELLS.includes(i)) {
      const isStart = Object.values(START_INDEX).includes(i);
      parts.push(`<text x="${c * U + 5}" y="${r * U + 7.3}" font-size="7" text-anchor="middle" fill="${isStart ? '#fff' : th.stroke}" ${th.glow ? 'filter="url(#lg)"' : ''}>${isStart ? '➤' : '★'}</text>`);
    }
  });
  // start arrows rotation hint: (simple) ; home columns
  for (const [color, cells] of Object.entries(HOME_COORDS)) {
    for (const [r, c] of cells) {
      parts.push(`<rect x="${c * U + 0.4}" y="${r * U + 0.4}" width="${U - 0.8}" height="${U - 0.8}" rx="1.6" fill="${th.colors[color]}" fill-opacity=".85" stroke="${th.stroke}" stroke-width=".5"/>`);
    }
  }
  // centre triangles
  const cx = 75, cy = 75;
  const tri = { red: [[60, 60], [60, 90]], green: [[60, 60], [90, 60]], yellow: [[90, 60], [90, 90]], blue: [[60, 90], [90, 90]] };
  for (const [color, [[x1, y1], [x2, y2]]] of Object.entries(tri)) {
    parts.push(`<polygon points="${x1},${y1} ${x2},${y2} ${cx},${cy}" fill="${th.colors[color]}" stroke="${th.bg}" stroke-width=".8" ${th.glow ? 'filter="url(#lg)"' : ''}/>`);
  }
  parts.push(`<text x="75" y="78" font-size="8" text-anchor="middle">👑</text>`);
  if (th.glow) parts.push(`<rect x=".5" y=".5" width="149" height="149" rx="6" fill="none" stroke="${th.stroke}" stroke-width="1" filter="url(#lg)"/>`);
  return `<svg viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" aria-label="Ludo board">${parts.join('')}</svg>`;
}

/** Convert a [row, col] grid coordinate to % position of the cell centre. */
export function pct([r, c]) {
  return { left: ((c + 0.5) / 15) * 100, top: ((r + 0.5) / 15) * 100 };
}
