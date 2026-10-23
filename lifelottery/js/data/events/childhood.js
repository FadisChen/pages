// Events for ages 0-12: family, play, first school years, hunger, safety, and the small decisions of childhood.
// Ids start with `childhood_` (the prefix required by tests via index.js). Flags set here start with `c_`.
//
// Follow-up chains (choice -> schedule -> follow-up, `weight: 0` = only reachable through schedule):
//   stray_dog -> dog_later            found_wallet -> wallet_echo        broken_window -> blame_echo
//   fee_day -> teacher_visit          new_baby -> sibling_bond           parents_quarrel -> parents_talk
//   talent -> youth_talent_audition   cheat_test -> cheat_echo           language_gap -> language_click
//   gift_money -> piggy_bank          friend_moves -> friend_letter      after_primary -> teacher_persuades
//   night_school -> night_school_cert see_bully -> bully_friend          dream_job -> youth_dream_check
//   corner_boys -> youth_gang_offer   cram_school -> youth_cram_burnout
//
// All functions are total: they never assume a parent, partner or child exists unless `cond` guarantees it.

const MUSLIM = new Set(['BGD', 'PAK', 'IDN', 'MYS', 'EGY', 'TUR', 'IRN', 'IRQ', 'SAU', 'DZA', 'MAR', 'TUN', 'AFG', 'UZB', 'KAZ', 'JOR', 'SYR', 'YEM',
  'SDN', 'SOM', 'SEN', 'MLI', 'NER', 'LBY', 'AZE', 'TJK', 'TKM', 'KGZ', 'ARE', 'KWT', 'QAT', 'OMN', 'BHR', 'MRT', 'GIN', 'PSE', 'LBN', 'BRN', 'MDV']);

/** The adult who is most likely there for you, as a word; safe when both parents are gone. */
const mom = (h) => (h.parentAlive('mother') ? '媽媽' : h.parentAlive('father') ? '爸爸' : '身邊的大人');

/** 30% chance that a quarrel the child overhears is the start of a separation (read by the follow-up and by youth events). */
function rollSplit(h) {
  if (h.chance(0.3)) h.set('c_parents_split');
}

const TALENTS = [
  { who: '體育老師', verb: '在操場上跑步', done: '跑起來的時候，風好像替你讓開了一條路' },
  { who: '音樂老師', verb: '唱歌', done: '唱到最高那個音時，整間教室都安靜了下來' },
  { who: '美術老師', verb: '畫畫', done: '紙上的線條，已經開始有點像你自己的聲音了' },
];
const talentOf = (s) => TALENTS[(s.birthYear + (s.gender === 'F' ? 1 : 0)) % 3];

