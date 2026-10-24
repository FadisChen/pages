// Runs the unit and simulation tests: `node tools/run-tests.mjs [--quick] [--scale=0.5] [files...]`
//
//   (no flag)   the complete run, every audit at its full size (what `npm test` does): about 8 minutes with four cores
//   --quick     LL_QUICK=1: the sampling audits use a smaller number of lives (tests/lib/scale.mjs), the rules and checks are the same.
//               Meant for the normal developer loop (`npm run test:quick`, about 4 minutes); run the complete one before a release
//   --scale=K   LL_SCALE=K: every scaled() size is multiplied by K (a smoke run with 0.25)
//   files...    only these test files (default: tests/*.test.mjs)
//
// One file per process at a time is NOT forced: node --test runs the files in parallel, like `node --test tests/*.test.mjs`. The time
// budgets some audits assert (0.07 seconds a life for the coherence audit) are for files that share four cores, as they do here.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const env = { ...process.env };
const files = [];
for (const a of args) {
  if (a === '--quick') env.LL_QUICK = '1';
  else if (a.startsWith('--scale=')) env.LL_SCALE = a.slice(8);
  else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); }
  else files.push(a);
}
const list = files.length ? files : fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join('tests', f));
const t0 = Date.now();
console.log(`${env.LL_QUICK ? 'quick' : env.LL_SCALE ? `scaled x${env.LL_SCALE}` : 'complete'} run of ${list.length} test files`);
const r = spawnSync(process.execPath, ['--test', ...list], { cwd: ROOT, env, stdio: 'inherit' });
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(r.status ?? 1);
