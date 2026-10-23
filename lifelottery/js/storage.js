// Persistence: the in-progress save, player settings, the 前世記錄 album and the theme choice.
// Everything lives in localStorage under the "lifelottery." prefix. Every access is wrapped in try/catch
// so the game stays fully playable when storage is blocked, full or cleared.

export const KEYS = {
  save: 'lifelottery.save',
  settings: 'lifelottery.settings',
  album: 'lifelottery.album',
  theme: 'lifelottery.theme',
  achievements: 'lifelottery.achievements',
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

/** Returns { state, recordId, savedAt } or null. `deserialize` is injected to keep this module engine-free. */
export function loadSave(deserialize) {
  const raw = readJSON(KEYS.save);
  if (!raw) return null;
  try {
    const body = raw.state || raw;
    const state = deserialize(body);
    return { state, recordId: typeof raw.recordId === 'string' ? raw.recordId : null, savedAt: raw.savedAt || 0 };
  } catch (e) {
    removeRaw(KEYS.save);
    return null;
  }
}

export function writeSave(state, recordId) {
  return writeRaw(KEYS.save, JSON.stringify({ v: 1, savedAt: Date.now(), recordId: recordId || null, state }));
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
    highlights: arr(x.highlights).slice(0, 80).filter((h) => h && typeof h.text === 'string').map((h) => ({ age: num(h.age), year: num(h.year), text: str(h.text, 300) })),
    counts: { choices: num(counts.choices), events: num(counts.events), milestones: num(counts.milestones), years: num(counts.years, num(x.age)) },
    stats,
    statHistory,
  };
}

/**
 * Optional facts the game stores next to the summary when a life ends ({ drawMode, partnerYears }). Old records have none;
 * everything that reads them has a fallback (ui/achievements.js, engine/odds.js).
 */
export function normalizeMeta(m) {
  if (!m || typeof m !== 'object') return undefined;
  const out = {};
  if (m.drawMode === 'births' || m.drawMode === 'population') out.drawMode = m.drawMode;
  if (typeof m.partnerYears === 'number' && Number.isFinite(m.partnerYears)) out.partnerYears = Math.max(0, Math.min(120, Math.round(m.partnerYears)));
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
