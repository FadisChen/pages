/* Gemini Live：瀏覽器直接連線，API key 由書架頁設定。 */
(function(){
'use strict';
const URL='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
let button,reader;
let socket=null,stream=null,audio=null,mic=null,processor=null,sink=null,nextPlay=0,playing=[];
let starting=false,ready=false,generation=0;

function setButton(state,detail){
  if(!button)return;
  button.dataset.state=state;
  button.textContent=state==='connecting'?'連線中':state==='active'?'停止':state==='missing-key'?'請設定 key':state==='error'?'重試對談':'對談';
  button.title=detail||(state==='active'?'點擊停止':'點擊開始語音對談');
  button.setAttribute('aria-label',detail||button.textContent);
  button.setAttribute('aria-pressed',state==='connecting'||state==='active'?'true':'false');
  button.classList.toggle('on',state==='connecting'||state==='active');
}
function stopPlayback(){playing.forEach(source=>{try{source.stop()}catch(e){}});playing=[];nextPlay=0}
function cleanup(){
  ready=false;starting=false;
  if(processor){processor.port.onmessage=null;processor.disconnect();processor=null}
  if(mic){mic.disconnect();mic=null}
  if(sink){sink.disconnect();sink=null}
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}
  stopPlayback();
  if(audio){audio.close().catch(()=>{});audio=null}
  if(socket){const old=socket;socket=null;old.onclose=null;old.close()}
}
function stop(){generation++;cleanup();setButton('idle')}
function send(data){if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data))}
function capture(event){
  if(!ready||!socket||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>512000)return;
  const bytes=new Uint8Array(event.data);
  let raw='';for(let i=0;i<bytes.length;i++)raw+=String.fromCharCode(bytes[i]);
  send({realtimeInput:{audio:{data:btoa(raw),mimeType:'audio/pcm;rate=16000'}}});
}
function play(base64){
  if(!audio)return;
  const raw=atob(base64),count=Math.floor(raw.length/2),buffer=audio.createBuffer(1,count,24000),samples=buffer.getChannelData(0);
  for(let i=0;i<count;i++){
    let value=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);
    if(value>=32768)value-=65536;
    samples[i]=value/32768;
  }
  const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);
  source.onended=()=>{playing=playing.filter(item=>item!==source)};
  const time=Math.max(audio.currentTime+.03,nextPlay);source.start(time);nextPlay=time+buffer.duration;playing.push(source);
}
async function receive(event){
  if(event.target!==socket)return;
  let message;
  try{message=JSON.parse(typeof event.data==='string'?event.data:await event.data.text())}catch(e){return}
  if(message.setupComplete){ready=true;setButton('active');return}
  const content=message.serverContent;
  if(!content)return;
  if(content.interrupted)stopPlayback();
  if(content.modelTurn?.parts)content.modelTurn.parts.forEach(part=>{
    if(part.inlineData?.data)play(part.inlineData.data);
  });
}
async function start(){
  if(starting||socket)return;
  const key=localStorage.getItem('gemini:api-key');
  if(!key){setButton('missing-key','請先返回書架設定 Gemini API key');return}
  const id=++generation;
  starting=true;setButton('connecting','正在準備麥克風…');
  try{
    const context=await reader.liveContext();
    if(id!==generation)return;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('請使用 HTTPS 或 localhost 開啟書籍，以使用麥克風');
    const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    if(id!==generation){acquired.getTracks().forEach(track=>track.stop());return}
    stream=acquired;
    audio=new (window.AudioContext||window.webkitAudioContext)();
    await audio.resume();
    if(id!==generation)return;
    if(!audio.audioWorklet||!window.AudioWorkletNode)throw new Error('此瀏覽器不支援 AudioWorklet');
    await audio.audioWorklet.addModule('../reader/gemini-audio-worklet.js');
    if(id!==generation)return;
    mic=audio.createMediaStreamSource(stream);
    processor=new AudioWorkletNode(audio,'gemini-mic');
    sink=audio.createGain();sink.gain.value=0;
    mic.connect(processor);processor.connect(sink);sink.connect(audio.destination);
    processor.port.onmessage=capture;
    setButton('connecting','正在連線 Gemini…');
    const connection=new WebSocket(URL+encodeURIComponent(key));socket=connection;
    connection.onopen=()=>send({setup:{
      model:'models/gemini-3.8-live',
      generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:localStorage.getItem('gemini:voice')||'Puck'}}}},
      contextWindowCompression:{slidingWindow:{}},
      systemInstruction:{parts:[{text:'你是繁體中文閱讀夥伴。請根據以下書籍章節回答；若章節沒有答案，請明確說明，若使用者要求延伸討論，可以根據你的知識回答。保持自然、簡短的語音回答。\n\n'+context.title+'\n\n'+context.text}]}
    }});
    connection.onmessage=receive;
    connection.onerror=()=>{if(socket===connection)setButton('error','連線失敗，請檢查 API key、網路和 Gemini API 權限')};
    connection.onclose=event=>{
      if(socket!==connection)return;
      cleanup();
      const reason=(event.reason||'').replaceAll(key,'[已隱藏]').slice(0,160);
      setButton('error',`連線已中斷（代碼 ${event.code}）${reason?'：'+reason:'，請檢查 API key、網路或模型權限後重試'}`);
    };
    starting=false;
  }catch(error){if(id!==generation)return;cleanup();setButton('error',error.name==='NotAllowedError'?'請允許麥克風存取後再試':error.message||'無法啟動對談')}
}
function init(bookReader){
  reader=bookReader;
  button=document.querySelector('#live-btn');
  button.onclick=()=>{
    if(starting||socket)return stop();
    if(button.dataset.state==='missing-key'){location.href='../index.html';return}
    return start();
  };
  setButton('idle');
}
window.GeminiLive={init,stop};
})();
