// Events about work, careers and money (typically ages 18-65): first jobs, apprenticeships, bosses, unions,
// layoffs, farming and informal trade, debt, savings, housing, conscription, personal economic shocks.
// Ids start with `work_`. Flags used by this file start with `w_` (so they cannot clash with other agents).
//
// Conventions
//   * Outcomes that a follow-up event must describe are rolled when the choice is made and stored as a
//     flag (e.g. w_exam_pass); follow-ups only read flags, so every text is total on any state.
//   * Chains (choice -> schedule -> follow-up, weight 0 so they only fire when scheduled):
//     apprentice -> own workshop | civil exam -> result | night school -> diploma | overtime -> burnout
//     union vote -> strike result | layoff -> retraining | business loan -> outcome | savings group -> payout
//     side hustle -> grows | home purchase -> mortgage squeeze | savings -> market | drought -> (migration)
//     military -> career soldier | scam -> aftermath
//   * The yearly systems already handle: first job, layoffs (generic), job changes, retirement, homemakers
//     returning to work. Events here add texture and decisions around those, never a second system.

const CONSCRIPT = new Set(['KOR', 'TWN', 'ISR', 'SGP', 'RUS', 'TUR', 'EGY', 'IRN', 'GRC', 'FIN', 'CHE', 'AUT', 'NOR', 'SWE', 'THA', 'PRK', 'UKR', 'BLR', 'VNM']);

const SELF_JOBS = ['shopkeeper', 'street_vendor', 'entrepreneur', 'artisan', 'farmer', 'fisher'];
const OFFICE_JOBS = ['clerk', 'civil_servant', 'manager', 'accountant', 'lawyer', 'sales'];
const GENDER_LEAN = {
  F: { construction: 0.25, driver: 0.3, guard: 0.3, miner: 0.1, soldier: 0.4 },
  M: { domestic: 0.3, nurse: 0.4, caregiver: 0.3 },
};

/** Occupation ids that fit the person's education and surroundings (used when an event puts someone into a new job). */
function jobPool(h) {
  if (h.eduAtLeast('graduate')) return ['researcher', 'engineer', 'developer', 'manager', 'teacher', 'accountant'];
  if (h.eduAtLeast('tertiary')) return ['teacher', 'nurse', 'accountant', 'engineer', 'developer', 'manager', 'clerk', 'civil_servant', 'technician'];
  if (h.eduAtLeast('secondary')) return ['clerk', 'sales', 'technician', 'factory', 'driver', 'cook', 'guard', 'shopkeeper', 'caregiver', 'civil_servant'];
  if (h.urban()) return ['laborer', 'street_vendor', 'domestic', 'construction', 'artisan', 'factory'];
  return ['laborer', 'farmer', 'street_vendor', 'domestic', 'construction', 'artisan'];
}

/** Put the person into a plausible new job (mild statistical gender lean, never a hard exclusion). */
function newJob(h) {
  const ids = jobPool(h);
  const lean = GENDER_LEAN[h.gender()] || {};
  const w = ids.map((id) => lean[id] ?? 1);
  let r = h.rand() * w.reduce((a, b) => a + b, 0);
  let k = 0;
  for (; k < ids.length - 1; k++) { r -= w[k]; if (r < 0) break; }
  h.startJob(ids[k]);
  return ids[k];
}

const selfEmployed = (h) => h.workStatus() === 'self';
const working = (h) => h.employed();
const atDesk = (h) => h.isJob(...OFFICE_JOBS, 'technician', 'engineer', 'developer', 'researcher');

