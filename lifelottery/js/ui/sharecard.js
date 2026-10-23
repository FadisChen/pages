// Share card: a 1080x1350 Canvas image of a finished life ("a paper notebook page under the night sky").
// Pure drawing code: give it a canvas and an album record; it paints synchronously with system fonts.

import { S } from '../strings.js';
import { STAT_KEYS } from './chart.js';

export const CARD_W = 1080;
export const CARD_H = 1350;

const SERIF = '"Songti TC","Noto Serif TC","Source Han Serif TC","PMingLiU","STSong","Noto Serif CJK TC",serif';
const SANS = 'system-ui,-apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei","WenQuanYi Zen Hei","Noto Sans CJK TC",sans-serif';

const C = {
  skyTop: '#0a1024', skyMid: '#16224a', skyBot: '#27386d',
  paper: '#f8f1de', paperLine: 'rgba(120,100,60,0.13)', ink: '#2a2620', ink2: '#5d5547', muted: '#85796a',
  accent: '#b4432c', gold: '#e8b765', cream: '#efe8d6',
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
  g.fillText(T.cardTitle, 80, 110);
  g.fillStyle = C.gold;
  g.font = `600 22px ${SANS}`;
  g.fillText('L I F E   L O T T E R Y', 82, 146);

  const px = 60, py = 200, pw = 960, ph = 1000;
  drawPaper(g, px, py, pw, ph);

  const x0 = 156;
  const w0 = 800;
  g.textAlign = 'left';

  // dates
  g.fillStyle = C.muted;
  g.font = `600 30px ${SANS}`;
  g.fillText(T.lifespanSpan(sum.birthYear, sum.deathYear), x0, 278);

  // name
  g.fillStyle = C.ink;
  const namePx = fitText(g, sum.name, (p) => `700 ${p}px ${SERIF}`, w0, 88, 44);
  g.font = `700 ${namePx}px ${SERIF}`;
  g.fillText(sum.name, x0, 370);

  // origin
  g.fillStyle = C.ink2;
  g.font = `32px ${SANS}`;
  const gender = sum.gender === 'M' ? '男性' : '女性';
  const origin = T.from(sum.homeCountry.name, sum.wealthShort, gender);
  fitText(g, origin, (p) => `${p}px ${SANS}`, w0, 32, 22);
  g.fillText(origin, x0, 424);

  // age block
  g.fillStyle = C.muted;
  g.font = `34px ${SANS}`;
  g.fillText('享年', x0, 548);
  g.fillStyle = C.accent;
  g.font = `800 176px ${SERIF}`;
  const ageStr = String(sum.age);
  g.fillText(ageStr, x0 + 84, 580);
  const ageW = g.measureText(ageStr).width;
  g.font = `700 54px ${SERIF}`;
  g.fillText(T.years, x0 + 84 + ageW + 10, 580);

  // cause stamp
  if (sum.cause) {
    g.save();
    g.translate(x0 + w0 - 150, 500);
    g.rotate(-0.07);
    g.strokeStyle = C.accent;
    g.fillStyle = C.accent;
    g.lineWidth = 5;
    roundRect(g, -150, -62, 300, 124, 14);
    g.stroke();
    g.textAlign = 'center';
    g.font = `600 24px ${SANS}`;
    g.fillText(S.death.causeLabel, 0, -22);
    fitText(g, sum.cause.label, (p) => `700 ${p}px ${SERIF}`, 260, 46, 24);
    g.fillText(sum.cause.label, 0, 28);
    g.restore();
  }

  // lifespan comparison bars
  const barRows = [
    [T.lifespanYou, sum.age, C.accent],
    [T.cardCompareCountry(sum.homeCountry.name), sum.lifespan.countryLe, C.ink2],
    [T.cardCompareWorld, sum.lifespan.worldLe, '#a79d89'],
  ];
  const maxBar = Math.max(100, ...barRows.map((r) => r[1])) * 1.0;
  let by = 664;
  g.textAlign = 'left';
  for (const [label, val, color] of barRows) {
    g.fillStyle = C.ink2;
    g.font = `26px ${SANS}`;
    fitText(g, label, (p) => `${p}px ${SANS}`, 330, 26, 18);
    g.fillText(label, x0, by + 8);
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
    by += 52;
  }

  // curves
  g.fillStyle = C.muted;
  g.font = `600 24px ${SANS}`;
  g.fillText(T.cardChartTitle, x0, 850);
  // tiny legend
  let lx = x0 + 180;
  g.font = `22px ${SANS}`;
  for (const k of STAT_KEYS) {
    g.strokeStyle = C[k];
    g.lineWidth = 5;
    g.setLineDash(DASH[k]);
    g.beginPath();
    g.moveTo(lx, 842);
    g.lineTo(lx + 26, 842);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = C.ink2;
    g.fillText(S.life.statLabels[k], lx + 34, 850);
    lx += 34 + g.measureText(S.life.statLabels[k]).width + 22;
  }
  drawCurves(g, sum.statHistory, x0, 872, w0, 120);

  // highlight + message
  let ty = 1062;
  g.textAlign = 'left';
  const top = sum.highlights[0];
  if (top) {
    g.fillStyle = C.ink2;
    g.font = `28px ${SANS}`;
    const line = wrap(g, `${T.cardHighlights}・${top.age} 歲　${top.text}`, w0, 1)[0];
    g.fillText(line, x0, ty);
    ty += 52;
  }
  const msg = (record.message || '').trim();
  if (msg) {
    g.fillStyle = C.accent;
    g.font = `700 28px ${SERIF}`;
    g.fillText(`${T.cardMsgFrom}${sum.name}：`, x0, ty);
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
  g.fillText(T.cardTagline, CARD_W / 2, 1270);
  g.fillStyle = 'rgba(239,232,214,0.6)';
  g.font = `24px ${SANS}`;
  let url = '';
  try { if (/^https?:$/.test(location.protocol)) url = `${location.host}${location.pathname.replace(/index\.html$/, '')}`; } catch (e) { url = ''; }
  if (url) g.fillText(url, CARD_W / 2, 1312);
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
