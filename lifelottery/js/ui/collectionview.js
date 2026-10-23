// 人生收藏 and 成就 on the album page, and the badge element shared with the "new achievement" card of the review.
// All numbers come from ui/achievements.js (derived from the album records); text from js/strings.js.

import { S } from '../strings.js';
import { BY_CODE } from '../data/countries.js';
import { el, icon } from './dom.js';
import { createWorldMap } from './worldmap.js';
import {
  CONTINENTS, ERAS, TOTAL_COUNTRIES, collectionStats, evaluateAchievements, ACHIEVEMENTS,
} from './achievements.js';

const C = S.collection;
const A = S.ach;

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

/** One stamp. `a` = { id, icon, done, value, goal }; `date` = unlock time in ms (0 / undefined = unknown). */
export function badgeEl(a, date = 0) {
  const [name, desc] = A.items[a.id] || [a.id, ''];
  const rot = `${(hash(a.id) % 9) - 4}deg`;
  let meta = null;
  if (a.done) meta = el('p', { class: 'badge-meta' }, date ? A.earnedOn(fmtDate(date)) : A.earned);
  else if (a.goal > 1) meta = el('div', { class: 'badge-progress' }, el('span', { class: 'badge-bar', 'aria-hidden': 'true' }, el('i', { style: { '--w': `${Math.round((a.value / a.goal) * 100)}%` } })), el('p', { class: 'badge-meta' }, A.progress(a.value, a.goal)));
  else meta = el('p', { class: 'badge-meta' }, A.locked);
  return el('li', { class: `badge ${a.done ? 'is-earned' : 'is-locked'}`, 'data-id': a.id, 'data-earned': a.done ? '1' : '0' },
    el('span', { class: 'badge-stamp', style: { '--rot': rot }, 'aria-hidden': 'true' }, icon(a.icon)),
    el('h3', { class: 'badge-name' }, name, el('span', { class: 'sr-only' }, `（${a.done ? A.earned : A.locked}）`)),
    el('p', { class: 'badge-desc' }, desc),
    meta);
}

function tile(label, valueText, sub) {
  return el('div', { class: 'col-tile' }, el('dt', null, label), el('dd', null, el('b', null, valueText), sub ? el('small', { title: sub }, sub) : null));
}

/** The 人生收藏 card: map shaded by birth count, tiles, continent and era chips, the list of countries. */
export function collectionCard(records) {
  const st = collectionStats(records);
  const names = Object.keys(st.countryCounts).map((code) => (BY_CODE[code] || {}).name).filter(Boolean);
  const map = createWorldMap({
    title: S.map.albumAlt(st.countries, TOTAL_COUNTRIES),
    desc: S.map.albumDesc(names),
    counts: st.countryCounts,
    names: (code, n) => S.map.countryTip((BY_CODE[code] || {}).name || code, n),
    className: 'col-map',
    legend: [['n1', S.map.legendFew], ['n4', S.map.legendMany]],
  });

  const legend = el('ul', { class: 'map-legend', 'aria-hidden': 'true' },
    el('li', null, el('i', { class: 'map-sw n1' }), S.map.legendFew),
    el('li', null, el('i', { class: 'map-sw n2' })),
    el('li', null, el('i', { class: 'map-sw n3' })),
    el('li', null, el('i', { class: 'map-sw n4' }), S.map.legendMany),
    el('li', null, S.map.legendCount));

  const longest = st.longest, shortest = st.shortest;
  const tiles = el('dl', { class: 'col-tiles' },
    tile(C.tiles.countries, C.of(st.countries, TOTAL_COUNTRIES)),
    tile(C.tiles.continents, C.of(st.continents, CONTINENTS.length)),
    tile(C.tiles.eras, C.of(st.eras, ERAS.length)),
    tile(C.tiles.years, C.yearsValue(st.years)),
    tile(C.tiles.longest, longest ? C.ageValue(longest.age) : '—', longest ? longest.name : ''),
    tile(C.tiles.shortest, shortest ? C.ageValue(shortest.age) : '—', shortest ? shortest.name : ''));

  const chips = (keys, counts, nameOf) => el('div', { class: 'chip-row' }, keys.map((k) => {
    const n = counts[k] || 0;
    return el('span', { class: `chip${n ? ' on' : ''}`, 'data-key': k }, nameOf(k), ' ', el('b', null, n ? C.timesBorn(n) : C.notYet));
  }));

  const sorted = Object.entries(st.countryCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const details = el('details', { class: 'col-details' },
    el('summary', null, C.countriesList(st.countries)),
    sorted.length
      ? el('div', { class: 'chip-row' }, sorted.map(([code, n]) => el('span', { class: 'chip on' }, C.countryTimes((BY_CODE[code] || {}).name || code, n))))
      : el('p', { class: 'col-empty' }, C.countriesNone));

  return el('section', { class: 'card collection-card', 'aria-labelledby': 'col-title' },
    el('h2', { id: 'col-title', class: 'card-title' }, C.title),
    el('p', { class: 'fine' }, C.lead),
    map.node, legend,
    tiles,
    el('h3', { class: 'col-sub' }, C.continentsTitle),
    chips(CONTINENTS, st.continentCounts, (k) => C.continentNames[k]),
    el('h3', { class: 'col-sub' }, C.erasTitle),
    chips(ERAS, st.eraCounts, (k) => C.eraNames[k]),
    details);
}

/** The 成就 card: every badge, earned ones first in the list order, with unlock dates from the log. */
export function achievementsCard(records, log = {}) {
  const all = evaluateAchievements(records);
  const list = [...all.filter((a) => a.done), ...all.filter((a) => !a.done)];
  const done = list.filter((a) => a.done).length;
  return el('section', { class: 'card ach-card', 'aria-labelledby': 'ach-title' },
    el('h2', { id: 'ach-title', class: 'card-title' }, A.title, el('small', null, A.summary(done, ACHIEVEMENTS.length))),
    el('ul', { class: 'badges' }, list.map((a) => badgeEl(a, log[a.id] || 0))));
}
