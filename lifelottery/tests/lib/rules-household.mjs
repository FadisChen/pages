// Household audit (Phase 6B): does a text put the person in the same room as family members who do not live with them?
//
//   "孩子" at the dinner table, "牽著孩子的手", "哄睡", "接送", "餵" when the children were left with the grandparents; "一起吃飯",
//   "陪著", "抱著" with a partner who works in another country; the same scenes with parents who live abroad from the person.
//
// How it works
//   * householdSnap(s) is added to every snapshot (tests/lib/coherence.mjs `hh`): who the person has and where they live.
//   * the rule finds, in every sentence, a family word (孩子, 兒子, 爸媽, 伴侶, a name ...) of somebody who lives elsewhere and, within
//     a few characters, a "same place" action. Two tiers: STRICT actions (餵, 哄睡, 接送, 床邊, 同住 ... things that only happen under one
//     roof) are wrong for anybody who does not live with the person; PRESENT actions (一起吃飯, 陪著, 牽著, 抱著 ...) are wrong when the
//     person is in another country than the family member (a parent in the same town can be visited).
//   * exemptions the text itself makes: video calls and phone calls, letters and money orders, visits and trips ("回去探望", "放假回家"),
//     memories and wishes, denials ("沒能陪著他").
//
// Also here: migrantStressFor / applyMigrantStress, the `--migrant` option of tools/coherence-scan.mjs: lives that get a partner and
// children and then move abroad alone (labour), with the family, as refugees, as students, and sometimes come back or are joined.

import { ensureHousehold, APART_WHERE, migrate, newPartner, addChild, startJob, setParentsHome } from '../../js/engine/systems.js';
import { BY_CODE } from '../../js/data/countries.js';

const activePartner = (s) => !!s.partner && (s.partner.status === 'married' || s.partner.status === 'dating');

/** What the audit needs to know about the household at the moment a text is written. */
export function householdSnap(s) {
  const hh = ensureHousehold(s);
  const abroad = s.countryCode !== s.homeCountryCode;
  const parentsAlive = (s.family.mother.alive ? 1 : 0) + (s.family.father.alive ? 1 : 0);
  const kids = s.children.map((c, i) => ({ name: c.name, alive: c.alive, age: s.year - c.birthYear, where: hh.kids[i], far: !!hh.far[i] }));
  const partnerApart = activePartner(s) && ((s.partner.status === 'married' && !hh.partner) || !!(hh.sep && hh.sep.partner && !hh.partner));
  return {
    abroad,
    parentsAlive,
    parentsWith: !!hh.parents && parentsAlive > 0,
    partnerApart,
    partnerWith: !!hh.partner && activePartner(s),
    partnerName: s.partner ? s.partner.name : null,
    kids,
    aloneAbroad: !!hh.aloneAbroad,
  };
}

// ---------------------------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------------------------

const KID_WORDS = /孩子們?|小孩|兒子|女兒|寶寶|兒女|子女/g;
const PARENT_WORDS = /爸媽|父母|母親|父親|媽媽|爸爸|雙親|老人家/g;
const PARTNER_WORDS = /伴侶|丈夫|妻子|老公|老婆|枕邊人|另一半|太太/g;

// only possible under one roof (or the same street, for a child): wrong for anybody who does not live with the person
const STRICT = /餵(?!養)|哄(睡|著|孩子|你)|接送|接(孩子|他|她)?放學|送(孩子|他|她)?上學|(坐|守)在床邊|同(住|桌|房)|一起(住|睡|吃(早|午|晚)?(飯|餐))|住在一起|同一個屋簷|半夜(起來|起身|哭醒)|蓋(好)?被子|幫(孩子|他|她)洗澡|拍背|量體溫|守了一夜|揹著(孩子|他|她|寶寶|小)|背著(孩子|他|她|寶寶)|門口等/g;
// being in the same place at the same time: wrong when the person is in another country than the family member
const PRESENT = /陪(著|你|他|她|孩子)|牽著|抱著|擁抱|摟著|握著(你|他|她|孩子)的手|並肩|肩並肩|身旁|一起(吃|用餐|過節|慶祝|生活|度過|散步|旅行|出遊|逛|看電視|聊|煮|洗|出門)|面對面|摸摸|親親|陪伴/g;

