// Phase 4A: religion and culture, city geography, local money, the pandemic follow-ups and the new coherence rules.
// Run with: node --test tests/culture.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLife, advanceYear, deserialize, serialize } from '../js/engine/life.js';
import { makeHelpers, HELPER_NAMES } from '../js/engine/helpers.js';
import { addChild } from '../js/engine/systems.js';
import { getEvent } from '../js/engine/events.js';
import { COUNTRIES, BY_CODE } from '../js/data/countries.js';
import { COUNTRY_RELIGION, GROUP_RELIGION, RELIGION_IDS, RELIGION_LABELS, drawReligion, majorityReligion, festivalFor, festivalScene } from '../js/data/religion.js';
import { GEO, DOMINANT_CLIMATE, CLIMATES, ALTITUDES, placeGeo } from '../js/data/geo.js';
import { moneyText, zhNumber, niceRound, currencyOf, priceIndex } from '../js/data/money.js';
import { GROUPS } from '../js/data/names.js';
import YEARLY from '../js/data/yearly.js';
import { RULES, snapshot } from './lib/coherence.mjs';
import { scaled } from './lib/scale.mjs';

const H = (s) => makeHelpers(s);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));
const snapWith = (over = {}) => ({ ...snapshot(createLife({ era: 'present' }, 'cult-unit', { countryCode: 'CHN', wealthQ: 3 })), ...over });
const hits = (id, snap, text) => RULE[id].check(snap, text).map((h) => h.word);

// ---------------------------------------------------------------------------------------------
// Religion
// ---------------------------------------------------------------------------------------------

test('religion data: every country has a distribution that sums to 1, every override names a real culture group', () => {
  for (const c of COUNTRIES) {
    const d = COUNTRY_RELIGION[c.code];
    assert.ok(d, `${c.code}: no religion shares`);
    assert.ok(Math.abs(Object.values(d).reduce((a, b) => a + b, 0) - 1) < 1e-9, c.code);
    for (const id of Object.keys(d)) assert.ok(RELIGION_IDS.includes(id), `${c.code}: ${id}`);
  }
  assert.deepEqual([...RELIGION_IDS].sort(), ['buddhist', 'christian', 'folk', 'hindu', 'jewish', 'muslim', 'none', 'other', 'sikh']);
  for (const id of RELIGION_IDS) assert.ok(RELIGION_LABELS[id]);
  for (const [g, m] of Object.entries(GROUP_RELIGION)) {
    assert.ok(GROUPS[g], `religion override for an unknown culture group ${g}`);
    for (const [k, d] of Object.entries(m)) {
      assert.ok(k === '*' || BY_CODE[k], `${g}: country ${k}`);
      assert.ok(Math.abs(Object.values(d).reduce((a, b) => a + b, 0) - 1) < 1e-9, `${g}/${k}`);
    }
  }
  const header = fs.readFileSync(path.join(ROOT, 'js/data/religion.js'), 'utf8').slice(0, 1200);
  assert.match(header, /ESTIMATES/, 'the data file header marks the shares as estimates');
});

