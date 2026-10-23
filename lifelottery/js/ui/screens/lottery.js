// 抽籤動畫 + birth reveal: spinning country names, the birth card, the "100 babies" statistic and the
// country-vs-world comparison. With reduced motion, ?debug=fast, or after a reload, everything shows at once.

import { S } from '../../strings.js';
import { COUNTRIES } from '../../data/countries.js';
import { describeBirth } from '../../engine/birth.js';
import { oddsFromState } from '../../engine/odds.js';
import { createWorldMap } from '../worldmap.js';
import { oddsCard } from '../oddsview.js';
import { el, icon, reducedMotion, FAST, fmtInt, fmt1, announce } from '../dom.js';

const L = S.lottery;

function hundredDots(per100) {
  const filled = per100 >= 1 ? Math.round(per100) : 0;
  const grid = el('div', { class: 'dots', role: 'img', 'aria-label': L.hundredAria(per100 >= 1 ? filled : 0) });
  for (let i = 0; i < 100; i++) {
    const mine = i < filled;
    const rare = per100 < 1 && i === 99;
    const d = el('span', { class: `dot${mine ? ' dot-me' : ''}${rare ? ' dot-rare' : ''}`, style: mine || rare ? { '--i': String(rare ? 0 : i) } : null });
    grid.append(d);
  }
  return grid;
}

function compareRow(c, countryName) {
  const max = Math.max(c.value, c.world, 0.0001);
  const better = c.higherIsBetter ? c.value > c.world * 1.03 : c.value < c.world * 0.97;
  const worse = c.higherIsBetter ? c.value < c.world * 0.97 : c.value > c.world * 1.03;
  const verdict = better ? L.better : worse ? L.worse : L.similar;
  const show = (v) => (c.key === 'gdp' ? fmtInt(v) : fmt1(v));
  const bar = (cls, label, v) => el('div', { class: `cmp-line ${cls}` },
    el('span', { class: 'cmp-name' }, label),
    el('span', { class: 'cmp-track', 'aria-hidden': 'true' }, el('i', { style: { '--w': `${Math.max(2, (v / max) * 100)}%` } })),
    el('span', { class: 'cmp-val' }, `${show(v)}`, el('small', null, ` ${c.unit}`)),
  );
  return el('li', { class: `cmp-row ${better ? 'is-better' : worse ? 'is-worse' : 'is-same'}` },
    el('div', { class: 'cmp-head' }, el('span', { class: 'cmp-label' }, c.label), el('span', { class: 'cmp-verdict' }, verdict)),
    bar('cmp-country', countryName, c.value),
    bar('cmp-world', L.compareWorld, c.world),
  );
}

