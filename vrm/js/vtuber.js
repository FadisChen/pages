import * as THREE from 'three';
import { VRMViewer } from './vrm-viewer.js';
import { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { MotionRetargeter, ARM_BONES, FINGER_BONES } from './motion-retargeter.js';

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const modelSelect = document.getElementById('model-select');
const bgSelect = document.getElementById('bg-select');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const video = document.getElementById('webcam-video');
const webcamPreview = document.getElementById('webcam-preview');
const toggleCameraBtn = document.getElementById('toggle-camera');
const toggleMirrorBtn = document.getElementById('toggle-mirror');
const togglePreviewBtn = document.getElementById('toggle-preview');
const togglePoseBtn = document.getElementById('toggle-pose');
const toggleHandsBtn = document.getElementById('toggle-hands');
const headGainInput = document.getElementById('head-gain');
const exprGainInput = document.getElementById('expr-gain');
const handDebugEl = document.getElementById('hand-debug');

const viewer = new VRMViewer(canvas, { transparent: true });

let faceLandmarker = null;
let poseLandmarker = null;
let handLandmarker = null;
let stream = null;
let running = false;
let poseEnabled = true;
let handsEnabled = true;
let lastVideoTime = -1;
let mirrorMode = true;
let headGain = 1;
let exprGain = 1;
let retargeter = null;
let lastTrackingTime = null;

let curYaw = 0;
let curPitch = 0;
let curRoll = 0;

function setLoading(visible, text) {
  loadingEl.classList.toggle('hidden', !visible);
  if (text) loadingText.textContent = text;
}

function setStatus(state, text) {
  statusDot.classList.remove('live', 'error');
  if (state === 'live') statusDot.classList.add('live');
  if (state === 'error') statusDot.classList.add('error');
  statusText.textContent = text;
}

function applyBackground(mode) {
  if (mode === 'green') viewport.style.background = '#00ff00';
  else if (mode === 'dark') viewport.style.background = '#14141c';
  else viewport.style.background = 'transparent';
}

async function loadModel(file) {
  setLoading(true, `模型載入中… ${file}`);
  retargeter = null;
  try {
    await viewer.loadVRM(file, (evt) => {
      if (evt.total) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        setLoading(true, `模型載入中… ${pct}%`);
      }
    });
    retargeter = new MotionRetargeter(viewer.vrm, viewer.bindPose);
    lastTrackingTime = null;
    viewer.camera.position.set(0, 1.35, 2.4);
    viewer.controls.target.set(0, 1.25, 0);
    viewer.controls.update();
  } catch (err) {
    console.error(err);
    setLoading(true, `載入失敗: ${err.message || err}`);
    return;
  }
  setLoading(false);
}

async function initFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const baseOptions = { modelAssetPath: FACE_MODEL_URL };
  const options = {
    baseOptions,
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...baseOptions, delegate: 'GPU' },
    });
  } catch (err) {
    console.warn('GPU delegate failed, falling back to CPU', err);
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, options);
  }
}

async function initPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const baseOptions = { modelAssetPath: POSE_MODEL_URL };
  const options = { baseOptions, runningMode: 'VIDEO', numPoses: 1 };
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...baseOptions, delegate: 'GPU' },
    });
  } catch (err) {
    console.warn('GPU delegate failed, falling back to CPU', err);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
  }
}

async function initHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const baseOptions = { modelAssetPath: HAND_MODEL_URL };
  const options = { baseOptions, runningMode: 'VIDEO', numHands: 2 };
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...baseOptions, delegate: 'GPU' },
    });
  } catch (err) {
    console.warn('GPU delegate failed, falling back to CPU', err);
    handLandmarker = await HandLandmarker.createFromOptions(vision, options);
  }
}

