// Small DOM toolkit shared by every screen: element builder, SVG builder, icons, toast, confirm dialog.
// All player-visible text goes in through textContent / text nodes, never innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const FAST = new URLSearchParams(location.search).get('debug') === 'fast';

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

/** el('div', { class: 'x', onclick: fn, 'aria-label': 'y' }, child, 'text', [more]) */
export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  applyAttrs(n, attrs);
  appendKids(n, kids);
  return n;
}

export function svg(tag, attrs, ...kids) {
  const n = document.createElementNS(SVG_NS, tag);
  applyAttrs(n, attrs);
  appendKids(n, kids);
  return n;
}

function applyAttrs(n, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) n.style.setProperty(prop, String(val)); else n.style[prop] = val;
      }
    }
    else n.setAttribute(k, v === true ? '' : String(v));
  }
}

function appendKids(n, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

// ---------------------------------------------------------------------------------------------
// Icons (inline SVG, stroke = currentColor)
// ---------------------------------------------------------------------------------------------

const ICONS = {
  play: '<path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M6 5.5v13l9-6.5z" fill="currentColor" stroke="none"/><path d="M18 5.5v13"/>',
  family: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.2"/><path d="M16 14.2c2.6-.3 4.3 1.1 4.7 4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  auto: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10.5V19h12v-8.5"/>',
  book: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 16V5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M5 19.5h14"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="17" cy="18" r="2.4"/><path d="m8.2 10.9 6.6-3.8M8.2 13.1l6.6 3.8"/>',
  trash: '<path d="M5 7h14"/><path d="M9.5 7V4.5h5V7"/><path d="M7 7l.8 12.5h8.4L17 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A15 15 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.6-4-9s1.4-6.5 4-9z"/>',
  sprout: '<path d="M12 20v-8"/><path d="M12 12c0-3.5-2.5-5.5-6.5-5.5 0 3.5 2.5 5.5 6.5 5.5z"/><path d="M12 14c0-3 2.2-5 6-5 0 3-2.2 5-6 5z"/>',
  cycle: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  crown: '<path d="M4.5 18.5h15"/><path d="m5 17 -1.2-9 4.7 3.8L12 5.5l3.5 6.3L20.2 8 19 17z"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2 3.5 2 3.5H6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5z"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
  cap: '<path d="m2.5 9.5 9.5-4.5 9.5 4.5-9.5 4.5z"/><path d="M6.5 11.8V16c1.4 1.4 3.4 2.2 5.5 2.2s4.1-.8 5.5-2.2v-4.2"/><path d="M21.5 9.5V15"/>',
  scales: '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M5 7.5h14"/><path d="m5 7.5-2.5 6a2.8 2.8 0 0 0 5 0z"/><path d="m19 7.5-2.5 6a2.8 2.8 0 0 0 5 0z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
  tree: '<path d="M12 21v-6"/><path d="M12 15c-4 0-6.5-2.5-6.5-6a6.5 6.5 0 0 1 13 0c0 3.5-2.5 6-6.5 6z"/>',
  mountain: '<path d="m3 19 6-10 4 6 2-3 6 7z"/>',
  briefcase: '<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6.2A1.2 1.2 0 0 1 10.2 5h3.6A1.2 1.2 0 0 1 15 6.2V8"/><path d="M4 13h16"/>',
  lock: '<rect x="5.5" y="11" width="13" height="9" rx="2"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>',
  mapPin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  swap: '<path d="M4 8h14"/><path d="m14 4 4 4-4 4"/><path d="M20 16H6"/><path d="m10 12-4 4 4 4"/>',
  rings: '<circle cx="9.5" cy="12" r="5"/><circle cx="14.5" cy="12" r="5"/>',
  family2: '<circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><circle cx="12" cy="15" r="2.2"/><path d="M3.5 19c.3-2.6 2-4 4.5-4M20.5 19c-.3-2.6-2-4-4.5-4"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path d="M10.5 8v5M8 10.5h5"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path d="M8 10.5h5"/>',
  fit: '<path d="M4 9V4.5h4.5M15.5 4.5H20V9M20 15v4.5h-4.5M8.5 19.5H4V15"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  star: '<path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>',
};

export function icon(name, cls = 'icon') {
  const wrap = document.createElementNS(SVG_NS, 'svg');
  wrap.setAttribute('viewBox', '0 0 24 24');
  wrap.setAttribute('class', cls);
  wrap.setAttribute('aria-hidden', 'true');
  wrap.setAttribute('focusable', 'false');
  wrap.setAttribute('fill', 'none');
  wrap.setAttribute('stroke', 'currentColor');
  wrap.setAttribute('stroke-width', '1.8');
  wrap.setAttribute('stroke-linecap', 'round');
  wrap.setAttribute('stroke-linejoin', 'round');
  // The path markup above is a fixed, trusted constant (never player input).
  wrap.innerHTML = ICONS[name] || '';
  return wrap;
}

// ---------------------------------------------------------------------------------------------
// Announcements & toast
// ---------------------------------------------------------------------------------------------

let toastTimer = null;

/** Visible toast that is also announced politely. */
export function toast(message, kind = 'info') {
  const host = document.getElementById('toast');
  if (!host) return;
  host.textContent = '';
  const t = el('div', { class: `toast toast-${kind}` }, message);
  host.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3200);
}

/** Screen-reader-only announcement without visible UI. */
export function announce(message) {
  const host = document.getElementById('sr-status');
  if (!host) return;
  host.textContent = '';
  setTimeout(() => { host.textContent = message; }, 30);
}

// ---------------------------------------------------------------------------------------------
// Confirm dialog (native <dialog>: focus trap and Esc come for free)
// ---------------------------------------------------------------------------------------------

export function confirmDialog({ title, body, ok, cancel = '取消', danger = false }) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'dialog confirm', 'aria-labelledby': 'confirm-title' });
    const okBtn = el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', 'data-confirm': 'ok' }, ok);
    const noBtn = el('button', { class: 'btn btn-quiet', type: 'button', 'data-confirm': 'cancel' }, cancel);
    dlg.append(el('h2', { id: 'confirm-title' }, title), el('p', null, body), el('div', { class: 'dialog-actions' }, noBtn, okBtn));
    let result = false;
    okBtn.addEventListener('click', () => { result = true; dlg.close(); });
    noBtn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    noBtn.focus();
  });
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------------------------

const nf = new Intl.NumberFormat('en-US');
export const fmtInt = (n) => nf.format(Math.round(n));
export const fmt1 = (n) => (Math.round(n * 10) / 10).toString();

export function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
}

/** Focus a heading-like element after a screen change without scrolling surprises. */
export function focusEl(node) {
  if (!node) return;
  if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
  node.focus({ preventScroll: true });
}
