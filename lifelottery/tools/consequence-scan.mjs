// Consequence tracker (Phase 6C): does a major choice leave a visible mark on the rest of the life?
//
//   node tools/consequence-scan.mjs [--lives=2000] [--prefix=cq] [--top=40] [--static] [--dynamic] [--json=out.json] [--quiet]
//
// STATIC analysis (reads the event definitions, no lives are played): for every major choice, the flags it sets (`set`, plus
// `h.set('x')` found in the source of its effects), the follow-ups it schedules, and who reads those flags: events (cond / weight /
// text / result / variants / choice cond), the yearly lines, and the engine itself (systems.js, helpers.js ...). A choice is
//   follow-up    schedules an event that is not scheduled by every sibling choice,
//   flag-read    sets a flag that some other event's text, result or cond reads,
//   weight-only  the flag is read only inside `weight` / `ai` (the odds move, nothing is written),
//   guard-only   the flag is read only by the event's own cond (a "once" guard), or by nobody,
//   none         neither flags nor follow-ups.
//
// DYNAMIC analysis (plays `--lives` lives with automatic choices): every time a major choice is made (by the player or by the family)
// the tool watches the rest of that life and records which of these happen later:
//   followup  an event the choice scheduled fires,
//   text      a text, result or "ordinary year" line that was written to the log read one of the flags the choice set,
//   cond      an event fired (or an option was offered) whose condition read one of those flags,
//   memory    a memory the choice recorded (engine/memory.js) is spoken again in a later log line,
//   eulogy    ... or in the life story at the end (reported apart: the end of the life is not "later in the life").
// "distinct" echoes are the ones that depend on WHICH option was taken (a flag or follow-up that every sibling option shares does not count).
// The headline numbers are weighted by how often each choice fires: the share of choice FIRINGS that had a visible echo.
//
// Exported for tests/consequence.test.mjs: staticAnalysis(), dynamicAnalysis(opts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ALL_EVENTS from '../js/data/events/index.js';
import YEARLY from '../js/data/yearly.js';
import { createLife, advanceYear } from '../js/engine/life.js';
import { getSummary } from '../js/engine/summary.js';
import { TRACE, isMajor } from '../js/engine/events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => (typeof f === 'function' ? String(f) : typeof f === 'string' ? '' : '');

// ---------------------------------------------------------------------------------------------
// Static analysis
// ---------------------------------------------------------------------------------------------

