// Situations specific to income groups and regions: harvests and drought, rain and floods, malaria seasons,
// informal settlements, power cuts, displacement, overwork and loneliness in rich cities, extreme cold and heat,
// fishing, herding, festivals, remittances. Ids start with `regional_`.
//
// Tone: dignified and concrete, never exoticizing. Events only appear where the country, region, income group
// and (often) rural/urban setting make them statistically plausible.
//
// Follow-up chains (schedule):
//   regional_conflict_displacement -> regional_camp_life -> regional_new_start
//   regional_conflict_displacement -> regional_after_the_fighting
//   regional_remittance_day -> regional_remittance_result

// ---- country groups ----
const SEASONAL_ZONES = ['SSA', 'SAS', 'MENA', 'CAS', 'LAC', 'SEA'];
const COLD = new Set(['RUS', 'MNG', 'KAZ', 'KGZ', 'TJK', 'BLR', 'UKR', 'FIN', 'SWE', 'NOR', 'EST', 'LVA', 'LTU', 'CAN', 'ARM', 'GEO', 'AZE', 'POL', 'DEU', 'AUT', 'CHE', 'ISL']);
const HOT = new Set(['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'IRQ', 'EGY', 'IRN', 'IND', 'PAK', 'BGD', 'NER', 'MLI', 'BFA', 'SDN', 'TCD', 'SEN', 'MRT', 'DJI', 'AUS', 'LBY', 'DZA', 'TUN', 'JOR', 'YEM', 'ETH', 'UZB', 'TKM', 'SOM', 'ERI']);
const COASTAL_FISH = new Set(['IDN', 'PHL', 'VNM', 'THA', 'MMR', 'LKA', 'BGD', 'IND', 'MDV', 'FJI', 'SLB', 'PNG', 'JPN', 'KOR', 'NOR', 'PER', 'CHL', 'SEN', 'GHA', 'MRT', 'SOM', 'MOZ', 'TZA', 'KEN', 'PRT', 'ESP', 'GRC', 'HRV', 'CPV', 'COM', 'TWN', 'CHN', 'ECU', 'MEX', 'BRA', 'CIV', 'LBR', 'SLE', 'GMB', 'GIN', 'BEN', 'TGO']);
const PASTORAL = new Set(['MNG', 'KAZ', 'KGZ', 'NER', 'MLI', 'TCD', 'MRT', 'SOM', 'KEN', 'ETH', 'DJI', 'ERI', 'SDN', 'TKM', 'TZA', 'UGA', 'BWA', 'NAM', 'IRN', 'AFG', 'MAR']);
const REMIT = new Set(['PHL', 'NPL', 'BGD', 'LKA', 'PAK', 'IND', 'EGY', 'MAR', 'UZB', 'TJK', 'KGZ', 'MDA', 'ALB', 'SLV', 'HND', 'GTM', 'NIC', 'HTI', 'JAM', 'DOM', 'MEX', 'COL', 'ECU', 'PER', 'BOL', 'GHA', 'NGA', 'SEN', 'KEN', 'UGA', 'ETH', 'ZWE', 'LSO', 'VNM', 'KHM', 'IDN', 'MMR', 'TUN', 'JOR', 'LBN', 'ARM', 'GEO']);
const STORMY = new Set(['PHL', 'TWN', 'JPN', 'CHN', 'VNM', 'KOR', 'HKG', 'MAC', 'IDN', 'THA', 'BGD', 'IND', 'LKA', 'MMR', 'MDG', 'MOZ', 'USA', 'MEX', 'CUB', 'HTI', 'DOM', 'JAM', 'HND', 'NIC', 'GTM', 'SLV', 'PRI', 'FJI', 'PNG', 'SLB', 'AUS', 'CRI', 'PAN', 'TTO', 'BRA']);
const WILDFIRE = new Set(['AUS', 'USA', 'CAN', 'PRT', 'ESP', 'GRC', 'ITA', 'CHL', 'HRV', 'TUR', 'FRA', 'BOL', 'BRA', 'RUS']);
const QUAKE = new Set(['JPN', 'TWN', 'CHL', 'NZL', 'TUR', 'IRN', 'NPL', 'MEX', 'IDN', 'PHL', 'PER', 'ECU', 'GRC', 'ITA', 'ALB', 'PAK', 'AFG', 'TJK', 'KGZ', 'GTM', 'SLV', 'CRI', 'COL', 'ARM', 'GEO', 'KOR']);
const MINING = new Set(['ZAF', 'COD', 'ZMB', 'PER', 'CHL', 'MNG', 'AUS', 'CHN', 'IND', 'IDN', 'BOL', 'GHA', 'TZA', 'ZWE', 'KAZ', 'POL', 'USA', 'CAN', 'RUS', 'UKR', 'TUR', 'COL', 'MEX', 'GIN', 'BFA', 'MLI', 'NAM', 'BWA', 'SLE']);
const ISLANDS = new Set(['FJI', 'SLB', 'PNG', 'MDV', 'CPV', 'COM', 'TLS', 'MUS', 'JAM', 'TTO', 'CUB', 'DOM', 'HTI', 'PHL', 'IDN', 'MLT', 'CYP', 'ISL', 'NZL']);
const MINORITY_LANG = new Set(['PER', 'BOL', 'GTM', 'ECU', 'MEX', 'PRY', 'PNG', 'LAO', 'VNM', 'MMR', 'THA', 'CHN', 'IND', 'NPL', 'IDN', 'NGA', 'ETH', 'KEN', 'TZA', 'CMR', 'CAF', 'COD', 'BWA', 'NAM', 'ZAF', 'MNG', 'AUS', 'NZL', 'FJI', 'SLB', 'TJK', 'KGZ', 'RUS', 'NER', 'MLI', 'BFA']);
const COTTON = new Set(['UZB', 'TJK', 'TKM']);
const CASH_TRANSFER = new Set(['BRA', 'MEX', 'COL', 'PER', 'ECU', 'ARG', 'CHL', 'DOM', 'HND', 'GTM', 'SLV', 'BOL', 'PRY', 'JAM', 'IND', 'PAK', 'BGD', 'KEN', 'GHA', 'ZAF', 'ETH', 'UGA', 'TZA', 'MOZ', 'MWI', 'ZMB', 'IDN', 'PHL', 'LSO', 'NPL']);

// Years of armed conflict in specific countries that drive displacement.
const ZONES = {
  AFG: [1979, 2100], SYR: [2011, 2030], YEM: [2014, 2100], SOM: [1991, 2100], SSD: [2013, 2100], SDN: [2003, 2100], COD: [1996, 2100], MMR: [2021, 2100],
  CAF: [2012, 2100], MLI: [2012, 2100], BFA: [2016, 2100], NER: [2015, 2100], UKR: [2022, 2100], HTI: [2021, 2100], MOZ: [1977, 1992], AGO: [1975, 2002],
  ETH: [1974, 1991], LBN: [1975, 1990], SLE: [1991, 2002], LBR: [1989, 2003], UGA: [1971, 1986], LBY: [2011, 2020], IRQ: [2003, 2017], NGA: [2009, 2100],
};
const inZone = (s, h) => { const z = ZONES[s.countryCode]; return !!z && h.yearIn(z[0], z[1]); };

const lowInc = (h) => h.income() === 'L' || h.income() === 'LM';
const rural = (h) => !h.urban();

/** Festival name and a short, concrete description fitted to the country. */
function festival(s, h) {
  const c = s.countryCode;
  if (['CHN', 'TWN', 'KOR', 'VNM', 'SGP', 'HKG', 'MAC', 'PRK'].includes(c)) return '農曆新年到了。全家人圍著大圓桌吃年夜飯，長輩發紅包，孩子們把糖果塞滿口袋，遠方的親人也都回來了，連最少回家的堂哥也帶著一大袋禮物笑著出現在門口。';
  if (['IND', 'NPL', 'LKA', 'BTN'].includes(c)) return '節慶的夜晚，家家戶戶點起油燈，門前用彩粉畫出圖案。你和鄰居交換甜點，孩子們在巷子裡放著小煙火，到處都是笑聲，連隔壁最嚴肅的叔叔也被拉進來，在門前畫了一朵歪歪的花。';
  if (['PAK', 'BGD', 'IDN', 'MYS', 'EGY', 'TUR', 'IRN', 'IRQ', 'SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'JOR', 'SYR', 'LBY', 'TUN', 'DZA', 'MAR', 'YEM', 'AZE', 'UZB', 'TJK', 'KGZ', 'TKM', 'KAZ', 'AFG', 'SOM', 'SEN', 'NER', 'MLI', 'DJI', 'PSE', 'LBN'].includes(c)) return '開齋節的早晨，你穿上新衣，和家人一起去清真寺或廣場禮拜。回家後長輩們分發小禮物，餐桌上擺滿了只在這天才吃得到的點心，鄰居的孩子也被叫進來分一份。';
  if (['THA', 'LAO', 'KHM', 'MMR'].includes(c)) return '潑水節那幾天，街上到處是水桶和笑聲。你先替家裡的長輩輕輕灑水祈福，下一秒就被朋友淋得全身濕透，大家笑得站不直，連路過的外國遊客也被拉進戰局，笑得和大家一樣開心。';
  if (c === 'JPN') return '新年的清晨，全家人圍著年菜，到神社排隊參拜，手裡握著熱甘酒。孩子們比較關心的是壓歲錢，大人則悄悄許下新一年的願望，而那個願望通常只有三個字：平平安安。';
  if (h.isRegion('EUR', 'NAM', 'OCE', 'LAC') || c === 'PHL') return '節慶時分，家人從各地趕回來，屋子裡擠滿了人，烤爐一直沒停。大家交換禮物、唱舊歌，有人偷偷在廚房吃掉了一半的甜點，被抓到時笑得比誰都大聲。';
  return '村裡一年一度的節慶到了，鼓聲與歌聲從傍晚響到深夜。大家穿上最好的衣服，帶著自家的菜聚在廣場，連平常不太說話的人也站起來跳舞。';
}

/** Wording for the local name of a big storm. */
const stormName = (s, h) => (['IND', 'BGD', 'LKA', 'MMR', 'MDG', 'MOZ', 'AUS', 'FJI', 'PNG', 'SLB'].includes(s.countryCode) ? '氣旋' : h.isRegion('NAM', 'LAC') ? '颶風' : '颱風');

export default [
  // =====================================================================================
  // 農村與天氣
  // =====================================================================================
  {
    id: 'regional_drought_harvest',
    title: '雨季來得太晚',
    ages: [10, 75],
    once: false,
    cooldown: 10,
    weight: 0.9,
    tags: ['regional', 'farm', 'climate'],
    cond: (s, h) => rural(h) && lowInc(h) && h.isRegion(...SEASONAL_ZONES),
    text: (s, h) => '今年的雨季遲了一個多月，田裡的苗長到一半就開始發黃。穀倉看起來比往年空，鄰居們在村口小聲討論著，要不要賣掉牲口，換一些糧食撐到明年。',
    choices: [
      {
        label: '賣掉一部分牲畜，換糧食與種子',
        effects: { wealth: -3, happiness: -2, health: +1 },
        result: '你牽著那頭陪伴多年的牛去市場，一路沒有回頭。換回來的玉米與種子讓全家撐過了最難的幾個月，只是院子突然安靜了許多。',
        ai: 1.6,
      },
      {
        label: '家中有人到城裡或礦區做季節性打工',
        effects: { wealth: +2, social: -3, happiness: -1 },
        set: ['seasonal_migrant'],
        result: '家裡派出了最年輕力壯的人，其他人守著田。每個月他託人捎回一點錢，信裡寫的總是「不用擔心」，字卻一次比一次潦草。',
        ai: 1.5,
      },
      {
        label: '加入社區糧倉互助，接受援助',
        effects: { wealth: -1, social: +3, health: -1 },
        result: '村裡的長者召集了大家，把各家剩下的糧食集中分配，並登記領取救濟。分到手的雖不多，但沒有人被落下，這件事讓你覺得很踏實。',
        ai: 1.8,
      },
    ],
  },
  {
    id: 'regional_good_harvest',
    title: '穀倉滿了',
    ages: [8, 85],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['regional', 'farm'],
    cond: (s, h) => rural(h) && (h.isJob('farmer', 'fisher') || lowInc(h)),
    text: (s, h) => '今年風調雨順，田裡的作物長得又壯又密。收割那幾天，全家人和鄰居輪流幫忙，大家邊工作邊說笑，晚上曬穀場上堆著小山似的收成，空氣裡全是新米與乾草的味道。',
    effects: { wealth: +3, happiness: +4, social: +2, health: +1 },
  },
  {
    id: 'regional_monsoon_rains',
    title: '雨季的路',
    ages: [4, 85],
    once: false,
    cooldown: 4,
    weight: 0.7,
    tags: ['regional', 'climate'],
    cond: (s, h) => h.isRegion('SAS', 'SEA') || (h.isRegion('EAS') && ['CHN', 'TWN', 'KOR', 'JPN', 'VNM'].includes(s.countryCode)),
    text: (s, h) => h.byIncome({
      L: '雨季到了第三個月，田間的小路成了小河，學校連續停課好幾天。孩子們用塑膠袋當船在水裡追，大人則忙著墊高穀倉與檢查屋頂，一邊祈禱雨在播種前停下來。',
      LM: '連日的大雨讓巷子淹到小腿，人力車、摩托車都在水裡慢慢地推。你把鞋子提在手上，一路光腳走到公車站，上班遲到也沒有人責怪，因為大家都在同一片水裡掙扎。',
      UM: '雨季的豪雨讓路面積水，地下道封閉，捷運停駛。你在辦公室待到深夜，和同事分食便當，等雨小一點才敢出門，結果走到站口發現隔壁同事早已在那裡等車。',
      H: '豪雨特報不斷跳出手機，市區許多路段淹水，你被困在辦公室過夜。同事們鋪好睡袋、叫了外賣，把這場雨當成一次意外的露營，凌晨還有人打起了撲克牌。',
    }),
    effects: { health: -1, wealth: -1, social: +2, happiness: 0 },
  },
  {
    id: 'regional_storm_season',
    title: '風暴季',
    ages: [4, 90],
    once: false,
    cooldown: 5,
    weight: 0.7,
    tags: ['regional', 'climate', 'storm'],
    cond: (s, h) => STORMY.has(s.countryCode),
    text: (s, h) => `${stormName(s, h)}的警報在傍晚響起。${h.byIncome({
      L: '你和家人把屋頂用繩子綁緊，把能搬的東西搬到最高處，鄰居也來幫忙，大家一起守著風聲與雨聲到天亮，誰也沒睡著，卻沒有人覺得孤單。',
      LM: '你把窗戶貼上膠帶，把重要證件包進塑膠袋。風雨一整夜地敲著鐵皮，早上整條街都是倒下的樹枝與電線，鄰居們拿著掃把走出來，彼此點頭打招呼。',
      UM: '公司宣布停班，超市貨架被搶購一空。你在家煮了一鍋熱麵，隔著窗看風把招牌吹得嘩啦嘩啦響，心裡默默祈禱這次它別掉下來。',
      H: '政府宣布停班停課，你在家囤好了食物與電池，一邊盯著氣象圖，一邊享受難得的意外假期，順便把拖了好幾個月的電影看完。',
    })}`,
    effects: (s, h) => { h.change('wealth', h.byIncome({ L: -3, LM: -2, UM: -1, H: 0 })); h.change('social', +2); h.change('happiness', h.income() === 'H' ? +1 : -1); },
  },
  {
    id: 'regional_malaria_season',
    title: '雨季熱',
    ages: [1, 70],
    once: false,
    cooldown: 5,
    weight: 1.5,
    tags: ['regional', 'health', 'malaria'],
    cond: (s, h) => h.yearIn(1970, 2060) && !h.incomeAtLeast('H') && (h.isRegion('SSA') || (h.isRegion('SAS', 'SEA', 'OCE') && lowInc(h)) || ['PNG', 'SLB', 'GUY', 'SUR', 'HTI', 'BOL', 'COL', 'HND', 'NIC', 'VEN'].includes(s.countryCode)),
    text: (s, h) => '雨季裡你突然發冷發熱，全身發抖，額頭卻燙得嚇人。家人說這是「雨季熱」，每一年身邊總有人要躺上幾天。你想起鄰居家那個今年沒有爬起來的孩子，心裡一陣發緊。',
    choices: [
      {
        label: '立刻驗血，吃完整療程的藥',
        effects: { health: -2, wealth: -1 },
        result: '診所的護理人員用一滴血就確認了。他遞給你一排藥，叮嚀三天一定要吃完。你照做，第四天燒退了，人像是洗過一遍的衣服。',
        ai: 3,
      },
      {
        label: '先在家退燒，觀望一下',
        effects: (s, h) => { h.change('health', -4); h.addRisk(1.3, 1); },
        result: '你熬了兩天，家人用濕毛巾替你降溫。第三天你燒得更厲害，終於被抬去診所，護理人員搖頭說：「早點來就好了。」',
        ai: 1,
      },
      {
        label: '到藥鋪買藥自己治',
        cond: (s, h) => lowInc(h),
        effects: (s, h) => { h.change('health', -3); h.change('wealth', -1); h.addRisk(1.15, 1); },
        result: '藥鋪老闆給你拿了一包藥，說吃了就會好。症狀有時退有時回，你不確定到底是哪一種藥起了作用。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'regional_bed_nets',
    title: '蚊帳發放日',
    ages: [1, 60],
    weight: 0.8,
    tags: ['regional', 'health', 'malaria'],
    cond: (s, h) => h.yearIn(2000, 2040) && lowInc(h) && h.isRegion('SSA', 'SAS', 'SEA', 'OCE'),
    text: (s, h) => '村口的學校院子裡擠滿了人，志工拿著名單，一戶一戶發放浸過藥劑的蚊帳。你領到那一頂時，全家人圍著它看了又看，晚上把它掛在床上，像睡進一座白色的小帳篷。',
    effects: { health: +3, happiness: +2, social: +1 },
  },
  {
    id: 'regional_cookstove',
    title: '灶火的煙',
    ages: [10, 75],
    weight: 1.2,
    tags: ['regional', 'health', 'home'],
    cond: (s, h) => rural(h) && lowInc(h) && h.yearIn(1985, 2060) && h.isRegion('SSA', 'SAS', 'SEA', 'LAC', 'CAS', 'EAS'),
    text: (s, h) => '每天傍晚家裡的灶火一點，屋裡就瀰漫著煙，眼睛被熏得直流淚，咳嗽也越來越久。有一天，社區推廣員來了，說有一種新式爐灶，燒更少的柴，煙還能從煙囪排出去。',
    choices: [
      {
        label: '加入改良爐灶計畫',
        effects: (s, h) => { h.change('health', +3); h.change('wealth', -1); h.change('social', +1); h.addRisk(0.95, 4); },
        result: '你和幾戶鄰居一起學著砌爐灶，泥土、磚塊與鐵管。第一次點火，煙乖乖往上走，屋裡不再嗆人，母親笑著說：「這是我這輩子最乾淨的廚房。」',
        ai: 2.5,
      },
      {
        label: '使用瓦斯桶，貴一點但乾淨',
        cond: (s, h) => h.stat('wealth') >= 25,
        effects: { health: +2, wealth: -3 },
        result: '換瓦斯桶那天，你站在灶前遲遲不敢點火。事後你發現做飯時間少了一半，但每個月要記得去鎮上換桶，還要為貴了的帳單皺眉。',
        ai: 1.2,
      },
      {
        label: '維持傳統爐灶，把門窗打開',
        effects: { health: -2 },
        result: '你說用了一輩子的灶，不想改。冬天還是被煙熏得直咳，只是你學會把窗留一條縫，多披一件外套。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'regional_borehole_well',
    title: '村口的新水井',
    ages: [4, 80],
    weight: 0.7,
    tags: ['regional', 'water', 'health'],
    cond: (s, h) => rural(h) && lowInc(h) && h.yearIn(1975, 2060) && h.isRegion('SSA', 'SAS', 'SEA', 'MENA', 'CAS'),
    text: (s, h) => '村裡鑿好了一口深水井，開工那天大人小孩都圍著看。第一桶水打上來時，所有人都安靜了，接著有人鼓掌。以後再也不用天不亮就走很遠去提水了，母親和姊妹們終於能多睡一會兒。',
    effects: { health: +3, knowledge: +2, happiness: +3, social: +2 },
  },
  {
    id: 'regional_school_far',
    title: '走路上學的路',
    ages: [6, 14],
    once: false,
    cooldown: 5,
    weight: 0.8,
    tags: ['regional', 'school'],
    cond: (s, h) => rural(h) && lowInc(h) && h.inSchool(),
    text: (s, h) => '你每天天剛亮就出門，沿著河堤與田埂走一個多小時才到學校。路上有同行的孩子，大家唱歌、打鬧，也分享彼此的乾糧。雨季過河得涉水，高年級的同學會輪流把你背過去。',
    effects: { knowledge: +2, social: +3, health: -1, happiness: +1 },
  },
  {
    id: 'regional_market_day',
    title: '趕集日',
    ages: [5, 85],
    once: false,
    cooldown: 5,
    weight: 0.4,
    tags: ['regional', 'community'],
    cond: (s, h) => lowInc(h) || (h.income() === 'UM' && rural(h)),
    text: (s, h) => '趕集的日子，鎮上從清晨就開始熱鬧。你擠過攤位、討價還價，聽見各種語言與笑聲，嘗到從遠方運來的水果。回家時籃子沉甸甸的，你的心也是。',
    effects: { social: +3, happiness: +2, wealth: +1 },
  },

  // =====================================================================================
  // 城市邊緣、能源與生計
  // =====================================================================================
  {
    id: 'regional_informal_settlement',
    title: '貼著河岸的家',
    ages: [10, 70],
    weight: 1.5,
    tags: ['regional', 'urban', 'home'],
    cond: (s, h) => h.urban() && lowInc(h) && h.isRegion('SSA', 'SAS', 'LAC', 'SEA', 'MENA') && h.wealthQ() <= 4,
    text: (s, h) => '你家住在城市邊緣的社區，房子是鄰居們用磚與鐵皮一點一點蓋起來的。一天，有人貼來一張通知，說這片地要重新規劃。大家站在巷口，七嘴八舌，沒有人知道自己的家還能留多久。',
    choices: [
      {
        label: '和鄰居組成自救會，與政府協商',
        effects: { social: +5, happiness: +1, wealth: -1 },
        result: '你們開了無數次會，整理住戶名冊、拍照存證，又找來志工律師。最後談出的結果不完美，但大多數人至少拿到了替代住所或補償。',
        ai: 2,
      },
      {
        label: '搬到另一個較遠的社區',
        effects: { wealth: -3, social: -3, happiness: -2 },
        result: '你收拾好家當，搬到更遠的新社區。上班的路程多了一個小時，但那邊的房東答應不隨意漲租，你鬆了一口氣。',
        ai: 1,
      },
      {
        label: '先觀望，補強房子、繼續生活',
        effects: { wealth: -1, happiness: -1 },
        result: '你把屋頂補好、牆角重漆一遍，並照常過日子。通知單慢慢被雨淋糊，後來傳來的消息是：計畫暫緩。你沒有放鬆，只是學會把不安藏進日常。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'regional_power_cut',
    title: '又停電了',
    ages: [6, 80],
    once: false,
    cooldown: 8,
    weight: 0.6,
    tags: ['regional', 'energy'],
    cond: (s, h) => (lowInc(h) || h.income() === 'UM') && h.isRegion('SSA', 'SAS', 'MENA', 'LAC', 'CAS', 'SEA'),
    text: (s, h) => '電表又停了，整條街一瞬間陷入黑暗。冰箱裡的東西開始悶悶地融化，電風扇在你頭頂慢慢停下來。鄰居拿著蠟燭走出門，笑說今晚又是「全街聚會」。',
    choices: [
      {
        label: '買一組太陽能燈或發電機',
        cond: (s, h) => h.stat('wealth') >= 25,
        effects: { wealth: -2, knowledge: +1, happiness: +1 },
        result: '你省下了兩個月的零用錢，買了一盞太陽能燈。停電時，你家是整條街最亮的地方，孩子們跑來寫功課，母親就端出一鍋熱湯。',
        ai: 1.4,
      },
      {
        label: '就當作全家聊天的時間',
        effects: { social: +3, happiness: +1 },
        result: '大家圍坐在一起說笑話、講老故事，孩子們用手電筒在牆上變出各種影子。電來的時候，反而有人嘆了口氣。',
        ai: 2,
      },
      {
        label: '去咖啡店、網咖或朋友家借電',
        effects: { knowledge: +2, wealth: -1, social: +1 },
        result: '你抱著作業或手機趕去有發電機的店。老闆說隨便坐，點杯茶就好，你在角落窩了一整晚，寫完了該寫的所有東西。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'regional_microfinance',
    title: '互助小組的第一筆貸款',
    ages: [20, 60],
    weight: 1.5,
    tags: ['regional', 'money', 'work'],
    cond: (s, h) => lowInc(h) && h.yearIn(1985, 2060) && h.isRegion('SAS', 'SEA', 'SSA', 'LAC') && !h.has('microloan'),
    text: (s, h) => '鄰居的姊妹們組成了小小的互助小組，每週聚會一次，輪流存錢，也可以借一小筆錢做生意。她們問你要不要加入：一個人借不到的錢，一群人互相擔保，就變得可以了。',
    choices: [
      {
        label: '加入並借款，買羊、縫紉機或進貨',
        effects: (s, h) => { if (h.chance(0.7)) { h.change('wealth', +5); h.change('social', +3); } else { h.change('wealth', -3); h.change('happiness', -2); h.change('social', +1); } },
        set: ['microloan'],
        result: '你用借來的錢買了縫紉機，接了鄰居的修改衣服與學校制服的訂單。每週聚會時，你都準時繳款，並看著其他人一個個把小生意做起來。',
        ai: 1.6,
      },
      {
        label: '只加入儲蓄，不借款',
        effects: { wealth: +1, social: +3 },
        set: ['microloan'],
        result: '你每週存下一點，並學會看帳本。大家笑你保守，但年底分紅時，你用存下來的錢給孩子付了學費，心裡很踏實。',
        ai: 1.8,
      },
      {
        label: '先觀望，不想欠任何人',
        effects: { happiness: +0, social: -1 },
        set: ['microloan'],
        result: '你婉拒了邀請。看著她們每週聚在一起說笑，你偶爾會想，如果當時答應了，今天的日子會不會不一樣。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'regional_land_dispute',
    title: '田界上的石頭',
    ages: [25, 72],
    weight: 0.6,
    tags: ['regional', 'farm', 'law'],
    cond: (s, h) => rural(h) && lowInc(h) && h.isRegion('SSA', 'SAS', 'SEA', 'LAC', 'MENA', 'CAS'),
    text: (s, h) => '有一天，你發現鄰家把田界的石頭往你這邊挪了一尺。這塊地是祖輩傳下來的，沒有什麼文件，只有大家口耳相傳的記憶。你的家人憤憤不平，長輩要你冷靜。',
    choices: [
      {
        label: '請村裡長輩出面調解',
        effects: { social: +3, wealth: -1, happiness: +1 },
        result: '兩家人在樹蔭下坐了一個下午，長輩翻出舊事，一點一點確認。最後他們一起把石頭搬回原位，鄰居還送來一袋剛摘的芒果。',
        ai: 2.5,
      },
      {
        label: '到鄉公所或法院辦理土地登記',
        cond: (s, h) => h.eduAtLeast('primary') || h.income() !== 'L',
        effects: { wealth: -3, knowledge: +2, social: -2 },
        result: '你來回跑了好幾趟，花了不少錢，也學會了怎麼讀地籍圖。最後你終於拿到一紙文件，鄰居見到你時，臉色有點不自在。',
        ai: 1.2,
      },
      {
        label: '算了，退一步海闊天空',
        effects: { wealth: -2, happiness: -2, social: +1 },
        result: '你把一尺的土地放下，並要求家人別再提。事情就這樣過去，但每次經過那塊石頭，你都要多看一眼。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'regional_cash_transfer',
    title: '每月的那筆補助',
    ages: [20, 65],
    once: false,
    cooldown: 8,
    weight: 0.6,
    tags: ['regional', 'money', 'family'],
    cond: (s, h) => !h.incomeAtLeast('H') && h.wealthQ() <= 3 && CASH_TRANSFER.has(s.countryCode) && h.yearIn(1998, 2100) && h.hasChildren(),
    text: (s, h) => '每個月，你的手機會收到一則簡訊：這個月的補助匯進去了。條件是孩子要按時上學、定期打疫苗。金額不大，但足以讓冰箱多一排雞蛋，也讓你不必為了學費半夜睡不著。',
    effects: { wealth: +3, knowledge: +1, happiness: +2, health: +1 },
  },
  {
    id: 'regional_remittance_day',
    title: '匯款通知',
    ages: [18, 70],
    once: false,
    cooldown: 8,
    weight: 0.7,
    tags: ['regional', 'money', 'migration'],
    cond: (s, h) => lowInc(h) && REMIT.has(s.countryCode) && h.yearIn(1980, 2100) && (h.siblings() > 0 || h.hasChildren() || h.parentsAlive() > 0),
    text: (s, h) => '月底，手機跳出一則匯款通知：在國外工作的家人又把一部分薪水寄了回來。你看著那個數字，知道它背後是對方在異地一個個疲倦的夜班。全家人圍著，討論這筆錢該怎麼用。',
    choices: [
      {
        label: '拿來付學費、買書與制服',
        effects: { knowledge: +3, wealth: -1, happiness: +2 },
        result: '你把學費繳清，剩下的買了新書包與兩雙鞋。孩子在學校的筆記本上畫了一個國旗，旁邊寫了遠方那個人的名字。',
        schedule: [{ id: 'regional_remittance_result', inYears: [2, 4] }],
        ai: 2.2,
      },
      {
        label: '修房子、買水槽與蓋一間牢固的屋頂',
        effects: { wealth: +1, health: +2, happiness: +2 },
        result: '你們找了工班，一面牆一面牆地修。雨季來時，滴水聲終於從屋裡消失，大家坐在乾乾的床上，輕輕歡呼。',
        schedule: [{ id: 'regional_remittance_result', inYears: [2, 4] }],
        ai: 1.6,
      },
      {
        label: '存起來做小生意本錢',
        effects: (s, h) => { h.change('wealth', h.chance(0.6) ? +4 : -2); h.change('social', +1); },
        result: '你用這筆錢開了一間小雜貨舖，招牌是自己手寫的。生意時好時壞，但你每天晚上對帳，都覺得離家人更近了一點。',
        schedule: [{ id: 'regional_remittance_result', inYears: [2, 4] }],
        ai: 1.2,
      },
    ],
  },
  {
    id: 'regional_remittance_result',
    title: '寄回來的不只是錢',
    ages: [18, 80],
    weight: 0,
    tags: ['regional', 'followup', 'migration'],
    text: (s, h) => '幾年後，遠方的家人終於回來探望，行李箱裡塞滿了禮物，也塞滿了故事。你看著他變瘦、變黑，也變得很安靜，深夜裡兩人坐在院子裡，什麼也沒說，卻什麼都明白。',
    effects: { happiness: +3, social: +3 },
  },
  {
    id: 'regional_mining_town',
    title: '礦坑裡的安全課',
    ages: [18, 60],
    once: false,
    cooldown: 8,
    weight: 1.5,
    tags: ['regional', 'work', 'safety'],
    cond: (s, h) => MINING.has(s.countryCode) && (h.isJob('miner') || (rural(h) && !h.incomeAtLeast('H') && h.employed())),
    text: (s, h) => '早班下井前，領班把大家集合在一起。前幾天隔壁礦場出了意外，今天他的語氣特別嚴肅。他要大家再檢查一次通風、支架和逃生路線，不要為了趕進度冒險。',
    choices: [
      {
        label: '認真參加訓練，與工友互相檢查',
        effects: (s, h) => { h.change('health', +1); h.change('social', +3); h.addRisk(0.92, 3); },
        result: '你和搭檔互相檢查裝備，連安全帽下的燈都測了三次。下班走出礦口時，天空是你這輩子看過最亮的藍色。',
        ai: 2.5,
      },
      {
        label: '為了趕產量，省略部分步驟',
        effects: (s, h) => { h.change('wealth', +3); h.change('health', -3); h.addRisk(1.2, 2); },
        result: '那個月的獎金比平常多，家裡終於還清了一筆債。然而每次聽見岩壁的細微聲響，你都忍不住屏住呼吸。',
        ai: 0.8,
      },
      {
        label: '考慮離開礦場，另找工作',
        effects: { wealth: -3, happiness: +1, health: +2 },
        result: '你放下了安全帽，回到鎮上找零工。收入少了一半，但晚上睡得著，家人也不再在你出門時悄悄在窗邊看著你的背影。',
        ai: 1,
      },
    ],
  },
  {
    id: 'regional_fishing_season',
    title: '網裡的魚少了',
    ages: [14, 75],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['regional', 'work', 'sea'],
    cond: (s, h) => COASTAL_FISH.has(s.countryCode) && (h.isJob('fisher') || (rural(h) && !h.incomeAtLeast('H') && h.employed())),
    text: (s, h) => '天還沒亮，你和同伴們已經把船推進海裡。這幾年網裡的魚越來越少，魚的個頭也越來越小。老漁民望著海平線嘆氣，說祖父輩出海時，一網下去，船都要沉。',
    choices: [
      {
        label: '加入合作社，輪流休漁與限制漁獲量',
        effects: { wealth: -1, social: +3, happiness: +1 },
        result: '大家坐下來訂規則，哪裡休養、什麼時間不出海。短期收入少了，但兩三年後，淺海的魚群真的回來了，孩子在碼頭驚呼。',
        ai: 1.8,
      },
      {
        label: '駕船去更遠的海域',
        effects: (s, h) => { h.change('wealth', +2); h.change('health', -2); h.addRisk(1.1, 1); },
        result: '你們多帶了燃料與冰塊，出海三天。魚獲不錯，但風浪也更大，回航時你緊抱著船舷，心想這樣的日子還能持續多久。',
        ai: 1.2,
      },
      {
        label: '兼做別的工作，逐漸轉行',
        effects: { wealth: +1, happiness: -1, knowledge: +1 },
        result: '你開始在漁港附近賣早餐、替遊客導覽或修理漁網。收入比以前穩定，只是偶爾聽到引擎聲，還是會下意識看向海。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'regional_pastoral_move',
    title: '跟著牧草走',
    ages: [8, 80],
    weight: 0.8,
    tags: ['regional', 'pastoral', 'family'],
    cond: (s, h) => PASTORAL.has(s.countryCode) && rural(h) && !h.incomeAtLeast('H'),
    text: (s, h) => '草場一年比一年短，今年的雨又來得晚。家人在營地圍著火，討論下一個季節要往哪裡去，畜群的哪一隻最瘦、孩子們是不是要留在城裡的學校。夜很長，星星很近。',
    choices: [
      {
        label: '全家跟著畜群繼續遷徙',
        effects: { social: +3, health: -1, knowledge: -1, happiness: +1 },
        result: '你們拆下帳篷，裝上牲口，沿著熟悉的路線出發。夜裡坐在新的營地，長輩教你辨認星星與風向，那是任何學校都教不到的知識。',
        ai: 1.2,
      },
      {
        label: '讓孩子留在鎮上的學校，大人繼續放牧',
        effects: { knowledge: +3, social: -2, wealth: -1 },
        result: '你們在鎮上租了小房間，孩子週間上學，假期回到草場。車子一開走，營地忽然變得很安靜，但母親說，這是為了他們以後可以選擇。',
        ai: 1.6,
      },
      {
        label: '定居在鎮郊，兼營畜牧與小生意',
        effects: { wealth: +2, health: +1, social: -1, happiness: -1 },
        result: '你們蓋了固定的房子，牲口交給親戚輪流照料，自己在鎮上開了小店。屋頂是平的，夜裡你有時走到門口，抬頭尋找那片熟悉的天空。',
        ai: 1,
      },
    ],
  },
  {
    id: 'regional_dzud_winter',
    title: '冰封的草原',
    ages: [8, 80],
    once: false,
    cooldown: 10,
    chance: 0.08,
    tags: ['regional', 'pastoral', 'climate'],
    cond: (s, h) => ['MNG', 'KAZ', 'KGZ'].includes(s.countryCode) && rural(h),
    text: (s, h) => '夏天的乾旱之後，冬天又來得又急又冷。一場冰雪封住了草場，牲口刨不到草，一隻接一隻倒在雪地裡。你和家人一整個冬天都在算，剩下的羊能不能撐到春天。',
    effects: { wealth: -6, happiness: -4, health: -2, social: +2 },
  },
  {
    id: 'regional_cotton_harvest',
    title: '秋天的棉花田',
    ages: [8, 18],
    weight: 3,
    tags: ['regional', 'school', 'farm'],
    cond: (s, h) => COTTON.has(s.countryCode) && h.yearIn(1970, 2015) && h.inSchool() && rural(h),
    text: (s, h) => '秋天一到，學校宣布停課，全班被帶去棉花田摘棉花。你彎著腰，背上掛著越來越重的布袋，手被棉殼刮得到處是細小的傷口。同學們互相比賽誰摘得多，也在田埂上偷偷分食乾饢。',
    effects: { health: -2, knowledge: -2, social: +3, happiness: -1 },
  },
  {
    id: 'regional_mother_tongue',
    title: '教室裡的另一種語言',
    ages: [5, 14],
    weight: 2,
    tags: ['regional', 'school', 'language'],
    cond: (s, h) => MINORITY_LANG.has(s.countryCode) && h.inSchool() && rural(h),
    text: (s, h) => '在家你說的是從小聽到大的語言，教室裡老師卻只用另一種語言上課。起初你像個啞巴，聽不懂題目，也不敢舉手。有一天，來了一位會說你家鄉話的新老師，你終於聽懂了她的第一句話。',
    effects: { knowledge: +3, happiness: +3, social: +2 },
  },

  // =====================================================================================
  // 流離與重建
  // =====================================================================================
  {
    id: 'regional_conflict_displacement',
    title: '離開家的決定',
    ages: [3, 80],
    once: false,
    cooldown: 12,
    weight: (s, h) => (inZone(s, h) ? 1.8 : 0),
    tags: ['regional', 'conflict', 'displacement'],
    cond: (s, h) => inZone(s, h),
    text: (s, h) => '戰事一天一天逼近。街上的店面一間間關了，鄰居們在夜裡悄悄裝車。你的家人圍坐在桌前，將證件、藥品與僅有的現金放在一起，說著從沒有想過的話：我們要不要離開？',
    choices: [
      {
        label: '投靠相對安全地區的親戚',
        effects: (s, h) => { h.change('wealth', -4); h.change('happiness', -3); h.change('social', -2); h.set('displaced'); },
        result: '你們擠上一輛塞滿行李的客運，在另一座城市的親戚家落腳。十幾個人睡在同一間屋子，卻沒有人抱怨。',
        ai: 1.8,
      },
      {
        label: '前往邊境的難民營或收容中心',
        effects: (s, h) => { h.change('wealth', -5); h.change('happiness', -4); h.change('health', -2); h.set('displaced'); },
        result: '你們走了好幾天，才抵達邊境的營地。登記、領毯子、領號碼牌……一排排白色帳篷在風裡微微起伏，你第一次覺得，原來「安全」是這麼樸素的事。',
        schedule: [{ id: 'regional_camp_life', inYears: [1, 3] }],
        ai: 1.6,
      },
      {
        label: '留在家鄉，與鄰居互相照應',
        effects: (s, h) => { h.change('happiness', -3); h.change('health', -3); h.change('social', +3); h.set('war'); h.addRisk(1.25, 2); },
        result: '你們留了下來，把地下室整理成共用的避難處，大家輪流守夜、分享食物。警報聲響起時，你抓緊孩子的手，一遍遍告訴他：「我們在一起。」',
        schedule: [{ id: 'regional_after_the_fighting', inYears: [2, 5] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'regional_after_the_fighting',
    title: '槍聲遠了',
    ages: [3, 95],
    weight: 0,
    tags: ['regional', 'followup', 'conflict'],
    text: (s, h) => '有一天你發現，已經好幾週沒有聽見警報聲了。市場重新開了門，孩子們在巷子裡追著一顆破皮球，大人們互相問候時，多加了一句「你們都還平安吧」。',
    effects: (s, h) => { h.unset('war'); h.change('happiness', +3); h.change('social', +3); },
  },
  {
    id: 'regional_camp_life',
    title: '營地裡的日子',
    ages: [3, 85],
    weight: 0,
    tags: ['regional', 'followup', 'displacement'],
    text: (s, h) => '營地的日子是用分配來計算的：水、麵包、帳篷的位置。可是孩子們很快在泥地上畫出了跳房子，婦女們合力辦起縫紉班，有人用空罐頭做了一把會響的琴。尊嚴，原來也可以從這裡慢慢長出來。',
    effects: { social: +3, knowledge: +1, happiness: -1, wealth: -1 },
    schedule: [{ id: 'regional_new_start', inYears: [1, 4] }],
  },
  {
    id: 'regional_new_start',
    title: '下一站在哪裡',
    ages: [5, 85],
    weight: 0,
    tags: ['regional', 'followup', 'displacement', 'migration'],
    text: (s, h) => '時間久了，營地裡的人開始談論下一步：有人想回去，有人想留在原地重新開始，也有人申請了第三國的重新安置。你拿著一張小小的登記表，字跡有點抖，不確定該如何填寫。',
    choices: [
      {
        label: '等局勢穩定，回到家鄉',
        effects: (s, h) => { h.unset('displaced'); h.unset('war'); h.change('wealth', -2); h.change('happiness', +4); h.change('social', +3); },
        result: '你們回到熟悉的街道，房子只剩下半面牆。大家拿著桶子、鏟子重新動手，鄰居們也一個個回來，最先修好的是廚房的灶。',
        highlight: '經歷流離之後重返家鄉。',
        ai: 1.6,
      },
      {
        label: '在收容的地方安頓下來，重新工作',
        effects: (s, h) => { h.unset('war'); h.change('wealth', +2); h.change('happiness', +1); h.change('social', -1); h.change('knowledge', +2); },
        result: '你開始學當地的語言，找了第一份正式的工作。薪水不高，但每個月都能自己決定怎麼用，這件事讓你覺得久違地像個完整的人。',
        ai: 1.6,
      },
      {
        label: '申請到第三國重新安置',
        cond: (s, h) => !h.isMigrant() && h.age() < 60,
        effects: (s, h) => { h.unset('war'); h.migrate(h.pick(['DEU', 'CAN', 'SWE', 'AUS', 'USA', 'NOR', 'GBR', 'NLD', 'NZL'])); h.change('wealth', +2); h.change('social', -5); h.change('happiness', +1); },
        result: (s, h) => `漫長的審查之後，你們終於收到了通知。飛機降落在${h.countryName()}，第一個冬天很冷，志工遞給你一件厚外套，你穿上時眼眶發熱。`,
        highlight: (s, h) => `輾轉重新安置到${h.countryName()}。`,
        ai: 1.2,
      },
    ],
  },

  // =====================================================================================
  // 高所得與寒熱地區
  // =====================================================================================
  {
    id: 'regional_rich_city_loneliness',
    title: '城市裡的獨處',
    ages: [22, 62],
    once: false,
    cooldown: 8,
    weight: (s, h) => (h.stat('social') < 55 ? 1.4 : 0.3),
    tags: ['regional', 'urban', 'mental'],
    cond: (s, h) => h.incomeAtLeast('UM') && h.urban() && !h.married(),
    text: (s, h) => '你住在擁有一千萬人的城市裡，卻發現已經三天沒有和任何人真正說過話。外送員把餐點掛在門把上，你們隔著門板互相說了一句「謝謝」，那是整天最像對話的時刻。',
    choices: [
      {
        label: '報名社團、課程或志工活動',
        effects: { social: +5, happiness: +3, wealth: -1 },
        result: '你選了每週一次的陶藝課，手裡的泥土總是變形，旁邊的人笑得比你還大聲。三個月後，你在手機裡有了一個只屬於這門課的群組。',
        ai: 2,
      },
      {
        label: '主動聯絡很久沒見的老朋友',
        effects: { social: +4, happiness: +2 },
        result: '你鼓起勇氣傳了一則「最近好嗎？」。三小時後對方回了一長串，並約你週末見面。原來大家都在等著別人先開口。',
        ai: 2.2,
      },
      {
        label: '繼續獨處，好好充實自己',
        effects: { happiness: -1, social: -2, knowledge: +2 },
        result: '你把空閒時間拿來讀書、學語言，進步很快。只是某個週末夜裡，你站在陽台看著對面一戶戶亮著的燈，覺得自己像一顆被遺忘的星。',
        ai: 1,
      },
    ],
  },
  {
    id: 'regional_overwork',
    title: '亮到深夜的辦公室',
    ages: [24, 58],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['regional', 'work', 'health'],
    cond: (s, h) => h.employed() && h.incomeAtLeast('UM') && (h.isRegion('EAS', 'SEA') || ['USA', 'ARE', 'SAU', 'TUR', 'MEX'].includes(s.countryCode)),
    text: (s, h) => '晚上十點，整層樓的燈還亮著，沒有人先離開。主管沒說什麼，但大家都懂：誰先走，誰就不夠拚。你看著桌上冷掉的便當，想起已經很久沒有和家人一起吃晚飯了。',
    choices: [
      {
        label: '準時下班，接受被誤解的風險',
        effects: { happiness: +3, health: +2, social: -1, wealth: -1 },
        result: '你收拾包包，輕輕說了聲「我先走了」，電梯門一關上你就鬆了口氣。第二天沒有人提起這件事，只有一個年輕同事悄悄對你比了個大拇指。',
        ai: 1.6,
      },
      {
        label: '繼續加班，把案子做完',
        effects: (s, h) => { h.change('wealth', +3); h.change('health', -4); h.change('social', -2); h.addRisk(1.1, 1); },
        result: '你把案子準時完成，主管點頭致意。然而回家路上，你的眼皮沉得像鉛，連捷運過站都沒發現。',
        ai: 1.4,
      },
      {
        label: '與主管坦誠談工作量與彈性時間',
        cond: (s, h) => h.eduAtLeast('secondary'),
        effects: (s, h) => { if (h.chance(0.6)) { h.change('happiness', +4); h.change('health', +2); } else { h.change('happiness', -2); h.change('social', -1); } },
        result: '你預約了十五分鐘的談話。主管聽完，沉默了一會兒，說他其實也很累。你們一起重新分配了工作，情況雖沒有完全好轉，但至少有人開始談論它了。',
        ai: 1.8,
      },
    ],
  },
  {
    id: 'regional_housing_costs',
    title: '房租與頭期款',
    ages: [24, 48],
    once: false,
    cooldown: 12,
    weight: 0.6,
    tags: ['regional', 'urban', 'money', 'home'],
    cond: (s, h) => h.incomeAtLeast('UM') && h.urban() && !h.retired() && h.stat('wealth') < 80,
    text: (s, h) => '每月房租吞掉了收入的一半，附近的新建案則寫著驚人的價格。仲介熱情地說「現在不買就買不起了」，你笑了笑，心裡計算著要存多久才夠頭期款，答案是一個不太好看的數字。',
    choices: [
      {
        label: '搬到離市區更遠的地方，通勤久一點',
        effects: { wealth: +3, happiness: -2, health: -1, social: -1 },
        result: '你在郊區找到便宜一點的房子，每天通勤兩小時。你在車上學會了外語，也學會了站著睡覺，週末終於有一個小陽台可以曬棉被。',
        ai: 1.4,
      },
      {
        label: '與朋友或家人合租、合買',
        effects: { wealth: +2, social: +3, happiness: +1 },
        result: '你和幾位朋友一起租了一層樓，輪流煮飯，也輪流崩潰。帳單被分成四等份，笑聲被放大四倍。',
        ai: 1.8,
      },
      {
        label: '咬牙貸款買下一間小公寓',
        cond: (s, h) => h.stat('wealth') >= 45,
        effects: { wealth: -3, happiness: +3, social: +1 },
        result: '簽約那天，你的手不停發抖。房子只有二十坪，採光普通，但關上門，你覺得世界終於安靜下來，是自己的。',
        ai: 1.3,
      },
    ],
  },
  {
    id: 'regional_extreme_cold',
    title: '零下三十度的冬天',
    ages: [3, 90],
    once: false,
    cooldown: 6,
    weight: 0.8,
    tags: ['regional', 'climate', 'home'],
    cond: (s, h) => COLD.has(s.countryCode),
    text: (s, h) => h.byIncome({
      LM: '氣溫降到零下三十度，窗上結了厚厚一層冰花。家裡的爐子必須整夜添柴，鄰居們輪流到彼此的屋子取暖，水管凍裂時大家就一起拿著吹風機烤。',
      UM: '寒流來襲，暖氣管路發出咕嚕咕嚕的聲響。大家在公寓裡穿著厚毛襪，聚在廚房煮熱湯，窗外的雪一直下到凌晨，直到暖氣管最後一聲咕嚕，大家才各自回房。',
      H: '氣溫降到零下二十度，暖氣費用跟著節節升高。你把圍巾繞了兩圈、戴上厚手套才出門，呼出的氣在眼前變成白色的小雲，隨即消散，遇到熟人時兩人只能點頭。',
    }),
    effects: (s, h) => { h.change('wealth', h.byIncome({ LM: -3, UM: -2, H: -1 })); h.change('social', +2); h.change('health', -1); },
  },
  {
    id: 'regional_extreme_heat',
    title: '四十五度的午後',
    ages: [3, 90],
    once: false,
    cooldown: 6,
    weight: 0.8,
    tags: ['regional', 'climate', 'work'],
    cond: (s, h) => HOT.has(s.countryCode),
    text: (s, h) => h.byIncome({
      L: '午後氣溫超過四十度，田裡的活全改在清晨和傍晚。中午整村的人躲在樹蔭下，女人們分著一壺水，孩子們在乾涸的河床上，追著影子玩。',
      LM: '夏天最熱的那幾週，路面像煎鍋一樣冒著熱氣，工地的工人黎明前就開工，中午全員停工。你用濕布蓋在頭上，對著風扇吹，仍然流汗。',
      UM: '氣象局發布高溫警報，戶外活動被限制在清晨。商場裡擠滿了不想回家的人，冷氣開到最強，連長輩都披上了薄外套，嘴上抱怨著天氣，眼睛卻捨不得離開店裡的小吃。',
      H: '高溫連續好幾週，大型室內冷氣商場成了避暑勝地。你在人造的涼爽裡閒逛，走出大門時熱浪撲面，有一種剛出爐的麵包被放進烤箱的恍惚，不知道該笑還是該逃。',
    }),
    effects: (s, h) => { h.change('health', h.byIncome({ L: -3, LM: -3, UM: -2, H: -1 })); h.change('happiness', -1); h.change('wealth', h.income() === 'H' ? 0 : -1); },
  },
  {
    id: 'regional_winter_storm',
    title: '被雪困住的城鎮',
    ages: [5, 90],
    once: false,
    cooldown: 7,
    weight: 0.5,
    tags: ['regional', 'climate', 'community'],
    cond: (s, h) => h.incomeAtLeast('UM') && (h.isRegion('NAM', 'EUR') || ['JPN', 'KOR', 'CHN'].includes(s.countryCode)),
    text: (s, h) => '暴風雪來襲，整個城鎮被雪埋了半截，路被封、電被切。鄰居們帶著雪鏟和熱湯走出家門，彼此挖開車子、替老人家送暖爐，原本互相只點頭的人，這晚聊了很久。',
    effects: { social: +4, happiness: +2, wealth: -1 },
  },
  {
    id: 'regional_wildfire_season',
    title: '山火季',
    ages: [5, 90],
    once: false,
    cooldown: 8,
    weight: 0.35,
    tags: ['regional', 'climate', 'disaster'],
    cond: (s, h) => WILDFIRE.has(s.countryCode) && h.yearIn(1990, 2200),
    text: (s, h) => '空氣裡的煙味愈來愈濃，山的那一頭一片橘紅。警報簡訊一則接一則跳出來，說你住的區域可能需要撤離。你站在門口，看著車子，不知道該帶走哪些東西。',
    choices: [
      {
        label: '提早撤離，帶上寵物與重要文件',
        effects: { wealth: -2, happiness: -2, health: +0 },
        result: '你們把車子塞滿，開往收容所。當晚的新聞說，火勢最終燒向了你家附近。幸運的是你們已經平安坐在體育館裡，吃著志工送來的三明治。',
        ai: 3,
      },
      {
        label: '留下來協助鄰居與消防隊',
        cond: (s, h) => h.stat('health') >= 45,
        effects: (s, h) => { h.change('social', +3); h.change('health', -4); h.addRisk(1.2, 1); },
        result: '你和鄰居輪流澆濕屋頂與院子，替老人家打包。濃煙讓人睜不開眼，天亮後火線轉向，你們彼此抱在一起，臉黑得只剩下眼白。',
        ai: 0.8,
      },
      {
        label: '先觀望風向，再決定',
        effects: (s, h) => { h.change('health', -3); h.change('happiness', -3); h.addRisk(1.15, 1); },
        result: '你不斷更新著手機上的火場地圖，直到風向忽然轉變。你匆匆上車，一路上咳嗽不停，鏡子裡的眼睛通紅，事後想起仍覺得有點僥倖。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'regional_quake_drill',
    title: '躲在桌子底下',
    ages: [5, 60],
    once: false,
    cooldown: 4,
    weight: 0.4,
    tags: ['regional', 'safety'],
    cond: (s, h) => QUAKE.has(s.countryCode) && (h.inSchool() || h.employed()),
    text: (s, h) => '警報聲響起，所有人迅速鑽到桌子底下，一手抱頭、一手抓住桌腳。老師或主管拿著碼表倒數，結束後你們魚貫走到操場或廣場集合，大家一邊拍掉衣服上的灰，一邊小聲討論下午的點心。',
    effects: { knowledge: +1, health: +1, social: +1 },
  },
  {
    id: 'regional_island_ferry',
    title: '今天沒有船',
    ages: [5, 85],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['regional', 'island'],
    cond: (s, h) => ISLANDS.has(s.countryCode) && (!h.urban() || h.isRegion('OCE')) && !h.incomeAtLeast('H'),
    text: (s, h) => '海面起了大浪，今天往返本島的渡輪停航了。學校送來的課本、診所預定的藥品、親友從市場帶回的雜貨，全都停在海的另一邊。碼頭邊的人互相說笑，打著牌等船。',
    effects: { social: +3, happiness: 0, knowledge: -1, wealth: -1 },
  },
  {
    id: 'regional_festival',
    title: '節慶',
    ages: [4, 95],
    once: false,
    cooldown: 10,
    weight: 0.4,
    tags: ['regional', 'community', 'family'],
    text: (s, h) => festival(s, h),
    effects: (s, h) => { h.change('happiness', +3); h.change('social', +3); h.change('wealth', h.isPoor() ? -1 : 0); },
  },
  {
    id: 'regional_parental_leave',
    title: '育嬰假的早晨',
    ages: [22, 45],
    weight: 3,
    tags: ['regional', 'family', 'work'],
    cond: (s, h) => h.isRegion('EUR') && h.incomeAtLeast('UM') && h.hasChildren() && h.youngestChildAge() === 1 && ['SWE', 'NOR', 'FIN', 'DNK', 'DEU', 'AUT', 'NLD', 'ISL', 'EST', 'CZE', 'SVN', 'POL', 'LTU', 'LVA', 'FRA', 'ESP', 'PRT'].includes(s.countryCode),
    text: (s, h) => `你按照制度請了育嬰假，每個早晨推著嬰兒車去公園，學會了怎麼一邊沖奶一邊接電話。${h.lastChildName()}笑起來的樣子，你以前上班時根本看不到。`,
    effects: { happiness: +4, health: +1, wealth: -1, social: +2 },
  },
  {
    id: 'regional_village_emptying',
    title: '最後一家店關門了',
    ages: [30, 90],
    weight: 1,
    tags: ['regional', 'rural', 'community'],
    cond: (s, h) => rural(h) && h.incomeAtLeast('UM') && h.isRegion('EUR', 'EAS', 'NAM'),
    text: (s, h) => '村口的雜貨店終於貼出了「結束營業」的紙條。學校早已併校，年輕人都去了城市，街上多是和你一樣的熟面孔。你站在鐵門前，想起小時候在這裡買冰棒的錢，是五塊還是一個銅板。',
    effects: { social: -2, happiness: -2, wealth: -1 },
  },
];