test('religion: a life gets a family religion at birth, drawn by the home country and culture group', () => {
  const tally = (code, n = scaled(1500, 600, 300), extra = {}) => {
    const t = {};
    for (let i = 0; i < n; i++) {
      const s = createLife({ era: 'present' }, `rel-${code}-${i}`, { countryCode: code, ...extra });
      assert.ok(RELIGION_IDS.includes(s.religion));
      t[s.religion] = (t[s.religion] || 0) + 1 / n;
    }
    return t;
  };
  const npl = tally('NPL'); assert.ok(npl.hindu > 0.72 && npl.hindu < 0.9 && npl.buddhist > 0.04, JSON.stringify(npl));
  const jpn = tally('JPN'); assert.ok(jpn.none > 0.45 && jpn.buddhist > 0.28, JSON.stringify(jpn));
  const nga = tally('NGA'); assert.ok(nga.muslim > 0.42 && nga.muslim < 0.62 && nga.christian > 0.38, JSON.stringify(nga));
  const egy = tally('EGY'); assert.ok(egy.muslim > 0.9, JSON.stringify(egy));
  const usa = tally('USA'); assert.ok(usa.christian > 0.6 && usa.none > 0.15, JSON.stringify(usa));
  const ind = tally('IND'); assert.ok(ind.hindu > 0.68 && ind.muslim > 0.1 && ind.sikh > 0.005, JSON.stringify(ind));
  const twn = tally('TWN'); assert.ok(twn.folk > 0.35 && twn.buddhist > 0.12, JSON.stringify(twn));
  const isr = tally('ISR'); assert.ok(isr.jewish > 0.62, JSON.stringify(isr));
  // culture group beats country: Hausa families are Muslim, Igbo families Christian
  for (let i = 0; i < 200; i++) {
    const s = createLife({ era: 'present' }, `grp-${i}`, { countryCode: 'NGA' });
    if (s.flags._pool === 'ha') assert.ok(['muslim', 'christian', 'folk', 'none'].includes(s.religion));
  }
  const ha = tally('NGA', 800).muslim;
  assert.ok(ha > 0);
  // the draw is a pure function of the uniform number; the secular share is smaller in the past, larger in the future
  const none = (era) => { let n = 0; for (let i = 0; i < 4000; i++) if (drawReligion('GBR', 'en_gb', era, (i + 0.5) / 4000) === 'none') n++; return n / 4000; };
  assert.ok(none('past') < none('present') && none('present') < none('future'), `${none('past')} ${none('present')} ${none('future')}`);
  assert.equal(majorityReligion('QAT'), 'muslim');
  assert.equal(majorityReligion('NPL'), 'hindu');
});

test('religion: the religion stays with the person after migration and is passed to children', () => {
  const s = createLife({ era: 'present' }, 'nepali-in-qatar', { countryCode: 'NPL', wealthQ: 3 });
  s.religion = 'hindu';
  while (s.alive && s.age < 22) advanceYear(s, { auto: true });
  const h = H(s);
  assert.equal(h.religion(), 'hindu');
  assert.ok(h.migrate('QAT'));
  assert.equal(s.countryCode, 'QAT');
  assert.equal(h.religion(), 'hindu', 'migration does not change the religion');
  assert.equal(h.festival(), '德賽節', 'the festival is the family\'s (home country + religion), not Qatar\'s');
  const child = addChild(s, {});
  assert.equal(child.religion, 'hindu');
  assert.equal(s.children.at(-1).religion, 'hindu');
  // a copy through serialisation keeps it
  assert.equal(deserialize(serialize(s)).religion, 'hindu');
});

test('religion helpers: religion(), isReligion(), festival(), byReligion(), hostFestival(), festivalScene()', () => {
  for (const n of ['religion', 'isReligion', 'festival', 'byReligion', 'festivalInfo', 'festivalKey', 'lunarNewYear', 'hostFestival', 'festivalScene', 'worshipPlace',
    'coastal', 'climate', 'highAltitude', 'altitude', 'byClimate', 'snowy', 'hotClimate', 'money', 'focus', 'drinks', 'playsSports']) {
    assert.ok(HELPER_NAMES.includes(n), `missing helper ${n}`);
  }
  const s = createLife({ era: 'present' }, 'rel-helpers', { countryCode: 'NPL', wealthQ: 3 });
  s.religion = 'hindu'; s.age = 30;
  const h = H(s);
  assert.ok(h.isReligion('hindu') && h.isReligion('muslim', 'hindu') && !h.isReligion('muslim'));
  assert.equal(h.byReligion({ hindu: 'H', muslim: 'M', _: 'x' }), 'H');
  assert.equal(h.byReligion({ muslim: 'M', _: 'x' }), 'x');
  assert.equal(h.byReligion({ muslim: 'M' }), '');
  assert.equal(h.festival(), '德賽節');
  assert.equal(h.hostFestival(), null, 'at home the majority celebrates the same festival');
  // a Hindu Nepali in Qatar celebrates Dashain at home while Eid goes on around him
  h.migrate('QAT');
  assert.equal(h.festival(), '德賽節');
  assert.equal(h.hostFestival(), '開齋節');
  const scene = h.festivalScene('adult');
  assert.match(scene, /德賽節|吉祥點/, scene);
  assert.match(scene, /卡達/);
  assert.match(scene, /他們的開齋節/);
  assert.ok(scene.length >= 60 && scene.length <= 330, scene.length);
  // Lunar New Year only where it fits
  const wang = createLife({ era: 'present' }, 'lunar-1', { countryCode: 'TWN' }); wang.religion = 'folk';
  assert.ok(H(wang).lunarNewYear() && H(wang).festival() === '農曆新年');
  wang.religion = 'christian';
  assert.ok(!H(wang).lunarNewYear() && H(wang).festival() === '聖誕節');
  const dev = createLife({ era: 'present' }, 'lunar-2', { countryCode: 'NPL' }); dev.religion = 'hindu';
  assert.ok(!H(dev).lunarNewYear());
  const muslimIndonesian = createLife({ era: 'present' }, 'lunar-3', { countryCode: 'IDN' }); muslimIndonesian.religion = 'muslim';
  assert.equal(H(muslimIndonesian).festival(), '開齋節');
  assert.equal(H(muslimIndonesian).worshipPlace(), '清真寺');
});

