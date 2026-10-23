// 離世: a quiet transition between the last year and the review.

import { S } from '../../strings.js';
import { getSummary } from '../../engine/summary.js';
import { el, svg, announce, reducedMotion, FAST } from '../dom.js';

function skyArt() {
  const s = svg('svg', { class: 'death-art', viewBox: '0 0 200 120', 'aria-hidden': 'true', focusable: 'false' });
  [[30, 30, 1.6], [62, 14, 1.2], [150, 22, 1.8], [176, 58, 1.2], [18, 74, 1.2], [118, 40, 1], [96, 8, 1.4], [188, 100, 1]].forEach(([x, y, r], i) =>
    s.append(svg('circle', { cx: x, cy: y, r, class: 'death-star', style: `--d:${(i * 0.37).toFixed(2)}s` })));
  s.append(svg('path', { d: 'M104 22a30 30 0 1 0 30 44 24 24 0 1 1-30-44z', class: 'death-moon' }));
  return s;
}

export default function mount(ctx, root) {
  const state = ctx.session.state;
  const sum = getSummary(state);
  ctx.setTitle(S.death.title);
  ctx.session.finish();

  const instant = reducedMotion() || FAST;
  const btn = el('a', { class: 'btn btn-primary btn-lg death-next', href: '#/summary', 'data-action': 'to-summary' }, S.death.continue);

  const screen = el('div', { class: `screen screen-death${instant ? ' instant' : ''}` },
    skyArt(),
    el('p', { class: 'eyebrow death-eyebrow' }, `${sum.birthYear} – ${sum.deathYear}`),
    el('h1', { class: 'death-title' }, S.death.leaves(sum.name, sum.deathYear, sum.age)),
    sum.cause ? el('div', { class: 'death-cause' }, el('p', { class: 'death-cause-label' }, `${S.death.causeLabel}：${sum.cause.label}`), el('p', { class: 'death-cause-text' }, sum.cause.text)) : null,
    el('div', { class: 'death-actions' }, btn),
  );
  root.append(screen);
  announce(S.death.leaves(sum.name, sum.deathYear, sum.age));
  if (!instant) {
    const t = setTimeout(() => btn.focus(), 5200);
    return () => clearTimeout(t);
  }
  return undefined;
}
