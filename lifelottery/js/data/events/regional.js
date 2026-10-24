// Situations specific to income groups and regions: harvests and drought, rain and floods, malaria seasons,
// informal settlements, power cuts, displacement, overwork and loneliness in rich cities, extreme cold and heat,
// fishing, herding, festivals, remittances. Ids start with `regional_`.
//
// Tone: dignified and concrete, never exoticizing. Events only appear where the country, region, income group
// and (often) rural/urban setting make them statistically plausible.
//
// Phase 4A: the last block (`regional_culture_*`) is about the religion and tradition of the FAMILY (h.religion(), h.festival()),
// which stays with the person wherever they live; festival scenes come from data/religion.js through h.festivalScene().
// Climate events are gated by the place (h.coastal(), h.climate(), h.snowy(), h.hotClimate(), h.altitude()), not by the country alone.
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
const STORMY = new Set(['PHL', 'TWN', 'JPN', 'CHN', 'VNM', 'KOR', 'HKG', 'MAC', 'IDN', 'THA', 'BGD', 'IND', 'LKA', 'MMR', 'MDG', 'MOZ', 'USA', 'MEX', 'CUB', 'HTI', 'DOM', 'JAM', 'HND', 'NIC', 'GTM', 'SLV', 'PRI', 'FJI', 'PNG', 'SLB', 'AUS', 'CRI', 'PAN', 'TTO']);
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