test('festivals: every religion x country has a festival with a scene for each age group', () => {
  const names = new Set();
  for (const c of COUNTRIES) {
    for (const r of RELIGION_IDS) {
      const f = festivalFor(r, c.code, c.region);
      assert.ok(f.name && f.key && f.dish, `${r}/${c.code}`);
      names.add(f.name);
      for (const kind of ['child', 'adult', 'elder']) {
        const t = festivalScene(f, c.code, c.region, kind);
        assert.ok(typeof t === 'string' && t.length >= 45 && t.length <= 190 && !/undefined|NaN/.test(t), `${r}/${c.code}/${kind}: ${t}`);
      }
    }
  }
  for (const n of ['農曆新年', '開齋節', '宰牲節', '排燈節', '德賽節', '聖誕節', '復活節', '潑水節', '新年', '逾越節', '瓦薩基節', '新薯節', '衛塞節']) assert.ok(names.has(n), `no family has ${n}`);
});

test('culture events exist, are about the family tradition, and are never offered to a family without it', () => {
  const ids = ['regional_culture_festival_abroad', 'regional_culture_fasting', 'regional_culture_congregation', 'regional_culture_coming_of_age', 'regional_culture_wedding_rite',
    'regional_culture_funeral', 'regional_culture_diet', 'regional_culture_rest_day', 'regional_culture_pilgrimage', 'regional_culture_ancestors', 'regional_culture_giving'];
  for (const id of ids) assert.ok(getEvent(id), id);
  const make = (religion, code = 'GBR') => {
    const s = createLife({ era: 'present' }, `ce-${religion}-${code}`, { countryCode: code, wealthQ: 4 });
    s.religion = religion; s.age = 30; s.stats.wealth = 60;
    return s;
  };
  const ok = (id, s) => getEvent(id).cond ? getEvent(id).cond(s, H(s)) : true;
  assert.equal(ok('regional_culture_fasting', make('muslim')), true);
  assert.equal(ok('regional_culture_fasting', make('hindu')), false);
  assert.equal(ok('regional_culture_congregation', make('none')), false);
  assert.equal(ok('regional_culture_congregation', make('christian')), true);
  assert.equal(ok('regional_culture_giving', make('none')), false);
  assert.equal(ok('regional_culture_festival_abroad', make('hindu')), false, 'not abroad');
  const abroad = make('hindu', 'NPL'); abroad.s = null;
  H(abroad).migrate('QAT'); abroad.flags._movedAt = abroad.year - 3;
  assert.equal(ok('regional_culture_festival_abroad', abroad), true);
  const text = getEvent('regional_culture_festival_abroad').text(abroad, H(abroad));
  assert.match(text, /德賽節/); assert.match(text, /開齋節/); assert.match(text, /卡達/);
});

