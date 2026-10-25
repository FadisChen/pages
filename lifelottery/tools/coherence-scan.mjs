// Deep coherence scan (exploratory companion of tests/coherence.test.mjs).
//
//   node tools/coherence-scan.mjs [lives=3000] [prefix=scan] [--rule=work,school] [--samples=2] [--json=out.json] [--stress] [--novelty] [--migrant]
//   --stress   7 lives in 8 lose family early (parents at random ages, a partner, a child), see applyStress() in tests/lib/coherence.mjs
//   --novelty  3 lives in 4 start with novelty counts 1-3 on every event with phrasings, so every variant text is read
//   --migrant  7 lives in 8 get a family and move abroad (labour alone, study, skilled with the family, refugees, couples in two countries, returns): the household rule
//
// Plays `lives` lives over eras / draw modes (every 4th forced to a country from a coverage list), renders every
// text against the state at that moment, applies the allowlist and prints the remaining flags grouped by
// rule -> event id -> word, with one sample line and the state that made it a contradiction.

import fs from 'node:fs';
import { lifeConfigs, runAudit, groupFlags, ALLOW } from '../tests/lib/coherence.mjs';
import { COUNTRIES } from '../js/data/countries.js';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const pos = args.filter((a) => !a.startsWith('--'));
const N = +pos[0] || 3000;
const prefix = pos[1] || 'scan';
const only = opt.rule ? new Set(String(opt.rule).split(',')) : null;
const samples = +opt.samples || 1;

// coverage list: every country (so the long tail of regional events is exercised)
const countries = COUNTRIES.map((c) => c.code);
const t0 = Date.now();
const res = runAudit(lifeConfigs(N, { prefix, countries, stress: !!opt.stress, novelty: !!opt.novelty, migrant: !!opt.migrant }), {});
const groups = groupFlags(res.flags).filter((g) => !only || only.has(g.rule));

console.log(`lives ${res.stats.lives}  entries ${res.stats.entries}  time ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`events seen ${res.stats.eventsSeen.size}`);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log(`choices per life: mean ${mean(res.stats.choices).toFixed(1)}; adult lives: mean ${mean(res.stats.adultChoices).toFixed(1)}`);
console.log(`years with >=4 entries: ${res.stats.years4} of ${res.stats.years} (${(100 * res.stats.years4 / res.stats.years).toFixed(2)}%)`);
console.log(`flags by rule: ${JSON.stringify(res.stats.perRule)}  (total ${res.flags.length})`);
console.log(`stale allowlist entries: ${res.staleAllow.filter((a) => !a.rare).map((a) => a.rule + "/" + a.event).join(", ") || "none"}`);
console.log('');
let lastRule = '';
for (const g of groups) {
  if (g.rule !== lastRule) { console.log(`\n=== ${g.rule} ===`); lastRule = g.rule; }
  const f = g.sample;
  const sn = f.snap ? `age ${f.snap.age} ${f.snap.year} ${f.snap.country} ${f.snap.incomeAt}${f.snap.urban ? '' : '/rural'} ${f.snap.status}${f.snap.inSchool ? '/school' : ''} p:${f.snap.partner} k:${f.snap.kids} P:${f.snap.mother ? 'm' : '-'}${f.snap.father ? 'f' : '-'}` : '';
  console.log(`${String(g.n).padStart(4)}  ${g.id}  [${g.word}]  ${f.why}`);
  console.log(`      ${f.sentence.slice(0, 110)}`);
  if (sn) console.log(`      ${sn}  seed=${f.seed}`);
}
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(res.flags.map((f) => ({ ...f, snap: f.snap })), null, 1));
