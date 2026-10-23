// Name groups: every country maps to existing language / culture groups, groups are big enough, naming
// conventions are respected (East Asian order, patronymics, gendered surnames), and a life's name, parents,
// partner and children all come from the right culture.
// Run with: node --test tests/*.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { COUNTRIES, BY_CODE } from '../js/data/countries.js';
import {
  GROUPS, GROUP_KEYS, COUNTRY_GROUPS, getPool, makeName, composeName, drawGroup, poolKeyFor, childFamilyToken, groupsForCountry,
} from '../js/data/names.js';
import { createLife } from '../js/engine/life.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { createRngState, rand } from '../js/engine/rng.js';

const rngFn = (seed) => { const st = createRngState(seed); return () => rand(st); };

/** Group families the task requires, as lists of acceptable group keys (at least one of each must exist). */
const REQUIRED = {
  'Swahili / East Africa': ['sw', 'ke'], Amharic: ['am'], Somali: ['so'], Hausa: ['ha'], Yoruba: ['yo'], Igbo: ['ig'], Akan: ['ak'],
  'Zulu / Xhosa': ['zu'], 'Francophone West Africa': ['fw'], 'Lusophone Africa': ['lus'],
  'Arabic (Gulf)': ['ar_gulf'], 'Arabic (Levant)': ['ar_levant'], 'Arabic (Maghreb)': ['ar_maghreb'], Persian: ['fa'], Turkish: ['tr'],
  'Turkic Central Asian': ['kk_ky', 'uz_tk'], 'Pashto / Dari': ['ps_dari'], 'Urdu / Punjabi': ['ur'],
  'Hindi belt': ['hi'], Bengali: ['bn', 'bn_hi'], Tamil: ['ta'], Telugu: ['te'], Marathi: ['mr'], Nepali: ['ne'], Sinhala: ['si'],
  'Mandarin (simplified)': ['zh_hans'], 'Mandarin (traditional)': ['zh_hant'], Japanese: ['ja'], Korean: ['ko'],
  Vietnamese: ['vi'], Thai: ['th'], Burmese: ['my'], Khmer: ['km'], Lao: ['lo'], Indonesian: ['id'], Malay: ['ms'], Filipino: ['fil'],
  'Russian / East Slavic': ['ru', 'ua'], 'Polish / West Slavic': ['pl', 'cs'], 'South Slavic': ['sr', 'hr', 'bg', 'bs'], German: ['de'], French: ['fr'],
  Italian: ['it'], 'Spanish (Spain)': ['es_es'], 'Portuguese (Portugal)': ['pt_pt'], Dutch: ['nl'], Nordic: ['nord', 'fi'], Greek: ['el'],
  Romanian: ['ro'], Hungarian: ['hu'], Baltic: ['lt', 'lv', 'et'], 'English (UK / Ireland)': ['en_gb', 'en_ie'], Caucasus: ['ka', 'hy', 'az'],
  'Spanish (Latin America)': ['es_la'], 'Brazilian Portuguese': ['pt_br'], 'English (US / CA / AU / NZ)': ['en_us'], Caribbean: ['carib', 'es_car', 'ht'],
  'Pacific Islander': ['pac_pol', 'png', 'fj'],
};

test('names: every required language / culture group exists', () => {
  for (const [label, keys] of Object.entries(REQUIRED)) {
    assert.ok(keys.some((k) => GROUPS[k]), `no group for ${label} (${keys.join(', ')})`);
    for (const k of keys) assert.ok(GROUPS[k], `group ${k} (${label}) is missing`);
  }
  assert.ok(GROUP_KEYS.length >= 90, `${GROUP_KEYS.length} groups`);
});

test('names: every group has >= 25 male, >= 25 female given names and >= 25 family names (single-name cultures excepted)', () => {
  for (const k of GROUP_KEYS) {
    const g = GROUPS[k];
    assert.ok(g.label && g.cat, `${k}: label / category`);
    assert.ok(g.M.length >= 25, `${k}: ${g.M.length} male names`);
    assert.ok(g.F.length >= 25, `${k}: ${g.F.length} female names`);
    if (g.mode !== 'syll') assert.ok(g.S.length >= 25, `${k}: ${g.S.length} family names`);
    for (const list of [g.M, g.F, g.S]) {
      assert.equal(new Set(list).size, list.length, `${k}: duplicate tokens`);
      for (const t of list) assert.ok(typeof t === 'string' && t.length > 0 && !/undefined|NaN|\s{2}/.test(t), `${k}: bad token "${t}"`);
    }
  }
});

