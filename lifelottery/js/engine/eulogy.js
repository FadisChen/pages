// Eulogy (生平): a few tender, specific sentences about one finished life, in Traditional Chinese (Taiwan usage).
//
// Pure module (no DOM, no random numbers): the text is a function of the life summary alone, so the review screen, the album
// detail view and the share card all say the same thing, a reload changes nothing, and an old album record without a stored
// eulogy gets one on the fly. Every sentence slot has at least four phrasings; the phrasing is picked with a stable hash of the
// life ("name|birth year|age|country"), never with Math.random.
//
//   composeEulogy(summary)  -> { v, text, short, shape, slots }   text: 3-5 sentences, 60-260 characters; short: 1-2 sentences for the card
//   eulogyOf(summaryOrRecord) -> same, using the stored one when the summary carries a valid one
//   TEMPLATES                -> every phrasing table (tests check there are at least four per slot)
//
// Tone ("shape"): infant (not one year old) and child (1-14) are gentle and say nothing about achievements, work, partners;
// youth (15-29) is about what was not yet; calamity (war or disaster) names the person before the number; migrant, hard,
// long and quiet follow the facts of the life. Suicide is told with restraint: no method, not even the word.

import { hash01 } from './rng.js';
import { placePhrases } from './place.js';

export const EULOGY_VERSION = 1;

const NUM = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'];
const cn = (n) => (n >= 0 && n <= 10 ? NUM[n] : String(n));
const uniq = (a) => [...new Set(a)];

// ---------------------------------------------------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------------------------------------------------

const CHRONIC = { hypertension: '高血壓', heart_disease: '心臟病', diabetes: '糖尿病', arthritis: '關節炎', asthma: '氣喘', copd: '慢性肺病' };
const FOCUS_NOUN = { study: '學習與讀書', work: '工作與事業', family: '家人與家庭', health: '照顧身體', self: '自己的興趣與生活' };

const firstHl = (hl, re) => hl.find((h) => re.test(h.text));

/** Everything the templates need, derived from a (normalised) summary. Tolerant of missing fields. */
export function factsOf(sum) {
  const male = sum.gender === 'M';
  const age = Math.max(0, Math.floor(Number(sum.age) || 0));
  const hl = Array.isArray(sum.highlights) ? sum.highlights.filter((h) => h && typeof h.text === 'string') : [];
  const country = (sum.homeCountry && sum.homeCountry.name) || sum.countryName || '';
  const city = sum.birthCity && sum.birthCity !== country ? sum.birthCity : '';
  const place = !country ? '' : !city ? country : placePhrases(country, city, !!sum.urbanBirth).full;
  const q = Math.max(1, Math.min(5, Math.round(Number(sum.wealthQ) || 3)));
  const edu = sum.education || {};
  // each job once, in the order of the LAST time it was held (so the last one is the last job)
  const jobs = uniq((Array.isArray(sum.jobs) ? sum.jobs.filter(Boolean) : []).reverse()).reverse();
  const kids = sum.children || {};
  const kidTotal = Math.max(0, kids.total || 0);
  const kidAlive = Math.max(0, Math.min(kidTotal, kids.alive == null ? kidTotal : kids.alive));
  const kidNames = Array.isArray(kids.names) ? kids.names.filter(Boolean) : [];
  const partner = sum.partner && sum.partner.name ? sum.partner : null;
  const lived = uniq(Array.isArray(sum.countriesLived) ? sum.countriesLived.filter(Boolean) : []);
  const last = sum.countryName || lived[lived.length - 1] || country;
  const cause = sum.cause && sum.cause.id ? { id: sum.cause.id, label: sum.cause.label || '' } : null;
  const conds = Array.isArray(sum.conditions) ? sum.conditions : [];
  const ls = sum.lifespan || {};

  // --- migration: why, and where
  // flight: a move abroad because of war; displaced: driven from home by war and (mostly) back again
  const flight = !!firstHl(hl, /躲避戰亂|難民|重新安置/) && lived.length > 1;
  const displaced = !flight && !!firstHl(hl, /戰亂|流離/);
  const route = {
    names: lived, n: lived.length, home: country, last,
    returned: lived.length > 1 && last === country,
    reason: flight ? 'flight' : firstHl(hl, /留學|交換學生/) ? 'study' : firstHl(hl, /出國工作|工作簽證|抽中移民/) ? 'work' : 'settle',
    flight,
  };

  // --- hardship, strongest first (each: { id, w, ...detail })
  const hard = [];
  if (flight) hard.push({ id: 'flight', w: 9 });
  else if (displaced) hard.push({ id: 'displaced', w: 10 });
  const marr = firstHl(hl, /結婚|結為夫妻/);
  const early = firstHl(hl, /很年輕就結婚/);
  if (early || (marr && marr.age < 18 && !/為你們/.test(marr.text))) hard.push({ id: 'childMarriage', w: 7, a: (early || marr).age });
  if (kidTotal > kidAlive && kidTotal > 0) hard.push({ id: 'lostChild', w: 8, lost: kidTotal - kidAlive, all: kidAlive === 0 });
  const orphan = firstHl(hl, /失去了雙親/);
  if (orphan) hard.push({ id: 'lostParents', w: 6, a: orphan.age });
  if (firstHl(hl, /疫情期間失去/)) hard.push({ id: 'pandemicLoss', w: 4 });
  if (firstHl(hl, /很小就開始工作/) && age >= 15) hard.push({ id: 'childWork', w: 5 });
  if (conds.includes('disability')) hard.push({ id: 'disability', w: 5 });
  if (conds.includes('depression')) hard.push({ id: 'depression', w: 5 });
  if (conds.includes('cancer') && !(cause && cause.id === 'cancer')) hard.push({ id: 'cancer', w: 4 });
  const chronic = conds.filter((c) => CHRONIC[c]);
  if (chronic.length >= 3 && age >= 50) hard.push({ id: 'chronic', w: 3, list: chronic.slice(0, 2).map((c) => CHRONIC[c]).join('和') });
  if (firstHl(hl, /創業失敗/)) hard.push({ id: 'bankrupt', w: 3 });
  if (q === 1 && age >= 15) hard.push({ id: 'poverty', w: 3 });
  hard.sort((a, b) => b.w - a.w);
  const hardScore = hard.reduce((t, h) => t + h.w, 0);
  // what makes a life "hard" in tone: the heavy things (not a chronic illness in old age, not a modest start)
  const hardCore = hard.reduce((t, h) => t + (['chronic', 'cancer', 'bankrupt', 'pandemicLoss'].includes(h.id) ? 0 : h.id === 'lostChild' && h.lost < 2 && !h.all ? 5 : h.w), 0);

  // --- keepsakes: single telling moments worth a clause, strongest first
  const keeps = [];
  if (firstHl(hl, /供弟妹繼續念書|為了讓.*繼續升學/)) keeps.push({ id: 'siblingsSchool', w: 9 });
  if (firstHl(hl, /收留了手足的孩子/)) keeps.push({ id: 'tookIn', w: 9 });
  if (firstHl(hl, /遺產留給了更需要的手足/)) keeps.push({ id: 'inheritance', w: 8 });
  const vol = firstHl(hl, /(.{2,10}?)後投入(救災|志工行列)/);
  if (vol) { const m = vol.text.match(/(.{2,10}?)後投入(救災|志工行列)/); keeps.push({ id: 'volunteer', w: 8, event: m[1], what: m[2] }); }
  if (firstHl(hl, /寄回去的錢/)) keeps.push({ id: 'remit', w: 8 });
  if (firstHl(hl, /通過國家考試/)) keeps.push({ id: 'exam', w: 6 });
  if (firstHl(hl, /創業，並且做出了成績|把副業做成了正職/)) keeps.push({ id: 'ownBusiness', w: 6 });
  if (firstHl(hl, /接下了家裡的生意/)) keeps.push({ id: 'familyShop', w: 6 });
  if (firstHl(hl, /參與工人行動/)) keeps.push({ id: 'unionWin', w: 6 });
  const late = (re) => hl.some((h) => re.test(h.text) && h.age >= 55); // "in his old age" only for a late highlight
  if (late(/寫下了自己的回憶|寫了一封信|留下了一段想對家人說的話|把自己的心願與家人好好談過/)) keeps.push({ id: 'words', w: 6 });
  if (late(/走了一趟一輩子想去的路|一直想去的地方|完成了一趟長久想做的旅行/)) keeps.push({ id: 'trip', w: 6 });
  if (late(/靜靜地看完了這一生的老照片/)) keeps.push({ id: 'photos', w: 5 });
  if (late(/任性地做了一件喜歡的事|學了一項新的才藝/)) keeps.push({ id: 'play', w: 5 });
  if (firstHl(hl, /拿到獎學金/)) keeps.push({ id: 'scholarship', w: 4 });
  if (firstHl(hl, /戒了菸/)) keeps.push({ id: 'quit', w: 3 });
  if (firstHl(hl, /得到一次升遷|開始帶領一個團隊/)) keeps.push({ id: 'promoted', w: 3 });
  keeps.sort((a, b) => b.w - a.w);

  // --- the focus kept longest
  // (from the timeline, which survives the album's normalisation; `focusYears` is only the fallback)
  const fy = {};
  if (Array.isArray(sum.focusTimeline) && sum.focusTimeline.length) {
    for (const sg of sum.focusTimeline) if (sg && sg.focus) fy[sg.focus] = (fy[sg.focus] || 0) + Math.max(0, (sg.toAge - sg.fromAge) + 1);
  } else if (sum.focusYears && typeof sum.focusYears === 'object') Object.assign(fy, sum.focusYears);
  let focus = null;
  for (const [id, yrs] of Object.entries(fy)) {
    if (!FOCUS_NOUN[id] || !(yrs >= 12)) continue;
    if (!focus || yrs > focus.years) focus = { id, years: yrs, noun: FOCUS_NOUN[id] };
  }

  const grand = !!firstHl(hl, /孫輩/);
  const grown = !!firstHl(hl, /長大離家/);
  const retired = !!firstHl(hl, /^退休。?$/);
  const pp = partner && firstHl(hl, new RegExp(`${partner.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}離世`));

  const f = {
    key: `${sum.name}|${sum.birthYear}|${age}|${(sum.homeCountry && (sum.homeCountry.code || sum.homeCountry.name)) || ''}|${male ? 'M' : 'F'}`,
    nm: String(sum.name || '無名氏'), male, he: male ? '他' : '她', kidw: male ? '男孩' : '女孩', sx: male ? '男性' : '女性',
    age, y0: Math.round(Number(sum.birthYear) || 0), y1: Math.round(Number(sum.deathYear) || (Number(sum.birthYear) || 0) + age),
    country, place, wealth: sum.wealthShort || '小康', q, urban: !!sum.urbanBirth,
    edu: { level: edu.level || 'none', years: Math.max(0, edu.years || 0) },
    firstUni: !!firstHl(hl, /第一個念大學/), finishedUni: !!firstHl(hl, /大學畢業/),
    jobs, lastJob: sum.lastJob || jobs[jobs.length - 1] || '', yearsWorked: Math.max(0, sum.yearsWorked || 0),
    partner, pstatus: partner ? partner.status : null, partnerGone: pp ? pp.age : null,
    marriages: sum.marriages || 0, divorces: sum.divorces || 0,
    kids: { total: kidTotal, alive: kidAlive, names: kidNames.slice(0, kidTotal || kidNames.length) },
    grand, grown, retired, route, hard, hardScore, hardCore, keeps, focus,
    cause, suicide: !!sum.suicide || (!!cause && cause.id === 'suicide'),
    vs: Number.isFinite(ls.vsCountry) ? ls.vsCountry : 0, le: Math.round(ls.countryLe || 0),
    highlights: hl,
  };
  f.shape = shapeOf(f);
  return f;
}

