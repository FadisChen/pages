// City geography: for every city listed in countries.js whether it is on (or within ~50 km of) the coast, how high it lies and
// what its climate is like. Used by h.coastal() / h.highAltitude() / h.climate() so that sea-level, typhoon, heat-wave, snow
// and altitude events only happen where they can.
//
// ESTIMATES from general knowledge (Koeppen-style, simplified to the game's six classes), not from a dataset.
//
//   coast     c = coastal (the sea is within about 50 km or the city is a tidal port / island), i = inland
//   altitude  l = low (< 500 m), m = mid (500-1,499 m), h = high (>= 1,500 m)
//   climate   T tropical    hot all year or hot and humid for most of it (rainforest, monsoon, savanna, and the hot humid
//                           subtropics south of ~31 degrees: Guangzhou, Taipei, Brisbane, Houston)
//             A arid        desert and steppe, hot-summer semi-arid (Delhi, Madrid, Athens)
//             M temperate   mild to warm oceanic, Mediterranean and humid subtropical (Paris, Tokyo, Sydney)
//             C continental cold winters with lasting snow, warm to hot summers (Beijing, Moscow, Chicago, Seoul)
//             P polar       tundra / subarctic (none of the game's cities is truly polar; kept for completeness)
//             H highland    cool because of altitude in the tropics and subtropics (Bogota, Addis Ababa, Nairobi, La Paz)
//
// Each country: 'name flags, name flags, ...' with the flags as three letters in the order coast, altitude, climate.

