// The life review, shared by the summary screen (right after death) and the album detail view.
// Takes an album record ({ id, message, summary }) and returns { node, destroy }.

import { S } from '../strings.js';
import * as store from '../storage.js';
import { BY_CODE } from '../data/countries.js';
import { el, icon, toast, announce, downloadBlob, fmt1 } from './dom.js';
import { createLifeChart } from './chart.js';
import { createWorldMap } from './worldmap.js';
import { oddsCard } from './oddsview.js';
import { badgeEl } from './collectionview.js';
import { ACHIEVEMENTS, lifeFacts } from './achievements.js';
import { oddsFromSummary } from '../engine/odds.js';
import { drawShareCard, cardToBlob, cardFileName, canShareImage, shareCard, CARD_W, CARD_H } from './sharecard.js';

const T = S.summary;

function lifespanSection(sum) {
  const rows = [
    [T.lifespanYou, sum.age, 'you'],
    [T.lifespanCountry(sum.homeCountry.name), sum.lifespan.countryLe, 'country'],
    [T.lifespanWorld, sum.lifespan.worldLe, 'world'],
  ];
  const max = Math.max(100, ...rows.map((r) => r[1]));
  return el('section', { class: 'card', 'aria-labelledby': 'sec-lifespan' },
    el('h2', { id: 'sec-lifespan', class: 'card-title' }, T.lifespanTitle),
    el('ul', { class: 'span-list' }, rows.map(([label, v, kind]) =>
      el('li', { class: `span-row span-${kind}` },
        el('span', { class: 'span-label' }, label),
        el('span', { class: 'span-track', 'aria-hidden': 'true' }, el('i', { style: { '--w': `${Math.max(3, (v / max) * 100)}%` } })),
        el('span', { class: 'span-val' }, fmt1(v), el('small', null, ` ${T.years}`))))),
    el('p', { class: 'span-verdict' }, T.vsCountry(sum.lifespan.vsCountry), '；', T.vsWorld(sum.lifespan.vsWorld), '。'),
    el('p', { class: 'fine' }, T.lifespanNote),
  );
}

function highlightsSection(sum) {
  return el('section', { class: 'card', 'aria-labelledby': 'sec-highlights' },
    el('h2', { id: 'sec-highlights', class: 'card-title' }, T.highlightsTitle),
    sum.highlights.length
      ? el('ol', { class: 'highlights' }, sum.highlights.map((h) => el('li', null, el('span', { class: 'hl-age' }, S.life.ageOf(h.age)), el('span', { class: 'hl-text' }, h.text))))
      : el('p', { class: 'fine' }, sum.age < 15 ? T.highlightsEmptyYoung : T.highlightsEmpty));
}

function statsSection(sum) {
  const L = T.statLabels;
  const jobs = sum.jobs.length ? [...new Set(sum.jobs)].join('、') : T.jobsNone;
  const partner = sum.partner ? T.partnerValue(sum.partner.name, S.life.partnerStatus[sum.partner.status] || '') : T.partnerNone;
  const conds = sum.conditions.length ? sum.conditions.length : 0;
  const items = [
    [L.education, T.educationValue(sum.education.label, sum.education.years)],
    [L.jobs, jobs],
    [L.partner, partner],
    [L.marriages, T.marriagesValue(sum.marriages, sum.divorces)],
    [L.children, T.childrenValue(sum.children.total, sum.children.alive)],
    [L.countries, sum.countriesLived.length ? sum.countriesLived.join('、') : sum.homeCountry.name],
    [L.choices, T.choicesValue(sum.counts.choices)],
    [L.events, T.eventsValue(sum.counts.events + sum.counts.milestones)],
  ];
  void conds;
  return el('section', { class: 'card', 'aria-labelledby': 'sec-stats' },
    el('h2', { id: 'sec-stats', class: 'card-title' }, T.statsTitle),
    el('dl', { class: 'stat-grid' }, items.map(([k, v]) => el('div', { class: 'stat-item' }, el('dt', null, k), el('dd', null, v)))));
}