test('names: every country maps to existing groups with probabilities that sum to 1', () => {
  for (const c of COUNTRIES) {
    const list = COUNTRY_GROUPS[c.code];
    assert.ok(Array.isArray(list) && list.length > 0, `${c.code}: no name groups`);
    let sum = 0;
    for (const [k, p] of list) {
      assert.ok(GROUPS[k], `${c.code}: unknown group ${k}`);
      assert.ok(p > 0 && p <= 1, `${c.code}: probability ${p}`);
      sum += p;
    }
    assert.ok(Math.abs(sum - 1) < 1e-9, `${c.code}: probabilities sum to ${sum}`);
    assert.ok(GROUPS[poolKeyFor(c)], `${c.code}: dominant group`);
    assert.equal(groupsForCountry(c.code), list);
  }
  // every group is used by some country
  const used = new Set(Object.values(COUNTRY_GROUPS).flatMap((l) => l.map(([k]) => k)));
  for (const k of GROUP_KEYS) assert.ok(used.has(k), `group ${k} is not used by any country`);
});

test('names: multi-group countries use their several groups, weighted by share', () => {
  const rng = rngFn('groups');
  const count = (code, n = 4000) => {
    const m = {};
    for (let i = 0; i < n; i++) { const k = drawGroup(code, rng); m[k] = (m[k] || 0) + 1; }
    return m;
  };
  const nga = count('NGA');
  for (const k of ['ha', 'yo', 'ig']) assert.ok(nga[k] > 600, `NGA ${k}: ${nga[k]}`);
  assert.equal(Object.keys(nga).length, 3);
  const ind = count('IND');
  for (const k of ['hi', 'bn_hi', 'ta', 'te', 'mr']) assert.ok(ind[k] > 100, `IND ${k}: ${ind[k]}`);
  assert.ok(ind.hi > ind.ta && ind.hi / 4000 > 0.35);
  const che = count('CHE');
  for (const k of ['de', 'fr', 'it']) assert.ok(che[k] > 150, `CHE ${k}: ${che[k]}`);
  assert.ok(che.de > che.fr && che.fr > che.it);
  // single-culture countries are single
  for (const [code, key] of [['JPN', 'ja'], ['KOR', 'ko'], ['TWN', 'zh_hant'], ['CHN', 'zh_hans'], ['TZA', 'sw'], ['DEU', 'de']]) {
    assert.equal(poolKeyFor(BY_CODE[code]), key, code);
  }
});

test('names: East Asian order (family name first), simplified vs traditional characters', () => {
  const han = /^[一-鿿]+$/;
  const rng = rngFn('east-asia');
  for (const key of ['zh_hans', 'zh_hant', 'ja', 'ko']) {
    for (let i = 0; i < 400; i++) {
      for (const gender of ['F', 'M']) {
        const n = makeName(key, gender, rng);
        assert.ok(n.full.startsWith(n.family), `${key}: "${n.full}" must start with the family name "${n.family}"`);
        assert.equal(n.full.slice(n.family.length).startsWith(n.given), true, `${key}: "${n.full}" = family + given`);
        assert.ok(!/ /.test(n.full), `${key}: no space in "${n.full}"`);
        if (key === 'zh_hans' || key === 'zh_hant') assert.ok(han.test(n.full) && n.full.length >= 2 && n.full.length <= 4, `${key}: ${n.full}`);
      }
    }
  }
  assert.match(makeName('ko', 'F', rng).full, /^[가-힣]+（[一-鿿]+）$/);
  // Vietnamese, Khmer, Hungarian and Mongolian also put the family name first, with a space
  for (const key of ['vi', 'km', 'hu', 'mn']) {
    const n = makeName(key, 'M', rng);
    assert.equal(n.full, `${n.family} ${n.given}`, key);
  }
  // Western order elsewhere
  const w = makeName('en_us', 'F', rng);
  assert.equal(w.full, `${w.given} ${w.family}`);
  // Simplified and traditional pools differ in script
  const simplified = GROUPS.zh_hans.S, traditional = GROUPS.zh_hant.S;
  assert.ok(simplified.includes('张') && !simplified.includes('張'));
  assert.ok(traditional.includes('張') && !traditional.includes('张'));
  assert.ok(simplified.includes('陈') && traditional.includes('陳'));
  // the country mapping uses the right script
  for (const [code, key] of [['CHN', 'zh_hans'], ['TWN', 'zh_hant'], ['HKG', 'zh_hant'], ['MAC', 'zh_hant']]) {
    assert.deepEqual(COUNTRY_GROUPS[code], [[key, 1]], code);
  }
  for (let i = 0; i < 50; i++) {
    const tw = createLife({ era: 'present' }, `tw-${i}`, { countryCode: 'TWN' });
    assert.equal(tw.flags._pool, 'zh_hant');
    assert.ok(traditional.includes(tw.name.family));
    const cn = createLife({ era: 'present' }, `cn-${i}`, { countryCode: 'CHN' });
    assert.equal(cn.flags._pool, 'zh_hans');
    assert.ok(simplified.includes(cn.name.family));
  }
});

