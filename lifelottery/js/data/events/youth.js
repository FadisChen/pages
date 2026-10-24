// Events for ages 13-22: school and exams, vocational and university paths, dropping out to work, teen friendships,
// first romance, identity, family tension, leaving home and coming of age.
// Ids start with `youth_`. Flags set here start with `y_` (childhood ones start with `c_`; seed ones are read where useful).
//
// Follow-up chains (choice -> schedule -> follow-up, `weight: 0` = only reachable through schedule):
//   tell_parents -> secret_found_out    curfew -> sneak_caught          betrayal -> friend_after
//   city_job_offer -> city_job_aftermath  scholarship_essay -> scholarship_result  choose_major -> major_doubt
//   night_class -> night_class_cert     gray_season -> gray_after       social_media -> offline_summer
//   ai_tutor -> ai_exam_check           between_cultures -> return_visit
//   from childhood.js: dream_job -> dream_check, talent -> talent_audition, cram_school -> cram_burnout, corner_boys -> gang_offer
//   from seed.js (flag/seen driven, no schedule): first_love_yes -> first_love_after, first_love_no -> rejection_recovery,
//   exam_result without exam_passed -> retake_year, left_home -> new_city_loneliness, student_loan -> loan_burden,
//   stayed_home -> stayed_home_pride, bullied_silent -> bullied_voice
//
// Romance events never invent a partner: they only read the one the engine created (h.hasPartner()) or tell a story about a crush.
// All functions are total: they never assume a parent, partner or child exists unless `cond` guarantees it.

/** Chance that something shared openly is met with acceptance, by era and surroundings (kept modest and varied, never absolute). */
function acceptP(h) {
  let p = h.era() === 'past' ? 0.5 : h.era() === 'future' ? 0.85 : 0.72;
  if (h.isRegion('MENA', 'SSA', 'CAS')) p -= 0.25;
  else if (h.isRegion('SAS', 'SEA', 'EAS')) p -= 0.1;
  return Math.max(0.15, Math.min(0.95, p));
}

