import test from "node:test";
import assert from "node:assert/strict";
import { LiveSession } from "../js/gemini.js";
import { BrowserAudioEngine } from "../js/audio.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const audio = { modelTurn: { parts: [{ inlineData: { data: "AAA=", mimeType: "audio/pcm;rate=24000" } }] } };
const call = { id: "search-1", name: "web_search", args: { query: "test" } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(executor = async () => "found") {
  const sent = [], statuses = [], errors = [], played = [];
  const session = new LiveSession({ model: "gemini-3.8-live", character: {}, toolsEnabled: true, toolExecutor: executor }, {
    onStatus: value => statuses.push(value), onError: error => errors.push(error), onAudio: bytes => played.push(bytes),
  });
  let closes = 0;
  const socket = { readyState: 1, send: raw => sent.push(JSON.parse(raw)), close: () => closes++ };
  Object.assign(session, { socket, ready: true, stopped: false });
  return { session, socket, sent, statuses, errors, played, closes: () => closes };
}

test("decoded messages from old or stopped connections cannot change the session", async () => {
  const f = fixture(), decoding = deferred();
  const pending = f.session.handleRawMessage(f.socket, { text: () => decoding.promise });
  f.session.socket = { readyState: 1, send() {}, close() {} };
  decoding.resolve(JSON.stringify({ serverContent: audio }));
  await pending;
  assert.equal(f.played.length, 0);
  f.session.handleMessage(f.socket, { setupComplete: {}, sessionResumptionUpdate: { resumable: true, newHandle: "old" } });
  assert.equal(f.session.resumptionHandle, "");
  f.session.stop(false);
  f.session.handleMessage(f.socket, { serverContent: audio });
  assert.equal(f.played.length, 0);
});

test("GoAway waits for search, follow-up generation and playback", async t => {
  const work = deferred(), f = fixture(() => work.promise);
  t.after(() => f.session.stop(false));
  const job = f.session.handleToolCall(f.socket, call);
  f.session.handleMessage(f.socket, { serverContent: { turnComplete: true } });
  f.session.handleMessage(f.socket, { goAway: { timeLeft: "30s" } });
  assert.equal(f.closes(), 0);
  assert.equal(f.statuses.at(-1), "thinking");
  work.resolve("found"); await job;
  assert.equal(f.closes(), 0);
  f.session.setPlaybackActive(true);
  f.session.handleMessage(f.socket, { serverContent: { ...audio, turnComplete: true } });
  assert.equal(f.statuses.at(-1), "speaking");
  assert.equal(f.closes(), 0);
  f.session.setPlaybackActive(false);
  assert.equal(f.closes(), 1);
});

test("tool send failure is reported once without retry or rejected task", async () => {
  const f = fixture(); let sends = 0;
  f.socket.send = () => { sends++; throw new Error("send failed"); };
  await assert.doesNotReject(f.session.handleToolCall(f.socket, call));
  assert.equal(sends, 1);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /工具結果未送出/);
  assert.equal(f.session.toolJobs.size, 0);
});

test("failed session rejects microphone data and clears buffered audio", () => {
  const f = fixture();
  f.session.failures = 2;
  f.session.audioBuffer = [new Uint8Array([0, 0])]; f.session.audioBufferBytes = 2;
  f.session.handleClose(f.socket, { code: 1006 });
  f.session.sendAudio(new Uint8Array([0, 0]));
  assert.equal(f.session.stopped, true);
  assert.equal(f.session.audioBufferBytes, 0);
  assert.equal(f.statuses.at(-1), "failed");
});

test("both supported models retain async tools without scheduling or proactivity", async () => {
  for (const model of ["gemini-3.8-live", "gemini-2.5-flash-native-audio-preview-12-2025"]) {
    const f = fixture();
    const setup = new LiveSession({ model, character: {}, toolsEnabled: true }).setupMessage().setup;
    assert.ok(setup.tools[0].functionDeclarations.every(x => x.behavior === "NON_BLOCKING"));
    assert.equal(setup.proactivity, undefined);
    await f.session.handleToolCall(f.socket, call);
    const response = f.sent[0].toolResponse.functionResponses[0];
    assert.equal(response.scheduling, undefined);
    assert.equal(response.response.scheduling, undefined);
    assert.equal(response.response.result, "found");
  }
});

test("status combines retained interaction state with actual playback", () => {
  const f = fixture();
  f.session.handleMessage(f.socket, { interactionStatus: "IN_PROGRESS" });
  f.session.handleMessage(f.socket, { serverContent: { turnComplete: true } });
  assert.equal(f.statuses.at(-1), "thinking");
  f.session.setPlaybackActive(true);
  f.session.handleMessage(f.socket, { serverContent: { interactionStatus: "IDLE", turnComplete: true } });
  assert.equal(f.statuses.at(-1), "speaking");
  f.session.setPlaybackActive(false);
  assert.equal(f.statuses.at(-1), "listening");
});

