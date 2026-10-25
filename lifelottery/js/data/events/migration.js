// Events about moving: from village to city, abroad for work or study, visas, remittances, culture shock,
// discrimination, homesickness, return migration and fleeing conflict.
// Ids start with `migration_` (the shared test requires this prefix). Flags start with `m_`.
//
// Destination choice
//   Every h.migrate() in this file goes through pickDest(): a weighted draw from plausible corridors for the
//   person's HOME country (labour, skilled, study, refuge), falling back to a regional default. Tables are
//   compact strings "CODE:weight ...". They describe real migration patterns in broad strokes (language,
//   history, geography, labour demand) and are only used for flavour and plausibility, never as a judgement.
//   Codes that are not in countries.js or equal to the current country are dropped before drawing.
//
// Chains: village -> city first year | recruiter -> contract life -> contract end | student visa -> after
//   graduation | skilled points -> visa result | company transfer -> expat life | flight -> camp -> asylum
//   hearing -> new start | irregular route -> papers limbo | remittance -> family joins / fruit |
//   credentials -> result | return decision -> readjust + business.
//
// Who comes along (Phase 6B)
//   Every move says who goes with the person: { with: 'alone' | 'partner' | 'family' | 'refugee' | 'keep' } (see
//   systems.js depart()). Labour and study migration is alone (the partner and the children stay with each other,
//   the grandparents or relatives), skilled visas and company transfers bring the family, refugees take whoever lives
//   with them. The engine schedules `migration_apart_first_year` when somebody is left behind and
//   `migration_return_reunion` when the family is together again; `migration_family_joins` is the reunion (the
//   system schedules it too, from the second year apart). Left-behind moments: missed birthday on a video call,
//   a remittance that pays the school fees, a parent in hospital far away, a couple who live in two countries.

import { BY_CODE } from '../countries.js';

// ---------------------------------------------------------------------------------------------
// Corridor tables
// ---------------------------------------------------------------------------------------------

const LABOR = {
  by: {
    MEX: 'USA:9 CAN:1', GTM: 'USA:8 MEX:1', HND: 'USA:7 ESP:1 MEX:1', SLV: 'USA:8 CAN:1', NIC: 'CRI:6 USA:3 ESP:1',
    HTI: 'DOM:5 USA:3 CAN:1 BRA:1 FRA:1', DOM: 'USA:7 ESP:2 PRI:1', CUB: 'USA:5 ESP:3 MEX:1 PAN:1', COL: 'USA:3 ESP:3 ECU:1 PAN:1 CHL:1',
    VEN: 'COL:5 ESP:2 USA:2 PER:2 CHL:2 ARG:1', PER: 'CHL:3 ARG:2 ESP:2 USA:2 JPN:1', BOL: 'ARG:4 BRA:2 ESP:2 CHL:2', PRY: 'ARG:4 ESP:2 BRA:2',
    ECU: 'ESP:4 USA:3 CHL:1', BRA: 'USA:3 PRT:3 JPN:2 GBR:1 ESP:1', ARG: 'ESP:3 USA:2 ITA:1', JAM: 'USA:4 GBR:3 CAN:3',
    IND: 'ARE:4 SAU:3 QAT:2 USA:2 GBR:2 CAN:2 KWT:1 SGP:1 OMN:1 AUS:1', PAK: 'SAU:5 ARE:4 GBR:2 OMN:1 QAT:1 KWT:1 USA:1 CAN:1',
    BGD: 'SAU:4 ARE:3 MYS:3 QAT:2 OMN:2 KWT:1 ITA:1 SGP:1 GBR:1', NPL: 'QAT:4 MYS:3 ARE:3 SAU:2 KWT:1 KOR:1 JPN:1',
    LKA: 'KWT:2 QAT:2 SAU:2 ARE:2 ITA:1 GBR:1 AUS:1 CAN:1', AFG: 'IRN:4 PAK:3 TUR:2 DEU:2 ARE:1',
    PHL: 'SAU:3 ARE:3 USA:3 SGP:2 HKG:2 CAN:1 JPN:1 ITA:1 AUS:1 QAT:1 KWT:1 TWN:1 KOR:1', IDN: 'MYS:4 SAU:3 TWN:2 HKG:2 SGP:2 KOR:1 JPN:1 ARE:1',
    VNM: 'JPN:3 KOR:3 TWN:3 USA:1 AUS:1 DEU:1 MYS:1', MMR: 'THA:5 MYS:3 SGP:1 KOR:1 JPN:1', KHM: 'THA:5 KOR:2 MYS:1 JPN:1', LAO: 'THA:6 KOR:1',
    THA: 'TWN:2 KOR:2 JPN:1 SGP:1 ISR:1 AUS:1 USA:1', MYS: 'SGP:4 AUS:1 GBR:1 USA:1 HKG:1', TLS: 'AUS:2 KOR:2 GBR:2 IRL:1',
    CHN: 'USA:3 CAN:2 AUS:2 JPN:2 SGP:2 GBR:1 KOR:1', KOR: 'USA:4 CAN:2 AUS:2 JPN:1 GBR:1', JPN: 'USA:3 AUS:2 CAN:2 GBR:1 SGP:1',
    TWN: 'USA:4 JPN:2 CAN:2 AUS:2 CHN:1 SGP:1 GBR:1', HKG: 'CAN:3 GBR:3 AUS:3 USA:2 TWN:2 SGP:1', MNG: 'KOR:5 JPN:2 USA:1 CZE:1 DEU:1',
    UZB: 'RUS:6 KAZ:3 KOR:2 TUR:1', TJK: 'RUS:8 KAZ:1', KGZ: 'RUS:7 KAZ:2 KOR:1 TUR:1', KAZ: 'RUS:3 DEU:1 USA:1 KOR:1', AZE: 'RUS:4 TUR:2 DEU:1', TKM: 'RUS:3 TUR:3 KAZ:1',
    EGY: 'SAU:4 ARE:3 KWT:2 QAT:1 LBY:1 USA:1 ITA:1 GBR:1', MAR: 'FRA:5 ESP:4 ITA:3 NLD:1 BEL:1 DEU:1 CAN:1', TUN: 'FRA:5 ITA:3 DEU:2 CAN:1',
    DZA: 'FRA:5 CAN:2 ESP:1 ITA:1', LBN: 'ARE:3 SAU:2 FRA:2 USA:1 CAN:1 AUS:1 QAT:1 DEU:1', JOR: 'SAU:3 ARE:3 QAT:2 KWT:1 USA:1 CAN:1',
    PSE: 'JOR:2 ARE:2 SAU:1 USA:1 DEU:1', SYR: 'TUR:4 DEU:3 LBN:2 JOR:2 SWE:2 NLD:1', IRQ: 'TUR:3 JOR:2 SWE:2 DEU:2 USA:1 ARE:1',
    IRN: 'TUR:3 ARE:2 CAN:2 DEU:2 USA:2 GBR:1 AUS:1 SWE:1', YEM: 'SAU:6 OMN:2 ARE:1 DJI:1', TUR: 'DEU:6 NLD:1 FRA:1 AUT:1 GBR:1 USA:1 SAU:1', LBY: 'TUN:2 TUR:2 EGY:2 ITA:1 GBR:1',
    NGA: 'GBR:3 USA:3 CAN:2 ARE:1 ZAF:1 DEU:1 GHA:1', GHA: 'GBR:3 USA:3 DEU:1 CAN:1 ARE:1 CIV:1 NGA:1', KEN: 'ARE:3 USA:2 GBR:2 SAU:2 CAN:1 AUS:1 UGA:1 TZA:1',
    ETH: 'SAU:4 ARE:2 USA:2 KEN:1 DJI:1 KWT:1 QAT:1', UGA: 'KEN:2 ARE:2 SAU:2 GBR:1 USA:1 QAT:1', TZA: 'KEN:2 ARE:2 ZAF:1 GBR:1 SAU:1 USA:1',
    SDN: 'SAU:3 EGY:2 ARE:1 TCD:1 UGA:1 QAT:1', SOM: 'KEN:3 ETH:2 GBR:2 USA:2 SWE:1 CAN:1 ARE:1', ERI: 'SDN:2 ETH:1 GBR:1 SWE:1 DEU:1 USA:1',
    SSD: 'UGA:4 KEN:3 ETH:2 SDN:1', COD: 'UGA:3 ZAF:2 RWA:1 BEL:1 FRA:1 ZMB:1 AGO:1', RWA: 'UGA:2 KEN:2 BEL:1 USA:1 CAN:1', BDI: 'TZA:3 RWA:1 UGA:1 BEL:1',
    SEN: 'FRA:4 ESP:2 ITA:2 USA:1 MRT:1', MLI: 'CIV:4 FRA:3 SEN:1 ESP:1 GAB:1', BFA: 'CIV:6 GHA:2 FRA:1 ITA:1', NER: 'NGA:3 LBY:2 DZA:1 FRA:1',
    GIN: 'FRA:2 SEN:1 CIV:1 USA:1', LBR: 'USA:3 GHA:1 CIV:1 GBR:1', SLE: 'GBR:3 USA:2 GIN:1', CMR: 'FRA:3 DEU:2 USA:2 CAN:1 GAB:1 GNQ:1', CIV: 'FRA:4 USA:1 GHA:1',
    ZWE: 'ZAF:6 BWA:2 GBR:2 AUS:1 USA:1', ZMB: 'ZAF:3 GBR:2 USA:1 BWA:1 NAM:1', MWI: 'ZAF:5 TZA:1 GBR:1 MOZ:1', MOZ: 'ZAF:7 PRT:1', LSO: 'ZAF:9', SWZ: 'ZAF:8',
    AGO: 'PRT:4 BRA:1 ZAF:1 NAM:1', MDG: 'FRA:4 MUS:2', ZAF: 'GBR:3 AUS:3 USA:2 NZL:2 CAN:1 ARE:1', BWA: 'ZAF:2 GBR:1 AUS:1', NAM: 'ZAF:3 GBR:1 DEU:1',
    POL: 'DEU:4 GBR:3 NLD:1 NOR:1 IRL:1 USA:1', ROU: 'ITA:4 ESP:3 DEU:3 GBR:2 AUT:1 FRA:1', BGR: 'DEU:3 GBR:2 ESP:1 GRC:1 NLD:1 BEL:1', HUN: 'DEU:3 AUT:3 GBR:2 CHE:1 NLD:1',
    CZE: 'DEU:3 GBR:2 AUT:2 IRL:1 NLD:1', SVK: 'CZE:3 DEU:2 GBR:2 AUT:2 IRL:1', LTU: 'GBR:3 IRL:2 DEU:2 NOR:2 SWE:1', LVA: 'GBR:3 IRL:2 DEU:2 NOR:2 SWE:1',
    EST: 'FIN:4 GBR:2 SWE:1 DEU:1 NOR:1', HRV: 'DEU:4 AUT:2 IRL:1 ITA:1 CHE:1', SVN: 'AUT:3 DEU:2 ITA:1', SRB: 'DEU:4 AUT:2 CHE:2 SWE:1 ITA:1', BIH: 'DEU:4 AUT:2 SWE:2 CHE:1',
    MKD: 'DEU:4 ITA:1 CHE:1 AUT:1', MNE: 'DEU:2 AUT:1 ITA:1 CHE:1', XKX: 'DEU:4 CHE:3 AUT:2 SWE:1', ALB: 'ITA:4 GRC:3 DEU:1 GBR:1',
    GRC: 'DEU:4 GBR:2 AUS:1 USA:1 CHE:1', PRT: 'FRA:3 CHE:2 GBR:2 LUX:2 DEU:1 BRA:1 ESP:1', ESP: 'DEU:2 GBR:2 FRA:2 CHE:1 USA:1', ITA: 'DEU:3 GBR:2 CHE:2 FRA:1 USA:1 AUS:1',
    UKR: 'POL:4 DEU:3 CZE:2 ITA:1 GBR:1 CAN:1 USA:1', BLR: 'POL:3 RUS:3 LTU:1 DEU:1', MDA: 'ITA:3 RUS:3 ROU:2 DEU:1', GEO: 'RUS:2 GRC:2 TUR:1 DEU:1 ITA:1 USA:1',
    ARM: 'RUS:6 USA:1 FRA:1', RUS: 'DEU:2 TUR:2 ISR:1 USA:1 KAZ:1 ARM:1 FIN:1',
    IRL: 'GBR:3 AUS:2 USA:2 CAN:1', GBR: 'AUS:3 ESP:3 USA:2 CAN:2 FRA:1 NZL:1 ARE:1', DEU: 'CHE:3 USA:2 AUS:1 ESP:1 GBR:1', FRA: 'GBR:2 CAN:2 CHE:2 USA:1 ESP:1 BEL:1', NLD: 'GBR:2 DEU:2 USA:1 ESP:1 BEL:1',
    USA: 'CAN:2 MEX:2 GBR:1 AUS:1 ESP:1 PRT:1 JPN:1 CRI:1 DEU:1', CAN: 'USA:5 GBR:1 AUS:1', AUS: 'GBR:4 NZL:3 USA:2 CAN:1 SGP:1', NZL: 'AUS:8 GBR:2 USA:1 CAN:1',
    PNG: 'AUS:4 NZL:1', SLB: 'AUS:3 NZL:2', FJI: 'AUS:3 NZL:3 USA:1 CAN:1', SGP: 'AUS:3 GBR:2 USA:2 MYS:2 CAN:1', ISR: 'USA:3 DEU:1 CAN:1 GBR:1',
    CHL: 'USA:2 ESP:2 AUS:1', CRI: 'USA:4 ESP:1 CAN:1', PAN: 'USA:4 ESP:1 CRI:1', URY: 'ESP:3 ARG:2 USA:1', PRI: 'USA:9', TTO: 'USA:4 CAN:2 GBR:2', GUY: 'USA:3 CAN:3 TTO:1 GBR:1',
  },
  region: {
    LAC: 'USA:4 ESP:2 CAN:1', SAS: 'ARE:4 SAU:3 QAT:2 MYS:1 GBR:1 USA:1', SEA: 'MYS:2 SGP:2 TWN:1 KOR:1 SAU:1 ARE:1', EAS: 'USA:3 AUS:2 CAN:2 JPN:1',
    CAS: 'RUS:5 KAZ:2 TUR:1 KOR:1', MENA: 'SAU:2 ARE:2 FRA:1 DEU:1 TUR:1', SSA: 'ZAF:2 GBR:2 USA:2 FRA:1 ARE:1 SAU:1',
    EUR: 'DEU:3 GBR:2 USA:1 CHE:1 ESP:1', NAM: 'GBR:2 AUS:1 USA:1 CAN:1', OCE: 'AUS:3 NZL:2 USA:1',
  },
};