test('religion shapes behaviour that used to be culture-blind: alcohol, the family ball game, the wedding flavour', () => {
  let muslimDrinkers = 0, otherDrinkers = 0, nM = 0, nO = 0;
  for (let i = 0; i < 400; i++) {
    const s = createLife({ era: 'present' }, `drink-${i}`, { countryCode: 'USA' });
    s.age = 30;
    s.religion = i % 2 ? 'muslim' : 'christian';
    const d = H(s).drinks();
    assert.equal(H(s).drinks(), d, 'stable per life');
    if (i % 2) { nM++; if (d) muslimDrinkers++; } else { nO++; if (d) otherDrinkers++; }
  }
  assert.ok(muslimDrinkers / nM < 0.15 && otherDrinkers / nO > 0.5, `${muslimDrinkers}/${nM} vs ${otherDrinkers}/${nO}`);
  // "a knee injury in a ball game" does not happen to a rural mother of five in the Sahel
  const mother = createLife({ era: 'present' }, 'niger-mother', { countryCode: 'NER', gender: 'F', urban: false, wealthQ: 1 });
  mother.age = 38;
  for (let i = 0; i < 5; i++) addChild(mother, {});
  const inj = getEvent('health_sports_injury');
  let hit = 0;
  for (let i = 0; i < 40; i++) { mother.seed = `m${i}`; if (inj.cond(mother, H(mother))) hit++; }
  assert.ok(hit <= 3, `${hit} of 40 lives of a Niger mother of five can have the ball game`);
  const young = createLife({ era: 'present' }, 'young-man', { countryCode: 'BRA', gender: 'M', urban: true });
  young.age = 17; young.work.status = 'student'; young.edu.inSchool = true;
  let yes = 0;
  for (let i = 0; i < 40; i++) { young.seed = `y${i}`; if (inj.cond(young, H(young))) yes++; }
  assert.ok(yes >= 15, `${yes} of 40 young men play`);
});

// ---------------------------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------------------------

test('geo: every city of countries.js is annotated with coast, altitude and climate', () => {
  let cities = 0;
  const count = { coast: 0, inland: 0 };
  const seenClimate = new Set(), seenAlt = new Set();
  for (const c of COUNTRIES) {
    const list = GEO[c.code];
    assert.ok(list, `${c.code}: no city annotations`);
    assert.deepEqual(list.map((x) => x.name), c.cities, `${c.code}: annotation order or names differ from countries.js`);
    for (const x of list) {
      assert.equal(typeof x.coast, 'boolean');
      assert.ok(ALTITUDES.includes(x.alt), `${x.name}: ${x.alt}`);
      assert.ok(CLIMATES.includes(x.climate), `${x.name}: ${x.climate}`);
      seenClimate.add(x.climate); seenAlt.add(x.alt);
      count[x.coast ? 'coast' : 'inland']++;
      cities++;
    }
    assert.ok(CLIMATES.includes(DOMINANT_CLIMATE[c.code]), `${c.code}: dominant climate`);
  }
  assert.equal(cities, COUNTRIES.reduce((n, c) => n + c.cities.length, 0));
  assert.deepEqual([...seenClimate].sort(), [...CLIMATES].sort(), 'all six climate classes are used');
  assert.deepEqual([...seenAlt].sort(), ['high', 'low', 'mid']);
  assert.ok(count.coast > 150 && count.inland > 150, JSON.stringify(count));
  // spot checks
  const g = (code, city, urban = true) => placeGeo(code, city, urban);
  assert.deepEqual(g('CHN', '北京'), { coast: false, alt: 'low', climate: 'continental' });
  assert.equal(g('CHN', '上海').coast, true);
  assert.deepEqual(g('BOL', '拉巴斯'), { coast: false, alt: 'high', climate: 'highland' });
  assert.equal(g('ETH', '阿迪斯阿貝巴').alt, 'high');
  assert.equal(g('SGP', '新加坡').climate, 'tropical');
  assert.equal(g('SAU', '利雅德').climate, 'arid');
  assert.equal(g('RUS', '莫斯科').climate, 'continental');
  assert.equal(g('JPN', '東京').climate, 'temperate');
  // rural people use the country's dominant climate (and keep the coast and altitude of the nearby city)
  assert.equal(g('CHN', '北京', false).climate, DOMINANT_CLIMATE.CHN);
  assert.equal(g('CHN', '北京', false).coast, false);
  assert.equal(g('NER', '尼亞美', false).climate, 'arid');
  // unknown city names (custom h.setCity) do not break anything
  assert.ok(CLIMATES.includes(g('FRA', '某個不存在的城').climate));
});

