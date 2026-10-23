// Religion and tradition of the family a person is born into, plus the festivals that go with it.
//
// ESTIMATES. The national shares are my recollection of the Pew Research Center's "Religious Composition by Country"
// (2010 baseline, 2020-style projections), national censuses (UK, Australia, New Zealand, Ireland, Canada, India, Nepal,
// Malaysia, Singapore ...) and CIA World Factbook / ARDA summaries, rounded to whole percent or half a percent. They are
// NOT an extract of a dataset and several countries are uncertain by 5-10 points (Chinese folk religion vs. "none" in China,
// Taiwan and Vietnam; "folk" in West Africa; the Gulf states, where Pew counts foreign residents). The game only needs
// them to draw plausible families and to keep festival text from contradicting the tradition of the person. Do not cite them.
//
// Categories (the ids stored in `state.religion`):
//   christian  Christians of every branch (Catholic, Protestant, Orthodox, Coptic, independent churches)
//   muslim     Muslims (Sunni, Shia, others)
//   hindu      Hindus
//   buddhist   Buddhists
//   folk       folk / traditional religions: Chinese folk religion & Taoism-as-practised, African traditional religions,
//              Vodou, Santeria, Kirat ...
//   jewish     Jews
//   sikh       Sikhs
//   none       unaffiliated: secular, atheist, agnostic or "no religion in particular"
//   other      everything else (Shinto-based and new religions in Japan, Druze, Yazidi, Baha'i, Jain, Rastafari, Chondoism ...)
//
// The family religion is drawn at birth (engine/life.js) from the home country's distribution; a person's name/culture
// group can override it where the two are tightly linked (Hausa -> Muslim, Igbo -> Christian, Punjabi in India -> Sikh ...).
// Period adjustment: the "none" share is smaller for people born in the past era and larger in the future era.

export const RELIGION_IDS = ['christian', 'muslim', 'hindu', 'buddhist', 'folk', 'jewish', 'sikh', 'none', 'other'];

export const RELIGION_LABELS = {
  christian: '基督宗教', muslim: '伊斯蘭教', hindu: '印度教', buddhist: '佛教', folk: '民間信仰與傳統宗教',
  jewish: '猶太教', sikh: '錫克教', none: '沒有特定宗教', other: '其他信仰',
};

const KEY = { c: 'christian', m: 'muslim', h: 'hindu', b: 'buddhist', f: 'folk', j: 'jewish', s: 'sikh', n: 'none', o: 'other' };

