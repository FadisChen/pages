// 前世記錄: album of finished lives, detail view, cumulative stats, delete / clear, JSON export / import.

import { S } from '../../strings.js';
import * as store from '../../storage.js';
import { el, icon, toast, confirmDialog, downloadBlob, todayStamp, fmtInt } from '../dom.js';
import { renderReview } from '../review.js';
import { collectionCard, achievementsCard } from '../collectionview.js';

const A = S.album;

function recordCard(rec, onDelete) {
  const s = rec.summary;
  const gender = s.gender === 'M' ? '男性' : '女性';
  const pct = Math.min(100, (s.age / 100) * 100);
  return el('li', { class: 'album-card', 'data-id': rec.id },
    el('a', { class: 'album-link', href: `#/album/${encodeURIComponent(rec.id)}` }, // the card's own text is the link's name (a label would have to repeat all of it)
      el('div', { class: 'album-top' },
        el('h3', { class: 'album-name' }, s.name),
        el('span', { class: 'album-age' }, el('b', null, s.age), el('small', null, ` ${S.summary.years}`))),
      el('p', { class: 'album-meta' }, `${s.homeCountry.name}・${s.wealthShort}家庭・${gender}`),
      el('p', { class: 'album-years' }, A.cardMeta(s.birthYear, s.deathYear, s.age)),
      el('span', { class: 'album-bar', 'aria-hidden': 'true' }, el('i', { style: { '--w': `${pct}%` } })),
      el('p', { class: 'album-foot' },
        s.cause ? el('span', { class: 'tag tag-cause' }, A.cardCause(s.cause.label)) : null,
        rec.message ? el('span', { class: 'tag tag-note' }, A.hasMessage) : null,
        rec.meta && rec.meta.replay ? el('span', { class: 'tag tag-replay' }, S.replay.badge) : null),
      rec.message ? el('p', { class: 'album-note' }, `「${rec.message}」`) : null,
    ),
    el('button', { class: 'icon-btn album-delete', type: 'button', 'aria-label': A.deleteAria(s.name), title: A.delete, onclick: () => onDelete(rec) }, icon('trash')),
  );
}

function listView(ctx, root) {
  ctx.setTitle(A.title);
  const host = el('div', { class: 'screen screen-album' });
  root.append(host);
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', 'data-role': 'import-input' });

  async function removeOne(rec) {
    const ok = await confirmDialog({ title: S.summary.deleteTitle, body: S.summary.deleteBody(rec.summary.name), ok: A.delete, cancel: A.cancel, danger: true });
    if (!ok) return;
    store.deleteRecord(rec.id);
    toast(A.deleted);
    draw();
  }

  async function clearAll() {
    const n = store.loadAlbum().length;
    if (!n) return;
    const ok = await confirmDialog({ title: A.clearTitle, body: A.clearBody(n), ok: A.clearOk, cancel: A.cancel, danger: true });
    if (!ok) return;
    store.clearAlbum();
    toast(A.cleared);
    draw();
  }

  function exportJSON() {
    const list = store.loadAlbum();
    if (!list.length) { toast(A.exportNone); return; }
    downloadBlob(new Blob([store.exportAlbumJSON()], { type: 'application/json' }), A.fileName(todayStamp()));
    toast(A.exported(list.length));
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('too large');
      const { added, skipped } = store.importAlbumJSON(await file.text());
      toast(added ? A.imported(added, skipped) : A.importNone);
      draw();
    } catch (e) {
      toast(A.importFail, 'error');
    }
  });

  function draw() {
    const list = [...store.loadAlbum()].sort((a, b) => b.savedAt - a.savedAt);
    const st = store.albumStats(list);
    const stat = (label, value, unit) => el('div', { class: 'cum' }, el('dt', null, label), el('dd', null, el('b', null, fmtInt(value)), el('small', null, ` ${unit}`)));
    host.replaceChildren(
      el('header', { class: 'screen-head' }, el('p', { class: 'eyebrow' }, A.eyebrow), el('h1', null, A.title), el('p', { class: 'lead' }, A.lead)),
      list.length ? el('section', { class: 'card cumulative', 'aria-labelledby': 'cum-title' },
        el('h2', { id: 'cum-title', class: 'card-title' }, A.cumulativeTitle),
        el('dl', { class: 'cum-grid' }, stat(A.lives, st.lives, A.livesUnit), stat(A.years, st.years, A.yearsUnit), stat(A.countries, st.countries, A.countriesUnit), stat(A.longest, st.longest, A.longestUnit))) : null,
      list.length ? collectionCard(list) : null,
      list.length ? achievementsCard(list, store.loadAchievementLog()) : null,
      list.length ? el('h2', { class: 'card-title list-title' }, A.listTitle) : null,
      list.length
        ? el('ul', { class: 'album-list' }, list.map((r) => recordCard(r, removeOne)))
        : el('div', { class: 'card empty' }, el('p', null, A.empty), el('a', { class: 'btn btn-primary', href: '#/setup' }, A.emptyCta)),
      el('section', { class: 'tools', 'aria-label': `${A.export} / ${A.import} / ${A.clearAll}` },
        el('button', { class: 'btn btn-secondary', type: 'button', 'data-action': 'export', onclick: exportJSON }, icon('download'), A.export),
        el('button', { class: 'btn btn-secondary', type: 'button', 'data-action': 'import', onclick: () => fileInput.click() }, icon('upload'), A.import),
        list.length ? el('button', { class: 'btn btn-danger-quiet', type: 'button', 'data-action': 'clear-all', onclick: clearAll }, icon('trash'), A.clearAll) : null,
      ),
      fileInput,
    );
  }
  draw();
}

function detailView(ctx, root, id) {
  const rec = store.getRecord(id);
  if (!rec) {
    ctx.setTitle(A.notFound);
    root.append(el('div', { class: 'screen screen-narrow' }, el('h1', null, A.notFound), el('a', { class: 'btn btn-primary', href: '#/album' }, A.back)));
    return undefined;
  }
  ctx.setTitle(rec.summary.name);
  const view = renderReview(rec, ctx, { mode: 'album' });
  const del = el('button', { class: 'btn btn-danger-quiet', type: 'button', 'data-action': 'delete-record' }, icon('trash'), S.summary.deleteRecord);
  del.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: S.summary.deleteTitle, body: S.summary.deleteBody(rec.summary.name), ok: A.delete, cancel: A.cancel, danger: true });
    if (!ok) return;
    store.deleteRecord(rec.id);
    toast(A.deleted);
    ctx.go('/album');
  });
  view.node.querySelector('.review-actions').append(del);
  root.append(view.node);
  return () => view.destroy();
}

export default function mount(ctx, root, arg) {
  return arg ? detailView(ctx, root, arg) : listView(ctx, root);
}
