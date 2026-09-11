import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as emotions from "../avatar-emotions.js";
import * as transcript from "../transcript.js";
import { shouldPlayLiveAudio } from "../live-audio-policy.js";

const root = new URL("../", import.meta.url);
function loadPage(extra = {}) {
  let source = readFileSync(new URL("app.js", root), "utf8").replace(/^import[\s\S]*?;\r?\n/gm, "");
  source = source.replaceAll("import.meta.url", JSON.stringify(new URL("app.js", root).href));
  source = source.replace(/  if \(document.readyState[\s\S]*$/, "globalThis.page = { App, EventBus, GeminiLiveClient, GeminiAudioPlayer, MicrophoneInput };\n})();");
  const context = vm.createContext({ ...emotions, ...transcript, shouldPlayLiveAudio,
    document: { addEventListener() {} }, window: { addEventListener() {} }, WebSocket: { OPEN: 1 },
    isSecureContext: true, setTimeout, clearTimeout, performance, Uint8Array, Float32Array,
    ArrayBuffer, DataView, TextDecoder, URL, atob, btoa, ...extra,
  });
  vm.runInContext(source, context, { filename: "Avatar/app.js" });
  return context.page;
}

function fixture() {
  const { App, EventBus, GeminiLiveClient } = loadPage();
  const bus = new EventBus(), played = [], sent = [];
  let stops = 0;
  const element = { addEventListener() {}, classList: { toggle() {} }, setAttribute() {} };
  const app = Object.assign(Object.create(App.prototype), {
    bus, ui: new Proxy({}, { get: () => element }), callActive: true,
    stateMachine: { toThinking() {}, toListening() {}, toSpeaking() {}, transition() {}, toIdle() {} },
    audioPlayer: { enqueue: (bytes, rate) => played.push({ bytes: [...bytes], rate }), stop: () => stops++ },
    lipSync: { reset() {} }, transcript: { add() {}, clearPartial() {} },
    showError() {}, setConnectionStatus() {},
  });
  const client = new GeminiLiveClient(bus);
  const socket = { readyState: 1, send: raw => sent.push(JSON.parse(raw)), close() {} };
  Object.assign(client, { socket, ready: true, stopped: false, initialContextSent: true, config: { voice: "Aoede" } });
  app.gemini = client;
  app.bindEvents();
  return { app, client, socket, played, sent, stops: () => stops };
}

const audio = (rate = 24000) => ({ modelTurn: { parts: [{ inlineData: { mimeType: `audio/pcm;rate=${rate}`, data: "AQA=" } }] } });
const toolCall = { functionCalls: [{ id: "emotion-1", name: "set_avatar_emotion", args: { emotion: "happy" } }] };

test("emotion changes leave queued speech intact", () => {
  const f = fixture();
  f.client.handleMessage(f.socket, { serverContent: audio() });
  f.client.handleMessage(f.socket, { toolCall });
  assert.equal(f.stops(), 0);
  assert.equal(f.sent.filter(message => message.toolResponse).length, 1);
});

test("PCM in a tool-call packet is delivered exactly once", () => {
  const f = fixture();
  f.client.handleMessage(f.socket, { serverContent: audio(), toolCall });
  assert.deepEqual(f.played, [{ bytes: [1, 0], rate: 24000 }]);
  assert.equal(f.stops(), 0);
});

test("a decoded Blob from an old connection cannot replay audio", async () => {
  const f = fixture();
  let decode;
  const pending = f.client.handleRawMessage(f.socket, { text: () => new Promise(resolve => { decode = resolve; }) });
  f.client.socket = { readyState: 1 };
  decode(JSON.stringify({ serverContent: audio() }));
  await pending;
  assert.deepEqual(f.played, []);
});

test("offline microphone audio is not replayed after setup completes", () => {
  const f = fixture();
  f.client.ready = false;
  f.client.sendAudio(new Uint8Array([1, 0]));
  f.client.handleMessage(f.socket, { setupComplete: {} });
  assert.equal(f.sent.filter(message => message.realtimeInput?.audio).length, 0);
});

test("GoAway notice does not cut off an active response", () => {
  const f = fixture();
  let closes = 0;
  f.socket.close = () => closes++;
  f.client.handleMessage(f.socket, { serverContent: audio() });
  f.client.handleMessage(f.socket, { goAway: { timeLeft: "30s" } });
  assert.equal(closes, 0);
});

test("the PCM sample rate is preserved instead of changing playback pitch", () => {
  const f = fixture();
  f.client.handleMessage(f.socket, { serverContent: audio(16000) });
  assert.equal(f.played[0].rate, 16000);
});

test("interrupt packets stop output before any stale co-delivered PCM can play", () => {
  const f = fixture();
  f.client.handleMessage(f.socket, { serverContent: { ...audio(), interrupted: true } });
  assert.equal(f.stops(), 1);
  assert.deepEqual(f.played, []);
});

test("automatic VAD and continuous microphone input remain enabled", () => {
  const f = fixture();
  assert.equal(f.client.setupMessage().setup.realtimeInputConfig.automaticActivityDetection.disabled, false);
  f.client.sendAudio(new Uint8Array([1, 0]));
  assert.equal(f.sent.length, 1);
  assert.ok(f.sent[0].realtimeInput.audio);
});

test("voice selection is snapshotted for reconnects", () => {
  const f = fixture();
  f.client.connect = () => {};
  const config = { voice: "Aoede" };
  f.client.start(config);
  config.voice = "Puck";
  assert.equal(f.client.setupMessage().setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Aoede");
});

test("server errors stop the connection from accepting microphone data", () => {
  const f = fixture();
  f.client.handleMessage(f.socket, { error: { message: "test failure" } });
  assert.equal(f.client.isConnected(), false);
  f.client.sendAudio(new Uint8Array([1, 0]));
  assert.equal(f.sent.length, 0);
});

test("ending a call during microphone permission releases a late stream", async () => {
  let grant;
  let requested;
  const permissionRequested = new Promise(resolve => { requested = resolve; });
  let trackStops = 0;
  const track = { stop: () => trackStops++, applyConstraints: async () => {} };
  const { MicrophoneInput, EventBus } = loadPage({ navigator: { mediaDevices: {
    getUserMedia: () => new Promise(resolve => { grant = resolve; requested(); }),
  } } });
  const context = { createMediaStreamSource() { throw new Error("Cancelled capture must not create a graph"); } };
  const mic = new MicrophoneInput({ ensureContext: async () => context }, new EventBus());
  const pending = mic.start(() => {});
  await permissionRequested;
  await mic.stop();
  grant({ getTracks: () => [track], getAudioTracks: () => [track] });
  await pending;
  assert.equal(trackStops, 1);
  assert.equal(mic.running, false);
  assert.equal(mic.stream, null);
});

test("normal packet jitter does not create gaps between playback buffers", () => {
  const { GeminiAudioPlayer, EventBus } = loadPage();
  const starts = [];
  const player = new GeminiAudioPlayer(new EventBus());
  player.outputGain = {};
  player.context = { currentTime: 0,
    createBuffer: (_, count, rate) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) }),
    createBufferSource: () => ({ connect() {}, start: time => starts.push(time) }),
  };
  for (const arrival of [0, .14, .23]) { player.context.currentTime = arrival; player.enqueue(new Uint8Array(4800)); }
  assert.ok(Math.abs(starts[1] - starts[0] - .1) < 1e-8);
  assert.ok(Math.abs(starts[2] - starts[1] - .1) < 1e-8);
});

