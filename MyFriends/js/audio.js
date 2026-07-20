export class BrowserAudioEngine {
  constructor({ onAudioChunk, onLevel } = {}) {
    this.onAudioChunk = onAudioChunk;
    this.onLevel = onLevel;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.muteGain = null;
    this.activeSources = new Set();
    this.activeCueOscillators = new Set();
    this.nextPlayTime = 0;
    this.running = false;
    this.captureEnabled = true;
    this.cueGeneration = 0;
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("此瀏覽器不支援麥克風擷取。");
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error("此瀏覽器不支援 Web Audio API。");

    this.context = new AudioContextClass({ latencyHint: "interactive" });
    await this.context.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(2048, 1, 1);
    this.muteGain = this.context.createGain();
    this.muteGain.gain.value = 0;
    this.processor.onaudioprocess = (event) => this.capture(event.inputBuffer.getChannelData(0));
    this.source.connect(this.processor);
    this.processor.connect(this.muteGain);
    this.muteGain.connect(this.context.destination);
    this.nextPlayTime = this.context.currentTime;
    this.running = true;
  }

  capture(floatSamples) {
    if (!this.running || !this.context || !this.captureEnabled) return;
    const resampled = resample(floatSamples, this.context.sampleRate, 16000);
    const pcm = floatToPcm16(resampled);
    this.onAudioChunk?.(pcm);
    if (this.onLevel) {
      let sum = 0;
      for (let index = 0; index < floatSamples.length; index += 1) sum += floatSamples[index] * floatSamples[index];
      this.onLevel(Math.min(1, Math.sqrt(sum / floatSamples.length) * 3.5));
    }
  }

  playPcm24k(bytes) {
    if (!this.context || !bytes?.byteLength) return;
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const buffer = this.context.createBuffer(1, sampleCount, 24000);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < sampleCount; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime + 0.015, this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);
  }

  flushPlayback() {
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* Source may already be stopped. */ }
    }
    this.activeSources.clear();
    if (this.context) this.nextPlayTime = this.context.currentTime;
  }

  async playSessionCue(kind) {
    if (!this.context || this.context.state === "closed") return;
    await this.context.resume();
    this.stopSessionCues();
    const generation = ++this.cueGeneration;
    const notes = kind === "end"
      ? [{ frequency: 659.25, offset: 0, duration: .13 }, { frequency: 440, offset: .1, duration: .2 }]
      : [{ frequency: 523.25, offset: 0, duration: .13 }, { frequency: 659.25, offset: .1, duration: .2 }];
    const startAt = this.context.currentTime + .015;
    this.captureEnabled = false;

    for (const note of notes) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const noteStart = startAt + note.offset;
      const noteEnd = noteStart + note.duration;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);
      gain.gain.setValueAtTime(.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(.075, noteStart + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + .01);
      this.activeCueOscillators.add(oscillator);
      oscillator.onended = () => {
        this.activeCueOscillators.delete(oscillator);
        try { oscillator.disconnect(); } catch { /* Already disconnected. */ }
        try { gain.disconnect(); } catch { /* Already disconnected. */ }
      };
    }

    const totalMs = Math.ceil(Math.max(...notes.map((note) => note.offset + note.duration)) * 1000) + 35;
    await new Promise((resolve) => setTimeout(resolve, totalMs));
    if (this.cueGeneration === generation) this.captureEnabled = true;
  }

  stopSessionCues() {
    this.cueGeneration += 1;
    for (const oscillator of this.activeCueOscillators) {
      try { oscillator.stop(); } catch { /* Oscillator may already have ended. */ }
    }
    this.activeCueOscillators.clear();
    this.captureEnabled = true;
  }

  async stop() {
    this.running = false;
    this.flushPlayback();
    this.stopSessionCues();
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try { this.processor.disconnect(); } catch { /* Already disconnected. */ }
    }
    try { this.source?.disconnect(); } catch { /* Already disconnected. */ }
    try { this.muteGain?.disconnect(); } catch { /* Already disconnected. */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.muteGain = null;
    this.onLevel?.(0);
  }
}

function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex];
    output[index] = sum / (end - start);
  }
  return output;
}

function floatToPcm16(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}
