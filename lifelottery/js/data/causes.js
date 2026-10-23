// Causes of death: category list, base distributions, country/personal modifiers, display text.
//
// The tables are stylised from WHO GHE / IHME GBD cause-of-death patterns; the goal is a
// believable *shape* (infection and childbirth in poor countries, chronic disease and cancer
// in rich ones), not epidemiological precision.

/** Age bands used by the base tables (index 0..6). */
export const AGE_BANDS = [[0, 0], [1, 4], [5, 14], [15, 29], [30, 49], [50, 69], [70, 200]];

export function ageBand(age) {
  for (let i = 0; i < AGE_BANDS.length; i++) if (age >= AGE_BANDS[i][0] && age <= AGE_BANDS[i][1]) return i;
  return AGE_BANDS.length - 1;
}

/**
 * Cause catalogue. `label` is the short form for lists, `phrases` are full sentences
 * ("…離世") picked at random so repeated lives do not read identically.
 * `direct` causes are never drawn from the table; they only come from h.die(causeId).
 */
export const CAUSES = {
  neonatal: { label: '新生兒狀況', phrases: ['出生後不久，因早產與新生兒併發症離世。', '在人生最初的幾天裡，因新生兒疾病離開。'] },
  lri: { label: '下呼吸道感染', phrases: ['因嚴重的肺部感染離世。', '一場來勢洶洶的肺炎帶走了生命。'] },
  diarrhea: { label: '腹瀉疾病', phrases: ['因嚴重腹瀉與脫水離世。', '一場腸道感染在短短數日內奪走了生命。'] },
  malaria: { label: '瘧疾', phrases: ['因瘧疾離世。', '被蚊蟲傳播的瘧疾帶走。'] },
  tb: { label: '結核病', phrases: ['因結核病離世，病程拖了很久。', '長期的肺結核最終耗盡了身體。'] },
  hiv: { label: '愛滋病相關疾病', phrases: ['因愛滋病相關的併發症離世。', '免疫系統衰竭，因愛滋病相關疾病離世。'] },
  malnutrition: { label: '營養不良', phrases: ['長期營養不良，身體撐不下去。', '因營養不良與反覆感染離世。'] },
  road: { label: '交通事故', phrases: ['因一場交通事故離世。', '在路上遭遇事故，來不及回家。'] },
  drowning: { label: '溺水', phrases: ['因溺水意外離世。', '在水邊發生的意外帶走了生命。'] },
  homicide: { label: '他殺', phrases: ['因暴力事件離世。', '在一場暴力衝突中喪生。'] },
  suicide: { label: '自殺', phrases: ['在痛苦中選擇了結束自己的生命。', '因自殺離世。'] },
  conflict: { label: '武裝衝突', phrases: ['在戰火與衝突中喪生。', '戰事波及，沒能躲過。'] },
  maternal: { label: '孕產相關', phrases: ['因懷孕或生產的併發症離世。', '在生產前後出現大出血等併發症離世。'] },
  cvd: { label: '心血管疾病', phrases: ['因心臟疾病離世。', '心臟在某個平凡的日子裡停止了跳動。'] },
  stroke: { label: '中風', phrases: ['因中風離世。', '一次突如其來的腦中風帶走了生命。'] },
  cancer: { label: '癌症', phrases: ['因癌症離世。', '與癌症共處一段時間後安靜離開。'] },
  diabetes: { label: '糖尿病', phrases: ['因糖尿病的併發症離世。', '長年的糖尿病拖垮了身體。'] },
  copd: { label: '慢性肺病', phrases: ['因慢性肺部疾病離世，最後的日子呼吸總是很吃力。', '因慢性阻塞性肺病離世。'] },
  dementia: { label: '失智症', phrases: ['因失智症離世，最後幾年已漸漸認不得身邊的人。', '在失智症的漫長告別後安靜離開。'] },
  kidney: { label: '腎臟疾病', phrases: ['因腎臟疾病離世。', '腎功能衰竭帶走了生命。'] },
  liver: { label: '肝臟疾病', phrases: ['因肝臟疾病離世。', '長期的肝病最終惡化。'] },
  other: { label: '其他原因', phrases: ['因疾病離世。', '因一場意外的健康危機離世。', '身體在病痛與歲月中逐漸衰竭，安靜離開。'] },
  disaster: { label: '自然災害', direct: true, phrases: ['在一場自然災害中喪生。', '天災來得太快，沒能逃過。'] },
};

export const CAUSE_IDS = Object.keys(CAUSES);

