// Persistence: the in-progress save, player settings, the 前世記錄 album and the theme choice.
// Everything lives in localStorage under the "lifelottery." prefix. Every access is wrapped in try/catch
// so the game stays fully playable when storage is blocked, full or cleared.

export const KEYS = {
  save: 'lifelottery.save',
  settings: 'lifelottery.settings',
  album: 'lifelottery.album',
  theme: 'lifelottery.theme',
  achievements: 'lifelottery.achievements',
  seenEvents: 'lifelottery.seenEvents',
};

export const ALBUM_VERSION = 1;
export const MAX_RECORDS = 500;
export const MESSAGE_MAX = 120;

export const DEFAULT_SETTINGS = Object.freeze({
  era: 'present',
  drawMode: 'births',
  pace: 'standard',
  autoChoice: false,
  speed: 1,
});

// ---------------------------------------------------------------------------------------------
// Raw access
// ---------------------------------------------------------------------------------------------

let memoryOnly = false;
const memory = new Map(); // fallback when localStorage throws, so the current session still works

/** Read a raw string (or null). */
export function readRaw(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) { memoryOnly = true; }
  return memory.has(key) ? memory.get(key) : null;
}

/** Write a raw string. Returns true when persisted to localStorage, false when only kept in memory. */
export function writeRaw(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    memoryOnly = true;
    return false;
  }
}

export function removeRaw(key) {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch (e) { memoryOnly = true; }
}

/** True once any storage access has failed (private mode, blocked site data...). */
export function storageUnavailable() {
  return memoryOnly;
}