export default [
  // =====================================================================================
  // 嬰幼兒與學齡前 0-5
  // =====================================================================================
  {
    id: 'childhood_first_steps',
    title: '第一步',
    ages: [1, 1],
    tags: ['family', 'childhood'],
    text: (s, h) => h.byIncome({
      L: '你扶著土牆一步步挪動，忽然放開手走了三步，隨即一屁股坐在地上。屋裡屋外的人同時笑出聲，有人喊你的小名，連隔壁的鄰居都探頭來看。',
      LM: '你扶著板凳邊搖搖晃晃走了三步，然後一屁股坐下。全家人像看到進球一樣歡呼，連廚房裡的人也衝了出來。你被嚇得差點哭出來，卻又覺得自己做了一件了不起的事。',
      UM: '你放開茶几邊角，歪歪扭扭走過客廳。大人們尖叫著翻找相機，你被這陣仗嚇到，坐在地上放聲大哭，哭完卻又搖搖晃晃地想再走一次。',
      H: '你放開沙發邊，搖搖晃晃走過了整個客廳。大人們屏住呼吸，等你撲進懷裡時才一起歡呼，連樓下的鄰居都聽見了，那天晚餐桌上只剩下這個話題。',
    }),
    effects: { happiness: +2, health: +1, social: +1 },
  },
  {
    id: 'childhood_lullaby',
    title: '夜裡的歌',
    ages: [0, 3],
    weight: 0.8,
    tags: ['family', 'childhood'],
    text: (s, h) => h.byIncome({
      L: `夜裡你哭鬧不休，${mom(h)}把你綁在背上來回走動，哼著一支村裡流傳的老調子，哼到雞都叫了。你的小拳頭終於鬆開，抓著那一小截背帶睡著。`,
      LM: `夜裡你哭鬧不休，${mom(h)}把你抱在懷裡踱步，哼著自己小時候學來的歌，哼走了調也沒人在意，倒是你聽著聽著，一個哈欠接著一個哈欠。`,
      UM: '夜裡你哭鬧不休，大人輪流抱著你繞客廳，最後一首走音的搖籃曲讓你安靜下來，大人自己卻睡不著了，只好坐在床邊盯著你小小的胸口一起一伏。',
      H: '夜裡你哭鬧不休，大人輪流抱著你繞客廳，最後一首走音的搖籃曲讓你闔上眼睛，大人卻睜著眼等到天亮，只為了確認你的呼吸一直都在。',
    }),
    effects: { happiness: +2, social: +2, health: +1 },
  },
  {
    id: 'childhood_vaccine',
    title: '打預防針的日子',
    ages: [0, 5],
    weight: 0.9,
    tags: ['health', 'childhood'],
    text: (s, h) => h.byIncome({
      L: '衛生人員帶著冷藏箱走了半天的路來到村裡，大人帶著孩子排成一列。輪到你時你扯開喉嚨哭，哭聲驚動了樹上的鳥，哭完卻拿到一顆糖，馬上破涕為笑。',
      LM: '衛生所的護理師把你的手臂擦了又擦。針一下去你放聲大哭，大人一邊拍你一邊對護理師說抱歉，其實沒什麼好抱歉的，候診長椅上的孩子們全都安靜了。',
      UM: '診所護理師說「很快就好」，這是大人們共同的謊言。你哭完以後，拿到一張貼紙和一本蓋滿章的接種小冊子，後來那本小冊子被好好收在抽屜裡，一直收了很多年。',
      H: '護理師蹲下來跟你說「數到三就好」，你數到二就哭了。回家路上你一手抱著玩偶，一手緊緊捏著新貼的繃帶，又驕傲又委屈，像個剛打完仗的小戰士。',
    }),
    effects: (s, h) => {
      h.change('health', h.byIncome({ L: +4, LM: +3, UM: +2, H: +2 }));
      h.change('happiness', -1);
    },
  },
  {
    id: 'childhood_toys',
    title: '最寶貝的玩具',
    ages: [2, 8],
    tags: ['childhood', 'play'],
    text: (s, h) => h.byIncome({
      L: '你的玩具是舊鐵絲彎成的小車、撿來的瓶蓋，和一顆破布縫成的球。你對它們的愛，一點也不輸商店裡的玩具，每晚都要把它們整整齊齊排在枕頭邊才睡得著。',
      LM: '你最寶貝的是一盒彈珠和一把橡皮筋。下午的巷子裡，誰的彈珠多，誰就是國王，你曾經當過兩天。輸光的那天，你把口袋翻出來，竟然還笑得出來。',
      UM: '客廳地板總散落著積木和小汽車。你把全部玩具排成一長列，宣布這是火車，誰踩到誰就要負責賠償。來訪的客人只好踮著腳尖走過客廳，表情比你還認真。',
      H: h.year() >= 2035
        ? '房間裡有會說話的玩偶，你卻最愛玩快遞來的紙箱。你說它是太空船，在裡面坐了一整個下午，誰叫都不出來，連晚餐都要大人把飯菜從「艙門」遞進去。'
        : '房間裡的玩具堆得像小山，你卻只迷上快遞來的紙箱。你說它是太空船，在裡面坐了一整個下午，連晚餐都要大人把飯菜從「艙門」遞進去。',
    }),
    effects: { happiness: +3, knowledge: +1 },
  },
  {
    id: 'childhood_dark_night',
    title: '關燈以後',
    ages: [3, 6],
    weight: 0.8,
    tags: ['childhood', 'fear'],
    text: (s, h) => (!h.urban() && !h.incomeAtLeast('UM') && h.year() < 2012
      ? '天一黑，屋裡只剩煤油燈小小的火光。牆上的影子忽大忽小，像會動的怪獸。你縮進大人身邊，聽著外頭的蟲鳴，聽著聽著，就慢慢睡著了。'
      : `關了燈以後，衣櫃的影子看起來像一隻彎腰的大怪物。你抱緊棉被，大氣也不敢喘，直到${mom(h)}走進來，在你額頭上親了一下，把房門留了一條縫。`),
    effects: { happiness: -1, social: +1 },
  },
  {
    id: 'childhood_imaginary_friend',
    title: '只有你看得見的朋友',
    ages: [3, 6],
    weight: 0.7,
    tags: ['childhood', 'play'],
    text: (s, h) => '你有一個只有自己看得見的朋友，每次吃飯都要替他留位子。大人們配合得很認真，還會對著空氣說謝謝，只是不小心坐到他身上時，你會大聲抗議，說他被壓扁了。',
    effects: { happiness: +3, knowledge: +1 },
  },
  {
    id: 'childhood_puddle',
    title: '水窪',
    ages: [3, 9],
    weight: 0.8,
    tags: ['childhood', 'play'],
    text: (s, h) => `雨剛停，你就衝進水窪裡跳，濺了自己滿褲腳的泥。${mom(h)}在後面喊你，聲音裡有責備，也有一點想笑。你回頭咧嘴一笑，又重重地跳進下一個水窪。`,
    effects: { happiness: +3, health: -1 },
  },
  {
    id: 'childhood_elder_stories',
    title: '傍晚的故事',
    ages: [3, 9],
    tags: ['family', 'childhood'],
    text: (s, h) => `傍晚，家裡最年長的那位在${h.urban() ? '陽台上' : '院子裡'}講故事：有會說話的動物，也有他年輕時的事。你分不出哪些是真的，卻把每一句都記了下來，睡前還要拉著他的袖子問後來呢。`,
    effects: { knowledge: +2, social: +2, happiness: +2 },
  },
  {
    id: 'childhood_kitchen',
    title: '廚房的味道',
    ages: [3, 10],
    weight: 0.8,
    tags: ['family', 'childhood'],
    text: (s, h) => h.byIncome({
      L: `灶膛的柴火噼啪響，${mom(h)}掀開鍋蓋，白煙撲了你一臉。你偷嚐了第一口，燙到跳腳，舌頭麻了一整個下午，卻笑得合不攏嘴，還伸手想再偷一口。`,
      LM: `${mom(h)}在爐火前翻炒，鍋鏟敲得叮噹響。你被派去剝蒜，剝到手指都是味道，洗了三次手還是香的。你卻覺得自己很有用，晚飯時特別大聲地說「這是我剝的」。`,
      UM: `你踮腳趴在流理台邊，看${mom(h)}切菜。偷嚐了一口剛出鍋的菜，燙得直吐舌頭，被笑了一整個晚上，連隔天鄰居都知道你吐舌頭的樣子，還有人學給你看。`,
      H: `你搬了張小凳子站在流理台邊，幫忙攪拌麵糊。大半的麵糊最後都在你的臉上，但烤出來的餅乾你吃了六片，吃完肚子痛了一晚，卻說下次還要做。`,
    }),
    effects: { happiness: +3, social: +2, knowledge: +1 },
  },
  {
    id: 'childhood_tooth',
    title: '掉了第一顆牙',
    ages: [6, 8],
    tags: ['childhood', 'body'],
    text: (s, h) => {
      const r = h.region();
      if (r === 'EAS') return '你掉了第一顆乳牙。大人說上牙要丟到床底下、下牙要丟到屋頂上，新牙才會長得整齊。你認真照辦，還爬去找過那顆牙，結果在屋頂上遇到一隻很兇的貓。';
      if (r === 'NAM' || r === 'EUR' || r === 'OCE') return '你掉了第一顆牙，把它壓在枕頭下面。半夜你偷偷醒來想抓住牙仙子，卻睡著了，隔天牙齒變成了一枚亮亮的硬幣，你捏在手心，開心得好幾天都不肯花掉。';
      if (r === 'LAC') return '你掉了第一顆牙，把它放在枕頭下。隔天牙齒不見了，換成一小枚硬幣，大人說是牙齒小老鼠來過。你半信半疑地信了，還偷偷把剩下的牙齒也放在枕頭下，想再試試運氣。';
      return '你掉了第一顆牙。大人教你把牙齒藏在安全的地方，說新牙很快就會長出來。你每天都用舌頭去舔那個小洞，像在探索新大陸，還特地跑去給每個朋友參觀。';
    },
    effects: { happiness: +2, knowledge: +1 },
  },
  {
    id: 'childhood_birthday',
    title: '生日',
    ages: [4, 12],
    once: false,
    cooldown: 4,
    weight: 0.8,
    tags: ['family', 'childhood'],
    text: (s, h) => h.byIncome({
      L: `今年的生日只是比平常多了一顆水煮蛋。${mom(h)}把蛋剝好放進你碗裡，說：「又大一歲了。」你吃得很慢，一口一口，想讓這個小小的生日在嘴裡多留一會兒。`,
      LM: '生日那天餐桌上多了一道平常捨不得做的菜。沒有蛋糕，但有人帶頭唱了走音的生日歌，連鄰居都探頭進來湊熱鬧，那盤菜你吃得又長又慢，一口都捨不得吃完。',
      UM: '生日那天家裡買了小蛋糕。你許了願，吹熄蠟燭時不小心把口水噴在奶油上，大家很有默契地假裝沒看見，只有你自己偷偷笑出了聲，許的願差點忘光。',
      H: '生日派對上，十幾個同學擠滿客廳，氣球爆了三顆。你拆禮物拆到手痠，卻最記得和好朋友躲在桌子底下偷吃奶油，被抓到時兩個人滿嘴白白的，笑到滾在地上。',
    }),
    effects: { happiness: +3, social: +1 },
  },
  {
    id: 'childhood_festival',
    title: '節日裡的小孩',
    ages: [3, 12],
    once: false,
    cooldown: 4,
    weight: 0.9,
    tags: ['family', 'culture'],
    text: (s, h) => {
      const c = s.countryCode;
      if (h.region() === 'EAS') return '過年時家裡擠滿了親戚，桌上堆滿年菜。長輩們輪流塞紅包給你，你一邊說吉祥話，一邊偷偷算今年的收成，晚上把紅包壓在枕頭底下睡覺。';
      if (MUSLIM.has(c)) return '節日的早晨，大人們換上新衣，家家戶戶互相拜訪。你拿到節日的零用錢和一大把糖果，滿手甜得黏答答，吃到最後，連袖子都被糖黏在一起。';
      if (c === 'IND' || c === 'NPL') return '節日的夜裡，窗台和門口點滿了小油燈，巷子裡的鞭炮聲此起彼落。你和表兄弟姊妹跑來跑去，吃甜點吃到走不動，躺在涼涼的石階上，數著天上忽明忽暗的煙火。';
      if (h.region() === 'LAC') return '平安夜，大家直到午夜才開飯。你撐著眼皮等到零點，在鞭炮聲和擁抱之間被親戚輪流親了好幾次，最後迷迷糊糊地在沙發上睡著，被蓋上了三條毯子。';
      if (h.isRegion('EUR', 'NAM', 'OCE')) return '節慶的早晨你比誰都早醒，赤腳衝到客廳。包裝紙撕了一地，你卻最愛家人織的那件醜毛衣，一直穿到發臭，直到大人趁你睡著偷偷拿去洗，你隔天哭著要回來。';
      if (h.region() === 'SSA') return '年底的家族聚會，遠方的親戚都回來了。整個院子擠滿了人，大鍋飯香氣四溢，大人聊到深夜，你在孩子堆裡玩捉迷藏，玩到被誰抱回床上都不知道。';
      return '節慶時家裡擠滿了親戚，大人忙著張羅，你被派去搬椅子、擺碗筷，忙得像一隻小陀螺，卻能趁人不注意，偷拿到一塊最好吃的點心，躲在桌子底下慢慢吃。';
    },
    effects: { happiness: +4, social: +3, wealth: +1 },
  },
  {
    id: 'childhood_lice',
    title: '頭上的小房客',
    ages: [5, 10],
    weight: 0.5,
    tags: ['health', 'school'],
    text: (s, h) => '老師發了一張通知單：班上有人長頭蝨。那晚大人拿著細齒梳和一盞燈翻你的頭髮，抓到的那一刻，兩個人同時發出了奇怪的叫聲，然後一起笑到不行。',
    effects: { health: -1, happiness: -1, social: -1 },
  },
  {
    id: 'childhood_tree_fall',
    title: '從樹上摔下來',
    ages: [5, 11],
    weight: 0.6,
    tags: ['health', 'play'],
    text: (s, h) => h.byIncome({
      L: '你爬上樹去摘果子，腳下一滑摔了下來，膝蓋破了一大塊皮。大人用乾淨的水沖了傷口，再抹上家裡僅有的那瓶藥水，痛得你直跳，眼淚在眼眶裡打轉，卻硬是撐著沒掉下來。',
      LM: '你爬上牆頭去撿球，腳一滑摔了下來，膝蓋破了一大塊皮。衛生所的阿姨幫你消毒時，你咬著牙沒哭，直到看見血才哭，哭完阿姨給了你一顆糖，說：「勇敢的孩子，都可以哭一下。」',
      UM: '你爬上樹去撿風箏，腳一滑摔了下來，膝蓋破了一大塊皮。你咬牙忍著沒哭，直到看見血才放聲大哭，哭聲驚動了整條街的狗，大家都跑來看你的膝蓋。',
      H: '你爬上遊樂設施的最高處，腳一滑摔了下來，膝蓋擦破了皮。護理師貼上卡通圖案的繃帶，你的傷口立刻變成了勳章，到學校逢人就展示，直到繃帶都捲邊了。',
    }),
    effects: { health: -2, happiness: -1 },
  },
  {
    id: 'childhood_mosquito_season',
    title: '雨季的蚊子',
    ages: [1, 8],
    weight: 0.7,
    tags: ['health', 'regional'],
    cond: (s, h) => h.isRegion('SSA', 'SAS', 'SEA', 'LAC') && !h.incomeAtLeast('H'),
    text: (s, h) => (h.year() >= 2005 && !h.incomeAtLeast('UM')
      ? '雨季一到，蚊子像一團團黑煙。這年家裡領到了一頂防蚊帳，大人把四個角小心繫好。你在網子裡聽著外面的嗡嗡聲，睡得特別安穩，連夢裡都沒有那些討厭的嗡嗡聲。'
      : '雨季一到，蚊子像一團團黑煙。大人點起蚊香、關緊窗戶，你的手腳還是被叮得全是紅腫的包，癢得整夜翻來覆去，隔天一大早，你數了數，光是一隻腳就有九個包。'),
    effects: (s, h) => {
      if (h.year() >= 2005 && !h.incomeAtLeast('UM')) { h.change('health', +2); h.change('happiness', +1); }
      else { h.change('health', -2); h.change('happiness', -1); }
    },
  },
  {
    id: 'childhood_bad_water',
    title: '那壺煮開的水',
    ages: [3, 10],
    weight: 0.8,
    tags: ['health', 'regional'],
    cond: (s, h) => (h.income() === 'L' || h.income() === 'LM') && h.wealthQ() <= 3,
    text: (s, h) => '雨季的水混著泥，你喝下去後肚子絞痛了兩天。從那以後，家裡多了一道工序：把水煮開、放涼，再倒進專屬的那只壺，壺蓋蓋得緊緊的，誰也不准亂動。',
    effects: { health: -3, knowledge: +1, happiness: -1 },
  },
  {
    id: 'childhood_screen_time',
    title: '螢幕裡的世界',
    ages: [3, 11],
    weight: 0.9,
    tags: ['tech', 'childhood'],
    cond: (s, h) => h.year() >= 2012 && h.incomeAtLeast('LM') && h.stat('wealth') > 30,
    text: (s, h) => {
      if (h.year() >= 2040) return '牆上的螢幕和會回答問題的小機器人，是你最早的玩伴。你學會的第一個長句子，有一半是對著它說的，另一半是對著大人。後來你才知道，那些大人很常被你的機器人朋友「糾正發音」。';
      return h.byIncome({
        LM: '家裡有一支共用的手機，你總趁大人煮飯時偷看影片，每次被發現，剛好都看到最精彩的那一段，只好眼巴巴地懇求大人再讓你看完這一集。',
        UM: '平板裡的卡通一部接一部。大人說「再看一集」，說到第五集你還是沒有關掉，直到螢幕自己暗掉，你才驚覺天已經黑了，肚子也在咕咕叫。',
        H: '平板的影片一部接著一部，你的眼睛盯得發直。大人終於按下暫停，你抱著腿哭了十分鐘，然後開始玩積木，玩著玩著，竟然搭出一座比你還高的塔。',
      });
    },
    effects: { knowledge: +1, happiness: +1, health: -1 },
  },
  {
    id: 'childhood_first_tv',
    title: '那台電視',
    ages: [3, 10],
    tags: ['culture', 'childhood'],
    cond: (s, h) => h.yearIn(1966, 1998),
    text: (s, h) => (h.incomeAtLeast('UM')
      ? '客廳裡那台電視成了全家晚上的中心，你守著卡通開播的時間，一分鐘都不肯遲到，連吃飯都要端到電視前面，一邊嚼一邊盯著螢幕，湯匙好幾次戳到鼻子。'
      : `${h.urban() ? '巷子裡' : '村裡'}只有一戶人家有電視。晚上大家端著板凳擠進他家，一齣連續劇看完，你已經趴在大人腿上睡著了，夢裡還在跟著劇情緊張，隔天上學第一件事，就是跟同伴講昨天演到哪裡。`),
    effects: { happiness: +3, social: +2, knowledge: +1 },
  },
  {
    id: 'childhood_pet',
    title: '家裡的小動物',
    ages: [4, 11],
    weight: 0.8,
    tags: ['childhood', 'animals'],
    text: (s, h) => (!h.urban() && !h.incomeAtLeast('UM')
      ? '家裡的母雞孵出了小雞。你替其中一隻取了名字，每天餵牠碎米。大人說別取名字，你還是偷偷取了。每天早上，你都先去看看牠有沒有長大一點，才肯去上學。'
      : '你家養了一隻貓，牠對你的態度時冷時熱，卻總在你難過的時候，不吭一聲地靠在你腳邊，用暖暖的背脊貼著你的腳踝，一直待到你不哭了為止。'),
    effects: { happiness: +3, social: +1 },
  },
  {
    id: 'childhood_harvest_help',
    title: '收成的季節',
    ages: [6, 12],
    weight: 0.9,
    tags: ['regional', 'work', 'childhood'],
    cond: (s, h) => !h.urban() && !h.incomeAtLeast('H') && h.wealthQ() <= 4,
    text: (s, h) => '收成的季節，全家天不亮就下田。你被分派到最輕的活：撿掉在地上的穗子、遞水。夕陽把整片田照成金色，你累得一沾枕頭就睡著，連晚飯的碗都忘了端。',
    effects: { health: -1, happiness: +1, social: +2, wealth: +1 },
  },
  {
    id: 'childhood_hand_me_down',
    title: '傳下來的衣服',
    ages: [5, 12],
    weight: 0.8,
    tags: ['family', 'money'],
    cond: (s, h) => h.wealthQ() <= 3 && (h.siblings() >= 1 || !h.incomeAtLeast('UM')),
    text: (s, h) => '你身上的衣服是兄姊或表親穿過的，袖口縫過兩次，膝蓋補得很整齊。新衣只在過年才有，所以你格外愛惜，連洗都捨不得用力搓，晾衣服時還要特地挑最好的位置。',
    effects: { happiness: +1, wealth: -1 },
  },
  {
    id: 'childhood_name_story',
    title: '名字的由來',
    ages: [5, 10],
    weight: 0.8,
    tags: ['family', 'identity'],
    text: (s, h) => `你問大人：「為什麼我叫${h.givenName()}？」他們愣了一下，說起你出生那天的天氣、是誰先想到這個名字，還有一些你聽不太懂的期待。你把那個故事偷偷收好了。`,
    effects: { happiness: +2, social: +2 },
  },
  {
    id: 'childhood_errand',
    title: '跑腿',
    ages: [6, 11],
    weight: 0.9,
    tags: ['childhood', 'money'],
    text: (s, h) => `大人派你去雜貨店買${h.isRegion('EAS', 'SEA') ? '醬油' : '麵包和牛奶'}，還交代找回的零錢要數清楚。你一路把硬幣在口袋裡握得發熱，回來報告「剩兩塊」時，大人笑了，說你比店老闆還會算，然後把那兩塊錢又放回你手心。`,
    effects: { knowledge: +1, social: +1, happiness: +1 },
  },
  {
    id: 'childhood_visit_city',
    title: '第一次進城',
    ages: [5, 12],
    weight: 0.8,
    tags: ['childhood', 'rural'],
    cond: (s, h) => !h.urban(),
    text: (s, h) => '大人帶你去了趟城裡。你第一次搭上電扶梯，第一次看見這麼多車同時按喇叭。回程你靠在窗邊，嘴裡還含著街上買的糖，一路沒說話。',
    effects: { knowledge: +2, happiness: +3, social: +1 },
  },
  {
    id: 'childhood_cousin_summer',
    title: '暑假的親戚家',
    ages: [5, 12],
    weight: 0.8,
    tags: ['family', 'childhood'],
    text: (s, h) => `暑假你被送到${h.urban() ? '鄉下' : '城裡'}的親戚家住了一個月。你學會了新遊戲、新方言，也學會了在陌生的床上想家，想著想著就睡著了，隔天醒來，窗外有陌生的雞啼，卻不再那麼陌生。`,
    effects: { knowledge: +2, social: +2, happiness: +2 },
  },
  {
    id: 'childhood_sleepover',
    title: '第一次在朋友家過夜',
    ages: [7, 12],
    weight: 0.8,
    tags: ['friends', 'childhood'],
    cond: (s, h) => h.incomeAtLeast('UM'),
    text: (s, h) => '你第一次在朋友家過夜，用手電筒互相講鬼故事，講到兩個人都不敢去上廁所。最後你們手牽手去，在走廊上走得像兩個機器人，回來時才發現對方的爸爸一直站在門口，忍著笑。',
    effects: { social: +3, happiness: +3 },
  },
  {
    id: 'childhood_storm_night',
    title: '停電的夜',
    ages: [3, 9],
    weight: 0.6,
    tags: ['family', 'childhood'],
    text: (s, h) => '一個夜裡，狂風把窗戶吹得啪啪作響，接著停了電。大人們點起蠟燭，說笑話假裝不害怕，你卻從他們握得發白的手看出了什麼，於是你裝作毫不在意地搖了搖手上的小燈，逗他們笑。',
    effects: { happiness: -1, social: +2 },
  },

  // =====================================================================================
  // 學齡兒童 6-12：教室、操場與家
  // =====================================================================================
  {
    id: 'childhood_classroom',
    title: '教室裡的風景',
    ages: [6, 9],
    weight: 0.9,
    tags: ['school'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => h.byIncome({
      L: '教室裡擠著六十個孩子，三個人共用一張長桌。大家呵著白氣背乘法表，背得整齊劃一，連窗外的雞都安靜了，只有老師的粉筆在黑板上沙沙響。',
      LM: '黑板上的粉筆字擦了又寫，老師手上沾滿白灰。你練就了在擁擠吵鬧的教室裡也能專心聽講的本事，下課鐘一響，卻比誰都先衝出教室。',
      UM: '教室牆上貼滿了孩子們的畫，風扇轉得吱嘎響。你坐在窗邊看雲，被老師點名時嚇了一大跳，鉛筆從手裡滾出去，一路滾到講台前，全班都笑了。',
      H: '教室裡有彩色地毯和一整面書牆。老師不太要你們安靜坐好，反而要你們分組吵吵鬧鬧地做實驗，吵到最後，每個人都比誰都想知道答案。',
    }),
    effects: { knowledge: +2, social: +1 },
  },
  {
    id: 'childhood_school_lunch',
    title: '午餐時間',
    ages: [6, 12],
    weight: 0.9,
    tags: ['school', 'food'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => h.byIncome({
      L: '學校的供餐計畫每天發一碗熱騰騰的粥和豆子。有些孩子為了這一碗，每天走很遠的路來上學，你是其中一個，每天碗一空，就會把最後一粒豆子也撈乾淨。',
      LM: '便當盒在蒸飯箱裡熱了一整個早上，打開時整間教室都是飯菜香。有人只有一點主食配醬菜，也有人主動跟他換著吃，換來換去，整張桌子的菜竟然越吃越豐盛。',
      UM: '食堂的隊伍排到走廊，你練就了三分鐘吃完一份午餐的本事，剩下的時間全拿來玩，球場上的歡呼聲，總是比午休鈴聲更早響起，成了你整個中午最期待的時刻。',
      H: '營養午餐有蔬菜也有水果。你把青椒偷偷夾給隔壁同學，被老師當場逮到，全班都笑了，連那個青椒的主人也笑到嗆到，午餐剩下的時間，大家都在等你下次表演。',
    }),
    effects: (s, h) => {
      h.change('health', h.byIncome({ L: +3, LM: +2, UM: +1, H: +1 }));
      h.change('happiness', +1);
    },
  },
  {
    id: 'childhood_walk_to_school',
    title: '上學的路',
    ages: [6, 12],
    weight: 0.9,
    tags: ['school', 'regional'],
    cond: (s, h) => h.inSchool() && (!h.urban() || !h.incomeAtLeast('UM')),
    text: (s, h) => (!h.urban()
      ? '去學校要走一個多小時，要穿過田埂和一條小溪。你和幾個同伴邊走邊玩，遇到下雨就把書包頂在頭上，到校時鞋子已經濕透，你坐在教室裡偷偷把腳趴在桌腳下晾乾，一整個早上都在聞泥土的味道。'
      : '你和同學擠上人滿為患的小巴，書包被擠到胸前，車窗外的街景一閃而過。每天早晨的車程，是你偷偷補眠的時間，頭靠著車窗，隨著路面一下一下地點著。'),
    effects: { health: +1, social: +2, happiness: +1 },
  },
  {
    id: 'childhood_teacher_fav',
    title: '那位老師',
    ages: [6, 12],
    tags: ['school', 'mentor'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => h.byIncome({
      L: '放學前，老師把你留下來，借給你一本破舊卻乾淨的書，說：「你看得懂的。」那是你第一次覺得有人相信你，回家的路上，你把那本書抱在懷裡，像抱著一塊會發熱的石頭。',
      LM: '老師在你的作業簿上寫了一行小字：「這個想法很特別。」你把那一頁折起來，帶回家給大人看了三次，大人看不懂，卻笑得像看懂了一樣。',
      UM: '老師在全班面前讀了你寫的作文。你的耳朵紅到快冒煙，卻一直忘不了那幾分鐘教室裡的安靜，後來你下課都把那篇作文偷偷多讀了兩遍。',
      H: '老師發現你對星星特別著迷，特地帶了望遠鏡來。那天傍晚，你在操場上第一次看見土星的環，一時之間忘了說話，只是抬頭看著那一圈小小的光。',
    }),
    effects: { knowledge: +3, happiness: +2 },
  },
  {
    id: 'childhood_report_card',
    title: '成績單',
    ages: [7, 12],
    weight: 0.9,
    tags: ['school'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '期末拿到成績單，你看著上面的數字，不知該笑還是該擔心。大人的反應比你預期的溫和，只問了一句：「你自己覺得呢？」你抓著頭想了很久，說：「我覺得，下次可以更好。」',
    effects: { knowledge: +2, happiness: +1 },
  },
  {
    id: 'childhood_sports_day',
    title: '運動會',
    ages: [7, 12],
    weight: 0.9,
    tags: ['school', 'friends'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '運動會上你參加了大隊接力，交棒時差點把棒子掉在地上，最後一棒的同學硬是追回兩個人。你們沒拿第一，抱在一起大叫的樣子，你記了很久。',
    effects: { happiness: +3, social: +3, health: +1 },
  },
  {
    id: 'childhood_school_play',
    title: '一棵樹',
    ages: [7, 12],
    weight: 0.7,
    tags: ['school', 'fun'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '學校辦了表演，你被分配演一棵樹：站在舞台邊一動不動，台詞只有一句「沙沙」。你卻緊張得滿頭大汗，演完還是被大力稱讚，有人說那是全場最穩的一棵樹，你的臉紅得像熟透的蘋果。',
    effects: { social: +2, happiness: +2, knowledge: +1 },
  },
  {
    id: 'childhood_book_love',
    title: '第一本愛不釋手的書',
    ages: [5, 12],
    weight: (s, h) => (h.inSchool() ? 1 : 0.4),
    tags: ['school', 'books'],
    text: (s, h) => h.byIncome({
      L: '學校的書櫃只有一小格，其中一本被翻得捲了邊。你借回家，在微弱的燈光下一頁頁讀完，隔天又重讀了一遍，連裡面的插圖都能背出來。',
      LM: `流動圖書車每週停在${h.urban() ? '社區廣場' : '村口'}一次，你總是第一個排隊，一次借滿規定的三本，借了就像抱著寶物一樣走回家，路上連石子都捨不得踢，怕書被灰塵碰髒。`,
      UM: '你在圖書館角落發現了一整套冒險故事，館員阿姨會偷偷幫你留最新的一冊。借書證蓋滿了章，你的鞋底也被磨薄了一層，卻一點都不覺得累。',
      H: '睡前故事變成了你自己捧著書讀。大人喊你關燈，你就躲進被子，用手電筒偷看下一頁，有時看到天快亮，眼皮卻比故事還重，書就這樣蓋在臉上睡著了。',
    }),
    effects: { knowledge: +4, happiness: +2 },
  },
  {
    id: 'childhood_hideout',
    title: '秘密基地',
    ages: [6, 11],
    weight: 0.8,
    tags: ['friends', 'play'],
    text: (s, h) => '你和幾個同伴找到一個秘密基地：廢棄的水塔、倒下的大樹，或是巷尾的紙箱堆。你們訂下規矩、取了暗號，還發誓永遠不告訴大人，並用石頭在牆上刻了一個只有你們看得懂的符號。',
    effects: { happiness: +3, social: +3 },
  },
  {
    id: 'childhood_street_games',
    title: '放學後的空地',
    ages: [6, 12],
    weight: 0.9,
    tags: ['friends', 'play'],
    text: (s, h) => {
      if (h.region() === 'EAS') return '橡皮筋、跳房子和彈珠，是放學後最有價值的貨幣。你輸掉一條橡皮筋，卻贏回一整個傍晚，跳到腳底發燙，還捨不得停，直到天色全黑，才被叫回家吃飯。';
      if (h.region() === 'SAS') return '放學後的空地上，風箏在天空打轉，彈珠與板球輪流登場。你輸掉一顆彈珠，卻贏回一整個傍晚，回家時膝蓋上都是泥，笑聲一路灑到巷口。';
      return '一顆洩了氣的足球，兩雙鞋當球門。你們為了誰犯規吵到天黑，最後約好明天再戰，隔天卻誰也沒提起，一到傍晚又全都出現在空地上，彷彿什麼都沒發生過。';
    },
    effects: { happiness: +3, social: +3, health: +1 },
  },
  {
    id: 'childhood_first_period',
    title: '月事來了',
    ages: [11, 13],
    tags: ['body', 'growing'],
    cond: (s, h) => h.female(),
    text: (s, h) => h.byIncome({
      L: '你第一次來月事，嚇了一大跳。是家裡的女性長輩悄悄教你怎麼做，還用乾淨的布替你縫了一條。這幾天你不太敢去學校，也不知道該怎麼告訴任何人，直到她輕輕拍拍你的肩。',
      LM: '你第一次來月事，慌了好一陣。一位年長的女性把你拉到一旁說明，語氣平靜得像在談天氣。你鬆了一口氣，原來這件事，不是只有你一個人經歷過。',
      UM: '你在學校廁所裡慌了一陣，最後是保健室阿姨給你需要的東西，還說「這很正常」，你的臉卻紅到了耳根，回家路上走得特別慢，生怕被誰發現似的。',
      H: '你第一次來月事，大人沒有大驚小怪，只是遞給你一個小包包，說：「你長大了。」晚上還特地煮了熱湯，湯裡漂著幾顆紅棗，喝完你覺得全身都暖了。',
    }),
    effects: (s, h) => {
      h.change('happiness', -2);
      h.change('knowledge', h.income() === 'L' ? 0 : +1);
    },
  },
  {
    id: 'childhood_hunger_month',
    title: '月底',
    ages: [4, 12],
    weight: 0.8,
    tags: ['money', 'family', 'hardship'],
    cond: (s, h) => h.wealthQ() <= 2 && !h.incomeAtLeast('H'),
    text: (s, h) => h.byIncome({
      L: '收成還沒到，家裡的糧袋見了底。大人把最後一把穀物熬成稀粥，自己只喝湯。隔壁鄰居悄悄遞來一把豆子，什麼也沒說，只把門簾輕輕放下。那晚的粥很稀，但你們吃得很慢，很珍惜。',
      LM: '月底錢不夠，餐桌上只剩一碗主食配鹽。你注意到大人說「我吃飽了」的時候，把碗放得特別輕。你也學著把碗放得輕輕的，慢慢吃完，沒有說要再添一碗。',
      UM: '月底的帳單堆在桌上，晚餐從三道菜變成一道。你什麼也沒問，只是把最後一塊肉夾給了身邊的人，說自己不太餓，聲音輕得像怕被聽穿。',
    }),
    effects: { health: -3, happiness: -2, social: +1 },
  },
  {
    id: 'childhood_parent_abroad',
    title: '遠方的家人',
    ages: [4, 12],
    weight: 0.9,
    tags: ['family', 'migration', 'regional'],
    cond: (s, h) => !h.incomeAtLeast('H') && h.isRegion('SEA', 'SAS', 'LAC', 'SSA', 'CAS', 'MENA', 'EAS') && h.wealthQ() <= 3 && h.parentsAlive() > 0,
    text: (s, h) => {
      const who = h.parentAlive('mother') && (h.isRegion('SEA', 'SAS') || !h.parentAlive('father')) ? '媽媽' : h.parentAlive('father') ? '爸爸' : '媽媽';
      if (h.year() < 2000) return `${who}到很遠的地方工作，一年才回來一兩次。你靠著信封裡的照片和匯款單記得他的樣子，有時覺得他像一位很好的親戚。他回來的那幾天，你繞著他轉，捨不得睡。`;
      if (h.year() < 2013) return `${who}在國外工作。電話卡一張張用完，你握著話筒不知道該說什麼，每次都只說：「我很好。」`;
      return `${who}在國外工作。每個週末你在螢幕裡看見他的臉，他總問你有沒有好好吃飯。有時網路卡住，你就對著那張凍結的臉笑，直到畫面又動起來，兩個人一起笑出聲。`;
    },
    effects: { happiness: -3, social: -2, wealth: +2 },
    set: ['c_parent_away'],
  },
  {
    id: 'childhood_swim',
    title: '學游泳',
    ages: [5, 12],
    weight: 0.7,
    tags: ['play', 'body'],
    text: (s, h) => (h.incomeAtLeast('UM') && h.urban()
      ? '泳池裡，教練要你把臉埋進水裡吹泡泡。上了三次課你還是不敢放開浮板，到了第六次，你忽然發現自己已經划出好幾公尺了，教練在岸邊拍手，水花濺了你一臉。'
      : '雨季過後河水變得溫和，大人帶著你和同伴在淺灘學游泳。你嗆了好幾口水，最後終於自己漂了起來，岸上的大人大喊你的名字，那一刻水好像變得很輕，輕得像在托著你。'),
    effects: { health: +2, happiness: +3, knowledge: +1 },
  },
  {
    id: 'childhood_first_light',
    title: '亮起來的夜',
    ages: [3, 10],
    weight: 0.9,
    tags: ['regional', 'tech'],
    cond: (s, h) => !h.urban() && (h.income() === 'L' || h.income() === 'LM') && h.wealthQ() <= 3,
    text: (s, h) => (h.year() < 2005
      ? '村裡終於通了電。傍晚，一顆裸燈泡在屋樑下亮起，全家人站在下面仰頭看了很久。大人說：「以後晚上也能寫字了。」那晚你寫了好多好多字，寫到眼皮打架，還捨不得關燈。'
      : '家裡裝了一片小小的太陽能板。晚上亮起一盞燈，還能替手機充電。你的功課可以寫到很晚，也不必再被煤煙嗆得咳嗽。夜裡，窗外一片黑，你家的窗卻亮著，你覺得自己像一顆小小的星星。'),
    effects: { knowledge: +2, happiness: +3, health: +1 },
  },
  {
    id: 'childhood_home_language',
    title: '家裡的語言',
    ages: [4, 8],
    weight: (s, h) => (h.isMigrant() ? 2 : h.isRegion('EUR', 'NAM', 'OCE') ? 0.4 : 0),
    tags: ['family', 'identity', 'migration'],
    cond: (s, h) => h.isMigrant() || h.isRegion('EUR', 'NAM', 'OCE'),
    text: (s, h) => '在家裡，大人用一種語言說話、唱歌、罵人，出了家門，大家說的卻是另一種。你學會了在門檻上換頻道，有時還會說錯，惹得兩邊都笑。',
    effects: { knowledge: +2, social: +1 },
    set: ['c_bilingual_home'],
  },

  // =====================================================================================
  // 童年的抉擇（major）
  // =====================================================================================
  {
    id: 'childhood_stray_dog',
    title: '跟著你回家的小狗',
    ages: [5, 11],
    major: true,
    weight: 0.9,
    tags: ['childhood', 'animals', 'chain'],
    text: (s, h) => '放學的路上，一隻瘦巴巴的小狗一直跟在你腳邊。你停牠也停，你走牠也走，眼睛亮亮地望著你。走到家門口，牠仍然沒有離開，坐在門口的石階上，尾巴一下一下掃著地面。',
    choices: [
      {
        label: '偷偷藏起來餵牠',
        effects: (s, h) => { h.change('happiness', +3); h.change('wealth', -1); if (h.chance(0.3)) h.set('c_dog_lost'); },
        set: ['c_dog_hidden'],
        result: '你每天把便當裡的肉留一半，藏到後院的紙箱裡。三天後被發現，大人板著臉，嘴角卻在偷偷往上彎。',
        schedule: [{ id: 'childhood_dog_later', inYears: [2, 4] }],
        ai: 1.5,
      },
      {
        label: '央求大人讓你養',
        effects: (s, h) => { h.change('happiness', +2); h.change('social', +1); if (h.chance(0.25)) h.set('c_dog_lost'); },
        set: ['c_dog_kept'],
        result: '你連著三天在飯桌上提起這件事。第四天，大人嘆了口氣：「好吧，但你要自己負責。」你高興得把整碗飯都吃光了。',
        schedule: [{ id: 'childhood_dog_later', inYears: [2, 4] }],
        ai: (s, h) => (h.incomeAtLeast('UM') ? 2 : 1.3),
      },
      {
        label: '摸摸牠，然後走進家門',
        effects: { happiness: -2, knowledge: +1 },
        result: '你在門口蹲了一會兒，摸摸牠的頭，轉身進了屋。晚上你聽見外面有細小的叫聲，隔天一早，牠不見了。',
        ai: (s, h) => (h.isPoor() ? 1 : 0.5),
      },
    ],
  },
  {
    id: 'childhood_found_wallet',
    title: '路邊的錢包',
    ages: [7, 12],
    major: true,
    weight: 0.8,
    tags: ['childhood', 'ethics', 'chain'],
    text: (s, h) => '水溝邊躺著一個鼓鼓的小錢包。你打開看了一眼，裡面有一疊錢和一張全家福照片。四周看不到任何人，風吹過來，照片的一角輕輕翹起。',
    choices: [
      {
        label: '送到老師或派出所那裡',
        effects: { happiness: +1, social: +2, knowledge: +1 },
        set: ['c_returned_wallet'],
        result: '老師接過錢包，摸了摸你的頭。你空著手走回家，心卻比平常輕了好多。',
        schedule: [{ id: 'childhood_wallet_echo', inYears: [1, 3] }],
        ai: (s, h) => (h.isPoor() ? 1.2 : 1.6 + h.stat('social') / 100),
      },
      {
        label: '留在原地，等失主回來',
        effects: { social: +2, knowledge: +1, happiness: +1 },
        set: ['c_returned_wallet'],
        result: '你站了快一個小時。一位氣喘吁吁的伯伯跑回來，抱著錢包，眼眶都紅了。他硬要抽一張給你，你推了又推。',
        schedule: [{ id: 'childhood_wallet_echo', inYears: [1, 3] }],
        ai: 1,
      },
      {
        label: '悄悄放進口袋',
        effects: { wealth: +3, happiness: +2, social: -1 },
        set: ['c_kept_wallet'],
        result: '你用那些錢買了好幾天的零食，很甜。只是每次吃到最後一口，那張全家福就從腦子裡浮上來。',
        schedule: [{ id: 'childhood_wallet_echo', inYears: [1, 3] }],
        ai: (s, h) => (h.isPoor() ? 1.6 : 0.4),
      },
    ],
  },
  {
    id: 'childhood_broken_window',
    title: '破掉的窗玻璃',
    ages: [4, 9],
    major: true,
    weight: 0.9,
    tags: ['childhood', 'ethics', 'chain'],
    text: (s, h) => '你在巷子裡踢球，「砰」的一聲，球砸破了鄰居家的窗玻璃，整條巷子都靜了。你的腳像黏在地上，屋裡有腳步聲正走向門口，窗框上還掛著幾片搖搖欲墜的玻璃。',
    choices: [
      {
        label: '站出來，說是你',
        effects: { happiness: -2, social: +1, knowledge: +1 },
        set: ['c_confessed'],
        result: '你紅著臉說：「是我。」鄰居愣了一下，嘆口氣，叮嚀你下次小心。你回家被罰掃了一星期的地，但沒人再提這件事。',
        schedule: [{ id: 'childhood_blame_echo', inYears: [1, 3] }],
        ai: 2,
      },
      {
        label: '拔腿就跑',
        effects: { happiness: -1, social: -1 },
        set: ['c_ran_away'],
        result: '你跑回家躲進被子，心跳得像打鼓。晚飯時大人說鄰居的窗被砸了，你把飯扒進嘴裡，什麼味道也嚐不出來。',
        schedule: [{ id: 'childhood_blame_echo', inYears: [1, 3] }],
        ai: 1.2,
      },
      {
        label: '說是兄姊或弟妹做的',
        cond: (s, h) => h.siblings() >= 1,
        effects: { happiness: -3, social: -3 },
        set: ['c_blamed_sibling'],
        result: '挨罵的是你的手足。他看了你一眼，什麼也沒說。那天晚上，他翻身面向了牆壁。',
        schedule: [{ id: 'childhood_blame_echo', inYears: [1, 3] }],
        ai: 0.4,
      },
    ],
  },
  {
    id: 'childhood_fee_day',
    title: '被點名的那天',
    ages: [7, 12],
    major: true,
    weight: 3,
    tags: ['school', 'money', 'hardship', 'chain'],
    cond: (s, h) => h.inSchool() && h.wealthQ() <= 3 && !h.incomeAtLeast('H') && (h.income() !== 'UM' || h.wealthQ() <= 2),
    text: (s, h) => '導師拿著名單點名：「還沒繳費的同學，站起來。」教室一片安靜。你的名字在名單上，大腿發麻，不知道該站，還是不站，連鉛筆在手裡都握不穩了。',
    choices: [
      {
        label: '站起來，說家裡正在籌錢',
        effects: { happiness: -2, social: -1, knowledge: +1 },
        set: ['c_fee_honest'],
        result: '你的聲音有點抖。老師沉默了一下，說：「先坐下，我來想辦法。」放學後她把你叫到辦公室，問了幾個問題，筆記本寫得很滿。',
        schedule: [{ id: 'childhood_teacher_visit', inYears: [0, 1] }],
        ai: 1.5,
      },
      {
        label: '躲幾天不去上學',
        effects: { happiness: -3, knowledge: -3 },
        set: ['c_skip_fee_days'],
        result: '你背著書包出門，卻坐在路邊發呆到放學時間。第三天，同學跑來敲你家的門，問你怎麼了。',
        schedule: [{ id: 'childhood_teacher_visit', inYears: [0, 1] }],
        ai: (s, h) => (h.stat('knowledge') > 15 ? 0.7 : 1.3),
      },
      {
        label: '放學後去打零工湊錢',
        cond: (s, h) => h.age() >= 8,
        effects: { wealth: +2, health: -2, knowledge: -1 },
        set: ['c_worked_for_fees'],
        result: '你在市場幫人搬貨、洗菜，兩個禮拜後湊到了一半。老闆多給了你一個饅頭，說：「長身體的時候，要吃。」',
        schedule: [{ id: 'childhood_teacher_visit', inYears: [0, 1] }],
        ai: (s, h) => (h.stat('health') > 55 ? 1.3 : 0.6),
      },
    ],
  },
  {
    id: 'childhood_new_baby',
    title: '家裡多了一個小嬰兒',
    ages: [2, 8],
    major: true,
    weight: 0.9,
    tags: ['family', 'childhood', 'chain'],
    cond: (s, h) => h.siblings() >= 1 && h.parentsAlive() >= 1,
    text: (s, h) => '家裡來了一個皺巴巴的小嬰兒，所有人都圍著他轉。你站在人群外面，手裡的玩具忽然變得不好玩了。你低頭盯著腳尖，覺得自己好像一下子變成了客人。',
    choices: [
      {
        label: '主動當小幫手',
        effects: { social: +3, happiness: +2, knowledge: +1 },
        set: ['c_sibling_helper'],
        result: '你搬來小凳子站在搖籃邊，負責「看著他」。他抓住你的手指時，你覺得自己是全世界最重要的人。',
        schedule: [{ id: 'childhood_sibling_bond', inYears: [3, 6] }],
        ai: 2,
      },
      {
        label: '鬧彆扭，要大家看你',
        effects: { happiness: -2, social: -1 },
        set: ['c_sibling_jealous'],
        result: '你故意打翻了牛奶，大聲說自己也要抱抱。大人無奈地把你一把抱起，你在他肩上哭得稀里嘩啦，哭完卻覺得好多了。',
        schedule: [{ id: 'childhood_sibling_bond', inYears: [3, 6] }],
        ai: 1,
      },
      {
        label: '假裝不在意，自己玩',
        effects: { happiness: -1, knowledge: +1 },
        result: '你在角落蓋了一座積木城堡，不理任何人。有人悄悄蹲下來問你城堡裡住了誰，你這才開口，說了一整個下午。',
        schedule: [{ id: 'childhood_sibling_bond', inYears: [3, 6] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_parents_quarrel',
    title: '隔著牆的爭吵',
    ages: [4, 12],
    major: true,
    weight: 0.8,
    tags: ['family', 'childhood', 'chain'],
    cond: (s, h) => h.parentsAlive() === 2,
    text: (s, h) => '深夜，隔著薄薄的牆，你聽見大人壓低的爭吵，偶爾有東西被重重放下的聲音。你睜著眼睛，聽不清內容，卻聽得出那份憤怒，每一個停頓都讓你的心跳漏一拍。',
    choices: [
      {
        label: '走出房間，抱住他們',
        effects: (s, h) => { h.change('happiness', -1); h.change('social', +2); rollSplit(h); },
        set: ['c_peace_maker'],
        result: '你光著腳站在門口，什麼也沒說。爭吵停了。他們同時蹲下來抱住你，那一刻你覺得自己像是兩人之間的一座橋。',
        schedule: [{ id: 'childhood_parents_talk', inYears: [1, 3] }],
        ai: 1,
      },
      {
        label: '把棉被蒙在頭上，假裝睡著',
        effects: (s, h) => { h.change('happiness', -3); h.change('health', -1); rollSplit(h); },
        set: ['c_hid_quarrel'],
        result: '你把棉被拉過頭頂，數羊數到一百二十一隻。隔天早餐桌上，兩個人都假裝什麼事也沒有，你也是。',
        schedule: [{ id: 'childhood_parents_talk', inYears: [1, 3] }],
        ai: 1.5,
      },
      {
        label: '抱著枕頭去找鄰居或長輩',
        effects: (s, h) => { h.change('social', +2); h.change('happiness', -1); rollSplit(h); },
        result: '你抱著枕頭敲開隔壁的門。對方沒有多問，只是替你鋪好床，煮了一碗熱湯，說：「今天在這裡睡。」',
        schedule: [{ id: 'childhood_parents_talk', inYears: [1, 3] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_talent',
    title: '老師看見了你的天分',
    ages: [6, 12],
    major: true,
    weight: 0.8,
    tags: ['school', 'talent', 'chain'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => {
      const t = talentOf(s);
      return `${t.who}看你${t.verb}的樣子，停下來看了很久，說：「你很有天分。」他問你願不願意每天多練一個小時，那代表更少的玩耍時間，也可能更少幫忙家裡的時間。`;
    },
    choices: [
      {
        label: '加入社團，認真練習',
        effects: { happiness: +2, knowledge: +1, health: +1, social: +2 },
        set: ['c_talent_path'],
        result: (s, h) => `你每天放學多留一個小時，手掌磨出了繭，失敗的次數比成功的多。但某天你發現，${talentOf(s).done}。`,
        schedule: [{ id: 'youth_talent_audition', inYears: [3, 6] }],
        ai: (s, h) => (h.wealthQ() <= 2 ? 1.2 : 2),
      },
      {
        label: '偶爾玩玩，不當一回事',
        effects: { happiness: +2 },
        result: '你把它當成放學後的樂子，不特別練也不放棄。偶爾被誇，偶爾被忘記，這樣的距離讓你覺得剛剛好。',
        ai: 1.5,
      },
      {
        label: '算了，家裡更需要我',
        cond: (s, h) => h.wealthQ() <= 3,
        effects: { wealth: +1, happiness: -3 },
        result: '你搖搖頭，說自己沒空。老師沒再勸，只是把那張報名表壓在你的桌角，過了很久才收走。',
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.3),
      },
    ],
  },
  {
    id: 'childhood_cheat_test',
    title: '最後一題',
    ages: [8, 12],
    major: true,
    weight: 0.8,
    tags: ['school', 'ethics', 'chain'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '期末考的最後一題你不會。隔壁同學的答案紙就攤在手肘旁，字寫得又大又清楚，老師正低頭批改別的東西，筆尖沙沙作響。時鐘滴答，離收卷只剩五分鐘。',
    choices: [
      {
        label: '偷看一眼，抄下來',
        effects: { knowledge: -1, happiness: -1 },
        set: ['c_copied'],
        result: '你抄完交了卷，接下來整整一小時，你的心跳聲大到好像全教室都聽得見。',
        schedule: [{ id: 'childhood_cheat_echo', inYears: [0, 1] }],
        ai: (s, h) => (h.stat('knowledge') < 15 ? 1.1 : 0.5),
      },
      {
        label: '自己亂寫，交出去',
        effects: { knowledge: +1, happiness: -1 },
        result: '你把那題寫了一半就交了。分數不高，但那天晚上你睡了個踏實覺。',
        ai: 2,
      },
      {
        label: '考完後去問同學怎麼解',
        effects: { knowledge: +3, social: +2 },
        result: '放學後你拉著同學問，對方花了十分鐘畫給你看，你頓時覺得眼前的霧被吹散了。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'childhood_language_gap',
    title: '聽不太懂的課',
    ages: [6, 10],
    major: true,
    weight: (s, h) => (h.isMigrant() || h.has('c_bilingual_home') ? 4 : 2.5),
    tags: ['school', 'identity', 'chain'],
    cond: (s, h) => h.inSchool() && (h.isMigrant() || h.has('c_bilingual_home') || (!h.incomeAtLeast('H') && h.isRegion('SSA', 'SAS', 'SEA', 'LAC', 'CAS') && h.wealthQ() <= 4)),
    text: (s, h) => '老師上課用的語言，和你在家說的不太一樣。黑板上的字你認得一半，聽到的話你懂一半。每次被點名，教室就變成一片離你很遠的海。',
    choices: [
      {
        label: '鼓起勇氣，請老師再說一遍',
        effects: { knowledge: +2, happiness: -1, social: +1 },
        set: ['c_asked_help'],
        result: '你舉起手，聲音小得像蚊子。老師放慢速度，換了個說法，旁邊的同學還偷偷把答案寫在紙條上推給你。',
        schedule: [{ id: 'childhood_language_click', inYears: [1, 3] }],
        ai: 2,
      },
      {
        label: '默默抄寫，靠死背撐過去',
        effects: { knowledge: +1, happiness: -3 },
        result: '你把每個字像畫圖一樣抄下來，回家一筆一畫對照。累是累，但有一天你突然發現，自己看懂了一整段課文。',
        schedule: [{ id: 'childhood_language_click', inYears: [2, 4] }],
        ai: 1.5,
      },
      {
        label: '和說同樣話的同學抱成一團',
        effects: { social: +3, knowledge: -2 },
        result: '你找到了幾個和你說同一種話的同學，下課時像回到了家。只是上課時，你仍然像一個坐在窗外的旁觀者。',
        schedule: [{ id: 'childhood_language_click', inYears: [3, 5] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_gift_money',
    title: '手心裡的零用錢',
    ages: [5, 12],
    major: true,
    weight: 0.8,
    tags: ['money', 'family', 'chain'],
    text: (s, h) => '親戚塞給你一個信封，裡面是一小疊鈔票。你把它握在手心，握得手心都出汗了，因為這是你這輩子第一次，可以自己決定怎麼花的錢。你盯著它，好像在盯著一個等待命名的新生命。',
    choices: [
      {
        label: '放進存錢罐，存起來',
        effects: { wealth: +1, knowledge: +1 },
        set: ['c_saver'],
        result: '你把鈔票塞進餅乾罐，每晚睡前都搖一搖，聽那沙沙的聲音，像聽一個還沒長大的朋友說話。',
        schedule: [{ id: 'childhood_piggy_bank', inYears: [2, 4] }],
        ai: (s, h) => (h.isPoor() ? 1.5 : 1.2),
      },
      {
        label: '立刻跑去買糖和玩具',
        effects: { happiness: +4, wealth: -1 },
        result: '你一口氣買了冰、彈珠和一架塑膠小飛機。傍晚錢花光，只剩口袋裡的糖紙，你卻覺得這輩子沒這麼富有過。',
        ai: 1.2,
      },
      {
        label: '交給大人，說拿去買家裡需要的',
        cond: (s, h) => h.wealthQ() <= 3,
        effects: { wealth: +2, social: +2, happiness: +1 },
        result: '你把信封塞到大人手上，說：「幫家裡買米。」大人愣了一下，把信封推回你手裡一半，眼眶有點紅。',
        ai: (s, h) => (h.isPoor() ? 1.6 : 0.6),
      },
    ],
  },
  {
    id: 'childhood_friend_moves',
    title: '好朋友要搬走了',
    ages: [7, 12],
    major: true,
    weight: 0.8,
    tags: ['friends', 'chain'],
    cond: (s, h) => h.has('had_best_friend') || h.stat('social') > 55,
    text: (s, h) => '最要好的朋友告訴你，他們家要搬到很遠的地方了。你們並肩坐在樹下，很久很久，誰也不知道該說什麼，只有螞蟻從你們的腳邊爬過去，一隻接著一隻。',
    choices: [
      {
        label: '約好保持聯絡',
        effects: { social: +2, happiness: -1 },
        set: ['c_pen_pal'],
        result: (s, h) => (h.year() < 2000
          ? '你們交換了地址，用最漂亮的字寫在彼此的手心上，約好每個月都要寫信，誰先斷就是小狗。'
          : '你們交換了聯絡方式，約好每個週末都要聊天，誰先斷就是小狗。'),
        schedule: [{ id: 'childhood_friend_letter', inYears: [1, 3] }],
        ai: 2,
      },
      {
        label: '送他一份親手做的禮物',
        effects: { happiness: +1, social: +2, wealth: -1 },
        result: '你熬夜做了一個手環，他戴在手腕上，直到上車還一直舉著手向你揮。',
        schedule: [{ id: 'childhood_friend_letter', inYears: [1, 3] }],
        ai: 1.5,
      },
      {
        label: '假裝不在意，不去送行',
        effects: { happiness: -4, social: -2 },
        set: ['c_missed_goodbye'],
        result: '那天你躲到操場最遠的角落。車子開走很久以後你才慢慢走回去，眼睛是乾的，胸口卻悶得發痛。',
        schedule: [{ id: 'childhood_friend_letter', inYears: [2, 4] }],
        ai: (s, h) => (h.stat('social') < 40 ? 1 : 0.5),
      },
    ],
  },
  {
    id: 'childhood_after_primary',
    title: '小學畢業以後',
    ages: [11, 13],
    major: true,
    weight: 3,
    tags: ['school', 'family', 'hardship', 'chain'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 5 && h.eduYears() <= 7 && !h.incomeAtLeast('H') && h.wealthQ() <= 3,
    text: (s, h) => h.byIncome({
      L: '小學快畢業了。家裡開始談論下一步：念中學要走更遠的路，還有學費、制服和住宿，而你的手也能下田幫忙。大人看著你，沒有說話。',
      LM: '小學快畢業了。念中學要多一筆交通和制服的錢，而家裡正好缺人手。晚飯桌上沒有人提這件事，反而讓它更大聲，你一個人坐在門檻上，把鞋帶綁了又解，解了又綁。',
      UM: '小學快畢業了。家裡的收入一直不穩，讀下去的每一筆開銷，大人都在帳本上小心地圈了又圈，你偷看到了，也偷偷把自己的零食錢省了下來。',
    }),
    choices: [
      {
        label: '懇求繼續念書',
        effects: { happiness: -1, knowledge: +1 },
        set: ['c_begged_school'],
        result: '你說了你有多想念下去，說到後來聲音哽住。大人沉默很久，說：「我們再想想。」那晚你聽見他們在隔壁算帳算到很晚。',
        ai: 1.8,
      },
      {
        label: '請老師來跟家人談',
        effects: { social: +1, knowledge: +1 },
        set: ['c_teacher_helps'],
        result: '你把想念書的原因告訴了老師。隔週，老師帶著你的成績單登門拜訪，在昏暗的屋子裡跟大人談了很久。',
        schedule: [{ id: 'childhood_teacher_persuades', inYears: [0, 1] }],
        ai: 2,
      },
      {
        label: '接受安排，去幫忙家裡',
        effects: (s, h) => { h.change('wealth', +3); h.change('happiness', -3); h.change('knowledge', -2); h.dropOut(); },
        result: '你點點頭，把書包收進櫃子最深處。隔天，你跟著大人去工作，手磨出了泡，晚上卻領到第一份屬於自己的零用錢。',
        highlight: '小學畢業就離開了學校。',
        ai: (s, h) => (h.isPoor() ? 1.4 : 0.5),
      },
    ],
  },
  {
    id: 'childhood_night_school',
    title: '亮著燈的教室',
    ages: [10, 14],
    major: true,
    weight: 3,
    tags: ['school', 'work', 'hardship', 'chain'],
    cond: (s, h) => h.employed() && !h.inSchool(),
    text: (s, h) => '一位志工在你下工的路上叫住你，說鎮上開了夜間班，不收學費，教識字和算術。你累得眼皮打架，卻盯著那張傳單看了很久，連上面的標點符號都數了一遍。',
    choices: [
      {
        label: '下工後去上課',
        effects: (s, h) => { h.enroll('primary', { quiet: true }); h.change('knowledge', +4); h.change('health', -3); h.change('happiness', +1); },
        set: ['c_night_school'],
        result: '你拖著痠痛的腿走進教室，在最後一排坐下。第一次完整寫出自己的名字時，鉛筆芯斷了，你卻笑得說不出話。',
        schedule: [{ id: 'childhood_night_school_cert', inYears: [2, 3] }],
        ai: 2,
      },
      {
        label: '只想休息，不去了',
        effects: { health: +2, happiness: +1 },
        result: '你把傳單折成小方塊塞進口袋。晚上躺在床上，你偶爾會想起那間亮著燈的教室。',
        ai: 1,
      },
      {
        label: '去求老闆縮短工時',
        effects: (s, h) => {
          if (h.chance(0.5)) { h.enroll('primary', { quiet: true }); h.change('knowledge', +4); h.change('wealth', -1); h.set('c_night_school'); }
          else { h.change('happiness', -2); h.change('social', -1); }
        },
        result: (s, h) => (h.has('c_night_school')
          ? '老闆搔搔頭，答應每週讓你早收三天。你的工錢少了一些，卻多了三個晚上的光。'
          : '老闆笑了笑：「你去上課，誰來做這份工？」你默默回去幹活，但沒有把傳單丟掉。'),
        schedule: [{ id: 'childhood_night_school_cert', inYears: [2, 3] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_see_bully',
    title: '午休時看到的事',
    ages: [8, 12],
    major: true,
    weight: 0.9,
    tags: ['school', 'ethics', 'chain'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '午休時，你看見幾個同學圍著另一個孩子，把他的書包丟來丟去。他漲紅了臉，什麼也沒說。四周的人都在假裝沒看見，空氣忽然變得又黏又重。',
    choices: [
      {
        label: '走過去，叫他們住手',
        effects: { social: -1, happiness: +1, health: -1 },
        set: ['c_stood_up'],
        result: '你的聲音抖得連自己都聽得出來。那幾個人愣了一下，把書包還了。你的手心全是汗，被你幫的人默默撿起書包，輕輕說了一聲謝謝。',
        schedule: [{ id: 'childhood_bully_friend', inYears: [1, 3] }],
        ai: 1,
      },
      {
        label: '去找老師',
        effects: { happiness: +1, knowledge: +1 },
        result: '你跑去辦公室報告。老師一到，事情很快結束，那孩子一直低著頭，沒有看你。',
        schedule: [{ id: 'childhood_bully_friend', inYears: [1, 3] }],
        ai: 2,
      },
      {
        label: '轉身離開，假裝沒看見',
        effects: { happiness: -2, social: +1 },
        set: ['c_walked_away'],
        result: '你繞了遠路回教室。整個下午你盯著黑板，卻一個字也沒看進去，那個孩子的臉一直在眼前。',
        schedule: [{ id: 'childhood_bully_friend', inYears: [1, 3] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_dream_job',
    title: '長大以後想做什麼',
    ages: [6, 10],
    major: true,
    weight: 0.9,
    tags: ['school', 'identity', 'chain'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '老師要每個人上台說：長大以後想做什麼。前面的同學有人說要當太空人，有人說要當老闆。輪到你了，全班的眼睛一起看過來，你的腦袋瞬間一片空白，連原本想好的答案都不見了。',
    choices: [
      {
        label: '想當醫生或老師，幫助別人',
        effects: { knowledge: +2, happiness: +1 },
        set: ['c_dream_helper'],
        result: '同學們鼓了掌，你的臉紅了。你把這個答案放在心裡，像放一顆小小的種子。',
        schedule: [{ id: 'youth_dream_check', inYears: [6, 9] }],
        ai: 1.5,
      },
      {
        label: '想當科學家、運動員或藝術家',
        effects: { happiness: +2, knowledge: +1 },
        set: ['c_dream_star'],
        result: '「你想得太遠了！」有人笑你，老師卻在黑板上把你說的那個詞寫得大大的。',
        schedule: [{ id: 'youth_dream_check', inYears: [6, 9] }],
        ai: 1.5,
      },
      {
        label: '想像大人一樣，守著家裡的田或店',
        effects: { social: +2, happiness: +1 },
        set: ['c_dream_home'],
        result: '你說得很篤定。老師點點頭，沒有糾正你。你說完才發現，這個答案聽起來，比別人的都安穩。',
        schedule: [{ id: 'youth_dream_check', inYears: [6, 9] }],
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.8),
      },
    ],
  },
  {
    id: 'childhood_corner_boys',
    title: '街角的大哥哥',
    ages: [9, 12],
    major: true,
    weight: 3,
    tags: ['regional', 'safety', 'chain'],
    cond: (s, h) => (h.stats().homicide || 0) >= 7 && h.wealthQ() <= 4,
    text: (s, h) => '你家附近的街角總站著幾個大哥哥。其中一個叫住你，塞給你一些零用錢，要你把一個袋子送到隔壁街。他笑著說：「很簡單，沒事的。」',
    choices: [
      {
        label: '拿錢跑腿',
        effects: { wealth: +2, social: +1, happiness: +1 },
        set: ['c_corner_errand'],
        result: '你跑得飛快，回來時多了兩顆糖。你覺得自己有點像大人，也不太敢細想那個袋子裡到底裝了什麼。',
        schedule: [{ id: 'youth_gang_offer', inYears: [3, 5] }],
        ai: (s, h) => (h.isPoor() ? 1.4 : 0.5),
      },
      {
        label: '搖頭，繞路回家',
        effects: { social: -1, happiness: +1 },
        set: ['c_refused_corner'],
        result: '你說「我媽在等我」，然後走開。背後響起的笑聲讓你耳朵發燙，但沒有人追上來。',
        schedule: [{ id: 'youth_gang_offer', inYears: [3, 5] }],
        ai: 2,
      },
      {
        label: '告訴大人或老師',
        effects: { happiness: +1, social: +1 },
        set: ['c_told_adult'],
        result: '大人聽完臉色變了。那天以後你上學的路線改了，也多了一個人陪你走一段。你被叮嚀了很多話，其中最清楚的是「你做對了」。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'childhood_cram_school',
    title: '補習班的傳單',
    ages: [9, 12],
    major: true,
    weight: 2.5,
    tags: ['school', 'family', 'chain'],
    cond: (s, h) => h.inSchool() && h.isRegion('EAS', 'SAS', 'MENA', 'CAS', 'SEA') && h.incomeAtLeast('LM') && h.wealthQ() >= 2,
    text: (s, h) => '「你同學都有去補習。」大人這麼說的時候，眼睛看著很遠的地方，像在看一座你還沒爬上去的山。補習班的傳單，連同你的點心時間，一起被排進了行事曆。',
    choices: [
      {
        label: '乖乖去補習',
        effects: { knowledge: +4, happiness: -3, health: -1 },
        set: ['c_cram'],
        result: '每天晚上，你背著比身體還重的書包走進補習班。分數確實上去了，但你笑得越來越少。',
        schedule: [{ id: 'youth_cram_burnout', inYears: [3, 5] }],
        ai: (s, h) => (h.incomeAtLeast('UM') ? 1.8 : 1),
      },
      {
        label: '跟大人討價還價，只補一科',
        effects: { knowledge: +2, happiness: -1 },
        result: '你分析了自己的弱項，提出只補數學。大人驚訝地看著你，最後點了頭。這是你第一次靠自己的腦袋談判成功。',
        ai: 1.5,
      },
      {
        label: '堅持自己讀，把時間留給玩',
        effects: { knowledge: +1, happiness: +3, social: +2 },
        set: ['c_no_cram'],
        result: '你自己排了讀書表，也保留了放學後的一小時。成績沒有突飛猛進，但你睡得香，也笑得多。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'childhood_little_hustle',
    title: '第一次賺錢',
    ages: [9, 12],
    major: true,
    weight: 0.8,
    tags: ['money', 'work', 'childhood'],
    cond: (s, h) => !h.incomeAtLeast('H') && h.wealthQ() <= 4,
    text: (s, h) => (h.income() === 'UM'
      ? '校門口有同學靠賣自己做的手環賺零用錢，你也心癢癢的。你的筆袋裡有剪刀、線和一堆珠子，剩下的只是勇氣，你站在鏡子前練習吆喝了五遍，才敢出門。'
      : '市場裡賣菜的阿姨忙不過來，問你願不願意幫她看攤、吆喝，賣完給你幾個硬幣。她的手邊放著一籃還帶著露水的青菜，聞起來有泥土和清晨的味道。'),
    choices: [
      {
        label: '去幫忙，賺零用錢',
        effects: { wealth: +2, knowledge: +1, social: +1, health: -1 },
        result: '你扯著嗓子喊：「新鮮的，便宜賣！」一個下午喊到嗓子都啞了。賺的錢不多，你卻把硬幣一個個排在桌上，看了很久。',
        ai: 1.5,
      },
      {
        label: '把時間留給讀書或玩耍',
        effects: { knowledge: +1, happiness: +2 },
        result: '你笑著搖頭，繼續和朋友踢球。傍晚看到那些賺到零用錢的孩子在吃冰，嘴巴有點酸，但你沒有後悔。',
        ai: 1,
      },
      {
        label: '拉朋友一起做小生意',
        cond: (s, h) => h.stat('social') >= 40,
        effects: { wealth: +1, social: +3, knowledge: +2 },
        result: '你和兩個朋友分工：一個備貨，一個收錢，一個吆喝。賺到的錢分完還剩一點，你們買了一包洋芋片，慶祝這家「公司」成立。',
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_chore_share',
    title: '誰的名字不在輪值表上',
    ages: [7, 12],
    major: true,
    weight: 0.8,
    tags: ['family', 'fairness'],
    cond: (s, h) => h.siblings() >= 1 && h.parentsAlive() >= 1,
    text: (s, h) => (h.female() && h.isRegion('SAS', 'MENA', 'SSA', 'CAS', 'EAS') && !h.incomeAtLeast('H')
      ? '家務的分配好像總是不太公平：你在廚房、水邊忙進忙出，窗外院子裡玩球的歡呼聲，卻從來不是為你喊的。你把洗好的碗放進櫃子，忽然很想問為什麼，濕答答的手指在圍裙上擦了又擦。'
      : '家裡的家務越來越多，輪到你的那份總是做得最久。你看著手上的抹布，想著為什麼某些人的名字總是不在輪值表上，忽然覺得手上的水好冰，冰得有點委屈。'),
    choices: [
      {
        label: '直接問大人：這樣公平嗎',
        effects: { social: -1, happiness: +1, knowledge: +1 },
        result: '大人愣了一下，沒有生氣，也沒有馬上答應。但隔週，輪值表上多了幾個原本沒出現過的名字。',
        ai: 1.5,
      },
      {
        label: '默默做完',
        effects: { happiness: -2, health: -1 },
        result: '你把所有事做完，手指泡得皺皺的。沒有人注意到，你也沒說，但胸口那個小疙瘩一直沒有消。',
        ai: 1,
      },
      {
        label: '拉著手足把它變成比賽',
        effects: { happiness: +2, social: +3 },
        result: '你發明了「洗碗比賽」，輸的人要負責倒垃圾。原本的苦差事變成每晚最吵的時刻，連大人都忍不住站在旁邊看。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'childhood_shared_lunch',
    title: '一個人的午休',
    ages: [7, 12],
    major: true,
    weight: 0.8,
    tags: ['school', 'empathy'],
    cond: (s, h) => h.inSchool() && !h.incomeAtLeast('H'),
    text: (s, h) => '午餐時間，你發現隔壁座位的同學一直低頭翻書，沒有打開任何便當。他的肚子輕輕叫了一聲，他立刻把椅子往前挪，假裝是椅子發出的聲音。',
    choices: [
      {
        label: '假裝吃不完，分他一半',
        effects: { social: +3, happiness: +2, health: -1 },
        set: ['c_shared_lunch'],
        result: '你把盒子推到兩人中間，說自己吃不完。他沉默了一會兒，拿起了湯匙。從那天起，你們每天都「吃不完」。',
        ai: 2,
      },
      {
        label: '悄悄告訴老師',
        effects: { happiness: +1, knowledge: +1 },
        result: '老師點點頭，隔天私下安排了一份午餐。那孩子好幾天沒跟你說話，後來又自然地坐回你旁邊。',
        ai: 1.5,
      },
      {
        label: '假裝沒看見',
        effects: { happiness: -1 },
        result: '你低頭吃自己的飯，嚥下去的每一口都有點苦。',
        ai: 0.6,
      },
    ],
  },
  {
    id: 'childhood_lost_in_crowd',
    title: '走散了',
    ages: [4, 8],
    major: true,
    weight: 0.7,
    tags: ['childhood', 'safety'],
    text: (s, h) => (h.urban()
      ? '逛街的人潮像一堵牆。你彎腰撿掉在地上的東西，抬起頭時，大人已經不見了。四周全是陌生的腿和聲音，你的喉嚨緊緊的，連哭都忘了。'
      : '趕集的人潮像一堵牆。你彎腰撿掉在地上的東西，抬起頭時，大人已經不見了。四周全是陌生的腿和聲音，你的喉嚨緊緊的，連哭都忘了。'),
    choices: [
      {
        label: '站在原地等',
        effects: { happiness: -1, knowledge: +1 },
        result: '你抱著自己的外套，站在賣水果的攤子旁邊數螞蟻。十分鐘後，一雙熟悉的手把你整個舉了起來，你這才放聲大哭。',
        ai: 2,
      },
      {
        label: '向帶著孩子的大人求助',
        effects: { happiness: -1, knowledge: +2, social: +2 },
        result: '你鼓起勇氣，拉了拉一位帶著小孩的阿姨的衣角。她蹲下來問了你的名字和住處，牽著你的手，一起走到了廣播站。',
        ai: 1.5,
      },
      {
        label: '自己亂走，到處找',
        effects: { happiness: -3, health: -1 },
        result: '你越走越遠，直到不認得任何一條路。最後是一位賣菜的老婆婆發現了你，替你找到家人。回家後你被抱得很緊，緊到忘了挨罵。',
        ai: 0.7,
      },
    ],
  },
  {
    id: 'childhood_class_election',
    title: '班長選舉',
    ages: [8, 12],
    major: true,
    weight: 0.7,
    tags: ['school', 'social'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '班上要選班長，老師說：「想試試的人舉手。」你的手停在半空，卡在不上不下的位置，心跳像鼓，咚、咚、咚，你生怕全班都聽見了。',
    choices: [
      {
        label: '舉手參選',
        effects: (s, h) => {
          if (h.chance(h.stat('social') / 150 + 0.15)) { h.change('social', +4); h.change('knowledge', +1); h.set('c_class_leader'); }
          else { h.change('happiness', -2); h.change('social', +1); }
        },
        result: (s, h) => (h.has('c_class_leader')
          ? '開票時你的名字被畫了一個又一個正字。你站上講台說謝謝，聲音抖得不像自己，卻覺得自己突然變高了。'
          : '開票結果你輸了十幾票。你回座位時有點難為情，但後排有人悄悄對你比了一個大拇指。'),
        ai: (s, h) => (h.stat('social') > 55 ? 2 : 1),
      },
      {
        label: '推薦朋友，幫他加油',
        effects: { social: +3, happiness: +1 },
        result: '你推薦了好朋友，在台下賣力替他歡呼。他當選了，整天笑得嘴合不攏，你跟著開心了一整天。',
        ai: 1,
      },
      {
        label: '把手放下，當觀眾',
        effects: { happiness: -1 },
        result: '你悄悄把手收進口袋。後來看到當選的同學站在台上緊張得結巴，你想：好像也沒有那麼難。',
        ai: 1,
      },
    ],
  },
  {
    id: 'childhood_transfer_school',
    title: '新學校的第一天',
    ages: [7, 11],
    major: true,
    weight: 0.5,
    tags: ['school', 'social'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '家裡搬了家，你轉到新學校。老師說「大家歡迎新同學」，掌聲稀稀落落，三十多雙眼睛同時看向你，書包帶幾乎要被你捏斷了。窗外那棵你不認識的樹，忽然變成了教室裡唯一可以看的東西。',
    choices: [
      {
        label: '主動找人說話',
        effects: { social: +3, happiness: +1 },
        result: '你鼓起勇氣問隔壁的同學：「你的橡皮擦借我好嗎？」對方愣了一秒，然後笑著遞過來。你就這樣有了第一個新朋友。',
        ai: 1.5,
      },
      {
        label: '安靜觀察，慢慢融入',
        effects: { social: +1, knowledge: +1 },
        result: '你花了兩個星期默默觀察誰和誰要好、誰愛開玩笑。第三個星期，你自然而然地被邀請加入一場遊戲。',
        ai: 1.5,
      },
      {
        label: '下課躲在座位看書',
        effects: { social: -2, knowledge: +2, happiness: -2 },
        result: '你把頭埋進書裡，書頁翻得很快，一個字也沒讀進去。放學時有人喊「掰掰」，你才發現原來他在對你說。',
        ai: (s, h) => (h.stat('social') < 40 ? 1.4 : 0.6),
      },
    ],
  },

  // =====================================================================================
  // 後續事件（只由 schedule 觸發）
  // =====================================================================================
  {
    id: 'childhood_dog_later',
    title: '那隻狗',
    ages: [5, 16],
    weight: 0,
    tags: ['followup', 'animals'],
    text: (s, h) => (h.has('c_dog_lost')
      ? '那隻狗有一天沒有回來。你沿著巷子喊了好幾天牠的名字，後來才有人說在隔壁村看見過一隻很像的狗。你每次路過那裡，還是會多看一眼。'
      : '那隻小狗長成了壯碩的黃狗，每天傍晚準時蹲在路口等你放學。有一次有人想搶你的零用錢，牠一聲低吼就把對方嚇跑，從此整條街都認得牠。'),
    effects: (s, h) => {
      if (h.has('c_dog_lost')) { h.change('happiness', -3); h.change('social', +1); h.unset('c_dog_lost'); }
      else { h.change('happiness', +3); h.change('social', +3); }
    },
  },
  {
    id: 'childhood_wallet_echo',
    title: '錢包的後來',
    ages: [7, 16],
    weight: 0,
    tags: ['followup', 'ethics'],
    text: (s, h) => (h.has('c_kept_wallet')
      ? '路上看到失物招領的告示，你不自覺加快了腳步。那個錢包早就沒有了，那張全家福卻還是不時浮現，你這才明白有些東西不是用掉就會消失。'
      : '一年多以後，鄰居提起：「你就是那個把錢包送回去的孩子吧？」大家看你的眼神多了一點信任，連雜貨店老闆都讓你賒過一次帳，還說：「記在你名下就好，反正你一向可靠。」'),
    effects: (s, h) => {
      if (h.has('c_kept_wallet')) { h.change('happiness', -2); h.change('knowledge', +1); h.unset('c_kept_wallet'); }
      else { h.change('social', +3); h.change('happiness', +2); }
    },
  },
  {
    id: 'childhood_blame_echo',
    title: '那扇窗',
    ages: [5, 14],
    weight: 0,
    tags: ['followup', 'ethics'],
    text: (s, h) => {
      if (h.has('c_blamed_sibling')) return '手足終於在某個晚上問你：「那次其實是你吧？」你張了張嘴，最後說出真相，也說了對不起。對方沉默一會兒：「我早就知道。」你們一起笑了，笑完眼眶都有點紅。';
      if (h.has('c_ran_away')) return '每次經過那扇換了新玻璃的窗，你還是會心跳加快。有天鄰居對你點點頭，你才發現他早就知道了，只是從來沒有拆穿。';
      return '那位鄰居在路上遇到你，塞給你一顆糖，說：「你這孩子誠實，我記得。」那顆糖你捨不得吃，放了好幾天，糖紙在口袋裡被捏得沙沙響，你每次摸到它，心都跟著暖一下。';
    },
    effects: (s, h) => {
      if (h.has('c_blamed_sibling')) { h.change('happiness', +2); h.change('social', +3); }
      else if (h.has('c_ran_away')) { h.change('happiness', +1); h.change('knowledge', +1); }
      else { h.change('social', +3); h.change('happiness', +2); h.change('knowledge', +1); }
    },
  },
  {
    id: 'childhood_teacher_visit',
    title: '老師來家裡',
    ages: [7, 14],
    weight: 0,
    tags: ['followup', 'school', 'hardship'],
    text: (s, h) => {
      if (h.has('c_fee_honest')) return '老師真的想了辦法：替你申請了減免，還找到一位好心的資助人。她說：「你只要把書念好就行。」你把這句話記在心裡很久。';
      if (h.has('c_skip_fee_days')) return '老師親自走了半個小時的路到你家，坐在門檻上跟大人談了很久。你躲在門後偷聽，聽到「這孩子腦袋好」那句，眼眶忽然發熱。';
      return '老師來家裡拜訪，喝了一杯茶，什麼都沒多說。但隔週，你的名字從那張名單上消失了，你不知道是誰幫了你，只覺得心裡暖暖的。放學時，你多看了老師的背影好久。';
    },
    effects: (s, h) => {
      h.change('knowledge', +2);
      h.change('happiness', +3);
      if (h.has('c_fee_honest')) h.change('wealth', +2);
    },
  },
  {
    id: 'childhood_sibling_bond',
    title: '小的那一個',
    ages: [5, 14],
    weight: 0,
    tags: ['followup', 'family'],
    text: (s, h) => {
      if (h.has('c_sibling_helper')) return '年紀小的那個總追在你屁股後頭，連你去廁所都要跟。你嘴上嫌煩，卻在他被別的孩子欺負時，第一個衝了出去。';
      if (h.has('c_sibling_jealous')) return '你和小的那個吵過、打過、搶過玩具，也在同一條被子下偷笑過。有天他生病被送去親戚家，你才發現家裡沒有他，居然這麼安靜。';
      return '你教小的那個騎車、認字，發現教別人比自己學還難，也還要有趣。他第一次叫你的名字時，你假裝在忙，其實手一直在抖，轉過身才偷偷笑了出來。';
    },
    effects: { happiness: +3, social: +3 },
  },
  {
    id: 'childhood_parents_talk',
    title: '家裡的天氣',
    ages: [5, 15],
    weight: 0,
    tags: ['followup', 'family'],
    text: (s, h) => {
      if (h.parentsAlive() < 2) return '家裡少了一個人以後，剩下的人都學著把話說得溫柔一些。你偶爾會翻出舊照片來看，看著看著，話也變多了，連沉默都變得不那麼冷。';
      if (h.has('c_parents_split')) return '後來有一個大人搬了出去。你的家被分成兩個地方，行李袋成了你最熟悉的行李。大人說這不是你的錯，你聽了很多遍，也問了自己很多遍。';
      return '那陣子過去以後，家裡的空氣慢慢鬆開了。大人開始一起煮飯，偶爾還是拌嘴，但拌完嘴後，會把最後一塊肉夾給對方，兩個人還為此客氣得像初次見面。';
    },
    effects: (s, h) => {
      if (h.parentsAlive() >= 2 && h.has('c_parents_split')) { h.change('happiness', -4); h.change('social', -1); }
      else { h.change('happiness', +3); h.change('social', +1); }
    },
  },
  {
    id: 'childhood_cheat_echo',
    title: '走廊上的談話',
    ages: [8, 14],
    weight: 0,
    tags: ['followup', 'school', 'ethics'],
    text: (s, h) => '老師把你叫到走廊，輕聲說：「那題你的解法跟隔壁一模一樣，連錯的地方都一樣。」你的耳朵熱得發燙。她沒有罰你，只說：「下次不會，就說不會。」',
    effects: { happiness: -2, knowledge: +2 },
    unset: ['c_copied'],
  },
  {
    id: 'childhood_language_click',
    title: '忽然聽懂的那一天',
    ages: [7, 15],
    weight: 0,
    tags: ['followup', 'school', 'identity'],
    text: (s, h) => '某天，老師念到一個你從沒學過的詞，你居然猜出了它的意思，還把它用在作文裡。老師在旁邊寫了「進步很多」。那天回家的路上，你一直在心裡默念那個新詞。',
    effects: { knowledge: +3, happiness: +3, social: +1 },
  },
  {
    id: 'childhood_piggy_bank',
    title: '存錢罐',
    ages: [7, 15],
    weight: 0,
    tags: ['followup', 'money'],
    text: (s, h) => '你的存錢罐已經塞不下了。你把它倒出來，一枚一枚數過，數出一個你想都不敢想的數字。你用它買了一直想要的那雙鞋，還剩一點，留著。',
    effects: { wealth: +1, happiness: +4, knowledge: +1 },
    unset: ['c_saver'],
  },
  {
    id: 'childhood_friend_letter',
    title: '來自遠方的消息',
    ages: [8, 16],
    weight: 0,
    tags: ['followup', 'friends'],
    text: (s, h) => {
      const msg = h.year() < 2005 ? '一個信封' : '一則訊息';
      if (h.has('c_missed_goodbye')) return `你在街上看見一個像他的背影，追了半條街才發現認錯人。那天你好希望有個機會，把當年沒說出口的話說完。`;
      return `${msg}寄到了你手上，是那位搬走的朋友：「這邊有一條很長的河，你要不要來玩？」你笑著讀了三遍，才捨得放下，然後立刻翻出紙筆想回信，卻發現自己有太多話想說，反而一個字也寫不出來。`;
    },
    effects: (s, h) => {
      if (h.has('c_missed_goodbye')) { h.change('happiness', -1); h.change('knowledge', +1); h.unset('c_missed_goodbye'); }
      else { h.change('social', +3); h.change('happiness', +3); }
    },
  },
  {
    id: 'childhood_teacher_persuades',
    title: '矮桌邊的兩個小時',
    ages: [11, 15],
    weight: 0,
    tags: ['followup', 'school', 'family'],
    text: (s, h) => '老師在你家那張矮桌邊坐了兩個小時。你偷偷看見大人的肩膀慢慢放鬆，最後大人點了頭：「那就再試一年。」那天你在院子裡繞了好幾圈，跟風說了好幾遍「我還能念書」。',
    effects: { knowledge: +3, happiness: +5, social: +1 },
    highlight: '在老師與家人的支持下，繼續念書。',
  },
  {
    id: 'childhood_night_school_cert',
    title: '結業證書',
    ages: [11, 18],
    weight: 0,
    tags: ['followup', 'school', 'hardship'],
    text: (s, h) => '夜間班發結業證書的那天，你穿上最乾淨的一件衣服。名字被唱到時，大人比你還緊張地用力鼓掌。那張紙後來被他們用相框裱起來，掛在牆上最顯眼的地方。',
    effects: { knowledge: +3, happiness: +4, social: +2 },
    highlight: '拿到夜間班的結業證書。',
  },
  {
    id: 'childhood_bully_friend',
    title: '走廊上的點頭',
    ages: [9, 15],
    weight: 0,
    tags: ['followup', 'school', 'friends'],
    text: (s, h) => {
      if (h.has('c_stood_up')) return '一年後，那個被你幫過的孩子成了你最常一起走路回家的人。他話不多，但生日那天，他遞給你一張自己畫的卡片，上面有你的側臉。';
      if (h.has('c_walked_away')) return '你在校門口又遇見那個孩子，他已經笑著和別人說話了。你停下腳步看了很久，鬆了一口氣，也很想跟他說聲對不起。';
      return '你偶爾在走廊遇見那個孩子，彼此點個頭。有些相遇不需要說出口，就已經在彼此的記憶裡放好位置。你繼續往前走，心裡卻有點輕鬆，像放下一個小小的包袱。';
    },
    effects: (s, h) => {
      if (h.has('c_stood_up')) { h.change('social', +4); h.change('happiness', +3); }
      else if (h.has('c_walked_away')) { h.change('happiness', +1); h.change('knowledge', +1); }
      else { h.change('social', +1); h.change('happiness', +1); }
    },
  },
];