const SPEC = {
  CHN: '北京 ilC, 上海 clM, 成都 imM, 廣州 clT', IND: '德里 ilA, 孟買 clT, 班加羅爾 imT, 加爾各答 clT', USA: '紐約 clC, 洛杉磯 clM, 芝加哥 ilC, 休士頓 clT',
  IDN: '雅加達 clT, 泗水 clT, 日惹 ilT, 棉蘭 clT', PAK: '喀拉蚩 clA, 拉合爾 ilA, 伊斯蘭馬巴德 imM', NGA: '拉哥斯 clT, 阿布加 imT, 伊巴丹 ilT, 卡諾 imA',
  BRA: '聖保羅 imM, 里約熱內盧 clT, 薩爾瓦多 clT, 巴西利亞 imT', BGD: '達卡 ilT, 吉大港 clT, 雪爾赫特 ilT', RUS: '莫斯科 ilC, 聖彼得堡 clC, 新西伯利亞 ilC, 喀山 ilC',
  MEX: '墨西哥城 ihH, 瓜達拉哈拉 ihM, 蒙特雷 imA, 普埃布拉 ihH', JPN: '東京 clM, 大阪 clM, 札幌 clC, 福岡 clM', ETH: '阿迪斯阿貝巴 ihH, 迪雷達瓦 imA, 巴赫達爾 ihH',
  PHL: '馬尼拉 clT, 宿霧 clT, 納卯 clT', EGY: '開羅 ilA, 亞歷山卓 clA, 路克索 ilA', COD: '金夏沙 ilT, 盧本巴希 imT, 戈馬 ihT',
  VNM: '河內 ilT, 胡志明市 clT, 峴港 clT, 順化 clT', IRN: '德黑蘭 imA, 伊斯法罕 ihA, 設拉子 ihA, 大不里士 imC', TUR: '伊斯坦堡 clM, 安卡拉 imC, 伊茲密爾 clM, 布爾薩 ilM',
  DEU: '柏林 ilM, 慕尼黑 imM, 漢堡 clM, 科隆 ilM', THA: '曼谷 clT, 清邁 ilT, 孔敬 ilT, 合艾 clT', FRA: '巴黎 ilM, 馬賽 clM, 里昂 ilM, 波爾多 clM',
  GBR: '倫敦 clM, 曼徹斯特 ilM, 愛丁堡 clM, 伯明罕 ilM', TZA: '三蘭港 clT, 多多馬 imT, 阿魯沙 imH', ZAF: '約翰尼斯堡 ihH, 開普敦 clM, 德班 clT, 普勒托利亞 imM',
  ITA: '羅馬 clM, 米蘭 ilM, 那不勒斯 clM, 都靈 ilM', MMR: '仰光 clT, 曼德勒 ilT, 內比都 ilT', KEN: '奈洛比 ihH, 蒙巴薩 clT, 基蘇木 imT',
  COL: '波哥大 ihH, 麥德林 imH, 卡利 imT, 卡塔赫納 clT', KOR: '首爾 clC, 釜山 clM, 大邱 ilM', ESP: '馬德里 imA, 巴塞隆納 clM, 瓦倫西亞 clM, 塞維亞 ilA',
  UGA: '坎帕拉 imT, 金賈 imT, 古魯 imT', SDN: '喀土穆 ilA, 恩圖曼 ilA, 蘇丹港 clA', ARG: '布宜諾斯艾利斯 clM, 科爾多瓦 ilM, 羅薩里奧 ilM',
  DZA: '阿爾及爾 clM, 奧蘭 clM, 君士坦丁 imM', IRQ: '巴格達 ilA, 巴斯拉 clA, 摩蘇爾 ilA, 埃爾比勒 ilA', AFG: '喀布爾 ihH, 坎達哈 imA, 赫拉特 imA, 馬扎里沙里夫 ilA',
  POL: '華沙 ilC, 克拉科夫 ilC, 格但斯克 clC, 弗羅茨瓦夫 ilC', UKR: '基輔 ilC, 哈爾科夫 ilC, 敖德薩 clC, 利維夫 ilC', CAN: '多倫多 ilC, 溫哥華 clM, 蒙特婁 ilC, 卡加利 imC',
  MAR: '卡薩布蘭卡 clM, 馬拉喀什 ilA, 拉巴特 clM, 菲斯 ilM', SAU: '利雅德 imA, 吉達 clA, 麥加 ilA, 達曼 clA', AGO: '羅安達 clT, 萬博 ihH, 洛比托 clT',
  UZB: '塔什干 ilA, 撒馬爾罕 imA, 布哈拉 ilA', PER: '利馬 clA, 庫斯科 ihH, 阿雷基帕 ihH, 特魯希略 clA', MYS: '吉隆坡 ilT, 檳城 clT, 新山 clT, 古晉 clT',
  YEM: '沙那 ihH, 亞丁 clA, 塔伊茲 imH', GHA: '阿克拉 clT, 庫馬西 ilT, 塔馬利 ilT', MOZ: '馬普托 clT, 貝拉 clT, 楠普拉 ilT',
  NPL: '加德滿都 imH, 博卡拉 imM, 比拉特納加 ilT', MDG: '安塔那那利佛 imH, 圖阿馬西拿 clT, 菲亞納蘭楚阿 imM', VEN: '卡拉卡斯 imT, 馬拉開波 clT, 瓦倫西亞 ilT',
  CIV: '阿比讓 clT, 亞穆蘇克羅 ilT, 布瓦凱 ilT', CMR: '雅溫得 imT, 杜阿拉 clT, 加魯阿 ilT', NER: '尼亞美 ilA, 馬拉迪 ilA, 津德爾 ilA',
  AUS: '雪梨 clM, 墨爾本 clM, 布里斯本 clT, 伯斯 clM', PRK: '平壤 ilC, 咸興 clC, 清津 clC', TWN: '台北 clT, 高雄 clT, 台中 clT, 台南 clT',
  BFA: '瓦加杜古 ilA, 博博迪烏拉索 ilT', MLI: '巴馬科 ilA, 通布圖 ilA, 塞古 ilA', SYR: '大馬士革 imA, 阿勒坡 ilA, 霍姆斯 imA',
  LKA: '可倫坡 clT, 康提 imT, 加勒 clT', MWI: '里朗威 imT, 布蘭太爾 imT, 姆祖祖 imT', ZMB: '路沙卡 imT, 恩多拉 imT, 基特韋 imT',
  ROU: '布加勒斯特 ilC, 克盧日 ilC, 雅西 ilC', CHL: '聖地牙哥 imM, 瓦爾帕萊索 clM, 康塞普西翁 clM', KAZ: '阿拉木圖 imC, 努爾蘇丹 ilC, 奇姆肯特 imC',
  ECU: '基多 ihH, 瓜亞基爾 clT, 昆卡 ihH', GTM: '瓜地馬拉市 ihH, 克薩爾特南戈 ihH, 安地瓜 ihH', TCD: '恩加梅納 ilA, 蒙杜 ilT',
  SOM: '摩加迪休 clA, 哈爾格薩 imA, 基斯馬尤 clA', NLD: '阿姆斯特丹 clM, 鹿特丹 clM, 烏特勒支 ilM', SEN: '達卡 clA, 圖巴 ilA, 聖路易 clA',
  KHM: '金邊 ilT, 暹粒 ilT, 馬德望 ilT', ZWE: '哈拉雷 imM, 布拉瓦約 imM, 穆塔雷 imM', GIN: '柯那克里 clT, 卡納卡 ilT',
  RWA: '吉佳利 ihH, 胡耶 ihH, 穆桑澤 ihH', BEN: '科托努 clT, 波多諾伏 clT, 帕拉庫 ilT', BDI: '布瓊布拉 imT, 基特加 ihH',
  TUN: '突尼斯 clM, 斯法克斯 clA, 蘇塞 clM', BOL: '拉巴斯 ihH, 聖克魯斯 ilT, 蘇克雷 ihH, 科恰班巴 ihH', BEL: '布魯塞爾 ilM, 安特衛普 clM, 根特 ilM',
  HTI: '太子港 clT, 海地角 clT, 傑瑞米 clT', JOR: '安曼 imA, 伊爾比德 imA, 亞喀巴 clA', DOM: '聖多明哥 clT, 聖地牙哥 ilT, 蓬塔卡納 clT',
  CUB: '哈瓦那 clT, 聖地牙哥 clT, 特立尼達 clT', SSD: '朱巴 imT, 瓦烏 ilT, 馬拉卡勒 ilT', SWE: '斯德哥爾摩 clC, 哥德堡 clM, 馬爾默 clM',
  CZE: '布拉格 ilM, 布爾諾 ilC, 奧斯特拉瓦 ilC', HND: '特古西加爾巴 imT, 聖佩德羅蘇拉 ilT', GRC: '雅典 clA, 塞薩洛尼基 clM, 帕特雷 clM',
  AZE: '巴庫 clA, 占賈 ilC', PRT: '里斯本 clM, 波爾圖 clM, 科英布拉 ilM', PNG: '莫爾斯比港 clT, 萊城 clT',
  HUN: '布達佩斯 ilC, 德布勒森 ilC, 塞格德 ilC', TJK: '杜尚別 imC, 胡占德 ilC', BLR: '明斯克 ilC, 戈梅利 ilC, 布列斯特 ilC',
  ISR: '特拉維夫 clM, 耶路撒冷 imM, 海法 clM', ARE: '杜拜 clA, 阿布達比 clA, 沙迦 clA', AUT: '維也納 ilC, 格拉茨 ilC, 薩爾茨堡 ilC',
  TGO: '洛美 clT, 卡拉 ilT', CHE: '蘇黎世 ilC, 日內瓦 imM, 伯恩 imC, 巴塞爾 ilM', SLE: '自由城 clT, 博城 ilT',
  LAO: '永珍 ilT, 龍坡邦 imT, 巴色 ilT', HKG: '香港 clT, 九龍 clT, 沙田 clT', NIC: '馬那瓜 ilT, 雷翁 clT, 格拉納達 ilT',
  SRB: '貝爾格勒 ilC, 諾維薩德 ilC, 尼什 ilC', LBY: '的黎波里 clA, 班加西 clA', BGR: '索非亞 imC, 普羅夫迪夫 ilC, 瓦爾納 clC',
  PRY: '亞松森 ilT, 東方市 ilT', KGZ: '比什凱克 imC, 奧什 imC', TKM: '阿什哈巴德 ilA, 土庫曼納巴特 ilA',
  SLV: '聖薩爾瓦多 imT, 聖米格爾 ilT', COG: '布拉薩 ilT, 黑角 clT', DNK: '哥本哈根 clM, 奧胡斯 clM, 奧登塞 clM',
  SVK: '布拉提斯拉瓦 ilC, 科希策 ilC', SGP: '新加坡 clT, 裕廊 clT, 兀蘭 clT', CAF: '班基 ilT, 貝貝拉蒂 imT',
  FIN: '赫爾辛基 clC, 坦佩雷 ilC, 圖爾庫 clC', LBN: '貝魯特 clM, 的黎波里 clM, 西頓 clM', NOR: '奧斯陸 clC, 卑爾根 clM, 特隆赫姆 clC',
  LBR: '蒙羅維亞 clT, 甘卡 ilT', PSE: '拉馬拉 imM, 加薩 clA, 希伯倫 imM', NZL: '奧克蘭 clM, 威靈頓 clM, 基督城 clM',
  CRI: '聖荷西 imH, 卡塔戈 imH', IRL: '都柏林 clM, 科克 clM, 高威 clM', MRT: '諾克少 clA, 努瓦迪布 clA',
  OMN: '馬斯喀特 clA, 塞拉萊 clA, 蘇哈爾 clA', PAN: '巴拿馬城 clT, 科隆 clT, 大衛 clT', KWT: '科威特城 clA, 哈瓦利 clA',
  HRV: '札格拉布 ilC, 斯普利特 clM, 里耶卡 clM', GEO: '提比里斯 ilC, 巴統 clM, 庫塔伊西 ilM', ERI: '阿斯瑪拉 ihH, 馬薩瓦 clA',
  URY: '蒙特維多 clM, 薩爾托 ilM', MNG: '烏蘭巴托 imP, 額爾登特 imC, 達爾汗 imC', MDA: '基西紐 ilC, 貝爾茨 ilC',
  PRI: '聖胡安 clT, 龐塞 clT', BIH: '塞拉耶佛 imC, 巴尼亞盧卡 ilC, 莫斯塔爾 ilM', ALB: '地拉那 ilM, 都拉斯 clM, 發羅拉 clM',
  JAM: '金斯敦 clT, 蒙特哥貝 clT', ARM: '葉里溫 imC, 久姆里 ihC', LTU: '維爾紐斯 ilC, 考納斯 ilC, 克萊佩達 clC',
  GMB: '班竹 clT, 塞列昆達 clT', QAT: '杜哈 clA, 盧賽爾 clA', BWA: '嘉柏隆里 imA, 法蘭西斯鎮 imA',
  NAM: '溫荷克 ihA, 沃爾維斯灣 clA', GAB: '自由市 clT, 奧文多 imT', LSO: '馬賽魯 ihH, 泰雷 ihH',
  SVN: '盧比安納 ilM, 馬里博爾 ilC', GNB: '比紹 clT, 巴法塔 ilT', MKD: '史高比耶 ilC, 比托拉 imC',
  LVA: '里加 clC, 道加瓦皮爾斯 ilC', XKX: '普里什蒂納 imC, 普里茲倫 ilC', GNQ: '馬拉博 clT, 巴塔 clT',
  TTO: '西班牙港 clT, 聖費爾南多 clT', BHR: '麥納瑪 clA, 穆哈拉格 clA', TLS: '帝力 clT, 包考 clT',
  EST: '塔林 clC, 塔爾圖 ilC', MUS: '路易港 clT, 柯迪潘 cmT', SWZ: '姆巴巴內 imM, 馬那尼 imM',
  DJI: '吉布地市 clA, 阿里薩比 ilA', FJI: '蘇瓦 clT, 楠迪 clT', CYP: '尼科西亞 ilA, 利馬索 clM',
  COM: '莫洛尼 clT, 穆察穆杜 clT', GUY: '喬治城 clT, 林登 ilT', BTN: '廷布 ihH, 帕羅 ihH',
  SLB: '何尼阿拉 clT, 蓋佐 clT', MAC: '澳門 clT, 氹仔 clT', LUX: '盧森堡市 ilM, 埃施 ilM',
  MNE: '波多里查 ilM, 采蒂涅 imM', SUR: '巴拉馬利波 clT, 尼克里 clT', CPV: '培亞 clA, 明德盧 clA',
  MLT: '瓦雷塔 clM, 斯利馬 clM', MDV: '馬列 clT, 阿杜 clT',
};