function readJSON(key) {
  const raw = readRaw(key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Settings & theme
// ---------------------------------------------------------------------------------------------

const ERAS = ['past', 'present', 'future', 'random'];
const MODES = ['births', 'population'];
const PACES = ['short', 'standard', 'long'];

export function loadSettings() {
  const raw = readJSON(KEYS.settings) || {};
  return {
    era: ERAS.includes(raw.era) ? raw.era : DEFAULT_SETTINGS.era,
    drawMode: MODES.includes(raw.drawMode) ? raw.drawMode : DEFAULT_SETTINGS.drawMode,
    pace: PACES.includes(raw.pace) ? raw.pace : DEFAULT_SETTINGS.pace,
    autoChoice: raw.autoChoice === true,
    speed: [1, 2, 4].includes(raw.speed) ? raw.speed : 1,
  };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  writeRaw(KEYS.settings, JSON.stringify(next));
  return next;
}

/** 'system' | 'light' | 'dark' */
export function loadTheme() {
  const t = readRaw(KEYS.theme);
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function saveTheme(theme) {
  if (theme === 'light' || theme === 'dark') writeRaw(KEYS.theme, theme);
  else removeRaw(KEYS.theme);
}

// ---------------------------------------------------------------------------------------------
// In-progress save: { v, savedAt, recordId, state }
// ---------------------------------------------------------------------------------------------

/** The "same start" link of a life: { prev: record id of the life it repeats, start: id of the first life of that start, n: 2.., partial? } or null. */
export function cleanReplay(r) {
  if (!r || typeof r !== 'object') return null;
  const prev = str(r.prev, 64), start = str(r.start, 64);
  if (!prev || !start) return null;
  const out = { prev, start, n: Math.max(2, Math.min(99, Math.floor(num(r.n, 2)))) };
  if (r.partial === true) out.partial = true; // the start was rebuilt from an old record: name and family were drawn again
  return out;
}

/** Returns { state, recordId, replay, savedAt } or null. `deserialize` is injected to keep this module engine-free. */
export function loadSave(deserialize) {
  const raw = readJSON(KEYS.save);
  if (!raw) return null;
  try {
    const body = raw.state || raw;
    const state = deserialize(body);
    return { state, recordId: typeof raw.recordId === 'string' ? raw.recordId : null, replay: cleanReplay(raw.replay), savedAt: raw.savedAt || 0 };
  } catch (e) {
    removeRaw(KEYS.save);
    return null;
  }
}

/**
 * What the landing screen needs to offer "resume", without loading the engine: { state: { alive, age, name, countryCode }, recordId } or
 * null. Only a plausibility check; the full validation (and the removal of a broken save) happens in loadSave when the life is opened.
 */
export function peekSave() {
  const raw = readJSON(KEYS.save);
  const st = raw && (raw.state || raw);
  if (!st || typeof st !== 'object' || st.v !== 1 || !Array.isArray(st.rng) || typeof st.alive !== 'boolean') return null;
  if (!st.name || typeof st.name.full !== 'string' || !Number.isFinite(st.age) || typeof st.countryCode !== 'string') return null;
  return { state: { alive: st.alive, age: st.age, name: { full: st.name.full }, countryCode: st.countryCode }, recordId: typeof raw.recordId === 'string' ? raw.recordId : null };
}

export function writeSave(state, recordId, replay = null) {
  return writeRaw(KEYS.save, JSON.stringify({ v: 1, savedAt: Date.now(), recordId: recordId || null, replay: cleanReplay(replay), state }));
}

export function clearSave() {
  removeRaw(KEYS.save);
}

// ---------------------------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------------------------

const str = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);

const STAT_KEYS = ['health', 'happiness', 'knowledge', 'wealth', 'social'];

const RELIGIONS = ['christian', 'muslim', 'hindu', 'buddhist', 'folk', 'jewish', 'sikh', 'none', 'other'];
const FOCUS_IDS = ['balance', 'study', 'work', 'family', 'health', 'self'];
/** Family religion id from a summary ({ id, label } since Phase 4A), or '' for records from before that. */
const religionId = (r) => (r && typeof r === 'object' && RELIGIONS.includes(r.id) ? r.id : '');
const focusId = (f) => (typeof f === 'string' ? f : f && typeof f === 'object' ? f.id : '');
/** The per-year personal risk multipliers (Phase 4B): a complete list of finite numbers, else null (old records have none). */
function riskTrail(v, age) {
  if (!Array.isArray(v) || v.length < 1 || v.length > 130) return null;
  const out = v.map((m) => (typeof m === 'number' && Number.isFinite(m) ? Math.max(0, Math.min(20, m)) : NaN));
  return out.some(Number.isNaN) || out.length < Math.floor(num(age)) ? null : out;
}

/**
 * Coerce an imported/loaded summary to a shape the UI can render without ever throwing.
 * Returns null when it is not recognisable as a life summary at all.
 */
export function normalizeSummary(x) {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.name !== 'string' || !Number.isFinite(x.age) || !Array.isArray(x.statHistory)) return null;
  const ls = x.lifespan && typeof x.lifespan === 'object' ? x.lifespan : {};
  const home = x.homeCountry && typeof x.homeCountry === 'object' ? x.homeCountry : {};
  const cause = x.cause && typeof x.cause === 'object' ? x.cause : null;
  const edu = x.education && typeof x.education === 'object' ? x.education : {};
  const kids = x.children && typeof x.children === 'object' ? x.children : {};
  const counts = x.counts && typeof x.counts === 'object' ? x.counts : {};
  const statHistory = arr(x.statHistory).slice(0, 140).filter((r) => r && typeof r === 'object').map((r) => {
    const row = { age: num(r.age) };
    for (const k of STAT_KEYS) row[k] = Math.max(0, Math.min(100, num(r[k])));
    return row;
  });
  if (!statHistory.length) return null;
  const stats = {};
  for (const k of STAT_KEYS) {
    const d = x.stats && x.stats[k] ? x.stats[k] : {};
    stats[k] = { peak: num(d.peak), peakAge: num(d.peakAge), mean: num(d.mean), final: num(d.final) };
  }
  return {
    name: str(x.name, 80, '無名氏'),
    gender: x.gender === 'M' ? 'M' : 'F',
    birthYear: num(x.birthYear),
    deathYear: x.deathYear == null ? num(x.birthYear) + num(x.age) : num(x.deathYear),
    age: num(x.age),
    era: str(x.era, 12, 'present'),
    homeCountry: { code: str(home.code, 4), name: str(home.name, 40, '未知') },
    countryName: str(x.countryName, 40, str(home.name, 40, '未知')),
    urbanBirth: !!x.urbanBirth,
    birthCity: str(x.birthCity, 40),
    wealthQ: Math.max(1, Math.min(5, num(x.wealthQ, 3))),
    wealthShort: str(x.wealthShort, 8, '小康'),
    cause: cause ? { id: str(cause.id, 24), label: str(cause.label, 30, '其他原因'), text: str(cause.text, 200) } : null,
    suicide: !!x.suicide,
    lifespan: {
      age: num(ls.age, num(x.age)),
      countryLe: num(ls.countryLe),
      worldLe: num(ls.worldLe),
      vsCountry: num(ls.vsCountry),
      vsWorld: num(ls.vsWorld),
    },
    education: { level: str(edu.level, 12), label: str(edu.label, 20, '未受正式教育'), years: num(edu.years) },
    jobs: arr(x.jobs).slice(0, 20).map((j) => str(j, 30)).filter(Boolean),
    lastJob: x.lastJob ? str(x.lastJob, 30) : null,
    yearsWorked: num(x.yearsWorked),
    partner: x.partner && typeof x.partner === 'object' ? { name: str(x.partner.name, 80), status: str(x.partner.status, 12) } : null,
    marriages: num(x.marriages),
    divorces: num(x.divorces),
    children: { total: num(kids.total), alive: num(kids.alive), names: arr(kids.names).slice(0, 30).map((n) => str(n, 80)) },
    countriesLived: arr(x.countriesLived).slice(0, 20).map((c) => str(c, 40)).filter(Boolean),
    conditions: arr(x.conditions).slice(0, 20).map((c) => str(c, 30)),
    smoker: !!x.smoker,
    religion: religionId(x.religion),
    focus: focusId(x.focus),
    focusTimeline: arr(x.focusTimeline).slice(0, 20).filter((g) => g && typeof g === 'object' && Number.isFinite(g.fromAge) && Number.isFinite(g.toAge)).map((g) => ({ fromAge: num(g.fromAge), toAge: num(g.toAge), focus: focusId(g.focus), label: str(g.label, 12) })),
    riskTrail: riskTrail(x.riskTrail, x.age),
    ...(x.eulogy && x.eulogy.v === 1 && typeof x.eulogy.text === 'string' ? { eulogy: { v: 1, text: str(x.eulogy.text, 400), short: str(x.eulogy.short, 120), shape: str(x.eulogy.shape, 12), slots: [], opening: str(x.eulogy.opening, 16) } } : {}), // Phase 5B: the life story is kept with the record
    highlights: arr(x.highlights).slice(0, 80).filter((h) => h && typeof h.text === 'string').map((h) => ({ age: num(h.age), year: num(h.year), text: str(h.text, 300) })),
    counts: { choices: num(counts.choices), events: num(counts.events), milestones: num(counts.milestones), years: num(counts.years, num(x.age)) },
    stats,
    statHistory,
  };
}

/**
 * The start of a life (engine/life.js birthOf), kept so the album can offer "same start, live again". Only the shape and sizes are
 * checked here (this module stays engine-free); createLife validates it for real (engine/birth.js normalizeBirth) and a record whose
 * start fails that is treated like an old one. Returns undefined when it is not recognisable.
 */
export function cleanStart(b) {
  if (!b || typeof b !== 'object' || b.v !== 1) return undefined;
  if (typeof b.countryCode !== 'string' || (b.gender !== 'M' && b.gender !== 'F') || typeof b.urban !== 'boolean') return undefined;
  if (!Number.isFinite(b.wealthQ) || !Number.isFinite(b.birthYear) || !['past', 'present', 'future'].includes(b.eraKey)) return undefined;
  const parent = (p) => (p && typeof p === 'object' ? { alive: !!p.alive, age: num(p.age), name: str(p.name, 80) } : undefined);
  const n = b.name && typeof b.name === 'object' ? b.name : null;
  const out = {
    v: 1, eraKey: b.eraKey, birthYear: Math.round(b.birthYear), countryCode: str(b.countryCode, 4), city: str(b.city, 40), urban: b.urban,
    gender: b.gender, wealthQ: Math.round(b.wealthQ),
  };
  if (n && typeof b.poolKey === 'string') {
    out.poolKey = str(b.poolKey, 16);
    out.name = { given: str(n.given, 80), family: str(n.family, 80), full: str(n.full, 80), givenToken: str(n.givenToken, 80), familyToken: str(n.familyToken, 80) };
    out.siblings = Math.round(num(b.siblings));
    out.mother = parent(b.mother);
    out.father = parent(b.father);
    out.religion = str(b.religion, 12);
    if (typeof b.business === 'boolean') out.business = b.business;
  }
  return out;
}

/**
 * Optional facts the game stores next to the summary when a life ends ({ drawMode, partnerYears, events, birth, replay }). Old records have none;
 * everything that reads them has a fallback (ui/achievements.js, engine/odds.js, loadSeenEvents below). `birth` is the start of the life
 * and `replay` ({ prev, start, n }) says it was lived again from an earlier life's start (Phase 5E). `events` lists the ids
 * of the events the life met (Phase 5C), so the cross-life counts can be rebuilt from an album that has no seenEvents.
 */
export function normalizeMeta(m) {
  if (!m || typeof m !== 'object') return undefined;
  const out = {};
  const birth = cleanStart(m.birth);
  if (birth) out.birth = birth;
  const replay = cleanReplay(m.replay);
  if (replay) out.replay = replay;
  if (m.drawMode === 'births' || m.drawMode === 'population') out.drawMode = m.drawMode;
  if (typeof m.partnerYears === 'number' && Number.isFinite(m.partnerYears)) out.partnerYears = Math.max(0, Math.min(120, Math.round(m.partnerYears)));
  const events = eventIdList(m.events);
  if (events.length) out.events = events;
  return Object.keys(out).length ? out : undefined;
}

export function normalizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const id = str(r.id, 64);
  if (!id) return null;
  const summary = normalizeSummary(r.summary);
  if (!summary) return null;
  const rec = {
    id,
    savedAt: num(r.savedAt, Date.now()),
    message: str(r.message, MESSAGE_MAX),
    summary,
  };
  const meta = normalizeMeta(r.meta);
  if (meta) rec.meta = meta;
  return rec;
}