export default function mount(ctx, root) {
  ctx.setTitle(L.title);
  const s = ctx.session.state;
  const animate = ctx.session.consumeFresh() && !reducedMotion() && !FAST;
  const b = describeBirth(s);
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  // ---- spinner ----
  const slotName = el('span', { class: 'slot-name' }, '· · ·');
  const skipBtn = el('button', { class: 'btn btn-quiet', type: 'button' }, L.skip);
  const spinner = el('section', { class: 'card slot-card', 'aria-label': L.title },
    el('h1', { class: 'eyebrow spin-title' }, L.spinning),
    el('div', { class: 'slot', 'aria-hidden': 'true' }, el('span', { class: 'slot-frame' }, slotName)),
    el('div', { class: 'slot-actions' }, skipBtn),
  );

  // ---- reveal ----
  const facts = [
    [L.placeLabel, b.placeText],
    [L.genderLabel, b.genderLabel],
    [L.wealthLabel, el('span', { class: 'wealth' }, b.wealthLabel, el('span', { class: 'pips', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => el('i', { class: n <= b.wealthQ ? 'on' : '' }))), el('span', { class: 'sr-only' }, ` ${L.wealthQ(b.wealthQ)}`))],
    [L.nameLabel, b.name],
  ];
  const card = el('article', { class: 'card birth-card', 'aria-labelledby': 'birth-country' },
    el('p', { class: 'eyebrow', 'data-step': '1' }, `${L.born(b.year)}・${b.eraName}`),
    el('h2', { id: 'birth-country', class: 'birth-country', 'data-step': '1' }, b.countryName),
    el('div', { class: 'birth-map', 'data-step': '1' }, createWorldMap({ title: S.map.birthTitle(b.countryName), desc: S.map.birthDesc(b.countryName), birth: b.countryCode, pulse: true, legend: [['', S.map.legendBirth]], caption: b.countryName }).node),
    el('dl', { class: 'facts' }, facts.map(([k, v], i) => el('div', { class: 'fact', 'data-step': String(2 + i) }, el('dt', null, k), el('dd', null, v)))),
    el('p', { class: 'birth-line', 'data-step': '6' }, L.bornIn(b.name, `${b.countryName}的${b.placeText}`)),
  );

  const hundred = el('section', { class: 'card hundred', 'data-step': '7', 'aria-labelledby': 'hundred-title' },
    el('h2', { id: 'hundred-title', class: 'card-title' }, L.hundredTitle),
    el('p', { class: 'hundred-text' }, L.hundredFull(b.eraLabel, b.babiesText)),
    hundredDots(b.babiesPer100),
    el('p', { class: 'legend' }, el('span', { class: 'legend-item' }, el('i', { class: 'dot dot-me' }), L.hundredLegendMe), el('span', { class: 'legend-item' }, el('i', { class: 'dot' }), L.hundredLegendOthers)),
  );

  const odds = oddsCard(oddsFromState(s), { mode: 'reveal', drawMode: s.settings.drawMode, attrs: { 'data-step': '8' } });

  const compare = el('section', { class: 'card compare', 'data-step': '9', 'aria-labelledby': 'compare-title' },
    el('h2', { id: 'compare-title', class: 'card-title' }, L.compareTitle(b.countryName)),
    el('ul', { class: 'cmp-list' }, b.comparisons.map((c) => compareRow(c, b.countryName))),
    el('p', { class: 'fine' }, L.lifeExpect(b.lifeExpectancy)),
  );

  const beginBtn = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', 'data-action': 'begin' }, icon('arrowRight'), L.begin);
  beginBtn.addEventListener('click', () => ctx.go('/life'));

  const reveal = el('div', { class: 'reveal', hidden: true },
    el('header', { class: 'screen-head' }, el('p', { class: 'eyebrow' }, S.landing.eyebrow), el('h1', null, L.revealed)),
    card, hundred, odds, compare,
    el('div', { class: 'sticky-cta' }, beginBtn),
  );

  const screen = el('div', { class: 'screen screen-narrow screen-lottery' }, spinner, reveal);
  root.append(screen);

  let revealed = false;
  function showReveal(instant) {
    if (revealed) return;
    revealed = true;
    spinner.hidden = true;
    reveal.hidden = false;
    reveal.classList.toggle('instant', instant);
    const steps = [...reveal.querySelectorAll('[data-step]')];
    if (instant) {
      steps.forEach((n) => n.classList.add('show'));
    } else {
      for (let i = 1; i <= 9; i++) {
        later(() => steps.filter((n) => n.dataset.step === String(i)).forEach((n) => n.classList.add('show')), 350 * i);
      }
    }
    announce(`${L.revealed}。${L.bornIn(b.name, `${b.countryName}的${b.placeText}`)}`);
    const h = reveal.querySelector('h1');
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  if (!animate) {
    showReveal(true);
  } else {
    // Names slow down and the last one is the real draw.
    const names = [];
    for (let i = 0; i < 24; i++) names.push(COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)].name);
    names.push(b.countryName);
    let i = 0;
    const next = () => {
      slotName.textContent = names[i];
      slotName.classList.toggle('settled', i === names.length - 1);
      if (i === names.length - 1) { later(() => showReveal(false), 900); return; }
      const p = i / (names.length - 1);
      const delay = 45 + Math.pow(p, 3) * 420;
      i++;
      later(next, delay);
    };
    next();
    skipBtn.addEventListener('click', () => { timers.forEach(clearTimeout); showReveal(true); });
    skipBtn.focus();
  }

  return () => timers.forEach(clearTimeout);
}
