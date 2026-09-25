class GeminiMicProcessor extends AudioWorkletProcessor{
  constructor(){super();this.samples=[]}
  process(inputs){
    const input=inputs[0]&&inputs[0][0];
    if(!input)return true;
    for(let i=0;i<input.length;i++)this.samples.push(input[i]);
    if(this.samples.length<2048)return true;
    const samples=this.samples;this.samples=[];
    const count=Math.round(samples.length*16000/sampleRate),pcm=new Int16Array(count);
    for(let i=0;i<count;i++){
      const pos=i*sampleRate/16000,at=Math.floor(pos),fraction=pos-at;
      const value=Math.max(-1,Math.min(1,samples[at]*(1-fraction)+samples[Math.min(at+1,samples.length-1)]*fraction));
      pcm[i]=value<0?value*32768:value*32767;
    }
    this.port.postMessage(pcm.buffer,[pcm.buffer]);
    return true;
  }
}
registerProcessor('gemini-mic',GeminiMicProcessor);
