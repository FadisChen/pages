// Life-length pacing: how many real seconds each simulated year is on screen.
//
// The player picks a target life length (about 10 / 30 / 60 minutes). That target is spread over the person's
// expected lifespan (country, gender and era specific), but not evenly: time follows the reading load.
//
//   quiet year   (only the one-line summary)  35-50% of the base second-per-year, brisk but never instant
//   event year   (new text on screen)          (1 s + characters / 7 per second) x a pace stretch, with a floor
//                                              so no event is ever shown for less than a comfortable read
//   choice year  time stops on the card as before; the outcome that follows is paced like an event year
//
// A small controller keeps the running total on schedule: if the life so far used less (more) time than the
// straight-line plan (target x age / expected lifespan) the next event years are stretched (squeezed) a little.
// The controller reads the *planned* time, not the time the player actually spent, so skipping a year or running
// at 4x never makes later years slower. Pausing and time spent on cards do not count towards the target.
//
// Pure module (no DOM): it runs in Node for the pacing simulation and tests. Every time that leaves this module is
// in seconds at 1x; the caller divides by `DEBUG.scale` (?debug=scale=N) and multiplies by the speed.

import { lifespanComparison } from '../engine/summary.js';

export const TARGET_MINUTES = { short: 10, standard: 30, long: 60 };

/** Tunable constants (seconds unless noted). Calibrated on 300 simulated lives, see PLAN "Phase 5A notes". */
export const PACING = {
  /** Reading speed used to estimate event text: Traditional Chinese characters per second. */
  CPS: 7,
  /** Fixed "take it in" beat added to the reading estimate of an event or an outcome. */
  ORIENT: 1.0,
  /** Each extra entry in the same year (milestones, second events) costs a short beat. */
  PER_ENTRY: 0.5,
  /** Milestones (graduation, wedding, a birth ...) get one more beat. */
  MILESTONE_BEAT: 0.8,
  /** Quiet year = base x (QUIET_LO .. QUIET_HI), reaching QUIET_HI for a line of QUIET_FULL characters. */
  QUIET_LO: 0.35,
  QUIET_HI: 0.5,
  QUIET_FULL: 55,
  QUIET_MIN: 2.2,
  QUIET_MAX: 14,
  /** Floors and cap for any year that has new text. The floor is also bounded by a fast reader: ORIENT_FAST + chars / CPS_FAST. */
  EVENT_MIN: 4,
  CPS_FAST: 11,
  ORIENT_FAST: 0.8,
  EVENT_MAX: 100,
  /** Shape of an average life (from the simulation): share of quiet years, and mean reading estimate of the others. */
  QUIET_SHARE: 0.19,
  MEAN_QUIET_WEIGHT: 0.43,
  MEAN_READ: 12.4,
  /** Controller: lag of this many "base years" gives the full correction; the correction is clamped to [G_MIN, G_MAX]. */
  CTRL_YEARS: 8,
  G_MIN: 0.7,
  G_MAX: 1.5,
  /** The first screen of a life (the birth line) never waits longer than this: the player just came from the reveal. */
  INTRO_MAX: 8,
  /** Hold-to-accelerate multiplier (applies on top of the speed button). */
  HOLD_BOOST: 6,
  /** Hold must last this long (ms) before it counts, so a tap or the start of a scroll never speeds time up. */
  HOLD_DELAY_MS: 380,
  /** A pointer moving further than this (px) during the hold delay is scrolling or selecting: no boost. */
  HOLD_SLOP_PX: 10,
};

export const FAST_SECONDS_PER_YEAR = 0.05;

/** Seconds the auto-choice countdown lasts. */
export const AUTO_CHOICE_SECONDS = 8;
export const AUTO_CHOICE_SECONDS_FAST = 0.2;

// ---------------------------------------------------------------------------------------------
// ?debug=fast and ?debug=scale=N
// ---------------------------------------------------------------------------------------------

/** Parse the `debug` query value. `fast` keeps its old meaning; `scale=N` divides every time by N. Comma separated is allowed. */
export function parseDebug(search) {
  let raw = '';
  try { raw = new URLSearchParams(search || '').get('debug') || ''; } catch (e) { raw = ''; }
  const out = { fast: false, scale: 1 };
  for (const part of raw.split(',')) {
    const p = part.trim().toLowerCase();
    if (p === 'fast') out.fast = true;
    const m = /^scale=(\d+(?:\.\d+)?)$/.exec(p);
    if (m && Number(m[1]) > 0) out.scale = Math.min(1e4, Number(m[1]));
  }
  return out;
}

export const DEBUG = parseDebug(typeof location !== 'undefined' ? location.search : '');

/** Divide a duration (seconds or ms) by the debug scale. */
export const scaled = (t) => t / DEBUG.scale;

// ---------------------------------------------------------------------------------------------
// Reading load of what a year put on the screen
// ---------------------------------------------------------------------------------------------

