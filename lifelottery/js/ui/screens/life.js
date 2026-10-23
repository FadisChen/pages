// 人生畫面: header with five stat bars, yearly timeline, controls, choice cards, family drawer.
//
// Timing: one simulated year lasts `secondsPerYear(state)` real seconds at 1x (see ../pacing.js).
// The clock only runs while nothing blocks it: not paused, no pending choice, no open drawer, tab visible.
// The game autosaves after every year and every choice, so a reload resumes exactly here.

import { S } from '../../strings.js';
import { CONDITIONS } from '../../data/conditions.js';
import { advanceYear, choose, autoChoose, getStatus, getPendingChoice, setFocus, autoFocus } from '../../engine/life.js';
import { EDU_LABELS } from '../../engine/summary.js';
import { el, icon, announce, reducedMotion, FAST, toast } from '../dom.js';
import { secondsPerYear, AUTO_CHOICE_SECONDS, AUTO_CHOICE_SECONDS_FAST } from '../pacing.js';
import { loadSettings, saveSettings, storageUnavailable } from '../../storage.js';
import { focusPicker, stageName, focusLabel } from '../focusview.js';

const T = S.life;
const F = S.focus;
const STATS = ['health', 'happiness', 'knowledge', 'wealth', 'social'];
const MINUS = '−';

const signed = (n) => (n > 0 ? `+${n}` : `${MINUS}${Math.abs(n)}`);

