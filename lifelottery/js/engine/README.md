# 人生籤 engine & data — developer guide

For the UI agent (Phase 2A), the event writers (2B–2D) and QA (3). Everything in `js/engine/` and `js/data/`
is pure ES modules with **no DOM access**; it runs in browsers and in Node 22.

```
js/engine/  rng · birth · mortality · systems · events · helpers · life · summary · focus (Phase 4A) · odds (Phase 4C)
js/data/    countries (generated) · eras · names · causes · conditions · yearly · riskref (generated) · religion · geo · money (Phase 4A) · worldmap (4C)
            events/ index · seed · childhood · youth · adult_work · adult_family · migration · health · aging · world · regional
tools/      fetch-raw · build-data (→ countries.js) · calibrate-risk (→ riskref.js) · coherence-scan · read-life
tests/      data.test.mjs · names.test.mjs · helpers.test.mjs · events.test.mjs · simulation.test.mjs · coherence.test.mjs · focus.test.mjs · culture.test.mjs · pwa.test.mjs · e2e.mjs
            lib/coherence.mjs (the text-vs-state auditor used by coherence.test.mjs and tools/coherence-scan.mjs)
```

## 1. Quick start

```js
import { createLife, advanceYear, choose, autoChoose, serialize, deserialize,
         getPendingChoice, getStatus } from './engine/life.js';
import { describeBirth } from './engine/birth.js';
import { getSummary } from './engine/summary.js';

const s = createLife({ era: 'present', drawMode: 'births', pace: 'standard', autoChoice: false }, seed);
const card = describeBirth(s);                 // data for the lottery reveal card

let r = advanceYear(s);                         // { entries, pendingChoice, died, focusPrompt }
if (r.pendingChoice) r = choose(s, 0);          // index into pendingChoice.options  (or autoChoose(s))
if (r.focusPrompt) setFocus(s, 'study');        // a new life stage: ask the player (or setFocus(s, autoFocus(s)) in auto mode)
localStorage.setItem('lifelottery.save', serialize(s));   // state is plain JSON, rng included
const s2 = deserialize(localStorage.getItem('lifelottery.save'));
if (!s.alive) getSummary(s);                    // review screen / share card / album data
```

`js/main.js` is a complete (if plain) example of the whole loop.

## 2. API reference

### life.js

| Function | Description |
| --- | --- |
| `createLife(settings, seed, opts?)` | New life. `settings`: `era` (`'past'`/`'present'`/`'future'`/`'random'`), `drawMode` (`'births'`/`'population'`), `pace` (`'short'`/`'standard'`/`'long'`), `autoChoice` (bool; a UI hint only). Optional `settings.birthYear` forces the "present" year. `seed` is any string/number: same seed + settings ⇒ identical life. `opts` can force `{ countryCode, gender, urban, wealthQ, birthYear }` (tests, "replay this life"). |
| `advanceYear(state, { auto?, autoFocus? })` | Lives one year. Returns `{ entries, pendingChoice, died, focusPrompt }`. `entries` are the new log entries of this year. If a choice is pending, calling it again returns the same `pendingChoice` and does **not** advance. `auto: true` resolves choices by their `ai` weights and picks the life focus itself at each stage prompt (simulations); `autoFocus: false` keeps the focus alone (tests that force one). `focusPrompt` is true in the year a new life stage starts (see "Life focus"). |
| `FOCI`, `availableFoci(state)`, `setFocus(state, id)`, `autoFocus(state)` | The life focus API, see "Life focus (Phase 4A)" below. |
| `choose(state, optionIndex)` | Resolve the pending choice. `optionIndex` indexes `pendingChoice.options` (not the original `choices` array). Returns `{ entries, pendingChoice: null, died }`. Throws if nothing is pending or the index is invalid. |
| `autoChoose(state)` | Same as `choose`, picking by `ai` weights (seeded, so reproducible). Use it for the "自動抉擇" countdown. |
| `getPendingChoice(state)` | `{ eventId, title, text, options: [{ index, label, hint? }] }` or `null`. Stored in `state.flags._choice`, so it survives save/load. |
| `serialize(state)` / `deserialize(text)` | JSON string ↔ state. `deserialize` validates version, rng, country codes and throws on corrupt data. |
| `getStatus(state)` | Compact read-only snapshot for the life-screen header and the people drawer (name, age, stage, country, stats, partner, children with ages, parents, conditions…). |
| `lifeStage(age)` | `'嬰兒' … '高齡'`. |

New state fields (Phase 4A): `state.religion` (family religion, see "Religion and culture"), `state.focus` (`'balance'` …) and `state.focusHistory` (`[{ age, focus }]`).
Saves from before Phase 4A load without them: `deserialize` sets `focus: 'balance'`, a one-row `focusHistory`, and draws the religion from the seed exactly as a new life would.

