// Print one whole life as plain text, the way a careful player would read it (QA tool).
//
//   node tools/read-life.mjs --seed=abc --era=past [--country=NER] [--gender=F] [--urban=0|1] [--wealth=1..5] [--birthYear=2067] [--draw=births|population]
//                            [--focus=study|work|family|health|self|balance] [--religion=hindu|muslim|christian|buddhist|folk|jewish|sikh|none|other] [--city=北京]
//   --focus forces that life focus every year it is open (default: the engine's auto-choice at each stage); --religion replaces the drawn
//   family religion; --city puts the person in a city of the country.
//
// Same seed + same options => the same life (choices are made by the `ai` weights, as in the simulations).

import { createLife, advanceYear } from '../js/engine/life.js';
import { getSummary } from '../js/engine/summary.js';
import { setFocus } from '../js/engine/focus.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { BY_CODE } from '../js/data/countries.js';

export function playLife(opt) {
  const settings = { era: opt.era || 'present', drawMode: opt.draw || 'births' };
  const forced = {};
  if (opt.country) forced.countryCode = opt.country;
  if (opt.gender) forced.gender = opt.gender;
  if (opt.urban !== undefined) forced.urban = opt.urban === '1' || opt.urban === true;
  if (opt.wealth) forced.wealthQ = +opt.wealth;
  if (opt.birthYear) forced.birthYear = +opt.birthYear;
  const s = createLife(settings, opt.seed || 'read', forced);
  if (opt.religion) s.religion = opt.religion;
  if (opt.city) s.city = opt.city;
  let guard = 0;
  while (s.alive && guard++ < 130) {
    if (opt.focus) setFocus(s, opt.focus);
    advanceYear(s, { auto: true, autoFocus: !opt.focus });
  }
  return s;
}

export function renderLife(s) {
  const home = BY_CODE[s.homeCountryCode];
  const out = [];
  out.push(`${s.name.full}  ${s.gender === 'F' ? '女' : '男'}  ${s.birthYear}–${s.death ? s.death.year : '?'}  ${home.name}${s.flags._birthUrban ? '（城）' : '（鄉）'}${s.flags._birthCity}  家境 ${s.family.wealthQ}/5  era ${s.settings.era}`);
  const h = makeHelpers(s);
  const place = h.place();
  out.push(`宗教 ${s.religion}（節日 ${h.festival()}）  地點 ${s.city}${s.urban ? '' : '附近的鄉下'}：${place.coast ? '近海' : '內陸'}・${place.alt}・${place.climate}  重心 ${s.focusHistory.map((r) => `${r.age}:${r.focus}`).join(' ')}`);
  out.push(`學歷 ${s.edu.level}(${s.edu.years}年)  工作 ${(s.flags._jobs || []).join('>') || '無'}  伴侶 ${s.partner ? `${s.partner.name}(${s.partner.status})` : '無'}  子女 ${s.children.map((c) => `${c.name}${c.alive ? '' : '†'}`).join('、') || '無'}  住過 ${(s.flags._countries || []).map((c) => BY_CODE[c].name).join('→')}`);
  out.push('');
  for (const e of s.log) {
    const d = e.delta ? ' [' + Object.entries(e.delta).map(([k, v]) => `${k[0]}${v > 0 ? '+' : ''}${v}`).join(' ') + ']' : '';
    out.push(`${String(e.age).padStart(3)} ${e.kind.padEnd(9)} ${e.title && e.kind !== 'year' ? e.title + '：' : ''}${e.text}${d}`);
  }
  const sum = getSummary(s);
  out.push('', `--- 重要時刻（${sum.highlights.length}） ---`, ...sum.highlights.map((h) => `${h.age} 歲：${h.text}`));
  out.push('', `選擇 ${sum.counts.choices}，事件 ${sum.counts.events}，里程碑 ${sum.counts.milestones}；享年 ${sum.age}（本國平均 ${sum.lifespan.countryLe}）`);
  return out.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('read-life.mjs')) {
  const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
  console.log(renderLife(playLife(opt)));
}
