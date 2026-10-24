// 同一起點，再活一次: the button, the 重活 badge with a link to the previous life, and the compact comparison with that life.
//
// A life's start (country, city or countryside, gender, wealth quintile, name and culture group, birth year, parents, siblings,
// religion, family business) is kept in the album record as `meta.birth`. A record from before Phase 5E has none: its summary still
// knows the country, place, gender, wealth and birth year, so the start is rebuilt from that ("partial": name and family are drawn
// again). A replayed life records `meta.replay = { prev, start, n }`: the record it repeats, the first record of that start, and its
// number among the lives of that start.

import { S, oneInText } from '../strings.js';
import * as store from '../storage.js';
import { BY_CODE } from '../data/countries.js';
import { eraOfYear } from '../data/eras.js';
import { oddsFromSummary } from '../engine/odds.js';
import { eulogyOf } from '../engine/eulogy.js';
import { el, icon, toast, confirmDialog } from './dom.js';

const R = S.replay;

/** First record of the start this record belongs to (a replay points at it; an original is its own start). */
export const startIdOf = (rec) => (rec && rec.meta && rec.meta.replay && rec.meta.replay.start) || (rec && rec.id) || '';

/** Number of the album's lives that share this record's start. */
export function livesOnStart(rec, list = store.loadAlbum()) {
  const id = startIdOf(rec);
  return list.filter((r) => startIdOf(r) === id).length;
}

/** The start to hand to createLife, rebuilt from the summary (name, family and religion are drawn again). null when the country is unknown. */
export function partialStart(rec) {
  const s = rec && rec.summary;
  if (!s || !s.homeCountry || !BY_CODE[s.homeCountry.code]) return null;
  const eraKey = ['past', 'present', 'future'].includes(s.era) ? s.era : eraOfYear(s.birthYear);
  return { v: 1, eraKey, birthYear: s.birthYear, countryCode: s.homeCountry.code, city: s.birthCity || '', urban: !!s.urbanBirth, gender: s.gender === 'M' ? 'M' : 'F', wealthQ: s.wealthQ };
}

/** { birth, partial } for a record, or null when it cannot be lived again (no usable country). */
export function startOf(rec) {
  const full = rec && rec.meta && rec.meta.birth && rec.meta.birth.name ? rec.meta.birth : null;
  if (full) return { birth: full, partial: false };
  const part = partialStart(rec);
  return part ? { birth: part, partial: true } : null;
}

/** 重活 marker for a record that repeated an earlier start: a badge with the number of the life and a link to the previous one. */
export function replayBadge(rec) {
  const rp = rec && rec.meta && rec.meta.replay;
  if (!rp) return null;
  const prev = store.getRecord(rp.prev);
  return el('p', { class: 'replay-line', 'data-role': 'replay-badge' },
    el('span', { class: 'replay-badge', 'aria-label': R.badgeAria(rp.n) }, icon('replay', 'icon icon-inline'), R.badge, el('span', { class: 'replay-n' }, ` ${R.nth(rp.n)}`)),
    ' ',
    prev
      ? el('a', { class: 'replay-prev', href: `#/album/${encodeURIComponent(prev.id)}`, 'data-role': 'replay-prev' }, R.prevLink(prev.summary.name))
      : el('span', { class: 'fine' }, R.prevGone));
}

/** The longest-held life focus of a summary (its label), or '—'. */
export function mainFocus(sum) {
  const years = {};
  for (const g of Array.isArray(sum.focusTimeline) ? sum.focusTimeline : []) {
    const key = g.label || g.focus;
    if (key) years[key] = (years[key] || 0) + Math.max(0, g.toAge - g.fromAge);
  }
  const best = Object.entries(years).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : (sum.focus && sum.focus.label) || R.noFocus;
}

/** First sentence of the 生平. */
export function eulogyOpening(rec) {
  try {
    const text = eulogyOf(rec).text || '';
    const i = text.indexOf('。');
    return i > 0 ? text.slice(0, i + 1) : text;
  } catch (e) { return ''; }
}

function oddsOf(rec) {
  try {
    const o = oddsFromSummary(rec.summary, (rec.meta && rec.meta.drawMode) || 'births');
    return o ? S.odds.bigLabel(oneInText(o.human)) : '—';
  } catch (e) { return '—'; }
}