test('names: no more cross-culture mix-ups (Tanzanians get Swahili / Tanzanian names, never Ethiopian ones)', () => {
  const ethiopian = new Set([...GROUPS.am.M, ...GROUPS.am.F, ...GROUPS.tig.M, ...GROUPS.orm.M]);
  const rwandan = new Set(GROUPS.rw.S);
  for (let i = 0; i < 400; i++) {
    const s = createLife({ era: 'present' }, `tza-${i}`, { countryCode: 'TZA' });
    assert.equal(s.flags._pool, 'sw');
    assert.ok(!ethiopian.has(s.name.given) || GROUPS.sw.M.includes(s.name.given) || GROUPS.sw.F.includes(s.name.given), `${s.name.full}`);
    assert.ok(!rwandan.has(s.name.family) || GROUPS.sw.S.includes(s.name.family), `${s.name.full}`);
  }
  // Ethiopians never draw Habimana-style Rwandan family names, Tanzanians never Getachew
  assert.ok(!GROUPS.sw.M.includes('Getachew') && !GROUPS.sw.S.includes('Habimana'));
  assert.ok(GROUPS.am.M.includes('Getachew'));
  // Names of a country come from its own groups only
  const rng = rngFn('mix');
  for (const c of COUNTRIES) {
    const allowed = new Set(COUNTRY_GROUPS[c.code].map(([k]) => k));
    for (let i = 0; i < 6; i++) {
      const s = createLife({ era: 'random' }, `mix-${c.code}-${i}`, { countryCode: c.code });
      assert.ok(allowed.has(s.flags._pool), `${c.code}: life drew group ${s.flags._pool}`);
      assert.ok(s.name.full && !/undefined|NaN|\|/.test(s.name.full), `${c.code}: ${s.name.full}`);
      assert.ok(s.family.mother.name && s.family.father.name);
    }
    void rng;
  }
});

test('names: patronymic cultures (Amharic, Somali, Malay, Tamil) use the father\'s given name; syll cultures have no family name', () => {
  const rng = rngFn('patro');
  for (const key of ['am', 'orm', 'tig', 'so', 'ms', 'ta']) {
    assert.equal(GROUPS[key].mode, 'patro', key);
    for (let i = 0; i < 100; i++) {
      const n = makeName(key, i % 2 ? 'F' : 'M', rng);
      assert.ok(GROUPS[key].M.includes(n.family), `${key}: family token ${n.family} should be a male given name`);
      assert.ok(n.full.includes(n.given) && n.full.endsWith(n.family));
    }
  }
  const malayF = composeName('ms', 'F', 'Aminah', 'Ahmad'), malayM = composeName('ms', 'M', 'Hafiz', 'Ahmad');
  assert.equal(malayF.full, 'Aminah binti Ahmad');
  assert.equal(malayM.full, 'Hafiz bin Ahmad');
  for (const key of ['my', 'dz']) {
    assert.equal(GROUPS[key].mode, 'syll');
    const n = makeName(key, 'F', rng);
    assert.equal(n.family, '');
    assert.ok(n.full.includes(' '), `${key}: ${n.full} should be two given-name words`);
  }
  // Indonesians: a good share have a single name
  let single = 0;
  for (let i = 0; i < 500; i++) if (!makeName('id', 'M', rng).family) single++;
  assert.ok(single > 100 && single < 260, `single-name share ${single}/500`);
  // Sikh names carry Singh / Kaur
  assert.match(makeName('pa', 'M', rng).full, / Singh /);
  assert.match(makeName('pa', 'F', rng).full, / Kaur /);
  // children: patronymic children take the father's given name, syll children get fresh names
  assert.equal(childFamilyToken('am', { givenToken: 'Abebe', familyToken: 'Kebede' }), 'Abebe');
  assert.equal(childFamilyToken('en_us', { givenToken: 'John', familyToken: 'Smith' }), 'Smith');
  assert.equal(childFamilyToken('my', { givenToken: 'Aung', familyToken: 'Kyaw' }), null);
});

