// Phase 1 minimal text UI: settings -> birth reveal -> yearly feed with choices -> death summary.
// Plain DOM, no framework. Everything the player sees is inserted with textContent (never innerHTML).
// The Phase 2 UI replaces this file; the engine API used here is documented in js/engine/README.md.

import {
  createLife, advanceYear, choose, autoChoose, serialize, deserialize, getStatus, getPendingChoice,
} from './engine/life.js';
import { describeBirth } from './engine/birth.js';
import { getSummary, STAT_LABELS } from './engine/summary.js';

const SAVE_KEY = 'lifelottery.save';
const SETTINGS_KEY = 'lifelottery.settings';
const params = new URLSearchParams(location.search);
const FAST = params.get('debug') === 'fast';

/** Milliseconds of real time per simulated year at 1x, by pace (about 10 / 30 / 60 minutes per life). */
const PACE_MS = { short: 7500, standard: 22000, long: 45000 };
const AUTO_CHOICE_MS = 6000;

const app = document.getElementById('app');

// ---------------------------------------------------------------------------------------------
// Safe storage
// ---------------------------------------------------------------------------------------------

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch (e) { /* storage unavailable: the game still works without saving */ }
  return null;
}

function loadSettings() {
  try { return { era: 'present', drawMode: 'births', pace: 'standard', autoChoice: false, ...JSON.parse(store(SETTINGS_KEY) || '{}') }; } catch (e) { return { era: 'present', drawMode: 'births', pace: 'standard', autoChoice: false }; }
}

// ---------------------------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------------------------

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

function show(...nodes) {
  stopTimers();
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------------------------

let yearTimer = null;
let choiceTimer = null;
function stopTimers() {
  clearTimeout(yearTimer); clearTimeout(choiceTimer);
  yearTimer = choiceTimer = null;
}

// ---------------------------------------------------------------------------------------------
// Screen 1: settings
// ---------------------------------------------------------------------------------------------

function select(name, value, options) {
  return el('select', { name, id: name }, options.map(([v, label]) => el('option', { value: v, selected: v === value }, label)));
}

function settingsScreen() {
  const cfg = loadSettings();
  const saved = (() => { try { return store(SAVE_KEY) ? deserialize(store(SAVE_KEY)) : null; } catch (e) { return null; } })();
  const form = el('form', { class: 'card' },
    el('label', { for: 'era' }, '出生年代'),
    select('era', cfg.era, [['past', '過去（約 1970）'], ['present', '現在'], ['future', '未來（約 2050）'], ['random', '隨機']]),
    el('label', { for: 'drawMode' }, '抽籤方式'),
    select('drawMode', cfg.drawMode, [['births', '依新生兒人數'], ['population', '依現有人口']]),
    el('label', { for: 'pace' }, '人生長度'),
    select('pace', cfg.pace, [['short', '短（約 10 分鐘）'], ['standard', '標準（約 30 分鐘）'], ['long', '長（約 60 分鐘）']]),
    el('label', {}, el('input', { type: 'checkbox', name: 'autoChoice', checked: cfg.autoChoice }), ' 自動抉擇（倒數後由系統代選）'),
    el('p', { class: 'muted' }, '內容提醒：遊戲會依真實統計出現疾病、死亡、暴力、貧窮等情節。'),
    el('div', { class: 'row' }, el('button', { class: 'primary', type: 'submit' }, '開始投胎')),
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const settings = { era: fd.get('era'), drawMode: fd.get('drawMode'), pace: fd.get('pace'), autoChoice: fd.get('autoChoice') === 'on' };
    store(SETTINGS_KEY, JSON.stringify(settings));
    const seed = params.get('seed') || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const s = createLife(settings, seed);
    birthScreen(s);
  });
  const nodes = [el('h1', {}, '人生籤'), el('p', { class: 'muted' }, '依真實統計隨機出生，走完一生。你無法選擇出生的地方、性別與家庭。'), form];
  if (saved && saved.alive) {
    nodes.push(el('div', { class: 'card' }, el('p', {}, `未完成的人生：${saved.name.full}，${saved.age} 歲。`),
      el('button', { onclick: () => lifeScreen(saved) }, '繼續上一段人生')));
  }
  show(...nodes);
}