export default [
  // =====================================================================================
  // A. 入行與早期職涯
  // =====================================================================================
  {
    id: 'work_apprentice_offer',
    title: '拜師還是領薪',
    ages: [18, 26],
    weight: 0.8,
    tags: ['work', 'youth', 'chain'],
    cond: (s, h) => !h.inSchool() && !h.eduAtLeast('tertiary') && !h.retired() && !h.has('w_apprentice')
      && (h.unemployed() || h.workStatus() === 'none' || h.isJob('laborer', 'street_vendor', 'domestic', 'factory')),
    text: (s, h) => h.byIncome({
      L: '鎮上修理行的老闆缺一個學徒，頭一年不付薪水，只管兩餐。另一邊，工地包工頭願意每天結現金。你得想清楚，是先吃飽，還是先學會。',
      LM: '同鄉的師傅願意收你當學徒，三年出師。可是朋友們都進了工廠，每個月準時領薪水，看起來神氣得很。你每次路過工廠門口，都要多看兩眼。',
      UM: '技職學校的老師介紹你去一間工作室當學徒，薪水少，但師傅在業界很有名。大廠的作業員缺也同時在招人。你把兩張通知並排放在桌上，看了一整晚。',
      H: '你對手上的工作提不起勁，一位做木工的朋友問你要不要來學手藝。薪水只有現在的一半，但你很久沒這麼想做一件事了，連洗澡時都在盤算該怎麼開始。',
    }),
    choices: [
      {
        label: '拜師學藝',
        hint: '短期收入少，但有一技之長',
        effects: (s, h) => { h.startJob('artisan'); h.change('knowledge', +4); h.change('wealth', -3); h.change('happiness', +2); },
        set: ['w_apprentice'],
        result: '頭半年你只負責掃地、遞工具和被罵。但某天師傅看了一眼你磨好的刀口，沒說話，點了點頭——這就夠了。',
        schedule: [{ id: 'work_own_workshop', inYears: [4, 8] }],
        ai: (s, h) => (h.isPoor() ? 0.8 : 1.4),
      },
      {
        label: '先去領穩定的薪水',
        effects: (s, h) => { h.startJob(h.eduYears() >= 6 ? 'factory' : 'laborer'); h.change('wealth', +3); h.change('knowledge', +1); },
        set: ['w_apprentice'],
        result: '你領到了第一份固定薪水，先拿一部分給家裡。學手藝的事你沒有忘，只是被排到「以後」的清單裡。',
        ai: (s, h) => (h.isPoor() ? 2 : 1),
      },
      {
        label: '再觀望一陣子',
        effects: { social: +1, happiness: -1 },
        result: '你回說要再想想。機會不會等人，但你也不想為了面子隨便點頭。',
        ai: 0.4,
      },
    ],
  },
  {
    id: 'work_own_workshop',
    title: '出師之後',
    ages: [20, 40],
    weight: 0,
    tags: ['work', 'followup'],
    cond: (s, h) => h.has('w_apprentice'),
    text: (s, h) => '師傅把你叫到工作檯邊，說你已經可以獨當一面。師傅的客人有幾位願意跟著你走，只是自己開工作室，從租場地到收帳都得從頭學。你的手心有點發熱。',
    choices: [
      {
        label: '自己開工作室',
        effects: (s, h) => {
          h.startJob(h.pick(['artisan', 'shopkeeper']));
          const ok = h.chance(0.6);
          h.set(ok ? 'w_workshop_ok' : 'w_workshop_hard');
          h.change('wealth', ok ? +5 : -4);
          h.change('happiness', ok ? +5 : -2);
        },
        result: (s, h) => (h.has('w_workshop_ok')
          ? '前兩年的訂單時多時少，但老客人口耳相傳，慢慢地你的名字也成了招牌。'
          : '訂單不穩，租金卻準時報到。你靠著幾位老客人撐著，邊做邊修正，沒有放棄的打算。'),
        highlight: '出師後自立門戶。',
        ai: 1.5,
      },
      {
        label: '留下來，繼續跟著師傅',
        effects: { happiness: +2, social: +2, wealth: +1 },
        result: '你留在熟悉的工作檯旁，薪水慢慢漲。師傅年紀大了，很多事開始交給你，你也習慣被叫「師傅」。',
        ai: 1,
      },
    ],
  },
  {
    id: 'work_civil_exam',
    title: '公家飯的考試',
    ages: [22, 34],
    weight: 0.7,
    tags: ['work', 'education', 'chain'],
    cond: (s, h) => h.eduAtLeast('secondary') && !h.retired() && !h.has('w_exam_done') && !h.isJob('civil_servant')
      && (!h.incomeAtLeast('H') || h.isRegion('EAS', 'MENA', 'EUR')),
    text: (s, h) => h.byIncome({
      L: '鎮上有人考上了公務員，全家都放鞭炮慶祝。你的親戚說：「考上就一輩子不用愁了。」名額很少，報名的人卻很多。你把報名表摺了又攤開，攤開又摺起來。',
      LM: '親戚們都說公家機關最穩，退休還有保障。報名簡章放在飯桌上，錄取率那一欄被你看了好幾遍，連媽媽都問你是不是在看電視劇的簡介。',
      UM: '朋友圈裡不少人開始準備國家考試，補習班和圖書館的座位一位難求。穩定的工作、退休金、準時下班，在這個年代聽起來有點奢侈。',
      H: '經濟不景氣，同學們一個接一個轉去準備公職考試，連咖啡店都變成了讀書會。你也被問了好幾次：「你不考嗎？」每一次你都笑著說「再想想」，心裡卻默默翻開了簡章。',
    }),
    choices: [
      {
        label: '辭掉打工，全力備考',
        effects: (s, h) => { h.set('w_exam_done'); h.set(h.chance(0.28) ? 'w_exam_pass' : 'w_exam_fail'); h.change('knowledge', +5); h.change('wealth', -5); h.change('happiness', -3); },
        result: '你在圖書館或租屋處一待就是一整年，每天的進度表貼滿牆。家人從不問成績，只是偷偷多放一顆蛋在你碗裡。',
        schedule: [{ id: 'work_exam_result', inYears: [1, 3] }],
        ai: (s, h) => (h.employed() ? 0.5 : 1.5),
      },
      {
        label: '邊工作邊準備',
        effects: (s, h) => { h.set('w_exam_done'); h.set(h.chance(0.14) ? 'w_exam_pass' : 'w_exam_fail'); h.change('knowledge', +3); h.change('health', -3); h.change('happiness', -1); },
        result: '你每天下班後擠出兩個小時看書。週末沒有約會，也沒有電影，只有一杯愈來愈濃的茶。',
        schedule: [{ id: 'work_exam_result', inYears: [2, 4] }],
        ai: 1.4,
      },
      {
        label: '不考了，走自己的路',
        effects: { happiness: +1, social: -1 },
        set: ['w_exam_done'],
        result: '你把簡章收進抽屜。親戚的唸叨你一律微笑接下，然後轉身去做自己想做的事。',
        ai: 1,
      },
    ],
  },
  {
    id: 'work_exam_result',
    title: '榜單上的名字',
    ages: [22, 45],
    weight: 0,
    tags: ['work', 'followup'],
    cond: (s, h) => h.has('w_exam_done'),
    text: (s, h) => (h.has('w_exam_pass')
      ? '你把榜單從頭到尾掃了三遍，才在中間看到自己的名字。電話打回家，那頭安靜了一下，然後傳來有人喜極而泣的聲音，你在這頭也忍不住笑出了眼淚。'
      : '榜單上沒有你的名字。你站在原地很久，直到後面的人輕輕碰了你一下。回家路上你想，至少那些背下來的東西不會憑空消失。然後你把准考證收進了抽屜。'),
    effects: (s, h) => {
      if (h.has('w_exam_pass')) { h.startJob('civil_servant'); h.change('wealth', +5); h.change('happiness', +7); h.change('social', +3); h.highlight('通過國家考試，進入公部門。'); }
      else { h.change('happiness', -4); h.change('knowledge', +2); }
      h.unset('w_exam_pass'); h.unset('w_exam_fail');
    },
  },
  {
    id: 'work_mentor',
    title: '帶你的前輩',
    ages: [20, 45],
    weight: 0.7,
    tags: ['work'],
    cond: (s, h) => working(h) && h.eduYears() >= 6 && s.work.yearsWorked >= 1 && s.work.yearsWorked <= 8 && !h.has('w_mentored'),
    text: (s, h) => `${h.jobName()}這一行的許多門道，是一位資深的同事在午休時隨口教你的。對方從不說大道理，只說「這個我以前也搞砸過」。多年後你教別人的時候，講的也是那幾句話。`,
    effects: { knowledge: +4, social: +3, happiness: +2 },
    set: ['w_mentored'],
  },
  {
    id: 'work_night_school',
    title: '白天上班，晚上念書',
    ages: [22, 45],
    weight: 0.7,
    tags: ['work', 'education', 'chain'],
    cond: (s, h) => working(h) && !h.eduAtLeast('graduate') && !h.has('w_night_school') && h.stat('wealth') >= 20,
    text: (s, h) => (h.yearIn(2012, 3000)
      ? '你在手機上看到一個進修課程的廣告：晚上上課、可以線上補課，畢業證書對升遷有幫助。學費不便宜，而且你的晚上本來就不多，每一個都排得滿滿的。'
      : '公司附近的夜間部在招生，下班後去上課，週末還有考試。同事說你瘋了，主管卻在茶水間悄悄問你報名了沒，眼神裡有一點期待，讓你多想了一整個週末。'),
    choices: [
      {
        label: '報名，咬牙讀完',
        effects: (s, h) => { h.set('w_night_school'); h.set(h.chance(0.7) ? 'w_diploma_ok' : 'w_diploma_drop'); h.change('knowledge', +5); h.change('health', -3); h.change('wealth', -3); h.change('social', -2); },
        result: '你學會了在捷運、公車上寫報告，也學會了跟瞌睡蟲談判。最糟的那個學期，你差點把筆摔了。',
        schedule: [{ id: 'work_diploma', inYears: [2, 4] }],
        ai: (s, h) => (h.stat('health') > 55 ? 1.5 : 0.6),
      },
      {
        label: '只選幾門和工作有關的課',
        effects: (s, h) => { h.set('w_night_school'); h.set('w_diploma_ok'); h.change('knowledge', +3); h.change('wealth', -1); },
        result: '你挑了最有用的幾門課，沒有學位，也沒有壓力。一年後同事發現你處理事情的方式變了。',
        schedule: [{ id: 'work_diploma', inYears: [1, 2] }],
        ai: 1.5,
      },
      {
        label: '算了，累了一天只想休息',
        effects: { happiness: +1 },
        set: ['w_night_school'],
        result: '你把簡章壓在最底下。晚上你多了兩個小時看劇，也多了一點不知道算不算愧疚的東西。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'work_diploma',
    title: '結業的那天',
    ages: [24, 52],
    weight: 0,
    tags: ['work', 'followup'],
    cond: (s, h) => h.has('w_night_school'),
    text: (s, h) => (h.has('w_diploma_ok')
      ? '你拿到了結業證書，沒有人鼓掌，但主管在走廊上對你點了點頭。證書的紙張很普通，你卻把它放在最顯眼的地方，連續好幾天都沒捨得收起來。'
      : '你還是沒能把課程讀完。不是不想，而是工作、家人與睡眠一天比一天擠。但那些筆記你一直留著，後來在工作上還真用到了不少，有時候比證書還管用。'),
    effects: (s, h) => {
      if (h.has('w_diploma_ok')) { h.change('knowledge', +4); h.change('wealth', +3); h.change('happiness', +4); }
      else { h.change('knowledge', +1); h.change('happiness', -2); }
      h.unset('w_diploma_ok'); h.unset('w_diploma_drop');
    },
  },
  {
    id: 'work_new_colleagues',
    title: '午休的同伴',
    ages: [20, 60],
    once: false,
    cooldown: 8,
    weight: 0.4,
    tags: ['work', 'social'],
    cond: (s, h) => working(h) && h.urban(),
    text: (s, h) => h.byIncome({
      L: '休息時間，大家蹲在牆邊分著吃各自帶的飯菜，有人講笑話，有人講家裡的事。你在這裡認識的人，比你想像的還多，也比你想像的更靠得住。',
      LM: '午休時你和同事們擠在一起吃便當，分享各家的醬菜與八卦。你發現這些人比主管更清楚這份工作的真相，也比誰都懂得在關鍵時刻幫你。',
      UM: '每天中午固定那幾個人一起吃飯，聊的不是工作，是孩子、房租和誰要結婚了。你不知不覺把他們當成了朋友，有時甚至比家人更早知道你的壞心情。',
      H: '茶水間的閒聊漸漸變成了每週五一起吃午餐的習慣。你在那裡聽到了公司真正的氣候，也聽到了很多只能在那裡講的笑話，有些甚至比會議紀錄更有用。',
    }),
    effects: { social: +4, happiness: +2 },
  },
  // =====================================================================================
  // B. 職場：主管、加班、工會、安全、欠薪、裁員
  // =====================================================================================
  {
    id: 'work_boss_conflict',
    title: '被當眾批評的那天',
    ages: [20, 58],
    weight: 0.9,
    tags: ['work', 'conflict'],
    cond: (s, h) => h.workStatus() === 'employed' && s.work.yearsWorked >= 1,
    text: (s, h) => h.byIncome({
      L: '老闆當著所有工人的面罵你動作慢，其實是機器又出了毛病。你握緊手裡的工具，手心全是汗。旁邊的人都假裝很忙，沒有人抬頭。',
      LM: '工頭在眾人面前把你罵得一文不值，只因為材料晚到，而材料晚到根本不是你的錯。周圍的人都低著頭，沒人敢出聲，你也一樣。',
      UM: '會議上，主管把你做了三週的成果批得一無是處，而問題明明出在主管臨時改的需求。會議室的冷氣冷得讓人發抖。你盯著桌面的木紋，數到第十七條才忍住沒有開口。',
      H: '主管在週會上當著所有人的面，否定了你的整份提案。你嘴上說「好的，我會調整」，心裡的草稿已經改成辭職信，只差按下寄出。',
    }),
    choices: [
      {
        label: '事後私下把話說清楚',
        effects: (s, h) => {
          if (h.chance(0.6)) { h.set('w_talk_ok'); h.change('happiness', +3); h.change('social', +2); }
          else { h.unset('w_talk_ok'); h.change('happiness', -3); h.change('social', -1); }
        },
        result: (s, h) => (h.has('w_talk_ok')
          ? '對方沉默了一會，說：「那個需求確實是我後來改的。」雖然沒有道歉，但下一次開會，對方把你的名字寫進了致謝名單。'
          : '你把話說得很有條理，對方卻只是看著桌面點頭。你不確定對方聽進去多少，但至少你沒有讓這件事爛在心裡。'),
        unset: ['w_talk_ok'],
        ai: 2,
      },
      {
        label: '嚥下這口氣，繼續把事做好',
        effects: { happiness: -3, health: -1, knowledge: +1 },
        result: '你什麼都沒說，晚上多喝了一碗湯。這件事不會憑空消失，但你學會了先把事做完再難過。',
        ai: 1.2,
      },
      {
        label: '開始悄悄找下一份工作',
        effects: (s, h) => {
          if (h.chance(0.35)) { newJob(h); h.change('wealth', +3); h.change('happiness', +3); h.set('w_switched_boss'); }
          else { h.change('happiness', -1); h.change('knowledge', +1); h.unset('w_switched_boss'); }
        },
        result: (s, h) => (h.has('w_switched_boss')
          ? '你在午休時投了幾份履歷，其中一個很快回信。遞出辭呈那天，你忽然覺得走廊的燈亮了一點。'
          : '你更新了履歷，也看清了市場行情。暫時沒有好消息，但至少你不再覺得自己別無選擇。'),
        unset: ['w_switched_boss'],
        ai: (s, h) => (h.stat('happiness') < 45 ? 2 : 1),
      },
    ],
  },
  {
    id: 'work_overtime_wave',
    title: '趕貨的季節',
    ages: [22, 55],
    weight: 0.9,
    tags: ['work', 'chain', 'stress'],
    cond: (s, h) => h.workStatus() === 'employed' && !h.has('w_overworked') && !h.seenEvent('health_burnout'),
    text: (s, h) => h.byIncome({
      L: '訂單突然變多，廠方說要連續幾週趕工，每天做到天黑。加班費怎麼算，沒有人說得清楚，只知道不做就有人排隊接替。夜裡你的手臂一直抽痛。',
      LM: '工廠趕出貨，加班加到每週只剩一天休息。同鄉的工友說：「撐過這季，年底就有獎金。」你把這句話當成口訣，在機器的轟隆聲裡一遍遍唸給自己聽。',
      UM: '專案進度落後，主管說「大家一起撐一下」。一撐就是三個月，晚餐變成辦公桌上的便當，末班車成了你每天的下班鐘聲，連週末都在趕報告。',
      H: '專案上線前的最後兩個月，辦公室的燈凌晨一點還亮著。主管說這是「成長的機會」，你的睡眠說這不是，你的黑眼圈則表示意見很大。',
    }),
    choices: [
      {
        label: '全力配合，先賺這一波',
        effects: { wealth: +4, health: -4, social: -2, happiness: -2 },
        set: ['w_overworked'],
        result: '你把鬧鐘調早、把晚餐壓縮成十分鐘，戶頭的數字漲得很快。你只是偶爾在鏡子裡認不出自己的臉色。',
        schedule: [{ id: 'work_burnout', inYears: [2, 4] }],
        ai: (s, h) => (h.isPoor() ? 2 : h.stat('health') > 60 ? 1.3 : 0.6),
      },
      {
        label: '做完分內事就下班',
        effects: { wealth: -1, happiness: +2, health: +1, social: -1 },
        result: '每天準時打卡下班，一開始有人側目，過了兩週也就沒人說什麼。你終於記得了家門口那棵樹的名字。',
        ai: 1.4,
      },
      {
        label: '找主管談工時與補償',
        effects: (s, h) => {
          if (h.chance(0.5)) { h.change('wealth', +2); h.change('happiness', +2); h.set('w_ot_deal'); }
          else { h.change('happiness', -2); h.change('social', -1); h.unset('w_ot_deal'); }
        },
        result: (s, h) => (h.has('w_ot_deal')
          ? '主管想了想，同意讓你輪休、加班費照算。其他同事看你的眼神，多了一點「早知道也去問」。'
          : '主管說「現在大家都很辛苦」，話題就結束了。你走出辦公室，覺得自己好像說了一句沒有人接的話。'),
        unset: ['w_ot_deal'],
        ai: 1,
      },
    ],
  },
  {
    id: 'work_burnout',
    title: '起不來的早晨',
    ages: [24, 62],
    weight: 0,
    tags: ['work', 'followup', 'mental'],
    cond: (s, h) => h.has('w_overworked'),
    text: (s, h) => '鬧鐘響了，你坐在床邊，發現自己沒有力氣站起來。不是睡眠不足，是整個人像被抽乾了。你坐了二十分鐘才勉強站起來，心裡明白，這是這幾年累積的帳單。',
    choices: [
      {
        label: '請長假，好好休息',
        effects: { health: +6, happiness: +3, wealth: -4, social: +1 },
        result: '你在老家的巷子和附近的小公園慢慢走路，睡到自然醒。第三週，你才發現自己已經很久沒有真正笑過。',
        unset: ['w_overworked'],
        ai: (s, h) => (h.stat('health') < 50 ? 2.5 : 1.2),
      },
      {
        label: '換一份步調慢一點的工作',
        cond: (s, h) => working(h),
        effects: (s, h) => { newJob(h); h.change('happiness', +4); h.change('wealth', -2); h.change('health', +3); },
        result: '薪水少了一些，但你終於能在天黑前回家。晚飯桌上，家人說你的臉比較有血色了。',
        unset: ['w_overworked'],
        ai: 1.3,
      },
      {
        label: '硬撐過去，不然怎麼辦',
        effects: (s, h) => { h.change('health', -6); h.change('happiness', -4); h.addRisk(1.05, 3); },
        result: '你灌了咖啡、關了鬧鐘，繼續上班。身體沒有說話，只是把這一筆記進了更長的帳本。',
        unset: ['w_overworked'],
        ai: 0.6,
      },
    ],
  },
  {
    id: 'work_harassment',
    title: '不舒服的玩笑',
    ages: [19, 52],
    weight: (s, h) => (h.female() ? 0.9 : 0.4),
    tags: ['work', 'conflict'],
    cond: (s, h) => h.workStatus() === 'employed' && s.work.yearsWorked >= 0,
    text: (s, h) => (h.yearIn(2008, 3000)
      ? '一位資深的同事常在下班後傳訊息給你，說是「開玩笑」。你不確定這算不算大事，但你已經開始刻意避開茶水間，連上洗手間都要先看時間。'
      : '聚餐時，一位資深的同事總愛把手搭在你肩上，說是「開玩笑」。你不確定該不該說什麼，但你開始找藉口缺席聚餐，每次編理由時都覺得荒謬：做錯事的明明不是你。'),
    choices: [
      {
        label: '向人資、主管或工會正式反映',
        cond: (s, h) => h.incomeAtLeast('LM'),
        effects: (s, h) => {
          if (h.chance(0.55)) { h.set('w_report_ok'); h.change('happiness', +3); h.change('social', +1); }
          else { h.unset('w_report_ok'); h.change('happiness', -4); h.change('social', -3); }
        },
        result: (s, h) => (h.has('w_report_ok')
          ? '調查過程很漫長，但最後對方被調離你的部門。你走進辦公室時，肩膀終於放下來一點。'
          : '程序走完了，結論是「查無具體事證」。你坐回座位，覺得自己像被請出一間你剛剛花力氣敲過門的房間。'),
        unset: ['w_report_ok'],
        ai: 1.6,
      },
      {
        label: '當面明確拒絕，並告訴信任的同事',
        effects: { happiness: +1, social: +2 },
        result: '你清楚地說：「請不要再這樣。」對方一時語塞。接下來幾天氣氛尷尬，但你的同事們開始默默地陪你一起走出會議室。',
        ai: 1.8,
      },
      {
        label: '保留紀錄，先找下一份工作',
        effects: (s, h) => {
          if (h.chance(0.5)) { newJob(h); h.change('wealth', -1); h.change('happiness', +3); }
          else { h.change('happiness', -1); }
        },
        result: '你把每一則紀錄、每一次日期都存了起來。離開不是認輸，只是你決定自己的時間要花在哪裡。',
        ai: 1.1,
      },
    ],
  },
  {
    id: 'work_pay_raise',
    title: '同工不同酬',
    ages: [24, 55],
    weight: 0.8,
    tags: ['work', 'money'],
    cond: (s, h) => h.workStatus() === 'employed' && h.eduYears() >= 6 && s.work.yearsWorked >= 3,
    text: (s, h) => '年終時你無意間得知，做著同樣事情的新同事，薪水竟比你高。這件事讓你睡不著，也讓你開始練習該怎麼開口。你對著浴室的鏡子，把第一句話練了十幾遍。',
    choices: [
      {
        label: '整理成果與市場行情，正式提出',
        effects: (s, h) => {
          const p = 0.5 + (h.has('w_mentored') ? 0.1 : 0) + (h.stat('knowledge') >= 50 ? 0.1 : 0);
          if (h.chance(p)) { h.set('w_raise_ok'); h.change('wealth', +5); h.change('happiness', +4); }
          else { h.unset('w_raise_ok'); h.change('wealth', +1); h.change('happiness', -2); }
        },
        result: (s, h) => (h.has('w_raise_ok')
          ? '你帶著表格走進辦公室，緊張得手指發冷。三天後，人資寄來新的薪資通知。你把那封信看了又看。'
          : '主管說預算有限，答應「明年再看」。你至少拿到了一點調整，也確定了自己在這家公司的位置。'),
        unset: ['w_raise_ok'],
        ai: 2,
      },
      {
        label: '旁敲側擊，暗示一下就好',
        effects: (s, h) => { if (h.chance(0.25)) { h.change('wealth', +3); h.change('happiness', +2); } else { h.change('happiness', -2); } },
        result: '你在閒聊裡丟了幾句話，主管笑著點頭。後來什麼也沒發生，你只好告訴自己：至少我說過了。',
        ai: 0.9,
      },
      {
        label: '把這件事放下，專心做好自己的',
        effects: { happiness: -2, knowledge: +1, social: +1 },
        result: '你吞下這口悶氣，繼續準時交件。偶爾在薪資單前出神，但日子還是得往前過。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'work_team_lead',
    title: '要不要帶人',
    ages: [28, 52],
    weight: 0.8,
    tags: ['work', 'career'],
    cond: (s, h) => h.workStatus() === 'employed' && h.eduAtLeast('secondary') && s.work.yearsWorked >= 4 && !h.isJob('manager'),
    text: (s, h) => '主管把你叫進小會議室，問你要不要帶一個小組。薪水會多一些，但你的行事曆將被別人填滿，你再也不能只管把自己的事做好。你說「讓我想想」，主管笑著點頭。',
    choices: [
      {
        label: '接下，學著當主管',
        effects: (s, h) => {
          h.change('wealth', +4); h.change('social', +3); h.change('health', -2); h.change('happiness', h.chance(0.55) ? +3 : -3);
        },
        set: ['w_team_lead'],
        result: '第一個月你被每個人的問題淹沒。第三個月，你發現自己開始在乎「怎麼讓大家少加班」，而不只是「怎麼把事做完」。',
        highlight: '開始帶領一個團隊。',
        ai: (s, h) => (h.stat('social') >= 50 ? 1.5 : 0.8),
      },
      {
        label: '婉拒，留在專業崗位',
        effects: { knowledge: +3, happiness: +2 },
        result: '你說你更喜歡把手上的事做到最好。主管有點意外，但沒有為難你，後來還把最難的案子交給你。',
        ai: 1.2,
      },
      {
        label: '先試做半年，不行就換回來',
        effects: { wealth: +2, social: +2, knowledge: +2, health: -1 },
        result: '你談好了試行期。半年後的檢討會上，你誠實地說了自己的優缺點，結果是大家都比預期還滿意。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'work_union_vote',
    title: '要不要停工',
    ages: [22, 58],
    weight: 0.7,
    tags: ['work', 'chain', 'conflict'],
    cond: (s, h) => h.workStatus() === 'employed' && h.isJob('laborer', 'factory', 'construction', 'miner', 'driver', 'teacher', 'nurse', 'guard', 'caregiver', 'technician', 'civil_servant', 'cook'),
    text: (s, h) => h.byIncome({
      L: '工人們聚在工寮外議論：薪水又被拖了，有人提議大家一起停工。誰先站出來，誰就可能先被點名，所以每個人都在偷偷看別人的臉色。',
      LM: '工會代表挨個問大家：資方想砍年終，要不要一起表決停工？簽名單傳到你手上，你的名字前面已經有兩個人簽了，筆還是溫的，你握著它，聽見自己的心跳。',
      UM: '公司宣布調整輪班與津貼，工會要求協商不成，準備投票。你的同事們分成了兩派，午餐桌上氣氛有點僵，連微波爐前排隊都帶著火藥味。',
      H: '資方提出新的薪資方案，工會召開大會準備表決是否發動行動。你收到一份措辭很客氣的公告，要你「理性思考」。你讀了兩遍，覺得每個字都客氣得很用力。',
    }),
    choices: [
      {
        label: '加入行動，一起站出去',
        effects: (s, h) => {
          const r = h.rand();
          h.unset('w_strike_win'); h.unset('w_strike_fired');
          if (r < 0.5) h.set('w_strike_win'); else if (r > 0.86) h.set('w_strike_fired');
          h.change('social', +5); h.change('wealth', -2); h.change('happiness', +1);
        },
        result: '你跟著大家站在門口，手裡拿著寫得歪歪扭扭的牌子。有人帶來了熱茶，有人唱起歌，你第一次覺得，原來「我們」可以這麼大聲。',
        schedule: [{ id: 'work_strike_result', inYears: [0, 1] }],
        ai: (s, h) => (h.stat('social') >= 50 ? 1.4 : 0.8),
      },
      {
        label: '照常上班，不參與',
        effects: { social: -3, wealth: +1, happiness: -1 },
        result: '你選擇走進工作場所，門口有認識的人看了你一眼，沒說話。這個決定你得扛一陣子。',
        ai: 1.1,
      },
      {
        label: '私下支持，捐點錢但不出面',
        effects: { social: +1, wealth: -1 },
        result: '你把一點錢交給負責的同事，說「我家裡有事走不開」。對方明白，也沒有多問。',
        ai: 1.3,
      },
    ],
  },
  {
    id: 'work_strike_result',
    title: '協商結果出來了',
    ages: [22, 62],
    weight: 0,
    tags: ['work', 'followup'],
    text: (s, h) => (h.has('w_strike_win')
      ? '協商拖了幾個星期，最後資方讓步了一大半。簽字那天大家在門口拍了合照，你笑得有點傻，因為從來沒想過自己會出現在這種照片裡。'
      : h.has('w_strike_fired')
        ? '行動結束後，你收到一張資遣通知，名單上有幾個熟悉的名字。有人說這是報復，有人說這是「業務調整」。你收拾桌面，什麼也沒說。'
        : '協商的結果只拿到一部分：津貼調了一點，其他押後再議。有人失望，有人說至少沒有更糟。你自己心裡明白，這件事讓大家之間的關係不一樣了。'),
    effects: (s, h) => {
      if (h.has('w_strike_win')) { h.change('wealth', +4); h.change('happiness', +4); h.change('social', +2); h.highlight('參與工人行動，爭取到了更好的待遇。'); }
      else if (h.has('w_strike_fired')) { if (h.employed()) h.loseJob(); h.change('wealth', -4); h.change('happiness', -4); h.change('social', +1); }
      else { h.change('wealth', +1); h.change('social', +2); }
      h.unset('w_strike_win'); h.unset('w_strike_fired');
    },
  },
  {
    id: 'work_unsafe_site',
    title: '裂開的安全帽',
    ages: [19, 58],
    weight: 0.8,
    tags: ['work', 'safety'],
    cond: (s, h) => h.workStatus() === 'employed' && h.isJob('construction', 'miner', 'factory', 'laborer'),
    text: (s, h) => '安全帽有裂縫，護欄只用膠帶綁著。昨天有人差點摔下去，主管只說「小心點」。你知道這樣下去，遲早有人會出事。你的手套磨破了第二雙，沒人提起要換新的。',
    choices: [
      {
        label: '拒絕在沒有防護的地方作業',
        effects: (s, h) => {
          if (h.chance(0.5)) { h.set('w_safe_ok'); h.change('social', +3); h.change('health', +1); }
          else { h.unset('w_safe_ok'); h.loseJob(); h.change('wealth', -3); h.change('happiness', -2); }
        },
        result: (s, h) => (h.has('w_safe_ok')
          ? '主管瞪了你很久，最後還是叫人去買了新的護欄。工友們沒說謝謝，只是悄悄把最安全的位置讓給你。'
          : '你被叫去算帳，隔天就沒有排班。你有點後悔，但腦海裡閃過那個差點摔下去的同事，又覺得心安。'),
        unset: ['w_safe_ok'],
        ai: 1,
      },
      {
        label: '聯合工友一起向主管反映',
        effects: (s, h) => { h.change('social', +3); if (h.chance(0.6)) { h.change('health', +2); h.change('happiness', +2); } else { h.change('happiness', -1); } },
        result: '你們七八個人一起走到辦公室。人多的時候，主管的聲音果然小了一點。護具沒有一次到位，但每個月都多了一樣。',
        ai: 1.8,
      },
      {
        label: '自己多留意，繼續做',
        effects: (s, h) => { h.change('wealth', +1); h.change('health', -2); h.addRisk(1.08, 3); },
        result: '你把每一個動作放慢一拍，繼續出工。家裡需要這份收入，你沒辦法只為了原則放下工具。',
        ai: (s, h) => (h.isPoor() ? 1.8 : 0.8),
      },
    ],
  },
  {
    id: 'work_wage_arrears',
    title: '下週一定補',
    ages: [18, 58],
    weight: (s, h) => h.byIncome({ L: 1, LM: 1, UM: 0.5, H: 0.15 }),
    tags: ['work', 'money', 'conflict'],
    cond: (s, h) => h.workStatus() === 'employed' && h.isJob('laborer', 'construction', 'domestic', 'factory', 'cook', 'guard', 'driver', 'miner'),
    text: (s, h) => '老闆說這個月資金週轉不靈，薪水「下週一定補」。下週又下週，房東、米缸、家人，沒有一個等得及老闆的下週。你學會了用最少的錢，煮出最能飽肚子的一頓飯。',
    choices: [
      {
        label: '和同事一起去勞工單位反映',
        cond: (s, h) => h.incomeAtLeast('LM'),
        effects: (s, h) => {
          if (h.chance(0.55)) { h.set('w_arrears_ok'); h.change('wealth', +4); h.change('social', +2); }
          else { h.unset('w_arrears_ok'); h.change('wealth', -1); h.change('happiness', -3); }
        },
        result: (s, h) => (h.has('w_arrears_ok')
          ? '調解那天，老闆的態度變得很客氣。拿回那筆錢時，你先去買了一大袋米，和家人煮了一鍋飯。'
          : '勞工單位受理了，但流程拖得很長。你不確定那筆錢還會不會回來，只知道自己至少試過。'),
        unset: ['w_arrears_ok'],
        ai: 2,
      },
      {
        label: '繼續做，相信老闆會補',
        effects: (s, h) => { if (h.chance(0.4)) { h.change('wealth', +3); h.change('happiness', +1); } else { h.change('wealth', -5); h.change('happiness', -4); } },
        result: '你把家裡能省的都省了，繼續出工。結果好壞各一半，這種事誰也不能保證，只有日子要天天過。',
        ai: (s, h) => (h.isPoor() ? 1.3 : 0.6),
      },
      {
        label: '辭職另找，那筆錢就算了',
        effects: (s, h) => { newJob(h); h.change('wealth', -3); h.change('happiness', -1); h.change('social', +1); },
        result: '你向老闆要了最後一次，沒有結果，就把工具裝進袋子走了。新的工作薪水說得很清楚：每週五，現金。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'work_job_scam',
    title: '免經驗，月入三萬',
    ages: [18, 40],
    weight: 0.6,
    tags: ['work', 'scam', 'chain'],
    cond: (s, h) => (h.unemployed() || h.workStatus() === 'none' || h.isPoor()) && !h.incomeAtLeast('H') && !h.has('w_scammed'),
    text: (s, h) => (h.yearIn(2010, 3000)
      ? '社群上的招聘貼文寫著「在家兼職，日領現金」，客服親切又有耐心，只是上工前要先匯一筆「保證金」。你知道不太對，但帳單也是真的，所以你把頁面截圖存了又刪、刪了又存。'
      : '街上的招工告示寫著「免經驗、月入三萬」，面談時對方說先繳訓練費與保證金，馬上就能上工。你知道不太對，但帳單也是真的，所以你把頁面截圖存了又刪、刪了又存。'),
    choices: [
      {
        label: '先查證，問清楚再說',
        effects: { knowledge: +2, social: +1 },
        result: '你查了公司的登記，打電話向朋友確認，兩小時後結論是：這是假的。你鬆了一口氣，順手把消息轉給也在找工作的朋友。',
        ai: 2,
      },
      {
        label: '把錢匯過去，賭一把',
        effects: (s, h) => {
          if (h.chance(0.35)) { h.unset('w_scammed'); newJob(h); h.change('wealth', +2); h.change('happiness', +3); }
          else { h.set('w_scammed'); h.change('wealth', -6); h.change('happiness', -5); }
        },
        result: (s, h) => (h.has('w_scammed')
          ? '對方再也聯絡不上，電話變成了空號。你盯著手上的收據看了很久，覺得自己的臉燙得像在發燒。'
          : '這回運氣站在你這邊，工作是真的，雖然薪水沒有宣傳的那麼好。你悄悄決定，下次不再賭這種運氣。'),
        schedule: [{ id: 'work_scam_aftermath', inYears: [0, 1] }],
        ai: (s, h) => (h.isPoor() ? 0.8 : 0.3),
      },
      {
        label: '約朋友一起去看看再決定',
        effects: (s, h) => { h.change('social', +2); h.change('knowledge', +1); },
        result: '你們三個人一起去面談，現場氣氛怪得很，沒有人簽約。回程路上大家笑成一團，那是這個月你最輕鬆的一刻。',
        ai: 1.4,
      },
    ],
  },
  {
    id: 'work_scam_aftermath',
    title: '被騙之後',
    ages: [18, 55],
    weight: 0,
    tags: ['work', 'followup'],
    cond: (s, h) => h.has('w_scammed'),
    text: (s, h) => (h.has('w_scammed')
      ? '過了幾個月，你終於敢把這件事說出口。朋友沒有笑你，反而說自己的表弟去年也被騙過一次。你發現，羞愧這種東西，說出來就小了一半。'
      : '那份工作的薪水雖然比宣傳的少，但至少是真的。你回頭想起匯出保證金那天手心的冷汗，才明白自己當時多幸運，也暗自決定：下次先查證，再說。'),
    effects: (s, h) => {
      if (h.has('w_scammed')) { h.change('happiness', +2); h.change('social', +3); h.change('knowledge', +1); }
      else { h.change('knowledge', +2); h.change('happiness', +1); }
      h.unset('w_scammed');
    },
  },
  {
    id: 'work_layoff_wave',
    title: '裁員名單',
    ages: [26, 58],
    weight: 0.7,
    tags: ['work', 'shock', 'chain'],
    cond: (s, h) => h.workStatus() === 'employed' && s.work.yearsWorked >= 2,
    text: (s, h) => h.byIncome({
      L: '工廠的訂單少了，老闆說要「縮編」。廠門口貼出一張名單，工人們一個一個湊過去看，又一個一個沉默地走開。你站在最後面，等了很久才敢走近。',
      LM: '你上班的廠房宣布外移，管理階層說會提供資遣費。同事私下比較著數字，沒有人說這夠不夠，大家只是反覆問彼此：「那你打算怎麼辦？」',
      UM: '公司宣布組織調整，會議室裡坐著臉色相同的人。你收到一份「自願離職方案」，期限一週，上面的每個字都很客氣，意思卻很清楚。',
      H: '產業整併，你所在的部門要縮減三成。人資發下來的通知措辭客氣，條款你讀了四遍，每讀一遍，胃就往下沉一點，辦公室裡的竊竊私語還沒停。',
    }),
    choices: [
      {
        label: '領資遣費，另謀出路',
        effects: (s, h) => { h.loseJob(); h.change('wealth', +1); h.change('happiness', -4); h.change('social', -1); },
        result: '你收拾紙箱，和同事一一道別。走出大門時，天空藍得讓人有點想哭。你告訴自己，先睡三天再說。',
        schedule: [{ id: 'work_retraining', inYears: [0, 1] }],
        ai: 1.2,
      },
      {
        label: '接受減薪或調職，留下來',
        effects: { wealth: -4, happiness: -3, social: +1 },
        result: '你在新的合約上簽了名。薪水少了一截，但每個月還有固定的錢進來，這對很多事來說就夠了。',
        ai: (s, h) => (h.isPoor() ? 1.8 : 1),
      },
      {
        label: '拿資遣費當本金，自己試試看',
        cond: (s, h) => h.stat('wealth') >= 25,
        effects: (s, h) => {
          h.startJob(h.pick(['shopkeeper', 'entrepreneur', 'street_vendor']));
          if (h.chance(0.45)) { h.set('w_layoff_biz_ok'); h.change('wealth', +4); h.change('happiness', +4); }
          else { h.unset('w_layoff_biz_ok'); h.change('wealth', -5); h.change('happiness', -3); }
        },
        result: (s, h) => (h.has('w_layoff_biz_ok')
          ? '頭半年你什麼都得自己來，算帳、補貨、道歉。但年底結帳時，你發現自己第一次不是為別人的數字在緊張。'
          : '生意比想像中冷清，你把資遣費一點一點花在租金上。你不後悔嘗試，只是需要時間重新整理自己。'),
        unset: ['w_layoff_biz_ok'],
        ai: 0.8,
      },
    ],
  },
  {
    id: 'work_retraining',
    title: '重新學一次',
    ages: [26, 62],
    weight: 0,
    tags: ['work', 'followup'],
    text: (s, h) => '你報名了轉職培訓班。同班有剛畢業的年輕人，也有跟你一樣被裁員的老同事。第一堂課，講師問大家：「你想做什麼？」沒有人敢先回答。',
    effects: (s, h) => {
      h.change('knowledge', +4); h.change('social', +2);
      if (h.unemployed() && h.chance(0.65)) { newJob(h); h.change('wealth', +2); h.change('happiness', +3); }
    },
  },
  {
    id: 'work_unemployed_stretch',
    title: '沒有班可上的日子',
    ages: [20, 62],
    once: false,
    cooldown: 3,
    weight: 1,
    tags: ['work', 'hardship'],
    cond: (s, h) => h.unemployed(),
    text: (s, h) => h.byIncome({
      L: '你每天一早到路口等人來叫零工，有時一天有活，有時一整週都沒有。回家時你不太想看家人的眼睛。晚飯時，家人把最大的一塊留給你，你卻吃不下。',
      LM: '你輪流向各個親戚問有沒有缺人的地方。每次對方都答應「幫你留意」，然後再也沒有消息。你漸漸學會不要把這句話當成承諾，只當成一種禮貌。',
      UM: '早上起來沒有地方要去，你把家裡打掃了一遍，又翻開求才廣告，每一個職缺後面，都有幾百個人在競爭。你默默把履歷又改了一次。',
      H: '失業補助夠你付房租，卻不夠讓你安心。你每週去就業服務站報到，櫃台的人很客氣，這反而讓你更難受。你開始覺得自己像一份被退回的文件。',
    }),
    effects: { happiness: -3, wealth: -2, social: -2 },
  },
  {
    id: 'work_gig_platform',
    title: '手機派單',
    ages: [20, 52],
    weight: 0.7,
    tags: ['work', 'era'],
    cond: (s, h) => h.yearIn(2012, 3000) && h.urban() && !h.retired() && (h.unemployed() || h.workStatus() === 'none' || (working(h) && h.stat('wealth') < 55)),
    text: (s, h) => (h.yearIn(2035, 3000)
      ? '手機通知說附近有三單等著人接。平台的演算法決定誰先拿到單，也決定你今天要跑多遠。街上穿同色背包的人又多了一些，有人在紅燈前低頭看手機，像在算今天的數字。'
      : '手機上跳出一則廣告：加入平台，自己排班，按單計酬。街上穿著同色背包的人愈來愈多，有人說這是自由，也有人說這是另一種老闆。'),
    choices: [
      {
        label: '全職跑單',
        effects: (s, h) => { h.startJob('driver'); h.change('wealth', +2); h.change('health', -2); h.change('social', -2); },
        set: ['w_gig'],
        result: '你學會了看天氣預報和估算塞車。收入不穩，但沒有人催你打卡。下雨天最賺，也最危險。',
        ai: (s, h) => (h.unemployed() ? 2 : 0.5),
      },
      {
        label: '下班後兼差',
        cond: (s, h) => working(h),
        effects: { wealth: +3, health: -3, social: -1 },
        set: ['w_gig'],
        result: '你把下班後的兩小時賣給了平台。月底多了一筆小錢，但你也發現自己很久沒有好好吃一頓晚飯。',
        ai: 1.2,
      },
      {
        label: '不碰，另外想辦法',
        effects: { happiness: +1, social: +1 },
        result: '你把平台刪掉了。收入的事得另想辦法，但你知道自己不想讓一支手機決定每天的節奏。',
        ai: 1.1,
      },
    ],
  },
  {
    id: 'work_remote_office',
    title: '客廳裡的辦公室',
    ages: [24, 58],
    weight: 0.8,
    tags: ['work', 'era'],
    cond: (s, h) => h.yearIn(2022, 3000) && atDesk(h) && h.workStatus() === 'employed' && h.incomeAtLeast('LM'),
    text: (s, h) => '公司公布新制度：可以遠距工作，但仍要定期進辦公室。你的客廳、廚房和床之間，突然多了一個「辦公室」，家裡的貓成了你的新同事。',
    choices: [
      {
        label: '盡量待在家工作',
        effects: { happiness: +3, social: -3, health: -1, wealth: +1 },
        set: ['w_remote'],
        result: '省下通勤時間，你終於有空煮飯和運動。只是某天下班後你發現自己整整三天沒跟人說過話。',
        ai: 1.2,
      },
      {
        label: '照舊進辦公室',
        effects: { social: +3, happiness: -1 },
        result: '你還是習慣在辦公室，和同事一起吐槽和吃飯。通勤雖然累，但你喜歡「下班」這件事有個明確的邊界。',
        ai: 1.2,
      },
      {
        label: '兩邊各半，找到自己的節奏',
        effects: { happiness: +2, social: +1, wealth: +1 },
        result: '週二、週三進公司，其餘在家。你學會了給自己訂界線：家裡的書桌下班後蓋上布，就是下班。',
        ai: 1.6,
      },
    ],
  },
  {
    id: 'work_automation_arrives',
    title: '新系統上線',
    ages: [25, 58],
    weight: 0.6,
    tags: ['work', 'era', 'tech'],
    cond: (s, h) => h.year() < 2032 && h.workStatus() === 'employed' && h.isJob('factory', 'clerk', 'accountant', 'driver', 'cook', 'sales', 'technician', 'guard', 'laborer'),
    text: (s, h) => (h.yearIn(2000, 2031)
        ? '公司引進了新的自動化系統。原本需要三個人的流程，現在一個人加一台機器就行。大家表面上說「效率提升」，眼神卻在互相試探。'
        : '工作場所裡裝進了第一批電腦與機械。師傅們原本用手感判斷的東西，現在被螢幕上的數字取代。有人很開心，也有人把雙手悄悄背到了身後。'),
    choices: [
      {
        label: '主動學習操作與維護',
        effects: { knowledge: +5, wealth: +2, happiness: -1 },
        set: ['w_adapted'],
        result: '你利用午休和週末啃說明書，成了第一批會調整參數的人。同事開始在遇到問題時，先來敲你的桌子。',
        ai: 1.8,
      },
      {
        label: '把時間花在機器做不好的事上',
        effects: { social: +3, knowledge: +2 },
        result: '你開始專心處理需要判斷、需要跟人打交道的部分。你發現，有些事情，客戶就是想跟有溫度的人說。',
        ai: 1.3,
      },
      {
        label: '擔心被取代，開始看別的出路',
        effects: (s, h) => { h.change('happiness', -2); h.change('knowledge', +1); if (h.chance(0.35)) { newJob(h); h.change('wealth', +1); } },
        result: '你開始在晚上上網搜尋、問朋友。不是馬上離開，而是第一次認真地想：如果這行不見了，我還能做什麼。',
        ai: 0.9,
      },
    ],
  },
  {
    id: 'work_late_career_squeeze',
    title: '資深的代價',
    ages: [52, 64],
    weight: 0.8,
    tags: ['work', 'late'],
    cond: (s, h) => h.workStatus() === 'employed' && h.eduYears() >= 6,
    text: (s, h) => '新來的主管比你小二十歲，看你的眼神總帶著「快退休了吧」的禮貌。組織在調整，老員工的位置一個一個被改掉。你開始偷偷看每一份公文的會簽名單，找自己的名字。',
    choices: [
      {
        label: '談彈性工時與減少職責',
        effects: { wealth: -2, health: +3, happiness: +3 },
        result: '你把話說得很實際：「我保留經驗，你們給我時間。」雙方都鬆了一口氣。你開始在下午四點半，出門到公園散步。',
        ai: 1.6,
      },
      {
        label: '接受優退方案，提早退休',
        cond: (s, h) => s.age >= 55,
        effects: (s, h) => { h.retire(); h.change('wealth', +2); h.change('happiness', +2); },
        result: '你簽下了文件，辦公桌上的小盆栽成了你唯一帶走的東西。那天晚上，你煮了一鍋湯，想著明天要做什麼。',
        ai: 1,
      },
      {
        label: '咬牙證明自己還跑得動',
        effects: { wealth: +2, knowledge: +2, health: -3, happiness: +1 },
        result: '你學了新軟體，主動接下難案子，在會議上用數字說話。有人改變了看法，也有人還是沒有，但你知道自己不是來當點綴的。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'work_midlife_change',
    title: '這二十年，是我選的嗎',
    ages: [36, 52],
    weight: 0.7,
    tags: ['work', 'midlife'],
    cond: (s, h) => working(h) && s.work.yearsWorked >= 10 && h.stat('happiness') < 70,
    text: (s, h) => '某個週一早上，你在通勤路上忽然想：這些年，到底是我選了這份工作，還是它選了我？紅燈轉綠了，後面的喇叭響了好幾聲，你才回過神來。',
    choices: [
      {
        label: '轉行，重新開始',
        effects: (s, h) => { newJob(h); h.change('wealth', -4); h.change('happiness', +5); h.change('knowledge', +3); h.change('social', -1); },
        result: (s, h) => `你在${s.age}歲當回新人，被年輕的前輩教。薪水縮水、尷尬很多，可是你每天早上起床時，心跳是自己的。`,
        highlight: '中年轉行，從頭開始。',
        ai: (s, h) => (h.stat('happiness') < 40 ? 1.5 : 0.6),
      },
      {
        label: '在原公司換個部門',
        effects: { happiness: +2, social: +1, knowledge: +1 },
        result: '你申請轉調，面試時被問「為什麼想換」，你誠實地說：「想換一種累法。」沒想到對方笑了，說「這個理由我接受」。',
        ai: 1.5,
      },
      {
        label: '維持現狀，把興趣放回週末',
        effects: { happiness: +1, knowledge: +1 },
        result: '你報名了陶藝班。週末的幾個小時，足以讓你相信自己還有別的樣子。',
        ai: 1.6,
      },
    ],
  },
  // =====================================================================================
  // C. 農漁、攤販與小生意
  // =====================================================================================
  {
    id: 'work_good_harvest',
    title: '好年冬',
    ages: [20, 70],
    once: false,
    cooldown: 3,
    weight: 0.9,
    tags: ['work', 'farming'],
    cond: (s, h) => h.isJob('farmer', 'fisher') && h.yearsSince('work_poor_harvest') >= 2,
    text: (s, h) => (h.isJob('fisher')
      ? '這一季海況好，網網都滿，海面像一整片閃著光的鐵皮。碼頭上的魚價雖然不高，但你的船艙塞得緊緊的，你回家時，連空氣都是笑聲，一路哼著不成調的歌。'
      : '今年雨水剛剛好，作物長得整整齊齊，比往年都好看。收成那天，全家老小都下了田，晚上飯桌上破天荒多了一道肉菜，連最小的孩子都吃到了。'),
    effects: { wealth: +3, happiness: +3, social: +1 },
  },
  {
    id: 'work_poor_harvest',
    title: '收成不好的一年',
    ages: [20, 70],
    once: false,
    cooldown: 3,
    weight: 0.8,
    tags: ['work', 'farming', 'hardship'],
    cond: (s, h) => h.isJob('farmer', 'fisher') && h.yearsSince('work_good_harvest') >= 2,
    text: (s, h) => (h.isJob('fisher')
      ? '連著幾週魚都不上網，柴油卻一天比一天貴。你在碼頭邊把網補了又補，岸上的人都在說：海不一樣了。你望著海面，一時沒有答案。'
      : '今年收成比去年少了三成，價格又跌。你把算盤打了又打，怎麼算都是缺。鄰居說大家都一樣，這並不能讓你好過一點。夜裡你一個人在田埂上坐了很久。'),
    effects: { wealth: -3, happiness: -3, health: -1 },
  },
  {
    id: 'work_drought_year',
    title: '遲遲不來的雨',
    ages: [20, 62],
    weight: 0.6,
    tags: ['work', 'farming', 'climate', 'chain'],
    cond: (s, h) => h.isJob('farmer', 'fisher') && !h.incomeAtLeast('H') && !h.has('w_drought'),
    text: (s, h) => '雨季遲遲不來，田裡的土裂成了蜘蛛網。井水一天比一天淺，村口的樹下聚了一圈人，大家壓低聲音討論著要不要去城裡找工，沒有人說「不去」。',
    choices: [
      {
        label: '撐著，改種耐旱的作物',
        effects: (s, h) => { h.change('knowledge', +2); if (h.chance(0.6)) { h.change('wealth', -1); h.change('happiness', +1); } else { h.change('wealth', -5); h.change('happiness', -3); } },
        set: ['w_drought'],
        result: '你向有經驗的老人請教，改種了另一種作物。收成不算好，但也沒有全軍覆沒。大地教會你的，總是很貴。',
        ai: 1.6,
      },
      {
        label: '借錢買水、買種子',
        effects: { wealth: -5, happiness: -2 },
        set: ['w_drought', 'w_farm_debt'],
        result: '你向放貸的人借了一筆錢，條件不太好。水來了，苗活了，可是你知道，接下來幾年的收成都已經提前賣掉了。',
        ai: 0.8,
      },
      {
        label: '讓家裡年輕人去城裡找工，寄錢回來',
        effects: { wealth: +3, social: -3, happiness: -2 },
        set: ['w_drought', 'w_family_left'],
        result: '送走他們的那天，大家都假裝輕鬆。從此你看電話的次數多了，每個月月底，匯款通知成了家裡最受歡迎的消息。',
        ai: 1.4,
      },
    ],
  },
  {
    id: 'work_farm_modernize',
    title: '合作社與新機器',
    ages: [22, 60],
    weight: 0.7,
    tags: ['work', 'farming'],
    cond: (s, h) => h.isJob('farmer', 'fisher') && !h.has('w_farm_modern'),
    text: (s, h) => (h.yearIn(2008, 3000)
      ? '鎮上的農會說，手機上就能查到各市場的價格，還有人推銷小型耕耘機。用不用，是你這一季就要決定的事，晚上你在燈下算了很久。'
      : '推廣員帶來了新的種子和肥料，說產量能多兩成。合作社也開了會，有人說大家一起賣，價格比較好談。你一邊聽，一邊在心裡把每一種可能的結果都算了一遍。'),
    choices: [
      {
        label: '加入合作社，一起買賣',
        effects: (s, h) => { h.change('social', +3); h.change('knowledge', +2); h.change('wealth', h.chance(0.7) ? +3 : 0); },
        set: ['w_farm_modern'],
        result: '你學會了看市場行情，也學會了在會議上表達意見。價格不會一夜翻倍，但大家一起，至少比較不容易被壓價。',
        ai: 1.8,
      },
      {
        label: '貸款買機具或新設備',
        effects: (s, h) => { if (h.chance(0.55)) { h.change('wealth', +5); h.change('health', +1); } else { h.change('wealth', -4); h.change('happiness', -2); } },
        set: ['w_farm_modern'],
        result: (s, h) => (h.stat('wealth') > 50 ? '新的機器讓你省下大把時間，剩下的力氣可以留給更多的田。' : '機器是買了，貸款也背上了。這一季的收成必須要好，你每天都在祈禱天氣。'),
        ai: 1,
      },
      {
        label: '照老方法，不冒這個險',
        effects: { happiness: +1, knowledge: -1 },
        set: ['w_farm_modern'],
        result: '你照父親教的方法，下種、除草、收成，一步不差。年景有好有壞，但至少你知道每一步為什麼這樣做。',
        ai: 1,
      },
    ],
  },
  {
    id: 'work_market_day',
    title: '趕集的日子',
    ages: [18, 65],
    once: false,
    cooldown: 5,
    weight: 0.7,
    tags: ['work', 'trade'],
    cond: (s, h) => h.isJob('street_vendor', 'shopkeeper'),
    text: (s, h) => h.byIncome({
      L: '天沒亮你就到市場佔位置，鋪開塑膠布、擺好貨物。一個老顧客殺價殺了十分鐘，成交後卻又多買了一把菜，還笑著說是「賠你的」。',
      LM: '你在路邊擺攤的位置，是和旁邊攤販協商了很久才拿到的。一天下來，腳底酸得像踩在石頭上，但荷包裡有叮噹聲，你把零錢一枚一枚數過，笑了。',
      UM: '你的小店今天的客人多得出奇，結帳時你一邊收現金、一邊用紙筆記帳，嘴上還要招呼下一位客人，連你自己都佩服自己的手速，打烊時手指還在微微發抖。',
      H: '你的小店在這條街上開了好些年，鄰居們習慣在晚餐前順路來買點東西。有人付現，有人只說一句「晚點再給」，你總是笑著說「好」，然後在帳本上記一筆。',
    }),
    effects: { social: +3, happiness: +2, wealth: +1, health: -1 },
  },
  {
    id: 'work_shop_competitor',
    title: '對面開了新店',
    ages: [24, 62],
    weight: 0.7,
    tags: ['work', 'trade', 'competition'],
    cond: (s, h) => h.isJob('shopkeeper', 'street_vendor', 'entrepreneur', 'artisan'),
    text: (s, h) => (h.yearIn(2012, 3000)
      ? '平台上有人賣同樣的東西，價格比你的進貨價還低。客人拿著手機比價，一邊結帳一邊不好意思地笑，你也只能跟著笑，假裝沒看見螢幕上的數字。'
      : h.incomeAtLeast('UM')
        ? '馬路對面開了一家連鎖店，冷氣開得很強，價格標得很清楚。第一週你的店裡明顯少了人，連最常來的熟客都只是探頭打了聲招呼，便默默走向對街。'
        : '隔壁街新來的攤販，貨色差不多，價錢卻低一截。熟客依然來，但你看得到他們眼神裡的猶豫。你把秤桿握得更緊了，心裡有一個聲音在問：要不要也降價？'),
    choices: [
      {
        label: '跟著降價，硬拚',
        effects: (s, h) => { h.change('wealth', -3); h.change('social', +1); if (h.chance(0.4)) h.change('wealth', +4); },
        result: '你把價格壓到快沒利潤，撐了一整年。對方先撐不住了，但你也沒賺到多少，只是還站著。',
        ai: 0.8,
      },
      {
        label: '做出差異，主打服務與熟客',
        effects: (s, h) => { h.change('knowledge', +2); h.change('social', +3); h.change('wealth', h.chance(0.6) ? +3 : -1); },
        result: '你記住了每一位客人的名字和習慣，多送一小份、少收一點零頭。價錢贏不了，但人情是對方學不來的。',
        ai: 2,
      },
      {
        label: '把生意搬上網路或換個地點',
        cond: (s, h) => h.yearIn(2005, 3000) || h.urban(),
        effects: (s, h) => { h.change('knowledge', +3); h.change('health', -2); h.change('wealth', h.chance(0.5) ? +4 : -3); },
        result: '你花了幾個月學拍照、包裝與回覆客人，睡眠被切成一段一段。新的客人從陌生的地方來，你的店有了另一個名字。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'work_business_loan',
    title: '擴大營業的貸款',
    ages: [24, 58],
    weight: 0.6,
    tags: ['work', 'money', 'chain'],
    cond: (s, h) => selfEmployed(h) && h.stat('wealth') >= 15 && !h.has('w_loan_taken'),
    text: (s, h) => h.byIncome({
      L: '互助小額貸款的人來村裡說明，只要組成幾個人的小組，大家互相擔保。你的生意缺一筆本錢，來年才能多進些貨。你和鄰居互相看了一眼，沒有人先開口。',
      LM: '你看中旁邊空出來的店面，租金不貴，但缺錢整修。銀行與民間借貸的條件，你已經反覆比較了好幾遍，每一個數字都在腦子裡轉到發暈。',
      UM: '業務擴張的機會來了，但得先投入設備與人手。銀行客氣地說可以談，利率也很「客氣」，簽約書上的小字你讀了一整個晚上，連逗號的位置都沒放過。',
      H: '你想把小店開出第二間分店。銀行需要你的計畫書，家人需要你的保證，合夥人需要你的決定，而你最需要的是一個完整的睡眠。',
    }),
    choices: [
      {
        label: '向銀行或小額貸款機構借',
        effects: (s, h) => { h.set(h.chance(0.6) ? 'w_loan_good' : 'w_loan_bad'); h.change('wealth', +2); h.change('happiness', -1); },
        set: ['w_loan_taken'],
        result: '你簽下厚厚一疊文件，手心一直在出汗。錢進帳那天你沒有慶祝，只是把計畫書又翻了一遍。',
        schedule: [{ id: 'work_loan_outcome', inYears: [2, 4] }],
        ai: 1.4,
      },
      {
        label: '向親友湊資金',
        effects: (s, h) => { h.set(h.chance(0.7) ? 'w_loan_good' : 'w_loan_bad'); h.change('wealth', +2); h.change('social', -2); },
        set: ['w_loan_taken'],
        result: '你一家一家登門拜訪，把計畫講了又講。大家把錢交給你時沒說什麼，但你知道這份人情有多重。',
        schedule: [{ id: 'work_loan_outcome', inYears: [2, 4] }],
        ai: 1,
      },
      {
        label: '不貸款，慢慢做大',
        effects: { happiness: +1, wealth: +1, knowledge: +1 },
        set: ['w_loan_taken'],
        result: '你選擇用賺來的錢一點一點擴充。比不上別人快，卻讓你睡得很安穩。',
        ai: 1.4,
      },
    ],
  },
  {
    id: 'work_loan_outcome',
    title: '貸款的成績單',
    ages: [26, 65],
    weight: 0,
    tags: ['work', 'followup'],
    text: (s, h) => (h.has('w_loan_bad')
      ? '客人比預期的少，貸款的利息卻準時報到。你每個月匯款時，都想把月曆翻快一點。你學會了少睡一點、看帳本多一點，也告訴自己：這只是慢一點，不是結束。'
      : '新的店面漸漸上了軌道，營業額比前一年多了三成。你在帳本上把最後一筆貸款劃掉時，嘴角忍不住往上。那天晚上你請全家吃了一頓像樣的飯。'),
    effects: (s, h) => {
      if (h.has('w_loan_bad')) { h.change('wealth', -4); h.change('happiness', -3); h.change('health', -1); }
      else { h.change('wealth', +5); h.change('happiness', +4); h.change('social', +1); }
      h.unset('w_loan_good'); h.unset('w_loan_bad');
    },
  },
  {
    id: 'work_permit_inspection',
    title: '查照的人來了',
    ages: [22, 62],
    weight: 0.6,
    tags: ['work', 'trade', 'bureaucracy'],
    cond: (s, h) => selfEmployed(h) && h.isJob('street_vendor', 'shopkeeper', 'artisan', 'entrepreneur'),
    text: (s, h) => h.byIncome({
      L: '市場管理的人來清點攤位，問你有沒有登記。你知道登記要跑很多趟、繳很多費，而你一天賺的錢剛剛好夠吃飯。你低著頭，說：「我會去辦。」',
      LM: '地方政府要整頓營業許可，限期補齊文件。你的小店一直沒有正式登記，因為每一道手續都要排好幾天的隊。你一直拖，一直拖，現在終於拖不動了。',
      UM: '稅務與衛生稽查同時上門，檢查帳冊與營業登記。你的帳本放得有點亂，翻起來沙沙作響，但每一筆都是真的，你只希望他們看得懂。',
      H: '主管機關更新了規範，你的店必須補辦一堆證明。承辦人很有禮貌地遞給你一疊表格，一共十七頁，其中三頁你連名稱都沒聽過，只好站在櫃檯前一頁一頁地問。',
    }),
    choices: [
      {
        label: '花時間把手續補齊',
        effects: { wealth: -3, knowledge: +2, happiness: +1, social: +1 },
        result: '你跑了好幾趟，影印、蓋章、排隊。事情辦完時，你突然覺得，自己的生意終於「有名字」了。',
        ai: 1.8,
      },
      {
        label: '請熟悉流程的人代辦',
        effects: (s, h) => { h.change('wealth', -2); if (h.chance(0.7)) h.change('happiness', +2); else { h.change('wealth', -3); h.change('happiness', -2); } },
        result: '代辦的人收了一筆費用，說兩週內搞定。結果多半順利，偶爾也會碰到需要補件的麻煩。',
        ai: 1.2,
      },
      {
        label: '暫時收攤，換個地方繼續',
        effects: { wealth: -2, happiness: -2, social: -1 },
        result: '你把貨搬到另一條街，客人少了一些，卻少了很多煩惱。你想，也許哪天有餘力時，再把這件事辦清楚。',
        ai: (s, h) => (h.isPoor() ? 1 : 0.5),
      },
    ],
  },
  {
    id: 'work_savings_group',
    title: '互助會的邀請',
    ages: [22, 58],
    weight: 0.7,
    tags: ['work', 'money', 'chain'],
    cond: (s, h) => !h.incomeAtLeast('H') && !h.has('w_group') && h.stat('wealth') >= 10,
    text: (s, h) => '鄰居找你加入一個互助會：每個月大家各出一點錢，輪流一個人把整筆錢領走。先領的人急用，後領的人當存款，只要大家都守信用。你想了一個晚上，才說出「好」。',
    choices: [
      {
        label: '加入，排前面領（現在就缺錢）',
        effects: (s, h) => { h.set('w_group'); h.set(h.chance(0.12) ? 'w_group_default' : 'w_group_ok'); h.change('wealth', +3); h.change('social', +2); },
        result: '你拿到那一整疊錢，趕緊把最急的帳還了。之後每個月，你都準時繳錢，因為你知道這是一群人的信任。',
        schedule: [{ id: 'work_savings_payout', inYears: [2, 3] }],
        ai: (s, h) => (h.isPoor() ? 1.8 : 0.8),
      },
      {
        label: '加入，排最後面（當作存款）',
        effects: (s, h) => { h.set('w_group'); h.set(h.chance(0.12) ? 'w_group_default' : 'w_group_ok'); h.change('wealth', -1); h.change('social', +3); },
        result: '你每個月把錢交出去，像把種子丟進一個大家共用的田。偶爾心裡還是犯嘀咕：最後一個領錢的人，最怕出狀況。',
        schedule: [{ id: 'work_savings_payout', inYears: [3, 4] }],
        ai: 1.2,
      },
      {
        label: '不加入，自己慢慢存',
        effects: { happiness: +1, social: -1 },
        set: ['w_group'],
        result: '你婉拒了。鄰居笑笑，說要用的時候再來。你自己存錢的速度很慢，卻讓你覺得自己手裡的錢是真的。',
        ai: 1,
      },
    ],
  },
  {
    id: 'work_savings_payout',
    title: '輪到你領的那個月',
    ages: [22, 66],
    weight: 0,
    tags: ['work', 'followup'],
    text: (s, h) => (h.has('w_group_default')
      ? '輪到你領款的那個月，帶頭的人滿臉歉意地說，有一個人跳票了，只能先分期給你。你理解，也生氣，更多的是無奈。你把那張欠條折好，放進口袋最深處。'
      : '輪到你領款，一整疊現金放在桌上，你用手摸了三次才確定是真的。你把它分成幾份：修屋頂、繳學費、補貨，還有一小份留給自己，那一小份你想了很久。'),
    effects: (s, h) => {
      if (h.has('w_group_default')) { h.change('wealth', +1); h.change('happiness', -2); h.change('social', -2); }
      else { h.change('wealth', +4); h.change('happiness', +3); h.change('social', +1); }
      h.unset('w_group_default'); h.unset('w_group_ok');
    },
  },
  {
    id: 'work_mobile_money',
    title: '手機裡的錢包',
    ages: [20, 60],
    weight: 0.7,
    tags: ['work', 'money', 'era'],
    cond: (s, h) => h.yearIn(2008, 3000) && !h.incomeAtLeast('H') && !h.has('w_mobile_money') && !h.seenEvent('world_mobile_money_africa'),
    text: (s, h) => '巷口的小店貼出新招牌：用手機就能存錢、轉帳、繳電費。你的親戚說錢放在手機裡不踏實，你的同事說，這樣不用再冒險帶現金出遠門。',
    choices: [
      {
        label: '開通帳戶，把一部分錢放進去',
        effects: { knowledge: +2, wealth: +2, happiness: +1 },
        set: ['w_mobile_money'],
        result: '你第一次收到轉帳通知時按了好幾次確認。後來這件事變得理所當然：收款、付款、寄錢給家人，全在一支手機裡完成。',
        ai: 1.7,
      },
      {
        label: '只用來收匯款、繳基本費用',
        effects: { knowledge: +1, social: +1 },
        set: ['w_mobile_money'],
        result: '你小心翼翼地用，只在需要的時候才開。這樣的謹慎，讓你少遇到不少麻煩，也錯過了一些方便。',
        ai: 1.2,
      },
      {
        label: '還是現金比較安心',
        effects: { happiness: +1, social: +1 },
        set: ['w_mobile_money'],
        result: '你把錢放進鐵盒、再放進櫃子最深處。那裡的錢從不被簡訊騙走，也從不會被利息增加。',
        ai: 0.8,
      },
    ],
  },
  {
    id: 'work_side_hustle',
    title: '下班後的第二份收入',
    ages: [22, 50],
    weight: 0.8,
    tags: ['work', 'money', 'chain'],
    cond: (s, h) => working(h) && !h.has('w_side_hustle') && h.eduYears() >= 6,
    text: (s, h) => (h.yearIn(2012, 3000)
      ? '朋友在網路上賣手作或接案，月底多出一筆錢。你的手邊也有一個點子，只缺下班後那兩三個小時，產品名稱你都想好了，只是還不好意思說出口。'
      : '同事週末在市集擺攤，說比平日加班賺得多，還邀你去幫忙看看。你的手邊也有一個點子，只缺下班後那兩三個小時，和一點勇氣。'),
    choices: [
      {
        label: '認真經營，每天擠出時間',
        effects: (s, h) => { h.set('w_side_hustle'); h.set(h.chance(0.45) ? 'w_hustle_up' : 'w_hustle_slow'); h.change('wealth', +3); h.change('health', -3); h.change('social', -1); },
        result: '你把客廳一角騰出來當工作區，半夜還在包貨、回覆客人。累的時候，你會想起第一筆訂單入帳時的那個畫面。',
        schedule: [{ id: 'work_side_hustle_grows', inYears: [2, 4] }],
        ai: 1.3,
      },
      {
        label: '當成興趣，隨緣就好',
        effects: { happiness: +3, wealth: +1 },
        set: ['w_side_hustle'],
        result: '你做一點、賣一點，沒有目標也沒有壓力。偶爾賺到一頓飯錢，你已經很開心。',
        ai: 1.4,
      },
      {
        label: '算了，不想再讓自己更累',
        effects: { happiness: +1, health: +1 },
        set: ['w_side_hustle'],
        result: '你回頭看看自己已經排滿的行事曆，笑著把點子放進了「之後」的抽屜。',
        ai: 1,
      },
    ],
  },
  {
    id: 'work_side_hustle_grows',
    title: '副業的十字路口',
    ages: [24, 58],
    weight: 0,
    tags: ['work', 'followup'],
    text: (s, h) => (h.has('w_hustle_up')
      ? '副業的訂單愈來愈多，週末常忙到半夜。你開始認真計算：如果把主業辭了，一個月的收入撐不撐得住？你把數字寫在紙上，又撕掉重寫。'
      : '副業的訂單時有時無，成本卻一直在。你把這一年的帳整理了一遍，數字不太好看，但你也不確定該不該放手，桌上的計算機被你按到發燙。'),
    choices: [
      {
        label: '辭掉主業，全職經營',
        cond: (s, h) => h.has('w_hustle_up'),
        effects: (s, h) => { h.startJob(h.pick(['entrepreneur', 'shopkeeper', 'artisan'])); h.change('wealth', -2); h.change('happiness', +5); h.change('knowledge', +2); },
        result: '你遞出辭呈那天手在發抖。第一年每天都像在走鋼索，但某天你發現，自己已經不需要看別人的臉色算帳了。',
        highlight: '把副業做成了正職。',
        unset: ['w_hustle_up', 'w_hustle_slow'],
        ai: 1.2,
      },
      {
        label: '維持雙軌，穩穩地走',
        effects: { wealth: +2, happiness: +1, health: -1 },
        result: '你保留了穩定的薪水，也保住了副業。日子累一點，但每個月的收入多了一條可以信任的路。',
        unset: ['w_hustle_up', 'w_hustle_slow'],
        ai: 1.6,
      },
      {
        label: '收掉副業，認賠，回到生活',
        cond: (s, h) => !h.has('w_hustle_up'),
        effects: { wealth: -2, happiness: +2, health: +2 },
        result: '你把庫存送給朋友、把帳號關掉。那個晚上，你多睡了兩個小時，醒來的時候竟然有點想笑。',
        unset: ['w_hustle_up', 'w_hustle_slow'],
        ai: 1.2,
      },
    ],
  },
  {
    id: 'work_online_scam',
    title: '陌生來電',
    ages: [25, 59],
    weight: 0.6,
    tags: ['work', 'money', 'scam', 'era'],
    cond: (s, h) => h.yearIn(2010, 3000) && h.stat('wealth') >= 20,
    text: (s, h) => '手機響了，對方自稱銀行人員，說你的帳戶涉及詐騙，要你「保護性轉帳」。聲音專業、語速很快，催得你喘不過氣，心跳快得像剛跑完一段樓梯。',
    choices: [
      {
        label: '掛斷，自己打電話向銀行確認',
        effects: { knowledge: +2, happiness: +1 },
        result: '你掛了電話，翻出卡片背面的號碼自己撥過去。客服說：「這是詐騙，您做得對。」你的心臟過了很久才恢復正常。',
        ai: 2.5,
      },
      {
        label: '先問問家人或同事',
        effects: { social: +2, knowledge: +1 },
        result: '你說「等一下，我跟家人商量」，對方立刻掛了電話。同事聽到你的描述，笑著說：「恭喜，你剛剛拆穿了一個劇本。」',
        ai: 1.4,
      },
      {
        label: '照指示操作，先保住帳戶再說',
        effects: (s, h) => { if (h.chance(0.55)) { h.change('wealth', -7); h.change('happiness', -5); h.set('w_fell_for_scam'); } else { h.unset('w_fell_for_scam'); h.change('happiness', -1); } },
        result: (s, h) => (h.has('w_fell_for_scam')
          ? '轉出去的錢再也沒有回來。你報了案，筆錄寫了兩個小時。警察說很多人都碰過，你只想把耳朵蓋起來。'
          : '操作到一半，你忽然覺得哪裡怪，趕緊掛了電話。錢還在，但你在椅子上坐了很久，雙手都是冷的。'),
        unset: ['w_fell_for_scam'],
        ai: 0.35,
      },
    ],
  },

  // =====================================================================================
  // D. 錢、家與日常經濟
  // =====================================================================================
  {
    id: 'work_savings_choice',
    title: '一筆不急著用的錢',
    ages: [28, 58],
    weight: 0.7,
    tags: ['work', 'money', 'chain'],
    cond: (s, h) => h.incomeAtLeast('UM') && h.stat('wealth') >= 45 && !h.has('w_saved_once'),
    text: (s, h) => '年終獎金下來，你的戶頭第一次有了一筆「不急著用」的錢。朋友說要投資，家人說要存著，而家裡的屋頂也剛好該修了，好像每個選項都有道理，每個選項也都有代價。',
    choices: [
      {
        label: '分散投資，長期持有',
        effects: (s, h) => { const r = h.rand(); h.unset('w_market_up'); h.unset('w_market_down'); if (r < 0.55) h.set('w_market_up'); else if (r > 0.8) h.set('w_market_down'); h.change('knowledge', +2); h.change('happiness', -1); },
        set: ['w_saved_once'],
        result: '你研究了好幾個晚上，最後選了無聊但分散的方式。開戶那天，你像剛交出一份報告那樣忐忑。',
        schedule: [{ id: 'work_market_swing', inYears: [3, 6] }],
        ai: (s, h) => (h.isRich() ? 1.6 : 1),
      },
      {
        label: '留作緊急預備金',
        effects: { happiness: +3, wealth: +1 },
        set: ['w_saved_once', 'w_emergency_fund'],
        result: '你把錢放進一個不方便領出來的帳戶。從那天起，你對許多事的反應變得比較平靜：反正有底，就不用慌。',
        ai: 1.6,
      },
      {
        label: '先花在家人與自己身上',
        effects: { happiness: +4, wealth: -3, social: +2 },
        set: ['w_saved_once'],
        result: '你修了屋頂、帶全家出遊，還給父母買了一台新電視。花錢時你很開心，只是月底看帳戶，笑容淡了一點。',
        ai: 1,
      },
    ],
  },
  {
    id: 'work_market_swing',
    title: '帳戶上的數字',
    ages: [30, 66],
    weight: 0,
    tags: ['work', 'followup', 'money'],
    text: (s, h) => (h.has('w_market_up')
      ? '你已經好幾個月沒有打開投資帳戶。有天好奇點進去，發現數字比當初多了不少。你沒有慶祝，只是靜靜地把視窗關了，起身去把晚餐的碗洗乾淨。'
      : h.has('w_market_down')
        ? '市場大跌，你的帳戶縮水了一截。朋友們在飯局上爭論要不要賣。你關掉通知，告訴自己這筆錢本來就是放長的。那天晚上你照常煮飯，照常睡覺。'
        : '這幾年市場起起伏伏，你的帳戶和當初差不多。你發現這種「什麼也沒發生」的結果，其實也是一種價值。新聞上的數字上上下下，你的日子卻很平穩。'),
    effects: (s, h) => {
      if (h.has('w_market_up')) { h.change('wealth', +5); h.change('happiness', +2); }
      else if (h.has('w_market_down')) { h.change('wealth', -4); h.change('happiness', -3); }
      else h.change('knowledge', +1);
      h.unset('w_market_up'); h.unset('w_market_down');
    },
  },
  {
    id: 'work_home_purchase',
    title: '蓋一個家，或買一個家',
    ages: [27, 52],
    weight: 0.8,
    tags: ['work', 'housing', 'chain'],
    cond: (s, h) => !h.has('w_home_owner') && !h.has('w_renter') && !h.retired() && h.stat('wealth') >= 15,
    text: (s, h) => h.byIncome({
      L: '你在家人的空地上堆起了第一批磚。蓋房子是這裡一輩子的大事，常常是今年買水泥，明年砌牆，後年才有屋頂。你摸著粗糙的磚面，想像它有一天會變成牆。',
      LM: '你想在老家附近蓋一間自己的房子。地是祖上傳下來的，錢要一點一點存，工班要一個一個談，連水泥的價錢都要跑三家問，但你已經開始畫起平面圖了。',
      UM: '你看了二十幾間房子，每一間的價格都讓你多算一次。頭期款加貸款，會把你綁在這份工作上很多年。你在每間屋子裡，都認真想像過自己會在哪個角落泡茶。',
      H: '房價漲得比薪水快，仲介說「再不買就買不起」。你盯著三十年的還款試算表，想：三十年後，我幾歲了？窗外的天色暗了，你卻還沒有開燈。',
    }),
    choices: [
      {
        label: '買下（蓋起）屬於自己的家',
        effects: { wealth: -6, happiness: +5, social: +2 },
        set: ['w_home_owner'],
        result: '鑰匙放進手心時，你站在空蕩蕩的客廳裡轉了一圈。沒有家具，沒有窗簾，但每一面牆都是你的。',
        highlight: '有了屬於自己的家。',
        schedule: [{ id: 'work_mortgage_squeeze', inYears: [4, 9] }],
        ai: (s, h) => (h.stat('wealth') > 45 ? 1.7 : 1),
      },
      {
        label: '繼續租房，保持彈性',
        effects: { wealth: +1, happiness: +1 },
        set: ['w_renter'],
        result: '你把錢留在身邊，也把選擇權留在身邊。每個月房租像一筆付出去就消失的錢，可你知道，自由也有價錢。',
        ai: 1.2,
      },
      {
        label: '搬到較遠、較便宜的地方買',
        effects: { wealth: -4, happiness: +2, social: -2, health: -1 },
        set: ['w_home_owner'],
        result: '你選擇了通勤一小時的地方，換來一個多一間房的家。每天在車上看夕陽的時間，成了你的新習慣。',
        schedule: [{ id: 'work_mortgage_squeeze', inYears: [4, 9] }],
        ai: 1,
      },
    ],
  },
  {
    id: 'work_mortgage_squeeze',
    title: '還款日又來了',
    ages: [30, 66],
    weight: 0,
    tags: ['work', 'followup', 'housing'],
    text: (s, h) => h.byIncome({
      L: '建材又漲了，貸款的利息也累積了一圈。蓋到一半的牆就這樣立在院子裡，雨季快到了，你得在屋頂與還款之間，做一個很難的決定。',
      LM: '貸款的利息調高了，每個月還款額多了一截。你把家庭預算表攤開，每一筆支出都被重新審視，連孩子的零食都被列進了討論，氣氛因此安靜了好一陣子。',
      UM: '利率上調後，房貸像一條突然收緊的皮帶。你開始算：少出去吃幾次、少旅行幾次，剛好湊出這一截。帳算出來了，心卻沒有因此輕鬆。',
      H: '央行升息，房貸每個月多出一筆。你對著表格重新排預算，連每天的那杯咖啡都被列進了待檢討事項，你笑得有點苦，心裡盤算著還有什麼可以省。',
    }),
    choices: [
      {
        label: '縮衣節食，咬牙撐過去',
        effects: { wealth: +2, happiness: -3, health: -1, social: -1 },
        result: '你停掉不必要的開銷，連帶減少了朋友聚會。三年後數字終於穩了下來，你也才發現，其實省下來的日子沒有想像中那麼糟。',
        ai: 1.5,
      },
      {
        label: '出租一間房，或多接點工作',
        effects: { wealth: +3, social: -1, happiness: -1 },
        result: '你把空房間租給一位安靜的房客，每個月多一筆穩定的錢。生活空間縮小了，心裡的壓力小了一點。',
        ai: 1.4,
      },
      {
        label: '賣掉房子，重新來過',
        effects: (s, h) => { h.change('wealth', +1); h.change('happiness', -4); h.unset('w_home_owner'); h.set('w_renter'); },
        result: '簽約那天，你最後一次關上門，聽見鎖舌的聲音。新的住處更小，但每個月不再提心吊膽，你終於睡了一個整夜。',
        ai: 0.7,
      },
    ],
  },
  {
    id: 'work_rent_hike',
    title: '房東的通知',
    ages: [22, 60],
    once: false,
    cooldown: 8,
    weight: 0.5,
    tags: ['work', 'housing'],
    cond: (s, h) => h.urban() && !h.has('w_home_owner') && !h.retired() && h.stat('wealth') < 75,
    text: (s, h) => h.byIncome({
      L: '房東通知下個月起房租漲五成，理由是附近要蓋新的公路。你家只有一個房間，要往哪裡搬，大家一起想了好幾個晚上，沒有人睡得好。',
      LM: '房東說下個月起租金調漲，不接受也行，後面有人排隊。你開始看更遠的地區，一邊算每天多出來的車資和通勤時間，一邊嘆氣，覺得自己像在跟城市玩一場輸不起的遊戲。',
      UM: '房租又要漲了，仲介說「現在行情就是這樣」。你把每個選項寫在白板上，卻沒有一個讓人滿意，白板被塗改得像一張作戰地圖。',
      H: '租約到期，房東要求調漲兩成。你一邊搜尋新的出租房，一邊自嘲「換房子比換工作更像一份工作」。看房的行程表，塞滿了整個週末。',
    }),
    effects: { wealth: -3, happiness: -2, social: -1 },
  },
  {
    id: 'work_inflation_squeeze',
    title: '菜價又漲了',
    ages: [22, 66],
    once: false,
    cooldown: 10,
    weight: (s, h) => h.byIncome({ L: 0.5, LM: 0.45, UM: 0.3, H: 0.15 }),
    tags: ['work', 'money'],
    cond: (s, h) => !h.retired(),
    text: (s, h) => '菜價、油價與房租輪流上漲，薪水卻原地踏步。你看價格標籤比看電影海報還專心，每次結帳前都先在心裡算一遍。走出店門時，口袋裡的零錢比想像中還輕。',
    effects: { wealth: -3, happiness: -2 },
  },
  {
    id: 'work_windfall',
    title: '意外之財',
    ages: [25, 62],
    weight: 0.25,
    tags: ['work', 'money', 'luck'],
    cond: (s, h) => !h.retired(),
    text: (s, h) => '一封通知帶來了意外的消息：一筆錢進了你的名下，可能是遠親的遺贈、土地徵收補償，或是被遺忘的退款。你把數字讀了三遍。',
    choices: [
      {
        label: '還清欠款，修好最該修的東西',
        effects: { wealth: +4, happiness: +4, health: +1 },
        result: '你先打電話給債主，再找師傅來修屋頂。那一晚下雨，你躺在床上，聽著雨聲，竟然是平靜的。',
        ai: (s, h) => (h.isPoor() ? 2.2 : 1),
      },
      {
        label: '存起來，當作未來的底氣',
        effects: { wealth: +6, happiness: +2 },
        result: '你把錢轉進最安全的帳戶，決定在一年內不去想它。這份「有底氣」的感覺，讓你講話都比較不急了。',
        ai: 1.6,
      },
      {
        label: '和家人與親友分享一部分',
        effects: { wealth: +2, social: +5, happiness: +3 },
        result: '你請了一頓大飯，替幾位長輩補了醫藥費，還借了一筆錢給正在創業的朋友。大家笑得很開懷，你覺得錢好像在這一刻變得有點意思。',
        ai: 1.2,
      },
    ],
  },
  {
    id: 'work_family_business',
    title: '誰來接手',
    ages: [26, 52],
    weight: 0.6,
    tags: ['work', 'family', 'chain'],
    cond: (s, h) => h.parentsAlive() > 0 && h.siblings() > 0 && !selfEmployed(h) && !h.has('w_family_biz'),
    text: (s, h) => (h.urban() ? '家裡的小店' : '家裡的田地') + '撐了好幾十年，長輩的身體不如從前。飯桌上，大家都沒開口，但目光一個接一個落在你身上，你的筷子停在半空中。',
    choices: [
      {
        label: '接手，把店（田）撐下去',
        effects: (s, h) => { h.startJob(h.urban() ? 'shopkeeper' : 'farmer'); h.change('social', +3); h.change('happiness', -1); h.change('wealth', +1); },
        set: ['w_family_biz'],
        result: '你接過長輩的工具，從今天起，貨架上每一件商品的位置你都得學。老客人看到你，笑著說：「長得好像你爸媽年輕的時候。」',
        highlight: '接下了家裡的生意。',
        ai: (s, h) => (h.isPoor() ? 1.5 : 0.8),
      },
      {
        label: '說明自己有其他規劃，請手足商量',
        effects: { happiness: +1, social: -1 },
        set: ['w_family_biz'],
        result: '你把自己的想法講清楚，語氣很穩。飯桌安靜了一陣子，最後是最小的弟妹先開口：「我可以試試。」',
        ai: 1.5,
      },
      {
        label: '提議兄弟姊妹合夥分工',
        effects: { social: +2, wealth: +1, happiness: -1 },
        set: ['w_family_biz'],
        result: '你們排了輪值表，各自負責一塊。吵架是難免的，可是每個月的盤點日，大家坐在一起吃完飯再算帳，倒也有了新的默契。',
        ai: 1.2,
      },
    ],
  },

  {
    id: 'work_return_to_work',
    title: '要不要回去上班',
    ages: [27, 52],
    weight: 0.9,
    tags: ['work', 'family', 'children'],
    cond: (s, h) => (h.workStatus() === 'homemaker' || (h.unemployed() && h.hasChildren())) && h.youngestChildAge() >= 2 && h.youngestChildAge() <= 14 && !h.has('w_return_decided'),
    text: (s, h) => h.byIncome({
      L: '孩子大了一點，鄰居問你要不要一起去鎮上的作坊做工。家裡多一份收入，孩子就多一頓飽飯，只是誰來照顧最小的那個？你在灶邊想了一整個晚上。',
      LM: '孩子上學了，白天家裡突然變得很安靜。朋友說附近的工廠在找人，薪水不高，但每個月有固定的錢。你站在鏡子前，不太確定自己還記不記得怎麼面試。',
      UM: '孩子上學之後，你有了完整的白天。曾經的同事問你要不要回來，也有人勸你好好陪孩子。你在履歷檔和育兒筆記之間，不知道該先打開哪一個。',
      H: '孩子進了小學，你終於有了幾個安靜的小時。前同事傳來一份職缺，薪水不錯，但意味著早晚都要和時間賽跑。你看著行事曆，思考自己想過的是哪一種日子。',
    }),
    choices: [
      {
        label: '回到全職工作',
        effects: (s, h) => { newJob(h); h.change('wealth', +3); h.change('social', +3); h.change('happiness', +2); h.change('health', -2); },
        set: ['w_return_decided'],
        result: (s, h) => `你穿上很久沒穿的外套，第一天走進${h.jobName() || '新的工作場所'}，手心都是汗。下班時你又累又亮，發現自己好久沒有這麼想跟別人說今天的事。`,
        highlight: '孩子長大後，重新回到職場。',
        ai: (s, h) => (h.isPoor() ? 1.8 : 1),
      },
      {
        label: '找彈性的工作，或做點小生意',
        effects: (s, h) => { h.startJob(h.pick(['sales', 'clerk', 'cook', 'caregiver', 'street_vendor', 'artisan'])); h.change('wealth', +2); h.change('happiness', +3); h.change('social', +2); },
        set: ['w_return_decided'],
        result: '你選了時間可以自己調整的工作，早上送孩子，下午準時回家。收入沒有最多，但你覺得這個步調剛好讓自己和孩子都跟得上。',
        ai: 1.8,
      },
      {
        label: '繼續專心顧家，晚一點再說',
        effects: { happiness: +1, social: -1, wealth: -1 },
        set: ['w_return_decided'],
        result: '你告訴自己：孩子只有這幾年需要你。晚上你把洗好的衣服摺好，心裡有一點平靜，也有一點說不清楚的空。',
        ai: 1,
      },
    ],
  },

  // =====================================================================================
  // E. 兵役與軍旅
  // =====================================================================================
  {
    id: 'work_reservist_call',
    title: '點召通知',
    ages: [24, 38],
    once: false,
    cooldown: 4,
    weight: 0.7,
    tags: ['work', 'military', 'regional'],
    cond: (s, h) => h.male() && CONSCRIPT.has(s.homeCountryCode) && s.countryCode === s.homeCountryCode,
    text: (s, h) => '一封通知寄到家裡：你被召回短期訓練。公司要請假，家人唸了兩句，裝備袋從衣櫃深處被翻出來，上面還留著樟腦丸的味道。你嘆了口氣，還是把鞋油也找了出來。',
    effects: { health: +1, social: +2, wealth: -1, happiness: -1 },
  },
  {
    id: 'work_career_soldier',
    title: '長官的邀請',
    ages: [19, 27],
    weight: 3,
    tags: ['work', 'military', 'regional'],
    cond: (s, h) => h.male() && CONSCRIPT.has(s.homeCountryCode) && h.seenEvent('seed_military_service') && !h.has('w_soldier_decided'),
    text: (s, h) => '退伍前夕，長官找你談話：「你很適合留下來。」軍旅的規律、津貼與宿舍，和外面不確定的工作比起來，讓你在營區熄燈號響過之後，認真考慮了一整晚。',
    choices: [
      {
        label: '簽下志願役',
        effects: (s, h) => { h.startJob('soldier'); h.change('wealth', +2); h.change('health', +2); h.change('social', +2); h.change('happiness', -1); },
        set: ['w_soldier_decided', 'w_career_soldier'],
        result: '你換上深色的制服，生活被日程表切成整齊的格子。你不討厭這種秩序，只是偶爾在放假時看不習慣街上的人潮。',
        highlight: '決定留在軍中服役。',
        ai: (s, h) => (h.isPoor() ? 1.6 : 0.7),
      },
      {
        label: '退伍，回到平民生活',
        effects: { happiness: +2, social: +1 },
        set: ['w_soldier_decided'],
        result: '你把軍服收好，換上便服。第一天早上起床，沒有人在外面喊口令，你反而花了點時間才適應。',
        ai: 2,
      },
      {
        label: '退伍後繼續升學',
        cond: (s, h) => !h.eduAtLeast('tertiary') && h.incomeAtLeast('UM'),
        effects: { knowledge: +4, wealth: -3, happiness: +1 },
        set: ['w_soldier_decided'],
        result: '你用退伍後的第一筆存款報名了考試課程。教室裡的同學比你小了幾歲，但你坐得比任何人都挺。',
        ai: 1,
      },
    ],
  },

  // =====================================================================================
  // F. 各行各業的日常（依職業）
  // =====================================================================================
  {
    id: 'work_craft_pride',
    title: '手藝的驕傲',
    ages: [22, 64],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['work', 'craft'],
    cond: (s, h) => h.isJob('artisan', 'farmer', 'fisher') && s.work.yearsWorked >= 3,
    text: (s, h) => (h.isJob('farmer')
      ? '你蹲在田埂上摸了摸土，立刻知道今天不用澆水。這是用多少個季節換來的判斷，沒有人在書裡教過你。新來的小伙子蹲在旁邊，看得入神。'
      : h.isJob('fisher')
        ? '天剛亮，你抬頭看雲就知道下午有風。年輕的小伙子笑你太保守，結果中午風一起，大家匆匆收網回港，只有你的船早已靠岸，你正悠閒地喝著茶。'
        : '你親手做的東西被人帶走了，客人臨走前還用手心摸了一下表面，像在確認它是真的。這種不用說出口的讚美，你一直很珍惜，也一直記得每個人的名字。'),
    effects: { happiness: +3, knowledge: +1, social: +1 },
  },
  {
    id: 'work_customer_day',
    title: '難搞的客人與最好的客人',
    ages: [20, 62],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['work', 'service'],
    cond: (s, h) => h.isJob('cook', 'sales', 'shopkeeper', 'street_vendor'),
    text: (s, h) => '早上你遇到一個難搞的客人，嫌東嫌西、最後什麼也沒買。下午一位老先生走進來，認真地說：「你昨天找錯我的零錢，我來補給你。」',
    effects: { happiness: +2, social: +2, knowledge: +1 },
  },
  {
    id: 'work_care_shift',
    title: '照顧人的班',
    ages: [22, 64],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['work', 'care'],
    cond: (s, h) => h.isJob('nurse', 'caregiver', 'doctor', 'teacher'),
    text: (s, h) => (h.isJob('teacher')
      ? '學生交來一張歪歪斜斜的卡片，上面寫著「謝謝老師」，還畫了一隻你認不出來的動物。你把它夾進課本，晚上批改作業時又拿出來看了一遍。'
      : h.isJob('doctor')
        ? '連續值班三十小時後，你還是在查房時蹲下來，認真跟老人家解釋藥的名字。老人家說自己記不住，你笑著說：「沒關係，我們慢慢來。」下班時天都亮了，你卻覺得這一夜值得。'
        : '深夜的病房很安靜，你一邊記錄一邊輕聲安撫睡不著的人。你不確定自己改變了什麼，但對方終於睡著了。你替對方拉好被角，輕輕關上燈。'),
    effects: { happiness: +2, social: +2, health: -2 },
  },
  {
    id: 'work_launch_week',
    title: '上線前一週',
    ages: [22, 58],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['work', 'tech'],
    cond: (s, h) => h.isJob('developer', 'engineer', 'technician'),
    text: (s, h) => '產品上線前一週，大家在白板前圍成一圈，吃著冷掉的披薩改最後一個 bug。成功上線的那一刻，所有人同時鬆了一口氣，再同時餓了。',
    effects: { knowledge: +3, social: +2, health: -2, happiness: +1 },
  },
  {
    id: 'work_long_road',
    title: '路上的日子',
    ages: [20, 62],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['work', 'driver'],
    cond: (s, h) => h.isJob('driver'),
    text: (s, h) => '凌晨的路邊店，有熱湯和同行的人。你和陌生的司機互相點頭，聊著哪一段在修路、哪一個加油站的洗手間最乾淨。這種默契，只有在路上的人才懂。',
    effects: { social: +2, happiness: +1, health: -2 },
  },
  {
    id: 'work_site_day',
    title: '工地的午休',
    ages: [19, 60],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['work', 'labor'],
    cond: (s, h) => h.isJob('construction', 'miner', 'laborer', 'factory'),
    text: (s, h) => '中午的陰影下，工友們把飯盒傳來傳去，有人拿出自家醃的小菜，有人說了一個三十年不換的笑話，你還是笑了。身體很累，心裡卻有一種踏實。',
    effects: { social: +3, happiness: +2, health: -1 },
  },
  {
    id: 'work_household_job',
    title: '別人家的廚房',
    ages: [18, 62],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['work', 'domestic'],
    cond: (s, h) => h.isJob('domestic'),
    text: (s, h) => '你熟悉雇主家每一個抽屜，卻沒有任何一個是自己的。某天，主人家的老太太悄悄塞給你一包糖，說：「帶回去給孩子。」你把它放進口袋，一路都捨不得走快。',
    effects: { happiness: +1, social: +2, wealth: +1 },
  },
  {
    id: 'work_desk_politics',
    title: '辦公室的風向',
    ages: [24, 62],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['work', 'office'],
    cond: (s, h) => h.isJob(...OFFICE_JOBS) && h.workStatus() === 'employed',
    text: (s, h) => '午休時你聽到一個傳言：下週要重新分配座位，也要重新分配權力。你什麼也沒說，但同事們看你的眼神突然變得很有禮貌，有人還特地替你倒了杯咖啡。',
    effects: { social: +1, happiness: -1, knowledge: +2 },
  },
  {
    id: 'work_art_choice',
    title: '接案還是創作',
    ages: [22, 58],
    weight: 0.8,
    tags: ['work', 'art'],
    cond: (s, h) => h.isJob('artist') && !h.has('w_art_choice'),
    text: (s, h) => '一位客戶出了不錯的價錢，請你做一批「安全、好賣」的作品。你桌上放了一半的創作，卻不知道還能撐多久不被生活追著跑。你握著電話，另一隻手無意識地摸著畫筆。',
    choices: [
      {
        label: '接案，先把生活顧好',
        effects: { wealth: +4, happiness: -1, knowledge: +1 },
        set: ['w_art_choice'],
        result: '你認真交付，客戶很滿意。帳戶多了一筆，你的作品集少了一塊，你告訴自己：這不是投降，是資源。',
        ai: (s, h) => (h.isPoor() ? 2 : 1),
      },
      {
        label: '婉拒，專心創作',
        effects: (s, h) => { h.change('happiness', +4); h.change('wealth', -3); h.change('knowledge', +2); },
        set: ['w_art_choice'],
        result: '你關掉了信箱，花三個月把那件作品完成。展出時只有三十個人來，其中一位站在畫前一動也不動地看了二十分鐘。',
        highlight: '為了作品，拒絕了一筆好價錢。',
        ai: 1,
      },
      {
        label: '一半接案、一半創作',
        effects: { wealth: +1, happiness: +2, knowledge: +1 },
        set: ['w_art_choice'],
        result: '你替自己排了表：週一到三接案，週四到日創作。精神上有點像雙重人格，但荷包和靈魂都有地方放。',
        ai: 1.8,
      },
    ],
  },
  {
    id: 'work_grant_season',
    title: '計畫申請季',
    ages: [28, 64],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['work', 'research'],
    cond: (s, h) => h.isJob('researcher'),
    text: (s, h) => '又到了寫計畫書的季節。你一邊整理實驗數據，一邊修改預算表，空白欄位像一面等著被填滿的白牆。同事說：「通過率不到兩成，但不寫就是零。」',
    effects: { knowledge: +3, health: -2, happiness: -1, social: +1 },
  },
  {
    id: 'work_soldier_posting',
    title: '外派與調防',
    ages: [20, 55],
    once: false,
    cooldown: 5,
    weight: 0.6,
    tags: ['work', 'military'],
    cond: (s, h) => h.isJob('soldier'),
    text: (s, h) => '調防令下來了，新單位在遙遠的山區。你把家人的照片壓進行李的最上層，這次又要隔很久才見面了。你把家裡的鑰匙交給鄰居，說了聲「拜託」。',
    effects: { social: -2, health: +1, wealth: +1, happiness: -1 },
  },
  {
    id: 'work_night_shift',
    title: '夜班的世界',
    ages: [20, 60],
    once: false,
    cooldown: 6,
    weight: 0.6,
    tags: ['work', 'shift'],
    cond: (s, h) => h.isJob('guard', 'nurse', 'caregiver', 'driver', 'factory', 'cook'),
    text: (s, h) => '輪到夜班的那週，你和日夜顛倒的家人在門口擦身而過。凌晨四點的街，路燈亮得很孤單，但你發現早班車第一班開出時，天空是粉紅色的。',
    effects: { health: -3, happiness: -1, knowledge: +1 },
  },
];
