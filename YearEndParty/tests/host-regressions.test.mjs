import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as emotions from "../avatar-emotions.js";
import * as gestures from "../avatar-gestures.js";
import * as transcript from "../transcript.js";

const root = new URL("../", import.meta.url);
const shared = {};
for (const name of ["live-session.js", "audio-player.js", "microphone.js", "host-config.js", "webrtc-link.js"]) {
  Object.assign(shared, await import(new URL(name, root)));
}

// Exercise the page's real event wiring without loading Three.js or creating a VRM.
function loadPage(name, extra = {}) {
  let source = readFileSync(new URL(name, root), "utf8").replace(/^import[\s\S]*?;\r?\n/gm, "");
  source = source.replace(/  if \(document.readyState[\s\S]*$/, "globalThis.page = { App, EventBus, GeminiLiveClient, GeminiAudioPlayer, VRMAvatarController };\n})();");
  const context = vm.createContext({ ...emotions, ...gestures, ...transcript, ...shared,
    document: { addEventListener() {} }, window: { addEventListener() {} }, WebSocket: { OPEN: 1 },
    setTimeout, clearTimeout, performance, Uint8Array, ArrayBuffer, DataView, atob, btoa, ...extra,
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
    stateMachine: { toThinking() {}, toListening() {}, toSpeaking() {}, transition() {}, toIdle() {} },
    audioPlayer: { enqueue: (bytes) => played.push(...bytes), stop: () => stops++, getContext: () => ({}) },
    lipSync: { reset() {} }, transcript: { add() {}, clearPartial() {} },
    mic: { stop: async () => {}, end() {} }, updateCallButton() {},
    peerLink: { send() {} }, showError() {}, showToast() {}, setConnectionStatus() {},
  });
  const client = new GeminiLiveClient(bus);
  const socket = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)), close() {} };
  Object.assign(client, { socket, ready: true, stopped: false, config: { voice: "Aoede" } });
  app.gemini = client;
  app.bindEvents();
  return { app, client, socket, played, sent, stops: () => stops };
}

