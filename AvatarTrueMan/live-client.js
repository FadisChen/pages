import {
  AVATAR_EMOTION_TOOL,
  createAvatarToolResponse,
  normalizeAvatarEmotion,
} from "./avatar-emotions.js";
import { normalizeTranscript } from "./transcript.js";
import { toTraditionalChinese } from "./traditional-chinese.js";

const WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const GEMINI_LIVE_MODEL = "gemini-3.8-live";
const OUTPUT_AUDIO_RATE = 24000;

export { GEMINI_LIVE_MODEL };

export class GeminiLiveClient {
  constructor(bus) {
    this.bus = bus;
    this.socket = null;
    this.config = null;
    this.ready = false;
    this.stopped = true;
    this.failures = 0;
    this.reconnectTimer = null;
    this.resumptionHandle = "";
    this.turnHadAudio = false;
  }

  start(config) {
    this.disconnect(false);
    this.config = { ...config, voice: String(config.voice || "Aoede").trim() || "Aoede" };
    this.stopped = false;
    this.failures = 0;
    this.resumptionHandle = "";
    this.turnHadAudio = false;
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
    if (notify) this.bus.emit("gemini.disconnected", { status: "offline" });
  }

  isConnected() {
    return Boolean(this.ready && this.socket?.readyState === globalThis.WebSocket?.OPEN);
  }

  connect(reconnecting) {
    if (this.stopped || !this.config) return;
    this.bus.emit("gemini.status", { status: reconnecting ? "reconnecting" : "connecting" });
    let socket;
    try {
      socket = new WebSocket(`${WS_BASE}?key=${encodeURIComponent(this.config.apiKey)}`);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (socket !== this.socket) return;
      try { socket.send(JSON.stringify(this.setupMessage())); } catch (error) { this.fail(error); }
    };
    let messages = Promise.resolve();
    socket.onmessage = (event) => {
      messages = messages.then(() => this.handleRawMessage(socket, event.data));
    };
    socket.onclose = (event) => this.handleClose(socket, event);
  }

  setupMessage() {
    return {
      setup: {
        model: `models/${GEMINI_LIVE_MODEL}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.voice || "Aoede" } } },
        },
        systemInstruction: { parts: [{ text: buildSystemInstruction(this.config.userSystemPrompt) }] },
        realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
        sessionResumption: this.resumptionHandle ? { handle: this.resumptionHandle } : {},
        contextWindowCompression: { triggerTokens: 8000, slidingWindow: {} },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: [{ functionDeclarations: [AVATAR_EMOTION_TOOL] }],
      },
    };
  }

  sendAudio(bytes) {
    if (!this.isConnected() || !bytes?.byteLength) return;
    this.send({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: bytesToBase64(bytes) } } });
  }

  sendText(text) {
    if (!this.isConnected() || !String(text).trim()) return false;
    this.send({ clientContent: { turns: [{ role: "user", parts: [{ text: String(text).trim() }] }], turnComplete: true } });
    return true;
  }

  send(message) {
    if (this.socket?.readyState === globalThis.WebSocket?.OPEN) this.socket.send(JSON.stringify(message));
  }

  async handleRawMessage(socket, raw) {
    if (socket !== this.socket) return;
    try {
      const text = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : await raw.text();
      if (socket === this.socket) this.handleMessage(socket, JSON.parse(text));
    } catch (error) {
      if (socket === this.socket) this.fail(error);
    }
  }

  handleMessage(socket, message) {
    if (socket !== this.socket || this.stopped) return;
    if (message.setupComplete) {
      this.ready = true;
      this.failures = 0;
      this.bus.emit("gemini.connected", { model: GEMINI_LIVE_MODEL });
    }
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.resumptionHandle = update.newHandle;
    if (message.error) {
      this.fail(new Error(message.error.message || "Gemini Live 連線錯誤。"));
      return;
    }
    const content = message.serverContent;
    if (content) {
      if (content.interrupted) this.bus.emit("gemini.interrupted", {});
      const audioParts = content.modelTurn?.parts?.filter((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/pcm")) || [];
      if (audioParts.length && !content.interrupted) {
        for (const part of audioParts) {
          this.turnHadAudio = true;
          const sampleRate = Number(/(?:^|;)rate=(\d+)/.exec(part.inlineData.mimeType)?.[1]) || OUTPUT_AUDIO_RATE;
          this.bus.emit("gemini.audio", { bytes: base64ToBytes(part.inlineData.data), sampleRate });
        }
        this.bus.emit("gemini.audio-turn", {});
      }
      const inputText = normalizeTranscript(toTraditionalChinese(content.inputTranscription?.text));
      const outputText = normalizeTranscript(toTraditionalChinese(content.outputTranscription?.text));
      if (inputText) this.bus.emit("gemini.user-transcript", inputText);
      if (outputText && !content.interrupted) this.bus.emit("gemini.model-transcript", outputText);
      if (content.turnComplete) this.bus.emit("gemini.turn-complete", {});
    }
    if (message.toolCall?.functionCalls?.length) this.handleToolCalls(socket, message.toolCall.functionCalls);
    if (content?.turnComplete) this.turnHadAudio = false;
    if (message.goAway) this.bus.emit("gemini.go-away", { timeLeft: message.goAway.timeLeft });
  }

  handleToolCalls(socket, calls) {
    const responses = [];
    let emotionApplied = false;
    for (const call of calls) {
      let result;
      let args = call.args;
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch (_) { args = null; }
      }
      if (call?.name !== AVATAR_EMOTION_TOOL.name) {
        result = { ok: false, error: `不支援的 Avatar tool：${String(call?.name || "")}` };
      } else if (emotionApplied) {
        result = { ok: false, error: "每個回覆最多套用一次表情。" };
      } else {
        result = normalizeAvatarEmotion(args);
        if (result.ok) {
          emotionApplied = true;
          this.bus.emit("gemini.avatar-emotion", { emotion: result.emotion });
        }
      }
      responses.push([call, result]);
    }
    this.sendToolResponses(socket, responses);
  }

  sendToolResponses(socket, responses) {
    if (socket?.readyState !== globalThis.WebSocket?.OPEN || !responses.length) return;
    const functionResponses = responses.map(([call, result]) => createAvatarToolResponse(call, result).toolResponse.functionResponses[0]);
    socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
  }

  handleClose(socket, event) {
    if (socket !== this.socket || this.stopped) return;
    this.ready = false;
    this.socket = null;
    this.bus.emit("gemini.connection-lost", {});
    this.failures += 1;
    if (this.failures >= 3) {
      this.bus.emit("gemini.status", { status: "failed" });
      this.bus.emit("gemini.error", new Error(`Gemini Live 連線失敗（${event.code || "unknown"}）。`));
      return;
    }
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

export function buildSystemInstruction(userSystemPrompt) {
  const personality = String(userSystemPrompt || "一位溫柔、敏銳、簡潔的臺灣 AI 主持人").trim();
  return `你是 ${personality}。請使用臺灣繁體中文自然交談，不要描述你正在使用的系統。回應像真實語音對話：先接住對方，再給一個清楚的回應；不確定時誠實說明。只有在回覆開始或情緒明顯轉折時才呼叫 set_avatar_emotion；不需要時不要呼叫。不要使用工具控制嘴型、呼吸、眨眼或連續動畫。`;
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