function shapeOf(f) {
  if (f.age < 1) return 'infant';
  if (f.age < 15) return 'child';
  const cid = f.cause && f.cause.id;
  if (cid === 'conflict' || cid === 'disaster') return 'calamity';
  if (f.age < 30) return 'youth';
  if (f.route.flight) return 'migrant';
  if (f.age >= 85 || (f.age >= 80 && f.vs >= 6)) return 'long';
  if (f.hardCore >= 10) return 'hard';
  if (f.route.n > 1) return 'migrant';
  return 'quiet';
}

// ---------------------------------------------------------------------------------------------------------------------
// Phrasings. Every array has at least four entries (tests/eulogy.test.mjs checks). Functions get the facts `f` (and extras).
// ---------------------------------------------------------------------------------------------------------------------

const FAM = {
  1: ['家裡窮得連三餐都得精打細算', '一家人勉強餬口，日子過得很緊', '家境一貧如洗，卻也一天天撐了下來', '家裡窮，一餐一飯都不容易'],
  2: ['家境清寒，凡事都得節省', '家裡不寬裕，日子過得拮据', '一家人省吃儉用，把日子過下去', '家境不好，卻也有熱騰騰的一餐'],
  3: ['家境普通，是個尋常的人家', '家裡的日子不好不壞', '不算富裕，也不至於匱乏', '家裡過著平平穩穩的小康日子'],
  4: ['家境寬裕，生活安穩', '家裡不愁吃穿', '家裡過著衣食無憂的日子', '家裡的日子過得相當寬裕'],
  5: ['家境富裕，從小生活優渥', '家裡從不為錢煩惱', '家裡物質充裕，什麼都不缺', '富裕的家境替這個孩子鋪好了起點'],
};

const ORIGIN = {
  infant: [
    (f) => `${f.y0}年，${f.nm}出生在${f.place}，${f.fam}。家人把這個剛來到世上的小${f.kidw}抱在懷裡，眼裡滿是歡喜`,
    (f) => `${f.nm}是${f.y0}年在${f.place}出生的小${f.kidw}，${f.fam}。家人替${f.he}準備了名字，也準備了很多很多的愛`,
    (f) => `${f.y0}年，在${f.place}，一戶${f.wealth}人家迎來了小${f.kidw}${f.nm}。全家人圍著${f.he}，捨不得移開視線`,
    (f) => `${f.nm}的生命，從${f.y0}年${f.place}，一個${f.wealth}家庭開始。${f.he}一出生，就成了家人心裡最柔軟的地方`,
    (f) => `${f.y0}年，${f.nm}來到${f.place}，小小的，軟軟的，${f.fam}。家人守著${f.he}，盼著${f.he}一天天長大`,
  ],
  child: [
    (f) => `${f.y0}年，${f.nm}出生在${f.place}，${f.fam}，是家人心裡的寶貝`,
    (f) => `${f.nm}是${f.y0}年生在${f.place}，一個${f.wealth}家庭的${f.kidw}，身邊總有家人惦記著`,
    (f) => `${f.y0}年，一個${f.kidw}在${f.place}出生，取名${f.nm}，${f.fam}`,
    (f) => `${f.nm}的故事很短，從${f.y0}年${f.place}，一個${f.wealth}家庭開始`,
    (f) => `${f.nm}生於${f.y0}年的${f.place}，${f.fam}，家人把最好的都留給了${f.he}`,
  ],
  adult: [
    (f) => `${f.y0}年，${f.nm}出生在${f.place}，${f.fam}`,
    (f) => `${f.nm}生於${f.y0}年，是${f.place}，一個${f.wealth}家庭的孩子`,
    (f) => `故事從${f.y0}年開始，在${f.place}：${f.nm}來到這個世界，${f.fam}`,
    (f) => `${f.place}，${f.y0}年，${f.nm}出生了，${f.fam}`,
    (f) => `${f.nm}的一生，從${f.y0}年${f.place}，一個${f.wealth}家庭開始`,
    (f) => `${f.y0}年，${f.place}迎來了一個新生命，名叫${f.nm}，${f.fam}`,
    (f) => `${f.nm}在${f.y0}年來到人世，出生地是${f.place}，${f.fam}`,
    (f) => `${f.nm}出生於${f.y0}年，在${f.place}，${f.fam}`,
  ],
};

// ---- the road: education, work, route, hardship, keepsakes, focus (clauses; each is a predicate after "他／她") ----

const EDU = {
  none: [() => '從沒有機會走進課堂', () => '沒能上過學，人生的功課都是在生活裡學來的', () => '沒有機會念書，早早就學著自己扛起生活', () => '一天書也沒讀過，卻很早就懂得生活的重量'],
  primaryShort: [(f) => `只念了${f.edu.years}年書就離開了課堂`, (f) => `念了${f.edu.years}年書便不得不輟學`, (f) => `書只讀了${f.edu.years}年，就被生活拉走了`, (f) => `念完${f.edu.years}年書，就沒能再繼續讀下去`],
  primary: [() => '念完了小學', () => '小學念完後，就沒有再繼續升學', () => '把小學念完，已是當時能走到的最遠', () => '讀完小學，便投入了生活'],
  secondaryPart: [() => '念到中學，卻沒能念完', () => '中學的書念了幾年，就離開了課堂', () => '在中學念了一段時間，後來走進了生活', () => '沒能把中學念完，卻也讀了好些年的書'],
  tertiaryPart: [() => '考進了大學，卻沒能念到畢業', () => '進了大學，念了幾年', () => '念過幾年大學，後來走進了社會', () => '大學的書只念了幾年，便轉向了別的路'],
  secondaryYoung: [() => '還在中學裡讀書', () => '中學的學業才念到一半', () => '正在念中學，前頭還有更長的路', () => '仍是個中學生，前頭有許多打算'],
  tertiaryYoung: [() => '讀到了大學', () => '考進了大學，路才剛開始', () => '念到大學，正走在求學的路上', () => '進了大學，前頭還有許多打算'],
  secondary: [() => '念到中學畢業', () => '一路念完了中學', () => '中學念完便開始了自己的人生', () => '完成了中學的學業'],
  tertiary: [() => '讀完了大學', () => '大學畢業，靠的是一步一步的努力', () => '一路念到大學畢業', () => '拿到了大學的學位'],
  graduate: [() => '念到研究所', () => '一路讀到研究所', () => '在研究所裡繼續深造', () => '取得了研究所的學歷'],
  firstUni: [() => '是家裡第一個念大學的人', () => '成了家裡第一個走進大學的人', () => '以家裡第一個大學生的身分，走過了校園', () => '替整個家族念出了第一張大學文憑'],
};