async function startCamera() {
  setStatus('idle', '啟動中…');
  toggleCameraBtn.disabled = true;
  try {
    if (!faceLandmarker) {
      setLoading(true, '正在下載臉部追蹤模型…');
      await initFaceLandmarker();
      setLoading(false);
    }
    if (!poseLandmarker) {
      setLoading(true, '正在下載姿勢追蹤模型…');
      await initPoseLandmarker();
      setLoading(false);
    }
    if (!handLandmarker) {
      setLoading(true, '正在下載手掌追蹤模型…');
      await initHandLandmarker();
      setLoading(false);
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    lastVideoTime = -1;
    lastTrackingTime = null;
    viewer.idleBreathing = false;
    viewer.autoBlink = false;
    toggleCameraBtn.textContent = '停止攝影機追蹤';
    toggleCameraBtn.classList.add('toggled');
    setStatus('live', '追蹤中');
  } catch (err) {
    console.error(err);
    setStatus('error', `啟動失敗: ${err.message || err}`);
  } finally {
    toggleCameraBtn.disabled = false;
  }
}

function stopCamera() {
  running = false;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  video.srcObject = null;
  lastVideoTime = -1;
  lastTrackingTime = null;
  retargeter?.reset();
  viewer.idleBreathing = true;
  viewer.autoBlink = true;
  viewer.resetPose();
  for (const name of [
    'aa', 'ih', 'ou', 'ee', 'oh',
    'blink', 'blinkLeft', 'blinkRight',
    'happy', 'angry', 'sad', 'relaxed', 'surprised',
  ]) {
    viewer.setExpression(name, 0);
  }
  toggleCameraBtn.textContent = '啟動攝影機追蹤';
  toggleCameraBtn.classList.remove('toggled');
  setStatus('idle', '尚未啟動');
  if (handDebugEl) handDebugEl.textContent = '尚無資料';
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

const smoothedBlendshapes = {};
const BLENDSHAPE_SMOOTHING = 0.35; // lower = smoother but more laggy

function applyBlendshapes(categories) {
  for (const c of categories) {
    const prev = smoothedBlendshapes[c.categoryName] ?? c.score;
    smoothedBlendshapes[c.categoryName] = prev + (c.score - prev) * BLENDSHAPE_SMOOTHING;
  }
  const bs = smoothedBlendshapes;
  const g = (v, mul = 1) => clamp01((bs[v] || 0) * mul * exprGain);
  const avg = (a, b, mul = 1) => clamp01(((bs[a] || 0) + (bs[b] || 0)) * 0.5 * mul * exprGain);

  viewer.setExpression('blinkLeft', g('eyeBlinkLeft', 1.2));
  viewer.setExpression('blinkRight', g('eyeBlinkRight', 1.2));

  viewer.setMouthExpression('aa', g('jawOpen', 1.4));
  viewer.setMouthExpression('ou', g('mouthPucker', 1.3));
  viewer.setMouthExpression('oh', g('mouthFunnel', 1.2));
  viewer.setMouthExpression('ih', avg('mouthStretchLeft', 'mouthStretchRight', 1.5));
  viewer.setMouthExpression('ee', avg('mouthSmileLeft', 'mouthSmileRight', 0.6));

  viewer.setMouthExpression('happy', avg('mouthSmileLeft', 'mouthSmileRight', 1.2));
  viewer.setMouthExpression('sad', avg('mouthFrownLeft', 'mouthFrownRight', 1.3));
  viewer.setExpression('relaxed', avg('cheekSquintLeft', 'cheekSquintRight', 1.0));

  const browDown = avg('browDownLeft', 'browDownRight', 1.0);
  const browInnerUp = g('browInnerUp', 1.0);
  viewer.setExpression('angry', clamp01(Math.max(browDown - browInnerUp * 0.5, 0) * 1.4));

  const eyeWide = avg('eyeWideLeft', 'eyeWideRight', 0.7);
  viewer.setMouthExpression('surprised', clamp01(eyeWide + browInnerUp * 0.4));
}

const _m4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function applyHeadRotation(matrixData) {
  _m4.fromArray(matrixData);
  _m4.decompose(_pos, _quat, _scale);

  let { x: qx, y: qy, z: qz, w: qw } = _quat;
  if (mirrorMode) { qy = -qy; qz = -qz; }
  _euler.setFromQuaternion(new THREE.Quaternion(qx, qy, qz, qw), 'YXZ');

  const maxYaw = THREE.MathUtils.degToRad(45);
  const maxPitch = THREE.MathUtils.degToRad(30);
  const maxRoll = THREE.MathUtils.degToRad(25);

  const targetYaw = THREE.MathUtils.clamp(_euler.y, -maxYaw, maxYaw) * headGain;
  // Negated: this rig's head bone treats +X as tilting back/up, so a
  // physical nod-down (chin drops) needs a negative X rotation.
  const targetPitch = -THREE.MathUtils.clamp(_euler.x, -maxPitch, maxPitch) * headGain;
  const targetRoll = THREE.MathUtils.clamp(_euler.z, -maxRoll, maxRoll) * headGain;

  curYaw += (targetYaw - curYaw) * 0.2;
  curPitch += (targetPitch - curPitch) * 0.2;
  curRoll += (targetRoll - curRoll) * 0.2;

  const headBone = viewer.getBone('head');
  const neckBone = viewer.getBone('neck');
  // Face orientation is camera-relative, like the limb targets. Compensate
  // the tracked chest before applying neck/head rotations, parent first.
  for (const [name, bone, gain] of [['neck', neckBone, 0.4], ['head', headBone, 1]]) {
    const rest = retargeter?.rest.get(name);
    if (!bone || !rest) continue;
    const target = rest.world.clone().multiply(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(curPitch * gain, curYaw * gain, curRoll * gain)
    ));
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(target));
  }
}