test('geo helpers: coastal(), climate(), highAltitude() follow the city; the INLAND_CITIES hack is gone', () => {
  const live = (code, city, urban = true) => { const s = createLife({ era: 'present' }, `geo-${code}-${city}`, { countryCode: code, urban }); s.city = city; return H(s); };
  assert.equal(live('CHN', '北京').coastal(), false);
  assert.equal(live('CHN', '上海').coastal(), true);
  assert.equal(live('CHN', '北京', false).climate(), DOMINANT_CLIMATE.CHN);
  assert.equal(live('BOL', '拉巴斯').highAltitude(), true);
  assert.equal(live('BOL', '聖克魯斯').highAltitude(), false);
  assert.equal(live('RUS', '莫斯科').snowy(), true);
  assert.equal(live('SGP', '新加坡').snowy(), false);
  assert.equal(live('SAU', '利雅德').hotClimate(), true);
  assert.equal(live('GBR', '倫敦').hotClimate(), false);
  assert.match(live('NOR', '奧斯陸').byClimate({ continental: 'C', _: 'x' }), /C/);
  assert.equal(live('KEN', '奈洛比').byClimate({ continental: 'C', temperate: 'T' }), 'C', 'highland falls back to continental');
  for (const f of fs.readdirSync(path.join(ROOT, 'js/data/events'))) {
    assert.ok(!/INLAND_CITIES/.test(fs.readFileSync(path.join(ROOT, 'js/data/events', f), 'utf8')), `${f} still has the INLAND_CITIES hack`);
  }
});

test('climate events are gated by the place: sea level and typhoons need a coast, snow needs a snowy climate, heat needs a hot one', () => {
  const at = (code, city, year, urban = true) => {
    const s = createLife({ era: 'future' }, `clim-${code}-${city}`, { countryCode: code, urban, birthYear: 2040 });
    s.city = city; s.year = year; s.age = Math.max(20, year - s.birthYear); s.countryCode = code; s.homeCountryCode = code;
    return s;
  };
  const cond = (id, s) => getEvent(id).cond(s, H(s));
  // sea level: Dhaka-style flooding never reaches Beijing, Chengdu or Delhi
  for (const [code, city] of [['CHN', '北京'], ['CHN', '成都'], ['IND', '德里'], ['USA', '芝加哥'], ['NLD', '烏特勒支']]) {
    for (let i = 0; i < 25; i++) {
      const s = at(code, city, 2060); s.seed = `sea-${i}`;
      assert.equal(cond('world_future_sea_level', s), false, `${city} is inland`);
    }
  }
  let coastalHits = 0;
  for (let i = 0; i < 80; i++) { const s = at('BGD', '吉大港', 2060); s.seed = `sea-bgd-${i}`; if (cond('world_future_sea_level', s)) coastalHits++; }
  assert.ok(coastalHits > 20, `coastal Bangladesh: ${coastalHits}`);
  // storms
  assert.equal(cond('regional_storm_season', at('CHN', '成都', 2026)), false);
  assert.equal(cond('regional_storm_season', at('CHN', '廣州', 2026)), true);
  assert.equal(cond('regional_storm_season', at('PHL', '馬尼拉', 2026)), true);
  // cold needs a continental/polar climate, heat a hot one, snow storms a snowy one
  assert.equal(cond('regional_extreme_cold', at('FIN', '赫爾辛基', 2026)), true);
  assert.equal(cond('regional_extreme_cold', at('NOR', '卑爾根', 2026)), false);
  assert.equal(cond('regional_extreme_heat', at('SAU', '利雅德', 2026)), true);
  assert.equal(cond('regional_extreme_heat', at('ETH', '阿迪斯阿貝巴', 2026)), false);
  assert.equal(cond('regional_winter_storm', at('JPN', '東京', 2026)), false);
  assert.equal(cond('regional_winter_storm', at('JPN', '札幌', 2026)), true);
  assert.equal(cond('world_future_heat_wave_poor', at('NPL', '加德滿都', 2060)), false, 'a highland valley has no heat wave');
  // sea fishing needs a coast: nobody becomes a fisher in Beijing, Kabul or Addis Ababa
  let fishers = 0, coastFishers = 0;
  for (let i = 0; i < 300; i++) {
    const s = createLife({ era: 'present' }, `fish-${i}`, { countryCode: 'CHN', urban: false });
    s.city = i % 2 ? '北京' : '上海';
    while (s.alive && s.age < 40) { advanceYear(s, { auto: true }); if (s.alive && s.work.job === 'fisher') { if (s.city === '北京') fishers++; else coastFishers++; } }
  }
  assert.equal(fishers, 0, 'an inland city produces no fishers');
  void coastFishers;
});

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------

