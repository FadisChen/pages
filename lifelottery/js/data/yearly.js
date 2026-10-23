// "平凡的一年" templates: one-line summaries used when a year has no event, choice or milestone.
//
// Shape of each template:
//   { ages: [min, max],            // inclusive; default [0, 120]
//     cond: (s, h) => boolean,     // optional extra condition
//     weight: 1,                   // optional relative weight
//     text: (s, h) => string }     // second person ("你"), Traditional Chinese, ~25-70 characters
//
// The engine avoids reusing the same template within TUNING.yearlyRepeatGap years.
// Grouping below is for humans only. 80+ lines in total, by life stage and by situation (income, region, era,
// work, family).

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

  // ===================================================================================
  // 第二批：依階段與處境擴充（嬰幼兒）
  // ===================================================================================
  { ages: [0, 1], text: (s, h) => '你學會了翻身，又學會了把玩具丟到地上，看大人彎腰撿起來。這是你最早的實驗。' },
  { ages: [0, 5], cond: (s, h) => h.parentsAlive() > 0, text: (s, h) => '夜裡你一哭，總有一雙手把你抱起來。你不知道那雙手的主人為此少睡了多少覺。' },
  { ages: [2, 5], cond: (s, h) => !h.incomeAtLeast('UM'), text: (s, h) => '你跟著大孩子在院子裡跑，跌倒了就自己爬起來，膝蓋上總有幾處新的擦傷。' },
  { ages: [2, 5], cond: (s, h) => h.income() === 'H', text: (s, h) => '每個週末，家人帶你去公園。你最愛的是滑梯，和旁邊賣冰淇淋的推車。' },
  { ages: [3, 5], text: (s, h) => '你學會了完整的句子，也學會了「不要」這兩個字，大人們啼笑皆非。' },

  // ---- 童年 6-12（續） ----
  { ages: [6, 12], cond: (s, h) => h.inSchool() && h.incomeAtLeast('UM'), text: (s, h) => '放學後你和朋友交換卡片、貼紙和小玩具，這些是你們之間流通的貨幣。' },
  { ages: [6, 12], cond: (s, h) => !h.urban(), text: (s, h) => '放學後你跟著朋友在田埂或河邊玩耍，直到天黑才被叫回去吃飯。' },
  { ages: [6, 12], cond: (s, h) => h.urban() && h.incomeAtLeast('LM'), text: (s, h) => '巷口的雜貨店是孩子們的集合點。你用零錢買了一包糖，慢慢吃了一下午。' },
  { ages: [6, 12], cond: (s, h) => h.inSchool(), text: (s, h) => '這學期你迷上了一門課，連作業都做得比平常認真一點。老師還看了你兩眼。' },
  { ages: [7, 12], cond: (s, h) => h.inSchool() && !h.incomeAtLeast('UM'), text: (s, h) => '你的課本是哥哥姊姊傳下來的，書頁間還留著他們的塗鴉，像是一起在讀書。' },
  { ages: [8, 12], text: (s, h) => '你發現自己很會做某件小事，也許是畫畫、跑步，或是記得所有人的生日。' },
  { ages: [6, 12], cond: (s, h) => h.yearIn(1995, 2100) && h.incomeAtLeast('UM'), text: (s, h) => '你放學後多半盯著螢幕，大人偶爾嘮叨幾句，你總回答：「再五分鐘。」' },
  { ages: [9, 12], text: (s, h) => '你第一次認真想過：長大以後要做什麼？答案每個月都不一樣。' },

  // ---- 青少年 13-19（續） ----
  { ages: [13, 17], cond: (s, h) => h.inSchool(), text: (s, h) => '期中考週，你和同學互相借筆記，也互相偷笑對方的黑眼圈。' },
  { ages: [13, 19], text: (s, h) => '你開始在意別人怎麼看你，站在鏡子前的時間變長了。大人們說，這就是青春。' },
  { ages: [14, 19], cond: (s, h) => h.yearIn(2012, 2100) && h.incomeAtLeast('LM'), text: (s, h) => '你的手機裡有一百個群組，卻覺得真正能說心裡話的，只有一兩個人。' },
  { ages: [15, 19], cond: (s, h) => !h.inSchool() && !h.employed(), text: (s, h) => '你在家幫忙、在外遊蕩，日子沒有明確的方向，只有一個隱約的「以後」。' },
  { ages: [15, 19], text: (s, h) => '你學會了騎車載朋友，風吹進耳朵裡的聲音，讓你覺得自己什麼都做得到。' },
  { ages: [16, 19], cond: (s, h) => h.inSchool() && !h.incomeAtLeast('UM'), text: (s, h) => '你每年都在計算還能不能繼續念書，家裡的收成與零用錢，都是你的考題。' },
  { ages: [13, 19], text: (s, h) => '你和最好的朋友吵了一架，三天不說話，第四天又為了一包零食和好。' },
  { ages: [15, 19], cond: (s, h) => h.hasPartner(), text: (s, h) => '你和對方的第一次約會很尷尬，兩個人都沒有說出真正想說的話。' },
  { ages: [8, 19], cond: (s, h) => h.inSchool() && h.isRegion('EAS') && h.incomeAtLeast('UM'), text: (s, h) => '放學後你還要趕去補習班，路上買了一個飯糰，邊走邊吃，算是今天的晚餐。' },

  // ---- 青年 20-34（續） ----
  { ages: [20, 34], cond: (s, h) => h.inSchool(), text: (s, h) => '你在圖書館和宿舍之間來回，咖啡喝得比水多。期末報告交出去那天，你睡了十六個小時。' },
  { ages: [20, 34], cond: (s, h) => h.employed() && !h.incomeAtLeast('UM'), text: (s, h) => '你一天站十個小時，下班後腿都是麻的。但發薪日那天，你替家人買了點好東西。' },
  { ages: [24, 34], cond: (s, h) => h.employed() && h.income() === 'H', text: (s, h) => '你的行事曆排滿會議，連午餐都在線上度過。你有點想念一頓真正慢慢吃的飯。' },
  { ages: [22, 34], cond: (s, h) => h.hasPartner() && !h.married(), text: (s, h) => `你和${h.partnerName()}談到了未來，卻沒談出結論，只是並肩走了一條很長的路。` },
  { ages: [20, 40], cond: (s, h) => h.isMigrant(), text: (s, h) => '你在異鄉的日子漸漸習慣了，但每當聽到熟悉的口音，還是會忍不住回頭。' },
  { ages: [22, 40], cond: (s, h) => h.married() && h.hasChildren() && h.youngestChildAge() <= 3, text: (s, h) => '孩子占據了你所有的時間，夢想暫時被收進抽屜，可是你的笑容比以前多了。' },
  { ages: [20, 55], cond: (s, h) => h.workStatus() === 'homemaker', text: (s, h) => '你在家照顧家務與家人，沒有人看見的那些事，其實撐起了整個家。' },
  { ages: [20, 34], cond: (s, h) => h.yearIn(2020, 2022), text: (s, h) => '疫情打亂了你的計畫，聚會與旅行一再延期。你學會了對著螢幕吹熄生日蠟燭。' },
  { ages: [25, 34], text: (s, h) => '朋友們一個個結婚、生子，你參加過的婚禮，比自己的生日派對還多。' },
  { ages: [20, 34], cond: (s, h) => !h.urban() && !h.incomeAtLeast('UM'), text: (s, h) => '農忙結束的夜晚，年輕人聚在村口，一瓶汽水和一支手機，分享著整個世界。' },

  // ---- 壯年 / 中年 35-59（續） ----
  { ages: [35, 60], cond: (s, h) => h.isJob('farmer', 'fisher'), text: (s, h) => '天一亮你就下田或出海，風吹日曬讓你的臉有了刻痕，但傍晚的晚霞總讓你心安。' },
  { ages: [38, 59], cond: (s, h) => h.hasChildren() && h.youngestChildAge() >= 13, text: (s, h) => '孩子的功課你已經幫不上忙了，但你還是會在他的門口放一杯熱牛奶。' },
  { ages: [35, 70], cond: (s, h) => h.married() && h.stat('happiness') >= 60, text: (s, h) => `你和${h.partnerName()}有種默契：不用開口，也知道對方想喝茶還是咖啡。` },
  { ages: [38, 59], cond: (s, h) => h.parentsAlive() > 0, text: (s, h) => '週末你回去看望老家的父母，他們的白頭髮，又比上次多了幾根。' },
  { ages: [38, 59], cond: (s, h) => h.isRich(), text: (s, h) => '財務上的壓力輕了，你開始認真問自己：除了賺錢，我還想做什麼？' },
  { ages: [38, 59], cond: (s, h) => h.employed() && h.incomeAtLeast('UM') && !h.isPoor(), text: (s, h) => '年度考核、升遷、轉職，同齡人都在忙這些。你真正喜歡的，是下班後回到家的那一小時。' },
  { ages: [35, 59], cond: (s, h) => h.isPoor() && h.hasChildren(), text: (s, h) => '孩子的學費、家裡的開銷，每個月的帳單都像在跟你比賽，你偶爾也會贏一局。' },
  { ages: [40, 70], cond: (s, h) => h.stat('health') < 50, text: (s, h) => '你開始留意每天早晨的身體狀況，先檢查哪裡不舒服，再決定今天怎麼過。' },
  { ages: [35, 59], cond: (s, h) => !h.hasPartner() && !h.hasChildren() && !h.married(), text: (s, h) => '你一個人的日子很自在，偶爾在深夜覺得有點冷清，就放一首老歌來聽。' },
  { ages: [45, 65], text: (s, h) => '朋友的葬禮與孩子的婚禮，在這個年紀開始交錯出現，你學會了兩種場合都帶上手帕。' },

  // ---- 晚年 60+（續） ----
  { ages: [60, 82], cond: (s, h) => h.retired() && h.incomeAtLeast('UM'), text: (s, h) => '你早上去市場買菜，下午澆花，傍晚散步。這樣的日子，無聊得剛剛好。' },
  { ages: [60, 90], cond: (s, h) => !h.retired() && !h.incomeAtLeast('UM'), text: (s, h) => '你的手沒有停過，種田、擺攤或幫人看小孩。你說閒下來反而會生病。' },
  { ages: [65, 98], cond: (s, h) => h.has('grandparent'), text: (s, h) => '孫輩寄來一張歪歪的圖畫，你把它貼在冰箱上，每天路過都要看一眼。' },
  { ages: [65, 105], cond: (s, h) => h.partnerStatus() === 'widowed', text: (s, h) => '你仍然習慣在睡前對著那張照片說一聲晚安，然後才關燈。' },
  { ages: [70, 105], cond: (s, h) => h.stat('health') < 45, text: (s, h) => '天氣一變，你的關節就先替你預報，準確度比氣象局還高。' },
  { ages: [68, 100], cond: (s, h) => h.yearIn(2012, 2200) && h.incomeAtLeast('LM'), text: (s, h) => '你學會了用手機傳貼圖，雖然老是傳錯，家人們還是回得很熱烈。' },
  { ages: [75, 105], text: (s, h) => '你的故事一遍又一遍地被說起，聽的人每次都假裝第一次聽到。你知道，那是愛。' },
  { ages: [80, 110], text: (s, h) => '又一個春天，你坐在窗邊曬太陽，不急著去哪裡，只是靜靜看著光慢慢移動。' },
  { ages: [60, 90], cond: (s, h) => h.married(), text: (s, h) => '你和老伴的對話變成了短短幾個字：「吃了嗎」「去哪」「早點睡」，卻一句比一句親。' },
  { ages: [62, 100], cond: (s, h) => !h.urban(), text: (s, h) => '你在院子裡看著四季輪流，雞啼一聲，你就想起一位老朋友。' },

  // ---- 依年代、地區與處境 ----
  { ages: [8, 70], cond: (s, h) => h.yearIn(1970, 1995) && !h.incomeAtLeast('UM'), text: (s, h) => '傍晚大家擠在鄰居家看唯一的電視。隔天上學，話題全是昨晚劇情。' },
  { ages: [20, 70], cond: (s, h) => h.yearIn(2024, 2100), text: (s, h) => '你在螢幕上處理大部分的事，也習慣對語音客服說「謝謝」，雖然對方不會收到。' },
  { ages: [10, 90], cond: (s, h) => h.era() === 'future', text: (s, h) => '新聞說今年的海平面又高了幾公分。你把防水靴放在玄關，順手擦乾淨。' },
  { ages: [5, 80], cond: (s, h) => h.income() === 'H' && h.isRegion('EUR', 'NAM'), text: (s, h) => '週末你去超市採買一週的食物，順便和收銀員聊了兩句天氣，這就是今天的社交。' },
  { ages: [20, 70], cond: (s, h) => h.isRegion('SSA') && !h.incomeAtLeast('UM'), text: (s, h) => '市場今天人很多，你賣完最後一把菜，天黑前提著空籃子走回家，心裡有一種輕。' },
  { ages: [10, 70], cond: (s, h) => h.isRegion('LAC'), text: (s, h) => '週末市集的音樂從早響到晚，連賣水果的阿姨也跟著節奏微微搖晃。' },
  { ages: [20, 70], cond: (s, h) => h.isRegion('OCE') && h.income() === 'H', text: (s, h) => '週末你去海邊，看孩子們在浪花裡尖叫，覺得這就是自己想要的生活。' },
  { ages: [20, 70], cond: (s, h) => h.isRegion('SAS', 'SEA') && h.urban(), text: (s, h) => '街上永遠有喇叭聲和叫賣聲，你早就把它當成背景音樂，安靜了反而睡不著。' },
  { ages: [20, 70], cond: (s, h) => h.isRegion('MENA', 'CAS'), text: (s, h) => '傍晚，家人和鄰居坐在一起喝茶，聊聊今天的收成與孩子們的功課。' },
  { ages: [12, 70], cond: (s, h) => h.isRegion('EAS') && h.income() === 'H', text: (s, h) => '捷運上每個人都低頭看手機，你也是。抬頭的瞬間，剛好看見窗外一棵開花的樹。' },
  { ages: [25, 65], cond: (s, h) => h.has('in_debt'), text: (s, h) => '你把還債的日期圈在日曆上，每圈掉一個，就多了一點力氣。' },
  { ages: [20, 80], cond: (s, h) => h.hasCondition('hypertension') || h.hasCondition('diabetes'), text: (s, h) => '你每天準時吃藥、量數字，慢慢把它當成生活中的一件普通小事。' },
];
