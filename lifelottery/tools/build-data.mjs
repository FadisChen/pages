#!/usr/bin/env node
// Builds lifelottery/js/data/countries.js from open data + curated estimates.
//
//   node lifelottery/tools/fetch-raw.mjs        # once: download raw CSVs into tools/raw
//   node lifelottery/tools/build-data.mjs [rawDir] [outFile]
//
// Real data (Our World in Data mirrors of UN / IHME / UNDP / Gapminder / Chao et al.) always wins.
// Anything that cannot be sourced is filled from tools/countries-seed.mjs or from the
// FALLBACKS table below, and the field name is recorded in the country's `est` array.
// Raw files are treated as untrusted DATA: they are parsed as text only, never executed.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './countries-seed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = resolve(process.argv[2] || resolve(here, 'raw'));
const outFile = resolve(process.argv[3] || resolve(here, '../js/data/countries.js'));

// ---------------------------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------------------------

/** Minimal RFC-4180 parser (quoted fields, embedded newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readRaw(key) {
  const p = resolve(rawDir, `${key}.csv`);
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run tools/fetch-raw.mjs first.`);
  return parseCsv(readFileSync(p, 'utf8'));
}

/** OWID "Entity,Year,col…" file -> Map(entityLower -> Map(year -> number)) for column `col`. */
function series(key, col = 2) {
  const out = new Map();
  for (const r of readRaw(key).slice(1)) {
    const v = r[col];
    if (v === undefined || v === '' || Number.isNaN(Number(v))) continue;
    const e = r[0].toLowerCase();
    if (!out.has(e)) out.set(e, new Map());
    out.get(e).set(Number(r[1]), Number(v));
  }
  return out;
}

/** Latest value at or before maxYear for any alias. Returns {v, year} or null. */
function latest(map, aliases, maxYear = 9999, minYear = 0) {
  for (const a of aliases) {
    const m = map.get(a.toLowerCase());
    if (!m) continue;
    let best = null;
    for (const [y, v] of m) if (y <= maxYear && y >= minYear && (!best || y > best.year)) best = { v, year: y };
    if (best) return best;
  }
  return null;
}

/** Value at exactly `year`, or the nearest year within ±tol. */
function at(map, aliases, year, tol = 0) {
  for (const a of aliases) {
    const m = map.get(a.toLowerCase());
    if (!m) continue;
    let best = null;
    for (const [y, v] of m) {
      const d = Math.abs(y - year);
      if (d <= tol && (!best || d < best.d)) best = { v, year: y, d };
    }
    if (best) return best;
  }
  return null;
}

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------------------------
// Fallbacks for fields that no open dataset in the sandbox covered for a given country.
// Values are best recollection of UN WPP 2024 / World Bank WDI / WHO / UNICEF figures.
// ---------------------------------------------------------------------------------------------

const FALLBACKS = {
  // Taiwan is absent from the OWID covid file and from the UN-derived tables for several fields.
  TWN: {
    pop: 23400000, le: { F: 84.0, M: 77.5 }, gdp: 47000, poverty: 0.2,
    smoke: { F: 3.5, M: 28.0 }, school: { F: 17.0, M: 16.4 }, marryAge: { F: 31.5, M: 33.5 },
  },
  HKG: { le: { F: 88.0, M: 82.5 }, poverty: 0.3, imr: 1.6, u5mr: 2.0 },
  MAC: { le: { F: 86.5, M: 81.0 }, gdp: 100000, poverty: 0.2, imr: 2.0, u5mr: 2.5 },
  PRK: { gdp: 1800, poverty: 15 },
  SYR: { gdp: 2900, poverty: 25 },
  PRI: { gdp: 36000, poverty: 1 },
  XKX: { le: { F: 79.0, M: 74.5 }, imr: 8.5, u5mr: 9.5, smoke: { F: 25, M: 45 }, poverty: 1 },
  SOM: { gdp: 700 },
  ERI: { gdp: 1500 },
  CUB: { gdp: 9000 },
  LBY: { gdp: 17000 },
  VEN: { gdp: 11000 },
  PSE: { poverty: 1.0 },
};

// Rough regional/income defaults used only if everything else is missing (flagged est).
const DEFAULT_MARRY_AGE = { EAS: [27, 30], SEA: [24, 27], SAS: [21, 25], CAS: [24, 27], MENA: [25, 30], SSA: [21, 27], EUR: [29, 32], NAM: [29, 31], LAC: [25, 28], OCE: [28, 30] };

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

