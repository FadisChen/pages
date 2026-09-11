import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as emotions from "../../Avatar/avatar-emotions.js";
import * as transcript from "../../Avatar/transcript.js";

const root = new URL("../", import.meta.url);
const shared = {};
for (const name of ["live-session.js", "audio-player.js", "microphone.js", "host-config.js", "webrtc-link.js"]) {
  Object.assign(shared, await import(new URL(name, root)));
}

// Exercise the page's real event wiring without loading Three.js or creating a VRM.
function loadPage(name) {
  let source = readFileSync(new URL(name, root), "utf8").replace(/^import[\s\S]*?;\r?\n/gm, "");
  source = source.replace(/  if \(document.readyState[\s\S]*$/, "globalThis.page = { App, EventBus, GeminiLiveClient, GeminiAudioPlayer };\n})();");
  const context = vm.createContext({ ...emotions, ...transcript, ...shared,
    document: { addEventListener() {} }, window: { addEventListener() {} }, WebSocket: { OPEN: 1 },
    setTimeout, clearTimeout, performance, Uint8Array, ArrayBuffer, DataView, atob, btoa,
  });
  vm.runInContext(source, context, { filename: name });
  return context.page;
}

function fixture(name) {
  const { App, EventBus, GeminiLiveClient } = loadPage(name);
  const bus = new EventBus();
  const played = [], sent = [];
  let stops = 0;
  const element = { addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {} };
  const app = Object.assign(Object.create(App.prototype), {
    bus, ui: new Proxy({}, { get: () => element }), callActive: true, pttActive: false,
    stateMachine: { toThinking() {}, toListening() {}, toSpeaking() {}, transition() {} },
    audioPlayer: { enqueue: (bytes) => played.push(...bytes), stop: () => stops++, getContext: () => ({}) },
    lipSync: { reset() {} }, transcript: { add() {}, clearPartial() {} },
    peerLink: { send() {} }, showError() {}, showToast() {}, setConnectionStatus() {},
  });
  const client = new GeminiLiveClient(bus);
  const socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  Object.assign(client, { socket, ready: true, stopped: false, config: { voice: "Aoede" } });
  app.gemini = client;
  app.bindEvents();
  return { app, client, socket, played, sent, stops: () => stops };
}

const audio = { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AQA=" } }] } };
const toolCall = { functionCalls: [{ id: "emotion-1", name: "set_avatar_emotion", args: { emotion: "happy" } }] };

for (const page of ["app.js", "stage.js"]) {
  test(`${page}: an emotion tool must not cut off already queued speech`, () => {
    const f = fixture(page);
    f.client.handleMessage(f.socket, { serverContent: audio });
    f.client.handleMessage(f.socket, { toolCall });
    assert.equal(f.stops(), 0);
    assert.equal(f.sent.filter(x => x.toolResponse).length, 1);
  });

  test(`${page}: audio delivered alongside an emotion tool is played once`, () => {
    const f = fixture(page);
    f.client.handleMessage(f.socket, { serverContent: audio, toolCall });
    assert.deepEqual(f.played, [1, 0]);
    assert.equal(f.stops(), 0);
  });

  test(`${page}: a delayed Blob from a replaced socket cannot replay speech`, async () => {
    const f = fixture(page);
    let decode;
    const pending = f.client.handleRawMessage(f.socket, { text: () => new Promise(resolve => { decode = resolve; }) });
    f.client.socket = { readyState: 1, send() {} };
    decode(JSON.stringify({ serverContent: audio }));
    await pending;
    assert.deepEqual(f.played, []);
  });
}

test("remote PTT: delayed media tail is not lost when release arrives first", () => {
  const f = fixture("stage.js");
  const frames = [new Uint8Array([1, 0]), new Uint8Array([2, 0])];
  // Source-side framing puts the final samples before release on one ordered channel.
  f.app.handlePeerData({ type: "ptt", active: true });
  for (const bytes of frames) f.app.handlePeerData({ type: "audio", bytes });
  f.app.handlePeerData({ type: "ptt", active: false });
  const pcm = f.sent.flatMap(x => x.realtimeInput?.audio ? [...Buffer.from(x.realtimeInput.audio.data, "base64")] : []);
  assert.deepEqual(pcm, [1, 0, 2, 0]);
  assert.ok(f.sent.at(-1).realtimeInput.activityEnd);
});

function captureUtterance(rate, samples) {
  const messages = [];
  let Processor;
  const context = vm.createContext({ sampleRate: rate, Uint8Array, DataView,
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: message => messages.push(message) }; } },
    registerProcessor: (_, type) => { Processor = type; },
  });
  vm.runInContext(readFileSync(new URL("pcm-capture.worklet.js", root), "utf8"), context);
  const processor = new Processor();
  processor.process([[new Float32Array(128).fill(1)]]); // No audio outside PTT.
  assert.equal(messages.length, 0);
  processor.port.onmessage({ data: { type: "start" } });
  for (let i = 0; i < samples.length; i += 128) processor.process([[samples.subarray(i, i + 128)]]);
  processor.port.onmessage({ data: { type: "end" } });
  processor.port.onmessage({ data: { type: "end" } }); // Duplicate release is harmless.
  processor.process([[new Float32Array(128).fill(1)]]);
  return messages;
}