`state.settings.era` is the **resolved** era (`'random'` becomes one of the three); the player's original choice is
kept in `state.settings.eraSetting`.

### Log entries (`state.log`, `entries`)

```js
{ age, year, kind: 'year'|'event'|'choice'|'milestone'|'death', title, text, delta? }   // delta: { health: -3, … } actual change
```
* `year` entries are the "平凡的一年" lines (`title` is `"{age} 歲"`; show only the text).
* A major event produces an `event` entry (the situation) when it appears and a `choice` entry (title = chosen label, text = result) after `choose`.
* `h.log(text)` entries have an empty `title`.
* `state.highlights`: `[{ age, year, text }]` — texts do **not** contain the age; render as `"{age} 歲：{text}"`.
* `state.statHistory`: one `{ age, health, happiness, knowledge, wealth, social }` row per year (+ birth row, + a row at death), ready for the SVG curve.

### birth.js (lottery reveal)

* `describeBirth(state)` → `{ name, year, eraName, eraLabel, countryCode, countryName, region, income, city, urban, placeText, genderLabel, wealthQ, wealthLabel, wealthShort, babiesPer100, babiesText, lifeExpectancy, comparisons: [{ key: 'le'|'imr'|'school'|'gdp', label, unit, value, world, higherIsBetter }] }`.
  `eraName` is `過去 / 現在 / 未來`; `eraLabel` is `現在` or the birth year (`1962 年`) and reads as "{eraLabel}出生的 100 個嬰兒…". `babiesText` is ready to drop into "…出生的 100 個嬰兒裡，有{babiesText}和你同國。"
* `babyShare(country, year, mode)` → `{ share, per100, oneIn }`; `babyShareText(...)`.
* `drawCountry(rngState, year, mode)`, `WEALTH_LABELS`, `WEALTH_SHORT`, `GENDER_LABELS`.
* For the spinning-name animation, `COUNTRIES` (`data/countries.js`) has all names.

### summary.js

`getSummary(state)` → `religion { id, label }`, `focus { id, label }`, `focusTimeline` (`[{ fromAge, toAge, focus, label }]`, contiguous segments from birth to the age of death) and `focusYears` (`{ study: 14, … }`), plus: name, ages/years, `cause { id, label, text }`, `suicide` (show help resources when true),
`lifespan { age, countryLe, worldLe, vsCountry, vsWorld }`, `education`, `jobs`, `partner`, `marriages/divorces`,
`children { total, alive, names }`, `countriesLived`, `highlights` (curated: no repeats, one birthday, one "left home", at most `MAX_HIGHLIGHTS` = 12, still chronological), `featuredHighlight` (the most telling one, used by the share card), `counts { choices, events, milestones, years }`,
per-stat `stats { peak, peakAge, mean, final }` and `statHistory`. `STAT_LABELS`, `EDU_LABELS`, `curateHighlights(raw, max?)`, `featuredHighlight(list)` are exported. The life state keeps the raw highlight list (`state.highlights`); only the summary is curated.

### Other exports worth knowing

* `eras.js`: `eraView(country, year)` (era-adjusted statistics), `worldView(year)`, `ERA_LABELS`, `presentYear()`.
* `mortality.js`: `lifeTable(country, sex, year)` (`.q[age]`, `.e0`), `remainingLife(table, age)`, `causeLabel(id)`.
* `systems.js`: `JOBS` (id → `{ name, … }`), `EDU_LEVELS`, `STAT_KEYS`.
* `events.js`: `EVENTS`, `getEvent(id)`, `validateEvents(list)`, `TUNING` (majorRate, regularCounts, maxEntriesPerYear, maxRepeats, nullWeight, …).

### Feed shaping (events.js)

