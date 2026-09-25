const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('toolbar button starts and stops audio-only Live',async()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      disabled:false,textContent:'',value:'',dataset:{},title:'',
      classList:{toggle(){}},setAttribute(){},
    });
    return elements.get(id);
  };
  let setup,trackStopped=false,workletLoaded=false;
  class Audio{
    constructor(){this.sampleRate=48000;this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{workletLoaded=true}}}
    resume(){return Promise.resolve()}
    close(){return Promise.resolve()}
    createMediaStreamSource(){return {connect(){},disconnect(){}}}
    createGain(){return {gain:{value:0},connect(){},disconnect(){}}}
    createScriptProcessor(){throw new Error('ScriptProcessorNode must not be used')}
  }
  class Socket{
    static OPEN=1;
    constructor(){this.readyState=1;queueMicrotask(()=>this.onopen())}
    send(data){
      const message=JSON.parse(data);
      if(!message.setup)return;
      setup=message.setup;
      const config=setup.generationConfig;
      if(!config||config.responseModalities?.[0]!=='AUDIO'||config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName!=='Kore'){
        queueMicrotask(()=>this.onclose({code:1007,reason:'invalid setup'}));
      }else queueMicrotask(()=>this.onmessage({target:this,data:JSON.stringify({setupComplete:{}})}));
    }
    close(){this.readyState=3}
  }
  class Worklet{constructor(){this.port={onmessage:null}}connect(){}disconnect(){}}
  const context={
    window:{AudioContext:Audio,AudioWorkletNode:Worklet},WebSocket:Socket,AudioWorkletNode:Worklet,
    document:{body:{insertAdjacentHTML(){throw new Error('no dialog expected')}},querySelector:element},
    navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){trackStopped=true}}]})}},
    localStorage:{getItem:key=>key==='gemini:api-key'?'fake-key':'Kore'},
    setTimeout,clearTimeout,queueMicrotask,console
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'gemini-live.js'),'utf8'),context);
  context.window.GeminiLive.init({liveContext:async()=>({title:'測試章節',text:'測試內容'})});
  assert.equal(element('#live-btn').textContent,'對談');
  await element('#live-btn').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(element('#live-btn').textContent,'停止');
  assert.equal(element('#live-btn').dataset.state,'active');
  assert.equal(setup.model,'models/gemini-3.8-live');
  assert.equal(setup.inputAudioTranscription,undefined);
  assert.equal(setup.outputAudioTranscription,undefined);
  assert.equal(workletLoaded,true);
  element('#live-btn').onclick();
  assert.equal(element('#live-btn').textContent,'對談');
  assert.equal(trackStopped,true);
});

test('AudioWorklet sends 16 kHz PCM chunks',()=>{
  let Processor,chunk;
  const context={
    sampleRate:48000,Int16Array,Math,
    AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>{chunk=data}}}},
    registerProcessor:(name,constructor)=>{assert.equal(name,'gemini-mic');Processor=constructor}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'gemini-audio-worklet.js'),'utf8'),context);
  const processor=new Processor();
  for(let i=0;i<16;i++)assert.equal(processor.process([[new Float32Array(128)]]),true);
  assert.equal(new Int16Array(chunk).length,683);
});