test('names: gendered surname forms (Slavic, Baltic) and tokens never leak the | separator', () => {
  const rng = rngFn('forms');
  for (const key of ['ru', 'pl', 'cs', 'bg', 'lt', 'lv', 'kk_ky', 'uz_tk', 'tg', 'az']) {
    assert.ok(GROUPS[key].forms, `${key} has gendered forms`);
    const f = composeName(key, 'F', GROUPS[key].F[0], GROUPS[key].S[0]);
    const m = composeName(key, 'M', GROUPS[key].M[0], GROUPS[key].S[0]);
    assert.ok(!/\|/.test(f.full + m.full), key);
    assert.notEqual(f.family, undefined);
  }
  assert.equal(composeName('ru', 'F', 'Anna', 'Ivanov|Ivanova').full, 'Anna Ivanova');
  assert.equal(composeName('ru', 'M', 'Ivan', 'Ivanov|Ivanova').full, 'Ivan Ivanov');
  for (const k of GROUP_KEYS) for (const g of ['F', 'M']) for (let i = 0; i < 30; i++) {
    const n = makeName(k, g, rng);
    assert.ok(n.full && n.given && !/undefined|NaN|\|/.test(n.full), `${k}: ${n.full}`);
  }
});

test('names: parents carry the family\'s name tokens; mothers keep their own names where that is the custom', () => {
  for (let i = 0; i < 80; i++) {
    const s = createLife({ era: 'present' }, `par-${i}`, { countryCode: i % 2 ? 'USA' : 'JPN' });
    const g = GROUPS[s.flags._pool];
    if (g.maiden) continue;
    assert.ok(s.family.father.name.endsWith(s.name.family) || s.family.father.name.startsWith(s.name.family), `${s.family.father.name} / ${s.name.full}`);
    assert.ok(s.family.mother.name.includes(s.name.family), `${s.family.mother.name} / ${s.name.full}`);
  }
  // Chinese mothers keep their own family name
  let differ = 0;
  for (let i = 0; i < 60; i++) {
    const s = createLife({ era: 'present' }, `par-tw-${i}`, { countryCode: 'TWN' });
    assert.ok(s.family.father.name.startsWith(s.name.family));
    if (!s.family.mother.name.startsWith(s.name.family)) differ++;
  }
  assert.ok(differ > 30, `most mothers keep their own family name (${differ}/60)`);
});

test('names: partners come from the person\'s culture; migrants sometimes partner across groups', () => {
  let same = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const s = createLife({ era: 'present' }, `pt-${i}`, { countryCode: 'KOR' });
    s.age = 25;
    const p = makeHelpers(s).newPartner({ status: 'dating' });
    assert.match(p.name, /^[가-힣]+（[一-鿿]+）$|^[가-힣]+$/, p.name);
    if (s.flags._partnerPool === s.flags._pool) same++;
    n++;
  }
  assert.equal(same, n, 'a Korean life in Korea: Korean partners (only one group in the country)');
  // multi-group country: mostly the own group
  let own = 0;
  for (let i = 0; i < 400; i++) {
    const s = createLife({ era: 'present' }, `pt-ng-${i}`, { countryCode: 'NGA' });
    s.age = 25;
    makeHelpers(s).newPartner({ status: 'dating' });
    if (s.flags._partnerPool === s.flags._pool) own++;
  }
  assert.ok(own / 400 > 0.85 && own / 400 < 0.99, `own-group partners ${own / 400}`);
  // a migrant in Germany: about half partner with someone from the host culture
  let host = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    const s = createLife({ era: 'present' }, `pt-mig-${i}`, { countryCode: 'TWN' });
    s.age = 28;
    makeHelpers(s).migrate('DEU');
    makeHelpers(s).newPartner({ status: 'dating' });
    if (s.flags._partnerPool !== 'zh_hant') host++;
    total++;
  }
  assert.ok(host / total > 0.35 && host / total < 0.65, `host-culture partners ${host / total}`);
});

test('names: saves from before the groups (old pool keys) still compose names', () => {
  for (const old of ['zh', 'ja', 'ko', 'in', 'pk', 'bd', 'lk', 'ca', 'ar', 'af_w', 'af_e', 'af_s', 'af_c', 'en', 'ph', 'mm', 'es', 'pt', 'cee', 'cauc', 'nope']) {
    assert.ok(getPool(old) && getPool(old).M.length >= 25, old);
    const n = composeName(old, 'F', getPool(old).F[0], getPool(old).S[0] || '');
    assert.ok(n.full && !/undefined/.test(n.full), old);
  }
});