/** 人生足跡: the birth country, the countries lived in and the order of the moves. */
function mapSection(record) {
  const sum = record.summary;
  const f = lifeFacts(record);
  if (!f.code) return null;
  const route = [...f.lived];
  const moved = route.slice(1);
  const names = moved.map((c) => (BY_CODE[c] || {}).name).filter(Boolean);
  const home = sum.homeCountry.name;
  const map = createWorldMap({ title: S.map.lifeAlt(sum.name), desc: S.map.lifeDesc(home, names), birth: f.code, lived: moved, route });
  return el('section', { class: 'card map-card', 'aria-labelledby': 'sec-map' },
    el('h2', { id: 'sec-map', class: 'card-title' }, S.map.lifeTitle),
    map.node,
    el('ul', { class: 'map-legend', 'aria-hidden': 'true' },
      el('li', null, el('i', { class: 'map-sw' }), S.map.legendBirth),
      names.length ? el('li', null, el('i', { class: 'map-sw lived' }), S.map.legendLived) : null,
      names.length ? el('li', null, el('i', { class: 'map-sw move' }), S.map.legendMove) : null),
    el('p', { class: 'map-places' }, names.length ? [home, ...names].join(' → ') : S.map.lifeStayed(home)));
}

function unlockedSection(ids) {
  if (!ids || !ids.length) return null;
  const defs = ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean);
  return el('section', { class: 'card unlock-card', 'aria-labelledby': 'sec-unlock' },
    el('h2', { id: 'sec-unlock', class: 'card-title' }, S.ach.unlockedTitle),
    el('p', { class: 'fine' }, S.ach.unlockedLead),
    el('ul', { class: 'badges' }, defs.map((a) => badgeEl({ id: a.id, icon: a.icon, done: true, value: 1, goal: 1 }, Date.now()))));
}

function helpCard(extraClass = '') {
  return el('aside', { class: `help-card ${extraClass}`, 'aria-labelledby': 'help-title' },
    el('h2', { id: 'help-title' }, T.helpTitle),
    el('p', null, T.helpLead),
    el('p', { class: 'help-region' }, T.helpTaiwan),
    el('ul', { class: 'help-lines' }, T.helpLines.map((l) => el('li', null,
      el('a', { class: 'btn btn-help', href: `tel:${l.tel}` }, icon('phone'), l.name),
      el('span', null, l.note)))),
    el('p', { class: 'fine' }, T.helpOther));
}

export { helpCard };

/**
 * @param {object} record  album record
 * @param {object} ctx     router context
 * @param {{ mode: 'summary'|'album' }} opts
 */