let albumCache = null;

export function loadAlbum() {
  if (albumCache) return albumCache;
  const raw = readJSON(KEYS.album);
  const list = raw && Array.isArray(raw.records) ? raw.records : Array.isArray(raw) ? raw : [];
  albumCache = list.map(normalizeRecord).filter(Boolean);
  return albumCache;
}

function persistAlbum() {
  return writeRaw(KEYS.album, JSON.stringify({ v: ALBUM_VERSION, records: albumCache || [] }));
}

export function getRecord(id) {
  return loadAlbum().find((r) => r.id === id) || null;
}

/** Insert or replace by id. Newest first. Returns { record, persisted }. */
export function putRecord(record) {
  const rec = normalizeRecord(record);
  if (!rec) return { record: null, persisted: false };
  const list = loadAlbum();
  const i = list.findIndex((r) => r.id === rec.id);
  if (i >= 0) list[i] = rec; else list.unshift(rec);
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;
  return { record: rec, persisted: persistAlbum() };
}

export function setMessage(id, message) {
  const rec = getRecord(id);
  if (!rec) return false;
  rec.message = str(message, MESSAGE_MAX).trim();
  return persistAlbum();
}

export function deleteRecord(id) {
  const list = loadAlbum();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  persistAlbum();
  return true;
}