for (const rate of [16000, 44100, 48000]) {
  test(`capture at ${rate} Hz preserves the last partial frame and PTT order`, () => {
    const messages = captureUtterance(rate, new Float32Array(rate / 20).fill(.5));
    assert.equal(messages[0].type, "ptt");
    assert.equal(messages[0].active, true);
    assert.equal(messages.at(-1).type, "ptt");
    assert.equal(messages.at(-1).active, false);
    const frames = messages.slice(1, -1);
    assert.ok(frames.every(frame => frame.type === "audio"));
    assert.deepEqual(frames.map(frame => frame.bytes.length), [640, 640, 320]);
    const view = new DataView(frames.at(-1).bytes.buffer);
    assert.equal(view.getInt16(318, true), 16383);
  });
}

test("one captured utterance reaches Gemini byte-for-byte through the remote page", () => {
  const f = fixture("stage.js");
  const messages = captureUtterance(44100, Float32Array.from({ length: 2205 }, (_, i) => Math.sin(i * .03)));
  for (const message of messages) f.app.handlePeerData(message);
  const sentFrames = f.sent.filter(x => x.realtimeInput?.audio).map(x => Buffer.from(x.realtimeInput.audio.data, "base64"));
  const capturedFrames = messages.filter(x => x.type === "audio").map(x => Buffer.from(x.bytes));
  assert.deepEqual(Buffer.concat(sentFrames), Buffer.concat(capturedFrames));
  assert.equal(f.sent.length, messages.length);
});

test("offline microphone frames are discarded and cannot leak into the next session", () => {
  const f = fixture("stage.js");
  f.client.activityStart();
  f.client.ready = false;
  f.client.sendAudio(new Uint8Array([1, 0]));
  f.client.activityEnd();
  f.client.ready = true;
  f.client.handleMessage(f.socket, { setupComplete: {} });
  f.client.sendAudio(new Uint8Array([2, 0]));
  assert.equal(f.sent.filter(x => x.realtimeInput?.audio).length, 0);
});

test("GoAway waits for both turn completion and actual playback drain", () => {
  const f = fixture("stage.js");
  let closes = 0;
  f.socket.close = () => closes++;
  f.client.handleMessage(f.socket, { serverContent: audio });
  f.client.handleMessage(f.socket, { goAway: { timeLeft: "30s" } });
  assert.equal(closes, 0);
  f.client.handleMessage(f.socket, { serverContent: { turnComplete: true } });
  assert.equal(closes, 0);
  f.app.bus.emit("audio.drained", {});
  assert.equal(closes, 1);
});

test("voice choice is pinned for the session and defaults to Aoede when empty", () => {
  const f = fixture("stage.js");
  f.client.connect = () => {};
  f.socket.close = () => {};
  const config = { voice: "Aoede" };
  f.client.start(config);
  config.voice = "Puck";
  const voice = () => f.client.setupMessage().setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
  assert.equal(voice(), "Aoede");
  f.client.resumptionHandle = "resume-same-session";
  assert.equal(voice(), "Aoede");
  f.client.start({ voice: " " });
  assert.equal(voice(), "Aoede");
});

test("short packet jitter does not introduce gaps between scheduled audio chunks", () => {
  const { GeminiAudioPlayer, EventBus } = loadPage("app.js");
  const starts = [];
  const player = new GeminiAudioPlayer(new EventBus());
  player.outputGain = {};
  player.context = {
    currentTime: 0,
    createBuffer: (_, count, rate) => ({ duration: count / rate, getChannelData: () => new Float32Array(count) }),
    createBufferSource: () => ({ connect() {}, start: at => starts.push(at) }),
  };
  for (const arrival of [0, .14, .23]) {
    player.context.currentTime = arrival;
    player.enqueue(new Uint8Array(4800), 24000);
  }
  assert.deepEqual(starts, [.12, .22, .32]);
});
