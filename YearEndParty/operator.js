import { SEGMENTS, createPeer } from "./webrtc-link.js";

// operator.js — 手機遙控端：負責 push-to-talk 收音與 Rundown 控制。
// 不渲染 VRM、不連 Gemini、不播放聲音——所有這些都在投影端（stage.html）處理。
// 這台裝置只做兩件事：(1) 把麥克風音訊透過 WebRTC 傳給投影端，(2) 把按鈕操作
// 透過 WebRTC data channel 送出指令。

(function () {
  "use strict";

  const STATE_LABELS = Object.freeze({ idle: "待機中", listening: "聆聽中", thinking: "思考中", speaking: "主持中", interrupted: "被打斷" });
  const CONNECTION_LABELS = Object.freeze({ connected: "Gemini 已連線", connecting: "Gemini 連線中…", reconnecting: "Gemini 重新連線中…", failed: "Gemini 連線失敗", offline: "Gemini 尚未連線" });

  function formatMicrophoneError(error) {
    const name = error?.name || "UnknownError";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") return new Error("麥克風權限被拒絕，請在瀏覽器設定允許麥克風後再試一次。");
    if (name === "NotFoundError" || name === "DevicesNotFoundError") return new Error("找不到可用的麥克風。");
    if (name === "SecurityError") return new Error("瀏覽器阻擋了麥克風，請使用 HTTPS 開啟此頁面。");
    return new Error(`無法開啟麥克風（${name}）。`);
  }

  class OperatorApp {
    constructor() {
      this.ui = collectUI();
      this.peer = null;
      this.dataConn = null;
      this.mediaCall = null;
      this.micStream = null;
      this.pttActive = false;
      this.currentSegmentId = "";
      this.levelContext = null;
      this.levelAnalyser = null;
      this.levelData = null;
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
      try {
        // 關閉手機端的即時通話語音處理（AEC/NS/AGC）：手機不會播放現場音響的聲音，AEC 沒有實質作用；
        // NS/AGC 是為了「人耳聽起來舒服」調校，容易在尾牙現場的音樂/嘈雜聲中誤削語音細節，
        // 反而讓 Gemini 的辨識結果偏離實際講話內容。改送更接近原始收音的訊號給 Opus 編碼。
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
        this.startLevelMeter(this.micStream);
        if (!this.peer) this.peer = createPeer(undefined);
        await this.waitForPeerOpen();
        this.attachPeerHandlers();
        const conn = this.peer.connect(roomCode, { reliable: true });
        this.dataConn = conn;
        conn.on("open", () => {
          this.mediaCall = this.peer.call(roomCode, this.micStream);
          this.mediaCall.on("close", () => this.teardown("與投影端的音訊連線已中斷。"));
          this.mediaCall.on("error", () => this.teardown("與投影端的音訊連線發生錯誤。"));
          this.setConnected(true);
        });
        conn.on("data", (data) => this.handleStageData(data));
        conn.on("close", () => this.teardown("與投影端的連線已中斷。"));
        conn.on("error", (error) => this.showError(`連線發生問題：${error?.message || error}`));
      } catch (error) {
        this.showError(error instanceof Error ? error.message : formatMicrophoneError(error).message);
        this.ui.connectButton.disabled = false;
        this.ui.connectButton.textContent = "連線";
      }
    }
    waitForPeerOpen() {
      if (this.peer.open) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const onOpen = () => { cleanup(); resolve(); };
        const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error?.message || error))); };
        const cleanup = () => { this.peer.off("open", onOpen); this.peer.off("error", onError); };
        this.peer.on("open", onOpen);
        this.peer.on("error", onError);
      });
    }
    attachPeerHandlers() {
      if (this.peer._operatorHandlersAttached) return;
      this.peer._operatorHandlersAttached = true;
      this.peer.on("error", (error) => {
        if (error?.type === "peer-unavailable") { this.showError("找不到這個房號，請確認投影端已開啟且房號正確。"); this.teardown(""); return; }
        this.showError(`連線發生問題：${error?.message || error}`);
      });
      this.peer.on("disconnected", () => { if (!this.peer.destroyed) this.peer.reconnect(); });
    }
    handleStageData(message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "status") { this.ui.stateLabel.textContent = STATE_LABELS[message.state] || message.state; return; }
      if (message.type === "connection") { this.ui.connectionLabel.textContent = CONNECTION_LABELS[message.status] || message.status; return; }
      if (message.type === "segment-ack") { this.markSegmentActive(message.id); }
    }
    startPtt() {
      if (this.pttActive || !this.dataConn?.open) return;
      this.pttActive = true;
      this.ui.pttButton.classList.add("is-active");
      this.ui.pttButton.setAttribute("aria-pressed", "true");
      this.ui.pttLabel.textContent = "放開＝輪到 Nami";
      this.dataConn.send({ type: "ptt", active: true });
    }
    stopPtt() {
      if (!this.pttActive) return;
      this.pttActive = false;
      this.ui.pttButton.classList.remove("is-active");
      this.ui.pttButton.setAttribute("aria-pressed", "false");
      this.ui.pttLabel.textContent = "按住說話";
      this.dataConn?.send({ type: "ptt", active: false });
    }
    sendSegment(segment) {
      if (!this.dataConn?.open) return;
      this.dataConn.send({ type: "segment", id: segment.id });
      this.markSegmentActive(segment.id);
    }
    markSegmentActive(id) {
      this.currentSegmentId = id;
      for (const button of this.ui.segmentGrid.querySelectorAll("button")) button.classList.toggle("is-active", button.dataset.segment === id);
    }
    sendNote() {
      const text = this.ui.noteInput.value.trim();
      if (!text || !this.dataConn?.open) return;
      this.dataConn.send({ type: "note", text });
      this.ui.noteInput.value = "";
    }
    startLevelMeter(stream) {
      try {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        this.levelContext = new AudioContextClass();
        this.levelAnalyser = this.levelContext.createAnalyser();
        this.levelAnalyser.fftSize = 512;
        this.levelData = new Uint8Array(this.levelAnalyser.fftSize);
        this.levelContext.createMediaStreamSource(stream).connect(this.levelAnalyser);
        const tick = () => {
          if (!this.levelAnalyser) return;
          this.levelAnalyser.getByteTimeDomainData(this.levelData);
          let sum = 0;
          for (const value of this.levelData) { const sample = (value - 128) / 128; sum += sample * sample; }
          const level = this.pttActive ? Math.min(1, Math.sqrt(sum / this.levelData.length) * 4) : 0;
          this.ui.levelBar.style.width = `${Math.round(level * 100)}%`;
          requestAnimationFrame(tick);
        };
        tick();
      } catch (_) { /* level meter is a nice-to-have, safe to skip on failure */ }
    }
    setConnected(connected) {
      this.ui.pairPanel.hidden = connected;
      this.ui.controlPanel.hidden = !connected;
      this.ui.pttButton.disabled = !connected;
      for (const button of this.ui.segmentGrid.querySelectorAll("button")) button.disabled = !connected;
      this.ui.noteInput.disabled = !connected;
      this.ui.connectButton.disabled = false;
      this.ui.connectButton.textContent = "連線";
    }
    teardown(message) {
      this.stopPtt();
      try { this.mediaCall?.close(); } catch (_) {}
      try { this.dataConn?.close(); } catch (_) {}
      this.mediaCall = null;
      this.dataConn = null;
      this.levelAnalyser = null;
      if (this.levelContext) { try { this.levelContext.close(); } catch (_) {} this.levelContext = null; }
      this.micStream?.getTracks().forEach((track) => track.stop());
      this.micStream = null;
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
      toastRegion: byId("toastRegion"),
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => new OperatorApp(), { once: true });
  else new OperatorApp();
})();