`runEvents` keeps the log readable: at most `TUNING.maxEntriesPerYear` (3) entries per calendar year (system lines count, a choice's result does not); a repeatable event never tells the same text twice in a life (`again` text, then short echoes), fires at most `max` / `TUNING.maxRepeats` times; "平凡的一年" lines are not reused while an unused one fits the life state. `tests/coherence.test.mjs` measures the result.

## 3. Life focus (Phase 4A, PLAN 4.2)

`js/engine/focus.js` holds the whole feature; every number is in `FOCUS_FX` (system effects) and `FOCUS_EVENT_MULT` (event weights).

```js
import { FOCI, availableFoci, setFocus, autoFocus } from './engine/life.js';
FOCI            // [{ id, label, desc, ages: [min, max] }]  balance 0-120 · study 6-30 · work 15-120 · family 16-120 · health 0-120 · self 10-120
availableFoci(s)       // the foci open at the person's age
setFocus(s, id)        // illegal / unknown id -> 'balance'; writes state.focusHistory (a change in the same year replaces the row); clears the prompt; returns the focus now in effect
autoFocus(s)           // a plausible focus for the age, circumstances and money; a hash of the life (no random numbers used), so calling it twice gives the same answer
```

* **Stage prompts**: in the year the person turns 6, 12, 18, 25, 40 or 60, `advanceYear` returns `focusPrompt: true` and sets `flags._focusPrompt` (so a reload still asks). `setFocus` clears it; so does the next `advanceYear`. In auto play (`advanceYear(s, { auto: true })`) the engine calls `setFocus(s, autoFocus(s))` itself; a UI with the "自動抉擇" switch should do the same after its countdown. `getStatus(s)` has `focus`, `focusLabel`, `foci` (`[{ id, label, desc }]` open now) and `focusPrompt`.
* A focus that is no longer open (study after 30) lapses to `balance` in `advanceYear`, with a history row.
* **Effects** (all small; the stats mean-revert, so a nudge settles at roughly 3-4 times its size):

  | focus | yearly stat nudge | system probabilities | tags that get likelier (x1.2-1.8) |
  | --- | --- | --- | --- |
  | study | knowledge +1.0, happiness -0.6, social -0.6 | school dropout x0.8, university after secondary x1.25, enrolment x1.12, 4.5 %/yr of 18-30 y/o outside school return to education, relationships/marriage ~1 year later, births x0.8 | school education study exam learning books research mentor language talent |
  | work | health -0.5, social -0.4 (health target -1.5) | income percentile target +0.06 (about +10 % income), layoffs x0.8, career moves x1.25, retirement x0.75, divorce x1.15, births x0.8, mortality +3 % | work job career money trade labor business office skilled |
  | family | social +1.3, happiness +1.0 | relationships/marriage ~1 year earlier, break-up and divorce x0.8, births x1.25, income target -0.025 | family love marriage children parenting pregnancy siblings grandchildren caregiving home parents |
  | health | health +0.9, happiness +0.2 (health target +2) | chronic-condition onset x0.88, smoking start x0.75, quitting x1.25, income target -0.012 | exercise checkup lifestyle habit screening vaccine diet wellness (illness / accident / chronic / addiction tags x0.8-0.88) |
  | self | happiness +1.5, knowledge +0.3 | income target -0.018, births x0.9 | hobby travel creative art fun play reflection identity independence music sports |

  Measured on 3000 lives each (same seeds, focus forced every year it is open; `tests/focus.test.mjs` repeats the direction checks on 2000): study +0.85 school years at 30 and university share 24 % -> 36.5 %; work +15 % income at 30-50, -1.3 years of life, health 74 vs 77 at 40; family 2.39 vs 2.27 children per life, social +7.5 and happiness +5 at 40; health +1.3 years of life, health stat +5 at 40; self happiness +6 at 40. The automatic choice has the same mean lifespan as `balance` (66.5). `work` has no effect once retired.
* **Event weights**: `focusEventMult(focus, tags)` multiplies the weights of all matching tags and clamps the product to 0.6-1.8; `events.js` applies it to a weight and to a `chance` milestone. Tags are free-form, so the table lists the vocabulary above; when you write an event give it the tags of what it is about (`hobby`, `travel`, `creative`, `art` for self; `exercise`, `checkup`, `diet`, `lifestyle`, `habit`, `wellness`, `vaccine`, `screening` for a health habit; `illness`, `accident`, `chronic`, `addiction`, `disease` for trouble; `career`, `job`, `work`, `business`, `money` for work; `education`, `school`, `exam`, `study`, `learning` for study; `family`, `love`, `marriage`, `children`, `parenting`, `pregnancy`, `siblings`, `caregiving`, `home`, `parents` for family). `tests/focus.test.mjs` checks that every focus favours at least 15 events and that 70 % of all events react to some focus. `h.focus()`, `h.isFocus(...ids)`, `h.focusLabel()` are available to events.
* **Balance**: the health focus buys about 1-2 years of life, not more; `tools/calibrate-risk.mjs` runs with the automatic focus choice, so the normalised mean lifespan still equals the country's life expectancy.

## 4. One tick (`advanceYear`)

0. (Phase 4A) The follow-up phase runs three times in the event pass: before the milestones, after them and after the regular events, so a follow-up scheduled `inYears: [0, 0]` by an event of this year (2020 pandemic -> remote school) fires in the same year (subject to the 3-entries budget; the rest moves to next year). A milestone that is only postponed to next year (because another choice event took the slot) keeps its condition check (`pending[].recheck`).
1. **Survival**: the person dies during the year `age → age+1` with probability `q(age) × personalMultiplier`.
   On death the cause is drawn and `death = { age, year, causeId, causeText }` is recorded; `age` is the number of completed
   years (享年). Resolving death *before* the age increment keeps events and systems of the fatal year from ever running.
2. `age++`, `year++`.
3. **Systems** (`systems.js`): parents/partner/children age and die → schooling → smoking → chronic conditions → work/retirement →
   love/marriage/divorce → fertility → income percentile & wealth → health/happiness/social/knowledge drift.
4. **Events** (`events.js`): due follow-ups → `chance` events → 0–2 regular weighted events → at most one major event (choice).
5. If nothing notable happened, a "平凡的一年" line is added (`data/yearly.js`).
6. A `statHistory` row is appended.

Mortality: Gompertz–Makeham tables calibrated by bisection so that cohort life expectancy equals the country's era-adjusted
`le[sex]`; ages 0–4 use `imr` / `u5mr`. The personal multiplier (health vs. age norm, wealth, smoking, conditions, `riskMult`,
temporary `addRisk`s, early-childhood family wealth) is **normalised** by `data/riskref.js` (mean raw multiplier per income group × gender × **era** × 5-year age bin, keys like
`'HF@past'`), so mean lifespan stays at the country's life expectancy while individuals differ (after the Phase 3A calibration: past −0.3, present 0.0, future +0.1 years over 6000 lives per era;
individual countries within about ±1 year). **Regenerate `riskref.js` after changing systems, conditions or any
event risk effect**: `node tools/calibrate-risk.mjs [lives] [passes]` (the Phase 3A table was made with `45000 4`, ≈ 10 min; sparse old-age bins stay noisy, only the mean matters).

