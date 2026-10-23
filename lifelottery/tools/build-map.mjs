#!/usr/bin/env node
// Builds js/data/worldmap.js: a compact, dependency-free world map for the game.
//
//   node tools/build-map.mjs [downloadDir] [--epsilon=0.25]
//
// Sources (downloaded as untrusted DATA only; nothing from them is ever executed):
//   * world-atlas@2.0.2 `countries-110m.json` (Natural Earth 110m, public domain; the package is ISC) from the npm registry
//   * datasets/country-codes (ISO numeric -> ISO3, continent; ODC-PDDL) from raw.githubusercontent.com
// Pipeline: gunzip + read the tarball ourselves -> decode the TopoJSON (delta-encoded, quantised arcs) -> Equal Earth
// projection -> Douglas-Peucker simplification per ARC (so neighbouring countries keep sharing their border) -> stitch the
// rings -> emit relative SVG path strings keyed by ISO3, plus label anchors, dot-only countries and continents.
// Antarctica is left out. Northern Cyprus joins CYP, Somaliland joins SOM, Kosovo (no ISO numeric id) becomes XKX.
// Countries too small for the 110m data (Singapore, Bahrain, Mauritius ...) get a dot at their real position.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (name, d) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : d; };
const dir = resolve(args.find((a) => !a.startsWith('--')) || resolve(here, 'raw', 'map'));
const EPS = flag('epsilon', 0.25);

const ATLAS_URL = 'https://registry.npmjs.org/world-atlas/-/world-atlas-2.0.2.tgz';
const CODES_URL = 'https://raw.githubusercontent.com/datasets/country-codes/master/data/country-codes.csv';

export const MAP_W = 1000;
const MARGIN = 3;

// Real positions (lon, lat) of countries that 110m leaves out entirely.
const DOT_LONLAT = {
  SGP: [103.82, 1.35], BHR: [50.55, 26.07], MUS: [57.55, -20.28], COM: [43.35, -11.7], MAC: [113.55, 22.17],
  HKG: [114.17, 22.32], MLT: [14.4, 35.9], MDV: [73.5, 3.2], CPV: [-23.6, 15.1], PRI: [-66.5, 18.22],
  BRB: [-59.55, 13.18], SYC: [55.45, -4.65], STP: [6.6, 0.25], TON: [-175.2, -21.2], WSM: [-172.1, -13.6],
  KIR: [173, 1.4], FSM: [158.2, 6.9], MHL: [171, 7.1], PLW: [134.5, 7.5], LCA: [-60.98, 13.9], VCT: [-61.2, 13.25],
  GRD: [-61.7, 12.1], ATG: [-61.8, 17.1], DMA: [-61.35, 15.4], KNA: [-62.75, 17.35], AND: [1.6, 42.55], LIE: [9.55, 47.15],
  MCO: [7.4, 43.73], SMR: [12.46, 43.94], VAT: [12.45, 41.9], TUV: [179.2, -8.5], NRU: [166.9, -0.52], BRN: [114.7, 4.5],
};

// ---------------------------------------------------------------------------------------------
// Download + minimal tar reader
// ---------------------------------------------------------------------------------------------

