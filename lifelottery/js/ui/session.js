// The game session: the one life in progress (in memory + autosave) and the album record it becomes.
// Screens talk to this module instead of touching the engine's persistence directly.
//
// The engine (life.js, with every event text) is the heavy part of the game, so it is loaded on demand: the landing screen, the
// album and the about page never need it, and `warm()` starts the download while the player is still on the setup screen.

import * as store from '../storage.js';

const params = new URLSearchParams(location.search);

let engine = null;        // { life, summary } once loaded
let enginePromise = null;
let state = null;
let recordId = null;
let replay = null;        // { prev, start, n } when this life repeats the start of an earlier one
let saveWarned = false;
let fresh = false;
let counted = false; // the events of this life are already in the cross-life counts (lifelottery.seenEvents)

/** Load the engine modules (once; a failed load can be retried). */
function loadEngine() {
  if (engine) return Promise.resolve(engine);
  if (!enginePromise) {
    enginePromise = Promise.all([import('../engine/life.js'), import('../engine/summary.js')])
      .then(([life, summary]) => { engine = { life, summary }; return engine; })
      .catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

function newId() {
  return `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Facts the album keeps next to the summary: the draw mode (needed to recompute the odds of the life later), how long the last
 * partnership lasted (for the 金婚 achievement), the start of the life (so it can be lived again) and, for a life that repeats an
 * earlier start, which life it repeats. A widow's years are approximate (the partner died some years before).
 */
function recordMeta(s) {
  const meta = { drawMode: s.settings && s.settings.drawMode === 'population' ? 'population' : 'births' };
  const events = store.eventIdsOfState(s);
  if (events.length) meta.events = events; // lets the cross-life counts be rebuilt from the album (storage.deriveSeenFromAlbum)
  try { meta.birth = engine.life.birthOf(s); } catch (e) { console.error(e); }
  if (replay) meta.replay = { ...replay };
  const p = s.partner;
  if (p && Number.isFinite(p.since)) {
    const end = s.death ? s.death.year : s.year;
    if (p.status === 'married') meta.partnerYears = Math.max(0, end - p.since);
    else if (p.status === 'widowed') meta.partnerYears = Math.max(0, end - p.since - 6);
  }
  return meta;
}

export const session = {
  get state() { return state; },
  get recordId() { return recordId; },
  get hasLife() { return !!state; },
  /** { prev, start, n } when the life in progress repeats an earlier start, else null. */
  get replay() { return replay ? { ...replay } : null; },

  /** True right after a draw, until the lottery screen has played its animation once. */
  consumeFresh() { const f = fresh; fresh = false; return f; },

  /**
   * Start loading the engine in the background (page idle, setup screen, hovering "start"). Never throws. The modulepreload links
   * that index.html keeps in an inert <template> are put into <head> first, so every module downloads in parallel.
   */
  warm() {
    try {
      const tpl = document.getElementById('preload-later');
      if (tpl && tpl.content) { document.head.append(tpl.content.cloneNode(true)); tpl.remove(); }
    } catch (e) { /* preloading is only a speed-up */ }
    loadEngine().catch(() => { /* the real load reports the error */ });
  },

  /** Load the engine now (resolves when life.js / summary.js are ready). */
  ready() { return loadEngine(); },

  /** Try to restore the autosave. Resolves to the state or null. */
  async restore() {
    if (state) return state;
    if (!store.peekSave()) { store.clearSave(); return null; } // nothing there, or a save no version of the game could read
    await loadEngine();
    const saved = store.loadSave(engine.life.deserialize);
    if (saved) {
      state = saved.state;
      recordId = saved.recordId;
      replay = saved.replay;
      // a life that ended and got its album record before the reload was counted then
      counted = !state.alive && !!recordId && !!store.getRecord(recordId);
    }
    return state;
  },

  /** Peek at the autosave without making it the current life or loading the engine (enough for the "resume" card). */
  peek() {
    if (state) return { state, recordId };
    return store.peekSave();
  },

  /**
   * Draw a new life from the given settings. `opts.birth` is the start of an earlier life (engine/birth.js normalizeBirth), `opts.replay`
   * the link to it ({ prev: record id, start: first life's record id, n }): the life then repeats that start with new luck.
   */
  async start(settings, opts = {}) {
    await loadEngine();
    const seed = params.get('seed') || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const forced = {};
    if (params.get('country') && !opts.birth) forced.countryCode = params.get('country');
    // what earlier lives of this player met: events seen before are drawn less often and read differently (engine/events.js)
    let novelty = {};
    try { novelty = store.loadSeenEvents(); } catch (e) { novelty = {}; }
    const life = { ...forced, novelty };
    if (opts.birth) life.birth = opts.birth;
    state = engine.life.createLife(settings, seed, life);
    recordId = newId();
    const nb = opts.birth ? engine.life.normalizeBirth(opts.birth) : null;
    replay = nb ? store.cleanReplay({ ...opts.replay, partial: !nb.full }) : null;
    counted = false;
    fresh = true;
    this.persist();
    return state;
  },

  /** Autosave. Returns false when storage refused (the game continues from memory). */
  persist() {
    if (!state) return true;
    const ok = store.writeSave(state, recordId, replay);
    return ok;
  },

  /** Create (once) the album record for a finished life. */
  finish() {
    if (!state || state.alive) return null;
    if (!recordId) recordId = newId();
    let rec = store.getRecord(recordId);
    if (!rec) {
      // count first: with no seenEvents yet, the counts are derived from the album, which must not contain this life already
      this.countSeen();
      const res = store.putRecord({ id: recordId, savedAt: Date.now(), message: '', summary: engine.summary.getSummary(state), meta: recordMeta(state) });
      rec = res.record;
    } else counted = true;
    this.persist();
    return rec;
  },

  /** The summary of the life in progress (the engine is loaded whenever there is a life). */
  summary() {
    return state && engine ? engine.summary.getSummary(state) : null;
  },

  /** Add the life in progress to the cross-life event counts, once. */
  countSeen() {
    if (!state || counted) return;
    counted = true;
    try { store.recordSeenEvents(state); } catch (e) { /* the counts are a nicety: the game goes on without them */ }
  },

  record() {
    return recordId ? store.getRecord(recordId) : null;
  },

  /** Forget the life in progress (after the summary, or when the player abandons it). */
  discard() {
    if (state && state.age > 0) this.countSeen(); // an abandoned life was still read
    state = null;
    recordId = null;
    replay = null;
    counted = false;
    store.clearSave();
  },

  warnedAboutStorage() {
    const was = saveWarned;
    saveWarned = true;
    return was;
  },
};