Wealth is a 0–100 stat: half the person's income percentile in their country, half the (log) absolute income in
international dollars. `h.change('wealth', d)` also shifts the underlying percentile, so a shock persists.

## 5. Writing events

Each `js/data/events/*.js` exports `default [ ...events ]`. Ids are globally unique, `snake_case`, and **must start with the file's
prefix**: seed `seed_`, childhood `childhood_`, youth `youth_`, adult_work `work_`, adult_family `family_`, migration `migration_`,
health `health_`, aging `aging_`, world `world_`, regional `regional_`. Start from the patterns in `seed.js` (its header lists them).

```js
{
  id, title, ages: [min, max],        // inclusive; default [0, 120]
  weight: 1 | (s, h) => number,       // relative weight in the regular/major draw (0 = follow-up only)
  chance: 0.04,                       // if set: independent yearly probability when eligible (milestones, calendar events)
  once: true,                         // default true; false + cooldown: N years between repeats
  cooldown: 0,
  major: false,                       // having `choices` implies major
  milestone: false,                   // log kind 'milestone' (and shown prominently by the UI)
  tags: [],                           // free-form, for authors/QA
  cond: (s, h) => boolean,
  text: (s, h) => string | string,    // 60–160 chars, second person, zh-Hant
  effects: { happiness: -3 } | (s, h) => void,     // keys: health happiness knowledge wealth social
  set: ['flag'], unset: ['flag'],
  schedule: [{ id: 'other_event', inYears: [0, 2], p: 0.8 }],   // follow-ups, fire regardless of cond/ages; optional `p` = probability that it
                                       // is queued at all. On an event with `choices` this is queued when the choice is resolved
                                       // (together with the chosen option's own `schedule`)
  followCond: (s, h) => true | false | 'wait',   // on the FOLLOW-UP event: checked when it comes due. false = drop it silently (the child
                                       // left school meanwhile), 'wait' = try again next year (a treatment that exists from year X)
  again: 'text' | (s, h) => text,     // used instead of `text` when a repeatable event would repeat its text word for word
  max: 3,                             // a repeatable event fires at most this often per life (default TUNING.maxRepeats)
  highlight: true | 'text' | (s, h) => text,       // end-of-life "重要時刻"
  choices: [{                          // 2–3 options
    label, hint?,
    cond: (s, h) => boolean,           // option hidden when false
    effects, set, unset, schedule, highlight,
    result: 'text' | (s, h) => text,   // evaluated AFTER effects, so it may describe the outcome
    ai: 1 | (s, h) => number,          // weight for auto-choice
  }],
}
```

For an event with `choices`, event-level `effects`, `set` and `unset` apply when the situation is presented (its log entry carries the delta) and event-level `schedule`
when the choice is resolved.

Rules enforced by `tests/events.test.mjs` (3000 random states): `cond`, `text`, `result`, `ai`, `weight`, `highlight` must not throw
and strings must be non-empty without `undefined`/`NaN`. Therefore **write total functions**: use `h.partnerName()` (returns `'對方'`
if single) rather than `s.partner.name`; `h.childName(0)` returns `'孩子'`. `text` is evaluated before `effects`.
Direct state edits are allowed in function effects (`s.stats`, `s.flags`), but prefer helpers. Never offer suicide as a choice.
Call helpers as methods: `h.chance(0.3)`, never destructure.