/** The comparison rows for two records: [{ key, label, prev, now, note? }]. */
export function compareRows(prev, now) {
  const a = prev.summary, b = now.summary;
  const diff = b.age - a.age;
  return [
    { key: 'lifespan', label: R.rows.lifespan, prev: R.age(a.age), now: R.age(b.age), note: diff > 0 ? R.diffMore(diff) : diff < 0 ? R.diffLess(-diff) : R.diffSame },
    { key: 'education', label: R.rows.education, prev: a.education.label, now: b.education.label },
    { key: 'children', label: R.rows.children, prev: R.kids(a.children.total), now: R.kids(b.children.total) },
    { key: 'focus', label: R.rows.focus, prev: mainFocus(a), now: mainFocus(b) },
    { key: 'odds', label: R.rows.odds, prev: oddsOf(prev), now: oddsOf(now) },
    { key: 'opening', label: R.rows.opening, prev: eulogyOpening(prev), now: eulogyOpening(now) },
  ];
}

/** Card with the comparison against the previous life of the same start; null when this is not a replay or the previous record is gone. */
export function compareSection(rec) {
  const rp = rec && rec.meta && rec.meta.replay;
  const prev = rp && store.getRecord(rp.prev);
  if (!prev) return null;
  const rows = compareRows(prev, rec);
  return el('section', { class: 'card replay-card', 'aria-labelledby': 'sec-replay', 'data-role': 'replay-compare' },
    el('h2', { id: 'sec-replay', class: 'card-title' }, R.compareTitle),
    el('p', { class: 'fine' }, R.compareLead),
    el('table', { class: 'replay-table' },
      el('thead', null, el('tr', null, el('th', { scope: 'col', class: 'sr-only' }, R.colItem), el('th', { scope: 'col' }, R.colPrev), el('th', { scope: 'col' }, R.colNow))),
      el('tbody', null, rows.map((r) => el('tr', { 'data-row': r.key },
        el('th', { scope: 'row' }, r.label),
        el('td', { 'data-label': R.colPrev }, r.prev),
        el('td', { 'data-label': R.colNow }, r.now, r.note ? el('small', { class: 'replay-note' }, r.note) : null))))));
}

/**
 * The "same start, live again" card with its button. Starts a new life from the record's start (the player's current settings, the
 * record's draw mode) and goes to the lottery. A life in progress is only dropped after the player confirms.
 */
export function replayCta(ctx, rec) {
  const st = startOf(rec);
  if (!st) return null;
  const btn = el('button', { class: 'btn btn-secondary', type: 'button', 'data-action': 'replay' }, icon('replay'), R.button);
  btn.addEventListener('click', async () => {
    const cur = ctx.session.peek();
    if (cur && cur.state.alive && cur.recordId !== rec.id) {
      const ok = await confirmDialog({ title: R.confirmTitle, body: R.confirmBody(cur.state.name.full, cur.state.age), ok: R.confirmOk, cancel: S.album.cancel, danger: true });
      if (!ok) return;
    }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    const album = store.loadAlbum();
    const start = startIdOf(rec);
    const link = { prev: rec.id, start, n: livesOnStart(rec, album) + 1 };
    const base = store.loadSettings();
    const settings = { ...base, era: st.birth.eraKey, drawMode: (rec.meta && rec.meta.drawMode) || base.drawMode };
    ctx.session.discard();
    try {
      try {
        await ctx.session.start(settings, { birth: st.birth, replay: link });
      } catch (e) {
        const part = partialStart(rec);
        if (st.partial || !part) throw e;
        console.warn('the stored start is not usable, rebuilding it from the summary', e);
        await ctx.session.start(settings, { birth: part, replay: link });
      }
      ctx.go('/lottery');
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      toast(R.failed, 'error');
    }
  });
  return el('section', { class: 'card replay-cta', 'aria-labelledby': 'sec-replay-cta', 'data-role': 'replay-cta' },
    el('h2', { id: 'sec-replay-cta', class: 'card-title' }, R.title),
    el('p', { class: 'fine', id: 'replay-hint' }, st.partial ? R.partialHint : R.hint),
    el('div', { class: 'replay-actions' }, btn));
}