const SKILLED = {
  by: {
    USA: 'GBR:3 CAN:2 AUS:2 DEU:1 CHE:1 SGP:1', CAN: 'USA:5 GBR:2 AUS:2 DEU:1', AUS: 'GBR:4 USA:3 CAN:2 SGP:1', NZL: 'AUS:6 GBR:2 USA:2 CAN:1',
    GBR: 'AUS:3 USA:3 CAN:2 DEU:1 NZL:1 ARE:1', IRL: 'GBR:3 USA:3 AUS:2 CAN:2', SGP: 'AUS:3 GBR:2 USA:2 CAN:1 HKG:1',
  },
  region: {
    SAS: 'USA:4 CAN:3 GBR:3 AUS:2 ARE:2 DEU:1 SGP:1', SEA: 'AUS:3 SGP:3 USA:3 CAN:2 JPN:1 GBR:1', EAS: 'USA:4 CAN:3 AUS:3 GBR:1 SGP:1 JPN:1',
    MENA: 'ARE:3 DEU:2 CAN:2 USA:2 GBR:2 FRA:2 SAU:1', SSA: 'GBR:3 USA:3 CAN:2 AUS:1 ZAF:1 ARE:1 DEU:1', LAC: 'USA:4 ESP:3 CAN:2 GBR:1 AUS:1',
    EUR: 'DEU:4 GBR:3 NLD:1 NOR:1 SWE:1 CHE:1 USA:1', CAS: 'RUS:3 DEU:2 USA:1 KOR:1 TUR:1', NAM: 'GBR:2 AUS:1 DEU:1 SGP:1 CHE:1', OCE: 'GBR:3 USA:3 SGP:1 CAN:1',
  },
};

const STUDY = {
  by: {
    USA: 'GBR:3 CAN:2 AUS:2 DEU:1 FRA:1', CAN: 'USA:4 GBR:3 AUS:1 FRA:1',
  },
  region: {
    EAS: 'USA:4 GBR:3 AUS:3 CAN:3 JPN:2 SGP:1', SEA: 'AUS:3 USA:3 GBR:2 SGP:2 JPN:1 CAN:1', SAS: 'USA:3 CAN:3 AUS:3 GBR:2 DEU:2',
    MENA: 'DEU:2 USA:2 GBR:2 CAN:2 FRA:2 TUR:1', SSA: 'GBR:3 USA:3 FRA:2 CAN:2 ZAF:2 DEU:1 CHN:1 AUS:1', LAC: 'ESP:3 USA:3 CAN:1 FRA:1 GBR:1',
    EUR: 'GBR:2 DEU:2 NLD:1 USA:1 CHE:1 FRA:1', CAS: 'RUS:4 DEU:1 USA:1 KOR:1 TUR:1 GBR:1', NAM: 'GBR:3 AUS:1 DEU:1 FRA:1', OCE: 'GBR:3 USA:2 AUS:1 CAN:1',
  },
};

const REFUGE = {
  by: {
    SYR: 'TUR:6 DEU:3 LBN:2 JOR:2 SWE:1 NLD:1 EGY:1', AFG: 'PAK:4 IRN:4 DEU:2 TUR:1 GBR:1', IRQ: 'TUR:2 JOR:2 SWE:2 DEU:2 USA:1',
    YEM: 'SAU:2 OMN:2 DJI:1 EGY:1', SDN: 'TCD:2 EGY:2 UGA:1 KEN:1', SSD: 'UGA:6 KEN:2 ETH:2 SDN:1', SOM: 'KEN:4 ETH:3 UGA:1 GBR:1',
    COD: 'UGA:4 RWA:1 TZA:1 ZMB:1 ZAF:1', CAF: 'CMR:3 TCD:2 COD:1', ETH: 'SDN:2 KEN:2 DJI:1 SAU:1', ERI: 'ETH:2 SDN:2 GBR:1 SWE:1 DEU:1',
    MMR: 'THA:4 BGD:3 MYS:2 IND:1', UKR: 'POL:5 DEU:3 CZE:2 ITA:1 GBR:1 CAN:1 ROU:1 MDA:1 SVK:1', PSE: 'JOR:2 EGY:1 TUR:1 DEU:1 ARE:1',
    HTI: 'DOM:4 USA:2 CAN:2 BRA:1 FRA:1 CHL:1', VEN: 'COL:5 PER:2 ESP:2 CHL:2 USA:1 ECU:1 BRA:1', LBY: 'TUN:2 TUR:2 EGY:1 ITA:1', MLI: 'MRT:2 BFA:2 NER:2 FRA:1',
    BFA: 'CIV:2 GHA:2 MLI:1 NER:1', BIH: 'DEU:4 AUT:2 SWE:2 CHE:1', SRB: 'DEU:3 AUT:2 CHE:1 SWE:1', XKX: 'DEU:3 CHE:2 AUT:2 ALB:1 MKD:1', HRV: 'DEU:3 AUT:2 SWE:1',
    RWA: 'UGA:3 COD:2 TZA:2 BDI:1', BDI: 'TZA:4 RWA:1 COD:1', LBR: 'CIV:2 GIN:2 SLE:1 GHA:1 USA:1', SLE: 'GIN:3 LBR:1 GBR:1', LKA: 'IND:3 GBR:1 CAN:1 AUS:1',
    AGO: 'COD:2 ZMB:2 NAM:1 PRT:1', MOZ: 'MWI:3 ZWE:1 ZAF:2', TJK: 'RUS:3 AFG:1 UZB:1', LBN: 'FRA:2 CYP:1 DEU:1 CAN:1 AUS:1',
  },
  region: {
    MENA: 'TUR:2 JOR:1 DEU:2 SWE:1', SSA: 'KEN:1 UGA:1 ZAF:1 GBR:1', SAS: 'IRN:1 PAK:1 DEU:1 GBR:1', LAC: 'USA:2 CAN:1 ESP:1 MEX:1',
    EUR: 'POL:1 DEU:2 GBR:1', SEA: 'THA:1 MYS:1 AUS:1', CAS: 'RUS:2 TUR:1', EAS: 'KOR:1 JPN:1', NAM: 'CAN:1', OCE: 'AUS:1 NZL:1',
  },
};

const PARSED = new Map();
function parse(str) {
  let v = PARSED.get(str);
  if (!v) {
    v = str.split(' ').map((t) => { const [c, w] = t.split(':'); return [c, +w]; });
    PARSED.set(str, v);
  }
  return v;
}

const TABLES = { labor: LABOR, skilled: SKILLED, study: STUDY, refuge: REFUGE };

/** The weighted corridor list for a kind of move, from the person's HOME country. */
function corridors(s, kind) {
  const home = BY_CODE[s.homeCountryCode];
  if (!home) return [];
  const t = TABLES[kind] || LABOR;
  const str = t.by[home.code] || t.region[home.region] || t.region.EUR || 'USA:3 DEU:2 GBR:1';
  return parse(str);
}

/** kind: 'work' (labour for L/LM origins, skilled otherwise), 'skilled', 'study', 'refuge'. Returns a country code. */
function pickDest(s, h, kind = 'work') {
  const home = BY_CODE[s.homeCountryCode];
  const k = kind === 'work' ? (home && (home.income === 'L' || home.income === 'LM') ? 'labor' : 'skilled') : kind;
  let list = corridors(s, k).filter(([c]) => BY_CODE[c] && c !== s.countryCode);
  if (!list.length) list = parse('USA:3 DEU:2 GBR:1 CAN:1 ARE:1').filter(([c]) => BY_CODE[c] && c !== s.countryCode);
  const total = list.reduce((a, [, w]) => a + w, 0);
  let r = h.rand() * total;
  for (const [c, w] of list) { r -= w; if (r < 0) return c; }
  return list[list.length - 1][0];
}

/** Most likely destination for a kind of move (deterministic, safe to use inside text). */
function topDest(s, kind = 'labor') {
  const list = corridors(s, kind).filter(([c]) => BY_CODE[c] && c !== s.countryCode);
  if (!list.length) return '鄰近國家';
  return BY_CODE[list.slice().sort((a, b) => b[1] - a[1])[0][0]].name;
}

/** Move to `code` and remember when. `opts.with` says who comes along (see the header). Returns true if the person actually moved. */
function moveTo(s, h, code, opts) {
  if (!code || !h.migrate(code, opts)) return false;
  h.set('m_year', s.year);
  return true;
}

const NUM = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九'];
/** "孩子" / "兩個孩子" / "三個孩子" for a count. */
const kidsPhrase = (n) => (n <= 1 ? '孩子' : n < 10 ? `${NUM[n]}個孩子` : `${n}個孩子`);
/** How the family keeps in touch from far away, by the year and the place: { how, far } = '視訊' / '螢幕那頭', '電話' / '電話那頭', '寫信' / '遠方'. */
const linkOf = (h) => (h.techReady(2012) ? { how: '視訊', far: '螢幕那頭', wait: '視訊接通', device: '手機' } : h.techReady(1996) ? { how: '電話', far: '電話那頭', wait: '電話接通', device: '話筒' } : { how: '寫信', far: '遠方', wait: '回信', device: '電報' });
const NOBODY = { name: '孩子', birthYear: 0 };
/** Ages of the children who are not with the person. */
const apartAges = (s, h) => h.childrenApart().map((c) => s.year - c.birthYear);
const youngestApart = (s, h) => { const kids = h.childrenApart(); return kids.length ? kids.reduce((a, b) => (b.birthYear > a.birthYear ? b : a)) : null; };
/** The people who come to the new country with the person, as a phrase: "孩子與伴侶" / "伴侶" / "孩子" / "". */
const familyHere = (s, h) => {
  const kids = h.minorsWithYou().length, partner = h.livesWith('partner');
  return kids && partner ? '孩子與伴侶' : partner ? '伴侶' : kids ? '孩子' : '';
};

const destFlag = (h) => { const c = h.flag('m_dest'); return typeof c === 'string' && BY_CODE[c] ? c : null; };
const destFlagName = (h) => { const c = destFlag(h); return c ? BY_CODE[c].name : '海外'; };
const homeName = (s) => (BY_CODE[s.homeCountryCode] ? BY_CODE[s.homeCountryCode].name : '家鄉');

const INCOME_RANK = { L: 0, LM: 1, UM: 2, H: 3 };
/** True if the current country is richer than the home country (income group). */
const richerThanHome = (s, h) => !!h.homeCountry() && INCOME_RANK[h.income()] > INCOME_RANK[h.homeCountry().income];

// Conflict windows by country: [from, to] calendar years in which fleeing is a realistic decision.
const CONFLICT = {
  SYR: [2011, 2040], AFG: [1992, 2040], YEM: [2014, 2040], SDN: [2003, 2040], SSD: [2013, 2040], SOM: [1991, 2040], COD: [1996, 2040],
  CAF: [2013, 2040], MMR: [2021, 2040], UKR: [2022, 2035], PSE: [2000, 2040], LBY: [2011, 2030], IRQ: [1990, 2018], HTI: [2021, 2040],
  MLI: [2012, 2040], BFA: [2015, 2040], ETH: [2020, 2022], ERI: [1998, 2000], BIH: [1992, 1995], SRB: [1998, 1999], XKX: [1998, 1999],
  HRV: [1991, 1995], RWA: [1994, 1994], BDI: [1993, 2005], LBR: [1989, 2003], SLE: [1991, 2002], LBN: [1988, 1990], LKA: [1988, 2009],
  AGO: [1988, 2002], MOZ: [1988, 1992], TJK: [1992, 1997], NIC: [1988, 1990], SLV: [1988, 1992], GTM: [1988, 1996],
};
const inConflict = (s, h) => {
  const w = CONFLICT[s.countryCode];
  return h.has('war') || (!!w && s.year >= w[0] && s.year <= w[1]);
};

const working = (h) => h.employed();
/** The kind of job a recruiter or an informal channel finds for somebody without a trade. */
const abroadJob = (h) => (h.female() ? h.pick(['domestic', 'caregiver', 'factory']) : h.pick(['construction', 'laborer', 'factory']));