async function download(url, file) {
  if (existsSync(file)) return readFile(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}

/** Returns the bytes of one file inside a .tar buffer (ustar headers only; no extraction to disk). */
function tarFile(tar, wanted) {
  let off = 0;
  while (off + 512 <= tar.length) {
    const head = tar.subarray(off, off + 512);
    if (head.every((b) => b === 0)) break;
    const name = head.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = head.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(head.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8);
    const full = prefix ? `${prefix}/${name}` : name;
    if (full === wanted) return tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} not found in tarball`);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---------------------------------------------------------------------------------------------
// TopoJSON decode + projection
// ---------------------------------------------------------------------------------------------

/** Equal Earth projection (Savric, Patterson, Jenny 2018): lon/lat degrees -> planar. */
function equalEarth(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
  const M = Math.sqrt(3) / 2;
  const l = (lon * Math.PI) / 180;
  const t = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

function decodeArcs(topo) {
  const { scale, translate } = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
}

/** Douglas-Peucker; keeps both endpoints. Returns the indices of the kept points. */
function simplifyIdx(pts, eps) {
  if (pts.length <= 2) return pts.map((_, i) => i);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let dmax = 0, idx = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(len2);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.map((_, i) => i).filter((i) => keep[i]);
}

const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };

function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f;
  }
  a /= 2;
  return Math.abs(a) < 1e-9 ? r[0] : [cx / (6 * a), cy / (6 * a)];
}

// ---------------------------------------------------------------------------------------------
// Path emission
// ---------------------------------------------------------------------------------------------

const q1 = (v) => Math.round(v * 10); // 0.1 map unit steps

function num(n) { // integer tenths -> shortest decimal string ("12.3", "-.4", "5")
  const neg = n < 0; const a = Math.abs(n);
  const i = Math.floor(a / 10), f = a % 10;
  const s = f ? `${i || ''}.${f}` : `${i}`;
  return neg ? `-${s || '0'}` : s;
}

function ringPath(r) {
  // r: closed ring of [x, y] map units. Absolute start, relative deltas on the 0.1 grid, closed with z.
  const pts = [];
  for (const [x, y] of r) {
    const p = [q1(x), q1(y)];
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 3) return '';
  let s = `M${num(pts[0][0])} ${num(pts[0][1])}l`;
  let prev = pts[0];
  let out = '';
  for (let i = 1; i < pts.length; i++) {
    const d = [pts[i][0] - prev[0], pts[i][1] - prev[1]];
    prev = pts[i];
    for (const v of d) { const t = num(v); out += (out && !t.startsWith('-') ? ' ' : '') + t; }
  }
  s += out;
  return `${s}z`;
}

// ---------------------------------------------------------------------------------------------

async function main() {
  await mkdir(dir, { recursive: true });
  const tgz = await download(ATLAS_URL, resolve(dir, 'world-atlas-2.0.2.tgz'));
  const codesCsv = (await download(CODES_URL, resolve(dir, 'country-codes.csv'))).toString('utf8');
  const topo = JSON.parse(tarFile(gunzipSync(tgz), 'package/countries-110m.json').toString('utf8'));
  const codes = parseCsv(codesCsv);
  const iso3ByNum = new Map(), continent = {};
  for (const r of codes) {
    const n = (r['ISO3166-1-numeric'] || '').padStart(3, '0');
    const a3 = r['ISO3166-1-Alpha-3'];
    if (a3 && r['ISO3166-1-numeric']) iso3ByNum.set(n, a3);
    if (a3 && r.Continent) continent[a3] = r.Continent;
  }
  continent.XKX = 'EU';

  // --- arcs: absolute lon/lat -> projected -> simplified once, shared by both neighbours (kept as lon/lat)
  const arcsLL = decodeArcs(topo);
  const geoms = topo.objects.countries.geometries;
  const skip = (g) => String(g.id) === '010'; // Antarctica
  const usedArcs = new Set();
  const visit = (a) => (Array.isArray(a) ? a.forEach(visit) : usedArcs.add(a < 0 ? ~a : a));
  for (const g of geoms) if (!skip(g)) visit(g.arcs);
  // Equal Earth is not periodic in x per latitude, so the bounds come from the +-180 meridians and the used latitudes.
  let minY = Infinity, maxY = -Infinity;
  for (const i of usedArcs) for (const [, lat] of arcsLL[i]) { const y = equalEarth(0, lat)[1]; minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const minX = equalEarth(-180, 0)[0], maxX = equalEarth(180, 0)[0];
  const k = (MAP_W - 2 * MARGIN) / (maxX - minX);
  const toMap = ([x, y]) => [MARGIN + (x - minX) * k, MARGIN + (maxY - y) * k]; // y up -> down
  const MAP_H = Math.ceil(MARGIN * 2 + (maxY - minY) * k);
  const lonLatToMap = (lon, lat) => toMap(equalEarth(lon, lat));
  const arcs = arcsLL.map((arc, i) => {
    if (!usedArcs.has(i)) return [];
    // distances for the simplification are measured on the map (projected, scaled), the kept points stay lon/lat
    const mapPts = arc.map(([lon, lat]) => lonLatToMap(lon, lat));
    const keep = simplifyIdx(mapPts, EPS);
    return keep.map((j) => arc[j]);
  });

  // A ring that crosses the antimeridian (Russia's Chukotka, Fiji) would be drawn as a strip across the whole map:
  // unwrap its longitudes, then cut it at +-180 into an eastern and a western piece.
  let crossings = 0;
  const clipHalf = (ring, keepFn, edge) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ina = keepFn(a[0]), inb = keepFn(b[0]);
      if (ina) out.push(a);
      if (ina !== inb) out.push([edge, a[1] + ((b[1] - a[1]) * (edge - a[0])) / (b[0] - a[0])]);
    }
    return out;
  };
  const splitRing = (ll) => {
    let jump = false;
    for (let i = 0; i < ll.length - 1; i++) if (Math.abs(ll[i + 1][0] - ll[i][0]) > 180) jump = true;
    if (!jump) return [ll];
    crossings++;
    const u = [ll[0].slice()];
    for (let i = 1; i < ll.length; i++) {
      let lon = ll[i][0];
      const prev = u[i - 1][0];
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
      u.push([lon, ll[i][1]]);
    }
    const open = u.slice(0, -1);
    const hi = Math.max(...open.map((p) => p[0])), lo = Math.min(...open.map((p) => p[0]));
    if (hi > 180) {
      return [clipHalf(open, (x) => x <= 180, 180), clipHalf(open, (x) => x >= 180, 180).map(([x, y]) => [x - 360, y])];
    }
    if (lo < -180) {
      return [clipHalf(open, (x) => x >= -180, -180), clipHalf(open, (x) => x <= -180, -180).map(([x, y]) => [x + 360, y])];
    }
    return [ll];
  };
  const toRing = (ll) => { const r = ll.map(([lon, lat]) => lonLatToMap(lon, lat)); r.push(r[0]); return r; };

  const ringOf = (idxs) => {
    const pts = [];
    for (const a of idxs) {
      const seg = a < 0 ? [...arcs[~a]].reverse() : arcs[a];
      pts.push(...(pts.length ? seg.slice(1) : seg));
    }
    return splitRing(pts).filter((r) => r.length >= 3).map(toRing);
  };

  // --- group polygons by ISO3: each polygon is a list of rings (exterior first); a cut ring becomes several polygons
  const byCode = {};
  const nameFix = { Kosovo: 'XKX', 'N. Cyprus': 'CYP', Somaliland: 'SOM' };
  for (const g of geoms) {
    if (skip(g)) continue;
    const code = g.id != null && g.id !== '' ? iso3ByNum.get(String(g.id).padStart(3, '0')) : nameFix[g.properties.name];
    if (!code) throw new Error(`no ISO3 for ${g.id} ${g.properties.name}`);
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    for (const p of polys) {
      const rings = p.map(ringOf);
      const pieces = rings[0].length; // exterior ring pieces
      if (pieces === 1 && rings.every((r) => r.length === 1)) byCode[code] = (byCode[code] || []).concat([rings.map((r) => r[0])]);
      else for (let i = 0; i < pieces; i++) (byCode[code] ||= []).push([rings[0][i]]); // cut pieces: holes are not expected at the date line
    }
  }

  // --- emit
  const MIN_RING = 0.5; // drop specks smaller than this many map units^2 (except a country's largest piece)
  const shapes = {}, anchors = {}, area = {}, bbox = {};
  for (const code of Object.keys(byCode).sort()) {
    const polys = byCode[code];
    const sizes = polys.map((p) => Math.abs(ringArea(p[0])));
    const biggest = sizes.indexOf(Math.max(...sizes));
    let d = '';
    let total = 0, bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    polys.forEach((p, i) => {
      if (sizes[i] < MIN_RING && i !== biggest) return;
      for (const ring of p) {
        d += ringPath(ring);
      }
      total += sizes[i];
      for (const [x, y] of p[0]) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    });
    if (!d) continue;
    shapes[code] = d;
    const c = ringCentroid(polys[biggest][0]);
    anchors[code] = [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10];
    area[code] = total;
    bbox[code] = Math.max(bx1 - bx0, by1 - by0);
  }

  // --- countries of the game that have no shape: dots at their real position
  const { COUNTRIES } = await import(pathToFileURL(resolve(ROOT, 'js/data/countries.js')).href);
  const dotOnly = [];
  for (const c of COUNTRIES) {
    if (shapes[c.code]) continue;
    const ll = DOT_LONLAT[c.code];
    if (!ll) throw new Error(`no shape and no DOT_LONLAT entry for ${c.code} (${c.name})`);
    const p = lonLatToMap(ll[0], ll[1]);
    anchors[c.code] = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    dotOnly.push(c.code);
  }
  // tiny shapes that deserve a marker ring when highlighted (the shape alone would be a few pixels)
  const tiny = COUNTRIES.map((c) => c.code).filter((code) => shapes[code] && bbox[code] < 14).sort();
  const cont = {};
  for (const c of COUNTRIES) {
    if (!continent[c.code]) throw new Error(`no continent for ${c.code}`);
    cont[c.code] = continent[c.code];
  }

  // --- write js/data/worldmap.js
  const lines = [];
  lines.push('// GENERATED by tools/build-map.mjs. Do not edit by hand; re-run: node tools/build-map.mjs');
  lines.push('// World map for the 人生籤 interface: Natural Earth 110m (public domain, via world-atlas 2.0.2), Equal Earth projection,');
  lines.push('// Antarctica omitted, simplified with Douglas-Peucker (epsilon ' + EPS + ' map units). Continents and ISO numeric ids come from datasets/country-codes.');
  lines.push('// SHAPES: ISO3 -> SVG path (relative commands, even-odd fill) in a MAP_W x MAP_H viewBox. ANCHORS: ISO3 -> [x, y] label / marker point.');
  lines.push('// DOT_ONLY: countries of the game with no 110m shape (drawn as a dot at ANCHORS). TINY: countries with a shape too small to see (also get a marker).');
  lines.push('// CONTINENT: ISO3 -> AS | EU | AF | NA | SA | OC for every country of the game.');
  lines.push(`export const MAP_W = ${MAP_W};`);
  lines.push(`export const MAP_H = ${MAP_H};`);
  lines.push('export const SHAPES = {');
  for (const code of Object.keys(shapes)) lines.push(`${code}:'${shapes[code]}',`);
  lines.push('};');
  lines.push(`export const ANCHORS = ${JSON.stringify(anchors).replace(/"/g, '')};`);
  lines.push(`export const DOT_ONLY = ${JSON.stringify(dotOnly)};`);
  lines.push(`export const TINY = ${JSON.stringify(tiny)};`);
  lines.push(`export const CONTINENT = ${JSON.stringify(cont).replace(/"([A-Z]{3})":/g, '$1:')};`);
  const out = lines.join('\n') + '\n';
  const file = resolve(ROOT, 'js/data/worldmap.js');
  await writeFile(file, out);
  console.log(`antimeridian rings cut: ${crossings}`);
  console.log(`${file}: ${out.length} bytes, ${Object.keys(shapes).length} shapes, ${dotOnly.length} dot-only (${dotOnly.join(' ')}), ${tiny.length} tiny (${tiny.join(' ')}), viewBox ${MAP_W}x${MAP_H}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