// the text says it is not the same place, or not the present
const REMOTE = /視訊|電話|通話|語音|螢幕|手機|傳來|寄來|寄回|匯款|匯了|匯錢|照片|相片|影片|信裡|寫信|越洋|隔著|遠方|那頭|另一端|另一頭|網路|訊息|貼圖|跨國|國界/;
const VISIT = /探視|探望|探親|回去(看|探|過)|回家(探|看|過|鄉)|回鄉|返鄉|回老家|回娘家|飛回|請假回|放假|假期|團聚|重逢|久別|接來|來看你|來探望|來找你|來訪|來住|來玩|暫住|造訪|回國|回到(家|家鄉|老家)|每年回|相聚|終於回|趕回|趕到|分別時|道別|下週見|下次見/;
// a text that is about a visit as a whole (the title or the premise says so) is a visit in every sentence
const VISIT_TEXT = /探視|探望|探親|團聚|返鄉|回鄉|回老家|飛回|請假回|放假回/;
// ceremonies bring everybody together wherever they live
const CEREMONY = /婚禮|喪禮|葬禮|告別式|畢業典禮|典禮|儀式|宴席|喜宴|慶生會|生日派對|滿月|週歲/;
const MEMORY = /想起|回憶|記得|當年|小時候|以前|從前|曾經|過去|夢見|夢到|懷念|思念|想念|多想|好想|真想|多希望|如果|要是|希望|期待|打算|準備|等到|盼|總有一天|將來|以後|有一天|想像|盼著|想著|假裝|彷彿|好像|宛如|長大|攜手|同行|一路(陪|走|扶)|一生|一輩子|走過(一段|漫長|這些)|養育|相伴|終其|離世|過世/; // (the last words: a life told as a whole, the eulogy)
const NEGATED = /(沒能|沒有辦法|沒辦法|無法|不能|來不及|不曾|再也沒|再也不|很少|難得|錯過|缺席|少了|不在|沒有人|沒人|沒有)[^，。；！？]{0,6}$/;
const OTHERS = /(鄰居|別人|同事|朋友|同鄉|客人|老闆|主人|雇主|房東|工友|同學|室友|學生|店家|攤販|對方|對面|隔壁|路人|陌生人|其他|別家|人家)(的|家的)?$/;

// somebody alone abroad: "家人" in the room with them (a generic family word, no name needed)
const GENERIC_FAMILY_SCENE = /(全家(人)?|一家人|家人們?)(都)?(圍|擠|坐|聚在|一起(吃|看|煮|玩|出)|輪流(起床|照顧|守)|在(客廳|餐桌|飯桌|屋裡|門口|床邊|旁邊|身邊)|端來|煮好|熬了|等你|摸著|陪)|和家人(一起|圍|坐)|跟家人(一起|圍|坐)|家人.{0,4}(在你的床邊|坐在旁邊|在門口等)/g;