const WORK = {
  one: [(f, j) => `做的是${j}的工作`, (f, j) => `當過${j}，靠這份工作養活自己`, (f, j) => `以${j}為業`, (f, j) => `一路做著${j}，把日子過下去`],
  oneLong: [(f, j) => `前後當了${f.yearsWorked}年的${j}`, (f, j) => `在${j}這一行，一做就是${f.yearsWorked}年`, (f, j) => `把${f.yearsWorked}年的光陰，花在${j}的工作上`, (f, j) => `${j}的工作，前前後後做了${f.yearsWorked}年`],
  two: [(f, a, b) => `先後當過${a}和${b}`, (f, a, b) => `做過${a}，後來成了${b}`, (f, a, b) => `從${a}做起，後來改當${b}`, (f, a, b) => `在${a}與${b}之間，找著自己的生計`],
  many: [(f, first, last) => `從${first}做起，換過好幾種工作，最後成了${last}`, (f, first, last, mid) => `做過${mid}，一路換了好幾種行業，最後是${last}`, (f, first, last) => `工作一路輾轉，從${first}到${last}，每一份都是為了生活`, (f, first, last, mid) => `當過${mid}，最後落腳在${last}`],
};

const ROUTE = {
  flight: [(f, r) => `為了躲避戰亂離開家鄉，輾轉來到${r.b}`, (f, r) => `被戰火逼得離開${r.home}，在${r.b}重新開始`, (f, r) => `離開被戰火波及的${r.home}，一路流離，落腳在${r.b}`, (f, r) => `在戰亂中背井離鄉，最後在${r.b}安頓下來`],
  flightBack: [(f, r) => `流離多年後，終於回到了${r.home}`, (f, r) => `經歷了顛沛流離，最後又回到了${r.home}`, (f, r) => `離鄉避難多年，終於返回${r.home}`, (f, r) => `走過一段流離失所的路，最後仍回到了出生的地方`],
  many: [(f, r) => `足跡遍及${cn(r.n)}個國家，從${r.home}一路走到${r.last}`, (f, r) => `前後在${cn(r.n)}個國家生活過，最後落腳${r.last}`, (f, r) => `一路從${r.home}走到${r.last}，沿途停留過${cn(r.n)}個國家`, (f, r) => `在${cn(r.n)}個國家都留下過生活的痕跡，最後在${r.last}`],
  three: [(f, r) => `先後到${r.b}、${r.c}生活`, (f, r) => `離開${r.home}後，在${r.b}與${r.c}都住過一段日子`, (f, r) => `從${r.home}到${r.b}，再到${r.c}，走了很長的路`, (f, r) => `除了${r.home}，也在${r.b}、${r.c}留下了生活的痕跡`],
  work: [(f, r) => `離開${r.home}，到${r.b}工作`, (f, r) => `為了生計遠赴${r.b}`, (f, r) => `出了國，在${r.b}討生活`, (f, r) => `遠走${r.b}，為自己和家人找一條出路`],
  study: [(f, r) => `離開${r.home}，到${r.b}求學`, (f, r) => `為了念書遠赴${r.b}`, (f, r) => `出國到${r.b}深造`, (f, r) => `到${r.b}留學，從此與${r.home}隔了一片海`],
  settle: [(f, r) => `離開${r.home}，在${r.b}安頓下來`, (f, r) => `後來搬到${r.b}，在那裡落地生根`, (f, r) => `移居${r.b}，重新建立了自己的生活`, (f, r) => `在${r.b}重新開始，那裡後來也成了安身立命的地方`],
  back: [(f, r) => `曾離開${r.home}，到${r.b}生活過一段時間，最後又回到了家鄉`, (f, r) => `在${r.b}闖蕩過一陣子，終究回到了${r.home}`, (f, r) => `出國走了一趟，繞了一圈，又回到了${r.home}`, (f, r) => `離鄉到${r.b}生活後，還是回到了熟悉的${r.home}`],
};

const HARD = {
  flight: ROUTE.flight,
  displaced: [() => '在戰亂中流離失所，經歷了一段顛沛流離的日子，後來才重返家鄉', () => '與家人一起被戰火趕離了家園，吃了很多苦，後來終於回到熟悉的地方', () => '被戰亂趕離了家，在流離中過了好些日子，才又回到家鄉', () => '經歷過戰亂與流離，家不在原來的地方，最後仍回到了故土'],
  childMarriage: [(f, h) => `${h.a}歲就在家人的安排下成了家，還是孩子的年紀就得學著當大人`, (f, h) => `在${h.a}歲的年紀就被推進婚姻，很早就學會了承擔`, (f, h) => `${h.a}歲，由家人安排了婚事，過早地告別了童年`, (f, h) => `${h.a}歲就成了家，婚後的日子，得很快學會長大`],
  lostParents: [(f, h) => `${h.a}歲那年雙親過世，從此凡事得靠自己`, (f, h) => `在${h.a}歲時，雙親過世了`, (f, h) => `${h.a}歲，雙親過世，成了沒有人可以依靠的人`, (f, h) => `雙親過世得早，${h.a}歲那年起，一個人撐著前行`],
  pandemicLoss: [() => '在疫情期間失去了一位重要的家人', () => '疫情的日子裡，送走了身邊一位重要的人', () => '疫情期間，經歷了失去家人的痛', () => '在疫情中失去了一位重要的親人'],
  childWork: [() => '很小就開始工作，幫家裡撐起生計', () => '小小年紀就得去工作，童年結束得很早', () => '還是孩子的時候，就開始為生計奔波', () => '很早就開始工作，沒有太多時間好好當孩子'],
  disability: [() => '帶著身體的障礙過了一生', () => '身體有不便，卻照樣把日子一天天過下去', () => '一生與身體的限制同行，從不讓它決定自己是誰', () => '身體的障礙從沒離開過，日子仍過得認真'],
  depression: [() => '也曾長期受情緒的低潮所苦', () => '與憂鬱相處過很長一段時間，有好的日子，也有難熬的日子', () => '心裡的低潮陪了很多年，仍一天天地過下去', () => '在憂鬱的陰影裡走過一段路，沒有放棄自己'],
  cancer: [() => '曾與癌症正面交手', () => '經歷過癌症的治療與恐懼', () => '生過一場癌症的大病，也撐過了治療的日子', () => '曾在癌症的陰影下過日子，仍努力把生活顧好'],
  chronic: [(f, h) => `長年與${h.list}為伴`, (f, h) => `被${h.list}拖累了好些年`, (f, h) => `身上始終帶著${h.list}，仍把日子好好過下去`, (f, h) => `受${h.list}所苦，卻沒有停下腳步`],
  bankrupt: [() => '創業失敗過一次，又從零重新來過', () => '生意垮過一回，爬起來再從頭開始', () => '曾在創業中摔了一跤，爬起來又試了一次', () => '吃過創業失敗的虧，仍然沒有放棄'],
  poverty: [() => '一輩子都在為生計奔波，日子從沒真正寬裕過', () => '日子始終過得很緊，每一分錢都得算過', () => '從赤貧的起點出發，走得比別人吃力得多', () => '出身赤貧，一路都在跟匱乏拔河'],
};

const KEEP = {
  siblingsSchool: [() => '供弟妹繼續念書，自己省吃儉用', () => '為了讓弟妹能繼續念書，付出了很多', () => '把機會讓給弟妹，供他們念書', () => '一手撐起弟妹的學業'],
  tookIn: [() => '收留了手足的孩子，當成自己的一份責任照顧', () => '在手足有難時，敞開家門，收留了手足那邊的小輩', () => '把手足的孩子接進家裡，一起生活', () => '手足的孩子沒有地方去時，是這個家接住了他們'],
  inheritance: [() => '把老家的遺產讓給了更需要的手足', () => '分遺產時，把自己的那一份留給了更需要的手足', () => '在分遺產時，選擇把機會讓給生活更吃緊的手足', () => '把老家留下的東西，讓給了更需要的手足'],
  volunteer: [(f, k) => `在${k.event}後投入${k.what}`, (f, k) => `${k.event}之後，沒有袖手旁觀，投入了${k.what}`, (f, k) => `${k.event}發生後，選擇站出來，投入${k.what}`, (f, k) => `在${k.event}後挽起袖子，投入${k.what}`],
  remit: [() => '把辛苦賺來的錢寄回家鄉，替家人蓋起了新的家', () => '寄回家的錢，在家鄉蓋起了一棟新房子', () => '一筆一筆寄回去的錢，最後在家鄉變成了一個新的家', () => '省下來的錢一再寄回，為家人蓋起了新的房子'],
  exam: [() => '通過國考，進入了公部門', () => '考上了公職，端起一份穩定的工作', () => '靠著國考，考進了公部門', () => '通過國考，成為公務人員'],
  ownBusiness: [() => '創業做出了成績', () => '自己創業，把事業做得有聲有色', () => '從無到有，把自己的事業做了起來', () => '靠自己的雙手，把一份事業撐了起來'],
  familyShop: [() => '接下了家裡的生意，把它延續下去', () => '接手家裡的生意，一撐就是好些年', () => '把家裡的生意接了過來，讓店面繼續開著', () => '承接家業，讓家裡的招牌沒有就此熄燈'],
  unionWin: [() => '參與工人行動，為同伴爭取到了更好的待遇', () => '站在工人這一邊，替同伴爭來了更好的待遇', () => '與工友們並肩，爭取到了更好的待遇', () => '在工人行動中站了出來，為大家換得更好的待遇'],
  words: [() => '到了晚年，把想說的話好好留給了身邊的人', () => '晚年把心裡的話一一交代給最重要的人', () => '年紀大了以後，提筆或開口，把想留下的話說給家人聽', () => '在晚年留下了想對家人說的話'],
  trip: [() => '終於走了一趟惦記了一輩子的遠路', () => '年紀再大，也還是出發去看了一直想去的地方', () => '完成了一趟惦記許久的旅行', () => '沒有讓心願只停留在想像，終究出發了'],
  photos: [() => '晚年曾靜靜地翻看了一生的老照片', () => '到了晚年，把一生的老照片一張張慢慢看完', () => '晚年的某個午後，安靜地看完了這一生的老照片', () => '在晚年翻出老照片，一張一張把過去重新走了一遍'],
  play: [() => '到了晚年，仍保有好奇心，學新東西、做喜歡的事', () => '晚年任性地做了一件自己喜歡的事', () => '即使年紀大了，也沒有停止替自己找一點樂子', () => '不讓日子只剩下責任，總替自己留一點喜歡的事'],
  scholarship: [() => '拿到獎學金，才得以繼續念下去', () => '靠一份獎學金，把書繼續念了下去', () => '因為一筆獎學金，學業沒有就此中斷', () => '獎學金替這段求學的路，留下了一道門'],
  quit: [() => '下定決心戒了菸', () => '成功戒了菸，把健康一點一點找回來', () => '戒掉了菸，替自己多爭取了一些日子', () => '經過幾番努力，終於戒掉了菸'],
  promoted: [() => '在工作上一步步被看見，得到了升遷', () => '靠著努力，得到了升遷與更多的責任', () => '從做事的人，慢慢變成帶領別人的人', () => '職位一步步往上，肩上的責任也越來越重'],
};

