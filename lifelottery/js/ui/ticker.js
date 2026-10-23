// The live world-population ticker on the landing page.
// Numbers are estimates derived from the bundled country statistics (see the About page).

import { COUNTRIES } from '../data/countries.js';

const SECONDS_PER_YEAR = 365.25 * 86400;
/** countries.js population figures are for 2022 (mid-year). */
const BASE_EPOCH = Date.UTC(2022, 6, 1);
/** Approximate current net growth rate of world population per year. */
const GROWTH = 0.0088;

let cache = null;
function base() {
  if (!cache) {
    let pop = 0, births = 0;
    for (const c of COUNTRIES) { pop += c.pop; births += c.births; }
    cache = { pop, births, perSecond: births / SECONDS_PER_YEAR };
  }
  return cache;
}

/** Estimated world population at a time (ms since epoch). */
export function worldPopulationAt(ms = Date.now()) {
  const b = base();
  const years = (ms - BASE_EPOCH) / (SECONDS_PER_YEAR * 1000);
  return b.pop * Math.exp(GROWTH * years);
}

/** Births per second, worldwide. */
export function birthsPerSecond() {
  return base().perSecond;
}

/** Births since `sinceMs`. */
export function birthsSince(sinceMs, nowMs = Date.now()) {
  return Math.floor(((nowMs - sinceMs) / 1000) * base().perSecond);
}