/** All matches of `re` in `s` as { word, index }. */
function matches(re, s) {
  const out = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = r.exec(s))) { if (m[0] === '') { r.lastIndex++; continue; } out.push({ word: m[0], index: m.index }); }
  return out;
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The family members the person does NOT live with, and how strictly their scenes are checked. */
function apartMembers(hh) {
  const out = [];
  // children: the minors who live elsewhere (and grown-up children who stayed behind abroad)
  const away = hh.kids.filter((k) => k.alive && APART_WHERE.includes(k.where) && k.age < 18);
  const withYou = hh.kids.some((k) => k.alive && k.where === 'with_you');
  if (away.length) out.push({ kind: 'kids', tier: 'present', words: away.map((k) => k.name), generic: !withYou && !hh.kids.some((k) => k.alive && k.where === 'independent'), label: '孩子' });
  // grown-up children with a home of their own: strict scenes only, and only by name (a bare "孩子" may be any child)
  const grown = hh.kids.filter((k) => k.alive && k.where === 'independent');
  if (grown.length) out.push({ kind: 'kids', tier: 'strict', words: grown.map((k) => k.name), generic: false, label: '成年孩子' });
  // parents: abroad apart from them = present tier, same country but not under one roof = strict tier
  if (hh.parentsAlive && !hh.parentsWith) out.push({ kind: 'parents', tier: hh.abroad ? 'present' : 'strict', words: [], generic: true, label: '父母' });
  if (hh.partnerApart) out.push({ kind: 'partner', tier: 'present', words: hh.partnerName ? [hh.partnerName] : [], generic: true, label: '伴侶' });
  return out;
}

export const RULE = {
  id: 'household',
  desc: '同處一地的描寫（一起吃飯、接送、餵、哄睡、陪著、牽著、抱著、坐在床邊…）對象卻是不同住的孩子、伴侶或父母；視訊、電話、探望與回憶不算',
  check(snap, text) {
    const hh = snap.hh;
    if (!hh) return [];
    const members = apartMembers(hh);
    const hits = [];
    const sentences = text.match(/[^。！？!?\n]+[。！？!?]*/g) || [];
    if (hh.aloneAbroad) {
      sentences.forEach((sen, si) => {
        const prevSen = si > 0 ? sentences[si - 1] : '';
        for (const a of matches(GENERIC_FAMILY_SCENE, sen)) {
          if (REMOTE.test(sen) || VISIT.test(sen) || MEMORY.test(sen) || CEREMONY.test(sen) || VISIT_TEXT.test(text) || NEGATED.test(sen.slice(0, a.index))) continue;
          if (REMOTE.test(prevSen.slice(-30)) && /^(你|他|她|孩子|對方|家人)/.test(sen.trim())) continue;
          if (/[「『]/.test(sen.slice(0, a.index)) && !/[」』]/.test(sen.slice(0, a.index))) continue;
          hits.push({ word: a.word, sentence: sen.trim(), why: '獨自在異地，家人卻在身邊' });
          break;
        }
      });
    }
    if (!members.length) return hits;
    sentences.forEach((sen, si) => {
      const prevSen = si > 0 ? sentences[si - 1] : '';
      for (const mem of members) {
        // where are the family words of this member?
        const tokens = [];
        if (mem.generic) tokens.push(...matches(mem.kind === 'kids' ? KID_WORDS : mem.kind === 'parents' ? PARENT_WORDS : PARTNER_WORDS, sen));
        for (const w of mem.words) if (w && w.length >= 2) tokens.push(...matches(new RegExp(esc(w)), sen));
        if (!tokens.length) continue;
        const acts = matches(STRICT, sen).map((a) => ({ ...a, tier: 'strict' }));
        if (mem.tier === 'present') acts.push(...matches(PRESENT, sen).map((a) => ({ ...a, tier: 'present' })));
        if (!acts.length) continue;
        for (const t of tokens) {
          // somebody else's child / parent / partner
          const before = sen.slice(Math.max(0, t.index - 6), t.index);
          if (OTHERS.test(before) || /[是聊談說問提想到](起|到)?$/.test(sen.slice(Math.max(0, t.index - 3), t.index))) continue; // 'topic' words: 聊的不是工作，是孩子
          if (mem.kind === 'kids' && mem.generic && /(班上|學校|附近|別人家|鄰居|同學|學生|街上|路上|公園裡|電視)/.test(sen.slice(Math.max(0, t.index - 8), t.index + 4))) continue;
          for (const a of acts) {
            const gap = a.index >= t.index ? a.index - (t.index + t.word.length) : t.index - (a.index + a.word.length);
            if (gap > 12) continue;
            // the clause between the family word and the action must not be broken by a sentence of its own
            const lo = Math.min(a.index, t.index), hi = Math.max(a.index + a.word.length, t.index + t.word.length);
            const between = sen.slice(lo, hi);
            if (/[。！？]/.test(between)) continue;
            // exemptions
            if (REMOTE.test(sen) || VISIT.test(sen) || MEMORY.test(sen) || CEREMONY.test(sen) || VISIT_TEXT.test(text)) continue;
            if (REMOTE.test(prevSen.slice(-30)) && /^(你|他|她|孩子|對方)/.test(sen.trim())) continue; // "視訊接通了。孩子抱著娃娃…"
            if (NEGATED.test(sen.slice(0, a.index)) || NEGATED.test(sen.slice(0, t.index))) continue;
            if (/[「『]/.test(sen.slice(0, lo)) && !/[」』]/.test(sen.slice(0, lo))) continue; // inside somebody's quotation
            hits.push({ word: a.word, sentence: sen.trim(), why: `${mem.label}不同住（${mem.kind === 'kids' ? hh.kids.filter((k) => k.alive).map((k) => k.name + ':' + k.where).join(' ') : mem.kind === 'parents' ? (hh.abroad ? '父母在家鄉' : '父母不同住') : '伴侶分居'}）：${t.word}…${a.word}` });
            break;
          }
        }
      }
    });
    return hits;
  },
};

