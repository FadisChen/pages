// Does the family roster (Phase 7A, engine/kin.js) leave the protagonist's life alone?
//
//   node tools/kin-determinism.mjs --base=/path/to/an/older/checkout/lifelottery [--n=60] [--grief=0|1]   (without --grief: both)
//
// Plays the same seeds with this checkout and with `--base` (for example `git archive <commit> lifelottery | tar -x -C /tmp/base`), automatic
// choices, and compares what the PROTAGONIST lived: for every log entry its age, kind and title (for a choice the title is the label that was
// chosen), the age and cause of death and the final state of the random generator (so even the NUMBER of draws must agree). Lines of kind
// 'kin' (a sibling or an in-law died) exist only in this checkout and are left out, and so are the ordinary-year lines of the years they
// replace. With `--grief=0` (default) kin deaths do not move the protagonist's stats, so every life must be identical from birth to death.
// With `--grief=1` (the game as shipped) the first sibling or in-law death can reach the stats, so a life must agree up to that year; the
// report says how many lives agree to the end and where the others first part.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
if (!opt.base) { console.error('usage: node tools/kin-determinism.mjs --base=/path/to/older/lifelottery [--n=60] [--grief=0|1]'); process.exit(2); }
const N = +(opt.n || 60);

const here = new URL('../js/engine/', import.meta.url);
const there = pathToFileURL(path.resolve(opt.base, 'js/engine') + '/');
const load = async (dir) => ({ life: await import(new URL('life.js', dir)) });
const A = await load(there);   // the older version
const B = await load(here);    // this checkout
const kin = await import(new URL('kin.js', here));

const ERAS = ['past', 'present', 'future', 'random'];

function play(mod, seed, era, withKin) {
  const s = mod.life.createLife({ era }, seed);
  let g = 0;
  while (s.alive && g++ < 130) mod.life.advanceYear(s, { auto: true });
  const kinYears = new Set(withKin ? s.log.filter((e) => e.kind === 'kin').map((e) => e.year) : []);
  return { s, kinYears };
}

function signature(s, skipYears) {
  const rows = [];
  for (const e of s.log) {
    if (e.kind === 'kin') continue;
    if (e.kind === 'year' && skipYears.has(e.year)) continue;
    rows.push(`${e.age}|${e.kind}|${e.title}`);
  }
  return { rows, death: s.death ? `${s.death.age}|${s.death.causeId}` : 'alive', rng: s.rng.join(',') };
}

let failed = false;
for (const grief of opt.grief === undefined ? [false, true] : [opt.grief === '1']) {
  kin.KIN_TUNING.grief = grief;
  let identical = 0, parted = 0, tooEarly = 0;
  const examples = [];
  for (let i = 0; i < N; i++) {
    const seed = `kind-${i}`;
    const era = ERAS[i % ERAS.length];
    const a = play(A, seed, era, false);
    const b = play(B, seed, era, true);
    const skip = b.kinYears;
    const sa = signature(a.s, skip), sb = signature(b.s, skip);
    const same = sa.death === sb.death && sa.rng === sb.rng && sa.rows.length === sb.rows.length && sa.rows.every((r, j) => r === sb.rows[j]);
    if (same) { identical++; continue; }
    parted++;
    // where do they part? the first differing row, compared with the first kin line of this life
    let j = 0;
    while (j < sa.rows.length && j < sb.rows.length && sa.rows[j] === sb.rows[j]) j++;
    const partAge = +(sa.rows[j] || sb.rows[j] || '999').split('|')[0];
    const firstKin = Math.min(...b.s.log.filter((e) => e.kind === 'kin').map((e) => e.age), 999);
    if (!grief || partAge < firstKin) tooEarly++;
    if (examples.length < 5) examples.push({ seed, era, partAge, firstKin, older: sa.rows[j], now: sb.rows[j] });
  }
  console.log(`grief ${grief ? 'on (as shipped)' : 'off'}: ${identical}/${N} lives identical from birth to death (events, choices, death, random-generator state)`);
  if (parted) {
    console.log(`  ${parted} lives part, ${tooEarly} of them before the first kin line (grief on: that is the only way the roster can reach a life; grief off: none may part)`);
    for (const e of examples) console.log('   ', JSON.stringify(e));
  }
  if (tooEarly) failed = true;
}
process.exit(failed ? 1 : 0);