export function renderReview(record, ctx, { mode, unlocked = [] }) {
  const sum = record.summary;
  const parts = [];
  const cleanups = [];

  // ---- hero ----
  const gender = sum.gender === 'M' ? '男性' : '女性';
  parts.push(el('header', { class: 'review-hero' },
    el('p', { class: 'eyebrow' }, T.eyebrow),
    el('h1', null, sum.name),
    el('p', { class: 'hero-years' }, T.lifespanSpan(sum.birthYear, sum.deathYear)),
    sum.age < 1
      ? el('p', { class: 'hero-age' }, el('span', { class: 'big' }, '不滿一歲'))
      : el('p', { class: 'hero-age' }, el('span', { class: 'hero-age-pre' }, '享年'), el('span', { class: 'big' }, sum.age), el('span', { class: 'hero-age-unit' }, T.years)),
    el('p', { class: 'hero-from' }, T.from(sum.homeCountry.name, sum.wealthShort, gender)),
    sum.cause ? el('p', { class: 'hero-cause' }, el('b', null, sum.cause.label), '・', sum.cause.text) : null,
  ));

  if (sum.suicide) parts.push(helpCard('help-top'));

  parts.push(unlockedSection(unlocked));

  let odds = null;
  try { odds = oddsFromSummary(sum, (record.meta && record.meta.drawMode) || 'births'); } catch (e) { console.error(e); }
  if (odds) parts.push(oddsCard(odds, { mode: 'life', age: sum.age, drawMode: (record.meta && record.meta.drawMode) || 'births' }));
  parts.push(mapSection(record));

  parts.push(lifespanSection(sum));

  // ---- chart ----
  const chart = createLifeChart(sum.statHistory, { stats: sum.stats });
  parts.push(el('section', { class: 'card', 'aria-labelledby': 'sec-chart' },
    el('h2', { id: 'sec-chart', class: 'card-title' }, T.chartTitle),
    el('p', { class: 'fine' }, T.chartDesc),
    chart.node));

  parts.push(highlightsSection(sum));
  parts.push(statsSection(sum));

  // ---- message ----
  const max = T.messageMax;
  const area = el('textarea', { id: 'life-message', class: 'message-input', rows: 3, maxlength: max, placeholder: T.messagePlaceholder, 'aria-describedby': 'message-hint message-count' });
  area.value = record.message || '';
  const count = el('span', { id: 'message-count', class: 'message-count' }, T.messageCount(area.value.length, max));
  const saveBtn = el('button', { class: 'btn btn-secondary', type: 'button', 'data-action': 'save-message' }, T.messageSave);
  let savedText = record.message || '';
  function saveMessage(silent) {
    const text = area.value.trim().slice(0, max);
    if (text === savedText && silent) return;
    const ok = store.setMessage(record.id, text);
    record.message = text;
    savedText = text;
    if (!silent) toast(ok ? T.messageSaved : S.album.storageFull, ok ? 'info' : 'error');
    redrawCard();
  }
  area.addEventListener('input', () => { count.textContent = T.messageCount(area.value.length, max); });
  saveBtn.addEventListener('click', () => saveMessage(false));
  parts.push(el('section', { class: 'card message-card', 'aria-labelledby': 'sec-message' },
    el('h2', { id: 'sec-message', class: 'card-title' }, T.messageTitle(sum.name)),
    el('p', { id: 'message-hint', class: 'fine' }, T.messageHint),
    el('label', { class: 'sr-only', for: 'life-message' }, T.messageLabel),
    area,
    el('div', { class: 'message-foot' }, count, saveBtn)));
  cleanups.push(() => { if (area.value.trim() !== savedText) saveMessage(true); });

  // ---- share card ----
  const canvas = el('canvas', { id: 'share-canvas', class: 'share-canvas', width: CARD_W, height: CARD_H, role: 'img', 'aria-label': T.shareAlt(sum.name) });
  function redrawCard() {
    try { drawShareCard(canvas, record); } catch (e) { console.error(e); toast(T.shareFail, 'error'); }
  }
  const dlBtn = el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'download-card' }, icon('download'), T.shareDownload);
  dlBtn.addEventListener('click', async () => {
    try {
      redrawCard();
      downloadBlob(await cardToBlob(canvas), cardFileName(record));
    } catch (e) { toast(T.shareFail, 'error'); }
  });
  const shareBtn = canShareImage() ? el('button', { class: 'btn btn-secondary', type: 'button', 'data-action': 'share-card' }, icon('share'), T.shareShare) : null;
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try {
        redrawCard();
        const r = await shareCard(canvas, record);
        if (r === 'shared') announce(T.shareDone);
      } catch (e) { toast(T.shareUnsupported, 'error'); }
    });
  }
  parts.push(el('section', { class: 'card share-card', 'aria-labelledby': 'sec-share' },
    el('h2', { id: 'sec-share', class: 'card-title' }, T.shareTitle),
    el('p', { class: 'fine' }, T.shareHint),
    el('div', { class: 'share-preview' }, canvas),
    el('div', { class: 'share-actions' }, dlBtn, shareBtn)));
  // Paint after layout so a slow font lookup never blocks the first render of the review.
  requestAnimationFrame(redrawCard);

  // ---- actions ----
  if (mode === 'summary') {
    const again = el('a', { class: 'btn btn-primary btn-lg', href: '#/setup', 'data-action': 'again' }, icon('star'), T.again);
    again.addEventListener('click', () => ctx.session.discard());
    parts.push(el('div', { class: 'review-actions' }, again, el('a', { class: 'btn btn-secondary', href: '#/album' }, icon('book'), T.toAlbum)));
  } else {
    parts.push(el('div', { class: 'review-actions' }, el('a', { class: 'btn btn-secondary', href: '#/album' }, icon('arrowLeft'), S.album.back)));
  }

  return {
    node: el('div', { class: 'screen screen-review' }, parts),
    area,
    destroy() { cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); },
  };
}
