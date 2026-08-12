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
    if (!this.running || !this.context || !this.captureEnabled) return;
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

  flushPlayback() {
    for (const source of this.playbackSources) try { source.stop(); } catch { /* already stopped */ }
    this.playbackSources.clear();
    this.playbackAt = this.context?.currentTime || 0;
  }

  async stop() {
    this.running = false;
    this.flushPlayback();
    this.stopSessionCues();
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
  shake: './assets/sounds/coffee_with_a_spoon.mp3',
  clinking: './assets/sounds/clinking.mp3',
  ice: './assets/sounds/ice-into-glass.mp3',
});

export const DEFAULT_BACKGROUND_MUSIC_ID = 'dust-on-my-boots';

export const BACKGROUND_MUSIC_TRACKS = Object.freeze([
  { id: DEFAULT_BACKGROUND_MUSIC_ID, title: 'Dust On My Boots', src: './assets/bgm/Dust On My Boots.mp3' },
  { id: 'dust-on-my-boots-2', title: 'Dust On My Boots 2', src: './assets/bgm/Dust On My Boots2.mp3' },
  { id: 'adventure', title: '中年探險', src: './assets/bgm/中年探險.mp3' },
  { id: 'edge-of-time', title: '我站在時間的邊緣', src: './assets/bgm/我站在時間的邊緣.mp3' },
  { id: 'homeward-wind', title: '歸途的風', src: './assets/bgm/歸途的風.mp3' },
]);

export class BackgroundMusicPlayer {
  constructor({ tracks = BACKGROUND_MUSIC_TRACKS, createAudio = () => new Audio(), requestFrame = globalThis.requestAnimationFrame.bind(globalThis), fadeDuration = 1200, volume = 0.28, autoPlay = false } = {}) {
    this.tracks = new Map(tracks.map((track) => [track.id, track]));
    this.createAudio = createAudio;
    this.requestFrame = requestFrame;
    this.fadeDuration = fadeDuration;
    this.volume = volume;
    this.autoPlay = Boolean(autoPlay);
    this.activeAudios = new Set();
    this.endedHandlers = new Map();
    this.currentAudio = null;
    this._selectedId = '';
    this.generation = 0;
    this.trackChangeRequest = null;
  }

  get selectedId() {
    return this._selectedId;
  }

  setAutoPlay(enabled) {
    this.autoPlay = Boolean(enabled);
    if (this.currentAudio) this.currentAudio.loop = !this.autoPlay;
    return this.autoPlay;
  }

  async select(trackId = '') {
    const nextId = String(trackId || '');
    const track = this.tracks.get(nextId);
    if (nextId && !track) throw new Error('找不到指定的背景音樂。');
    if (nextId === this._selectedId && (nextId === '' || this.currentAudio)) return true;

    const generation = ++this.generation;
    if (!track) {
      this.currentAudio = null;
      this._selectedId = '';
      await this.fade(generation, null);
      return true;
    }

    const incoming = this.createAudio();
    incoming.preload = 'metadata';
    incoming.loop = !this.autoPlay;
    incoming.volume = 0;
    const endedHandler = () => this.handleTrackEnded(incoming);
    this.endedHandlers.set(incoming, endedHandler);
    incoming.addEventListener?.('ended', endedHandler);
    // Keep the MP3 as a media URL so the browser can progressively fetch it or use HTTP ranges.
    incoming.src = track.src;
    this.activeAudios.add(incoming);

    try {
      await incoming.play();
    } catch (error) {
      this.dispose(incoming);
      if (generation !== this.generation) return false;
      await this.fade(generation, this.currentAudio);
      throw error;
    }

    if (generation !== this.generation) {
      this.dispose(incoming);
      return false;
    }

    this.currentAudio = incoming;
    this._selectedId = nextId;
    await this.fade(generation, incoming);
    return true;
  }

  handleTrackEnded(audio) {
    if (!this.autoPlay || audio !== this.currentAudio || this.trackChangeRequest) return;
    const trackIds = [...this.tracks.keys()];
    if (!trackIds.length) return;
    const currentIndex = trackIds.indexOf(this._selectedId);
    const nextId = trackIds[(currentIndex + 1 + trackIds.length) % trackIds.length];
    const request = this.select(nextId).catch(() => false);
    const trackedRequest = request.finally(() => {
      if (this.trackChangeRequest === trackedRequest) this.trackChangeRequest = null;
    });
    this.trackChangeRequest = trackedRequest;
  }

  async fade(generation, incoming) {
    const participants = [...this.activeAudios];
    if (!participants.length) return;
    const startVolumes = new Map(participants.map((audio) => [audio, audio.volume]));

    await new Promise((resolve) => {
      let startedAt = null;
      const step = (now) => {
        if (generation !== this.generation) return resolve();
        if (startedAt === null) startedAt = now;
        const progress = this.fadeDuration <= 0 ? 1 : Math.min(1, (now - startedAt) / this.fadeDuration);
        for (const audio of participants) {
          const from = startVolumes.get(audio);
          const to = audio === incoming ? this.volume : 0;
          audio.volume = from + ((to - from) * progress);
        }
        if (progress < 1) this.requestFrame(step);
        else resolve();
      };
      this.requestFrame(step);
    });

    if (generation !== this.generation) return;
    for (const audio of participants) {
      if (audio !== incoming) this.dispose(audio);
    }
  }

  stop({ fade = true } = {}) {
    if (fade) return this.select('');
    this.generation += 1;
    this.currentAudio = null;
    this._selectedId = '';
    for (const audio of [...this.activeAudios]) this.dispose(audio);
    return Promise.resolve();
  }

  dispose(audio) {
    this.activeAudios.delete(audio);
    const endedHandler = this.endedHandlers.get(audio);
    if (endedHandler) audio.removeEventListener?.('ended', endedHandler);
    this.endedHandlers.delete(audio);
    audio.pause();
    try { audio.currentTime = 0; } catch { /* media may not be seekable yet */ }
    audio.removeAttribute?.('src');
    audio.load?.();
  }
}

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
    this.ambientAudio.volume = 0.12;
    void this.ambientAudio.play().catch((error) => this.onError?.(error));
  }

  scheduleEvent() {
    if (!this.running) return;
    const delay = 14000 + Math.round(this.random() * 16000);
    this.eventTimer = this.setTimeout(() => {
      if (!this.running) return;
      const effects = ['pourSake', 'pourWater', 'shake', 'clinking', 'ice'];
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
