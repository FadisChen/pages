// Memories (Phase 6C): the moments a life keeps and speaks of again.
//
// A memory is a short clause about one thing that happened, written in the second person and in the past ("是叔叔借了車，送你去診所").
// It is stored with the age it happened at, so a later text can say "你想起十歲那年，是叔叔借了車，送你去診所。".
//
//   state.memories = [ { k: key, p: phrase, a: age, g: domain, w?: weight 1..3, n?: times spoken } ]     (JSON-safe, at most MEMORY_CAP)
//
// Who writes them
//   * events.js: every major choice (an authored `memory` on the choice, or "面對「title」，你選了「label」"), every decision the family
//     took for a child (an authored `memory` naming who decided), a regular event with a `memory` field;
//   * systems.js: the first job, the wedding, a child's birth, a divorce, a loss (parent, partner, child), every move to another country;
//   * events through h.remember(key, phrase, { age, tag, w }).
// Who speaks them
//   * events.js: an "ordinary year" may become a reflection on one or two memories (reflection); an event of the same domain as an
//     older memory may carry one short echo line (echoFor), stored in the log entry as `echo`;
//   * events through h.recall(key) / h.memories(tag);
//   * the life story (eulogy.js) through summary.memory (keepsakeOf).
// Nothing here draws a random number: every choice is a hash of the life (the seed, the age and the key), so adding memories never
// changes which events a life meets, and a reload or a replay says the same words.

import { hash01 } from './rng.js';

export const MEMORY_CAP = 48;
/** Quiet memories (kin deaths, Phase 7A) have a cap of their own, so they never push an ordinary memory out of the 48. */
export const QUIET_CAP = 16;

/** The kinds of moment a memory belongs to; an event of the same domain may call an older one back. */
export const DOMAINS = ['school', 'work', 'money', 'family', 'love', 'health', 'move', 'bond', 'life'];

const TAG_DOMAIN = {
  school: 'school', education: 'school', youth: 'school', talent: 'school', growing: 'school', exam: 'school', language: 'school',
  work: 'work', job: 'work', career: 'work', labor: 'work', trade: 'work', business: 'work', skilled: 'work', military: 'work', farm: 'work', farming: 'work', pastoral: 'work', sea: 'work',
  money: 'money', economy: 'money', scam: 'money', housing: 'money', inheritance: 'money', hardship: 'money', luck: 'money', energy: 'money',
  family: 'family', children: 'family', parents: 'family', siblings: 'family', caregiving: 'family', care: 'family', home: 'family', pregnancy: 'family', aging: 'family', childhood: 'family', chores: 'family',
  love: 'love', marriage: 'love', divorce: 'love',
  health: 'health', mental: 'health', illness: 'health', chronic: 'health', body: 'health', addiction: 'health', habit: 'health', wellness: 'health', exercise: 'health', diet: 'health',
  disability: 'health', accident: 'health', cancer: 'health', tb: 'health', hiv: 'health', dementia: 'health', malaria: 'health', disease: 'health', vaccine: 'health', screening: 'health', stress: 'health', lifestyle: 'health',
  migration: 'move', abroad: 'move', refugee: 'move', return: 'move', displacement: 'move', irregular: 'move', adjustment: 'move', discrimination: 'move', travel: 'move', internal: 'move', disaster: 'move',
  friends: 'bond', social: 'bond', community: 'bond', culture: 'bond', religion: 'bond', identity: 'bond', hobby: 'bond', art: 'bond', festival: 'bond', creative: 'bond', fun: 'bond', ethics: 'bond', empathy: 'bond',
};

const DOMAIN_CACHE = new Map();
/** Domain of an event, from its tags (the first tag that has one); 'life' when none does. */
export function domainOf(ev) {
  if (!ev) return 'life';
  let d = DOMAIN_CACHE.get(ev.id);
  if (d === undefined) {
    d = 'life';
    for (const t of ev.tags || []) if (TAG_DOMAIN[t]) { d = TAG_DOMAIN[t]; break; }
    DOMAIN_CACHE.set(ev.id, d);
  }
  return d;
}

const GENERIC_TAGS = new Set(['world', 'regional', 'followup', 'chain', 'era', 'milestone', 'future', 'family', 'work', 'health', 'money', 'school', 'love', 'migration', 'life', 'urban', 'tech', 'economy', 'youth', 'growing', 'childhood']);

