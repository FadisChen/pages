// 人生回顧 right after a death. The album record already exists (created at death); the message is saved into it.

import { S } from '../../strings.js';
import { renderReview } from '../review.js';

export default function mount(ctx, root) {
  const rec = ctx.session.record() || ctx.session.finish();
  if (!rec) { ctx.go('/', { replace: true }); return undefined; }
  ctx.setTitle(S.summary.title);
  const view = renderReview(rec, ctx, { mode: 'summary' });
  root.append(view.node);
  return () => {
    view.destroy();
    // Leaving the review (anywhere but a page reload) closes the book on this life.
    ctx.session.discard();
  };
}
