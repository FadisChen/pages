// 人生回顧 right after a death. The album record already exists (created at death); the message is saved into it.

import { S } from '../../strings.js';
import * as store from '../../storage.js';
import { renderReview } from '../review.js';
import { newlyUnlocked } from '../achievements.js';
import { toast } from '../dom.js';

export default function mount(ctx, root) {
  const rec = ctx.session.record() || ctx.session.finish();
  if (!rec) { ctx.go('/', { replace: true }); return undefined; }
  ctx.setTitle(S.summary.title);
  // New achievements: earned with this life, not without it, and not announced before (the log survives reloads of this page).
  let unlocked = [];
  try {
    unlocked = newlyUnlocked(store.loadAlbum(), rec, store.loadAchievementLog());
    if (unlocked.length) store.addAchievementLog(Object.fromEntries(unlocked.map((id) => [id, Date.now()])));
  } catch (e) { console.error(e); unlocked = []; }
  const view = renderReview(rec, ctx, { mode: 'summary', unlocked });
  root.append(view.node);
  if (unlocked.length) toast(S.ach.toast(unlocked.map((id) => (S.ach.items[id] || [id])[0])), 'ach');
  return () => {
    view.destroy();
    // Leaving the review (anywhere but a page reload) closes the book on this life, unless the player has already
    // started another one from here (同一起點，再活一次): that new life is not ours to discard.
    if (ctx.session.recordId === rec.id || !ctx.session.hasLife) ctx.session.discard();
  };
}
