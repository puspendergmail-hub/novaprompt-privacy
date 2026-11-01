/** Tiny DOM helpers + toast / modal / sheet primitives. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? vals[i] : ''), '');
}

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

/** Delegate clicks on [data-action] inside root to handlers[action](el, event). */
export function bindActions(root, handlers) {
  const fn = (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || !root.contains(t)) return;
    const h = handlers[t.dataset.action];
    if (h) { e.preventDefault(); h(t, e); }
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}

let toastTimer;
export function toast(msg, kind = 'info', ms = 2200) {
  let t = $('#toast');
  if (!t) { t = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.className = `toast show ${kind}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Modal dialog. buttons: [{label, value, kind}] — resolves with the clicked value. */
export function modal({ title = '', body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], dismissible = true, className = '' }) {
  return new Promise((resolve) => {
    const wrap = el('div', { class: `modal-wrap ${className}` });
    const box = el('div', { class: 'modal glass', role: 'dialog', 'aria-modal': 'true' });
    if (title) box.append(el('h2', { class: 'modal-title' }, title));
    const content = el('div', { class: 'modal-body' });
    if (typeof body === 'string') content.innerHTML = body; else if (body) content.append(body);
    box.append(content);
    const row = el('div', { class: 'modal-actions' });
    const close = (v) => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 180); resolve(v); };
    for (const b of buttons) {
      row.append(el('button', { class: `btn ${b.kind || 'ghost'}`, onclick: () => close(typeof b.value === 'function' ? b.value(content) : b.value) }, b.label));
    }
    if (buttons.length) box.append(row);
    wrap.append(box);
    if (dismissible) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
    wrap._close = close;
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
  });
}

export const confirmBox = (title, text, ok = 'Yes', cancel = 'Cancel') =>
  modal({ title, body: `<p>${esc(text)}</p>`, buttons: [{ label: cancel, value: false }, { label: ok, value: true, kind: 'primary' }] });

export function promptBox(title, { placeholder = '', value = '', maxlength = 24, ok = 'Save' } = {}) {
  const input = el('input', { class: 'input', placeholder, value, maxlength });
  setTimeout(() => input.focus(), 50);
  return modal({
    title, body: input,
    buttons: [{ label: 'Cancel', value: null }, { label: ok, value: () => input.value.trim(), kind: 'primary' }],
  });
}

/** Floating celebratory sticker/emoji burst on screen. */
export function burst(text, { x = 50, y = 45, big = false, cls = '' } = {}) {
  const n = el('div', { class: `burst ${big ? 'big' : ''} ${cls}` }, text);
  n.style.left = x + '%';
  n.style.top = y + '%';
  document.body.append(n);
  setTimeout(() => n.remove(), 1800);
}

export function confetti(count = 60) {
  if (document.body.classList.contains('gfx-low')) count = Math.min(count, 18);
  const colors = ['#9B4DFF', '#00D9FF', '#FF38B8', '#FFC94A', '#3CFF8F'];
  const layer = el('div', { class: 'confetti-layer' });
  for (let i = 0; i < count; i++) {
    const c = el('i');
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.append(c);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3400);
}

export function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
