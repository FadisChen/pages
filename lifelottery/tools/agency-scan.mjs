// Who decides? (Phase 6A)  Plays lives with automatic choices and lists the choice cards shown to people under 18, by event and age group,
// and the adult-only acts found in them (see tests/lib/rules-agency.mjs).
//
//   node tools/agency-scan.mjs [lives=1500] [--static] [--cards] [--prefix=ag]
//   --static   also run the static audit (every choice event x age 0-17 x five synthetic households)
//   --cards    list every event that offered a card to somebody under 18, with its labels

import { offeredScan, auditCards, staticAudit } from '../tests/lib/rules-agency.mjs';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const N = +args.filter((a) => !a.startsWith('--'))[0] || 1500;

const t0 = Date.now();
const { cards, family, lives } = offeredScan(N, { prefix: opt.prefix || 'ag' });
const under12 = cards.filter((c) => c.age < 12), under15 = cards.filter((c) => c.age < 15);
console.log(`lives ${lives}  time ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`choice cards shown: under 12: ${under12.length}   under 15: ${under15.length}   12-17: ${cards.filter((c) => c.age >= 12).length}   (family decisions logged under 12: ${family})`);
const flags = auditCards(cards);
const per = new Map();
for (const f of flags) { const k = `${f.event} [${f.act}] ${f.label}`; per.set(k, (per.get(k) || { n: 0, ages: new Set() })); const e = per.get(k); e.n++; e.ages.add(f.age); }
console.log(`offered labels with adult-only acts: ${flags.length} (under 15: ${flags.filter((f) => f.age < 15).length}; 15-17: ${flags.filter((f) => f.age >= 15).length})`);
for (const [k, v] of [...per].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(v.n).padStart(4)}  ages ${[...v.ages].sort((a, b) => a - b).join(',')}  ${k}`);
if (opt.cards) {
  const by = new Map();
  for (const c of cards) { const e = by.get(c.event) || { n: 0, ages: new Set(), labels: new Set() }; e.n++; e.ages.add(c.age); c.labels.forEach((l) => e.labels.add(l)); by.set(c.event, e); }
  console.log('\ncards by event (under 18):');
  for (const [k, e] of [...by].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(e.n).padStart(4)} ${k} ${[...e.ages].sort((a, b) => a - b).join(',')} | ${[...e.labels].join(' / ')}`);
}
if (opt.static) {
  const st = staticAudit();
  const g = new Map();
  for (const f of st.flags) { const k = `${f.event}#${f.choice} ${f.part} [${f.act}:${f.word}]`; const e = g.get(k) || { n: 0, ages: new Set(), s: f }; e.n++; e.ages.add(f.age); g.set(k, e); }
  console.log(`\nstatic audit: ${st.checked} choice/age/household combinations, ${st.flags.length} flags in ${g.size} places`);
  for (const [k, e] of g) console.log(`  ${k}  ages ${[...e.ages].sort((a, b) => a - b).join(',')}  ${e.s.label}\n        ${e.s.sentence.slice(0, 90)}`);
}