test("audio engine reports final drain and ignores ended sources after a flush", () => {
  const states = [], sources = [];
  const engine = new BrowserAudioEngine({ onPlaybackChange: active => states.push(active) });
  engine.context = { currentTime: 0, destination: {},
    createBuffer: (_, count) => ({ duration: count / 24000, getChannelData: () => new Float32Array(count) }),
    createBufferSource: () => { const s = { connect() {}, disconnect() {}, start() {}, stop() {} }; sources.push(s); return s; },
  };
  engine.playPcm24k(new Uint8Array([0, 0]));
  engine.playPcm24k(new Uint8Array([0, 0]));
  sources[0].onended();
  assert.equal(states.at(-1), true);
  sources[1].onended();
  assert.equal(states.at(-1), false);
  engine.playPcm24k(new Uint8Array([0, 0]));
  engine.flushPlayback();
  assert.equal(states.at(-1), false);
  assert.equal(sources[2].onended, null);
});

test("GoAway deadline bounds the wait for a stuck tool and stop clears its timer", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(() => new Promise(() => {}));
  void f.session.handleToolCall(f.socket, call);
  f.session.handleMessage(f.socket, { goAway: { timeLeft: "1s" } });
  t.mock.timers.tick(749);
  assert.equal(f.closes(), 0);
  t.mock.timers.tick(1);
  assert.equal(f.closes(), 1);
  f.session.stop(false);
  const g = fixture(() => new Promise(() => {}));
  void g.session.handleToolCall(g.socket, call);
  g.session.handleMessage(g.socket, { goAway: { timeLeft: "1s" } });
  g.session.stop(false);
  t.mock.timers.tick(1000);
  assert.equal(g.closes(), 1); // Only the explicit stop closed it.
});

test("cancelled and replaced jobs cannot answer or delete a reused ID", async () => {
  const old = deferred(), next = deferred(); let executions = 0;
  const f = fixture(() => (++executions === 1 ? old : next).promise);
  const first = f.session.handleToolCall(f.socket, call);
  f.session.handleMessage(f.socket, { toolCallCancellation: { ids: [call.id] } });
  const second = f.session.handleToolCall(f.socket, call);
  old.resolve("stale"); await first;
  assert.equal(f.sent.length, 0);
  assert.equal(f.session.toolJobs.size, 1);
  next.resolve("current"); await second;
  assert.equal(f.sent[0].toolResponse.functionResponses[0].response.result, "current");
  assert.equal(f.session.toolJobs.size, 0);
});

test("tool execution errors are returned as errors without stopping the session", async () => {
  const f = fixture(async () => { throw new Error("lookup failed"); });
  await f.session.handleToolCall(f.socket, call);
  assert.match(f.sent[0].toolResponse.functionResponses[0].response.error, /lookup failed/);
  assert.equal(f.errors.length, 0);
  assert.equal(f.session.stopped, false);
});

test("closed socket reports an unsent result instead of silently dropping it", async () => {
  const f = fixture(); f.socket.readyState = 3;
  await f.session.handleToolCall(f.socket, call);
  assert.equal(f.sent.length, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(f.session.stopped, true);
});

test("websocket message decoding remains ordered", async t => {
  const f = fixture(), decoding = deferred(), order = [];
  t.mock.method(globalThis, "WebSocket", function () { return f.socket; });
  f.session.callbacks.onAudio = () => order.push("audio");
  f.session.callbacks.onTurnComplete = () => order.push("complete");
  f.session.connect(false);
  f.socket.onmessage({ data: { text: () => decoding.promise } });
  f.socket.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(order, []);
  decoding.resolve(JSON.stringify({ serverContent: audio }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ["audio", "complete"]);
});

test("page failure callback stops real audio capture and enables a fresh start", async () => {
  const source = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const startAndCleanup = source.slice(source.indexOf("async function startCall()"), source.indexOf("async function endCall("));
  let trackStops = 0, updates = 0;
  class TestAudio extends BrowserAudioEngine {
    async start() {
      this.running = true;
      this.stream = { getTracks: () => [{ stop: () => trackStops++ }] };
      this.context = { state: "running", currentTime: 0, async close() { this.state = "closed"; } };
    }
  }
  class TestSession extends LiveSession {
    start() { Object.assign(this, { stopped: false, ready: true, socket: { readyState: 1, send() {}, close() {} } }); }
  }
  const callState = { character: { id: "friend", description: "friend" }, started: false,
    collector: { onInterrupted() {} },
  };
  const context = vm.createContext({ activeCall: callState, data: { settings: {} },
    getApiKey: () => "test", getTavilyKey: () => "", memoriesFor: () => [], buildSystemPrompt: () => "test",
    BrowserAudioEngine: TestAudio, LiveSession: TestSession,
    updateCallUi: () => updates++, updateTranscript() {}, toast() {},
  });
  vm.runInContext(startAndCleanup, context);
  await vm.runInContext("startCall()", context);
  const oldAudio = callState.audio;
  callState.session.failures = 2;
  callState.session.handleClose(callState.session.socket, { code: 1006 });
  assert.equal(oldAudio.running, false);
  assert.equal(trackStops, 1);
  assert.equal(callState.cleaningUp, true);
  await vm.runInContext("startCall()", context); // Cleanup must block a competing start.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(callState.audio, null);
  assert.equal(callState.started, false);
  assert.equal(callState.status, "failed");
  assert.ok(updates > 0);
  await vm.runInContext("startCall()", context);
  assert.notEqual(callState.audio, oldAudio);
  assert.equal(callState.audio.running, true);
  callState.session.stop(false);
  await callState.audio.stop();
});