export default function mount(ctx, root) {
  const s = ctx.session.state;
  ctx.setTitle(s.name.full);

  // ---- clock state ----
  let userPaused = false;
  let speed = loadSettings().speed;
  let auto = !!s.settings.autoChoice;
  let elapsed = 0;
  let yearMs = secondsPerYear(s) * 1000;
  let choiceActive = false;
  let focusActive = false;   // the life-stage focus card is open (time stops, like a choice card)
  let focusUI = null;
  let autoLeft = 0;
  let autoTotal = 0;
  let dying = false;
  let modalOpen = false;
  let lastAge = null;
  let pendingEntries = [];
  let last = performance.now();
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  // ---- header ----
  const nameEl = el('h1', { class: 'life-name' }, s.name.full);
  const ageEl = el('span', { class: 'life-age' });
  const metaEl = el('p', { class: 'life-meta' });
  const pausedChip = el('span', { class: 'paused-chip', hidden: true }, T.paused);
  const familyBtn = el('button', { class: 'btn btn-quiet btn-sm family-btn', type: 'button', 'aria-haspopup': 'dialog', 'data-action': 'family' }, icon('family'), el('span', { class: 'family-label' }, T.family));
  const focusChipText = el('span', { class: 'focus-chip-text' });
  const focusChip = el('button', { class: 'focus-chip', type: 'button', 'aria-haspopup': 'dialog', 'data-action': 'focus-chip' }, icon('target'), focusChipText);
  const statEls = {};
  const statsRow = el('div', { class: 'stats', role: 'group', 'aria-label': Object.values(T.statLabels).join('、') },
    STATS.map((k) => {
      const val = el('span', { class: 'stat-val' });
      const fill = el('i', { class: 'stat-fill' });
      const node = el('div', { class: `stat stat-${k}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': T.statLabels[k], title: T.statDesc[k] },
        el('div', { class: 'stat-top' }, el('span', { class: 'stat-name' }, T.statLabels[k]), val),
        el('span', { class: 'stat-track' }, fill),
      );
      statEls[k] = { node, val, fill, shown: null };
      return node;
    }));
  const yearBar = el('div', { class: 'year-bar', 'aria-hidden': 'true' }, el('i'));
  const header = el('header', { class: 'life-head' },
    el('div', { class: 'life-id' }, el('div', { class: 'life-title' }, nameEl, ageEl), el('div', { class: 'life-meta-row' }, metaEl, pausedChip)),
    el('div', { class: 'life-side' }, focusChip, familyBtn),
    statsRow,
    yearBar,
  );

  // ---- timeline ----
  const timeline = el('ol', { class: 'timeline', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions', 'aria-label': T.timelineLabel });
  const choiceHost = el('div', { class: 'choice-host' });

  // ---- controls ----
  const playBtn = el('button', { class: 'btn btn-secondary ctl ctl-play', type: 'button', 'data-action': 'toggle-pause' });
  const speedBtns = [1, 2, 4].map((n) => el('button', { class: 'ctl-speed', type: 'button', 'data-speed': n, 'aria-label': T.speedLabel(n), onclick: () => setSpeed(n) }, `${n}×`));
  const speedGroup = el('div', { class: 'speed', role: 'group', 'aria-label': T.speed }, speedBtns);
  const nextBtn = el('button', { class: 'btn btn-secondary ctl ctl-next', type: 'button', 'data-action': 'next-year', 'aria-label': T.next }, icon('next'), el('span', { class: 'ctl-text' }, T.nextShort));
  const autoBtn = el('button', { class: 'btn btn-secondary ctl ctl-auto', type: 'button', 'data-action': 'toggle-auto', 'aria-pressed': 'false' }, icon('auto'), el('span', { class: 'ctl-text' }, T.autoShort));
  const controls = el('div', { class: 'controls', role: 'toolbar', 'aria-label': S.life.speed }, playBtn, speedGroup, nextBtn, autoBtn);

  const help = el('details', { class: 'shortcuts' },
    el('summary', null, T.shortcutsTitle),
    el('dl', null, T.shortcuts.map(([k, v]) => el('div', null, el('dt', null, el('kbd', null, k)), el('dd', null, v)))),
  );

  root.append(el('div', { class: 'screen screen-life' }, header, el('div', { class: 'life-body' }, timeline, choiceHost, help), controls));

  // ---------------------------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------------------------

  function renderHeader() {
    const st = getStatus(s);
    ageEl.textContent = T.ageOf(st.age);
    const where = [st.countryName, st.city].filter(Boolean).join(' ');
    metaEl.textContent = `${T.yearLabel(st.year)}・${where}・${st.stage}`;
    ctx.setTitle(`${st.name}・${T.ageOf(st.age)}`);
    focusChipText.textContent = st.focusLabel;
    focusChip.setAttribute('aria-label', F.chipAria(st.focusLabel));
    focusChip.title = F.chip(st.focusLabel);
    focusChip.dataset.focus = st.focus;
    for (const k of STATS) {
      const v = Math.round(st.stats[k]);
      const e = statEls[k];
      if (e.shown !== v) {
        e.val.textContent = v;
        e.fill.style.setProperty('--v', `${v}%`);
        e.node.setAttribute('aria-valuenow', String(v));
        e.node.setAttribute('aria-valuetext', `${T.statLabels[k]} ${v}`);
        e.shown = v;
      }
    }
  }

  /** Floating +/- numbers below the stat bars. */
  function floatDeltas(before) {
    for (const k of STATS) {
      const d = Math.round(s.stats[k]) - Math.round(before[k]);
      if (!d) continue;
      const f = el('span', { class: `float-delta ${d > 0 ? 'up' : 'down'}`, 'aria-hidden': 'true' }, signed(d));
      statEls[k].node.querySelectorAll('.float-delta').forEach((old) => old.remove()); // one at a time per bar
      statEls[k].node.append(f);
      setTimeout(() => f.remove(), 2200);
    }
  }

  function chipsFor(delta) {
    if (!delta) return null;
    const chips = Object.entries(delta).filter(([k, v]) => STATS.includes(k) && v).map(([k, v]) => {
      const rounded = Math.round(v);
      if (!rounded) return null;
      return el('span', { class: `chip ${rounded > 0 ? 'up' : 'down'}`, 'aria-label': `${T.statLabels[k]}${rounded > 0 ? T.deltaUp : T.deltaDown} ${Math.abs(rounded)}` },
        el('span', { 'aria-hidden': 'true' }, `${T.statLabels[k]} ${signed(rounded)}`));
    }).filter(Boolean);
    return chips.length ? el('div', { class: 'deltas' }, chips) : null;
  }

  function entryNode(e, { autoPicked = false } = {}) {
    const isNewAge = e.age !== lastAge;
    lastAge = e.age;
    const kind = e.kind || 'year';
    const body = el('div', { class: 'entry-body' });
    if (kind === 'choice') {
      body.append(el('p', { class: 'entry-chose' }, T.youChose, el('b', null, ` ${e.title}`), autoPicked ? el('span', { class: 'tag' }, T.autoShort) : null));
      body.append(el('p', { class: 'entry-text' }, e.text));
    } else if (kind === 'year') {
      body.append(el('p', { class: 'entry-text' }, e.text));
    } else if (kind === 'focus') {
      body.append(el('p', { class: 'entry-text' }, icon('target', 'icon icon-inline'), ' ', el('b', null, e.title), '：', e.text));
    } else {
      if (e.title) body.append(el('h3', { class: 'entry-title' }, kind === 'milestone' ? el('span', { class: 'star', 'aria-hidden': 'true' }, '✦ ') : null, e.title));
      body.append(el('p', { class: 'entry-text' }, e.text));
    }
    const chips = chipsFor(e.delta);
    if (chips) body.append(chips);
    return el('li', { class: `entry kind-${kind}${isNewAge ? ' new-age' : ''}`, 'data-age': e.age },
      el('div', { class: 'entry-age', 'aria-hidden': isNewAge ? null : 'true' }, isNewAge ? el('b', null, T.ageOf(e.age)) : null, isNewAge ? el('small', null, e.year) : null),
      isNewAge ? el('span', { class: 'sr-only' }, T.ageOf(e.age)) : null,
      body,
    );
  }

  const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 260;

  function appendEntries(entries, opts = {}) {
    if (!entries.length) return;
    const follow = opts.instant || nearBottom();
    let lastNode = null;
    for (const e of entries) {
      lastNode = entryNode(e, opts);
      timeline.append(lastNode);
    }
    if (follow && lastNode) scrollTo(lastNode, opts.instant);
  }

  /**
   * Bring `node` into view between the sticky header and the control bar (their heights are published as
   * --head-h / --ctl-h, which html's scroll-padding uses). A node that fits is aligned to the bottom edge of the
   * free area, so its delta chips are fully visible; one that is taller than the free area is aligned to its top.
   */
  function scrollTo(node, instant, preferred = 'end') {
    const behavior = instant || reducedMotion() ? 'auto' : 'smooth';
    syncChrome();
    const free = window.innerHeight - header.offsetHeight - controls.offsetHeight - 20;
    const tall = node.getBoundingClientRect().height > free;
    node.scrollIntoView({ block: tall ? 'start' : preferred, behavior });
  }

  /** Publish the sticky chrome's heights for scroll-padding (see css `html`). */
  function syncChrome() {
    const r = document.documentElement.style;
    r.setProperty('--head-h', `${header.offsetHeight}px`);
    r.setProperty('--ctl-h', `${controls.offsetHeight}px`);
  }
  const chromeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncChrome) : null;
  if (chromeObserver) { chromeObserver.observe(header); chromeObserver.observe(controls); }

  /** The event entry that opened a pending choice is shown together with its outcome, not twice. */
  const isPendingEvent = (e, pc) => !!pc && e.kind === 'event' && e.title === pc.title && e.text === pc.text;

  // ---------------------------------------------------------------------------------------------
  // Controls state
  // ---------------------------------------------------------------------------------------------

  const blocked = () => choiceActive || focusActive || dying;
  const running = () => !userPaused && !choiceActive && !focusActive && !dying && !modalOpen && !document.hidden;

  function refreshControls() {
    const playing = !userPaused;
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'), el('span', { class: 'ctl-text' }, playing ? T.pause : T.play));
    playBtn.setAttribute('aria-label', playing ? T.pause : T.play);
    playBtn.disabled = dying;
    nextBtn.disabled = blocked();
    speedBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)));
    autoBtn.setAttribute('aria-pressed', String(auto));
    autoBtn.setAttribute('aria-label', auto ? T.autoOn : T.autoOff);
    pausedChip.hidden = !(userPaused && !choiceActive && !dying);
    root.firstElementChild.classList.toggle('is-paused', !running());
    root.firstElementChild.classList.toggle('is-choosing', choiceActive || focusActive);
    focusChip.disabled = dying;
  }

  function setPaused(v) {
    userPaused = v;
    refreshControls();
    announce(v ? T.paused : T.play);
  }

  function setSpeed(n) {
    speed = n;
    saveSettings({ speed: n });
    refreshControls();
  }

  function setAuto(v) {
    auto = v;
    s.settings.autoChoice = v;
    saveSettings({ autoChoice: v });
    if (focusActive && focusUI) focusUI.picker.markAuto(v ? focusUI.autoId : null);
    if (choiceActive || focusActive) {
      if (v) startCountdown(); else stopCountdown();
    }
    refreshControls();
    announce(v ? T.autoOn : T.autoOff);
  }

  // ---------------------------------------------------------------------------------------------
  // Choice cards (time stops)
  // ---------------------------------------------------------------------------------------------

  let countdownEls = null;

  function startCountdown() {
    autoTotal = (FAST ? AUTO_CHOICE_SECONDS_FAST : AUTO_CHOICE_SECONDS) * 1000;
    autoLeft = autoTotal;
    if (!countdownEls) return;
    countdownEls.wrap.hidden = false;
    updateCountdown();
  }

  function stopCountdown() {
    autoLeft = 0;
    if (countdownEls) countdownEls.wrap.hidden = true;
  }

  function updateCountdown() {
    if (!countdownEls) return;
    const secs = Math.max(1, Math.ceil(autoLeft / 1000));
    const label = countdownEls.fmt(secs);
    if (countdownEls.shownSecs !== secs || countdownEls.shownLabel !== label) {
      countdownEls.text.textContent = label;
      countdownEls.shownSecs = secs;
      countdownEls.shownLabel = label;
    }
    countdownEls.bar.style.setProperty('--c', String(Math.max(0, autoLeft / autoTotal)));
  }

  function showChoice(pc) {
    choiceActive = true;
    elapsed = 0;
    const title = el('h2', { class: 'choice-title', id: 'choice-title', tabindex: '-1' }, pc.title);
    const buttons = pc.options.map((o, i) => el('button', { class: 'choice-btn', type: 'button', 'data-choice': i, onclick: () => pick(i, false) },
      el('span', { class: 'choice-num', 'aria-hidden': 'true' }, i + 1),
      el('span', { class: 'choice-main' }, el('span', { class: 'choice-label' }, o.label), o.hint ? el('span', { class: 'choice-hint' }, o.hint) : null),
    ));
    const cdText = el('span', { class: 'countdown-text' });
    const cdBar = el('i');
    const cdWrap = el('div', { class: 'countdown', hidden: true, role: 'timer' }, el('span', { class: 'countdown-track', 'aria-hidden': 'true' }, cdBar), cdText);
    countdownEls = { wrap: cdWrap, text: cdText, bar: cdBar, shownSecs: null, fmt: (n) => T.choiceAuto(n) };
    const card = el('section', { class: 'choice-card', role: 'group', 'aria-labelledby': 'choice-title' },
      el('p', { class: 'eyebrow' }, T.choiceTitle),
      title,
      el('p', { class: 'choice-text' }, pc.text),
      el('div', { class: 'choice-options' }, buttons),
      el('p', { class: 'choice-note' }, T.choiceHint),
      cdWrap,
    );
    choiceHost.replaceChildren(card);
    if (auto) startCountdown();
    refreshControls();
    announce(`${T.choiceTitle}：${pc.title}`);
    scrollTo(card, false, 'center');
    title.focus({ preventScroll: true });
  }

  function endChoiceUI() {
    choiceActive = false;
    countdownEls = null;
    autoLeft = 0;
    choiceHost.replaceChildren();
  }

  function pick(i, autoPicked) {
    if (!choiceActive) return;
    const before = { ...s.stats };
    endChoiceUI();
    const r = autoPicked ? autoChoose(s) : choose(s, i);
    const held = pendingEntries;
    pendingEntries = [];
    appendEntries([...held, ...r.entries], { autoPicked, instant: false });
    afterAction(r, before);
  }

  // ---------------------------------------------------------------------------------------------
  // Life focus (人生重心): the stage card at ages 6/12/18/25/40/60, and the chip's selector
  // ---------------------------------------------------------------------------------------------

  /** Say it in the timeline (not part of the engine log: it is only a note about what the player decided). */
  function noteFocus(prev, now) {
    const text = prev === now ? F.timelineKept(focusLabel(now)) : F.timelineSet(focusLabel(now));
    appendEntries([{ kind: 'focus', age: s.age, year: s.year, title: F.timelineTitle, text }]);
    announce(F.changed(focusLabel(now)));
  }

  /** The card shown when a new life stage starts. Same look as a choice card; the current focus is preselected. */
  function showFocusPrompt() {
    if (focusActive) return;
    focusActive = true;
    elapsed = 0;
    const st = getStatus(s);
    const autoId = autoFocus(s);
    const picker = focusPicker({ foci: st.foci, current: st.focus, autoId: auto ? autoId : null });
    const title = el('h2', { class: 'choice-title', id: 'focus-title', tabindex: '-1' }, F.promptTitle(st.age));
    const confirm = el('button', { class: 'btn btn-primary btn-block focus-confirm', type: 'button', 'data-action': 'focus-confirm' });
    const label = () => (picker.value() === st.focus ? F.confirmKeep : F.confirmPick)(focusLabel(picker.value()));
    const refresh = () => {
      confirm.replaceChildren(icon('check'), label());
      if (countdownEls) updateCountdown();
    };
    picker.onChange(refresh);
    confirm.addEventListener('click', () => confirmFocus(false));
    const cdText = el('span', { class: 'countdown-text' });
    const cdBar = el('i');
    const cdWrap = el('div', { class: 'countdown', hidden: true, role: 'timer' }, el('span', { class: 'countdown-track', 'aria-hidden': 'true' }, cdBar), cdText);
    countdownEls = { wrap: cdWrap, text: cdText, bar: cdBar, shownSecs: null, fmt: (n) => F.countdown(n, focusLabel(picker.touched() ? picker.value() : autoId)) };
    const card = el('section', { class: 'choice-card focus-card-live', role: 'group', 'aria-labelledby': 'focus-title', 'data-role': 'focus-prompt' },
      el('p', { class: 'eyebrow' }, F.promptEyebrow(stageName(st.age))),
      title,
      el('p', { class: 'choice-text' }, F.promptText),
      picker.node,
      confirm,
      el('p', { class: 'choice-note' }, F.promptHint),
      cdWrap);
    focusUI = { picker, autoId, prev: st.focus };
    choiceHost.replaceChildren(card);
    refresh();
    if (auto) startCountdown();
    refreshControls();
    announce(`${F.promptEyebrow(stageName(st.age))}。${F.promptTitle(st.age)}`);
    scrollTo(card, false, 'center');
    title.focus({ preventScroll: true });
  }

  /** Apply the focus card's selection (or, when the countdown ran out, the automatic pick unless the player chose something). */
  function confirmFocus(fromCountdown) {
    if (!focusActive || !focusUI) return;
    const { picker, autoId, prev } = focusUI;
    const id = fromCountdown && !picker.touched() ? autoId : picker.value();
    focusActive = false;
    focusUI = null;
    countdownEls = null;
    autoLeft = 0;
    choiceHost.replaceChildren();
    const now = setFocus(s, id);
    ctx.session.persist();
    noteFocus(prev, now);
    renderHeader();
    // the choice that arrived in the same year (if any) comes next
    const pc = getPendingChoice(s);
    if (pc) showChoice(pc); else refreshControls();
    last = performance.now();
  }

  /** The chip's selector: the foci open at this age, with their effects. Applies the selection on confirm. */
  function openFocusSelector() {
    if (dying || modalOpen) return;
    if (focusActive) { const c = choiceHost.querySelector('.choice-card'); if (c) scrollTo(c, false, 'center'); return; }
    const st = getStatus(s);
    const picker = focusPicker({ foci: st.foci, current: st.focus });
    const closeBtn = el('button', { class: 'icon-btn drawer-close', type: 'button', 'aria-label': T.close }, icon('close'));
    const confirm = el('button', { class: 'btn btn-primary btn-block focus-confirm', type: 'button', 'data-action': 'focus-apply' });
    const refresh = () => confirm.replaceChildren(icon('check'), (picker.value() === st.focus ? F.confirmKeep : F.confirmPick)(focusLabel(picker.value())));
    picker.onChange(refresh);
    refresh();
    const dlg = el('dialog', { class: 'drawer focus-drawer', 'aria-labelledby': 'focus-drawer-title', 'data-role': 'focus-selector' },
      el('div', { class: 'drawer-head' }, el('h2', { id: 'focus-drawer-title' }, F.selectorTitle), closeBtn),
      el('div', { class: 'drawer-body' },
        el('p', { class: 'fine focus-lead' }, F.selectorLead(st.age, stageName(st.age), st.focusLabel)),
        picker.node,
        confirm));
    let applied = false;
    const close = () => dlg.close();
    closeBtn.addEventListener('click', close);
    confirm.addEventListener('click', () => {
      const id = picker.value();
      applied = true;
      dlg.close();
      const prev = s.focus;
      const now = setFocus(s, id);
      ctx.session.persist();
      if (id !== prev || now !== prev) noteFocus(prev, now);
      else announce(F.changed(focusLabel(now)));
      renderHeader();
    });
    dlg.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^[1-9]$/.test(ev.key) && picker.setByNumber(Number(ev.key))) ev.preventDefault();
      else if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); confirm.click(); }
    });
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) close(); });
    dlg.addEventListener('close', () => { dlg.remove(); modalOpen = false; last = performance.now(); refreshControls(); if (!applied) focusChip.focus(); else focusChip.focus(); });
    document.body.append(dlg);
    modalOpen = true;
    refreshControls();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    const cur = picker.inputs.find((i) => i.checked);
    (cur || closeBtn).focus();
  }

  // ---------------------------------------------------------------------------------------------
  // Year step / death
  // ---------------------------------------------------------------------------------------------

  function afterAction(r, before) {
    renderHeader();
    floatDeltas(before);
    ctx.session.persist();
    if (storageUnavailable() && !ctx.session.warnedAboutStorage()) toast(S.album.storageOff, 'error');
    if (r.died) { onDeath(); return; }
    // A new life stage asks for a focus first (time is stopped); a choice that came with it follows once it is answered.
    if (getStatus(s).focusPrompt) { showFocusPrompt(); return; }
    if (r.pendingChoice) { showChoice(r.pendingChoice); return; }
    refreshControls();
  }

  function step() {
    if (blocked()) return;
    elapsed = 0;
    const before = { ...s.stats };
    const r = advanceYear(s);
    const pc = r.pendingChoice;
    const shown = [];
    for (const e of r.entries) {
      if (isPendingEvent(e, pc)) pendingEntries.push(e); else shown.push(e);
    }
    appendEntries(shown);
    afterAction(r, before);
    const lastText = shown.filter((e) => e.kind !== 'death').map((e) => e.text).pop();
    if (lastText && !dying) announce(T.announceYear(T.ageOf(s.age), lastText));
  }

  function onDeath() {
    dying = true;
    stopCountdown();
    refreshControls();
    root.firstElementChild.classList.add('is-dying');
    announce(T.dying);
    ctx.session.finish();
    later(() => ctx.go('/death'), FAST ? 60 : 1800);
  }

  // ---------------------------------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------------------------------

  function frame() {
    const now = performance.now();
    const dt = Math.min(now - last, 1000);
    last = now;
    if (dying || modalOpen || document.hidden) return;
    if (choiceActive || focusActive) {
      if (auto && autoLeft > 0) {
        autoLeft -= dt;
        updateCountdown();
        if (autoLeft <= 0) { if (focusActive) confirmFocus(true); else pick(0, true); }
      }
      return;
    }
    if (userPaused) return;
    elapsed += FAST ? dt : dt * speed;
    yearBar.firstElementChild.style.setProperty('--p', String(Math.min(1, elapsed / yearMs)));
    if (elapsed >= yearMs) step();
  }
  const clock = setInterval(frame, FAST ? 8 : 100);

  // ---------------------------------------------------------------------------------------------
  // Family drawer
  // ---------------------------------------------------------------------------------------------

  function openFamily() {
    const st = getStatus(s);
    const P = T.people;
    const person = (label, name, detail, dead) => el('li', { class: `person${dead ? ' is-dead' : ''}` },
      el('span', { class: 'person-role' }, label),
      el('span', { class: 'person-name' }, name),
      el('span', { class: 'person-detail' }, detail));
    const parent = (label, p) => person(label, p.name, p.alive ? `${P.alive}・${P.ageOf(p.age)}` : P.deceased, !p.alive);
    const section = (title, ...items) => el('section', { class: 'drawer-sec' }, el('h3', null, title), ...items);

    const job = st.jobName ? `${T.workStatus[st.workStatus] || ''}・${st.jobName}` : (T.workStatus[st.workStatus] || '');
    const edu = `${EDU_LABELS[st.edu.level] || ''}${st.edu.inSchool ? `（${T.eduStudying}）` : ''}`;
    const conds = st.conditions.map((id) => CONDITIONS[id]?.label || id);

    const you = section(P.you,
      el('dl', { class: 'kv' },
        el('div', null, el('dt', null, T.stage), el('dd', null, `${st.stage}・${T.ageOf(st.age)}`)),
        el('div', null, el('dt', null, P.education), el('dd', null, edu)),
        el('div', null, el('dt', null, P.work), el('dd', null, job || P.none)),
        el('div', null, el('dt', null, P.health), el('dd', null, conds.length ? conds.join('、') : P.noConditions, st.smoker ? `・${P.smoker}` : '')),
      ));
    const parents = section(`${P.mother}／${P.father}`, el('ul', { class: 'people' }, parent(P.mother, st.mother), parent(P.father, st.father)),
      el('p', { class: 'fine' }, P.siblingCount(st.siblings)));
    const partner = section(P.partner, st.partner
      ? el('ul', { class: 'people' }, person(T.partnerStatus[st.partner.status] || '', st.partner.name, P.ageOf(st.partner.age), false))
      : el('p', { class: 'fine' }, P.noPartner));
    const kids = section(P.children, st.children.length
      ? el('ul', { class: 'people' }, st.children.map((c) => person(P.girlOrBoy[c.gender] || '', c.name, c.alive ? `${P.alive}・${P.ageOf(c.age)}` : P.deceased, !c.alive)))
      : el('p', { class: 'fine' }, P.noChildren));

    const closeBtn = el('button', { class: 'icon-btn drawer-close', type: 'button', 'aria-label': T.close }, icon('close'));
    const dlg = el('dialog', { class: 'drawer', 'aria-labelledby': 'drawer-title' },
      el('div', { class: 'drawer-head' }, el('h2', { id: 'drawer-title' }, T.familyTitle), closeBtn),
      el('div', { class: 'drawer-body' }, you, parents, partner, kids));
    const close = () => dlg.close();
    closeBtn.addEventListener('click', close);
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) close(); });
    dlg.addEventListener('close', () => { dlg.remove(); modalOpen = false; last = performance.now(); refreshControls(); familyBtn.focus(); });
    document.body.append(dlg);
    modalOpen = true;
    refreshControls();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    closeBtn.focus();
  }

  // ---------------------------------------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------------------------------------

  playBtn.addEventListener('click', () => setPaused(!userPaused));
  nextBtn.addEventListener('click', () => step());
  autoBtn.addEventListener('click', () => setAuto(!auto));
  familyBtn.addEventListener('click', openFamily);
  focusChip.addEventListener('click', openFocusSelector);

  function onKey(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || modalOpen) return;
    const t = ev.target;
    const tag = t && t.tagName;
    const k = ev.key;
    const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable) || (tag === 'INPUT' && t.type !== 'radio');
    if (typing) return;
    // the life-stage focus card: number keys choose, Enter confirms (radios and buttons keep their own Enter/Space)
    if (focusActive && focusUI) {
      if (/^[1-9]$/.test(k)) { if (focusUI.picker.setByNumber(Number(k))) ev.preventDefault(); return; }
      if (k === 'Enter' && tag !== 'BUTTON' && tag !== 'A' && tag !== 'SUMMARY') { ev.preventDefault(); confirmFocus(false); return; }
    }
    if (tag === 'INPUT') return;
    if (k === ' ' && tag !== 'BUTTON' && tag !== 'A' && tag !== 'SUMMARY') {
      ev.preventDefault();
      if (!blocked()) setPaused(!userPaused);
    } else if (k === 'n' || k === 'N' || (k === 'ArrowRight' && tag !== 'BUTTON')) {
      if (!blocked()) step();
    } else if (k === 'a' || k === 'A') {
      setAuto(!auto);
    } else if (k === 'f' || k === 'F') {
      openFamily();
    } else if (k === 'g' || k === 'G') {
      openFocusSelector();
    } else if (/^[1-9]$/.test(k) && choiceActive) {
      const i = Number(k) - 1;
      const n = choiceHost.querySelectorAll('.choice-btn').length;
      if (i < n) pick(i, false);
    }
  }
  document.addEventListener('keydown', onKey);

  function onVisibility() {
    last = performance.now();
    refreshControls();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ---- initial paint (also the resume path: existing log + possibly a pending choice) ----
  const pending = getPendingChoice(s);
  const initial = [];
  for (const e of s.log) {
    if (pending && isPendingEvent(e, pending) && e === s.log.findLast((x) => isPendingEvent(x, pending))) pendingEntries.push(e);
    else initial.push(e);
  }
  appendEntries(initial, { instant: true });
  renderHeader();
  refreshControls();
  // A reload during a stage prompt asks again (flags._focusPrompt is saved); a choice that was waiting behind it follows.
  if (s.alive && getStatus(s).focusPrompt) showFocusPrompt();
  else if (pending) showChoice(pending);
  if (!s.alive) onDeath();
  if (!pending && !focusActive) window.scrollTo(0, document.documentElement.scrollHeight);

  syncChrome();

  return () => {
    clearInterval(clock);
    if (chromeObserver) chromeObserver.disconnect();
    document.documentElement.style.removeProperty('--head-h');
    document.documentElement.style.removeProperty('--ctl-h');
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    document.querySelectorAll('dialog.drawer').forEach((d) => d.remove());
  };
}
