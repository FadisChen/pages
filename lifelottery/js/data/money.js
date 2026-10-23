// Local money for narration: turns an amount in constant 2011 international dollars (PPP, the unit the game's incomes are
// kept in, see engine annualIncome) into a natural zh-Hant amount in the local currency of the place and year.
//
//   moneyText('TWN', 2026, 2000)        -> '新台幣三萬元'
//   moneyText('JPN', 2026, 200)         -> '2 萬日圓'
//   moneyText('NGA', 2026, 50)          -> '5,000 奈拉'   (about; see the estimates below)
//   moneyText('USA', 2026, 300)         -> '300 美元'
//
// ESTIMATES. PPP is the number of local currency units that bought what one international dollar bought in the US in 2011
// (World Bank ICP 2011 conversion factors as I remember them, rounded; a few redenominated currencies are given in today's
// units). `INFL` is a rough cumulative price rise 2011 -> 2025 per country, and the other years use a simple constant
// inflation by income group (PAST_RATE before 2011, FUTURE_RATE after 2025): amounts in 1965 are smaller numbers, amounts in
// 2060 bigger. The aim is a believable-looking figure, not an exchange rate. Euro-area countries use their old currency
// before they joined the euro.

import { BY_CODE } from './countries.js';

/** code: [name, ppp] ; name is the plural-free zh-Hant currency word used after the number */
const CUR = {
  USA: ['美元', 1], PRI: ['美元', 1], ECU: ['美元', 0.5], SLV: ['美元', 0.5], PAN: ['美元', 0.55], TLS: ['美元', 0.5], ZWE: ['美元', 0.45], SOM: ['美元', 0.4],
  DEU: ['歐元', 0.78], FRA: ['歐元', 0.81], ITA: ['歐元', 0.74], ESP: ['歐元', 0.68], NLD: ['歐元', 0.83], BEL: ['歐元', 0.82], AUT: ['歐元', 0.81], FIN: ['歐元', 0.89],
  IRL: ['歐元', 0.84], PRT: ['歐元', 0.6], GRC: ['歐元', 0.62], SVK: ['歐元', 0.52], SVN: ['歐元', 0.6], EST: ['歐元', 0.54], LVA: ['歐元', 0.51], LTU: ['歐元', 0.47],
  LUX: ['歐元', 0.9], MLT: ['歐元', 0.6], CYP: ['歐元', 0.72], HRV: ['歐元', 0.5], MNE: ['歐元', 0.35], XKX: ['歐元', 0.32],
  GBR: ['英鎊', 0.7], CHE: ['瑞士法郎', 1.4], SWE: ['瑞典克朗', 8.7], NOR: ['挪威克朗', 9.5], DNK: ['丹麥克朗', 7.3], POL: ['茲羅提', 1.8], CZE: ['捷克克朗', 13],
  HUN: ['福林', 125], ROU: ['羅馬尼亞列伊', 1.7], BGR: ['保加利亞列弗', 0.8], SRB: ['塞爾維亞第納爾', 38], BIH: ['可兌換馬克', 0.8], ALB: ['列克', 45],
  MKD: ['代納爾', 20], MDA: ['摩爾多瓦列伊', 5.2], UKR: ['格里夫納', 3.2], BLR: ['白俄羅斯盧布', 0.33], RUS: ['盧布', 17], GEO: ['拉里', 0.9], ARM: ['德拉姆', 150],
  AZE: ['馬納特', 0.5], KAZ: ['堅戈', 75], UZB: ['索姆', 1300], KGZ: ['索姆', 17], TJK: ['索莫尼', 2], TKM: ['馬納特', 1.4], MNG: ['圖格里克', 650],
  JPN: ['日圓', 104], KOR: ['韓元', 860], CHN: ['元', 3.5, '人民幣', true], TWN: ['元', 15.5, '新台幣', true], HKG: ['元', 5.8, '港幣', true], MAC: ['元', 5, '澳門幣', true],
  SGP: ['新加坡元', 0.83], MYS: ['令吉', 1.5], THA: ['泰銖', 13], VNM: ['越南盾', 7500], KHM: ['瑞爾', 1300], LAO: ['基普', 3000], MMR: ['緬元', 380], PHL: ['披索', 18],
  IDN: ['印尼盾', 3700], IND: ['盧比', 15], PAK: ['巴基斯坦盧比', 28], BGD: ['塔卡', 25], LKA: ['斯里蘭卡盧比', 40], NPL: ['尼泊爾盧比', 30], BTN: ['努爾特魯姆', 20],
  MDV: ['拉菲亞', 9.5], AFG: ['阿富汗尼', 17], PRK: ['北韓圜', 60],
  TUR: ['土耳其里拉', 0.95], IRN: ['托曼', 500], IRQ: ['伊拉克第納爾', 500], SYR: ['敘利亞鎊', 25], LBN: ['黎巴嫩鎊', 700], JOR: ['約旦第納爾', 0.35], ISR: ['新謝克爾', 3.7],
  PSE: ['謝克爾', 2], SAU: ['沙烏地里亞爾', 2.1], ARE: ['迪拉姆', 2.4], QAT: ['卡達里亞爾', 2.6], KWT: ['科威特第納爾', 0.2], BHR: ['巴林第納爾', 0.25], OMN: ['阿曼里亞爾', 0.25],
  YEM: ['葉門里亞爾', 100], EGY: ['埃及鎊', 2.3], LBY: ['利比亞第納爾', 0.5], TUN: ['突尼西亞第納爾', 0.65], DZA: ['阿爾及利亞第納爾', 40], MAR: ['迪拉姆', 4.2],
  NGA: ['奈拉', 90], GHA: ['塞地', 0.85], CIV: ['西非法郎', 230], SEN: ['西非法郎', 230], BEN: ['西非法郎', 230], BFA: ['西非法郎', 230], MLI: ['西非法郎', 230], NER: ['西非法郎', 230],
  TGO: ['西非法郎', 230], GNB: ['西非法郎', 230], CMR: ['中非法郎', 260], TCD: ['中非法郎', 260], CAF: ['中非法郎', 260], COG: ['中非法郎', 260], GAB: ['中非法郎', 350], GNQ: ['中非法郎', 330],
  KEN: ['肯亞先令', 40], TZA: ['坦尚尼亞先令', 780], UGA: ['烏干達先令', 1000], RWA: ['盧安達法郎', 270], BDI: ['蒲隆地法郎', 750], ETH: ['比爾', 7], ERI: ['納克法', 10],
  DJI: ['吉布地法郎', 80], SDN: ['蘇丹鎊', 1.7], SSD: ['南蘇丹鎊', 1.2], COD: ['剛果法郎', 450], AGO: ['寬扎', 80], ZMB: ['克瓦查', 2.4], MWI: ['馬拉威克瓦查', 150],
  MOZ: ['梅蒂卡爾', 17], MDG: ['阿里亞里', 800], BWA: ['普拉', 4], NAM: ['納米比亞元', 5], ZAF: ['蘭特', 5], LSO: ['洛蒂', 5], SWZ: ['里蘭吉尼', 5], MUS: ['模里西斯盧比', 17],
  COM: ['葛摩法郎', 190], CPV: ['埃斯庫多', 55], GIN: ['幾內亞法郎', 3000], SLE: ['利昂', 3], LBR: ['賴比瑞亞元', 45], GMB: ['達拉西', 15], MRT: ['烏吉亞', 10],
  MEX: ['墨西哥披索', 8], BRA: ['雷亞爾', 1.7], ARG: ['阿根廷披索', 3], CHL: ['智利披索', 380], COL: ['哥倫比亞披索', 1250], PER: ['索爾', 1.6], VEN: ['玻利瓦', 3],
  BOL: ['玻利維亞諾', 2.8], PRY: ['瓜拉尼', 2300], URY: ['烏拉圭披索', 15], GTM: ['格查爾', 4], HND: ['倫皮拉', 10], NIC: ['科多巴', 9], CRI: ['科朗', 350],
  DOM: ['多明尼加披索', 20], CUB: ['古巴披索', 8], HTI: ['古德', 20], JAM: ['牙買加元', 70], TTO: ['千里達元', 3.5], GUY: ['蓋亞那元', 100], SUR: ['蘇利南元', 2],
  AUS: ['澳幣', 1.5], NZL: ['紐西蘭元', 1.5], FJI: ['斐濟元', 1], PNG: ['基那', 1.9], SLB: ['所羅門元', 5.5],
  CAN: ['加幣', 1.2],
};