// ---- Base tables: relative weights per age band for low (L) and high (H) income countries. ----
// LM and UM are blends of the two (see baseWeights), which keeps the table small.

const BASE_L = [
  { neonatal: 50, lri: 14, diarrhea: 8, malaria: 6, malnutrition: 4, hiv: 1, other: 17 },
  { lri: 20, diarrhea: 14, malaria: 17, malnutrition: 10, hiv: 3, tb: 2, drowning: 4, road: 2, other: 28 },
  { malaria: 12, diarrhea: 8, lri: 10, tb: 4, hiv: 4, road: 8, drowning: 8, malnutrition: 6, conflict: 3, homicide: 2, other: 35 },
  { hiv: 9, tb: 9, maternal: 9, road: 11, homicide: 6, suicide: 6, conflict: 6, malaria: 4, lri: 4, diarrhea: 3, cvd: 3, drowning: 3, cancer: 2, other: 25 },
  { hiv: 12, tb: 12, cvd: 10, cancer: 6, maternal: 4, road: 7, homicide: 6, suicide: 4, liver: 3, lri: 4, malaria: 3, diabetes: 2, stroke: 4, other: 23 },
  { cvd: 18, stroke: 10, cancer: 12, tb: 8, diabetes: 4, copd: 6, lri: 6, liver: 4, kidney: 3, hiv: 4, road: 3, other: 22 },
  { cvd: 22, stroke: 14, lri: 10, copd: 8, cancer: 8, dementia: 5, diabetes: 4, kidney: 3, tb: 3, other: 23 },
];

const BASE_H = [
  { neonatal: 55, other: 40, lri: 3, homicide: 2 },
  { other: 45, cancer: 10, road: 12, drowning: 8, lri: 6, homicide: 5, cvd: 3, diarrhea: 1 },
  { cancer: 18, road: 20, other: 22, suicide: 8, drowning: 6, homicide: 6, cvd: 3, lri: 2, diabetes: 1 },
  { road: 22, suicide: 20, homicide: 12, cancer: 8, other: 18, cvd: 5, maternal: 1, diabetes: 1, hiv: 1, drowning: 3 },
  { cancer: 25, cvd: 18, suicide: 9, road: 7, liver: 6, homicide: 3, other: 14, stroke: 4, diabetes: 3, hiv: 1, copd: 2, kidney: 1 },
  { cancer: 38, cvd: 22, stroke: 6, copd: 6, liver: 5, diabetes: 4, dementia: 2, kidney: 2, other: 10, lri: 2, suicide: 1, road: 1 },
  { cvd: 25, cancer: 20, dementia: 12, stroke: 10, copd: 7, lri: 6, diabetes: 4, kidney: 4, other: 10, liver: 1 },
];

const BLEND = { L: 0, LM: 0.35, UM: 0.7, H: 1 }; // share of the H table

/** Blended base weights for an income group and age band -> { cause: weight }. */
export function baseWeights(income, band) {
  const t = BLEND[income] ?? 0.5;
  const out = {};
  for (const [k, v] of Object.entries(BASE_L[band])) out[k] = (out[k] || 0) + v * (1 - t);
  for (const [k, v] of Object.entries(BASE_H[band])) out[k] = (out[k] || 0) + v * t;
  return out;
}

// ---- Country-level modifiers ----

const ROAD_REF = { L: 25, LM: 18, UM: 15, H: 6 };
const HOMICIDE_REF = { L: 7, LM: 5, UM: 12, H: 1.5 };
const SUICIDE_REF = { L: 9, LM: 9, UM: 8, H: 11 };

const MALARIA_REGION = { SSA: 1, SAS: 0.15, SEA: 0.15, OCE: 0.2, LAC: 0.04, MENA: 0.05 };
const MALARIA_COUNTRY = { PNG: 1, SLB: 1, YEM: 0.5, SDN: 1, SOM: 1, MMR: 0.5, ZAF: 0.1, NAM: 0.3, BWA: 0.2, MUS: 0, CPV: 0.05, DJI: 0.2, SWZ: 0.1, LSO: 0 };
export const HIV_HIGH = new Set(['ZAF', 'BWA', 'LSO', 'SWZ', 'NAM', 'ZWE', 'MWI', 'ZMB', 'MOZ', 'UGA', 'TZA', 'KEN', 'CMR', 'CAF', 'COG', 'GAB']);
const TB_REGION = { SAS: 1, SEA: 1, SSA: 1, EAS: 0.6, CAS: 0.8, MENA: 0.4, LAC: 0.4, EUR: 0.25, NAM: 0.15, OCE: 0.4 };

