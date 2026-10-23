// 人生重心 UI pieces shared by the life screen and the review:
//   focusPicker()        the list of foci (native radios: arrow keys, screen readers, number keys via setByNumber)
//   focusTimelineCard()  the review card: a bar of the life stages coloured by focus, with a legend
// Labels and descriptions come from the engine (FOCI); the one-line effect hints and all other words from js/strings.js.

import { S } from '../strings.js';
import { FOCI, FOCUS_STAGES } from '../engine/focus.js';
import { el } from './dom.js';

const F = S.focus;
export const FOCUS_BY_ID = Object.fromEntries(FOCI.map((f) => [f.id, f]));
export const focusLabel = (id) => (FOCUS_BY_ID[id] || FOCUS_BY_ID.balance).label;

/** The life-stage name for an age ("青年初期"), from the engine's FOCUS_STAGES. */
export function stageName(age) {
  const st = FOCUS_STAGES.find((x) => age >= x.from && age <= x.to);
  return st ? st.label : '';
}

let pickerId = 0;

/**
 * @param {{ foci: {id,label,desc}[], current: string, autoId?: string|null, legend?: string }} o
 * @returns {{ node, value(): string, set(id), setByNumber(n): boolean, touched(): boolean, onChange(fn), count: number, inputs: HTMLInputElement[] }}
 */
export function focusPicker({ foci, current, autoId = null, legend = F.selectorTitle }) {
  const name = `focus-pick-${++pickerId}`;
  let changed = () => {};
  let touched = false;
  const start = foci.some((f) => f.id === current) ? current : foci[0].id;
  const inputs = [];
  const rows = foci.map((f, i) => {
    const input = el('input', { type: 'radio', name, value: f.id, checked: f.id === start, 'data-focus': f.id });
    inputs.push(input);
    input.addEventListener('change', () => { touched = true; changed(f.id); });
    return el('label', { class: `focus-opt fc-${f.id}`, 'data-focus': f.id },
      input,
      el('span', { class: 'focus-body' },
        el('span', { class: 'focus-num', 'aria-hidden': 'true' }, i + 1),
        el('span', { class: 'focus-main' },
          el('span', { class: 'focus-name' }, f.label,
            f.id === current ? el('span', { class: 'tag tag-note' }, F.current) : null,
            f.id === autoId ? el('span', { class: 'tag focus-auto-tag' }, F.autoTag) : null),
          el('span', { class: 'focus-desc' }, f.desc),
          el('span', { class: 'focus-effect' }, F.effects[f.id] || ''))));
  });
  const node = el('fieldset', { class: 'focus-picker' }, el('legend', { class: 'sr-only' }, legend), rows);
  const api = {
    node,
    inputs,
    count: foci.length,
    value: () => (inputs.find((i) => i.checked) || inputs[0]).value,
    touched: () => touched,
    set(id) { const inp = inputs.find((i) => i.value === id); if (inp) { inp.checked = true; touched = true; changed(id); } },
    setByNumber(n) { const inp = inputs[n - 1]; if (!inp) return false; inp.checked = true; inp.focus({ preventScroll: true }); touched = true; changed(inp.value); return true; },
    onChange(fn) { changed = fn; },
    /** Mark (or clear, with null) the option the automatic choice would take. */
    markAuto(id) {
      node.querySelectorAll('.focus-auto-tag').forEach((n) => n.remove());
      const lab = id && rows.find((r) => r.dataset.focus === id);
      if (lab) lab.querySelector('.focus-name').append(el('span', { class: 'tag focus-auto-tag' }, F.autoTag));
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
// Review: the focus timeline
// ---------------------------------------------------------------------------------------------

/** Ages at which a new life stage begins (axis ticks), as in the engine's FOCUS_STAGES. */
const TICKS = FOCUS_STAGES.map((s) => s.from).filter((a) => a > 0);

/**
 * @param {object} sum  album summary with `focusTimeline` [{ fromAge, toAge, focus }] (old records have none: returns null)
 */
export function focusTimelineCard(sum) {
  const segs = (Array.isArray(sum.focusTimeline) ? sum.focusTimeline : []).filter((g) => g && Number.isFinite(g.fromAge) && Number.isFinite(g.toAge));
  if (!segs.length) return null;
  const total = Math.max(1, segs[segs.length - 1].toAge + 1);
  const spans = segs.map((g) => ({ ...g, years: g.toAge - g.fromAge + 1, pct: ((g.toAge - g.fromAge + 1) / total) * 100 }));

  const bar = el('div', { class: 'ft-bar', 'aria-hidden': 'true' }, spans.map((g) => el('span', {
    class: `ft-seg fc-${g.focus}`,
    style: { '--w': `${g.pct}` },
    title: `${F.ageRange(g.fromAge, g.toAge)} ${focusLabel(g.focus)}`,
    'data-focus': g.focus,
  }, g.pct >= 17 ? el('span', { class: 'ft-seg-label' }, focusLabel(g.focus)) : null)));

  // axis: the start age of each life stage that falls inside the life (and is not crowded against the previous tick)
  const ticks = [];
  let lastPct = -100;
  for (const a of [0, ...TICKS]) {
    const pct = (a / total) * 100;
    if (a >= total || pct - lastPct < 8) continue;
    ticks.push({ a, pct });
    lastPct = pct;
  }
  const axis = el('div', { class: 'ft-axis', 'aria-hidden': 'true' }, ticks.map((t) => el('span', { style: { '--x': `${t.pct}%` }, class: t.pct > 88 ? 'is-end' : '' }, t.a)),
    el('span', { class: 'ft-axis-end' }, F.axisEnd(total - 1)));

  const years = {};
  for (const g of spans) years[g.focus] = (years[g.focus] || 0) + g.years;
  const order = FOCI.map((f) => f.id).filter((id) => years[id]);
  const legend = el('ul', { class: 'ft-legend' }, order.map((id) => el('li', { class: `fc-${id}`, 'data-focus': id },
    el('i', { class: 'ft-sw', 'aria-hidden': 'true' }), el('span', null, focusLabel(id)), el('b', null, F.years(years[id])))));

  const aria = F.barAria(spans.map((g) => F.barSeg(F.ageRange(g.fromAge, g.toAge), focusLabel(g.focus))));
  return el('section', { class: 'card focus-card', 'aria-labelledby': 'sec-focus', 'data-role': 'focus-timeline' },
    el('h2', { id: 'sec-focus', class: 'card-title' }, F.summaryTitle),
    el('p', { class: 'fine' }, F.summaryLead),
    el('div', { class: 'ft', role: 'img', 'aria-label': aria }, bar, axis),
    legend);
}