### Helpers (`h`, all 138)

* **Randomness**: `rand() chance(p) pick(arr) between(a,b) randInt(a,b)` (seeded; reproducible).
* **Time**: `age() year() birthYear() era() yearIn(a,b) ageIn(a,b)`.
* **Life focus**: `focus() isFocus(...ids) focusLabel()`.
* **Country / statistics**: `country() homeCountry() stats() countryName() income() incomeAt() incomeAtLeast(g) region() isRegion(...r) byIncome({L,LM,UM,H}) city() urban() setUrban(bool) setCity(name?) isMigrant() hasLivedIn(code)`.
  `stats()` is the era-adjusted statistics record of the current country for the current calendar year (`le`, `imr`, `school`, `gdp`, …).
  `income()` is the country's World Bank group **today** (static); `incomeAt()` is the group in the **current calendar year**, derived
  from the era GDP per head (`eras.js: incomeGroupAt`): South Korea in 1975 is `'LM'`, most countries are a group higher in 2060 than now, and in the
  present year it always equals `income()`. `byIncome` now picks by `incomeAt()` (so descriptions of living conditions follow the era) and falls back
  to the nearest defined group: `h.byIncome({ L: '…', H: '…' })`. Use `income()` / `incomeAtLeast()` in `cond` for "what kind of country is this".
  `setUrban(true|false)` moves between countryside and city inside the current country; `setCity()` picks a random city of the country, `setCity('台北')`
  sets a name. (`migrate()` also moves you to a city of the new country and makes you urban with probability 0.85.)
* **Identity & situation**: `stat(k) female() male() gender() wealthQ() annualIncome() isRich() isPoor() inSchool() inTertiary() eduLevel() eduAtLeast(level) eduYears() employed() unemployed() retired() workStatus() job() jobName() isJob(...ids) married() hasPartner() partnerStatus() partnerAge() yearsMarried() hasChildren() childCount() youngestChildAge() siblings() parentAlive('mother'|'father') parentsAlive() isSmoker() hasCondition(id) has(flag) flag(name) yearsSince(eventId) seenEvent(eventId) recentLog(titleOrKind, years?) stable(key, p)`.
  * `inTertiary()`: studying at university level or beyond right now (`inSchool() && eduYears() >= 12`).
  * `recentLog('母親過世' | ['母親過世', '父親過世'] | 'milestone', years = Infinity)`: the most recent log entry whose **title or kind** matches, at most `years` years ago, or `null`.
    Use it instead of scanning `s.log` in `cond`/`weight`.
  * `stable(key, p = 0.5)`: a deterministic per-life coin flip. The same life and `key` always give the same answer, and **no random numbers are consumed**, so it is safe
    in `cond` and several events can agree on "was this person affected by the 2004 tsunami" (use one key per question). `p <= 0` is always `false`, `p >= 1` always `true`.
* **Consistency helpers (Phase 3B)**: events must not contradict each other or the state, so prefer these over writing the assumption into the text.
  * `wageEarner()`: employed by someone else (`work.status === 'employed'`); `employed()` also covers the self-employed. Use it for 同事／上司／薪水／下班／公司。 `officeJob()`: a desk job (會議室、辦公室).
  * `familyBusiness()`: does the family run a shop/stall (decided once per life, only quintiles 2–4, about a third of them)? Gate "家裡的小店" on it.
  * `parentsLabel()`: `'爸媽' | '媽媽' | '爸爸' | '身邊的大人'` for whoever is alive; `partnerHe()` / `childHe(i)` give 他／她 (the child form falls back to `'孩子'`).
  * `grandchildren()` / `hasGrandchildren()` / `expectedGrandchildren()`: number of grandchildren (0 until the milestone 「當了祖父母」), so "孫輩" is only written once they exist.
  * `techReady(baseYear)`: has a technology that appeared in the rich countries in `baseYear` (smartphone 2008, mobile phone 1995, web 1995 …) reached this person? Later for poorer countries and the countryside (`techLag` in helpers.js; the auditor uses the same function).
  * `yearsAbroad()`: years since the last move to another country (`Infinity` if never). `displaced()`: currently displaced by war or disaster (flag `displaced` set by the "leave home" events, lapses after 6 years or when they return/resettle).
  * `byLiving({ L, LM, UM, H })`: like `byIncome`, for **narration only** (never for effects, so the calibration is unaffected): one group up for a rich household (quintile 5 as a child, wealth ≥ 75 as an adult), one down for a poor one, never the village (`L`) version for a city dweller.