function loadAll() {
  const covidRows = readRaw('covid');
  const h = covidRows[0];
  const ci = (n) => h.indexOf(n);
  const covid = new Map();
  for (const r of covidRows.slice(1)) {
    const code = r[ci('iso_code')] === 'OWID_KOS' ? 'XKX' : r[ci('iso_code')];
    const num = (n) => { const v = r[ci(n)]; return v === '' || v === undefined ? null : Number(v); };
    covid.set(code, {
      population: num('population'), le: num('life_expectancy'), gdp: num('gdp_per_capita'),
      poverty: num('extreme_poverty'), smF: num('female_smokers'), smM: num('male_smokers'),
    });
  }
  return {
    covid,
    leDiff: series('leSexDiff', 3),
    leLong: series('leLong', 2),
    u5mr: series('u5mr', 2),
    imr: series('imr', 2),
    infantDeaths: series('infantDeaths', 2),
    tfr: series('tfr', 2),
    schoolExp: series('schoolExp', 2),
    schoolMean: series('schoolMean', 2),
    schoolWomen: series('schoolWomen', 2),
    srb: series('srb', 2),
    urbanPop: series('urban', 2),
    ruralPop: series('urban', 3),
    suicideM: series('suicide', 2),
    suicideF: series('suicide', 3),
    smokeM: series('smoking', 10),
    smokeF: series('smoking', 13),
    marryM: series('marryAge', 2),
    marryF: series('marryAge', 3),
    pop: series('pop', 2),
  };
}

/** Median helper for group defaults. */
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