// ---------------------------------------------------------------------------------------------
// Migrant stress lives (`node tools/coherence-scan.mjs 3000 x --migrant`)
// ---------------------------------------------------------------------------------------------

const LABOUR_DEST = ['QAT', 'SAU', 'ARE', 'KWT', 'MYS', 'SGP', 'KOR', 'TWN', 'ITA', 'ESP', 'DEU', 'USA', 'CAN', 'GBR', 'JPN', 'ZAF', 'RUS', 'THA'];
const STUDY_DEST = ['USA', 'GBR', 'CAN', 'AUS', 'DEU', 'JPN', 'FRA'];
const REFUGE_DEST = ['TUR', 'DEU', 'UGA', 'KEN', 'POL', 'JOR', 'PAK', 'SWE', 'LBN', 'COL'];

/**
 * The migration plan of life number j (deterministic), or null for a natural life (1 in 8). 7 in 8 lives get a partner and children at a set
 * age and move abroad: labour alone (2 in 8: with children left behind / single), study alone, skilled with the family, refugees with
 * everyone, a couple that lives in two countries; about half of the labour migrants come back, some are joined by the family.
 */
export function migrantStressFor(j) {
  const h = (k) => { let x = (j * 2654435761 + k * 40503) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; return (x ^ (x >>> 15)) >>> 0; };
  const pick = (k, lo, hi) => lo + (h(k) % (hi - lo + 1));
  const dest = (k, list) => list[h(k) % list.length];
  const kinds = [null, 'labour_kids', 'labour_single', 'study', 'skilled_family', 'refugee_family', 'couple_apart', 'labour_kids'];
  const kind = kinds[j % 8];
  if (!kind) return null;
  const plan = { kind, state: {}, kidAges: [], partner: false, parents: false };
  switch (kind) {
    case 'labour_kids':
      plan.partner = true; plan.setup = pick(1, 21, 26); plan.kidAges = [pick(2, 0, 12), ...(h(3) % 2 ? [pick(4, 0, 6)] : []), ...(h(5) % 3 === 0 ? [pick(6, 0, 3)] : [])];
      plan.go = Math.max(plan.setup + 1, pick(7, 28, 38)); plan.mode = 'alone'; plan.dest = dest(8, LABOUR_DEST); plan.back = h(9) % 2 ? plan.go + pick(10, 5, 14) : null; plan.join = !plan.back && h(11) % 3 === 0 ? plan.go + pick(12, 3, 7) : null;
      break;
    case 'labour_single':
      plan.setup = 99; plan.go = pick(1, 20, 32); plan.mode = 'alone'; plan.dest = dest(2, LABOUR_DEST); plan.back = h(3) % 3 === 0 ? plan.go + pick(4, 6, 15) : null; plan.late = h(5) % 2 ? pick(6, plan.go + 2, plan.go + 9) : null;
      break;
    case 'study':
      plan.setup = 99; plan.go = pick(1, 19, 25); plan.mode = 'alone'; plan.dest = dest(2, STUDY_DEST); plan.back = h(3) % 2 ? plan.go + pick(4, 3, 6) : null; plan.late = pick(5, plan.go + 3, plan.go + 8);
      break;
    case 'skilled_family':
      plan.partner = true; plan.setup = pick(1, 24, 29); plan.kidAges = [pick(2, 0, 10), ...(h(3) % 2 ? [pick(4, 0, 5)] : [])];
      plan.go = Math.max(plan.setup + 1, pick(5, 30, 40)); plan.mode = 'family'; plan.dest = dest(6, ['USA', 'CAN', 'AUS', 'GBR', 'DEU', 'SGP', 'ARE', 'NZL']); plan.back = h(7) % 4 === 0 ? plan.go + pick(8, 6, 15) : null;
      break;
    case 'refugee_family':
      plan.partner = true; plan.parents = true; plan.setup = pick(1, 22, 28); plan.kidAges = [pick(2, 0, 12), ...(h(3) % 2 ? [pick(4, 0, 6)] : [])];
      plan.go = Math.max(plan.setup + 1, pick(5, 28, 44)); plan.mode = 'refugee'; plan.dest = dest(6, REFUGE_DEST); plan.back = h(7) % 3 === 0 ? plan.go + pick(8, 5, 12) : null;
      break;
    default: // couple_apart: married, no children yet; one of them works abroad; the other joins after a few years
      plan.partner = true; plan.setup = pick(1, 23, 30); plan.go = Math.max(plan.setup + 1, pick(2, 25, 36)); plan.mode = 'alone'; plan.dest = dest(3, LABOUR_DEST); plan.join = plan.go + pick(4, 2, 6); plan.kidAfter = true;
  }
  return plan;
}

