export const TOTAL_MONTHS = 96;
export const STAT_NAMES = { stamina:'體力', intellect:'智力', art:'藝術', etiquette:'禮儀', morality:'道德', martial:'武術', magic:'魔法', cooking:'料理', health:'健康', stress:'壓力', bond:'親情' };
export const RATING_NAMES = {combat:'戰士評價',magic:'魔法評價',social:'社交評價',domestic:'家事評價'};
export const ACTIVITIES = {
 study:{name:'自然科學',icon:'book',kind:'課程',age:10,cost:70,skill:'intellect',effects:{intellect:4,stress:7},rating:'magic'},
 art:{name:'繪畫課程',icon:'palette',kind:'課程',age:10,cost:80,skill:'art',effects:{art:4,etiquette:1,stress:6},rating:'social'},
 etiquette:{name:'禮儀課程',icon:'spark',kind:'課程',age:10,cost:70,skill:'etiquette',effects:{etiquette:4,stress:6},rating:'social'},
 sword:{name:'劍術訓練',icon:'sword',kind:'課程',age:10,cost:80,skill:'martial',effects:{martial:4,stamina:2,stress:9},rating:'combat'},
 magic:{name:'魔法研習',icon:'star',kind:'課程',age:12,cost:90,skill:'magic',effects:{magic:4,intellect:1,stress:9},rating:'magic'},
 farm:{name:'農場幫工',icon:'flower',kind:'打工',age:10,cost:-85,skill:'stamina',effects:{stamina:2,etiquette:-1,stress:10},rating:'combat'},
 cafe:{name:'餐館學徒',icon:'cup',kind:'打工',age:12,cost:-100,skill:'cooking',effects:{cooking:3,etiquette:1,stress:10},rating:'domestic'},
 house:{name:'家務練習',icon:'home',kind:'生活',age:10,cost:0,skill:'cooking',effects:{cooking:3,morality:1,stress:4},rating:'domestic'},
 explore:{name:'外出修行',icon:'compass',kind:'探索',age:12,cost:40,skill:'martial',effects:{stamina:2,stress:10},rating:'combat'},
 rest:{name:'在家休息',icon:'moon',kind:'休息',age:10,cost:0,effects:{stress:-20,health:10,bond:1}},
 vacation:{name:'親子旅行',icon:'heart',kind:'休息',age:10,cost:120,effects:{stress:-32,health:12,bond:5}},
};
export const EFFECTS = {
 curiosity:{label:'追問與研究',changes:{intellect:3,stress:1}},
 kindness:{label:'善意與責任',changes:{morality:3,bond:1}},
 creativity:{label:'表達與創作',changes:{art:3,stress:-1}},
 courage:{label:'獨立與勇氣',changes:{martial:2,stamina:1,stress:1}},
 connection:{label:'傾聽與陪伴',changes:{bond:3,stress:-3}},
};
export const DESTINATIONS = {
 forest:{name:'東方森林',desc:'林間採集，尋找迷路的旅人。',skill:'stamina',threshold:35,reward:70,flag:'forest'},
 ruins:{name:'西方遺跡',desc:'解讀壁畫，研究古老的星圖。',skill:'intellect',threshold:50,reward:100,flag:'ruins'},
 mountain:{name:'北方山道',desc:'護送商隊，考驗戰鬥的準備。',skill:'martial',threshold:60,reward:130,flag:'mountain'},
 lake:{name:'南方星湖',desc:'感受湖畔魔力，完成守護試煉。',skill:'magic',threshold:65,reward:150,flag:'lake'},
};
export const FESTIVALS = {
 art:{name:'王國藝術祭',skill:'art',rating:'social'},dance:{name:'秋夜舞會',skill:'etiquette',rating:'social'},cook:{name:'料理競賽',skill:'cooking',rating:'domestic'},combat:{name:'武術大會',skill:'martial',rating:'combat'},
};
export function dateOf(month) { return {year:1201+Math.floor((month+3)/12),month:(month+3)%12+1,age:10+Math.floor(month/12)}; }
export const AGE_STAGES = [{min:10,name:'童年',index:0},{min:12,name:'初成長',index:1},{min:15,name:'青春',index:2},{min:18,name:'成年',index:3}];
export const ageStage = g => AGE_STAGES.filter(s=>dateOf(g.month).age>=s.min).at(-1);
export const OUTFITS = {
 daily:{name:'日常洋裝',description:'親子旅行時親情額外 +1。',price:0,requirement:'初始擁有',canBuy:()=>true},
 academy:{name:'星紋學院服',description:'課程主技能額外 +1。',price:220,requirement:'智力 ≥40',canBuy:g=>g.stats.intellect>=40},
 travel:{name:'原野修行服',description:'探索健康門檻45；撤退健康損失減為4。',price:260,requirement:'12歲、體力 ≥40',canBuy:g=>dateOf(g.month).age>=12&&g.stats.stamina>=40},
 swim:{name:'晴海泳裝',description:'運動款泳裝。親子旅行時體力 +2、壓力額外 -2。',price:180,requirement:'完成親子旅行1旬',canBuy:g=>g.counts.vacation>=1},
 gala:{name:'緋紅禮服',description:'秋夜舞會成績 +6；藝術祭成績 +3。',price:360,requirement:'禮儀 ≥40',canBuy:g=>g.stats.etiquette>=40},
 demon:{name:'暮星惡魔裝',description:'童話扮裝。魔法課主技能額外 +2、壓力 +1。',price:0,requirement:'事件獎勵：取得星之鑰',reward:g=>g.flags.includes('starKey'),canBuy:()=>false},
 maid:{name:'蕾邊女僕服',description:'家務與餐館活動的料理額外 +1。',price:160,requirement:'家務練習6旬',canBuy:g=>g.counts.house>=6},
 knight:{name:'銀翼騎士服',description:'劍術活動的武術額外 +2。',price:0,requirement:'競賽獎勵：武術大會獲獎',reward:g=>g.flags.includes('medal-combat'),canBuy:()=>false},
 mage:{name:'深藍魔導袍',description:'魔法課的魔法額外 +1、智力 +1。',price:320,requirement:'12歲、魔法 ≥35',canBuy:g=>dateOf(g.month).age>=12&&g.stats.magic>=35},
 chef:{name:'白帽主廚服',description:'餐館學徒料理額外 +2。',price:240,requirement:'餐館學徒6旬',canBuy:g=>g.counts.cafe>=6},
 healer:{name:'白葉療癒服',description:'在家休息時健康額外 +3。',price:300,requirement:'道德 ≥65、探索森林',canBuy:g=>g.stats.morality>=65&&g.flags.includes('forest')},
 ranger:{name:'翠林遊俠服',description:'區域試煉主能力判定 +5，不永久改變數值。',price:300,requirement:'完成外出修行3旬',canBuy:g=>g.counts.explore>=3},
 farmer:{name:'麥田工作服',description:'農場幫工收入額外 +10%。',price:140,requirement:'農場幫工6旬',canBuy:g=>g.counts.farm>=6},
 sailor:{name:'潮風水手服',description:'南方星湖探索成功時，報酬額外 +30G。',price:280,requirement:'12歲、體力 ≥45',canBuy:g=>dateOf(g.month).age>=12&&g.stats.stamina>=45},
 artist:{name:'玫瑰畫家服',description:'繪畫課藝術額外 +2。',price:0,requirement:'事件獎勵：完成晨光畫作',reward:g=>g.flags.includes('masterpiece'),canBuy:()=>false},
 scholar:{name:'星圖學者袍',description:'自然科學智力額外 +2。',price:280,requirement:'自然科學12旬',canBuy:g=>g.counts.study>=12},
 dancer:{name:'紫藤舞者服',description:'秋夜舞會成績 +8。',price:300,requirement:'禮儀 ≥50、藝術 ≥35',canBuy:g=>g.stats.etiquette>=50&&g.stats.art>=35},
 winter:{name:'暖雪冬衣',description:'冬季在家休息，健康額外 +3。',price:150,requirement:'完成6個月養成',canBuy:g=>g.month>=6},
 summer:{name:'薄荷夏日服',description:'夏季在家休息，壓力額外 -4。',price:130,requirement:'完成2個月養成',canBuy:g=>g.month>=2},
 festival:{name:'豐收慶典服',description:'所有收穫祭競賽成績 +3。',price:0,requirement:'競賽獎勵：任一收穫祭獲獎',reward:g=>g.medals>=1,canBuy:()=>false},
};
export function outfitActivityBonus(g,id){
 const o=g.outfit,season=dateOf(g.month).month,a=ACTIVITIES[id];
 if(o==='academy'&&a.kind==='課程')return {[a.skill]:1};
 if(o==='daily'&&id==='vacation')return {bond:1};
 if(o==='swim'&&id==='vacation')return {stamina:2,stress:-2};
 if(o==='demon'&&id==='magic')return {magic:2,stress:1};
 if(o==='maid'&&['house','cafe'].includes(id))return {cooking:1};
 if(o==='knight'&&id==='sword')return {martial:2};
 if(o==='mage'&&id==='magic')return {magic:1,intellect:1};
 if(o==='chef'&&id==='cafe')return {cooking:2};
 if(o==='healer'&&id==='rest')return {health:3};
 if(o==='artist'&&id==='art')return {art:2};
 if(o==='scholar'&&id==='study')return {intellect:2};
 if(o==='winter'&&id==='rest'&&[12,1,2].includes(season))return {health:3};
 if(o==='summer'&&id==='rest'&&[6,7,8].includes(season))return {stress:-4};
 return {};
}
export function festivalOutfitBonus(g){if(g.outfit==='festival')return 3;if(g.outfit==='dancer'&&g.festival==='dance')return 8;if(g.outfit==='gala')return g.festival==='dance'?6:g.festival==='art'?3:0;return 0;}
export function buyOutfit(g,id){const o=OUTFITS[id];if(!o||g.pending||g.month>=TOTAL_MONTHS||g.wardrobe.includes(id)||!o.canBuy(g)||g.gold<o.price)throw new Error('尚未符合服裝購買條件');const n=structuredClone(g);n.gold-=o.price;n.wardrobe.push(id);return n;}
export function wearOutfit(g,id){if(!g.wardrobe.includes(id)||g.pending)throw new Error('目前無法更換服裝');const n=structuredClone(g);n.outfit=id;return n;}
export function freshGame() { return {version:2,month:0,gold:1200,wardrobe:['daily'],outfit:'daily',stats:{stamina:30,intellect:25,art:20,etiquette:20,morality:50,martial:10,magic:10,cooking:20,health:90,stress:10,bond:60},ratings:{combat:0,magic:0,social:0,domestic:0},counts:Object.fromEntries(Object.keys(ACTIVITIES).map(k=>[k,0])),flags:[],medals:0,plan:['study','farm','rest'],destination:'forest',festival:'art',history:[],pending:null}; }
const clamp = n => Math.min(100,Math.max(0,Math.round(n)));
export const unlocked = (game,id) => Object.hasOwn(ACTIVITIES,id) && dateOf(game.month).age >= ACTIVITIES[id].age;
export const activityCost = (g,id) => ACTIVITIES[id].cost > 0 && ACTIVITIES[id].kind === '課程' && g.stats[ACTIVITIES[id].skill] >= 60 ? Math.round(ACTIVITIES[id].cost * 1.5) : ACTIVITIES[id].cost;
export const planCost = game => game.plan.reduce((n,id)=>n+activityCost(game,id),40);
export function validateEvent(e) {
 const str=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
 if(!e||!str(e.title,50)||!str(e.body,700)||!Array.isArray(e.choices)||e.choices.length!==3) throw new Error('事件格式不完整');
 const used=new Set();
 for(const c of e.choices){if(!c||!str(c.label,70)||!str(c.outcome,250)||!Object.hasOwn(EFFECTS,c.effectId)||used.has(c.effectId)) throw new Error('事件選項格式不正確');used.add(c.effectId);}
 return {title:e.title.trim(),body:e.body.trim(),choices:e.choices.map(c=>({label:c.label.trim(),outcome:c.outcome.trim(),effectId:c.effectId}))};
}
const choices = (a,b,c) => [a,b,c].map(([effectId,label,outcome])=>({effectId,label,outcome}));
const C = {
 curiosity:['curiosity','一起查閱資料，找出答案','莉亞在筆記裡寫下新發現，決定下次繼續研究。'],
 kindness:['kindness','幫助對方，把事情做好','她耐心地完成小小的承諾，也學會為別人多想一步。'],
 creativity:['creativity','用自己的方式勇敢表達','莉亞把心裡的想法化為一幅畫，終於敢與別人分享。'],
 courage:['courage','做好準備，讓她自己試試','她先確認安全，再跨出一步。這次的經驗讓她更有自信。'],
 connection:['connection','先聽聽她真正的想法','你們聊到夕陽西下。莉亞知道自己的心事有人願意聽。'],
};
const event=(id,title,body,keys,condition=()=>true,flag=null)=>({id,title,body,choices:choices(...keys.map(k=>C[k])),condition,flag});
export const EVENTS = [
 event('arrival','星光送來的第一頁','莉亞剛搬進這個家。她把小小的行李放在床邊，問你：「以後，我可以成為什麼樣的人？」八年的故事，從今天開始。',['connection','curiosity','courage'],g=>g.month===0,'arrival'),
 event('illness','需要慢下來的一天','莉亞今天有些疲倦。桌上的課本還沒翻開，她已經睡著了。比起趕上進度，也許先把身體照顧好更重要。',['connection','kindness','curiosity'],g=>g.stats.health<40),
 event('burnout','塞得太滿的日程表','莉亞握著行程表，遲遲沒有開口。最近的安排讓她喘不過氣，她想知道自己的努力是否只能換來更多功課。',['connection','kindness','creativity'],g=>g.stats.stress>=65),
 event('birthday','長大一歲的願望','生日蛋糕上的燭光輕輕搖晃。莉亞許了一個新的願望，想把自己的選擇也寫進下一年的行程裡。',['connection','courage','curiosity'],g=>g.month>0&&g.month%12===0),
 event('art-invite','老師的推薦信','繪畫老師看見莉亞的作品後，寄來一封推薦信，邀請她準備一幅完整的畫參加秋季展覽。',['creativity','curiosity','connection'],g=>g.stats.art>=45&&g.counts.art>=6&&!g.flags.includes('artInvite'),'artInvite'),
 event('art-finish','畫布上的晨光','完成了好多次修改，莉亞終於把晨光留在畫布上。她準備帶著作品去見老師，也想決定如何介紹這幅畫。',['creativity','courage','connection'],g=>g.flags.includes('artInvite')&&g.counts.art>=12&&!g.flags.includes('masterpiece'),'masterpiece'),
 event('magic-key','遺跡裡的星之鑰','從遺跡帶回的石片，在魔法課上發出淡淡微光。老師說，星湖的守護者也許認得它。',['curiosity','courage','kindness'],g=>g.flags.includes('ruins')&&g.stats.magic>=45&&!g.flags.includes('starKey'),'starKey'),
 event('knight','商隊的致謝','北方商隊帶著平安歸來的消息拜訪。隊長記得莉亞的幫助，願意替她寫一份騎士學院的推薦。',['courage','kindness','connection'],g=>g.flags.includes('mountain')&&g.stats.morality>=55&&!g.flags.includes('knightLetter'),'knightLetter'),
 event('friend','同桌的小小祕密','同桌的米菈很少在課上發言。今天她把一張未完成的星圖推過來，邀請莉亞一起補上最後一角。',['kindness','curiosity','connection'],g=>g.counts.study>=3&&!g.flags.includes('mira'),'mira'),
 event('friend-return','畢業前的約定','米菈即將搬到另一座城市。她把最初的星圖交給莉亞，說不管走到哪裡，都能仰望同一片天空。',['connection','curiosity','creativity'],g=>g.flags.includes('mira')&&dateOf(g.month).age>=16&&!g.flags.includes('promise'),'promise'),
 event('cafe','第一份獨立完成的餐點','餐館今天特別忙。師傅讓莉亞負責一道簡單的料理，客人吃完後，特別請她出來道謝。',['kindness','courage','curiosity'],g=>g.counts.cafe>=5&&!g.flags.includes('firstDish'),'firstDish'),
 event('festival','收穫季的前奏','廣場掛起彩旗，秋季收穫祭即將登場。有人練習舞步，有人反覆調整食譜。莉亞也開始想像自己站上舞台的樣子。',['creativity','courage','connection'],g=>dateOf(g.month).month===9),
 event('winter','冬日的壁爐','冷風掠過窗邊，壁爐裡的木柴啪地響了一聲。莉亞捧著熱茶，翻看今年留下的筆記。',['connection','curiosity','creativity'],g=>[12,1,2].includes(dateOf(g.month).month)),
 event('summer','夏日的一場急雨','午後忽然下起大雨，原定的外出暫時延後。莉亞提議用這段空白的時間，做一件平常沒空做的事。',['creativity','connection','kindness'],g=>[6,7,8].includes(dateOf(g.month).month)),
 event('farm','農場的新芽','田裡第一排嫩芽終於冒出頭。老農邀請莉亞幫新來的學徒認識工具，她第一次成了帶領別人的人。',['kindness','courage','curiosity'],g=>g.plan.includes('farm')),
 event('explore','遠路上的岔口','修行途中出現兩條小徑，路標有些模糊。莉亞停下腳步，先檢查地圖和補給，再決定下一步。',['curiosity','courage','connection'],g=>g.plan.includes('explore')),
 event('etiquette','第一次正式的邀請','禮儀課老師安排一場小型茶會。莉亞擔心自己說錯話，但也期待認識不同的人。',['courage','kindness','connection'],g=>g.plan.includes('etiquette')),
 event('home','平凡日子裡的一點光','窗邊的花開了。莉亞把今天的小發現寫在手札邊角，問你願不願意一起替這一天取個名字。',['creativity','curiosity','connection']),
];
export function selectEvent(g) {
 const special=EVENTS.filter(e=>e.condition(g)&&!['home','farm','explore','etiquette','winter','summer'].includes(e.id));
 const unseen=special.filter(e=>!e.flag||!g.flags.includes(e.flag));
 const picked=unseen.find(e=>!g.history.slice(0,2).some(h=>h.eventId===e.id))||unseen[0]||EVENTS.filter(e=>e.condition(g)&&(!e.flag||!g.flags.includes(e.flag))&&!g.history.slice(0,2).some(h=>h.eventId===e.id)).at(0)||EVENTS.at(-1);
 return {id:picked.id,flag:picked.flag,event:validateEvent(picked)};
}
export function prepareMonth(g,e,source,seed=selectEvent(g)) {
 if(g.pending||g.month>=TOTAL_MONTHS) throw new Error('目前無法推進月份');
 if(g.plan.length!==3||g.plan.some(id=>!unlocked(g,id))) throw new Error('請安排三旬有效行程');
 // A conservative budget reserves full tuition and living cost; uncertain wages are not borrowed in advance.
 const required=40+g.plan.reduce((n,id)=>n+Math.max(0,activityCost(g,id)),0);
 if(g.gold+Math.max(0,40-g.gold)<required) throw new Error('金幣不足以預付本月課程與40G生活費，請安排免費活動或打工');
 const valid=validateEvent(e);
 if(valid.choices.some((c,i)=>c.effectId!==seed.event.choices[i].effectId)) throw new Error('事件選項偏離已核定的規則');
 const next=structuredClone(g);next.pending={event:valid,source:source==='gemini'?'gemini':'local',seedId:seed.id,flag:seed.flag};return next;
}
function apply(g,changes,factor=1){for(const [k,n]of Object.entries(changes))g.stats[k]=clamp(g.stats[k]+(n>0&&!['stress','health','bond'].includes(k)?Math.floor(n*factor):n));}
export function resolveMonth(g,index){
 if(!g.pending||!Number.isInteger(index)||!g.pending.event.choices[index]) throw new Error('請選擇有效的事件選項');
 const n=structuredClone(g),before={...n.stats},goldBefore=n.gold,logs=[],choice=n.pending.event.choices[index],calendar=dateOf(n.month);
 const relief=Math.max(0,40-n.gold);if(relief){n.gold+=relief;logs.push(`緊急生活援助：+${relief}G（只補足生活費）`);}n.gold-=40;
 for(const id of n.plan){
  const a=ACTIVITIES[id];
  if(n.stats.health<30&&a.kind!=='休息'){apply(n,ACTIVITIES.rest.effects);logs.push(`${a.name}：因健康不足30，改為在家休息`);continue;}
  const tired=n.stats.stress>=70,eff=tired?0.5:1;
  const cost=activityCost(g,id);n.gold-=Math.max(0,cost);
  if(a.kind==='打工'){
   const proficiency=n.stats[a.skill];const success=proficiency>=25&&n.stats.stress<80;
   const wage=Math.round(-cost*(success?1:0.45)*(n.counts[id]>=12?1.25:1)*(n.outfit==='farmer'&&id==='farm'?1.1:1));n.gold+=wage;
   logs.push(`${a.name}：${success?'順利完成':'仍在學習／疲勞失誤'}，收入 ${wage}G`);
  }else logs.push(`${a.name}：${tired?'疲勞，技能收益減半':'完成'}${cost>0?`，支出 ${cost}G`:''}`);
  apply(n,a.effects,eff);n.counts[id]++;
  apply(n,outfitActivityBonus(n,id));
  if(a.rating)n.ratings[a.rating]=clamp(n.ratings[a.rating]+(tired?1:2));
  if(id==='explore'){
   const d=DESTINATIONS[n.destination],success=n.stats[d.skill]+(n.outfit==='ranger'?5:0)>=d.threshold&&n.stats.health>=(n.outfit==='travel'?45:50);
   if(success){const reward=d.reward+(n.outfit==='sailor'&&n.destination==='lake'?30:0);n.gold+=reward;if(!n.flags.includes(d.flag))n.flags.push(d.flag);logs.push(`${d.name}：試煉成功，獲得 ${reward}G`);}else{const loss=n.outfit==='travel'?4:8;apply(n,{health:-loss,stress:5});logs.push(`${d.name}：準備不足，安全撤退（健康 -${loss}／壓力 +5）`);}
  }
  if(n.stats.stress>=80)apply(n,{health:-12});
 }
 apply(n,EFFECTS[choice.effectId].changes);
 if(n.pending.flag&&!n.flags.includes(n.pending.flag))n.flags.push(n.pending.flag);
 if(calendar.month===10){const f=FESTIVALS[n.festival],score=Math.round(n.stats[f.skill]*.7+n.ratings[f.rating]*.3-n.stats.stress*.2+festivalOutfitBonus(n)),threshold=32+Math.floor(n.month/12)*5;
  if(score>=threshold){n.medals++;n.gold+=200;n.ratings[f.rating]=clamp(n.ratings[f.rating]+8);if(!n.flags.includes(`medal-${n.festival}`))n.flags.push(`medal-${n.festival}`);logs.push(`${f.name}：獲獎（${score}／門檻 ${threshold}），獎金 200G`);}else{n.ratings[f.rating]=clamp(n.ratings[f.rating]+2);logs.push(`${f.name}：參賽（${score}／門檻 ${threshold}），評價 +2`);}}
 for(const [id,o]of Object.entries(OUTFITS)){if(o.reward?.(n)&&!n.wardrobe.includes(id)){n.wardrobe.push(id);logs.push(`獲得服裝：${o.name}`);}}
 n.month++;if(n.month%12===0&&n.month<TOTAL_MONTHS){n.gold+=200;logs.push('年度養育津貼：+200G');}
 n.history.unshift({month:n.month,eventId:n.pending.seedId,title:n.pending.event.title,body:n.pending.event.body,choice:choice.label,outcome:choice.outcome,source:n.pending.source,delta:Object.fromEntries(Object.keys(before).map(k=>[k,n.stats[k]-before[k]])),goldDelta:n.gold-goldBefore,logs});n.pending=null;return n;
}
const route=(id,title,description,checks)=>({id,title,description,checks});
export const ENDINGS=[
 route('royal','王國外交官','以學識與禮儀，在不同的世界之間搭起橋樑。',[['禮儀 ≥80',g=>g.stats.etiquette>=80],['智力 ≥65',g=>g.stats.intellect>=65],['社交評價 ≥65',g=>g.ratings.social>=65],['親情 ≥50',g=>g.stats.bond>=50],['舞會獲獎',g=>g.flags.includes('medal-dance')]]),
 route('guardian','星湖守護者','理解古老魔力，也願意為他人守住星光。',[['魔法 ≥80',g=>g.stats.magic>=80],['道德 ≥60',g=>g.stats.morality>=60],['魔法評價 ≥60',g=>g.ratings.magic>=60],['取得星之鑰',g=>g.flags.includes('starKey')],['通過星湖試煉',g=>g.flags.includes('lake')]]),
 route('knight','王國騎士','讓力量成為守護的理由。',[['武術 ≥80',g=>g.stats.martial>=80],['道德 ≥60',g=>g.stats.morality>=60],['戰士評價 ≥60',g=>g.ratings.combat>=60],['獲得騎士推薦',g=>g.flags.includes('knightLetter')],['武術大會獲獎',g=>g.flags.includes('medal-combat')]]),
 route('painter','宮廷畫師','從第一張習作，到讓人駐足的晨光。',[['藝術 ≥80',g=>g.stats.art>=80],['繪畫課程 ≥24旬',g=>g.counts.art>=24],['社交評價 ≥55',g=>g.ratings.social>=55],['完成晨光畫作',g=>g.flags.includes('masterpiece')],['藝術祭獲獎',g=>g.flags.includes('medal-art')]]),
 route('scholar','星圖學者','每一個問題，都是走向未知的一步。',[['智力 ≥80',g=>g.stats.intellect>=80],['科學課程 ≥24旬',g=>g.counts.study>=24],['探索西方遺跡',g=>g.flags.includes('ruins')]]),
 route('mage','魔法研究員','把好奇心化成能照亮生活的魔法。',[['魔法 ≥70',g=>g.stats.magic>=70],['智力 ≥55',g=>g.stats.intellect>=55],['魔法研習 ≥18旬',g=>g.counts.magic>=18]]),
 route('chef','王國主廚','用一道料理，讓陌生人也想起家的味道。',[['料理 ≥80',g=>g.stats.cooking>=80],['家事評價 ≥60',g=>g.ratings.domestic>=60],['餐館學徒 ≥18旬',g=>g.counts.cafe>=18],['料理競賽獲獎',g=>g.flags.includes('medal-cook')]]),
 route('adventurer','遠行探險家','把地圖上的空白，慢慢走成自己的故事。',[['體力 ≥70',g=>g.stats.stamina>=70],['武術 ≥50',g=>g.stats.martial>=50],['外出修行 ≥18旬',g=>g.counts.explore>=18],['至少探索三區',g=>Object.keys(DESTINATIONS).filter(k=>g.flags.includes(k)).length>=3]]),
 route('host','花園茶館主人','親手照料日常，也接住每一位旅人的心情。',[['料理 ≥60',g=>g.stats.cooking>=60],['禮儀 ≥50',g=>g.stats.etiquette>=50],['金幣 ≥1800',g=>g.gold>=1800],['餐館學徒 ≥12旬',g=>g.counts.cafe>=12]]),
 route('chancellor','王國學院院長','把多年積累的知識，交給下一代的好奇心。',[['智力 ≥90',g=>g.stats.intellect>=90],['禮儀 ≥70',g=>g.stats.etiquette>=70],['科學課程 ≥36旬',g=>g.counts.study>=36],['社交評價 ≥60',g=>g.ratings.social>=60]]),
 route('alchemist','星石鍊金師','在科學與魔法之間，尋找新的可能。',[['智力 ≥75',g=>g.stats.intellect>=75],['魔法 ≥75',g=>g.stats.magic>=75],['魔法評價 ≥55',g=>g.ratings.magic>=55],['探索西方遺跡',g=>g.flags.includes('ruins')]]),
 route('swordmaster','流派劍術師範','強大，也意味著學會耐心教導。',[['武術 ≥85',g=>g.stats.martial>=85],['劍術訓練 ≥30旬',g=>g.counts.sword>=30],['戰士評價 ≥70',g=>g.ratings.combat>=70]]),
 route('healer','森林療癒師','用知識與善意，照顧受傷的旅人。',[['智力 ≥60',g=>g.stats.intellect>=60],['魔法 ≥50',g=>g.stats.magic>=50],['道德 ≥75',g=>g.stats.morality>=75],['探索東方森林',g=>g.flags.includes('forest')]]),
 route('performer','巡迴劇團主角','讓舞台上的每個故事，都擁有真實的感受。',[['藝術 ≥70',g=>g.stats.art>=70],['禮儀 ≥60',g=>g.stats.etiquette>=60],['社交評價 ≥50',g=>g.ratings.social>=50]]),
 route('curator','王國藝廊策展人','讓每一份努力，都有被看見的地方。',[['藝術 ≥65',g=>g.stats.art>=65],['智力 ≥60',g=>g.stats.intellect>=60],['禮儀 ≥55',g=>g.stats.etiquette>=55],['完成晨光畫作',g=>g.flags.includes('masterpiece')]]),
 route('guild','商會經營者','看懂收支，更看重每一段合作關係。',[['金幣 ≥5000',g=>g.gold>=5000],['禮儀 ≥65',g=>g.stats.etiquette>=65],['農場或餐館工作 ≥36旬',g=>g.counts.farm+g.counts.cafe>=36]]),
 route('chef-teacher','料理學院講師','把熟悉的味道，教成別人也能延續的日常。',[['料理 ≥70',g=>g.stats.cooking>=70],['智力 ≥55',g=>g.stats.intellect>=55],['家事評價 ≥50',g=>g.ratings.domestic>=50]]),
 route('ranger','王國巡林員','認得每一條路，也守住人與森林的界線。',[['體力 ≥65',g=>g.stats.stamina>=65],['道德 ≥60',g=>g.stats.morality>=60],['外出修行 ≥12旬',g=>g.counts.explore>=12],['探索東方森林',g=>g.flags.includes('forest')]]),
 route('guide','商路領航人','替旅人找到方向，也替自己找到位置。',[['體力 ≥60',g=>g.stats.stamina>=60],['禮儀 ≥45',g=>g.stats.etiquette>=45],['探索北方山道',g=>g.flags.includes('mountain')]]),
 route('scribe','王國檔案官','把重要的事，留下清楚而可靠的記錄。',[['智力 ≥60',g=>g.stats.intellect>=60],['道德 ≥60',g=>g.stats.morality>=60],['科學課程 ≥15旬',g=>g.counts.study>=15]]),
 route('governess','家庭教師','陪伴另一個孩子，慢慢找到學習的自信。',[['智力 ≥55',g=>g.stats.intellect>=55],['禮儀 ≥45',g=>g.stats.etiquette>=45],['親情 ≥70',g=>g.stats.bond>=70]]),
 route('baker','小鎮烘焙師','清晨烤爐裡的香氣，成為街坊熟悉的問候。',[['料理 ≥60',g=>g.stats.cooking>=60],['家事評價 ≥35',g=>g.ratings.domestic>=35],['餐館學徒 ≥8旬',g=>g.counts.cafe>=8]]),
 route('florist','花房設計師','把花與顏色，編成每個人值得紀念的日子。',[['藝術 ≥50',g=>g.stats.art>=50],['道德 ≥55',g=>g.stats.morality>=55],['農場幫工 ≥12旬',g=>g.counts.farm>=12]]),
 route('maid','王城管事','用細心和禮節，把繁忙的日常安排妥當。',[['料理 ≥55',g=>g.stats.cooking>=55],['禮儀 ≥60',g=>g.stats.etiquette>=60],['家事評價 ≥40',g=>g.ratings.domestic>=40]]),
 route('guard','城鎮守衛','認真值守每一個平凡的夜晚。',[['武術 ≥55',g=>g.stats.martial>=55],['體力 ≥50',g=>g.stats.stamina>=50],['戰士評價 ≥35',g=>g.ratings.combat>=35]]),
 route('magic-shop','魔法雜貨店主','讓一點魔法，解決生活裡的小麻煩。',[['魔法 ≥50',g=>g.stats.magic>=50],['禮儀 ≥40',g=>g.stats.etiquette>=40],['金幣 ≥1200',g=>g.gold>=1200]]),
 route('craft','手作工藝師','把耐心，做成可以握在手裡的作品。',[['藝術 ≥45',g=>g.stats.art>=45],['體力 ≥40',g=>g.stats.stamina>=40],['繪畫課程 ≥8旬',g=>g.counts.art>=8]]),
 route('household','社區照護者','在最平凡的地方，讓人感到自己並不孤單。',[['道德 ≥70',g=>g.stats.morality>=70],['料理 ≥45',g=>g.stats.cooking>=45],['親情 ≥60',g=>g.stats.bond>=60]]),
 route('apprentice','繼續學習的旅人','暫時還不急著給未來一個頭銜，她想再多試幾種可能。',[['智力 ≥40',g=>g.stats.intellect>=40],['親情 ≥55',g=>g.stats.bond>=55]]),
 route('artist','自由創作者','將自己的感受，變成能與世界分享的作品。',[['藝術 ≥60',g=>g.stats.art>=60],['繪畫課程 ≥12旬',g=>g.counts.art>=12]]),
 route('farmer','田園經營者','看懂四季，也學會等待收穫。',[['體力 ≥55',g=>g.stats.stamina>=55],['農場幫工 ≥24旬',g=>g.counts.farm>=24],['金幣 ≥1200',g=>g.gold>=1200]]),
 route('home','溫暖的日常','沒有轟轟烈烈的頭銜，也能選擇自己喜歡的生活。',[]),
];
const ENDING_PRIORITY=['royal','guardian','knight','painter','chancellor','alchemist','swordmaster','healer','scholar','mage','chef','adventurer','performer','curator','guild','chef-teacher','ranger','guide','scribe','governess','host','baker','florist','maid','guard','magic-shop','craft','household','artist','farmer','apprentice','home'];
ENDINGS.sort((a,b)=>ENDING_PRIORITY.indexOf(a.id)-ENDING_PRIORITY.indexOf(b.id));
export function routeProgress(g,r){return r.checks.map(([label,check])=>({label,met:check(g)}));}
export function eligibleEndings(g){return ENDINGS.filter(r=>r.checks.every(([,check])=>check(g)));}
export function ending(g){return g.month<TOTAL_MONTHS?null:eligibleEndings(g)[0];}
export function epilogue(g){return {
 family:g.stats.bond>=75?'無論走多遠，她總會寄信回家。':g.stats.bond>=40?'你們偶爾有分歧，仍願意慢慢學習理解。':'她選擇與家保持距離；重新建立信任，需要時間。',
 friendship:g.flags.includes('promise')?'她與米菈保留了看星星的約定。':g.flags.includes('mira')?'求學時認識的朋友，成為青春的一段溫暖記憶。':'新的人生，也有尚未遇見的朋友。',
 wellbeing:g.stats.health<35?'她決定先休養，再開始下一段生活。':g.stats.stress>=70?'她已走得很遠，也需要重新找回生活的餘裕。':'她帶著健康的身心，期待下一個春天。',
 finances:g.gold>=5000?'多年積蓄，讓她多了一份選擇的自由。':g.gold<300?'生活尚需精打細算，她將一步步建立自己的基礎。':'家裡保留了一筆足以安穩起步的積蓄。'
};}
export function validateSave(g){
 const fail=()=>{throw new Error('存檔版本或內容不正確');};
 if(!g||g.version!==2||!Number.isInteger(g.month)||g.month<0||g.month>TOTAL_MONTHS||!Number.isInteger(g.gold)||g.gold<0||g.gold>1000000)fail();
 for(const field of ['stats','ratings','counts'])for(const k of Object.keys(freshGame()[field]))if(!Number.isInteger(g[field]?.[k])||g[field][k]<0||g[field][k]>(field==='counts'?288:100))fail();
 if(!Array.isArray(g.plan)||g.plan.length!==3||g.plan.some(id=>!unlocked(g,id))||!Object.hasOwn(DESTINATIONS,g.destination)||!Object.hasOwn(FESTIVALS,g.festival)||!Array.isArray(g.flags)||g.flags.length>100||g.flags.some(v=>typeof v!=='string'||v.length>50)||!Array.isArray(g.history)||g.history.length!==g.month)fail();
 const history=g.history.map((h,i)=>{
  if(!h||h.month!==g.month-i||!['eventId','title','body','choice','outcome'].every(k=>typeof h[k]==='string'&&h[k].length<=1000)||!Number.isInteger(h.goldDelta)||!Array.isArray(h.logs)||h.logs.length>20||h.logs.some(v=>typeof v!=='string'||v.length>300)||Object.keys(STAT_NAMES).some(k=>!Number.isFinite(h.delta?.[k])||Math.abs(h.delta[k])>100))fail();
  return {month:h.month,eventId:h.eventId,title:h.title,body:h.body,choice:h.choice,outcome:h.outcome,goldDelta:h.goldDelta,logs:[...h.logs],delta:Object.fromEntries(Object.keys(STAT_NAMES).map(k=>[k,h.delta[k]])),source:h.source==='gemini'?'gemini':'local'};
 });
 if(!Array.isArray(g.wardrobe)||g.wardrobe.length<1||g.wardrobe.length>Object.keys(OUTFITS).length||!g.wardrobe.includes('daily')||g.wardrobe.some(id=>!Object.hasOwn(OUTFITS,id))||new Set(g.wardrobe).size!==g.wardrobe.length||!g.wardrobe.includes(g.outfit))fail();
 const next={...freshGame(),wardrobe:[...g.wardrobe],outfit:g.outfit,month:g.month,gold:g.gold,stats:Object.fromEntries(Object.keys(STAT_NAMES).map(k=>[k,g.stats[k]])),ratings:Object.fromEntries(Object.keys(RATING_NAMES).map(k=>[k,g.ratings[k]])),counts:Object.fromEntries(Object.keys(ACTIVITIES).map(k=>[k,g.counts[k]])),plan:[...g.plan],destination:g.destination,festival:g.festival,flags:[...new Set(g.flags)],medals:g.medals,history};
 if(!Number.isInteger(g.medals)||g.medals<0||g.medals>8)fail();
 if(g.pending){if(g.month>=TOTAL_MONTHS)fail();const seed=selectEvent(next);if(g.pending.seedId!==seed.id||g.pending.flag!==seed.flag)fail();next.pending=prepareMonth(next,g.pending.event,g.pending.source,seed).pending;}
 return next;
}
