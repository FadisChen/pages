const AUDIO_OUTPUT_RATE = 24000;

class GeminiAudioPlayer {
  constructor(bus) {
    this.bus = bus;
    this.context = null;
    this.outputGain = null;
    this.analyser = null;
    this.activeSources = new Set();
    this.nextPlayTime = 0;
    this.lastEnqueueAt = 0;
  }
  async ensureContext() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error("此瀏覽器不支援 Web Audio API。");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      this.outputGain = this.context.createGain();
      this.outputGain.gain.value = .92;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = .55;
      this.outputGain.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.nextPlayTime = this.context.currentTime;
    }
    if (this.context.state === "suspended") await this.context.resume();
    return this.context;
  }
  getContext() { return this.context; }
  getAnalyser() { return this.analyser; }
  enqueue(bytes, sampleRate = AUDIO_OUTPUT_RATE) {
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
    // A small startup cushion absorbs ordinary arrival jitter; contiguous chunks add no new gap.
    const startAt = Math.max(this.context.currentTime + (this.activeSources.size ? 0 : .12), this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.lastEnqueueAt = performance.now();
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      try { source.disconnect(); } catch (_) { /* already disconnected */ }
      if (!this.activeSources.size) this.bus.emit("audio.drained", {});
    };
    this.bus.emit("audio.started", { sampleRate, duration: buffer.duration });
  }
  isPlaying() { return Boolean(this.context && this.nextPlayTime > this.context.currentTime + .018 && this.activeSources.size); }
  stop() {
    for (const source of this.activeSources) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch (_) { /* already stopped */ }
    }
    this.activeSources.clear();
    if (this.context) this.nextPlayTime = this.context.currentTime;
    this.lastEnqueueAt = 0;
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


export { GeminiAudioPlayer };
