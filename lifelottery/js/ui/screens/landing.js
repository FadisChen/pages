// 首頁: title, live world-population ticker, content notice, start / resume.

import { S } from '../../strings.js';
import { el, svg, icon, fmtInt, confirmDialog } from '../dom.js';
import { BY_CODE } from '../../data/countries.js';
import { worldPopulationAt, birthsPerSecond, birthsSince } from '../ticker.js';

/** The lottery-stick canister illustration (decorative). */
function heroArt() {
  const s = svg('svg', { class: 'hero-art', viewBox: '0 0 220 200', 'aria-hidden': 'true', focusable: 'false' });
  const sticks = [
    { x: 74, rot: -9, h: 96, mark: false },
    { x: 96, rot: -3, h: 118, mark: false },
    { x: 118, rot: 5, h: 104, mark: false },
    { x: 140, rot: 11, h: 90, mark: false },
  ];
  sticks.forEach((st, i) => {
    const g = svg('g', { transform: `rotate(${st.rot} ${st.x} 150)`, class: 'stick' });
    g.append(svg('rect', { x: st.x - 6, y: 150 - st.h, width: 12, height: st.h, rx: 3, class: 'stick-body' }));
    g.append(svg('rect', { x: st.x - 6, y: 150 - st.h, width: 12, height: 14, rx: 3, class: i === 1 ? 'stick-tip stick-tip-hot' : 'stick-tip' }));
    s.append(g);
  });
  s.append(svg('path', { d: 'M62 148h96l-7 44a8 8 0 0 1-8 7H77a8 8 0 0 1-8-7z', class: 'canister' }));
  s.append(svg('path', { d: 'M62 148h96', class: 'canister-rim' }));
  s.append(svg('rect', { x: 94, y: 160, width: 32, height: 26, rx: 4, class: 'canister-label' }));
  s.append(svg('text', { x: 110, y: 180, 'text-anchor': 'middle', class: 'canister-char' }, '籤'));
  // stars
  [[28, 36, 2.4], [186, 28, 2], [200, 90, 1.6], [18, 110, 1.8], [168, 60, 1.4]].forEach(([x, y, r]) => s.append(svg('circle', { cx: x, cy: y, r, class: 'hero-star' })));
  s.append(svg('path', { d: 'M178 18a14 14 0 1 0 14 22 11 11 0 1 1-14-22z', class: 'hero-moon' }));
  return s;
}

export default function mount(ctx, root) {
  ctx.setTitle(null);
  const saved = ctx.session.peek();
  const alive = saved && saved.state.alive;
  const finished = saved && !saved.state.alive;

  // ---- ticker ----
  const popEl = el('span', { class: 'ticker-num', 'aria-hidden': 'true' }, '—');
  const bpsEl = el('strong', null, '—');
  const sinceEl = el('span', null, '0');
  const openedAt = Date.now();
  const bps = birthsPerSecond();
  const srPop = `${S.landing.popApprox((worldPopulationAt() / 1e8).toFixed(1).replace(/\.0$/, ''))}`;
  function tick() {
    popEl.textContent = fmtInt(worldPopulationAt());
    sinceEl.textContent = fmtInt(birthsSince(openedAt));
  }
  tick();
  bpsEl.textContent = bps.toFixed(1);
  const timer = setInterval(tick, 250);

  const ticker = el('section', { class: 'card ticker', 'aria-labelledby': 'ticker-title' },
    el('h2', { id: 'ticker-title', class: 'eyebrow' }, S.landing.worldNow),
    el('p', { class: 'sr-only' }, srPop),
    el('p', { class: 'ticker-line' }, popEl, el('span', { class: 'ticker-unit' }, S.landing.peopleUnit)),
    el('p', { class: 'ticker-sub' }),
    el('p', { class: 'ticker-since', 'aria-hidden': 'true' }),
    el('p', { class: 'fine' }, S.landing.tickerNote),
  );
  // Compose the localized sentences around the live elements without innerHTML.
  const sub = ticker.querySelector('.ticker-sub');
  const [subBefore, subAfter] = S.landing.birthsPerSecond('\u0000').split('\u0000');
  sub.replaceChildren(subBefore, bpsEl, subAfter);
  const since = ticker.querySelector('.ticker-since');
  const [sBefore, sAfter] = S.landing.sinceOpened('\u0000').split('\u0000');
  since.replaceChildren(sBefore, sinceEl, sAfter);

  // ---- resume card ----
  let resume = null;
  if (alive || finished) {
    const st = saved.state;
    const countryName = BY_CODE[st.countryCode]?.name || '';
    resume = el('section', { class: 'card resume', 'aria-labelledby': 'resume-title' },
      el('h2', { id: 'resume-title', class: 'eyebrow' }, S.landing.resumeTitle),
      el('p', { class: 'resume-line' }, S.landing.resumeCard(st.name.full, st.age, countryName || st.countryCode)),
      el('a', { class: 'btn btn-primary btn-block', href: alive ? '#/life' : '#/summary', 'data-action': 'resume' }, icon('arrowRight'), alive ? S.landing.resume : S.landing.reviewLast),
    );
  }

  // ---- start ----
  const startBtn = el('a', { class: `btn ${resume ? 'btn-secondary' : 'btn-primary'} btn-block`, href: '#/setup', 'data-action': 'start' }, S.landing.start);
  startBtn.addEventListener('click', async (ev) => {
    if (!alive) return;
    ev.preventDefault();
    const ok = await confirmDialog({
      title: S.landing.confirmNewTitle,
      body: S.landing.confirmNewBody(saved.state.name.full, saved.state.age),
      ok: S.landing.confirmNewOk, cancel: S.album.cancel, danger: true,
    });
    if (ok) { ctx.session.discard(); ctx.go('/setup'); }
  });

  const notice = el('aside', { class: 'notice', 'aria-labelledby': 'notice-title' },
    el('span', { class: 'notice-badge', 'aria-hidden': 'true' }, S.landing.noticeBadge),
    el('div', null, el('h2', { id: 'notice-title', class: 'notice-title' }, S.landing.noticeTitle), el('p', null, S.landing.notice)),
  );

  const pitch = el('ol', { class: 'pitch' }, S.landing.pitch.map(([t, d], i) => el('li', null, el('span', { class: 'pitch-n', 'aria-hidden': 'true' }, i + 1), el('div', null, el('strong', null, t), el('p', null, d)))));

  root.append(el('div', { class: 'screen screen-landing' },
    el('section', { class: 'hero' },
      heroArt(),
      el('p', { class: 'eyebrow hero-eyebrow' }, S.landing.eyebrow),
      el('h1', { class: 'hero-title' }, S.landing.title),
      el('p', { class: 'hero-tagline' }, S.tagline),
    ),
    ticker,
    resume,
    el('div', { class: 'cta' },
      startBtn,
      el('div', { class: 'cta-row' },
        el('a', { class: 'btn btn-quiet', href: '#/album' }, icon('book'), S.landing.album),
        el('a', { class: 'btn btn-quiet', href: '#/about' }, icon('info'), S.landing.about),
      ),
    ),
    notice,
    pitch,
  ));

  return () => clearInterval(timer);
}
