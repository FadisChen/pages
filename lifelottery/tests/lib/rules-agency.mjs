// Decision-agency audit (Phase 6A): nobody under 15 gets to make a grown-up's decision.
//
// The user's report: a small child with malaria could decide on their own whether to buy medicine or see a doctor. The engine now has
// decision tiers (h.agency(): infant 0-5, child 6-11, teen 12-17, adult 18+), `decider: 'family'` events (an infant or a child is not
// asked: the family decides and the result is told from the child's side) and `who: 'child'` choices (written from a young person's
// point of view). This module checks that the content respects that:
//
//   * RULE (id `agency`, registered in tests/lib/coherence.mjs RULES): the choice a person under 15 actually made, label and result,
//     must not contain an adult-only act (spending, buying, borrowing, taking someone to hospital, evacuating the family, negotiating,
//     farming decisions, quitting, investing, moving house, signing, paying fees) unless it is child-framed (asking or begging an
//     adult, telling one, hiding, crying, helping, going along) or its choice is marked `who: 'child'`. A sentence whose doer is
//     somebody else ("爸爸借了車，把你送到診所") is not a decision of the child and passes.
//   * staticAudit(): every event with choices, at every age 0-17, in a handful of synthetic lives (poor / rich, village / city, orphan):
//     the offered labels and results at 12-14 (household-head decisions are flagged too), the family results of the events a family
//     decides for under-12s, and for 15-17 the acts that only a grown-up with legal standing can take (loans, contracts, investing).
//   * offeredScan(): plays lives and records every choice card actually shown to somebody under 18 (see tools/agency-scan.mjs).
//
// Nothing here changes the game.

import ALL_EVENTS from '../../js/data/events/index.js';
import { createLife, advanceYear, autoChoose } from '../../js/engine/life.js';
import { makeHelpers } from '../../js/engine/helpers.js';

// ---------------------------------------------------------------------------------------------
// Adult-only acts. `teen: true` acts stay forbidden for 15-17 as well (they need legal standing or a household's authority).
// ---------------------------------------------------------------------------------------------

export const ACTS = [
  { id: 'spend', re: /花(了|掉)?(錢|不少錢|一筆錢|大錢|積蓄|存款)|(買|購買|添購|採買)(了)?(一組|一台|一臺|一些|一批|一袋|一輛|新的|藥|濾|電扇|冰塊|發電機|太陽能|種子|肥料|牲畜|米糧|蚊帳|口罩|機票|車票|房|地|田|手機|柴|瓦斯)|付(了|出)?(錢|款|醫藥費|診療費)|掏錢|出錢|買單/ },
  { id: 'borrow', teen: true, re: /借(了)?(錢|款|貸|車|牛|驢|馬|機車|摩托車|貨車|三輪車|擔架|推車)|向[^，。；]{0,6}借|貸款|借貸|高利貸|周轉|欠(債|款)/ },
  { id: 'medical', re: /送(去|到|往|醫|你去|她去|他去)[^，。；]{0,4}(醫院|診所|衛生所|急診|醫)|帶[^，。；]{0,4}(去|到|往)[^，。；]{0,3}(醫院|診所|衛生所|急診)|看(醫生|醫師|病)|就醫|求診|掛號|驗血|吃完整療程|按時服藥|送醫|立刻動身|(吃|買|拿)藥|療程/ },
  { id: 'evacuate', re: /撤離|疏散|避難|逃難|逃離|帶(著)?(全)?(家人|一家)|全家(人)?(跟著|一起)?(遷|搬|撤|離開|出發)|拖家帶眷|投靠|難民營|收容中心|遷徙|安置/ },
  { id: 'negotiate', re: /談判|協商|據理力爭|討價還價|議價|殺價|講價|交涉/ },
  { id: 'farm', re: /(耕|播|栽|試)種|種(田|作物|地|稻|麥|玉米)|改種|施肥|灌溉|放牧|(賣|買|宰|殺|換)掉?[^，。；]{0,6}(牲畜|牲口|牛|羊)|賣掉[^，。；]{0,6}(田|地)|租(地|田)|耕地/ },
  { id: 'quit', teen: true, re: /辭(職|掉|去)|離職|不幹了|退出(工作|職場)|休學|輟學|退學/ },
  { id: 'invest', teen: true, re: /投資|入股|合夥|創業|開店|開業|集資|標會/ },
  { id: 'move', re: /搬(家|到|去|往|進|離|回)|遷(居|往|到)|移居|移民|定居|租房|遷戶/ },
  { id: 'sign', teen: true, re: /簽(約|名|字|下|署|訂)|合約|契約|同意書|蓋章|公證|立約/ },
  { id: 'selfsupport', re: /自己養活自己|養活自己|自力更生/ },
  { id: 'paperwork', re: /申請|辦(手續|證件)|填(表|寫申請)/ },
  { id: 'fees', re: /繳(費|納|錢|學費|稅)|付(清|學費|費用)|(籌|湊)(到|出|齊)?(學費|醫藥費|費用)|學費/ },
  { id: 'work', re: /(接下|答應|應徵|接受)[^，。；]{0,4}(工作|職位|差事)|去(城裡|城市|工地|工廠|礦|海外)(打工|工作|做工)|出外(打工|工作)/ },
  // household-head decisions: also flagged for a 12-14 year old, even when the sentence is otherwise child-framed
  { id: 'head', teen: true, head: true, re: /做主|當家|一家之主|扛起[^，。；]{0,3}家|撐起[^，。；]{0,4}家|養活(全家|家人)|養家|替(全)?家(人)?(決定|做主|籌|還|付)|為(全)?家(人)?(籌|付|還)|決定(全家|家裡|家人)|帶領(全家|家人)|代替(爸|媽|父|母)/ },
];