function buildCountry(row, D) {
  const [code, enNames, zh, region, income, cities, [tertiary, road, childMarriage, homicide, tfrWpp]] = row;
  const aliases = enNames.split('/');
  const est = ['tertiary', 'road', 'childMarriage', 'homicide'];
  const fb = FALLBACKS[code] || {};
  const cv = D.covid.get(code) || {};
  const src = {}; // per-field provenance for the build log only

  // ---- population ----
  let pop = cv.population;
  if (pop) src.pop = 'owid-covid';
  if (!pop) {
    pop = fb.pop; est.push('pop');
    if (!pop) { const g = latest(D.pop, aliases); pop = g ? g.v * 1.06 : null; src.pop = 'gapminder*1.06'; }
  }

  // ---- life expectancy ----
  let leTotal = cv.le;
  if (leTotal) src.le = 'owid-covid(2019)';
  const diff = latest(D.leDiff, aliases, 9999, 2000) ?? { v: 4.5 }; // default gap if the UN series lacks the entity
  if (!latest(D.leDiff, aliases, 9999, 2000)) est.push('le');
  let le;
  if (leTotal && diff) le = { F: round(leTotal + diff.v / 2), M: round(leTotal - diff.v / 2) };
  else if (fb.le) { le = fb.le; est.push('le'); }
  else {
    const g = latest(D.leLong, aliases, 9999, 2005);
    if (!g) throw new Error(`${code}: no life expectancy`);
    const d = diff ? diff.v : 5;
    le = { F: round(g.v + 1 + d / 2), M: round(g.v + 1 - d / 2) };
    est.push('le');
  }

  // ---- infant / child mortality (per 1000 live births) ----
  const imrS = latest(D.imr, aliases, 9999, 2010);
  const u5S = latest(D.u5mr, aliases, 9999, 2010);
  let imr = imrS ? round(imrS.v / 100) : null;
  let u5mr = u5S ? round(u5S.v) : null;
  if (imr == null && fb.imr != null) { imr = fb.imr; u5mr = fb.u5mr; est.push('imr', 'u5mr'); }
  if (imr == null && u5mr != null) { imr = round(u5mr * 0.78); est.push('imr'); }
  if (u5mr == null && imr != null) { u5mr = round(imr * 1.2); est.push('u5mr'); }
  if (imr == null) throw new Error(`${code}: no imr`);
  if (u5mr < imr * 1.02) u5mr = round(imr * 1.05); // keep u5 >= imr (different sources)

  // ---- fertility ----
  const tfrS = at(D.tfr, aliases, 2015);
  let tfr, tfrData = tfrS ? tfrS.v : null;
  if (tfrData != null && Math.abs(tfrData - tfrWpp) <= 0.2) tfr = round(tfrData, 2);
  else { tfr = tfrWpp; est.push('tfr'); } // stale/missing open data -> WPP 2024 recollection

  // ---- births per year ----
  const infD = latest(D.infantDeaths, aliases, 9999, 2010);
  const pop16 = at(D.pop, aliases, 2016, 3);
  let births;
  if (infD && imrS && pop && pop16) {
    births = (infD.v / (imrS.v / 100000)) * (pop / pop16.v);
    if (tfrData != null && est.includes('tfr')) births *= tfr / tfrData; // stale TFR corrected
  } else { births = pop * tfr * 0.0063; est.push('births'); }
  // Sanity band: crude birth rate vs a rough tfr-based expectation (guards against refugee-inflated IHME counts).
  const cbrExpected = Math.max(5, tfr * 6.3);
  if (!est.includes('births') && (births / pop * 1000 > cbrExpected * 1.8 || births / pop * 1000 < cbrExpected * 0.55)) {
    births = (pop * cbrExpected) / 1000; est.push('births');
  }
  births = Math.round(births / 100) * 100;

  // ---- schooling (expected years of schooling, UNDP) with sex split derived from women's mean ----
  const exp = latest(D.schoolExp, aliases, 9999, 2010);
  let school;
  if (exp) {
    // Expected years of schooling is a both-sexes figure. The sex split starts from a prior by income
    // group (girls out-study boys in rich countries, trail them in poor ones) and is nudged by how the
    // women-15-49 mean compares with the all-adult mean relative to the income-group median.
    const W = at(D.schoolWomen, aliases, 2010, 5), A = at(D.schoolMean, aliases, 2010, 5);
    const prior = { H: 1.02, UM: 1.02, LM: 0.98, L: 0.9 }[income];
    let dev = 0;
    if (W && A && A.v > 0.5) dev = clamp(W.v / A.v / (D.rhoMedian[income] || 1.1) - 1, -0.35, 0.2);
    const r = clamp(prior * (1 + 0.5 * dev), 0.55, 1.1);
    school = { F: round((exp.v * 2 * r) / (1 + r)), M: round((exp.v * 2) / (1 + r)) };
  } else if (fb.school) { school = fb.school; est.push('school'); }
  else { est.push('school'); school = null; }

  // ---- economy ----
  let gdp = cv.gdp != null ? Math.round(cv.gdp) : null;
  if (gdp == null) { gdp = fb.gdp ?? null; est.push('gdp'); }
  let poverty = cv.poverty != null ? round(cv.poverty) : null;
  if (poverty == null) { poverty = fb.poverty ?? (income === 'H' ? 0.5 : null); est.push('poverty'); }

  // ---- urban share (UN WUP 2018, year 2020) ----
  const up = at(D.urbanPop, aliases, 2020), rp = at(D.ruralPop, aliases, 2020);
  let urban = up && rp ? round((up.v / (up.v + rp.v)) * 100) : null;
  if (urban == null) { est.push('urban'); }

  // ---- sex ratio at birth (males per 100 females) ----
  const srbS = latest(D.srb, aliases, 9999, 2010);
  let srb = srbS ? round(srbS.v) : 105.2;
  if (!srbS) est.push('srb');

  // ---- smoking prevalence (% of adults) ----
  let smoke;
  if (cv.smF != null && cv.smM != null) smoke = { F: round(cv.smF), M: round(cv.smM) };
  else {
    const f = latest(D.smokeF, aliases, 9999, 2005), m = latest(D.smokeM, aliases, 9999, 2005);
    if (f && m) { smoke = { F: round(f.v), M: round(m.v) }; est.push('smoke'); } // IHME 2012 daily smokers
    else if (fb.smoke) { smoke = fb.smoke; est.push('smoke'); }
    else { smoke = null; est.push('smoke'); }
  }

  // ---- suicide (both sexes, age-standardised, per 100k; IHME 2017) ----
  const sm = latest(D.suicideM, aliases, 9999, 2010), sf = latest(D.suicideF, aliases, 9999, 2010);
  let suicide = sm && sf ? round((sm.v + sf.v) / 2) : null;
  if (suicide == null) est.push('suicide');

  // ---- average age at first marriage (UN) ----
  const mm = latest(D.marryM, aliases, 9999, 1995), mf = latest(D.marryF, aliases, 9999, 1995);
  let marryAge;
  if (mm && mf) marryAge = { F: round(mf.v), M: round(mm.v) };
  else if (fb.marryAge) { marryAge = fb.marryAge; est.push('marryAge'); }
  else { const d = DEFAULT_MARRY_AGE[region]; marryAge = { F: d[0], M: d[1] }; est.push('marryAge'); }

  // ---- 1970 reference values for the "past" era ----
  const p70 = at(D.pop, aliases, 1970);
  const pop1970 = p70 ? Math.round(p70.v) : Math.round(pop * 0.6);
  if (!p70) est.push('pop1970');
  const le70 = at(D.leLong, aliases, 1970);
  const u570 = at(D.u5mr, aliases, 1970);
  let le1970 = le70 ? round(le70.v) : null;
  let imr1970 = null;
  if (u570) imr1970 = round(u570.v * clamp(imr / u5mr, 0.5, 0.88));
  if (le1970 == null) est.push('le1970');
  if (imr1970 == null) est.push('imr1970');

  return {
    code, name: zh, region, income, pop: Math.round(pop), pop1970, births, le, imr, u5mr, tfr,
    school, tertiary, gdp, poverty, urban, childMarriage, srb, smoke,
    homicide, road, suicide, marryAge, cities,
    le1970, imr1970, le2050: null, // le2050 + group defaults are completed by finalize()
    est, _src: src,
  };
}