const FOCUS = [
  (f, g) => `有${g.years}年的時間，把重心放在${g.noun}上`,
  (f, g) => `人生裡最長的一段重心，是${g.noun}，前後有${g.years}年`,
  (f, g) => `前前後後花了${g.years}年，把心思用在${g.noun}`,
  (f, g) => `${g.years}年來，心裡擺在最前面的，是${g.noun}`,
];

// ---- family ----
const PARTNER = {
  married: [(f) => `與${f.partner.name}成了家，一起把日子過下去`, (f) => `身邊有${f.partner.name}相伴`, (f) => `與${f.partner.name}攜手同行`, (f) => `和${f.partner.name}一起守著一個家`],
  widowed: [(f) => `${f.partner.name}離世之後，獨自把日子過了下去`, (f) => `與${f.partner.name}相伴過一段歲月，${f.partner.name}先走後，帶著想念繼續生活`, (f) => `送走了${f.partner.name}，從此多了一份想念`, (f) => `${f.partner.name}先走一步，留下${f.he}把兩個人的回憶好好收著`],
  widowedAge: [(f) => `${f.partnerGone}歲那年送走了${f.partner.name}，從此多了一份想念`, (f) => `與${f.partner.name}相伴了一段歲月，在${f.partnerGone}歲時，兩人天人永隔`, (f) => `${f.partnerGone}歲那年，${f.partner.name}先走一步，往後的日子，${f.he}帶著想念走完`, (f) => `在${f.partnerGone}歲時失去了${f.partner.name}，把兩個人的回憶好好收著`],
  dating: [(f) => `身邊有${f.partner.name}，兩人正在交往`, (f) => `${f.partner.name}陪在身邊，兩人還在一起`, (f) => `與${f.partner.name}正在交往，那是人生裡才剛翻開的一頁`, (f) => `心裡有一個人，名叫${f.partner.name}，兩人走在一起`],
  divorced: [(f) => `曾與${f.partner.name}成家，後來各自走開`, (f) => `與${f.partner.name}的婚姻走到了盡頭，但${f.he}沒有就此停下`, (f) => `走過一段與${f.partner.name}的婚姻，之後各自重新生活`, (f) => `與${f.partner.name}分開之後，仍然好好過日子`],
  none: [() => '一生沒有結婚，把日子過得自成一格', () => '沒有結婚，也沒有孩子，生活簡單而安靜', () => '一生未婚，一個人把日子一天一天過下去', () => '一個人過日子，過得安靜，也過得有自己的樣子'],
  divorcedGone: [() => '曾經成家，後來離了婚', () => '有過一段婚姻，離婚之後獨自把日子過好', () => '婚姻走到了離婚這一步，但沒有因此停下腳步', () => '離婚之後，仍然把日子一天天過好'],
  childlessW: [() => '沒有孩子，把心力放在身邊的人與自己的日子上', () => '一生沒有孩子，日子過得安靜而簡單', () => '沒有孩子，卻把牽掛分給了身邊的人', () => '沒有孩子，餘下的日子靜靜地過'],
  childless: [() => '沒有孩子，兩個人把日子過得安靜', () => '身邊沒有孩子，卻有彼此', () => '雖然沒有孩子，家裡也有自己的溫度', () => '沒有孩子，把心力放在彼此和身邊的人身上'],
};
const KIDS = {
  any: [(f, k) => `育有${k}`, (f, k) => `養育了${k}`, (f, k) => `${k}，是一生最放不下的牽掛`, (f, k) => `一路拉拔${k}`],
  grown: [(f, k) => `把${k}養大成人`, (f, k) => `看著${k}長大成人`, (f, k) => `一路陪著${k}長大`, (f, k) => `為了${k}，付出了大半輩子的心力`],
  young: [(f, k) => `年紀輕輕，就有了${k}`, (f, k) => `很年輕就當了父母，有了${k}`, (f, k) => `${k}，在還很年輕的時候就來到了身邊`, (f, k) => `在還年輕的時候，就迎接了${k}`],
  lost: [(f, l) => `只是有${cn(l)}個孩子先走了一步`, (f, l) => `只是有${cn(l)}個孩子沒能陪著走到最後`, (f, l) => `卻也送走了${cn(l)}個孩子`, (f, l) => `而${cn(l)}個孩子比自己更早離開，那是心裡最重的傷`],
  lostAll: [(f) => `孩子們一個接一個先走了，${f.he}都一一送走`, (f) => `失去了所有的孩子，那是一生最重的傷`, (f) => `送走了每一個孩子，卻仍把日子撐著過下去`, (f) => `孩子都比${f.he}先離開，${f.he}把這份痛默默扛著`],
  grand: [() => '還抱過孫輩', () => '後來又抱起了孫輩', () => '晚年等到了孫輩的到來', () => '也迎來了孫輩，把孫輩抱在懷裡'],
};

// ---- the stage of a short life (children 1-14) ----
const CHILD_STAGE = {
  toddler: [(f) => `${f.he}才剛學會走路、開口說話，是家裡最被惦記的小人兒`, (f) => `那是剛學步、剛會叫人的年紀，家人的目光總離不開${f.he}`, (f) => `${f.age}歲的${f.he}，剛開始認識這個世界，每一天都有新的事要看`, (f) => `${f.he}還那麼小，剛剛開始學著認識身邊的每一個人`],
  small: [(f) => `${f.he}正是滿屋子跑、什麼都想問的年紀，家裡因${f.he}而熱鬧`, (f) => `${f.age}歲的${f.he}，眼睛總是亮亮的，對什麼都好奇`, (f) => `${f.he}還在學著認字、學著交朋友的年紀，世界對${f.he}才剛剛展開`, (f) => `那是個相信世界很大、明天很長的年紀，${f.he}也是`],
  school: [(f) => `${f.he}念了${f.edu.years}年書，正是什麼都想學、什麼都想問的年紀`, (f) => `${f.edu.years}年的書讀下來，${f.he}正一點一點長出自己的模樣`, (f) => `${f.he}已經念了${f.edu.years}年書，家人看在眼裡，都是希望`, (f) => `${f.age}歲，書念了${f.edu.years}年，${f.he}正在為自己的未來打好最初的底子`],
  schoolless: [(f) => `${f.he}還沒有機會好好念書，卻已經是家裡離不開的孩子`, (f) => `${f.age}歲的${f.he}，雖然沒能走進課堂，身邊仍有許多愛著${f.he}的人`, (f) => `${f.he}的日子很簡單，卻有人把每一天都記得清清楚楚`, (f) => `那些課本上的字還沒來得及認得，${f.he}就先被家人牢牢記在心裡`],
  teen: [(f) => `${f.age}歲的${f.he}，正要從孩子長成少年`, (f) => `${f.he}站在童年和少年的交界，眼前的路才剛開始`, (f) => `${f.he}正走到一個開始有自己想法的年紀，世界對${f.he}也才剛展開`, (f) => `${f.age}歲，是一個一半像孩子、一半想長大的年紀`],
};

