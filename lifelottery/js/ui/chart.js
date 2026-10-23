// SVG life curves: the five stats over age. Colours come from CSS variables (.chart-line.<stat>),
// so the chart follows the theme. Accessible: a range slider scrubs through ages, lines can be toggled,
// and the SVG carries a text description.

import { S } from '../strings.js';
import { el, svg } from './dom.js';

export const STAT_KEYS = ['health', 'happiness', 'knowledge', 'wealth', 'social'];
const DASH = { health: null, happiness: '8 4', knowledge: '2 4', wealth: '12 3 2 3', social: '1 5' };

const W = 640, H = 340;
const M = { l: 46, r: 16, t: 16, b: 56 };

/**
 * @param {Array<{age:number,health:number,...}>} history
 * @param {{ stats?: object }} opts  summary.stats (peak info) for the text description
 * @returns {{ node: HTMLElement }}
 */
export function createLifeChart(history, opts = {}) {
  const T = S.summary;
  const labels = S.life.statLabels;
  const rows = history.length ? history : [{ age: 0, health: 0, happiness: 0, knowledge: 0, wealth: 0, social: 0 }];
  const maxAge = Math.max(1, rows[rows.length - 1].age);
  const x = (age) => M.l + (age / maxAge) * (W - M.l - M.r);
  const y = (v) => M.t + (1 - v / 100) * (H - M.t - M.b);

  const hidden = new Set();
  const root = el('div', { class: 'chart' });

  // ---- legend / toggles ----
  const swatch = (k) => svg('svg', { class: 'legend-swatch', viewBox: '0 0 28 8', 'aria-hidden': 'true' },
    svg('line', { x1: 1, y1: 4, x2: 27, y2: 4, class: `chart-line ${k}`, 'stroke-dasharray': DASH[k] || null }));
  const legend = el('div', { class: 'chart-legend', role: 'group', 'aria-label': T.chartToggle },
    STAT_KEYS.map((k) => el('button', { class: `legend-btn ${k}`, type: 'button', 'aria-pressed': 'true', 'data-stat': k, onclick: (ev) => toggle(k, ev.currentTarget) },
      swatch(k), labels[k])));

  // ---- svg ----
  const peakText = STAT_KEYS.map((k) => {
    const p = opts.stats && opts.stats[k];
    return p ? T.peak(labels[k], p.peakAge, Math.round(p.peak)) : null;
  }).filter(Boolean).join('；');
  const chart = svg('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': T.chartAria(peakText), preserveAspectRatio: 'xMidYMid meet' });

  // grid + y labels
  for (const v of [0, 25, 50, 75, 100]) {
    chart.append(svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'chart-grid' }));
    chart.append(svg('text', { x: M.l - 8, y: y(v) + 6, 'text-anchor': 'end', class: 'chart-tick' }, v));
  }
  // x ticks
  const step = maxAge > 80 ? 20 : maxAge > 30 ? 10 : maxAge > 12 ? 5 : 1;
  for (let a = 0; a <= maxAge; a += step) {
    chart.append(svg('line', { x1: x(a), x2: x(a), y1: H - M.b, y2: H - M.b + 4, class: 'chart-axis' }));
    chart.append(svg('text', { x: x(a), y: H - M.b + 26, 'text-anchor': 'middle', class: 'chart-tick' }, a));
  }
  chart.append(svg('text', { x: (M.l + W - M.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'chart-axis-label' }, T.chartAxisAge));
  chart.append(svg('line', { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, class: 'chart-axis' }));

  // lines
  const lines = {};
  const dots = {};
  for (const k of STAT_KEYS) {
    const pts = rows.map((r) => `${x(r.age).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
    const g = svg('g', { class: 'chart-series', 'data-stat': k });
    g.append(svg('polyline', { points: pts, class: `chart-line ${k}`, 'stroke-dasharray': DASH[k] || null, fill: 'none' }));
    const dot = svg('circle', { r: 4.2, class: `chart-dot ${k}`, cx: 0, cy: 0 });
    g.append(dot);
    lines[k] = g;
    dots[k] = dot;
    chart.append(g);
  }
  const guide = svg('line', { y1: M.t, y2: H - M.b, class: 'chart-guide' });
  chart.insertBefore(guide, chart.querySelector('.chart-series'));

  // ---- scrubber ----
  const readout = el('p', { class: 'chart-readout' });
  const slider = el('input', { type: 'range', class: 'chart-slider', min: 0, max: maxAge, step: 1, value: maxAge, 'aria-label': T.chartScrub });

  function rowAt(age) {
    let best = rows[0];
    for (const r of rows) if (Math.abs(r.age - age) <= Math.abs(best.age - age)) best = r;
    return best;
  }

  function setAge(age) {
    const r = rowAt(age);
    const px = x(r.age);
    guide.setAttribute('x1', px);
    guide.setAttribute('x2', px);
    const parts = [];
    for (const k of STAT_KEYS) {
      dots[k].setAttribute('cx', px);
      dots[k].setAttribute('cy', y(r[k]));
      if (!hidden.has(k)) parts.push(`${labels[k]} ${Math.round(r[k])}`);
    }
    const text = `${T.chartScrubAt(r.age)}：${parts.join('・')}`;
    readout.textContent = text;
    slider.value = String(r.age);
    slider.setAttribute('aria-valuetext', text);
  }

  function toggle(k, btn) {
    if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
    const off = hidden.has(k);
    lines[k].classList.toggle('is-off', off);
    btn.setAttribute('aria-pressed', String(!off));
    setAge(Number(slider.value));
  }

  slider.addEventListener('input', () => setAge(Number(slider.value)));
  const fromPointer = (ev) => {
    const rect = chart.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const age = Math.round(((px - M.l) / (W - M.l - M.r)) * maxAge);
    setAge(Math.max(0, Math.min(maxAge, age)));
  };
  chart.addEventListener('pointermove', fromPointer);
  chart.addEventListener('pointerdown', fromPointer);

  root.append(legend, chart, el('div', { class: 'chart-scrub' }, slider), readout);
  setAge(maxAge);
  return { node: root, setAge };
}