/** Words that make a sentence child-framed: the young person asks, tells, hides, cries, helps or goes along; or spends their own pocket money. */
export const CHILD_FRAME = /求|懇求|央求|拜託|請(爸|媽|大人|老師|奶奶|爺爺|叔|姑|舅|姨|伯|鄰居|社區|醫|衛生|助產|村|長輩|家人|親戚|人|他們|她們|對方|警|師傅|朋友)|問(爸|媽|大人|老師|長輩)|告訴|說(給|服)|跟(爸|媽|大人|老師|家人|長輩)|和(爸|媽|大人|老師|家人|長輩)|向(爸|媽|大人|老師|家人|長輩|鄰居|對方)|對(爸|媽|大人)|商量|哭|躲|藏|偷偷|陪|幫(忙|著|爸|媽|家|大人|手)|協助|交給(大人|爸|媽)|等(大人|爸|媽)|讓(大人|爸|媽|老師|長輩)|由(大人|爸|媽)|聽(爸|媽|大人)|跟著|用(自己|零用)|自己(存|攢)的/;

/** Somebody else is the doer: parents, kin, neighbours, helpers, institutions. */
const OTHER_DOER = /他|她|牠|爸|媽|父母|母親|父親|大人|長輩|叔|伯|姑|舅|姨|奶奶|爺爺|阿公|阿嬤|外婆|外公|鄰居|親戚|家人|全家|家裡|他們|她們|村裡|村民|鄉親|醫師|醫生|護理|衛生員|助產士|老師|校長|政府|救援|志工|軍|警|店員|老闆|房東|對方|大家|有人|人們|眾人|哥哥|姊姊|姐姐|兄|姊|手足|師傅|司機|商人|貨車|牧民|族人|社區|鎮上|官員|工人/g;

/** "你" used as a subject (not "帶你", "送你", "給你" ...). */
const SELF_SUBJECT = /(?<![帶送讓給替幫陪對向跟扶背抱拉叫要請把為使令教被逼勸罵看望瞪牽領載拿託餵喚叫抬舉攙])你(?!的|們|被)/g;

function lastIndexOfRe(re, text, end) {
  re.lastIndex = 0;
  let last = -1, m;
  while ((m = re.exec(text)) && m.index < end) last = m.index;
  return last;
}

/**
 * The adult-only acts in `text` that a person of the given age would be taking as their own decision.
 * `age` < 15: every act; 15-17: only the `teen` acts; `head: true` acts are the household-head words (flagged from 12 on, never excused by framing).
 */
