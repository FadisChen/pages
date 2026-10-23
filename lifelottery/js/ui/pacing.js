// Life-length pacing: how many real seconds one simulated year lasts.
//
// The player picks a target life length (about 10 / 30 / 60 minutes). We divide it by the expected
// lifespan of this particular person (country, gender and era specific life expectancy), so that a
// life lived in a country with a 55-year expectancy is not rushed through in the same time as one
// with 85 years. Pausing and time spent on choices do not count towards the target.

import { lifespanComparison } from '../engine/summary.js';
import { FAST } from './dom.js';

export const TARGET_MINUTES = { short: 10, standard: 30, long: 60 };

/** Bounds keep extreme life expectancies readable (not a flicker, not a crawl). */
export const MIN_SECONDS_PER_YEAR = 3;
export const MAX_SECONDS_PER_YEAR = 60;
export const FAST_SECONDS_PER_YEAR = 0.05;

/** Pure: seconds per year for a pace and an expected lifespan in years. */
export function secondsPerYearFor(pace, expectedYears) {
  const minutes = TARGET_MINUTES[pace] || TARGET_MINUTES.standard;
  const years = Math.max(20, Number(expectedYears) || 72);
  const raw = (minutes * 60) / years;
  return Math.min(MAX_SECONDS_PER_YEAR, Math.max(MIN_SECONDS_PER_YEAR, raw));
}

/** Seconds per year for a live game state (honours ?debug=fast). */
export function secondsPerYear(state) {
  if (FAST) return FAST_SECONDS_PER_YEAR;
  let le = 72;
  try { le = lifespanComparison(state).countryLe; } catch (e) { /* keep default */ }
  return secondsPerYearFor(state.settings.pace, le);
}

/** Seconds the auto-choice countdown lasts. */
export const AUTO_CHOICE_SECONDS = 8;
export const AUTO_CHOICE_SECONDS_FAST = 0.2;