/** Euro-area countries before the euro: [old currency, units per euro, first year of the euro]. */
const LEGACY = {
  DEU: ['馬克', 1.95583, 1999], FRA: ['法郎', 6.55957, 1999], ITA: ['里拉', 1936.27, 1999], ESP: ['比塞塔', 166.386, 1999], NLD: ['盾', 2.20371, 1999], BEL: ['比利時法郎', 40.3399, 1999],
  AUT: ['先令', 13.7603, 1999], FIN: ['馬克', 5.94573, 1999], IRL: ['愛爾蘭鎊', 0.787564, 1999], PRT: ['埃斯庫多', 200.482, 1999], GRC: ['德拉克馬', 340.75, 2001], SVK: ['斯洛伐克克朗', 30.126, 2009],
  SVN: ['托拉爾', 239.64, 2007], EST: ['愛沙尼亞克朗', 15.6466, 2011], LVA: ['拉特', 0.702804, 2014], LTU: ['立特', 3.4528, 2015], LUX: ['盧森堡法郎', 40.3399, 1999], MLT: ['馬爾他里拉', 0.4293, 2008],
  CYP: ['賽普勒斯鎊', 0.585274, 2008], HRV: ['庫納', 7.5345, 2023], MNE: ['馬克', 1.95583, 2002], XKX: ['馬克', 1.95583, 2002],
};