const COAST = { c: true, i: false };
const ALT = { l: 'low', m: 'mid', h: 'high' };
const CLIMATE = { T: 'tropical', A: 'arid', M: 'temperate', C: 'continental', P: 'polar', H: 'highland' };
export const CLIMATES = ['tropical', 'arid', 'temperate', 'continental', 'polar', 'highland'];
export const ALTITUDES = ['low', 'mid', 'high'];

/** code -> [{ name, coast, alt, climate }] in the order of countries.js `cities` */
export const GEO = {};
for (const [code, spec] of Object.entries(SPEC)) {
  GEO[code] = spec.split(',').map((tok) => {
    const t = tok.trim();
    const sp = t.lastIndexOf(' ');
    const name = t.slice(0, sp), f = t.slice(sp + 1);
    if (f.length !== 3 || !(f[0] in COAST) || !(f[1] in ALT) || !(f[2] in CLIMATE)) throw new Error(`bad city geo "${t}" in ${code}`);
    return { name, coast: COAST[f[0]], alt: ALT[f[1]], climate: CLIMATE[f[2]] };
  });
}

// What the countryside of a country is like when the population-weighted mode of its listed cities is not it.
const DOMINANT_OVERRIDE = {
  CHN: 'temperate', USA: 'continental', MEX: 'temperate', ETH: 'highland', KEN: 'highland', TZA: 'tropical', ZAF: 'temperate', AFG: 'arid',
  IRN: 'arid', TUR: 'continental', BRA: 'tropical', ARG: 'temperate', COL: 'tropical', PER: 'highland', BOL: 'highland', ECU: 'highland',
  KAZ: 'continental', MNG: 'continental', AGO: 'tropical', UGA: 'tropical', RWA: 'highland', BDI: 'highland', LSO: 'highland', BTN: 'highland',
  NPL: 'temperate', DZA: 'temperate', MAR: 'temperate', ESP: 'temperate', ITA: 'temperate', GRC: 'temperate', CHL: 'temperate', PAK: 'arid',
  IND: 'tropical', TCD: 'arid', SDN: 'arid', CMR: 'tropical', NGA: 'tropical', SEN: 'arid', MRT: 'arid', MLI: 'arid', BFA: 'arid', NER: 'arid',
  SOM: 'arid', DJI: 'arid', ERI: 'arid', BWA: 'arid', NAM: 'arid', LBY: 'arid', EGY: 'arid', SAU: 'arid', YEM: 'highland', OMN: 'arid',
  UZB: 'arid', TKM: 'arid', GTM: 'highland', HND: 'tropical', CRI: 'tropical', MDG: 'tropical', ZWE: 'temperate', ZMB: 'tropical', MWI: 'tropical',
  AUS: 'arid', NZL: 'temperate', CAN: 'continental', RUS: 'continental', JPN: 'temperate', KOR: 'continental', PRK: 'continental', CHE: 'continental',
};