for (const rate of [16000, 44100, 48000]) {
  test(`continuous worklet at ${rate} Hz keeps exactly 16000 samples per second`, () => {
    let Processor;
    const frames = [];
    const context = vm.createContext({ sampleRate: rate, Uint8Array, DataView,
      AudioWorkletProcessor: class { constructor() { this.port = { postMessage: message => frames.push(message) }; } },
      registerProcessor: (_, type) => { Processor = type; },
    });
    vm.runInContext(readFileSync(new URL("pcm-capture.worklet.js", root), "utf8"), context);
    const processor = new Processor();
    const input = new Float32Array(rate).fill(.25);
    for (let i = 0; i < rate; i += 128) assert.equal(processor.process([[input.subarray(i, i + 128)]]), true);
    assert.equal(frames.length, 50);
    assert.ok(frames.every(frame => frame.bytes.length === 640));
    assert.equal(new DataView(frames.at(-1).bytes.buffer).getInt16(638, true), 8191);
    assert.ok(frames.every(frame => Math.abs(frame.level - .875) < 1e-8));
    processor.port.onmessage({ data: { type: "stop" } });
    assert.equal(processor.process([[input.subarray(0, 128)]]), false);
    assert.equal(frames.length, 50);
  });
}

test("stopping before AudioContext is ready never opens a microphone", async () => {
  let resume;
  let requests = 0;
  const { MicrophoneInput, EventBus } = loadPage({ navigator: { mediaDevices: { getUserMedia: () => requests++ } } });
  const mic = new MicrophoneInput({ ensureContext: () => new Promise(resolve => { resume = resolve; }) }, new EventBus());
  const pending = mic.start(() => {});
  await mic.stop();
  resume({});
  await pending;
  assert.equal(requests, 0);
  assert.equal(mic.context, null);
});
