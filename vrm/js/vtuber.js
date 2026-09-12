import * as THREE from 'three';
import { VRMViewer } from './vrm-viewer.js';
import { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Pose as KalidokitPose, Hand as KalidokitHand } from 'kalidokit';

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
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

// Kalidokit derives elbow/finger bend from the raw joint angle (e.g.
// shoulder-elbow-wrist) via a normalization helper that folds back past a 90
// degree bend (it maps both a straight limb AND a fully-closed joint to ~0,
// peaking at only a 90 degree bend) - so bending further than 90 degrees
// makes the joint visually straighten back out instead of bending more.
// Recompute it ourselves as a plain, monotonic 0 (straight) to 1 (fully
// folded) fraction and reuse kalidokit's own scale constants so it lines up
// with the axes we still take from kalidokit unchanged.
const ELBOW_BEND_SCALE = 2.14;
const _jointA = new THREE.Vector3();
const _jointB = new THREE.Vector3();

function jointBendFraction(a, joint, c) {
  _jointA.set(a.x - joint.x, a.y - joint.y, a.z - joint.z);
  _jointB.set(c.x - joint.x, c.y - joint.y, c.z - joint.z);
  const rawAngle = _jointA.angleTo(_jointB); // PI = straight, 0 = fully folded
  return (Math.PI - rawAngle) / Math.PI;
}

// A single low-confidence frame (e.g. self-occlusion when a hand passes in
// front of the face while reaching for the head) used to snap the whole arm
// back to rest every time, since `arm` below went false immediately. Ride
// out brief dips for this many consecutive frames before actually relaxing.
const ARM_VISIBILITY_HOLD_FRAMES = 8;
const armMissStreak = { left: 0, right: 0 };

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

  // applyHands() drives the same *Hand bones from the far more precise Hand
  // Landmarker whenever it's on; letting this coarser arm-only estimate also
  // slerp toward the same bone every frame made the two fight and produced
  // the wrist snapping/"reset" behaviour.
  const handBoneOwnedByHandTracking = handsEnabled && handLandmarker;

  for (const { kalidokit, avatar } of sides) {
    const landmarkSide = KALIDOKIT_LANDMARK_SOURCE[kalidokit];
    const visible =
      (landmarks[POSE_LANDMARKS[`${landmarkSide}Shoulder`]]?.visibility ?? 0) > VISIBILITY_THRESHOLD &&
      (landmarks[POSE_LANDMARKS[`${landmarkSide}Elbow`]]?.visibility ?? 0) > VISIBILITY_THRESHOLD &&
      (landmarks[POSE_LANDMARKS[`${landmarkSide}Wrist`]]?.visibility ?? 0) > VISIBILITY_THRESHOLD;
    armMissStreak[avatar] = visible ? 0 : armMissStreak[avatar] + 1;
    const arm = visible || armMissStreak[avatar] < ARM_VISIBILITY_HOLD_FRAMES;

    const upperArmName = toVrmBoneName(`${avatar}UpperArm`);
    const lowerArmName = toVrmBoneName(`${avatar}LowerArm`);
    const handName = toVrmBoneName(`${avatar}Hand`);

    if (arm) {
      slerpBoneTo(upperArmName, riggedPose[`${kalidokit}UpperArm`]);

      const lowerArm = riggedPose[`${kalidokit}LowerArm`];
      const invert = kalidokit === 'Right' ? 1 : -1;
      const bendFraction = jointBendFraction(
        worldLandmarks[POSE_LANDMARKS[`${landmarkSide}Shoulder`]],
        worldLandmarks[POSE_LANDMARKS[`${landmarkSide}Elbow`]],
        worldLandmarks[POSE_LANDMARKS[`${landmarkSide}Wrist`]]
      );
      slerpBoneTo(lowerArmName, {
        x: lowerArm.x,
        y: bendFraction * ELBOW_BEND_SCALE * invert,
        z: lowerArm.z,
        rotationOrder: lowerArm.rotationOrder,
      });

      if (!handBoneOwnedByHandTracking) slerpBoneTo(handName, riggedPose[`${kalidokit}Hand`]);
    } else {
      relaxBoneTowardRest(upperArmName);
      relaxBoneTowardRest(lowerArmName);
      if (!handBoneOwnedByHandTracking) relaxBoneTowardRest(handName);
    }
  }
}

// MediaPipe Hand Landmarker topology: 0=wrist, thumb=1-4, index=5-8,
// middle=9-12, ring=13-16, little(pinky)=17-20, each finger's 4 points
// running MCP->PIP->DIP->TIP (or CMC->MCP->IP->TIP for the thumb).
const FINGER_CHAINS = {
  Thumb: [0, 1, 2, 3, 4],
  Index: [0, 5, 6, 7, 8],
  Middle: [0, 9, 10, 11, 12],
  Ring: [0, 13, 14, 15, 16],
  Little: [0, 17, 18, 19, 20],
};
const FINGER_SEGMENTS = ['Proximal', 'Intermediate', 'Distal'];