/** Countries where armed conflict is a meaningful cause of death, by era key. 1 = typical, 2 = severe. */
export const CONFLICT = {
  past: { VNM: 3, KHM: 3, LAO: 2, ISR: 0.5, PAK: 0.3, BGD: 0.3, NGA: 0.2, ETH: 0.3 },
  present: { SYR: 3, UKR: 3, YEM: 3, AFG: 2, SDN: 3, SSD: 3, SOM: 2, COD: 2, MMR: 2, ETH: 1.5, IRQ: 1, PSE: 3, LBY: 1, MLI: 1.5, BFA: 2, NER: 1, NGA: 0.7, CAF: 1.5, HTI: 0.5, MOZ: 0.5, CMR: 0.5, ISR: 0.8, RUS: 0.4 },
  future: {},
};

/** Final per-cause weights for a person. `s` is the life state, `ctx` carries country view + personal flags. */
export function causeWeights(s, country, view, eraKey) {
  const band = ageBand(s.age);
  const w = baseWeights(country.income, band);
  const code = country.code;

  if (w.road != null) w.road *= clamp(view.road / ROAD_REF[country.income], 0.2, 4);
  if (w.homicide != null) w.homicide *= clamp(view.homicide / HOMICIDE_REF[country.income], 0.1, 6);
  if (w.suicide != null) w.suicide *= clamp(view.suicide / SUICIDE_REF[country.income], 0.2, 4);

  const mal = MALARIA_COUNTRY[code] ?? MALARIA_REGION[country.region] ?? 0;
  if (w.malaria != null) w.malaria *= mal;
  // HIV did not exist before the early 1980s and treatment shrinks its toll in later decades.
  const hivEra = s.year < 1983 ? 0 : s.year < 1995 ? 0.6 : s.year < 2030 ? 1 : 0.4;
  if (w.hiv != null) w.hiv *= hivEra * (HIV_HIGH.has(code) ? 2.2 : country.region === 'SSA' ? 1 : 0.2);
  if (w.tb != null) w.tb *= TB_REGION[country.region] ?? 0.5;

  // Maternal deaths: women of reproductive age only.
  if (w.maternal != null && !(s.gender === 'F' && s.age >= 15 && s.age <= 49)) delete w.maternal;
  else if (w.maternal != null && s.flags._birthThisYear) w.maternal *= 4;

  const conflict = CONFLICT[eraKey]?.[code] || 0;
  const warFlag = s.flags.war ? 3 : 0;
  const cf = Math.max(conflict, warFlag);
  if (cf > 0 && band >= 2) w.conflict = (w.conflict || 0) + (band === 3 ? 6 : 3) * cf * (s.gender === 'M' ? 1.5 : 0.6);
  else delete w.conflict;

  // Personal modifiers.
  const has = (id) => s.conditions.includes(id);
  if (s.smoker) {
    if (w.cancer) w.cancer *= 1.5;
    if (w.cvd) w.cvd *= 1.35;
    if (w.copd) w.copd *= 3;
    if (w.stroke) w.stroke *= 1.3;
  }
  if (has('diabetes')) { if (w.diabetes) w.diabetes *= 6; if (w.kidney) w.kidney *= 2; if (w.cvd) w.cvd *= 1.3; }
  if (has('heart_disease') && w.cvd) w.cvd *= 3;
  if (has('copd') && w.copd) w.copd *= 4;
  if (has('asthma') && w.copd) w.copd *= 1.5;
  if (has('cancer') && w.cancer) w.cancer *= 6;
  if (has('dementia') && w.dementia) w.dementia *= 6;
  if (has('hypertension')) { if (w.stroke) w.stroke *= 2; if (w.cvd) w.cvd *= 1.4; }
  if (has('depression') && w.suicide) w.suicide *= 3;
  if (has('hiv') && w.hiv) w.hiv *= 8;
  if (has('alcohol') && w.liver) w.liver *= 4;
  if (s.family.wealthQ <= 2 && band <= 1) { if (w.diarrhea) w.diarrhea *= 1.3; if (w.malnutrition) w.malnutrition *= 1.5; }

  return w;
}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

/** Sentence describing the death, e.g. for the death card. */
export function causeSentence(causeId, pick) {
  const c = CAUSES[causeId] || CAUSES.other;
  return pick(c.phrases);
}
