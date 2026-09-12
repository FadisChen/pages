import * as THREE from 'three';
import { VRMViewer } from './vrm-viewer.js';
import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Pose as KalidokitPose } from 'kalidokit';

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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
const headGainInput = document.getElementById('head-gain');
const exprGainInput = document.getElementById('expr-gain');

const viewer = new VRMViewer(canvas, { transparent: true });

let faceLandmarker = null;
let poseLandmarker = null;
let stream = null;
let running = false;
let poseEnabled = true;
let lastVideoTime = -1;
let mirrorMode = true;
let headGain = 1;
let exprGain = 1;

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
  try {
    await viewer.loadVRM(file, (evt) => {
      if (evt.total) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        setLoading(true, `模型載入中… ${pct}%`);
      }
    });
    viewer.camera.position.set(0, 1.35, 1.6);
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
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
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
  const headBind = viewer.getBindQuaternion('head');
  const neckBone = viewer.getBone('neck');
  const neckBind = viewer.getBindQuaternion('neck');

  if (headBone && headBind) {
    headBone.quaternion.copy(headBind).multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(curPitch * 0.6, curYaw * 0.6, curRoll * 0.6))
    );
  }
  if (neckBone && neckBind) {
    neckBone.quaternion.copy(neckBind).multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(curPitch * 0.4, curYaw * 0.4, curRoll * 0.4))
    );
  }
}

// BlazePose landmark indices, for visibility gating only (Kalidokit itself
// consumes the full landmark arrays).
const POSE_LANDMARKS = {
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
};
const VISIBILITY_THRESHOLD = 0.5;
const ARM_LERP = 0.35;

const toVrmBoneName = (kalidokitName) => kalidokitName[0].toLowerCase() + kalidokitName.slice(1);

function slerpBoneTo(boneName, rotation) {
  const bone = viewer.getBone(boneName);
  if (!bone || !rotation) return;
  const target = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x, rotation.y, rotation.z, rotation.rotationOrder || 'XYZ')
  );
  bone.quaternion.slerp(target, ARM_LERP);
}

function relaxBoneTowardRest(boneName) {
  const bone = viewer.getBone(boneName);
  const bind = viewer.getBindQuaternion(boneName);
  if (bone && bind) bone.quaternion.slerp(bind, ARM_LERP);
}

// Kalidokit's Pose solver builds its "Right*" output from the MediaPipe
// landmarks for the person's own LEFT shoulder/elbow/wrist (11/13/15), and
// "Left*" from the right side (12/14/16) - it bakes the mirror flip in
// itself (see kalidokit's calcArms.ts / PoseSolver "rightHandOffscreen",
// which is keyed off landmark 15). So riggedPose.Right* already corresponds
// to the side that should move on-screen to match the always-mirrored
// webcam preview, and applying x/y/z straight through (no extra sign flips)
// is what kalidokit's own reference three-vrm sample does.
const KALIDOKIT_LANDMARK_SOURCE = { Right: 'left', Left: 'right' };

function applyPose(worldLandmarks, landmarks) {
  let riggedPose;
  try {
    riggedPose = KalidokitPose.solve(worldLandmarks, landmarks, {
      runtime: 'mediapipe',
      video,
      enableLegs: false,
    });
  } catch (err) {
    console.warn('Kalidokit pose solve failed', err);
    return;
  }
  if (!riggedPose) return;

  // Mirrored (default, matches the mirrored webcam preview): riggedPose.Right
  // drives the avatar's own right arm directly. Non-mirrored undoes
  // kalidokit's built-in flip by crossing to the opposite avatar arm.
  const sides = mirrorMode
    ? [{ kalidokit: 'Right', avatar: 'right' }, { kalidokit: 'Left', avatar: 'left' }]
    : [{ kalidokit: 'Right', avatar: 'left' }, { kalidokit: 'Left', avatar: 'right' }];

  for (const { kalidokit, avatar } of sides) {
    const landmarkSide = KALIDOKIT_LANDMARK_SOURCE[kalidokit];
    const arm =
      (landmarks[POSE_LANDMARKS[`${landmarkSide}Shoulder`]]?.visibility ?? 0) > VISIBILITY_THRESHOLD &&
      (landmarks[POSE_LANDMARKS[`${landmarkSide}Elbow`]]?.visibility ?? 0) > VISIBILITY_THRESHOLD &&
      (landmarks[POSE_LANDMARKS[`${landmarkSide}Wrist`]]?.visibility ?? 0) > VISIBILITY_THRESHOLD;

    const upperArmName = toVrmBoneName(`${avatar}UpperArm`);
    const lowerArmName = toVrmBoneName(`${avatar}LowerArm`);
    const handName = toVrmBoneName(`${avatar}Hand`);

    if (arm) {
      slerpBoneTo(upperArmName, riggedPose[`${kalidokit}UpperArm`]);
      slerpBoneTo(lowerArmName, riggedPose[`${kalidokit}LowerArm`]);
      slerpBoneTo(handName, riggedPose[`${kalidokit}Hand`]);
    } else {
      relaxBoneTowardRest(upperArmName);
      relaxBoneTowardRest(lowerArmName);
      relaxBoneTowardRest(handName);
    }
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
  const mat = result.facialTransformationMatrixes?.[0]?.data;
  if (mat) applyHeadRotation(mat);

  if (poseEnabled && poseLandmarker) {
    const poseResult = poseLandmarker.detectForVideo(video, performance.now());
    const landmarks = poseResult.landmarks?.[0];
    const worldLandmarks = poseResult.worldLandmarks?.[0];
    if (landmarks && worldLandmarks) applyPose(worldLandmarks, landmarks);
  }
};

modelSelect.addEventListener('change', () => loadModel(modelSelect.value));
bgSelect.addEventListener('change', () => applyBackground(bgSelect.value));

toggleCameraBtn.addEventListener('click', () => {
  if (running) stopCamera();
  else startCamera();
});

toggleMirrorBtn.addEventListener('click', (e) => {
  mirrorMode = !mirrorMode;
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
  if (!poseEnabled) {
    for (const name of [
      'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperArm', 'leftLowerArm', 'leftHand',
    ]) {
      const bone = viewer.getBone(name);
      const bind = viewer.getBindQuaternion(name);
      if (bone && bind) bone.quaternion.copy(bind);
    }
  }
});

headGainInput.addEventListener('input', () => { headGain = parseFloat(headGainInput.value); });
exprGainInput.addEventListener('input', () => { exprGain = parseFloat(exprGainInput.value); });

applyBackground(bgSelect.value);
loadModel(modelSelect.value);
