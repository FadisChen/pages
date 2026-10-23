// Seed events: ~40 reference events across every life stage. Content agents should copy the
// PATTERNS here (ids prefixed `seed_`; these are kept in the final game too).
//
// Pattern index
//   plain event with object effects ........ seed_first_words
//   weight as a function, repeatable ....... seed_childhood_fever (once:false + cooldown)
//   text branching by income group ......... h.byIncome({ L, LM, UM, H }) in most events
//   `chance` milestone / calendar event .... seed_promotion, seed_pandemic_2020, seed_smartphone
//   major event with choices ............... seed_exam_pressure and most `major: true` events
//   choice `cond`, `ai` weights (fn/number) . seed_peer_pressure, seed_health_scare
//   function effects + randomness .......... seed_start_business, seed_disaster
//   schedule follow-ups .................... seed_exam_pressure -> seed_exam_result
//   set / unset flags, highlight ........... seed_first_love, seed_job_offer
//   helper-driven state change ............. seed_leave_home (migrate), seed_job_hunt (startJob)
//   h.die() for direct death ............... seed_disaster
//
// Rules: second person, 60-160 characters of text, concrete detail, no lecturing, no stereotypes.
// All functions must be total: they are called on random states by tests/events.test.mjs, so use
// helpers like h.partnerName() (safe) rather than s.partner.name (may be null).

const CONSCRIPT = new Set(['KOR', 'TWN', 'ISR', 'SGP', 'RUS', 'TUR', 'EGY', 'IRN', 'GRC', 'FIN', 'CHE', 'AUT', 'NOR', 'SWE', 'THA', 'PRK', 'UKR', 'BLR', 'VNM']);