const SPECIFIC_CACHE = new Map();
/** Up to three tags that say what an event is about (not just which part of life it belongs to): 'friends', 'illness', 'caregiving' ... */
export function specificTags(ev) {
  if (!ev) return [];
  let t = SPECIFIC_CACHE.get(ev.id);
  if (t === undefined) { t = (ev.tags || []).filter((x) => !GENERIC_TAGS.has(x)).slice(0, 3); SPECIFIC_CACHE.set(ev.id, t); }
  return t;
}

/** Tags of events that never carry an echo of a pleasant old memory: grief, war, disaster, death. */
const NO_ECHO_TAGS = new Set(['grief', 'death', 'finale', 'conflict', 'disaster', 'refugee', 'displacement', 'pandemic', 'shock', 'war', 'hiv', 'cancer']);
/** Events in which a person looks back on their life: any memory fits, and two may be spoken. */
const REFLECTIVE_TAGS = new Set(['reflection', 'midlife', 'late']);
export function isReflective(ev) { return (ev.tags || []).some((t) => REFLECTIVE_TAGS.has(t)); }

export function echoAllowed(ev) {
  if (ev.milestone && !isReflective(ev)) return false;
  if (ev.weight === 0 || (ev.tags || []).includes('followup')) return false; // a follow-up already carries on the story of its own choice
  return !(ev.tags || []).some((t) => NO_ECHO_TAGS.has(t));
}

// ---------------------------------------------------------------------------------------------
// Numbers and time words
// ---------------------------------------------------------------------------------------------

const DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 0..999 in Chinese numerals as used for ages: 十、十一、二十、二十三、一百。 */
export function cnNumber(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (n < 10) return DIGIT[n];
  if (n < 20) return `十${n % 10 ? DIGIT[n % 10] : ''}`;
  if (n < 100) return `${DIGIT[Math.floor(n / 10)]}十${n % 10 ? DIGIT[n % 10] : ''}`;
  const r = n % 100;
  if (r === 0) return '一百';
  if (r < 10) return `一百零${DIGIT[r]}`;
  return `一百${DIGIT[Math.floor(r / 10)]}十${r % 10 ? DIGIT[r % 10] : ''}`;
}

/** "去年", "前年", "出生那年", "十歲那年": when a memory happened, seen from `now`. */
export function whenWord(memAge, now) {
  const gap = now - memAge;
  if (gap <= 0) return '那時';
  if (gap === 1) return '去年';
  if (gap === 2) return '前年';
  if (memAge < 1) return '出生那年';
  return `${cnNumber(memAge)}歲那年`;
}

// ---------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------

const clean = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().replace(/[。，、；！？.!?,;]+$/, '');

function score(m) { return (m.w || 1) * 10 - (m.n ? 3 : 0) + (m.a || 0) / 200; }

/**
 * Keep a memory. A second memory with the same key replaces the first (the later choice of a repeatable event, the next move abroad is
 * a new key of its own). Returns true when something was stored.
 */
