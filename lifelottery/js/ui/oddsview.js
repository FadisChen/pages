// The "這樣一生的機率" card (summary / album detail) and "像你這樣的人" card (birth reveal): the big 約 1／N, the list of facts
// with their own odds (bars on a log scale, so the bars add up to the whole), and the method note. Numbers come from engine/odds.js.

import { S, oneInText, percentText } from '../strings.js';
import { BY_CODE } from '../data/countries.js';
import { WEALTH_LABELS } from '../engine/birth.js';
import { el } from './dom.js';

const O = S.odds;

function partLabel(part) {
  switch (part.key) {
    case 'country': return O.parts.country((BY_CODE[part.value] || { name: '' }).name);
    case 'gender': return O.parts.gender(part.value);
    case 'wealth': return O.parts.wealth(WEALTH_LABELS[part.value - 1] || '');
    case 'place': return O.parts.place(part.value);
    case 'age': return O.parts.age(part.value);
    default: return part.key;
  }
}

/** The extra line of the breakdown: the chance of getting this far with this life's own health and risks (engine/odds.js personalSurvival). */
function personalRow(personal) {
  const pct = percentText(personal.p);
  return el('li', { class: 'odds-row odds-personal-row', 'data-role': 'odds-personal', 'aria-label': O.personal.aria(personal.age, pct) },
    el('div', { class: 'odds-row-top' }, el('span', { class: 'odds-label' }, O.personal.label(personal.age)), el('span', { class: 'odds-val', 'data-role': 'odds-personal-pct' }, O.personal.value(pct))),
    el('p', { class: 'odds-personal-sub' }, O.personal.baseline(percentText(personal.baseline))),
    el('p', { class: 'odds-personal-note' }, O.personal.note));
}

/** Rows for a list of odds parts plus the total (and, when known, the personal line). */
export function oddsList(parts, total, personal = null) {
  const totalLog = Math.max(Math.log10(total.oneIn), 0.01);
  const rows = parts.map((p) => {
    const label = partLabel(p);
    const val = oneInText(p.human);
    const w = Math.max(3, Math.min(100, (Math.log10(p.oneIn) / totalLog) * 100));
    return el('li', { class: `odds-row is-${p.key}`, 'aria-label': O.rowAria(label, val) },
      el('div', { class: 'odds-row-top' }, el('span', { class: 'odds-label' }, label), el('span', { class: 'odds-val' }, val)),
      el('span', { class: 'odds-bar', 'aria-hidden': 'true' }, el('i', { style: { '--w': `${w}%` } })));
  });
  rows.push(el('li', { class: 'odds-row odds-total-row' },
    el('div', { class: 'odds-row-top' }, el('span', { class: 'odds-label' }, O.total), el('span', { class: 'odds-val' }, oneInText(total.human)))));
  if (personal) rows.push(personalRow(personal));
  return el('ul', { class: 'odds-list', 'aria-label': O.breakdown }, rows);
}

/**
 * @param {object} odds  result of lifeOdds / oddsFromState / oddsFromSummary
 * @param {{ mode: 'reveal'|'life', age?: number, drawMode?: string, attrs?: object }} opts
 */
export function oddsCard(odds, { mode, age = 0, drawMode = 'births', attrs = null, personal = null }) {
  const reveal = mode === 'reveal';
  const total = reveal ? odds.atBirth : odds;
  const parts = reveal ? odds.parts.filter((p) => p.key !== 'age') : odds.parts;
  return el('section', { class: `card odds-card${reveal ? ' odds-reveal' : ''}`, 'aria-labelledby': `odds-title-${mode}`, ...(attrs || {}) },
    el('h2', { id: `odds-title-${mode}`, class: 'card-title' }, reveal ? O.revealTitle : O.title),
    el('p', { class: 'odds-lead' }, reveal ? O.revealLead : O.summaryLead(age)),
    el('strong', { class: 'odds-big', 'data-role': 'odds-big' }, O.bigLabel(oneInText(total.human))),
    el('p', { class: 'odds-sub' }, O.mode[drawMode] || O.mode.births),
    oddsList(parts, total, reveal ? null : personal),
    el('p', { class: 'fine' }, reveal ? O.noteReveal : O.note));
}
