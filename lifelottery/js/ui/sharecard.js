// Share card: a 1080x1350 Canvas image of a finished life ("a paper notebook page under the night sky").
// Pure drawing code: give it a canvas and an album record; it paints synchronously with system fonts.

import { S, oneInText } from '../strings.js';
import { oddsFromSummary } from '../engine/odds.js';
import { STAT_KEYS } from './chart.js';
import { BY_CODE } from '../data/countries.js';
import { MAP_W, MAP_H, SHAPES, ANCHORS, DOT_ONLY, TINY } from '../data/worldmap.js';
import { lifeFacts } from './achievements.js';
import { arcControl } from './worldmap.js';

export const CARD_W = 1080;
export const CARD_H = 1350;

const SERIF = '"Songti TC","Noto Serif TC","Source Han Serif TC","PMingLiU","STSong","Noto Serif CJK TC",serif';
const SANS = 'system-ui,-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei","WenQuanYi Zen Hei","Noto Sans CJK TC",sans-serif';

const C = {
  skyTop: '#0a1024', skyMid: '#16224a', skyBot: '#27386d',
  paper: '#f8f1de', paperLine: 'rgba(120,100,60,0.13)', ink: '#2a2620', ink2: '#5d5547', muted: '#85796a',
  accent: '#b4432c', gold: '#e8b765', cream: '#efe8d6',
  mapSea: '#ebe3cc', mapLand: '#c2b693', mapEdge: '#f3ead2', lived: '#d9962b',
  health: '#c0503a', happiness: '#c98a12', knowledge: '#3b78a8', wealth: '#4f8a5b', social: '#8a5cb0',
};
const DASH = { health: [], happiness: [8, 4], knowledge: [2, 4], wealth: [12, 3, 2, 3], social: [1, 5] };

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Wrap text (CJK-friendly: breaks between any two characters). Returns at most maxLines lines, ellipsised. */
function wrap(g, text, maxW, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (g.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (l.length && g.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);
    lines[maxLines - 1] = `${l}…`;
  }
  return lines;
}

function fitText(g, text, font, maxW, startPx, minPx) {
  let px = startPx;
  do {
    g.font = font(px);
    if (g.measureText(text).width <= maxW) break;
    px -= 2;
  } while (px > minPx);
  return px;
}

