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

function newId() {
  return `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Facts the album keeps next to the summary: the draw mode (needed to recompute the odds of the life later) and how long
 * the last partnership lasted (for the 金婚 achievement). A widow's years are approximate (the partner died some years before).
 */
function recordMeta(s) {
  const meta = { drawMode: s.settings && s.settings.drawMode === 'population' ? 'population' : 'births' };
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
    state = createLife(settings, seed, opts);
    recordId = newId();
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
      const res = store.putRecord({ id: recordId, savedAt: Date.now(), message: '', summary: getSummary(state), meta: recordMeta(state) });
      rec = res.record;
    }
    this.persist();
    return rec;
  },

  record() {
    return recordId ? store.getRecord(recordId) : null;
  },

  /** Forget the life in progress (after the summary, or when the player abandons it). */
  discard() {
    state = null;
    recordId = null;
    store.clearSave();
  },

  warnedAboutStorage() {
    const was = saveWarned;
    saveWarned = true;
    return was;
  },
};