* **Religion & culture (Phase 4A)**: the religion/tradition of the **family**, which stays with the person wherever they live.
  `religion()` (`'christian' | 'muslim' | 'hindu' | 'buddhist' | 'folk' | 'jewish' | 'sikh' | 'none' | 'other'`), `isReligion(...ids)`, `religionLabel()`, `byReligion({ muslim: '…', christian: '…', _: '…' })` (fallback key `_` or `default`, else `''`; **always give a `_` when the text is used outside a `cond` that guarantees the religion**: `text` is also called in the random-state tests),
  `festival()` (the main festival of the family: 農曆新年, 開齋節, 宰牲節, 排燈節, 德賽節, 聖誕節, 復活節, 潑水節, 新年 … from the religion and the **home** country), `festivalInfo()` (`{ name, key, dish }`), `festivalKey()`, `lunarNewYear()` (the family keeps 農曆新年: use this, not `isRegion('EAS')`), `hostFestival()` (the main festival of the majority religion where the person lives now, or `null` when it is the family's own), `religionIsMinority()`, `worshipPlace()` (教堂 / 清真寺 / 神廟 / 寺廟 / 佛寺 / 廟 / 猶太會堂 / 錫克教寺廟),
  `festivalScene(kind?)` (60-160 characters of the family's festival for `'child' | 'adult' | 'elder'`, default by age; adds a line for someone living abroad and one that notices the neighbours' own festival), `drinks()` (stable per life: unlikely in Muslim families, less likely for women), `playsSports()` (stable per life: likelier for the young and for men, rare for the mother of several children).
* **Geography (Phase 4A)**: `place()` → `{ coast, alt, climate }`; `coastal()`, `climate()` (`'tropical' | 'arid' | 'temperate' | 'continental' | 'polar' | 'highland'`), `altitude()` (`'low' | 'mid' | 'high'`), `highAltitude()` (>= 1,500 m), `snowy()` (continental, highland or polar), `hotClimate()` (tropical, arid or continental), `byClimate({ tropical, arid, temperate, continental, highland, polar, _ })` (falls back highland -> continental -> temperate …). Rural people take the coast and altitude of the nearby city and the **country's dominant climate**. Data: `data/geo.js` (every city of `countries.js`; a test fails when a city has no annotation).
* **Money (Phase 4A)**: `money(usdPpp, { round? })` → natural zh-Hant amount in the local currency of the current country and year: `h.money(2000)` -> `新台幣四萬元`, `h.money(200)` -> `2.5 萬日圓` in Japan, `300 美元`, `1,200 奈拉`. `usdPpp` is in constant 2011 international dollars (the unit of `h.annualIncome()`): use `h.money(h.annualIncome() / 12 * 2)` for "twice a month's pay". `round`: omitted = a natural figure with at most two significant digits, `false` = exact units, a number = multiple of that many local units. Euro-area countries show their old currency before they joined. All PPP factors, inflation and currency names are estimates (`data/money.js` header).
* **Changes**: `set(flag, v=true) unset(flag) inc(flag, n=1) change(stat, delta) addWealth(d) addCondition(id) removeCondition(id) startJob(id) loseJob() retire() dropOut() enroll(level?) reenroll() startSmoking() quitSmoking() setPartner({name,gender,age,status}) newPartner({gender?,status?,age?}) endRelationship(years?) marry() divorce() addChild({gender}) migrate(code) addRisk(mult, years?) log(text, title?) highlight(text) die(causeId)`.
  * `newPartner({ gender?, status: 'dating' | 'married' = 'dating', age? })`: creates the partner (name from the person's own culture group; migrants and multi-group countries
    sometimes pair across groups; age near the person's; `gender` defaults to the usual mix incl. a small same-sex share) and returns the record. If the person already has an active partner
    nothing changes and that partner is returned (end the relationship first). `setPartner({})` without a `name` now uses it too, instead of "他"/"她".
  * `endRelationship(years?)`: ends a **dating** relationship (`divorce()` for a marriage): clears the partner, resets the private plan flags (`_dateAt`, `_marryAt`: the next relationship and the wedding move
    back) and starts a cooldown of `years` (default 2–4) during which the yearly systems start no new relationship. Returns `true` if there was one.
  * `enroll(level?)` / `reenroll()`: put someone who is not in school back into education (night school, second chance). `level` is `'primary' | 'secondary' | 'tertiary' | 'graduate'`
    (default: the next level above their current one); returns `false` if they already study or already have that level. The yearly system then carries them through (≈ 2 school years per
    calendar year below university, 1 above; 6 % yearly chance to drop out), adds knowledge, and logs the diploma milestone when the level is reached; the event supplies its own narrative.
    A person with a job keeps it while studying.
  `die` is for wars/disasters only (`'disaster'`, `'conflict'`, …; ids in `data/causes.js`). A death caused inside an event's effects is logged **after** the event's own
  narrative (the engine moves the `death` entry behind it). `addRisk(m)` is permanent, `addRisk(m, n)` lapses after *n* years.
  Job ids: see `JOBS` in `systems.js`; condition ids: `data/conditions.js`.
* **Names**: `name() givenName() partnerName() childName(i=0) lastChildName() motherName() fatherName()`.

Useful flags set by systems (read with `h.has`): `orphan`, `migrated`, `war` (set it yourself to raise conflict mortality). Flags beginning with `_` are
engine-private — do not read or write them from events.

## 6. Data modules

* **countries.js** (generated by `tools/build-data.mjs`): 173 countries/territories ≥ 500k people covering 99.9 % of humanity. Fields per the PLAN plus `pop1970` and
  `marryAge {F,M}`. The header documents every source and year; `est: [...]` lists fields that are estimates for that country (`tertiary`, `road`, `childMarriage`,
  `homicide` are estimates everywhere). Re-run `node tools/fetch-raw.mjs && node tools/build-data.mjs` to rebuild.
* **eras.js**: anchors 1970 / present / 2050 interpolated by calendar year (`eraView`). 1970 uses real `le1970`, `imr1970`, `pop1970`; the rest are documented models.
  Birth years: **past 1955–1990** (uniform), present = this year, **future 2040–2070**. Years before 1970 continue the 1970→1985 trend backwards and years after 2050 the 2035→2050 trend
  forwards (damped, clamped to plausible bounds, frozen before 1950 / after 2090), so life expectancy, IMR, TFR, schooling, GDP … exist for every year. GDP and population interpolate
  geometrically (fast growers on a concave path); `GDP1970` holds hand-set 1970 incomes for economies the generic model misrepresents (Korea, Taiwan, China, oil states …).
  `incomeGroupAt(country, year)` classifies the era GDP into `L/LM/UM/H` (what `h.incomeAt()` returns).
* **names.js**: 104 language / culture **groups** (≥ 25 male, ≥ 25 female, ≥ 25 family names each; `syll` groups have no family names), see below.
* **causes.js**: 22 cause categories (+ `disaster` for `h.die`), base tables by income × age band, country/personal modifiers.
* **yearly.js**: "平凡的一年" templates — add lines freely (260 now, 80+ in Phase 3B, 76 more in Phase 4A for narrow states: childless widowed migrant, displaced adult, chronic illnesses, unemployed over 45, single parent, carer, rural elder, high-income retiree, climate/coast/altitude, daily religious life …); shape documented in the file header. `tests/culture.test.mjs` checks that the pool for each of those states has at least 12 lines.
* **religion.js** (Phase 4A, estimates): `COUNTRY_RELIGION` (Pew-style national shares, all 173 countries), `GROUP_RELIGION` (culture groups whose religion differs from their country: Hausa -> Muslim, Igbo -> Christian, Punjabi in India -> Sikh …), `drawReligion(code, group, era, u)` (the "none" share is smaller in the past, larger in the future), `majorityReligion(code)`, `festivalFor(religion, homeCode, region)`, `festivalScene(info, homeCode, region, kind)`, `worshipPlace`. The family religion is drawn at birth from a hash of the seed (no random numbers), stored in `state.religion`, copied to every child (`child.religion`).
* **geo.js** (Phase 4A, estimates): `GEO[code]` = `[{ name, coast, alt, climate }]` in the order of `countries.js` `cities`, `DOMINANT_CLIMATE[code]`, `placeGeo(code, city, urban)`. 492 cities: 220 coastal / 272 inland; 371 low, 86 mid, 35 high; tropical 172, temperate 111, arid 87, continental 85, highland 36, polar 1.
* **money.js** (Phase 4A, estimates): `moneyText(code, year, usd, opts)`, `currencyOf`, `priceIndex`, `zhNumber`, `niceRound`.

### Names (`data/names.js`)

Each group (`GROUPS[key]`: `zh_hans`, `zh_hant`, `ja`, `ko`, `hi`, `bn_hi`, `ta`, `ha`, `yo`, `ig`, `am`, `sw`, `ar_gulf`, `de`, `fr`, `it`, `es_la`, `pt_br`, `en_us` …) carries the naming conventions of its culture:
`order` (`'family'` first for Chinese, Japanese, Korean, Vietnamese, Khmer, Mongolian, Hungarian), `mode` (`normal`; `patro`: the second name is the father's given name, Amharic / Oromo / Tigrinya / Somali / Malay with
"bin/binti" / Tamil; `syll`: two given-name words and no family name, Burmese and Bhutanese; `ko`: hangul with hanja), `forms` (gendered surnames `Ivanov|Ivanova`), `mid` (Sikh Singh/Kaur), `singleP` (share of
Indonesians with a single name), `maiden` (the mother keeps her own family name). `COUNTRY_GROUPS[code]` is a list of `[group, probability]` (population shares): Nigeria → Hausa / Yoruba / Igbo,
India → Hindi-belt / Urdu / Marathi / Telugu / Bengali / Tamil / Gujarati / Kannada / Malayalam / Punjabi, Switzerland → German / French / Italian, Singapore → Chinese / Malay / Tamil / English, …
Every country must map to existing groups (`tests/names.test.mjs`).

* A life draws its group once (`flags._pool`) and its name tokens (`_gt` given, `_ft` family). Parents are named from the same group (patronymic: the father's given name *is* the player's second name).
* Partners come from the person's own group (≈ 92 %; migrants ≈ 50 % from a group of the host country), see `flags._partnerPool`.
* **Children always get names from the family's culture** (the person's group), wherever they live: the family-name token comes from the father (the person or the same-culture partner; patronymic cultures use his given name).
* API: `makeName(group, gender, rng, familyToken?)`, `composeName`, `drawGroup(countryCode, rng)`, `childFamilyToken(group, father)`, `getPool(key)` (old save keys like `zh`, `af_w` are translated).

## 7. Tests & tools

```
cd lifelottery && npm test                 # or: node --test lifelottery/tests/*.test.mjs   (from the repo root)
node --test tests/focus.test.mjs        # life focus: API, legality by age, prompts, old saves, effect directions on 2000 lives (LL_FOCUS_N=800 for a quick run)
node --test tests/culture.test.mjs      # religion, festivals, city geography, local money, pandemic timing, narrow-state ordinary years, the new coherence rules
# coherence rules added in Phase 4A (tests/lib/coherence.mjs): `festival` (a festival or religious word must fit the family's tradition; 農曆新年 only where `lunarNewYear()`), `climate` (snow needs a snowy climate, typhoons / sea level / going to sea need a coast), `drink` (no beer or toasts for a family that does not drink); the toddler rule now catches "你學會的第一個長句子" from age 4
LL_SIM_N=1000 node --test tests/simulation.test.mjs    # quicker run (statistical tolerances get noisy below ~1000 lives)
node tools/calibrate-risk.mjs [lives] [passes]          # regenerate data/riskref.js
node tools/read-life.mjs --seed=x --country=NPL --religion=hindu --focus=work --city=比拉特納加   # print one whole life (also --era --gender --urban --wealth --birthYear)
node tools/fetch-raw.mjs && node tools/build-data.mjs   # regenerate data/countries.js
```
Note: on Node 22 `node --test <directory>` is not supported (positional arguments are globs); use the glob form above.
The "choices per life 15–45" target is only enforced once there are ≥ 300 events (`tests/simulation.test.mjs`, `CONTENT_THRESHOLD`);
until then it is printed with a warning.

## 8. Known limitations

* A person's mortality uses the life table of the *birth* country (migration only scales `riskMult` by the life-expectancy gap).
* Siblings are a count only (they do not age or die individually); grandchildren are not simulated (use `h.inc('grandchildren')`).
* Education is modelled in whole school years (12 school + up to 6 tertiary); pre-primary is not simulated.
* Fertility is calibrated by simulation (`tests/simulation.test.mjs`: children per woman within ±15 % of the TFR, for present-era lives against today's TFR, for past / future lives against the TFR of their late twenties: they plan marriage and children from `eraView(birthYear + 27)`); see `planChildren` in `systems.js`.
* Partner genders: ~1–5 % same-sex depending on era, who do not have biological children in the model.
* Income is a percentile model, not a ledger: there is no savings account or inflation.
* Data are 2017–2022 vintage open data plus recollection-based estimates (see `countries.js` header); `tfr`, `le` for Taiwan and a few small states are WPP 2024 recollections.
* Religion is the family's, drawn once at birth: nobody converts, drifts into "none" or marries into another tradition (the partner and the children simply share it). Culture groups of the names only steer the draw where the link is tight.
* Festivals are one per family (the main one); Easter-and-Christmas, Eid al-Fitr-and-Eid al-Adha or Diwali-and-Dashain are not both told. Regional variants inside a country (a Christian minority in Egypt, Sikhs in Canada) come from the culture-group overrides, not from a model.
* Geography is per city: a rural person takes the coast and altitude of the nearby city and the country's dominant climate; a whole country is not modelled (Chengdu is "temperate", the Tibetan plateau is not in the game). Lakes and rivers do not count as coast, so there are no inland fishers.
* Money: the exchange of a 2011 PPP dollar into a local amount uses one constant factor per country and a simple inflation curve; hyperinflations, redenominations and currencies that changed names (apart from the euro) are ignored.
* The life focus has no cost beyond its nudges: there is no "energy" to spread, and nothing stops a person from changing focus every year. Only the stage prompts ask.