const textLength = (e) => (e && e.title ? String(e.title).length : 0) + (e && e.text ? String(e.text).length : 0);

/**
 * What a set of timeline entries asks of the reader.
 * `quiet`: only the plain one-line year summary. Death entries are ignored (the death screen has its own timing).
 * @param {{kind?: string, title?: string, text?: string}[]} entries
 * @returns {{ quiet: boolean, empty: boolean, chars: number, entries: number, milestones: number }}
 */
export function loadOf(entries) {
  const list = (entries || []).filter((e) => e && e.kind !== 'death');
  let chars = 0, milestones = 0;
  for (const e of list) {
    chars += textLength(e);
    if (e.kind === 'milestone') milestones++;
  }
  return {
    quiet: list.length > 0 && list.every((e) => (e.kind || 'year') === 'year'),
    empty: list.length === 0,
    chars,
    entries: list.length,
    milestones,
  };
}

// ---------------------------------------------------------------------------------------------
// The allocation
// ---------------------------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const targetSeconds = (pace) => (TARGET_MINUTES[pace] || TARGET_MINUTES.standard) * 60;
const safeYears = (expectedYears) => Math.max(20, Number(expectedYears) || 72);

/** Seconds per year if every year were alike: target / expected lifespan. */
export function baseSecondsPerYear(pace, expectedYears) {
  return targetSeconds(pace) / safeYears(expectedYears);
}

/**
 * How much the 7-chars-per-second reading estimate is stretched (or squeezed) so that an average life adds up
 * to the target: what is left after the quiet years, shared over the other years by their mean reading estimate.
 */
export function stretchFor(pace, expectedYears) {
  const base = baseSecondsPerYear(pace, expectedYears);
  const left = base * (1 - PACING.QUIET_SHARE * PACING.MEAN_QUIET_WEIGHT);
  return left / ((1 - PACING.QUIET_SHARE) * PACING.MEAN_READ);
}

/** Reading estimate in seconds (at 7 chars per second, plus beats) of an event or outcome load. */
export function readSeconds(load) {
  return PACING.ORIENT + load.chars / PACING.CPS
    + PACING.PER_ENTRY * Math.max(0, load.entries - 1) + PACING.MILESTONE_BEAT * load.milestones;
}

/**
 * Pure allocation for one year or one outcome.
 * @param {ReturnType<typeof loadOf>} load
 * @param {{ pace: string, expectedYears: number, gain?: number }} ctx  `gain` is the controller correction (1 = on schedule)
 * @returns {number} seconds at 1x (before ?debug=scale)
 */
export function dwellSeconds(load, { pace, expectedYears, gain = 1 }) {
  const base = baseSecondsPerYear(pace, expectedYears);
  if (load.empty) return PACING.QUIET_MIN;
  if (load.quiet) {
    const w = PACING.QUIET_LO + (PACING.QUIET_HI - PACING.QUIET_LO) * clamp(load.chars / PACING.QUIET_FULL, 0, 1);
    return clamp(base * w, PACING.QUIET_MIN, PACING.QUIET_MAX);
  }
  const floor = Math.max(PACING.EVENT_MIN, PACING.ORIENT_FAST + load.chars / PACING.CPS_FAST + PACING.PER_ENTRY * Math.max(0, load.entries - 1));
  const want = readSeconds(load) * stretchFor(pace, expectedYears) * gain;
  return clamp(want, floor, Math.max(floor, PACING.EVENT_MAX));
}

/**
 * Keeps one life on schedule. `plan(load, age)` is called when a year's text is on screen and returns how long
 * to stay there (seconds at 1x); it also books that time as spent.
 */
export function createPacer({ pace, expectedYears, age = 0 }) {
  const years = safeYears(expectedYears);
  const base = baseSecondsPerYear(pace, years);
  let spent = base * age; // a resumed life is assumed to be on schedule
  return {
    base,
    get spent() { return spent; },
    /** Controller correction for the year at `age`. */
    gain(atAge) {
      const lag = base * atAge - spent; // positive: we have used less than planned so far
      return clamp(1 + lag / (PACING.CTRL_YEARS * base), PACING.G_MIN, PACING.G_MAX);
    },
    plan(load, atAge, { cap = Infinity } = {}) {
      // what is booked is what is really used, so a capped first screen is made up for later by the controller
      const sec = Math.min(cap, dwellSeconds(load, { pace, expectedYears: years, gain: this.gain(atAge) }));
      spent += sec;
      return sec;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Helpers for the life screen
// ---------------------------------------------------------------------------------------------

/** Expected lifespan of this person (country, gender, era) in years. */
export function expectedYearsOf(state) {
  let le = 72;
  try { le = lifespanComparison(state).countryLe; } catch (e) { /* keep default */ }
  return safeYears(le);
}
