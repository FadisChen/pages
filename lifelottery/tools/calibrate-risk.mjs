#!/usr/bin/env node
// Regenerates js/data/riskref.js: the mean (un-normalised) risk multiplier per income group, gender, era and
// 5-year age bin among people alive at that age. Run after changing systems, conditions or event risk effects:
//
//   node lifelottery/tools/calibrate-risk.mjs [livesPerPass=30000] [passes=3] [workers=cores]
//
// Each pass simulates lives with the current table installed and multiplies every bin's reference by the
// observed mean of the normalised multiplier, so it converges toward E[multiplier | alive] = 1.
//
// Phase 6C: the lives of a pass are played on worker threads (one slice of the life numbers each; the seeds are the same as in a serial run,
// so the table does not depend on the number of workers), which makes `30000 4` take about a quarter of the time on four cores.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createLife, advanceYear } from '../js/engine/life.js';
import { rawRiskMultiplier, riskKey, RISK_BIN } from '../js/engine/mortality.js';
import { ctxOf } from '../js/engine/systems.js';
import REF from '../js/data/riskref.js';

const here = dirname(fileURLToPath(import.meta.url));
const BINS = 25; // 0..124

const keys = [];
for (const inc of ['L', 'LM', 'UM', 'H']) for (const g of ['F', 'M']) for (const era of ['past', 'present', 'future']) keys.push(`${inc}${g}@${era}`);

// Mutable copy of the reference table (the module object itself is the same one mortality.js reads). A key that
// does not exist yet starts from the pooled (income + gender) row, or from 1.
for (const k of keys) if (!REF[k]) REF[k] = REF[k.split('@')[0]] ? [...REF[k.split('@')[0]]] : new Array(BINS).fill(1);

/** Play the lives [from, to) of a pass with the table `ref` installed and return the sums and counts per key and bin. */
function slice(pass, from, to, ref) {
  for (const k of keys) REF[k] = ref[k].slice();
  const sum = {}, cnt = {};
  for (const k of keys) { sum[k] = new Array(BINS).fill(0); cnt[k] = new Array(BINS).fill(0); }
  for (let i = from; i < to; i++) {
    const s = createLife({ era: 'random', drawMode: 'births' }, `cal${pass}-${i}`);
    let guard = 0;
    while (s.alive && guard++ < 125) {
      if (s.age >= 5) {
        const ctx = ctxOf(s);
        const k = riskKey(ctx.home, s);
        const bin = Math.min(BINS - 1, Math.floor(s.age / RISK_BIN));
        const raw = rawRiskMultiplier(s, ctx.home, ctx.birthView);
        sum[k][bin] += raw / (REF[k][bin] || 1);
        cnt[k][bin] += 1;
      }
      advanceYear(s, { auto: true });
    }
  }
  return { sum, cnt };
}

if (!isMainThread) {
  const { pass, from, to, ref } = workerData;
  parentPort.postMessage(slice(pass, from, to, ref));
} else {
  const lives = +process.argv[2] || 30000;
  const passes = +process.argv[3] || 3;
  const nWorkers = Math.max(1, +process.argv[4] || (os.availableParallelism ? os.availableParallelism() : os.cpus().length));

  for (let pass = 1; pass <= passes; pass++) {
    const ref = {};
    for (const k of keys) ref[k] = REF[k].slice();
    // many small slices, handed out as workers become free, so that a slow slice does not hold the others up
    const SLICE = Math.max(200, Math.ceil(lives / (nWorkers * 8)));
    const jobs = [];
    for (let from = 0; from < lives; from += SLICE) jobs.push([from, Math.min(lives, from + SLICE)]);
    const parts = await new Promise((resolveAll, rejectAll) => {
      const results = [];
      let next = 0, running = 0;
      const launch = () => {
        while (running < nWorkers && next < jobs.length) {
          const [from, to] = jobs[next++];
          running++;
          const w = new Worker(new URL(import.meta.url), { workerData: { pass, from, to, ref } });
          w.once('message', (m) => { results.push(m); });
          w.once('error', rejectAll);
          w.once('exit', () => { running--; if (results.length === jobs.length) resolveAll(results); else launch(); });
        }
      };
      launch();
    });
    const sum = {}, cnt = {};
    for (const k of keys) { sum[k] = new Array(BINS).fill(0); cnt[k] = new Array(BINS).fill(0); }
    for (const p of parts) for (const k of keys) for (let b = 0; b < BINS; b++) { sum[k][b] += p.sum[k][b]; cnt[k][b] += p.cnt[k][b]; }
    let worst = 0;
    for (const k of keys) {
      for (let b = 1; b < BINS; b++) {
        if (cnt[k][b] < 40) continue;
        const m = sum[k][b] / cnt[k][b];
        worst = Math.max(worst, Math.abs(m - 1));
        REF[k][b] = (REF[k][b] || 1) * m;
      }
      // Fill sparse bins with the nearest calibrated neighbour so the table is monotone-safe.
      for (let b = 1; b < BINS; b++) if (cnt[k][b] < 40) REF[k][b] = REF[k][b - 1];
      REF[k][0] = 1;
    }
    console.log(`pass ${pass}: worst |mean-1| = ${worst.toFixed(3)}`);
  }

  const out = {};
  for (const k of keys) out[k] = REF[k].map((x) => Math.round(x * 1000) / 1000);
  const body = keys.map((k) => `  '${k}': [${out[k].join(', ')}],`).join('\n');
  writeFileSync(resolve(here, '../js/data/riskref.js'), `// GENERATED by tools/calibrate-risk.mjs - do not edit by hand.
// Mean personal risk multiplier by (income group + gender + '@' + era) and 5-year age bin; mortality.js divides by it.
export default {
${body}
};
`);
  console.log('wrote js/data/riskref.js');
}