// ---- death ----
const DEATH = {
  neonatal: ['因出生時的健康問題，沒能撐過最初的日子', '因早產與新生兒的併發症，離開了人世', '在出生後不久，被新生兒疾病帶走了', '還沒來得及熟悉這個世界，就因新生兒的病症離開'],
  lri: ['因嚴重的肺部感染離世', '被一場來勢洶洶的肺炎帶走', '在一場肺部感染後沒能康復', '因呼吸道感染惡化而離世'],
  diarrhea: ['因腸道感染與脫水離世', '被一場又急又猛的腹瀉耗盡了力氣，沒能挺過去', '在嚴重腹瀉與脫水中離世', '因腸胃感染，在短短幾天內離開'],
  malaria: ['因瘧疾離世', '被蚊蟲傳染的瘧疾帶走', '在瘧疾的高燒裡沒能撐過去', '因瘧疾發作而離開了人世'],
  tb: ['因結核病離世，病程拖了很長一段時間', '被肺結核一點一點耗盡了力氣', '在結核病的長期折磨後離開', '因結核病離世'],
  hiv: ['因愛滋病相關的併發症離世', '在愛滋病相關的疾病中離開了人世', '因免疫系統衰竭而離世', '沒能撐過愛滋病的併發症'],
  malnutrition: ['因長期的營養不良與反覆感染離世', '身體在長期吃不飽的日子裡，終於撐不下去了', '因營養不良離開了人世', '被飢餓與疾病接連拖垮，最後離世'],
  road: ['因一場交通事故離世', '在路上遇到事故，沒能回到家', '在一場車禍中離開了人世', '因交通意外離世'],
  drowning: ['因溺水意外離世', '在水邊的一場意外中離開了人世', '因一場溺水事故離世', '被水奪走了生命，那是一場誰也沒料到的意外'],
  homicide: ['在一場暴力事件中喪生', '死於他人的暴力', '因暴力事件離世', '在一場突如其來的暴力衝突中離開了人世'],
  conflict: ['在戰火與衝突中喪生', '沒能躲過戰事的波及', '死於這場戰亂', '在武裝衝突中失去了生命'],
  disaster: ['在一場天災中喪生', '沒能逃過這場災難', '死於一場突如其來的自然災害', '在災難中離開了人世，連道別都來不及'],
  maternal: ['因懷孕或生產的併發症離世', '在生產前後，因大出血等併發症離世', '在迎接新生命的過程中，失去了自己的生命', '因孕產相關的併發症離世'],
  cvd: ['因心臟疾病離世', '在某個平凡的日子裡，心臟停止了跳動', '因心血管疾病離開了人世', '因心臟病發作離世'],
  stroke: ['因中風離世', '被一次腦中風帶走了生命', '因腦血管疾病離世', '因中風病逝'],
  cancer: ['因癌症離世', '與癌症共處一段時日後，安靜地離開', '病逝於癌症', '在癌症的長期病程後離開了人世'],
  diabetes: ['因糖尿病的併發症離世', '被糖尿病的併發症拖垮了身體，終於離世', '因糖尿病相關的併發症離開了人世', '病逝於糖尿病的併發症'],
  copd: ['因慢性肺病離世，最後的日子裡呼吸總是很吃力', '因慢性阻塞性肺病離世', '病逝於慢性肺部疾病', '在慢性肺病的長期折磨後離開了人世'],
  dementia: ['因失智症離世，最後幾年已漸漸認不得身邊的人', '在失智症漫長的告別後，安靜地離開', '病逝於失智症', '因失智症離世'],
  kidney: ['因腎臟疾病離世', '因腎功能衰竭離開了人世', '病逝於腎臟疾病', '因腎衰竭離世'],
  liver: ['因肝臟疾病離世', '長期的肝病最終惡化，離開了人世', '病逝於肝臟疾病', '因肝病的併發症離世'],
  other: ['因疾病離世', '在病痛中離開了人世', '因一場重病沒能康復', '因一場突然的健康危機離世'],
};
// Restraint: no method, not even the word.
const DEATH_SUICIDE = ['被長久的痛苦壓得喘不過氣', '在難以承受的痛苦裡，走到了生命的盡頭', '終究沒能把心裡的痛熬過去', '把一直背著的重量，在這一天放下了'];

const D_ADULT = [
  (f, vp, cmp) => `${f.age}歲那年，${f.he}${vp}，${cmp}`,
  (f, vp, cmp) => `享年${f.age}歲，${vp}；${cmp}`,
  (f, vp, cmp) => `${f.he}於${f.y1}年離世，享年${f.age}歲，${vp}，${cmp}`,
  (f, vp, cmp) => `${f.age}歲時，${f.he}${vp}，${cmp}`,
];
const D_LONG = [
  (f, vp, cmp) => `${f.he}以${f.age}歲的高齡${vp}，${cmp}`,
  (f, vp, cmp) => `享年${f.age}歲，${vp}，${cmp}`,
  (f, vp, cmp) => `${f.y1}年，${f.he}走完了漫長的一生，享年${f.age}歲，${vp}，${cmp}`,
  (f, vp, cmp) => `${f.he}活到了${f.age}歲，${vp}，${cmp}`,
];
const D_YOUTH = [
  (f, vp, cmp) => `才${f.age}歲，${f.he}就${vp}，${cmp}`,
  (f, vp, cmp) => `${f.he}走的時候才${f.age}歲，${vp}，${cmp}`,
  (f, vp, cmp) => `享年${f.age}歲，${vp}，${cmp}`,
  (f, vp, cmp) => `${f.he}只活了${f.age}年，${vp}，${cmp}`,
];
const D_CHILD = [
  (f, vp) => `${f.age}歲那年，${f.he}${vp}。在${f.country}，同年出生的${f.kidw}平均能活到${f.le}歲，${f.he}只走了其中的一小段`,
  (f, vp) => `${f.he}才${f.age}歲，${vp}。${f.country}同年出生的${f.kidw}，平均能走到${f.le}歲，而${f.he}的路停在了這裡`,
  (f, vp) => `享年${f.age}歲，${vp}。本來還有很長的路，在${f.country}，同年出生的${f.kidw}平均能活到${f.le}歲`,
  (f, vp) => `${f.he}只在人世停留了${f.age}年，${vp}。同年出生在${f.country}的${f.kidw}，平均能活到${f.le}歲，${f.he}只來得及走過其中的開頭`,
];
const D_INFANT = [
  (f, vp) => `還不滿一歲，${f.he}${vp}。在${f.country}，同年出生的${f.kidw}平均能活到${f.le}歲，${f.he}只走過了最初的一小段`,
  (f, vp) => `${f.he}在人世停留的時間很短，不滿一歲，${f.he}${vp}。同年出生在${f.country}的${f.kidw}，平均能活到${f.le}歲`,
  (f, vp) => `沒能過第一個生日，${f.he}${vp}。本來，在${f.country}同年出生的${f.kidw}平均有${f.le}歲的光陰在前頭`,
  (f, vp) => `才剛來到世上不久，${f.he}${vp}。${f.country}同年出生的${f.kidw}，平均能活到${f.le}歲，${f.he}只來得及走過開頭`,
];
const D_SUICIDE = [
  (f, vp) => `${f.age}歲那年，${f.he}${vp}`,
  (f, vp) => `享年${f.age}歲，${vp}`,
  (f, vp) => `${f.he}於${f.y1}年離世，享年${f.age}歲，${vp}`,
  (f, vp) => `${f.he}走的那一年是${f.age}歲，${vp}`,
];
const D_NOCAUSE = [
  (f) => `享年${f.age}歲`, (f) => `${f.he}在${f.age}歲時離世`, (f) => `${f.y1}年，${f.he}離開人世，享年${f.age}歲`, (f) => `走完了${f.age}年的人生`,
];

const CMP = {
  longer: [(f, n) => `比${f.country}同年出生的${f.sx}平均多活了約${n}年`, (f, n) => `超過${f.country}同年出生的${f.sx}平均壽命約${n}年`, (f, n) => `比${f.country}同年出生的${f.sx}的平均壽命長了約${n}年`, (f, n) => `多走了約${n}年，超過了${f.country}同年出生的${f.sx}平均壽命`],
  similar: [(f) => `與${f.country}同年出生的${f.sx}平均壽命相當`, (f) => `正好落在${f.country}同年出生的${f.sx}平均壽命附近`, (f) => `壽命與${f.country}同年出生的${f.sx}的平均相去不遠`, (f) => `與${f.country}同年出生的${f.sx}平均壽命只差不到兩年`],
  shorter: [(f, n) => `比${f.country}同年出生的${f.sx}平均少了約${n}年`, (f, n) => `比${f.country}同年出生的${f.sx}的平均壽命短了約${n}年`, (f, n) => `離${f.country}同年出生的${f.sx}平均壽命還差約${n}年`, (f, n) => `少走了約${n}年，沒能活到${f.country}同年出生的${f.sx}平均壽命`],
};