/** The dominant climate of a country (what the countryside is like). */
export const DOMINANT_CLIMATE = {};
const COASTAL_SHARE = {};
for (const [code, list] of Object.entries(GEO)) {
  const score = {};
  list.forEach((c, i) => { score[c.climate] = (score[c.climate] || 0) + ([1, 0.8, 0.6, 0.5][i] ?? 0.4); });
  let best = list[0].climate, bs = -1;
  for (const [k, v] of Object.entries(score)) if (v > bs) { best = k; bs = v; }
  DOMINANT_CLIMATE[code] = DOMINANT_OVERRIDE[code] || best;
  COASTAL_SHARE[code] = list.filter((c) => c.coast).length / list.length;
}

/**
 * Geography of the place a person lives. `urban` false = countryside near `city`: the climate is the country's dominant one;
 * coast and altitude are those of the nearby city. A city name unknown to the country (custom `h.setCity('台北')` of another
 * country, or old saves) is looked up in all countries, then falls back to the country as a whole.
 * @returns {{ coast: boolean, alt: 'low'|'mid'|'high', climate: string }}
 */
export function placeGeo(code, city, urban = true) {
  const list = GEO[code];
  let c = list && list.find((x) => x.name === city);
  if (!c) {
    for (const k in GEO) { c = GEO[k].find((x) => x.name === city); if (c) break; }
  }
  const dom = DOMINANT_CLIMATE[code] || 'temperate';
  if (!c) return { coast: (COASTAL_SHARE[code] ?? 0.5) >= 0.5, alt: 'low', climate: dom };
  return { coast: c.coast, alt: c.alt, climate: urban ? c.climate : dom };
}