/** Called every year before advanceYear (applyStress in coherence.mjs): set up the family, then move. Silent: the engine's own events tell it. */
export function applyMigrantStress(s, plan) {
  const st = plan.state;
  if (!s.alive) return;
  if (!st.setup && s.age >= plan.setup && s.age < 60) {
    st.setup = true;
    if (plan.partner && !(s.partner && s.partner.status === 'married')) newPartner(s, { status: 'married', replace: true });
    for (const a of plan.kidAges) { const c = addChild(s); c.birthYear = s.year - a; }
    if (plan.parents) setParentsHome(s, true);
  }
  if (!st.went && s.age >= plan.go && plan.dest !== s.countryCode && BY_CODE[plan.dest]) {
    st.went = true;
    if (!s.work.job && plan.kind !== 'study') startJob(s, plan.kind === 'skilled_family' ? 'engineer' : 'construction');
    if (plan.mode === 'refugee') { s.flags.m_refugee = true; s.flags.war = true; }
    migrate(s, plan.dest, { with: plan.mode });
    if (plan.kind === 'study') s.flags.m_student = true;
    s.flags.m_stress = true;
  }
  if (st.went && !st.late && plan.late !== undefined && plan.late !== null && s.age >= plan.late && plan.kind === 'labour_single' && !(s.partner && s.partner.status === 'married')) {
    st.late = true; // a partner met at home or abroad late in the stay, children later: the natural systems take it from here
  }
  if (st.went && plan.join && !st.joined && s.age >= plan.join) {
    st.joined = true;
    if (!s.pending.some((p) => p.id === 'migration_family_joins')) s.pending.push({ id: 'migration_family_joins', atAge: s.age });
  }
  if (st.went && plan.back && !st.back && s.age >= plan.back && s.countryCode !== s.homeCountryCode) {
    st.back = true;
    s.flags.m_returned = true;
    migrate(s, s.homeCountryCode);
  }
}