export default [
  // =====================================================================================
  // A. 決定離開：進城、出國工作、留學、技術移民
  // =====================================================================================
  {
    id: 'migration_rural_to_city',
    title: '去城裡',
    ages: [17, 45],
    weight: (s, h) => 0.7 + (h.has('w_drought') ? 0.6 : 0) + (h.has('w_family_left') ? 0.4 : 0),
    tags: ['migration', 'internal', 'chain', 'independence', 'job'],
    cond: (s, h) => !s.urban && !h.isMigrant() && !h.has('m_city') && !h.inSchool() && !h.retired() && !h.seenEvent('world_china_wto_migration') && !h.seenEvent('world_future_climate_migration'),
    text: (s, h) => h.byIncome({
      L: `同村的年輕人一個個搭車進城，${h.festival()}回來時帶著新鞋和新衣服，說話腔調都變了。你站在田埂上看著他們，心裡有東西在動，連續好幾個晚上都沒睡好。`,
      LM: '鎮上的工作愈來愈少，進城的班車天天客滿。堂哥說他的工廠還缺人，宿舍有床位，但你得先把自己的田託給別人。這句話，你還沒想好該怎麼開口。',
      UM: '你生長的小鎮還不錯，但機會集中在城市。朋友們一個個搬走，每次聚會人都少了一圈，剩下的人話題也愈來愈少，你開始認真考慮要不要也走。',
      H: '你住的小鎮安靜、物價低，可是工作機會有限。大城市有你想要的行業，也有三倍的房租，你把兩邊的好處與壞處寫在便條紙上，寫滿了一整張。',
    }),
    choices: [
      {
        label: '搬到城市，重新開始',
        effects: (s, h) => {
          h.setUrban(true);
          h.setCity();
          h.moveAway(); // the partner and children come along or stay with the grandparents; the person stops living in the parents' home
          if (!h.employed()) h.startJob(h.eduYears() >= 9 ? 'factory' : 'laborer');
          h.change('social', -3); h.change('wealth', +2); h.change('knowledge', +2); h.change('happiness', +1);
        },
        set: ['m_city'],
        result: (s, h) => `你搬進了${h.city()}的一間小房間，窗外就是另一棟樓的牆。第一個晚上你覺得這個地方太吵，第三個晚上你已經習慣了街上的喧鬧聲。${h.leftBehindLine()}`,
        highlight: (s, h) => `從鄉下搬到了${h.city()}。`,
        schedule: [{ id: 'migration_city_first_year', inYears: [1, 2] }],
        ai: (s, h) => (h.isPoor() ? 1.8 : 1.1),
      },
      {
        label: '先去幾個月，農忙時再回來',
        effects: { wealth: +2, social: -1, health: -1 },
        set: ['m_city', 'm_seasonal_city'],
        result: '你在城市做零工，農忙時搭車回去收成。兩邊的生活都有一半是你的，也都有一半不是。',
        ai: 1.2,
      },
      {
        label: '留在家鄉，在原地想辦法',
        effects: { social: +2, happiness: +1, wealth: -1 },
        set: ['m_city'],
        result: '你把行李袋收回櫃子裡。這個決定也許讓你錯過一些機會，卻也讓你保住了每個傍晚和家人一起吃飯的時間。',
        ai: 1,
      },
    ],
  },
  {
    id: 'migration_city_first_year',
    title: '城市的第一年',
    ages: [18, 50],
    weight: 0,
    tags: ['migration', 'internal', 'followup', 'job'],
    text: (s, h) => h.byIncome({
      L: '城裡的房租貴得嚇人，你和四個人擠在一間屋子。最難的是學會看紅綠燈和認路，最容易的是想家。夜裡你聽著室友的鼾聲，慢慢睡著了。',
      LM: `你在城裡的第一年學了很多：搭哪一班車比較便宜、哪個市場的菜最新鮮、怎麼避開仲介。你的口音，也慢慢變了一點，某天打電話回家，${h.parentAlive('mother') ? '母親' : '家裡的長輩'}說：「你講話怎麼不一樣了？」`,
      UM: '搬進城的第一年，你的通勤時間是家鄉的五倍，擠在車廂裡你學會了站著睡覺。你開始懂得「週末」兩個字的價值，也懂得它有多短。',
      H: `搬到大城市的第一年，你的${h.wageEarner() ? '薪水' : '開銷'}漲了，房間縮小了。你學會在咖啡店寫工作、在窗邊看夜景，也學會了一個人吃飯不覺得尷尬。週末你坐在窗邊，看對面大樓一格一格亮起燈。`,
    }),
    effects: { knowledge: +3, social: -2, happiness: -1, wealth: +1 },
  },
  {
    id: 'migration_recruiter_fee',
    title: '仲介的合約',
    ages: [19, 45],
    weight: 0.35,
    tags: ['migration', 'labor', 'chain'],
    cond: (s, h) => !h.isMigrant() && !h.inSchool() && !h.incomeAtLeast('H') && !h.retired() && !h.has('m_abroad_decided') && !h.has('declined_abroad'),
    text: (s, h) => h.byIncome({
      L: `海外工作的招募員來到村裡，說${topDest(s, 'labor')}那邊缺人手，工資是這裡的好幾倍。仲介費要先借，合約要簽兩年。那一晚，村子裡有好幾戶人家整夜沒關燈。`,
      LM: `仲介的辦公室貼滿了海外工作的海報。去${topDest(s, 'labor')}做兩年，存下來的錢能蓋一間房，只是仲介費、體檢費、機票錢，要先借。你把海報上的數字，抄在了手心裡。`,
      UM: `朋友的朋友說海外有份不錯的工作。你需要付一筆服務費給仲介，合約條款又厚又長，你把每一頁都看了兩遍，家人在旁邊靜靜地等你。`,
    }),
    choices: [
      {
        label: '透過合法仲介，借錢付費用',
        effects: (s, h) => {
          if (moveTo(s, h, pickDest(s, h, 'work'), { with: 'alone' }) && !h.employed()) h.startJob(abroadJob(h));
          h.set('m_contract'); h.change('wealth', -3); h.change('social', -5); h.change('happiness', -1);
        },
        set: ['m_abroad_decided'],
        result: (s, h) => (h.isMigrant()
          ? `你簽了字，拎著一個行李袋走進機場。${h.leftBehindLine()}三個月後，你人在${h.countryName()}，宿舍是八人房，薪水第一次入帳時，你立刻去匯了款。`
          : '手續一直沒有辦完，你只好留在原地。仲介說下次還有機會，你點點頭，沒有再多問。'),
        highlight: (s, h) => (h.isMigrant() ? `出國工作，來到${h.countryName()}。` : null),
        schedule: [{ id: 'migration_contract_life', inYears: [1, 2] }, { id: 'migration_contract_end', inYears: [3, 5] }],
        ai: (s, h) => (h.isPoor() ? 0.9 : 0.5),
      },
      {
        label: '找費用較低的非正式管道',
        effects: (s, h) => {
          if (h.chance(0.4)) { h.change('wealth', -6); h.change('happiness', -5); h.set('m_scammed'); }
          else { h.unset('m_scammed'); if (moveTo(s, h, pickDest(s, h, 'work'), { with: 'alone' }) && !h.employed()) h.startJob(abroadJob(h)); h.set('m_irregular'); h.change('wealth', -2); h.change('social', -5); h.addRisk(1.05, 3); }
        },
        set: ['m_abroad_decided'],
        result: (s, h) => (h.has('m_scammed')
          ? '你把錢交出去之後，對方就再也聯絡不上了。你坐在門口很久，家人沒有罵你，只是輕輕地說「還好人沒事」。'
          : `你跟著非正式的管道抵達${h.countryName()}，沒有正式的合約，也沒有人可以求助。${h.leftBehindLine()}第一份工作是他人介紹的，薪水少，但是可以預支。`),
        unset: ['m_scammed'],
        schedule: [{ id: 'migration_papers_limbo', inYears: [1, 3] }],
        ai: (s, h) => (h.isPoor() ? 0.2 : 0.05),
      },
      {
        label: '不去，在國內想辦法',
        effects: { social: +2, happiness: +1 },
        set: ['m_abroad_decided'],
        result: '你把合約還給了仲介。你知道這個決定會讓你的收入慢一點，但你也每天都能回到自己的家。',
        ai: 2,
      },
    ],
  },
  {
    id: 'migration_contract_life',
    followCond: (s, h) => !h.isMigrant(),
    title: '宿舍與工作之間',
    ages: [20, 52],
    weight: 0,
    tags: ['migration', 'labor', 'followup'],
    text: (s, h) => (h.isMigrant()
      ? `你的日子被切成三段：工作場所、宿舍、電話裡的家人。護照被雇主收著，你很少出門。但每個月匯款的那一天，你都覺得距離不再那麼遠。`
      : '你每天在家鄉的工作與餐桌之間來回，聽朋友說起海外打工的種種。你聽得入神，也慢慢學會了不把羨慕說出口，只在夜裡偷偷看一眼地圖。'),
    effects: (s, h) => { if (h.isMigrant()) { h.change('wealth', +3); h.change('social', -3); h.change('health', -2); h.change('happiness', -1); } else h.change('knowledge', +1); },
  },
  {
    id: 'migration_contract_end',
    followCond: (s, h) => h.isMigrant(),
    title: '契約到期',
    ages: [21, 58],
    weight: 0,
    tags: ['migration', 'labor', 'followup'],
    text: (s, h) => `兩三年的契約即將到期。你在${h.countryName()}存下了一筆錢，也學會了一些你出國前想不到的事。雇主問你要不要續約，家人問你什麼時候回家。`,
    choices: [
      {
        label: '續約，再做幾年',
        cond: (s, h) => h.isMigrant(),
        effects: { wealth: +4, health: -2, social: -2 },
        result: '你簽了新的合約，把匯款數字又調高一點。電話那頭的家人說「保重」，語氣和以前一樣，但你聽得出，他們也在算你不在的日子。',
        ai: (s, h) => (h.isPoor() ? 1.6 : 1),
      },
      {
        label: '回國，用存款做點事',
        cond: (s, h) => h.isMigrant(),
        effects: (s, h) => { moveTo(s, h, s.homeCountryCode); h.set('m_returned'); h.change('happiness', +4); h.change('social', +4); h.change('wealth', +1); },
        result: (s, h) => `你踏進家門的那一刻，院子裡的狗先認出了你。你把行李放下，開始盤算這筆錢要蓋房、開店，還是供弟妹念書。`,
        highlight: '結束海外工作，回到家鄉。',
        schedule: [{ id: 'migration_return_business', inYears: [0, 2] }, { id: 'migration_return_readjust', inYears: [1, 2] }],
        ai: 1.4,
      },
      {
        label: '想辦法轉成長期居留',
        cond: (s, h) => h.isMigrant(),
        effects: (s, h) => { if (h.chance(0.35)) { h.set('m_residency'); h.change('happiness', +4); h.change('wealth', +2); } else { h.unset('m_residency'); h.change('happiness', -2); h.change('wealth', -1); } },
        result: (s, h) => (h.has('m_residency')
          ? '經過一年的文件、面談與等待，你拿到了長期居留的證件。你把那張小小的卡片放在最貼身的口袋，睡覺都不想拿出來。'
          : '申請被退回，理由寫得冷冰冰。你把文件收好，打算再試一次，也在心裡預習離開的可能。'),
        unset: ['m_residency'],
        ai: 1.1,
      },
    ],
  },
  {
    id: 'migration_student_visa',
    title: '出國念書的機會',
    ages: [20, 30],
    weight: (s, h) => h.byIncome({ L: 0.18, LM: 0.28, UM: 0.45, H: 0.35 }),
    tags: ['migration', 'education', 'chain'],
    cond: (s, h) => !h.isMigrant() && h.eduAtLeast('secondary') && !h.has('m_study_decided'),
    text: (s, h) => h.byIncome({
      L: `學校公告了海外獎學金的申請。名額很少，申請文件要用外語寫，但${h.inSchool() ? '你的老師' : '以前教過你的老師'}說：「你至少該試一次。」那天走回家的路，你的腳步特別輕。`,
      LM: '你的成績足夠申請海外的學校。獎學金很競爭，自費太貴，申請文件堆滿了整張書桌，每一份都需要翻譯、公證，和一點運氣。',
      UM: `${h.inSchool() ? '同學' : '同齡的朋友'}一個個準備出國念書，補習班、語言考試、推薦信、財力證明。你在排行榜上看了又看，不知道自己想去哪裡，寄出申請前一晚你整夜沒睡。`,
      H: '你收到海外交換或碩士班的邀請。學費不低，也意味著離開熟悉的一切一兩年，甚至更久。你把信看了三遍，才敢告訴家人，結果家人比你還高興，也比你還擔心。',
    }),
    choices: [
      {
        label: '申請獎學金出國',
        effects: (s, h) => {
          const p = h.byIncome({ L: 0.4, LM: 0.45, UM: 0.55, H: 0.6 });
          if (h.chance(p)) { if (moveTo(s, h, pickDest(s, h, 'study'), { with: 'alone' })) h.enroll(h.eduAtLeast('tertiary') ? 'graduate' : 'tertiary', { quiet: true }); h.set('m_student'); h.change('knowledge', +6); h.change('social', -5); h.change('wealth', -2); h.change('happiness', +1); }
          else { h.change('happiness', -2); h.change('knowledge', +2); }
        },
        set: ['m_study_decided'],
        result: (s, h) => (h.has('m_student') && h.isMigrant()
          ? `放榜那天你的手一直在抖。幾個月後，你在${h.countryName()}的大學裡，聽著講師說你還不太熟悉的口音，笑自己真的來了。`
          : '審查結果出來，名額給了別人。你把收到的信看了兩遍，然後決定把準備的這些東西用在別的地方。'),
        highlight: (s, h) => (h.has('m_student') && h.isMigrant() ? `到${h.countryName()}留學。` : null),
        schedule: [{ id: 'migration_after_graduation', inYears: [3, 5] }],
        ai: 0.9,
      },
      {
        label: '自費出國，用家裡的積蓄',
        cond: (s, h) => h.incomeAtLeast('UM') || h.stat('wealth') >= 40,
        effects: (s, h) => { if (moveTo(s, h, pickDest(s, h, 'study'), { with: 'alone' })) h.enroll(h.eduAtLeast('tertiary') ? 'graduate' : 'tertiary', { quiet: true }); h.set('m_student'); h.change('knowledge', +5); h.change('wealth', -5); h.change('social', -4); },
        set: ['m_study_decided'],
        result: (s, h) => `家人把積蓄一點一點湊出來。你抵達${h.countryName()}那天，行李箱裡塞滿了家鄉的零食，一半在海關被拿走了。`,
        schedule: [{ id: 'migration_after_graduation', inYears: [3, 5] }],
        ai: (s, h) => (h.isRich() ? 0.9 : 0.3),
      },
      {
        label: '留在本地升學或就業',
        effects: { social: +2, happiness: +1, wealth: +1 },
        set: ['m_study_decided'],
        result: '你把申請資料收進檔案夾，決定先在這裡把路走穩。你偶爾會想像另一個版本的自己，但你也知道，現在的路上有你熟悉的臉。',
        ai: 1.8,
      },
    ],
  },
  {
    id: 'migration_after_graduation',
    title: '畢業之後去哪裡',
    ages: [21, 40],
    weight: 0,
    followCond: (s, h) => h.has('m_student') && h.isMigrant(), // the application may have been turned down
    tags: ['migration', 'education', 'followup'],
    text: (s, h) => `${h.eduAtLeast('tertiary') ? '畢業典禮上你和同學互相拍著肩膀。' : '身邊的同學一個個畢業、離開，你的學業卻還沒有結束。'}簽證快到期了，面試通知與家人的電話幾乎在同一天來到。你在${h.countryName()}的日子，很快就要有一個新的答案。`,
    choices: [
      {
        label: '申請工作簽證，留下來',
        cond: (s, h) => h.isMigrant() && h.has('m_student'),
        effects: (s, h) => {
          if (h.chance(0.6)) { h.change('wealth', +4); h.change('happiness', +4); h.set('m_work_visa'); }
          else { moveTo(s, h, s.homeCountryCode); h.set('m_returned'); h.change('happiness', -3); h.change('wealth', 0); h.unset('m_work_visa'); }
        },
        result: (s, h) => (h.has('m_work_visa')
          ? `你拿到了工作許可，簽約那天走出辦公大樓，抬頭看見一整片藍天。你告訴自己：這裡，大概就是下一段人生的起點。`
          : '簽證沒有下來。你收拾行李、告別室友，把看到的風景存進相簿。回到家鄉時，你帶回的是一堆學歷、一些英文口音和比出發時更複雜的心情。'),
        unset: ['m_student'],
        ai: 1.8,
      },
      {
        label: '回家鄉發展',
        cond: (s, h) => h.isMigrant() && h.has('m_student'),
        effects: (s, h) => { moveTo(s, h, s.homeCountryCode); h.set('m_returned'); h.change('happiness', +2); h.change('social', +4); h.change('knowledge', +2); },
        result: (s, h) => `你拎著行李回到${homeName(s)}，家人在機場舉著寫歪了的名牌。你發現自己同時是外人，也是家人。`,
        unset: ['m_student'],
        ai: 1.2,
      },
      {
        label: '再去別的國家闖闖看',
        cond: (s, h) => h.isMigrant() && h.has('m_student'),
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'skilled'), { with: 'keep' }); h.change('social', -3); h.change('knowledge', +2); h.change('happiness', +1); },
        result: (s, h) => `你換了一個國家，換了一座城市，也換了一種語言。在${h.countryName()}的第一個晚上，你坐在新房東的客廳裡，覺得世界很大。`,
        unset: ['m_student'],
        ai: 0.8,
      },
    ],
  },
  {
    id: 'migration_skilled_points',
    title: '點數與申請書',
    ages: [25, 42],
    weight: 0.4,
    tags: ['migration', 'skilled', 'chain'],
    cond: (s, h) => h.eduAtLeast('tertiary') && !h.isMigrant() && !h.has('m_points') && !h.retired(),
    text: (s, h) => h.byIncome({
      L: '你的專業在外國缺人，簡章上有一張計算點數的表格：學歷、年齡、語言、工作年資。你一欄一欄填，算出的數字讓人又期待又心虛。',
      LM: '海外有針對專業人員的移民計畫。你的文憑和年資剛好卡在及格線附近，語言成績決定一切。你開始計算每一分是從哪裡來的。',
      UM: '同行的朋友有人拿到海外居留。你也花一個週末填完了點數表，發現最缺的是兩分語言成績。你默默報名了語言考試，把第一天的筆記本也買好了。',
      H: '你在考慮要不要換個國家工作。移民計畫的簡章、清單、費用，你花了一整個週末讀完，還把重要的連結全都存了起來，卻沒告訴任何人。',
    }),
    choices: [
      {
        label: '遞件申請技術移民',
        effects: (s, h) => {
          h.set('m_dest', pickDest(s, h, 'skilled'));
          h.unset('m_visa_ok'); if (h.chance(0.55)) h.set('m_visa_ok');
          h.change('wealth', -2); h.change('knowledge', +1);
        },
        set: ['m_points'],
        result: '你把一疊證明、翻譯、體檢報告送出去，付了不便宜的申請費。接下來的日子，你每天打開信箱的次數變得很多。',
        schedule: [{ id: 'migration_visa_result', inYears: [1, 2] }],
        ai: (s, h) => (h.stat('happiness') < 50 ? 0.9 : 0.5),
      },
      {
        label: '先累積資歷與語言，再看看',
        effects: { knowledge: +3, happiness: 0, wealth: -1 },
        set: ['m_points'],
        result: '你報名語言課、考證照，一點一點補足缺的分數。進度很慢，但每一小步都讓你覺得離選擇權又近了一點。',
        ai: 1.4,
      },
      {
        label: '把心力放在本地的發展',
        effects: { social: +2, happiness: +1 },
        set: ['m_points'],
        result: (s, h) => `你把${h.techReady(1995) ? '網頁' : '簡章'}關了。也許沒有出國，但你的事業與人脈在這裡慢慢長出了根。`,
        ai: 1.2,
      },
    ],
  },
  {
    id: 'migration_visa_result',
    title: '信箱裡的那封信',
    ages: [26, 48],
    weight: 0,
    tags: ['migration', 'skilled', 'followup'],
    text: (s, h) => (h.has('m_visa_ok')
      ? `信到了。你站在信箱前，手心全是汗，拆開後第一行就看見「核准」。你坐在樓梯上，笑了很久，然後開始想：${destFlagName(h)}的冬天，到底有多冷？`
      : '信到了。第一行寫著「很遺憾」。你把整封信看完，才發現自己一直在屏著呼吸。有些人說可以再申請一次，你說：「先讓我想幾天。」'),
    effects: (s, h) => {
      if (h.has('m_visa_ok')) {
        const d = destFlag(h);
        if (d && moveTo(s, h, d, { with: 'family' })) { h.change('wealth', +3); h.change('social', -6); h.change('happiness', +3); h.highlight(`取得居留，移居${h.countryName()}。`); }
      } else { h.change('happiness', -4); }
      h.unset('m_visa_ok'); h.unset('m_dest');
    },
  },
  {
    id: 'migration_company_transfer',
    title: '外派的通知',
    ages: [28, 52],
    weight: 0.3,
    tags: ['migration', 'work', 'chain'],
    cond: (s, h) => working(h) && h.isJob('manager', 'engineer', 'developer', 'technician', 'researcher', 'accountant', 'sales') && h.incomeAtLeast('LM') && !h.isMigrant() && !h.has('m_transfer'),
    text: (s, h) => '公司在海外開了新的據點，需要有人過去帶團隊。主管把你叫進辦公室，說：「想不想去？薪水高，但是……」後面的話你沒有聽完，你已經在想家人、房子和簽證了。',
    choices: [
      {
        label: '接受外派，自己先去',
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'skilled'), { with: 'alone' }); h.change('wealth', +2); h.change('social', -4); h.change('knowledge', +3); },
        set: ['m_transfer'],
        result: (s, h) => `你把家裡的鑰匙交給朋友，一個人飛往${h.countryName()}。${h.leftBehindLine()}公司替你租了一間家具齊全的公寓，乾淨得像樣品屋，你卻睡不著。`,
        highlight: (s, h) => `被公司外派到${h.countryName()}。`,
        schedule: [{ id: 'migration_expat_life', inYears: [1, 2] }, { id: 'migration_family_joins', inYears: [1, 2], p: 0.7 }],
        ai: 0.6,
      },
      {
        label: '談好條件，全家一起搬',
        cond: (s, h) => h.hasPartner() || h.hasChildren(),
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'skilled'), { with: 'family' }); h.change('wealth', +2); h.change('social', -3); h.change('knowledge', +3); h.set('m_family_moved'); },
        set: ['m_transfer'],
        result: (s, h) => `你們整理了家當，一件件裝箱。${familyHere(s, h) || '你們'}在${h.countryName()}的新家，一起吃了第一頓外賣，沒有人說話，但每個人的眼睛都亮著。`,
        schedule: [{ id: 'migration_expat_life', inYears: [1, 2] }],
        ai: 0.7,
      },
      {
        label: '婉拒，留在原地',
        effects: { social: +1, happiness: +1, wealth: -1 },
        set: ['m_transfer'],
        result: '你向主管解釋了家庭與健康的考量，對方理解，但接下來的升遷名單裡，你的名字確實往後挪了。你選擇平靜地接受這個代價。',
        ai: 1.6,
      },
    ],
  },
  {
    id: 'migration_expat_life',
    followCond: (s, h) => h.isMigrant(),
    title: '外派生活的另一面',
    ages: [29, 58],
    weight: 0,
    tags: ['migration', 'work', 'followup'],
    text: (s, h) => (h.isMigrant()
      ? (h.livesAlone()
        ? '外派的日子比想像的孤單：同事都是同鄉，下了班各自回到家具齊全的公寓，和當地人的對話僅止於點餐。你學著自己去逛菜市場，第一次用當地語言討價還價成功時，開心得像考了滿分。'
        : '外派的日子比想像的孤單：同事都是同鄉，假日是國際學校的家長會，和當地人的對話僅止於點餐。你學著自己去逛菜市場，第一次用當地語言討價還價成功時，開心得像考了滿分。')
      : '你聽過許多外派同事的故事：拿到高薪、住進大房子，卻在週末時分覺得世界是空的。你在心裡記著，這些故事會不會有一天是你的。'),
    effects: (s, h) => { if (h.isMigrant()) { h.change('wealth', +2); h.change('social', -2); h.change('knowledge', +3); h.change('happiness', +1); } else h.change('knowledge', +1); },
  },
  {
    id: 'migration_lottery_visa',
    title: '抽中的名額',
    ages: [21, 45],
    weight: 0.1,
    tags: ['migration', 'luck'],
    cond: (s, h) => !h.isMigrant() && !h.incomeAtLeast('H') && !h.has('m_lottery') && !h.retired(),
    text: (s, h) => '你登記了一個移民名額的抽籤，本來只是抱著試試看的心情。結果有一天，信件裡出現「恭喜」兩個字。你反覆看了幾遍，確定不是詐騙。',
    choices: [
      {
        label: '接受名額，帶著家人遠行',
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'work'), { with: 'family' }); h.change('social', -6); h.change('wealth', +1); h.change('happiness', +2); },
        set: ['m_lottery'],
        result: (s, h) => `你賣掉了不太值錢的家具，把重要的東西裝進幾個箱子。落地${h.countryName()}那天，海關人員對你說「歡迎」，你一時沒反應過來這是對你說的。`,
        highlight: (s, h) => `抽中移民名額，搬到${h.countryName()}。`,
        ai: (s, h) => (h.isPoor() ? 0.8 : 0.5),
      },
      {
        label: '放棄名額，留在原地',
        effects: { social: +2, happiness: 0 },
        set: ['m_lottery'],
        result: '你把信件折好放進抽屜，沒有告訴太多人。很多年後，你偶爾還會想起那個星期，心跳比平常快，但並沒有後悔。',
        ai: 1.6,
      },
    ],
  },
  {
    id: 'migration_family_reunion',
    title: '家人在海外',
    ages: [20, 60],
    weight: 0.22,
    tags: ['migration', 'family'],
    cond: (s, h) => !h.isMigrant() && !h.incomeAtLeast('H') && (h.siblings() > 0 || h.parentsAlive() > 0) && !h.has('m_reunion') && !h.retired(),
    text: (s, h) => '你的親人早幾年出國，現在站穩了腳步，打來電話說可以幫你辦團聚手續。電話那頭有新家的聲音：孩子的笑聲、說著另一種語言的鄰居。',
    choices: [
      {
        label: '申請團聚，搬去與家人同住',
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'work'), { with: 'family' }); h.change('social', -2); h.change('happiness', +2); h.change('wealth', +1); },
        set: ['m_reunion'],
        result: (s, h) => `家人在${h.countryName()}的機場等你。你從出口走出來，被緊緊抱住，行李箱倒在地上，沒有人撿。`,
        ai: (s, h) => (h.isPoor() ? 0.8 : 0.4),
      },
      {
        label: '請家人有空回來，彼此保持聯繫',
        effects: { social: +2, happiness: +1 },
        set: ['m_reunion'],
        result: '你婉拒了移民的邀請，但說好每年見一次面。電話那頭的聲音有時模糊，有時清晰，都是你的家人。',
        ai: 1.4,
      },
    ],
  },
  {
    id: 'migration_digital_nomad',
    title: '帶著電腦去旅居',
    ages: [25, 52],
    weight: 0.4,
    tags: ['migration', 'work', 'era'],
    cond: (s, h) => h.yearIn(2021, 3000) && !h.seenEvent('world_future_remote_nomads') && working(h) && h.isJob('developer', 'engineer', 'manager', 'researcher', 'accountant', 'clerk', 'sales') && h.incomeAtLeast('UM') && !h.isMigrant() && !h.has('m_nomad'),
    text: (s, h) => '公司允許遠距工作，你的地理位置突然不再重要。朋友在社群上貼出海邊咖啡館的桌面照，你的窗外只有隔壁大樓的冷氣機。你把這個念頭從腦袋裡移到了待辦清單的第一行。',
    choices: [
      {
        label: '搬到海外邊旅居邊工作',
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'skilled')); h.change('happiness', +4); h.change('social', -3); h.change('wealth', 0); },
        set: ['m_nomad'],
        result: (s, h) => `你在${h.countryName()}租了一間有陽台的小公寓，時差讓你在早上開會，下午寫報告，傍晚去海邊走路。這種自由很迷人，也有一點飄。`,
        ai: 0.6,
      },
      {
        label: '維持現在的生活',
        effects: { happiness: +1, social: +1 },
        set: ['m_nomad'],
        result: '你把這個念頭收進一個叫「以後」的資料夾。晚上你在自己的陽台喝茶，覺得這裡其實也不算差。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'migration_seasonal_work',
    title: '季節性的工作合約',
    ages: [20, 50],
    weight: 0.6,
    tags: ['migration', 'work', 'seasonal'],
    cond: (s, h) => !h.isMigrant() && !h.incomeAtLeast('H') && !s.urban && (h.isJob('farmer', 'laborer', 'fisher', 'construction') || h.workStatus() === 'none') && !h.retired() && !h.has('m_season'),
    text: (s, h) => `每年收成完之後，村裡有人去${topDest(s, 'labor')}做季節性的農活，三、四個月賺的錢，比在家一整年還多。這次，他們問你要不要一起去，還說工頭是個說話算話的人。`,
    choices: [
      {
        label: '簽季節合約，農閒時出去',
        effects: { wealth: +4, health: -2, social: -2 },
        set: ['m_season'],
        result: '你在另一個國家的田裡度過了一個冬天。工頭說的話你只懂一半，薪水單倒是看得很懂。回家時，口袋裡有一疊現金，臉上多了一層風霜。',
        ai: (s, h) => (h.isPoor() ? 1.8 : 1),
      },
      {
        label: '留在家鄉，自己找門路',
        effects: { social: +2, happiness: +1, wealth: -1 },
        set: ['m_season'],
        result: '你選擇留下來。冬天顯得特別漫長，但家裡的火爐旁，有你最熟悉的人。',
        ai: 1.1,
      },
    ],
  },
  // =====================================================================================
  // B. 被迫離開：衝突與難民
  // =====================================================================================
  {
    id: 'migration_flight_decision',
    title: '走，還是留',
    ages: [16, 62],
    weight: 1.8,
    tags: ['migration', 'refugee', 'conflict', 'chain'],
    cond: (s, h) => inConflict(s, h) && !h.isMigrant() && !h.has('m_fled'),
    text: (s, h) => '槍炮聲一夜比一夜近。鄰居的房子已經空了，市場時開時關。你的包包放在門邊，裡面是證件、一點錢，和一張摺得很小的家人照片。你得決定，走，還是留。',
    choices: [
      {
        label: '帶著能帶走的人一起離開',
        effects: (s, h) => {
          moveTo(s, h, pickDest(s, h, 'refuge'), { with: 'refugee' });
          h.set('m_refugee'); h.change('health', -3); h.change('happiness', -4); h.change('wealth', -4); h.change('social', -4); h.addRisk(1.12, 3);
        },
        set: ['m_fled'],
        result: (s, h) => `你們在夜裡出發，一路上有的路段走路，有的路段擠進貨車。抵達${h.countryName()}的邊境時，每個人的鞋都破了，卻沒有人說放棄。`,
        highlight: (s, h) => `為了躲避戰亂，離開家鄉，來到${h.countryName()}。`,
        schedule: [{ id: 'migration_camp_waiting', inYears: [0, 1] }, { id: 'migration_asylum_hearing', inYears: [1, 3] }],
        ai: (s, h) => (h.hasChildren() ? 2 : 1.3),
      },
      {
        label: '先送家人離開，自己留下來',
        effects: (s, h) => { h.sendFamilyAway(); h.change('happiness', -5); h.change('social', -3); h.addRisk(1.08, 2); },
        set: ['m_fled', 'm_split'],
        result: '你站在車站，看著家人的臉從車窗裡一點一點變小。你揮手，直到手臂發酸才放下。之後的每個夜晚，你都把電話放在枕邊。',
        ai: 1,
      },
      {
        label: '留在原地，在艱難中撐下去',
        effects: (s, h) => { h.change('health', -3); h.change('happiness', -3); h.change('social', +3); h.addRisk(1.1, 3); },
        set: ['m_fled'],
        result: '你和鄰居輪流守夜、分享水和麵粉。日子很苦，卻也在這種時候，你看見了一個社區能多麼堅韌。',
        ai: (s, h) => (h.hasChildren() ? 0.5 : 1),
      },
    ],
  },
  {
    id: 'migration_camp_waiting',
    title: '等待的日子',
    ages: [16, 66],
    weight: 0,
    tags: ['migration', 'refugee', 'followup'],
    text: (s, h) => (h.isMigrant()
      ? '登記、排隊、面談、再排隊。收容所的牆上貼滿各種語言的公告，每個人手上都握著一張寫著號碼的紙。你學會了在這種等待裡，替鄰居帶孩子，也替孩子找一個玩的地方。'
      : '你關注著遠方的消息，每一則新聞都讓你的心提到喉嚨。家人捎來的消息愈來愈短，你知道，他們也在等。你把電話放在枕邊，整夜開著鈴聲。'),
    effects: { health: -2, happiness: -3, social: +2, knowledge: +1 },
  },
  {
    id: 'migration_asylum_hearing',
    title: '聽證那一天',
    ages: [17, 68],
    weight: 0,
    tags: ['migration', 'refugee', 'followup'],
    text: (s, h) => `你穿上最整齊的衣服，帶著所有能證明自己經歷的文件，走進${h.countryName()}的辦公室。承辦人員看起來也很累，翻譯員的聲音很輕。你把一生最痛的那一段，用最短的句子說出來。`,
    choices: [
      {
        label: '準備好文件，如實說明經歷',
        cond: (s, h) => h.isMigrant() && h.has('m_refugee'),
        effects: (s, h) => { h.unset('m_status_ok'); if (h.chance(0.65)) { h.set('m_status_ok'); h.change('happiness', +5); } else { h.change('happiness', -5); } h.change('knowledge', +1); },
        result: (s, h) => (h.has('m_status_ok')
          ? '幾週後，信到了：你的申請獲准。你把那張紙貼在牆上，又拿下來，抱在懷裡。這是你好久以來，第一次覺得可以放下行李。'
          : '信上寫著暫時不予核准，但還有申訴的機會。你坐在公車站，旁邊一位陌生的老太太遞給你一顆糖，沒有說話。'),
        unset: ['m_refugee'],
        schedule: [{ id: 'migration_new_start', inYears: [1, 2] }],
        ai: 1.6,
      },
      {
        label: '請志工或律師陪同出席',
        cond: (s, h) => h.isMigrant() && h.has('m_refugee'),
        effects: (s, h) => { h.unset('m_status_ok'); if (h.chance(0.8)) { h.set('m_status_ok'); h.change('happiness', +5); } else { h.change('happiness', -4); } h.change('wealth', -1); h.change('social', +2); },
        result: (s, h) => (h.has('m_status_ok')
          ? '有人陪在身邊，說話時你的手不再發抖。結果出來那天，志工哭得比你還大聲，你反而笑了。'
          : '申請這次沒有通過，但律師說還有別的路可以走。你深吸一口氣，把資料夾重新整理一遍。'),
        unset: ['m_refugee'],
        schedule: [{ id: 'migration_new_start', inYears: [1, 2] }],
        ai: 1.8,
      },
      {
        label: '不再等了，轉往其他國家',
        cond: (s, h) => h.isMigrant() && h.has('m_refugee'),
        effects: (s, h) => { moveTo(s, h, pickDest(s, h, 'skilled'), { with: 'keep' }); h.unset('m_status_ok'); h.change('happiness', -3); h.change('social', -3); h.change('wealth', -2); },
        result: (s, h) => `你背起行李，繼續往前走。在${h.countryName()}的第一個月，你睡在朋友的朋友家，沙發很短，你蜷成一個很小的圈。`,
        unset: ['m_refugee'],
        schedule: [{ id: 'migration_new_start', inYears: [1, 2] }],
        ai: 0.7,
      },
    ],
  },
  {
    id: 'migration_new_start',
    title: '重新開始',
    ages: [18, 70],
    weight: 0,
    tags: ['migration', 'refugee', 'followup'],
    text: (s, h) => (h.has('m_status_ok')
      ? `你報名了語言課，在${h.countryName()}找到第一份工作——也許是麵包店的幫手、也許是倉庫的夜班。老闆不太問你的過去，只問你明天能不能準時來。你點頭，眼眶有點紅。`
      : '身分仍未定，日子卻照樣要過。你一邊等待，一邊在社區中心當志工、學新語言、陪鄰居的孩子讀書。你學會把「明天」交給明天，把「今天」做好。'),
    effects: (s, h) => {
      if (h.has('m_status_ok')) { h.change('happiness', +4); h.change('wealth', +2); h.change('knowledge', +3); h.change('social', +2); h.highlight('在戰亂與流離之後，終於重新開始。'); }
      else { h.change('happiness', -1); h.change('social', +3); h.change('knowledge', +2); }
      h.unset('m_status_ok');
    },
  },
  {
    id: 'migration_papers_limbo',
    title: '沒有身分的日子',
    ages: [20, 60],
    weight: 0,
    tags: ['migration', 'irregular', 'followup'],
    text: (s, h) => '你的證件沒有隨著日子更新。你學會了避開查驗的路線、不去醫院、不在有監視器的地方久留。每天出門前，你要先看一遍口袋裡有沒有那張薄薄的影本。',
    choices: [
      {
        label: '申請合法化或特赦',
        cond: (s, h) => h.isMigrant() && h.has('m_irregular'),
        effects: (s, h) => { h.unset('m_regularized'); if (h.chance(0.4)) { h.set('m_regularized'); h.change('happiness', +6); h.change('social', +3); } else { h.change('happiness', -3); } h.change('wealth', -2); },
        result: (s, h) => (h.has('m_regularized')
          ? '你排了很久的隊，繳了很多文件，終於拿到那張寫著你名字的卡。你走出辦公室時，第一次不用看路邊有沒有警察。'
          : '申請被擱置，承辦人客氣地說「請耐心等候」。你把收據折好，繼續過日子，但這次，你覺得自己至少把名字放進了某個清單。'),
        unset: ['m_irregular'],
        ai: 1.6,
      },
      {
        label: '繼續低調工作，把錢寄回去',
        cond: (s, h) => h.isMigrant() && h.has('m_irregular'),
        effects: (s, h) => { h.change('wealth', +1); h.change('health', -1); h.change('social', -2); h.change('happiness', -2); h.addRisk(1.04, 2); },
        result: '你一天打兩份工，睡在不用簽約的出租房。生病時你先吃藥房買的藥，再等一等。你不抱怨，只是把每個月的匯款單疊得整整齊齊。',
        ai: 1.1,
      },
      {
        label: '回到家鄉，重新打算',
        cond: (s, h) => h.isMigrant() && h.has('m_irregular'),
        effects: (s, h) => { moveTo(s, h, s.homeCountryCode); h.set('m_returned'); h.change('happiness', +1); h.change('wealth', -2); h.change('social', +4); },
        result: '你買了回程的票，把沒用完的日用品送給鄰居。回到家的那天，家人煮了你小時候最愛吃的菜，什麼也沒問，什麼也沒說。',
        unset: ['m_irregular'],
        schedule: [{ id: 'migration_return_readjust', inYears: [1, 2] }],
        ai: 0.9,
      },
    ],
  },

  // =====================================================================================
  // C. 異鄉生活：適應、歧視、歸屬
  // =====================================================================================
  {
    id: 'migration_culture_shock',
    title: '第一個月',
    ages: [18, 62],
    weight: 1.4,
    tags: ['migration', 'adjustment'],
    cond: (s, h) => h.isMigrant() && h.yearsAbroad() <= 1,
    text: (s, h) => h.byIncome({
      L: '你到了一個語言、氣味、食物都不一樣的地方。在路邊攤蹲著吃飯時，旁邊的人看了你一眼，把一碟調味料推過來。你們什麼都沒說，但你覺得這裡也許能待下去。',
      LM: '市場裡的菜名你一半不會唸，攤販耐心地比手畫腳。你買回一樣不知道怎麼煮的東西，鄰居教你煮，味道出乎意料地好，你把這道菜的名字寫在手心。',
      UM: '搭公車時你不知道該怎麼付錢，後面排隊的人露出禮貌的微笑，司機示意你坐下。你全身發燙，卻也被這份善意嚇了一跳，下車時對司機說了三次謝謝。',
      H: '超市的牛奶有二十種，你站在冷藏櫃前十分鐘，最後拿了包裝最漂亮的一盒。回家才發現那是燕麥奶。你決定把這件事寫進未來要告訴孩子的故事。',
    }),
    effects: { knowledge: +2, happiness: -2, social: -2 },
  },
  {
    id: 'migration_language_barrier',
    title: '聽不懂的對話',
    ages: [18, 62],
    weight: 1,
    tags: ['migration', 'adjustment', 'language'],
    cond: (s, h) => h.isMigrant() && !h.has('m_lang'),
    text: (s, h) => (h.officeJob() ? '會議室裡' : '午休時的休息區裡') + '大家笑成一團，你只聽見每個詞都懂，合起來卻不懂。你點頭、微笑，等到所有人散場才發現，笑話其實是和你有關的。你決定，不能再這樣下去。',
    choices: [
      {
        label: '報名語言課，系統地學',
        effects: { knowledge: +5, wealth: -2, social: +2, happiness: +1 },
        set: ['m_lang'],
        result: '你每週三晚上去上課，同學來自世界各地，大家用不標準的發音互相糾正。半年後，你第一次在櫃檯完整地講完一件事，對方還說了聲「很棒」。',
        ai: 1.6,
      },
      {
        label: '邊工作邊學，請身邊的人多聊天',
        effects: { knowledge: +3, social: +3, happiness: 0 },
        set: ['m_lang'],
        result: (s, h) => `你讓${h.wageEarner() ? '同事' : '鄰居'}糾正你每一個發音。有人笑你，有人幫你，你學得很快，也出了不少糗，但這些糗事後來變成了你和${h.wageEarner() ? '同事' : '鄰居'}間的暗號。`,
        ai: 1.8,
      },
      {
        label: '先在同鄉圈子生活，語言慢慢來',
        effects: { social: +3, happiness: +1, knowledge: -1 },
        set: ['m_lang', 'm_enclave'],
        result: '你的朋友、你的商店、你的週末聚會，都說著你熟悉的語言。這給了你安全感，也讓你偶爾覺得，自己住在一個沒有地址的小島上。',
        ai: 1,
      },
    ],
  },
  {
    id: 'migration_credential_recognition',
    title: '文憑不被承認',
    ages: [24, 55],
    weight: 0.9,
    tags: ['migration', 'work', 'chain'],
    cond: (s, h) => h.isMigrant() && h.eduAtLeast('tertiary') && !h.has('m_cred') && richerThanHome(s, h),
    text: (s, h) => '面試官客氣地看著你的履歷：「我們很敬重你的學歷，但是……你有本地的經驗嗎？」你在家鄉的專業，在這裡突然變成需要重新證明的事。',
    choices: [
      {
        label: '重新考照、補修學分',
        effects: (s, h) => { h.unset('m_cred_ok'); if (h.chance(0.6)) h.set('m_cred_ok'); h.change('knowledge', +4); h.change('wealth', -3); h.change('happiness', -1); },
        set: ['m_cred'],
        result: '你白天打工，晚上讀書，連續兩年。考場上，你是年紀最大的那一批，但寫下最後一個字時，手竟然是穩的。',
        schedule: [{ id: 'migration_cred_result', inYears: [1, 3] }],
        ai: 1.4,
      },
      {
        label: '先做較低階的工作累積經驗',
        effects: (s, h) => { h.startJob(h.pick(['cook', 'driver', 'caregiver', 'clerk'])); h.change('wealth', 0); h.change('happiness', -3); h.change('social', +1); },
        set: ['m_cred'],
        result: '你在不屬於自己專業的位置上，拿著比預期少的薪水。只是你的同事不知道，你下班後回家看的，是專業期刊。',
        ai: 1.2,
      },
      {
        label: '用自己的專長開一家小公司',
        effects: (s, h) => {
          h.startJob(h.pick(['entrepreneur', 'shopkeeper']));
          if (h.chance(0.45)) { h.change('wealth', +4); h.change('happiness', +4); } else { h.change('wealth', -4); h.change('happiness', -3); }
        },
        set: ['m_cred'],
        result: '你把專業變成自己的招牌，客人大部分是同鄉。生意起起伏伏，但至少你的文憑，在自己的辦公桌上是被承認的。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'migration_cred_result',
    title: '成績單與證書',
    ages: [26, 60],
    weight: 0,
    tags: ['migration', 'work', 'followup'],
    text: (s, h) => (h.has('m_cred_ok')
      ? '成績單上的「通過」兩個字，你看了三次。你拿著證書走進以前拒絕過你的那間窗口，櫃檯人員對你微笑：「歡迎。」那一刻你很想大喊，但還是優雅地道謝。'
      : '考試沒能通過，證書又離你遠了一些。你坐在公園的長椅上吃便當，看一群孩子在草地上追球。你知道自己會再試一次，只是需要先喘口氣。'),
    effects: (s, h) => {
      if (h.has('m_cred_ok')) { h.startJob(h.eduAtLeast('graduate') ? 'researcher' : h.pick(['engineer', 'accountant', 'teacher', 'nurse'])); h.change('wealth', +4); h.change('happiness', +5); h.highlight('在異鄉重新取得專業資格。'); }
      else { h.change('happiness', -3); h.change('knowledge', +2); }
      h.unset('m_cred_ok');
    },
  },
  {
    id: 'migration_discrimination',
    title: '被打量的眼神',
    ages: [18, 62],
    weight: 0.9,
    tags: ['migration', 'discrimination'],
    cond: (s, h) => h.isMigrant() && !h.has('m_discrim'),
    text: (s, h) => '你去看房，房東在電話裡說還有空房，見面時卻改口「剛租出去了」。隔天你請朋友同樣打電話，房子又有空了。你握著電話，不知道該生氣還是該笑。',
    choices: [
      {
        label: '向機構或社區組織求助',
        effects: (s, h) => { if (h.chance(0.55)) { h.change('happiness', +3); h.change('social', +2); } else { h.change('happiness', -2); h.change('social', +1); } h.change('knowledge', +1); },
        set: ['m_discrim'],
        result: '你把經過寫下來，交給了專門協助移民的團體。事情沒有立刻改變，但你不再覺得自己一個人在面對，旁邊多了一群有經驗的人。',
        ai: 1.8,
      },
      {
        label: '平靜地當面回應',
        effects: { happiness: +1, social: +1, knowledge: +1 },
        set: ['m_discrim'],
        result: '你直視對方，說：「我明白了。」語氣很輕，卻讓對方的視線飄開。你轉身離開，背挺得很直，但走了兩條街才讓肩膀放鬆。',
        ai: 1.3,
      },
      {
        label: '不理會，專心把自己的日子過好',
        effects: { happiness: -2, wealth: 0, social: -1 },
        set: ['m_discrim'],
        result: '你選擇不爭，因為時間與力氣都要留給更重要的事。偶爾在深夜裡，你會想起那個眼神，把它放進心裡最深的抽屜。',
        ai: 1,
      },
    ],
  },
  {
    id: 'migration_exploited_wages',
    title: '少付的薪水',
    ages: [19, 58],
    weight: 0.7,
    tags: ['migration', 'work', 'conflict'],
    cond: (s, h) => h.isMigrant() && working(h) && h.isJob('laborer', 'construction', 'domestic', 'cook', 'factory', 'driver', 'caregiver', 'guard') && richerThanHome(s, h),
    text: (s, h) => '雇主知道你不敢投訴，薪水總是少算一點，加班不給錢，休假說「看情況」。你看著薪資單，那些小小的缺口，加起來是一個月的房租。',
    choices: [
      {
        label: '找移工協會、教會或工會求助',
        effects: (s, h) => { if (h.chance(0.6)) { h.change('wealth', +4); h.change('social', +3); h.change('happiness', +3); } else { h.change('wealth', -1); h.change('social', +2); h.change('happiness', -1); } },
        result: '你第一次走進那間小小的辦公室，志工遞給你一杯熱茶，用你聽得懂的話說：「你並不孤單。」整件事花了好幾個月，但你不再只是默默承受。',
        ai: 1.8,
      },
      {
        label: '更換雇主，離開這份工作',
        effects: (s, h) => { if (h.chance(0.6)) { h.change('wealth', +2); h.change('happiness', +2); } else { h.change('wealth', -3); h.change('happiness', -2); } },
        result: '你在同鄉之間四處打聽，終於有人介紹新的工作。換工作的空白期很難熬，但新的老闆給你一份清楚的薪資單，你反覆看了好幾遍。',
        ai: 1.2,
      },
      {
        label: '忍到契約結束再說',
        effects: { wealth: -1, happiness: -3, health: -1 },
        result: '你把每一次被少付的數字記在小本子上，打算有一天拿出來。日子照樣要過，家人在等匯款，這種現實不是你能選擇的。',
        ai: (s, h) => (h.isPoor() ? 1.2 : 0.5),
      },
    ],
  },
  {
    id: 'migration_remittance',
    title: '匯款的日子',
    ages: [20, 60],
    once: false,
    cooldown: 8,
    weight: 1,
    tags: ['migration', 'money', 'chain'],
    cond: (s, h) => h.isMigrant() && working(h) && richerThanHome(s, h),
    text: (s, h) => '月底到了，你站在匯款櫃檯前，手裡拿著這個月的薪水。家人在電話裡說「不用寄那麼多」，但你知道，米價、學費、醫藥費都在等這筆錢。你得決定怎麼分配。',
    choices: [
      {
        label: '每月固定寄回大部分',
        effects: { wealth: -3, social: +4, happiness: +1, health: -1 },
        set: ['m_remit'],
        result: '你只留下夠生活的錢，其他的全寄回去。家人寄來新屋頂的照片，你在公車上把它拿出來看了好幾次。',
        schedule: [{ id: 'migration_remittance_fruit', inYears: [3, 5] }],
        ai: (s, h) => (h.hasChildren() || h.siblings() > 0 ? 1.6 : 1),
      },
      {
        label: '寄一半，存一半，準備接家人過來',
        effects: { wealth: -1, social: +2, happiness: +1 },
        set: ['m_save_family'],
        result: '你把存摺分成兩個，一本寫著「家」，一本寫著「團聚」。每次數字增加，你就想起家人將會在這裡的樣子。',
        schedule: [{ id: 'migration_family_joins', inYears: [2, 4] }],
        ai: 1.4,
      },
      {
        label: '先顧好自己的生活',
        effects: { wealth: +2, social: -3, happiness: -1 },
        result: '你只寄了小部分，把大部分留下來付房租與學費。家人沒有責怪你，但電話裡的語氣淡了一點，你知道那是在體諒你。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'migration_remittance_fruit',
    title: '寄回去的錢，長成了什麼',
    ages: [23, 66],
    weight: 0,
    tags: ['migration', 'money', 'followup'],
    text: (s, h) => '家人寄來一張照片：新蓋好的房子，門口站著所有人，笑得很用力。你把照片看了又看，眼眶發熱。那些漫長而孤單的夜晚，在這一刻有了形狀。',
    effects: { happiness: +4, social: +3 },
    highlight: '寄回去的錢，在家鄉蓋起了新的家。',
  },
  {
    // The reunion. Scheduled by the remittance choice, the company transfer and, from the second year apart, by the yearly household
    // pass (systems.js). It fires only while somebody is still apart; its effect brings the partner and the minors to live with the person.
    id: 'migration_family_joins',
    followCond: (s, h) => (h.isMigrant() || !!(h.leftBehind() && h.leftBehind().to === h.leftBehind().from)) && (h.childrenApart().length > 0 || (h.apartFrom('partner') && !!h.leftBehind() && h.leftBehind().partner)),
    title: '機場的出口',
    once: false,
    cooldown: 4,
    ages: [23, 66],
    weight: 0,
    tags: ['migration', 'family', 'followup'],
    text: (s, h) => {
      const kids = h.childrenApart();
      const partner = h.apartFrom('partner') && !!h.leftBehind() && h.leftBehind().partner;
      const names = kids.length > 1 ? `${kids[0].name}和${kids[1].name}${kids.length > 2 ? '他們' : ''}` : kids.length ? kids[0].name : '';
      const place = h.isMigrant() ? '機場的出口' : '車站的出口';
      const who = partner && kids.length ? `${h.partnerName()}牽著${names}` : partner ? h.partnerName() : names;
      const apart = h.leftBehind() ? s.year - h.leftBehind().year : 0;
      const first = partner && kids.length ? '熟悉的臉龐一個一個走出來' : kids.length > 1 ? '孩子們一個一個走出來' : '熟悉的身影走出來';
      return `等了這麼久，手續終於辦成了。你在${place}舉著寫了名字的紙板，看著${first}${apart >= 3 ? `，才發現${kids.length ? `${kids[0].name}已經長高了這麼多` : `${h.partnerName()}鬢邊多了幾根白髮`}` : ''}。${who}朝你走來，你準備了一大堆話，一句也說不出。`;
    },
    effects: (s, h) => {
      const r = h.reunite();
      if (r.partner || r.kids.length) { h.change('happiness', +5); h.change('social', +4); h.change('wealth', -3); }
      else h.change('happiness', -1);
    },
    highlight: (s, h) => { const r = h.lastReunion(); return r && r.year === s.year ? (r.kids.length ? '把留在家鄉的孩子接到身邊，一家人又在一起了。' : '把伴侶接到身邊，兩個人不再隔著國界。') : null; },
  },
  {
    id: 'migration_remittance_receive',
    title: '匯款通知',
    ages: [18, 66],
    once: false,
    cooldown: 8,
    weight: 0.5,
    tags: ['migration', 'money', 'regional'],
    cond: (s, h) => !h.isMigrant() && !h.incomeAtLeast('H') && (h.siblings() > 0 || h.parentsAlive() > 0) && h.isRegion('SAS', 'SEA', 'LAC', 'SSA', 'MENA', 'CAS', 'EUR'),
    text: (s, h) => h.byIncome({
      L: '村裡的小店有人收到了匯款通知，櫃檯前圍了一圈人。這一次是你家：遠在國外的親人寄了錢來，你拿到錢後，先把欠鄰居的米錢還了。',
      LM: '收到了一筆匯款通知，是在海外工作的親人寄來的。你用這筆錢繳了學費、買了藥，還剩一點，大家商量著要不要修屋頂。你把匯款收據小心折好，收進抽屜。',
      UM: '國外的親人寄來一筆錢，附了一句「不用客氣」。你的家人把錢放在餐桌正中央，大家一起談了好久這筆錢該用在哪裡，最後決定，先替孩子買一雙合腳的鞋。',
    }),
    effects: { wealth: +3, happiness: +2, social: +1 },
  },
  {
    id: 'migration_far_from_family',
    title: '隔著距離的家人',
    ages: [18, 70],
    once: false,
    cooldown: 6,
    weight: 0.8,
    tags: ['migration', 'homesick', 'family'],
    cond: (s, h) => h.isMigrant(),
    text: (s, h) => (h.yearIn(2012, 3000)
      ? '你和家人視訊，螢幕裡的臉有時凍住，有時延遲。家人搶著對鏡頭揮手。掛掉後，房間裡忽然很靜，你把剛才那個畫面截了圖。'
      : h.yearIn(1996, 2011)
        ? '你買了一張電話卡，在公用電話亭撥長途。投下的每一分鐘都像錢在燒，你和家人把最重要的話擠進十分鐘，掛電話後才想起忘了問最想問的那件事。'
        : '你把信寫了又撕，撕了又寫，最後寄出去的只有薄薄一頁。回信要等一個月，你每天都去看信箱。信封上的郵票，是你特地挑過的。'),
    effects: { happiness: -3, social: -1, wealth: -1 },
  },
  // =====================================================================================
  // C2. 留在原處的人（Phase 6B）：孩子、伴侶與父母不在身邊的日子
  // =====================================================================================
  {
    // Scheduled by the engine the year after somebody was left behind (or sent away): systems.js depart() / sendFamilyAway().
    id: 'migration_apart_first_year',
    followCond: (s, h) => !!h.leftBehind() && (h.childrenApart().length > 0 || (h.apartFrom('partner') && h.leftBehind().partner)),
    title: '分開的第一年',
    once: false,
    cooldown: 5,
    ages: [18, 70],
    weight: 0,
    tags: ['migration', 'family', 'followup', 'homesick'],
    text: (s, h) => {
      const lb = h.leftBehind() || {};
      const kids = h.childrenApart();
      const link = linkOf(h);
      const who = h.caregiverOfChildren();
      const kid = youngestApart(s, h) || { ...NOBODY, birthYear: s.year - 6 };
      const sent = lb.mode === 'sent';
      const kidsWord = kidsPhrase(kids.length);
      const room = h.isMigrant() ? `${h.countryName()}的宿舍` : `${h.city()}的出租屋`;
      const first = h.isMigrant() ? '你離開家的第一年' : '你進城的第一年';
      if (sent) {
        return kids.length || lb.partner
          ? `${lb.partner ? h.partnerName() : kidsWord}離開後，家裡安靜得不像自己的家。你每天最先做的事，是看有沒有新的消息，最後做的事，是${link.how}確認他們平安。${lb.partner && kids.length ? `${kids[0].name}在${link.far}報平安時，聲音聽起來比以前懂事了。` : ''}`
          : '家人走後，你一個人守著空下來的屋子。';
      }
      if (kids.length && who === '伴侶') {
        return `${first}，${kidsWord}留在家鄉，由${h.partnerName()}一個人帶著。你在${room}裡等${link.wait}，${link.how === '寫信' ? `${kid.name}的字跡一次比一次工整` : `${kid.name}的聲音一次比一次大`}，你卻一次比一次更不敢問「想不想我」。`;
      }
      if (kids.length && who === '孩子的祖父母') {
        return `${first}，${kidsWord}留在家鄉，交給祖父母帶著。${link.how === '寫信' ? `信裡夾著${kid.name}歪歪扭扭的塗鴉，你把信紙貼在胸口，貼到發皺，才捨得折起來。` : `${link.far}傳來${kid.name}${kid.birthYear >= s.year - 5 ? '口齒不清的撒嬌' : '搶著報告的聲音'}，你把${link.device === '手機' ? '手機' : '話筒'}貼在耳朵上，貼到發燙，才捨得掛斷。`}`;
      }
      if (kids.length) {
        return `${first}，${kidsWord}託給家鄉的親戚照顧。每個月寄錢的那一天，你都要在${link.how === '寫信' ? '信' : link.how}裡問三次「有沒有吃飽」，那是你唯一能替${kid.name}做的事。`;
      }
      return `${first}，${h.partnerName()}留在家鄉等你。你們靠${link.how === '寫信' ? '一封封信' : link.how}過日子，說的都是天氣、價錢和「保重」，真正想說的那幾句，總在${link.how === '寫信' ? '信寄出之後' : '掛斷之後'}才浮上來。`;
    },
    effects: { happiness: -3, social: -1, wealth: +1 },
  },
  {
    id: 'migration_missed_birthday',
    title: '隔著螢幕的生日',
    ages: [21, 55],
    once: false,
    cooldown: 4,
    weight: 0.9,
    tags: ['migration', 'family', 'children', 'homesick'],
    cond: (s, h) => h.isMigrant() && h.childrenApart().length > 0 && !h.displaced(),
    text: (s, h) => {
      const kid = youngestApart(s, h) || { ...NOBODY, birthYear: s.year - 6 };
      const age = s.year - kid.birthYear;
      const link = linkOf(h);
      const who = h.caregiverOfChildren() === '伴侶' ? h.partnerName() : h.caregiverOfChildren() === '孩子的祖父母' ? '祖父母' : '家裡的人';
      if (link.how === '視訊') return `${kid.name}滿${age}歲的那天，你${h.wageEarner() ? '加班' : '忙'}到很晚，趕在對方睡著前撥了視訊。蛋糕上的蠟燭早就吹熄了，${who}把鏡頭轉過來，孩子隔著螢幕對你揮手，說：「你唱得好難聽。」你還是把整首生日快樂唱完，唱到最後一句，聲音有點抖。`;
      if (link.how === '電話') return `${kid.name}滿${age}歲的那天，你排了很久的隊，才打通那通越洋電話。電話卡的分鐘數一格一格往下掉，${who}把話筒遞給孩子，孩子只說了一句「謝謝${h.male() ? '爸爸' : '媽媽'}」就跑開了，你握著話筒，聽見背景裡有人在切蛋糕。`;
      return `${kid.name}滿${age}歲的那天，你把存了三個月的錢匯回去，又寫了一封很長的信。信要一個多月才會到，等孩子拆開時，生日早已過去，你只能想像那天他們會不會在桌上多放一副碗筷。`;
    },
    effects: { happiness: -3, social: -1, wealth: -1 },
  },
  {
    id: 'migration_school_fees_remit',
    title: '寄回去的學費',
    ages: [22, 60],
    once: false,
    cooldown: 5,
    weight: 0.8,
    tags: ['migration', 'family', 'children', 'money'],
    cond: (s, h) => h.isMigrant() && working(h) && richerThanHome(s, h) && apartAges(s, h).some((a) => a >= 5 && a <= 17),
    text: (s, h) => {
      const kid = h.childrenApart().find((c) => s.year - c.birthYear >= 5) || h.childrenApart()[0] || NOBODY;
      const who = h.caregiverOfChildren() === '伴侶' ? h.partnerName() : h.caregiverOfChildren() === '孩子的祖父母' ? '孩子的祖父母' : '家裡的人';
      return `開學前，${who}在${linkOf(h).how === '寫信' ? '信裡' : linkOf(h).far}報了學費和制服的數字。你把這個月的薪水扣掉房租和伙食，剩下的全匯了回去，只留下幾個硬幣。收據上寫的是${kid.name}的名字，你把那張紙${h.techReady(2005) ? '拍下來存在手機裡' : '折好夾進小本子'}，在宿舍的床邊坐了很久：${kid.name}可以安心上學，這就是你為什麼在這裡。`;
    },
    effects: { wealth: -2, happiness: +2, social: +1 },
  },
  {
    id: 'migration_parent_far_illness',
    title: '病床在很遠的地方',
    ages: [28, 68],
    weight: 0.7,
    tags: ['migration', 'family', 'parents', 'caregiving'],
    cond: (s, h) => h.isMigrant() && h.parentsFar() && Math.max(s.family.mother.alive ? s.family.mother.age : 0, s.family.father.alive ? s.family.father.age : 0) >= 62 && !h.has('m_parent_far'),
    text: (s, h) => {
      const link = linkOf(h);
      const who = h.siblings() > 0 ? '手足' : '鄰居';
      const news = link.how === '寫信' ? `一封蓋著加急戳記的電報送到宿舍門口，是${who}發來的：` : `深夜，${link.far}傳來${who}壓低的聲音：`;
      return `${news}${h.parentsOr('長輩')}住院了，醫生說要觀察一陣子。你${link.how === '寫信' ? '捏著那張薄薄的電報紙' : `握著${link.device}`}站在${h.countryName()}的宿舍走廊，離病房有一整片海那麼遠。請假要經過許多手續，機票貴得離譜，身邊的人都說「你先顧好自己」。`;
    },
    choices: [
      {
        label: '請假、買機票，飛回去守幾天',
        effects: { wealth: -4, social: +3, happiness: -1, health: -1 },
        set: ['m_parent_far'],
        result: (s, h) => `你搭了最早的一班飛機回去，在病床邊守了十天。${h.parentsOr('長輩')}睜開眼睛看見你，第一句話是：「你怎麼回來了，工作怎麼辦？」你笑著說沒事，回程那天，機場的出境隊伍好長。`,
        ai: (s, h) => (h.stat('wealth') > 35 ? 1.5 : 0.8),
      },
      {
        label: '寄錢回去，請手足先照顧',
        effects: { wealth: -3, happiness: -3, social: 0 },
        set: ['m_parent_far'],
        result: (s, h) => `你把存款轉給${h.siblings() > 0 ? '手足' : '鄰居'}，${linkOf(h).how === '寫信' ? '一天發兩封電報' : '一天打兩次電話'}問病情。你沒能在病床邊，只能在${h.countryName()}把${linkOf(h).how === '視訊' ? '手機' : '電話'}放在枕頭旁，這樣再遠的鈴聲你都不會漏掉。`,
        ai: (s, h) => (h.isPoor() ? 1.6 : 1),
      },
      {
        label: '每天視訊，等狀況穩定再說',
        cond: (s, h) => h.techReady(2012),
        effects: { happiness: -2, social: +1, wealth: -1 },
        set: ['m_parent_far'],
        result: (s, h) => `你每天晚上固定視訊，手足把鏡頭對準病床。${h.parentsOr('長輩')}說${h.parentsPresent() === 'both' ? '他們' : h.parentsPresent() === 'mother' ? '她' : '他'}看到你就夠了，叫你別再亂花錢。你點頭，視訊掛斷後，把房間的燈關了很久才睡。`,
        ai: 1.2,
      },
    ],
  },
  {
    id: 'migration_couple_apart_choice',
    title: '兩個國家的婚姻',
    ages: [24, 60],
    weight: 0.7,
    tags: ['migration', 'family', 'marriage', 'chain'],
    cond: (s, h) => h.isMigrant() && h.coupleApart() && h.yearsAbroad() >= 2 && !h.has('m_couple_decided') && !h.displaced(),
    text: (s, h) => `你和${h.partnerName()}已經隔著國界過了好幾年。${linkOf(h).how}裡講的都是帳單、孩子和誰家辦了喜事，${linkOf(h).how === '寫信' ? '信尾那句「保重」' : '睡前那句「晚安」'}變得像一道固定的手續。有一天${h.partnerHe()}輕輕地問：「我們這樣，還要多久？」`,
    choices: [
      {
        label: '想辦法把伴侶接過來一起生活',
        cond: (s, h) => !h.has('m_irregular') && !h.has('m_refugee'),
        effects: (s, h) => { const r = h.reunite({ kids: false }); h.change('wealth', -3); h.change('happiness', r.partner ? +4 : 0); h.change('social', +2); },
        set: ['m_couple_decided'],
        result: (s, h) => (h.livesWith('partner')
          ? `文件跑了大半年，${h.partnerName()}終於拖著行李站在你的門口。小小的房間第一次有了兩個人的聲音，你們笑著說，連吵架都好懷念。`
          : '申請遇到了卡關，你補了好幾份文件。晚上你對著螢幕說「再等等」，其實是在對自己說。'),
        ai: (s, h) => (h.stat('wealth') > 40 ? 1.7 : 1),
      },
      {
        label: '每年請假回去，維持現在的樣子',
        effects: { happiness: -1, social: +1, wealth: -1 },
        set: ['m_couple_decided'],
        result: '你把一年裡最長的假全留給家鄉。每次見面像是重新認識一遍，臨走前一晚，兩個人都不太說話，只是把行李箱拉鍊拉開又拉上。',
        ai: 1.1,
      },
      {
        label: '說好再撐幾年，就回家',
        effects: { happiness: +1, wealth: +1, social: 0 },
        set: ['m_couple_decided', 'm_promise_return'],
        result: (s, h) => `你們在${linkOf(h).how === '視訊' ? '螢幕前' : linkOf(h).how === '電話' ? '電話裡' : '信裡'}約定了一個年份，把它寫在日曆的角落。有了日期，等待的人和被等待的人，都比較有力氣把日子過下去。`,
        ai: 1.5,
      },
    ],
  },
  {
    // Scheduled by the engine when a family that had been apart for a year or more lives together again (systems.js returnHome()).
    id: 'migration_return_reunion',
    title: '回到家的第一晚',
    once: false,
    cooldown: 5,
    ages: [20, 78],
    weight: 0,
    tags: ['migration', 'family', 'followup', 'return'],
    followCond: (s, h) => { const r = h.lastReunion(); return !!r && s.year - r.year <= 1 && r.how === 'return' && (r.partner || s.children.some((c) => c.alive !== false && r.kids.includes(c.name))); }, // a child who died in the meantime is not at the door
    text: (s, h) => {
      const r = h.lastReunion() || { kids: [], partner: false, apartYears: 0 };
      const kids = s.children.filter((c) => c.alive !== false && r.kids.includes(c.name));
      const youngest = kids.length ? kids.reduce((a, b) => (b.birthYear > a.birthYear ? b : a)) : null;
      const age = youngest ? s.year - youngest.birthYear : 0;
      if (youngest && r.apartYears >= 2 && age <= 8) {
        return `你推開家門，${youngest.name}站在門邊盯著你看了好一會兒，然後轉頭小聲問身後的大人：「這個人是誰？」你蹲下來，張開手，心裡像被人用力捏了一下。那天晚上，孩子睡在離你最遠的那一邊，半夜卻悄悄把一隻腳伸過來，抵住你的小腿。`;
      }
      if (youngest && r.partner && h.hasPartner()) return `你們回到了同一個屋簷下。${h.partnerName()}把${kidsPhrase(kids.length)}叫到你面前，孩子的個頭比你記得的高了許多，第一頓飯，大家都客客氣氣的，像是在互相打聽彼此的近況。`;
      if (youngest) return `${youngest.name}長高了，聲音也變了，站在你面前竟然有點拘謹。你們吃了第一頓飯，沒有人知道該先說什麼，最後是孩子夾了一塊菜放進你碗裡，什麼也沒說。`;
      if (!h.hasPartner()) return `你回到了家，屋子比你記得的小了一點。親人們輪流來看你，桌上的飯菜一道接著一道，沒有人問你這些年好不好，只是不停地替你夾菜。`;
      return `你回到了家，${h.partnerName()}已經把飯菜擺好。這麼多年，你們第一次不必掛斷電話就能看著對方的臉。你們有好多話要說，卻只是安靜地吃完了那一頓飯。`;
    },
    effects: (s, h) => { h.change('happiness', +3); h.change('social', +2); h.change('wealth', -1); },
  },
  {
    id: 'migration_ethnic_community',
    title: '同鄉會的燈',
    ages: [18, 66],
    weight: 1,
    tags: ['migration', 'community'],
    cond: (s, h) => h.isMigrant() && !h.has('m_community'),
    text: (s, h) => '有天你路過一家掛著熟悉文字的小店，推門進去，聞到熟悉的氣味。店老闆說週末有聚會，大家會帶菜、談工作、介紹彼此的親戚。你鼓起勇氣去了，結果連續去了好幾年。',
    effects: { social: +5, happiness: +3 },
    set: ['m_community'],
  },
  {
    id: 'migration_neighbor_kindness',
    title: '陌生人的善意',
    ages: [18, 66],
    once: false,
    cooldown: 10,
    weight: 0.5,
    tags: ['migration', 'community'],
    cond: (s, h) => h.isMigrant(),
    text: (s, h) => '你生病的那一週，隔壁的鄰居敲門，端來一鍋熱湯，連湯勺都沒忘記帶。你們幾乎不曾說過話，對方只簡單地說：「我也曾經一個人。」你捧著那碗湯，坐在門口喝完。',
    effects: { social: +4, happiness: +4 },
  },
  {
    id: 'migration_new_arrival_help',
    title: '換你伸出手',
    ages: [24, 68],
    weight: 0.8,
    tags: ['migration', 'community'],
    cond: (s, h) => h.isMigrant() && h.has('m_community'),
    text: (s, h) => '一個剛來的年輕人在同鄉會上，不知所措地看著你。你想起自己剛到的樣子，於是走過去，替對方找房、陪著去辦手續，最後還借了一副鍋碗。對方說謝謝，你說：「以後換你幫別人。」',
    effects: { social: +4, happiness: +3, wealth: -1 },
  },
  {
    id: 'migration_citizenship',
    title: '宣誓的那天',
    ages: [27, 64],
    weight: 0.8,
    tags: ['migration', 'identity'],
    cond: (s, h) => h.isMigrant() && !h.has('m_citizen') && !h.has('m_refugee'),
    text: (s, h) => `你在${h.countryName()}住了這麼久，辦居留的表格、續證的日子，已經變成生活的一部分。有人問你要不要乾脆申請成為這裡的公民。表格上有一欄：你願意放棄原來的身分嗎？`,
    choices: [
      {
        label: '申請成為公民',
        effects: (s, h) => { if (h.chance(0.8)) { h.set('m_citizen'); h.change('happiness', +4); h.change('social', +2); h.change('wealth', -1); } else { h.change('happiness', -2); h.change('wealth', -1); } },
        result: (s, h) => (h.has('m_citizen')
          ? '宣誓那天，會場上有許多不同口音的人，大家一起念出同一段話。你的聲音在抖，旁邊的人遞來一張面紙，你笑著接過。'
          : '申請遇到了延遲，你補了一些文件，想著再等一等。你知道自己的決定很認真，只是時間不由你控制。'),
        highlight: (s, h) => (h.has('m_citizen') ? `成為${h.countryName()}的公民。` : null),
        ai: 1.6,
      },
      {
        label: '保持現狀，維持居留身分',
        effects: { happiness: 0, social: 0, wealth: +1 },
        set: ['m_citizen'],
        result: '你選擇保留原本的身分，繼續辦居留。心裡有一部分說「以後再說」，另一部分說「我還沒準備好」。你知道，歸屬這件事，不是紙面上的蓋章就能解決的。',
        ai: 1.1,
      },
    ],
  },
  {
    id: 'migration_funeral_abroad',
    title: '來不及的告別',
    ages: [24, 70],
    weight: 0.7,
    tags: ['migration', 'family', 'grief'],
    cond: (s, h) => h.isMigrant() && (!h.parentAlive('mother') || !h.parentAlive('father')) && !h.has('m_funeral'),
    text: (s, h) => '凌晨，家鄉來的電話。家族裡一位很親的長輩過世了，葬禮在三天後。機票貴得離譜，請假又要經過許多手續。你握著電話，聽著親人壓低的哭聲，說不出話。',
    choices: [
      {
        label: '買最快的機票飛回去',
        effects: { wealth: -4, social: +4, happiness: -2 },
        set: ['m_funeral'],
        result: '你趕上了最後一場儀式。家人看到你的那一刻，所有人都哭了。回程的飛機上，你看著雲海，覺得那些離開的歲月，都在這幾天被補回來。',
        ai: (s, h) => (h.stat('wealth') > 35 ? 1.6 : 0.9),
      },
      {
        label: '只能遠遠地參加儀式',
        effects: { wealth: 0, happiness: -4, social: -1 },
        set: ['m_funeral'],
        result: '你一個人坐在小房間裡，聽著電話那頭傳來的誦念聲。你跟著念，朝著家鄉的方向鞠躬。結束後，房間靜得只剩你自己的呼吸。',
        ai: 1,
      },
    ],
  },
  {
    id: 'migration_visit_home',
    title: '回去看看',
    ages: [24, 70],
    once: false,
    cooldown: 10,
    weight: 0.7,
    tags: ['migration', 'homesick', 'travel', 'family'],
    cond: (s, h) => h.isMigrant() && (h.siblings() > 0 || h.parentsAlive() > 0 || h.childrenApart().length > 0 || h.coupleApart()),
    text: (s, h) => {
      const kid = youngestApart(s, h);
      const home = h.childrenApart().length || h.coupleApart();
      const tail = kid && s.year - kid.birthYear <= 9
        ? `${kid.name}躲在${h.caregiverOfChildren() === '伴侶' ? h.partnerName() : '大人'}的腿後面，看了你好一會兒，才肯把手伸過來。你在老家的屋頂下睡了幾晚，臨走前，孩子問你下次什麼時候回來，你答不出來。`
        : h.coupleApart() ? `${h.partnerName()}替你把房間收拾得跟你離開時一模一樣。你在老家的屋頂下睡了幾晚，兩個人話不多，很多事只是坐在一起就夠了。` : '你在老家的屋頂下睡了幾晚，才慢慢找回口音。';
      return `你隔了${h.yearsAbroad() >= 3 ? '好幾年' : '一陣子'}才請到假回${homeName(s)}。巷口的店換了招牌，認識的人老了，連你記得的路都改了。${home ? '' : '親戚們把你當客人，招待得周到，也有一點生疏。'}${tail}`;
    },
    effects: { happiness: +2, social: +2, wealth: -2 },
  },
  {
    id: 'migration_second_gen',
    title: '孩子的兩種語言',
    ages: [28, 62],
    weight: 0.8,
    tags: ['migration', 'children', 'identity'],
    cond: (s, h) => h.isMigrant() && h.minorsWithYou().length > 0,
    text: (s, h) => `${(h.minorsWithYou()[0] || { name: '孩子' }).name}在學校說著當地語言，回到家有時用你聽不太懂的俚語。你努力用家鄉話跟孩子聊天，孩子用生疏的口音回你。你們都在學對方的語言，也在學同一種愛。`,
    effects: { happiness: +2, social: +2, knowledge: +1 },
  },
  {
    id: 'migration_return_decision',
    title: '要不要回家',
    ages: [35, 64],
    weight: (s, h) => 0.8 + (h.childrenApart().length || h.coupleApart() ? 0.6 : 0) + (h.has('m_promise_return') ? 0.8 : 0),
    tags: ['migration', 'return', 'chain'],
    cond: (s, h) => h.isMigrant() && !h.has('m_returned') && !h.has('m_return_decided') && !h.has('m_refugee'),
    text: (s, h) => `你在${h.countryName()}已經待了這麼多年，這裡有工作、朋友，也有了習慣的日子。但某個傍晚，你聞到街角的某種氣味，忽然很想念家鄉的天空。你問自己：我是在等什麼時候回家，還是已經在家了？`,
    choices: [
      {
        label: '回家鄉定居',
        effects: (s, h) => { moveTo(s, h, s.homeCountryCode); h.set('m_returned'); h.change('happiness', +3); h.change('social', +5); h.change('wealth', -2); },
        set: ['m_return_decided'],
        result: (s, h) => `你把這些年的家當打包，一箱箱寄回${homeName(s)}。踏進老家那一刻，空氣的味道是對的，只是你發現自己也變了，連家都要重新認識你。`,
        highlight: (s, h) => `離開異鄉，回到${homeName(s)}定居。`,
        schedule: [{ id: 'migration_return_readjust', inYears: [1, 2] }, { id: 'migration_return_business', inYears: [1, 3] }],
        ai: (s, h) => (h.stat('happiness') < 45 ? 1.5 : 0.9),
      },
      {
        label: '留在這裡，把這裡當成家',
        effects: { happiness: +2, social: +1 },
        set: ['m_return_decided'],
        result: '你決定不再說「暫時」。你把家鄉的照片換了相框，把新的鄰居請來家裡，煮了一桌混合了兩個地方的菜。',
        ai: 1.6,
      },
      {
        label: '兩邊各住一段時間',
        effects: { wealth: -2, social: +2, happiness: +1 },
        set: ['m_return_decided', 'm_circular'],
        result: '你安排好每年有幾個月回家鄉度過。兩邊的生活都有一半是你的，也都有一半不是——但這也許正是你的樣子。',
        ai: 1,
      },
    ],
  },
  {
    id: 'migration_return_readjust',
    followCond: (s, h) => !h.isMigrant(),
    title: '回來之後的陌生感',
    ages: [24, 70],
    weight: 0,
    tags: ['migration', 'return', 'followup'],
    text: (s, h) => '你以為回家會像把鑰匙插進鎖孔那麼簡單，結果發現鎖換了、鄰居換了、連你自己的習慣都和這裡有點對不上。有一天，有人說你「像外國人」，你笑著反駁，晚上卻失眠了。',
    effects: { happiness: -2, social: +2, knowledge: +1 },
  },
  {
    id: 'migration_return_business',
    followCond: (s, h) => !h.isMigrant(),
    title: '帶回來的積蓄',
    ages: [24, 70],
    weight: 0,
    tags: ['migration', 'return', 'followup', 'business'],
    text: (s, h) => '你帶回來一筆積蓄，也帶回來外面的經驗。巷口有人問：「你在外面學了什麼？要不要在這裡做點事？」這筆錢，也許是你前半生最重要的一次賭注。',
    choices: [
      {
        label: '開店或做生意',
        cond: (s, h) => !h.isMigrant() && h.has('m_returned'),
        effects: (s, h) => {
          h.startJob(h.pick(['shopkeeper', 'entrepreneur', 'artisan']));
          if (h.chance(0.55)) { h.change('wealth', +5); h.change('happiness', +4); h.set('m_biz_ok'); } else { h.change('wealth', -4); h.change('happiness', -2); h.unset('m_biz_ok'); }
        },
        result: (s, h) => (h.has('m_biz_ok')
          ? '店面不大，開張那天，鄰居全來了。你在櫃檯後面忽然懂了：離開這麼多年，是為了有一天能在這裡站穩。'
          : '生意比想像中難，客人與供貨都需要時間建立。你不氣餒，因為你已經走過更難的日子。'),
        unset: ['m_biz_ok'],
        ai: 1.4,
      },
      {
        label: '蓋房子或買地，先安頓家人',
        cond: (s, h) => !h.isMigrant() && h.has('m_returned'),
        effects: { wealth: -3, happiness: +4, social: +3 },
        result: '你把積蓄投進一棟有院子的房子。完工那天，全家人站在門口拍了一張照片，照片裡的每個人都笑得很用力。',
        ai: 1.4,
      },
      {
        label: '找一份穩定的工作，把錢留著',
        cond: (s, h) => !h.isMigrant() && h.has('m_returned'),
        effects: (s, h) => { if (!h.employed()) h.startJob(h.eduAtLeast('secondary') ? 'clerk' : 'laborer'); h.change('wealth', +2); h.change('happiness', +1); },
        result: '你選擇了比較保守的路。每個月領到薪水，你把一半放進帳戶，看著它慢慢變大，有種奇妙的安心。',
        ai: 1.3,
      },
    ],
  },
];