// ---- the last sentence, by shape; `*Fact` pools are added when the life has the fact ----
const CLOSE = {
  infant: [(f) => `這個孩子很小，很輕，卻真真切切地被愛過。`, (f) => `${f.he}沒有來得及長大，卻在家人心裡佔了一個永遠的位置。`, (f) => `願${f.nm}安息，也願留下來的人慢慢好起來。`, (f) => `小小的生命，也是一段完整的人生。`, (f) => `愛${f.he}的人，會把這短短的時光，一直記在心裡。`],
  child: [(f) => `${f.he}的童年很短，卻有人把每一天都記得清清楚楚。`, (f) => `那些還沒來得及長大的夢，就由記得${f.he}的人替${f.he}收著。`, (f) => `願${f.nm}不再疼痛，永遠是被好好抱著的孩子。`, (f) => `留下來的人會說：${f.he}來過，笑過，被很多人愛過。`, (f) => `一個孩子的離開，會讓一個家安靜很久，也讓愛${f.he}的人更懂得珍惜。`],
  youth: [(f) => `太多事情還來不及發生，但已經發生的，都是真的。`, (f) => `這一生很短，卻不是空白。`, (f) => `${f.he}的人生停在最年輕的樣子，讓記得${f.he}的人更捨不得。`, (f) => `願那些沒能完成的事，被身邊的人接著做下去。`, (f) => `${f.he}還沒走完的路，留給記得${f.he}的人，替${f.he}多看一看。`],
  calamity: [(f) => `在被統計成一個數字之前，${f.he}是${f.nm}。`, (f) => `一個人的離開，不該只是新聞裡的一個數字。`, (f) => `${f.he}原本有自己的日子要過，這份被打斷的人生，值得被好好記下。`, (f) => `${f.he}不是統計表上的一格，${f.he}是有名字、有故事的人。`],
  calamityWar: [(f) => `戰爭帶走了許多人，每一個都有名字，${f.he}叫${f.nm}。`, (f) => `願記得${f.he}的人，把${f.he}的名字說得比這場戰爭更久。`, (f) => `戰火終會熄滅，而${f.he}的名字，應該被好好留下。`, (f) => `這場戰爭奪走了${f.he}的日子，卻奪不走${f.he}曾經活過的事實。`],
  calamityDisaster: [(f) => `災難帶走了許多人，每一個都有名字，${f.he}叫${f.nm}。`, (f) => `願記得${f.he}的人，把${f.he}的名字說得比這場災難更久。`, (f) => `廢墟會重建，而${f.he}的名字，應該被好好留下。`, (f) => `這場災難奪走了${f.he}的日子，卻奪不走${f.he}曾經活過的事實。`],
  long: [(f) => `${f.he}的一生很長，長到足以把許多人與事慢慢看盡。`, (f) => `走完這麼長的一程，${f.he}終於可以好好休息了。`, (f) => `漫長的歲月在${f.he}身上留下了痕跡，也留下了許多被${f.he}記得的人。`, (f) => `一生很長，細細數來，值得記的日子比想像的更多。`, (f) => `${f.he}把漫長的歲月，一天一天走得穩穩當當。`],
  hard: [(f) => `日子從來沒有對${f.he}客氣過，${f.he}還是一天一天走完了。`, (f) => `這一生走得吃力，但${f.he}沒有停下。`, (f) => `苦是真的，撐過來的力氣，也是真的。`, (f) => `願${f.he}一路扛過的重量，現在都能放下。`, (f) => `${f.he}沒有被命運討好過，卻仍把一生活成了自己的樣子。`],
  migrant: [(f) => `${f.he}把一個地方帶在身上，也在另一個地方紮了根。`, (f) => `越過了國界，${f.he}終究是被惦記的人。`, (f) => `不論在哪個國家，${f.he}都是別人家裡的某個人，被好好想念著。`, (f) => `從${f.route.home}到${f.route.last}，這一路是${f.nm}自己走出來的。`, (f) => `故鄉在${f.he}心裡，異鄉在${f.he}腳下，${f.he}把兩邊都走成了自己的路。`],
  migrantBack: [(f) => `${f.he}離開過，也回來了；故鄉終究是故鄉。`, (f) => `繞了一大圈，${f.he}還是回到了出生的地方。`, (f) => `走得再遠，${f.he}心裡始終有一個地方在等${f.he}回去。`, (f) => `${f.he}的腳印在別處，也在故鄉。`],
  quiet: [(f) => `這是一段平凡的人生，沒有轟轟烈烈，卻是一日一日實實在在過出來的。`, (f) => `平凡，並不等於不重要。`, (f) => `多數人的一生都是這樣，在日子裡安靜地發光。`, (f) => `${f.he}的名字不會出現在歷史課本裡，但會留在記得${f.he}的人心裡。`, (f) => `一生不必驚天動地，認真活過，就已經很足夠。`],
};
const CLOSE_SUICIDE = [
  (f) => `願${f.he}的痛苦已經止息，也願我們記得${f.he}活過的樣子，而不只是離開的方式。`,
  (f) => `${f.he}值得被好好記得，也值得被更早地接住。`,
  (f) => `${f.nm}的故事不只有最後的那一天，還有許多被愛、也愛過別人的日子。`,
  (f) => `願留下來的人，把這份想念好好說出口，也彼此多問一句：你還好嗎。`,
];
// extra closings when a named person is left behind (only used when the life has the fact)
const CLOSE_KID = [
  (f, k) => `記得${f.he}的人裡，有${k}。`,
  (f, k) => `${k}會把${f.he}的故事，一代一代說下去。`,
  (f, k) => `${f.he}留給${k}的，不只是名字，還有一整段活過的日子。`,
  (f, k) => `只要${k}還記得，${f.he}就沒有真的離開。`,
];

// short forms for the share card (one or two short sentences; the name is already on the card)
const SHORT_OPEN = {
  infant: [(f) => `${f.y0}年生於${f.country}，只在人世停留了很短的時間。`, (f) => `${f.country}的小${f.kidw}，不滿一歲。`, (f) => `${f.y0}年生於${f.country}，被家人抱過、愛過。`, (f) => `${f.y0}年，一個小${f.kidw}來到${f.country}。`],
  child: [(f) => `${f.y0}年生於${f.country}的${f.kidw}，只走了${f.age}年。`, (f) => `${f.country}的${f.kidw}，${f.age}歲，被很多人惦記著。`, (f) => `${f.age}歲的${f.kidw}，來自${f.country}的${f.wealth}人家。`, (f) => `一個${f.country}的孩子，走過了${f.age}個年頭。`],
  adult: [(f, x) => `${f.y0}年生於${f.country}，${x}。`, (f, x) => `生在${f.country}的${f.wealth}人家，${x}。`, (f, x) => `來自${f.country}，${x}。`, (f, x) => `一個${f.country}人，${x}。`],
};
const SHORT_CLOSE = {
  infant: ['被愛著，從頭到尾。', '短短的時光，也值得被記得。', '小小的生命，完整的愛。', '愛${f}的人會一直記得。'],
  child: ['那些沒能長大的夢，由愛${f}的人替${f}收著。', '童年很短，被記得的卻很長。', '被很多人愛過。', '願${f}不再疼痛。'],
  youth: ['這一生很短，卻不是空白。', '太多事還來不及發生。', '被記得，比被統計更重要。', '還沒走完的路，留給記得${f}的人。'],
  calamity: ['在成為數字之前，是一個有名字的人。', '一個人的離開，不只是一個數字。', '願${f}的名字被記得。', '${f}的人生被打斷，卻不該被忘記。'],
  long: ['一生很長，值得記的日子很多。', '走完了漫長的一程，終於能好好休息。', '長長的一生，穩穩地走完。', '把漫長的歲月走得穩穩當當。'],
  hard: ['日子不曾客氣，${f}仍一天天走完。', '苦是真的，撐過來的力氣也是。', '這一生走得吃力，但沒有停下。', '願一路扛過的重量，現在都放下。'],
  migrant: ['把家鄉帶在身上，也在異鄉紮了根。', '走過許多邊界，仍是被惦記的人。', '這一路，是自己走出來的。', '兩邊都走成了自己的路。'],
  quiet: ['平凡，並不等於不重要。', '一日一日，實實在在地過完。', '在日子裡，安靜地發光。', '認真活過，就已經很足夠。'],
  suicide: ['值得被好好記得，也值得被更早接住。', '願痛苦止息，願${f}被好好記得。', '不只有最後一天，還有許多被愛的日子。', '願我們記得${f}活過的樣子。'],
};

export const TEMPLATES = {
  fam: Object.values(FAM), origin: Object.values(ORIGIN),
  edu: Object.values(EDU), work: Object.values(WORK), route: Object.values(ROUTE), hard: Object.values(HARD), keep: Object.values(KEEP), focus: [FOCUS],
  partner: Object.values(PARTNER), kids: Object.values(KIDS), childStage: Object.values(CHILD_STAGE),
  death: Object.values(DEATH).concat([DEATH_SUICIDE]),
  deathLine: [D_ADULT, D_LONG, D_YOUTH, D_CHILD, D_INFANT, D_SUICIDE, D_NOCAUSE], cmp: Object.values(CMP),
  close: Object.values(CLOSE).concat([CLOSE_SUICIDE, CLOSE_KID]),
  shortOpen: Object.values(SHORT_OPEN), shortClose: Object.values(SHORT_CLOSE),
};

// ---------------------------------------------------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------------------------------------------------

const idx = (f, slot, arr) => Math.min(arr.length - 1, Math.floor(hash01(`${f.key}#${slot}`) * arr.length));
const pick = (f, slot, arr) => arr[idx(f, slot, arr)];
const sub = (s, f) => s.replace(/\$\{f\}/g, f.he);

function kidsStr(f) {
  const n = f.kids.names, t = f.kids.total;
  if (t <= 0) return '';
  if (t === 1) return n[0] ? `孩子${n[0]}` : '一個孩子';
  if (t === 2) return n.length >= 2 ? `${n[0]}和${n[1]}兩個孩子` : '兩個孩子';
  if (t === 3) return n.length >= 3 ? `${n[0]}、${n[1]}和${n[2]}三個孩子` : '三個孩子';
  return n.length >= 2 ? `${n[0]}、${n[1]}等${cn(t)}個孩子` : `${cn(t)}個孩子`;
}

