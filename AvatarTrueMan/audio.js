const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const INPUT_CHUNK_MS = 20;
const INPUT_CHUNK_SAMPLES = INPUT_SAMPLE_RATE * INPUT_CHUNK_MS / 1000;
const AUDIO_WORKLET_URL = new URL("./pcm-capture.worklet.js", import.meta.url);

export { INPUT_SAMPLE_RATE, OUTPUT_SAMPLE_RATE, INPUT_CHUNK_MS, INPUT_CHUNK_SAMPLES };

export class VisemeStabilizer {
  constructor({ holdMs = 55, silenceHoldMs = 85 } = {}) {
    this.holdMs = holdMs;
    this.silenceHoldMs = silenceHoldMs;
    this.current = "none";
    this.candidate = "none";
    this.candidateSince = 0;
  }

  update(next, now = performance.now()) {
    const value = next || "none";
    if (value === this.current) {
      this.candidate = value;
      this.candidateSince = now;
      return this.current;
    }
    if (value !== this.candidate) {
      this.candidate = value;
      this.candidateSince = now;
      return this.current;
    }
    const holdMs = value === "none" ? this.silenceHoldMs : this.holdMs;
    if (now - this.candidateSince >= holdMs) this.current = value;
    return this.current;
  }

  reset() {
    this.current = "none";
    this.candidate = "none";
    this.candidateSince = 0;
  }
}

export class GeminiAudioPlayer {
  constructor(bus) {
    this.bus = bus;
    this.context = null;
    this.outputGain = null;
    this.analyser = null;
    this.activeSources = new Set();
    this.nextPlayTime = 0;
  }

  async ensureContext() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error("此瀏覽器不支援 Web Audio API。");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.outputGain = this.context.createGain();
      this.outputGain.gain.value = 0.92;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.35;
      this.outputGain.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.nextPlayTime = this.context.currentTime;
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }

  getAnalyser() {
    return this.analyser;
  }

  enqueue(bytes, sampleRate = OUTPUT_SAMPLE_RATE) {
    if (!this.context || !this.outputGain || !bytes?.byteLength) return;
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (!sampleCount) return;
    const buffer = this.context.createBuffer(1, sampleCount, sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < sampleCount; index += 1) channel[index] = view.getInt16(index * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputGain);
    const startAt = Math.max(this.context.currentTime + (this.activeSources.size ? 0 : 0.12), this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      try { source.disconnect(); } catch (_) { /* already disconnected */ }
      if (!this.activeSources.size) this.bus.emit("audio.drained", {});
    };
    this.bus.emit("audio.started", { sampleRate, duration: buffer.duration });
  }

  isPlaying() {
    return Boolean(this.context && this.nextPlayTime > this.context.currentTime + 0.018 && this.activeSources.size);
  }

  stop() {
    for (const source of this.activeSources) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch (_) { /* already stopped */ }
    }
    this.activeSources.clear();
    if (this.context) this.nextPlayTime = this.context.currentTime;
    this.bus.emit("audio.stopped", {});
  }

  async close() {
    this.stop();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
    this.outputGain = null;
    this.analyser = null;
  }
}

export class MicrophoneInput {
  constructor(audioPlayer, bus) {
    this.audioPlayer = audioPlayer;
    this.bus = bus;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.muteGain = null;
    this.running = false;
    this.generation = 0;
  }

  async start(onChunk) {
    if (this.running) return;
    const generation = ++this.generation;
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname);
    if (!globalThis.isSecureContext && !isLocal) throw new Error("麥克風需要 HTTPS 或 localhost。");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("此瀏覽器不提供麥克風擷取 API。");
    const context = await this.audioPlayer.ensureContext();
    if (generation !== this.generation) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      try {
        await stream.getAudioTracks()[0]?.applyConstraints({ echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true }, channelCount: { ideal: 1 } });
      } catch (_) { /* optional constraints */ }
    } catch (error) {
      throw formatMicrophoneError(error);
    }
    try {
      await context.audioWorklet.addModule(AUDIO_WORKLET_URL);
      if (generation !== this.generation) {
        await this.stop();
        return;
      }
      this.context = context;
      this.source = context.createMediaStreamSource(stream);
      this.processor = new AudioWorkletNode(context, "avatar-pcm-capture", { channelCount: 1, channelCountMode: "explicit" });
      this.muteGain = context.createGain();
      this.muteGain.gain.value = 0;
      this.processor.port.onmessage = ({ data }) => {
        if (!this.running || generation !== this.generation) return;
        onChunk?.(data.bytes);
        this.bus.emit("audio.input-level", { level: data.level });
      };
      this.source.connect(this.processor);
      this.processor.connect(this.muteGain);
      this.muteGain.connect(context.destination);
      this.running = true;
      this.bus.emit("microphone.started", {});
    } catch (error) {
      await this.stop();
      throw new Error(`麥克風音訊管線建立失敗：${error?.message || "未知錯誤"}`);
    }
  }

  async stop() {
    this.generation += 1;
    this.running = false;
    if (this.processor) {
      this.processor.port.onmessage = null;
      this.processor.port.postMessage({ type: "stop" });
      this.processor.port.close();
      try { this.processor.disconnect(); } catch (_) { /* already disconnected */ }
    }
    try { this.source?.disconnect(); } catch (_) { /* already disconnected */ }
    try { this.muteGain?.disconnect(); } catch (_) { /* already disconnected */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.muteGain = null;
    this.bus.emit("audio.input-level", { level: 0 });
    this.bus.emit("microphone.stopped", {});
  }
}