// MediaPipe's handedness is often described as assuming mirrored input, but
// verified empirically (fed a real, non-mirrored photo of a known right
// hand through HandLandmarker.detect()) it reports the TRUE anatomical side
// directly for our raw, un-mirrored camera feed - no swap needed here.
//
// Hand.solve()'s wrist-basis math needs that true anatomical side to be
// geometrically correct, so - unlike kalidokit's Pose solver, which bakes
// its own mirror handling into which landmarks feed its "Right"/"Left"
// fields - we still have to cross to the opposite avatar arm ourselves to
// get the "avatar mimics your mirror reflection" behaviour applyPose gets
// for free. See applyHands() for how the resulting rotation's sign gets
// re-derived for the bone it actually lands on.
function avatarSideForHand(kalidokitSide) {
  const same = kalidokitSide.toLowerCase();
  const opposite = same === 'right' ? 'left' : 'right';
  return mirrorMode ? opposite : same;
}

// `boneSide` here is the VRM bone this rotation will actually be applied to
// ('Right'/'Left' avatar hand) - NOT necessarily the source hand's true
// anatomical side. kalidokit's own finger/wrist math bakes a left/right sign
// flip in assuming those always match; when mirrorMode crosses a hand to the
// opposite avatar arm they don't, so callers must pass the bone's side here,
// not the detected hand's side.
function nonThumbFingerRotation(bendFraction, boneSide) {
  const invert = boneSide === 'Right' ? 1 : -1;
  const z = THREE.MathUtils.clamp(
    bendFraction * -Math.PI * invert,
    boneSide === 'Right' ? -Math.PI : 0,
    boneSide === 'Right' ? 0 : Math.PI
  );
  return { x: 0, y: 0, z };
}

// Port of kalidokit's HandSolver rigFingers() thumb branch, fed our own
// monotonic bend fraction instead of its fold-prone raw joint angle.
// `boneSide`: see nonThumbFingerRotation() above.
function thumbRotation(bendFraction, segment, boneSide) {
  const invert = boneSide === 'Right' ? 1 : -1;
  const clamp = THREE.MathUtils.clamp;
  const dampener = {
    x: segment === 'Proximal' ? 2.2 : 0,
    y: segment === 'Proximal' ? 2.2 : segment === 'Intermediate' ? 0.7 : 1,
    z: 0.5,
  };
  const startPos = {
    x: segment === 'Proximal' ? 1.2 : -0.2,
    y: (segment === 'Proximal' ? 1.1 : 0.1) * invert,
    z: 0.2 * invert,
  };
  const z = startPos.z + bendFraction * -Math.PI * dampener.z * invert;
  const x = startPos.x + bendFraction * -Math.PI * dampener.x;
  const y = startPos.y + bendFraction * -Math.PI * dampener.y * invert;
  if (segment === 'Proximal') {
    return {
      x: clamp(x, -0.6, 0.3),
      y: clamp(y, boneSide === 'Right' ? -1 : -0.3, boneSide === 'Right' ? 0.3 : 1),
      z: clamp(z, boneSide === 'Right' ? -0.6 : -0.3, boneSide === 'Right' ? 0.3 : 0.6),
    };
  }
  return { x: clamp(x, -2, 2), y: clamp(y, -2, 2), z: clamp(z, -2, 2) };
}

const handsDetectedThisFrame = new Set();

// Reflects a MediaPipe landmark list across the vertical (x) axis - i.e.
// "what these landmarks would look like on the mirror-image hand". Only x
// needs flipping: every geometric quantity kalidokit derives from these
// points is a difference between two points, and an absolute offset added
// to every point's x (the difference between a true reflection x -> C-x and
// this simpler x -> -x) cancels out in any such difference.
function mirrorLandmarksX(lm) {
  return lm.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
}

