// Full-screen map view: pan by dragging, pinch / wheel / buttons / keys to zoom, tap a highlighted country for its name.
//
//   openMapZoom(opts, opener)   opts = the options the small map was made with (see ui/worldmap.js); opener = element to refocus.
//
// The map is the same vector SVG as the small one, drawn again with `zoom: true`; panning and zooming only change its viewBox
// (always the same aspect ratio as the stage, so there is no letterboxing and the lines stay sharp). Two CSS variables on the
// <svg> keep things readable at every zoom: --zs (1 / zoom) keeps outlines and arcs at a constant pixel width, --zm (zoom^-0.85)
// makes the rings and dots of tiny countries shrink while the shapes grow, so a ring never swallows its own country.
// Keys: arrows pan, + / - zoom, 0 resets, Esc closes (native <dialog>). With prefers-reduced-motion the buttons and keys jump
// instead of gliding. Pointer events only (mouse, touch and pen share one code path).

import { S } from '../strings.js';
import { MAP_W, MAP_H, ANCHORS } from '../data/worldmap.js';
import { el, icon, announce, reducedMotion } from './dom.js';
import { createWorldMap } from './worldmap.js';

const Z = S.map.zoom;
const MAX_ZOOM = 40;        // relative to the fitted view
const BUTTON_STEP = 1.6;
const TAP_SLOP = 8;         // px of movement that still counts as a tap
const TIP_MS = 3600;
const MARKER_EXPONENT = 0.85;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function openMapZoom(opts, opener = null) {
  const previous = opener || document.activeElement;
  const map = createWorldMap({ ...opts, zoom: true, pulse: false, className: 'mz-map' });
  const svgEl = map.svg;
  const title = opts.title || '';

  // ---- DOM ----
  const closeBtn = el('button', { class: 'icon-btn mz-close', type: 'button', 'aria-label': Z.close, 'data-action': 'close-zoom' }, icon('close'));
  const level = el('output', { class: 'mz-level', 'aria-live': 'off' }, Z.level(1));
  const btn = (action, label, ic) => el('button', { class: 'mz-btn', type: 'button', 'data-action': action, 'aria-label': label, title: label }, icon(ic));
  const inBtn = btn('zoom-in', Z.in, 'zoomIn');
  const outBtn = btn('zoom-out', Z.out, 'zoomOut');
  const resetBtn = btn('zoom-reset', Z.reset, 'fit');
  const controls = el('div', { class: 'mz-controls', role: 'group', 'aria-label': Z.controls }, inBtn, outBtn, resetBtn, level);
  const tip = el('div', { class: 'mz-tip', role: 'status', hidden: true });
  const stage = el('div', { class: 'mz-stage', tabindex: '0', role: 'group', 'aria-label': Z.stage, 'data-role': 'zoom-stage' }, map.node, tip);

  const legend = Array.isArray(opts.legend) && opts.legend.length
    ? el('ul', { class: 'map-legend mz-legend' }, opts.legend.map(([cls, text]) => el('li', null, el('i', { class: `map-sw ${cls || ''}`.trim() }), text)))
    : null;
  const foot = el('footer', { class: 'mz-foot' },
    legend,
    opts.caption ? el('p', { class: 'map-places mz-caption' }, opts.caption) : null,
    el('p', { class: 'fine mz-help' }, matchMedia('(hover: none)').matches ? Z.helpTouch : Z.help));

  const dlg = el('dialog', { class: 'mapzoom', 'aria-labelledby': 'mz-title', 'data-role': 'map-zoom' },
    el('div', { class: 'mz-head' }, el('h2', { id: 'mz-title', class: 'mz-title' }, title), closeBtn),
    el('div', { class: 'mz-body' }, stage, controls),
    foot);

  // ---- view state: centre (map units) and scale k (px per map unit) ----
  let W = 1, H = 1, k0 = 1, k = 1, cx = MAP_W / 2, cy = MAP_H / 2;
  let anim = null;
  let tipTimer = null;

  function measure() {
    W = Math.max(1, stage.clientWidth);
    H = Math.max(1, stage.clientHeight);
    const nk0 = Math.min(W / MAP_W, H / MAP_H);
    const rel = k / k0; // keep the same relative zoom when the stage is resized
    k0 = nk0;
    k = clamp(nk0 * (Number.isFinite(rel) ? rel : 1), nk0, nk0 * MAX_ZOOM);
  }

  /** Keep the view over the map: smaller than the stage -> centred, larger -> never past an edge. */
  function clampView(v) {
    const hw = W / (2 * v.k), hh = H / (2 * v.k);
    v.cx = hw * 2 >= MAP_W ? MAP_W / 2 : clamp(v.cx, hw, MAP_W - hw);
    v.cy = hh * 2 >= MAP_H ? MAP_H / 2 : clamp(v.cy, hh, MAP_H - hh);
    return v;
  }

  function apply() {
    const v = clampView({ cx, cy, k });
    cx = v.cx; cy = v.cy;
    const vw = W / k, vh = H / k;
    svgEl.setAttribute('viewBox', `${(cx - vw / 2).toFixed(3)} ${(cy - vh / 2).toFixed(3)} ${vw.toFixed(3)} ${vh.toFixed(3)}`);
    const z = k / k0;
    svgEl.style.setProperty('--zs', (1 / z).toFixed(4));
    svgEl.style.setProperty('--zm', Math.pow(z, -MARKER_EXPONENT).toFixed(4));
    level.textContent = Z.level(z);
    inBtn.disabled = z >= MAX_ZOOM - 0.01;
    outBtn.disabled = z <= 1.01;
    resetBtn.disabled = z <= 1.01 && Math.abs(cx - MAP_W / 2) < 0.5 && Math.abs(cy - MAP_H / 2) < 0.5;
  }

  function stopAnim() { if (anim) { cancelAnimationFrame(anim.id); anim = null; } }

  /** Move to a target view; glides unless the visitor prefers reduced motion. */
  function goTo(target, { instant = false } = {}) {
    stopAnim();
    const to = clampView({ cx: target.cx, cy: target.cy, k: clamp(target.k, k0, k0 * MAX_ZOOM) });
    if (instant || reducedMotion()) { cx = to.cx; cy = to.cy; k = to.k; apply(); return; }
    const from = { cx, cy, k };
    const t0 = performance.now(), dur = 220;
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      // interpolate the scale geometrically so zooming feels even
      k = from.k * Math.pow(to.k / from.k, e);
      cx = from.cx + (to.cx - from.cx) * e;
      cy = from.cy + (to.cy - from.cy) * e;
      apply();
      anim = t < 1 ? { id: requestAnimationFrame(step) } : null;
    };
    anim = { id: requestAnimationFrame(step) };
  }

  /** Zoom by `factor` keeping the map point under stage position (px, py) fixed. */
  function zoomAt(factor, px, py, opts2 = {}) {
    const nk = clamp(k * factor, k0, k0 * MAX_ZOOM);
    const wx = cx + (px - W / 2) / k, wy = cy + (py - H / 2) / k;
    const target = { k: nk, cx: wx - (px - W / 2) / nk, cy: wy - (py - H / 2) / nk };
    if (opts2.animate) goTo(target); else { stopAnim(); k = nk; cx = target.cx; cy = target.cy; apply(); }
  }

  function panBy(dxPx, dyPx, animate) {
    const target = { k, cx: cx + dxPx / k, cy: cy + dyPx / k };
    if (animate) goTo(target); else { stopAnim(); cx = target.cx; cy = target.cy; apply(); }
  }

    // The first zoom-in from the fitted view heads for the place the map is about (the birth country, or the few countries marked),
  // so the + button and key do not zoom into the middle of an ocean.
  const marked = Object.keys(map.tips).filter((c) => ANCHORS[c]);
  const focusPt = opts.birth && ANCHORS[opts.birth] ? ANCHORS[opts.birth]
    : marked.length && marked.length <= 3 ? [marked.reduce((a, c) => a + ANCHORS[c][0], 0) / marked.length, marked.reduce((a, c) => a + ANCHORS[c][1], 0) / marked.length] : null;

  const reset = () => { goTo({ cx: MAP_W / 2, cy: MAP_H / 2, k: k0 }); announce(Z.announceReset); };
  const zoomCentre = (factor) => {
    const nk = clamp(k * factor, k0, k0 * MAX_ZOOM);
    if (factor > 1 && focusPt && k / k0 < 1.05) goTo({ k: nk, cx: focusPt[0], cy: focusPt[1] });
    else zoomAt(factor, W / 2, H / 2, { animate: true });
    announce(Z.announceZoom(nk / k0));
  };

  // ---- tooltip (a tap on a highlighted country) ----
  function hideTip() { clearTimeout(tipTimer); tip.hidden = true; }
  function showTip(text, px, py) {
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${clamp(px - w / 2, 6, Math.max(6, W - w - 6))}px`;
    tip.style.top = `${py - h - 14 < 6 ? py + 18 : py - h - 14}px`;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, TIP_MS);
  }
  function tapAt(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    const hit = document.elementFromPoint(clientX, clientY);
    let code = hit && hit.closest ? (hit.closest('[data-code]') || {}).dataset?.code : null;
    if (!code || !map.tips[code]) {
      // nothing exactly under the finger: take the closest highlighted country within a thumb's reach
      let best = null, bd = 28;
      for (const c of Object.keys(map.tips)) {
        const a = ANCHORS[c];
        if (!a) continue;
        const d = Math.hypot((a[0] - cx) * k + W / 2 - px, (a[1] - cy) * k + H / 2 - py);
        if (d < bd) { bd = d; best = c; }
      }
      code = best;
    }
    if (code && map.tips[code]) { showTip(map.tips[code], px, py); announce(map.tips[code]); } else hideTip();
  }

  // ---- pointer events: drag to pan, two fingers to pinch ----
  const ptrs = new Map();
  let tap = null;          // { x, y, t } of the first press, while it still can be a tap
  let pinch = null;        // { dist, mx, my } of the previous pinch step
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    stopAnim();
    try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic pointers */ }
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ptrs.size === 1) { tap = { x: ev.clientX, y: ev.clientY, t: performance.now() }; hideTip(); stage.classList.add('is-dragging'); }
    else { tap = null; pinch = null; }
  });
  stage.addEventListener('pointermove', (ev) => {
    const p = ptrs.get(ev.pointerId);
    if (!p) return;
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    p.x = ev.clientX; p.y = ev.clientY;
    if (ptrs.size === 1) {
      if (tap && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > TAP_SLOP) tap = null;
      if (!tap) panBy(-dx, -dy, false);
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = stage.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      if (pinch) {
        zoomAt(dist / pinch.dist, mx, my);
        panBy(-(mx - pinch.mx), -(my - pinch.my), false);
      }
      pinch = { dist, mx, my };
    }
  });
  const release = (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.delete(ev.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      stage.classList.remove('is-dragging');
      if (ev.type === 'pointerup' && tap && performance.now() - tap.t < 700) tapAt(ev.clientX, ev.clientY);
      tap = null;
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);

  stage.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    hideTip();
    const unit = ev.deltaMode === 1 ? 0.05 : ev.deltaMode === 2 ? 0.5 : (ev.ctrlKey ? 0.01 : 0.0016);
    const r = stage.getBoundingClientRect();
    zoomAt(Math.exp(-ev.deltaY * unit), ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });

  stage.addEventListener('dblclick', (ev) => {
    const r = stage.getBoundingClientRect();
    zoomAt(2, ev.clientX - r.left, ev.clientY - r.top, { animate: true });
  });

  // ---- buttons and keys ----
  inBtn.addEventListener('click', () => zoomCentre(BUTTON_STEP));
  outBtn.addEventListener('click', () => zoomCentre(1 / BUTTON_STEP));
  resetBtn.addEventListener('click', reset);
  closeBtn.addEventListener('click', () => dlg.close());

  dlg.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const step = (ev.shiftKey ? 0.6 : 0.2);
    switch (ev.key) {
      case 'ArrowLeft': ev.preventDefault(); panBy(-W * step, 0, true); break;
      case 'ArrowRight': ev.preventDefault(); panBy(W * step, 0, true); break;
      case 'ArrowUp': ev.preventDefault(); panBy(0, -H * step, true); break;
      case 'ArrowDown': ev.preventDefault(); panBy(0, H * step, true); break;
      case '+': case '=': ev.preventDefault(); zoomCentre(BUTTON_STEP); break;
      case '-': case '_': ev.preventDefault(); zoomCentre(1 / BUTTON_STEP); break;
      case '0': ev.preventDefault(); reset(); break;
      default:
    }
  });

  // Backdrop click is impossible (the dialog fills the screen); closing is the button or Esc.
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); apply(); }) : null;
  dlg.addEventListener('close', () => {
    stopAnim();
    clearTimeout(tipTimer);
    if (ro) ro.disconnect();
    dlg.remove();
    if (previous && previous.isConnected && previous.focus) previous.focus({ preventScroll: true });
  });

  document.body.append(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  measure();
  k = k0;
  apply();
  if (ro) ro.observe(stage);
  stage.focus({ preventScroll: true });
  return { dialog: dlg, zoomIn: () => zoomCentre(BUTTON_STEP), zoomOut: () => zoomCentre(1 / BUTTON_STEP), reset, close: () => dlg.close() };
}