export function remember(s, key, phrase, opts = {}) {
  const p = clean(phrase);
  if (!key || !p || p.length < 4 || p.length > 110 || /undefined|NaN|\[object/.test(p)) return false;
  const list = s.memories || (s.memories = []);
  const a = Number.isFinite(opts.age) ? Math.max(0, Math.floor(opts.age)) : s.age;
  const g = DOMAINS.includes(opts.tag) ? opts.tag : (DOMAINS.includes(opts.domain) ? opts.domain : 'life');
  const w = Math.max(1, Math.min(3, Math.floor(opts.w || 1)));
  const i = list.findIndex((m) => m.k === key);
  const m = { k: key, p, a, g };
  if (Array.isArray(opts.tags) && opts.tags.length) m.t = opts.tags.slice(0, 3).join(',');
  if (w > 1) m.w = w;
  if (opts.plain) m.u = 1; // the generic "面對…，你選了…": kept for the record (the consequence tracker), never spoken
  if (opts.told) m.s = 1; // the choice already has a follow-up of its own: the others are called back first
  if (opts.quiet) m.q = 1; // kept (family drawer, life story) but never chosen by a reflection or an echo, and outside the cap of the others
  if (i >= 0) { if (list[i].n) { m.n = list[i].n; m.l = list[i].l; } list[i] = m; } else list.push(m);
  const group = list.filter((x) => !!x.q === !!m.q);
  if (group.length > (m.q ? QUIET_CAP : MEMORY_CAP)) {
    let lo = group[0];
    for (const x of group) if (score(x) < score(lo)) lo = x;
    list.splice(list.indexOf(lo), 1);
  }
  return true;
}

/** Memories read from a save or an album record: only well-formed entries, capped. */
export function sanitizeMemories(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  let loud = 0, quiet = 0;
  for (const m of list) {
    if (!m || typeof m.k !== 'string' || typeof m.p !== 'string' || !Number.isFinite(m.a)) continue;
    const e = { k: m.k.slice(0, 80), p: m.p.slice(0, 110), a: Math.max(0, Math.floor(m.a)), g: DOMAINS.includes(m.g) ? m.g : 'life' };
    if (typeof m.t === 'string' && m.t) e.t = m.t.slice(0, 40);
    if (m.w > 1) e.w = Math.min(3, Math.floor(m.w));
    if (m.u) e.u = 1;
    if (m.s) e.s = 1;
    if (m.q) e.q = 1;
    if (m.n > 0) e.n = Math.min(9, Math.floor(m.n));
    if (Number.isFinite(m.l) && m.l >= 0) e.l = Math.floor(m.l);
    if ((e.q ? quiet : loud) >= (e.q ? QUIET_CAP : MEMORY_CAP)) continue;
    if (e.q) quiet++; else loud++;
    out.push(e);
  }
  return out;
}

/** The memory kept under `key`, or null. */
export function memoryOf(s, key) {
  return (s.memories || []).find((m) => m.k === key) || null;
}

/** The memory as it is said: "十歲那年，是叔叔借了車，送你去診所". */
export function speech(s, m) {
  return `${whenWord(m.a, s.age)}，${m.p}`;
}

/** All memories (optionally of one domain or one key prefix such as 'family'), oldest first, as plain data. */
export function listMemories(s, tag) {
  return (s.memories || [])
    .filter((m) => !m.u && (!tag || m.g === tag || m.k === tag || m.k.startsWith(`${tag}:`)))
    .sort((x, y) => x.a - y.a)
    .map((m) => ({ key: m.k, phrase: m.p, age: m.a, tag: m.g, spoken: m.n || 0, text: speech(s, m) }));
}

/**
 * Called for every line the log writes: a memory whose words appear in the line (a text that used h.recall, a reflection) counts as
 * spoken. A memory made in the very same year is never counted (its own line may contain its words).
 */
export function noteSpoken(s, text) {
  const list = s.memories;
  if (!list || !list.length || !text) return;
  for (const m of list) if (m.a < s.age && m.p.length >= 6 && text.includes(m.p)) { m.n = Math.min(9, (m.n || 0) + 1); m.l = s.age; }
}

// ---------------------------------------------------------------------------------------------
// Speaking: reflections in ordinary years, echoes in events
// ---------------------------------------------------------------------------------------------

const lastEcho = (s) => (Number.isFinite(s.flags._echoAt) ? s.flags._echoAt : -99);

const REFLECT_GAP = 6; // years between two reflections ("平凡的一年" lines that look back): about three or four in a life
const REFLECT_BASE = 0.5;
const REFLECT_MAX = 0.65;
const ECHO_SCALE = 0.32; // the share of the matching events that echo (6 to 8 echo lines in a life)
const FRESH_AFTER = 10; // a memory that was spoken is not spoken again for this many years

/** True when this memory was spoken less than FRESH_AFTER years ago (it rests). */
export const resting = (s, m) => !!(m.n && s.age - (m.l ?? -99) < FRESH_AFTER);

function candidates(s, minGap, skip) {
  return (s.memories || []).filter((m) => !m.u && !m.q && s.age - m.a >= minGap && !(m.n && s.age - (m.l ?? -99) < FRESH_AFTER) && !(skip && skip(m)));
}

const kindOf = (m) => m.k.split(':')[0];
/** True when a memory of the same kind ('kid', 'loss', 'love', 'move' ...) was spoken within the last 8 years: five births in a row would be five identical callbacks. */
const kindTired = (s, m) => { if (CHOICE_KINDS.has(kindOf(m))) return false; const a = s.flags._kd && s.flags._kd[kindOf(m)]; return a !== undefined && s.age - a < 8; };
const CHOICE_KINDS = new Set(['c', 'f', 'e']); // many choices fill a life; only the moments of the same kind (births, losses, weddings ...) take turns

/** Record that a memory was spoken now. */
function spoke(s, m) {
  m.n = (m.n || 0) + 1;
  m.l = s.age;
  (s.flags._kd ||= {})[kindOf(m)] = s.age;
}

/** The memory kinds not spoken lately first, then the least spoken, then the more important, then newest or oldest. */
function rank(s, list, salt) {
  const oldFirst = hash01(`${s.seed}|mo|${salt}`) < 0.35; // now and then the oldest memory comes first, otherwise the newest
  return list.slice().sort((x, y) => ((kindTired(s, x) ? 1 : 0) - (kindTired(s, y) ? 1 : 0)) || ((x.n || 0) - (y.n || 0)) || ((x.s || 0) - (y.s || 0)) || ((y.w || 1) - (x.w || 1)) || (oldFirst ? x.a - y.a : y.a - x.a));
}

const SINGLE_YOUNG = [
  (r) => `睡前躺在床上，你想起${r}。`,
  (r) => `這一年有些安靜的時刻，你想起${r}。`,
  (r) => `玩到一半，你忽然想起${r}。`,
  (r) => `有時候，你會想起${r}。`,
];
const SINGLE_ADULT = [
  (r) => `夜裡睡不著，你想起${r}。`,
  (r) => `走在熟悉的路上，你忽然想起${r}。`,
  (r) => `這一年過得平靜。偶爾，你還是會想起${r}。`,
  (r) => `整理舊東西的時候，你又想起${r}。`,
  (r) => `一個尋常的傍晚，你想起${r}。`,
  (r) => `日子過得很快，有些事卻一直沒走遠：你想起${r}。`,
];
const SINGLE_ELDER = [
  (r) => `坐在窗邊，你想起${r}。`,
  (r) => `年紀大了，你常想起${r}。`,
  (r) => `午後安靜，你的思緒又回到${r}。`,
  (r) => `這一年，你把許多往事想了又想。你想起${r}。`,
];
const DOUBLE_ADULT = [
  (a, b) => `夜裡睡不著，你想起${a}，也想起${b}。`,
  (a, b) => `一個尋常的傍晚，你想起${a}；再往前，是${b}。`,
  (a, b) => `這一年過得平靜。你偶爾想起${a}，還有${b}。`,
];
const DOUBLE_YOUNG = [
  (a, b) => `睡前躺在床上，你想起${a}，也想起${b}。`,
  (a, b) => `有時候，你會想起${a}，還有${b}。`,
];
const DOUBLE_ELDER = [
  (a, b) => `坐在窗邊，你想起${a}，也想起${b}。`,
  (a, b) => `年紀大了，往事一件接一件：${a}，還有${b}。`,
];

const band = (age) => (age < 18 ? 'young' : age >= 65 ? 'elder' : 'adult');

/**
 * An "ordinary year" that remembers: one or two older memories in one short line, or '' when this year is not one for looking back.
 * Chosen by hashes only. The memory spoken least so far comes first; at most one reflection or echo every two years.
 */
export function reflection(s) {
  if (s.age < 8 || s.age - lastEcho(s) < 2) return '';
  if (Number.isFinite(s.flags._reflAt) && s.age - s.flags._reflAt < REFLECT_GAP) return ''; // most quiet years stay ordinary years
  const pool = candidates(s, 2);
  if (!pool.length) return '';
  const unspoken = pool.filter((m) => !m.n).length;
  const p = Math.min(REFLECT_MAX, REFLECT_BASE + 0.03 * unspoken);
  if (hash01(`${s.seed}|refl|${s.age}`) >= p) return '';
  const ranked = rank(s, pool, `r${s.age}`);
  let first = ranked[0];
  let second = ranked.slice(1).find((m) => m.g !== first.g || m.k.split(':')[0] !== first.k.split(':')[0]) || ranked[1];
  const two = second && unspoken >= 2 && whenWord(second.a, s.age) !== whenWord(first.a, s.age) && hash01(`${s.seed}|refl2|${s.age}`) < 0.9;
  if (two && second.a > first.a) [first, second] = [second, first]; // the newer one first: "…；再往前，是…" 
  const b = band(s.age);
  const u = hash01(`${s.seed}|frame|${s.age}`);
  let text;
  if (two) {
    const f = (b === 'young' ? DOUBLE_YOUNG : b === 'elder' ? DOUBLE_ELDER : DOUBLE_ADULT);
    text = f[Math.floor(u * f.length)](speech(s, first), speech(s, second));
    spoke(s, first); spoke(s, second);
  } else {
    const f = (b === 'young' ? SINGLE_YOUNG : b === 'elder' ? SINGLE_ELDER : SINGLE_ADULT);
    text = f[Math.floor(u * f.length)](speech(s, first));
    spoke(s, first);
  }
  s.flags._echoAt = s.age;
  s.flags._reflAt = s.age;
  return text;
}

const ECHO_FRAMES = [
  (r) => `你想起${r}。`,
  (r) => `這讓你想起${r}。`,
  (r) => `你忽然記起${r}。`,
  (r) => `心裡浮上來的，是${r}。`,
  (r) => `你不由得想起${r}。`,
];

/**
 * One short echo for an event that has just happened: an older memory of the same domain (or of no domain in particular), spoken in a
 * line of its own. '' when there is nothing to echo. `ev` is the event; `h` is only needed by an event that is a follow-up of the
 * memory's own event (that one already echoes it).
 */
export function echoFor(s, ev, domain) {
  if (s.age < 6 || s.flags._echoAt === s.age) return '';
  if (!echoAllowed(ev)) return '';
  const mine = specificTags(ev);
  const looking = isReflective(ev);
  // a memory of the same kind of thing (a shared specific tag) or, less readily, of the same part of life; an event that looks back on
  // the whole life fits any memory
  const strength = (m) => (looking ? 2 : m.t && mine.length && m.t.split(',').some((x) => mine.includes(x)) ? 2 : (m.g === domain && WEAK_DOMAINS.has(domain) ? 1 : 0));
  const pool = candidates(s, 2, (m) => m.k.endsWith(`:${ev.id}`) || strength(m) === 0);
  if (!pool.length) return '';
  const best = Math.max(...pool.map(strength));
  const ranked = rank(s, pool.filter((m) => strength(m) === best), `e${ev.id}${s.age}`);
  const top = ranked[0];
  const p = looking ? 0.95 : (best === 2 ? 0.7 : 0.3) * (top.n ? 0.2 : 1) * ECHO_SCALE;
  if (hash01(`${s.seed}|echo|${s.age}|${ev.id}`) >= p) return '';
  spoke(s, top);
  s.flags._echoAt = s.age;
  const f = ECHO_FRAMES[Math.floor(hash01(`${s.seed}|ef|${s.age}|${ev.id}`) * ECHO_FRAMES.length)];
  const next = looking ? ranked.find((m) => m !== top && whenWord(m.a, s.age) !== whenWord(top.a, s.age)) : null;
  if (next) {
    spoke(s, next);
    return `${f(speech(s, top))}${next.a < top.a ? '更早以前，' : '還有'}${speech(s, next)}。`;
  }
  return f(speech(s, top));
}

const WEAK_DOMAINS = new Set(['family', 'health', 'work', 'love', 'move']);

// ---------------------------------------------------------------------------------------------
// The life story
// ---------------------------------------------------------------------------------------------

/** Second person to third person, for a keepsake in the eulogy; '' when the sentence cannot be turned around safely (quotes, plurals). */
export function thirdPerson(phrase, male) {
  if (/[「『」』]|你們|您/.test(phrase)) return '';
  return phrase.replace(/你/g, male ? '他' : '她');
}

/** "十歲那年" without the relative words (去年, 前年): for texts told from the end of a life. */
export function whenAt(age) {
  return age < 1 ? '出生那年' : `${cnNumber(age)}歲那年`;
}

/**
 * The one memory the life story keeps (eulogy.js), or null: a decision the family took for the child (key `f:`), a loss (`loss:`), or an
 * authored moment. Not the ones the life story tells anyway (the first job, a wedding, a birth, a move) and nothing with quotation marks,
 * which cannot be turned into the third person. { age, text, kind: 'f' | 'loss' | 'c' } in the second person.
 */
export function keepsakeOf(s) {
  const ok = (m) => m.p.length <= 56 && !/[「『」』]|你們|您|\d/.test(m.p);
  // (a child who died is told in the family sentence of the life story; digits would be an age the story does not know)
  const list = (s.memories || []).filter((m) => ok(m) && !m.k.startsWith('loss:kid:') && (m.k.startsWith('f:') || m.k.startsWith('loss:') || ((m.k.startsWith('c:') || m.k.startsWith('e:')) && (m.w || 1) >= 2)));
  if (!list.length) return null;
  const rankOf = (m) => (m.k.startsWith('f:') ? 300 : m.k.startsWith('loss:') ? 200 : 100) + (m.w || 1) * 10 - Math.min(m.a, 99) * 0.05;
  const m = list.slice().sort((x, y) => rankOf(y) - rankOf(x))[0];
  return { age: m.a, text: m.p, kind: m.k.startsWith('f:') ? 'f' : m.k.startsWith('loss:') ? 'loss' : 'c' };
}
