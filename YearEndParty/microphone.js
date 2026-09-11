const MICROPHONE_CONSTRAINTS = Object.freeze({
  echoCancellation: { ideal: true }, noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true }, channelCount: { ideal: 1 },
});

class MicrophoneInput {
  constructor(audioPlayer = null, bus = { emit() {} }) {
    this.audioPlayer = audioPlayer;
    this.bus = bus;
    this.context = null;
    this.stream = null;
    this.processor = null;
    this.source = null;
    this.muteGain = null;
    this.running = false;
    this.generation = 0;
    this.pttRequest = 0;
  }
  async start(onMessage) {
    if (this.running) return;
    const generation = ++this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("麥克風需要 HTTPS 或 localhost，以及支援收音的瀏覽器。");
    if (this.audioPlayer) this.context = await this.audioPlayer.ensureContext();
    else {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      this.context = new AudioContextClass({ latencyHint: "interactive" });
      await this.context.resume();
    }
    if (generation !== this.generation) return;
    const context = this.context;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MICROPHONE_CONSTRAINTS, video: false });
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      await context.audioWorklet.addModule(new URL("./pcm-capture.worklet.js", import.meta.url));
      if (generation !== this.generation) return;
      this.source = context.createMediaStreamSource(stream);
      this.processor = new AudioWorkletNode(context, "yep-pcm-capture", { channelCount: 1, channelCountMode: "explicit" });
      this.muteGain = context.createGain();
      this.muteGain.gain.value = 0;
      this.processor.port.onmessage = ({ data }) => {
        if (!this.running || generation !== this.generation) return;
        if (data.type === "audio") {
          const view = new DataView(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength);
          let sum = 0;
          for (let i = 0; i < view.byteLength; i += 2) sum += (view.getInt16(i, true) / 32768) ** 2;
          this.bus.emit("audio.input-level", { level: Math.min(1, Math.sqrt(sum / (view.byteLength / 2)) * 3.5) });
        }
        if (data.type === "ptt" && !data.active) this.bus.emit("audio.input-level", { level: 0 });
        onMessage(data);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.muteGain);
      this.muteGain.connect(context.destination);
      this.running = true;
      this.bus.emit("microphone.started", {});
    } catch (error) {
      if (generation !== this.generation) return;
      await this.stop();
      if (error?.name === "NotAllowedError") throw new Error("麥克風權限被拒絕，請在瀏覽器設定允許麥克風後再試。");
      throw new Error(`麥克風音訊管線建立失敗：${error?.message || error}`);
    }
  }
  async begin() {
    const request = ++this.pttRequest;
    if (!this.running) return;
    if (this.context.state === "suspended") await this.context.resume();
    if (this.running && request === this.pttRequest) this.processor.port.postMessage({ type: "start" });
  }
  end() {
    this.pttRequest++;
    if (this.running) this.processor.port.postMessage({ type: "end" });
    this.bus.emit("audio.input-level", { level: 0 });
  }
  async stop() {
    this.generation++;
    this.pttRequest++;
    this.running = false;
    if (this.processor) { this.processor.port.onmessage = null; this.processor.port.close(); this.processor.disconnect(); }
    this.source?.disconnect();
    this.muteGain?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    const context = this.context;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.muteGain = null;
    this.bus.emit("microphone.stopped", {});
    if (!this.audioPlayer && context?.state !== "closed") await context?.close();
  }
}

export { MicrophoneInput, MICROPHONE_CONSTRAINTS };
