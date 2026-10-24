import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVITIES,EVENTS,ENDINGS,OUTFITS,freshGame,dateOf,ageStage,unlocked,selectEvent,prepareMonth,resolveMonth,validateEvent,validateSave,buyOutfit,wearOutfit,ending,eligibleEndings,epilogue,activityCost} from '../js/game.js';
const step=g=>{const seed=selectEvent(g);return resolveMonth(prepareMonth(g,seed.event,'local',seed),0);};
test('96 month journey completes without a key, stays within bounds and reloads every month',()=>{
 let g=freshGame();
 for(let i=0;i<96;i++){g.plan=['farm','house','rest'];const original=structuredClone(g);g=step(g);assert.equal(g.month,i+1);assert.equal(original.month,i);assert.deepEqual(validateSave(JSON.parse(JSON.stringify(g))),g);for(const v of Object.values(g.stats))assert.ok(v>=0&&v<=100);assert.ok(g.gold>=0);}
 assert.equal(dateOf(g.month).age,18);assert.equal(ageStage(g).index,3);assert.ok(ending(g));assert.equal(g.history.length,96);assert.throws(()=>step(g));
});
test('age progression, birthday and unlock boundaries',()=>{
 let g=freshGame();assert.equal(unlocked(g,'magic'),false);assert.equal(ageStage(g).name,'童年');g.month=24;assert.equal(unlocked(g,'magic'),true);assert.equal(ageStage(g).index,1);g.month=60;assert.equal(ageStage(g).index,2);g.month=96;assert.equal(ageStage(g).index,3);
 g=freshGame();for(let i=0;i<12;i++){g.plan=['farm','rest','rest'];g=step(g);}assert.ok(g.history[0].logs.some(l=>l.includes('年度養育津貼')));assert.equal(selectEvent(g).id,'birthday');
});
test('pending event is atomic, serializable, locks a second preparation and cannot settle twice',()=>{
 const g=freshGame(),seed=selectEvent(g),p=prepareMonth(g,seed.event,'local',seed);assert.equal(p.month,0);assert.equal(p.gold,g.gold);assert.deepEqual(p.stats,g.stats);assert.deepEqual(validateSave(p),p);assert.throws(()=>prepareMonth(p,seed.event,'local'));const n=resolveMonth(p,1);assert.equal(n.month,1);assert.equal(n.pending,null);assert.throws(()=>resolveMonth(n,1));assert.throws(()=>resolveMonth(p,9));
});
test('budget prevents unpaid tuition and emergency aid prevents poverty softlock',()=>{
 const g=freshGame();g.gold=0;g.plan=['study','farm','rest'];assert.throws(()=>step(g),/金幣不足/);g.plan=['farm','house','rest'];const n=step(g);assert.ok(n.gold>0);assert.ok(n.history[0].logs.some(l=>l.includes('緊急生活援助')));
});
test('advanced course cost locks to month start even when skill crosses 60 mid-month',()=>{
 const g=freshGame();g.stats.intellect=59;g.plan=['study','study','rest'];assert.equal(activityCost(g,'study'),70);const n=step(g);assert.equal(n.gold,1020);assert.equal(activityCost(n,'study'),105);
});
test('stress reduces growth and damaged health replaces active work with rest',()=>{
 const g=freshGame();g.plan=['study','rest','rest'];g.stats.stress=70;const n=step(g);assert.equal(n.stats.intellect-g.stats.intellect,2);g.stats.health=20;g.plan=['study','study','rest'];const sick=step(g);assert.equal(sick.counts.study,1);assert.ok(sick.history[0].logs[0].includes('改為在家休息'));
});
test('apprentice work pays for proficiency and grants 25 percent promotion after 12 shifts',()=>{
 let g=freshGame();g.plan=['farm','rest','rest'];g.stats.stamina=50;let a=step(g);assert.ok(a.history[0].logs[0].includes('85G'));g.counts.farm=12;let b=step(g);assert.ok(b.history[0].logs[0].includes('106G'));g.stats.stamina=10;let c=step(g);assert.ok(c.history[0].logs[0].includes('48G'));
});
test('festival creates medal only from skill and reputation and occurs only in October',()=>{
 const g=freshGame();g.month=6;g.stats.art=90;g.stats.stress=0;g.ratings.social=70;g.plan=['rest','rest','rest'];const n=step(g);assert.equal(dateOf(g.month).month,10);assert.equal(n.medals,1);assert.ok(n.flags.includes('medal-art'));g.month=5;assert.equal(step(g).medals,0);
});
test('event chain uses prerequisite flags, experience and age',()=>{
 const g=freshGame();g.month=3;g.stats.art=60;g.counts.art=6;assert.equal(selectEvent(g).id,'art-invite');g.flags.push('artInvite');g.counts.art=12;assert.equal(selectEvent(g).id,'art-finish');g.flags.push('masterpiece','mira');g.month=73;assert.equal(selectEvent(g).id,'friend-return');
});
test('exploration checks ability and grants region flag without duplicating it',()=>{
 const g=freshGame();g.month=25;g.stats.stamina=70;g.stats.health=90;g.plan=['explore','rest','rest'];const n=step(g);assert.ok(n.flags.includes('forest'));assert.ok(n.history[0].logs.some(l=>l.includes('試煉成功')));const twice=step(n);assert.equal(twice.flags.filter(x=>x==='forest').length,1);
});
test('wardrobe ownership, unlock, purchase costs and no stacking from repeated wear',()=>{
 let g=freshGame();assert.throws(()=>buyOutfit(g,'academy'));g.stats.intellect=40;g=buyOutfit(g,'academy');assert.equal(g.gold,980);assert.throws(()=>buyOutfit(g,'academy'));const before=structuredClone(g.stats);g=wearOutfit(g,'academy');g=wearOutfit(g,'daily');g=wearOutfit(g,'academy');assert.deepEqual(g.stats,before);const seed=selectEvent(g);const p=prepareMonth(g,seed.event,'local');assert.throws(()=>wearOutfit(p,'daily'));assert.throws(()=>buyOutfit(p,'travel'));
});
test('academy outfit bonus applies once per course; travel outfit changes retreat loss',()=>{
 let g=freshGame();g.stats.intellect=40;g=wearOutfit(buyOutfit(g,'academy'),'academy');g.plan=['study','rest','rest'];assert.equal(step(g).stats.intellect,45);
 g=freshGame();g.month=25;g.stats.stamina=40;g=wearOutfit(buyOutfit(g,'travel'),'travel');g.destination='lake';g.plan=['rest','rest','explore'];const n=step(g);assert.ok(n.history[0].logs.some(l=>l.includes('健康 -4')));
});
test('all 18 local events satisfy schema; unknown or reordered effects cannot enter pending state',()=>{
 for(const e of EVENTS)assert.equal(validateEvent(e).choices.length,3);
 const g=freshGame(),seed=selectEvent(g),bad=structuredClone(seed.event);bad.choices[0].effectId='__proto__';assert.throws(()=>validateEvent(bad));bad.choices[0].effectId=seed.event.choices[1].effectId;assert.throws(()=>prepareMonth(g,bad,'gemini'));const swapped=structuredClone(seed.event);swapped.choices.reverse();assert.throws(()=>prepareMonth(g,swapped,'gemini'),/偏離/);
});
test('save rejects malformed stats, unknown clothes, secret fields, history and pending seeds',()=>{
 const g=freshGame();g.apiKey='secret';assert.ok(!('apiKey' in validateSave(g)));for(const mutate of [x=>x.stats.magic=NaN,x=>x.wardrobe.push('__proto__'),x=>x.month=97,x=>x.plan=['unknown','rest','rest'],x=>x.history=[{}]]){const bad=freshGame();mutate(bad);assert.throws(()=>validateSave(bad));}
 const p=prepareMonth(freshGame(),selectEvent(freshGame()).event,'local');p.pending.seedId='not-canonical';assert.throws(()=>validateSave(p));
});
test('32 unique careers have a fallback; advanced title needs its event and festival qualifications',()=>{
 assert.equal(ENDINGS.length,32);assert.equal(new Set(ENDINGS.map(r=>r.id)).size,32);let g=freshGame();g.month=96;assert.equal(ending(g).id,'home');g.stats.art=90;g.counts.art=24;g.ratings.social=70;assert.notEqual(ending(g).id,'painter');g.flags.push('masterpiece','medal-art');assert.equal(ending(g).id,'painter');assert.ok(eligibleEndings(g).length>1);g.stats.bond=10;g.stats.health=20;g.gold=0;g.flags.push('promise');const e=epilogue(g);assert.match(e.family,/距離/);assert.match(e.friendship,/約定/);assert.match(e.wellbeing,/休養/);assert.match(e.finances,/精打細算/);
});
test('20 outfits include required costumes and reward costumes unlock automatically on settlement',()=>{
 assert.equal(Object.keys(OUTFITS).length,20);for(const id of ['swim','gala','demon','maid'])assert.ok(OUTFITS[id]);
 const g=freshGame();g.flags=['starKey','masterpiece'];g.medals=1;g.plan=['rest','rest','rest'];const n=step(g);for(const id of ['demon','artist','festival'])assert.ok(n.wardrobe.includes(id));assert.deepEqual(validateSave(n).wardrobe,n.wardrobe);
});
test('outfit income and festival advantages apply only when equipped',()=>{
 const g=freshGame();g.counts.farm=6;g.stats.stamina=60;g.plan=['farm','rest','rest'];const base=step(g);const farmer=step(wearOutfit(buyOutfit(g,'farmer'),'farmer'));assert.equal(farmer.history[0].goldDelta-base.history[0].goldDelta,9);
 const a=freshGame();a.month=6;a.festival='dance';a.stats.etiquette=50;a.stats.art=40;a.stats.stress=0;a.plan=['rest','rest','rest'];const dressed=step(wearOutfit(buyOutfit(a,'dancer'),'dancer'));assert.ok(dressed.history[0].logs.some(l=>l.includes('獲獎')));
});