const READ_RES = [
  /\.(?:has|flag)\(\s*['"`]([A-Za-z0-9_]+)['"`]/g,
  /flags\.([A-Za-z][A-Za-z0-9_]*)/g,
  /flags\[\s*['"`]([A-Za-z0-9_]+)['"`]\s*\]/g,
];
const WRITE_RES = [/\.(?:set|inc)\(\s*['"`]([A-Za-z0-9_]+)['"`]/g];
const SEEN_RES = [/(?:seenEvent|yearsSince)\(\s*['"`]([a-z][a-z0-9_]+)['"`]/g, /seen\.([a-z][a-z0-9_]+)/g, /seen\[\s*['"`]([a-z][a-z0-9_]+)['"`]/g];

function grab(text, res) {
  const out = new Set();
  for (const re of res) { re.lastIndex = 0; let m; while ((m = re.exec(text))) out.add(m[1]); }
  return out;
}

/** Every function-valued part of an event, with a label for where it sits. */
function partsOf(ev) {
  const parts = [];
  const add = (where, v, choice = null) => { if (typeof v === 'function') parts.push({ where, text: String(v), choice }); };
  add('cond', ev.cond); add('weight', ev.weight); add('followCond', ev.followCond); add('effects', ev.effects); add('highlight', ev.highlight);
  add('text', ev.text); add('again', ev.again);
  (ev.variants || []).forEach((v) => add('text', v));
  (ev.choices || []).forEach((c, i) => {
    add('choice-cond', c.cond, i); add('effects', c.effects, i); add('ai', c.ai, i);
    add('text', c.result, i); add('text', c.familyResult, i); add('text', c.highlight, i);
  });
  return parts;
}

/** Flags that every option of the event sets (they say nothing about WHICH option was taken). */
function sharedSets(ev) {
  const lists = ev.choices.map((c) => new Set([...(c.set || []), ...grab(src(c.effects), WRITE_RES)]));
  return lists.length ? [...lists[0]].filter((f) => lists.every((l) => l.has(f))) : [];
}
function sharedSched(ev) {
  const ids = (c) => new Set((c.schedule || []).map((x) => x.id));
  const lists = ev.choices.map(ids);
  const shared = new Set((ev.schedule || []).map((x) => x.id));
  if (lists.length) for (const id of lists[0]) if (lists.every((l) => l.has(id))) shared.add(id);
  return shared;
}

/** Engine source files whose flag reads count as "the engine reads it" (the yearly systems, helpers, eulogy, summary). */
function engineReads() {
  const out = new Map(); // flag -> [file]
  for (const f of ['systems.js', 'helpers.js', 'events.js', 'life.js', 'eulogy.js', 'summary.js', 'focus.js', 'mortality.js', 'memory.js']) {
    const p = path.join(ROOT, 'js/engine', f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const fl of grab(text, READ_RES)) { if (!out.has(fl)) out.set(fl, new Set()); out.get(fl).add(f); }
  }
  return out;
}

// the sources are read once, before install() wraps the functions of the loaded events
const PARTS = new Map(ALL_EVENTS.map((ev) => [ev.id, partsOf(ev)]));
const YEARLY_SRC = YEARLY.map((y) => ({ cond: src(y.cond), text: src(y.text), variants: (y.variants || []).map(src) }));

export function staticAnalysis() {
  const events = ALL_EVENTS;
  const readers = new Map(); // flag -> [{ ev, where }]
  const seenReaders = new Map(); // event id -> [{ ev, where }]
  const note = (map, key, r) => { if (!map.has(key)) map.set(key, []); map.get(key).push(r); };
  for (const ev of events) {
    for (const p of PARTS.get(ev.id)) {
      for (const f of grab(p.text, READ_RES)) note(readers, f, { ev: ev.id, where: p.where, choice: p.choice });
      for (const id of grab(p.text, SEEN_RES)) note(seenReaders, id, { ev: ev.id, where: p.where });
    }
  }
  YEARLY_SRC.forEach((y, i) => {
    for (const [where, f] of [['cond', y.cond], ['text', y.text], ...y.variants.map((v) => ['text', v])]) {
      for (const fl of grab(f, READ_RES)) note(readers, fl, { ev: `yearly:${i}`, where });
    }
  });
  const engine = engineReads();
  const sources = new Map(); // follow-up id -> [{ ev, choice }]
  for (const ev of events) {
    for (const x of ev.schedule || []) note(sources, x.id, { ev: ev.id, choice: null });
    (ev.choices || []).forEach((c, i) => (c.schedule || []).forEach((x) => note(sources, x.id, { ev: ev.id, choice: i })));
  }

  const rows = [];
  for (const ev of events) {
    if (!isMajor(ev)) continue;
    const sh = new Set(sharedSets(ev));
    const shs = sharedSched(ev);
    ev.choices.forEach((c, i) => {
      const sets = new Set([...(c.set || []), ...grab(src(c.effects), WRITE_RES)]);
      const distinctSets = [...sets].filter((f) => !sh.has(f));
      const sched = (c.schedule || []).map((x) => x.id);
      const distinctSched = sched.filter((id) => !shs.has(id));
      const eventSched = (ev.schedule || []).map((x) => x.id);
      const flagReaders = {}; // flag -> readers other than the event's own cond / weight
      for (const f of sets) {
        const rs = (readers.get(f) || []).filter((r) => !(r.ev === ev.id && (r.where === 'cond' || r.where === 'choice-cond' || r.where === 'weight' || r.where === 'ai')));
        const eng = engine.get(f);
        if (rs.length || eng) flagReaders[f] = { events: rs, engine: eng ? [...eng] : [] };
      }
      const visible = (rs) => rs.events.some((r) => r.where === 'text' || r.where === 'cond' || r.where === 'choice-cond' || r.where === 'highlight' || r.where === 'again' || r.where === 'followCond');
      const weightOnly = (rs) => !visible(rs) && rs.events.some((r) => r.where === 'weight' || r.where === 'ai');
      const readSome = Object.values(flagReaders);
      let kind;
      if (distinctSched.length || (sched.length && !distinctSets.length)) kind = 'follow-up';
      else if (readSome.some(visible)) kind = 'flag-read';
      else if (readSome.some((r) => r.engine.length)) kind = 'engine-read';
      else if (readSome.some(weightOnly)) kind = 'weight-only';
      else if (sets.size) kind = 'guard-only';
      else kind = 'none';
      rows.push({
        event: ev.id, choice: i, label: c.label, sets: [...sets], distinctSets, schedules: sched, eventSchedules: eventSched, kind,
        readers: Object.fromEntries(Object.entries(flagReaders).map(([f, r]) => [f, { events: [...new Set(r.events.map((x) => `${x.ev}:${x.where}`))], engine: r.engine }])),
        seenBy: [...new Set((seenReaders.get(ev.id) || []).map((x) => x.ev))],
      });
    });
  }
  // follow-ups that cannot tell which option led to them: scheduled by several options of one event, and reading none of the flags
  // those options set. The text of such a follow-up must fit every one of those options (the "stay" / "leave" mismatch of 6A).
  const byId = new Map(events.map((e) => [e.id, e]));
  const blind = [];
  for (const ev of events) {
    if (!isMajor(ev)) continue;
    const targets = new Map(); // follow-up id -> [choice index]
    ev.choices.forEach((c, i) => { for (const x of c.schedule || []) { if (!targets.has(x.id)) targets.set(x.id, []); targets.get(x.id).push(i); } });
    for (const x of ev.schedule || []) targets.set(x.id, ev.choices.map((c, i) => i)); // event-level: every option
    for (const [id, idxs] of targets) {
      const f = byId.get(id);
      if (!f || idxs.length < 2) continue;
      const setBy = idxs.map((i) => new Set([...(ev.choices[i].set || []), ...grab(src(ev.choices[i].effects), WRITE_RES)]));
      const distinct = [...new Set(setBy.flatMap((x) => [...x]))].filter((fl) => !setBy.every((x) => x.has(fl)));
      const fsrc = (PARTS.get(id) || []).map((p) => p.text).join('\n');
      const fReads = grab(fsrc, READ_RES);
      const reads = distinct.filter((fl) => fReads.has(fl));
      // the follow-up may also read the event's own id (seenEvent) or a flag common to all of them: not a way to tell the options apart
      if (!reads.length) blind.push({ event: ev.id, followUp: id, options: idxs.map((i) => ev.choices[i].label), distinctFlags: distinct });
    }
  }
  const count = (k) => rows.filter((r) => r.kind === k).length;
  const kinds = ['follow-up', 'flag-read', 'engine-read', 'weight-only', 'guard-only', 'none'];
  return { rows, blind, kinds: Object.fromEntries(kinds.map((k) => [k, count(k)])), total: rows.length, events: events.filter(isMajor).length };
}

// ---------------------------------------------------------------------------------------------
// Dynamic analysis
// ---------------------------------------------------------------------------------------------

const CTX = { mode: null, buf: new Set(), condBuf: null, condReads: new Map(), installed: false };

/** Wrap every text-like and cond-like function so reads of a flag are attributed to where they happen. (Tool-only; mutates the loaded event objects.) */
function install() {
  if (CTX.installed) return;
  CTX.installed = true;
  const textW = (fn) => (typeof fn === 'function' ? (s, h) => { const prev = CTX.mode; CTX.mode = 'text'; try { return fn(s, h); } finally { CTX.mode = prev; } } : fn);
  const condW = (id, fn) => (typeof fn === 'function' ? (s, h) => {
    const prev = CTX.mode, prevBuf = CTX.condBuf;
    CTX.mode = 'cond'; CTX.condBuf = new Set();
    let r;
    try { r = fn(s, h); } finally { CTX.mode = prev; }
    const got = CTX.condBuf; CTX.condBuf = prevBuf;
    if (r) { const old = CTX.condReads.get(id); CTX.condReads.set(id, old ? new Set([...old, ...got]) : got); }
    return r;
  } : fn);
  for (const ev of ALL_EVENTS) {
    ev.text = textW(ev.text);
    if (ev.variants) ev.variants = ev.variants.map(textW);
    if (ev.again) ev.again = textW(ev.again);
    if (ev.cond) ev.cond = condW(ev.id, ev.cond);
    for (const c of ev.choices || []) {
      if (c.result !== undefined) c.result = textW(c.result);
      if (c.familyResult !== undefined && c.familyResult !== false) c.familyResult = textW(c.familyResult);
      if (c.memory !== undefined && c.memory !== false) c.memory = textW(c.memory);
      if (c.memoryYou !== undefined && c.memoryYou !== false) c.memoryYou = textW(c.memoryYou);
      if (c.cond) c.cond = condW(ev.id, c.cond);
    }
  }
  YEARLY.forEach((y) => { y.text = textW(y.text); if (y.variants) y.variants = y.variants.map(textW); });
}

function watch(s) {
  s.flags = new Proxy(s.flags, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      if (typeof k === 'string' && v && !k.startsWith('_')) {
        if (CTX.mode === 'text') CTX.buf.add(k);
        else if (CTX.mode === 'cond' && CTX.condBuf) CTX.condBuf.add(k);
      }
      return v;
    },
  });
}

const rawFlags = (s) => { const o = {}; for (const k of Object.keys(s.flags)) if (!k.startsWith('_') && s.flags[k]) o[k] = true; return o; };

/** Play one life with the tracer on and return what each major choice left behind. */
function playTraced(settings, seed, opts) {
  install();
  const s = createLife(settings, seed, opts);
  watch(s);
  let seq = 0;
  const L = { s, firings: [], reads: [], fires: [], recalls: [], yearlies: 0, echoes: 0, reflections: 0 };
  let pre = null;
  const flush = (ctxName, ev) => {
    const flags = [...CTX.buf];
    CTX.buf = new Set();
    if (flags.length) L.reads.push({ seq, ctx: ctxName, ev, flags });
  };
  const recallScan = (entry) => {
    if (entry.echo) L.echoes++;
    if (entry.kind === 'year' && /想起|記得|思緒/.test(entry.text) && (s.memories || []).some((m) => entry.text.includes(m.p))) L.reflections++;
    const said = `${entry.text}${entry.echo || ''}`;
    for (const m of s.memories || []) if (m.p && m.p.length >= 4 && m.a < s.age && said.includes(m.p)) L.recalls.push({ seq, key: m.k });
  };
  TRACE.pre = (st, ev, idx) => { if (st !== s) return; pre = { flags: rawFlags(s), pending: s.pending.length, mem: new Set((s.memories || []).map((m) => m.k)) }; };
  TRACE.post = (st, ev, idx, entry, byFamily) => {
    if (st !== s) return;
    seq++;
    flush('text', ev.id);
    const now = rawFlags(s);
    const evSet = new Set(byFamily ? ev.set || [] : []);
    const flags = Object.keys(now).filter((f) => !pre.flags[f] && !evSet.has(f));
    const queued = s.pending.slice(pre.pending).map((p) => p.id);
    const mem = (s.memories || []).filter((m) => !pre.mem.has(m.k)).map((m) => m.k);
    L.firings.push({ seq, age: s.age, ev: ev.id, idx, label: ev.choices[idx].label, byFamily: !!byFamily, flags, queued, mem });
    recallScan(entry);
  };
  TRACE.fire = (st, ev, entry) => {
    if (st !== s) return;
    seq++;
    flush('text', ev.id);
    const cr = CTX.condReads.get(ev.id);
    if (cr && cr.size) L.reads.push({ seq, ctx: 'cond', ev: ev.id, flags: [...cr] });
    CTX.condReads.delete(ev.id);
    L.fires.push({ seq, ev: ev.id, age: s.age });
    recallScan(entry);
  };
  TRACE.yearly = (st, entry) => {
    if (st !== s) return;
    seq++;
    flush('text', 'yearly');
    L.yearlies++;
    recallScan(entry);
  };
  try {
    let g = 0;
    while (s.alive && g++ < 130) { CTX.buf = new Set(); advanceYear(s, { auto: true }); }
  } finally { TRACE.pre = TRACE.post = TRACE.fire = TRACE.yearly = null; }
  try { L.eulogy = getSummary(s).eulogy.text; } catch (e) { L.eulogy = ''; }
  return L;
}

const SHARED = new Map(); // event id -> { sets, sched }
function sharedOf(ev) {
  if (!SHARED.has(ev.id)) SHARED.set(ev.id, { sets: new Set(sharedSets(ev)), sched: sharedSched(ev) });
  return SHARED.get(ev.id);
}
const EVENT_BY_ID = new Map(ALL_EVENTS.map((e) => [e.id, e]));

/** What happened after each choice firing of one traced life. */
function judge(L) {
  const out = [];
  const deathAge = L.s.death ? L.s.death.age : L.s.age;
  for (const F of L.firings) {
    const ev = EVENT_BY_ID.get(F.ev);
    const sh = sharedOf(ev);
    const own = new Set(F.flags);
    const distinct = new Set(F.flags.filter((f) => !sh.sets.has(f)));
    const echo = { followup: false, text: false, cond: false, memory: false, eulogy: false };
    const strict = { followup: false, text: false, cond: false, memory: false };
    for (const r of L.reads) {
      if (r.seq <= F.seq) continue;
      if (r.ctx === 'cond' && r.ev === F.ev) continue; // the event's own guard
      const hit = r.flags.filter((f) => own.has(f));
      if (!hit.length) continue;
      const kind = r.ctx === 'cond' ? 'cond' : 'text';
      echo[kind] = true;
      if (hit.some((f) => distinct.has(f))) strict[kind] = true;
    }
    const q = new Set(F.queued);
    for (const f of L.fires) {
      if (f.seq > F.seq && q.has(f.ev)) { echo.followup = true; if (!sh.sched.has(f.ev)) strict.followup = true; }
    }
    for (const rc of L.recalls) {
      if (rc.seq > F.seq && F.mem.includes(rc.key)) { echo.memory = true; strict.memory = true; }
    }
    if (L.eulogy && F.mem.length) {
      for (const m of L.s.memories || []) if (F.mem.includes(m.k) && m.p && L.eulogy.includes(m.p)) echo.eulogy = true;
    }
    const any = echo.followup || echo.text || echo.cond || echo.memory;
    const strictAny = strict.followup || strict.text || strict.cond || strict.memory;
    out.push({ ...F, echo, strict, any, strictAny, yearsLeft: deathAge - F.age, sets: F.flags.length, schedules: F.queued.length, memories: F.mem.length });
  }
  return out;
}

const ERAS = ['past', 'present', 'future'];

export function dynamicAnalysis({ lives = 2000, prefix = 'cq', onLife = null } = {}) {
  const firings = [];
  let yearlies = 0, years = 0, memoriesMade = 0, memoriesRecalled = 0, recallLines = 0, echoes = 0, reflections = 0;
  for (let i = 0; i < lives; i++) {
    const L = playTraced({ era: ERAS[i % 3], drawMode: 'births', pace: 'standard' }, `${prefix}${i}`, {});
    firings.push(...judge(L));
    yearlies += L.yearlies;
    years += L.s.death ? L.s.death.age : L.s.age;
    const mems = L.s.memories || [];
    memoriesMade += mems.length;
    memoriesRecalled += mems.filter((m) => (m.n || 0) > 0).length;
    recallLines += mems.reduce((a, m) => a + (m.n || 0), 0);
    echoes += L.echoes; reflections += L.reflections;
    if (onLife) onLife(i, L);
  }
  const n = firings.length;
  const share = (pred) => (n ? firings.filter(pred).length / n : 0);
  const late = firings.filter((f) => f.yearsLeft >= 3);
  const byEvent = new Map();
  for (const f of firings) {
    const k = `${f.ev}#${f.idx}`;
    const e = byEvent.get(k) || { event: f.ev, idx: f.idx, label: f.label, n: 0, any: 0, strict: 0, followup: 0, text: 0, cond: 0, memory: 0, sets: 0, sched: 0, mem: 0 };
    e.n++; if (f.any) e.any++; if (f.strictAny) e.strict++;
    for (const t of ['followup', 'text', 'cond', 'memory']) if (f.echo[t]) e[t]++;
    if (f.sets) e.sets++; if (f.schedules) e.sched++; if (f.memories) e.mem++;
    byEvent.set(k, e);
  }
  return {
    lives, firings: n, years, yearlies,
    any: share((f) => f.any), strict: share((f) => f.strictAny),
    anyWithEulogy: share((f) => f.any || f.echo.eulogy),
    anyLate: late.length ? late.filter((f) => f.any).length / late.length : 0,
    byType: Object.fromEntries(['followup', 'text', 'cond', 'memory', 'eulogy'].map((t) => [t, share((f) => f.echo[t])])),
    perLife: { choices: n / lives, memories: memoriesMade / lives, recalled: memoriesRecalled / lives, recallLines: recallLines / lives, echoes: echoes / lives, reflections: reflections / lives },
    byYearsLeft: [[0, 2], [3, 9], [10, 24], [25, 200]].map(([a, b]) => { const f = firings.filter((x) => x.yearsLeft >= a && x.yearsLeft <= b); return { from: a, to: b, n: f.length, any: f.length ? f.filter((x) => x.any).length / f.length : 0 }; }),
    rows: [...byEvent.values()].sort((a, b) => b.n - a.n),
  };
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

const pct = (x) => `${(100 * x).toFixed(1)}%`;

async function main() {
  const args = process.argv.slice(2);
  const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
  const wantStatic = opt.static || !opt.dynamic;
  const wantDynamic = opt.dynamic || !opt.static;
  const top = +opt.top || 40;
  const out = {};
  if (wantStatic) {
    const st = staticAnalysis();
    out.static = { total: st.total, kinds: st.kinds };
    console.log(`STATIC: ${st.events} major events, ${st.total} choices`);
    for (const [k, v] of Object.entries(st.kinds)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}  ${pct(v / st.total)}`);
    const withEcho = st.kinds['follow-up'] + st.kinds['flag-read'] + st.kinds['engine-read'];
    console.log(`  with a reader or a follow-up: ${withEcho} (${pct(withEcho / st.total)})`);
    if (opt.blind || opt.list) {
      console.log(`\n  follow-ups scheduled by several options that read none of the flags telling them apart (${st.blind.length}):`);
      for (const b of st.blind) console.log(`    ${b.event} -> ${b.followUp}   [${b.options.join(' | ')}]`);
    }
    if (opt.list) {
      for (const r of st.rows.filter((x) => ['none', 'guard-only', 'weight-only'].includes(x.kind))) console.log(`    ${r.kind.padEnd(11)} ${r.event}#${r.choice} ${r.label}  sets=[${r.sets}]`);
    }
  }
  if (wantDynamic) {
    const t0 = Date.now();
    const dy = dynamicAnalysis({ lives: +opt.lives || 2000, prefix: opt.prefix || 'cq' });
    out.dynamic = { ...dy, rows: dy.rows.slice(0, 400) };
    console.log(`\nDYNAMIC: ${dy.lives} lives, ${dy.firings} major choices (${dy.perLife.choices.toFixed(1)} per life), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log(`  a visible echo later in the life:      ${pct(dy.any)}   (only choices with 3+ years left: ${pct(dy.anyLate)})`);
    console.log(`  ... depending on WHICH option was taken: ${pct(dy.strict)}`);
    console.log(`  ... counting the life story at the end: ${pct(dy.anyWithEulogy)}`);
    console.log(`  by channel: ${Object.entries(dy.byType).map(([k, v]) => `${k} ${pct(v)}`).join('  ')}`);
    console.log(`  memories per life ${dy.perLife.memories.toFixed(1)}, spoken again ${dy.perLife.recalled.toFixed(1)}; reflection lines per life ${dy.perLife.reflections.toFixed(1)}, echo lines on events ${dy.perLife.echoes.toFixed(1)}`);
    console.log(`  by years left after the choice: ${dy.byYearsLeft.map((b) => `${b.from}-${b.to > 100 ? '+' : b.to}y ${pct(b.any)} (${b.n})`).join('  ')}`);
    console.log(`\n  least echoed choices that fire often (events x option, firings, share with an echo, flags set / follow-ups / memories):`);
    const rows = dy.rows.filter((r) => r.any / r.n < 0.8).sort((a, b) => (b.n - b.any) - (a.n - a.any)).slice(0, top);
    for (const r of rows) console.log(`  ${String(r.n).padStart(5)}  ${pct(r.any / r.n).padStart(6)}  ${r.event}#${r.idx} ${r.label}  [flag ${pct(r.sets / r.n)} follow ${pct(r.sched / r.n)} mem ${pct(r.mem / r.n)}]`);
  }
  if (opt.json && typeof opt.json === 'string') fs.writeFileSync(opt.json, JSON.stringify(out, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith('consequence-scan.mjs')) await main();