export class LipSyncEngine {
  constructor(audioPlayer, bus) {
    this.audioPlayer = audioPlayer;
    this.bus = bus;
    this.analyser = null;
    this.timeData = null;
    this.frequencyData = null;
    this.currentWeight = 0;
    this.currentViseme = "none";
    this.visemeStabilizer = new VisemeStabilizer({ holdMs: 35 });
    this.rms = 0;
    this.elapsed = 0;
    this.envelopePeak = 0;
    this.gateOpen = false;
    this.quietFor = 0;
    this.closedFor = 0.06;
  }

  attach() {
    this.analyser = this.audioPlayer.getAnalyser();
    if (this.analyser) {
      this.timeData = new Uint8Array(this.analyser.fftSize);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    }
  }

  reset() {
    this.currentWeight = 0;
    this.currentViseme = "none";
    this.visemeStabilizer.reset();
    this.rms = 0;
    this.elapsed = 0;
    this.envelopePeak = 0;
    this.gateOpen = false;
    this.quietFor = 0;
    this.closedFor = 0.06;
    this.bus.emit("avatar.viseme", { viseme: "none", weight: 0, rms: 0 });
  }

  update(deltaTime) {
    this.elapsed += deltaTime * 1000;
    let targetWeight = 0;
    let viseme = "none";
    let rawViseme = "none";
    let rawRms = 0;
    if (this.analyser && this.audioPlayer.isPlaying()) {
      this.analyser.getByteTimeDomainData(this.timeData);
      this.analyser.getByteFrequencyData(this.frequencyData);
      let sum = 0;
      // Keep the newest 12 ms: the full FFT window smears short syllable gaps.
      const count = Math.min(this.timeData.length, Math.round(this.analyser.context.sampleRate * 0.012));
      for (let index = this.timeData.length - count; index < this.timeData.length; index++) {
        const sample = (this.timeData[index] - 128) / 128;
        sum += sample * sample;
      }
      rawRms = Math.sqrt(sum / count);
    }
    this.envelopePeak = Math.max(rawRms, this.envelopePeak * Math.exp(-deltaTime / 0.45));
    const closeThreshold = Math.max(0.012, this.envelopePeak * 0.28);
    const openThreshold = Math.max(0.018, this.envelopePeak * 0.42);
    if (this.gateOpen) {
      this.quietFor = rawRms < closeThreshold ? this.quietFor + deltaTime : 0;
      if (this.quietFor >= 0.018) { this.gateOpen = false; this.closedFor = 0; }
    } else {
      this.closedFor += deltaTime;
      if (rawRms >= openThreshold && this.closedFor >= 0.06) { this.gateOpen = true; this.quietFor = 0; }
    }
    if (this.gateOpen && this.analyser) {
      const binHz = this.analyser.context.sampleRate / this.analyser.fftSize;
      const low = bandAverage(this.frequencyData, Math.ceil(80 / binHz), Math.ceil(300 / binHz));
      const mid = bandAverage(this.frequencyData, Math.ceil(300 / binHz), Math.ceil(1000 / binHz));
      const high = bandAverage(this.frequencyData, Math.ceil(1000 / binHz), Math.ceil(3000 / binHz));
      const total = Math.max(1, low + mid + high);
      rawViseme = classifyViseme(low / total, mid / total, high / total);
      if (rawRms < 0.065 && (rawViseme === "ou" || rawViseme === "oh")) rawViseme = "ih";
      const relativeLevel = clamp((rawRms - closeThreshold) / (Math.max(0.08, this.envelopePeak) - closeThreshold), 0, 1);
      targetWeight = 0.32 * Math.pow(relativeLevel, 1.3);
    }
    const factor = 1 - Math.exp(-deltaTime / (targetWeight > this.currentWeight ? 0.025 : 0.055));
    this.currentWeight += (targetWeight - this.currentWeight) * factor;
    // Silence bypasses vowel stabilization. The avatar supplies a short physical
    // closing motion instead of three stacked smoothing/hold delays.
    if (!this.gateOpen) this.currentWeight = 0;
    if (this.currentWeight < 0.012) {
      this.currentWeight = 0;
      this.visemeStabilizer.reset();
      viseme = "none";
    } else {
      // Open promptly at speech onset; debounce only changes within a phrase.
      if (this.visemeStabilizer.current === "none" && rawViseme !== "none") {
        this.visemeStabilizer.current = rawViseme;
      }
      viseme = this.visemeStabilizer.update(rawViseme, this.elapsed);
    }
    this.rms += (rawRms - this.rms) * (1 - Math.exp(-deltaTime * 16));
    this.currentViseme = viseme;
    this.bus.emit("avatar.viseme", { viseme, weight: this.currentWeight, rms: this.rms });
  }
}

export function classifyViseme(low, mid, high) {
  // A strong fundamental alone is common in voiced speech, not proof of /u/.
  // Keep ambiguous spectra relaxed instead of defaulting to a rounded vowel.
  if (low > mid * 2.8 && low > high * 3) return "ou";
  if (low > mid * 1.8 && mid > high * 1.35) return "oh";
  if (high > mid * 1.1) return high > low * 1.3 ? "ee" : "ih";
  if (mid > low * 1.16) return "aa";
  return "aa";
}

function bandAverage(data, start, end) {
  let total = 0;
  let count = 0;
  for (let index = start; index < Math.min(end, data.length); index += 1) {
    total += data[index];
    count += 1;
  }
  return count ? total / count : 0;
}

function formatMicrophoneError(error) {
  const name = error?.name || "UnknownError";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return new Error("麥克風權限被拒絕，請在網址列允許麥克風後再試一次。");
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return new Error("找不到可用的麥克風。");
  if (name === "NotReadableError" || name === "TrackStartError") return new Error("麥克風可能正被其他程式占用。");
  return new Error(`無法開啟麥克風（${name}：${error?.message || "未知錯誤"}）。`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
