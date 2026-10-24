import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEvent,normalizeModel,DEFAULT_MODEL} from '../js/gemini.js';
import {freshGame,selectEvent} from '../js/game.js';
const game=freshGame(),event=selectEvent(game).event;
const success=e=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(e)}]}}]})});
test('configured model defaults to user requested Gemini 3.5 Flash Lite and remains editable',()=>{assert.equal(DEFAULT_MODEL,'gemini-3.5-flash-lite');assert.equal(normalizeModel('models/gemini-other'),'gemini-other');assert.throws(()=>normalizeModel('../../other'));assert.throws(()=>normalizeModel(''));});
test('key goes only in header and prompt is bounded to three recent outcomes, not whole save',async()=>{
 const g=freshGame();g.history=Array.from({length:20},(_,i)=>({title:`t${i}`,choice:'choice',body:'secret full history'}));let seen;
 const result=await requestEvent({apiKey:'test-secret',model:DEFAULT_MODEL,game:g,fetchImpl:async(url,options)=>{seen={url,options};return success(event);}});
 assert.equal(result.title,event.title);assert.ok(!seen.url.includes('test-secret'));assert.equal(seen.options.headers['x-goog-api-key'],'test-secret');assert.ok(!seen.options.body.includes('test-secret'));assert.ok(!seen.options.body.includes('secret full history'));const b=JSON.parse(seen.options.body),context=JSON.parse(b.contents[0].parts[0].text);assert.equal(context.recent.length,3);assert.equal(context.age,10);assert.equal(b.generationConfig.responseMimeType,'application/json');assert.equal(b.generationConfig.maxOutputTokens,4096);
});
test('HTTP errors redact upstream messages and do not mutate game',async()=>{
 const original=structuredClone(game);for(const status of [400,401,403,404,429,500])await assert.rejects(requestEvent({apiKey:'secret',model:DEFAULT_MODEL,game,fetchImpl:async()=>({ok:false,status,json:async()=>({error:{message:'secret'}})})}),e=>!e.message.includes('secret'));
 assert.deepEqual(game,original);
});
test('invalid JSON, truncated or filtered content and unknown effects are rejected',async()=>{
 await assert.rejects(requestEvent({apiKey:'x',model:DEFAULT_MODEL,game,fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})})}),/未完整/);
 await assert.rejects(requestEvent({apiKey:'x',model:DEFAULT_MODEL,game,fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'not JSON'}]}}]})})}),/無法解析/);
 const bad=structuredClone(event);bad.choices[0].effectId='unlimited-gold';await assert.rejects(requestEvent({apiKey:'x',model:DEFAULT_MODEL,game,fetchImpl:async()=>success(bad)}),/選項格式/);
});
test('timeout aborts request and surfaces retry or fallback message',async()=>{
 await assert.rejects(requestEvent({apiKey:'x',model:DEFAULT_MODEL,game,timeoutMs:5,fetchImpl:(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>{const e=new Error();e.name='AbortError';reject(e);} ))}),/尚未扣款/);
});
