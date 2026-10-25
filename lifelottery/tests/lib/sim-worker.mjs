// Worker for tests/simulation.test.mjs: plays whole lives on another thread so that the statistical tests (the longest part of `npm test`)
// use every core. Each task returns plain data; the assertions stay in the test file.
import { parentPort } from 'node:worker_threads';
import { createLife, advanceYear } from '../../js/engine/life.js';
import { BY_CODE } from '../../js/data/countries.js';
import { eraView } from '../../js/data/eras.js';
import { EFFECT_KEYS } from '../../js/engine/events.js';

const play = (s) => { let g = 0; while (s.alive && g++ < 130) advanceYear(s, { auto: true }); return s; };

const TASKS = {
  /** n whole lives of one country (present era): the statistics the death-age, demographics and choices tests read. */
  country({ code, n }) {
    const stats = { n: 0, ageSum: 0, ageF: 0, nF: 0, ageM: 0, nM: 0, choices: 0, errors: 0, kidsSum: 0, kidsN: 0, ever: 0, evMax: 0, minChoices: 1e9, maxChoices: 0, messages: [] };
    for (let i = 0; i < n; i++) {
      try {
        const s = play(createLife({ era: 'present' }, `sim-${code}-${i}`, { countryCode: code }));
        if (s.alive) throw new Error('life must end');
        for (const k of EFFECT_KEYS) if (!Number.isFinite(s.stats[k])) throw new Error(`${k} not finite`);
        const age = s.death.age + 0.5; // deaths are spread uniformly over the year of age
        stats.n++; stats.ageSum += age;
        if (s.gender === 'F') { stats.ageF += age; stats.nF++; } else { stats.ageM += age; stats.nM++; }
        const c = s.log.reduce((m, e) => m + (e.kind === 'choice' ? 1 : 0), 0);
        stats.choices += c;
        stats.minChoices = Math.min(stats.minChoices, c); stats.maxChoices = Math.max(stats.maxChoices, c);
        if (s.gender === 'F' && s.death.age >= 50) { stats.kidsSum += s.children.length; stats.kidsN++; }
        if (s.flags._married) stats.ever++;
      } catch (e) {
        stats.errors++;
        if (stats.messages.length < 3) stats.messages.push(`life ${code}-${i} threw: ${e && e.stack || e}`);
      }
    }
    return stats;
  },
  /** M lives of one country, only their first year: the infant deaths. */
  imr({ code, M }) {
    let deaths = 0;
    for (let i = 0; i < M; i++) {
      const s = createLife({ era: 'present' }, `imr-${code}-${i}`, { countryCode: code });
      if (advanceYear(s, { auto: true }).died) deaths++;
    }
    return { deaths, M };
  },
  /** Women of one country (and era) who live to 50 and over: their children. `tfrAt27` also sums the TFR of their reproductive years. */
  fert({ code, n, era = 'present', tfrAt27 = false, prefix = 'fert' }) {
    let kids = 0, women = 0, tfrSum = 0;
    for (let i = 0; i < n; i++) {
      const s = play(createLife({ era }, era === 'present' ? `${prefix}-${code}-${i}` : `${prefix}-${era}-${code}-${i}`, { countryCode: code, gender: 'F' }));
      if (s.death.age >= 50) { kids += s.children.length; women++; if (tfrAt27) tfrSum += eraView(BY_CODE[code], s.birthYear + 27).tfr; }
    }
    return { kids, women, tfrSum };
  },
  /** Every country in one era, a few lives each: no life throws, stats stay in range, the mean gap to life expectancy. */
  smoke({ era, codes, perCountry }) {
    let gap = 0, n = 0, errors = 0;
    const messages = [];
    for (const code of codes) {
      for (let i = 0; i < perCountry; i++) {
        try {
          const s = play(createLife({ era }, `smoke-${era}-${code}-${i}`, { countryCode: code }));
          if (s.alive) throw new Error('life must end');
          for (const k of EFFECT_KEYS) if (!(Number.isFinite(s.stats[k]) && s.stats[k] >= 0 && s.stats[k] <= 100)) throw new Error(`${k} out of range`);
          const v = eraView(BY_CODE[code], s.birthYear);
          gap += s.death.age + 0.5 - v.le[s.gender];
          n++;
        } catch (e) {
          errors++;
          if (messages.length < 3) messages.push(`smoke ${era} ${code} threw: ${e && e.stack || e}`);
        }
      }
    }
    return { gap, n, errors, messages };
  },
};

parentPort.on('message', ({ id, task, args }) => {
  try { parentPort.postMessage({ id, result: TASKS[task](args) }); } catch (e) { parentPort.postMessage({ id, error: String(e && e.stack || e) }); }
});
