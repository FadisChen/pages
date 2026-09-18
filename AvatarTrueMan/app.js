import { EventBus } from "./event-bus.js";
import { TrueManAvatarController } from "./avatar-2d.js";
import { GeminiAudioPlayer, LipSyncEngine, MicrophoneInput } from "./audio.js";
import { AVATAR_EMOTIONS } from "./avatar-emotions.js";
import { GeminiLiveClient } from "./live-client.js";
import { TranscriptView } from "./transcript.js";
import { toTraditionalChinese } from "./traditional-chinese.js";

const SETTINGS_KEY = "avatar-true-man.settings.v1";
const DEFAULT_USER_SYSTEM_PROMPT = "一位溫柔、敏銳、簡潔的臺灣 AI 主持人";
const STATES = Object.freeze({ IDLE: "idle", LISTENING: "listening", THINKING: "thinking", SPEAKING: "speaking", INTERRUPTED: "interrupted" });
const STATE_LABELS = Object.freeze({ idle: "待機中", listening: "聆聽中", thinking: "思考中", speaking: "回應中", interrupted: "被打斷" });
const STATE_COPY = Object.freeze({ idle: "準備好聽你說話", listening: "我正在聽", thinking: "讓我想一下", speaking: "聲音正在變成表情", interrupted: "收到，你可以繼續說" });
const DEFAULT_SETTINGS = Object.freeze({ apiKey: "", voice: "Aoede", userSystemPrompt: DEFAULT_USER_SYSTEM_PROMPT });

class AvatarStateMachine {
  constructor(bus) {
    this.bus = bus;
    this.state = STATES.IDLE;
    this.transitions = {
      idle: new Set(["listening"]),
      listening: new Set(["thinking", "idle", "interrupted", "speaking"]),
      thinking: new Set(["speaking", "listening", "idle", "interrupted"]),
      speaking: new Set(["idle", "interrupted", "listening"]),
      interrupted: new Set(["listening", "idle"]),
    };
  }

  getState() { return this.state; }

  transition(next) {
    if (next === this.state) return true;
    if (!this.transitions[this.state]?.has(next)) return false;
    const previous = this.state;
    this.state = next;
    this.bus.emit("avatar.state", { previous, state: next });
    return true;
  }

  toListening() {
    if (this.state === STATES.LISTENING) return;
    if (this.state === STATES.IDLE || this.state === STATES.INTERRUPTED) this.transition(STATES.LISTENING);
    else if (this.state === STATES.SPEAKING || this.state === STATES.THINKING) { this.transition(STATES.INTERRUPTED); this.transition(STATES.LISTENING); }
  }

  toThinking() {
    if (this.state === STATES.LISTENING) this.transition(STATES.THINKING);
    else if (this.state === STATES.IDLE) { this.transition(STATES.LISTENING); this.transition(STATES.THINKING); }
  }

  toSpeaking() {
    if (this.state === STATES.THINKING || this.state === STATES.LISTENING) this.transition(STATES.SPEAKING);
  }

  toIdle() {
    if (this.state !== STATES.IDLE) this.transition(STATES.IDLE);
  }
}

export class App {
  constructor() {
    this.bus = new EventBus();
    this.ui = collectUI();
    this.settings = loadSettings();
    this.stateMachine = new AvatarStateMachine(this.bus);
    this.audioPlayer = new GeminiAudioPlayer(this.bus);
    this.mic = new MicrophoneInput(this.audioPlayer, this.bus);
    this.lipSync = new LipSyncEngine(this.audioPlayer, this.bus);
    this.avatar = new TrueManAvatarController(this.ui.avatarCanvas, this.bus);
    this.gemini = new GeminiLiveClient(this.bus);
    this.transcript = new TranscriptView(this.ui.transcript);
    this.callActive = false;
    this.callToken = 0;
    this.turnComplete = false;
    this.sessionStartedAt = 0;
    this.lastFrame = performance.now();
    this.bindEvents();
    this.applySettings();
    this.updateCallButton(false);
    this.renderLoop();
    this.loadAvatar();
    window.addEventListener("pagehide", () => {
      this.gemini.disconnect(false);
      this.mic.stop();
      this.audioPlayer.close();
      this.avatar.dispose();
    }, { once: true });
  }

