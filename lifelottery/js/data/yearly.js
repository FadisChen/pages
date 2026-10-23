// "平凡的一年" templates: one-line summaries used when a year has no event, choice or milestone.
//
// Shape of each template:
//   { ages: [min, max],            // inclusive; default [0, 120]
//     cond: (s, h) => boolean,     // optional extra condition
//     weight: 1,                   // optional relative weight
//     text: (s, h) => string }     // second person ("你"), Traditional Chinese, ~25-70 characters
//
// The engine avoids reusing the same template within TUNING.yearlyRepeatGap years.
// Grouping below is for humans only. Target: ~80 lines in total (starter set: 30).

export default [
  // ---- 嬰幼兒 0-5 ----
  { ages: [0, 2], text: (s, h) => '這一年你大部分時間都在睡覺、吃奶與哭鬧之間來回。每一次笑，都讓身邊的大人忘了疲憊。' },
  { ages: [1, 3], text: (s, h) => `你學會了站起來，又跌倒，又站起來。${h.parentAlive('mother') ? '媽媽' : '身邊的人'}在一旁拍手，你不知道為什麼，但也跟著笑。` },
  { ages: [2, 5], text: (s, h) => '你開始問「為什麼」，什麼都要問。大人們有時回答，有時只是笑笑。' },
  { ages: [3, 5], cond: (s, h) => h.incomeAtLeast('UM'), text: (s, h) => '你有了第一個最要好的朋友，名字總是叫錯。你們常常在地上一起玩到天黑。' },
  { ages: [3, 5], cond: (s, h) => !h.incomeAtLeast('UM'), text: (s, h) => '你常跟在家人身後，看他們忙這忙那，偶爾也被交代去做一點小事，覺得自己很重要。' },

  // ---- 童年 6-12 ----
  { ages: [6, 12], cond: (s, h) => h.inSchool(), text: (s, h) => '上學、放學、寫功課，日子像時鐘一樣規律。你最期待的是下課那十分鐘。' },
  { ages: [6, 12], cond: (s, h) => h.inSchool(), text: (s, h) => '這學期你的字寫得比以前好看了一點，老師在作業簿上畫了一顆小星星。' },
  { ages: [6, 12], cond: (s, h) => !h.inSchool(), text: (s, h) => '沒有課本的日子裡，你跟著大人做事，學到不少書上沒有的東西。' },
  { ages: [6, 12], text: (s, h) => '夏天你和朋友在外面玩到滿身是汗，被叫回家吃飯時還捨不得走。' },
  { ages: [8, 12], text: (s, h) => '你開始有了自己的小秘密，也有了第一個想存下來買什麼東西的願望。' },

  // ---- 青少年 13-19 ----
  { ages: [13, 17], cond: (s, h) => h.inSchool(), text: (s, h) => '考試、作業、同儕的眼光，這一年你的世界突然變得很大，也很擁擠。' },
  { ages: [13, 19], text: (s, h) => '你和家人吵了幾次架，又和好了幾次。你覺得誰都不懂你，但夜裡聽見他們的腳步聲，還是安心。' },
  { ages: [13, 19], text: (s, h) => '你迷上了一首歌，一遍又一遍地聽。很多年後，你仍然記得它的旋律。' },
  { ages: [14, 19], cond: (s, h) => !h.inSchool() && h.employed(), text: (s, h) => `你每天做著${h.jobName()}的工作，下班後累得只想睡。但領薪水的那天，你覺得自己長大了。` },
  { ages: [15, 19], cond: (s, h) => h.inSchool() && h.incomeAtLeast('UM'), text: (s, h) => '放學後你和朋友在速食店坐了很久，聊著未來要做什麼，又聊到什麼都沒決定。' },

  // ---- 青年 20-34 ----
  { ages: [20, 34], cond: (s, h) => h.employed(), text: (s, h) => `這一年你忙著做${h.jobName()}的工作，下班後常常只想倒在床上。好在週末還有朋友。` },
  { ages: [20, 34], cond: (s, h) => h.employed() && h.stat('happiness') >= 60, text: (s, h) => '工作順利，生活也有了節奏。你偶爾會停下來想：這大概就是日子吧。' },
  { ages: [20, 34], cond: (s, h) => h.unemployed(), text: (s, h) => '你四處投履歷、問人脈，等回音的日子特別漫長。你學會了不讓焦慮寫在臉上。' },
  { ages: [20, 34], cond: (s, h) => !h.hasPartner() && !h.married(), text: (s, h) => '你一個人過了平靜的一年，偶爾孤單，但也享受只屬於自己的時間。' },
  { ages: [20, 40], cond: (s, h) => h.married() && !h.hasChildren(), text: (s, h) => `你和${h.partnerName()}的日子平平淡淡，偶爾拌嘴，更多時候只是安靜地待在同一個房間。` },

  // ---- 壯年 / 中年 35-59 ----
  { ages: [30, 59], cond: (s, h) => h.hasChildren() && h.youngestChildAge() <= 12, text: (s, h) => `${h.childName(0)}又長高了一截，你還沒反應過來，舊衣服已經穿不下了。` },
  { ages: [30, 59], cond: (s, h) => h.hasChildren() && h.youngestChildAge() > 12, text: (s, h) => `孩子們有了自己的世界，你開始學著少問一點，多等一點。` },
  { ages: [35, 59], cond: (s, h) => h.employed(), text: (s, h) => '工作越來越熟練，也越來越像例行公事。你偶爾會想起年輕時的那些夢，然後繼續去上班。' },
  { ages: [35, 59], cond: (s, h) => h.isPoor(), text: (s, h) => '日子還是緊巴巴的。你每個月都要精打細算，但總有辦法撐過去。' },
  { ages: [40, 59], text: (s, h) => '鏡子裡的你多了幾根白髮。你開始在意健康檢查的報告，也開始懂得父母當年的嘮叨。' },

  // ---- 晚年 60+ ----
  { ages: [60, 85], cond: (s, h) => h.retired(), text: (s, h) => '退休後的日子，早上不再需要鬧鐘。你花很長的時間吃早餐，看窗外的人來人去。' },
  { ages: [60, 90], cond: (s, h) => h.married(), text: (s, h) => `你和${h.partnerName()}一起散步、一起吃飯，話不多，但很安心。` },
  { ages: [60, 90], cond: (s, h) => h.hasChildren(), text: (s, h) => `逢年過節，${h.childName(0)}回來看你。屋子裡難得熱鬧，你煮了好多菜。` },
  { ages: [65, 100], cond: (s, h) => !h.hasPartner() && h.stat('social') < 40, text: (s, h) => '這一年很安靜。你常常望著電話，希望它響起，卻不知道該先打給誰。' },
  { ages: [70, 100], text: (s, h) => '你的膝蓋提醒你天氣要變了。你慢慢地走，慢慢地看，覺得慢一點也沒什麼不好。' },
  { ages: [75, 100], text: (s, h) => '你開始整理舊照片，有些人的名字已經想不起來，但笑容還在。' },
];