// ---------------------------------------------------------------------------------------------
// Screen 2: birth reveal
// ---------------------------------------------------------------------------------------------

function birthScreen(s) {
  const b = describeBirth(s);
  const rows = b.comparisons.map((c) => el('tr', {}, el('th', {}, c.label), el('td', {}, `${c.value} ${c.unit}`), el('td', { class: 'muted' }, `世界 ${c.world} ${c.unit}`)));
  show(
    el('h2', {}, `${b.year} 年・${b.countryName}`),
    el('div', { class: 'card' },
      el('p', {}, `你叫${b.name}，出生在${b.countryName}的${b.placeText}。`),
      el('p', {}, `性別：${b.genderLabel}　家庭經濟：${b.wealthLabel}（${b.wealthShort}）`),
      el('p', {}, `${b.eraLabel}出生的 100 個嬰兒裡，有${b.babiesText}和你同國。`),
    ),
    el('div', { class: 'card' }, el('h3', {}, `${b.countryName} 與世界平均`), el('table', { class: 'cmp' }, rows)),
    el('button', { class: 'primary', onclick: () => lifeScreen(s) }, '開始這段人生'),
  );
}

// ---------------------------------------------------------------------------------------------
// Screen 3: life
// ---------------------------------------------------------------------------------------------

function lifeScreen(s) {
  const header = el('div', { class: 'card' });
  const bars = el('div', { class: 'bars card' });
  const feed = el('ol', { id: 'feed', 'aria-live': 'polite' });
  const choicePanel = el('div', { class: 'card', hidden: true });
  const status = el('span', { class: 'muted' });
  let paused = false;
  let speed = 1;
  const autoBox = el('input', { type: 'checkbox', id: 'auto', checked: !!s.settings.autoChoice });
  const pauseBtn = el('button', { onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '播放' : '暫停'; if (!paused) schedule(); else stopTimers(); } }, '暫停');
  const speedBtn = el('button', { onclick: () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; speedBtn.textContent = `${speed}×`; } }, '1×');
  const nextBtn = el('button', { onclick: () => { stopTimers(); step(); } }, '下一年');
  const controls = el('div', { class: 'row' }, pauseBtn, speedBtn, nextBtn, el('label', {}, autoBox, ' 自動抉擇'), status);
  show(header, bars, controls, choicePanel, el('h3', {}, '一生'), feed);

  function renderStatus() {
    const st = getStatus(s);
    header.replaceChildren(
      el('h2', {}, st.name),
      el('div', {}, `${st.age} 歲・${st.year} 年・${st.countryName}${st.city ? '・' + st.city : ''}・${st.stage}`),
    );
    const kids = [];
    for (const [k, label] of Object.entries(STAT_LABELS)) {
      const v = Math.round(st.stats[k]);
      kids.push(el('span', {}, label), el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('i', { style: `width:${v}%` })), el('span', {}, v));
    }
    bars.replaceChildren(...kids);
  }

  function appendEntries(entries) {
    for (const e of entries) {
      const parts = [el('span', { class: 'age' }, `${e.age} 歲`)];
      if (e.title && e.kind !== 'year') parts.push(el('b', {}, e.title), ' ');
      parts.push(e.text);
      if (e.delta) parts.push(el('div', { class: 'delta' }, Object.entries(e.delta).map(([k, v]) => `${STAT_LABELS[k]} ${v > 0 ? '+' : ''}${v}`).join('　')));
      feed.append(el('li', { class: e.kind }, parts));
    }
    feed.scrollTop = feed.scrollHeight;
  }

  function persist() {
    if (s.alive) store(SAVE_KEY, serialize(s)); else store(SAVE_KEY, null);
  }

  function showChoice(pc) {
    choicePanel.hidden = false;
    nextBtn.disabled = true;
    const buttons = pc.options.map((o, i) => el('button', { onclick: () => pick(i) }, o.label));
    choicePanel.replaceChildren(el('h3', {}, pc.title), el('p', {}, pc.text), el('div', { class: 'choices' }, buttons));
    if (autoBox.checked) {
      let left = AUTO_CHOICE_MS / (FAST ? 100 : 1000);
      const note = el('p', { class: 'muted' });
      choicePanel.append(note);
      const tick = () => {
        note.textContent = `${Math.ceil(left)} 秒後自動抉擇……`;
        if (left <= 0) { resolve(autoChoose(s)); return; }
        left -= FAST ? 0.1 : 1;
        choiceTimer = setTimeout(tick, FAST ? 10 : 1000);
      };
      tick();
    }
  }

  function pick(i) {
    clearTimeout(choiceTimer);
    resolve(choose(s, i));
  }

  function resolve(r) {
    choicePanel.hidden = true;
    choicePanel.replaceChildren();
    nextBtn.disabled = false;
    appendEntries(r.entries);
    renderStatus();
    persist();
    if (r.died) return deathScreen(s);
    schedule();
  }

  function step() {
    const r = advanceYear(s);
    appendEntries(r.entries);
    renderStatus();
    persist();
    if (r.died) return deathScreen(s);
    if (r.pendingChoice) { showChoice(r.pendingChoice); return; }
    schedule();
  }

  function schedule() {
    clearTimeout(yearTimer);
    if (paused || getPendingChoice(s)) return;
    const base = FAST ? 50 : PACE_MS[s.settings.pace] || PACE_MS.standard;
    yearTimer = setTimeout(step, FAST ? base : base / speed);
  }

  appendEntries(s.log);
  renderStatus();
  const pending = getPendingChoice(s);
  if (pending) showChoice(pending); else schedule();
}