  async loadAvatar() {
    try {
      const response = await fetch("./assets/avatar-manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`角色 manifest 載入失敗（${response.status}）。`);
      await this.avatar.load(await response.json());
    } catch (error) {
      this.showError(error.message || "角色素材載入失敗。", true);
    }
  }

  bindEvents() {
    this.ui.startCall.addEventListener("click", () => { if (this.callActive) this.endCall(); else this.startCall(); });
    this.ui.settingsButton.addEventListener("click", () => this.openSettings());
    this.ui.closeSettings.addEventListener("click", () => this.closeSettings());
    this.ui.settingsDialog.addEventListener("click", (event) => { if (event.target === this.ui.settingsDialog) this.closeSettings(); });
    this.ui.toggleKey.addEventListener("click", () => {
      const visible = this.ui.apiKey.type === "text";
      this.ui.apiKey.type = visible ? "password" : "text";
      this.ui.toggleKey.textContent = visible ? "show" : "hide";
    });
    this.ui.settingsForm.addEventListener("input", () => this.saveSettings());
    this.ui.textForm.addEventListener("submit", (event) => { event.preventDefault(); this.sendText(); });

    this.bus.on("avatar.loading", ({ progress }) => { this.ui.modelStatus.textContent = `2D PHOTO / ${progress > 0 ? `${Math.round(progress * 100)}%` : "LOADING"}`; });
    this.bus.on("avatar.ready", () => { this.ui.modelStatus.textContent = "2D PHOTO / READY"; });
    this.bus.on("avatar.error", (error) => { this.ui.modelStatus.textContent = "2D PHOTO / ERROR"; this.showError(error.message || String(error), true); });
    this.bus.on("gemini.status", ({ status }) => {
      this.setConnectionStatus(status);
      if (status === "failed" && this.callActive) this.abortCall();
    });
    this.bus.on("gemini.connected", ({ model }) => {
      this.setConnectionStatus("connected");
      this.stateMachine.toListening();
      this.addSystem(`已連線 ${model}，可以直接說話。`);
    });
    this.bus.on("gemini.disconnected", () => this.setConnectionStatus("offline"));
    this.bus.on("gemini.error", (error) => this.showError(error.message || String(error)));
    this.bus.on("gemini.connection-lost", () => {
      this.audioPlayer.stop();
      this.lipSync.reset();
      this.resetAvatar();
      this.transcript.clearPartial("user");
      this.transcript.clearPartial("model");
      if (this.callActive) this.stateMachine.toListening();
    });
    this.bus.on("gemini.avatar-emotion", ({ emotion }) => { if (AVATAR_EMOTIONS.includes(emotion)) this.bus.emit("avatar.emotion", { emotion }); });
    this.bus.on("gemini.user-transcript", (text) => {
      this.stateMachine.toListening();
      this.stateMachine.toThinking();
      this.transcript.add("user", text, true);
      this.turnComplete = false;
    });
    this.bus.on("gemini.model-transcript", (text) => this.transcript.add("model", text, true));
    this.bus.on("gemini.audio", ({ bytes, sampleRate }) => this.audioPlayer.enqueue(bytes, sampleRate));
    this.bus.on("gemini.audio-turn", () => { this.stateMachine.toSpeaking(); this.turnComplete = false; });
    this.bus.on("gemini.interrupted", () => {
      this.audioPlayer.stop();
      this.lipSync.reset();
      this.resetAvatar();
      this.stateMachine.transition(STATES.INTERRUPTED);
      this.stateMachine.toListening();
      this.transcript.clearPartial("model");
    });
    this.bus.on("gemini.turn-complete", () => {
      this.turnComplete = true;
      this.transcript.clearPartial("user");
      this.transcript.clearPartial("model");
      if (!this.audioPlayer.isPlaying()) { this.stateMachine.toListening(); this.finishSpeech(); }
    });
    this.bus.on("audio.drained", () => {
      if (this.turnComplete) { this.stateMachine.toListening(); this.finishSpeech(); }
    });
  }

  applySettings() {
    this.ui.apiKey.value = this.settings.apiKey;
    this.ui.voice.value = this.settings.voice;
    this.ui.userSystemPrompt.value = this.settings.userSystemPrompt;
  }

  saveSettings() {
    this.settings = {
      apiKey: this.ui.apiKey.value.trim(),
      voice: this.ui.voice.value || DEFAULT_SETTINGS.voice,
      userSystemPrompt: this.ui.userSystemPrompt.value.trim() || DEFAULT_USER_SYSTEM_PROMPT,
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (_) { /* storage may be blocked */ }
  }

  collectConfig() {
    return {
      apiKey: this.ui.apiKey.value.trim(),
      voice: this.ui.voice.value,
      userSystemPrompt: this.ui.userSystemPrompt.value.trim() || DEFAULT_USER_SYSTEM_PROMPT,
    };
  }

  async startCall() {
    if (this.callActive) return;
    const config = this.collectConfig();
    if (!config.apiKey) {
      this.showError("請先在連線設定貼上 Gemini API key。", true);
      this.openSettings();
      this.ui.apiKey.focus();
      return;
    }
    this.saveSettings();
    const token = ++this.callToken;
    this.callActive = true;
    this.turnComplete = false;
    this.sessionStartedAt = performance.now();
    this.updateCallButton(true);
    this.setConnectionStatus("connecting");
    try {
      await this.audioPlayer.ensureContext();
      if (!this.callActive || token !== this.callToken) return;
      this.lipSync.attach();
      await this.mic.start((pcm) => this.gemini.sendAudio(pcm));
      if (!this.callActive || token !== this.callToken) return;
      this.gemini.start(config);
      this.stateMachine.toListening();
      this.addSystem("麥克風已開啟，直接和她說話吧。");
    } catch (error) {
      if (!this.callActive || token !== this.callToken) return;
      await this.abortCall();
      this.showError(error.message || "無法開始對話。", true);
    }
  }

  async endCall() {
    await this.abortCall();
    this.addSystem("對話已結束。");
  }

  async abortCall() {
    this.callToken += 1;
    this.callActive = false;
    this.gemini.disconnect();
    const stopped = this.mic.stop();
    this.audioPlayer.stop();
    this.lipSync.reset();
    this.resetAvatar();
    this.stateMachine.toIdle();
    this.updateCallButton(false);
    this.sessionStartedAt = 0;
    await stopped;
  }

  sendText() {
    const text = this.ui.textInput.value.trim();
    if (!text) return;
    if (!this.callActive || !this.gemini.isConnected()) {
      this.showError("請先開始 Gemini Live 對話。", true);
      return;
    }
    if (this.gemini.sendText(text)) {
      this.transcript.add("user", toTraditionalChinese(text));
      this.ui.textInput.value = "";
      this.stateMachine.toThinking();
    }
  }

  updateCallButton(active) {
    this.ui.startCall.classList.toggle("is-active", active);
    this.ui.startCall.setAttribute("aria-pressed", String(active));
    const label = active ? "結束對話" : "開始對話";
    this.ui.startCall.setAttribute("aria-label", label);
    this.ui.startCall.title = label;
    this.ui.callButtonIcon.textContent = active ? "■" : "◉";
    this.ui.callButtonLabel.textContent = label;
  }

  setConnectionStatus(status) {
    const label = { connected: "CONNECTED", connecting: "CONNECTING", reconnecting: "RECONNECTING", failed: "FAILED", offline: "OFFLINE" }[status] || String(status).toUpperCase();
    this.ui.connectionBadge.textContent = label;
    this.ui.connectionBadge.dataset.status = status;
  }

  addSystem(text) {
    if (this.ui.transcript.lastElementChild?.textContent.includes(text)) return;
    this.transcript.add("system", text);
  }

  resetAvatar() {
    this.bus.emit("avatar.emotion", { emotion: "neutral", immediate: true });
    this.bus.emit("avatar.viseme", { viseme: "none", weight: 0, rms: 0 });
  }

  finishSpeech() {
    this.bus.emit("avatar.speech-ended", {});
    this.bus.emit("avatar.viseme", { viseme: "none", weight: 0, rms: 0 });
  }

  openSettings() {
    if (this.ui.settingsDialog.open) return;
    if (typeof this.ui.settingsDialog.showModal === "function") this.ui.settingsDialog.showModal();
    else this.ui.settingsDialog.setAttribute("open", "");
  }

  closeSettings() {
    if (typeof this.ui.settingsDialog.close === "function" && this.ui.settingsDialog.open) this.ui.settingsDialog.close();
    else this.ui.settingsDialog.removeAttribute("open");
  }

  showError(message, persistent = false) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    this.ui.toastRegion.append(toast);
    setTimeout(() => toast.remove(), persistent ? 7200 : 4800);
  }

  renderLoop() {
    const now = performance.now();
    const delta = Math.min(0.1, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.lipSync.update(delta);
    this.avatar.update(delta, this.audioPlayer.isPlaying());
    this.updateUI(now);
    requestAnimationFrame(() => this.renderLoop());
  }

  updateUI(now) {
    const state = this.stateMachine.getState();
    this.ui.stageCard.dataset.state = state;
    this.ui.avatarStateLabel.textContent = STATE_LABELS[state];
    this.ui.stageStateCopy.textContent = STATE_COPY[state];
    const output = this.avatar.outputLevel;
    this.ui.outputLevelValue.textContent = `${Math.round(output * 100)}%`;
    this.ui.outputLevelBar.style.width = `${Math.round(output * 100)}%`;
    this.ui.sessionClock.textContent = this.sessionStartedAt ? formatClock(Math.floor((now - this.sessionStartedAt) / 1000)) : "00:00";
    this.ui.waveform.querySelectorAll("i").forEach((bar, index) => {
      const pulse = 0.4 + ((Math.sin(now / 170 + index * 1.4) + 1) / 2) * (state === STATES.SPEAKING ? 0.6 : 0.22);
      bar.style.setProperty("--wave", String(pulse));
    });
    if (this.callActive && this.turnComplete && !this.audioPlayer.isPlaying() && state === STATES.SPEAKING) {
      this.stateMachine.toListening();
      this.finishSpeech();
    }
  }
}

function collectUI() {
  const byId = (id) => document.getElementById(id);
  return {
    avatarCanvas: byId("avatarCanvas"), stageCard: byId("stageCard"), avatarStateLabel: byId("avatarStateLabel"), stageStateCopy: byId("stageStateCopy"), outputLevelValue: byId("outputLevelValue"), outputLevelBar: byId("outputLevelBar"), waveform: byId("waveform"), modelStatus: byId("modelStatus"),
    startCall: byId("startCall"), callButtonIcon: byId("callButtonIcon"), callButtonLabel: byId("callButtonLabel"), settingsButton: byId("settingsButton"), settingsDialog: byId("settingsDialog"), closeSettings: byId("closeSettings"), connectionBadge: byId("connectionBadge"), transcript: byId("transcript"), textForm: byId("textForm"), textInput: byId("textInput"), settingsForm: byId("settingsForm"), apiKey: byId("apiKey"), toggleKey: byId("toggleKey"), voice: byId("voice"), userSystemPrompt: byId("userSystemPrompt"), sessionClock: byId("sessionClock"), toastRegion: byId("toastRegion"),
  };
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function formatClock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => new App(), { once: true });
  else new App();
}