export default [
  // =====================================================================================
  // 成長、學校與日常（regular）
  // =====================================================================================
  {
    id: 'youth_growth_spurt',
    title: '一夕之間長大',
    ages: [13, 15],
    tags: ['body', 'growing'],
    text: (s, h) => (h.male()
      ? `一個暑假你長高了八公分，褲管短了一截，聲音忽高忽低，像一台收訊不好的收音機。開口說話時連你自己都被嚇到，${h.inSchool() ? '同學' : '朋友'}笑到趴在桌上。`
      : '你的身體一夕之間變得陌生：衣服不合身了，鏡子裡的人有點不像自己。你學著與這個新的自己相處，有時尷尬，有時卻意外地喜歡，連走路的樣子都得重新練習。'),
    effects: { happiness: -1, health: +1, knowledge: +1 },
  },
  {
    id: 'youth_boarding',
    title: '週日傍晚的行李',
    ages: [13, 17],
    weight: 1.1,
    tags: ['school', 'regional'],
    cond: (s, h) => h.inSchool() && !h.urban() && !h.incomeAtLeast('H') && h.eduYears() >= 6,
    text: (s, h) => h.byIncome({
      L: '中學離家太遠，你開始住校。每個週日傍晚，你背著大人準備的糧食、醃菜和一小罐辣醬走回宿舍。通鋪上二十個人擠著睡，床邊堆滿了這樣的小罐子。',
      LM: '中學離家太遠，你開始住校。週日傍晚，你背著大人準備的糧食、醃菜和一小罐辣醬回宿舍。熄燈後，大家輪流分享自己帶來的家鄉味，辣的鹹的酸的都有，吃著吃著，沒有人想家了。',
      UM: '中學離家太遠，你開始住校。週日傍晚，大人把你送到車站，塞給你一袋水果和零用錢。宿舍裡八個人，一個月後已經熟得像一家人，連誰的襪子在哪裡都記得一清二楚。',
      H: '你上的中學有宿舍，週日晚上回校。行李箱滾輪的聲音在走廊裡此起彼落，像一場小小的返鄉潮，你拖著行李穿過人群，覺得自己是這個大人世界的小小一員。',
    }),
    effects: { knowledge: +2, social: +3, happiness: -1, health: -1 },
  },
  {
    id: 'youth_teacher_noticed',
    title: '「你最近還好嗎？」',
    ages: [13, 18],
    weight: 0.9,
    tags: ['school', 'mentor'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '你連續兩週作業缺交，眼睛下掛著黑眼圈。導師沒有責備，只在放學後輕輕問：「你最近還好嗎？」你本來想說沒事，一開口卻停不下來。',
    effects: { happiness: +3, social: +2, knowledge: +1 },
  },
  {
    id: 'youth_friend_group',
    title: '看台後排的我們',
    ages: [13, 16],
    weight: 0.9,
    tags: ['friends', 'school'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => '你們一群人固定坐在操場看台的後排：有愛講冷笑話的、永遠在補眠的，還有負責記得每個人生日的那一位。分組時你不再擔心被剩下，這是你整個中學時代最大的安全感。',
    effects: { social: +4, happiness: +3 },
  },
  {
    id: 'youth_music_obsession',
    title: '那首歌',
    ages: [13, 19],
    weight: 0.9,
    tags: ['culture', 'friends'],
    text: (s, h) => {
      if (h.year() < 1990) return `你把${h.pocketMoney()}存起來，只為了買一卷錄音帶。夜裡你把收音機貼在耳邊，等主持人點播那首歌，按下錄音鍵的手指都在抖，連呼吸聲都怕被錄進去。`;
      if (h.year() < 2008) return '你和朋友交換 CD 與隨身聽，耳機一人一邊。同一首歌你聽了兩百遍，歌詞背到連夢話都在唱。';
      return '你的播放清單裡，每首歌都有一段故事：哪天哭過、哪天考砸、哪天好像戀愛了。你把清單分享給朋友，有人回「這首不錯」，你卻高興了一整晚。';
    },
    effects: { happiness: +3, social: +2 },
  },
  {
    id: 'youth_young_carer',
    title: '家裡的那根柱子',
    ages: [13, 19],
    weight: 0.9,
    tags: ['family', 'hardship'],
    cond: (s, h) => h.siblings() >= 2 && (h.parentsAlive() < 2 || h.wealthQ() <= 2),
    text: (s, h) => `${h.inSchool() ? '放學後，你要先去接弟妹，煮晚飯、檢查作業' : '每天傍晚，你要先去接弟妹，煮晚飯、盯著他們把功課寫完'}，再把家裡最後一盞燈關上。你很少抱怨，因為你知道，自己是這個家裡一根小小的柱子。`,
    effects: { health: -1, knowledge: -1, social: +2, happiness: 0 },
  },
  {
    id: 'youth_hard_work_young',
    title: '暑假的工',
    ages: [13, 17],
    weight: 1.1,
    tags: ['work', 'hardship', 'regional'],
    cond: (s, h) => (h.income() === 'L' || h.income() === 'LM') && h.wealthQ() <= 2,
    text: (s, h) => (h.income() === 'L'
      ? `暑假你在${h.urban() ? '工地' : '磚窯'}幫忙。太陽曬得皮膚脫了一層，一天下來手指都伸不直。發薪日你把錢遞給大人，他說：「你長大了。」你不知道該笑還是想哭。`
      : `暑假你在成衣廠做包裝，${h.techReady(1975) ? '冷氣' : '涼快'}是別人的，你只有一台轉得吱吱響的電扇，一天站十小時。你把第一份薪水放進鐵盒裡，數了三遍，才捨得蓋上蓋子。`),
    effects: { wealth: +3, health: -3, knowledge: -1, happiness: -1, social: +1 },
  },
  {
    id: 'youth_family_shop',
    title: '小老闆',
    ages: [13, 19],
    weight: 0.9,
    tags: ['work', 'family'],
    cond: (s, h) => h.urban() && h.familyBusiness() && h.parentsAlive() >= 1,
    text: (s, h) => `${h.inSchool() ? '放學後' : '收工後'}，你繫上圍裙站到家裡小店的櫃檯後面。你記得每種貨的位置、每位常客的口味，連誰會賒帳都背得出來。有人叫你「小老闆」，你嘴上抗議，心裡有點得意。`,
    effects: { wealth: +2, knowledge: +1, social: +2, health: -1 },
  },
  {
    id: 'youth_one_phone',
    title: '全家共用的手機',
    ages: [13, 19],
    weight: 0.9,
    tags: ['tech', 'regional'],
    cond: (s, h) => h.year() >= 2010 && (h.income() === 'L' || h.income() === 'LM') && h.wealthQ() <= 3,
    text: (s, h) => `全家只有一支手機，你得靠「輪流」才能${h.inSchool() ? '查功課' : '查資料'}、看影片、跟朋友聊天。你練就了一種本領：電量剩百分之十的時候，精準地決定這一刻最重要的是什麼。`,
    effects: { knowledge: +2, social: +1, happiness: 0 },
  },
  {
    id: 'youth_girls_club',
    title: '星期三的姊妹聚會',
    ages: [13, 18],
    weight: 1.1,
    tags: ['school', 'regional', 'gender'],
    cond: (s, h) => h.female() && h.inSchool() && !h.incomeAtLeast('UM') && h.year() >= 2005,
    text: (s, h) => '學校來了一位姊姊，帶著一箱衛生用品和好多海報，每週三下午開「姊妹聚會」。你本來只是為了免費餅乾去，卻在那裡第一次聽見有人說：「你們可以決定自己的人生。」',
    effects: { knowledge: +2, social: +3, happiness: +3 },
  },
  {
    id: 'youth_vr_class',
    title: '全像教室',
    ages: [13, 18],
    weight: 0.9,
    tags: ['tech', 'school'],
    cond: (s, h) => h.year() >= 2035 && h.inSchool() && h.incomeAtLeast('LM'),
    text: (s, h) => '歷史課在全像教室裡進行。你戴上輕薄的眼鏡，站在古代市集的中央，旁邊的同學被一頭虛擬駱駝嚇得尖叫。你笑到忘了寫筆記，卻記住了那天的每一種氣味。',
    effects: { knowledge: +3, happiness: +2, social: +1 },
  },
  {
    id: 'youth_class_gap',
    title: '住在哪一區',
    ages: [13, 18],
    weight: 0.9,
    tags: ['school', 'class'],
    cond: (s, h) => h.inSchool() && h.wealthQ() <= 2 && h.incomeAtLeast('UM'),
    text: (s, h) => '同學聊的是暑假去了哪個國家、新出的設備。你的暑假是打工，便當是前一晚的剩菜。有人不經意問「你家住哪一區」，你的回答有點小聲。但有個同學從不問這些，只問你喜歡哪本書，後來成了你的朋友。',
    effects: { social: -1, happiness: -1, knowledge: +2 },
  },
  {
    id: 'youth_body_image',
    title: '鏡子前面',
    ages: [13, 18],
    weight: (s, h) => (h.female() ? 1.2 : 0.7),
    tags: ['body', 'identity'],
    text: (s, h) => '你站在鏡子前，用別人的標準檢查自己：太高、太矮、太圓、太瘦。直到朋友在背後說了一句「你今天好好看」，你才意識到，自己盯著缺點看了太久。',
    effects: { happiness: -1, social: +2 },
  },
  {
    id: 'youth_sports_team',
    title: '「再一次」',
    ages: [13, 18],
    weight: 0.9,
    tags: ['sports', 'friends'],
    cond: (s, h) => (h.inSchool() || h.urban()) && h.playsSports(),
    text: (s, h) => '球隊每天傍晚在操場練習，教練的口頭禪是：「再一次。」你的膝蓋有擦傷，汗水流進眼睛。某場比賽結束的哨音響起，全隊抱在一起時，你覺得自己屬於某個比自己更大的東西。',
    effects: { health: +2, social: +4, happiness: +3 },
  },
  {
    id: 'youth_band',
    title: '第一次組團',
    ages: [14, 20],
    weight: 0.8,
    tags: ['culture', 'friends'],
    text: (s, h) => h.byIncome({
      L: '你和幾個朋友用廢棄的鐵桶和一把借來的吉他組了團。排練場是某個人家的後院，鄰居一邊皺眉一邊不自覺地跟著打拍子，第三次排練時還端來了一盤西瓜。',
      LM: '你們用一台二手音箱和幾支舊樂器組了團，排練的地方是菜市場後面的小倉庫。第一次演出，台下只有五個人，其中兩個是各自的媽媽。',
      UM: '你們的團在車庫裡排了三個月，終於在校慶舞台上唱了第一首原創歌。台下有人跟著晃，你分不清是歌好，還是大家給面子，下台時手還在抖，笑卻停不下來。',
      H: '你們的團在車庫裡排了三個月，終於在校慶舞台上唱了第一首原創歌。台下有人跟著晃，你分不清是歌好，還是大家給面子，下台時手還在抖，笑卻停不下來。',
    }),
    effects: { happiness: +4, social: +4 },
  },
  {
    id: 'youth_volunteer',
    title: '週末的志工',
    ages: [15, 22],
    weight: 0.8,
    tags: ['community'],
    cond: (s, h) => h.stat('social') > 35,
    text: (s, h) => '週末你去社區幫忙：整理舊衣、教小孩功課、陪老人聊天。第一次做完，你累得像被掏空，卻比任何一個放假的日子都睡得安穩，離開時，還有個小孩偷偷塞給你一顆糖。',
    effects: { social: +4, happiness: +3, knowledge: +1 },
  },
  {
    id: 'youth_sex_ed',
    title: '生理衛生課',
    ages: [13, 16],
    weight: 0.8,
    tags: ['school', 'growing'],
    cond: (s, h) => h.inSchool(),
    text: (s, h) => (h.incomeAtLeast('UM')
      ? '健康教育課上，老師用平靜的語氣談身體、尊重與界線。全班緊張地盯著課本，有人忍不住笑出聲，笑聲像病毒一樣傳開，連老師也笑了。'
      : '生理衛生課上，老師把關鍵的幾頁直接跳了過去，全班同時抬起頭，又同時低下頭。真正的答案，你是從哥哥姊姊和朋友零零碎碎的耳語裡拼起來的。'),
    effects: { knowledge: +2, social: +1 },
  },
  {
    id: 'youth_summer_camp',
    title: '夏令營的第一晚',
    ages: [13, 17],
    weight: 0.8,
    tags: ['social', 'fun'],
    cond: (s, h) => h.incomeAtLeast('UM') && h.wealthQ() >= 3,
    text: (s, h) => '夏令營的第一晚，你和一群陌生人擠在同一頂帳篷裡。到了第三天，你已經熟悉所有人的打呼聲，並且在營火邊唱了一首連歌詞都記不清的歌。',
    effects: { social: +4, happiness: +3, health: +1 },
  },
  {
    id: 'youth_send_money_home',
    title: '發薪日',
    ages: [16, 22],
    weight: 1.1,
    tags: ['work', 'family', 'money'],
    cond: (s, h) => h.wageEarner() && !h.inSchool() && (h.income() === 'L' || h.income() === 'LM'),
    text: (s, h) => '發薪日，你把一半的錢寄回家。排隊的人都和你一樣沉默，手裡握著折好的單子。留給自己的那一半，剛好夠你下個月吃飯，剛好不夠買那件你看了很久的外套。',
    effects: { wealth: -1, happiness: +2, social: +2 },
  },
  {
    id: 'youth_apprentice_master',
    title: '師傅說「重做」',
    ages: [15, 20],
    weight: 1.1,
    tags: ['work', 'craft'],
    cond: (s, h) => h.employed() && !h.inSchool() && h.isJob('artisan', 'cook', 'construction', 'factory', 'technician', 'shopkeeper'),
    text: (s, h) => '師傅脾氣不好，一句話也不說就把你做的東西摔在地上：「重做。」你咬著牙做第三遍，師傅終於點了點頭：「這次還行。」那是你這一年聽過最好聽的一句話。',
    effects: { knowledge: +3, happiness: +2, health: -1, social: +1 },
  },
  {
    id: 'youth_no_school_idle',
    title: '路過的制服',
    ages: [14, 19],
    weight: 0.9,
    tags: ['school', 'hardship'],
    cond: (s, h) => !h.inSchool() && h.eduYears() < 12 && !h.employed(),
    text: (s, h) => '同齡的孩子穿著制服從你家門口走過，你坐在門檻上，假裝在修理什麼。你不是不想念書，只是日子把你帶向了另一邊。鄰居老人對你說：「不管走哪條路，都要做個有尊嚴的人。」',
    effects: { happiness: -1, social: +1, knowledge: +1 },
  },
  {
    id: 'youth_first_apartment',
    title: '第一個自己的家',
    ages: [19, 22],
    weight: 0.9,
    tags: ['independence'],
    cond: (s, h) => h.incomeAtLeast('UM') && (h.urban() || h.has('left_home')) && !h.married(),
    text: (s, h) => `第一次一個人住，燈是自己開的，冰箱是自己填的。第一晚你煮了泡麵，坐在地板上吃完，覺得很自由，又有點想家。${h.year() < 2000 ? '你撥了一通公共電話，只說了「我很好」，就掛了。' : '你傳了一張泡麵的照片回家，大人回了三個驚嘆號。'}`,
    effects: { happiness: +3, social: -2, knowledge: +2, wealth: -2 },
  },
  {
    id: 'youth_new_city_loneliness',
    title: '陌生城市的燈',
    ages: [17, 24],
    weight: 3,
    tags: ['independence', 'migration'],
    cond: (s, h) => h.has('left_home') && h.yearsSince('seed_leave_home') <= 2,
    text: (s, h) => '剛離開家的前三個月，你每天晚上都在算回家的車票錢。城市的燈很亮，卻沒有一盞是為你點的。直到某個週末，房東阿姨敲門，端來一碗她煮的湯，什麼也沒多說。',
    effects: { happiness: -2, social: +2, knowledge: +1 },
  },
  {
    id: 'youth_loan_burden',
    title: '第一張還款通知',
    ages: [19, 24],
    weight: 2,
    tags: ['money', 'school'],
    cond: (s, h) => h.has('student_loan') || (h.inSchool() && h.eduYears() >= 12 && h.wealthQ() <= 3 && h.isRegion('NAM', 'OCE', 'EAS', 'EUR') && h.incomeAtLeast('UM') && h.year() >= 1990),
    text: (s, h) => '第一次收到學貸的通知時，你把數字看了五遍。每個月的還款提醒像一位準時的訪客，讓你漸漸明白，「自由」是一個多昂貴的詞。你把通知折好，夾進書裡，像夾一片提醒自己的書籤。',
    effects: { wealth: -1, happiness: -2, knowledge: +1 },
  },
  {
    id: 'youth_stayed_home_pride',
    title: '留下來的人',
    ages: [19, 24],
    weight: 3,
    tags: ['family', 'community'],
    cond: (s, h) => h.has('stayed_home'),
    text: (s, h) => '朋友們在遠方傳來照片，你則在熟悉的巷口幫忙。你有時羨慕，有時慶幸，直到有天鄰居說：「有你在，我們都放心。」你低頭笑了，那句話比任何一張遠方的照片都重。',
    effects: { social: +3, happiness: +2 },
  },
  {
    id: 'youth_bullied_voice',
    title: '這一次你舉了手',
    ages: [13, 18],
    weight: 3,
    tags: ['school', 'growth'],
    cond: (s, h) => h.has('bullied_silent') && h.inSchool(),
    text: (s, h) => '被欺負的那段日子過去很久了，你卻還記得自己曾經不敢開口。某堂課，有人被罵得抬不起頭，你舉起手，用有點抖的聲音說了一句公道話。教室安靜了一秒，然後有人也舉了手。',
    effects: { social: +3, happiness: +3, knowledge: +1 },
  },
  {
    id: 'youth_rejection_recovery',
    title: '再次經過那個轉角',
    ages: [14, 21],
    weight: 3,
    tags: ['love', 'growth'],
    cond: (s, h) => h.has('first_love_no') && h.yearsSince('seed_first_love') >= 1 && h.yearsSince('seed_first_love') <= 4,
    text: (s, h) => '一年過去，你再次路過那個黃昏的轉角，心跳竟然沒有亂。你想起當時的難過，覺得好像在看另一個人的故事，然後輕輕笑了一下，繼續往前走。',
    effects: { happiness: +3, knowledge: +1, social: +1 },
  },
  {
    id: 'youth_turn_eighteen',
    title: '十八歲',
    ages: [18, 18],
    chance: 1,
    milestone: true,
    tags: ['milestone', 'coming_of_age', 'identity'],
    text: (s, h) => h.byIncome({
      L: '你滿十八歲了。在你的家鄉，這個年紀已經是能扛起家計的人。大人替你煮了一碗麵，說：「從今天起，你的路自己走。」你吃得很慢。',
      LM: '十八歲生日那天，你領到了屬於自己的證件。大人鄭重其事地說：「你成年了。」你點頭，其實更想知道今晚晚餐吃什麼，因為整個家裡，只有你一個人把這個日子看得這麼重要。',
      UM: '十八歲生日，你領到了自己的證件，也領到一堆新的責任：簽名要自己簽，帳單要自己看。你把證件放在桌上，看了很久，覺得上面的照片，不太像現在的自己。',
      H: '十八歲生日當天，你和朋友吃了一頓慶祝的晚餐。有人舉杯說「成年快樂」，你被這個詞逗笑，因為你一點也不覺得自己像大人，蛋糕上的蠟燭，還是被你偷吹熄了兩次。',
    }),
    effects: { happiness: +3, social: +2 },
  },
  {
    id: 'youth_quinceanera',
    title: '十五歲的舞會',
    ages: [14, 16],
    weight: 2,
    tags: ['culture', 'coming_of_age', 'fun'],
    cond: (s, h) => h.female() && h.isRegion('LAC'),
    text: (s, h) => '你滿十五歲了。家裡為你準備了成年禮：蓬蓬的禮服、和家人排練了好幾週的華爾茲，還有一場全家出動的大聚會。跳舞時你踩到了裙擺，所有人笑成一團，卻都為你鼓掌。',
    effects: { happiness: +5, social: +4, wealth: -2 },
  },
  {
    id: 'youth_prom',
    title: '畢業的季節',
    ages: [16, 19],
    weight: 0.9,
    tags: ['school', 'milestone'],
    cond: (s, h) => h.inSchool() && h.incomeAtLeast('UM'),
    text: (s, h) => {
      if (h.isRegion('NAM', 'OCE', 'EUR')) return '舞會前一週，全班都在煩惱同一件事：要和誰去、穿什麼、怎麼回家。舞會當晚，你本來只想站在角落看氣球，結果跳了三首歌，還被朋友拍下了笨拙的舞步。';
      if (h.region() === 'EAS') return '畢業旅行的行李裡塞滿零食，遊覽車上的歌單被輪流點播。夜晚的旅館房間裡，大家用枕頭大戰收尾，老師站在門口，假裝什麼都沒看到。';
      if (h.region() === 'LAC') return '畢業舞會上，大家穿上這輩子最正式的衣服。家人帶著相機在門口守著，閃光燈閃個不停，你的耳朵紅到快冒煙，卻忍不住在鏡頭前面，偷偷擺出了一個很帥的姿勢。';
      return '畢業前夕，班上辦了一場簡單的聚會，大家在教室裡搬桌子、分蛋糕，輪流說祝福。有人哭了，有人笑得更大聲，連平常最兇的老師也紅了眼眶。';
    },
    effects: { social: +4, happiness: +4 },
  },
  {
    id: 'youth_driver_license',
    title: '第一次握住方向',
    ages: [17, 22],
    weight: 0.9,
    tags: ['independence'],
    cond: (s, h) => h.incomeAtLeast('UM') || h.isRegion('SEA'),
    text: (s, h) => {
      if (h.isRegion('SEA', 'SAS')) return '你第一次騎上機車，大人在後座緊張得抓緊你的衣角。轉彎時你全身僵硬，直到順利轉過一個大彎，才忽然覺得自己自由得不得了，風從耳邊呼嘯而過，連背後的擔心都被甩遠了。';
      return '考駕照那天，你坐上駕駛座，雙手出汗。教練在旁邊安靜地記分。你緩緩把車倒進車位，停得比預期的還漂亮，教練第一次笑了，你的膝蓋這才開始發軟。';
    },
    effects: { knowledge: +2, happiness: +3, social: +1 },
  },
  {
    id: 'youth_leaving_for_campus',
    title: '報到的那天',
    ages: [17, 20],
    weight: 3,
    tags: ['school', 'milestone'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 12 && h.eduYears() <= 13 && h.age() <= 20,
    text: (s, h) => h.byIncome({
      L: '你拿著錄取通知書，全村的人都來了。有人塞給你雞蛋，有人湊了幾張皺皺的鈔票。你把它們一張張撫平，放進最貼身的口袋，彷彿那些紙鈔比整個村子還重。',
      LM: '你坐了十二個小時的車去大學報到，行李袋裡有一床新棉被和家鄉的醃菜。出站時你在人潮裡愣了好幾秒，才發現：這裡沒有人認識你。',
      UM: `${h.parentsAlive() === 2 ? '父母' : h.parentAlive('mother') ? '母親' : h.parentAlive('father') ? '父親' : '家裡的長輩'}陪你到宿舍報到。${h.parentsAlive() === 2 ? '他們' : '對方'}幫你鋪床、整理書桌，臨走前反覆叮嚀了五次要記得吃飯。你揮手到${h.parentsAlive() === 2 ? '他們' : '對方'}看不見為止，才慢慢轉身走進宿舍。`,
      H: '搬進大學宿舍那天，房間裡只有一張床和空蕩蕩的書桌。你把家裡帶來的馬克杯放在桌角，頓時覺得有了一點家的味道，也第一次聽見自己的腳步聲，在空蕩的房間裡回響。',
    }),
    effects: { happiness: +4, knowledge: +2, social: -2 },
  },
  {
    id: 'youth_first_in_family',
    title: '家裡的第一位大學生',
    ages: [18, 22],
    weight: 1.1,
    tags: ['school', 'class'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 12 && h.wealthQ() <= 3,
    text: (s, h) => '你是家族裡第一個念大學的人。同學們談的暑期實習、交換計畫、人脈，你聽得半懂不懂。假日回家，鄰居問：「你以後是不是賺大錢了？」你笑笑，不知道怎麼解釋其中的距離。',
    effects: { knowledge: +3, happiness: -1, social: -1 },
    highlight: '成為家裡第一個念大學的人。',
  },
  {
    id: 'youth_dorm_life',
    title: '熄燈以後',
    ages: [18, 22],
    weight: 1.0,
    tags: ['school', 'friends'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 12,
    text: (s, h) => (h.incomeAtLeast('UM')
      ? '凌晨兩點，宿舍走廊飄來泡麵的香氣。有人在趕報告，有人在失戀，有人為了一部電影爭論不休。你發現，這些吵吵鬧鬧，是學位以外最珍貴的一堂課。'
      : '宿舍八人一間，上下鋪。熄燈後有人用手電筒偷偷看書。你們分享泡麵、分享考卷、分享各自家鄉的家常話，慢慢變成了一種家人，連打呼聲都聽習慣了。'),
    effects: { social: +4, happiness: +2, health: -1 },
  },

  // =====================================================================================
  // 愛情、家庭與認同（major）
  // =====================================================================================
  {
    id: 'youth_love_note',
    title: '被折起來的心意',
    ages: [13, 17],
    major: true,
    weight: 0.9,
    tags: ['love', 'school'],
    cond: (s, h) => h.inSchool() && !h.hasPartner() && !h.married(),
    text: (s, h) => (h.year() < 2005
      ? '抽屜裡躺著一張折成小方塊的紙條，署名是你偷偷在意的那個人。字很醜，卻寫得很認真：「放學後，可以一起走嗎？」你把紙條讀了又讀，連折痕都不想弄壞。'
      : '手機亮了一下，是你偷偷在意的那個人傳來的私訊：「你明天有空嗎？」你把這幾個字看了十幾遍，連逗點都研究過，最後卻只敢回一個「好」字，然後把手機丟到床的另一端。'),
    choices: [
      {
        label: '紅著臉回覆',
        effects: { happiness: +5, social: +3, knowledge: -1 },
        set: ['y_crush_yes'],
        result: '你們開始一起走回家的路。誰也沒說「在一起」，但每個人都看得出來。你的成績掉了一點點，心情卻好了很多。',
        ai: (s, h) => 1.2 + h.stat('happiness') / 60,
      },
      {
        label: '假裝沒看到，內心狂跳',
        effects: { happiness: -1, social: -1 },
        result: '你把它夾在課本最後一頁，假裝什麼也沒發生。很多年後翻到時，字跡都淡了，你還記得那天自己的耳朵有多燙。',
        ai: (s, h) => (h.stat('social') < 40 ? 1.6 : 0.8),
      },
      {
        label: '拿給朋友看，大家一起分析',
        effects: { social: +2, happiness: +2 },
        set: ['y_crush_gossip'],
        result: '你和朋友圍成一圈解讀每個字的含意，吵了半小時還沒結論。你們笑得太大聲，被老師點名。這件事從此成了你們的共同秘密。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'youth_tell_parents',
    title: '要不要告訴家裡',
    ages: [14, 22],
    major: true,
    weight: 3,
    tags: ['love', 'family', 'chain'],
    cond: (s, h) => h.hasPartner() && h.partnerStatus() === 'dating' && !h.has('y_told_parents') && !h.has('y_secret_romance') && h.parentsAlive() >= 1,
    text: (s, h) => `你和${h.partnerName()}已經偷偷在一起好一陣子了。每次回家，你都得先把笑容收起來。家裡人問「最近怎麼心情這麼好」，你支支吾吾，只說了「沒什麼」。`,
    choices: [
      {
        label: '大方告訴大人',
        effects: (s, h) => {
          h.change('happiness', +2); h.change('social', +1);
          if (h.chance(0.7)) h.set('y_parents_ok');
          h.set('y_told_parents');
        },
        result: (s, h) => (h.has('y_parents_ok')
          ? `大人皺著眉聽完，最後說：「帶${h.partnerName()}回家吃個飯吧。」那頓飯尷尬到你想鑽進地洞，但結束時，大人多夾了一塊菜給對方。`
          : '大人沉默了很久，說「現在最重要的是把書讀好」。你們被要求減少見面，但你知道，這件事不會就這樣結束。'),
        ai: 1.5,
      },
      {
        label: '繼續保密',
        effects: { happiness: +1, social: -1 },
        set: ['y_secret_romance'],
        result: '你們約在離家很遠的地方見面，像兩位地下情報員。刺激是刺激，只是每次說謊，你的胃都會縮一下。',
        schedule: [{ id: 'youth_secret_found_out', inYears: [1, 2] }],
        ai: 1.5,
      },
      {
        label: '先介紹成「普通朋友」',
        effects: { happiness: +1, social: +1 },
        set: ['y_secret_romance'],
        result: '你說對方是「同學」，大人點點頭，沒多問。有一次他們來家裡，大家像一群演員，一起把場面撐了下來。',
        schedule: [{ id: 'youth_secret_found_out', inYears: [1, 3] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'youth_first_love_after',
    title: '一個冬天之後',
    ages: [15, 22],
    major: true,
    weight: 5,
    tags: ['love', 'growth'],
    cond: (s, h) => h.has('first_love_yes') && !h.has('y_first_love_after') && h.yearsSince('seed_first_love') >= 1 && h.yearsSince('seed_first_love') <= 4,
    text: (s, h) => '你和當初那個人的故事，已經走過一個冬天。你們開始談不同的志願、不同的城市，每次談到「以後」，兩個人就同時沉默，像兩個人同時走到一條沒有橋的河邊。',
    choices: [
      {
        label: '約定一起努力，畢業後再見',
        effects: { happiness: +2, social: +1, knowledge: +1 },
        set: ['y_first_love_after'],
        result: '你們約好在同一座城市見面。寫信、傳訊息的時間比約會多，卻每個週末都像節日。之後的事沒有人說得準，但那一年的承諾，足夠暖很久。',
        ai: 1,
      },
      {
        label: '溫柔地說再見',
        effects: { happiness: -3, knowledge: +2, social: +1 },
        set: ['y_first_love_after'],
        result: (s, h) => `你們在${h.inSchool() ? '放學後的操場' : '河堤邊'}走了一圈又一圈，最後握了握手。你回到家哭了一夜，隔天卻發現天空還是藍的。`,
        ai: 1.5,
      },
      {
        label: '緊抓著不放',
        effects: { happiness: -4, health: -2, social: -1 },
        set: ['y_first_love_after'],
        result: '你每天傳訊、寫信，催對方回覆。對方的回信一次比一次短。你終於明白，有些東西越用力握，越容易碎。',
        ai: 0.6,
      },
    ],
  },
  {
    id: 'youth_matchmaker',
    title: '介紹對象',
    ages: [18, 22],
    major: true,
    weight: 2.5,
    tags: ['love', 'family', 'culture'],
    cond: (s, h) => !h.hasPartner() && !h.married() && h.isRegion('SAS', 'MENA', 'CAS', 'SSA', 'EAS', 'SEA'),
    text: (s, h) => (h.isRegion('SAS', 'MENA', 'CAS')
      ? '家裡的長輩帶著一張照片和一份簡短的介紹來找你：「這個孩子的家世與人品都不錯，要不要見個面？」大人眼裡有期待，也有不容拒絕的溫柔。'
      : '親戚熱心地要替你「介紹對象」，連飯桌上的座位都安排好了。你吃著那頓相親飯，緊張得只記得對方的杯子是什麼顏色，連對方說了什麼都不太記得。'),
    choices: [
      {
        label: '答應見面，看看再說',
        effects: { happiness: +1, social: +2 },
        result: '見面時你們尷尬得像兩尊雕像，直到對方打翻了茶，大家一起笑了。結局未定，但你發現，對方是個有趣的人。',
        ai: 1.5,
      },
      {
        label: '請求再等幾年，先把學業或工作做好',
        effects: { knowledge: +2, happiness: -1 },
        set: ['y_delay_match'],
        result: '你鼓起勇氣說出自己的想法。大人沒有立刻答應，但也沒有翻臉，只說：「我們再看看。」你知道這句話是個開頭。',
        ai: (s, h) => (h.eduAtLeast('secondary') ? 1.5 : 0.8),
      },
      {
        label: '婉拒，說想自己找',
        effects: { happiness: +1, social: -2 },
        result: '你的拒絕讓場面冷了幾秒。事後長輩嘆了氣，說了幾句「你還年輕」。你知道這件事還沒完，但至少，你說出了口。',
        ai: 1,
      },
    ],
  },
  {
    id: 'youth_who_you_love',
    title: '安靜而確定的事',
    ages: [14, 21],
    major: true,
    weight: 0.22,
    tags: ['identity', 'love'],
    text: (s, h) => `你開始注意到，自己心動的對象和身邊${h.inSchool() ? '同學' : '同齡的人'}談論的有些不同。這份感覺很安靜，也很確定。你在夜裡想著它，白天卻把它收得很好，像把一封信折了又折。`,
    choices: [
      {
        label: '告訴一位信任的朋友',
        effects: (s, h) => {
          if (h.chance(acceptP(h))) { h.change('happiness', +5); h.change('social', +3); h.set('y_confide_ok'); }
          else { h.change('happiness', -4); h.change('social', -3); h.unset('y_confide_ok'); }
        },
        result: (s, h) => (h.has('y_confide_ok')
          ? '對方沉默了幾秒，說：「我早就覺得了。你還是你。」你整個人像放下了一袋沉重的米。'
          : '對方的表情僵住，說了幾句不太好聽的話。你在回家的路上走得很慢，告訴自己：至少你現在知道，誰是不能說的。'),
        ai: 1.5,
      },
      {
        label: '暫時保守秘密，先好好認識自己',
        effects: { happiness: -1, knowledge: +2 },
        result: '你決定現在還不說。你寫日記、聽歌，在安全的小空間裡練習認識自己。你知道這份安靜不是逃避，是準備。',
        ai: 2,
      },
      {
        label: '告訴家人',
        effects: (s, h) => {
          if (h.chance(Math.max(0.1, acceptP(h) - 0.2))) { h.change('happiness', +6); h.change('social', +2); h.set('y_family_ok'); }
          else { h.change('happiness', -6); h.change('social', -4); h.change('health', -2); h.unset('y_family_ok'); }
        },
        result: (s, h) => (h.has('y_family_ok')
          ? '大人安靜了很久，眼眶有點紅，最後說：「你還是我的孩子。」那頓晚餐吃得特別慢，每個人都比平常多吃了一點飯。'
          : '家裡的空氣一瞬間凍住了。有人哭，有人轉身走開。你站在客廳，覺得自己像被分成了兩半，但你沒有收回那句話。'),
        ai: 0.6,
      },
    ],
  },
  {
    id: 'youth_curfew',
    title: '十點以前回家',
    ages: [13, 18],
    major: true,
    weight: 1.0,
    tags: ['family', 'growing', 'chain'],
    cond: (s, h) => h.parentsAlive() >= 1 && (h.urban() || h.incomeAtLeast('LM')) && !h.employed(),
    text: (s, h) => '朋友邀你參加一場晚上的聚會，大人卻說十點前一定要回家，一分鐘都不能晚。你在心裡練了三個晚上的說服詞，站在客廳，手心全是汗。',
    choices: [
      {
        label: '據理力爭，談判延後',
        effects: (s, h) => {
          if (h.chance(0.6)) { h.change('social', +2); h.change('happiness', +2); h.set('y_curfew_ok'); }
          else { h.change('happiness', -2); h.unset('y_curfew_ok'); }
        },
        result: (s, h) => (h.has('y_curfew_ok')
          ? '你把理由一條條說完，大人沉默半晌：「好，十一點，到家要通知我們。」你覺得自己第一次贏過這個家。'
          : '大人堅持原定規則：「我是為你好。」你關上房門，把這句話在心裡駁斥了一百遍。'),
        ai: (s, h) => 1 + h.stat('social') / 80,
      },
      {
        label: '乖乖答應，十點到家',
        effects: { happiness: -1, health: +1 },
        result: '你十點準時到家，活動才剛熱鬧。隔天朋友講著你沒趕上的好笑事情，你笑得有點酸。',
        ai: 1,
      },
      {
        label: '偷偷溜出去，晚點回',
        effects: { social: +3, happiness: +2, health: -1 },
        set: ['y_sneaked_out'],
        result: '你從後門溜了出去，度過了一個閃閃發光的夜晚。回家時屋裡一片漆黑，你踮著腳尖進門，卻看見客廳那盞燈亮了。',
        schedule: [{ id: 'youth_sneak_caught', inYears: [0, 0] }],
        ai: (s, h) => (h.stat('happiness') < 45 ? 1.6 : 0.8),
      },
    ],
  },
  {
    id: 'youth_family_money_talk',
    title: '夜裡的算盤聲',
    ages: [13, 18],
    major: true,
    weight: 1.0,
    tags: ['family', 'money', 'hardship'],
    cond: (s, h) => h.wealthQ() <= 2 && h.parentsAlive() >= 1,
    text: (s, h) => h.byIncome({
      L: '夜裡你聽見大人在算帳：下個月的米、你的學費、還欠鄰居的那一筆。他們的聲音很小，數字卻很大，大到你悄悄把耳朵貼在牆上，又在聽見自己名字的時候趕緊縮了回來。',
      LM: '夜裡你聽見大人壓低聲音算帳：房租、水電、你的註冊費。算盤珠子的聲音，比任何責備都清楚。你輕輕關上門，躺回床上，聽著那聲音一直響到天亮。',
      UM: '夜裡你聽見大人在客廳算帳：貸款、卡費、你的補習費。他們的聲音很小，數字卻很大，大到你悄悄把房門關上，躺回床上睜著眼睛，聽著自己的心跳。',
      H: '夜裡你聽見大人在書房談錢：生意不順、帳單堆著。他們的聲音很小，卻第一次讓你覺得這個家也會有脆弱的時候，你站在走廊，不知道該不該走進去。',
    }),
    choices: [
      {
        label: '主動說要打工幫忙',
        effects: { wealth: +2, knowledge: -1, health: -1, happiness: -1 },
        result: '你找到週末的零工，第一份工資交給大人時，他們收下的動作很輕，彷彿怕弄痛了你。',
        ai: (s, h) => (h.isPoor() ? 1.6 : 0.9),
      },
      {
        label: '把自己存的錢交出去',
        effects: { wealth: +1, social: +1, happiness: +1 },
        result: (s, h) => `你把存了很久的${h.pocketMoney()}放在桌上，一句話也沒說。大人沉默很久，把錢推回你面前：「我們會想辦法的。」`,
        ai: 1.2,
      },
      {
        label: '裝作沒聽見，把書念好',
        effects: { knowledge: +2, happiness: -2 },
        result: '你把頭埋進書裡，耳朵卻關不掉。你比平常更用功，像是想用成績把那些數字壓下去。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'youth_home_splits',
    title: '兩個玄關',
    ages: [13, 19],
    major: true,
    weight: 4,
    tags: ['family', 'hardship'],
    cond: (s, h) => h.has('c_parents_split') && h.parentsAlive() === 2,
    text: (s, h) => `父母分開已經一段時間了。這個週末，你得決定：跟誰住，節日又要在哪個家過。你的${h.inSchool() ? '書包' : '行李袋'}擺在兩個玄關之間，不知道該放在哪一邊，連鞋子要脫在哪個玄關，都成了一件需要考慮的事。`,
    choices: [
      {
        label: '輪流住，每邊一半',
        effects: { social: +1, happiness: -1, health: -1 },
        result: (s, h) => `你有了兩張書桌、兩支牙刷，行李袋成了你的第二個背包。雖然累，你偶爾也會偷笑：同樣的${h.inSchool() ? '作業' : '週末'}，兩邊的零食不一樣。`,
        ai: 1.5,
      },
      {
        label: '固定住在其中一個家',
        effects: { happiness: +1, social: -1 },
        result: (s, h) => `你選了${h.inSchool() ? '離學校近' : '離你日常生活圈近'}的那個家。另一邊每個週日的電話，是你們之間最重要的橋，你努力把話題維持得很輕鬆。`,
        ai: 1.5,
      },
      {
        label: '先去親戚或朋友家避一避',
        effects: { social: +2, happiness: -2, knowledge: -1 },
        result: '你在表哥（或好友）家的沙發上睡了兩個星期。沒有人逼你做決定，你卻比以前更清楚自己需要什麼。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'youth_orphan_home',
    title: '誰來收留你',
    ages: [13, 19],
    major: true,
    weight: 8,
    tags: ['family', 'hardship'],
    cond: (s, h) => h.has('orphan') && !h.married() && !h.hasChildren(),
    text: (s, h) => '父母都不在了。親戚們在客廳商量你要去誰家，彼此客氣得過了頭。你坐在角落，聽著自己的名字在別人的嘴裡被傳來傳去，像一個沒有人敢拿穩的盤子。',
    choices: [
      {
        label: '跟著願意收留的親戚生活',
        effects: { social: +1, wealth: -1, happiness: -2 },
        result: '你住進親戚家的小房間，吃飯時總是最後一個動筷。日子久了，他們開始把你當自家孩子一樣罵，你竟覺得有點暖。',
        ai: 1.5,
      },
      {
        label: '提議去住校或寄宿',
        cond: (s, h) => h.inSchool(),
        effects: { knowledge: +2, wealth: -2, social: -2 },
        result: '你抱著行李去了寄宿的學校。房間很小，很安靜，你每天都在算：這樣，我能撐到什麼時候。',
        ai: 1,
      },
      {
        label: '找工作，自己養活自己',
        cond: (s, h) => h.age() >= 14,
        effects: (s, h) => {
          if (h.inSchool()) h.dropOut();
          if (!h.employed()) h.startJob(h.pick(['laborer', 'cook', 'street_vendor']));
          h.change('wealth', +3); h.change('happiness', -3); h.change('health', -2); h.change('knowledge', -1);
        },
        result: '你在工地（或餐館）找到了位置。老闆看你年紀小，多給了你一碗湯。你學得很快，因為你沒有別的選擇。',
        ai: (s, h) => (h.isPoor() ? 1.2 : 0.4),
      },
    ],
  },
  {
    id: 'youth_betrayal',
    title: '被說出口的秘密',
    ages: [14, 18],
    major: true,
    weight: 0.9,
    tags: ['friends', 'chain'],
    cond: (s, h) => h.stat('social') > 30,
    text: (s, h) => '你只對最好的朋友說過的秘密，居然從別人嘴裡聽到了。說的人還笑著，彷彿那是什麼有趣的八卦。你的耳朵嗡嗡響，分不清是憤怒還是難過。',
    choices: [
      {
        label: '當面質問朋友',
        effects: { happiness: -2, social: -1, knowledge: +1 },
        set: ['y_confronted'],
        result: '你在走廊盡頭叫住他。他先是否認，後來低下頭：「我只是想讓大家覺得我也有話題可說。」你不知道該不該原諒，但至少，你把話說出口了。',
        schedule: [{ id: 'youth_friend_after', inYears: [1, 3] }],
        ai: 1.5,
      },
      {
        label: '默默疏遠對方',
        effects: { happiness: -3, social: -3 },
        result: '你不再回覆他的訊息，不再給他留位子。他一開始不懂，後來就懂了。這份安靜讓你輕鬆，也讓你空了一塊。',
        schedule: [{ id: 'youth_friend_after', inYears: [1, 3] }],
        ai: (s, h) => (h.stat('social') < 40 ? 1.6 : 0.8),
      },
      {
        label: '深呼吸，先給彼此一點時間',
        effects: { happiness: -1, social: +1, knowledge: +1 },
        set: ['y_cooled_off'],
        result: '你決定三天不談這件事。三天裡你寫日記、跑步，發現怒氣慢慢變成一種清楚的悲傷。第四天，你主動約他出來。',
        schedule: [{ id: 'youth_friend_after', inYears: [1, 3] }],
        ai: 1.5,
      },
    ],
  },
  {
    id: 'youth_shoplift_dare',
    title: '賭一包糖',
    ages: [13, 17],
    major: true,
    weight: 0.8,
    tags: ['friends', 'ethics'],
    cond: (s, h) => h.urban() || h.incomeAtLeast('LM'),
    text: (s, h) => `朋友們圍在${h.techReady(1985) ? '便利商店' : '雜貨店'}的角落，有人小聲說：「誰敢拿一包糖走出去，今天的飲料就算他的。」所有人的目光轉向你，你的手心黏黏的，連頭皮都在發麻。`,
    choices: [
      {
        label: '試一試，反正不會被發現',
        effects: (s, h) => {
          if (h.chance(0.4)) { h.change('happiness', -5); h.change('social', -3); h.change('wealth', -1); h.set('y_caught_shoplifting'); }
          else { h.change('happiness', +1); h.change('social', +3); h.unset('y_caught_shoplifting'); }
        },
        result: (s, h) => (h.has('y_caught_shoplifting')
          ? '你走出門的瞬間，肩膀被一隻手按住。店員沒有叫警察，只把你帶到後面，打電話給大人。回家那晚沒有人說話，你卻覺得比被罵還難受。'
          : '你成功走出店門，朋友們歡呼。你心跳如鼓，笑得很大聲，笑聲裡卻有一點空。'),
        ai: (s, h) => 0.25 + (h.isPoor() ? 0.25 : 0) + (h.stat('social') < 35 ? 0.3 : 0),
      },
      {
        label: '搖頭，說沒興趣',
        effects: { social: -1, happiness: +1 },
        result: '你說：「我不想玩這個。」有人哼了一聲，但也有人悄悄鬆了口氣，因為他們也不想。',
        ai: (s, h) => 1.5 + h.stat('knowledge') / 100,
      },
      {
        label: '提議改成別的挑戰',
        effects: { social: +2, happiness: +1 },
        result: '你說：「誰敢在全班面前唱一首歌？」大家鬧成一團，被挑中的朋友漲紅了臉，唱完卻得意洋洋。這次，沒人再提起那包糖。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'youth_gang_offer',
    title: '街角的「工作」',
    ages: [13, 18],
    major: true,
    weight: 0,
    tags: ['safety', 'regional', 'followup'],
    text: (s, h) => '街角那幾個大哥哥又找上了你，這次給的不是糖，而是一份「工作」：站崗、送貨、聽電話。報酬是你家一個月的伙食，條件是別問，也別告訴任何人。',
    choices: [
      {
        label: '拒絕，並找信任的大人幫忙',
        effects: { happiness: -1, social: -2, knowledge: +1 },
        set: ['y_refused_gang'],
        result: '你的聲音在抖，但說得很清楚。那天以後，上學的路改了，朋友換了一批。你很孤單，卻比誰都清楚自己是誰。',
        ai: 2,
      },
      {
        label: '婉拒，把時間放在書本與社區活動上',
        effects: { knowledge: +2, social: -1 },
        result: '你說想念書。他們笑你天真，但沒有強迫。你開始把更多時間花在圖書館和社區中心裡，那裡的燈比街角更亮。',
        ai: 1.5,
      },
      {
        label: '接下這份工作',
        effects: (s, h) => { h.change('wealth', +5); h.change('social', -3); h.change('health', -2); h.addRisk(1.3, 5); },
        set: ['y_gang_member'],
        result: '第一個月你領到的錢，比大人一整年存的還多。你開始買新鞋、請朋友吃飯，卻也學會了在街上永遠背對著牆壁走。',
        ai: (s, h) => (h.isPoor() ? 0.6 : 0.15),
      },
    ],
  },
  {
    id: 'youth_drink_first',
    title: '傳到你手上的杯子',
    ages: [15, 19],
    major: true,
    weight: 0.8,
    tags: ['friends', 'health'],
    cond: (s, h) => !h.isReligion('muslim') && (h.urban() || h.incomeAtLeast('LM')),
    text: (s, h) => '朋友家的大人不在，桌上擺著一瓶沒開過的酒。有人說「就一杯嘛」，杯子在你們之間傳來傳去，剛好傳到你手上，杯壁上還留著別人的手溫。',
    choices: [
      {
        label: '喝一口，嚐嚐看',
        effects: { social: +3, health: -1, happiness: +1 },
        set: ['y_drank'],
        result: '味道比想像中難喝。第二口你皺著眉頭，朋友們大笑。你只喝了兩口，卻覺得整個世界在輕輕搖晃。',
        ai: (s, h) => 0.5 + h.stat('social') / 100 + (h.male() ? 0.2 : 0),
      },
      {
        label: '把杯子遞給下一個人，說不想喝',
        effects: { social: -1, happiness: +1 },
        result: '你說：「我不太想。」沒人逼你，大家很快轉去討論別的事。你突然覺得，拒絕其實比想像中容易。',
        ai: (s, h) => 2.2 - h.stat('social') / 100,
      },
      {
        label: '拿著杯子，假裝喝',
        effects: { social: +1 },
        result: '你把杯子端在嘴邊，一滴也沒喝。結束時杯子裡的酒還是滿的，沒人察覺，你覺得自己像個小偷。',
        ai: 1,
      },
    ],
  },
  {
    id: 'youth_quit_smoking_try',
    title: '第三次戒菸',
    ages: [16, 22],
    major: true,
    weight: 1.5,
    tags: ['health', 'habit'],
    cond: (s, h) => h.isSmoker(),
    text: (s, h) => '你的菸盒已經空了一半。昨天爬三樓的樓梯，你竟然喘得要停下來。朋友笑你是老人，你自己卻笑不太出來。你把菸盒放在桌上，看了很久。',
    choices: [
      {
        label: '下定決心，一根不碰',
        effects: (s, h) => {
          if (h.chance(0.45)) { h.quitSmoking(); h.change('health', +3); h.change('happiness', +3); h.set('y_quit_smoking'); }
          else { h.change('happiness', -2); h.unset('y_quit_smoking'); }
        },
        result: (s, h) => (h.has('y_quit_smoking')
          ? '前兩個星期，你的手指一直在找東西握。第三個星期，你發現自己居然聞得到早晨空氣的味道。你把空菸盒丟進垃圾桶，丟得很用力。'
          : '三天後，你又點起了那一根。朋友遞火過來時你有點慚愧，也有點釋然：至少，你試過了。'),
        highlight: (s, h) => (h.has('y_quit_smoking') ? '少年時戒了菸。' : null),
        ai: 1.8,
      },
      {
        label: '減量就好，慢慢來',
        effects: { health: +1, happiness: 0 },
        result: '你規定自己一天最多三根。第一個月做到了，第二個月偶爾破功，但至少你開始在意了。',
        ai: 1,
      },
      {
        label: '算了，下次再說',
        effects: { happiness: +1, health: -1 },
        result: '你把菸盒收回口袋。那天晚上你抽得特別慢，每一口都有種「我知道」的味道。',
        ai: 0.7,
      },
    ],
  },

  // =====================================================================================
  // 升學、工作與出路（major）
  // =====================================================================================
  {
    id: 'youth_track_choice',
    title: '三條路',
    ages: [14, 16],
    major: true,
    weight: 3,
    tags: ['school', 'future'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 8 && h.eduYears() <= 10 && (h.isRegion('EUR', 'EAS', 'OCE', 'NAM') || h.incomeAtLeast('UM')),
    text: (s, h) => '國中畢業在即，三條路攤在你面前：升普通高中、讀職業學校，或進入企業學徒制。每一條路的盡頭都亮著光，只是你不確定哪一束屬於你。',
    choices: [
      {
        label: '升普通高中，朝大學前進',
        effects: { knowledge: +3, happiness: -1 },
        set: ['y_track_academic'],
        result: '你選了書桌最多的那條路。往後三年的作息被考試切成一格一格，但你知道，這條路的出口很寬。',
        ai: (s, h) => (h.stat('knowledge') > 25 ? 1.6 : 1),
      },
      {
        label: '讀職業學校，學一門手藝',
        effects: { knowledge: +2, wealth: +2, social: +1 },
        set: ['y_track_vocational'],
        result: '第一次拿起焊槍的那天，你的手在發抖。老師說：「不用怕，它不會咬人。」三個月後，你已經能做出一件像樣的成品。',
        ai: 1.5,
      },
      {
        label: '進入學徒制，邊學邊賺',
        cond: (s, h) => h.isRegion('EUR', 'OCE', 'EAS', 'NAM'),
        effects: { wealth: +3, knowledge: +1, social: +2 },
        set: ['y_track_apprentice'],
        result: '每週三天你在師傅身邊做事，兩天在學校上課。第一個月被罵得體無完膚，第二個月，你開始被罵得有道理。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'youth_vocational_training',
    title: '技職訓練班的簡章',
    ages: [15, 21],
    major: true,
    weight: 2,
    tags: ['school', 'work'],
    cond: (s, h) => !h.inSchool() && h.eduYears() < 13 && h.wealthQ() <= 4 && (h.employed() || h.workStatus() === 'none' || h.unemployed()),
    text: (s, h) => `${h.eduYears() > 0 ? '你離開學校已經一段時間了。' : '你從來沒有好好念過書，這件事偶爾還是會在夜裡冒出來。'}公布欄上貼著技職訓練班的簡章：木工、電腦、裁縫、汽車修護。費用不高，但要占用你工作的時間，你把簡章讀了三遍，還是沒辦法立刻做決定。`,
    choices: [
      {
        label: '報名技職訓練',
        effects: { knowledge: +3, wealth: -2, happiness: +2 },
        set: ['y_vocational'],
        result: '你每週三個晚上去上課，手上的繭一層疊一層。結訓那天，講師遞給你一張寫著你名字的證書，蓋了紅色的印章。',
        highlight: '完成技職訓練。',
        ai: 1.8,
      },
      {
        label: '繼續工作，把賺錢放第一',
        effects: { wealth: +2, happiness: -1 },
        result: (s, h) => `你想：書讀得再多也不能馬上換成米。你把省下的時間全拿去${h.wageEarner() ? '加班' : '找零工'}，存摺的數字慢慢往上爬。`,
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.8),
      },
      {
        label: '找師傅拜師學藝',
        effects: { knowledge: +2, wealth: +1, social: +2 },
        set: ['y_apprentice_master'],
        result: '你在師傅的店門口站了兩天，他終於問：「你吃得了苦嗎？」你說吃得了。他丟給你一把掃帚。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'youth_night_class',
    title: '下班後的夜校',
    ages: [16, 22],
    major: true,
    weight: 2,
    tags: ['school', 'work', 'chain'],
    cond: (s, h) => h.workStatus() === 'employed' && !h.inSchool() && h.eduYears() < 12,
    text: (s, h) => '下班後，同事邀你一起去夜校補完中學課程。你的腳踝站了一天而發脹，但公告上寫著：畢業證書，可以用來找更好的工作。你拖著疲憊的身體站在公告前，站了很久，直到工廠的下班鈴聲都響了。',
    choices: [
      {
        label: '報名夜校，辛苦一點',
        effects: (s, h) => { h.enroll('secondary', { quiet: true }); h.change('knowledge', +4); h.change('health', -3); h.change('happiness', -1); },
        set: ['y_night_class'],
        result: '你第一天上課就睡著了，被老師點名驚醒。第二天你灌了兩杯濃茶。接下來的日子，你的眼袋大得可以裝東西，卻也寫完了第一份作業。',
        schedule: [{ id: 'youth_night_class_cert', inYears: [2, 4] }],
        ai: 1.6,
      },
      {
        label: '先存錢，之後再說',
        effects: { wealth: +2 },
        result: '你把報名單折好放進抽屜，告訴自己下學期再去。可你也知道，下一個學期，總是很快變成下一年。',
        schedule: [{ id: 'youth_night_class_cert', inYears: [2, 4] }],
        ai: 1,
      },
      {
        label: '改上線上或週末班，慢慢來',
        cond: (s, h) => h.year() >= 2010,
        effects: (s, h) => { h.enroll('secondary', { quiet: true }); h.change('knowledge', +2); h.change('health', -1); },
        set: ['y_night_class'],
        result: '你用手機看影片課程，一堂堂慢慢追。進度慢，卻不會讓你累垮。有一天你交出了第一份通過的小測驗，那種喜悅很安靜，卻很穩。',
        schedule: [{ id: 'youth_night_class_cert', inYears: [2, 4] }],
        ai: 1.3,
      },
    ],
  },
  {
    id: 'youth_city_job_offer',
    title: '城裡的工作',
    ages: [14, 19],
    major: true,
    weight: 2.5,
    tags: ['work', 'migration', 'hardship', 'chain'],
    cond: (s, h) => (h.income() === 'L' || h.income() === 'LM') && h.wealthQ() <= 3 && !h.has('y_city_job') && !h.married(),
    text: (s, h) => '同鄉的人從城裡回來，說工廠、餐館和工地都缺人，包吃包住，一個月的工資是家裡半年的收入。他們講得天花亂墜，你的心卻有點發毛：誰知道那是什麼地方。',
    choices: [
      {
        label: '跟著去城裡打工',
        effects: (s, h) => {
          if (h.inSchool()) h.dropOut();
          if (!h.employed()) h.startJob(h.pick(['factory', 'laborer', 'cook']));
          h.change('wealth', +4); h.change('knowledge', -2); h.change('social', -3); h.change('happiness', -1); h.change('health', -2);
          if (h.chance(0.3)) h.set('y_city_job_bad');
        },
        set: ['y_city_job'],
        result: '你坐上了前往城裡的巴士，行李袋裡塞著大人縫好的內衣和一包乾糧。車窗外的田野向後退，你悄悄用手背擦了擦眼睛。',
        schedule: [{ id: 'youth_city_job_aftermath', inYears: [1, 3] }],
        ai: (s, h) => (h.isPoor() ? 1.6 : 0.6),
      },
      {
        label: '先打聽清楚實情再說',
        effects: { knowledge: +1, social: +1, happiness: -1 },
        result: (s, h) => `你向${h.inSchool() ? '老師和鄰居' : '長輩和鄰居'}打聽，找到一位去過的人。他搖搖頭，講了很多你從沒聽過的事。你決定先不去，這個決定讓你心裡踏實了一些。`,
        ai: 1.5,
      },
      {
        label: '說服家人，讓你繼續念書',
        cond: (s, h) => h.inSchool(),
        effects: { knowledge: +2, happiness: -1, wealth: -1 },
        result: '你和大人談了一個晚上，保證會把書念好。他們沒有答應，也沒有拒絕，只說：「先看這學期。」',
        ai: (s, h) => (h.stat('knowledge') > 35 ? 1.5 : 0.8),
      },
    ],
  },
  {
    id: 'youth_farm_season',
    title: '農忙遇上考試',
    ages: [13, 18],
    major: true,
    weight: 2,
    tags: ['school', 'family', 'regional'],
    cond: (s, h) => h.inSchool() && !h.urban() && !h.incomeAtLeast('H') && h.parentsAlive() >= 1,
    text: (s, h) => '期中考的前一週，正好是搶收的時節。大人出門前說：「這幾天田裡缺人。」書桌上攤著你還沒讀完的課本，窗外的天色一天比一天金黃。',
    choices: [
      {
        label: '請假幫忙收割',
        effects: { wealth: +3, health: -2, knowledge: -3, social: +2 },
        result: '你在泥巴裡奮戰了四天，手心全是水泡。收成進倉的那晚，大人煮了一鍋好菜：「有你在，快多了。」你的成績單後來有些難看。',
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.8),
      },
      {
        label: '照常考試，晚上再補工',
        effects: { knowledge: +1, health: -3, happiness: -1, wealth: +1 },
        result: '你白天考試，晚上摸黑割到九點。考卷上的字在眼前晃，你卻撐了下來。大人偷偷把最大的一塊肉夾進你碗裡。',
        ai: 1.5,
      },
      {
        label: '和大人商量：平日讀書，週末全力幫忙',
        effects: { knowledge: -1, wealth: +2, social: +1 },
        result: '你提議週末全力幫忙，平日他們少安排你。大人想了想，居然同意了。這是你第一次發現，家裡的決定也可以商量。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'youth_scholarship_essay',
    title: '獎學金申請書',
    ages: [16, 19],
    major: true,
    weight: 4,
    tags: ['school', 'money', 'chain'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 9 && h.wealthQ() <= 3 && h.incomeAtLeast('LM') && h.stat('knowledge') >= 30,
    text: (s, h) => '導師推薦你申請一項獎學金。申請書上有一欄寫著：「請說明你為什麼需要這筆獎學金。」你握著筆，不知道要把貧窮寫得多真，才不會像在討同情。',
    choices: [
      {
        label: '誠實寫下家裡的處境和夢想',
        effects: (s, h) => { h.change('happiness', +1); h.change('knowledge', +2); if (h.chance(0.55)) h.set('y_scholarship_won'); else h.unset('y_scholarship_won'); },
        result: '你寫了家裡窗戶漏雨、夜裡只有一盞小燈，也寫了你為什麼想當工程師。寫完時你哭了，把稿紙壓在課本底下，不好意思給別人看。',
        schedule: [{ id: 'youth_scholarship_result', inYears: [0, 1] }],
        ai: 2,
      },
      {
        label: '寫得漂亮而安全，強調成績',
        effects: (s, h) => { h.change('knowledge', +2); if (h.chance(0.4)) h.set('y_scholarship_won'); else h.unset('y_scholarship_won'); },
        result: '你把成績、獎狀、參加過的比賽一項項列出，寫得像一份履歷。交出去的時候，你不確定它有沒有靈魂。',
        schedule: [{ id: 'youth_scholarship_result', inYears: [0, 1] }],
        ai: 1.2,
      },
      {
        label: '放棄申請，覺得自己不配',
        effects: { happiness: -3 },
        result: '你把表格塞進抽屜最深處。導師後來問起，你笑著說「再想想」。其實你知道，你不是不想要，是不敢要。',
        ai: 0.4,
      },
    ],
  },
  {
    id: 'youth_choose_major',
    title: '志願表',
    ages: [17, 19],
    major: true,
    weight: 4,
    tags: ['school', 'future', 'chain'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 11 && h.eduYears() <= 12 && h.incomeAtLeast('LM'),
    text: (s, h) => '志願表像一張地圖，每個格子都通往不同的人生。大人希望你填「穩定的」科系，而你的心偷偷停在另一欄。截止日期是明天中午。你把志願卡寫了又擦，橡皮擦屑落了一桌。',
    choices: [
      {
        label: '依大人期望，選熱門穩定的科系',
        effects: { wealth: +2, happiness: -2, knowledge: +2 },
        set: ['y_major_practical'],
        result: '你填下那個「會有出路」的志願。大人鬆了一口氣，你笑著說謝謝，笑容卻像填志願那晚的月亮一樣淡。',
        schedule: [{ id: 'youth_major_doubt', inYears: [2, 4] }],
        ai: 1.5,
      },
      {
        label: '選自己真正喜歡的',
        effects: { happiness: +4, wealth: -2, knowledge: +2 },
        set: ['y_major_passion'],
        result: '你把志願卡遞出去的時候，手在發抖。大人沉默了一會兒說：「如果你想清楚了，就去吧。」那句話比任何祝福都沉。',
        schedule: [{ id: 'youth_major_doubt', inYears: [2, 4] }],
        ai: 1.5,
      },
      {
        label: '折衷，選一個兩邊都說得過去的',
        effects: { happiness: +1, knowledge: +2 },
        set: ['y_major_middle'],
        result: '你反覆比較，最後選了一個大家都覺得「還可以」的科系。你不確定這是智慧還是妥協，但至少，每個人都睡得著。',
        schedule: [{ id: 'youth_major_doubt', inYears: [2, 4] }],
        ai: 1.3,
      },
    ],
  },
  {
    id: 'youth_retake_year',
    title: '沒有名字的放榜',
    ages: [17, 22],
    major: true,
    weight: 5,
    tags: ['school', 'hardship'],
    cond: (s, h) => h.seenEvent('seed_exam_result') && !h.has('exam_passed') && !h.has('y_retake') && h.yearsSince('seed_exam_result') <= 1,
    text: (s, h) => '放榜後，你沒有被任何想去的學校錄取。家裡很安靜，連電視都被關小了聲音。大人說：「再讀一年也行，我們支持你。」你卻覺得這句話比責備更重。',
    choices: [
      {
        label: '重考一年',
        effects: { knowledge: +4, happiness: -3, wealth: -1, health: -1 },
        set: ['y_retake'],
        result: '你回到補習班和圖書館，週間複習，週末模擬考。第二次放榜時，你不再期待奇蹟，只想不要辜負自己。',
        ai: (s, h) => (h.incomeAtLeast('UM') ? 1.5 : 0.8),
      },
      {
        label: '轉往次一志願的學校或技職',
        effects: { knowledge: +2, happiness: -1 },
        set: ['y_retake'],
        result: '你填了另一所學校。朋友們分散各地，你看著自己的新校門，有種被丟進陌生海域的感覺，卻也有點期待。',
        ai: 1.5,
      },
      {
        label: '先去工作，之後再說',
        effects: { wealth: +3, knowledge: -1, happiness: -1 },
        set: ['y_retake'],
        result: '你在布告欄上找到第一份工作。薪水不高，但發薪日的感覺很好。你暫時把那個沒填上的志願，放進了抽屜。',
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.8),
      },
    ],
  },
  {
    id: 'youth_study_abroad',
    title: '交換學生的名額',
    ages: [18, 21],
    major: true,
    weight: 3,
    tags: ['school', 'abroad'],
    cond: (s, h) => h.inSchool() && h.eduYears() >= 12 && (h.incomeAtLeast('UM') || h.has('y_scholarship_won')) && h.wealthQ() >= 2,
    text: (s, h) => '學校公告了交換學生名額：一個學期，到另一個國家的校園生活。報名截止日是這週五。你把申請書打開了又關上三次，連飯都吃不下，只想著機場的燈光是什麼樣子。',
    choices: [
      {
        label: '申請，出發',
        effects: { knowledge: +4, social: +3, wealth: -3, happiness: +3 },
        set: ['y_exchange'],
        result: '你拖著行李箱走進陌生的機場，用不太流利的外語問路，被善意地糾正。學期結束時，你有了新的口音，和三個再也忘不掉的朋友。',
        highlight: '到另一個國家當交換學生。',
        ai: (s, h) => (h.isRich() || h.incomeAtLeast('H') ? 2.4 : 1.2) + h.stat('knowledge') / 100,
      },
      {
        label: '擔心費用和語言，不去',
        effects: { wealth: +1, happiness: -2 },
        result: '你把申請書收進抽屜。朋友出發那天你去送機，笑著說「記得寄明信片」，回家的路上你把耳機音量調得很大。',
        ai: (s, h) => (h.isPoor() ? 1.6 : 0.5),
      },
      {
        label: '先去找補助與前輩，再決定',
        effects: { knowledge: +1, social: +1 },
        set: ['y_exchange_wait'],
        result: '你找了系辦、問了學長姊，拼湊出一份補助計畫。結果還沒出來，但光是認真研究過這件事，就讓你覺得世界沒那麼遠。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'youth_gap_year',
    title: '畢業以後的空白',
    ages: [18, 20],
    major: true,
    weight: 3,
    tags: ['future', 'travel'],
    cond: (s, h) => !h.inSchool() && h.eduYears() >= 12 && h.incomeAtLeast('UM') && h.wealthQ() >= 3,
    text: (s, h) => '高中畢業了，你面前沒有一條現成的路。朋友有的準備上大學，有的準備工作，而你的心在一個叫「先走走看」的地方徘徊，夜裡一再翻開世界地圖，看了又看。',
    choices: [
      {
        label: '背包旅行，認識世界',
        effects: { knowledge: +3, social: +3, wealth: -3, happiness: +4 },
        result: '你在青年旅社的上鋪睡了六個月，在陌生城市迷路又找到路。回來時你曬黑了一圈，也比出發時更知道自己討厭什麼。',
        ai: (s, h) => (h.isRich() ? 1.8 : 0.9),
      },
      {
        label: '去當志工或換宿打工',
        effects: { knowledge: +2, social: +3, happiness: +3, wealth: -1 },
        result: '你在陌生的村莊教孩子們英文，教得很爛，卻被孩子用整籃水果和歌聲送別。',
        ai: 1.5,
      },
      {
        label: '直接工作，賺學費',
        effects: { wealth: +4, knowledge: +1, happiness: -1 },
        result: '你找了一份全職工作。每個月看著存款往上爬，你學到的不是技能，而是一種「錢需要時間」的踏實。',
        ai: (s, h) => (h.isRich() ? 0.8 : 1.6),
      },
    ],
  },
  {
    id: 'youth_contest',
    title: '代表學校出賽',
    ages: [13, 18],
    major: true,
    weight: 0.9,
    tags: ['school', 'challenge'],
    cond: (s, h) => h.inSchool() && h.stat('knowledge') >= 15,
    text: (s, h) => '老師問你要不要代表學校參加一場比賽，可能是科學、辯論，也可能是運動。你很想去，又怕輸，更怕大家的期待。報名單躺在桌上，筆就放在旁邊。',
    choices: [
      {
        label: '報名，認真準備',
        effects: (s, h) => {
          if (h.chance(0.3 + h.stat('knowledge') / 250)) { h.change('social', +4); h.change('happiness', +5); h.change('knowledge', +3); h.set('y_contest_win'); }
          else { h.change('knowledge', +3); h.change('happiness', -1); h.change('social', +1); h.unset('y_contest_win'); }
        },
        result: (s, h) => (h.has('y_contest_win')
          ? '宣布名次的那一刻，你聽見自己的名字從喇叭裡傳出來，耳朵嗡了一下。全校在升旗台下為你鼓掌，你覺得腳不太著地。'
          : '你沒有拿到名次，但準備的那幾個月，你學到的東西比任何一場考試都多。評審對你說：「明年再來。」'),
        highlight: (s, h) => (h.has('y_contest_win') ? '在校際比賽中獲獎。' : null),
        ai: (s, h) => 0.8 + h.stat('knowledge') / 50,
      },
      {
        label: '報名，但抱著玩玩的心情',
        effects: { knowledge: +1, happiness: +2, social: +2 },
        result: '你輕鬆上場，輸贏都說得過去。結束後主辦單位送了每人一支筆，你拿著它走在回家的路上，竟覺得整個傍晚都是紀念品。',
        ai: 1.5,
      },
      {
        label: '婉拒，怕給大家丟臉',
        effects: { happiness: -2, social: -1 },
        result: '你把報名單推回去。事後看到別人站上台，你在台下鼓掌，掌心發熱，不知道是為了他們，還是為了自己沒鼓起的勇氣。',
        ai: (s, h) => (h.stat('social') < 35 ? 1.0 : 0.4),
      },
    ],
  },
  {
    id: 'youth_game_night',
    title: '再一場就好',
    ages: [13, 19],
    major: true,
    weight: 0.9,
    tags: ['tech', 'friends', 'school'],
    cond: (s, h) => h.year() >= 1982 && h.inSchool() && (h.urban() || h.incomeAtLeast('UM')),
    text: (s, h) => {
      if (!h.techReady(1998)) return '電動玩具店的燈光五顏六色，你和朋友把零用錢換成一枚枚代幣。老闆娘在櫃檯後翻著報紙，每次你要離開，都有人說「再一場」，於是你的零用錢，總是比你以為的消失得更快。';
      if (!h.techReady(2013)) return '網咖的燈光昏暗，鍵盤聲此起彼落。你和朋友組隊打到凌晨，離考試只剩十天，你才發現時間是怎麼溜走的。';
      return '你和朋友的線上隊伍，每晚固定在同一個時間上線。有人說「再一場就睡」，已經說了五次。離考試還有十天。桌上的課本已經厚厚一層灰，你決定今晚再讀一下，就一下。';
    },
    choices: [
      {
        label: '玩通宵，反正只有現在',
        effects: { happiness: +4, social: +3, knowledge: -3, health: -3 },
        result: '那一夜你們贏了三場、輸了兩場，天亮時你的眼睛像兔子。你笑到肚子痛，但第二天的小考，只拿了一半的分數。',
        ai: (s, h) => (h.stat('knowledge') < 25 ? 1.4 : 0.8),
      },
      {
        label: '約好玩到十一點就收',
        effects: { happiness: +2, social: +2 },
        result: '你們用鬧鐘當裁判，鈴聲響起時有人大喊「不公平」，但還是都下線了。你睡了足足八個小時。',
        ai: 2,
      },
      {
        label: '暫時退出，先顧考試',
        effects: { knowledge: +3, social: -2, happiness: -1 },
        result: '你關掉遊戲，把書攤開。朋友們調侃你「叛變了」，你一邊笑一邊翻開下一頁。',
        ai: (s, h) => (h.stat('knowledge') > 40 ? 1.8 : 0.8),
      },
    ],
  },
  {
    id: 'youth_phone_rules',
    title: '貼在冰箱上的規則',
    ages: [12, 16],
    major: true,
    weight: 1.0,
    tags: ['tech', 'family'],
    cond: (s, h) => h.year() >= 2010 && h.incomeAtLeast('LM') && h.stat('wealth') > 35 && h.parentsAlive() >= 1,
    text: (s, h) => `你拿到人生第一${h.year() >= 2042 ? '個自己的智慧手環' : '支自己的手機'}。大人把規則寫在一張紙上貼在冰箱：晚上十點交出來、不准加陌生人、${h.inSchool() ? '功課先做完' : '該做的事先做完'}。你看著那張紙，沒有說話。`,
    choices: [
      {
        label: '接受規則，準時交出',
        effects: { health: +2, knowledge: +1, social: -1 },
        set: ['y_phone_rules'],
        result: '你把它放在客廳的充電盤上。第一週你像戒斷反應般煩躁，第二週，你發現自己多讀了兩章書，也多睡了一個小時。',
        ai: (s, h) => 1 + h.stat('knowledge') / 80,
      },
      {
        label: '表面答應，半夜偷偷用',
        effects: { happiness: +2, social: +2, health: -3, knowledge: -1 },
        set: ['y_phone_secret'],
        result: '你把它藏在被窩裡，螢幕的光把棉被照成一座小小的帳篷。好玩是好玩，但隔天早上你整個人像被抽掉了電。',
        ai: (s, h) => 1.4 - h.stat('knowledge') / 120,
      },
      {
        label: '跟大人談條件，一起改規則',
        effects: { happiness: +1, social: +1, knowledge: +1 },
        result: (s, h) => `你們坐下來談了半個小時。最後的規則是：吃飯時不看、${h.inSchool() ? '考試週交出' : '忙的時候交出'}、週末彈性。你第一次覺得自己被當成能談判的大人。`,
        ai: 1.5,
      },
    ],
  },
  {
    id: 'youth_social_media',
    title: '動態牆上的人生',
    ages: [13, 19],
    major: true,
    weight: 1.0,
    tags: ['tech', 'identity', 'chain'],
    cond: (s, h) => h.year() >= 2012 && h.incomeAtLeast('LM') && h.stat('wealth') > 35,
    text: (s, h) => '動態牆上，每個人都在度假、聚會、和好看的人合照。你滑著滑著，覺得自己的生活像一張沒有加濾鏡的照片。按出去的讚越來越多，心裡的空位也越來越大。',
    choices: [
      {
        label: '暫時刪掉軟體',
        effects: { happiness: +1, health: +2, social: -2 },
        set: ['y_deleted_app'],
        result: '你把軟體拖進垃圾桶，手指在原本的位置上空按了好幾次。三天後你才習慣，七天後你發現，晚霞原來每天都在。',
        schedule: [{ id: 'youth_offline_summer', inYears: [1, 2] }],
        ai: (s, h) => (h.stat('happiness') < 45 ? 1.8 : 0.8),
      },
      {
        label: '繼續滑，只是默默比較',
        effects: { happiness: -3, social: +1, health: -1 },
        result: '你又滑了兩個小時，直到眼睛發酸。放下手機時房間很安靜，你不確定剛才看見的，哪一部分是真的。',
        ai: (s, h) => (h.stat('happiness') < 45 ? 0.8 : 1.6),
      },
      {
        label: '發一則不修飾的日常',
        effects: { happiness: +3, social: +3 },
        result: '你發了一張沒對焦的晚餐照，寫上「今天的便當有點難吃」。朋友們紛紛留言「我也是」，你忽然覺得，原來大家都一樣。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'youth_ai_tutor',
    title: '會講解的家教',
    ages: [13, 19],
    major: true,
    weight: 1.1,
    tags: ['tech', 'school', 'chain'],
    cond: (s, h) => h.year() >= 2030 && h.inSchool() && h.incomeAtLeast('LM'),
    text: (s, h) => '學校配發的 AI 家教二十四小時待命。你卡在一題幾何證明上，只要問一句，答案就跳出來，乾淨、有條理、毫不遲疑。交作業前你猶豫了：這是你自己想出來的嗎？',
    choices: [
      {
        label: '請它一步步引導，自己寫出來',
        effects: { knowledge: +4, happiness: -1 },
        set: ['y_ai_guided'],
        result: '你討厭它一直問「你覺得下一步是什麼」，卻在第三次回答時忽然開竅。那題證明，你一直記到考試。',
        schedule: [{ id: 'youth_ai_exam_check', inYears: [1, 2] }],
        ai: 1.5,
      },
      {
        label: '直接複製答案，節省時間',
        effects: { knowledge: -2, happiness: +2 },
        set: ['y_ai_copied'],
        result: '作業一秒完成，你多睡了一個小時。你告訴自己這叫效率，只是月考前打開空白的卷子時，那種熟悉的茫然又回來了。',
        schedule: [{ id: 'youth_ai_exam_check', inYears: [1, 2] }],
        ai: 1,
      },
      {
        label: '關掉它，用紙筆慢慢寫',
        effects: { knowledge: +2, happiness: -1, health: +1 },
        result: '你用鉛筆在紙上畫了一個又一個失敗的圖形。慢，非常慢，但每個圖形都是自己的。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'youth_ai_companion',
    title: '深夜的對話',
    ages: [14, 22],
    major: true,
    weight: 1.0,
    tags: ['tech', 'social'],
    cond: (s, h) => h.year() >= 2038 && h.incomeAtLeast('LM'),
    text: (s, h) => '你的 AI 夥伴記得你喜歡的歌、害怕的事，還有你上週隨口說的一個沒人在意的笑話。夜深時，你發現自己跟它說的話，比跟任何一位朋友都多。',
    choices: [
      {
        label: '繼續依賴它，這樣最輕鬆',
        effects: { happiness: +2, social: -4 },
        result: '它從不批評，從不遲到。朋友邀你出門時，你開始用「改天」代替「好」。',
        ai: 1,
      },
      {
        label: '把它當工具，也約朋友見面',
        effects: { happiness: +1, social: +3 },
        result: '你把和它的對話整理成要跟朋友分享的笑話。朋友們笑得東倒西歪，其中一位說：「你怎麼變得比以前好笑？」',
        ai: 2,
      },
      {
        label: '設定使用時間，去現實裡練習聊天',
        effects: { social: +2, happiness: -1, knowledge: +1 },
        result: '你關掉通知，去了一場你一點也不想去的聚會。結果很尷尬，很糟糕，但最後有一個人問了你的名字。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'youth_faith_questions',
    title: '問太多為什麼',
    ages: [15, 21],
    major: true,
    weight: 0.8,
    tags: ['identity', 'culture'],
    text: (s, h) => '長輩教你的那些信仰與傳統，你從小到大沒有懷疑過。最近你卻開始問「為什麼」，問得有點不太禮貌。有人說你變了，有人說你終於長大了。',
    choices: [
      {
        label: '向敬重的長輩坦率請教',
        effects: { knowledge: +3, social: +1, happiness: +1 },
        result: '你找了一位你敬重的長輩，把心裡的疑問一條條擺在桌上。他沒有立刻回答，只說：「這些問題問得好。」你們聊了三個鐘頭，聊完你覺得輕了一些。',
        ai: 1.5,
      },
      {
        label: '自己閱讀、思考，不急著下結論',
        effects: { knowledge: +4, social: -1 },
        result: '你借了好多不同的書，在夜裡默默讀完。你的立場沒有大轉彎，但說話的方式變得更慢，也更溫柔。',
        ai: (s, h) => 0.8 + h.stat('knowledge') / 50,
      },
      {
        label: '依然照傳統，把疑問先收起來',
        effects: { social: +2, happiness: -1 },
        result: '你繼續跟著家人進行每一項儀式，在人群中低聲跟著唸誦。疑問沒有消失，只是被你放進一個安靜的抽屜，等待哪天長大。',
        ai: 1,
      },
    ],
  },
  {
    id: 'youth_between_cultures',
    title: '兩邊的客人',
    ages: [13, 19],
    major: true,
    weight: 5,
    tags: ['identity', 'migration', 'chain'],
    cond: (s, h) => h.has('c_bilingual_home') || h.isMigrant(),
    text: (s, h) => `${h.inSchool() ? '在學校' : '在外面'}，你說的是一種語言、吃的是另一種便當；回到家，剛好相反。有時你覺得自己像兩邊的借住客人：在這裡被問「你從哪裡來」，在那裡被說「你都不像我們了」。`,
    choices: [
      {
        label: '兩邊都珍惜，當兩邊的橋',
        effects: { social: +3, knowledge: +2, happiness: +1 },
        set: ['y_bridge'],
        result: '你開始替家人翻譯信件，也教身邊的朋友說幾句家裡的話。「你怎麼這麼厲害？」有人這麼問。你想了想，說：「因為我有兩個家。」',
        schedule: [{ id: 'youth_return_visit', inYears: [3, 6] }],
        ai: 2,
      },
      {
        label: '盡量融入這裡，少提過去',
        effects: { social: +2, happiness: -2, knowledge: +1 },
        set: ['y_blend'],
        result: '你換了說話的腔調，避開家裡的菜名。你被接納得更快，卻在某個深夜突然想念那碗湯的味道，想念得眼睛發熱。',
        schedule: [{ id: 'youth_return_visit', inYears: [3, 6] }],
        ai: 1,
      },
      {
        label: '守住家裡的語言與習俗',
        effects: { social: -1, happiness: +1 },
        set: ['y_cling'],
        result: '你和同鄉朋友形成了一個小圈子，節日一起過，食物一起吃。這個圈子溫暖如家，只是有時你會好奇，圈外的人在笑些什麼。',
        schedule: [{ id: 'youth_return_visit', inYears: [3, 6] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'youth_street_harassment',
    title: '回家的那段暗路',
    ages: [14, 22],
    major: true,
    weight: (s, h) => (h.female() ? 1.1 : 0.3),
    tags: ['safety', 'urban'],
    cond: (s, h) => h.urban(),
    text: (s, h) => '回家的路上，有人在身後一路說著讓你不舒服的話，越走越近。你的腳步不自覺加快，心跳聲壓過了耳機裡的音樂。路燈間隔很長，前面的轉角還有一段暗路。',
    choices: [
      {
        label: '轉身大聲要對方離開，引起旁人注意',
        effects: { happiness: +1, social: +1, health: -1 },
        result: '你轉身大聲說：「請你離我遠一點！」旁邊店家探出頭來，對方悻悻然走開。你的手在抖，但腰桿是直的。',
        ai: 1.3,
      },
      {
        label: '走進亮著燈的店，打電話請人來接',
        effects: { health: +1, happiness: -1, knowledge: +1 },
        result: (s, h) => `你推開${h.techReady(1985) ? '便利商店' : '雜貨店'}的門，假裝在挑飲料。店員看了你一眼，輕聲說：「需要幫忙嗎？」那句話讓你鼻子一酸。`,
        ai: 2,
      },
      {
        label: '繼續走，不回頭，到家再說',
        effects: { happiness: -3, health: -1 },
        result: '你一路快步走回家，鑰匙插了三次才進門。關上門之後，你靠著門板蹲下來，直到呼吸平穩。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'youth_gray_season',
    title: '隔了一層霧',
    ages: [14, 21],
    major: true,
    weight: 0.6,
    tags: ['mind', 'growing', 'chain'],
    text: (s, h) => '有一段時間，你什麼都提不起勁：醒著疲倦，睡著也不安穩。朋友的笑話你只能笑到一半，笑到一半就累了。你不知道這是什麼，只知道世界好像隔了一層霧。',
    choices: [
      {
        label: '告訴一個你信任的人',
        effects: { happiness: +3, social: +2 },
        set: ['y_told_someone'],
        result: (s, h) => `你在${h.inSchool() ? '放學後' : h.wageEarner() ? '下班後' : '晚飯後'}留下，對${h.inSchool() ? '導師、朋友或家人' : '朋友或家人'}說出那些很難說的話。對方沒有急著說「想開點」，只是點頭，說：「我在。」`,
        schedule: [{ id: 'youth_gray_after', inYears: [1, 2] }],
        ai: (s, h) => (h.stat('social') > 45 ? 2 : 1),
      },
      {
        label: '用運動、音樂或創作撐過去',
        effects: { health: +2, happiness: +1 },
        set: ['y_kept_busy'],
        result: '你每天早晨去跑步，耳機裡放著同一張專輯。累的時候你就哭，哭完擦擦汗繼續跑。霧沒有一下子散，卻一點一點變薄。',
        schedule: [{ id: 'youth_gray_after', inYears: [1, 2] }],
        ai: 1.3,
      },
      {
        label: '把自己關起來，誰也不說',
        effects: { happiness: -4, social: -3, health: -1 },
        set: ['y_withdrew'],
        result: '你不回訊息、不赴約，把房門鎖上。時間變得很慢，慢到你開始擔心它不再前進。',
        schedule: [{ id: 'youth_gray_after', inYears: [1, 2] }],
        ai: (s, h) => (h.stat('social') < 35 ? 1.4 : 0.4),
      },
    ],
  },

  // =====================================================================================
  // 後續事件（只由 schedule 觸發）
  // =====================================================================================
  {
    id: 'youth_secret_found_out',
    title: '藏不住的事',
    ages: [13, 24],
    weight: 0,
    tags: ['followup', 'love', 'family'],
    text: (s, h) => `大人整理你房間時，看到了${h.year() < 2005 ? '藏起來的信' : '手機螢幕上跳出的訊息'}。晚上，他們把你叫到餐桌邊。出乎意料，沒有人大吼，只是沉默很久，然後有人問：「你為什麼不早點說？」`,
    effects: { happiness: -2, social: +1, knowledge: +1 },
    unset: ['y_secret_romance'],
  },
  {
    id: 'youth_sneak_caught',
    title: '客廳的那盞燈',
    ages: [13, 20],
    weight: 0,
    tags: ['followup', 'family'],
    text: (s, h) => '那晚在客廳等你的大人，後來沒有罵你，只是問：「你知不知道，我們在擔心什麼？」你看見他眼裡的疲倦，才第一次明白，所謂規則，有時只是別人不敢說出口的害怕。你說了對不起，是真心的。',
    effects: { happiness: -2, social: +1, knowledge: +1 },
    unset: ['y_sneaked_out'],
  },
  {
    id: 'youth_friend_after',
    title: '朋友後來',
    ages: [14, 24],
    weight: 0,
    tags: ['followup', 'friends'],
    text: (s, h) => {
      if (h.has('y_confronted')) return '一年後，那位朋友在你生日那天，在你的書桌放了一個親手做的小玩意，附了一張字很醜的紙條：「對不起，我學到了。」你笑了，笑著笑著鼻子就酸了。';
      if (h.has('y_cooled_off')) return '你們花了很久才重新坐在同一張桌子。不再像以前那樣無話不談，但有了新的默契：有些秘密，你們都學會了怎麼守。';
      return '你在街上遇見他，兩個人都點了點頭，沒有多說什麼。你發現自己不再生氣，只是心裡多了一點空白，像一間搬走了家具的房間，回音很輕，但沒有想像中那麼難過。';
    },
    effects: (s, h) => {
      if (h.has('y_confronted')) { h.change('social', +3); h.change('happiness', +3); }
      else if (h.has('y_cooled_off')) { h.change('social', +2); h.change('happiness', +2); }
      else { h.change('happiness', +1); h.change('knowledge', +1); }
      h.unset('y_confronted'); h.unset('y_cooled_off');
    },
  },
  {
    id: 'youth_city_job_aftermath',
    followCond: (s, h) => h.wageEarner(),
    title: '城裡的日子',
    ages: [14, 24],
    weight: 0,
    tags: ['followup', 'work', 'migration'],
    text: (s, h) => (h.has('y_city_job_bad')
      ? `${h.isJob('factory', 'laborer') ? '工廠' : '雇主'}欠了你們兩個月的薪水，宿舍是十二人一間的鐵架床。你和幾個同鄉一起去找主管理論，最後拿回了大部分工錢。你學會了：簽名前，要把每一行字讀完。`
      : '你學會了操作機器，也交到第一批外地朋友。每個月你把一半的工資匯回家，大人回電話時，聲音總是特別高，像是在掩飾自己有多驕傲，也有多想念你。'),
    effects: (s, h) => {
      if (h.has('y_city_job_bad')) { h.change('wealth', +1); h.change('health', -3); h.change('happiness', -3); h.change('knowledge', +2); h.change('social', +2); }
      else { h.change('wealth', +3); h.change('social', +2); h.change('happiness', +1); }
      h.unset('y_city_job_bad');
    },
  },
  {
    id: 'youth_scholarship_result',
    followCond: (s, h) => h.inSchool(),
    title: '信封',
    ages: [15, 22],
    weight: 0,
    tags: ['followup', 'school', 'money'],
    text: (s, h) => (h.has('y_scholarship_won')
      ? '信封裡是一張薄薄的通知，上面寫著「恭喜」。你捏著它跑回家，大人看完，把它貼在牆上，貼得歪歪的，卻比任何獎狀都顯眼。'
      : '信封裡沒有你的名字。你一個人在操場坐了很久，後來導師找到你，說這次名額只有三個，下一次她會再替你寫推薦信。你點點頭，努力沒有哭，直到她走遠了才用袖子擦了擦臉。'),
    effects: (s, h) => {
      if (h.has('y_scholarship_won')) { h.change('wealth', +6); h.change('knowledge', +3); h.change('happiness', +6); h.highlight('拿到獎學金，得以繼續念下去。'); }
      else { h.change('happiness', -2); h.change('knowledge', +1); h.change('social', +1); }
    },
  },
  {
    id: 'youth_major_doubt',
    followCond: (s, h) => h.inTertiary(),
    title: '大二的疑問',
    ages: [18, 27],
    weight: 0,
    tags: ['followup', 'school', 'future'],
    text: (s, h) => {
      if (h.has('y_major_practical')) return '大二那年，你在期中考前夜盯著課本，忽然發現自己已經很久沒有因為某個知識而興奮了。你開始偷偷去旁聽別的系的課，像偷偷談一場戀愛。';
      if (h.has('y_major_passion')) return '你熱愛的科系，在大二才讓你看見現實：畢業後要靠它吃飯，並不容易。你開始同時思考，興趣和生計能怎麼並行。';
      return '你沒有特別喜歡，也沒有特別討厭。某個午後你在圖書館角落發現一本書，翻了一頁就放不下，忽然意識到：原來興趣，是這樣找到你的。';
    },
    effects: (s, h) => {
      if (h.has('y_major_practical')) { h.change('happiness', -2); h.change('knowledge', +2); }
      else if (h.has('y_major_passion')) { h.change('happiness', +1); h.change('wealth', -1); h.change('knowledge', +3); }
      else { h.change('happiness', +3); h.change('knowledge', +3); }
    },
  },
  {
    id: 'youth_night_class_cert',
    title: '補校的畢業證書',
    ages: [17, 28],
    weight: 0,
    followCond: (s, h) => h.employed(),
    tags: ['followup', 'school', 'work'],
    text: (s, h) => (h.has('y_night_class')
      ? '你拿到了補校的畢業證書。看見自己的名字印在紙上，原來這麼好看。老闆看過之後，把你的工作從搬運換成了管帳，你連續三天走路都像在飄。'
      : `${h.wageEarner() ? '同事' : '同班的人'}拿到補校畢業證書的那天，你在台下鼓掌。你默默想：也許明年。你把這個念頭收好，像收一張還沒用過的車票，也提醒自己：這一次，不再把它丟進抽屜。`),
    effects: (s, h) => {
      if (h.has('y_night_class')) { h.change('knowledge', +3); h.change('wealth', +3); h.change('happiness', +4); h.highlight('下班後念夜校，拿到畢業證書。'); }
      else { h.change('knowledge', +1); }
    },
  },
  {
    id: 'youth_gray_after',
    title: '霧散的早晨',
    ages: [14, 25],
    weight: 0,
    tags: ['followup', 'mind'],
    text: (s, h) => {
      if (h.has('y_told_someone')) return '半年後的某個早晨，你發現自己吃早餐時竟哼起了歌。你停下來愣了一下，然後微笑：原來，霧是會散的。';
      if (h.has('y_kept_busy')) return '你仍有低落的日子，但你學會了一套自己的方法：跑步、聽歌、寫字。那些方法像救生衣，不一定每次都有用，但你知道它們在。';
      return '直到有一天，有人敲了你的門，不問原因，只是帶來一鍋熱湯。你吃了一口，眼淚掉進碗裡。那天之後，你開始一點一點地，回到人群裡。';
    },
    effects: (s, h) => {
      if (h.has('y_told_someone')) { h.change('happiness', +4); h.change('health', +2); }
      else if (h.has('y_kept_busy')) { h.change('happiness', +3); h.change('knowledge', +1); }
      else { h.change('happiness', +2); h.change('social', +3); }
    },
  },
  {
    id: 'youth_offline_summer',
    title: '沒有螢幕的暑假',
    ages: [14, 22],
    weight: 0,
    tags: ['followup', 'tech', 'hobby', 'play'],
    text: (s, h) => '那個少了螢幕的暑假，你學會了騎很遠的腳踏車、跟朋友在樹下聊到被蚊子咬，也終於讀完了一直放在床頭的那本小說。回來以後，你覺得世界好像大了一圈。',
    effects: { happiness: +3, health: +2, knowledge: +2 },
    unset: ['y_deleted_app'],
  },
  {
    id: 'youth_ai_exam_check',
    followCond: (s, h) => h.inSchool(),
    title: '沒有工具的考試',
    ages: [14, 23],
    weight: 0,
    tags: ['followup', 'tech', 'school'],
    text: (s, h) => (h.has('y_ai_copied')
      ? '月考時沒有任何工具，你盯著題目，指尖發涼。你這才發現，那些「做過」的題目，其實你一點印象也沒有。'
      : '月考那天沒有任何工具，但你發現自己居然能在腦中一步步重現解題的思路。你突然有點感謝當初那個一直追問你的聲音，也為此高興了一整個下午。'),
    effects: (s, h) => {
      if (h.has('y_ai_copied')) { h.change('knowledge', +1); h.change('happiness', -3); h.change('social', -1); }
      else { h.change('knowledge', +3); h.change('happiness', +3); }
    },
  },
  {
    id: 'youth_return_visit',
    title: '第一次回到故鄉',
    ages: [16, 26],
    weight: 0,
    tags: ['followup', 'identity', 'migration'],
    text: (s, h) => '你第一次回到家人的故鄉。街上的招牌你只認得一半，市場的氣味讓你的鼻腔發酸。親戚們摸著你的臉說「你長這麼大了」，卻也笑你的口音。那一刻你想：原來兩邊都不是外人，兩邊也都不完全是家。',
    effects: { knowledge: +3, social: +2, happiness: +1 },
  },
  {
    id: 'youth_dream_check',
    title: '小時候的志願',
    ages: [11, 20],
    weight: 0,
    tags: ['followup', 'identity', 'school'],
    text: (s, h) => {
      if (h.has('c_dream_helper')) return '填生涯規劃表的那天，你想起小學時說過想當「醫生或老師」。你笑自己當年說得那麼簡單，但那顆小小的種子居然還在，只是長成了不同的樣子。';
      if (h.has('c_dream_star')) return '你看著小時候說要當的那個「很遠的夢」，覺得有點好笑，也有點難為情。可是當你唸出那個名字時，胸口還是熱了一下。';
      return `你小時候說，想守著家裡的${h.urban() ? '店' : '田'}。現在你看著大人的背影，才慢慢明白那句話裡藏著多少愛，也藏著多少妥協，於是你在家裡待得更久，幫他把沒做完的活兒做完。`;
    },
    effects: (s, h) => {
      h.change('happiness', +2);
      h.change('knowledge', h.has('c_dream_helper') ? +2 : +1);
      if (h.has('c_dream_home')) h.change('social', +2);
    },
  },
  {
    id: 'youth_cram_burnout',
    title: '補習班的燈',
    ages: [12, 20],
    weight: 0,
    followCond: (s, h) => h.inSchool(),
    tags: ['followup', 'school', 'health'],
    text: (s, h) => '補習班的燈光、考卷上的橡皮擦屑、一包又一包的咖啡。這學期你開始在課堂上打瞌睡，心跳偶爾會亂拍。老師看了你一眼，沒說什麼，在聯絡簿上寫了一行小字：「你有在睡覺嗎？」',
    effects: { health: -3, happiness: -3, knowledge: +1 },
    unset: ['c_cram'],
  },
  {
    id: 'youth_talent_audition',
    title: '徵選的通知',
    ages: [13, 22],
    major: true,
    weight: 0,
    tags: ['followup', 'talent'],
    text: (s, h) => '當年被老師看見的天分，如今走到了舞台前面。徵選通知寄到你手裡：機會只有一次，競爭者很多，失敗也可能教你很多事。你把通知折成小方塊放在口袋裡，夜裡又拿出來讀了一遍。',
    choices: [
      {
        label: '去徵選，全力一搏',
        effects: (s, h) => {
          if (h.chance(0.35 + (h.has('c_talent_path') ? 0.25 : 0))) { h.change('happiness', +6); h.change('social', +3); h.change('knowledge', +2); h.set('y_audition_ok'); }
          else { h.change('happiness', -2); h.change('knowledge', +2); h.unset('y_audition_ok'); }
        },
        result: (s, h) => (h.has('y_audition_ok')
          ? '你結束最後一段表演的那一刻，評審席有人輕輕點了頭。名單貼出來時，你的名字在第三行，你讀了五遍。'
          : '名單上沒有你的名字。你在走廊站了一會兒，一位評審追出來對你說：「你有東西，別停。」'),
        highlight: (s, h) => (h.has('y_audition_ok') ? '在才藝徵選中脫穎而出。' : null),
        ai: 2,
      },
      {
        label: '去，但把它當練習',
        effects: { knowledge: +2, social: +2, happiness: +1 },
        result: '你抱著「見識一下」的心情走進去，反而放鬆得不像話。結果沒有名次，但評審寫了一句「請繼續」。',
        ai: 1.5,
      },
      {
        label: '不去，把心力放在學業或工作',
        effects: { knowledge: +1, happiness: -2 },
        result: '你把通知放進抽屜。多年後打開，紙張都泛黃了，你還是說不準那天的決定，是成熟，還是害怕。',
        ai: (s, h) => (h.has('c_talent_path') ? 0.3 : 1),
      },
    ],
  },
  // ---- Phase 4A: 興趣、旅行（人生重心「興趣與自我」會讓這類事件更常出現） ----
  {
    id: 'youth_hobby_draw',
    title: '畫滿角落的本子',
    ages: [10, 19],
    weight: 0.7,
    tags: ['hobby', 'creative', 'art', 'youth'],
    text: (s, h) => h.byIncome({
      L: '你用撿來的鉛筆頭在舊月曆的背面畫畫：村口的樹、市場的人、鄰居的狗。紙很快就畫滿了，你開始擦掉再畫，把每一張背面都用到幾乎透明。',
      LM: '你有了一本小小的筆記本，每一頁的角落都被你畫滿了：朋友的側臉、窗外的屋頂、一隻停在電線上的鳥。你不敢拿給別人看，只敢在沒人的時候偷偷翻開。',
      UM: '你的筆記本每一頁的角落都畫滿了小圖：紙上的人物、窗外的天空、朋友的側臉。有人翻到了，沒有笑你，只是在旁邊寫了一行字：「你有自己的線條。」',
      H: '你的素描本越換越厚，書桌抽屜塞滿了畫了一半的稿子。大人說可以去學畫，你卻有點怕：把喜歡的事變成功課，會不會就不喜歡了？',
    }),
    choices: [
      {
        label: '拿給信得過的人看',
        effects: { happiness: +3, social: +2, knowledge: +1 },
        result: '對方看得很慢，翻到最後一頁才抬起頭，說：「你有在畫的樣子，我很喜歡。」那天你走路回家，覺得腳下的路比平常短。',
        ai: 2,
      },
      {
        label: '繼續偷偷畫，只給自己看',
        effects: { happiness: +2, knowledge: +1 },
        result: '你把本子藏在最深的口袋裡，畫成了每天的一個小儀式。有人問你一個人在忙什麼，你只回答：「沒什麼。」嘴角卻藏不住笑。',
        ai: 1.4,
      },
      {
        label: '把時間讓給正事和家裡的事',
        effects: { happiness: -1, knowledge: +1 },
        result: '你把筆記本收進抽屜，鎖上。你告訴自己以後還有時間，只是偶爾聞到鉛筆的氣味，心裡會輕輕空一下。',
        ai: 1,
      },
    ],
  },
  {
    id: 'youth_friends_trip',
    title: '第一次自己出去玩',
    ages: [15, 23],
    weight: 0.6,
    tags: ['travel', 'friends', 'fun', 'youth'],
    cond: (s, h) => h.incomeAtLeast('LM') && (h.stat('wealth') >= 35 || h.inSchool()),
    text: (s, h) => '朋友提議：趁這個週末，我們自己出去走一趟。行程亂七八糟，錢只夠搭車和一餐便宜的飯。家人叮嚀了十分鐘，你把每一句都答應了，包包裡塞滿了其實用不到的東西。',
    choices: [
      {
        label: '答應，把計畫排出來',
        effects: { happiness: +4, social: +3, wealth: -1, knowledge: +1 },
        result: '你們迷了兩次路，吃到一碗沒人推薦卻好吃得出奇的麵，在末班車上睡成一排。回家的時候，你覺得自己比出發時大了一點點。',
        ai: 2,
      },
      {
        label: '說想去，但先談好條件',
        effects: { happiness: +2, social: +1 },
        result: '你和家人把行程、回家的時間、聯絡方式一條一條列出來。他們雖然皺著眉，最後還是點了頭。那趟路你守時守約，換來之後更多的自由。',
        ai: 1.6,
      },
      {
        label: '下次再說，這次不去',
        effects: { happiness: -2, social: -1 },
        result: '你看著朋友們傳回來的照片，一張一張放大。笑是真的，羨慕也是真的。你告訴自己，下一次，一定。',
        ai: 0.6,
      },
    ],
  },
];