// ---------------------------------------------------------------------------------------------
// Screen 4: death and summary
// ---------------------------------------------------------------------------------------------

function deathScreen(s) {
  const sum = getSummary(s);
  const li = (t) => el('li', {}, t);
  const cmp = sum.lifespan;
  const sign = (n) => (n >= 0 ? `多 ${n}` : `少 ${-n}`);
  const nodes = [
    el('h1', {}, `${sum.name}在 ${sum.deathYear} 年離開，享年 ${sum.age} 歲`),
    el('p', {}, sum.cause ? `${sum.cause.label}：${sum.cause.text}` : ''),
    el('div', { class: 'card' },
      el('h3', {}, '壽命對照'),
      el('p', {}, `${sum.homeCountry.name}同年代出生者平均 ${cmp.countryLe} 歲（你${sign(cmp.vsCountry)}年）；世界平均 ${cmp.worldLe} 歲（你${sign(cmp.vsWorld)}年）。`)),
    el('div', { class: 'card' },
      el('h3', {}, '這一生'),
      el('ul', {},
        li(`學歷：${sum.education.label}（${sum.education.years} 年）`),
        li(`工作：${sum.jobs.length ? sum.jobs.join('、') : '無'}`),
        li(`伴侶：${sum.partner ? sum.partner.name : '無'}；結婚 ${sum.marriages} 次、離婚 ${sum.divorces} 次`),
        li(`子女：${sum.children.total} 位（${sum.children.alive} 位在世）`),
        li(`住過的地方：${sum.countriesLived.join('、')}`),
        li(`做過 ${sum.counts.choices} 次重大抉擇`))),
    el('div', { class: 'card' }, el('h3', {}, '重要時刻'), el('ul', {}, sum.highlights.length ? sum.highlights.map((h) => li(`${h.age} 歲：${h.text}`)) : li('平凡而完整的一生。'))),
  ];
  if (sum.suicide) {
    nodes.push(el('div', { class: 'card' }, el('h3', {}, '如果你或身邊的人需要幫助'),
      el('p', {}, '台灣：1925 安心專線（24 小時）、1995 生命線。其他地區請聯絡當地的心理健康或危機專線。')));
  }
  nodes.push(el('button', { class: 'primary', onclick: settingsScreen }, '再投胎一次'));
  store(SAVE_KEY, null);
  show(...nodes);
}

settingsScreen();
