# 人生籤 engine & data — developer guide

For the UI agent (Phase 2A), the event writers (2B–2D) and QA (3). Everything in `js/engine/` and `js/data/`
is pure ES modules with **no DOM access**; it runs in browsers and in Node 22.

```
js/engine/  rng · birth · mortality · systems · events · helpers · life · summary
js/data/    countries (generated) · eras · names · causes · conditions · yearly · riskref (generated)
            events/ index · seed · childhood · youth · adult_work · adult_family · migration · health · aging · world · regional
tools/      fetch-raw · build-data (→ countries.js) · calibrate-risk (→ riskref.js)
tests/      data.test.mjs · events.test.mjs · simulation.test.mjs
```

## 1. Quick start

```js
import { createLife, advanceYear, choose, autoChoose, serialize, deserialize,
         getPendingChoice, getStatus } from './engine/life.js';
import { describeBirth } from './engine/birth.js';
import { getSummary } from './engine/summary.js';

const s = createLife({ era: 'present', drawMode: 'births', pace: 'standard', autoChoice: false }, seed);
const card = describeBirth(s);                 // data for the lottery reveal card

let r = advanceYear(s);                         // { entries, pendingChoice, died }
if (r.pendingChoice) r = choose(s, 0);          // index into pendingChoice.options  (or autoChoose(s))
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
| `advanceYear(state, { auto? })` | Lives one year. Returns `{ entries, pendingChoice, died }`. `entries` are the new log entries of this year. If a choice is pending, calling it again returns the same `pendingChoice` and does **not** advance. `auto: true` resolves choices by their `ai` weights (simulations). |
| `choose(state, optionIndex)` | Resolve the pending choice. `optionIndex` indexes `pendingChoice.options` (not the original `choices` array). Returns `{ entries, pendingChoice: null, died }`. Throws if nothing is pending or the index is invalid. |
| `autoChoose(state)` | Same as `choose`, picking by `ai` weights (seeded, so reproducible). Use it for the "自動抉擇" countdown. |
| `getPendingChoice(state)` | `{ eventId, title, text, options: [{ index, label, hint? }] }` or `null`. Stored in `state.flags._choice`, so it survives save/load. |
| `serialize(state)` / `deserialize(text)` | JSON string ↔ state. `deserialize` validates version, rng, country codes and throws on corrupt data. |
| `getStatus(state)` | Compact read-only snapshot for the life-screen header and the people drawer (name, age, stage, country, stats, partner, children with ages, parents, conditions…). |
| `lifeStage(age)` | `'嬰兒' … '高齡'`. |

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

* `describeBirth(state)` → `{ name, year, eraLabel, countryCode, countryName, region, income, city, urban, placeText, genderLabel, wealthQ, wealthLabel, wealthShort, babiesPer100, babiesText, lifeExpectancy, comparisons: [{ key: 'le'|'imr'|'school'|'gdp', label, unit, value, world, higherIsBetter }] }`.
  `babiesText` is ready to drop into "…出生的 100 個嬰兒裡，有{babiesText}和你同國。"
* `babyShare(country, year, mode)` → `{ share, per100, oneIn }`; `babyShareText(...)`.
* `drawCountry(rngState, year, mode)`, `WEALTH_LABELS`, `WEALTH_SHORT`, `GENDER_LABELS`.
* For the spinning-name animation, `COUNTRIES` (`data/countries.js`) has all names.

### summary.js

`getSummary(state)` → name, ages/years, `cause { id, label, text }`, `suicide` (show help resources when true),
`lifespan { age, countryLe, worldLe, vsCountry, vsWorld }`, `education`, `jobs`, `partner`, `marriages/divorces`,
`children { total, alive, names }`, `countriesLived`, `highlights`, `counts { choices, events, milestones, years }`,
per-stat `stats { peak, peakAge, mean, final }` and `statHistory`. `STAT_LABELS`, `EDU_LABELS` are exported.

### Other exports worth knowing

* `eras.js`: `eraView(country, year)` (era-adjusted statistics), `worldView(year)`, `ERA_LABELS`, `presentYear()`.
* `mortality.js`: `lifeTable(country, sex, year)` (`.q[age]`, `.e0`), `remainingLife(table, age)`, `causeLabel(id)`.
* `systems.js`: `JOBS` (id → `{ name, … }`), `EDU_LEVELS`, `STAT_KEYS`.
* `events.js`: `EVENTS`, `getEvent(id)`, `validateEvents(list)`, `TUNING` (majorRate, regularCounts, nullWeight, …).

## 3. One tick (`advanceYear`)

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
temporary `addRisk`s, early-childhood family wealth) is **normalised** by `data/riskref.js`, so mean lifespan stays at the
country's life expectancy while individuals differ. **Regenerate `riskref.js` after changing systems, conditions or any
event risk effect**: `node tools/calibrate-risk.mjs` (≈3 min).

Wealth is a 0–100 stat: half the person's income percentile in their country, half the (log) absolute income in
international dollars. `h.change('wealth', d)` also shifts the underlying percentile, so a shock persists.

## 4. Writing events

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
  schedule: [{ id: 'other_event', inYears: [0, 2] }],   // follow-ups, fire regardless of cond/ages
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

Rules enforced by `tests/events.test.mjs` (3000 random states): `cond`, `text`, `result`, `ai`, `weight`, `highlight` must not throw
and strings must be non-empty without `undefined`/`NaN`. Therefore **write total functions**: use `h.partnerName()` (returns `'對方'`
if single) rather than `s.partner.name`; `h.childName(0)` returns `'孩子'`. `text` is evaluated before `effects`.
Direct state edits are allowed in function effects (`s.stats`, `s.flags`), but prefer helpers. Never offer suicide as a choice.
Call helpers as methods: `h.chance(0.3)`, never destructure.

### Helpers (`h`, all 89)

* **Randomness**: `rand() chance(p) pick(arr) between(a,b) randInt(a,b)` (seeded; reproducible).
* **Time**: `age() year() birthYear() era() yearIn(a,b) ageIn(a,b)`.
* **Country / statistics**: `country() homeCountry() stats() countryName() income() incomeAtLeast(g) region() isRegion(...r) byIncome({L,LM,UM,H}) city() urban() isMigrant() hasLivedIn(code)`.
  `stats()` is the era-adjusted statistics record of the current country for the current calendar year (`le`, `imr`, `school`, `gdp`, …).
  `byIncome` falls back to the nearest defined group: `h.byIncome({ L: '…', H: '…' })`.
* **Identity & situation**: `stat(k) female() male() gender() wealthQ() annualIncome() isRich() isPoor() inSchool() eduLevel() eduAtLeast(level) eduYears() employed() unemployed() retired() workStatus() job() jobName() isJob(...ids) married() hasPartner() partnerStatus() partnerAge() yearsMarried() hasChildren() childCount() youngestChildAge() siblings() parentAlive('mother'|'father') parentsAlive() isSmoker() hasCondition(id) has(flag) flag(name) yearsSince(eventId) seenEvent(eventId)`.
* **Changes**: `set(flag, v=true) unset(flag) inc(flag, n=1) change(stat, delta) addWealth(d) addCondition(id) removeCondition(id) startJob(id) loseJob() retire() dropOut() startSmoking() quitSmoking() setPartner({name,gender,age,status}) marry() divorce() addChild({gender}) migrate(code) addRisk(mult, years?) log(text, title?) highlight(text) die(causeId)`.
  `die` is for wars/disasters only (`'disaster'`, `'conflict'`, …; ids in `data/causes.js`). `addRisk(m)` is permanent, `addRisk(m, n)` lapses after *n* years.
  Job ids: see `JOBS` in `systems.js`; condition ids: `data/conditions.js`.
* **Names**: `name() givenName() partnerName() childName(i=0) lastChildName() motherName() fatherName()`.

Useful flags set by systems (read with `h.has`): `orphan`, `migrated`, `war` (set it yourself to raise conflict mortality). Flags beginning with `_` are
engine-private — do not read or write them from events.

## 5. Data modules

* **countries.js** (generated by `tools/build-data.mjs`): 173 countries/territories ≥ 500k people covering 99.9 % of humanity. Fields per the PLAN plus `pop1970` and
  `marryAge {F,M}`. The header documents every source and year; `est: [...]` lists fields that are estimates for that country (`tertiary`, `road`, `childMarriage`,
  `homicide` are estimates everywhere). Re-run `node tools/fetch-raw.mjs && node tools/build-data.mjs` to rebuild.
* **eras.js**: anchors 1970 / present / 2050 interpolated by calendar year (`eraView`). 1970 uses real `le1970`, `imr1970`, `pop1970`; the rest are documented models.
* **names.js**: 33 culture pools (≥ 30 male, female, surname each), mapped per country; `makeName(pool, gender, rng)`.
* **causes.js**: 22 cause categories (+ `disaster` for `h.die`), base tables by income × age band, country/personal modifiers.
* **yearly.js**: "平凡的一年" templates — add lines freely (target 80); shape documented in the file header.

## 6. Tests & tools

```
cd lifelottery && npm test                 # or: node --test lifelottery/tests/*.test.mjs   (from the repo root)
LL_SIM_N=1000 node --test tests/simulation.test.mjs    # quicker run (statistical tolerances get noisy below ~1000 lives)
node tools/calibrate-risk.mjs [lives] [passes]          # regenerate data/riskref.js
node tools/fetch-raw.mjs && node tools/build-data.mjs   # regenerate data/countries.js
```
Note: on Node 22 `node --test <directory>` is not supported (positional arguments are globs); use the glob form above.
The "choices per life 15–45" target is only enforced once there are ≥ 300 events (`tests/simulation.test.mjs`, `CONTENT_THRESHOLD`);
until then it is printed with a warning.

## 7. Known limitations

* A person's mortality uses the life table of the *birth* country (migration only scales `riskMult` by the life-expectancy gap).
* Siblings are a count only (they do not age or die individually); grandchildren are not simulated (use `h.inc('grandchildren')`).
* Education is modelled in whole school years (12 school + up to 6 tertiary); pre-primary is not simulated.
* Partner genders: ~1–5 % same-sex depending on era, who do not have biological children in the model.
* Income is a percentile model, not a ledger: there is no savings account or inflation.
* Data are 2017–2022 vintage open data plus recollection-based estimates (see `countries.js` header); `tfr`, `le` for Taiwan and a few small states are WPP 2024 recollections.