/** Cut `text` so it fits `maxW` in the current font, ending with an ellipsis when something was removed. */
function ellipsize(g, text, maxW) {
  const s = String(text);
  if (g.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && g.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function drawSky(g, id) {
  const grad = g.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, C.skyTop);
  grad.addColorStop(0.55, C.skyMid);
  grad.addColorStop(1, C.skyBot);
  g.fillStyle = grad;
  g.fillRect(0, 0, CARD_W, CARD_H);
  // crescent moon (drawn before the stars; the "bite" is the sky colour at that height)
  g.fillStyle = C.gold;
  g.beginPath();
  g.arc(930, 100, 40, 0, Math.PI * 2);
  g.fill();
  const k = 100 / (CARD_H * 0.55);
  g.fillStyle = `rgb(${Math.round(10 + (22 - 10) * k)},${Math.round(16 + (34 - 16) * k)},${Math.round(36 + (74 - 36) * k)})`;
  g.beginPath();
  g.arc(950, 86, 36, 0, Math.PI * 2);
  g.fill();
  const r = rng(id || 'life');
  for (let i = 0; i < 150; i++) {
    const x = r() * CARD_W, y = r() * CARD_H, s = r();
    if (Math.hypot(x - 935, y - 95) < 62) continue;
    g.globalAlpha = 0.25 + r() * 0.65;
    g.fillStyle = s > 0.93 ? C.gold : '#ffffff';
    g.beginPath();
    g.arc(x, y, s > 0.93 ? 2.6 : 0.8 + s * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawPaper(g, x, y, w, h) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  roundRect(g, x, y, w, h, 26);
  g.fillStyle = C.paper;
  g.fill();
  g.restore();
  // ruled lines
  g.save();
  roundRect(g, x, y, w, h, 26);
  g.clip();
  g.strokeStyle = C.paperLine;
  g.lineWidth = 2;
  for (let ly = y + 70; ly < y + h; ly += 46) {
    g.beginPath();
    g.moveTo(x, ly);
    g.lineTo(x + w, ly);
    g.stroke();
  }
  // margin line
  g.strokeStyle = 'rgba(180,67,44,0.28)';
  g.beginPath();
  g.moveTo(x + 84, y);
  g.lineTo(x + 84, y + h);
  g.stroke();
  g.restore();
  // binder holes
  g.fillStyle = C.skyMid;
  for (const hy of [y + 150, y + h / 2, y + h - 150]) {
    g.beginPath();
    g.arc(x + 42, hy, 12, 0, Math.PI * 2);
    g.fill();
  }
  // washi tape
  g.save();
  g.translate(x + w / 2, y + 2);
  g.rotate(-0.03);
  g.fillStyle = 'rgba(232,183,101,0.75)';
  g.fillRect(-90, -22, 180, 44);
  g.restore();
}

function drawCurves(g, rows, x, y, w, h) {
  const maxAge = Math.max(1, rows[rows.length - 1].age);
  const px = (a) => x + (a / maxAge) * w;
  const py = (v) => y + (1 - v / 100) * h;
  g.save();
  g.strokeStyle = 'rgba(120,100,60,0.28)';
  g.lineWidth = 1.5;
  for (const v of [0, 50, 100]) {
    g.beginPath();
    g.moveTo(x, py(v));
    g.lineTo(x + w, py(v));
    g.stroke();
  }
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const k of STAT_KEYS) {
    g.strokeStyle = C[k];
    g.setLineDash(DASH[k]);
    g.beginPath();
    rows.forEach((r, i) => (i ? g.lineTo(px(r.age), py(r[k])) : g.moveTo(px(r.age), py(r[k]))));
    g.stroke();
  }
  g.restore();
  g.fillStyle = C.muted;
  g.font = `22px ${SANS}`;
  g.textAlign = 'left';
  g.fillText('0', x, y + h + 26);
  g.textAlign = 'right';
  g.fillText(`${maxAge} ${S.summary.years}`, x + w, y + h + 26);
}

// ---------------------------------------------------------------------------------------------
// Mini world map: birth country, countries lived in, and the moves between them
// ---------------------------------------------------------------------------------------------

let landPath = null;
const shapeCache = new Map();
const shapePath = (code) => {
  if (!shapeCache.has(code)) shapeCache.set(code, new Path2D(SHAPES[code]));
  return shapeCache.get(code);
};
const TINY_SET = new Set(TINY);
const DOT_SET = new Set(DOT_ONLY);

/** Where a life went: the birth country code, the other countries in the order lived, and their names. */
export function lifeRoute(record) {
  const f = lifeFacts(record);
  if (!f.code) return null;
  const lived = [...f.lived];
  const stops = lived.filter((c, i) => ANCHORS[c] && (i === 0 || c !== lived[i - 1]));
  return { birth: f.code, lived, stops, names: lived.map((c) => (BY_CODE[c] || {}).name).filter(Boolean) };
}

/**
 * Paint the map into the box (x, y, w) (height follows the map's aspect ratio). Everything is drawn in output pixels by
 * scaling the context, so sizes below are pixels of the card, not map units.
 */
function drawMiniMap(g, route, x, y, w) {
  const s = w / MAP_W;
  const h = MAP_H * s;
  if (!landPath) landPath = new Path2D(Object.values(SHAPES).join(''));
  const px = (v) => v / s; // card pixels -> map units
  g.save();
  roundRect(g, x, y, w, h, 16);
  g.fillStyle = C.mapSea;
  g.fill();
  g.clip();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = C.mapLand;
  g.fill(landPath, 'evenodd');
  g.lineJoin = 'round';
  g.strokeStyle = C.mapEdge;
  g.lineWidth = px(0.9);
  g.stroke(landPath);

  const lived = route.lived.filter((c) => c !== route.birth);
  const paint = (code, color) => {
    if (SHAPES[code]) {
      g.fillStyle = color;
      g.fill(shapePath(code), 'evenodd');
      g.strokeStyle = C.paper;
      g.lineWidth = px(1.2);
      g.stroke(shapePath(code));
    }
  };
  const marker = (code, color, big) => {
    const a = ANCHORS[code];
    if (!a) return;
    if (DOT_SET.has(code) || TINY_SET.has(code)) {
      g.beginPath();
      g.arc(a[0], a[1], px(big ? 7 : 5.5), 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      if (TINY_SET.has(code)) {
        g.beginPath();
        g.arc(a[0], a[1], px(big ? 13 : 10.5), 0, Math.PI * 2);
        g.strokeStyle = color;
        g.lineWidth = px(2.6);
        g.stroke();
      }
    }
  };
  for (const c of lived) { paint(c, C.lived); marker(c, C.lived, false); }
  paint(route.birth, C.accent);

  // moves: dashed arcs and numbered stops (only when the person lived in more than one country)
  const stops = route.stops;
  if (stops.length > 1) {
    g.lineCap = 'round';
    g.strokeStyle = C.ink;
    g.lineWidth = px(3.2);
    g.setLineDash([px(9), px(7)]);
    for (let i = 1; i < stops.length; i++) {
      const a = ANCHORS[stops[i - 1]], b = ANCHORS[stops[i]];
      const [qx, qy] = arcControl(a, b);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(qx, qy, b[0], b[1]);
      g.stroke();
    }
    g.setLineDash([]);
  }
  marker(route.birth, C.accent, true);
  const bAnchor = ANCHORS[route.birth];
  if (stops.length > 1) {
    stops.forEach((code, i) => {
      const a = ANCHORS[code];
      g.beginPath();
      g.arc(a[0], a[1], px(stops.length > 3 ? 9.5 : 11), 0, Math.PI * 2);
      g.fillStyle = i === 0 ? C.accent : C.ink;
      g.fill();
      g.lineWidth = px(2.6);
      g.strokeStyle = C.paper;
      g.stroke();
      g.fillStyle = C.paper;
      g.font = `800 ${px(stops.length > 3 ? 12.5 : 14)}px ${SANS}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i + 1), a[0], a[1] + px(0.5));
    });
    g.textBaseline = 'alphabetic';
  } else if (bAnchor) {
    g.beginPath();
    g.arc(bAnchor[0], bAnchor[1], px(8), 0, Math.PI * 2);
    g.fillStyle = C.accent;
    g.fill();
    g.lineWidth = px(3);
    g.strokeStyle = C.paper;
    g.stroke();
    g.beginPath();
    g.arc(bAnchor[0], bAnchor[1], px(17), 0, Math.PI * 2);
    g.strokeStyle = C.accent;
    g.lineWidth = px(2.8);
    g.stroke();
  }
  g.restore();
  // frame
  g.save();
  roundRect(g, x, y, w, h, 16);
  g.strokeStyle = 'rgba(120,100,60,0.45)';
  g.lineWidth = 2;
  g.stroke();
  g.restore();
  return h;
}

// Vertical layout of the card (px). The paper runs from PAPER_Y to PAPER_Y + PAPER_H; the sections below are fixed rows so
// that the longest name, a three-line message and a four-country life all fit (tests/e2e.mjs renders those cases).
const PAPER = { x: 60, y: 184, w: 960, h: 1086 };

/** Paint the share card for an album record ({ id, message, summary }). */
export function drawShareCard(canvas, record) {
  const sum = record.summary;
  const T = S.summary;
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const g = canvas.getContext('2d');
  g.textBaseline = 'alphabetic';
  g.clearRect(0, 0, CARD_W, CARD_H);

  drawSky(g, record.id);

  // brand
  g.textAlign = 'left';
  g.fillStyle = C.cream;
  g.font = `700 52px ${SERIF}`;
  g.fillText(T.cardTitle, 80, 106);
  g.fillStyle = C.gold;
  g.font = `600 22px ${SANS}`;
  g.fillText('L I F E   L O T T E R Y', 82, 142);

  drawPaper(g, PAPER.x, PAPER.y, PAPER.w, PAPER.h);

  const x0 = 156;
  const w0 = 800;
  g.textAlign = 'left';

  // dates
  g.fillStyle = C.muted;
  g.font = `600 30px ${SANS}`;
  g.fillText(T.lifespanSpan(sum.birthYear, sum.deathYear), x0, 254);

  // name
  g.fillStyle = C.ink;
  const namePx = fitText(g, sum.name, (p) => `700 ${p}px ${SERIF}`, w0, 88, 40);
  g.font = `700 ${namePx}px ${SERIF}`;
  g.fillText(ellipsize(g, sum.name, w0), x0, 344);

  // origin
  g.fillStyle = C.ink2;
  g.font = `32px ${SANS}`;
  const gender = sum.gender === 'M' ? '男性' : '女性';
  const origin = T.from(sum.homeCountry.name, sum.wealthShort, gender);
  fitText(g, origin, (p) => `${p}px ${SANS}`, w0, 32, 20);
  g.fillText(ellipsize(g, origin, w0), x0, 396);

  // ---- row A: age + cause on the left, the map on the right ----
  const route = lifeRoute(record);
  const colW = 300;
  const infant = sum.age < 1;
  g.fillStyle = C.muted;
  g.font = `32px ${SANS}`;
  if (!infant) g.fillText('享年', x0, 466);
  g.fillStyle = C.accent;
  const ageStr = infant ? '不滿一歲' : String(sum.age);
  const unitW = infant ? 0 : 62;
  const agePx = fitText(g, ageStr, (p) => `800 ${p}px ${SERIF}`, colW - unitW, infant ? 72 : 144, 60);
  g.font = `800 ${agePx}px ${SERIF}`;
  const ageW = g.measureText(ageStr).width;
  g.fillText(ageStr, x0, infant ? 548 : 578);
  if (!infant) {
    g.font = `700 52px ${SERIF}`;
    g.fillText(T.years, x0 + ageW + 8, 578);
  }

  // cause stamp: under the age (next to the map), or at the right when there is no map
  if (sum.cause) {
    g.save();
    if (route) g.translate(x0 + colW / 2 - 6, 650); else g.translate(x0 + w0 - 150, 528);
    g.rotate(-0.06);
    g.strokeStyle = C.accent;
    g.fillStyle = C.accent;
    g.lineWidth = 5;
    const bw = route ? 280 : 300, bh = route ? 90 : 124;
    roundRect(g, -bw / 2, -bh / 2, bw, bh, 14);
    g.stroke();
    g.textAlign = 'center';
    g.font = `600 ${route ? 22 : 24}px ${SANS}`;
    g.fillText(S.death.causeLabel, 0, route ? -14 : -22);
    fitText(g, sum.cause.label, (p) => `700 ${p}px ${SERIF}`, bw - 40, route ? 40 : 46, 22);
    g.fillText(ellipsize(g, sum.cause.label, bw - 40), 0, route ? 26 : 28);
    g.restore();
  }

  let rowEnd = route ? 690 : 600;
  if (route) {
    const mx = x0 + colW + 30, mw = x0 + w0 - mx;
    const mh = drawMiniMap(g, route, mx, 418, mw);
    // the places, as a caption under the map
    g.textAlign = 'left';
    g.fillStyle = C.ink2;
    g.font = `600 23px ${SANS}`;
    const places = route.stops.length > 1
      ? T.cardMapPlaces(route.stops.map((c, i) => `${i + 1} ${(BY_CODE[c] || {}).name || ''}`))
      : T.cardMapStayed(sum.homeCountry.name);
    const lines = wrap(g, places, mw, 2);
    let cy = 418 + mh + 30;
    for (const l of lines) { g.fillText(l, mx, cy); cy += 30; }
    rowEnd = Math.max(rowEnd, cy - 16);
  }

  // lifespan comparison bars
  const barRows = [
    [T.lifespanYou, sum.age, C.accent],
    [T.cardCompareCountry(sum.homeCountry.name), sum.lifespan.countryLe, C.ink2],
    [T.cardCompareWorld, sum.lifespan.worldLe, '#a79d89'],
  ];
  const maxBar = Math.max(100, ...barRows.map((r) => r[1])) * 1.0;
  let by = rowEnd + 38;
  g.textAlign = 'left';
  for (const [label, val, color] of barRows) {
    g.fillStyle = C.ink2;
    g.font = `26px ${SANS}`;
    fitText(g, label, (p) => `${p}px ${SANS}`, 330, 26, 18);
    g.fillText(ellipsize(g, label, 330), x0, by + 8);
    const bx = x0 + 340, bw = w0 - 340 - 110;
    g.fillStyle = 'rgba(120,100,60,0.16)';
    roundRect(g, bx, by - 14, bw, 24, 12);
    g.fill();
    g.fillStyle = color;
    roundRect(g, bx, by - 14, Math.max(24, (val / maxBar) * bw), 24, 12);
    g.fill();
    g.fillStyle = C.ink;
    g.font = `700 28px ${SANS}`;
    g.textAlign = 'right';
    g.fillText(`${Math.round(val * 10) / 10}`, x0 + w0, by + 8);
    g.textAlign = 'left';
    by += 44;
  }

  // odds: "這樣一生的機率  約 1／N" (the product of the birth lottery's draws and the age of death, engine/odds.js)
  let odds = null;
  try { odds = oddsFromSummary(sum, (record.meta && record.meta.drawMode) || 'births'); } catch (e) { odds = null; }
  const oddsY = by - 44 + 34;
  let afterOdds = oddsY;
  if (odds) {
    const bx = x0, bw = w0, bh = 76, byy = oddsY;
    g.save();
    roundRect(g, bx, byy, bw, bh, 16);
    g.fillStyle = 'rgba(180,67,44,0.08)';
    g.fill();
    g.setLineDash([10, 7]);
    g.lineWidth = 2.5;
    g.strokeStyle = C.accent;
    g.stroke();
    g.restore();
    const big = T.cardOddsValue(oneInText(odds.human));
    g.textAlign = 'right';
    g.fillStyle = C.accent;
    const bigPx = fitText(g, big, (p) => `800 ${p}px ${SERIF}`, 372, 50, 26);
    g.font = `800 ${bigPx}px ${SERIF}`;
    g.fillText(big, bx + bw - 24, byy + 53);
    g.textAlign = 'left';
    g.fillStyle = C.ink;
    g.font = `700 27px ${SERIF}`;
    g.fillText(S.odds.cardLabel, bx + 24, byy + 35);
    g.fillStyle = C.muted;
    fitText(g, S.odds.cardLead, (p) => `${p}px ${SANS}`, bw - 372 - 56, 21, 15);
    g.fillText(S.odds.cardLead, bx + 24, byy + 61);
    afterOdds = byy + bh;
  }

  // curves
  const curveTop = afterOdds + 38;
  g.fillStyle = C.muted;
  g.font = `600 24px ${SANS}`;
  g.fillText(T.cardChartTitle, x0, curveTop);
  // tiny legend
  let lx = x0 + 180;
  g.font = `22px ${SANS}`;
  for (const k of STAT_KEYS) {
    g.strokeStyle = C[k];
    g.lineWidth = 5;
    g.setLineDash(DASH[k]);
    g.beginPath();
    g.moveTo(lx, curveTop - 8);
    g.lineTo(lx + 26, curveTop - 8);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = C.ink2;
    g.fillText(S.life.statLabels[k], lx + 34, curveTop);
    lx += 34 + g.measureText(S.life.statLabels[k]).width + 22;
  }
  drawCurves(g, sum.statHistory, x0, curveTop + 18, w0, 62);

  // highlight + message. A message that needs three lines gets them (and the highlight line makes room); otherwise the
  // highlight stays and the message has two lines. Whatever does not fit is cut with an ellipsis, never drawn past the paper.
  let ty = curveTop + 18 + 62 + 26 + 36;
  g.textAlign = 'left';
  const msg = (record.message || '').trim();
  g.font = `500 32px ${SERIF}`;
  const longMsg = msg ? wrap(g, msg, w0, 99).length > 2 : false;
  const top = longMsg ? null : (sum.featuredHighlight || sum.highlights[0]);
  if (top) {
    g.fillStyle = C.ink2;
    g.font = `28px ${SANS}`;
    const line = wrap(g, `${T.cardHighlights}・${top.age} 歲　${top.text}`, w0, 1)[0];
    g.fillText(line, x0, ty);
    ty += 44;
  }
  if (msg) {
    g.fillStyle = C.accent;
    g.font = `700 28px ${SERIF}`;
    g.fillText(`${ellipsize(g, `${T.cardMsgFrom}${sum.name}`, w0 - 36)}：`, x0, ty);
    ty += 44;
    g.fillStyle = C.ink;
    g.font = `500 32px ${SERIF}`;
    const lines = wrap(g, msg, w0, top ? 2 : 3);
    for (const l of lines) { g.fillText(l, x0, ty); ty += 44; }
  }

  // footer
  g.textAlign = 'center';
  g.fillStyle = C.cream;
  g.font = `600 40px ${SERIF}`;
  g.fillText(T.cardTagline, CARD_W / 2, 1308);
  g.fillStyle = 'rgba(239,232,214,0.6)';
  g.font = `24px ${SANS}`;
  let url = '';
  try { if (/^https?:$/.test(location.protocol)) url = `${location.host}${location.pathname.replace(/index\.html$/, '')}`; } catch (e) { url = ''; }
  if (url) g.fillText(url, CARD_W / 2, 1340);
  return canvas;
}

export function cardToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

export function cardFileName(record) {
  const safe = `lifelottery-${record.summary.name}-${record.summary.birthYear}`.replace(/[\\/:*?"<>|\s]+/g, '_');
  return S.summary.cardName(safe);
}

/** Whether this browser can share an image file through the Web Share API. */
export function canShareImage() {
  try {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'a.png', { type: 'image/png' })] });
  } catch (e) {
    return false;
  }
}

/** Share the card. Resolves 'shared' | 'cancelled'; rejects on real errors. */
export async function shareCard(canvas, record) {
  const blob = await cardToBlob(canvas);
  const file = new File([blob], cardFileName(record), { type: 'image/png' });
  const s = record.summary;
  try {
    await navigator.share({ files: [file], title: S.appName, text: S.summary.cardShareText(s.name, s.age, s.homeCountry.name) });
    return 'shared';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}