export function findActs(text, age) {
  const hits = [];
  const sentences = String(text).split(/(?<=[。！？])/);
  for (const sent of sentences) {
    for (const act of ACTS) {
      if (age >= 15 && !act.teen) continue;
      const re = new RegExp(act.re.source, 'g');
      let m;
      while ((m = re.exec(sent))) {
        // child-framed: look at the clause of the match and the one before it
        const from = Math.max(0, Math.max(sent.lastIndexOf('，', m.index - 1), sent.lastIndexOf('；', m.index - 1), sent.lastIndexOf('：', m.index - 1)));
        const prev = Math.max(0, Math.max(sent.lastIndexOf('，', from - 1), sent.lastIndexOf('；', from - 1), sent.lastIndexOf('：', from - 1)));
        const near = sent.slice(prev, m.index + m[0].length + 4);
        if (act.head && age >= 12) { hits.push({ act: act.id, word: m[0], sentence: sent, why: 'household-head decision' }); continue; }
        if (CHILD_FRAME.test(near)) continue;
        // somebody else is the doer: the closest subject before the match is not "you"
        const before = sent.slice(0, m.index);
        const other = lastIndexOfRe(OTHER_DOER, before, before.length + 1);
        const self = lastIndexOfRe(SELF_SUBJECT, before, before.length + 1);
        if (other > self) continue;
        hits.push({ act: act.id, word: m[0], sentence: sent, why: age < 15 ? 'adult decision' : 'grown-up decision' });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------------------------
// The registry of labels (for the text-level RULE): label -> { who } (true when some choice with that label is marked `who: 'child'`)
// ---------------------------------------------------------------------------------------------

const LABELS = new Map();
for (const ev of ALL_EVENTS) for (const c of ev.choices || []) if (typeof c.label === 'string') {
  const prev = LABELS.get(c.label);
  LABELS.set(c.label, { who: (prev && prev.who) || c.who === 'child' });
}

/** Text-level rule for tests/lib/coherence.mjs: the entry text is `label。result`; only entries that start with a known choice label count. */
export const RULE = {
  id: 'agency',
  desc: '15 歲以下做出大人才能做的決定（花錢、借貸、送醫、撤離、談判、種田、辭職、投資、搬家、簽約、繳費），除非是孩子視角的選項',
  check(snap, text) {
    if (!(snap.age < 18)) return [];
    const cut = text.indexOf('。');
    const label = cut < 0 ? text : text.slice(0, cut);
    const info = LABELS.get(label);
    if (!info || info.who) return [];
    return findActs(text, snap.age).map((h) => ({ word: `${h.act}:${h.word}`, sentence: h.sentence, why: h.why }));
  },
};

// ---------------------------------------------------------------------------------------------
// Static audit: every choice event at every age, in synthetic lives
// ---------------------------------------------------------------------------------------------

/** Synthetic lives of a kind of household (poor village, rich city, orphan ...) moved to a given age. */
function stateAt(kind, age) {
  const cfg = {
    poor: { countryCode: 'NER', urban: false, wealthQ: 1, era: 'past' },
    mid: { countryCode: 'BRA', urban: true, wealthQ: 3, era: 'present' },
    rich: { countryCode: 'DEU', urban: true, wealthQ: 5, era: 'present' },
    orphan: { countryCode: 'IND', urban: false, wealthQ: 2, era: 'present' },
    mother: { countryCode: 'PHL', urban: false, wealthQ: 2, era: 'present' },
  }[kind];
  const s = createLife({ era: cfg.era, drawMode: 'births' }, `agency-${kind}-${age}`, { countryCode: cfg.countryCode, urban: cfg.urban, wealthQ: cfg.wealthQ });
  s.age = age;
  s.year = s.birthYear + age;
  s.work.status = age >= 6 ? 'student' : 'child';
  s.edu.inSchool = age >= 6 && age < 18;
  if (kind === 'orphan') { s.family.mother.alive = false; s.family.father.alive = false; }
  if (kind === 'mother') { s.family.father.alive = false; }
  return s;
}

export const KINDS = ['poor', 'mid', 'rich', 'orphan', 'mother'];

/**
 * @returns {{ flags: object[], checked: number }}  flags: { event, choice, age, kind, part: 'label'|'result'|'familyResult', word, act, sentence, why }
 */
export function staticAudit(events = ALL_EVENTS) {
  const flags = [];
  let checked = 0;
  for (const ev of events) {
    if (!ev.choices || !ev.choices.length) continue;
    const [a, b] = ev.ages || [0, 120];
    for (let age = Math.max(0, a); age <= Math.min(17, b); age++) {
      for (const kind of KINDS) {
        const s = stateAt(kind, age);
        const h = makeHelpers(s);
        const family = ev.decider === 'family' && age < 12;
        ev.choices.forEach((c, i) => {
          let ok = true;
          if (c.cond) { try { ok = !!c.cond(s, h); } catch (e) { ok = false; } }
          if (!ok) return;
          checked++;
          const out = (part, text, hit) => flags.push({ event: ev.id, choice: i, age, kind, part, word: hit.word, act: hit.act, sentence: hit.sentence, why: hit.why, label: c.label });
          if (family) {
            // never shown to the child: the family acts. Only the family result is read, and it must not make the child the doer.
            let r = '';
            try { r = String(typeof c.familyResult === 'function' ? c.familyResult(s, h) : c.familyResult || ''); } catch (e) { r = ''; }
            if (!r) { flags.push({ event: ev.id, choice: i, age, kind, part: 'familyResult', word: '(missing)', act: 'missing', sentence: '', why: 'no familyResult', label: c.label }); return; }
            for (const hit of findActs(r, age)) out('familyResult', r, hit);
            return;
          }
          if (c.who === 'child') return;
          for (const hit of findActs(c.label, age)) out('label', c.label, hit);
          let r = '';
          try { r = String(typeof c.result === 'function' ? c.result(s, h) : c.result ?? ''); } catch (e) { r = ''; }
          for (const hit of findActs(r, age)) out('result', r, hit);
        });
      }
    }
  }
  return { flags, checked };
}

// ---------------------------------------------------------------------------------------------
// Dynamic scan: the choice cards actually shown to somebody under 18
// ---------------------------------------------------------------------------------------------

/** Deterministic life settings for the scan (the ones the orchestrator used: era rotates, seeds `ag<i>`). */
export function scanSettings(i) {
  return { era: ['past', 'present', 'future'][i % 3], drawMode: 'births', pace: 'short', autoChoice: true };
}

/**
 * Play `n` lives with automatic choices and record every choice card shown at an age under 18, and every family decision.
 * @returns {{ cards: object[], family: number, lives: number }}  cards: { event, age, labels[], chosen, seed }
 */
export function offeredScan(n = 1500, { prefix = 'ag' } = {}) {
  const cards = [];
  let family = 0;
  for (let i = 0; i < n; i++) {
    const seed = prefix + i;
    const s = createLife(scanSettings(i), seed);
    let guard = 0;
    while (s.alive && guard++ < 130) {
      const before = s.log.length;
      advanceYear(s, { auto: false, autoFocus: true });
      if (s.age < 12) for (const e of s.log.slice(before)) if (e.kind === 'event' && e.by === 'family') family++;
      while (s.alive && s.flags._choice) {
        const pc = s.flags._choice;
        const age = s.age;
        if (age < 18) cards.push({ event: pc.eventId, age, labels: pc.options.map((o) => o.label), title: pc.title, seed });
        autoChoose(s);
      }
    }
  }
  return { cards, family, lives: n };
}

/** Flags for offered cards: the labels read as the player's own options, so every label is checked with the age's rules (events' `who: 'child'` choices excepted). */
export function auditCards(cards) {
  const byLabel = new Map();
  for (const ev of ALL_EVENTS) for (const c of ev.choices || []) byLabel.set(`${ev.id}|${c.label}`, c);
  const flags = [];
  for (const card of cards) {
    for (const label of card.labels) {
      const c = byLabel.get(`${card.event}|${label}`);
      if (c && c.who === 'child') continue;
      for (const hit of findActs(label, card.age)) flags.push({ event: card.event, age: card.age, label, word: hit.word, act: hit.act, why: hit.why, seed: card.seed });
    }
  }
  return flags;
}
