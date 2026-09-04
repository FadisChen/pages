export function base64ToBytes(base64) {
  const cleanBase64 = String(base64).replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function concatBytes(chunks) {
  const arrays = chunks.map((chunk) => (chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)));
  const totalLength = arrays.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of arrays) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function pcmToWavBlob(pcmBytes, { sampleRate = 24000, channels = 1, bitDepth = 16 } = {}) {
  const pcm = pcmBytes instanceof Uint8Array ? pcmBytes : new Uint8Array(pcmBytes);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  return new Blob([header, pcm], { type: "audio/wav" });
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function pcm16ToFloat32(bytes) {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return samples;
}

export class PcmStreamPlayer {
  constructor({ sampleRate = 24000, channels = 1 } = {}) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("此瀏覽器不支援 Web Audio API。");
    this.context = new AudioContextClass();
    this.nextTime = this.context.currentTime + 0.05;
    this.sources = new Set();
    this.context.resume().catch(() => {});
  }

  append(bytes) {
    if (!bytes?.byteLength) return;
    const samples = pcm16ToFloat32(bytes);
    const frameCount = Math.floor(samples.length / this.channels);
    if (!frameCount) return;

    const buffer = this.context.createBuffer(this.channels, frameCount, this.sampleRate);
    for (let channel = 0; channel < this.channels; channel += 1) {
      const channelData = buffer.getChannelData(channel);
      for (let frame = 0; frame < frameCount; frame += 1) {
        channelData[frame] = samples[frame * this.channels + channel] || 0;
      }
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startTime = Math.max(this.nextTime, this.context.currentTime + 0.02);
    source.start(startTime);
    this.nextTime = startTime + buffer.duration;
    this.sources.add(source);
    source.addEventListener("ended", () => this.sources.delete(source), { once: true });
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    }
    this.sources.clear();
    this.context.close().catch(() => {});
  }
}