export default [
  // =====================================================================================
  // 童年 0-12
  // =====================================================================================
  {
    id: 'seed_first_words',
    title: '第一個詞',
    ages: [1, 2],
    tags: ['family'],
    text: (s, h) => `這一年你說出了第一個詞。${h.byIncome({
      L: '那時家裡正好有人在院子裡忙著，大家同時抬頭，然後都笑了。',
      LM: '全家人圍著你，爭論那到底是在叫誰。',
      UM: '媽媽急著拿手機想錄下來，你卻又不肯再說第二次。',
      H: '爸爸媽媽輪流把你說的話寫進成長日記，字跡都有點興奮。',
    })}`,
    effects: { happiness: +2, social: +1, knowledge: +2 },
  },
  {
    id: 'seed_childhood_fever',
    title: '一場高燒',
    ages: [2, 9],
    once: false,
    cooldown: 4,
    // Poorer, rural children get sick more often; weight is a function of the state.
    weight: (s, h) => 0.6 + (h.wealthQ() <= 2 ? 0.8 : 0) + (h.urban() ? 0 : 0.3),
    tags: ['health', 'childhood'],
    text: (s, h) => `你燒了好幾天，渾身發燙。${h.byIncome({
      L: '家人輪流用濕布替你擦身體，走了半天的路才找到診所，藥錢是向鄰居借的。',
      LM: '媽媽背著你去了衛生所，護理師說再晚一點就麻煩了。',
      UM: '爸媽輪流請假帶你看醫生，打了針後燒總算退了。',
      H: '家庭醫師很快替你做了檢查，開了藥，也叮嚀要多喝水、好好休息。',
    })}`,
    effects: (s, h) => {
      h.change('health', h.byIncome({ L: -6, LM: -4, UM: -2, H: -1 }));
      h.change('happiness', -2);
      if (h.isPoor()) h.change('wealth', -2);
      if (h.income() === 'L' && h.chance(0.1)) h.addRisk(1.15, 3);
    },
  },
  {
    id: 'seed_best_friend',
    title: '最要好的朋友',
    ages: [6, 11],
    tags: ['school', 'friends'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '同桌的孩子分了你半塊餅乾。從那天起，你們一起寫功課、一起逃過掃地，也一起被罵。對你來說，這就是友誼最早的樣子。',
    effects: { happiness: +4, social: +6 },
    set: ['had_best_friend'],
  },
  {
    id: 'seed_water_walk',
    title: '提水的路',
    ages: [6, 12],
    once: false,
    cooldown: 5,
    tags: ['regional', 'childhood'],
    cond: (s, h) => !h.urban() && (h.income() === 'L' || h.income() === 'LM') && h.isRegion('SSA', 'SAS', 'MENA', 'SEA'),
    text: (s, h) => '每天天一亮，你就提著水桶走向最近的水源。水很重，路很長，但沿路有同伴說笑。你學會了怎麼把一滴水都當作珍貴的東西。',
    effects: { health: -1, knowledge: -1, social: +2, happiness: +1 },
  },
  {
    id: 'seed_chores_or_play',
    title: '放學後的選擇',
    ages: [8, 12],
    tags: ['childhood', 'family'],
    major: true,
    cond: (s, h) => h.wealthQ() <= 4,
    text: (s, h) => h.byIncome({
      L: '放學後，家人需要你去田裡或市集幫忙，但巷口的孩子們在踢一顆破舊的球，喊著你的名字。',
      LM: '店裡正忙，爸媽沒說要你留下，但你知道他們需要人手。外面的朋友在叫你去玩。',
      UM: '作業還沒寫完，補習班快要遲到了，窗外朋友在喊你去球場。你看看時鐘，又看看書包。',
      H: '你的行事曆排滿了才藝課與作業，而朋友邀你去公園。你只剩下一個下午。',
    }),
    choices: [
      {
        label: '先幫忙家裡',
        effects: { wealth: +1, happiness: -1, social: -1, knowledge: +1 },
        result: (s, h) => '你捲起袖子做完了事。晚飯桌上，家人把最大的一塊肉夾進你碗裡，誰也沒多說什麼。',
        set: ['helped_family'],
        ai: (s, h) => (h.isPoor() ? 3 : 1),
      },
      {
        label: '去玩，管他的',
        effects: { happiness: +5, social: +4, knowledge: -1 },
        result: (s, h) => '你跑出去玩到天黑。回家挨了罵，但那個下午是你整個童年最閃亮的片段之一。',
        ai: 1.5,
      },
      {
        label: '待在家把書讀完',
        cond: (s, h) => h.inSchool(),
        effects: { knowledge: +4, happiness: -1 },
        result: (s, h) => '你把作業和複習都做完。老師隔天在全班面前點了你的名字。',
        ai: (s, h) => (h.incomeAtLeast('UM') ? 1.5 : 0.7),
      },
    ],
  },
  {
    id: 'seed_bully',
    title: '被欺負的那一年',
    ages: [8, 14],
    tags: ['school', 'social'],
    major: true,
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '班上有個人老愛搶你的東西、在背後學你說話。每天進教室前，你的胃都會揪成一團。',
    choices: [
      {
        label: '告訴老師與家人',
        effects: { happiness: +2, social: +2 },
        result: (s, h) => h.byIncome({
          L: '老師把兩人叫過去，說了幾句，事情被壓了下來，雖然不算解決，但至少不再那麼頻繁。',
          LM: '老師把兩人叫過去，說了幾句，事情被壓了下來，雖然不算解決，但至少不再那麼頻繁。',
          UM: '學校找了雙方家長談話，對方道了歉。你不太確定那算不算誠意，但日子好過多了。',
          H: '學校的輔導老師介入，安排了調解。你終於說出口，也終於有人認真聽。',
        }),
        ai: 2,
      },
      {
        label: '忍耐，希望它自己消失',
        effects: { happiness: -5, social: -3, health: -1 },
        result: (s, h) => '你假裝沒事，一個月、兩個月……它確實慢慢淡了，但你有一段時間不太敢在人前說話。',
        set: ['bullied_silent'],
        ai: 1,
      },
      {
        label: '反擊',
        effects: { happiness: +1, social: -2, health: -2 },
        result: (s, h) => '你在放學路上和對方打了起來，雙方都掛了彩，也都被叫了家長。之後再也沒有人敢搶你的東西，但你也學到了拳頭不是什麼好答案。',
        ai: 0.8,
      },
    ],
  },

  // =====================================================================================
  // 青少年與青年 13-24
  // =====================================================================================
  {
    id: 'seed_exam_pressure',
    title: '大考前夕',
    ages: [16, 18],
    tags: ['education', 'school'],
    major: true,
    cond: (s, h) => h.inSchool() && h.eduYears() >= 8 && h.incomeAtLeast('LM'),
    text: (s, h) => h.byIncome({
      LM: '全班的目標都指向同一場考試：它決定誰能走出這個小鎮。你的書桌堆滿了借來的參考書，距離考試只剩幾個月。',
      UM: '大考迫在眉睫，補習班與模擬考排滿了週末。老師說這幾個月會決定你未來好幾年的樣子。',
      H: '升學的壓力一天天逼近。同學們有的整夜刷題，有的已經在談要去哪個城市念書。',
    }),
    choices: [
      {
        label: '熬夜衝刺',
        effects: { knowledge: +6, health: -4, happiness: -3 },
        set: ['crammed'],
        result: '你連續幾個月睡不到六小時，咖啡與模擬考成了日常。身體在冬天發出抗議，你病了兩次。',
        schedule: [{ id: 'seed_exam_result', inYears: [0, 1] }],
        ai: (s, h) => (h.stat('health') > 60 ? 1.5 : 0.5),
      },
      {
        label: '穩定準備，按時睡覺',
        effects: { knowledge: +4, health: +1 },
        result: '你照著自己的節奏念書，偶爾還和朋友出去透氣。你不是最亮眼的那一個，卻是最不焦慮的那一個。',
        schedule: [{ id: 'seed_exam_result', inYears: [0, 1] }],
        ai: 2,
      },
      {
        label: '不想再賭，另做打算',
        effects: { happiness: +3, knowledge: +1, wealth: -1 },
        set: ['skipped_exam'],
        unset: ['crammed'],
        result: '你決定不把全部押在一場考試上。家人起初不諒解，但你開始認真地想：自己真正想做什麼。',
        schedule: [{ id: 'seed_exam_result', inYears: [0, 1] }],
        ai: 0.7,
      },
    ],
  },
  {
    id: 'seed_exam_result',
    title: '放榜的日子',
    ages: [16, 21],
    weight: 0, // follow-up only: reached through schedule, never drawn at random
    tags: ['education', 'followup'],
    text: (s, h) => h.has('skipped_exam')
      ? '放榜那天，你沒有去看成績。後來朋友打電話來，你才知道他們各自去了不同的地方。你聽著，心裡有些複雜。'
      : h.has('crammed')
        ? '成績單送到手上時，你的手還在微微發抖。多少個熬夜的晚上，都濃縮在這幾個數字裡。'
        : '你拿到了成績單。不算頂尖，但也在預期之內。家裡人鬆了一口氣。',
    effects: (s, h) => {
      const good = h.has('crammed') ? 0.65 : h.has('skipped_exam') ? 0.1 : 0.45;
      if (h.chance(good)) { h.change('happiness', +6); h.change('knowledge', +2); h.set('exam_passed'); h.highlight('通過了人生中的一場大考。'); }
      else { h.change('happiness', -4); h.unset('exam_passed'); }
      h.unset('crammed');
    },
  },
  {
    id: 'seed_peer_pressure',
    title: '遞過來的菸',
    ages: [14, 19],
    tags: ['youth', 'health'],
    major: true,
    cond: (s, h) => !h.isSmoker(),
    text: (s, h) => '放學後，朋友們躲在後巷。有人遞過來一根菸，笑著說：「試一下嘛，大家都有。」所有人的眼睛都在看你。',
    choices: [
      {
        label: '接過來試試',
        effects: { social: +4, health: -1 },
        result: (s, h) => { h.startSmoking(); return '你嗆得直咳嗽，但沒有人笑你。一個月後，你已經習慣了那個味道。'; },
        ai: (s, h) => (h.male() ? 1.2 : 0.4),
      },
      {
        label: '搖頭婉拒',
        effects: { social: -1, happiness: +1 },
        result: '你說自己不想。有人翻了個白眼，但很快就換了話題，其實沒有你想像中那麼在意。',
        ai: 3,
      },
      {
        label: '假裝接過來，但沒點火',
        cond: (s, h) => h.stat('social') < 70,
        effects: { social: +2 },
        result: '你把菸夾在手上假裝很熟練，一直到它被捏爛。沒人發現，你長長鬆了一口氣。',
        ai: 1,
      },
    ],
  },
  {
    id: 'seed_first_love',
    title: '心動的人',
    ages: [14, 20],
    tags: ['love', 'youth'],
    major: true,
    cond: (s, h) => !h.hasPartner() && h.stat('happiness') > 25 && !h.married(),
    text: (s, h) => h.byIncome({
      L: '市集上、水井旁、放牛的路上，你總會遇見同一個人。每次擦身而過，你的心跳都亂了拍。',
      LM: '你總在放學的路上遇見同一個人。每次擦身而過，你的心跳都亂了拍，連回家的路也變短了。',
      UM: '同班的那個人，不知從什麼時候起，成為你上課時最常偷看的方向。',
      H: '社團活動結束後，那個人和你一起收拾場地。月光把兩人的影子拉得很長，誰也沒有先開口。',
    }),
    choices: [
      {
        label: '鼓起勇氣表白',
        effects: (s, h) => {
          if (h.chance(0.5)) { h.change('happiness', +9); h.change('social', +4); h.set('first_love_yes'); }
          else { h.change('happiness', -5); h.change('social', -1); h.set('first_love_no'); }
        },
        result: (s, h) => h.has('first_love_yes')
          ? '對方紅著臉點了頭。接下來幾個月，你們擁有彼此最純粹的時光，那是後來怎麼也比不上的悸動。'
          : '對方客氣地拒絕了。你告訴自己沒關係，卻在那個晚上走了很遠很遠的路。',
        highlight: (s, h) => (h.has('first_love_yes') ? '第一次談戀愛。' : null),
        ai: 2,
      },
      {
        label: '把心意藏起來',
        effects: { happiness: -2, social: 0, knowledge: +1 },
        result: '你什麼也沒說。後來那個人轉學了，或是你們各自長大了。很多年後，你偶爾還是會想起那個黃昏。',
        ai: 1,
      },
    ],
  },
  {
    id: 'seed_leave_home',
    title: '離開家鄉的那天',
    ages: [17, 24],
    tags: ['youth', 'migration'],
    major: true,
    cond: (s, h) => !h.has('left_home') && h.eduYears() >= 6 && !h.married(),
    text: (s, h) => h.byIncome({
      L: '村裡的年輕人一個個去了城市。你在傍晚的村口，望著通往遠方的那條土路發呆。',
      LM: '同鄉的人說城裡有工作，也有學校。你站在車站前，行李袋的背帶勒得肩膀發疼。',
      UM: '你收到了外地大學與工作的機會。收拾行李的那晚，你一遍遍打開、又關上衣櫃。',
      H: '你收到了外縣市的錄取通知。獨立生活的念頭既令人興奮，又讓你不自覺地多看了家裡的玄關幾眼。',
    }),
    choices: [
      {
        label: '離開，去闖闖看',
        effects: (s, h) => { h.change('knowledge', +3); h.change('social', -4); h.change('happiness', +2); h.change('wealth', h.isPoor() ? +2 : -1); },
        set: ['left_home'],
        unset: ['stayed_home'],
        result: (s, h) => `你搭上了出發的車。車窗外的田野與房子一一退去，你把額頭抵在玻璃上，第一次覺得自己是個大人。`,
        highlight: true,
        ai: (s, h) => (h.isPoor() ? 2 : 1.3),
      },
      {
        label: '留在家鄉',
        effects: { social: +3, happiness: +1, knowledge: -1, wealth: -1 },
        set: ['stayed_home'],
        result: '你選擇留下。熟悉的人與街道給你一種踏實的安全感，只是偶爾你會在夜裡想：另一條路會是什麼樣。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'seed_scholarship_or_work',
    title: '念下去，還是去工作',
    ages: [17, 19],
    tags: ['education', 'money'],
    major: true,
    cond: (s, h) => h.inSchool() && h.eduYears() >= 11 && h.wealthQ() <= 3,
    text: (s, h) => h.byIncome({
      L: '你的成績不錯，老師說你可以繼續升學，但學費與生活費對家裡是一筆天文數字。同齡的人已經開始賺錢了。',
      LM: '老師為你寫了推薦信，你也拿到了錄取資格。可是家裡的存款只夠讓你念一年。',
      UM: '你考上了不錯的大學，但學費要靠貸款。家人坐在飯桌邊，沒有人敢先開口。',
      H: '你考上了理想的大學，但家裡正處於經濟吃緊的階段。學貸的利率單，被你反覆看了幾次。',
    }),
    choices: [
      {
        label: '背著貸款繼續念',
        effects: { knowledge: +5, wealth: -4, happiness: -1 },
        set: ['student_loan'],
        result: '你簽下了貸款文件。念書的日子很省，常常一碗麵吃兩頓，但你知道自己正在買一張未來的門票。',
        schedule: [{ id: 'seed_job_hunt', inYears: [4, 6] }],
        ai: 1.5,
      },
      {
        label: '先去工作存錢',
        effects: { wealth: +3, knowledge: -1, happiness: -1 },
        result: (s, h) => '你放下書本，找了一份工作。第一個月薪水交給家裡一半，剩下的存了起來。念書的事，被你暫時鎖進抽屜。',
        set: ['skipped_college'],
        ai: (s, h) => (h.isPoor() ? 2 : 0.8),
      },
      {
        label: '半工半讀',
        cond: (s, h) => h.urban() || h.incomeAtLeast('UM'),
        effects: { knowledge: +3, health: -3, wealth: +1, social: -2 },
        result: '白天上課，晚上打工，週末補眠。你累得像隻陀螺，但每一個月，存摺上的數字和你的成績都在慢慢往上。',
        ai: 1.4,
      },
    ],
  },
  {
    id: 'seed_part_time',
    title: '第一份打工',
    ages: [15, 22],
    once: false,
    cooldown: 3,
    tags: ['work', 'youth'],
    cond: (s, h) => h.inSchool() && h.incomeAtLeast('LM') && !h.employed(),
    text: (s, h) => h.byIncome({
      LM: '週末你在市場幫忙搬貨，老闆娘在你的口袋裡塞了兩顆橘子。那是你第一次用自己的力氣換到錢。',
      UM: '寒暑假你去便利商店當店員，學到的不只是結帳，還有怎麼對陌生人保持耐心。',
      H: '你在附近的咖啡店找到打工，第一次領薪水的當天就花掉一半，剩下的一半很快也花光了。',
    }),
    effects: { wealth: +2, social: +2, health: -1, knowledge: +1 },
  },
  {
    id: 'seed_military_service',
    title: '徵兵通知',
    ages: [18, 21],
    tags: ['youth', 'regional'],
    cond: (s, h) => h.male() && CONSCRIPT.has(s.countryCode),
    text: (s, h) => '一封公文送到家裡：你被徵召入伍。你的長官只比你大幾歲，寢室裡擠滿了來自各地的年輕人。你在那裡學會了摺棉被，也學會了在不熟的人面前睡著。',
    effects: { health: +3, social: +4, happiness: -2, wealth: -2 },
    highlight: '入伍服役。',
  },
  {
    id: 'seed_peer_party',
    title: '一場週末派對',
    ages: [16, 28],
    once: false,
    cooldown: 4,
    weight: 0.7,
    tags: ['social'],
    cond: (s, h) => h.incomeAtLeast('UM') || h.urban(),
    text: (s, h) => '朋友的朋友辦了一場派對，音樂太大聲，你在陽台跟一個陌生人聊了一整晚。第二天頭很痛，但手機裡多了一個之後會聯絡很多年的名字。',
    effects: { social: +4, happiness: +2, health: -1 },
  },

  // =====================================================================================
  // 工作與金錢 22-60
  // =====================================================================================
  {
    id: 'seed_job_offer',
    title: '另一份工作的邀請',
    ages: [24, 45],
    tags: ['work'],
    major: true,
    cond: (s, h) => h.employed() && h.eduAtLeast('secondary') && !h.has('recent_job_offer'),
    text: (s, h) => `有人私下找你：「${h.jobName() || '現在的職位'}做這麼多年，要不要來我們這裡？」薪水高一些，但要搬去另一個地方，一切都得重來。`,
    choices: [
      {
        label: '接受新工作',
        effects: (s, h) => { h.change('wealth', +4); h.change('social', -3); h.change('happiness', h.chance(0.55) ? +4 : -3); },
        set: ['changed_career'],
        result: '你遞出了辭呈。新環境一開始讓你喘不過氣，半年後，你才慢慢在新的辦公桌前找到自己的位置。',
        highlight: true,
        ai: (s, h) => (h.stat('happiness') < 50 ? 2 : 1),
      },
      {
        label: '留在原地',
        effects: { happiness: +1, social: +2 },
        set: ['recent_job_offer'],
        result: '你婉拒了邀請。偶爾想起這條沒走的路，你會笑自己是不是太保守，但也安心地繼續過熟悉的日子。',
        ai: 1.5,
      },
      {
        label: '拿這份邀約去談加薪',
        cond: (s, h) => h.stat('knowledge') >= 35,
        effects: (s, h) => { if (h.chance(0.55)) { h.change('wealth', +3); h.change('happiness', +2); } else { h.change('happiness', -3); h.change('social', -2); } },
        result: (s, h) => '你鼓起勇氣和主管談了條件。結果牽動了好幾個人的情緒，你只好在接下來的幾個月裡小心行事。',
        ai: 1,
      },
    ],
  },
  {
    id: 'seed_job_hunt',
    title: '找工作的日子',
    ages: [20, 60],
    once: false,
    cooldown: 2,
    tags: ['work', 'followup'],
    cond: (s, h) => h.unemployed(),
    text: (s, h) => '投出的履歷像石沉大海，面試時被問得最多的是「你的經驗」。第三個月，總算有一通電話打來，要你下週一去上班。',
    effects: (s, h) => {
      const ids = h.eduAtLeast('tertiary') ? ['clerk', 'teacher', 'engineer', 'accountant', 'manager', 'sales'] : h.eduAtLeast('secondary') ? ['clerk', 'sales', 'technician', 'factory', 'driver', 'cook'] : ['laborer', 'street_vendor', 'farmer', 'domestic', 'construction'];
      const pool = h.female() ? ids.filter((x) => x !== 'construction' && x !== 'driver') : ids;
      if (h.unemployed() || h.workStatus() === 'none') h.startJob(h.pick(pool));
      h.change('happiness', +4);
      h.change('wealth', +2);
    },
  },
  {
    id: 'seed_promotion',
    title: '升遷',
    ages: [26, 55],
    chance: 0.04,
    once: false,
    cooldown: 6,
    tags: ['work', 'milestone'],
    milestone: true,
    cond: (s, h) => h.employed() && h.eduAtLeast('secondary') && h.stat('knowledge') > 30,
    text: (s, h) => `主管把你叫進辦公室，說你這幾年的表現大家有目共睹，要把更多責任交給你。你嘴上說謝謝，心裡想的是回家要怎麼說。`,
    effects: { wealth: +5, happiness: +4, social: +2 },
    highlight: '得到一次升遷。',
  },
  {
    id: 'seed_start_business',
    title: '自己當老闆的念頭',
    ages: [26, 52],
    tags: ['work', 'money'],
    major: true,
    cond: (s, h) => !h.inSchool() && !h.retired() && h.stat('wealth') >= 30 && !h.has('tried_business'),
    text: (s, h) => h.byIncome({
      L: '你一直看著鎮上那家小店的生意。你手上有一點存款，也有一個點子：在路口擺個攤子。',
      LM: '你存了一筆錢，也想好了要賣什麼。朋友說門面租金只會越來越貴，現在不做以後更難。',
      UM: '你盤算著把這幾年存下的錢拿來開一家自己的店。每次下班想到這件事，都讓你睡不著。',
      H: '你的筆電裡躺著一份創業計畫。你已經看了無數遍，知道風險，也知道自己會後悔沒試。',
    }),
    choices: [
      {
        label: '賭上積蓄開張',
        effects: (s, h) => {
          h.set('tried_business');
          const win = h.chance(0.4);
          if (win) { h.change('wealth', +10); h.change('happiness', +6); h.set('business_ok'); h.highlight('創業，並且做出了成績。'); }
          else { h.change('wealth', -9); h.change('happiness', -6); h.set('business_failed'); h.highlight('創業失敗，從零重新來過。'); }
        },
        result: (s, h) => h.has('business_ok')
          ? '頭兩年你幾乎住在店裡，但熬過去之後，生意慢慢穩了。你第一次覺得，每一分錢都是自己掙來的。'
          : '撐了一年多，帳目始終沒有轉盈。你關上店門的那天，在空蕩蕩的屋子裡坐了很久。',
        ai: (s, h) => (h.stat('wealth') > 50 ? 1.4 : 0.6),
      },
      {
        label: '先利用下班時間試水溫',
        effects: (s, h) => { h.set('tried_business'); h.change('health', -3); h.change('wealth', h.chance(0.5) ? +3 : -1); },
        result: '你把生意當成副業。累是真的累，但風險小得多，你一點一點確認這條路走不走得通。',
        ai: 2,
      },
      {
        label: '算了，穩定就好',
        effects: { happiness: +1 },
        set: ['tried_business'],
        result: '你把計畫書收進抽屜。偶爾經過路口那間店面，你會停下來看一眼，然後繼續走。',
        ai: 1,
      },
    ],
  },
  {
    id: 'seed_debt',
    title: '一筆還不起的債',
    ages: [24, 58],
    tags: ['money'],
    major: true,
    cond: (s, h) => h.isPoor() && !h.retired(),
    text: (s, h) => h.byIncome({
      L: '家裡有人生病、收成不好，你向鄰居與放貸的人借了錢。利息一個月一個月滾下去，數字比你的工資跑得快。',
      LM: '一場意外讓家裡欠下了一筆錢。債主開始上門，鄰居的眼神也變得小心翼翼。',
      UM: '信用卡帳單與貸款堆在一起，你每個月只能還最低金額。夜裡你常盯著天花板計算。',
      H: '房貸、卡費與一次失敗的投資，讓帳戶只剩下個位數。你把帳單攤在桌上，第一次承認自己撐不下去了。',
    }),
    choices: [
      {
        label: '向親友開口求援',
        effects: { wealth: +3, social: -3, happiness: -2 },
        result: '你把自尊壓進口袋，一家一家地登門借錢。大部分人嘆了口氣，還是幫了你。你記下了每一筆，也記下了每一個人的名字。',
        ai: 2,
      },
      {
        label: '拚命多接工作',
        effects: { wealth: +4, health: -5, happiness: -3, social: -2 },
        result: '你同時做兩三份工，睡眠少得可憐。三年後，數字總算歸零，你的身體卻也留下了痕跡。',
        ai: 1.5,
      },
      {
        label: '找人協商或債務重整',
        cond: (s, h) => h.incomeAtLeast('UM'),
        effects: { wealth: +2, happiness: +1, social: -1 },
        result: '你勇敢地走進了協商的窗口。過程很折磨，但對方確實替你把還款拆成了長長一串、不會壓垮人的小數字。',
        ai: 2,
      },
    ],
  },

  // =====================================================================================
  // 感情、婚姻與家人 22-65
  // =====================================================================================
  {
    id: 'seed_wedding_planning',
    title: '婚禮要怎麼辦',
    ages: [18, 50],
    tags: ['family', 'marriage'],
    major: true,
    cond: (s, h) => h.married() && h.yearsMarried() <= 1 && !h.has('wedding_done') && s.age >= 18,
    text: (s, h) => `你和${h.partnerName()}已經登記，但兩家人對婚禮的期待截然不同。親戚的電話一通接著一通，帳本上的數字讓你們都沉默了。`,
    choices: [
      {
        label: '盛大的婚宴',
        effects: { wealth: -8, social: +6, happiness: +4 },
        set: ['wedding_done'],
        result: '來了兩百位賓客，喜餅堆成小山。你累得半死，卻也看見許多多年不見的人，為你舉杯。',
        ai: (s, h) => (h.isRich() ? 2 : 0.6),
      },
      {
        label: '簡單的家宴',
        effects: { wealth: -2, social: +2, happiness: +4 },
        set: ['wedding_done'],
        result: '只請了最親近的人，在家裡擺了幾桌菜。那天的笑聲比任何排場都真實。',
        ai: 2,
      },
      {
        label: '只登記，把錢留給未來',
        effects: { wealth: +1, social: -2, happiness: +1 },
        set: ['wedding_done'],
        result: '你們戴上戒指，吃了一頓兩個人的晚餐。有些親戚後來還念了好幾年，但你們從來沒有後悔。',
        ai: 1,
      },
    ],
  },
  {
    id: 'seed_first_steps',
    title: '孩子走出第一步',
    ages: [20, 50],
    tags: ['family'],
    cond: (s, h) => h.hasChildren() && h.youngestChildAge() === 1 && !h.has('saw_first_steps'),
    text: (s, h) => `${h.lastChildName()}扶著沙發邊緣，搖搖晃晃地朝你走來，然後撲進你的懷裡。那一刻，你所有的疲憊都消失了。`,
    effects: { happiness: +5, social: +1 },
    set: ['saw_first_steps'],
  },
  {
    id: 'seed_marriage_strain',
    title: '漸行漸遠',
    ages: [24, 65],
    tags: ['family', 'marriage'],
    major: true,
    once: false,
    cooldown: 12,
    cond: (s, h) => h.married() && h.yearsMarried() >= 3 && h.stat('happiness') < 50,
    text: (s, h) => `你和${h.partnerName()}已經好一陣子沒有好好說話了。飯桌上只剩下碗筷的碰撞聲，兩個人都在等對方先開口。`,
    choices: [
      {
        label: '約對方好好談一談',
        effects: (s, h) => { if (h.chance(0.65)) { h.change('happiness', +6); h.change('social', +3); h.set('repaired_marriage'); } else { h.change('happiness', -2); } },
        result: (s, h) => h.has('repaired_marriage') ? '那晚你們談到很晚，講了好多從沒說出口的話。結束時，兩人都紅了眼眶，卻笑了。' : '你們談了，但似乎各說各話。至少你知道，自己嘗試過。',
        unset: ['repaired_marriage'],
        ai: 3,
      },
      {
        label: '尋求諮商或長輩協助',
        cond: (s, h) => h.incomeAtLeast('LM'),
        effects: { happiness: +3, wealth: -2, social: +1 },
        result: '在第三方的陪同下，你們學著用不同的方式說同一件事。進展很慢，但方向是對的。',
        ai: 1.5,
      },
      {
        label: '各過各的，不去想',
        effects: { happiness: -4, social: -3 },
        result: '你們維持著表面的平靜。家裡還是同一個屋簷下，卻像兩個互相禮貌的室友。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'seed_child_school_choice',
    title: '為孩子選一條路',
    ages: [28, 50],
    tags: ['family', 'education'],
    major: true,
    cond: (s, h) => h.hasChildren() && h.youngestChildAge() >= 5 && h.youngestChildAge() <= 12 && !h.has('child_school_decided'),
    text: (s, h) => `${h.childName(0)}快要升上更高的年級了。鄰居們都在討論哪間學校好、哪家補習班有名。你看著孩子在飯桌前寫作業，不知道該為他多爭取一點，還是多放手一些。`,
    choices: [
      {
        label: '花錢送孩子上補習與才藝',
        effects: { wealth: -5, happiness: -1, social: +1 },
        set: ['child_school_decided', 'child_tutoring'],
        result: '每個週末你都在接送。孩子成績進步了，笑容卻少了一點。你偶爾懷疑：這是他要的，還是你要的？',
        ai: (s, h) => (h.incomeAtLeast('UM') && h.isRich() ? 1.5 : 0.7),
      },
      {
        label: '讓孩子照自己的步調長大',
        effects: { happiness: +4, social: +2 },
        set: ['child_school_decided'],
        result: '你選擇陪孩子走路回家、聽他說學校的事。成績沒有特別亮眼，但他的話變得很多，眼睛也特別亮。',
        ai: 2,
      },
      {
        label: '為了好學區搬家',
        cond: (s, h) => h.urban() && h.stat('wealth') > 45,
        effects: { wealth: -6, social: -3, happiness: +1 },
        set: ['child_school_decided'],
        result: '你賣掉原本的房子，搬進一間更小的公寓。新的社區沒有認識的人，但孩子在那裡交到了朋友。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'seed_parent_illness',
    title: '父母病了',
    ages: [30, 65],
    tags: ['family', 'caregiving'],
    major: true,
    cond: (s, h) => (s.family.mother.alive && s.family.mother.age >= 62) || (s.family.father.alive && s.family.father.age >= 62),
    text: (s, h) => {
      const who = s.family.mother.alive && s.family.mother.age >= 62 ? s.family.mother.name : s.family.father.name;
      return `${who}突然病倒了。醫生說需要長期照顧，電話那頭，兄弟姊妹們各自有難處。所有人都在等別人先決定。`;
    },
    choices: [
      {
        label: '親自照顧，把人接到身邊',
        effects: { happiness: -2, health: -4, social: +2, wealth: -3 },
        result: '你把客房改成病房。夜裡常被呼叫鈴叫醒，累是累，但你看見對方在熟悉的環境裡慢慢安穩下來，覺得這一切值得。',
        set: ['caregiver_parent'],
        ai: (s, h) => (h.incomeAtLeast('UM') ? 1.2 : 1.8),
      },
      {
        label: '請人照顧並定期探望',
        cond: (s, h) => h.stat('wealth') >= 40,
        effects: { wealth: -6, happiness: -1, social: -1 },
        result: '你付錢請了專業照護，每週固定回去看他。心裡始終有點愧疚，但至少他得到了較好的照顧。',
        ai: 1.3,
      },
      {
        label: '與手足輪流分擔',
        effects: { happiness: -1, health: -2, social: +1 },
        result: '你和手足排出輪值表。吵過幾次架，也在病房外一起吃過便當。那是這些年裡你們最常聚在一起的時光。',
        ai: 2,
      },
    ],
  },

  // =====================================================================================
  // 遷移
  // =====================================================================================
  {
    id: 'seed_migration_offer',
    title: '到國外去',
    ages: [20, 45],
    tags: ['migration'],
    major: true,
    cond: (s, h) => !h.isMigrant() && !h.inSchool() && h.income() !== 'H' && h.eduYears() >= 6 && !h.has('declined_abroad'),
    text: (s, h) => h.byIncome({
      L: '你遇見一個從外國回來的人，他說那邊缺人手，工資是這裡的十倍。你的家人把家裡能賣的都算了一遍。',
      LM: '同鄉的人在海外賺了錢，寄回的匯款蓋了新房子。有人問你要不要一起走，辦證件和仲介費需要一筆不小的錢。',
      UM: '你收到一份國外的工作邀請，薪水不錯，但語言、文化和家人都得重新排列組合。',
    }),
    choices: [
      {
        label: '出國，放手一搏',
        effects: (s, h) => {
          const dest = h.pick(h.isRegion('MENA', 'SSA') ? ['ARE', 'SAU', 'FRA', 'GBR', 'DEU'] : h.isRegion('SEA', 'SAS', 'EAS') ? ['JPN', 'KOR', 'SGP', 'AUS', 'CAN', 'ARE'] : h.isRegion('LAC') ? ['USA', 'ESP', 'CAN'] : ['DEU', 'GBR', 'USA', 'CAN']);
          h.migrate(dest);
          h.set('migrant_dream');
          h.change('wealth', +8);
          h.change('social', -8);
          h.change('happiness', -2);
        },
        result: (s, h) => `你搭上了飛機。落地後的第一個晚上，你在${h.countryName()}的陌生街頭給家人撥了第一通電話，聽到他們的聲音，才忽然落了淚。`,
        highlight: (s, h) => `移居${h.countryName()}。`,
        schedule: [{ id: 'seed_homesick', inYears: [1, 3] }],
        ai: (s, h) => (h.isPoor() ? 2 : 0.8),
      },
      {
        label: '留下來，在原地想辦法',
        effects: { social: +2, happiness: +1 },
        set: ['declined_abroad'],
        result: '你婉拒了。這個決定也許讓你少了一個機會，但你每天能和家人一起吃飯。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'seed_homesick',
    title: '想家的夜晚',
    ages: [20, 80],
    once: false,
    cooldown: 6,
    tags: ['migration', 'followup'],
    cond: (s, h) => h.isMigrant(),
    text: (s, h) => `${h.countryName()}的冬天特別長。你在廚房煮了一鍋家鄉的湯，一口喝下去，眼淚就掉在碗裡。同事問你怎麼了，你說：「沒事，辣椒太辣。」`,
    effects: { happiness: -3, social: -1 },
  },

  // =====================================================================================
  // 健康
  // =====================================================================================
  {
    id: 'seed_checkup',
    title: '健康檢查',
    ages: [35, 75],
    once: false,
    cooldown: 6,
    tags: ['health'],
    cond: (s, h) => h.incomeAtLeast('LM') && !h.isPoor(),
    text: (s, h) => '單位安排了健康檢查。你躺在儀器上，聽著護理師的腳步聲來來去去。幾週後，報告寄來了，醫生圈出了幾個需要追蹤的數字。',
    effects: (s, h) => {
      h.change('health', +1);
      if (h.age() >= 45 && !h.hasCondition('hypertension') && h.chance(0.12)) h.addCondition('hypertension');
      else if (h.age() >= 50 && !h.hasCondition('diabetes') && h.chance(0.07)) h.addCondition('diabetes');
    },
  },
  {
    id: 'seed_health_scare',
    title: '胸口的悶痛',
    ages: [38, 80],
    tags: ['health'],
    major: true,
    once: false,
    cooldown: 10,
    weight: (s, h) => 0.5 + (h.isSmoker() ? 0.6 : 0) + (h.hasCondition('hypertension') ? 0.4 : 0),
    text: (s, h) => '你在爬樓梯時突然胸口發悶，額頭冒出冷汗。休息一會兒後好些了，但那種被緊緊握住的感覺讓你很不安。',
    choices: [
      {
        label: '馬上去醫院檢查',
        cond: (s, h) => h.incomeAtLeast('LM') || h.stat('wealth') > 25,
        effects: (s, h) => { h.change('wealth', -3); h.change('health', +2); if (h.chance(0.25)) h.addCondition('heart_disease'); },
        result: (s, h) => h.hasCondition('heart_disease') ? '檢查發現你的心臟血管出現了狹窄。早一步發現，讓醫師還有很多可以做的事。' : '檢查結果顯示只是疲勞與壓力，醫師還是叮嚀你要多運動、少熬夜。',
        ai: (s, h) => (h.isPoor() ? 0.8 : 3),
      },
      {
        label: '等一等，也許只是累了',
        effects: (s, h) => { h.addRisk(1.3, 2); h.change('happiness', -1); },
        result: '你告訴自己別大驚小怪。接下來幾個月裡，那種悶痛偶爾還會回來，你假裝沒有注意到。',
        ai: (s, h) => (h.isPoor() ? 2 : 0.7),
      },
      {
        label: '買成藥或試試偏方',
        cond: (s, h) => !h.incomeAtLeast('H'),
        effects: (s, h) => { h.change('wealth', -1); h.addRisk(1.2, 2); },
        result: '你照著鄰居的說法試了幾種辦法。症狀有時好、有時壞，你說不上來到底有沒有用。',
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.4),
      },
    ],
  },
  {
    id: 'seed_accident',
    title: '意外受傷',
    ages: [8, 70],
    once: false,
    cooldown: 8,
    weight: 0.35,
    tags: ['health', 'accident'],
    text: (s, h) => `${h.byIncome({
      L: '你從工作的地方摔了下來，沒有保險，也沒有人賠償。是同伴們湊了錢才把你送到醫院。',
      LM: '你在路上被一輛違規的車擦撞，骨折躺了好幾週，這期間沒有工作就沒有收入。',
      UM: '你騎車時摔了一跤，手臂骨折。保險賠了一部分，剩下的假得自己想辦法補。',
      H: '你在樓梯上踩空，腳踝骨折。醫療與保險處理得很順利，但漫長的復健讓你很不耐煩。',
    })}`,
    effects: (s, h) => { h.change('health', -5); h.change('happiness', -3); h.change('wealth', h.byIncome({ L: -4, LM: -3, UM: -2, H: -1 })); if (h.chance(0.06)) h.addCondition('disability'); },
  },

  // =====================================================================================
  // 時代事件（以年份觸發）
  // =====================================================================================
  {
    id: 'seed_financial_crisis_2008',
    title: '金融海嘯',
    ages: [16, 85],
    chance: 1,
    tags: ['world', 'money'],
    cond: (s, h) => h.yearIn(2008, 2009) && h.incomeAtLeast('LM'),
    text: (s, h) => h.employed()
      ? '新聞每天播報銀行倒閉與股市崩盤。公司開始凍結招募、縮減預算，你和同事私下交換著各種消息，誰也不確定下一個被叫進會議室的是誰。'
      : '新聞每天播報銀行倒閉與股市崩盤。周圍的人都在談論錢，連平常不看新聞的人也開始皺眉。',
    effects: (s, h) => { h.change('wealth', h.employed() ? -4 : -2); h.change('happiness', -3); if (h.employed() && h.chance(0.08)) h.loseJob(); },
  },
  {
    id: 'seed_smartphone',
    title: '第一支智慧型手機',
    ages: [10, 70],
    chance: 0.5,
    tags: ['world', 'tech'],
    cond: (s, h) => h.yearIn(2009, 2014) && h.incomeAtLeast('LM') && h.stat('wealth') > 30,
    text: (s, h) => `你拿到了第一支能上網的手機。起初你只是拿來查路線與傳訊息，沒多久，你就發現自己每天都會在睡前滑上半小時，直到眼皮沉重。`,
    effects: { knowledge: +2, social: +3, happiness: +1, health: -1 },
    set: ['has_smartphone'],
  },
  {
    id: 'seed_pandemic_2020',
    title: '口罩與封鎖',
    ages: [0, 100],
    chance: 1,
    tags: ['world', 'health'],
    cond: (s, h) => h.yearIn(2020, 2021),
    text: (s, h) => h.byIncome({
      L: '一種新的傳染病席捲了世界。市場關了，你原本能打的零工也沒了，家人每天算著還有幾袋米。',
      LM: '一種新的傳染病席捲了世界。工作時有時無，你得在「怕生病」與「怕沒收入」之間找一條路。',
      UM: '一種新的傳染病席捲了世界。口罩、封鎖與居家，成了日常，你開始習慣在螢幕裡見朋友。',
      H: '一種新的傳染病席捲了世界。學校與公司紛紛改為遠距，你在家工作，與家人共處的時間比任何時候都多，也比任何時候都長。',
    }),
    effects: (s, h) => {
      h.change('happiness', -4);
      h.change('social', -4);
      h.change('wealth', h.byIncome({ L: -4, LM: -3, UM: -1, H: 0 }));
      if (h.age() >= 60 && h.chance(0.04)) h.addRisk(2.2, 1);
    },
  },

  // =====================================================================================
  // 中老年 55+
  // =====================================================================================
  {
    id: 'seed_retirement_plan',
    title: '要不要退休',
    ages: [57, 68],
    tags: ['work', 'aging'],
    major: true,
    cond: (s, h) => h.employed() && !h.has('retirement_decided'),
    text: (s, h) => h.byIncome({
      L: '你的身體越來越吃力。可是沒有退休金，不工作的話，餐桌上的飯就是一個問題。',
      LM: '同事們陸續辦理退休，你的腰也不如從前。可是你的存款加退休金，可能不夠撐太久。',
      UM: '單位開出了提前退休的方案。你算了好幾遍，每個月能領到的數字，足夠過一個節制的日子。',
      H: '人資寄來了退休規劃資料。你把它擺在桌上看了好幾天，覺得自己還沒準備好。',
    }),
    choices: [
      {
        label: '辦理退休',
        effects: (s, h) => { h.retire(); h.change('happiness', +4); h.change('wealth', -3); },
        set: ['retirement_decided'],
        result: '最後一天下班時，同事送了你一束花。你抱著它走出大門，覺得自己像是一個終於放假的孩子。',
        ai: (s, h) => (h.stat('health') < 50 ? 2.5 : 1),
      },
      {
        label: '繼續工作',
        effects: { wealth: +2, health: -2, social: +1 },
        set: ['retirement_decided'],
        result: '你繼續上班，再多存一點，也繼續看見那些熟悉的同事。身體有些疲倦，卻有一種被需要的踏實。',
        ai: (s, h) => (h.isPoor() ? 2.5 : 1),
      },
      {
        label: '轉為兼職或顧問',
        cond: (s, h) => h.eduAtLeast('secondary'),
        effects: { happiness: +2, wealth: -1, health: -1 },
        set: ['retirement_decided'],
        result: '你和單位談定了彈性的安排，一週只去幾天。其他的日子，你終於有時間澆花、散步，或睡到自然醒。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'seed_grandchild',
    title: '當了祖父母',
    ages: [45, 85],
    chance: 0.07,
    tags: ['family', 'milestone'],
    milestone: true,
    cond: (s, h) => h.hasChildren() && !h.has('grandparent') && s.children.some((c) => c.alive && s.year - c.birthYear >= 22),
    text: (s, h) => `${h.childName(0)}打電話來，聲音發抖：「爸媽，我要當爸媽了。」幾個月後，你抱起了孫輩的小小身體，覺得時間繞了一圈，又回到了原點。`,
    effects: { happiness: +8, social: +4 },
    set: ['grandparent'],
    highlight: '抱起了第一個孫輩。',
  },
  {
    id: 'seed_old_friend_dies',
    title: '老朋友走了',
    ages: [62, 95],
    once: false,
    cooldown: 4,
    weight: (s, h) => 0.6 + Math.max(0, (s.age - 65) * 0.04),
    tags: ['aging', 'loss'],
    text: (s, h) => '收到訃告的那天，你把它放在桌上看了很久。年輕時和你一起騎車、喝酒、吵架的人，又少了一個。你發現自己能說話的對象越來越少。',
    effects: { happiness: -4, social: -4 },
  },
  {
    id: 'seed_look_back',
    title: '回頭看',
    ages: [68, 95],
    tags: ['aging', 'reflection'],
    major: true,
    cond: (s, h) => !h.has('looked_back'),
    text: (s, h) => '午後的陽光落在桌上，你翻出一箱老照片：小時候的學校、第一份工作、年輕時的某些笑臉。你忽然很想，在還有力氣的時候，為這一生做點什麼。',
    choices: [
      {
        label: '把故事寫下來',
        effects: { happiness: +4, knowledge: +2 },
        set: ['looked_back', 'wrote_memoir'],
        result: '你一天寫一頁，字跡有些顫抖。孩子們讀了之後，才第一次知道你年輕時還有過那麼多故事。',
        highlight: '寫下了自己的回憶。',
        ai: (s, h) => (h.eduAtLeast('secondary') ? 2 : 0.8),
      },
      {
        label: '回故鄉走一趟',
        cond: (s, h) => h.stat('health') >= 40,
        effects: { happiness: +5, health: -2, wealth: -2, social: +3 },
        set: ['looked_back'],
        result: (s, h) => `你坐車回到${h.city()}。老街道的樣貌變了，但你站在小學的鐵門前，仍能清楚想起鈴聲響起的那一刻。`,
        ai: 2,
      },
      {
        label: '把時間留給家人',
        effects: { happiness: +4, social: +5 },
        set: ['looked_back'],
        result: '你邀大家回家吃飯，什麼都不談，只是一起做菜、一起吃。那頓飯結束時，每個人都比平常多坐了一會兒。',
        ai: 2.5,
      },
    ],
  },

  // =====================================================================================
  // 地區與天災
  // =====================================================================================
  {
    id: 'seed_disaster',
    title: '洪水來了',
    ages: [3, 90],
    tags: ['regional', 'disaster'],
    major: true,
    chance: 0.012,
    once: false,
    cooldown: 15,
    cond: (s, h) => h.isRegion('SAS', 'SEA', 'EAS', 'LAC', 'OCE') && (h.income() !== 'H' || h.chance(0.3)),
    text: (s, h) => '連續幾天的暴雨讓河水漫過了堤防。夜裡，水聲越來越近，鄰居在窗外大聲喊著要大家快跑。',
    choices: [
      {
        label: '立刻帶著家人撤離',
        effects: (s, h) => { h.change('wealth', -5); h.change('happiness', -4); h.change('social', +2); },
        result: '你抱起最重要的幾樣東西往高處跑。天亮時回頭看，屋子已泡在水裡。你什麼都沒了，但每個人都還在。',
        ai: 4,
      },
      {
        label: '留下來守住家當',
        effects: (s, h) => {
          if (h.chance(0.08)) { h.die('disaster'); return; }
          h.change('health', -6); h.change('happiness', -4); h.change('wealth', -2);
        },
        result: (s, h) => (s.alive ? '你守了一整夜，水位在窗台下停住了。累到沒有力氣說話，但屋子保住了。' : ''),
        ai: 0.6,
      },
    ],
  },
];