export function clearAlbum() {
  albumCache = [];
  persistAlbum();
  removeRaw(KEYS.achievements); // a fresh album announces its achievements again
  removeRaw(KEYS.seenEvents);   // ... and a fresh start meets every event as new again
}

// ---------------------------------------------------------------------------------------------
// Cross-life novelty (Phase 5C): how many of the player's lives met each event, { eventId: lives }, stored as
// { v: 1, lives, counts }. createLife({ novelty }) turns it into lower odds for what the player has seen before and into a
// different phrasing the next time; only ids and counts are kept.
// ---------------------------------------------------------------------------------------------

const SEEN_ID = /^(yearly:\d{1,4}|[a-z][a-z0-9_]{0,80})$/;
const SEEN_MAX_IDS = 2000;
const SEEN_MAX_COUNT = 999;

/** Event ids (no "yearly:" lines) from an unknown value, de-duplicated and capped. */
function eventIdList(v) {
  if (!Array.isArray(v)) return [];
  const out = new Set();
  for (const id of v) if (typeof id === 'string' && SEEN_ID.test(id) && !id.startsWith('yearly:')) out.add(id);
  return [...out].slice(0, 400);
}

/** A clean `{ id: count }` (valid ids, integer counts of 1..999) from an unknown value. */
function cleanSeen(counts) {
  const out = {};
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return out;
  let n = 0;
  for (const [id, c] of Object.entries(counts)) {
    if (!SEEN_ID.test(id) || !(c >= 1) || n >= SEEN_MAX_IDS) continue;
    out[id] = Math.min(SEEN_MAX_COUNT, Math.floor(c));
    n++;
  }
  return out;
}

/** Ids of the events a life met: the keys of `state.seen` (event ids and "yearly:N" lines). */
export function seenIdsOfState(state) {
  return state && state.seen && typeof state.seen === 'object' ? Object.keys(state.seen).filter((id) => SEEN_ID.test(id)) : [];
}

/** Ids for the album record's `meta.events`: the events of the life (the "ordinary year" lines are left out to keep records small). */
export function eventIdsOfState(state) {
  return eventIdList(seenIdsOfState(state));
}

/**
 * Rebuild the counts from album records: one life per record, using `meta.events` (or a log with event ids, `eventId` / `id`,
 * if a record has one). Records from before Phase 5C carry neither, so an old album simply yields {} (counting starts from zero).
 */
