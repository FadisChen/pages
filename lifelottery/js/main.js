// Entry point and hash router. Screens live in ./ui/screens/*.js; each exports
//   default function mount(ctx, root, arg) -> optional cleanup function
// The router also owns the top bar (theme toggle), document titles, focus management and the service worker.

import { S, pageTitle } from './strings.js';
import { session } from './ui/session.js';
import { el, icon, focusEl, toast, announce, FAST } from './ui/dom.js';
import { loadTheme, saveTheme } from './storage.js';

const SCREENS = ['landing', 'setup', 'lottery', 'life', 'death', 'summary', 'album', 'about'];
const ALIASES = { '': 'landing', home: 'landing' };

const root = document.getElementById('main');
const params = new URLSearchParams(location.search);

let cleanup = null;
let mountToken = 0;
let currentName = null;

// ---------------------------------------------------------------------------------------------
// Theme: 'system' (follow prefers-color-scheme) -> 'light' -> 'dark'
// ---------------------------------------------------------------------------------------------

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_COLORS = { light: '#efe7d4', dark: '#0a1024' };
let theme = loadTheme();

function applyTheme() {
  const html = document.documentElement;
  if (theme === 'system') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', theme);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => {
    const media = m.getAttribute('media') || '';
    if (theme === 'system') m.setAttribute('content', media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light);
    else m.setAttribute('content', THEME_COLORS[theme]);
  });
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.replaceChildren(icon(theme === 'dark' ? 'moon' : 'sun'), el('span', { class: 'icon-btn-label' }, S.nav.themeShort[theme]));
    btn.setAttribute('aria-label', `${S.nav.theme[theme]}，${S.nav.themeHint}`);
    btn.setAttribute('title', S.nav.theme[theme]);
    btn.dataset.theme = theme;
  }
}

function initTheme() {
  const btn = document.getElementById('theme-toggle');
  btn.addEventListener('click', () => {
    theme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    saveTheme(theme);
    applyTheme();
    announce(S.nav.theme[theme]);
    window.dispatchEvent(new CustomEvent('lifelottery:themechange', { detail: { theme } }));
  });
  applyTheme();
}

/** Resolved colour scheme ('light' | 'dark') for canvas drawing etc. */
export function effectiveTheme() {
  if (theme !== 'system') return theme;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}

// ---------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  let key = decodeURIComponent(name || '');
  key = ALIASES[key] ?? key;
  return { name: key, arg: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

/** Decide which screen to actually show, given what exists in the session (restoring a saved life loads the engine on demand). */
async function resolve({ name, arg }) {
  if (!SCREENS.includes(name)) return { name: 'notfound', arg: null };
  const needsLife = ['lottery', 'life', 'death', 'summary'];
  if (needsLife.includes(name)) {
    const s = await session.restore();
    if (!s) return { name: 'landing', arg: null, replace: true };
    if (name === 'lottery' && (s.age > 0 || !s.alive)) return { name: s.alive ? 'life' : 'death', arg: null, replace: true };
    if (name === 'life' && !s.alive) return { name: 'death', arg: null, replace: true };
    if ((name === 'death' || name === 'summary') && s.alive) return { name: 'life', arg: null, replace: true };
  }
  return { name, arg };
}

function go(path, { replace = false } = {}) {
  const target = `#/${path.replace(/^#?\/?/, '')}`;
  if (location.hash === target || (target === '#/' && location.hash === '')) { route(); return; }
  if (replace) location.replace(`${location.pathname}${location.search}${target}`);
  else location.hash = target;
}

function setTitle(part) {
  document.title = pageTitle(part);
}

const ctx = {
  go,
  session,
  params,
  FAST,
  setTitle,
  effectiveTheme,
  get route() { return currentName; },
};

async function route() {
  const token = ++mountToken;
  let parsed;
  try { parsed = await resolve(parseHash()); } catch (e) { console.error(e); parsed = { name: 'landing', arg: null }; }
  if (token !== mountToken) return;
  if (parsed.replace) {
    const target = parsed.name === 'landing' ? '#/' : `#/${parsed.name}`;
    history.replaceState(null, '', `${location.pathname}${location.search}${target}`);
  }
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (e) { console.error(e); }
  }
  cleanup = null;
  currentName = parsed.name;
  document.body.dataset.route = parsed.name;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === parsed.name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  root.replaceChildren();
  window.scrollTo(0, 0);
  try {
    if (parsed.name === 'notfound') {
      setTitle(S.errors.notFound);
      root.append(el('section', { class: 'screen screen-narrow' }, el('h1', null, S.errors.notFound), el('p', null, S.errors.notFoundBody), el('a', { class: 'btn btn-primary', href: '#/' }, S.nav.home)));
    } else {
      const mod = await import(`./ui/screens/${parsed.name}.js`);
      if (token !== mountToken) return;
      cleanup = mod.default(ctx, root, parsed.arg) || null;
    }
  } catch (e) {
    console.error(e);
    root.replaceChildren(el('section', { class: 'screen screen-narrow' }, el('h1', null, S.errors.generic), el('a', { class: 'btn btn-primary', href: '#/' }, S.nav.home)));
  }
  if (token !== mountToken) return;
  const h = root.querySelector('h1');
  if (h && !root.querySelector('[data-keep-focus]')) focusEl(h);
}

window.addEventListener('hashchange', route);

// ---------------------------------------------------------------------------------------------
// Service worker (offline play) and connectivity notices
// ---------------------------------------------------------------------------------------------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* offline play is optional */ });
  });
}

window.addEventListener('offline', () => toast(S.nav.offline));

initTheme();
registerServiceWorker();
route();