/** byLiving for scenes of a city (metro, office towers): the countryside gets the lower-middle version even in a rich country. */
const ruralDown = (h, map) => (h.urban() ? h.byLiving(map) : h.byLiving({ ...map, UM: map.LM }));
const lowInc = (h) => h.income() === 'L' || h.income() === 'LM';
const rural = (h) => !h.urban() && !h.displaced();

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
    text: (s, h) => {
      const desk = h.employed() && h.isJob('clerk', 'sales', 'technician', 'civil_servant', 'accountant', 'engineer', 'developer', 'manager', 'lawyer', 'researcher', 'teacher', 'entrepreneur');
      const wet = ruralDown(h, { // narration: a villager in a middle-income country does not get the metro
        L: '雨季到了第三個月，田間的小路成了小河，學校連續停課好幾天。孩子們用塑膠袋當船在水裡追，大人則忙著墊高穀倉與檢查屋頂，一邊祈禱雨在播種前停下來。',
        LM: h.employed()
          ? '連日的大雨讓巷子淹到小腿，人力車、摩托車都在水裡慢慢地推。你把鞋子提在手上，一路光腳走到公車站，上班遲到也沒有人責怪，因為大家都在同一片水裡掙扎。'
          : h.inSchool()
            ? '連日的大雨讓巷子淹到小腿，人力車、摩托車都在水裡慢慢地推。你把鞋子提在手上，一路光腳走到學校，老師和同學也都濕到膝蓋，上課遲到沒有人責怪，因為大家都在同一片水裡掙扎。'
            : s.age < 14
              ? '連日的大雨讓巷子淹到小腿，人力車、摩托車都在水裡慢慢地推。大人把你扛在肩上涉水過巷子，你覺得這比任何遊戲都好玩，路上遇到的每個人卻都皺著眉苦笑。'
              : '連日的大雨讓巷子淹到小腿，人力車、摩托車都在水裡慢慢地推。你把鞋子提在手上，一路光腳走去辦事，路上遇到的每個人都在同一片水裡掙扎，彼此苦笑著打招呼。',
        UM: desk
          ? '雨季的豪雨讓路面積水，地下道封閉，捷運停駛。你在辦公室待到深夜，和同事分食便當，等雨小一點才敢出門，結果走到站口發現隔壁同事早已在那裡等車。'
          : h.inSchool()
            ? '雨季的豪雨讓路面積水，地下道封閉，捷運停駛。放學時你和同學擠在校門口的屋簷下，分食彼此的零食，等雨小一點才敢出門，結果走到站口發現隔壁班的人早已在那裡等車。'
            : '雨季的豪雨讓路面積水，地下道封閉，捷運停駛。你在騎樓下和一群陌生人擠了兩個小時，有人分你半個麵包，等雨小一點才敢出門，走到站口，才發現大家早都散了。',
        H: desk
          ? `豪雨特報${h.techReady(2005) ? '不斷跳出手機' : '一再從廣播裡傳出來'}，市區許多路段淹水，你被困在辦公室過夜。同事們鋪好睡袋、叫了外賣，把這場雨當成一次意外的露營，凌晨還有人打起了撲克牌。`
          : h.inSchool()
            ? (h.age() < 18
              ? `豪雨特報${h.techReady(2005) ? '不斷跳出手機' : '一再從廣播裡傳出來'}，市區許多路段淹水，學校宣布提早放學。你和幾個同學被困在教室裡，${h.techReady(2005) ? '用手機訂了披薩' : '請校工去巷口叫了便當'}，把這場雨當成一次意外的露營，等大人一個個來接。`
              : `豪雨特報${h.techReady(2005) ? '不斷跳出手機' : '一再從廣播裡傳出來'}，市區許多路段淹水。你和幾個同學被困在圖書館裡，${h.techReady(2005) ? '用手機訂了披薩' : '輪流去販賣機買了熱飲'}，把這場雨當成一次意外的露營，直到水退才一個個離開。`)
            : `豪雨特報${h.techReady(2005) ? '不斷跳出手機' : '一再從廣播裡傳出來'}，市區許多路段淹水，${h.age() < 14 ? '你跟著大人被困在咖啡店裡' : '你被困在咖啡店裡'}過了大半個夜晚。店員把剩下的點心端出來，陌生人們聊起各自的淹水往事，把這場雨當成一次意外的聚會。`,
      });
      return wet;
    },
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
    cond: (s, h) => STORMY.has(s.countryCode) && h.coastal(),
    text: (s, h) => `${stormName(s, h)}的警報在傍晚響起。${s.age < 14 ? h.byIncome({
      L: '大人把屋頂用繩子綁緊，把能搬的東西搬到最高處，你被擠在角落的草蓆上，聽著風聲與雨聲一直到天亮。鄰居也來了，大家擠在一起，誰也沒睡著，你卻因為人多而不怎麼害怕。',
      LM: '大人把窗戶貼上膠帶，把重要證件包進塑膠袋。風雨一整夜地敲著鐵皮，你抱著枕頭縮在大人身邊，早上整條街都是倒下的樹枝與電線，你跟著鄰居的孩子們去撿樹枝。',
      UM: '學校宣布停課，超市貨架被搶購一空。你在家喝著大人煮的熱麵，隔著窗看風把招牌吹得嘩啦嘩啦響，興奮得睡不著。',
      H: '學校宣布停課，大人在家囤好了食物與電池。你在客廳搭了一座被單堡壘，聽著窗外的風聲，覺得這是個難得的意外假期。',
    }) : h.byIncome({
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
    tags: ['regional', 'health', 'malaria', 'disease'],
    cond: (s, h) => h.yearIn(1970, 2060) && !h.incomeAtLeast('H') && h.altitude() !== 'high' && (h.isRegion('SSA') || (h.isRegion('SAS', 'SEA', 'OCE') && lowInc(h)) || ['PNG', 'SLB', 'GUY', 'SUR', 'HTI', 'BOL', 'COL', 'HND', 'NIC', 'VEN'].includes(s.countryCode)),
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
    tags: ['regional', 'health', 'malaria', 'wellness'],
    cond: (s, h) => h.yearIn(2000, 2040) && lowInc(h) && h.altitude() !== 'high' && h.isRegion('SSA', 'SAS', 'SEA', 'OCE'),
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
        result: (s, h) => `你和幾戶鄰居一起學著砌爐灶，泥土、磚塊與鐵管。第一次點火，煙乖乖往上走，屋裡不再嗆人，${h.parentAlive('mother') ? '母親' : '隔壁的老婆婆'}笑著說：「這是我這輩子最乾淨的廚房。」`,
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
    text: (s, h) => `村裡鑿好了一口深水井，開工那天大人小孩都圍著看。第一桶水打上來時，所有人都安靜了，接著有人鼓掌。以後再也不用天不亮就走很遠去提水了，${h.parentAlive('mother') ? '母親和姊妹們' : '村裡的女人和女孩們'}終於能多睡一會兒。`,
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
        result: '你收拾好家當，搬到更遠的新社區。每天往返的路程多了一個小時，但那邊的房東答應不隨意漲租，你鬆了一口氣。',
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
    text: (s, h) => `電表又停了，整條街一瞬間陷入黑暗。${h.techReady(1965) ? '冰箱裡的東西開始悶悶地融化，' : '煤油燈和蠟燭一盞盞被翻出來，'}電風扇在你頭頂慢慢停下來。鄰居拿著蠟燭走出門，笑說今晚又是「全街聚會」。`,
    choices: [
      {
        label: '買一組太陽能燈或發電機',
        cond: (s, h) => h.stat('wealth') >= 25,
        effects: { wealth: -2, knowledge: +1, happiness: +1 },
        result: (s, h) => `你省下了兩個月的${h.age() < 18 ? '零用錢' : '菜錢'}，買了一盞太陽能燈。停電時，你家是整條街最亮的地方，孩子們跑來寫功課，${h.age() < 25 && h.parentAlive('mother') ? '母親' : h.hasPartner() ? h.partnerName() : '鄰居'}就端出一鍋熱湯。`,
        ai: 1.4,
      },
      {
        label: '就當作全家聊天的時間',
        effects: { social: +3, happiness: +1 },
        result: '大家圍坐在一起說笑話、講老故事，孩子們用手電筒在牆上變出各種影子。電來的時候，反而有人嘆了口氣。',
        ai: 2,
      },
      {
        label: '去有發電機的店或朋友家借電',
        effects: { knowledge: +2, wealth: -1, social: +1 },
        result: (s, h) => `你抱著${h.inSchool() ? '作業' : h.year() >= 2005 ? '手機和筆電' : '帳本和一疊要整理的東西'}趕去有發電機的店。老闆說隨便坐，點杯茶就好，你在角落窩了一整晚，做完了該做的所有事。`,
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
    cond: (s, h) => lowInc(h) && h.yearIn(1985, 2060) && h.isRegion('SAS', 'SEA', 'SSA', 'LAC') && !h.has('microloan') && (h.female() || h.stable('mixed_savings_group', 0.3)), // the groups are mostly women's
    text: (s, h) => `鄰居們組成了小小的互助小組，每週聚會一次，輪流存錢，也可以借一小筆錢做生意。${h.female() ? '她們' : '他們'}問你要不要加入：一個人借不到的錢，一群人互相擔保，就變得可以了。`,
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
        result: '兩家的人在樹蔭下坐了一個下午，長輩翻出舊事，一點一點確認。最後他們一起把石頭搬回原位，鄰居還送來一袋剛摘的芒果。',
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
    cond: (s, h) => !h.incomeAtLeast('H') && h.wealthQ() <= 3 && CASH_TRANSFER.has(s.countryCode) && h.yearIn(1998, 2100) && h.hasChildren() && h.youngestChildAge() <= 17,
    text: (s, h) => (h.year() >= 2010
      ? '每個月，你的手機會收到一則簡訊：這個月的補助匯進去了。條件是孩子要按時上學、定期打疫苗。金額不大，但足以讓冰箱多一排雞蛋，也讓你不必為了學費半夜睡不著。'
      : '每個月，你到鎮上的郵局或銀行窗口排隊，領回一個薄薄的信封：這個月的補助。條件是孩子要按時上學、定期打疫苗。金額不大，但足以讓家裡多一排雞蛋，也讓你不必為了學費半夜睡不著。'),
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
    text: (s, h) => `月底，${h.year() >= 2008 ? '手機跳出一則匯款通知' : '郵局的人把一張匯款單送到門口'}：在國外工作的家人又把一部分薪水寄了回來。你看著那個數字，知道它背後是對方在異地一個個疲倦的夜班。全家人圍著，討論這筆錢該怎麼用。`,
    choices: [
      {
        label: '拿來付學費、買書與制服',
        cond: (s, h) => h.hasChildren() || h.siblings() > 0,
        effects: { knowledge: +3, wealth: -1, happiness: +2 },
        result: (s, h) => `你把學費繳清，剩下的給家裡的小孩買了新書包與兩雙鞋。${h.hasChildren() ? '孩子' : '弟妹'}在學校的筆記本上畫了一個國旗，旁邊寫了遠方那個人的名字。`,
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
    cond: (s, h) => MINING.has(s.countryCode) && h.isJob('miner'),
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
    cond: (s, h) => COASTAL_FISH.has(s.countryCode) && h.isJob('fisher') && h.coastal(),
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
    cond: (s, h) => PASTORAL.has(s.countryCode) && rural(h) && !h.incomeAtLeast('H') && !h.isJob('farmer', 'fisher', 'street_vendor', 'shopkeeper'),
    text: (s, h) => '草場一年比一年短，今年的雨又來得晚。家人在營地圍著火，討論下一個季節要往哪裡去，畜群的哪一隻最瘦、孩子們是不是要留在城裡的學校。夜很長，星星很近。',
    choices: [
      {
        label: '全家跟著畜群繼續遷徙',
        effects: { social: +3, health: -1, knowledge: -1, happiness: +1 },
        result: '你們拆下帳篷，裝上牲口，沿著熟悉的路線出發。夜裡坐在新的營地，長輩教你辨認星星與風向，那是書本裡教不到的知識。',
        ai: 1.2,
      },
      {
        label: '讓孩子留在鎮上的學校，大人繼續放牧',
        effects: { knowledge: +3, social: -2, wealth: -1 },
        result: (s, h) => `你們在鎮上租了小房間，孩子週間上學，假期回到草場。車子一開走，營地忽然變得很安靜，但${h.parentAlive('mother') ? '母親' : '營地裡的老人'}說，這是為了他們以後可以選擇。`,
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
        effects: (s, h) => { h.change('wealth', -4); h.change('happiness', -3); h.change('social', -2); h.set('displaced'); h.s.flags._displacedAt = h.year(); },
        result: '你們擠上一輛塞滿行李的客運，在另一座城市的親戚家落腳。十幾個人睡在同一間屋子，卻沒有人抱怨。',
        ai: 1.8,
      },
      {
        label: '前往邊境的難民營或收容中心',
        effects: (s, h) => { h.change('wealth', -5); h.change('happiness', -4); h.change('health', -2); h.set('displaced'); h.s.flags._displacedAt = h.year(); },
        result: '你們走了好幾天，才抵達邊境的營地。登記、領毯子、領號碼牌……一排排白色帳篷在風裡微微起伏，你第一次覺得，原來「安全」是這麼樸素的事。',
        schedule: [{ id: 'regional_camp_life', inYears: [1, 3] }],
        ai: 1.6,
      },
      {
        label: '留在家鄉，與鄰居互相照應',
        effects: (s, h) => { h.change('happiness', -3); h.change('health', -3); h.change('social', +3); h.set('war'); h.addRisk(1.25, 2); },
        result: (s, h) => `你們留了下來，把${h.byLiving({ L: '院子裡最結實的那間屋子', LM: '最結實的那間屋子', UM: '地下室', H: '地下室' })}整理成共用的避難處，大家輪流守夜、分享食物。警報聲響起時，${h.age() < 16 ? '大人緊緊抓住你的手，一遍遍告訴你' : h.hasChildren() && h.youngestChildAge() <= 14 ? '你抓緊孩子的手，一遍遍告訴孩子' : '你抓緊身旁人的手，一遍遍告訴對方'}：「我們在一起。」`,
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
        effects: (s, h) => { h.unset('war'); h.unset('displaced'); if (h.age() >= 18 && h.age() < 65 && !h.employed()) h.startJob('laborer'); else if (h.age() < 18 && !h.inSchool()) h.enroll(h.age() < 12 ? 'primary' : 'secondary', { quiet: true }); h.change('wealth', +2); h.change('happiness', +1); h.change('social', -1); h.change('knowledge', +2); },
        result: (s, h) => (h.age() < 18
          ? '你開始學當地的語言，進了附近的學校。起初你聽不懂老師在說什麼，但你每天都早到，坐在最前排，這件事讓你覺得久違地像個完整的人。'
          : '你開始學當地的語言，找了第一份正式的工作。薪水不高，但每個月都能自己決定怎麼用，這件事讓你覺得久違地像個完整的人。'),
        ai: 1.6,
      },
      {
        label: '申請到第三國重新安置',
        cond: (s, h) => !h.isMigrant() && h.age() < 60,
        effects: (s, h) => { h.unset('war'); h.unset('displaced'); h.migrate(h.pick(['DEU', 'CAN', 'SWE', 'AUS', 'USA', 'NOR', 'GBR', 'NLD', 'NZL'])); h.change('wealth', +2); h.change('social', -5); h.change('happiness', +1); },
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
    text: (s, h) => `你住在擁有一千萬人的城市裡，卻發現已經三天沒有和任何人真正說過話。${h.techReady(2012) ? '外送員把餐點掛在門把上' : '隔壁的阿姨把一碗湯放在門口，敲了敲門就走'}，你們隔著門板互相說了一句「謝謝」，那是整天最像對話的時刻。`,
    choices: [
      {
        label: '報名社團、課程或志工活動',
        effects: { social: +5, happiness: +3, wealth: -1 },
        result: '你選了每週一次的陶藝課，手裡的泥土總是變形，旁邊的人笑得比你還大聲。三個月後，你有了一群只屬於這門課的朋友，下課後常一起去吃宵夜。',
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
    cond: (s, h) => h.officeJob() && h.incomeAtLeast('UM') && (h.isRegion('EAS', 'SEA') || ['USA', 'ARE', 'SAU', 'TUR', 'MEX'].includes(s.countryCode)),
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
    title: '冷得刺骨的冬天',
    ages: [3, 90],
    once: false,
    cooldown: 6,
    weight: 0.8,
    tags: ['regional', 'climate', 'home'],
    cond: (s, h) => COLD.has(s.countryCode) && (h.climate() === 'continental' || h.climate() === 'polar'),
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
    cond: (s, h) => HOT.has(s.countryCode) && h.hotClimate(),
    text: (s, h) => h.byIncome({
      L: '午後氣溫超過四十度，田裡的活全改在清晨和傍晚。中午整村的人躲在樹蔭下，女人們分著一壺水，孩子們在乾涸的河床上，追著影子玩。',
      LM: '夏天最熱的那幾週，路面像煎鍋一樣冒著熱氣，工地的工人黎明前就開工，中午全員停工。你用濕布蓋在頭上，對著風扇吹，仍然流汗。',
      UM: h.year() < 1985 ? '高溫連續好幾週，人們躲進騎樓、河邊和戲院裡乘涼，大人搖著蒲扇，孩子泡在水裡不肯上岸。夜裡全家把涼蓆搬到屋外，數著星星等風來。' : '氣象局發布高溫警報，戶外活動被限制在清晨。商場裡擠滿了不想回家的人，空調開到最強，連長輩都披上了薄外套，嘴上抱怨著天氣，眼睛卻捨不得離開店裡的小吃。',
      H: h.year() < 1985 ? '高溫連續好幾週，人們躲進騎樓、河邊和戲院裡乘涼，大人搖著蒲扇，孩子泡在水裡不肯上岸。夜裡全家把涼蓆搬到屋外，數著星星等風來。' : '高溫連續好幾週，大型室內冷氣商場成了避暑勝地。你在人造的涼爽裡閒逛，走出大門時熱浪撲面，有一種剛出爐的麵包被放進烤箱的恍惚，不知道該笑還是該逃。',
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
    cond: (s, h) => h.incomeAtLeast('UM') && h.snowy() && (h.isRegion('NAM', 'EUR') || ['JPN', 'KOR', 'CHN'].includes(s.countryCode)),
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
    text: (s, h) => `空氣裡的煙味愈來愈濃，山的那一頭一片橘紅。${h.year() >= 2008 ? '警報簡訊一則接一則跳出來' : '廣播一遍又一遍地播送'}，說你住的區域可能需要撤離。你站在門口，看著車子，不知道該帶走哪些東西。`,
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
        result: (s, h) => `你不斷${h.year() >= 2008 ? '更新著手機上的火場地圖' : '轉著收音機找最新的火勢消息'}，直到風向忽然轉變。你匆匆上車，一路上咳嗽不停，鏡子裡的眼睛通紅，事後想起仍覺得有點僥倖。`,
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
    cond: (s, h) => QUAKE.has(s.countryCode) && (h.inSchool() || h.wageEarner()),
    text: (s, h) => `警報聲響起，所有人迅速鑽到桌子底下，一手抱頭、一手抓住桌腳。${h.inSchool() ? '老師拿著碼表倒數，結束後你們魚貫走到操場集合' : '主管拿著碼表倒數，結束後你們魚貫走到樓下的廣場集合'}，大家一邊拍掉衣服上的灰，一邊小聲討論下午的點心。`,
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
    ages: [13, 95], // children get their own scene from childhood_festival
    once: false,
    cooldown: 10,
    weight: 0.4,
    tags: ['regional', 'community', 'family', 'festival'],
    // the family's own festival and tradition (religion + home country), with a line about the surroundings when they differ
    text: (s, h) => h.festivalScene(),
    effects: (s, h) => { h.change('happiness', +3); h.change('social', +3); h.change('wealth', h.isPoor() ? -1 : 0); },
  },
  {
    id: 'regional_parental_leave',
    title: '育嬰假的早晨',
    ages: [22, 45],
    weight: 3,
    tags: ['regional', 'family', 'work'],
    cond: (s, h) => h.employed() && h.isRegion('EUR') && h.incomeAtLeast('UM') && h.hasChildren() && h.youngestChildAge() === 1 && ['SWE', 'NOR', 'FIN', 'DNK', 'DEU', 'AUT', 'NLD', 'ISL', 'EST', 'CZE', 'SVN', 'POL', 'LTU', 'LVA', 'FRA', 'ESP', 'PRT'].includes(s.countryCode),
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
  // =====================================================================================
  // 宗教與文化（Phase 4A）：家人的信仰與傳統跟著人走，不跟著所在的國家走。
  // 全部依 h.religion()（出生家庭的宗教／傳統）、h.festival()（家庭的節日）寫；人在別的國家時，
  // 另外看 h.hostFestival()（周圍的人慶祝的節日）。沒有特定宗教的家庭不會遇到宗教儀式事件。
  // =====================================================================================
  {
    id: 'regional_culture_festival_abroad',
    title: '不是假日的節日',
    ages: [18, 80],
    once: false,
    cooldown: 8,
    weight: 1.3,
    tags: ['regional', 'culture', 'festival', 'family', 'migration'],
    cond: (s, h) => h.isMigrant() && h.yearsAbroad() >= 1,
    text: (s, h) => `${h.festival()}快到了。在${h.countryName()}，這一天不是假日，大多數人不知道它對你的意義。${h.hostFestival() ? `街上正忙著準備他們的${h.hostFestival()}，節慶的氣氛和你記憶中的不一樣。` : ''}你把日曆翻了兩次，確認沒有記錯。`,
    choices: [
      {
        label: '把這天空出來，好好過節',
        cond: (s, h) => h.employed() || h.inSchool(),
        effects: { happiness: +3, wealth: -1, social: +1 },
        result: (s, h) => `你跟人說明這天要做什麼，對方愣了一下，點點頭。你在家擺出家鄉的菜，${h.techReady(2005) ? '打開視訊，讓遠方的家人一個個擠進鏡頭' : '撥了一通長途電話，讓遠方的家人一個個輪流接過話筒'}。說明自己的節日，原來也是讓別人認識你的一種方式。`,
        ai: 1.4,
      },
      {
        label: '去找同鄉或同信仰的人一起過',
        effects: { social: +4, happiness: +3 },
        result: (s, h) => `你循著朋友給的地址，找到一間租來的小廳堂，三十幾個人擠在一起，每人帶一道菜。那天你說了很多年沒說的母語，也聽見了很多久違的老歌，${h.hasChildren() ? '孩子們在人群裡跑來跑去，學著大人的樣子說祝福的話。' : '你發現自己並不是一個人在這裡想家。'}`,
        ai: 2,
      },
      {
        label: '安靜地過，煮一點家鄉的東西',
        effects: { happiness: +1, social: -1 },
        result: '你煮了一點家鄉的東西，傳了訊息給家人，然後照常過完這一天。夜裡你坐在窗邊，聽見外面也有人在慶祝別的什麼，不知為什麼，覺得世界很大，也很近。',
        ai: 1,
      },
    ],
  },
  {
    id: 'regional_culture_fasting',
    title: '齋月',
    ages: [12, 85],
    once: false,
    cooldown: 6,
    weight: 1.1,
    tags: ['regional', 'culture', 'religion', 'family'],
    cond: (s, h) => h.isReligion('muslim'),
    text: (s, h) => (h.religionIsMinority()
      ? '齋月到了，你周圍的人照常吃喝、開會、午休。天亮前你吃了簡單的一餐，白天默默守著齋，日落後才和家人或朋友一起開齋。你發現自己對「需要什麼、不需要什麼」特別清楚。'
      : '齋月到了。天還沒亮，屋子裡就有人起來備飯，日落前的最後半小時，整條街安靜得像在等一個訊號。宣禮聲一響，你和家人用一顆棗子和一杯水開了齋，所有的疲憊像被輕輕放下。'),
    choices: [
      {
        label: '全程守齋，多陪伴家人',
        effects: { health: -1, social: +3, happiness: +2 },
        result: '白天的飢餓讓時間變得很慢，夜裡的餐桌卻比平常更熱鬧。鄰居端來的湯、深夜的禮拜、凌晨前一起吃的那頓飯，讓這個月像一條很長很暖的繩子。',
        ai: 2,
      },
      {
        label: '依身體狀況調整，改用補守或施捨代替',
        cond: (s, h) => h.stat('health') < 65 || h.age() >= 65 || h.hasCondition('diabetes') || h.hasCondition('hypertension') || h.hasCondition('heart_disease'),
        effects: { health: +1, social: +1, wealth: -1 },
        result: '你和醫師、家裡懂經義的長輩談過，選擇用補守與施捨取代。有人嘀咕你不夠虔誠，更多人點頭，說這個信仰本來就教人先照顧身體。',
        ai: 2.2,
      },
      {
        label: '邀不同信仰的朋友來吃一頓開齋飯',
        cond: (s, h) => h.religionIsMinority() || h.isMigrant(),
        effects: { social: +4, happiness: +2 },
        result: '朋友們笨拙地學你把棗子放進嘴裡，有人問了許多問題，你一一回答。散場時，有人說這是他們吃過最特別的一頓晚餐，你笑了很久。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'regional_culture_congregation',
    title: '一起聚會的人',
    ages: [6, 95],
    once: false,
    cooldown: 6,
    weight: 0.7,
    tags: ['regional', 'culture', 'religion', 'community'],
    cond: (s, h) => !h.isReligion('none'),
    text: (s, h) => h.byReligion({
      christian: '每個週日，你和家人去教堂。有時你專心聽講道，有時只是聽身旁的人唱歌走音。散場後大家站在門口聊天，一站就是半小時，話題從天氣聊到誰家的孩子考上了學校。',
      muslim: '週五的午後，你跟著人群走進清真寺，在隊伍裡肩並肩站好。散場後鄰居們在門口互相問候，順便打聽誰家有事需要幫忙。',
      hindu: '傍晚，你繞到街角的小廟，點一盞燈、放一朵花。廟裡的鈴聲，是這一帶一天裡最熟悉的聲音，鄰居們也都在，順口聊起了今天的事。',
      buddhist: '逢佛日，你去寺院供花、聽師父說法。院子裡安安靜靜，你站在樹下，什麼也沒求，只是覺得心裡鬆了一些。',
      folk: h.isRegion('SSA')
        ? '在老樹下，長輩請祖先喝一口水，念出家族幾代人的名字，請他們保佑今年的雨水和孩子。你站在人群後面，聽著那些不一定都懂、卻聽了一輩子的名字。'
        : '廟口的香爐前，大家輪流上香、擲筊。你不是每次都懂儀式的意思，但喜歡那種整條街的人一起做同一件事的感覺。',
      jewish: '週五日落前，家裡的桌上擺好了蠟燭與麵包。安息日的晚餐，全家人什麼事都不做，只是坐在一起，慢慢吃、慢慢說話。',
      sikh: '週日的早晨，你去錫克教寺廟，在長墊子上坐了一會兒，聽誦讀與歌唱。散場後你在公共廚房幫忙揉麵，和陌生人並肩坐在地上吃飯。',
      _: '你和同樣信仰的人聚在一個普通的房間裡，儀式很簡單，大家輪流說話，也輪流安靜。出了門，你覺得這一週可以再往前走一段了。',
    }),
    effects: { social: +2, happiness: +2 },
  },
  {
    id: 'regional_culture_coming_of_age',
    title: '長大的儀式',
    ages: [9, 15],
    weight: 1.6,
    tags: ['regional', 'culture', 'religion', 'family', 'coming_of_age'],
    cond: (s, h) => !h.isReligion('none', 'folk', 'other') && !(h.isReligion('jewish') && h.age() < 12) && !(h.isReligion('sikh') && h.female()),
    text: (s, h) => h.byReligion({
      christian: '今天你要領受堅信禮。你穿著新衣站在前排，手心冒汗。儀式很短，結束後全家人圍著你拍照，長輩塞給你一個小禮物，說：「長大了。」',
      muslim: '今天你讀完了《古蘭經》的最後一頁。教你誦讀的人和家人坐在你身邊，鄰居端來甜點，大人們輪流對你說「真了不起」。你嘴上說沒什麼，臉卻紅得藏不住。',
      hindu: '家裡為你辦了一場小小的儀式。長輩在你額頭點上吉祥點，把花瓣放在你手心，祝你平安長大。你緊張得背不出剛學的祈禱詞，大家笑著替你補上。',
      buddhist: (h.male() && ['THA', 'MMR', 'LAO', 'KHM'].includes(s.homeCountryCode))
        ? '你剃了頭、披上僧衣，在寺裡住了一段日子。早起托缽、打掃、誦經，你第一次知道什麼叫無聊，也第一次知道什麼叫安靜。回家時，長輩們看你的眼神變了。'
        : '家人帶你到寺裡皈依，師父為你繫上一條線，祝你平安長大。你學著大人合掌的樣子，心裡想的卻是回家有沒有甜點。',
      jewish: '十三歲生日前後，你站在會堂裡，第一次當眾朗讀經文。讀錯了一個字，全場微笑，沒有人在意；結束後大家唱歌、吃甜點，你被塞了一堆信封。',
      sikh: '家人為你辦了繫頭巾的小儀式。長輩一圈一圈替你纏好，你站在鏡子前，覺得自己突然成了另一個人。後來你學會了自己綁，每天早上要花十分鐘。',
      _: '家裡為你辦了一場小小的儀式，長輩輪流對你說了祝福的話。你站在人群中間，覺得自己好像突然長高了一點。',
    }),
    effects: { happiness: +3, social: +2, knowledge: +1 },
  },
  {
    id: 'regional_culture_wedding_rite',
    title: '儀式',
    ages: [14, 70],
    weight: 0, // scheduled by the marriage itself (systems.js marry), in the same year
    tags: ['regional', 'culture', 'religion', 'marriage', 'family'],
    followCond: (s, h) => h.married() && h.yearsMarried() <= 1,
    text: (s, h) => h.byReligion({
      christian: '婚禮在教堂舉行，神職人員問了那兩句話，你們答得很小聲。戒指套上去的那一刻，後排有人哭了，你也跟著紅了眼眶。',
      muslim: `簽下婚書的那天，兩位見證人和${h.parentsGone() ? '家裡的長輩' : '雙方長輩'}都在場。誦讀祝福之後是宴席，一桌接一桌，你和${h.partnerName()}被親戚輪流拉去拍照。`,
      hindu: `儀式持續了好幾個小時。你和${h.partnerName()}繞著聖火走了一圈又一圈，長輩邊念祝福邊撒花瓣。累歸累，你偷看對方一眼，發現對方也正偷看你。`,
      buddhist: `${h.parentsGone() ? '家人與親戚' : '雙方家人'}先到寺裡（或祖先牌位前）上香，師父為你們念了祝福。之後的宴席很熱鬧，你被敬了一輪又一輪的${h.drinks() ? '酒' : '茶'}。`,
      folk: h.isRegion('SSA')
        ? '長輩在祖先面前為你們祝福，大家唱歌、擊鼓，彩色的布料與珠串堆滿了院子。有人把你們的名字編進歌裡，一遍又一遍地唱。'
        : `婚禮上，${h.weddingFolk()}在祖先牌位前上香，你們向${h.parentsGone() ? '家裡的' : '雙方'}長輩敬茶，長輩們塞給你們紅包，說著一串串吉祥話，你們跟著笑，也跟著鞠躬。`,
      jewish: `你和${h.partnerName()}站在華蓋下，對方把戒指戴到你手上，玻璃杯在腳下被踩碎，全場齊聲喊著「好運」。`,
      sikh: '你們繞著聖典走了四圈，每一圈都有一段誦讀。儀式結束後，所有賓客一起坐在地上吃飯，鼓聲與歌聲響了很久。',
      none: `沒有宗教儀式，你們在市政廳（或自家的院子裡）簽了字，朋友們鼓掌，有人哭得比你們還大聲。你和${h.partnerName()}互相看了一眼，同時笑了。`,
      _: '儀式依你們家傳下來的方式進行，不長，但每個步驟都有人輕聲向你們解釋。你把那些話一句一句記在心裡。',
    }),
    effects: { happiness: +3, social: +2 },
  },
  {
    id: 'regional_culture_funeral',
    title: '最後的儀式',
    ages: [12, 95],
    once: false,
    cooldown: 2,
    max: 2,
    weight: 0, // scheduled when a parent dies (systems.js agePeople), in the same year
    tags: ['regional', 'culture', 'religion', 'family', 'grief'],
    followCond: (s, h) => !!h.recentLog(['母親過世', '父親過世'], 1),
    text: (s, h) => {
      const he = h.recentLog('母親過世', 1) ? '她' : '他';
      return h.byReligion({
        christian: `守靈那晚，親友輪流上前說起${he}的故事，有人哭、有人笑出聲。第二天追思禮拜上，大家一起唱了${he}最喜歡的那首詩歌，你唱到一半，聲音就散了。`,
        muslim: `按照習俗，遺體很快被清洗、包上白布，當天就送去安葬。親友們沉默地走在隊伍裡，家裡備好了茶水。接下來幾天，鄰居輪流來探望，一句話也不多問，只是坐在你身邊。`,
        hindu: `家人依照習俗為${he}舉行了火葬，之後十幾天，每天都有儀式、祈禱與簡單的素食。你被一件接著一件要做的事推著走，直到最後一天，才第一次哭出聲。`,
        buddhist: `法師來家裡誦經，親友輪流上香。接下來的七週，每隔七天，你都在牌位前點一炷香，慢慢學會把思念放進這個規律裡。`,
        folk: h.isRegion('SSA')
          ? `村裡的人從各地趕來，守了好幾天。長輩對著祖先唱了好幾遍${he}的名字，說${he}是回到了他們那邊。你第一次覺得，離開並不一定是消失。`
          : `喪禮依老規矩一步一步辦：守靈、誦經、出殯。你披著孝服跟在隊伍後面，鑼鼓聲與哭聲交疊在一起，彷彿聽見很多年前${he}喊你名字的聲音。`,
        jewish: `喪禮之後，家人在家裡坐了七天，不出門，鄰居與朋友輪流帶來食物，陪著大家一起坐。你覺得這個習俗有它的道理：悲傷需要時間，也需要有人在。`,
        sikh: `喪禮之後的十天裡，家人在家中誦讀經文，鄰居與親友帶來飯菜。你第一次發現，被這麼多人圍著，眼淚也能流得比較自在。`,
        none: `沒有宗教儀式，家人在小小的追思會上輪流說起${he}的故事，放了${he}愛聽的歌。散場後大家留下來收椅子，才發現彼此的眼睛都是紅的。`,
        _: `儀式依著家裡傳下來的方式進行，簡單而安靜。你站在人群邊緣，聽著大家低聲說話，覺得${he}一定會喜歡這樣。`,
      });
    },
    effects: { social: +3, happiness: +1 },
  },
  {
    id: 'regional_culture_diet',
    title: '桌上的規矩',
    ages: [15, 80],
    once: false,
    cooldown: 8,
    weight: 0.9,
    tags: ['regional', 'culture', 'religion', 'food', 'friends'],
    cond: (s, h) => h.isReligion('muslim', 'hindu', 'jewish', 'buddhist', 'sikh') && (h.isMigrant() || h.religionIsMinority()) && h.stable('keeps_diet', 0.7),
    text: (s, h) => h.byReligion({
      muslim: '朋友訂了一間餐廳，菜單上你不確定哪些可以吃。大家看著你，等你開口，服務生的筆懸在半空。',
      hindu: '朋友聚餐點了一桌肉，你吃素。直到盤子裡只剩下配菜，大家才注意到你什麼都沒說。',
      jewish: '朋友邀你去一間新開的餐廳，你知道那裡的菜多半不符合你家的飲食規矩。你還沒開口，對方已經熱情地替你選了一道招牌菜。',
      buddhist: '今天是吃素的日子，旁邊的人夾了一塊肉過來，笑著說：「就一口嘛。」整桌的人都看過來。',
      sikh: '朋友聚餐訂了烤肉店，桌上的菜你一半不能碰。你笑著說自己吃得少，肚子卻咕嚕叫了一聲，大家都聽見了。',
      _: '朋友訂了一間餐廳，菜單上你不確定哪些是你平常會吃的。大家看著你，等你開口。',
    }),
    choices: [
      {
        label: '直接說明，點自己能吃的',
        effects: { happiness: +2, social: +1 },
        result: '你說明了原因，語氣平常得像在說自己愛吃什麼。出乎意料，沒有人追問，反而有人說下次選能一起吃的餐廳。你發現，把話說開，比想像中容易。',
        ai: 2,
      },
      {
        label: '事先打聽好餐廳，或自己帶',
        effects: { happiness: +1, wealth: 0 },
        result: '你查好了菜單，約在你熟悉的店，或者在包裡放了自己準備的食物。聚會很順利，只是你偶爾會羨慕那些走進任何餐廳都不必先想一輪的人。',
        ai: 1.6,
      },
      {
        label: '這一次不計較，隨大家',
        effects: { happiness: -2, social: +1 },
        result: '你吃了一點可以吃的，把剩下的推給旁人。氣氛很好，你卻在回家的路上覺得有些空，下次想再勇敢一點。',
        ai: 0.6,
      },
    ],
  },
  {
    id: 'regional_culture_rest_day',
    title: '禮拜與課表',
    ages: [10, 65],
    once: false,
    cooldown: 10,
    weight: 0.8,
    tags: ['regional', 'culture', 'religion', 'work', 'school'],
    cond: (s, h) => (h.inSchool() || h.employed()) && (h.isReligion('muslim', 'jewish', 'christian')) && h.religionIsMinority() && !(h.isReligion('jewish') && s.countryCode === 'ISR'),
    text: (s, h) => `${h.byReligion({ muslim: '週五中午是聚禮的時間，', jewish: '安息日從週五日落開始，', christian: '週日是禮拜的日子，', _: '你的信仰有一天是特別留給它的，' })}可是${h.inSchool() ? '課表' : '你的行程'}排得滿滿的，沒有人替這件事留位子。`,
    choices: [
      {
        label: '去談一談，請對方調整時間',
        effects: { social: +1, happiness: +2 },
        result: '你說明這段時間對你的意義，對方愣了一下，點點頭，說可以試試看。幾週後你發現，同樣需要的人不只你一個，大家排出了一張新的輪值表。',
        ai: 2,
      },
      {
        label: '想辦法利用午休或換個時間',
        effects: { happiness: +1, health: -1 },
        result: '你找了最近的地方，趕在時間內回來。忙是忙了一點，但你沒有錯過它，這就夠了。',
        ai: 1.6,
      },
      {
        label: '這一陣子先放一放',
        effects: { happiness: -2, wealth: +1 },
        result: '你告訴自己現在不是時候。週五（或週日）的鐘點過去時，你還是看了一下錶，心裡有一塊地方輕輕地空了一下。',
        ai: 0.5,
      },
    ],
  },
  {
    id: 'regional_culture_pilgrimage',
    title: '一輩子想走的一趟路',
    ages: [35, 80],
    weight: 0.8,
    tags: ['regional', 'culture', 'religion', 'travel'],
    cond: (s, h) => !h.isReligion('none', 'folk', 'other') && h.stat('wealth') >= 30 && h.stable('pilgrimage_wish', 0.35),
    text: (s, h) => h.byReligion({
      muslim: '你把存了很多年的錢攤在桌上算了又算，離朝覲只差一小段。家人在旁邊靜靜看著，誰也沒有先開口。',
      hindu: '家裡的長輩一直說，一輩子要去一趟聖地。你終於攢夠了盤纏，行程表上的日期已經圈了起來。',
      christian: '你一直想去那條朝聖路上走一趟。今年手邊終於有了一點餘裕，地圖在桌上攤了好幾天，被你畫滿了記號。',
      buddhist: '你一直想去那座聖地的寺院看看。今年有了機會，朋友說可以同行，你把機票價格查了又查。',
      sikh: '你想去阿姆利則的金廟看看，這件事擱了很多年。今年有人約你同行，你把行李箱從櫃子上拿了下來。',
      jewish: '你想去耶路撒冷走一趟，站在那面牆前，這個念頭擱了很多年。今年手邊終於有了一點餘裕。',
      _: '你一直想去一個對你有特別意義的地方走一趟。今年手邊終於有了一點餘裕，地圖在桌上攤了好幾天。',
    }),
    choices: [
      {
        label: '出發，花上這筆錢',
        cond: (s, h) => h.stat('wealth') >= 35,
        effects: { wealth: -4, happiness: +6, health: -1, social: +2 },
        result: '路上你遇見許多從不同地方來的人，口音各不相同，卻在同一個地方安靜下來。回家後的很多個夜晚，你還會想起那一片安靜，想起有人遞給你一杯水。',
        highlight: '走了一趟一輩子想去的路。',
        ai: 1.8,
      },
      {
        label: '再等一等，先照顧家人和健康',
        effects: { happiness: -1, social: +1 },
        result: '你把那張紙收進抽屜。有時候夜裡想起，心裡有一點酸，但眼前需要你的事確實更多。你告訴自己：還有明年。',
        ai: 1.2,
      },
      {
        label: '把這筆錢捐給社區的需要',
        effects: { wealth: -3, social: +4, happiness: +2 },
        result: '你把存了很久的錢交給社區裡正需要的人。收到錢的人眼眶紅了，你反而不好意思，只說了一句：「用得上就好。」那一晚你睡得很沉。',
        ai: 1,
      },
    ],
  },
  {
    id: 'regional_culture_ancestors',
    title: '祖先的日子',
    ages: [10, 95],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['regional', 'culture', 'family', 'parents'],
    cond: (s, h) => h.lunarNewYear() || (h.isReligion('folk') && h.isRegion('SSA')) || (['MEX', 'GTM'].includes(s.homeCountryCode) && h.isReligion('christian', 'folk')),
    text: (s, h) => (h.lunarNewYear()
      ? '清明前後，你跟著家人上山掃墓。拔草、擺供品、燒香，一邊整理墓碑一邊聽長輩講祖父母的事。你覺得活著的人和離開的人之間，還有一條細細的線沒有斷。'
      : h.isRegion('LAC')
        ? '十一月初，家裡的祭壇擺滿了金盞花、蠟燭與逝者愛吃的東西。你坐在墓園裡和家人一起守夜，有人彈吉他，有人笑著說起逝者生前的糗事，夜深了，每個人臉上都有光。'
        : '在老屋前，長輩請祖先喝一口水，說出家族這一年的事。你站在旁邊，發現自己也在心裡默默報告近況，連剛換工作的事也一併說了。'),
    effects: { social: +2, happiness: +2 },
  },
  {
    id: 'regional_culture_giving',
    title: '分出去的一份',
    ages: [22, 90],
    once: false,
    cooldown: 8,
    weight: 0.7,
    tags: ['regional', 'culture', 'religion', 'community', 'money'],
    cond: (s, h) => h.isReligion('muslim', 'christian', 'sikh', 'buddhist', 'hindu', 'jewish') && h.stat('wealth') >= 30,
    text: (s, h) => h.byReligion({
      muslim: '又到了算天課的時候。你把一年的存款與財物攤開算了一遍，數字不大，卻不容易分出去。',
      christian: '教會的奉獻袋傳到你面前，你想起這個月才剛繳過房租與帳單，手在口袋裡停了一下。',
      sikh: '寺廟裡的公共廚房缺人手，也缺食材。你看著鍋裡一天要餵飽幾百人的飯菜，想著自己能出多少力。',
      buddhist: '寺裡在為一批需要幫助的家庭籌備物資，師父沒有開口要，只是把名冊放在桌上。你看了很久。',
      hindu: '附近的廟要為節日準備給窮人家的食物，有人拿著單子挨家挨戶登記。輪到你家時，你想了想要寫多少。',
      jewish: '社區的捐款箱放在門口，今年有幾戶人家的情況特別辛苦。你站在箱子前，把手伸進了口袋。',
      _: '社區裡有幾戶人家今年特別辛苦，有人在門口放了一個捐款箱。你站在箱子前，把手伸進了口袋。',
    }),
    choices: [
      {
        label: '照規矩算出該給的，交給需要的人',
        effects: { wealth: -2, social: +3, happiness: +2 },
        result: '你把應該分出去的那一份算清楚，交給了信得過的人。收下的人沒有多說什麼，只是用雙手握了握你的手。你回家的路上，口袋輕了，肩膀也輕了。',
        ai: 2,
      },
      {
        label: '直接送給身邊認識的人',
        effects: { wealth: -2, social: +4, happiness: +1 },
        result: '你把東西包好，一戶一戶地送。有人客氣地推辭，有人紅了眼眶。你發現，這樣做讓你比平常更清楚鄰居家的處境，也更清楚自己的位置。',
        ai: 1.6,
      },
      {
        label: '今年手頭緊，用時間代替',
        effects: { social: +3, health: -1, happiness: +1 },
        result: '你沒有多少可以給，就給出整整幾個週末：搬東西、煮飯、洗碗。收工時你累得說不出話，卻覺得這一份，一點也不比錢少。',
        ai: 1.2,
      },
    ],
  },
];
