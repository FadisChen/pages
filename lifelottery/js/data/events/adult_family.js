// Events about love, marriage, parenting, siblings, ageing parents and friendship in adulthood (ages ~18-68).
// Ids start with `family_` (the shared test requires this prefix). Flags used here start with `f_`.
//
// Design notes
//   * The yearly systems own relationship formation, marriage timing, fertility, divorce hazard and
//     bereavement. Events here add the human texture and a few explicit decisions (arranged introductions,
//     proposals, adoption, custody ...). They only call h.marry()/h.divorce()/h.addChild() for a decision
//     the player has just made, and never end a relationship by editing state directly.
//   * Follow-ups fire regardless of cond, so a follow-up that depends on a partner or a child either
//     guards its choices with `cond` (an event whose options are all hidden is silently dropped) or only
//     uses partner-neutral wording.
//   * Text never assumes the partner's gender (use h.partnerName() / 對方 / 伴侶).
//   * Chains: arranged introduction -> decision | meet the parents -> proposal | wedding custom -> debt |
//     trust broken -> crossroads | divorced/widowed -> second chance -> companion | sibling rift -> reconcile.

const kidsAged = (s, a, b) => s.children.filter((c) => c.alive && s.year - c.birthYear >= a && s.year - c.birthYear <= b);
const hasKid = (s, a, b) => kidsAged(s, a, b).length > 0;
const kidName = (s, a, b) => { const k = kidsAged(s, a, b)[0]; return k ? k.name : '孩子'; };
// Phase 6B: scenes in the kitchen, at the school gate or behind the bedroom door need children who LIVE with the person
// (kidsAged / hasKid / kidName above count every living child: fine for a phone call or a loan).
const homeKidsAged = (h, a, b) => h.childrenWithYou().filter((c) => h.year() - c.birthYear >= a && h.year() - c.birthYear <= b);
const hasHomeKid = (h, a, b) => homeKidsAged(h, a, b).length > 0;
const homeKidName = (h, a, b) => { const k = homeKidsAged(h, a, b)[0]; return k ? k.name : '孩子'; };
/** Grown-up or young children within reach of a visit (they live with the person, or in the same country). */
const nearKidsAged = (h, a, b) => h.childrenNearby().filter((c) => h.year() - c.birthYear >= a && h.year() - c.birthYear <= b);
const together = (h) => h.livesWith('partner');
/** Is a child of that age living somewhere else (with the other parent, the grandparents)? */
const kidApart = (h, a, b) => h.childrenApart().some((c) => h.year() - c.birthYear >= a && h.year() - c.birthYear <= b);
// dating, and the two of them are in the same place (a boyfriend or girlfriend left behind abroad is not)
const dating = (h) => h.hasPartner() && !h.married() && !(h.leftBehind() && h.leftBehind().partner);
const sameSex = (s) => !!s.partner && s.partner.gender === s.gender && (s.partner.status === 'dating' || s.partner.status === 'married');
const single = (h) => !h.hasPartner();
const working = (h) => h.employed();

/** A short, region-flavoured sentence about a wedding celebration (kept plain and non-stereotyping). */
function weddingFlavor(h) {
  if (h.isReligion('muslim')) return `${h.weddingFolk()}把宴席辦得熱熱鬧鬧，長輩們輪流為你們祝福，賓客一桌換過一桌，孩子們在桌子底下鑽來鑽去。`;
  if (h.isReligion('sikh')) return '儀式結束後，所有賓客都坐在地上吃了一頓飯，鼓聲與歌聲響了很久。';
  if (h.isReligion('jewish')) return '你們站在華蓋下，有人唱起古老的歌，賓客圍成圈子轉著跳舞，一圈又一圈。';
  if (h.lunarNewYear()) return `喜宴上你們一桌一桌敬${h.drinks() ? '酒' : '茶'}，紅包袋在櫃檯疊成了小山。`;
  if (h.isRegion('EAS')) return '儀式簡單而隆重，親友一個個上前道賀，拍照拍到你們的笑容都僵了。';
  if (h.isRegion('SEA')) return '親友從各地趕來，鄰居合力煮了一整天的菜，笑聲從院子傳到了巷口。';
  if (h.isRegion('SAS')) return '慶祝持續了好幾天，親戚把整間屋子擠得滿滿的，你換了好幾次衣服。';
  if (h.isRegion('CAS')) return '長桌從屋裡排到院子，祝福的話一輪接一輪，你已經忘了自己笑了幾次。';
  if (h.isRegion('MENA')) return `${h.weddingFolk()}把宴席辦得熱熱鬧鬧，音樂與笑聲一路傳到街口。`;
  if (h.isRegion('SSA')) return '歌聲和鼓聲從午後響到深夜，長輩一個接一個上前為你們祝福。';
  if (h.isRegion('EUR')) return '儀式很簡短，之後的聚餐拖到天亮，連最愛早睡的親戚都留到了最後。';
  if (h.isRegion('NAM')) return '朋友們輪流上台致詞，其中一段讓全場又哭又笑。';
  if (h.isRegion('LAC')) return '舞池從晚餐後就沒空過，連最安靜的親戚也被拉了下去。';
  return '儀式在戶外舉行，風把誓詞吹得有點散，但每個人都聽見了。';
}

