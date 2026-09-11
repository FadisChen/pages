// PTT markers and PCM leave the audio thread through the same ordered MessagePort.
// This preserves the partial final frame even when pointerup runs before the next UI callback.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.ratio = sampleRate / 16000;
    this.reset();
    this.port.onmessage = ({ data }) => {
      if (data.type === "start" && !this.active) {
        this.reset();
        this.active = true;
        this.port.postMessage({ type: "ptt", active: true });
      } else if (data.type === "end" && this.active) {
        if (this.weight > 1e-8) this.append(this.sum / this.weight);
        this.flush();
        this.active = false;
        this.port.postMessage({ type: "ptt", active: false });
      }
    };
  }
  reset() {
    this.bytes = new Uint8Array(640); // 20 ms, mono, 16 kHz PCM16 LE
    this.view = new DataView(this.bytes.buffer);
    this.count = 0;
    this.sum = 0;
    this.weight = 0;
  }
  append(value) {
    const sample = Math.max(-1, Math.min(1, value));
    this.view.setInt16(this.count * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    this.count++;
    if (this.count === 320) this.flush();
  }
  flush() {
    if (!this.count) return;
    const bytes = this.bytes.slice(0, this.count * 2);
    this.port.postMessage({ type: "audio", bytes }, [bytes.buffer]);
    this.count = 0;
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!this.active || !samples) return true;
    // Carry the fractional sample position across render quanta (including 44.1 kHz input).
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

registerProcessor("yep-pcm-capture", PcmCaptureProcessor);
