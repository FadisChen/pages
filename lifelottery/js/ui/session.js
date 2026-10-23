// The game session: the one life in progress (in memory + autosave) and the album record it becomes.
// Screens talk to this module instead of touching the engine's persistence directly.

import { createLife, deserialize } from '../engine/life.js';
import { getSummary } from '../engine/summary.js';
import * as store from '../storage.js';

const params = new URLSearchParams(location.search);

let state = null;
let recordId = null;
let saveWarned = false;
let fresh = false;
let counted = false; // the events of this life are already in the cross-life counts (lifelottery.seenEvents)

function newId() {
  return `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Facts the album keeps next to the summary: the draw mode (needed to recompute the odds of the life later) and how long
 * the last partnership lasted (for the 金婚 achievement). A widow's years are approximate (the partner died some years before).
 */
function recordMeta(s) {
  const meta = { drawMode: s.settings && s.settings.drawMode === 'population' ? 'population' : 'births' };
  const events = store.eventIdsOfState(s);
  if (events.length) meta.events = events; // lets the cross-life counts be rebuilt from the album (storage.deriveSeenFromAlbum)
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

  /** True right after a draw, until the lottery screen has played its animation once. */
  consumeFresh() { const f = fresh; fresh = false; return f; },

  /** Try to restore the autosave. Returns the state or null. */
  restore() {
    if (state) return state;
    const saved = store.loadSave(deserialize);
    if (saved) {
      state = saved.state;
      recordId = saved.recordId;
      // a life that ended and got its album record before the reload was counted then
      counted = !state.alive && !!recordId && !!store.getRecord(recordId);
    }
    return state;
  },

  /** Peek at the autosave without making it the current life. */
  peek() {
    if (state) return { state, recordId };
    const saved = store.loadSave(deserialize);
    return saved ? { state: saved.state, recordId: saved.recordId } : null;
  },

  /** Draw a new life from the given settings. */
  start(settings) {
    const seed = params.get('seed') || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const opts = {};
    if (params.get('country')) opts.countryCode = params.get('country');
    // what earlier lives of this player met: events seen before are drawn less often and read differently (engine/events.js)
    let novelty = {};
    try { novelty = store.loadSeenEvents(); } catch (e) { novelty = {}; }
    state = createLife(settings, seed, { ...opts, novelty });
    recordId = newId();
    counted = false;
    fresh = true;
    this.persist();
    return state;
  },

  /** Autosave. Returns false when storage refused (the game continues from memory). */
  persist() {
    if (!state) return true;
    const ok = store.writeSave(state, recordId);
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
      const res = store.putRecord({ id: recordId, savedAt: Date.now(), message: '', summary: getSummary(state), meta: recordMeta(state) });
      rec = res.record;
    } else counted = true;
    this.persist();
    return rec;
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
    counted = false;
    store.clearSave();
  },

  warnedAboutStorage() {
    const was = saveWarned;
    saveWarned = true;
    return was;
  },
};