export default [
  // =====================================================================================
  // A. 戀愛與找對象
  // =====================================================================================
  {
    id: 'family_relatives_pressure',
    title: '「有對象了嗎」',
    ages: [26, 42],
    once: false,
    cooldown: 5,
    weight: 0.8,
    tags: ['family', 'love', 'pressure'],
    cond: (s, h) => single(h) && !h.married(),
    text: (s, h) => (h.isRegion('EAS', 'SEA', 'SAS', 'MENA', 'CAS')
      ? '節慶回老家，親戚輪流問：「有對象了嗎？」你被問到第三輪，已經在研究用哪個笑話可以最有效地擋掉，並悄悄把答案改成了「最近在忙工作」。'
      : '朋友們陸續結婚、生孩子，家族聚會上長輩善意地問你「有沒有遇到合適的人」。你笑著說「還在觀察」，然後去幫忙收盤子，洗到第三遍，話題終於換了。'),
    effects: { happiness: -2, social: +1 },
  },
  {
    id: 'family_dating_scene',
    title: '怎麼認識新的人',
    ages: [21, 42],
    once: false,
    cooldown: 6,
    weight: 0.8,
    tags: ['family', 'love'],
    cond: (s, h) => single(h) && h.urban() && h.incomeAtLeast('LM'),
    text: (s, h) => (h.yearIn(2012, 3000)
      ? '朋友說交友軟體上有不少有趣的人，你滑了一個晚上，笑了好幾次，也累了好幾次。最後你約了一個人喝咖啡，緊張得先在洗手間練習了自我介紹。'
      : '朋友替你安排了一場聯誼，大家都有點尷尬地自我介紹，最後卻聊起共同喜歡的樂團。回家路上你一直在回想那個人說話的語氣，連紅燈都差點忘了停。'),
    effects: { social: +3, happiness: +2 },
  },
  {
    id: 'family_matchmaker',
    title: '長輩牽的線',
    ages: [23, 36],
    weight: (s, h) => (h.isRegion('SAS', 'MENA', 'CAS') ? 1.2 : h.isRegion('EAS', 'SEA') ? 0.7 : h.isRegion('SSA') ? 0.4 : 0),
    tags: ['family', 'love', 'marriage', 'chain'],
    cond: (s, h) => single(h) && !h.has('f_arranged') && !h.isMigrant(),
    text: (s, h) => (h.isRegion('SAS', 'MENA', 'CAS')
      ? '阿姨說她認識一戶人家，對方的孩子和你條件相近。兩家約在週日見面，茶點已經備好，長輩們比你們還緊張。你把襯衫的領口整理了三次。'
      : `親戚替你介紹了一位對象，說是「條件很適合」。約在咖啡店見面，${h.parentsGone() ? `${h.standIn() || '介紹人'}和對方的家人` : '兩邊的長輩'}都坐在隔壁桌假裝在聊天。你連該先拿起杯子還是先開口都不確定。`),
    choices: [
      {
        label: '先見面，慢慢認識',
        effects: (s, h) => { h.set(h.chance(0.5) ? 'f_match_click' : 'f_match_cool'); h.change('social', +2); h.change('happiness', +1); },
        set: ['f_arranged'],
        result: '你們聊了天氣、工作和各自家裡的規矩，每一句都小心翼翼。道別時，雙方都不確定下一次要不要聯絡。',
        schedule: [{ id: 'family_arranged_decision', inYears: [0, 1] }],
        ai: 2,
      },
      {
        label: '點頭答應，讓長輩安排婚事',
        cond: (s, h) => s.age >= 20,
        effects: (s, h) => { h.marry(); h.change('wealth', -3); h.change('social', +3); h.change('happiness', h.chance(0.6) ? +4 : -2); },
        set: ['f_arranged', 'f_arranged_wed'],
        result: (s, h) => `${h.parentsGone() ? `${h.standIn() || '家裡的長輩'}和對方的家人` : '兩家人'}很快敲定了日子。你和${h.partnerName()}在婚禮前只見過幾次，卻在長輩的祝福聲裡，一起邁入了新的生活。${h.weddingAbsence()}`,
        highlight: (s, h) => `經家人介紹，與${h.partnerName()}結為夫妻。`,
        ai: (s, h) => (h.isRegion('SAS', 'MENA', 'CAS') ? 1.5 : 0.5),
      },
      {
        label: '婉拒，說想自己找',
        effects: { social: -2, happiness: +1 },
        set: ['f_arranged', 'f_declined_match'],
        result: '你客氣地道歉，說還想靠自己的緣分。長輩點點頭，臉上卻有些為難。接下來的家庭聚會，這件事被提了不止一次。',
        schedule: [{ id: 'family_marriage_pressure', inYears: [1, 3] }],
        ai: (s, h) => (h.urban() ? 1.4 : 0.6),
      },
    ],
  },
  {
    id: 'family_arranged_decision',
    title: '見面之後',
    ages: [21, 40],
    weight: 0,
    tags: ['family', 'love', 'followup'],
    text: (s, h) => (h.has('f_match_click')
      ? '見了幾次面之後，你發現對方說話時有一種不疾不徐的節奏，聊天時不會讓你覺得需要表演。家人問你的想法，你發現自己嘴角是上揚的。'
      : '見了幾次面之後，你們都客氣得像在面試。沒有誰不好，只是少了那個說不出口的什麼。長輩問你「覺得怎麼樣」，你一時語塞，只能回說「讓我想想」。'),
    choices: [
      {
        label: '答應這門婚事',
        cond: (s, h) => !h.married(),
        effects: (s, h) => { h.marry(); h.change('wealth', -3); h.change('social', +3); h.change('happiness', h.has('f_match_click') ? +5 : +1); },
        result: (s, h) => (h.parentsGone()
          ? `你點了頭。${h.partnerName()}的名字出現在${h.standIn() || '親戚'}和對方家人的談話裡，大家都鬆了一口氣。${h.weddingAbsence()}`
          : `你點了頭。${h.partnerName()}的名字出現在兩家人的談話裡，兩邊的長輩都鬆了一口氣。`),
        highlight: (s, h) => `與${h.partnerName()}結婚。`,
        unset: ['f_match_click', 'f_match_cool'],
        ai: (s, h) => (h.has('f_match_click') ? 2.5 : 0.5),
      },
      {
        label: '再相處一段時間',
        effects: { social: +1, happiness: +1 },
        result: '你說想多了解一點，雙方都沒有反對。接下來的週末，你們多了幾次不太自然的散步。',
        unset: ['f_match_click', 'f_match_cool'],
        ai: 1.2,
      },
      {
        label: '客氣地說不太合適',
        effects: { happiness: -1, social: -1 },
        result: (s, h) => `你向${h.parentsGone() ? `${h.standIn() || '介紹的人'}和對方的家人` : '兩邊的長輩'}解釋，語氣很溫和。大家雖然有點失望，也承認感情的事不能勉強。`,
        unset: ['f_match_click', 'f_match_cool'],
        ai: (s, h) => (h.has('f_match_cool') ? 1.6 : 0.3),
      },
    ],
  },
  {
    id: 'family_marriage_pressure',
    title: '催婚的新花樣',
    ages: [22, 45],
    weight: 0,
    tags: ['family', 'pressure', 'followup'],
    text: (s, h) => '家裡的關心換了新的形式：這次不是「有沒有對象」，而是「某某家的孩子已經兩個了」。你學會了在餐桌上微笑，並在洗碗時偷偷嘆氣。',
    effects: { happiness: -2, social: -1 },
  },
  {
    id: 'family_meet_parents',
    title: '帶回家吃飯',
    ages: [19, 45],
    weight: 0.9,
    tags: ['family', 'love', 'chain'],
    cond: (s, h) => dating(h) && !h.has('f_met_parents') && !h.parentsFar(),
    text: (s, h) => h.byParents({
      both: `你終於決定帶${h.partnerName()}回家吃飯。家人把屋子打掃了三遍，餐桌上多了兩道平常不做的菜，爸爸假裝在看報紙，其實耳朵全開，媽媽則在廚房裡反覆確認鹽有沒有放。`,
      mother: `你終於決定帶${h.partnerName()}回家吃飯。母親把屋子打掃了三遍，餐桌上多了兩道平常不做的菜，她在廚房裡反覆確認鹽有沒有放，問了你三次對方吃不吃辣。`,
      father: `你終於決定帶${h.partnerName()}回家吃飯。父親把屋子打掃了三遍，還特地換了件乾淨的襯衫，假裝在看報紙，其實耳朵全開，連對方夾了哪道菜都記下來了。`,
      none: h.standIn()
        ? `你終於決定帶${h.partnerName()}去見家裡最親近的人。${h.standIn()}把屋子打掃了三遍，餐桌上多了兩道平常不做的菜。臨走前你們繞去爸媽的墓前站了一會兒，你小聲說：「我帶人來見你們了。」`
        : `你終於決定帶${h.partnerName()}回家吃飯，也先繞去爸媽的墓前站了一會兒。你小聲說：「我帶人來見你們了。」那頓飯，你們煮得很簡單，卻吃得很慢。`,
    }),
    choices: [
      {
        label: '自然地介紹，就像平常聊天',
        effects: (s, h) => { if (h.chance(0.7)) { h.set('f_parents_like'); h.change('social', +3); h.change('happiness', +3); } else { h.unset('f_parents_like'); h.change('social', -1); h.change('happiness', -1); } },
        set: ['f_met_parents'],
        result: (s, h) => (h.has('f_parents_like')
          ? `飯後長輩偷偷拉你到廚房，小聲說「這孩子不錯」。${h.partnerName()}幫忙洗碗時，笑得有點僵，但很努力。`
          : '氣氛有點僵，長輩問了太多問題，你們一直在互相遞眼神。回程路上你們都鬆了一口氣，反而笑了出來。'),
        unset: ['f_parents_like'],
        schedule: [{ id: 'family_propose', inYears: [1, 3] }],
        ai: 2,
      },
      {
        label: '先在外面的餐廳見面，氣氛輕鬆一點',
        cond: (s, h) => h.urban() && h.incomeAtLeast('LM'),
        effects: { social: +2, happiness: +2 },
        set: ['f_met_parents'],
        result: '你選了一家不太吵的店，大家都穿得比平常整齊。餐點沒有特別好吃，但沒有人覺得失敗，這就夠了。',
        schedule: [{ id: 'family_propose', inYears: [1, 3] }],
        ai: 1.4,
      },
      {
        label: '暫時不帶回去，等時機成熟',
        effects: { happiness: -1, social: -1 },
        set: ['f_met_parents'],
        result: '你說「還太早」。對方理解，但眼神裡閃過一絲落寞。你在心裡記著這件事，知道它不會永遠被延後。',
        schedule: [{ id: 'family_propose', inYears: [2, 4] }],
        ai: 0.6,
      },
    ],
  },
  {
    id: 'family_propose',
    followCond: (s, h) => h.hasPartner(),
    title: '那句話',
    ages: [20, 55],
    weight: 0,
    tags: ['family', 'love', 'followup'],
    text: (s, h) => `你和${h.partnerName()}散步到河邊。兩個人都在想同一件事，卻誰也沒先開口。路燈一盞一盞亮起，像在催促，你的手心早已是汗，連呼吸都放得很輕，怕錯過了對方先開口的那一刻。`,
    choices: [
      {
        label: '說出口：我們結婚吧',
        cond: (s, h) => dating(h),
        effects: (s, h) => { h.marry(); h.change('happiness', +6); h.change('social', +3); h.change('wealth', -2); },
        result: (s, h) => `${h.partnerName()}愣了一下，眼眶紅了，然後用力點頭。你們站在路燈下傻笑，像兩個剛考完試的學生。`,
        highlight: (s, h) => `與${h.partnerName()}談定了婚事。`,
        ai: 2,
      },
      {
        label: '再等等，先把生活穩定下來',
        cond: (s, h) => dating(h),
        effects: { wealth: +1, happiness: -1, social: -1 },
        result: '你們達成共識：先攢一點錢、先換好工作。兩個人都懂這是現實，但心裡都有一點遺憾。',
        ai: 1,
      },
      {
        label: '坦白說自己還沒準備好',
        cond: (s, h) => dating(h),
        effects: { happiness: -3, social: -1, knowledge: +1 },
        result: '你把話說得很慢，擔心傷到對方。對方沉默很久，說「謝謝你告訴我實話」。那個晚上的河水聲，你記了很多年。',
        ai: 0.5,
      },
    ],
  },
  {
    id: 'family_cohabit',
    title: '要不要住在一起',
    ages: [21, 42],
    weight: 0.7,
    tags: ['family', 'love', 'housing'],
    cond: (s, h) => dating(h) && h.urban() && h.incomeAtLeast('UM') && !h.has('f_cohabit'),
    text: (s, h) => `你和${h.partnerName()}已經一起過了好幾年的週末，牙刷、外套和備用鑰匙漸漸散落在彼此的住處。房東的租約快到期，兩人同時想到了同一個問題，卻都等著對方先開口。`,
    choices: [
      {
        label: '搬進同一個家',
        effects: (s, h) => { h.cohabit(true); h.change('wealth', +1); h.change('happiness', +3); h.change('social', -1); },
        set: ['f_cohabit'],
        result: '你們花了三個週末搬家，吵了兩次架，吃了五頓外賣。最後一個箱子拆完時，兩人在客廳地板上笑得喘不過氣。',
        ai: 1.8,
      },
      {
        label: '繼續各住各的，保持彼此的空間',
        effects: { happiness: +1, social: +1 },
        set: ['f_cohabit'],
        result: '你們決定維持現狀。週末在誰家就看那週的心情，偶爾你會想像另一種比較簡單的生活，但你也捨不得放掉現在的自在。',
        ai: 1,
      },
      {
        label: '先試住三個月，再決定',
        effects: (s, h) => { h.cohabit(true); h.change('happiness', +2); },
        set: ['f_cohabit'],
        result: '你們訂了一個「試用期」。第二個月，你發現對方有個奇怪的習慣會把襪子捲成一顆球，從此你多了一件很想念的事。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'family_two_of_us',
    title: '讓家人認識「我們」',
    ages: [20, 52],
    weight: 1,
    tags: ['family', 'love', 'identity'],
    cond: (s, h) => sameSex(s) && !h.has('f_ss_family'),
    text: (s, h) => `你想讓家人認識${h.partnerName()}，不只是「朋友」。你知道有些家庭會安靜，有些會爆炸，也有些會笑著問「那週末要不要一起吃飯」。你已經在心裡練習了很多遍。`,
    choices: [
      {
        label: '坦誠地介紹你們的關係',
        effects: (s, h) => {
          const p = 0.5 + (h.urban() ? 0.1 : 0) + (h.incomeAtLeast('UM') ? 0.08 : 0) + (h.era() === 'future' ? 0.15 : h.era() === 'past' ? -0.2 : 0);
          if (h.chance(p)) { h.set('f_ss_accepted'); h.unset('f_ss_strained'); h.change('social', +4); h.change('happiness', +5); }
          else { h.set('f_ss_strained'); h.unset('f_ss_accepted'); h.change('social', -4); h.change('happiness', -3); }
        },
        set: ['f_ss_family'],
        result: (s, h) => (h.has('f_ss_accepted')
          ? '家人沉默了一會，然後有人問：「對方喜歡吃什麼？下次來，我煮。」那一刻你才發現自己屏了多久的氣。'
          : '家人沒有立刻接受，電話安靜了好幾個月。但你知道自己說的是真話，也知道門並沒有上鎖。'),
        highlight: '向家人介紹了自己的伴侶。',
        ai: 1.3,
      },
      {
        label: '先讓朋友圈和伴侶互相熟悉，慢慢來',
        effects: { social: +2, happiness: +1 },
        set: ['f_ss_family'],
        result: '你們先在朋友的聚會裡，把彼此變成日常的一部分。時間沒有給你答案，但給了你更多勇氣。',
        ai: 1.6,
      },
      {
        label: '暫時維持低調',
        effects: { happiness: -2, social: -1 },
        set: ['f_ss_family'],
        result: '你說「現在不是時候」。這不是撒謊，也不是真心話。你們把重要的紀念日放在兩個人的小世界裡，過得溫暖卻謹慎。',
        ai: (s, h) => (h.era() === 'past' || !h.urban() ? 1.2 : 0.5),
      },
    ],
  },

  // =====================================================================================
  // B. 婚禮、婚姻與衝突
  // =====================================================================================
  {
    id: 'family_wedding_custom',
    title: '聘禮與嫁妝的算盤',
    ages: [19, 40],
    weight: 0.9,
    tags: ['family', 'marriage', 'money', 'chain'],
    cond: (s, h) => (dating(h) || (h.married() && h.yearsMarried() <= 1)) && h.isRegion('SAS', 'MENA', 'SSA', 'CAS', 'EAS', 'SEA') && !h.has('wedding_done'),
    text: (s, h) => `${h.parentsGone() ? `${h.standIn() || '家裡的長輩'}和對方的家人` : '兩家人'}坐下來談婚事的規矩：聘禮、嫁妝、彩禮、宴席的桌數。每個數字背後都有人情，也有面子，有時還是一家人兩年的收入，沒有人敢輕易說「少一點」。`,
    choices: [
      {
        label: '照習俗辦得體面',
        effects: (s, h) => { h.change('wealth', -6); h.change('social', +5); h.change('happiness', +1); if (h.isPoor()) h.set('f_wedding_debt'); },
        set: ['wedding_done'],
        result: '婚禮辦得很風光，賓客滿意地離席。你在收拾場地的夜裡，把帳單偷偷放進口袋，沒有告訴任何人數字有多大。',
        schedule: [{ id: 'family_wedding_debt', inYears: [1, 3] }],
        ai: (s, h) => (h.isRich() ? 1.8 : 0.8),
      },
      {
        label: '兩家協商，從簡處理',
        effects: { wealth: -2, social: +1, happiness: +3 },
        set: ['wedding_done'],
        result: '你們花了很多個晚上，把每一項規矩拿出來討論：哪些必要、哪些可以改。最後雙方各退一步，長輩們也在酒過三巡後說「年輕人有年輕人的做法」。',
        ai: 2,
      },
      {
        label: '低調辦，只留最重要的儀式',
        effects: { wealth: 0, social: -2, happiness: +2 },
        set: ['wedding_done'],
        result: '你們省下了大部分花費，只留一頓家人的聚餐與一場簡單的儀式。幾位親戚心裡有意見，但你們把省下來的錢存進了新家的頭期款。',
        ai: 1.3,
      },
    ],
  },
  {
    id: 'family_wedding_debt',
    title: '婚禮留下的帳',
    ages: [20, 48],
    weight: 0,
    followCond: (s, h) => h.hasPartner(),
    tags: ['family', 'money', 'followup'],
    text: (s, h) => (h.has('f_wedding_debt')
      ? `婚禮的錢，一部分是借來的。每個月初你和${h.partnerName()}都會對著帳本沉默一陣子，然後同時說「沒關係，慢慢還」。這句話像是兩個人共同的口頭禪。`
      : `婚禮的開銷早已成了過去式。你們偶爾還是會翻出那天的照片，笑著數那一桌又一桌的賓客${h.lunarNewYear() ? '與紅包袋' : '和合照'}，也慶幸當初沒有為了面子借下太多錢。`),
    effects: (s, h) => {
      if (h.has('f_wedding_debt')) { h.change('wealth', -2); h.change('happiness', -1); h.change('social', +1); }
      else { h.change('happiness', +2); h.change('social', +1); }
      h.unset('f_wedding_debt');
    },
  },
  {
    id: 'family_wedding_day',
    title: '大喜之日',
    ages: [19, 55],
    weight: 1.5,
    tags: ['family', 'marriage', 'milestone'],
    milestone: true,
    cond: (s, h) => h.married() && h.yearsMarried() <= 2 && h.has('wedding_done') && !h.has('f_wedding_day'),
    text: (s, h) => `${weddingFlavor(h)}你和${h.partnerName()}被一次又一次地拉去拍照。晚上回到家，兩個人累得直接躺在地板上，連禮服都懶得脫。`,
    effects: { happiness: +5, social: +3 },
    set: ['f_wedding_day'],
    highlight: '婚禮那一天，許多人為你們祝福。',
  },
  {
    id: 'family_newlywed_adjust',
    title: '學習一起過日子',
    ages: [19, 45],
    weight: 1,
    tags: ['family', 'marriage'],
    cond: (s, h) => h.married() && h.yearsMarried() <= 2 && together(h),
    text: (s, h) => (h.livesWith('parents') || (h.female() && !h.isMigrant() && h.isRegion('EAS', 'SEA', 'SAS', 'MENA', 'CAS', 'SSA') && !h.incomeAtLeast('H') && h.stable('lives_with_inlaws', 0.6))
      ? `婚後你和${h.partnerName()}暫住在大家庭裡，一間房、一個灶、很多雙眼睛。你學會了辨認每個人的腳步聲，也學會了在廚房裡不說話。只有夜裡關上門，才是你們兩個人的時間。`
      : `婚後你和${h.partnerName()}住進了小小的租屋。你發現對方不愛關櫃子，對方發現你睡覺要開風扇。這些小事比誓言更需要練習，你們吵了一次，又笑了一次。`),
    effects: { happiness: +1, social: +1, knowledge: +1 },
  },
  {
    id: 'family_in_laws',
    title: '另一半的家人',
    ages: [22, 60],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['family', 'marriage', 'conflict'],
    cond: (s, h) => h.married() && h.yearsMarried() >= 1 && together(h) && !h.isMigrant(),
    text: (s, h) => `${h.partnerName()}的家人習慣不敲門就進來，也習慣對你做菜、帶孩子和花錢的方式提出意見。你每次都笑著說謝謝，回房間才發現牙根咬得很緊，而枕邊人早就看在眼裡。`,
    choices: [
      {
        label: '和伴侶好好談，一起設界線',
        effects: (s, h) => { if (h.chance(0.65)) { h.change('happiness', +4); h.change('social', +1); h.set('f_boundaries'); } else { h.change('happiness', -1); } },
        result: (s, h) => (h.has('f_boundaries')
          ? `${h.partnerName()}握著你的手說：「我會去跟他們說。」過了幾週，敲門聲真的出現了，你差點感動到流淚。`
          : `${h.partnerName()}聽完沉默了很久，最後說「我知道，但他們是我的家人」。你們沒有吵，只是都學會了更小心地選話。`),
        unset: ['f_boundaries'],
        ai: 2,
      },
      {
        label: '退一步，試著理解他們',
        effects: { happiness: -1, social: +3 },
        result: '你開始在對方家人的角度想事情：他們不是要控制你，而是還不知道怎麼對待一個新家人。這一步很難，但氣氛慢慢鬆了。',
        ai: 1.4,
      },
      {
        label: '搬到離他們遠一點的地方',
        cond: (s, h) => h.incomeAtLeast('LM'),
        effects: { wealth: -3, happiness: +3, social: -2 },
        result: '你們搬到了通勤多半小時的地方。房子小了一點，晚餐也安靜了一點。逢年過節，大家笑得比以前更自然。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'family_money_fight',
    title: '關於錢的第三次爭吵',
    ages: [22, 62],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['family', 'marriage', 'money', 'conflict'],
    cond: (s, h) => h.married() && h.yearsMarried() >= 1 && together(h) && !h.has('f_budget_shared'),
    text: (s, h) => `${h.partnerName()}悄悄買了一件你覺得不必要的東西，你默默把發票拍下來，之後的幾天兩個人都客氣得過分。帳本不是問題，帳本背後的信任才是，這點你們心裡都清楚。`,
    choices: [
      {
        label: '一起坐下來，列出共同的預算',
        effects: { happiness: +3, wealth: +2, social: +1 },
        set: ['f_budget_shared'],
        result: '你們各自寫下每個月最不想放棄的三樣東西。結果有兩項重疊，大家忍不住笑了。從此「共同帳戶」和「各自的零用錢」成了你們的新規則。',
        ai: 2,
      },
      {
        label: '各管各的帳，只分攤共同開支',
        effects: { happiness: +1, social: 0, wealth: +1 },
        result: '你們劃分了責任區。吵架少了，但你有時會想：這樣的日子到底算不算「一起」？',
        ai: 1.2,
      },
      {
        label: '吵完就算了，下次再說',
        effects: { happiness: -3, social: -1 },
        result: '你們各說了一些難聽的話，隔天又若無其事地吃早餐。這件事被放進了名叫「以後再說」的抽屜，抽屜愈來愈滿。',
        ai: 0.7,
      },
    ],
  },
  {
    id: 'family_housework_split',
    title: '看不見的家事',
    ages: [24, 56],
    weight: 0.8,
    tags: ['family', 'marriage', 'chores'],
    cond: (s, h) => h.hasPartner() && together(h) && (h.hasChildren() || h.yearsMarried() >= 1) && !h.has('f_chores_talk'),
    text: (s, h) => '你某天突然意識到：換燈泡、交帳單、預約醫生、記得誰的生日……這些事全落在其中一個人身上，而那個人今天特別累，連抱怨的力氣都沒有了。',
    choices: [
      {
        label: '坐下來，把工作攤開分配',
        effects: { happiness: +4, social: +1, health: +1 },
        set: ['f_chores_talk'],
        result: '你們花了一個晚上把家事寫在白板上，分好顏色。第一週有人忘了，第二週被提醒，第三週慢慢成了習慣。白板上最長的一欄是「倒垃圾」。',
        ai: 2,
      },
      {
        label: '花錢請人幫忙，或買台機器',
        cond: (s, h) => h.incomeAtLeast('UM') && h.stat('wealth') >= 40,
        effects: { wealth: -3, happiness: +3, health: +1 },
        set: ['f_chores_talk'],
        result: '洗碗機、掃地機器人，甚至每週一次的小時工。你們發現，有時候買到的不只是乾淨，而是互相不吵架的時間。',
        ai: 1.2,
      },
      {
        label: '算了，習慣了就好',
        effects: { happiness: -3, health: -1 },
        result: '你什麼也沒說。那個承擔最多的人也什麼都沒說。但碗盤碰撞的聲音，比平常更大聲了一點。',
        ai: 0.6,
      },
    ],
  },
  {
    id: 'family_trust_broken',
    title: '不該看到的東西',
    ages: [26, 60],
    weight: 0.55,
    tags: ['family', 'marriage', 'conflict', 'chain'],
    cond: (s, h) => h.married() && h.yearsMarried() >= 3 && together(h) && h.stat('happiness') < 70,
    text: (s, h) => (h.yearIn(2005, 3000)
      ? `你不小心看到了${h.partnerName()}手機上的一串訊息，不是你該看的內容。你把手機放回原處，在廚房站了很久，水龍頭一直開著，水流聲蓋過了你自己的呼吸。`
      : `你不小心翻到了${h.partnerName()}口袋裡一張折起來的紙條，上面的字不是你該看的內容。你把它放回原處，在廚房站了很久，水龍頭一直開著，水流聲蓋過了你自己的呼吸。`),
    choices: [
      {
        label: '當面攤開來談',
        set: ['f_talked'],
        effects: (s, h) => { if (h.chance(0.5)) { h.set('f_repair'); h.change('happiness', +2); } else { h.unset('f_repair'); h.change('happiness', -5); } h.change('social', -1); },
        result: (s, h) => (h.has('f_repair')
          ? '談話進行到半夜。對方沒有躲，承認了很多事。你們都哭了，但也都說了一直不敢說的實話。這不是結束，也許是另一種開始。'
          : '你把話說得很清楚，對方的辯解漏洞百出。你意識到，自己需要的不只是一句道歉，而是時間和距離。'),
        unset: ['f_repair'],
        schedule: [{ id: 'family_crossroads', inYears: [1, 2] }],
        ai: 2,
      },
      {
        label: '先暫時分開住，冷靜一陣子',
        set: ['f_apart_trial'],
        effects: (s, h) => { h.cohabit(false); h.change('happiness', -3); h.change('social', -2); h.change('wealth', -2); },
        result: '你收了簡單的行李，去朋友家住了一段時間。第一個週末安靜得可怕，第二個週末你終於能好好睡覺。',
        schedule: [{ id: 'family_crossroads', inYears: [1, 2] }],
        ai: 1.2,
      },
      {
        label: '找信任的長輩或諮商師幫忙',
        cond: (s, h) => h.incomeAtLeast('LM'),
        set: ['f_counseled'],
        effects: { happiness: +1, wealth: -2, knowledge: +2 },
        result: '你們各自去了幾次諮商，也一起去了幾次。那間小小的諮商室裡，沙發永遠放著一盒面紙，這不是巧合。',
        schedule: [{ id: 'family_crossroads', inYears: [1, 2] }],
        ai: 1.6,
      },
    ],
  },
  {
    id: 'family_crossroads',
    followCond: (s, h) => !!s.partner && (s.partner.status === 'married' || s.partner.status === 'dating'),
    title: '一年後的決定',
    ages: [27, 62],
    weight: 0,
    tags: ['family', 'marriage', 'followup'],
    // how the year was spent (family_trust_broken): apart, with a counsellor, or after one long talk
    text: (s, h) => `一年過去了，${h.has('f_apart_trial') && !h.livesWith('partner')
      ? `你和${h.partnerName()}各住各的，彼此的鑰匙都還留在對方那裡，距離沒有變得更近，也沒有真正拉遠。`
      : h.has('f_counseled')
        ? `你和${h.partnerName()}還保留著去諮商的習慣，沙發上那盒面紙換過好幾次，距離沒有變得更近，也沒有真正拉遠。`
        : `你和${h.partnerName()}之間的距離，沒有變得更近，也沒有真正拉遠。`}你們都知道，現在是該給彼此一個答案的時候了。窗外的雨，下了一整天。`,
    choices: [
      {
        label: '重新開始，一起努力',
        cond: (s, h) => h.married(),
        effects: (s, h) => { h.cohabit(true); if (h.chance(0.6)) { h.change('happiness', +5); h.change('social', +2); } else { h.change('happiness', +1); } },
        result: '你們約定每週一次的「不談孩子、不談錢」的約會。第一次兩個人都不知道要聊什麼，最後聊起了十年前的第一次見面。',
        ai: 1.6,
      },
      {
        label: '協議離婚，各自重新生活',
        cond: (s, h) => h.married(),
        effects: (s, h) => { h.divorce(); h.change('happiness', -3); h.change('wealth', -3); h.change('social', -2); },
        result: '簽字那天很平靜，平靜得像辦理一件日常手續。走出辦事處的路上，你突然發現自己哭了，不是因為難過，而是因為終於放下。',
        highlight: '結束了一段婚姻。',
        ai: (s, h) => (h.stat('happiness') < 35 ? 1.5 : 0.6),
      },
      {
        label: '維持現狀，不再多問',
        cond: (s, h) => h.married(),
        effects: (s, h) => { h.cohabit(true); h.change('happiness', -3); h.change('social', -1); },
        result: '你們繼續住在同一個屋簷下，禮貌而疏遠。這樣的日子沒有誰對誰錯，只是兩個人都在等一個不知道會不會到來的轉機。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'family_midlife_marriage',
    title: '剩下兩個人的餐桌',
    ages: [42, 62],
    weight: 0.7,
    tags: ['family', 'marriage', 'midlife'],
    cond: (s, h) => h.married() && h.yearsMarried() >= 15 && together(h) && h.minorsWithYou().length === 0,
    text: (s, h) => `餐桌上只剩下你和${h.partnerName()}兩個人，電視的聲音是唯一的對話。你們都發現，原來這麼多年來，${h.hasChildren() ? '孩子和家務' : '工作和家務'}塞滿了所有的空隙。筷子碰到碗的聲音，突然變得很清楚。`,
    choices: [
      {
        label: '重新約會，像剛認識時那樣',
        effects: { happiness: +5, social: +2, wealth: -1 },
        result: '你們笨拙地約了第一次，去了大學時常去的小店（它已經改成別的樣子）。回家路上，對方牽起你的手，兩個人都沒說話。',
        ai: 1.8,
      },
      {
        label: '各自找回自己的興趣與朋友',
        effects: { happiness: +3, social: +3 },
        result: '你開始爬山、學畫畫，對方開始跟老同學打球。晚餐桌上有了新的話題，也有了兩個比以前更輕鬆的人。',
        ai: 1.4,
      },
      {
        label: '照舊，這樣也很好',
        effects: { happiness: +1 },
        result: '你們沒有特別改變什麼。有些安穩不用說出口，就像每天早上的茶，總是多泡了一杯。',
        ai: 1,
      },
    ],
  },
  {
    id: 'family_anniversary',
    title: '又過了一年',
    ages: [33, 68],
    once: false,
    cooldown: 12,
    weight: 0.4,
    tags: ['family', 'marriage'],
    cond: (s, h) => h.married() && h.yearsMarried() >= 10 && together(h),
    text: (s, h) => `結婚${h.yearsMarried()}年的這天，你和${h.partnerName()}都沒準備什麼特別的。晚上對方端出一盤你愛吃的小菜，說：「記得嗎？第一次約會就是這家的。」你笑了，覺得這個日子比任何禮物都貴重。`,
    effects: { happiness: +3, social: +1 },
  },

  // =====================================================================================
  // C. 分離與重新開始
  // =====================================================================================
  {
    id: 'family_after_divorce',
    title: '離婚之後的日常',
    ages: [24, 66],
    weight: 1.2,
    tags: ['family', 'divorce'],
    cond: (s, h) => h.partnerStatus() === 'divorced',
    text: (s, h) => h.byIncome({
      L: `離婚後你搬回${h.parentsGone() ? '老家那間沒人住的老屋' : '老家'}，鄰居的目光沒有惡意，卻很長。你學會在市場裡微笑著點頭，把自己的故事收好，只在夜裡才拿出來想，然後在天亮前又悄悄收起來。`,
      LM: '親戚們對你的離婚有各種版本的說法，你已經懶得解釋。你把更多時間花在工作上，晚上才發現房子的安靜是這麼有重量，像一件濕掉的外套。',
      UM: '離婚後你搬進一間小公寓，重新買了鍋碗瓢盆。第一晚你一個人煮了泡麵，邊吃邊覺得，這也不錯。隔壁傳來電視的聲音，你竟然覺得有點安慰。',
      H: '離婚後你開始和律師、房東、前任來回確認各種細節。你發現，結束一段關係需要的文件，比開始時多得多，而且每一張都要簽名。',
    }),
    effects: (s, h) => { if (h.income() === 'L' && h.parentsAlive() > 0 && !h.isMigrant()) h.moveParentsIn(true); h.change('happiness', -2); h.change('social', -1); h.change('wealth', -1); h.change('knowledge', +1); },
  },
  {
    id: 'family_custody',
    title: '孩子該跟誰住',
    ages: [24, 55],
    weight: 1.4,
    tags: ['family', 'divorce', 'children'],
    // also scheduled by divorce() the year the marriage ends; the choice decides where the minors live (the default of the household stands if it never comes up)
    cond: (s, h) => h.partnerStatus() === 'divorced' && h.childCount() > 0 && h.youngestChildAge() >= 0 && h.youngestChildAge() <= 15,
    followCond: (s, h) => h.partnerStatus() === 'divorced' && h.childCount() > 0 && h.youngestChildAge() <= 15,
    text: (s, h) => `${kidName(s, 0, 15)}坐在客廳裡，沒有哭，也沒有吵。大人們在談條件，孩子只是安靜地看著每個人的嘴。你突然意識到，這一刻的氣氛，孩子會記一輩子。`,
    choices: [
      {
        label: '共同照顧，輪流接送',
        effects: (s, h) => { h.setChildrenLive('with_you', ['with_you', 'with_partner']); h.set('f_shared_custody'); h.change('happiness', +1); h.change('health', -1); h.change('social', +1); h.change('wealth', -1); },
        result: '你們排了表，每週交接一次。偶爾尷尬，偶爾吵，但孩子在兩邊都有自己的牙刷，這件事你們都做到了。',
        ai: 1.6,
      },
      {
        label: '孩子主要跟你住，對方定期探視',
        effects: (s, h) => { h.setChildrenLive('with_you', ['with_you', 'with_partner']); h.unset('f_shared_custody'); h.change('happiness', +2); h.change('wealth', -3); h.change('health', -2); },
        result: '你扛起了更多責任，每天早晨煮兩份早餐。晚上孩子睡著後，你才讓自己坐下來，聽冰箱的低頻聲。',
        ai: 1.4,
      },
      {
        label: '孩子主要跟對方住，你定期探視',
        effects: (s, h) => { h.setChildrenLive('with_partner', ['with_you', 'with_partner']); h.unset('f_shared_custody'); h.change('happiness', -3); h.change('social', -1); h.change('wealth', +1); },
        result: '你每個週末準時出現，帶孩子去公園、吃冰。分別時孩子握著你的手不放，你笑著說「下週見」，把眼淚留到轉身之後。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'family_single_parent',
    title: '一個人當兩個人',
    ages: [24, 55],
    once: false,
    cooldown: 6,
    weight: 1,
    tags: ['family', 'parenting', 'hardship'],
    cond: (s, h) => !h.hasPartner() && (h.partnerStatus() === 'divorced' || h.partnerStatus() === 'widowed') && hasHomeKid(h, 0, 14),
    text: (s, h) => `孩子發燒的夜裡，你一邊量體溫一邊想明天的班怎麼辦。你一個人同時是照顧者、賺錢的人、哄睡的人，也是那個不能倒下的人。天亮時你把孩子的水壺裝滿，自己卻忘了吃早餐。`,
    effects: { health: -3, happiness: -2, social: +1, wealth: -1 },
  },
  {
    // the parent whose children live with the other parent after a divorce: the weekend visit is the scene (a visit, not a household)
    id: 'family_visiting_parent',
    title: '週末的探視',
    ages: [24, 55],
    once: false,
    cooldown: 5,
    weight: 0.9,
    tags: ['family', 'divorce', 'parenting'],
    cond: (s, h) => !h.isMigrant() && h.partnerStatus() === 'divorced' && !h.recentLog('離婚', 1) && h.childrenApart().some((c) => s.year - c.birthYear <= 15) && !h.livesWith('children'),
    text: (s, h) => {
      const kid = h.childrenApart().find((c) => s.year - c.birthYear <= 15) || h.childrenApart()[0] || { name: '孩子', gender: 'M' };
      return `週末是你探視${kid.name}的日子。你提早半小時到對方家門口，孩子揹著小書包跑出來，一路講著這週學校發生的事。到了星期天傍晚，你送孩子回去，在門口蹲下來替${kid.gender === 'F' ? '她' : '他'}把鞋帶綁好，說「下週見」，轉身時才發現自己的手還懸在半空中。`;
    },
    effects: { happiness: -1, social: +1, wealth: -1 },
  },
  {
    id: 'family_after_loss',
    title: '空了一半的家',
    ages: [30, 49],
    weight: 1.4,
    tags: ['family', 'grief'],
    cond: (s, h) => h.partnerStatus() === 'widowed',
    text: (s, h) => h.byIncome({
      L: '鄰居和親戚輪流送來飯菜，什麼都不說，只是坐一會兒。你收下了所有的碗，隔天一一洗好還回去，洗到最後一個時，你終於哭了。',
      LM: '家裡的長輩決定了很多事，你坐在角落，像個旁觀者。直到一個晚上，你一個人整理遺物，才允許自己哭出來，你抱著一件舊外套，坐了很久。',
      UM: h.yearIn(2008, 3000)
        ? '你收到許多慰問的訊息，有的字斟句酌，有的只是一個擁抱的表情。你把它們逐一回覆，才發現這是你整理情緒的方式。回到最後一則時，眼淚才掉了下來。'
        : '你收到許多慰問的卡片，有的字斟句酌，有的只有簡單的「節哀」兩個字。你把它們一張張排在桌上，才發現這是你整理情緒的方式。讀到最後一張時，眼淚才掉了下來。',
      H: '你開始一個人處理保險、帳戶和種種文件。這些冷冰冰的手續，竟然是你最先敢面對的部分，因為它們不會問你「還好嗎」，只問你簽名在哪裡、日期是哪一天。',
    }),
    effects: { happiness: -2, social: +2, health: -1 },
  },
  {
    id: 'family_second_chance',
    title: '有人悄悄走進生活',
    ages: [30, 57],
    weight: 0.9,
    tags: ['family', 'love', 'chain'],
    cond: (s, h) => !h.hasPartner() && (h.partnerStatus() === 'divorced' || h.partnerStatus() === 'widowed') && !h.has('f_second_chance'),
    text: (s, h) => '你在一次聚會上，跟某個人聊得停不下來。散場時，對方問：「下次還能一起喝茶嗎？」你愣了一秒，才發現自己多久沒有被這樣問過。',
    choices: [
      {
        label: '慢慢交往，看看會怎麼樣',
        effects: { happiness: +3, social: +3 },
        set: ['f_second_chance'],
        result: '你們從喝茶開始，後來一起走路、一起買菜。沒有誰急著給這段關係名字，卻都有了比較不孤單的週末。',
        schedule: [{ id: 'family_new_companion', inYears: [1, 3] }],
        ai: 1.6,
      },
      {
        label: '暫時只想一個人',
        effects: { happiness: +1, knowledge: +1 },
        set: ['f_second_chance'],
        result: '你客氣地說「謝謝你的邀請」。獨處讓你有時間整理自己，也讓你更確定，自己要的不是填補空缺，而是能一起走的人。',
        ai: 1.2,
      },
      {
        label: '先把心力放在孩子與家人身上',
        cond: (s, h) => h.hasChildren() || h.parentsAlive() > 0,
        effects: { happiness: 0, social: +2 },
        set: ['f_second_chance'],
        result: '你把行事曆填給了孩子和家裡的長輩。這不是逃避，而是你當下最有把握的事。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'family_new_companion',
    followCond: (s, h) => h.hasPartner(),
    title: '又有人一起吃晚飯',
    ages: [31, 70],
    weight: 0,
    tags: ['family', 'love', 'followup'],
    text: (s, h) => '你發現自己煮飯時多放了一人份。那個人偶爾會帶來一束路邊買的小花，插在你的舊杯子裡。你沒有說什麼，但杯子被你擦得特別亮，亮到連你自己都覺得有點臉紅。',
    effects: { happiness: +4, social: +3 },
  },

  // =====================================================================================
  // D. 懷孕、育兒與孩子長大
  // =====================================================================================
  {
    id: 'family_trying_for_baby',
    title: '遲遲沒有來的孩子',
    ages: [27, 41],
    weight: 0.8,
    tags: ['family', 'children', 'chain'],
    cond: (s, h) => h.married() && h.yearsMarried() >= 2 && together(h) && s.children.length === 0 && !h.has('f_childfree') && !h.has('f_tried_baby'),
    text: (s, h) => (sameSex(s)
      ? `你和${h.partnerName()}談了很久要不要有孩子。法律、費用、家人的想法，每一項都得一張張攤開來看。夜裡你們常常盯著同一個天花板，想像孩子房間的顏色。`
      : `你和${h.partnerName()}試了好幾年，月曆上畫滿標記。親戚的關心一年比一年「溫柔」，朋友也不再主動提起這個話題。你們默契地不再討論，只在深夜偶爾對望。`),
    choices: [
      {
        label: '繼續嘗試，也尋求醫療協助',
        cond: (s, h) => !!s.partner && s.partner.gender !== s.gender && h.incomeAtLeast('LM'),
        effects: (s, h) => { h.change('wealth', -4); h.change('health', -1); if (h.chance(0.35)) { h.addChild(); h.change('happiness', +9); } else { h.change('happiness', -3); } },
        set: ['f_tried_baby'],
        result: (s, h) => (s.children.length > 0
          ? `在診間來回幾趟後，消息終於來了。${h.lastChildName()}出生那天，你抱著對方哭了，護理師遞來面紙，笑著說這很正常。`
          : '一次又一次的檢查與等待，沒有帶來你們想要的結果。你們給自己放了一個長假，終於又能好好笑一次。'),
        ai: 1.5,
      },
      {
        label: '走收養或寄養的程序',
        effects: (s, h) => { h.change('wealth', -3); if (h.chance(0.55)) { h.addChild(); h.change('happiness', +8); h.change('social', +2); } else { h.change('happiness', -2); } },
        set: ['f_tried_baby'],
        result: (s, h) => (s.children.length > 0
          ? `漫長的審核、訪視與等待後，${h.lastChildName()}走進了你的家。第一個夜晚，你坐在床邊看著孩子睡著，才敢相信這一切是真的。`
          : '程序一關一關地過，最後卡在你們無法控制的條件上。你們沒有放棄這個念頭，只是需要時間消化。'),
        highlight: (s, h) => (s.children.length > 0 ? `透過收養或寄養迎來了${h.lastChildName()}。` : null),
        ai: 1.2,
      },
      {
        label: '接受兩個人的生活',
        effects: { happiness: +2, social: +1, wealth: +1 },
        set: ['f_childfree', 'f_tried_baby'],
        result: '你們把房間改成書房，把存款留給旅行與老後。有些日子你會想到孩子，但你們決定，不要讓這個想像成為生活的缺口。',
        ai: 1,
      },
    ],
  },
  {
    id: 'family_parental_leave',
    title: '請不請育兒假',
    ages: [20, 44],
    weight: 1.2,
    tags: ['family', 'children', 'work'],
    cond: (s, h) => hasHomeKid(h, 0, 0) && h.wageEarner() && !h.has('f_leave_done'),
    text: (s, h) => h.byIncome({
      L: `${homeKidName(h, 0, 0)}才幾週大，你就在想什麼時候回去幹活。沒有任何人的規定說你可以休息，只有自己的身體和家人的幫手，粥就放在手邊，還冒著熱氣。`,
      LM: `${homeKidName(h, 0, 0)}出生後，公司只准你請幾天假。你一邊看著小小的臉，一邊盤算著下個月的帳單，孩子打了個哈欠，你的心軟得一塌糊塗。`,
      UM: `${homeKidName(h, 0, 0)}出生了，公司有育嬰假的制度，但同事悄悄告訴你：休完假回來，位子不一定還是原來的。你抱著孩子，覺得這兩件事都不能放。`,
      H: `${homeKidName(h, 0, 0)}出生後，你的公司有完整的育嬰假。你很想請滿，但看著手上的專案，又有些猶豫。辦公室的電話，在你抱著孩子時又響了一聲。`,
    }),
    choices: [
      {
        label: '請完整的育嬰假',
        cond: (s, h) => h.incomeAtLeast('UM'),
        effects: { wealth: -3, happiness: +4, social: +1, health: +1 },
        set: ['f_leave_done'],
        result: '你把工作先放到一邊，每天跟著孩子的作息過日子。有一天孩子對你笑，你突然覺得，錯過再多專案都值得。',
        ai: 1.6,
      },
      {
        label: '請幾週，再回去上班',
        effects: { wealth: -1, happiness: +2, health: -1 },
        set: ['f_leave_done'],
        result: '你和家人排好輪班照顧，上班時偶爾會在洗手間看孩子的照片，同事們看見了，也不戳破，只是多遞了你一張面紙。',
        ai: 1.8,
      },
      {
        label: '幾乎不休息，馬上回去工作',
        effects: { wealth: +2, health: -3, happiness: -2, social: -1 },
        set: ['f_leave_done'],
        result: '你很快回到了崗位，家裡的長輩或保姆接手了照顧。每天晚上你抱著孩子的時間，比別人想像的更短、也更珍貴。',
        ai: (s, h) => (h.isPoor() ? 1.8 : 0.7),
      },
    ],
  },
  {
    id: 'family_childcare_choice',
    title: '孩子白天交給誰',
    ages: [21, 46],
    weight: 1,
    tags: ['family', 'children', 'work'],
    cond: (s, h) => hasHomeKid(h, 1, 4) && (working(h) || h.workStatus() === 'homemaker') && !h.has('f_childcare'),
    text: (s, h) => `${homeKidName(h, 1, 4)}會走路了，每天早上都想往門外跑。${h.wageEarner() ? '你得決定上班時孩子要待在哪裡' : h.employed() ? '你得決定忙活的時候孩子要待在哪裡' : '你得決定要不要出去工作，孩子又要待在哪裡'}。每一個選項，都有人說你做得不夠好。夜裡你把利弊寫滿了半本便條紙。`,
    choices: [
      {
        label: '請家裡的長輩或親戚幫忙',
        cond: (s, h) => (h.parentsAlive() > 0 || h.siblingsAtBirth() > 0) && (!h.isMigrant() || h.livesWith('parents')),
        effects: { wealth: +1, social: +2, happiness: +1, health: -1 },
        set: ['f_childcare', 'f_relative_care'],
        result: '長輩們每天早上準時出現，孩子也學會了他們的口頭禪。你偶爾和長輩在育兒方式上有些小爭執，但看孩子笑得開心，也就算了。',
        ai: (s, h) => (h.incomeAtLeast('H') ? 0.8 : 1.8),
      },
      {
        label: '送進托育中心或幼兒園',
        cond: (s, h) => h.urban() || h.incomeAtLeast('UM'),
        effects: { wealth: -3, social: +1, happiness: +1 },
        set: ['f_childcare'],
        result: '第一天，孩子哭得幾乎站不住，你在門外也紅了眼眶。一個月後，孩子回家時會嘰嘰喳喳講老師和朋友，你才慢慢放下心。',
        ai: (s, h) => (h.incomeAtLeast('UM') ? 1.8 : 0.9),
      },
      {
        label: '家裡其中一人暫停工作，自己帶',
        effects: { wealth: -3, happiness: +3, health: -1, social: -1 },
        set: ['f_childcare'],
        result: (s, h) => `你們把開銷重新排過，少了一份收入，多了一份陪伴。你說不清這個決定是對是錯，只知道孩子第一次叫「${h.male() ? '爸爸' : '媽媽'}」時，你剛好在場。`,
        ai: 1,
      },
    ],
  },
  {
    id: 'family_newborn_nights',
    title: '沒有天亮的幾個月',
    ages: [19, 48],
    weight: 1.6,
    tags: ['family', 'children'],
    cond: (s, h) => hasHomeKid(h, 0, 0),
    text: (s, h) => h.byIncome({
      L: `${homeKidName(h, 0, 0)}夜裡哭得厲害，你抱著孩子在屋裡來回走，想起老一輩教的哄睡歌。鄰居隔著牆輕輕敲了兩下，不是抱怨，是在問「要不要幫忙」。`,
      LM: `${homeKidName(h, 0, 0)}夜裡每兩小時醒一次，你和家人輪流起床。天亮時你的眼睛像被砂紙磨過，但抱著孩子聞到奶香，什麼都值得了，連打哈欠都顯得幸福。`,
      UM: `${homeKidName(h, 0, 0)}夜裡哭鬧，你們學會了在凌晨三點用最低的音量吵架。白天，你把咖啡當成水，把午覺當成夢想。偶爾孩子一笑，所有的帳就一筆勾銷。`,
      H: `${homeKidName(h, 0, 0)}的睡眠時間完全沒有規律。你們買了一堆育兒書，但沒有一本書的圖表和你家的孩子對得上，你們只好學著相信直覺，也學著在孩子終於睡著的那一刻，一起癱坐在地板上傻笑。`,
    }),
    effects: { health: -3, happiness: +2, social: -1 },
  },
  {
    id: 'family_toddler_chaos',
    title: '會跑會跳的年紀',
    ages: [20, 50],
    once: false,
    cooldown: 3,
    weight: 0.7,
    tags: ['family', 'children'],
    cond: (s, h) => hasHomeKid(h, 1, 3),
    text: (s, h) => `${homeKidName(h, 1, 3)}發現了抽屜可以打開、盤子可以丟、你可以追著跑。這一整天你做的事情是：撿東西、擦地、再撿東西，然後在孩子笑出聲的時候，也跟著笑出聲。`,
    effects: { happiness: +3, health: -1, social: +1 },
  },
  {
    id: 'family_school_run',
    title: '接送的日子',
    ages: [24, 55],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['family', 'children'],
    cond: (s, h) => hasHomeKid(h, 6, 12) && !kidApart(h, 6, 12), // variants.js names any child of that age
    text: (s, h) => h.byIncome({
      L: `${homeKidName(h, 6, 12)}每天要走一個多小時去上學，你總在路口站到孩子的背影看不見為止。孩子轉身揮手的那一刻，你覺得苦的日子也有它的盼頭。`,
      LM: `每天早上你騎著機車載${homeKidName(h, 6, 12)}上學，後座的小手環住你的腰，講著昨天的夢。到校門口時，孩子還要賴一下才肯下車，說：「再抱一下就好。」`,
      UM: `放學時，校門口擠滿了接送的家長。你在人群裡一眼就認出${homeKidName(h, 6, 12)}的書包，孩子一跑過來就開始報告今天發生的大小事，你一邊點頭，一邊把每一句都收進心裡。`,
      H: `校車、課後班、聯絡簿上的通知，把你的行事曆切成小格。但每次孩子在車窗後朝你揮手，你都覺得一切安排都值得，即使偶爾還是會漏看某個通知。`,
    }),
    effects: { happiness: +2, social: +2, health: -1 },
  },
  {
    id: 'family_child_sick_night',
    title: '孩子半夜發燒',
    ages: [20, 55],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['family', 'children', 'health'],
    cond: (s, h) => hasHomeKid(h, 0, 12) && !kidApart(h, 0, 12), // variants.js names any child of that age
    text: (s, h) => h.byIncome({
      L: `${homeKidName(h, 0, 12)}半夜突然燒起來，最近的診所要走很遠的路。你背著孩子，另一個人拿著手電筒，沿路只有你們急促的腳步聲和孩子微弱的哭聲。到診所時，你的鞋子都濕透了。`,
      LM: `${homeKidName(h, 0, 12)}燒得滿臉通紅，你搭了半夜的車去急診，掛號櫃檯排著長長的隊。醫生說還好有來，你才發現自己的腿在發抖，而孩子已經在你懷裡睡著了。`,
      UM: `${homeKidName(h, 0, 12)}半夜發燒，你一邊查資料、一邊打電話給醫院。退燒藥發揮作用時，天已經微微亮了。你坐在床邊，手裡還握著那支體溫計。`,
      H: `${homeKidName(h, 0, 12)}半夜發燒，你按著醫生教過的步驟，做了該做的事。退燒了，你卻一直盯著孩子的呼吸聲，捨不得睡，直到窗外的鳥開始叫了。`,
    }),
    effects: { health: -2, happiness: -2, wealth: -1, social: +1 },
  },
  {
    id: 'family_teen_rebellion',
    title: '關上的房門',
    ages: [33, 55],
    weight: 0.9,
    tags: ['family', 'children', 'conflict'],
    cond: (s, h) => hasHomeKid(h, 13, 17) && !h.has('f_teen_talk'),
    text: (s, h) => `${homeKidName(h, 13, 17)}最近回家第一件事就是關上房門。你們的對話從「今天好嗎」縮成「嗯」「還好」「不用」。你站在門外，拿著端給孩子的水果，不知道該敲還是不敲。`,
    choices: [
      {
        label: '嚴格管教，訂下規矩',
        effects: (s, h) => { h.change('social', -2); h.change('happiness', -2); if (h.chance(0.35)) h.change('knowledge', +1); },
        set: ['f_teen_talk'],
        result: '你訂了門禁、收了零用錢。家裡的氣氛像一鍋快要沸騰的水。後來你才知道，孩子其實在房間裡寫了一整個筆記本的心事。',
        ai: 0.8,
      },
      {
        label: '好好談，也劃出底線',
        effects: (s, h) => { if (h.chance(0.6)) { h.change('happiness', +4); h.change('social', +3); } else { h.change('happiness', -1); h.change('social', +1); } },
        set: ['f_teen_talk'],
        result: '你們在深夜的廚房談了很久，孩子說了很多你沒想到的事。談話沒有解決所有問題，卻讓房門在晚餐時間打開了一點縫。',
        ai: 2,
      },
      {
        label: '給他空間，保持聯繫',
        effects: { happiness: +1, social: +1, health: +1 },
        set: ['f_teen_talk'],
        result: '你不再每天追問，只是在孩子晚歸時留一盞燈和一碗熱湯。幾個月後，孩子在桌邊坐下，主動說了今天發生的一件小事。',
        ai: 1.5,
      },
    ],
  },
  {
    id: 'family_child_college_cost',
    title: '學費通知書',
    ages: [38, 62],
    weight: 1,
    tags: ['family', 'children', 'money', 'education'],
    cond: (s, h) => hasHomeKid(h, 16, 19) && !h.has('f_school_cost'),
    text: (s, h) => h.byIncome({
      L: `${homeKidName(h, 16, 19)}的成績不錯，老師說可以繼續念書。但學費、交通，還有家裡少了一雙手的缺口，讓你整夜睡不著，只好坐在黑暗的廚房裡，一遍遍把數字加了又減。`,
      LM: `${homeKidName(h, 16, 19)}考上了更高一級的學校，通知書上印著學費金額。你把它跟家裡的存款對照了好幾遍，每一次，兩邊的數字都沒有靠近一點。`,
      UM: `${homeKidName(h, 16, 19)}的志願表上，每間學校旁邊都寫著學費。你們在客廳計算獎學金與貸款的各種組合，計算機都快按壞了。最後每個人都累了，卻沒有誰想先去睡。`,
      H: `${homeKidName(h, 16, 19)}想念的科系，學費、宿舍加生活費，是你好幾年的儲蓄。助學貸款的選項在桌上，沒有人想先碰。孩子沒有說話，只是安靜地看著你。`,
    }),
    choices: [
      {
        label: '想辦法讓孩子全力升學',
        effects: { wealth: -6, happiness: +2, social: +1 },
        set: ['f_school_cost'],
        result: '你多接了一份工，也把家裡的存款分批轉出去。孩子拿到入學通知書時哭了，你假裝在看窗外。',
        highlight: (s, h) => `為了讓${homeKidName(h, 16, 22)}繼續升學，付出了很多。`,
        ai: (s, h) => (h.isRich() ? 1.4 : 1.6),
      },
      {
        label: '半工半讀，一起分擔',
        effects: { wealth: -3, happiness: +1, social: +2, knowledge: +1 },
        set: ['f_school_cost'],
        result: '孩子週末去打工，平日讀書，彼此共同面對現實。你們發現這樣的日子雖然累，卻讓孩子更知道每一分學費的重量。',
        ai: 1.6,
      },
      {
        label: '改選學費較低或更快就業的路',
        effects: { wealth: -1, happiness: -2, social: +1 },
        set: ['f_school_cost'],
        result: '你們一起看了職業學校與在職訓練的資料。孩子說「也行」，但你聽得出，那個「也行」有一點勉強。',
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.7),
      },
    ],
  },
  {
    id: 'family_child_leaves',
    title: '行李袋放在門口',
    ages: [38, 62],
    // told by the household pass the year the first child leaves the parents' home (systems.js householdYear), also an ordinary event for the next 3 years
    weight: 1.2,
    tags: ['family', 'children'],
    cond: (s, h) => !h.has('f_child_left') && !!s.household && s.household.lastLeft !== undefined && s.year - (s.household.lastLeftYear || 0) <= 3,
    followCond: (s, h) => !h.has('f_child_left') && !!s.household && s.household.lastLeft !== undefined,
    text: (s, h) => h.byIncome({
      L: `${h.lastLeftChildName()}拎著行李站在門口，要去遠方的城市工作了。你把煮好的飯分裝成幾個袋子塞過去，說：「記得打電話回來。」門關上之後，你在原地站了好一會兒。`,
      LM: `${h.lastLeftChildName()}說已經找到了外地的工作。你幫著整理行李，才發現孩子的衣服、書本與童年，全擠在這幾個箱子裡，你把那件穿得發白的舊外套，偷偷塞到了最上面。`,
      UM: `${h.lastLeftChildName()}決定搬出去住。你幫忙搬家具，看著那間小小的套房，心裡又驕傲又捨不得，嘴上卻只說了一句「要記得吃飯」，孩子笑著說「知道了啦」。`,
      H: `${h.lastLeftChildName()}搬進自己的公寓那天，家裡忽然變得很空。你站在空蕩蕩的房間裡，把窗簾拉開又拉上，不知道要不要改成書房，最後你只是坐了下來。`,
    }),
    effects: { happiness: -2, social: -1, wealth: +1 },
    set: ['f_child_left'],
    highlight: (s, h) => `${h.lastLeftChildName()}長大離家。`,
  },
  {
    id: 'family_adult_child_money',
    title: '孩子開口借錢',
    ages: [48, 68],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['family', 'children', 'money'],
    cond: (s, h) => hasKid(s, 22, 45) && !h.retired(),
    text: (s, h) => `${kidName(s, 22, 45)}在電話裡支支吾吾，最後說出了需要錢的事——也許是房租，也許是創業，也許是一場突如其來的開銷。你聽見孩子努力維持鎮定的聲音。`,
    choices: [
      {
        label: '慷慨資助，不要求回報',
        effects: { wealth: -5, happiness: +3, social: +2 },
        result: '你匯了款，只說「好好照顧自己」。孩子在電話那頭安靜了很久，說謝謝。你沒有說，其實你心裡也緊了一下。',
        ai: (s, h) => (h.isRich() ? 1.8 : 0.8),
      },
      {
        label: '借給孩子，但約好期限',
        effects: { wealth: -3, happiness: +1, social: +1, knowledge: +1 },
        result: '你們寫了一張簡單的借據，還約好每月還一點。孩子說「這樣我比較不會不好意思」，你發現這其實是孩子成熟的表現。',
        ai: 1.8,
      },
      {
        label: '溫和地拒絕，幫孩子一起想辦法',
        effects: { wealth: +1, happiness: -2, social: -1 },
        result: '你說自己也要為老後打算，但可以幫孩子重新規劃預算。孩子有點失望，卻也在電話那頭一起做了表格，兩人邊吵邊笑。',
        ai: 1,
      },
    ],
  },
  {
    id: 'family_adult_child_partner',
    title: '孩子帶來的人',
    ages: [48, 68],
    weight: 0.7,
    tags: ['family', 'children'],
    cond: (s, h) => nearKidsAged(h, 22, 40).length > 0 && !h.has('f_child_partner') && !h.hasGrandchildren(),
    text: (s, h) => `${(nearKidsAged(h, 22, 40)[0] || { name: '孩子' }).name}說週末要帶一個人回家吃飯。你把圍裙換了三次，把客廳整理了又整理。對方的名字、背景、個性，你都還不知道，只知道孩子說起這個人時，眼睛是亮的。`,
    choices: [
      {
        label: '熱情地接納，把對方當自己人',
        effects: { happiness: +4, social: +3 },
        set: ['f_child_partner'],
        result: '你多煮了兩道菜，問的問題都是「喜歡吃什麼」。飯後孩子偷偷比了一個大拇指，你假裝沒看見。',
        ai: 2,
      },
      {
        label: '保留意見，慢慢觀察',
        effects: { happiness: 0, social: +1, knowledge: +1 },
        set: ['f_child_partner'],
        result: '你客氣有禮，把疑問都放在心裡。幾次見面後，你發現自己的看法正在一點一點被改寫。',
        ai: 1.4,
      },
      {
        label: '直接表達擔心與反對',
        effects: { happiness: -3, social: -3 },
        set: ['f_child_partner'],
        result: '你說出了自己的疑慮，孩子沉默地聽完，說「我知道你是擔心我」。接下來一個月，電話裡的聲音有些距離。',
        ai: 0.6,
      },
    ],
  },
  {
    id: 'family_grandchild_visit',
    title: '孫輩來了',
    ages: [48, 72],
    once: false,
    cooldown: 5,
    weight: 0.8,
    tags: ['family', 'grandchildren'],
    cond: (s, h) => h.has('grandparent') && h.childrenNearby().length > 0,
    text: (s, h) => `孫輩跑進門的第一句話是：「${h.male() ? '阿公' : '阿嬤'}有沒有糖？」你的口袋永遠有糖。孩子在地上打滾，你笑著看了一整個下午，連腰酸都忘了。`,
    effects: { happiness: +4, social: +2, health: -1 },
  },
  {
    id: 'family_sandwich_generation',
    title: '夾在中間的人',
    ages: [35, 60],
    once: false,
    cooldown: 6,
    weight: 0.9,
    tags: ['family', 'caregiving'],
    cond: (s, h) => hasHomeKid(h, 0, 17) && (h.livesWith('parents') || h.parentsNear()) && ((s.family.mother.alive && s.family.mother.age >= 70) || (s.family.father.alive && s.family.father.age >= 70)),
    text: (s, h) => '你一手牽著孩子，一手扶著長輩，下班後的時間被切成小塊：接送、藥單、功課、複診。你覺得自己像一座橋，大家都從你身上走過去。',
    effects: { health: -3, happiness: -2, social: -1, wealth: -1 },
  },
  {
    id: 'family_large_family',
    title: '人口眾多的家',
    ages: [30, 56],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['family', 'children', 'money'],
    cond: (s, h) => h.childrenWithYou().length >= 3 && h.childCount() >= 4 && !h.incomeAtLeast('UM'),
    text: (s, h) => '飯桌上的碗筷一輪接一輪，衣服是大的穿完傳給小的。鍋子永遠有點不夠，但沒有一個孩子餓著睡覺。晚上你清點著孩子的鞋，心裡有種說不出的滿足與擔憂。',
    effects: { wealth: -2, social: +2, happiness: +1, health: -1 },
  },
  {
    id: 'family_foster_relative',
    title: '多一雙筷子',
    ages: [28, 56],
    weight: 0.7,
    tags: ['family', 'caregiving', 'money'],
    cond: (s, h) => h.siblingsAtBirth() > 0 && !h.incomeAtLeast('H') && !h.has('f_fostered'),
    text: (s, h) => '你的手足出了事——也許生病、也許遠行、也許是離世——留下了年幼的孩子。親戚們在你家客廳商量由誰照顧，每個人都有各自的難處，目光慢慢轉向你。',
    choices: [
      {
        label: '把孩子接到自己家',
        effects: { wealth: -4, social: +4, happiness: +2, health: -1 },
        set: ['f_fostered'],
        result: '你多添了一副碗筷，多擠了一張床。孩子起初不太說話，只是在你睡前悄悄站在門口。後來有一天，孩子叫了你一聲，輕得像風。',
        highlight: '收留了手足的孩子。',
        ai: (s, h) => (h.isPoor() ? 0.9 : 1.5),
      },
      {
        label: '付學費與生活費，但孩子仍住原處',
        effects: { wealth: -2, social: +2, happiness: +1 },
        set: ['f_fostered'],
        result: '你每月固定匯一筆錢，也定期去探視。孩子的成績單寄來時，你比自己的孩子考好還開心。',
        ai: 1.6,
      },
      {
        label: '協助找其他親戚或機構安置',
        effects: { wealth: 0, social: -2, happiness: -2 },
        set: ['f_fostered'],
        result: '你四處打電話，最後找到了一個合適的家庭。你送孩子過去那天什麼也沒說，轉身後才發現手心都是汗。',
        ai: 0.7,
      },
    ],
  },
  // =====================================================================================
  // E. 手足、父母與親戚
  // =====================================================================================
  {
    id: 'family_sibling_school_fees',
    title: '弟妹的學費',
    ages: [20, 38],
    weight: 1,
    tags: ['family', 'siblings', 'money'],
    cond: (s, h) => h.siblingsAtBirth() > 0 && !h.incomeAtLeast('UM') && working(h) && !h.has('f_sibling_fees'),
    text: (s, h) => '家裡年紀更小的弟妹，成績不錯。老師說他們應該繼續讀下去。家人沒有開口，但每次寄回去的那筆錢，大家都知道是你在撐著，只是誰也沒有說出口。',
    choices: [
      {
        label: '多寄一些，讓弟妹好好念書',
        effects: { wealth: -4, social: +3, happiness: +2 },
        set: ['f_sibling_fees'],
        result: '你把房租壓縮、把便當自己做。幾年後，弟妹穿著畢業袍的照片寄到你手上，背面寫了一行歪歪扭扭的「謝謝」。',
        highlight: '供弟妹繼續念書。',
        ai: (s, h) => (h.stat('wealth') > 25 ? 1.6 : 0.9),
      },
      {
        label: '分擔一部分，也請弟妹半工半讀',
        effects: { wealth: -2, social: +2, knowledge: +1 },
        set: ['f_sibling_fees'],
        result: '你和弟妹約定各出一半。他們暑假去打工，把第一份薪水的一半交給你。你推了回去，對方硬是塞回你的口袋。',
        ai: 1.6,
      },
      {
        label: '把機會留給更需要的人，自己先顧好自己',
        effects: { wealth: +2, happiness: -1, social: -2 },
        set: ['f_sibling_fees'],
        result: '你解釋自己也有開銷與打算，家人沒有責怪你。有一次你深夜看到弟妹的成績單，忍不住多想了一下：也許下次可以再多出一點。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'family_sibling_loan',
    title: '手足的求援',
    ages: [26, 60],
    once: false,
    cooldown: 8,
    weight: 0.8,
    tags: ['family', 'siblings', 'money'],
    cond: (s, h) => h.siblingsAtBirth() > 0 && h.stat('wealth') >= 20,
    text: (s, h) => '你的手足打電話來，語氣比平常客氣許多，最後才吞吞吐吐地說出需要一筆錢。你想起小時候，對方曾把唯一的糖果分了一半給你。',
    choices: [
      {
        label: '借出，也不指望一定要還',
        effects: { wealth: -4, social: +4, happiness: +1 },
        result: '你把錢匯過去，只說「慢慢來」。對方在電話裡說了很多次謝謝，你笑著說：「你小時候也幫過我。」',
        ai: (s, h) => (h.isRich() ? 1.8 : 0.9),
      },
      {
        label: '借出，但寫下期限與還款方式',
        effects: { wealth: -2, social: +2, knowledge: +1 },
        result: '你們寫了一張只有幾行的字條。聽起來有點生分，但很多手足之間的裂縫，起因就是沒有寫下來的那一句話。',
        ai: 1.8,
      },
      {
        label: '婉拒，但陪對方想其他辦法',
        effects: { wealth: 0, social: -2, happiness: -1 },
        result: '你說明了自己的狀況，也陪對方一起列出可以求助的管道。對方沒有生氣，只是掛電話前沉默了兩秒。',
        ai: 1,
      },
    ],
  },
  {
    id: 'family_sibling_reunion',
    title: '兄弟姊妹聚在一起',
    ages: [28, 66],
    once: false,
    cooldown: 8,
    weight: 0.5,
    tags: ['family', 'siblings'],
    cond: (s, h) => h.siblingsAtBirth() > 0,
    text: (s, h) => `難得${h.siblingsAtBirth() > 1 ? '手足都' : '你和手足'}回到老家。你們擠在小時候的那間客廳，翻出舊相簿，笑著糾正彼此的記憶：「明明是你先打我的！」「我才沒有！」笑聲震得老房子的窗戶都在抖。`,
    effects: { social: +4, happiness: +3 },
  },
  {
    id: 'family_sibling_rift',
    title: '一場爭吵之後',
    ages: [30, 62],
    once: false,
    cooldown: 12,
    weight: 0.4,
    tags: ['family', 'siblings', 'conflict', 'chain'],
    cond: (s, h) => h.siblingsAtBirth() > 0,
    text: (s, h) => '一次聚餐上，你和手足為了一件小事吵了起來，話愈說愈重。散場時沒有人說再見。接下來幾個月，彼此的電話號碼都還在，誰也沒有先撥出去。',
    effects: { happiness: -3, social: -3 },
    schedule: [{ id: 'family_sibling_reconcile', inYears: [2, 7] }],
  },
  {
    id: 'family_sibling_reconcile',
    title: '先撥出去的電話',
    ages: [31, 70],
    weight: 0,
    tags: ['family', 'siblings', 'followup'],
    text: (s, h) => '某天你在街上看見一件熟悉的外套，想到對方。回家後你按下通話鍵，對方接起來，兩個人都愣住了，然後幾乎同時說：「對不起。」接著兩個人在電話兩端笑成一團。',
    effects: { happiness: +4, social: +4 },
  },
  {
    id: 'family_parent_move_in',
    title: '一個人住的長輩',
    ages: [36, 62],
    weight: 0.9,
    tags: ['family', 'caregiving', 'parents'],
    cond: (s, h) => !h.isMigrant() && !h.livesWith('parents') && h.parentsAlive() === 1 && (s.family.mother.alive ? s.family.mother.age : s.family.father.age) >= 68 && !h.has('caregiver_parent') && !h.has('f_parent_plan'),
    text: (s, h) => {
      const name = s.family.mother.alive ? s.family.mother.name : s.family.father.name;
      return `${name}一個人住在老家，電話裡總說「沒事」。但鄰居悄悄告訴你，最近看到長輩在樓梯上休息了很久才走上去。你知道不能再用「沒事」回答這件事了。`;
    },
    choices: [
      {
        label: '接來同住',
        effects: (s, h) => { h.moveParentsIn(true); h.change('social', +2); h.change('happiness', +1); h.change('health', -2); h.change('wealth', -1); },
        set: ['f_parent_plan'],
        result: '你把客房清出來，換了防滑的地墊和夜燈。長輩起初不習慣，後來開始在清晨替你煮早餐，雖然鹹得讓全家人都皺眉。',
        ai: (s, h) => (h.incomeAtLeast('H') ? 0.9 : 1.6),
      },
      {
        label: '搬到附近，天天探望',
        cond: (s, h) => h.incomeAtLeast('LM'),
        effects: { wealth: -3, social: +2, happiness: +2 },
        set: ['f_parent_plan'],
        result: '你們各住各的，但只隔一條巷子。傍晚的時候，長輩會在窗邊揮手，你會提著菜走過去，這成了兩個人心照不宣的儀式。',
        ai: 1.5,
      },
      {
        label: '請看護或社區服務，定期回去',
        cond: (s, h) => h.stat('wealth') >= 35,
        effects: { wealth: -4, happiness: -1, social: 0 },
        set: ['f_parent_plan'],
        result: '你找了信得過的照護人員，把每個月的往返時間寫在行事曆上。心裡始終有一點愧疚，但看到長輩吃得下、睡得著，你稍微安心。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'family_parent_estate',
    title: '老家的房子',
    ages: [30, 66],
    weight: 0.9,
    tags: ['family', 'siblings', 'inheritance'],
    cond: (s, h) => !s.family.mother.alive && !s.family.father.alive && h.siblingsAtBirth() > 0 && !h.has('f_estate'),
    text: (s, h) => `父母留下的房子與一小塊地，需要${h.siblingsAtBirth() > 1 ? '手足們' : '你和手足'}坐下來決定怎麼處理。每個人都帶著回憶，也帶著各自的帳單。老家的灶台上，還擺著那個缺了一角的碗。`,
    choices: [
      {
        label: '賣掉老家，平均分配',
        effects: { wealth: +5, social: -2, happiness: -2 },
        set: ['f_estate'],
        result: '房子賣出去那天，你們最後一次聚在院子裡拍了張合照。每個人拿到的數字不大，但大家都帶走了一塊舊物，作為紀念。',
        ai: 1.2,
      },
      {
        label: '讓住在老家的人保有，補償其他人',
        effects: { wealth: +1, social: +3, happiness: +1 },
        set: ['f_estate'],
        result: '經過幾次談判，你們決定老房子留給願意照顧它的人。條件寫得很細，連每年忌日的聚會都排進去了。',
        ai: 1.6,
      },
      {
        label: '放棄自己的份，留給更需要的手足',
        effects: { wealth: -1, social: +5, happiness: +3 },
        set: ['f_estate'],
        result: '你簽了放棄書。有人以為你傻，有人說你大方，只有你自己知道，這只是你想讓老家永遠有一盞燈。',
        highlight: '把老家的遺產留給了更需要的手足。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'family_festival_gathering',
    title: '返鄉過節',
    ages: [22, 66],
    once: false,
    cooldown: 8,
    weight: 0.5,
    tags: ['family', 'festival', 'parents'],
    cond: (s, h) => (h.parentsAlive() > 0 || h.siblingsAtBirth() > 0) && (!h.isMigrant() || h.livesWith('parents')), // from abroad: 回去看看 (migration_visit_home) and the festival lines of the helpers
    text: (s, h) => h.parentsGone() ? h.byIncome({
      L: `${h.festival()}那幾天，遠近的親戚和手足都回到老屋。院子裡擠滿了人，孩子滿地亂跑，大人們用方言比賽誰的故事最荒唐。灶台邊少了你爸媽的身影，有人默默多擺了兩雙碗筷，沒有人說破。`,
      LM: `你擠上了人滿為患的車，搭了一整天才回到老家。一進門，${h.standIn() || '親戚'}把你拉到桌邊，筷子上已經夾了菜，說：「先吃，再說話。」桌上最靠門的位子，是過世的爸媽以前坐的，今年還是沒有人去坐。`,
      UM: `${h.festival()}一到，手足和親戚都聚了過來。你在廚房幫忙備菜，聽長輩說著三十年前同一個笑話，笑得比第一次聽時還大聲。有人輕聲說：「要是你爸媽還在，一定又要搶著說後面那一句。」大家笑了，也靜了一下。`,
      H: `${h.festival()}這天，${h.siblingsAtBirth() > 1 ? '手足們' : '你和手足'}難得聚齊。大家一邊吃飯一邊看${h.yearIn(2008, 3000) ? '手機' : '電視'}，卻在某個時刻同時抬起頭，因為有人說起了爸媽以前的糗事。整桌的笑聲把屋子都撐大了，笑完，每個人的眼眶都有點紅。`,
    }) : h.byIncome({
      L: `${h.festival()}那幾天，遠近的親戚都回到老家。院子裡擠滿了人，孩子滿地亂跑，大人們用方言比賽誰的故事最荒唐，深夜院子裡還有人在唱歌。`,
      LM: '你擠上了人滿為患的車，搭了一整天才回到老家。一進門，長輩把你拉到桌邊，筷子上已經夾了菜，說：「先吃，再說話。」你一口氣吃了三碗。',
      UM: `${h.festival()}一到，全家聚在一起。你在廚房幫忙備菜，聽長輩說著三十年前同一個笑話，笑得比第一次聽時還大聲，忽然覺得這種重複其實很珍貴。`,
      H: `${h.festival()}這天全家難得聚齊。大家一邊吃飯一邊看${h.yearIn(2008, 3000) ? '手機' : '電視'}，卻在某個時刻同時抬起頭，因為有人說起了小時候的糗事，整桌的笑聲把屋子都撐大了。`,
    }),
    effects: { social: +4, happiness: +3, wealth: -1 },
  },
  {
    id: 'family_relatives_ask',
    title: '遠房親戚的請託',
    ages: [24, 62],
    once: false,
    cooldown: 8,
    weight: 0.5,
    tags: ['family', 'money', 'regional'],
    cond: (s, h) => !h.incomeAtLeast('H') && h.isRegion('SSA', 'SAS', 'SEA', 'MENA', 'CAS', 'LAC') && h.stat('wealth') >= 25,
    text: (s, h) => '你家境比同族的人稍微好一些，於是遠近的親戚都開始有事找你：繳學費、付醫藥費、湊喪葬費。你算了算，這個月自己的開銷快要被別人的需要吃掉一半。',
    effects: { wealth: -3, social: +4, happiness: -1 },
  },
  {
    id: 'family_old_friend_reunion',
    title: '老同學的聚會',
    ages: [28, 62],
    once: false,
    cooldown: 10,
    weight: 0.45,
    tags: ['family', 'friends'],
    text: (s, h) => `有人突然打電話來提議聚會。你本來想推託，最後還是去了。一進門，大家都胖了、禿了、白了，卻在笑聲響起的瞬間，同時回到了${h.eduYears() >= 9 ? '十六歲的教室' : '年輕時一起放牛、打水的那個年紀'}。`,
    effects: { social: +4, happiness: +3 },
  },
  {
    id: 'family_friend_in_need',
    title: '朋友的難關',
    ages: [26, 62],
    once: false,
    cooldown: 8,
    weight: 0.7,
    tags: ['family', 'friends', 'money'],
    cond: (s, h) => h.stat('social') >= 30,
    text: (s, h) => '多年的好友突然約你出來，坐下來很久都沒開口。最後對方說，自己遇到了困難：工作沒了、房東要趕人，或是家人病了。那雙握著杯子的手，比平常瘦了一圈。',
    choices: [
      {
        label: '借錢給朋友，不問太多',
        effects: { wealth: -3, social: +4, happiness: +2 },
        result: '你把錢放進對方的包包，說「等好了再說」。對方沒有哭，只是用力握了你的手。多年後你才知道，那天對方回家後哭了一整夜。',
        ai: (s, h) => (h.stat('wealth') > 50 ? 1.6 : 0.8),
      },
      {
        label: '讓朋友暫住，一起找出路',
        effects: { social: +4, happiness: +1, health: -1 },
        result: '客廳的沙發成了朋友的床。你們晚上一起煮泡麵、投履歷，笑著說這比大學時還刺激。三個月後，朋友終於搬走了。',
        ai: 1.4,
      },
      {
        label: '介紹資源或工作，保持距離',
        effects: { social: +1, knowledge: +1 },
        result: '你把能想到的窗口和人脈都寫給朋友。實際幫上多少你不確定，但至少你讓對方知道：你沒有轉身。',
        ai: 1.3,
      },
    ],
  },
  {
    id: 'family_friend_drift',
    title: '愈來愈少的聯絡',
    ages: [30, 62],
    once: false,
    cooldown: 10,
    weight: 0.4,
    tags: ['family', 'friends'],
    text: (s, h) => (h.yearIn(2012, 3000)
      ? '你翻開通訊錄，才發現有好幾個以前每天聯絡的人，已經兩年沒說過話了。不是吵架，只是各自有了家庭、工作、孩子。你傳了一個「最近好嗎？」，對方隔了三天才回，附了一個很久沒看到的貼圖。'
      : '你翻開電話簿，才發現有好幾個以前每天聯絡的人，已經兩年沒說過話了。不是吵架，只是各自有了家庭、工作、孩子。你撥了一通電話，對方沒接，隔了三天才回撥，聲音裡有一點意外，也有一點開心。'),
    effects: { social: -3, happiness: -1 },
  },
  {
    id: 'family_community_group',
    title: '不只是工作和家',
    ages: [26, 62],
    weight: 0.7,
    tags: ['family', 'friends', 'community'],
    cond: (s, h) => !h.has('f_community') && h.stat('social') < 70,
    text: (s, h) => `你發現自己的生活只剩下${h.employed() ? '工作和家' : '家裡的瑣事'}。鄰居邀你加入社區的活動，${h.wageEarner() ? '同事說公司附近有人在組球隊' : '朋友說附近有人在組球隊'}，${h.worshipPlace() ? `${h.worshipPlace()}的` : '社區中心的'}志工小組也缺人。你有點心動，也有點怕麻煩。`,
    choices: [
      {
        label: '加入志工或社區服務團體',
        effects: { social: +5, happiness: +3, knowledge: +1 },
        set: ['f_community'],
        result: '你們每個月做一次活動：打掃、辦義賣、教長輩填表格、辦手續。你第一次發現，被需要的感覺比被稱讚更讓人上癮。',
        ai: 1.6,
      },
      {
        label: '加入運動或興趣社團',
        effects: { social: +3, health: +3, happiness: +2 },
        set: ['f_community'],
        result: '第一次練球你累到說不出話，但隔天身體很誠實地想再去。你在場邊認識了幾個很有趣的人，也認識了自己很久沒用過的肌肉。',
        ai: 1.6,
      },
      {
        label: '只在需要的時候幫忙，不固定加入',
        effects: { social: +1, happiness: +1 },
        set: ['f_community'],
        result: '你保持彈性，有時幫鄰居搬東西，有時參加一場活動。你不是任何團體的成員，卻是許多人想得到的那個「有空的人」。',
        ai: 1,
      },
    ],
  },
  {
    id: 'family_neighbor_help',
    title: '隔壁的鄰居',
    ages: [25, 66],
    once: false,
    cooldown: 8,
    weight: 0.4,
    tags: ['family', 'community'],
    text: (s, h) => h.byIncome({
      L: '你家屋頂被風掀了一角，隔壁鄰居不等你開口就拿著梯子來了。半天後屋頂補好，主人家連一杯茶都沒讓你泡就走了，你站在補好的屋頂下，抬頭笑了很久。',
      LM: `你生病那週，鄰居${h.hasChildren() && h.youngestChildAge() <= 12 ? '幫忙接送孩子' : '幫忙跑腿買藥'}、送來了熱湯。你想還禮，對方只擺擺手說：「下次換我有事，換你。」那碗湯，你喝得特別慢。`,
      UM: '你的車在雨中拋錨，路過的鄰居二話不說停下來幫忙。這是你住進這個社區以來，第一次和對方說上這麼多話。後來你們成了會互相借醬油的人。',
      H: `社區的${h.yearIn(2008, 3000) ? '群組' : '佈告欄'}裡常常有人互相幫忙：找貓、借工具、送多出來的菜。你原本不太參與，卻在某個週末被一句「你有空嗎？」拉進了熱鬧裡。`,
    }),
    effects: { social: +4, happiness: +3 },
  },
  // ---- Phase 4A: 家人的旅行 ----
  {
    id: 'family_weekend_trip',
    title: '全家出遊的週末',
    ages: [28, 62],
    once: false,
    cooldown: 8,
    weight: 0.5,
    tags: ['travel', 'family', 'fun'],
    cond: (s, h) => h.incomeAtLeast('LM') && h.stat('wealth') >= 35 && (together(h) || (h.hasPartner() && !h.married() && !h.isMigrant()) || h.livesWith('children')),
    text: (s, h) => `你們難得排開了所有的事，把幾個人塞進同一輛車、同一趟火車，或同一間小小的旅館。${h.minorsWithYou().some((c) => s.year - c.birthYear <= 12) ? '孩子在後座問了十七次「還有多久」，' : ''}路上的風景比目的地更值得記住。`,
    choices: [
      {
        label: '什麼計畫都不排，走到哪算哪',
        effects: { happiness: +4, social: +3, wealth: -2 },
        result: '你們錯過了一個景點，卻在路邊撿到一間不起眼的小店，店主硬塞給你們一袋水果。很多年後，家人聊起那趟旅行，第一件事都是那袋水果。',
        ai: 1.8,
      },
      {
        label: '照著計畫表，把每一站走完',
        effects: { happiness: +2, social: +2, wealth: -2, health: -1 },
        result: '你們準時趕上每一站，拍了很多照片，也累了很多次。回家路上大家都睡著了，只有你清醒地看著窗外，把這一趟默默收進記憶裡。',
        ai: 1.2,
      },
      {
        label: '這次不去，把錢留給更需要的事',
        effects: { wealth: +1, happiness: -1 },
        result: '你們在家附近散了步，吃了一頓比平常稍好的晚餐。沒有人抱怨，可是你注意到家裡最小的人，偷偷把旅遊雜誌多翻了一遍。',
        ai: 1,
      },
    ],
  },
];