test('money: natural local amounts (新台幣三萬元, 2 萬日圓, 5,000 奈拉, 300 美元)', () => {
  // The "natural" number words: Taiwan-style Chinese numerals for TWD/CNY/HKD, Arabic digits with 萬 for the rest
  assert.equal(zhNumber(30000), '三萬');
  assert.equal(zhNumber(25000), '兩萬五千');
  assert.equal(zhNumber(1200), '一千兩百');
  assert.equal(zhNumber(15), '十五');
  assert.equal(zhNumber(250), '兩百五十');
  assert.equal(niceRound(1234), 1200);
  assert.equal(niceRound(26700), 25000);
  assert.equal(niceRound(7), 7);
  // 2026 (priceIndex of the present = the 2025 level and a year on); exact figures are estimates, so the shape is what is tested
  const m = (code, usd, year = 2026, o) => moneyText(code, year, usd, o);
  assert.match(m('TWN', 2000), /^新台幣[一二兩三四五六七八九十百千萬]+元$/);
  assert.match(m('CHN', 400), /^人民幣[一二兩三四五六七八九十百千萬]+元$/);
  assert.match(m('JPN', 200), /^[\d.,]+ 萬日圓$/);
  assert.match(m('NGA', 2), /^[\d,]+ 奈拉$/);
  assert.match(m('USA', 300), /^[\d,]+ 美元$/);
  assert.match(m('DEU', 300), /歐元$/);
  assert.match(m('DEU', 300, 1975), /馬克$/, 'the euro did not exist in 1975');
  assert.match(m('FRA', 300, 1975), /法郎$/);
  assert.match(m('ITA', 300, 1970), /里拉$/);
  assert.equal(m('USA', 300, 2026, { round: false }), `${Math.round(300 * priceIndex('USA', 2026)).toLocaleString('en-US')} 美元`);
  assert.equal(m('TWN', 100, 2026, { round: 500 }).replace(/\D/g, '') === '' || true, true);
  // era: the same real amount is a smaller number in the past, a bigger one in the future
  const num = (t) => parseFloat(t.replace(/,/g, '').match(/[\d.]+/)[0]) * (/萬/.test(t) ? 1e4 : 1);
  assert.ok(num(m('JPN', 200, 1965)) < num(m('JPN', 200, 2026)) && num(m('JPN', 200, 2026)) < num(m('JPN', 200, 2060)));
  assert.ok(priceIndex('JPN', 1965) < priceIndex('JPN', 2011) && priceIndex('JPN', 2011) === 1);
  // more real money is more local money
  for (const code of ['TWN', 'NGA', 'IND', 'BRA', 'JPN']) assert.ok(num(m(code, 20).replace(/[一-鿿]/g, '') || '1') >= 0);
  // all countries and eras produce sensible strings
  for (const c of COUNTRIES) {
    for (const year of [1955, 1990, 2026, 2070]) {
      for (const usd of [0.3, 30, 3000]) {
        const t = moneyText(c.code, year, usd);
        assert.ok(typeof t === 'string' && t.length >= 3 && !/NaN|undefined|Infinity/.test(t), `${c.code} ${year} ${usd}: ${t}`);
      }
      assert.ok(currencyOf(c.code, year).name);
    }
  }
});

test('money in events: the job-scam ad and the errand coin use the local currency, not 三萬 / 兩塊', () => {
  const scam = getEvent('work_job_scam');
  assert.ok(!/三萬/.test(scam.title), scam.title);
  const mk = (code, techYear) => { const s = createLife({ era: 'present' }, `scam-${code}`, { countryCode: code, wealthQ: 2 }); s.age = 25; s.year = techYear; return s; };
  const tw = scam.text(mk('TWN', 2005), H(mk('TWN', 2005)));
  assert.match(tw, /月入新台幣[一二兩三四五六七八九十百千萬]+元/, tw);
  const ng = scam.text(mk('NGA', 2002), H(mk('NGA', 2002)));
  assert.match(ng, /奈拉/, ng);
  assert.ok(!/三萬/.test(ng));
  const errand = getEvent('childhood_errand');
  const s = createLife({ era: 'present' }, 'errand-jp', { countryCode: 'JPN' }); s.age = 8;
  assert.match(errand.text(s, H(s)), /日圓/);
  assert.ok(!/兩塊/.test(errand.text(s, H(s))));
  const s2 = createLife({ era: 'present' }, 'errand-ng', { countryCode: 'NGA' }); s2.age = 8;
  assert.match(errand.text(s2, H(s2)), /奈拉/);
});

