// Continuous mono capture for automatic server VAD. No manual activity markers.
class AvatarPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = true;
    this.ratio = sampleRate / 16000;
    this.weight = 0;
    this.sum = 0;
    this.count = 0;
    this.energy = 0;
    this.bytes = new Uint8Array(640); // 20 ms of 16 kHz PCM16 LE
    this.view = new DataView(this.bytes.buffer);
    this.port.onmessage = ({ data }) => { if (data.type === "stop") this.running = false; };
  }
  append(value) {
    const sample = Math.max(-1, Math.min(1, value));
    this.view.setInt16(this.count * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    this.energy += sample * sample;
    if (++this.count < 320) return;
    const bytes = this.bytes.slice();
    this.port.postMessage({ bytes, level: Math.min(1, Math.sqrt(this.energy / 320) * 3.5) }, [bytes.buffer]);
    this.count = 0;
    this.energy = 0;
  }
  process(inputs) {
    if (!this.running) return false;
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    // Preserve fractional positions between render blocks, including 44.1 kHz input.
    for (const sample of samples) {
      let available = 1;
      while (available > 1e-8) {
        const take = Math.min(available, this.ratio - this.weight);
        this.sum += sample * take;
        this.weight += take;
        available -= take;
        if (this.weight >= this.ratio - 1e-8) {
          this.append(this.sum / this.weight);
          this.sum = 0;
          this.weight = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("avatar-pcm-capture", AvatarPcmCapture);
