import { GeminiLiveClient } from "./live-session.js";
import { GeminiAudioPlayer } from "./audio-player.js";
import { DEFAULT_USER_SYSTEM_PROMPT } from "./host-config.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import {
  AVATAR_EMOTIONS,
} from "../Avatar/avatar-emotions.js";
import { collectSessionContext } from "../Avatar/session-context.js";
import { SEGMENTS, randomRoomCode, createPeer } from "./webrtc-link.js";

// stage.js — 投影端筆電使用：只負責顯示 Avatar、連線 Gemini Live、播放語音（接會場音響）。
// 不做任何現場控制——push-to-talk 與 Rundown 環節切換的指令，全部來自手機（operator.html）
// 與 16 kHz PCM 音訊一起透過同一條有序 WebRTC data channel 傳送。
// 不在這台裝置上呼叫 getUserMedia()，也不重新取樣手機音訊。
//
// 這份檔案是 YearEndParty/app.js（單機測試版原型）的姊妹版本：VRM 渲染、Lip Sync、
// State Machine 沿用；Gemini Live 與播放使用共用模組。差異在「輸入來源」——
// 從本機麥克風+本機按鈕，換成 WebRTC 遠端音訊+WebRTC 資料頻道指令。

(function () {
  "use strict";

  const SETTINGS_KEY = "year-end-party.stage.settings.v1";
  const AVATAR_MODELS = Object.freeze([
    { id: "springsnow", name: "SpringSnow", url: "../vrm/SpringSnow.vrm", mouthIntensity: 1 },
    { id: "mia", name: "Mia", url: "../vrm/mia.vrm", mouthIntensity: .6 },
    { id: "sha", name: "Sha", url: "../vrm/sha.vrm", mouthIntensity: .45 },
    { id: "su", name: "Su", url: "../vrm/su.vrm", mouthIntensity: .45 },
    { id: "purple", name: "Purple", url: "../vrm/Purple.vrm", mouthIntensity: 1 },
  ]);
  const DEFAULT_AVATAR_MODEL_ID = AVATAR_MODELS[0].id;
  const NATURAL_ARM_DROP = 1.25;
  const STATES = Object.freeze({ IDLE: "idle", LISTENING: "listening", THINKING: "thinking", SPEAKING: "speaking", INTERRUPTED: "interrupted" });
  const EMOTIONS = AVATAR_EMOTIONS;
  const STATE_LABELS = Object.freeze({ idle: "待機中", listening: "聆聽中", thinking: "思考中", speaking: "主持中", interrupted: "被打斷" });
  const STATE_COPY = Object.freeze({ idle: "等待遙控端下指令", listening: "正在聽工作人員說話", thinking: "讓我想一下", speaking: "主持詞正在變成表情", interrupted: "收到，請繼續說" });
  const DEFAULT_USER_SETTINGS = Object.freeze({ voice: "Aoede", thinking: "", userSystemPrompt: DEFAULT_USER_SYSTEM_PROMPT, apiKey: "", avatarModel: DEFAULT_AVATAR_MODEL_ID });

  class EventBus {
    constructor() { this.listeners = new Map(); }
    on(event, handler) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event).add(handler);
      return () => this.listeners.get(event)?.delete(handler);
    }
    emit(event, data) {
      for (const handler of [...(this.listeners.get(event) || [])]) handler(data);
    }
  }

  class AvatarStateMachine {
    constructor(bus) {
      this.bus = bus;
      this.state = STATES.IDLE;
      this.transitions = {
        [STATES.IDLE]: new Set([STATES.LISTENING]),
        [STATES.LISTENING]: new Set([STATES.THINKING, STATES.IDLE, STATES.INTERRUPTED, STATES.SPEAKING]),
        [STATES.THINKING]: new Set([STATES.SPEAKING, STATES.LISTENING, STATES.IDLE, STATES.INTERRUPTED]),
        [STATES.SPEAKING]: new Set([STATES.IDLE, STATES.INTERRUPTED]),
        [STATES.INTERRUPTED]: new Set([STATES.LISTENING, STATES.IDLE]),
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
      if (this.state === STATES.SPEAKING || this.state === STATES.LISTENING || this.state === STATES.THINKING || this.state === STATES.INTERRUPTED) this.transition(STATES.IDLE);
    }
  }

  class LipSyncEngine {
    constructor(audioPlayer, bus) {
      this.audioPlayer = audioPlayer;
      this.bus = bus;
      this.analyser = null;
      this.timeData = null;
      this.frequencyData = null;
      this.currentWeight = 0;
      this.currentViseme = "none";
      this.rms = 0;
      this.previewUntil = 0;
      this.previewPhase = 0;
      this.lastEmit = 0;
    }
    attach() {
      this.analyser = this.audioPlayer.getAnalyser();
      if (this.analyser) { this.timeData = new Uint8Array(this.analyser.fftSize); this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount); }
    }
    reset() { this.currentWeight = 0; this.currentViseme = "none"; this.rms = 0; this.previewUntil = 0; this.bus.emit("avatar.viseme", { viseme: "none", weight: 0, rms: 0 }); }
    update(deltaTime) {
      let targetWeight = 0;
      let viseme = "none";
      let rawRms = 0;
      const now = performance.now();
      if (now < this.previewUntil) {
        this.previewPhase += deltaTime * 5.2;
        const cadence = Math.sin(this.previewPhase) * .5 + .5;
        targetWeight = .24 + cadence * .62;
        viseme = ["aa", "ih", "ou", "ee", "oh"][Math.floor(this.previewPhase * .62) % 5];
        rawRms = targetWeight / 2;
      } else if (this.analyser && this.audioPlayer.isPlaying()) {
        this.analyser.getByteTimeDomainData(this.timeData);
        this.analyser.getByteFrequencyData(this.frequencyData);
        let sum = 0;
        for (const value of this.timeData) { const sample = (value - 128) / 128; sum += sample * sample; }
        rawRms = Math.sqrt(sum / this.timeData.length);
        if (rawRms > .018) {
          const low = bandAverage(this.frequencyData, 2, 11);
          const mid = bandAverage(this.frequencyData, 11, 34);
          const high = bandAverage(this.frequencyData, 34, 105);
          viseme = classifyViseme(low, mid, high);
          targetWeight = clamp((rawRms - .018) * 4.4, 0, 1);
        }
      }
      const factor = targetWeight > this.currentWeight ? .38 : .18;
      this.currentWeight += (targetWeight - this.currentWeight) * factor;
      if (this.currentWeight < .012) { this.currentWeight = 0; viseme = "none"; }
      this.rms += (rawRms - this.rms) * .28;
      this.currentViseme = viseme;
      if (now - this.lastEmit > 15 || viseme === "none") {
        this.lastEmit = now;
        this.bus.emit("avatar.viseme", { viseme, weight: this.currentWeight, rms: this.rms });
      }
    }
  }

  class VRMAvatarController {
    constructor(canvas, interactionSurface, bus, modelUrl) {
      this.canvas = canvas;
      this.interactionSurface = interactionSurface || canvas.parentElement || canvas;
      this.bus = bus;
      this.modelUrl = modelUrl || AVATAR_MODELS[0].url;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.vrm = null;
      this.loaded = false;
      this.loadProgress = 0;
      this.loadToken = 0;
      this.bones = {};
      this.restPose = new Map();
      this.expressionAliases = {};
      this.tmpEuler = new THREE.Euler();
      this.tmpQuaternion = new THREE.Quaternion();
      this.basePosition = new THREE.Vector3();
      this.baseCameraTarget = new THREE.Vector3(0, 1.55, 0);
      this.viewYaw = 0;
      this.targetViewYaw = 0;
      this.dragPointerId = null;
      this.lastPointerX = 0;
      this.lastPointerY = 0;
      this.viewHandlers = null;
      this.state = STATES.IDLE;
      this.stateWeights = { idle: 1, listening: 0, thinking: 0, speaking: 0, interrupted: 0 };
      this.emotion = "neutral";
      this.emotionFrom = "neutral";
      this.emotionMix = 1;
      this.viseme = "none";
      this.mouthWeight = 0;
      this.mouthIntensity = 1;
      this.inputLevel = 0;
      this.outputLevel = 0;
      this.elapsed = 0;
      this.blinkTimer = randomBetween(2, 6);
      this.blinkProgress = 0;
      this.blinkDirection = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      bus.on("avatar.state", ({ state }) => { this.state = state; });
      bus.on("avatar.emotion", ({ emotion }) => this.setEmotion(emotion));
      bus.on("avatar.viseme", ({ viseme, weight, rms }) => { this.viseme = viseme; this.mouthWeight = weight; this.outputLevel = clamp(rms * 3.5, 0, 1); });
      bus.on("audio.input-level", ({ level }) => { this.inputLevel += (level - this.inputLevel) * .22; });
      bus.on("audio.stopped", () => { this.mouthWeight = 0; this.viseme = "none"; this.outputLevel = 0; });
      this.bindViewControls();
      this.setupScene();
      this.loadModel();
    }
    bindViewControls() {
      const surface = this.interactionSurface;
      if (!surface?.addEventListener) return;
      const pointerDown = (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (this.dragPointerId !== null) return;
        this.dragPointerId = event.pointerId;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        try { surface.setPointerCapture(event.pointerId); } catch (_) { /* capture is optional */ }
        surface.classList.add("is-dragging");
        if (event.pointerType === "mouse") event.preventDefault();
      };
      const pointerMove = (event) => {
        if (this.dragPointerId !== event.pointerId) return;
        const deltaX = event.clientX - this.lastPointerX;
        const deltaY = event.clientY - this.lastPointerY;
        const horizontalIntent = event.pointerType === "mouse" || Math.abs(deltaX) >= Math.abs(deltaY);
        if (horizontalIntent) {
          this.targetViewYaw += deltaX * .008;
          event.preventDefault();
        }
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
      };
      const releasePointer = (event) => {
        if (this.dragPointerId !== event.pointerId) return;
        this.dragPointerId = null;
        try { surface.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
        surface.classList.remove("is-dragging");
        if (event.pointerType === "mouse") event.preventDefault();
      };
      this.viewHandlers = { pointerDown, pointerMove, pointerUp: releasePointer, pointerCancel: releasePointer, lostPointerCapture: releasePointer };
      surface.addEventListener("pointerdown", pointerDown, { passive: false });
      surface.addEventListener("pointermove", pointerMove, { passive: false });
      surface.addEventListener("pointerup", releasePointer, { passive: false });
      surface.addEventListener("pointercancel", releasePointer, { passive: false });
      surface.addEventListener("lostpointercapture", releasePointer, { passive: false });
    }
    updateView(deltaTime) {
      const viewBlend = 1 - Math.exp(-deltaTime * 12);
      this.viewYaw += (this.targetViewYaw - this.viewYaw) * viewBlend;
      if (this.vrm?.scene) this.vrm.scene.rotation.y = Math.PI + this.viewYaw;
    }
    resize() {
      if (!this.renderer || !this.camera) return;
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width || 500);
      const height = Math.max(1, rect.height || 600);
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    setupScene() {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.08;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(25, 1, .01, 100);
        this.camera.position.set(0, 1.55, 8.2);
        this.camera.lookAt(this.baseCameraTarget);

        this.scene.add(new THREE.HemisphereLight(0xc9c4ff, 0x19152e, 1.8));
        const keyLight = new THREE.DirectionalLight(0xffd6c6, 3.2);
        keyLight.position.set(-2.5, 4.5, 4);
        this.scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0x9dacf8, 1.8);
        fillLight.position.set(3.5, 2.4, 2.5);
        this.scene.add(fillLight);
        const rimLight = new THREE.PointLight(0x86e4ce, 3.2, 8, 2);
        rimLight.position.set(0, 2.5, -1.8);
        this.scene.add(rimLight);

        const floor = new THREE.Mesh(
          new THREE.CircleGeometry(1.55, 64),
          new THREE.MeshBasicMaterial({ color: 0xff806b, transparent: true, opacity: .11, depthWrite: false })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.scale.set(1, .24, 1);
        floor.position.y = .012;
        this.scene.add(floor);
        this.resize();
      } catch (error) {
        queueMicrotask(() => this.bus.emit("avatar.error", error instanceof Error ? error : new Error(String(error))));
      }
    }
    async switchModel(url) {
      if (!url || url === this.modelUrl) return;
      this.modelUrl = url;
      await this.loadModel();
    }
    async loadModel() {
      if (!this.renderer) return;
      const requestToken = ++this.loadToken;
      this.loaded = false;
      this.mouthIntensity = AVATAR_MODELS.find((model) => model.url === this.modelUrl)?.mouthIntensity ?? 1;
      if (this.vrm?.scene) {
        this.scene.remove(this.vrm.scene);
        VRMUtils.deepDispose(this.vrm.scene);
      }
      this.vrm = null;
      this.bones = {};
      this.restPose.clear();
      this.expressionAliases = {};
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      this.bus.emit("avatar.loading", { progress: 0 });
      try {
        const gltf = await loader.loadAsync(this.modelUrl, (progress) => {
          const total = Number(progress.total) || 0;
          const loaded = Number(progress.loaded) || 0;
          this.loadProgress = total ? clamp(loaded / total, 0, 1) : this.loadProgress;
          this.bus.emit("avatar.loading", { progress: this.loadProgress });
        });
        if (requestToken !== this.loadToken) return;
        const vrm = gltf.userData.vrm;
        if (!vrm?.scene) throw new Error(`${this.modelUrl} 沒有可顯示的 VRM scene。`);
        this.vrm = vrm;
        this.vrm.scene.rotation.y = Math.PI;
        this.scene.add(this.vrm.scene);
        this.prepareModel();
        this.loaded = true;
        this.bus.emit("avatar.ready", { expressionNames: Object.keys(this.expressionAliases).filter((name) => this.expressionAliases[name]) });
      } catch (error) {
        if (requestToken !== this.loadToken) return;
        this.loaded = false;
        this.bus.emit("avatar.error", error instanceof Error ? error : new Error(String(error)));
      }
    }
    prepareModel() {
      const box = new THREE.Box3().setFromObject(this.vrm.scene);
      const size = box.getSize(new THREE.Vector3());
      const targetHeight = 3.35;
      this.vrm.scene.scale.setScalar(targetHeight / Math.max(size.y, .01));
      const scaledBox = new THREE.Box3().setFromObject(this.vrm.scene);
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
      this.vrm.scene.position.x -= scaledCenter.x;
      this.vrm.scene.position.y -= scaledBox.min.y;
      this.vrm.scene.position.z -= scaledCenter.z;
      this.basePosition.copy(this.vrm.scene.position);

      // targetY 稍微高於畫面中心（.83 而非 .80），讓頭頂跟畫面上緣之間留一點空間，
      // 不然原本 .80 會讓頭頂正好貼齊可視範圍上緣，看起來像被裁到。
      const targetY = targetHeight * .83;
      const visibleHeight = targetHeight * .40;
      const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      this.baseCameraTarget.set(0, targetY, 0);
      this.camera.position.set(0, targetY, distance);
      this.camera.lookAt(this.baseCameraTarget);
      this.resize();
      this.resolveBones();
      this.resolveExpressions();
      this.applyExpressions();
    }
    resolveBones() {
      const humanoid = this.vrm?.humanoid;
      if (!humanoid) return;
      const getBone = (name) => humanoid.getNormalizedBoneNode?.(name) || humanoid.getRawBoneNode?.(name) || null;
      this.bones = {
        hips: getBone("hips"), spine: getBone("spine"), chest: getBone("chest"), neck: getBone("neck"), head: getBone("head"),
        leftShoulder: getBone("leftShoulder"), rightShoulder: getBone("rightShoulder"),
        leftUpperArm: getBone("leftUpperArm"), leftLowerArm: getBone("leftLowerArm"),
        rightUpperArm: getBone("rightUpperArm"), rightLowerArm: getBone("rightLowerArm"),
      };
      this.restPose.clear();
      for (const bone of new Set(Object.values(this.bones).filter(Boolean))) this.restPose.set(bone, bone.quaternion.clone());
    }
    resolveExpressions() {
      const manager = this.vrm?.expressionManager;
      if (!manager) return;
      const names = Object.keys(manager.expressionMap || {});
      const byNormalizedName = new Map(names.map((name) => [normalizeExpressionName(name), name]));
      const aliases = {
        neutral: ["neutral", "Neutral"], happy: ["happy", "Happy", "joy", "Joy", "smile"], sad: ["sad", "Sad"], angry: ["angry", "Angry"], surprised: ["surprised", "Surprised"],
        aa: ["aa", "A", "a", "mouthA", "mouth_aa", "vowelA"], ih: ["ih", "I", "i", "mouthI", "mouth_ih", "vowelI"], ou: ["ou", "U", "u", "mouthU", "mouth_ou", "vowelU"], ee: ["ee", "E", "e", "mouthE", "mouth_ee", "vowelE"], oh: ["oh", "O", "o", "mouthO", "mouth_oh", "vowelO"],
        blink: ["blink", "Blink", "eyesClosed"], blinkLeft: ["blinkLeft", "Blink_L", "blink_l", "eyeBlinkLeft"], blinkRight: ["blinkRight", "Blink_R", "blink_r", "eyeBlinkRight"],
      };
      this.expressionAliases = {};
      for (const [logicalName, candidates] of Object.entries(aliases)) {
        const exact = candidates.find((candidate) => names.includes(candidate) || manager.getExpression?.(candidate));
        this.expressionAliases[logicalName] = exact || candidates.map(normalizeExpressionName).map((name) => byNormalizedName.get(name)).find(Boolean) || null;
      }
    }
    setExpression(logicalName, weight) {
      const manager = this.vrm?.expressionManager;
      const expressionName = this.expressionAliases[logicalName];
      if (!manager || !expressionName) return;
      manager.setValue(expressionName, clamp(weight, 0, 1));
    }
    applyBlink() {
      if (this.expressionAliases.blink) this.setExpression("blink", this.blinkProgress);
      else {
        this.setExpression("blinkLeft", this.blinkProgress);
        this.setExpression("blinkRight", this.blinkProgress);
      }
    }
    applyExpressions() {
      if (!this.vrm?.expressionManager) return;
      for (const name of ["neutral", "happy", "sad", "angry", "surprised"]) {
        const weight = name === this.emotion ? this.emotionMix : name === this.emotionFrom ? 1 - this.emotionMix : 0;
        this.setExpression(name, name === "happy" ? weight * this.mouthIntensity : weight);
      }
      for (const name of ["aa", "ih", "ou", "ee", "oh"]) this.setExpression(name, name === this.viseme ? this.mouthWeight * this.mouthIntensity : 0);
      this.applyBlink();
    }
    applyBoneOffset(name, x = 0, y = 0, z = 0) {
      const bone = this.bones[name];
      const rest = this.restPose.get(bone);
      if (!bone || !rest) return;
      this.tmpEuler.set(x, y, z);
      this.tmpQuaternion.setFromEuler(this.tmpEuler);
      bone.quaternion.copy(rest).multiply(this.tmpQuaternion);
    }
    resetPose() {
      for (const [bone, quaternion] of this.restPose) bone.quaternion.copy(quaternion);
    }
    animatePose() {
      const t = this.elapsed;
      const listening = this.stateWeights.listening;
      const thinkingState = this.stateWeights.thinking;
      const speaking = this.stateWeights.speaking;
      const interrupted = this.stateWeights.interrupted;
      const breath = Math.sin(t * 1.52 + Math.sin(t * .17) * .2) * .018;
      const weightShift = Math.sin(t * .37 + .4) * .025 + Math.sin(t * .19 + 2.2) * .012;
      const gazeYaw = Math.sin(t * .23 + .5) * .022 + Math.sin(t * .071 + 1.8) * .018;
      const gazePitch = Math.sin(t * .29 + 2.4) * .011;
      const listeningNod = listening * Math.pow(Math.max(0, Math.sin(t * .68 - .7)), 10);
      const speechEnergy = speaking * (.25 + this.outputLevel * .75);
      const speechBeat = Math.sin(t * 2.4) + Math.sin(t * 4.1 + 1.1) * .32;
      let headPitch = breath * .35 + gazePitch + listeningNod * .035 + speechBeat * .016 * speechEnergy;
      let headYaw = gazeYaw + weightShift * .45 + Math.sin(t * .91 + .8) * .018 * speechEnergy;
      let headRoll = Math.sin(t * .31 + .8) * .016 + listening * Math.sin(t * .75) * .018;
      let bodyBob = breath * .25 + speechBeat * .005 * speechEnergy;
      headRoll += thinkingState * (Math.sin(t * .8) * .035 - .055);
      headYaw -= thinkingState * .035;
      headPitch += interrupted * .025;

      const shoulderSway = weightShift * .32 + breath * .18;
      const armDrift = Math.sin(t * .53 + .4) * .018 + Math.sin(t * .21 + 2) * .009;
      const elbowRelax = .05 + Math.sin(t * .47 + 1.5) * .012;
      this.applyBoneOffset("hips", 0, weightShift * .2, weightShift * .12);
      this.applyBoneOffset("spine", breath * .18 - listening * .008, weightShift * .22, -weightShift * .12);
      this.applyBoneOffset("chest", breath * .45 + speechBeat * .006 * speechEnergy, weightShift * .42, weightShift * .2);
      this.applyBoneOffset("leftShoulder", 0, 0, shoulderSway);
      this.applyBoneOffset("rightShoulder", 0, 0, shoulderSway * .72);
      this.applyBoneOffset("neck", headPitch * .35, headYaw * .35, headRoll * .35);
      this.applyBoneOffset("head", headPitch, headYaw, headRoll);
      this.applyBoneOffset("leftUpperArm", 0, 0, NATURAL_ARM_DROP + armDrift - weightShift * .16);
      this.applyBoneOffset("leftLowerArm", -elbowRelax, 0, 0);
      this.applyBoneOffset("rightUpperArm", 0, 0, -NATURAL_ARM_DROP + armDrift * .76 + weightShift * .13);
      this.applyBoneOffset("rightLowerArm", -elbowRelax, 0, 0);
      if (this.vrm.scene) {
        this.vrm.scene.position.x = this.basePosition.x + weightShift * .018;
        this.vrm.scene.position.y = this.basePosition.y + bodyBob;
      }
    }
    setEmotion(emotion) {
      if (!EMOTIONS.includes(emotion) || emotion === this.emotion) return;
      this.emotionFrom = this.emotion;
      this.emotion = emotion;
      this.emotionMix = 0;
    }
    update(deltaTime) {
      this.elapsed += deltaTime;
      this.updateView(deltaTime);
      const stateBlend = 1 - Math.exp(-deltaTime * 4.5);
      for (const state of Object.values(STATES)) this.stateWeights[state] += ((state === this.state ? 1 : 0) - this.stateWeights[state]) * stateBlend;
      if (this.emotionMix < 1) this.emotionMix = Math.min(1, this.emotionMix + deltaTime / .3);
      this.updateBlink(deltaTime);
      if (this.loaded) {
        this.resetPose();
        this.animatePose(deltaTime);
        this.applyExpressions();
        this.vrm.update?.(deltaTime);
      }
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
    }
    updateBlink(deltaTime) {
      this.blinkTimer -= deltaTime;
      if (this.blinkDirection === 0 && this.blinkTimer <= 0) { this.blinkDirection = 1; this.blinkTimer = .075; }
      if (this.blinkDirection === 1) { this.blinkProgress = Math.min(1, this.blinkProgress + deltaTime / .075); if (this.blinkProgress >= 1) { this.blinkDirection = -1; this.blinkTimer = .075; } }
      else if (this.blinkDirection === -1) { this.blinkProgress = Math.max(0, this.blinkProgress - deltaTime / .075); if (this.blinkProgress <= 0) { this.blinkDirection = 0; this.blinkTimer = randomBetween(2, 6); } }
    }
    dispose() {
      const surface = this.interactionSurface;
      if (surface && this.viewHandlers) {
        surface.removeEventListener("pointerdown", this.viewHandlers.pointerDown);
        surface.removeEventListener("pointermove", this.viewHandlers.pointerMove);
        surface.removeEventListener("pointerup", this.viewHandlers.pointerUp);
        surface.removeEventListener("pointercancel", this.viewHandlers.pointerCancel);
        surface.removeEventListener("lostpointercapture", this.viewHandlers.lostPointerCapture);
      }
      this.dragPointerId = null;
      this.resizeObserver.disconnect();
      this.renderer?.dispose();
    }
  }

  class PeerLink {
    constructor(bus) {
      this.bus = bus;
      this.peer = null;
      this.roomCode = "";
      this.dataConn = null;
    }
    start() {
      this.roomCode = randomRoomCode();
      this.openPeer(this.roomCode);
    }
    openPeer(id) {
      const peer = createPeer(id);
      this.peer = peer;
      peer.on("open", (peerId) => { this.roomCode = peerId; this.bus.emit("peerlink.ready", { roomCode: peerId }); });
      peer.on("connection", (conn) => this.attachDataConnection(conn));
      peer.on("error", (error) => {
        if (error?.type === "unavailable-id") { try { peer.destroy(); } catch (_) {} this.openPeer(randomRoomCode()); return; }
        this.bus.emit("peerlink.error", error instanceof Error ? error : new Error(String(error?.message || error)));
      });
      peer.on("disconnected", () => { this.bus.emit("peerlink.status", { status: "reconnecting" }); if (!peer.destroyed) peer.reconnect(); });
    }
    attachDataConnection(conn) {
      const previous = this.dataConn;
      this.dataConn = conn;
      if (previous) { previous.close(); this.bus.emit("peerlink.disconnected", {}); }
      conn.on("open", () => { if (this.dataConn === conn) this.bus.emit("peerlink.connected", {}); });
      conn.on("data", (data) => { if (this.dataConn === conn) this.bus.emit("peerlink.data", data); });
      conn.on("close", () => { if (this.dataConn !== conn) return; this.dataConn = null; this.bus.emit("peerlink.disconnected", {}); });
      conn.on("error", (error) => this.bus.emit("peerlink.error", error instanceof Error ? error : new Error(String(error?.message || error))));
    }
    send(message) {
      if (this.dataConn?.open) this.dataConn.send(message);
    }
    isConnected() { return Boolean(this.dataConn?.open); }
  }

  class App {
    constructor() {
      this.bus = new EventBus();
      this.ui = collectUI();
      populateAvatarModelSelect(this.ui.avatarModel);
      this.settings = loadSettings();
      this.stateMachine = new AvatarStateMachine(this.bus);
      this.audioPlayer = new GeminiAudioPlayer(this.bus);
      this.lipSync = new LipSyncEngine(this.audioPlayer, this.bus);
      const initialModel = AVATAR_MODELS.find((model) => model.id === this.settings.avatarModel) || AVATAR_MODELS[0];
      this.avatar = new VRMAvatarController(this.ui.avatarCanvas, this.ui.stageVisual, this.bus, initialModel.url);
      this.gemini = new GeminiLiveClient(this.bus);
      this.peerLink = new PeerLink(this.bus);
      this.callActive = false;
      this.callToken = 0;
      this.turnComplete = false;
      this.sessionStartedAt = 0;
      this.pttActive = false;
      this.currentSegmentId = "";
      this.hasEverPaired = false;
      this.lastFrame = performance.now();
      this.fps = 60;
      this.pipWindow = null;
      this.pipPlaceholder = null;
      this.loopGeneration = 0;
      this.bindEvents();
      this.applySettings();
      this.updateCallButton(false);
      this.setPairPanelVisible(true);
      this.setupPip();
      this.peerLink.start();
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && this.callActive) this.audioPlayer.ensureContext().catch((error) => this.showError(`AudioContext 無法恢復：${error.message}`));
      });
      window.addEventListener("pagehide", () => { this.pipWindow?.close(); this.gemini.disconnect(false); this.audioPlayer.close(); this.avatar.dispose(); });
      this.startRenderLoop();
    }
    bindEvents() {
      this.ui.startCall.addEventListener("click", () => { if (this.callActive) this.endCall(); else this.startCall(); });
      this.ui.settingsButton.addEventListener("click", () => this.openSettings());
      this.ui.pipButton?.addEventListener("click", () => this.togglePip());
      this.ui.closeSettings.addEventListener("click", () => this.closeSettings());
      this.ui.settingsDialog.addEventListener("click", (event) => { if (event.target === this.ui.settingsDialog) this.closeSettings(); });
      this.ui.toggleKey.addEventListener("click", () => { const visible = this.ui.apiKey.type === "text"; this.ui.apiKey.type = visible ? "password" : "text"; this.ui.toggleKey.textContent = visible ? "show" : "hide"; });
      this.ui.settingsForm.addEventListener("input", () => this.saveSettings());
      this.ui.avatarModel.addEventListener("change", () => {
        this.saveSettings();
        const model = AVATAR_MODELS.find((entry) => entry.id === this.settings.avatarModel);
        if (model) this.avatar.switchModel(model.url);
      });

      this.bus.on("avatar.loading", ({ progress }) => { this.ui.modelStatus.textContent = `VRM / ${progress > 0 ? `${Math.round(progress * 100)}%` : "LOADING"}`; });
      this.bus.on("avatar.ready", () => { this.ui.modelStatus.textContent = "VRM / READY"; });
      this.bus.on("avatar.error", (error) => { this.ui.modelStatus.textContent = "VRM / ERROR"; this.showError(`VRM 載入失敗：${error.message || error}`, true); });

      this.bus.on("gemini.status", ({ status }) => this.setConnectionStatus(status));
      this.bus.on("gemini.connected", ({ model }) => { this.setConnectionStatus("connected"); this.stateMachine.toListening(); this.showToast(`已連上 ${model.replace("-preview", "")}。`); });
      this.bus.on("gemini.disconnected", () => this.setConnectionStatus("offline"));
      this.bus.on("gemini.error", (error) => this.showError(error.message));
      this.bus.on("gemini.input-start", () => { this.audioPlayer.stop(); this.lipSync.reset(); });
      this.bus.on("gemini.connection-lost", () => { this.pttActive = false; this.audioPlayer.stop(); this.lipSync.reset(); this.resetEmotion(); });
      this.bus.on("gemini.avatar-emotion", ({ emotion }) => { this.bus.emit("avatar.emotion", { emotion }); });
      this.bus.on("gemini.user-transcript", (text) => { this.stateMachine.toThinking(); this.turnComplete = false; this.peerLink.send({ type: "transcript", role: "user", text }); });
      this.bus.on("gemini.model-transcript", (text) => { this.peerLink.send({ type: "transcript", role: "model", text }); });
      this.bus.on("gemini.audio", ({ bytes, sampleRate }) => { this.audioPlayer.enqueue(bytes, sampleRate); });
      this.bus.on("gemini.audio-turn", () => { this.stateMachine.toSpeaking(); this.turnComplete = false; });
      this.bus.on("gemini.interrupted", () => { this.audioPlayer.stop(); this.lipSync.reset(); this.resetEmotion(); this.stateMachine.transition(STATES.INTERRUPTED); this.stateMachine.toListening(); });
      this.bus.on("gemini.turn-complete", () => { this.turnComplete = true; this.peerLink.send({ type: "turn-complete" }); });

      this.bus.on("peerlink.ready", ({ roomCode }) => this.showRoomCode(roomCode));
      this.bus.on("peerlink.connected", () => {
        this.hasEverPaired = true; this.setPeerStatus(true); this.setPairPanelVisible(false);
        this.peerLink.send({ type: "connection", status: this.gemini.isConnected() ? "connected" : "offline" });
        this.peerLink.send({ type: "status", state: this.stateMachine.state });
      });
      this.bus.on("peerlink.disconnected", () => { this.setPeerStatus(false); this.stopPtt(); if (!this.hasEverPaired) this.setPairPanelVisible(true); });
      this.bus.on("peerlink.error", (error) => this.showError(`遙控端連線發生問題：${error.message}`));
      this.bus.on("peerlink.data", (message) => this.handlePeerData(message));
    }
    handlePeerData(message) {
      if (!message || typeof message !== "object") return;
      if (message.type === "ptt") { message.active ? this.startPtt() : this.stopPtt(); return; }
      if (message.type === "audio") {
        const bytes = message.bytes instanceof ArrayBuffer ? new Uint8Array(message.bytes) : message.bytes;
        if (this.pttActive && bytes instanceof Uint8Array && bytes.byteLength <= 640 && bytes.byteLength % 2 === 0) this.gemini.sendAudio(bytes);
        return;
      }
      if (message.type === "segment") { const segment = SEGMENTS.find((item) => item.id === message.id); if (segment) this.activateSegment(segment); return; }
      if (message.type === "note") { const text = String(message.text || "").trim(); if (text && this.gemini.sendText(text)) this.stateMachine.toThinking(); }
    }
    startPtt() {
      if (this.pttActive) return;
      if (!this.callActive || !this.gemini.isConnected()) { this.showError("尚未開始對話，無法送話。", true); return; }
      this.pttActive = true;
      this.gemini.activityStart();
      this.stateMachine.toListening();
    }
    stopPtt() {
      if (!this.pttActive) return;
      this.pttActive = false;
      this.gemini.activityEnd();
      this.stateMachine.toThinking();
    }
    activateSegment(segment) {
      this.currentSegmentId = segment.id;
      this.ui.currentSegmentLabel.textContent = segment.label;
      if (this.callActive && this.gemini.isConnected() && this.gemini.sendText(segment.context)) {
        this.stateMachine.toThinking();
        this.peerLink.send({ type: "segment-ack", id: segment.id });
      }
    }
    applySettings() {
      this.ui.voice.value = this.settings.voice;
      this.ui.thinking.value = this.settings.thinking;
      this.ui.userSystemPrompt.value = this.settings.userSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT;
      this.ui.apiKey.value = this.settings.apiKey || "";
      this.ui.avatarModel.value = this.settings.avatarModel;
    }
    saveSettings() {
      const avatarModel = AVATAR_MODELS.some((entry) => entry.id === this.ui.avatarModel.value) ? this.ui.avatarModel.value : DEFAULT_AVATAR_MODEL_ID;
      this.settings = {
        voice: this.ui.voice.value,
        thinking: this.ui.thinking.value,
        userSystemPrompt: this.ui.userSystemPrompt.value.trim() || DEFAULT_USER_SYSTEM_PROMPT,
        apiKey: this.ui.apiKey.value.trim(),
        avatarModel,
      };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (_) { /* storage may be blocked */ }
    }
    collectConfig() {
      const apiKey = this.ui.apiKey.value.trim();
      const userSystemPrompt = this.ui.userSystemPrompt.value.trim() || DEFAULT_USER_SYSTEM_PROMPT;
      return { apiKey, voice: this.ui.voice.value, thinking: this.ui.thinking.value, userSystemPrompt };
    }
    async startCall() {
      if (this.callActive) return;
      const config = this.collectConfig();
      if (!config.apiKey) { this.showError("請先點擊右上角設定 icon 貼上 Gemini API key。", true); this.openSettings(); this.ui.apiKey.focus(); return; }
      this.saveSettings();
      const callToken = ++this.callToken;
      this.callActive = true;
      this.sessionStartedAt = performance.now();
      this.turnComplete = false;
      this.updateCallButton(true);
      this.setConnectionStatus("connecting");
      try {
        await this.audioPlayer.ensureContext();
        if (!this.callActive || callToken !== this.callToken) return;
        this.lipSync.attach();
        const sessionContext = await collectSessionContext();
        if (!this.callActive || callToken !== this.callToken) return;
        this.gemini.start({ ...config, sessionContext });
        this.stateMachine.toListening();
      } catch (error) {
        if (!this.callActive || callToken !== this.callToken) return;
        await this.abortCall();
        this.showError(error.message || "無法開始通話。", true);
      }
    }
    async endCall() {
      await this.abortCall();
    }
    async abortCall() {
      this.callToken += 1;
      this.callActive = false;
      this.pttActive = false;
      this.gemini.disconnect();
      this.audioPlayer.stop();
      this.lipSync.reset();
      this.resetEmotion();
      this.stateMachine.toIdle();
      this.updateCallButton(false);
      this.sessionStartedAt = 0;
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
    // 浮動視窗（Document Picture-in-Picture）：把 #stageVisual 這塊 DOM 原地搬進一個獨立的
    // 常駐頂層小視窗，可拖曳、可縮放，切換分頁去開小遊戲／抽獎頁面時仍浮在最上層。
    // 純附加功能——不支援的瀏覽器直接隱藏按鈕，其餘連線／播放／狀態機邏輯完全不受影響；
    // 只有 renderLoop 的 requestAnimationFrame 來源會跟著目前畫面所在的視窗切換，
    // 這是避免分頁被切到背景時動畫被瀏覽器節流卡住的必要作法。
    setupPip() {
      if (!this.ui.pipButton || !("documentPictureInPicture" in window)) return;
      this.ui.pipButton.hidden = false;
    }
    async togglePip() {
      if (this.pipWindow) {
        const pipWindow = this.pipWindow;
        this.exitPip();
        pipWindow.close();
        return;
      }
      await this.enterPip();
    }
    async enterPip() {
      const stageVisual = this.ui.stageVisual;
      const rect = stageVisual.getBoundingClientRect();
      let pipWindow;
      try {
        pipWindow = await documentPictureInPicture.requestWindow({
          width: Math.max(240, Math.round(rect.width) || 360),
          height: Math.max(240, Math.round(rect.height) || 480),
        });
      } catch (error) {
        this.showError(`無法開啟浮動視窗：${error.message || error}`, true);
        return;
      }
      this.pipWindow = pipWindow;
      for (const styleSheet of document.styleSheets) {
        if (!styleSheet.href) continue;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = styleSheet.href;
        pipWindow.document.head.append(link);
      }
      pipWindow.document.title = document.title;
      pipWindow.document.body.classList.add("stage-pip-body");
      this.pipPlaceholder = document.createComment("stage-visual-placeholder");
      stageVisual.before(this.pipPlaceholder);
      pipWindow.document.body.append(stageVisual);
      this.avatar.resize();
      this.startRenderLoop();
      pipWindow.addEventListener("resize", () => this.avatar.resize());
      pipWindow.addEventListener("pagehide", () => { if (this.pipWindow === pipWindow) this.exitPip(); }, { once: true });
      this.updatePipButton(true);
      this.closeSettings();
    }
    exitPip() {
      if (!this.pipWindow) return;
      const stageVisual = this.ui.stageVisual;
      if (this.pipPlaceholder?.parentNode) {
        this.pipPlaceholder.replaceWith(stageVisual);
      }
      this.pipPlaceholder = null;
      this.pipWindow = null;
      this.avatar.resize();
      this.startRenderLoop();
      this.updatePipButton(false);
    }
    updatePipButton(active) {
      if (!this.ui.pipButton) return;
      this.ui.pipButton.classList.toggle("is-active", active);
      this.ui.pipButton.setAttribute("aria-pressed", String(active));
      this.ui.pipButton.title = active ? "取消浮動視窗" : "浮動視窗（切換分頁時仍會顯示在最上層）";
    }
    setEmotion(emotion) {
      if (!EMOTIONS.includes(emotion)) return;
      this.bus.emit("avatar.emotion", { emotion });
    }
    updateCallButton(active) {
      this.ui.startCall.classList.toggle("is-active", active);
      this.ui.startCall.setAttribute("aria-pressed", String(active));
      const label = active ? "結束對話" : "開始對話";
      this.ui.startCall.setAttribute("aria-label", label);
      this.ui.startCall.title = label;
      this.ui.callButtonIcon.textContent = active ? "×" : "◉";
      this.ui.callButtonLabel.textContent = label;
    }
    setConnectionStatus(status) {
      const label = { connected: "CONNECTED", connecting: "CONNECTING", reconnecting: "RECONNECTING", failed: "FAILED", offline: "OFFLINE" }[status] || String(status).toUpperCase();
      this.ui.connectionBadge.textContent = label;
      this.ui.connectionBadge.dataset.status = status;
      this.peerLink.send({ type: "connection", status });
    }
    setPeerStatus(connected) {
      this.ui.peerBadge.textContent = connected ? "遙控端已連線" : "等待遙控端連線";
      this.ui.peerBadge.dataset.status = connected ? "connected" : "offline";
    }
    showRoomCode(roomCode) {
      this.ui.roomCode.textContent = roomCode;
      const operatorUrl = new URL("./operator.html", location.href);
      operatorUrl.searchParams.set("room", roomCode);
      this.ui.roomUrl.textContent = operatorUrl.toString();
      if (globalThis.QRCode?.toCanvas) {
        globalThis.QRCode.toCanvas(this.ui.qrCanvas, operatorUrl.toString(), { width: 176, margin: 1 }, (error) => { if (error) this.showError("QR code 產生失敗，請直接用房號配對。"); });
      }
    }
    setPairPanelVisible(visible) {
      this.ui.pairPanel.hidden = !visible;
    }
    showToast(message) {
      const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; this.ui.toastRegion.append(toast);
      setTimeout(() => toast.remove(), 4200);
    }
    showError(message, persistent = false) {
      const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; this.ui.toastRegion.append(toast);
      setTimeout(() => toast.remove(), persistent ? 7200 : 4800);
    }
    // startRenderLoop 用世代編號（loopGeneration）保護：進出浮動視窗時會重新呼叫它，
    // 讓迴圈立刻改綁到目前正確的視窗。舊迴圈下一次要排下一幀時發現世代編號已經變了就
    // 自行停止，避免浮動視窗關閉瞬間「上一輪排給它的 requestAnimationFrame 永遠不會觸發」
    // 導致整個動畫迴圈跟著停擺、Avatar 搬回原本視窗後卻不會再更新畫面。
    startRenderLoop() {
      const generation = ++this.loopGeneration;
      const step = () => {
        if (generation !== this.loopGeneration) return;
        this.renderFrame();
        (this.pipWindow || window).requestAnimationFrame(step);
      };
      step();
    }
    renderFrame() {
      const now = performance.now();
      const delta = Math.min(.1, Math.max(.001, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.fps += ((1 / delta) - this.fps) * .08;
      this.lipSync.update(delta);
      this.avatar.update(delta);
      this.updateUI(now);
    }
    updateUI(now) {
      const state = this.stateMachine.getState();
      if (this.ui.stageCard.dataset.state !== state) {
        this.ui.stageCard.dataset.state = state;
        this.peerLink.send({ type: "status", state });
      }
      this.ui.avatarStateLabel.textContent = STATE_LABELS[state];
      this.ui.stageStateCopy.textContent = STATE_COPY[state];
      const output = this.avatar.outputLevel;
      this.ui.outputLevelValue.textContent = `${Math.round(output * 100)}%`;
      this.ui.outputLevelBar.style.width = `${Math.round(output * 100)}%`;
      if (this.sessionStartedAt) { const seconds = Math.floor((now - this.sessionStartedAt) / 1000); this.ui.sessionClock.textContent = formatClock(seconds); } else this.ui.sessionClock.textContent = "00:00";
      if (this.callActive && this.turnComplete && !this.audioPlayer.isPlaying() && state === STATES.SPEAKING) { this.stateMachine.toListening(); this.resetEmotion(); }
    }
    resetEmotion() { this.bus.emit("avatar.emotion", { emotion: "neutral" }); }
  }

  function collectUI() {
    const byId = (id) => document.getElementById(id);
    return {
      avatarCanvas: byId("avatarCanvas"), stageVisual: byId("stageVisual"), modelStatus: byId("modelStatus"), stageCard: byId("stageCard"), avatarStateLabel: byId("avatarStateLabel"), stageStateCopy: byId("stageStateCopy"), outputLevelValue: byId("outputLevelValue"), outputLevelBar: byId("outputLevelBar"), currentSegmentLabel: byId("currentSegmentLabel"),
      startCall: byId("startCall"), callButtonIcon: byId("callButtonIcon"), callButtonLabel: byId("callButtonLabel"), settingsButton: byId("settingsButton"), settingsDialog: byId("settingsDialog"), closeSettings: byId("closeSettings"), connectionBadge: byId("connectionBadge"), settingsForm: byId("settingsForm"), apiKey: byId("apiKey"), toggleKey: byId("toggleKey"), voice: byId("voice"), thinking: byId("thinking"), avatarModel: byId("avatarModel"), userSystemPrompt: byId("userSystemPrompt"), sessionClock: byId("sessionClock"), toastRegion: byId("toastRegion"),
      pairPanel: byId("pairPanel"), roomCode: byId("roomCode"), roomUrl: byId("roomUrl"), qrCanvas: byId("qrCanvas"), peerBadge: byId("peerBadge"),
      pipButton: byId("pipButton"),
    };
  }

  function populateAvatarModelSelect(select) {
    select.innerHTML = "";
    for (const model of AVATAR_MODELS) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      select.append(option);
    }
  }

  function loadSettings() {
    try {
      const localSaved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      const saved = { ...DEFAULT_USER_SETTINGS, ...(localSaved && typeof localSaved === "object" ? localSaved : {}) };
      const avatarModel = AVATAR_MODELS.some((model) => model.id === saved.avatarModel) ? saved.avatarModel : DEFAULT_AVATAR_MODEL_ID;
      return { voice: saved.voice, thinking: saved.thinking, userSystemPrompt: saved.userSystemPrompt || DEFAULT_USER_SYSTEM_PROMPT, apiKey: saved.apiKey, avatarModel };
    } catch (_) {
      return { ...DEFAULT_USER_SETTINGS };
    }
  }
  function bandAverage(data, start, end) { let total = 0; let count = 0; for (let index = start; index < Math.min(end, data.length); index += 1) { total += data[index]; count += 1; } return count ? total / count : 0; }
  function classifyViseme(low, mid, high) { if (low > mid * 1.2 && low > high * 1.15) return "ou"; if (high > mid * 1.1) return high > low * 1.3 ? "ee" : "ih"; if (mid > low * 1.16) return "aa"; return "oh"; }
  function normalizeExpressionName(name) { return String(name).replace(/[^a-z0-9]/gi, "").toLowerCase(); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function randomBetween(min, max) { return min + Math.random() * (max - min); }
  function formatClock(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => new App(), { once: true });
  else new App();
})();