viewer.onFrame = () => {
  if (!running || !faceLandmarker || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const result = faceLandmarker.detectForVideo(video, performance.now());
  const cats = result.faceBlendshapes?.[0]?.categories;
  if (cats) {
    applyBlendshapes(cats);
    setStatus('live', '追蹤中');
  } else {
    setStatus('idle', '未偵測到臉部');
  }
  const now = performance.now();
  const dt = lastTrackingTime === null ? 1 / 30 : Math.min((now - lastTrackingTime) / 1000, 0.1);
  lastTrackingTime = now;
  const poseResult = poseEnabled && poseLandmarker ? poseLandmarker.detectForVideo(video, now) : null;
  const handResult = handsEnabled && handLandmarker ? handLandmarker.detectForVideo(video, now) : null;
  const debug = retargeter?.update(poseResult, handResult, { mirror: mirrorMode, now, dt, poseEnabled, handsEnabled });
  const mat = result.facialTransformationMatrixes?.[0]?.data;
  if (mat) applyHeadRotation(mat);
  if (handDebugEl) handDebugEl.textContent = handsEnabled ? (debug ?? '模型載入中') : '手掌偵測已關閉';
};

modelSelect.addEventListener('change', () => loadModel(modelSelect.value));
bgSelect.addEventListener('change', () => applyBackground(bgSelect.value));

toggleCameraBtn.addEventListener('click', () => {
  if (running) stopCamera();
  else startCamera();
});

toggleMirrorBtn.addEventListener('click', (e) => {
  mirrorMode = !mirrorMode;
  video.style.transform = mirrorMode ? 'scaleX(-1)' : 'none';
  retargeter?.reset();
  e.target.textContent = mirrorMode ? '開啟' : '關閉';
  e.target.classList.toggle('toggled', mirrorMode);
});

togglePreviewBtn.addEventListener('click', (e) => {
  const hidden = webcamPreview.classList.toggle('hidden');
  e.target.textContent = hidden ? '顯示' : '隱藏';
  e.target.classList.toggle('toggled', !hidden);
});

togglePoseBtn.addEventListener('click', (e) => {
  poseEnabled = !poseEnabled;
  e.target.textContent = poseEnabled ? '開啟' : '關閉';
  e.target.classList.toggle('toggled', poseEnabled);
  if (!poseEnabled) retargeter?.relax(['chest', ...ARM_BONES], 0, 0, true);
});

toggleHandsBtn.addEventListener('click', (e) => {
  handsEnabled = !handsEnabled;
  e.target.textContent = handsEnabled ? '開啟' : '關閉';
  e.target.classList.toggle('toggled', handsEnabled);
  if (!handsEnabled) {
    if (handDebugEl) handDebugEl.textContent = '手掌偵測已關閉';
    retargeter?.relax(['leftHand', 'rightHand', ...FINGER_BONES], 0, 0, true);
  }
});

headGainInput.addEventListener('input', () => { headGain = parseFloat(headGainInput.value); });
exprGainInput.addEventListener('input', () => { exprGain = parseFloat(exprGainInput.value); });

applyBackground(bgSelect.value);
loadModel(modelSelect.value);