export function deriveSeenFromAlbum(list = loadAlbum()) {
  const counts = {};
  let lives = 0;
  for (const r of list) {
    const ids = new Set(eventIdList(r && r.meta && r.meta.events));
    const log = r && (r.log || (r.summary && r.summary.log));
    if (Array.isArray(log)) for (const e of log) { const id = e && (e.eventId || e.id); if (typeof id === 'string' && SEEN_ID.test(id)) ids.add(id); }
    if (!ids.size) continue;
    lives++;
    for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  }
  return { counts: cleanSeen(counts), lives };
}

function writeSeen(counts, lives) {
  return writeRaw(KEYS.seenEvents, JSON.stringify({ v: 1, lives, counts }));
}

/**
 * The counts to hand to createLife({ novelty }). Never throws; {} when nothing is known. A player who has an album but no
 * seenEvents yet (a save from before this feature, or an imported album) gets the counts derived from the album, once.
 */
export function loadSeenEvents() {
  const raw = readJSON(KEYS.seenEvents);
  if (raw && typeof raw === 'object' && raw.counts) return cleanSeen(raw.counts);
  let derived = { counts: {}, lives: 0 };
  try { derived = deriveSeenFromAlbum(); } catch (e) { /* unreadable album: start from zero */ }
  if (Object.keys(derived.counts).length) writeSeen(derived.counts, derived.lives);
  return derived.counts;
}

/**
 * Add one life to the counts (each event the life met counts once). Returns the new counts. Without a stored value the
 * counts are first derived from the album, so an old player does not start over.
 */
export function recordSeenEvents(state) {
  const counts = loadSeenEvents();
  const raw = readJSON(KEYS.seenEvents);
  const lives = (raw && Number.isFinite(raw.lives) ? raw.lives : 0) + 1;
  for (const id of seenIdsOfState(state)) counts[id] = Math.min(SEEN_MAX_COUNT, (counts[id] || 0) + 1);
  writeSeen(cleanSeen(counts), lives);
  return counts;
}

export function clearSeenEvents() {
  removeRaw(KEYS.seenEvents);
}

// ---------------------------------------------------------------------------------------------
// Achievements: earned status is always derived from the album (ui/achievements.js); only the log of which unlocks were
// already announced is stored, as { id: unlockedAtMs } (0 = earned before the log existed).
// ---------------------------------------------------------------------------------------------

export function loadAchievementLog() {
  const raw = readJSON(KEYS.achievements);
  const src = raw && typeof raw === 'object' && raw.seen && typeof raw.seen === 'object' ? raw.seen : {};
  const out = {};
  for (const [id, t] of Object.entries(src)) if (/^[a-z0-9_]{1,40}$/.test(id) && typeof t === 'number' && Number.isFinite(t)) out[id] = t;
  return out;
}

/** Merge `{ id: timestamp }` into the log (existing entries win). Returns the merged log. */
export function addAchievementLog(entries) {
  const log = loadAchievementLog();
  let changed = false;
  for (const [id, t] of Object.entries(entries)) if (!(id in log)) { log[id] = t; changed = true; }
  if (changed) writeRaw(KEYS.achievements, JSON.stringify({ v: 1, seen: log }));
  return log;
}

/** Cumulative numbers for the album header. */
export function albumStats(list = loadAlbum()) {
  const codes = new Set();
  let years = 0, longest = 0;
  for (const r of list) {
    const s = r.summary;
    years += s.age;
    longest = Math.max(longest, s.age);
    codes.add(s.homeCountry.code || s.homeCountry.name);
  }
  return { lives: list.length, years, countries: codes.size, longest };
}

export function exportAlbumJSON() {
  return JSON.stringify({ app: 'lifelottery', v: ALBUM_VERSION, exportedAt: new Date().toISOString(), records: loadAlbum() }, null, 1);
}

/** Merge records from an exported file. Throws on unrecognisable input. Returns { added, skipped }. */
export function importAlbumJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('invalid json'); }
  const incoming = Array.isArray(data) ? data : data && Array.isArray(data.records) ? data.records : null;
  if (!incoming) throw new Error('no records');
  const list = loadAlbum();
  const known = new Set(list.map((r) => r.id));
  let added = 0, skipped = 0;
  for (const raw of incoming.slice(0, MAX_RECORDS)) {
    const rec = normalizeRecord(raw);
    if (!rec || known.has(rec.id)) { skipped++; continue; }
    known.add(rec.id);
    list.push(rec);
    added++;
  }
  if (added === 0 && skipped === incoming.length && incoming.length > 0 && !incoming.some((r) => normalizeRecord(r))) throw new Error('no valid records');
  list.sort((a, b) => b.savedAt - a.savedAt);
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;
  persistAlbum();
  return { added, skipped };
}

/** Test hook: forget the in-memory cache so the next read hits localStorage again. */
export function resetCaches() {
  albumCache = null;
}