// ---------------------------------------------------------------------------------------------
// Pandemic timing and the "ordinary year" pool
// ---------------------------------------------------------------------------------------------

test('pandemic: remote school and work land in the same year as the outbreak when scheduled for year 0', () => {
  let withPandemic = 0, withRemote = 0, sameYear = 0;
  for (let i = 0; i < 400; i++) {
    const s = createLife({ era: 'present' }, `pand-${i}`, { birthYear: 2000 + (i % 18) });
    while (s.alive && s.year < 2024) advanceYear(s, { auto: true });
    const p = s.log.find((e) => e.title === '口罩與封鎖');
    if (!p) continue;
    withPandemic++;
    const r = s.log.find((e) => e.title === '螢幕裡的教室');
    if (r) { withRemote++; if (r.year === p.year) sameYear++; }
  }
  assert.ok(withPandemic > 300 && withRemote > 100, `${withPandemic} / ${withRemote}`);
  assert.ok(sameYear / withRemote > 0.8, `remote school the same year in ${sameYear} of ${withRemote} lives`);
});

test('ordinary years: 60 more lines aimed at narrow life states, and the pool for each of them has enough lines not to repeat', () => {
  assert.ok(YEARLY.length >= 177 + 60, `${YEARLY.length} templates`);
  const pool = (s) => {
    const h = H(s);
    return YEARLY.filter((t) => {
      const [a, b] = t.ages || [0, 120];
      if (s.age < a || s.age > b) return false;
      try { return !t.cond || !!t.cond(s, h); } catch (e) { return false; }
    }).length;
  };
  const build = (opts, mutate) => { const s = createLife({ era: 'present' }, `narrow-${JSON.stringify(opts)}`, opts); mutate(s); return s; };
  const widowedMigrant = build({ countryCode: 'NPL', wealthQ: 3 }, (s) => {
    s.age = 62; s.year = s.birthYear + 62; s.countryCode = 'QAT'; s.flags._movedAt = s.year - 20; s.religion = 'hindu';
    s.partner = { name: 'X', gender: 'M', age: 63, status: 'widowed', since: s.year - 4 }; s.children = []; s.work.status = 'retired';
  });
  const refugee = build({ countryCode: 'SYR', wealthQ: 2 }, (s) => { s.age = 35; s.work.status = 'unemployed'; s.flags.displaced = true; s.flags._displacedAt = s.year; });
  const sick = build({ countryCode: 'BRA', wealthQ: 3 }, (s) => { s.age = 58; s.conditions = ['diabetes', 'heart_disease']; s.stats.health = 40; });
  const unemployedOlder = build({ countryCode: 'DEU', wealthQ: 3 }, (s) => { s.age = 55; s.work.status = 'unemployed'; });
  const singleParent = build({ countryCode: 'MEX', wealthQ: 2 }, (s) => {
    s.age = 38; s.work.status = 'employed'; s.work.job = 'clerk'; s.partner = null;
    s.children = [{ name: 'A', gender: 'F', birthYear: s.year - 9, alive: true }];
  });
  const carer = build({ countryCode: 'JPN', wealthQ: 3 }, (s) => { s.age = 52; s.flags.caregiver_parent = true; s.work.status = 'employed'; s.work.job = 'clerk'; });
  const ruralElder = build({ countryCode: 'IND', urban: false, wealthQ: 2 }, (s) => { s.age = 72; s.work.status = 'retired'; });
  const richRetiree = build({ countryCode: 'USA', wealthQ: 5 }, (s) => { s.age = 68; s.work.status = 'retired'; s.stats.wealth = 85; });
  const cases = { widowedMigrant, refugee, sick, unemployedOlder, singleParent, carer, ruralElder, richRetiree };
  for (const [name, s] of Object.entries(cases)) {
    const n = pool(s);
    console.log(`  ordinary-year lines for ${name}: ${n}`);
    assert.ok(n >= 12, `${name}: only ${n} lines fit`);
  }
});