/** Cumulative nominal price rise 2011 -> 2025 (default by income group below). */
const INFL = {
  USA: 1.45, GBR: 1.5, DEU: 1.35, FRA: 1.28, ITA: 1.25, ESP: 1.28, JPN: 1.12, KOR: 1.35, CHN: 1.4, TWN: 1.15, HKG: 1.3, SGP: 1.3, CHE: 1.05, THA: 1.3, MYS: 1.35, VNM: 2, IDN: 1.9, PHL: 1.7,
  IND: 2.1, PAK: 4, BGD: 2.3, LKA: 4.5, NPL: 2.2, TUR: 28, ARG: 700, IRN: 30, EGY: 5.5, NGA: 6, GHA: 9, ETH: 9, SDN: 80, LBN: 150, SYR: 300, YEM: 20, VEN: 50, MMR: 5, AFG: 2, UKR: 4.5, RUS: 3,
  KAZ: 3.2, UZB: 5, AZE: 1.8, MWI: 12, ZMB: 4, ZWE: 1.5, COD: 6, AGO: 8, MOZ: 3, MDG: 3, SSD: 200, ECU: 1.3, SLV: 1.4, PAN: 1.3, PRI: 1.3, TLS: 1.4, SOM: 1.5,
};
const INFL_BY_INCOME = { H: 1.3, UM: 1.9, LM: 2.4, L: 2.8 };
const PAST_RATE_BY_INCOME = { H: 0.035, UM: 0.08, LM: 0.09, L: 0.09 };
const PAST_RATE = { JPN: 0.022, CHE: 0.028, DEU: 0.028, FRA: 0.04, GBR: 0.06, USA: 0.04, TWN: 0.04, KOR: 0.08, CHN: 0.06, SGP: 0.03, HKG: 0.05 };
const FUTURE_RATE_BY_INCOME = { H: 0.025, UM: 0.04, LM: 0.05, L: 0.06 };
const FUTURE_RATE = { JPN: 0.012, CHE: 0.01, DEU: 0.02, TWN: 0.015, KOR: 0.02, CHN: 0.025 };

/** Nominal price level of a country in `year` relative to 2011 (= 1). */
export function priceIndex(code, year) {
  const c = BY_CODE[code];
  const inc = c ? c.income : 'UM';
  const y = Math.max(1940, Math.min(2100, year));
  if (y <= 2011) return Math.exp(-(PAST_RATE[code] ?? PAST_RATE_BY_INCOME[inc]) * (2011 - y));
  const infl = INFL[code] ?? INFL_BY_INCOME[inc];
  if (y <= 2025) return Math.pow(infl, (y - 2011) / 14);
  return infl * Math.exp((FUTURE_RATE[code] ?? FUTURE_RATE_BY_INCOME[inc]) * (y - 2025));
}

