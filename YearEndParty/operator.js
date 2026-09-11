import { SEGMENTS, createPeer } from "./webrtc-link.js";
import { MicrophoneInput } from "./microphone.js";
import { mergePartial, normalizeTranscript } from "../Avatar/transcript.js";

// operator.js — 手機遙控端：負責 push-to-talk 收音與 Rundown 控制。
// 不渲染 VRM、不連 Gemini、不播放聲音——所有這些都在投影端（stage.html）處理。
// PCM 與 PTT 起訖共用一條 reliable/ordered data channel，避免控制指令超越句尾音訊。

(function () {
  "use strict";

  const STATE_LABELS = Object.freeze({ idle: "待機中", listening: "聆聽中", thinking: "思考中", speaking: "主持中", interrupted: "被打斷" });
  const CONNECTION_LABELS = Object.freeze({ connected: "Gemini 已連線", connecting: "Gemini 連線中…", reconnecting: "Gemini 重新連線中…", failed: "Gemini 連線失敗", offline: "Gemini 尚未連線" });

  class OperatorApp {
    constructor() {
      this.ui = collectUI();
      this.peer = null;
      this.dataConn = null;
      this.geminiReady = false;
      this.connectToken = 0;
      this.mic = new MicrophoneInput(null, { emit: (type, data) => {
        if (type === "audio.input-level") this.ui.levelBar.style.width = `${Math.round(data.level * 100)}%`;
      } });
      this.pttActive = false;
      this.currentSegmentId = "";
      this.partial = { user: "", model: "" };
      this.buildSegmentButtons();
      this.bindEvents();
      this.prefillRoomCode();
      this.setConnected(false);
    }
    prefillRoomCode() {
      const params = new URLSearchParams(location.search);
      const room = params.get("room");
      if (room) this.ui.roomInput.value = room;
    }
    buildSegmentButtons() {
      const container = this.ui.segmentGrid;
      container.innerHTML = "";
      for (const segment of SEGMENTS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "segment-button";
        button.textContent = segment.label;
        button.dataset.segment = segment.id;
        button.disabled = true;
        button.addEventListener("click", () => this.sendSegment(segment));
        container.append(button);
      }
    }
    bindEvents() {
      this.ui.connectForm.addEventListener("submit", (event) => { event.preventDefault(); this.connect(); });
      this.ui.disconnectButton.addEventListener("click", () => this.teardown("已離線，隨時可以重新連線。"));
      this.ui.noteForm.addEventListener("submit", (event) => { event.preventDefault(); this.sendNote(); });
      this.bindPtt();
      window.addEventListener("blur", () => this.stopPtt());
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.stopPtt(); });
      window.addEventListener("pagehide", () => this.teardown(""));
    }
    bindPtt() {
      const button = this.ui.pttButton;
      const down = (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        try { button.setPointerCapture(event.pointerId); } catch (_) { /* capture is optional */ }
        this.startPtt();
      };
      const up = (event) => { try { button.releasePointerCapture(event.pointerId); } catch (_) {} this.stopPtt(); };
      button.addEventListener("pointerdown", down, { passive: false });
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("lostpointercapture", up);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    }
    async connect() {
      const roomCode = this.ui.roomInput.value.trim();
      if (!roomCode) { this.showError("請輸入投影端顯示的房號。"); return; }
      this.ui.connectButton.disabled = true;
      this.ui.connectButton.textContent = "連線中…";
      const token = ++this.connectToken;
      try {
        await this.mic.start((message) => {
          if (token !== this.connectToken || !this.dataConn?.open) return;
          // Bound transport backlog: do not deliver seconds-old partial instructions after a stall.
          if (this.dataConn.bufferSize > 50 || this.dataConn.dataChannel?.bufferedAmount > 64000) {
            this.teardown("網路傳送壅塞，請重新配對後重說這一段。");
            return;
          }
          this.dataConn.send(message);
        });
        if (token !== this.connectToken) return;
        if (!this.peer) this.peer = createPeer(undefined);
        await this.waitForPeerOpen();
        if (token !== this.connectToken) return;
        this.attachPeerHandlers();
        const conn = this.peer.connect(roomCode, { reliable: true });
        this.dataConn = conn;
        conn.on("open", () => {
          if (this.dataConn !== conn) return;
          this.setConnected(true);
        });
        conn.on("data", (data) => { if (this.dataConn === conn) this.handleStageData(data); });
        conn.on("close", () => { if (this.dataConn === conn) this.teardown("與投影端的連線已中斷。"); });
        conn.on("error", (error) => { if (this.dataConn === conn) this.teardown(`連線發生問題：${error?.message || error}`); });
      } catch (error) {
        if (token === this.connectToken) this.teardown(error?.message || "無法連線。");
      }
    }
    waitForPeerOpen() {
      if (this.peer.open) return Promise.resolve();
      const peer = this.peer;
      return new Promise((resolve, reject) => {
        const onOpen = () => { cleanup(); resolve(); };
        const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error?.message || error))); };
        const onClose = () => onError(new Error("配對已取消。"));
        const cleanup = () => { peer.off("open", onOpen); peer.off("error", onError); peer.off("close", onClose); };
        peer.on("open", onOpen);
        peer.on("error", onError);
        peer.on("close", onClose);
      });
    }
    attachPeerHandlers() {
      if (this.peer._operatorHandlersAttached) return;
      this.peer._operatorHandlersAttached = true;
      const peer = this.peer;
      peer.on("error", (error) => {
        if (this.peer !== peer) return;
        if (error?.type === "peer-unavailable") { this.showError("找不到這個房號，請確認投影端已開啟且房號正確。"); this.teardown(""); return; }
        this.showError(`連線發生問題：${error?.message || error}`);
      });
      peer.on("disconnected", () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
    }
    handleStageData(message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "status") { this.ui.stateLabel.textContent = STATE_LABELS[message.state] || message.state; return; }
      if (message.type === "connection") {
        this.geminiReady = message.status === "connected";
        if (!this.geminiReady) this.stopPtt();
        this.ui.connectionLabel.textContent = CONNECTION_LABELS[message.status] || message.status;
        this.updateControls();
        return;
      }
      if (message.type === "transcript" && ["user", "model"].includes(message.role)) {
        this.partial[message.role] = mergePartial(this.partial[message.role], normalizeTranscript(message.text));
        this.ui[message.role === "user" ? "lastHeard" : "lastReply"].textContent = this.partial[message.role];
        return;
      }
      if (message.type === "turn-complete") { this.partial = { user: "", model: "" }; return; }
      if (message.type === "segment-ack") { this.markSegmentActive(message.id); }
    }
    startPtt() {
      if (this.pttActive || !this.dataConn?.open || !this.geminiReady) return;
      this.pttActive = true;
      this.ui.pttButton.classList.add("is-active");
      this.ui.pttButton.setAttribute("aria-pressed", "true");
      this.ui.pttLabel.textContent = "放開＝輪到 Nami";
      this.partial = { user: "", model: "" };
      this.mic.begin().catch((error) => { this.stopPtt(); this.showError(error.message); });
    }
    stopPtt() {
      if (!this.pttActive) return;
      this.pttActive = false;
      this.ui.pttButton.classList.remove("is-active");
      this.ui.pttButton.setAttribute("aria-pressed", "false");
      this.ui.pttLabel.textContent = "按住說話";
      this.mic.end();
    }
    sendSegment(segment) {
      if (!this.dataConn?.open || !this.geminiReady || this.pttActive) return;
      this.dataConn.send({ type: "segment", id: segment.id });
    }
    markSegmentActive(id) {
      this.currentSegmentId = id;
      for (const button of this.ui.segmentGrid.querySelectorAll("button")) button.classList.toggle("is-active", button.dataset.segment === id);
    }
    sendNote() {
      const text = this.ui.noteInput.value.trim();
      if (!text || !this.dataConn?.open || !this.geminiReady || this.pttActive) return;
      this.dataConn.send({ type: "note", text });
      this.ui.noteInput.value = "";
    }
    setConnected(connected) {
      this.ui.pairPanel.hidden = connected;
      this.ui.controlPanel.hidden = !connected;
      this.updateControls();
      this.ui.connectButton.disabled = false;
      this.ui.connectButton.textContent = "連線";
    }
    updateControls() {
      const ready = Boolean(this.dataConn?.open && this.geminiReady);
      this.ui.pttButton.disabled = !ready;
      for (const button of this.ui.segmentGrid.querySelectorAll("button")) button.disabled = !ready;
      this.ui.noteInput.disabled = !ready;
    }
    teardown(message) {
      this.connectToken++;
      this.stopPtt();
      const conn = this.dataConn;
      const peer = this.peer;
      this.dataConn = null;
      this.peer = null;
      try { conn?.close(); } catch (_) {}
      try { peer?.destroy(); } catch (_) {}
      this.mic.stop().catch(() => {});
      this.geminiReady = false;
      this.ui.connectionLabel.textContent = CONNECTION_LABELS.offline;
      this.ui.levelBar.style.width = "0%";
      this.setConnected(false);
      if (message) this.showError(message);
    }
    showError(message) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = message;
      this.ui.toastRegion.append(toast);
      setTimeout(() => toast.remove(), 5200);
    }
  }

  function collectUI() {
    const byId = (id) => document.getElementById(id);
    return {
      pairPanel: byId("pairPanel"), connectForm: byId("connectForm"), roomInput: byId("roomInput"), connectButton: byId("connectButton"),
      controlPanel: byId("controlPanel"), disconnectButton: byId("disconnectButton"),
      stateLabel: byId("stateLabel"), connectionLabel: byId("connectionLabel"),
      segmentGrid: byId("segmentGrid"),
      pttButton: byId("pttButton"), pttLabel: byId("pttLabel"), levelBar: byId("levelBar"),
      noteForm: byId("noteForm"), noteInput: byId("noteInput"),
      lastHeard: byId("lastHeard"), lastReply: byId("lastReply"),
      toastRegion: byId("toastRegion"),
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => new OperatorApp(), { once: true });
  else new OperatorApp();
})();