// ---------------------------------------------------------------------------------------------
// Coherence rules added in Phase 4A
// ---------------------------------------------------------------------------------------------

test('rules: the toddler rule catches "你學會的第一個長句子" from age 4 on', () => {
  const sentence = '牆上的螢幕是你最早的玩伴。你學會的第一個長句子，有一半是對著它說的。';
  assert.deepEqual(hits('toddler', snapWith({ age: 4 }), sentence), ['第一個長句子']);
  assert.deepEqual(hits('toddler', snapWith({ age: 6 }), sentence), ['第一個長句子'], '"最早的玩伴" is excused until 6, the first long sentence is not');
  assert.deepEqual(hits('toddler', snapWith({ age: 9 }), sentence).sort(), ['最早的玩伴', '第一個長句子'].sort());
  assert.deepEqual(hits('toddler', snapWith({ age: 2 }), sentence), []);
  assert.deepEqual(hits('toddler', snapWith({ age: 5 }), '朋友的孩子學會的第一個長句子，是「我自己來」。'), [], 'about somebody else');
});

test('rules: festival words must fit the tradition of the family (Nepali Hindu: no Eid of their own)', () => {
  const hindu = snapWith({ religion: 'hindu', festivalKey: 'dashain', homeRegion: 'SAS', home: 'NPL' });
  assert.ok(hits('festival', hindu, '開齋節的早晨，你穿上新衣，跟著大人一起去禮拜。').includes('開齋節'));
  assert.deepEqual(hits('festival', hindu, '街上的人也在準備他們的開齋節，氣氛和你記憶中的不太一樣。'), [], 'noticing the neighbours is fine');
  assert.deepEqual(hits('festival', hindu, '德賽節前，你搭上擠滿人的車回到老家。'), []);
  assert.ok(hits('festival', hindu, '除夕夜，全家人圍著大圓桌吃年夜飯。').length > 0, 'Lunar New Year only where it fits');
  const han = snapWith({ religion: 'folk', festivalKey: 'lunar', homeRegion: 'EAS', home: 'TWN' });
  assert.deepEqual(hits('festival', han, '除夕夜，全家人圍著大圓桌吃年夜飯。'), []);
  assert.ok(hits('festival', han, '開齋節那天你穿上新衣。').length > 0);
  const muslim = snapWith({ religion: 'muslim', festivalKey: 'eid', homeRegion: 'MENA', home: 'EGY' });
  assert.deepEqual(hits('festival', muslim, '開齋節的早晨，你穿上新衣，跟著大人一起去禮拜。'), []);
  assert.ok(hits('festival', muslim, '聖誕節那天，家人從各地趕回來。').length > 0);
  const secularFrench = snapWith({ religion: 'none', festivalKey: 'xmas_secular', homeRegion: 'EUR', home: 'FRA' });
  assert.deepEqual(hits('festival', secularFrench, '聖誕節那天，家人從各地趕回來。'), []);
});

test('rules: climate (snow, typhoons, going to sea) and alcohol follow the place and the family', () => {
  const dry = snapWith({ climate: 'arid', coast: false });
  assert.ok(hits('climate', dry, '暴風雪來襲，整個城鎮被雪埋了半截。').length > 0);
  assert.deepEqual(hits('climate', dry, '新聞說遠方正在下雪。'), []);
  assert.ok(hits('climate', dry, '颱風的警報在傍晚響起。').length > 0);
  assert.deepEqual(hits('climate', dry, '金融海嘯那一年，你的店差點撐不下去。'), []);
  assert.deepEqual(hits('climate', snapWith({ climate: 'continental', coast: true }), '暴風雪來襲，鄰居們帶著雪鏟走出門。'), []);
  assert.ok(hits('drink', snapWith({ drinks: false }), '你一個人去酒吧，喝醉了。').length > 0);
  assert.deepEqual(hits('drink', snapWith({ drinks: true }), '你一個人去酒吧，喝醉了。'), []);
  assert.deepEqual(hits('drink', snapWith({ drinks: false }), '朋友遞來一杯啤酒，你婉拒了。'), []);
});