/** 'c80 n14 m5 o1' -> { christian: .8, none: .14, muslim: .05, other: .01 } (normalised to sum 1) */
function parse(spec) {
  const out = {};
  let total = 0;
  for (const tok of spec.trim().split(/\s+/)) {
    const id = KEY[tok[0]];
    const v = parseFloat(tok.slice(1));
    if (!id || !(v >= 0)) throw new Error(`bad religion spec "${tok}" in "${spec}"`);
    out[id] = (out[id] || 0) + v;
    total += v;
  }
  for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

// code: shares in percent, letter = category (see KEY). Order: largest first is not required.
const COUNTRY_SPEC = {
  CHN: 'n52 f22 b18 c5 m2 o1', IND: 'h79 m15 c2.5 s1.7 b0.8 o1', USA: 'c69 n24 j2 m1 h1 b1 o2', IDN: 'm87 c10 h1.7 b0.7 o0.6',
  PAK: 'm96.5 h2 c1.4 o0.1', NGA: 'm53 c46 f0.7 n0.3', BRA: 'c87 n8 o3 f2', BGD: 'm90 h9 b0.6 c0.4',
  RUS: 'c73 n15 m10 b0.5 o1.5', MEX: 'c90 n7 f1.5 o1.5', JPN: 'n57 b36 c1.5 o5.5', ETH: 'c63 m34 f3',
  PHL: 'c92 m6 f1 o1', EGY: 'm95 c5', COD: 'c95 m2 f2 n1', VNM: 'f45 n30 b16 c8 o1',
  IRN: 'm99.4 c0.3 o0.3', TUR: 'm98.5 n1 c0.3 o0.2', DEU: 'c66 n26 m6 o2', THA: 'b93 m5 c1.2 f0.5 n0.3',
  FRA: 'c60 n29 m9 j0.7 b0.7 o0.6', GBR: 'c52 n34 m7 h2 s0.8 j0.5 b0.5 o3.2', TZA: 'c61 m35 f3 n1', ZAF: 'c85 f5 n5.5 m2 h1.2 o1.3',
  ITA: 'c80 n14 m4.5 o1.5', MMR: 'b88 c6 m4.3 h0.5 f1.2', KEN: 'c85 m11 f2 n1.5 h0.5', COL: 'c90 n8 o2',
  KOR: 'n46 c29 b22 f1 o2', ESP: 'c68 n26 m4 o2', UGA: 'c85 m13 f1 o1', SDN: 'm91 c5 f3 n1',
  ARG: 'c80 n16 j0.5 m0.5 o3', DZA: 'm98.5 c0.5 n1', IRQ: 'm98 c1 o1', AFG: 'm99.7 h0.15 s0.15',
  POL: 'c88 n11 o1', UKR: 'c80 n17 m1 j0.3 o1.7', CAN: 'c66 n24 m4 h2 s1.5 b1.2 j0.7 o0.6', MAR: 'm99 n0.5 c0.3 j0.1 o0.1',
  SAU: 'm94 c3.5 h1.5 b0.5 o0.5', AGO: 'c94 f4 n1.5 m0.5', UZB: 'm96 c2.5 n1.5', PER: 'c93 n5 f0.5 o1.5',
  MYS: 'm63 b18 c9.5 h6 f2.5 n1', YEM: 'm99.2 h0.3 c0.4 o0.1', GHA: 'c71 m18 f5 n5 o1', MOZ: 'c55 m18 f7 n19 o1',
  NPL: 'h81 b9 m4.5 f3.1 c1.4 o1', MDG: 'c85 f5 m3 n6 o1', VEN: 'c89 n8 f1 o2', CIV: 'm42 c40 f8 n10',
  CMR: 'c70 m20 f5 n5', NER: 'm99.3 c0.4 f0.3', AUS: 'c49 n39 m3.4 h2.8 b2.6 s0.8 j0.4 o2', PRK: 'n71 f13 b4.5 c2 o9.5',
  TWN: 'f50 b21 n13 c5.5 o10.5', BFA: 'm63 c23 f13 n1', MLI: 'm95 c2.5 f2 n0.5', SYR: 'm93 c5 o1.5 n0.5',
  LKA: 'b70 h12.5 m9.7 c7.4 o0.4', MWI: 'c80 m13 f3 n3 o1', ZMB: 'c95 m0.6 f2.5 n1.5 o0.4', ROU: 'c95 n3 m0.4 o1.6',
  CHL: 'c70 n26 f1 o3', KAZ: 'm70 c26 n3 o1', ECU: 'c92 n6 o2', GTM: 'c93 n5 f1.5 o0.5',
  TCD: 'm55 c41 f3 n1', SOM: 'm99.6 c0.1 n0.2 o0.1', NLD: 'c42 n49 m5.5 h0.7 b0.5 j0.2 o2.1', SEN: 'm96 c3.7 f0.3',
  KHM: 'b96.5 m2 c0.5 f0.8 o0.2', ZWE: 'c85 f5 n7 m1 o2', GIN: 'm89 c10 f1', RWA: 'c93 m2 n4 f1',
  BEN: 'c48 m25 f22 n5', BDI: 'c93 m3 f2 n2', TUN: 'm99 c0.3 j0.1 n0.5 o0.1', BOL: 'c90 n6 f3 o1',
  BEL: 'c55 n36 m6.5 j0.4 b0.3 o1.8', HTI: 'c90 f6 n3.5 o0.5', JOR: 'm97 c2 o1', DOM: 'c87 n11 f1 o1',
  CUB: 'c62 n22 f14 o2', SSD: 'c60 f33 m6 n1', SWE: 'c50 n40 m8 o2', CZE: 'c32 n65 m0.3 o2.7',
  HND: 'c90 n8 f1 o1', GRC: 'c88 n6 m5 o1', AZE: 'm97 c2.2 n0.6 o0.2', PRT: 'c80 n17 m0.5 o2.5',
  PNG: 'c96 f3 o1', HUN: 'c70 n27 j0.3 m0.3 o2.4', TJK: 'm97 c1.5 n1 o0.5', BLR: 'c71 n27 m0.4 j0.2 o1.4',
  ISR: 'j74 m18 c2 o2 n4', ARE: 'm76 c9 h7 b3 n1 o4', AUT: 'c64 n25 m8 o3', TGO: 'c44 f33 m14 n8 o1',
  CHE: 'c62 n29 m6 h1 b0.5 j0.3 o1.2', SLE: 'm78 c20 f1.5 n0.5', LAO: 'b66 f30 c2 n1.5 o0.5', HKG: 'f44 n18 b14 c12 m4 h1 o7',
  NIC: 'c86 n11 f1 o2', SRB: 'c91 m3.5 n4 o1.5', LBY: 'm97 c2 n0.5 o0.5', BGR: 'c80 m13 n6 o1',
  PRY: 'c92 n4 f1 o3', KGZ: 'm88 c9 n2 o1', TKM: 'm93 c6 n1', SLV: 'c86 n11 o3',
  COG: 'c88 m2 f3 n6 o1', DNK: 'c66 n28 m5 o1', SVK: 'c78 n20 o2', SGP: 'b32 c19 n18 m15.5 h5.5 f8 o2',
  CAF: 'c88 m9 f2 n1', FIN: 'c66 n31 m1.5 o1.5', LBN: 'm66 c32 o2', NOR: 'c66 n25 m5 b1 h0.4 j0.1 o2.5',
  LBR: 'c85 m12 f2 n1', PSE: 'm97 c2 o1', NZL: 'c42 n47 h3 b2 m1.5 s0.6 j0.1 o3.8', CRI: 'c88 n10 o2',
  IRL: 'c80 n16 m1.5 o2.5', MRT: 'm99.7 c0.2 o0.1', OMN: 'm86 h5.5 c6 b1 o1.5', PAN: 'c88 n7 m0.8 b0.5 f1.5 o2.2',
  KWT: 'm75 c14 h7 b1 n1.5 o1.5', HRV: 'c90 n7 m1.5 o1.5', GEO: 'c85 m10 n3 o2', ERI: 'c62 m36 f1 n1',
  URY: 'c52 n40 f4 j0.3 o3.7', MNG: 'b53 n37 m3 c3 f3 o1', MDA: 'c92 n6 o2', PRI: 'c85 n12 f1 o2',
  BIH: 'm50 c46 n3 o1', ALB: 'm59 c17 n20 o4', JAM: 'c70 n21 f2 o7', ARM: 'c93 n4 o3',
  LTU: 'c85 n13 o2', GMB: 'm96 c3.5 f0.5', QAT: 'm66 h12 c13 b5 n1 o3', BWA: 'c79 f15 n5 o1',
  NAM: 'c90 f5 n4 o1', GAB: 'c82 m8 f4 n6', LSO: 'c90 f3 n6 o1', SVN: 'c70 n25 m3 o2',
  GNB: 'm46 c20 f30 n4', MKD: 'c64 m33 n2 o1', LVA: 'c75 n22 o3', XKX: 'm95 c3 n1 o1',
  GNQ: 'c88 f5 m4 n3', TTO: 'c62 h18 m5.5 f5 n6 o3.5', BHR: 'm75 c10 h9 b3 n1 o2', TLS: 'c97 m2 f0.5 o0.5',
  EST: 'c42 n52 m0.3 b0.5 o5.2', MUS: 'h48 c32 m17 b1 n1 o1', SWZ: 'c90 f3 n5 m1 o1', DJI: 'm97 c2 n1',
  FJI: 'c64 h28 m6 o2', CYP: 'c76 m18 n4 o2', COM: 'm98 c1 o1', GUY: 'c58 h24 m7 n4 f2 o5',
  BTN: 'b75 h22 f2 c0.5 o0.5', SLB: 'c96 f3 o1', MAC: 'f50 b17 n18 c8 m0.4 o6.6', LUX: 'c65 n28 m4 o3',
  MNE: 'c78 m19 n2 o1', SUR: 'c47 h21 m14 f8 n5 o5', CPV: 'c91 n7 o2', MLT: 'c90 n7 m2.5 o0.5',
  MDV: 'm99.9 o0.1',
};

/** code -> { religionId: share } (shares sum to 1) */
export const COUNTRY_RELIGION = Object.fromEntries(Object.entries(COUNTRY_SPEC).map(([k, v]) => [k, parse(v)]));

// Culture / language groups (names.js) whose religion differs a lot from their country as a whole. The key is the
// group; the value is a distribution, or { '*': distribution, CODE: distribution } when it depends on the country.
const GROUP_SPEC = {
  ha: 'm96 c2.5 f1 n0.5', ig: 'c96 f2 m1 n1', yo: 'c58 m38 f3 n1', fw: { '*': 'm97 c1.5 f1 n0.5', GNB: 'm75 c10 f13 n2', FRA: 'm90 c5 n5' },
  ur: 'm96 h2 c1 o1', ps_dari: 'm99.5 h0.25 s0.25', pa: { '*': 's58 h38 m2 c2', CAN: 's58 h20 m15 c5 n2', GBR: 's58 h20 m15 c5 n2' },
  ml: 'h56 m24 c19 o1', ta: { '*': 'h88 c6 m6', LKA: 'h80 c10 m10', MYS: 'h86 c8 m4 b2', SGP: 'h82 c10 m6 b2' }, te: 'h90 m5 c5', kn: 'h87 m9 c4',
  mr: 'h83 m8 b6 c1 o2', gu: 'h90 m7 o3', bn_hi: { '*': 'h81 m18 c0.5 o0.5', BGD: 'h80 m15 b3 c2' }, bn: { '*': 'm91 h8 b0.5 c0.5', GBR: 'm95 h4 c1', BGD: 'm95 h4 b0.6 c0.4', OMN: 'm85 h12 c3', BHR: 'm85 h12 c3' },
  hi: {
    '*': 'h92 m3 c1.5 s1.5 b1 o1', ARE: 'h82 m8 c8 s2', QAT: 'h84 m6 c8 s2', KWT: 'h82 m8 c8 s2', BHR: 'h85 m5 c8 s2', OMN: 'h84 m8 c6 s2',
    MUS: 'h86 m8 c5 o1', TTO: 'h82 m6 c10 o2', GUY: 'h80 m8 c10 o2', SUR: 'h80 m16 c3 o1', FJI: 'h82 m8 c8 o2', ZAF: 'h66 m18 c14 o2',
    KEN: 'h60 m20 c10 s5 o5', GBR: 'h60 m8 c6 s20 n6', USA: 'h66 m10 c10 s2 n8 j0 o4', CAN: 'h60 m10 c8 s14 n6 o2', AUS: 'h70 m8 c8 s3 n9 o2',
  },
  ne: { '*': 'h81 b9 m4.5 f3.1 c1.4 o1', QAT: 'h76 b9 c6 f7 o2', ARE: 'h76 b9 c6 f7 o2', KWT: 'h76 b9 c6 f7 o2', BHR: 'h76 b9 c6 f7 o2' },
  si: 'b87 m2 h6 c5', dz: 'b82 h16 f2', dv: 'm99.9 o0.1',
  ms: 'm99 c0.5 o0.5', id: { '*': 'm88 c9 h1.5 b0.7 o0.8', SUR: 'm92 c5 f2 o1', NLD: 'm60 c35 n4 o1', TLS: 'm70 c28 o2' },
  zh_hans: { '*': 'n50 f20 b18 c8 m2 o2', MYS: 'b55 f20 c15 n8 o2', SGP: 'b42 f14 c20 n22 o2', FJI: 'c60 b10 n25 f5', USA: 'n50 c20 b15 f10 o5', CAN: 'n50 c20 b15 f10 o5', AUS: 'n45 c20 b20 f10 o5', CHN: 'n52 f22 b18 c5 m2 o1' },
  vi: { '*': 'f40 n32 b16 c10 o2', USA: 'b35 c35 n20 f8 o2', AUS: 'b40 c30 n20 f8 o2', CAN: 'b35 c30 n25 f8 o2' },
  fil: { '*': 'c92 m5 f1 o2', ARE: 'c88 m8 f1 o3', KWT: 'c88 m8 f1 o3', QAT: 'c88 m8 f1 o3', BHR: 'c88 m8 f1 o3', SAU: 'c88 m8 f1 o3' },
  th: 'b95 m3 c1.2 f0.8', my: 'b88 c6 m4.3 h0.5 f1.2', km: 'b97 m1.5 c0.5 f1', lo: 'b67 f30 c2 n1',
  ar_gulf: { '*': 'm97 c1.5 h0.5 n1', COM: 'm99 c1' }, ar_levant: {
    '*': 'm92 c6 o2', USA: 'c55 m40 n3 o2', CAN: 'c50 m42 n6 o2', AUS: 'c55 m40 n3 o2', SWE: 'c50 m42 n6 o2', NOR: 'm60 c30 n8 o2', DNK: 'm80 c10 n8 o2',
    DEU: 'm88 c8 n3 o1', FRA: 'm80 c15 n4 o1', ISR: 'm82 c10 o8', IRQ: 'm98 c1 o1', SYR: 'm92 c6 o2', TUR: 'm97 c2 o1',
  },
  ar_maghreb: { '*': 'm98 c0.5 n1 o0.5', FRA: 'm88 c3 n9', BEL: 'm92 c2 n6', NLD: 'm92 c2 n6', ESP: 'm92 c3 n5', ITA: 'm92 c3 n5' },
  ar_nile: 'm94 c4 f1 n1', ku: 'm95 o3 c1 n1', fa: 'm99 c0.4 o0.6', tr: { '*': 'm98 n1.5 o0.5', DEU: 'm85 n10 c3 o2', AUT: 'm85 n10 c3 o2', NLD: 'm88 n8 c3 o1', CYP: 'm99 o1', BGR: 'm99 o1', MKD: 'm99 o1' },
  az: { '*': 'm97 c2 n1', GEO: 'm97 c2 n1' }, kk_ky: 'm92 c4 n3 o1', uz_tk: 'm96 c2 n2', tg: 'm98 n1 o1',
  he: 'j94 n4 c1 m0.5 o0.5', hy: 'c95 n3 m1 o1', ka: 'c92 m4 n3 o1',
  sq: { '*': 'm60 c20 n15 o5', MKD: 'm95 c3 n2', XKX: 'm95 c3 n1 o1', MNE: 'm70 c25 n5' },
  bs: 'm92 c3 n4 o1', sr: 'c92 m1 n5 o2', hr: 'c90 m1 n8 o1',
  sw: { '*': 'c60 m36 f3 n1', KEN: 'c60 m36 f3 n1', COM: 'm99 c1' }, ke: 'c83 m11 f3 n2 h1', so: 'm99.5 c0.2 n0.3', am: 'c70 m18 f2 o10', orm: 'm50 c40 f10', tig: 'c92 m8',
  rw: 'c93 m2 n4 f1', ug: 'c84 m14 f1 n1', ak: 'c78 m14 f4 n4', ow: 'c96 f2 n2', zu: 'c86 f5 n7 m1 o1', af_za: 'c92 n6 m1 o1', sn: 'c86 f6 n7 m1',
  cf: 'c73 m5 f20 n2', nil: 'c64 f33 m2 n1', lus: 'c60 m10 f26 n4', mg: 'c85 f5 m3 n6 o1', ht: 'c88 f8 n3 o1', carib: { '*': 'c76 f5 n10 h2 m2 o5', JAM: 'c70 n21 f2 o7', TTO: 'c70 f9 n10 m4 h2 o5', GBR: 'c76 n14 f2 o8', NLD: 'c60 n30 m3 o7' },
  mya: 'c88 f6 n5 o1', pac_pol: 'c92 n5 f1 o2', png: 'c96 f3 o1', fj: 'c90 m1 f5 n3 o1',
  pl: 'c90 n9 o1', ru: { '*': 'c70 n22 m6 o2', ISR: 'j50 c35 n10 m3 o2', KAZ: 'c62 n28 m8 o2', UZB: 'c70 n20 m8 o2', KGZ: 'c70 n20 m8 o2', TKM: 'c75 n20 m5', LVA: 'c55 n42 o3', EST: 'c40 n55 o5', UKR: 'c75 n22 m1 o2', BLR: 'c75 n23 o2', MDA: 'c85 n13 o2', FIN: 'c60 n38 o2', DEU: 'c55 n35 m5 j2 o3' },
  ua: 'c82 n16 m0.5 o1.5', bg: { '*': 'c80 m13 n6 o1', MKD: 'c85 m10 n4 o1' }, ro: 'c94 n4 m0.4 o1.6', hu: 'c60 n37 j0.5 o2.5',
};

const SKIP_NONE_ADJUST = new Set(['CHN', 'PRK', 'VNM', 'CUB', 'LAO', 'RUS', 'UKR', 'BLR', 'MDA', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'TJK', 'KGZ', 'MNG', 'ALB', 'BGR', 'CZE', 'SVK', 'HUN', 'POL', 'ROU', 'LTU', 'LVA', 'EST', 'HRV', 'SVN', 'SRB', 'BIH', 'MKD', 'MNE', 'XKX']);

/** group -> { '*': dist, CODE: dist } */
export const GROUP_RELIGION = Object.fromEntries(Object.entries(GROUP_SPEC).map(([g, v]) => {
  const m = typeof v === 'string' ? { '*': parse(v) } : Object.fromEntries(Object.entries(v).map(([k, d]) => [k, parse(d)]));
  return [g, m];
}));

/** The distribution a person of culture `group` born in `code` is drawn from (country default when the group has none). */
export function religionDist(code, group = null) {
  const g = group && GROUP_RELIGION[group];
  if (g) return g[code] || g['*'];
  return COUNTRY_RELIGION[code] || COUNTRY_RELIGION.USA;
}

/** Shift the "none" share with the era: fewer unaffiliated families in the past, more in the future (not in post-communist or atheist-state countries for the past). */
function eraAdjust(dist, era, code) {
  const f = era === 'past' ? (SKIP_NONE_ADJUST.has(code) ? 1 : 0.45) : era === 'future' ? 1.35 : 1;
  if (f === 1 || !dist.none) return dist;
  const out = { ...dist, none: dist.none * f };
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(out)) out[k] /= total;
  return out;
}

