import { AVATAR_EMOTION_TOOL, createAvatarToolResponse, normalizeAvatarEmotion } from "../Avatar/avatar-emotions.js";
import { normalizeTranscript } from "../Avatar/transcript.js";
import { GEMINI_LIVE_MODEL, buildSystemInstruction } from "./host-config.js";

const WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const AUDIO_OUTPUT_RATE = 24000;
class GeminiLiveClient {
  constructor(bus) {
    this.bus = bus;
    this.socket = null;
    this.config = null;
    this.ready = false;
    this.stopped = true;
    this.failures = 0;
    this.reconnectTimer = null;
    this.resumptionHandle = "";
    this.inputActive = false;
    this.responsePending = false;
    this.playbackPending = false;
    this.goAway = false;
    this.suppressAudio = false;
    this.initialContextSent = false;
    bus.on("audio.drained", () => { this.playbackPending = false; this.reconnectWhenIdle(); });
  }
  start(config) {
    this.disconnect(false);
    this.config = { ...config, voice: String(config.voice || "Aoede").trim() || "Aoede" };
    this.stopped = false;
    this.failures = 0;
    this.suppressAudio = false;
    this.resumptionHandle = "";
    this.initialContextSent = false;
    this.connect(false);
  }
  disconnect(notify = true) {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "user hangup");
    this.ready = false;
    this.inputActive = false;
    this.responsePending = false;
    this.playbackPending = false;
    this.goAway = false;
    if (notify) this.bus.emit("gemini.disconnected", { status: "offline" });
  }
  isConnected() { return this.ready && this.socket?.readyState === WebSocket.OPEN; }
  connect(reconnecting) {
    if (this.stopped || !this.config) return;
    this.bus.emit("gemini.status", { status: reconnecting ? "reconnecting" : "connecting" });
    let socket;
    try { socket = new WebSocket(`${WS_BASE}?key=${encodeURIComponent(this.config.apiKey)}`); }
    catch (error) { this.fail(error); return; }
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => { if (socket !== this.socket) return; try { socket.send(JSON.stringify(this.setupMessage())); } catch (error) { this.fail(error); } };
    let messages = Promise.resolve();
    socket.onmessage = (event) => { messages = messages.then(() => this.handleRawMessage(socket, event.data)); };
    socket.onclose = (event) => this.handleClose(socket, event);
  }
  setupMessage() {
    const generationConfig = { responseModalities: ["AUDIO"] };
    generationConfig.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.voice || "Aoede" } } };
    const thinking = String(this.config.thinking || "").trim().toUpperCase();
    if (thinking) {
      const option = { thinkingLevel: thinking };
      if (Object.values(option)[0] !== undefined) generationConfig.thinkingConfig = option;
    }
    const setup = {
      model: `models/${GEMINI_LIVE_MODEL}`,
      generationConfig,
      systemInstruction: { parts: [{ text: buildSystemInstruction(this.config.userSystemPrompt) }] },
      // 手動語音活動偵測：由工作人員按住/放開按鈕決定何時送話、何時輪到 Gemini 開口，
      // 而不是讓伺服器自動偵測講話起訖（現場背景音樂與人聲很容易讓自動 VAD 誤判）。
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      sessionResumption: this.resumptionHandle ? { handle: this.resumptionHandle } : {},
      contextWindowCompression: { triggerTokens: 8000, slidingWindow: {} },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: [{ functionDeclarations: [AVATAR_EMOTION_TOOL] }],
    };
    if (!this.initialContextSent && !this.resumptionHandle) setup.historyConfig = { initialHistoryInClientContent: true };
    return { setup };
  }
  sendAudio(bytes) {
    // Never replay isolated microphone chunks into a reconnected session without their PTT markers.
    if (!this.isConnected() || !this.inputActive || !bytes?.byteLength) return;
    this.sendAudioNow(bytes);
  }
  // 按下 push-to-talk 按鈕時呼叫：手動 VAD 模式下，這個訊號開始使用者這一輪的發言。
  activityStart() {
    if (!this.isConnected() || this.inputActive) return false;
    this.inputActive = true;
    this.suppressAudio = this.responsePending;
    this.playbackPending = false;
    this.bus.emit("gemini.input-start", {});
    this.send({ realtimeInput: { activityStart: {} } });
    return true;
  }
  // 放開 push-to-talk 按鈕時呼叫：這個訊號同時代表「使用者這輪講完了」，
  // Gemini 收到後才會開始生成語音回覆——這就是「按鈕決定何時輪到 Gemini 說話」的實作。
  activityEnd() {
    if (!this.inputActive) return;
    this.inputActive = false;
    if (!this.isConnected()) return;
    this.responsePending = true;
    this.send({ realtimeInput: { activityEnd: {} } });
  }
  sendText(text) {
    if (!this.isConnected() || this.inputActive || !String(text).trim()) return false;
    this.send({ realtimeInput: { text: String(text).trim() } });
    this.suppressAudio = false;
    this.responsePending = true;
    return true;
  }
  sendAudioNow(bytes) { this.send({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: bytesToBase64(bytes) } } }); }
  send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  async handleRawMessage(socket, raw) {
    if (socket !== this.socket) return;
    try {
      const text = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : await raw.text();
      if (socket === this.socket) this.handleMessage(socket, JSON.parse(text));
    } catch (error) { if (socket === this.socket) this.fail(error); }
  }
  handleMessage(socket, message) {
    if (socket !== this.socket || this.stopped) return;
    if (message.setupComplete) {
      this.ready = true;
      this.failures = 0;
      if (!this.resumptionHandle) this.sendInitialContext(socket);
      this.bus.emit("gemini.connected", { model: GEMINI_LIVE_MODEL });
    }
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.resumptionHandle = update.newHandle;
    const content = message.serverContent;
    if (message.error) {
      this.fail(new Error(message.error.message || "Gemini Live 回傳錯誤。"));
      return;
    }
    if (content) {
      if (content.interrupted) {
        this.suppressAudio = false;
        this.playbackPending = false;
        this.bus.emit("gemini.interrupted", {});
      }
      const audioParts = content.modelTurn?.parts?.filter((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) || [];
      const playAudio = !content.interrupted && !this.inputActive && !this.suppressAudio;
      if (audioParts.length && playAudio) for (const part of audioParts) {
        this.responsePending = true;
        this.playbackPending = true;
        const rate = Number(/(?:^|;)rate=(\d+)/.exec(part.inlineData.mimeType)?.[1]) || AUDIO_OUTPUT_RATE;
        this.bus.emit("gemini.audio", { bytes: base64ToBytes(part.inlineData.data), sampleRate: rate });
      }
      const inputText = normalizeTranscript(content.inputTranscription?.text);
      const outputText = normalizeTranscript(content.outputTranscription?.text);
      if (inputText) this.bus.emit("gemini.user-transcript", inputText);
      if (outputText && playAudio) this.bus.emit("gemini.model-transcript", outputText);
      if (audioParts.length && playAudio) this.bus.emit("gemini.audio-turn", {});
      if (content.turnComplete) { this.suppressAudio = false; this.responsePending = false; this.bus.emit("gemini.turn-complete", {}); }
    }
    if (message.toolCall?.functionCalls?.length) this.handleToolCalls(socket, message.toolCall.functionCalls);
    if (message.goAway) this.goAway = true;
    this.reconnectWhenIdle();
  }
  reconnectWhenIdle() {
    // GoAway is advance notice, not an instruction to cut off the current sentence.
    if (this.goAway && !this.inputActive && !this.responsePending && !this.playbackPending) {
      this.goAway = false;
      this.socket?.close(1000, "reconnect between turns");
    }
  }
  sendInitialContext(socket) {
    if (this.initialContextSent) return true;
    const text = String(this.config?.sessionContext || "").trim();
    if (!text || socket?.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }));
      this.initialContextSent = true;
      this.bus.emit("gemini.session-context-sent", {});
      return true;
    } catch (error) {
      this.bus.emit("gemini.error", error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
  handleToolCalls(socket, calls) {
    let applied = false;
    for (const call of calls) {
      let result;
      if (call?.name !== AVATAR_EMOTION_TOOL.name) {
        result = { ok: false, error: `不支援的 Avatar tool：${String(call?.name || "")}。` };
      } else {
        let args = call.args;
        if (typeof args === "string") {
          try { args = JSON.parse(args); } catch (_) { args = null; }
        }
        result = normalizeAvatarEmotion(args);
      }
      if (result.ok && applied) result = { ok: false, error: "每個回覆最多套用一個 Avatar emotion。" };
      if (result.ok) {
        applied = true;
        this.bus.emit("gemini.avatar-emotion", { emotion: result.emotion });
      }
      this.sendToolResponse(socket, call, result);
    }
  }
  sendToolResponse(socket, call, result) {
    if (socket?.readyState !== 1) return;
    socket.send(JSON.stringify(createAvatarToolResponse(call, result)));
  }
  handleClose(socket, event) {
    if (socket !== this.socket || this.stopped) return;
    this.ready = false;
    this.socket = null;
    this.inputActive = false;
    this.responsePending = false;
    this.playbackPending = false;
    this.suppressAudio = false;
    this.goAway = false;
    if (!this.resumptionHandle) this.initialContextSent = false;
    this.bus.emit("gemini.connection-lost", {});
    this.failures += 1;
    if (this.failures >= 3) { this.bus.emit("gemini.status", { status: "failed" }); this.bus.emit("gemini.error", new Error(`Gemini 連線已中斷（${event.code || "無狀態碼"}）。請檢查網路、模型與 API key。`)); return; }
    const delay = [1000, 2500, 5000][this.failures - 1];
    this.bus.emit("gemini.status", { status: "reconnecting", retryIn: delay });
    this.reconnectTimer = setTimeout(() => this.connect(true), delay);
  }
  fail(error) {
    this.disconnect(false);
    this.bus.emit("gemini.connection-lost", {});
    this.bus.emit("gemini.status", { status: "failed" });
    this.bus.emit("gemini.error", error instanceof Error ? error : new Error(String(error)));
  }
}

function base64ToBytes(base64) { const binary = atob(base64); const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes; }
function bytesToBase64(bytes) { let binary = ""; const chunkSize = 0x8000; for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)); return btoa(binary); }

export { GeminiLiveClient };
