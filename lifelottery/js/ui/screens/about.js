// 關於: data sources (from the header of js/data/countries.js), methodology, disclaimer, credits, helplines.

import { S } from '../../strings.js';
import { el, icon } from '../dom.js';

const A = S.about;

export default function mount(ctx, root) {
  ctx.setTitle(A.title);
  const section = (id, title, ...kids) => el('section', { class: 'card prose', 'aria-labelledby': id }, el('h2', { id, class: 'card-title' }, title), ...kids);

  root.append(el('div', { class: 'screen screen-narrow screen-about' },
    el('header', { class: 'screen-head' }, el('p', { class: 'eyebrow' }, A.eyebrow), el('h1', null, A.title), el('p', { class: 'lead' }, A.intro)),

    section('about-sources', A.sourcesTitle,
      el('p', null, A.sourcesLead),
      el('dl', { class: 'sources' }, A.sources.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v)))),
      el('h3', null, A.estimatesTitle),
      el('p', null, A.estimates)),

    section('about-method', A.methodTitle,
      el('dl', { class: 'sources' }, A.method.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v))))),

    section('about-disclaimer', A.disclaimerTitle, A.disclaimer.map((p) => el('p', null, p))),

    section('about-privacy', A.privacyTitle, el('p', null, A.privacy), el('p', { class: 'fine' }, A.offlineNote)),

    section('about-credit', A.creditTitle,
      el('p', null, A.credit),
      el('p', null, el('a', { href: 'https://1in8b.life', target: '_blank', rel: 'noopener noreferrer' }, A.creditLink))),

    el('aside', { class: 'help-card', 'aria-labelledby': 'about-help' },
      el('h2', { id: 'about-help' }, A.helpTitle),
      el('p', null, A.helpLead),
      el('p', { class: 'help-region' }, S.summary.helpTaiwan),
      el('ul', { class: 'help-lines' }, S.summary.helpLines.map((l) => el('li', null, el('a', { class: 'btn btn-help', href: `tel:${l.tel}` }, icon('phone'), l.name), el('span', null, l.note)))),
      el('p', { class: 'fine' }, A.helpOther)),

    el('p', { class: 'fine version' }, `${A.versionLabel} ${A.version}`),
    el('div', { class: 'review-actions' }, el('a', { class: 'btn btn-primary', href: '#/' }, icon('home'), A.backHome)),
  ));
}