/**
 * Draw the family religion. `u` is a uniform number in [0, 1) (the engine passes a deterministic hash of the seed so that
 * the random stream of the life is not disturbed, and old saves can get a religion without changing anything else).
 */
export function drawReligion(code, group, era, u) {
  const dist = eraAdjust(religionDist(code, group), era, code);
  let r = u;
  let last = 'none';
  for (const id of RELIGION_IDS) {
    const p = dist[id] || 0;
    if (!p) continue;
    last = id;
    if (r < p) return id;
    r -= p;
  }
  return last;
}

/** The largest religion of a country (what "the neighbours" celebrate). */
export function majorityReligion(code) {
  const d = COUNTRY_RELIGION[code] || COUNTRY_RELIGION.USA;
  let best = 'none', bp = -1;
  for (const id of RELIGION_IDS) if ((d[id] || 0) > bp) { best = id; bp = d[id] || 0; }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Festivals and customs
// ---------------------------------------------------------------------------------------------

const LUNAR_COUNTRIES = new Set(['CHN', 'TWN', 'HKG', 'MAC', 'SGP', 'VNM', 'KOR', 'PRK']);
const ORTHODOX = new Set(['RUS', 'UKR', 'BLR', 'SRB', 'GRC', 'ROU', 'BGR', 'GEO', 'ARM', 'MDA', 'MKD', 'MNE', 'CYP', 'ETH', 'ERI']);
const TABASKI = new Set(['SEN', 'GMB', 'MLI', 'NER', 'MRT', 'BFA', 'GIN', 'TCD', 'SLE', 'GNB']);
const NEW_YAM = new Set(['NGA', 'GHA', 'BEN', 'TGO', 'CIV', 'CMR', 'LBR', 'SLE', 'GIN', 'GNB', 'GMB']);
const WESTERN_XMAS_REGIONS = new Set(['EUR', 'NAM', 'OCE', 'LAC']);

/**
 * The main yearly festival of a tradition for somebody whose family comes from `code` (region `region`).
 * Returns { name, key, dish, place } where `key` is a stable id ('lunar', 'christmas', 'easter', 'eid', 'tabaski', 'diwali',
 * 'dashain', 'galungan', 'songkran', 'khmer_ny', 'vesak', 'tshechu', 'tsagaan', 'newyear_jp', 'newyear', 'xmas_secular', 'newyam', 'harvest', 'pesach',
 * 'vaisakhi') and `dish` a short phrase for the table.
 */
export function festivalFor(religion, code, region) {
  const lunar = LUNAR_COUNTRIES.has(code);
  const R = religion;
  if (R === 'christian') {
    if (ORTHODOX.has(code)) return { name: '復活節', key: 'easter', dish: '彩蛋和甜麵包' };
    const dish = region === 'LAC' ? '玉米粽和熱甜飲' : region === 'SSA' ? '大鍋飯和烤肉' : region === 'SEA' || region === 'EAS' ? '家人一桌熱騰騰的菜' : '烤肉和一桌甜點';
    return { name: '聖誕節', key: 'christmas', dish };
  }
  if (R === 'muslim') {
    if (TABASKI.has(code)) return { name: '宰牲節', key: 'tabaski', dish: '分食的羊肉' };
    return { name: '開齋節', key: 'eid', dish: '甜點與一桌佳餚' };
  }
  if (R === 'hindu') {
    if (code === 'NPL' || code === 'BTN') return { name: '德賽節', key: 'dashain', dish: '節日的肉食與甜點' };
    if (code === 'IDN') return { name: '加隆岸節', key: 'galungan', dish: '祭品與米糕' };
    return { name: '排燈節', key: 'diwali', dish: '甜點和炸點心' };
  }
  if (R === 'sikh') return { name: '瓦薩基節', key: 'vaisakhi', dish: '寺裡分送的食物' };
  if (R === 'jewish') return { name: '逾越節', key: 'pesach', dish: '無酵餅和節慶晚宴' };
  if (R === 'buddhist') {
    if (code === 'THA') return { name: '潑水節', key: 'songkran', dish: '糯米點心' };
    if (code === 'MMR') return { name: '潑水節', key: 'songkran', dish: '米糕和甜湯' };
    if (code === 'LAO') return { name: '寮國新年', key: 'songkran', dish: '糯米飯' };
    if (code === 'KHM') return { name: '柬埔寨新年', key: 'khmer_ny', dish: '糯米糕和椰奶點心' };
    if (code === 'LKA') return { name: '衛塞節', key: 'vesak', dish: '素食與米粥' };
    if (code === 'BTN') return { name: '節慶法會', key: 'tshechu', dish: '奶茶和紅米' };
    if (code === 'MNG') return { name: '白節', key: 'tsagaan', dish: '奶製品和蒸餃' };
    if (code === 'JPN') return { name: '新年', key: 'newyear_jp', dish: '年菜與年糕' };
    if (lunar || code === 'MYS') return { name: '農曆新年', key: 'lunar', dish: '年夜飯' };
    return { name: '衛塞節', key: 'vesak', dish: '素食' };
  }
  if (R === 'folk') {
    if (lunar || code === 'MYS') return { name: '農曆新年', key: 'lunar', dish: '年夜飯' };
    if (NEW_YAM.has(code)) return { name: '新薯節', key: 'newyam', dish: '剛收成的山藥' };
    if (region === 'LAC') return { name: '家族的聖人節', key: 'harvest', dish: '一桌家傳的菜' };
    return { name: '豐收節', key: 'harvest', dish: '新收成的穀物' };
  }
  // none / other: the national or family holiday of the place
  if (lunar) return { name: '農曆新年', key: 'lunar', dish: '年夜飯' };
  if (code === 'JPN') return { name: '新年', key: 'newyear_jp', dish: '年菜與年糕' };
  if (code === 'MNG') return { name: '白節', key: 'tsagaan', dish: '奶製品和蒸餃' };
  if (code === 'RUS' || code === 'UKR' || code === 'BLR' || code === 'MDA' || code === 'KAZ') return { name: '新年', key: 'newyear', dish: '沙拉和香檳' };
  if (WESTERN_XMAS_REGIONS.has(region)) return { name: '聖誕節', key: 'xmas_secular', dish: '一桌家人做的菜' };
  return { name: '新年', key: 'newyear', dish: '一桌家人做的菜' };
}

/** The word for a place of worship / gathering for a tradition ('' for none). */
export function worshipPlace(religion, code) {
  switch (religion) {
    case 'christian': return '教堂';
    case 'muslim': return '清真寺';
    case 'hindu': return '神廟';
    case 'buddhist': return code === 'JPN' || code === 'KOR' || code === 'TWN' || code === 'CHN' || code === 'HKG' || code === 'VNM' ? '寺廟' : '佛寺';
    case 'folk': return '廟';
    case 'jewish': return '猶太會堂';
    case 'sikh': return '錫克教寺廟';
    default: return '';
  }
}

// ---------------------------------------------------------------------------------------------
// Festival scenes: what the family's main festival looks like, by kind of person ('child' < 13, 'adult', 'elder' >= 65).
// Texts say nothing about the person's partner, children or job, so they fit any life; the engine adds a sentence when the
// person lives abroad (h.festivalScene).
// ---------------------------------------------------------------------------------------------

const REGION_OF = (region, ...rs) => rs.includes(region);

const SCENES = {
  lunar: {
    child: (code) => (code === 'KOR' || code === 'PRK'
      ? '新年的早晨，你穿上乾淨的新衣，向長輩跪著行大禮，換來一個個紅包和一碗熱騰騰的年糕湯。大人說吃了這碗湯就又長了一歲，你便認真地把湯喝得一滴不剩。'
      : code === 'VNM'
        ? '年關將近，家裡煮了一大鍋粽子，整夜守著柴火，你聽著大人說故事，聽到一半就睡著了。大年初一你穿上新衣，領到裝著新鈔的紅封套，院子裡的桃花或金桔開得正好。'
        : '除夕夜，全家人圍著大圓桌吃年夜飯，長輩輪流把紅包塞進你手裡。你一邊說著背熟的吉祥話，一邊偷偷算今年有多少，睡前把紅包壓在枕頭底下，睡得特別香。'),
    adult: (code) => (code === 'KOR' || code === 'PRK'
      ? '新年前夕，高速公路上擠滿返鄉的車，你在車陣裡慢慢挪了好幾個小時。到了老家，晚輩依序向長輩行大禮，桌上的年糕湯冒著熱氣，長輩照例問起你的近況。'
      : code === 'VNM'
        ? '年關到了，市場裡擠滿買桃花、金桔與粽葉的人。你回到老家幫忙包粽子，大年初一向長輩拜年、領到祝福，初二開始一家家串門，年味浸在每條巷子裡。'
        : '年底，你擠過滿滿的人潮回到老家。年夜飯的桌上多了幾張新面孔，少了幾個熟悉的座位；長輩們照舊問起你的近況，你笑著應付，心裡卻慶幸這一年還能坐在同一張桌子旁。'),
    elder: () => '年夜飯桌上，你被請坐在最上首，晚輩輪流向你敬茶、說吉祥話。你把準備好的紅包一個個發出去，看著他們拆開時的笑臉，忽然覺得這一年也值得了。',
  },
  eid: {
    child: (code, region) => (REGION_OF(region, 'SEA')
      ? '開齋節前，路上擠滿了返鄉的車潮。你跟著大人回到外婆家，大家互相請求原諒，孩子們排隊領節日的紅包，桌上有椰漿飯和糯米糕，你吃到肚子圓滾滾。'
      : REGION_OF(region, 'SAS')
        ? '開齋節前夜，鄰居阿姨在你的掌心畫上指甲花的紋樣，你整晚捨不得握拳。隔天一早穿新衣去禮拜，回家後長輩給你節日的零用錢，奶香的甜點總是吃不完。'
        : '開齋節的早晨，你穿上新衣，跟著大人一起去禮拜。回家後長輩發給你節日的零用錢，餐桌上擺滿了只在這天才吃得到的甜點，你吃到嘴角黏黏的。'),
    adult: () => '齋月結束，開齋節的早晨你換上最好的衣服去禮拜，路上遇到的人都互相道賀。回到家，一桌佳餚和串門的親友讓屋子暖烘烘的，你把整個月的疲憊都留在昨天。',
    elder: () => '開齋節的早晨，晚輩們一個接一個來向你問安，你把準備好的節日錢分給孩子們。你坐在最舒服的位子上，聽屋裡的笑聲此起彼落，覺得該做的事你大多都做完了。',
  },
  tabaski: {
    child: () => '宰牲節的前幾天，院子裡拴了一隻準備過節的羊，你天天去看牠、替牠餵草。節日當天你穿上新衣，跟著大人去禮拜，回家後家家戶戶都把肉分給鄰居和窮人。',
    adult: () => '宰牲節前，你四處打聽羊的價錢，最後還是想辦法買了一隻。節日的早晨，一家人穿上新衣去禮拜，回來把肉分成好幾份，一份送鄰居，一份留給最需要的人。',
    elder: () => '宰牲節這天，晚輩們帶著衣料與羊肉來看你，院子裡擠滿了人。你坐在樹蔭下，看他們分肉、煮飯、笑鬧，把這一天一點一點收進記憶裡。',
  },
  diwali: {
    child: () => '排燈節的夜裡，窗台和門口點滿了小油燈，地上用彩粉畫出圖案。你和表兄弟姊妹在巷子裡放小煙火，吃甜點吃到走不動，最後躺在涼涼的石階上，看天上忽明忽暗。',
    adult: () => '排燈節前，你把家裡裡外外打掃了一遍，在門前點亮油燈、畫上彩粉圖案。晚上親友互相拜訪、交換甜點，鞭炮聲從巷口響到深夜，你站在門前，覺得整條街都亮了。',
    elder: () => '排燈節的夜裡，你坐在門口，看晚輩們點亮一盞又一盞油燈。有人把甜點遞到你手上，你慢慢吃著，想起自己小時候也這樣在門前畫過彩粉，笑了。',
  },
  dashain: {
    child: () => '德賽節那幾天，院子裡的竹鞦韆從清晨蕩到天黑，天上飄滿風箏。最後一天，長輩在你額頭點上紅色的吉祥點，把一小撮麥苗別在你耳邊，再塞給你一張新鈔票。',
    adult: () => '德賽節前，你搭上擠滿人的車回到老家。長輩把紅色的吉祥點與麥苗一一為晚輩點上，屋子裡煮著節日的肉，天空飄著風箏。你排隊接受祝福時，忽然很想念小時候。',
    elder: () => '德賽節這天，晚輩們排著隊來向你領吉祥點。你一個一個為他們點在額頭、祝福平安，並把早就準備好的新鈔票遞出去。紅色的點、笑聲和風箏，都和你小時候的一樣。',
  },
  galungan: {
    child: () => '加隆岸節的街邊，家家戶戶門口都立起長長彎彎的竹竿，掛滿椰葉與供品。你穿上新衣，跟著大人帶著水果與花去廟裡祈福，回家後吃到只在這天才有的米糕。',
    adult: () => '加隆岸節前，你和家人一起做供品、立起竹竿。節日當天，一家人穿上傳統服飾去廟裡，把花與水果獻給祖先的靈，也為這一年的平安道謝。',
    elder: () => '加隆岸節，晚輩們一早就來接你去廟裡祈福。你把花輕輕放在供盤上，閉上眼睛，替每一個孩子在心裡念了一遍名字。',
  },
  christmas: {
    child: (code, region) => (REGION_OF(region, 'LAC')
      ? '平安夜，家人直到午夜才開飯。你撐著眼皮等到零點，在鞭炮聲和擁抱之間被親戚輪流親了好幾次，最後迷迷糊糊地在沙發上睡著，被蓋上了三條毯子。'
      : REGION_OF(region, 'EUR', 'NAM', 'OCE')
        ? '聖誕節的早晨你比誰都早醒，赤腳衝到客廳。包裝紙撕了一地，你卻最愛家人織的那件醜毛衣，一直穿到發臭，直到大人趁你睡著偷偷拿去洗。'
        : REGION_OF(region, 'SSA')
          ? '聖誕節那天，全家人穿上最好的衣服去教堂，歌聲大得連院子外都聽得見。回家後大鍋飯香氣四溢，遠方的親戚都回來了，你在孩子堆裡玩到被誰抱回床上都不知道。'
          : code === 'PHL' || REGION_OF(region, 'SEA')
            ? '十二月一到，街上掛滿了五顏六色的燈籠。平安夜你跟著家人去做彌撒，回家後一桌熱騰騰的菜擺到半夜，大人聊著天，你靠在長輩的膝蓋上睡著了。'
            : '聖誕節是你們家一年裡最安靜也最溫暖的日子。你跟著家人去教堂，唱完詩歌，回家一起吃飯、交換小禮物。外面的世界照常運轉，你卻覺得屋子裡特別亮。'),
    adult: (code, region) => (REGION_OF(region, 'LAC')
      ? '平安夜，全家人擠在一張長桌旁，大人聊到午夜才擁抱、乾杯。你負責把熱的菜端出來，聽著老家那幾首聖誕老歌，覺得今年也算平安。'
      : REGION_OF(region, 'EUR', 'NAM', 'OCE')
        ? '聖誕節那天，家人從各地趕回來，屋子裡擠滿了人，烤爐一直沒停。大家交換禮物、唱舊歌，有人偷偷在廚房吃掉了一半的甜點，被抓到時笑得比誰都大聲。'
        : REGION_OF(region, 'SSA')
          ? '聖誕節的早晨，教堂裡擠滿了穿著節日盛裝的人，歌聲一波一波往上疊。禮拜結束，大家在門口互相道賀，回家把一鍋鍋菜端上桌，遠近的親友輪流來串門。'
          : '聖誕節那天，你和家人去教堂，唱完詩歌後一起吃了一頓長長的飯。大家交換小禮物，聊著這一年的事，窗外的世界照常運轉，屋子裡卻特別溫暖。'),
    elder: () => '聖誕節這天，晚輩們從各地回來，把你的椅子留在最靠近暖光的位置。你聽他們唱走音的詩歌，替他們一個一個禱告、祝福，直到所有人都在屋子裡睡著。',
  },
  xmas_secular: {
    child: () => '聖誕假期，家裡的樹上掛滿了閃閃發亮的小燈。沒有人特別提起宗教，大家只是一起烤東西、拆禮物。你最期待的是全家人難得同時在家的那幾天。',
    adult: () => '聖誕假期，家人從各地回來，在同一張桌子上吃飯、拆禮物，沒有誰特別提起宗教，只是樹上的燈亮著，屋子裡暖暖的。你發現自己其實很想念這種吵吵鬧鬧的感覺。',
    elder: () => '聖誕假期，晚輩們把你的家擠得滿滿的。你不太信那些儀式，卻喜歡這幾天：燈亮著、飯香著、每個人都肯坐下來陪你說一會兒話。',
  },
  easter: {
    child: () => '復活節前的夜裡，家人帶你去教堂，每個人手裡舉著一支蠟燭。午夜鐘聲一響，大人互相說「基督復活了」，你把染紅的彩蛋輕輕敲一敲，吃到了第一口甜麵包。',
    adult: () => '復活節前夜，你和家人站在人群裡，手裡的蠟燭一支接一支被點亮。回家後一桌豐盛的菜擺到天亮，長輩把染紅的蛋遞給你，你輕輕敲碎，說了一聲祝福。',
    elder: () => '復活節的清晨，你被晚輩們攙著去教堂。蠟燭的光在牆上搖晃，你聽著熟悉的聖歌，把染紅的蛋放在手心，想起自己小時候也這樣敲過蛋。',
  },
  songkran: {
    child: () => '新年那幾天，街上到處是水桶和笑聲。你先替家裡的長輩輕輕灑水祈福，下一秒就被朋友淋得全身濕透，大家笑得站不直，連路過的陌生人也被拉進戰局。',
    adult: () => '新年回鄉，你先跟著家人去寺裡供養僧人，再用香水替長輩洗手祈福。午後街上的水戰開打，你被潑得全身濕透，卻是這一年笑得最大聲的時候。',
    elder: () => '新年那幾天，晚輩們輪流來替你灑水、洗手，祈求你平安。你坐在門口的涼椅上，讓他們把水倒在你的手上，聽街上的歡呼聲，臉上的皺紋全舒開了。',
  },
  khmer_ny: {
    child: () => '新年到了，家人帶你去寺裡供養僧人，院子裡堆起一座座沙堆。你和堂兄弟姊妹玩著傳統的遊戲，直到天黑，大人把糯米糕分給所有的孩子，笑聲繞著佛塔轉了一圈又一圈。',
    adult: () => '柬埔寨新年，你回鄉和家人一起打掃、供養僧人，再用香水替長輩洗手祈福。夜裡廣場上有人唱歌、有人跳舞，你跟著人群走了很長一段路。',
    elder: () => '新年這幾天，晚輩們帶著食物與香水來看你，你坐在屋前，由他們輪流為你洗手祈福。你替每個人在心裡念了一句祝福，耳邊是院子裡孩子們的笑聲。',
  },
  vesak: {
    child: () => '衛塞節的夜裡，寺院前點起無數盞燈，人們靜靜地繞著佛塔。你捧著蓮花與小小的燈，跟著大人一起供養，回家後吃到只在這天才有的素食。',
    adult: () => '衛塞節那晚，你和家人去寺裡點燈、供花，街上掛滿了燈籠，路邊有人免費分送食物與茶水。你在人群中慢慢走，心裡忽然變得很安靜。',
    elder: () => '衛塞節的夜裡，你被晚輩們帶到寺院前，坐在石階上看燈火一盞一盞亮起來。你雙手合十，不求什麼，只是覺得這一生走到這裡，心很平靜。',
  },
  tshechu: {
    child: () => '廣場上戴著面具的舞者跳了整整一天，鼓聲和長號低低地迴響。你穿上最好的衣服，被長輩帶去排隊接受祝福，手裡抓著一把炒米，邊看邊吃。',
    adult: () => '節慶法會的幾天，你和家人穿上傳統服飾，坐在廣場邊看舞者戴著面具轉圈。有人遞來奶茶和紅米飯，你接過來，一邊吃一邊看，覺得時間也慢了下來。',
    elder: () => '法會這幾天，你被晚輩攙著坐在廣場最前排。面具舞者轉過身來，你雙手合十，替每個孩子在心裡默默祝福，覺得自己什麼都不缺了。',
  },
  tsagaan: {
    child: () => '白節的清晨，你學著大人的樣子向長輩行問安禮，雙手托著他們的手肘，領到一小份祝福和禮物。桌上疊著層層的奶酥、蒸餃和肉，你一整天都在串門子，吃到走不動。',
    adult: () => '白節那幾天，你一家一家地拜年、行問安禮，桌上永遠擺著奶製品、蒸餃和牛羊肉。長輩們一邊勸你多吃一點，一邊問起這一年的事，屋子裡暖烘烘的。',
    elder: () => '白節的清晨，晚輩們排隊向你行問安禮，你一個一個握住他們的手肘，說著祝福的話。桌上疊滿了奶酥和蒸餃，你看著他們吃，比自己吃還滿足。',
  },
  newyear_jp: {
    child: () => '新年的清晨，全家人圍著年菜，再到神社或寺院排隊參拜，手裡握著熱飲。你最在意的是壓歲錢，大人則悄悄許下新一年的願望，而那個願望通常只有四個字：平平安安。',
    adult: () => '新年前夕，家裡大掃除、準備年菜，電視裡傳來除夕的鐘聲。元旦一早你和家人去參拜，在人潮裡許下新一年的願望，回家後端起一碗熱騰騰的年糕湯。',
    elder: () => '新年的清晨，晚輩們圍著你吃年菜，你替孩子們各包一個壓歲錢。你在心裡把一年的事從頭數了一遍，覺得大多數都值得感謝。',
  },
  newyear: {
    child: () => '新年夜，家人圍著桌子吃飯、倒數。你努力撐著眼皮，午夜一過，大家互相擁抱、說新年快樂，窗外零零星星有人在放煙火，你許下的願望，和去年的有一半一樣。',
    adult: () => '新年夜，你和家人圍著桌子吃飯、倒數。午夜一過，大家互相擁抱、說新年快樂，窗外零零星星有人在放煙火。你許了個願，和去年的有一半一樣。',
    elder: () => '新年夜，晚輩們陪你吃了一頓長長的飯。午夜的鐘聲響起，你舉起杯子，對每一個人說了新年快樂，心裡想的卻是：明年，還能這樣坐在一起就好。',
  },
  newyam: {
    child: () => '新薯節那天，全村人聚在空地上，第一批山藥先獻給祖先，然後才分給大家。你看著大人們跳舞、擊鼓，在一旁啃著剛烤好的山藥，嘴角沾滿了灰。',
    adult: () => '新薯節到了，你回到老家，和親族一起把第一批新收成的山藥獻給祖先，再分食。鼓聲和歌聲響了一整天，長輩們說起家族的事，你站在人群裡，一個字也捨不得漏。',
    elder: () => '新薯節那天，族人把第一份新收成的山藥端到你面前，請你說祝福的話。你站起來，對祖先和大家說了一段簡短的感謝，鼓聲便響了起來。',
  },
  harvest: {
    child: () => '村裡一年一度的節慶到了，鼓聲與歌聲從傍晚響到深夜。大家穿上最好的衣服，帶著自家的菜聚在廣場，連平常不太說話的人也站起來跳舞。你被拉進圈子裡，轉得頭都暈了。',
    adult: () => '村裡一年一度的節慶到了，鼓聲與歌聲從傍晚響到深夜。大家穿上最好的衣服，帶著自家的菜聚在一起，向祖先和土地道謝。連平常不太說話的人也站起來跳舞。',
    elder: () => '節慶的夜裡，大家請你坐在最好的位置。你看著年輕人在火光裡跳舞，想起自己年輕時的舞步，笑著跟著打起了拍子。',
  },
  pesach: {
    child: () => '逾越節的晚宴，餐桌上擺著無酵餅、苦菜和一個放了許多東西的盤子。你最小，所以由你背誦那四個問題，背到一半卡住，全桌的大人都笑著替你接下去。',
    adult: () => '逾越節的晚宴，一家人圍著長桌，輪流朗讀古老的故事，酒杯一次又一次被斟滿。有人唱走了調，有人又問了一遍老問題，你覺得這個夜晚像是被好幾代人一起握著的。',
    elder: () => '逾越節的晚宴上，晚輩們請你坐在主位，由你領大家念故事。你念得很慢，孩子們聽得很認真，你忽然明白，這些話你已經說了一輩子，也還沒有說完。',
  },
  vaisakhi: {
    child: () => '瓦薩基節那天，錫克教寺廟裡擠滿了人，大家一起坐在地上吃免費的飯。你跟著大人洗碗、發水，遊行的隊伍從街頭走到街尾，鼓聲震得胸口發麻。',
    adult: () => '瓦薩基節那天，你和家人早早去寺廟，在公共廚房幫忙揉麵、洗菜，再坐在地上和陌生人一起吃飯。遊行的隊伍從街上走過，鼓聲和歌聲一路不斷。',
    elder: () => '瓦薩基節，晚輩們陪你到寺廟，你在長椅上坐了一整個上午，聽誦經，看年輕人在廚房忙進忙出。他們端來的那碗飯，吃起來和你年輕時一樣暖。',
  },
};

/** The text of the family's festival for a kind of person ('child' | 'adult' | 'elder'); '' when there is none. */
export function festivalScene(info, homeCode, region, kind) {
  const sc = SCENES[info.key] || SCENES.newyear;
  const f = sc[kind] || sc.adult;
  return f(homeCode, region);
}