const audio = { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AQA=" } }] } };
const toolCall = { functionCalls: [{ id: "emotion-1", name: "set_avatar_emotion", args: { emotion: "happy" } }] };
const gestureCall = gesture => ({ functionCalls: [{ id: `gesture-${gesture}`, name: "play_avatar_gesture", args: { gesture } }] });

for (const page of ["app.js", "stage.js"]) {
  test(`${page}: gesture tool is registered, emitted once, and does not stop speech`, () => {
    const f = fixture(page);
    const events = [];
    f.app.bus.on("avatar.gesture", event => events.push(event));
    const setupTools = f.client.setupMessage().setup.tools[0].functionDeclarations.map(tool => tool.name);
    assert.deepEqual(setupTools, ["set_avatar_emotion", "play_avatar_gesture"]);
    f.client.handleMessage(f.socket, { serverContent: audio, toolCall: gestureCall("wave") });
    assert.deepEqual(events, [{ gesture: "wave", id: "gesture-wave" }]);
    assert.equal(f.stops(), 0);
    assert.equal(f.sent.at(-1).toolResponse.functionResponses[0].response.result, "queued");
    f.client.handleMessage(f.socket, { toolCall: gestureCall("nod") });
    assert.equal(f.sent.at(-1).toolResponse.functionResponses[0].response.error, "At most one Avatar gesture is allowed per response.");
    f.client.handleMessage(f.socket, { serverContent: { turnComplete: true } });
    f.client.handleMessage(f.socket, { toolCall: gestureCall("nod") });
    assert.equal(events.at(-1).gesture, "nod");
  });

  test(`${page}: interrupted or cancelled gesture calls cannot survive the response`, () => {
    const f = fixture(page);
    const events = [];
    const player = new gestures.AvatarGesturePlayer();
    f.app.bus.on("avatar.gesture", event => events.push(event));
    f.app.bus.on("avatar.gesture", event => player.queue(event.gesture, event.id));
    f.app.bus.on("avatar.gesture-cancel", ({ ids }) => player.cancel(ids));
    f.client.handleMessage(f.socket, { serverContent: { interrupted: true }, toolCall: gestureCall("wave") });
    assert.deepEqual(events, []);
    assert.match(f.sent.at(-1).toolResponse.functionResponses[0].response.error, /interrupted/i);
    f.client.handleMessage(f.socket, { toolCall: gestureCall("nod") });
    f.client.handleMessage(f.socket, { toolCallCancellation: { ids: ["gesture-nod"] } });
    assert.deepEqual(events, [{ gesture: "nod", id: "gesture-nod" }]);
    assert.equal(player.pending, null);
  });
}

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

for (const page of ["app.js", "stage.js"]) {
function modelFixture(page) {
  const requests = [], disposed = [], attached = [], events = [];
  const { VRMAvatarController, EventBus } = loadPage(page, {
    GLTFLoader: class {
      register() {}
      loadAsync(url, progress) { return new Promise(resolve => requests.push({ url, progress, resolve })); }
    },
    VRMUtils: { deepDispose: scene => disposed.push(scene) },
  });
  const bus = new EventBus();
  bus.on("avatar.loading", data => events.push(data.progress));
  const controller = Object.assign(Object.create(VRMAvatarController.prototype), {
    bus, renderer: { dispose() {} }, scene: { add: scene => attached.push(scene), remove() {} },
    modelUrl: "first.vrm", loadToken: 0, loadProgress: 0, restPose: new Map(),
    resizeObserver: { disconnect() {} }, prepareModel() {},
  });
  const model = () => { const scene = { rotation: {} }; return { scene, userData: { vrm: { scene } } }; };
  return { controller, requests, disposed, attached, events, model };
}

test(`${page}: rapid model switching disposes stale results and ignores their progress`, async () => {
  const f = modelFixture(page);
  const first = f.controller.loadModel();
  const second = f.controller.switchModel("second.vrm");
  f.requests[0].progress({ loaded: 90, total: 100 });
  assert.deepEqual(f.events, [0, 0]);
  const old = f.model(), current = f.model();
  f.requests[1].resolve(current);
  await second;
  f.requests[0].resolve(old);
  await first;
  assert.deepEqual(f.attached, [current.scene]);
  assert.deepEqual(f.disposed, [old.scene]);
});

test(`${page}: disposing during model loading releases both the scene and late result`, async () => {
  const f = modelFixture(page);
  const pending = f.controller.loadModel();
  const scene = f.controller.scene;
  f.controller.dispose();
  const late = f.model();
  f.requests[0].resolve(late);
  await pending;
  assert.deepEqual(f.attached, []);
  assert.deepEqual(f.disposed, [scene, late.scene]);
  assert.equal(f.controller.loaded, false);
});


  test(`${page}: final failure resets the call and PTT`, async () => {
    const f = fixture(page);
    let stops = 0, active;
    f.app.mic = { stop: async () => stops++, end() {} };
    f.app.updateCallButton = value => { active = value; };
    f.app.pttActive = true;
    f.client.fail(new Error("failed"));
    await Promise.resolve();
    assert.equal(f.app.callActive, false);
    assert.equal(f.app.pttActive, false);
    assert.equal(active, false);
    if (page === "app.js") assert.equal(stops, 1);
  });
  test(`${page}: reconnecting preserves the call`, () => {
    const f = fixture(page);
    f.app.bus.emit("gemini.status", { status: "reconnecting" });
    assert.equal(f.app.callActive, true);
  });
}

test("single-page call cleanup cannot overwrite the next call", async () => {
  const f = fixture("app.js");
  let finish, active;
  f.app.mic = { stop: () => new Promise(resolve => { finish = resolve; }) };
  f.app.updateCallButton = value => { active = value; };
  const pending = f.app.abortCall();
  f.app.callActive = true;
  f.app.sessionStartedAt = 123;
  active = true;
  finish();
  await pending;
  assert.equal(active, true);
  assert.equal(f.app.sessionStartedAt, 123);
});

test("cancelled microphone startup cannot overwrite a newer context", async () => {
  const { MicrophoneInput } = shared;
  let resolveOld;
  const oldContext = {};
  const newContext = { audioWorklet: { addModule: () => new Promise(() => {}) } };
  let calls = 0;
  const mic = new MicrophoneInput({ ensureContext: () => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(newContext) });
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: () => new Promise(() => {}) } } });
  try {
    const pending = mic.start(() => {});
    await mic.stop();
    mic.start(() => {});
    await Promise.resolve();
    resolveOld(oldContext);
    await pending;
    assert.equal(mic.context, newContext);
    await mic.stop();
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("stage failure notifies the operator and keeps its pairing available", () => {
  const f = fixture("stage.js");
  const messages = [];
  const peerLink = { send: message => messages.push(message) };
  f.app.peerLink = peerLink;
  f.app.ui.connectionBadge.dataset = {};
  f.app.setConnectionStatus = Object.getPrototypeOf(f.app).setConnectionStatus;
  f.client.fail(new Error("failed"));
  assert.equal(messages.at(-1).type, "connection");
  assert.equal(messages.at(-1).status, "failed");
  assert.equal(f.app.peerLink, peerLink);
  assert.equal(f.app.callActive, false);
});

test("leaving picture-in-picture moves the existing scene without stopping speech", () => {
  const f = fixture("stage.js");
  const visual = {};
  let moved, resized = 0, loops = 0;
  f.app.ui = { stageVisual: visual };
  f.app.pipWindow = {};
  f.app.pipPlaceholder = { parentNode: {}, replaceWith: node => { moved = node; } };
  const avatar = { resize: () => resized++, dispose() { assert.fail("PiP must retain the scene"); } };
  f.app.avatar = avatar;
  f.app.startRenderLoop = () => loops++;
  f.app.updatePipButton = () => {};
  f.app.exitPip();
  assert.equal(moved, visual);
  assert.equal(f.app.avatar, avatar);
  assert.equal(f.app.callActive, true);
  assert.equal(f.stops(), 0);
  assert.equal(resized, 1);
  assert.equal(loops, 1);
  assert.equal(f.app.pipWindow, null);
});
