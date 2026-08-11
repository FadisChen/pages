export class BrowserAudioEngine {
  constructor({ capture = false, onAudioChunk, onLevel } = {}) {
    this.captureRequested = capture;
    this.onAudioChunk = onAudioChunk;
    this.onLevel = onLevel;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.muteGain = null;
    this.playbackSources = new Set();
    this.activeCueOscillators = new Set();
    this.playbackAt = 0;
    this.running = false;
    this.captureEnabled = true;
    this.cueGeneration = 0;
    this.micGated = false;
    this.micGateTimer = null;
  }

  async start() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('此瀏覽器不支援 Web Audio API。');
    this.context = new AudioContextClass({ latencyHint: 'interactive' });
    await this.context.resume();
    this.running = true;
    if (!this.captureRequested) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('此瀏覽器不支援麥克風擷取。');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.muteGain = this.context.createGain();
    this.muteGain.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.muteGain);
    this.muteGain.connect(this.context.destination);
    this.processor.onaudioprocess = (event) => this.capture(event.inputBuffer.getChannelData(0));
  }

  capture(samples) {
    if (!this.running || !this.context || !this.captureEnabled || this.micGated) return;
    const pcm = floatToPcm16(resample(samples, this.context.sampleRate, 16000));
    this.onAudioChunk?.(pcm);
    if (this.onLevel) {
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      this.onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3.5));
    }
  }

  async playPcm24k(bytes) {
    if (!this.running || !this.context || !bytes?.byteLength) return;
    await this.preparePlayback();
    const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true) / 32768;
    const buffer = this.context.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime + .02, this.playbackAt);
    this.playbackAt = startAt + buffer.duration;
    source.start(startAt);
    this.playbackSources.add(source);
    source.onended = () => { this.playbackSources.delete(source); try { source.disconnect(); } catch { /* ended */ } };
  }

  async preparePlayback() {
    if (!this.running || !this.context || this.context.state === 'closed') throw new Error('音訊播放裝置目前無法使用。');
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('瀏覽器尚未允許播放聲音，請再次點擊送出。');
  }

  async playSessionCue(kind = 'start') {
    if (!this.running || !this.context || this.context.state === 'closed') return;
    await this.context.resume();
    this.stopSessionCues();
    const generation = ++this.cueGeneration;
    const notes = kind === 'end'
      ? [{ frequency: 659.25, offset: 0, duration: .13 }, { frequency: 440, offset: .1, duration: .2 }]
      : [{ frequency: 523.25, offset: 0, duration: .13 }, { frequency: 659.25, offset: .1, duration: .2 }];
    const startAt = this.context.currentTime + .015;
    this.captureEnabled = false;

    for (const note of notes) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const noteStart = startAt + note.offset;
      const noteEnd = noteStart + note.duration;
      oscillator.type = 'sine';
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
        try { oscillator.disconnect(); } catch { /* ended */ }
        try { gain.disconnect(); } catch { /* ended */ }
      };
    }

    const totalMs = Math.ceil(Math.max(...notes.map((note) => note.offset + note.duration)) * 1000) + 35;
    await new Promise((resolve) => setTimeout(resolve, totalMs));
    if (this.cueGeneration === generation) this.captureEnabled = true;
  }

  stopSessionCues() {
    this.cueGeneration += 1;
    for (const oscillator of this.activeCueOscillators) try { oscillator.stop(); } catch { /* ended */ }
    this.activeCueOscillators.clear();
    this.captureEnabled = true;
  }

  setMicGated(active) {
    clearTimeout(this.micGateTimer);
    if (active) { this.micGated = true; return; }
    const remainingMs = this.context ? Math.max(0, (this.playbackAt - this.context.currentTime) * 1000) : 0;
    if (remainingMs <= 0) { this.micGated = false; return; }
    this.micGateTimer = setTimeout(() => { this.micGated = false; }, remainingMs);
  }

  flushPlayback() {
    for (const source of this.playbackSources) try { source.stop(); } catch { /* already stopped */ }
    this.playbackSources.clear();
    this.playbackAt = this.context?.currentTime || 0;
  }

  async stop() {
    this.running = false;
    this.flushPlayback();
    this.stopSessionCues();
    clearTimeout(this.micGateTimer);
    this.micGated = false;
    if (this.processor) this.processor.onaudioprocess = null;
    try { this.processor?.disconnect(); } catch { /* disconnected */ }
    try { this.source?.disconnect(); } catch { /* disconnected */ }
    try { this.muteGain?.disconnect(); } catch { /* disconnected */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = this.stream = this.source = this.processor = this.muteGain = null;
    this.onLevel?.(0);
  }
}

export const TAVERN_SOUND_ASSETS = Object.freeze({
  door: './assets/sounds/door-open.mp3',
  chatter: './assets/sounds/tavern-chatter.mp3',
  pourSake: './assets/sounds/pour-sake.mp3',
  pourWater: './assets/sounds/pour-water.mp3',
  ice: './assets/sounds/ice-into-glass.mp3',
});

export class TavernSoundscape {
  constructor({ createAudio = (src) => new Audio(src), random = Math.random, setTimeoutFn = globalThis.setTimeout.bind(globalThis), clearTimeoutFn = globalThis.clearTimeout.bind(globalThis), onError } = {}) {
    this.createAudio = createAudio;
    this.random = random;
    this.setTimeout = setTimeoutFn;
    this.clearTimeout = clearTimeoutFn;
    this.onError = onError;
    this.running = false;
    this.ambientAudio = null;
    this.activeEffects = new Set();
    this.ambientTimer = null;
    this.eventTimer = null;
  }

  start() {
    this.stop();
    this.running = true;
    this.playEffect('door', 0.42);
    this.ambientTimer = this.setTimeout(() => this.startAmbience(), 650);
    this.scheduleEvent();
  }

  startAmbience() {
    if (!this.running) return;
    this.ambientAudio = this.createAudio(TAVERN_SOUND_ASSETS.chatter);
    this.ambientAudio.loop = true;
    this.ambientAudio.volume = 0.075;
    void this.ambientAudio.play().catch((error) => this.onError?.(error));
  }

  scheduleEvent() {
    if (!this.running) return;
    const delay = 14000 + Math.round(this.random() * 16000);
    this.eventTimer = this.setTimeout(() => {
      if (!this.running) return;
      const effects = ['pourSake', 'pourWater', 'ice'];
      const effect = effects[Math.floor(this.random() * effects.length)];
      this.playEffect(effect, 0.2);
      this.scheduleEvent();
    }, delay);
  }

  playEffect(kind, volume = 0.2) {
    if (!this.running && kind !== 'door') return;
    const src = TAVERN_SOUND_ASSETS[kind];
    if (!src) return;
    const audio = this.createAudio(src);
    audio.volume = volume;
    this.activeEffects.add(audio);
    audio.addEventListener?.('ended', () => this.activeEffects.delete(audio), { once: true });
    void audio.play().catch((error) => this.onError?.(error));
  }

  stop() {
    this.running = false;
    if (this.ambientTimer) this.clearTimeout(this.ambientTimer);
    if (this.eventTimer) this.clearTimeout(this.eventTimer);
    this.ambientTimer = this.eventTimer = null;
    this.ambientAudio?.pause();
    if (this.ambientAudio) this.ambientAudio.currentTime = 0;
    for (const audio of this.activeEffects) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.activeEffects.clear();
    this.ambientAudio = null;
  }
}
function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let source = start; source < end; source += 1) sum += input[source];
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