function applyHands(handResult) {
  handsDetectedThisFrame.clear();
  const debugLines = [];

  const count = handResult.landmarks?.length ?? 0;
  for (let i = 0; i < count; i++) {
    const lm = handResult.landmarks[i];
    const worldLm = handResult.worldLandmarks?.[i];
    const kalidokitSide = handResult.handedness?.[i]?.[0]?.categoryName; // 'Right' | 'Left', already anatomically true
    if (!lm || !worldLm || !kalidokitSide) continue;

    const avatarSide = avatarSideForHand(kalidokitSide);
    handsDetectedThisFrame.add(avatarSide);

    // Bone we're actually about to drive - see nonThumbFingerRotation() for
    // why this, not kalidokitSide, is what the sign conventions below need.
    const boneSide = avatarSide === 'right' ? 'Right' : 'Left';

    // kalidokit bakes its left/right sign convention into whichever "side"
    // you pass into solve(), on the assumption that side matches both the
    // landmarks' true handedness AND the bone you're about to drive. When
    // mirrorMode crosses this hand to the opposite avatar arm those two
    // diverge - feeding it kalidokitSide keeps the wrist-basis geometry
    // correct but produces a rotation signed for the wrong bone (verified
    // against kalidokit's own source: negating fields afterward is NOT
    // equivalent, since e.g. its z scaling isn't a simple odd function of
    // side). The correct fix is to solve for boneSide directly, fed
    // landmarks mirrored to match - i.e. actually compute "what would this
    // look like as boneSide's own hand", not patch someone else's answer.
    const solveLm = boneSide === kalidokitSide ? lm : mirrorLandmarksX(lm);

    let riggedHand;
    try {
      riggedHand = KalidokitHand.solve(solveLm, boneSide);
    } catch (err) {
      console.warn('Kalidokit hand solve failed', err);
      continue;
    }
    if (!riggedHand) continue;

    // kalidokit clamps the wrist's x (+/-0.3) and y (side-dependent) but
    // leaves z (z = raw * -2.3, see HandSolver.rigFingers()) completely
    // unclamped - a moderate real wrist roll easily pushes it past +/-1.5
    // rad, which applied as an absolute bone rotation twists the whole hand
    // (and everything the fingers do relative to it) into a distorted pose.
    const WRIST_Z_LIMIT = 1.3;
    const wrist = riggedHand[`${boneSide}Wrist`];
    const wristRotation = { ...wrist, z: THREE.MathUtils.clamp(wrist.z, -WRIST_Z_LIMIT, WRIST_Z_LIMIT) };
    slerpBoneTo(toVrmBoneName(`${avatarSide}Hand`), wristRotation);

    const toDeg = (rad) => Math.round(THREE.MathUtils.radToDeg(rad));
    debugLines.push(
      `${kalidokitSide === 'Right' ? '真右手' : '真左手'} -> ${avatarSide === 'right' ? '虛擬右手' : '虛擬左手'}\n` +
      `  腕 x=${toDeg(wristRotation.x)} y=${toDeg(wristRotation.y)} z=${toDeg(wristRotation.z)} (度)`
    );

    for (const [digit, chain] of Object.entries(FINGER_CHAINS)) {
      for (let s = 0; s < FINGER_SEGMENTS.length; s++) {
        const bendFraction = jointBendFraction(worldLm[chain[s]], worldLm[chain[s + 1]], worldLm[chain[s + 2]]);
        const rotation =
          digit === 'Thumb'
            ? thumbRotation(bendFraction, FINGER_SEGMENTS[s], boneSide)
            : nonThumbFingerRotation(bendFraction, boneSide);
        slerpBoneTo(toVrmBoneName(`${avatarSide}${digit}${FINGER_SEGMENTS[s]}`), rotation);
      }
    }
  }

  for (const avatarSide of ['left', 'right']) {
    if (handsDetectedThisFrame.has(avatarSide)) continue;
    for (const digit of Object.keys(FINGER_CHAINS)) {
      for (const segment of FINGER_SEGMENTS) {
        relaxBoneTowardRest(toVrmBoneName(`${avatarSide}${digit}${segment}`));
      }
    }
  }

  if (handDebugEl) handDebugEl.textContent = debugLines.length ? debugLines.join('\n') : '未偵測到手掌';
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

  if (handsEnabled && handLandmarker) {
    const handResult = handLandmarker.detectForVideo(video, performance.now());
    applyHands(handResult);
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

toggleHandsBtn.addEventListener('click', (e) => {
  handsEnabled = !handsEnabled;
  e.target.textContent = handsEnabled ? '開啟' : '關閉';
  e.target.classList.toggle('toggled', handsEnabled);
  if (!handsEnabled) {
    if (handDebugEl) handDebugEl.textContent = '手掌偵測已關閉';
    for (const side of ['left', 'right']) {
      const boneName = toVrmBoneName(`${side}Hand`);
      const bone = viewer.getBone(boneName);
      const bind = viewer.getBindQuaternion(boneName);
      if (bone && bind) bone.quaternion.copy(bind);
      for (const digit of Object.keys(FINGER_CHAINS)) {
        for (const segment of FINGER_SEGMENTS) {
          const fingerName = toVrmBoneName(`${side}${digit}${segment}`);
          const fingerBone = viewer.getBone(fingerName);
          const fingerBind = viewer.getBindQuaternion(fingerName);
          if (fingerBone && fingerBind) fingerBone.quaternion.copy(fingerBind);
        }
      }
    }
  }
});

headGainInput.addEventListener('input', () => { headGain = parseFloat(headGainInput.value); });
exprGainInput.addEventListener('input', () => { exprGain = parseFloat(exprGainInput.value); });

applyBackground(bgSelect.value);
loadModel(modelSelect.value);