/** Fill remaining nulls with income-group medians and compute le2050 by the documented rule. */
function finalize(list) {
  const byInc = (field, get) => {
    const m = {};
    for (const inc of ['L', 'LM', 'UM', 'H']) m[inc] = median(list.filter((c) => c.income === inc).map(get).filter((x) => x != null));
    return m;
  };
  const med = {
    schoolF: byInc('school', (c) => c.school?.F), schoolM: byInc('school', (c) => c.school?.M),
    urban: byInc('urban', (c) => c.urban), suicide: byInc('suicide', (c) => c.suicide),
    smF: byInc('smoke', (c) => c.smoke?.F), smM: byInc('smoke', (c) => c.smoke?.M),
    poverty: byInc('poverty', (c) => c.poverty), gdp: byInc('gdp', (c) => c.gdp),
    le1970: byInc('le1970', (c) => c.le1970), imr1970: byInc('imr1970', (c) => c.imr1970),
  };
  for (const c of list) {
    if (!c.school) c.school = { F: round(med.schoolF[c.income]), M: round(med.schoolM[c.income]) };
    if (c.urban == null) c.urban = round(med.urban[c.income]);
    if (c.suicide == null) c.suicide = round(med.suicide[c.income]);
    if (!c.smoke) c.smoke = { F: round(med.smF[c.income]), M: round(med.smM[c.income]) };
    if (c.poverty == null) c.poverty = round(med.poverty[c.income]);
    if (c.gdp == null) c.gdp = Math.round(med.gdp[c.income]);
    if (c.le1970 == null) c.le1970 = round(med.le1970[c.income]);
    if (c.imr1970 == null) c.imr1970 = round(med.imr1970[c.income]);
    // le2050: UN WPP-style convergence toward an ~88 ceiling (gain shrinks as le approaches it).
    const avg = (c.le.F + c.le.M) / 2;
    c.le2050 = round(Math.min(89, avg + Math.max(1.5, (88 - avg) * 0.32)));
  }
  return list;
}

// ---------------------------------------------------------------------------------------------

/** Median W/A schooling ratio per income group (needed by the sex-split heuristic). */
function computeRhoMedians(D) {
  const byInc = { L: [], LM: [], UM: [], H: [] };
  for (const row of SEED) {
    const al = row[1].split('/');
    const W = at(D.schoolWomen, al, 2010, 5), A = at(D.schoolMean, al, 2010, 5);
    if (W && A && A.v > 0.5) byInc[row[4]].push(W.v / A.v);
  }
  return Object.fromEntries(Object.entries(byInc).map(([k, v]) => [k, median(v)]));
}

function main() {
  const D = loadAll();
  D.rhoMedian = computeRhoMedians(D);
  const failures = [];
  const built = SEED.map((row) => {
    try { return buildCountry(row, D); } catch (e) { failures.push(e.message); return null; }
  }).filter(Boolean);
  if (failures.length) { console.error('FAILED:\n' + failures.join('\n')); process.exit(1); }
  const list = finalize(built);
  list.sort((a, b) => b.pop - a.pop);

  const log = [];
  for (const c of list) {
    const bad = ['pop', 'gdp', 'poverty', 'urban', 'smoke', 'suicide', 'school'].filter((k) => c.est.includes(k));
    if (bad.length) log.push(`${c.code} est: ${bad.join(',')}`);
  }

  const out = list.map(({ _src, ...c }) => c);
  const header = readFileSync(resolve(here, 'countries-header.txt'), 'utf8');
  const body = out
    .map((c) => '  ' + JSON.stringify(c).replace(/"([a-zA-Z0-9]+)":/g, '$1:').replace(/"/g, "'"))
    .join(',\n');
  const worldPop = D.covid.get('OWID_WRL').population;
  const totalPop = list.reduce((s, c) => s + c.pop, 0);
  const text = `${header}\nexport const COUNTRIES = [\n${body},\n];\n\n` +
    `export const BY_CODE = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));\n\n` +
    `/** Sum of listed populations (countries/territories with >= 500k people). */\n` +
    `export const WORLD_POP_LISTED = ${totalPop};\n\n` +
    `/** OWID world population (2022), used as the denominator for "share of humanity". */\n` +
    `export const WORLD_POP = ${worldPop};\n`;
  writeFileSync(outFile, text);
  console.log(`wrote ${outFile}: ${list.length} countries, listed population ${(totalPop / 1e9).toFixed(2)}B`);
  console.log(log.join('\n'));
}

main();