function eduClause(f) {
  const { level, years } = f.edu;
  let pool, key;
  if (f.firstUni && (level === 'tertiary' || level === 'graduate')) { pool = EDU.firstUni; key = 'edu-first'; }
  else if (level === 'graduate') { pool = EDU.graduate; key = 'edu-grad'; }
  else if (level === 'tertiary' && f.age < 23) { pool = EDU.tertiaryYoung; key = 'edu-tertY'; }
  else if (level === 'tertiary' && years < 16 && !f.finishedUni) { pool = EDU.tertiaryPart; key = 'edu-tertP'; }
  else if (level === 'tertiary') { pool = EDU.tertiary; key = 'edu-tert'; }
  else if (level === 'secondary' && f.age < 18) { pool = EDU.secondaryYoung; key = 'edu-secY'; }
  else if (level === 'secondary' && years <= 7) { pool = EDU.primary; key = 'edu-pri7'; }
  else if (level === 'secondary' && years < 12) { pool = EDU.secondaryPart; key = 'edu-secP'; }
  else if (level === 'secondary') { pool = EDU.secondary; key = 'edu-sec'; }
  else if (level === 'primary' && years >= 1 && years < 6) { pool = EDU.primaryShort; key = 'edu-ps'; }
  else if (level === 'primary' && years >= 6) { pool = EDU.primary; key = 'edu-pri'; }
  else { pool = EDU.none; key = 'edu-none'; }
  return pick(f, key, pool)(f);
}

function workClause(f) {
  const j = f.jobs;
  if (!j.length) return null;
  if (j.length === 1) {
    return f.yearsWorked >= 10 && hash01(`${f.key}#w1`) < 0.5 ? pick(f, 'work-1l', WORK.oneLong)(f, j[0]) : pick(f, 'work-1', WORK.one)(f, j[0]);
  }
  if (j.length === 2) return pick(f, 'work-2', WORK.two)(f, j[0], j[1]);
  const mid = j.slice(0, Math.min(3, j.length - 1)).join('、');
  return pick(f, 'work-3', WORK.many)(f, j[0], j[j.length - 1], mid);
}

function routeClause(f) {
  const r = f.route;
  if (r.n < 2) return null;
  const ctx = { ...r, b: r.names[1], c: r.names[2] };
  if (r.flight) return pick(f, r.returned ? 'route-fb' : 'route-fl', r.returned ? ROUTE.flightBack : ROUTE.flight)(f, { ...ctx, b: r.returned ? r.names[1] : (r.last !== r.home ? r.last : r.names[1]) });
  if (r.returned) return pick(f, 'route-back', ROUTE.back)(f, ctx);
  if (r.n >= 4) return pick(f, 'route-many', ROUTE.many)(f, ctx);
  if (r.n === 3) return pick(f, 'route-3', ROUTE.three)(f, ctx);
  return pick(f, `route-${r.reason}`, ROUTE[r.reason] || ROUTE.settle)(f, { ...ctx, b: r.last !== r.home ? r.last : r.names[1] });
}

function hardClause(f, skip = new Set(), nth = 0) {
  let seen = 0;
  for (const h of f.hard) {
    if (skip.has(h.id)) continue;
    if (h.id === 'lostChild' || h.id === 'flight') continue; // told in the family sentence / the route
    if (h.id === 'poverty' && (f.shape !== 'hard' || f.age < 35)) continue;
    const pool = HARD[h.id];
    if (pool && seen++ === nth) return { id: h.id, w: h.w, text: pick(f, `hard-${h.id}`, pool)(f, h) };
  }
  return null;
}

function keepClause(f) {
  const k = f.keeps[0];
  if (!k) return null;
  return { id: k.id, text: pick(f, `keep-${k.id}`, KEEP[k.id])(f, k) };
}

function focusClause(f) {
  if (!f.focus || f.age < 20) return null;
  return pick(f, 'focus', FOCUS)(f, f.focus);
}

/** A, the beginning. */
function originSentence(f) {
  f.fam = pick(f, `fam-${f.q}`, FAM[f.q]);
  const kind = f.shape === 'infant' || f.shape === 'child' ? f.shape : 'adult';
  const pool = ORIGIN[kind];
  f.opening = `${kind}:${idx(f, `origin-${kind}`, pool)}`;
  return pool[idx(f, `origin-${kind}`, pool)](f);
}

function lifeClauses(f, budget) {
  // candidates, each { kind, text }, in the order they are told
  const c = { edu: null, work: null, route: null, hard: null, hard2: null, keep: null, focus: null };
  const big = f.age >= 15;
  if (big) {
    const wk = workClause(f);
    const ed = eduClause(f);
    c.edu = f.age >= 18 || f.edu.level !== 'none' ? ed : null;
    c.work = wk;
    c.route = routeClause(f);
    const hc = hardClause(f, f.route.flight ? new Set(['flight']) : new Set());
    c.hard = hc && hc.text;
    const hc2 = hc && hc.w >= 7 ? hardClause(f, f.route.flight ? new Set(['flight']) : new Set(), 1) : null;
    c.hard2 = hc2 && hc2.w >= 7 ? hc2.text : null;
    const kc = keepClause(f);
    c.keep = kc && kc.text;
    c.focus = focusClause(f);
    if (f.shape === 'youth') { c.focus = null; c.keep = f.age >= 22 ? c.keep : null; }
  }
  const order = {
    quiet: ['work', 'focus', 'keep', 'edu', 'route', 'hard'],
    long: ['work', 'focus', 'keep', 'edu', 'route', 'hard'],
    hard: ['hard', 'work', 'edu', 'keep', 'focus', 'route'],
    migrant: ['route', 'work', 'focus', 'hard', 'keep', 'edu'],
    youth: ['edu', 'work', 'hard', 'keep', 'route', 'focus'],
    calamity: ['route', 'hard', 'work', 'edu', 'keep', 'focus'],
  }[f.shape] || ['work', 'edu'];
  if (f.route.flight && c.route && order[0] !== 'route') order.unshift('route');
  else if (c.route && order.indexOf('route') > 1) { order.splice(order.indexOf('route'), 1); order.splice(1, 0, 'route'); }
  // a heavy hardship (war, an early marriage, a child lost) is always told, whatever the tone
  if (c.hard && f.hard.some((h) => h.w >= 7 && h.id !== 'flight' && h.id !== 'lostChild') && order[0] !== 'hard') order.unshift('hard');
  const told = ['edu', 'work', 'route', 'hard', 'hard2', 'keep', 'focus'];
  const chosen = [];
  let used = 0;
  for (const k of order) {
    if (!c[k]) continue;
    if (chosen.length >= 3) break;
    const cost = c[k].length + 1;
    if (chosen.length >= 1 && used + cost > budget && !(k === 'route' && f.route.flight)) continue; // a flight from war is always told, whatever the budget
    chosen.push(k); used += cost;
  }
  if (chosen.includes('hard') && c.hard2) chosen.push('hard2');
  return told.filter((k) => chosen.includes(k)).map((k) => ({ kind: k, text: c[k] }));
}

/** The family sentence as parts in the order told, each with a drop priority (higher goes first when the text is too long). */
function familyParts(f) {
  if (f.age < 15) return [];
  const parts = [];
  const p = f.partner;
  if (p) {
    const pool = f.pstatus === 'widowed' && f.partnerGone != null ? PARTNER.widowedAge : PARTNER[f.pstatus] || null;
    if (pool) parts.push({ k: 'partner', pr: 2, text: pick(f, `partner-${f.pstatus}${pool === PARTNER.widowedAge ? 'a' : ''}`, pool)(f) });
  } else if (f.marriages > 0 && f.divorces > 0) {
    parts.push({ k: 'partner', pr: 2, text: pick(f, 'divorcedgone', PARTNER.divorcedGone)(f) });
  }
  const t = f.kids.total;
  if (t > 0) {
    let pool = KIDS.any, key = 'kids-any';
    if (f.age < 30) { pool = KIDS.young; key = 'kids-young'; }
    else if (f.grown && f.kids.alive > 0 && f.age >= 50) { pool = KIDS.grown; key = 'kids-grown'; }
    parts.push({ k: 'kids', pr: 1, text: pick(f, key, pool)(f, kidsStr(f)) });
    const lost = t - f.kids.alive;
    if (f.grand && f.kids.alive > 0) parts.push({ k: 'grand', pr: 4, text: pick(f, 'kids-grand', KIDS.grand)(f) });
    if (lost > 0) parts.push({ k: 'lost', pr: 3, text: f.kids.alive === 0 ? pick(f, 'kids-lostall', KIDS.lostAll)(f) : pick(f, 'kids-lost', KIDS.lost)(f, lost) });
  } else if (p && ['married', 'widowed'].includes(f.pstatus) && f.age >= 40) {
    parts.push({ k: 'kids', pr: 1, text: f.pstatus === 'widowed' ? pick(f, 'childlessw', PARTNER.childlessW)(f) : pick(f, 'childless', PARTNER.childless)(f) });
  } else if (!p && f.marriages === 0 && f.age >= 40) {
    parts.push({ k: 'partner', pr: 2, text: pick(f, 'nofam', PARTNER.none)(f) });
  }
  return parts;
}

