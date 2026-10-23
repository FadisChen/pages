// 設定: era, draw mode, life length, auto-choice. Submitting draws the lottery.

import { S } from '../../strings.js';
import { el, icon } from '../dom.js';
import { loadSettings, saveSettings } from '../../storage.js';

/** A fieldset of radio "cards": real radio inputs (keyboard + screen reader native), styled as tiles. */
function radioGroup(name, legend, options, value, cls = '') {
  return el('fieldset', { class: `field ${cls}` },
    el('legend', null, legend),
    el('div', { class: 'tiles' }, options.map(([val, title, desc]) => {
      const id = `${name}-${val}`;
      return el('div', { class: 'tile' },
        el('input', { type: 'radio', name, id, value: val, checked: val === value }),
        el('label', { for: id }, el('span', { class: 'tile-title' }, title), el('span', { class: 'tile-desc' }, desc)),
      );
    })),
  );
}

export default function mount(ctx, root) {
  ctx.setTitle(S.setup.title);
  const cfg = loadSettings();
  const T = S.setup;

  const era = radioGroup('era', T.era.legend, ['past', 'present', 'future', 'random'].map((k) => [k, T.era[k][0], T.era[k][1]]), cfg.era);
  const mode = radioGroup('drawMode', T.drawMode.legend, ['births', 'population'].map((k) => [k, T.drawMode[k][0], T.drawMode[k][1]]), cfg.drawMode, 'tiles-wide');
  const pace = radioGroup('pace', T.pace.legend, ['short', 'standard', 'long'].map((k) => [k, T.pace[k][0], T.pace[k][1]]), cfg.pace, 'tiles-3');

  const auto = el('fieldset', { class: 'field' },
    el('legend', null, T.auto.legend),
    el('label', { class: 'switch-row', for: 'autoChoice' },
      el('span', { class: 'switch-text' }, T.auto.label),
      el('input', { type: 'checkbox', id: 'autoChoice', name: 'autoChoice', role: 'switch', checked: cfg.autoChoice }),
      el('span', { class: 'switch', 'aria-hidden': 'true' }),
    ),
  );

  const form = el('form', { class: 'setup-form', novalidate: true },
    era, mode, pace, auto,
    el('p', { class: 'fine' }, T.pace.note),
    el('p', { class: 'fine focus-note', 'data-role': 'focus-note' }, icon('target', 'icon icon-inline'), ' ', T.focusNote),
    el('p', { class: 'fine notice-inline' }, el('span', { class: 'notice-badge small', 'aria-hidden': 'true' }, S.landing.noticeBadge), ' ', T.notice),
    el('div', { class: 'form-actions' },
      el('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, icon('star'), T.submit),
      el('a', { class: 'btn btn-quiet', href: '#/' }, T.cancel),
    ),
  );

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const settings = saveSettings({
      era: fd.get('era'),
      drawMode: fd.get('drawMode'),
      pace: fd.get('pace'),
      autoChoice: fd.get('autoChoice') === 'on',
    });
    ctx.session.discard();
    ctx.session.start(settings);
    ctx.go('/lottery');
  });

  root.append(el('div', { class: 'screen screen-narrow' },
    el('header', { class: 'screen-head' }, el('p', { class: 'eyebrow' }, S.landing.eyebrow), el('h1', null, T.title), el('p', { class: 'lead' }, T.lead)),
    form,
  ));
}