/** { name (word after the number), pre (prefix word or ''), zh (Chinese numerals), ppp } for a country in a year (old currencies before the euro). */
export function currencyOf(code, year) {
  const rec = CUR[code] || CUR.USA;
  const leg = LEGACY[code];
  if (leg && year < leg[2]) {
    // old currency: units per euro x euro PPP
    return { name: leg[0], pre: '', zh: false, ppp: rec[1] * leg[1] };
  }
  return { name: rec[0], pre: rec[2] || '', zh: !!rec[3], ppp: rec[1] };
}

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Round to a "natural" figure: at most two significant digits from 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8. */
export function niceRound(x) {
  if (!(x > 0)) return 1;
  if (x < 10) return Math.max(1, Math.round(x));
  const m = Math.pow(10, Math.floor(Math.log10(x)));
  const r = x / m;
  let best = NICE[0], bd = Infinity;
  for (const n of NICE) { const d = Math.abs(Math.log(r / n)); if (d < bd) { bd = d; best = n; } }
  return Math.round(best * m * 100) / 100;
}

const D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** Chinese numerals for 1 <= n < 10000 as used in prices (兩千, 一百二十, 十五, 二十五). */
function zhBelow10k(n, lead = true) {
  const th = Math.floor(n / 1000), hu = Math.floor((n % 1000) / 100), te = Math.floor((n % 100) / 10), on = n % 10;
  let out = '';
  const two = (d) => (d === 2 ? '兩' : D[d]);
  if (th) out += two(th) + '千';
  if (hu) out += two(hu) + '百';
  else if (th && (te || on)) out += '零';
  if (te) out += (te === 1 && !th && !hu && lead ? '' : D[te]) + '十';
  else if ((th || hu) && on) out += '零';
  if (on) out += D[on];
  return out;
}
/** Chinese numerals for an integer < 1e12 (萬 and 億 groups). */
export function zhNumber(n) {
  n = Math.round(n);
  if (n <= 0) return '零';
  if (n < 10000) return zhBelow10k(n);
  if (n < 1e8) {
    const hi = Math.floor(n / 1e4), lo = n % 10000;
    const h = hi === 2 ? '兩' : zhBelow10k(hi);
    return h + '萬' + (lo ? (lo < 1000 ? '零' : '') + zhBelow10k(lo, false) : '');
  }
  const hi = Math.floor(n / 1e8), lo = n % 1e8;
  return (hi === 2 ? '兩' : zhBelow10k(hi)) + '億' + (lo ? zhNumber(lo) : '');
}

const stripZero = (v) => String(Math.round(v * 10) / 10).replace(/\.0$/, '');
const group = (n) => Math.round(n).toLocaleString('en-US');

/** Arabic-digit amount with 萬 / 億: 5,000  |  2 萬  |  2.5 萬  |  1,500 萬  |  3 億 */
export function arabicAmount(n) {
  if (n < 10000) return group(n);
  if (n < 1e8) {
    const w = n / 1e4;
    return (w >= 1000 ? group(w) : stripZero(w)) + ' 萬';
  }
  return stripZero(n / 1e8) + ' 億';
}

/**
 * zh-Hant text for `usd` international dollars (constant 2011 PPP dollars) in the currency of `code` in calendar year `year`.
 * opts.round: undefined / true -> a natural round figure (default); false -> exact units; a number -> multiple of that many local units.
 */
export function moneyText(code, year, usd, opts = {}) {
  const cur = currencyOf(code, year);
  let local = Math.max(0, usd) * cur.ppp * priceIndex(code, year);
  const r = opts.round;
  if (typeof r === 'number' && r > 0) local = Math.max(r, Math.round(local / r) * r);
  else if (r === false) local = Math.max(1, Math.round(local));
  else local = niceRound(local);
  if (cur.zh) return `${cur.pre}${zhNumber(local)}${cur.name}`;
  const a = arabicAmount(local);
  return /[萬億]$/.test(a) ? `${a}${cur.name}` : `${a} ${cur.name}`;
}