/** Join the parts that are kept: the partner, then the children (and what became of them). */
function familyText(parts, drop) {
  const keep = parts.filter((x) => !drop.has(x.k));
  const partner = keep.filter((x) => x.k === 'partner').map((x) => x.text).join('，');
  const kids = keep.filter((x) => x.k !== 'partner').map((x) => x.text).join('，');
  if (!partner && !kids) return null;
  return partner && kids ? `${partner}；${kids}` : partner || kids;
}

function causeVP(f) {
  const c = f.cause;
  if (!c) return null;
  if (f.suicide) return pick(f, 'death-suicide', DEATH_SUICIDE);
  const pool = DEATH[c.id];
  if (pool) return pick(f, `death-${c.id}`, pool);
  return c.label ? `因${c.label}離世` : null;
}

function compareText(f) {
  const v = f.vs;
  if (Math.abs(v) < 2) return pick(f, 'cmp-similar', CMP.similar)(f);
  const n = Math.round(Math.abs(v));
  return v > 0 ? pick(f, 'cmp-longer', CMP.longer)(f, n) : pick(f, 'cmp-shorter', CMP.shorter)(f, n);
}

function deathSentence(f) {
  const vp = causeVP(f);
  if (!vp) return pick(f, 'death-none', D_NOCAUSE)(f) + '。';
  if (f.suicide) return pick(f, 'd-suicide', D_SUICIDE)(f, vp) + '。';
  if (f.shape === 'infant') return pick(f, 'd-infant', D_INFANT)(f, vp) + '。';
  if (f.shape === 'child') return pick(f, 'd-child', D_CHILD)(f, vp) + '。';
  const cmp = f.country && f.le ? compareText(f) : '';
  const pool = f.shape === 'long' ? D_LONG : f.shape === 'youth' ? D_YOUTH : D_ADULT;
  if (!cmp) return pick(f, 'd-nocmp', pool)(f, vp, '').replace(/，$/, '').replace(/；$/, '') + '。';
  return pick(f, `d-${f.shape}`, pool)(f, vp, cmp) + '。';
}

function closeSentence(f) {
  if (f.suicide) return pick(f, 'close-suicide', CLOSE_SUICIDE)(f);
  const pool = f.shape === 'calamity' ? [...CLOSE.calamity, ...(f.cause.id === 'conflict' ? CLOSE.calamityWar : CLOSE.calamityDisaster)] : [...(f.shape === 'migrant' && f.route.returned ? CLOSE.migrantBack : CLOSE[f.shape])];
  const alive = f.kids.alive > 0 && f.kids.names.length && f.age >= 30 && ['quiet', 'long', 'migrant'].includes(f.shape);
  if (alive) {
    // the child's name is only safe when that child is known to have survived: names are not flagged, so name one only when all lived
    if (f.kids.alive === f.kids.total) {
      const k = f.kids.names.length === 1 ? f.kids.names[0] : `${f.kids.names[0]}和${f.kids.names[1]}`;
      const j = Math.floor(hash01(`${f.key}#close-mix`) * (pool.length + CLOSE_KID.length));
      if (j >= pool.length) return CLOSE_KID[j - pool.length](f, k);
    }
  }
  return pick(f, `close-${f.shape}`, pool)(f);
}

const CHILD_STAGE_FOR = (f) => (f.age <= 2 ? CHILD_STAGE.toddler : f.age <= 5 ? CHILD_STAGE.small : f.age >= 12 ? CHILD_STAGE.teen : f.edu.years >= 1 ? CHILD_STAGE.school : CHILD_STAGE.schoolless);

/** The short version for the share card: at most two short sentences, about 56 characters. */
function shortText(f) {
  if (f.suicide) return sub(pick(f, 'sh-suicide', SHORT_CLOSE.suicide), f);
  const cl = (shape) => sub(pick(f, `sh-close-${shape}`, SHORT_CLOSE[shape]), f);
  const shape = f.shape;
  if (shape === 'infant' || shape === 'child') {
    const open = pick(f, `sh-open-${shape}`, SHORT_OPEN[shape])(f);
    return `${open}${cl(shape)}`;
  }
  // an adult: one fact about the road, one line of closing
  const bits = [];
  if (f.route.n >= 2) bits.push(f.route.flight ? `為躲避戰亂，輾轉到了${f.route.last}` : f.route.returned ? '離鄉多年，終究回到家鄉' : f.route.n >= 3 ? `在${cn(f.route.n)}個國家生活過` : `後來移居${f.route.last}`);
  if (f.lastJob) bits.push(f.jobs.length > 1 ? `從${f.jobs[0]}做到${f.lastJob}` : `做過${f.lastJob}`);
  if (f.kids.total > 0) bits.push(`育有${cn(f.kids.total)}個孩子`);
  if (f.hard[0] && f.hard[0].id !== 'poverty' && f.hard[0].id !== 'lostChild' && bits.length === 0) bits.push('一路走得不輕鬆');
  if (!bits.length) bits.push(f.age >= 60 ? '把日子一天天走完' : '把日子一天天過著');
  const closing = cl(shape === 'calamity' || shape === 'youth' || shape === 'hard' || shape === 'long' || shape === 'migrant' ? shape : 'quiet');
  const fits = (s) => [...s].length <= 56;
  for (const take of [Math.min(2, bits.length), 1]) {
    const x = bits.slice(0, take).join('，');
    const open = pick(f, 'sh-open-adult', SHORT_OPEN.adult)(f, x);
    if (fits(open + closing)) return open + closing;
  }
  const open1 = pick(f, 'sh-open-adult', SHORT_OPEN.adult)(f, bits[0]);
  return fits(open1) ? open1 : closing;
}

const MAX_LEN = 252;

/** Brief version when there is not enough data for the full one (old or imported records). */
function brief(sum) {
  const name = String(sum && sum.name || '無名氏');
  const age = Math.max(0, Math.floor(Number(sum && sum.age) || 0));
  const by = Number(sum && sum.birthYear) || 0;
  const country = sum && sum.homeCountry && sum.homeCountry.name && sum.homeCountry.name !== '未知' ? sum.homeCountry.name : '';
  const head = by ? `${name}，${by}年生${country ? `於${country}` : ''}` : name;
  const text = age < 1 ? `${head}，不滿一歲就離開了人世。願這個孩子被記得。` : `${head}，享年${age}歲。願這段人生被記得。`;
  return { v: EULOGY_VERSION, text, short: age < 1 ? `不滿一歲。被記得，就不算白來一趟。` : `享年${age}歲。被記得，就不算白來一趟。`, shape: 'brief', slots: [] };
}

/** Compose the eulogy of a life summary. Never throws: unusable input gives the brief version. */
export function composeEulogy(sum) {
  try {
    if (!sum || typeof sum !== 'object' || !Number.isFinite(Number(sum.age)) || !sum.name) return brief(sum);
    const f = factsOf(sum);
    // a record that lost its country (the album fills in "未知") or its birth year says too little for a life story
    if (!f.country || f.country === '未知' || !f.y0) return brief(sum);
    const A = originSentence(f);
    const fparts = familyParts(f);
    const D = deathSentence(f);
    const E = closeSentence(f);
    let stage = null;
    if (f.shape === 'child') stage = pick(f, `stage-${f.age <= 2 ? 't' : f.age <= 5 ? 's' : f.age >= 12 ? 'n' : f.edu.years >= 1 ? 'sc' : 'ns'}`, CHILD_STAGE_FOR(f))(f);

    let B = [];
    const assemble = (budget, drop, noB) => {
      const parts = [`${A}。`];
      if (f.shape === 'child') parts.push(`${stage}。`);
      else if (f.shape !== 'infant') {
        B = noB ? [] : lifeClauses(f, budget);
        if (B.length) parts.push(`${f.he}${B.map((x) => x.text).join(B.length > 2 || B.some((x) => x.text.includes('，')) ? '；' : '，')}。`);
        const fam = familyText(fparts, drop);
        if (fam) parts.push(`${fam}。`);
      }
      parts.push(D, E);
      return parts;
    };
    // too long: first tell less of the road, then drop the tail of the family sentence (grandchildren, the lost, the partner), last the road
    const dropOrder = [...fparts].sort((x, y) => y.pr - x.pr).map((x) => x.k);
    let budget = Math.max(0, MAX_LEN - (A.length + D.length + E.length + 40));
    let drop = new Set();
    let noB = false;
    let parts = assemble(budget, drop, noB);
    for (let guard = 0; guard < 40 && parts.join('').length > MAX_LEN; guard++) {
      if (budget > 0) budget = Math.max(0, budget - 10);
      else if (drop.size < dropOrder.length - 1) drop = new Set([...drop, dropOrder.find((k) => !drop.has(k))]);
      else if (!noB) noB = true;
      else break;
      parts = assemble(budget, drop, noB);
    }
    const slots = ['origin', 'death', 'close', ...B.map((x) => x.kind)];
    if (fparts.some((x) => !drop.has(x.k))) slots.push('family');
    return { v: EULOGY_VERSION, text: parts.join(''), short: shortText(f), shape: f.shape, slots, opening: f.opening };
  } catch (e) {
    return brief(sum);
  }
}

/** The eulogy for an album record ({ summary }) or a summary: the stored one when valid, else composed now. */
export function eulogyOf(x) {
  const sum = x && x.summary ? x.summary : x;
  const st = sum && sum.eulogy;
  if (st && st.v === EULOGY_VERSION && typeof st.text === 'string' && st.text.length >= 12 && typeof st.short === 'string') return st;
  return composeEulogy(sum);
}
