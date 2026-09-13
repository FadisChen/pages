import * as THREE from 'three';
import { VRMViewer } from './vrm-viewer.js';

const EXPRESSION_LABELS = {
  neutral: '中性',
  happy: '開心 (Happy)',
  angry: '生氣 (Angry)',
  sad: '難過 (Sad)',
  relaxed: '放鬆 (Relaxed)',
  surprised: '驚訝 (Surprised)',
};

const VISEME_LABELS = { aa: 'A', ih: 'I', ou: 'U', ee: 'E', oh: 'O' };
const VISEME_NAMES = Object.keys(VISEME_LABELS);
const EMOTION_NAMES = Object.keys(EXPRESSION_LABELS);
const MOUTH_HEAVY_EMOTIONS = new Set(['happy', 'sad', 'surprised']);
const GESTURE_DURATIONS = Object.freeze({
  nod: 1.5,
  shake_head: 1.6,
  wave: 2.4,
  present: 2.6,
  tilt_head: 1.8,
  bow: 1.9,
  shrug: 1.6,
  hand_on_chest: 2.2,
  beckon: 2.4,
  salute: 1.9,
});

const canvas = document.getElementById('canvas');
const viewer = new VRMViewer(canvas, { transparent: false });

const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const modelSelect = document.getElementById('model-select');
const expressionGrid = document.getElementById('expression-grid');
const visemeRow = document.getElementById('viseme-row');

let activeMotion = null; // { name, start }
let lipSyncDemoOn = false;
let lipSyncNextSwitch = 0;
let lipSyncTargets = Object.fromEntries(VISEME_NAMES.map((n) => [n, 0]));
let lipSyncCurrent = Object.fromEntries(VISEME_NAMES.map((n) => [n, 0]));

function setLoading(visible, text) {
  loadingEl.classList.toggle('hidden', !visible);
  if (text) loadingText.textContent = text;
}

async function loadModel(file) {
  setLoading(true, `模型載入中… ${file}`);
  activeMotion = null;
  try {
    await viewer.loadVRM(`${file}`, (evt) => {
      if (evt.total) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        setLoading(true, `模型載入中… ${pct}%`);
      }
    });
    buildExpressionUI();
    frontFaceCamera();
  } catch (err) {
    console.error(err);
    setLoading(true, `載入失敗: ${err.message || err}`);
    return;
  }
  setLoading(false);
}

function frontFaceCamera() {
  viewer.camera.position.set(0, 1.35, 1.6);
  viewer.controls.target.set(0, 1.25, 0);
  viewer.controls.update();
}

let allEmotionButtonNames = [];

function buildExpressionUI() {
  const names = viewer.getExpressionNames();
  expressionGrid.innerHTML = '';

  const known = names.filter((n) => EMOTION_NAMES.includes(n));
  const custom = names.filter(
    (n) => !EMOTION_NAMES.includes(n) && !VISEME_NAMES.includes(n) && !n.startsWith('blink')
  );
  allEmotionButtonNames = [...known, ...custom].filter((n) => n !== 'neutral');

  const makeBtn = (name, label) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.expression = name;
    btn.addEventListener('click', () => applyEmotion(name));
    return btn;
  };

  expressionGrid.appendChild(makeBtn('__neutral__', '中性 (重置)'));
  for (const name of known) {
    if (name === 'neutral') continue;
    expressionGrid.appendChild(makeBtn(name, EXPRESSION_LABELS[name] || name));
  }
  for (const name of custom) {
    expressionGrid.appendChild(makeBtn(name, name));
  }

  visemeRow.innerHTML = '';
  for (const name of VISEME_NAMES) {
    if (!names.includes(name)) continue;
    const btn = document.createElement('button');
    btn.textContent = VISEME_LABELS[name];
    btn.addEventListener('mousedown', () => viewer.setMouthExpression(name, 1));
    btn.addEventListener('mouseup', () => viewer.setMouthExpression(name, 0));
    btn.addEventListener('mouseleave', () => viewer.setMouthExpression(name, 0));
    visemeRow.appendChild(btn);
  }
}

function applyEmotion(name) {
  for (const n of allEmotionButtonNames) viewer.setExpression(n, 0);
  if (name !== '__neutral__') {
    if (MOUTH_HEAVY_EMOTIONS.has(name.toLowerCase())) viewer.setMouthExpression(name, 1);
    else viewer.setExpression(name, 1);
  }
  document.querySelectorAll('#expression-grid button').forEach((b) => {
    b.classList.toggle('toggled', b.dataset.expression === name);
  });
}

function startMotion(name) {
  viewer.resetPose();
  activeMotion = { name, start: viewer.elapsed };
}

function eulerQuat(x, y, z) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
}

function smooth(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function applyBoneOffset(boneName, x, y, z) {
  const bone = viewer.getBone(boneName);
  const bind = viewer.getBindQuaternion(boneName);
  if (bone && bind) bone.quaternion.copy(bind).multiply(eulerQuat(x, y, z));
}

// Keep these local offsets aligned with Avatar/avatar-gestures.js. They are
// applied on top of the viewer's arms-down bind pose for the current VRM.
function sampleGesture(name, time) {
  const duration = GESTURE_DURATIONS[name];
  const weight = smooth(time / .35) * smooth((duration - time) / .45);
  const beat = Math.sin(time * Math.PI * 3);
  const offer = smooth((time - .35) / .65) * (1 - smooth((time - 1.65) / .45));
  switch (name) {
    case 'nod': return { head: [.16 * beat * weight, 0, 0], neck: [.04 * beat * weight, 0, 0] };
    case 'shake_head': return { head: [0, .21 * beat * weight, 0], neck: [0, .05 * beat * weight, 0] };
    case 'tilt_head': return { head: [0, -.06 * weight, -.16 * weight], neck: [0, 0, -.04 * weight] };
    case 'bow': return {
      spine: [-.16 * weight, 0, 0],
      chest: [-.22 * weight, 0, 0],
      neck: [-.08 * weight, 0, 0],
      head: [-.12 * weight, 0, 0],
    };
    case 'shrug': return {
      leftShoulder: [0, 0, -.18 * weight],
      rightShoulder: [0, 0, .18 * weight],
      leftUpperArm: [.15 * weight, .21 * weight, .25 * weight],
      rightUpperArm: [.15 * weight, -.21 * weight, -.25 * weight],
      leftLowerArm: [0, -2.15 * weight, 0],
      rightLowerArm: [0, 2.15 * weight, 0],
      leftHand: [1.7 * weight, -.19 * weight, -.19 * weight],
      rightHand: [1.7 * weight, .19 * weight, .19 * weight],
      head: [-.03 * weight, 0, 0],
    };
    case 'hand_on_chest': return {
      rightUpperArm: [-.38 * weight, .31 * weight, .13 * weight],
      rightLowerArm: [0, 1.94 * weight, 0],
      rightHand: [.83 * weight, -.11 * weight, -.88 * weight],
    };
    case 'beckon': {
      const curl = .5 - .5 * Math.cos(Math.max(0, time - .4) * Math.PI * 3);
      const pose = {
        rightUpperArm: [.2 * weight, 0, -.09 * weight],
        rightLowerArm: [0, (2.1 + .08 * curl) * weight, 0],
        rightHand: [1.82 * weight, -.06 * weight, .19 * weight],
      };
      for (const finger of ['Index', 'Middle', 'Ring', 'Little']) {
        pose[`right${finger}Proximal`] = [0, 0, -(.1 + .85 * curl) * weight];
        pose[`right${finger}Intermediate`] = [0, 0, -(.1 + .95 * curl) * weight];
        pose[`right${finger}Distal`] = [0, 0, -(.05 + .5 * curl) * weight];
      }
      return pose;
    }
    case 'salute': {
      const lift = smooth((time - .1) / .4) * smooth((duration - time) / .45);
      const bend = smooth(time / .24) * smooth((duration - time) / .24);
      return {
        rightUpperArm: [1.56 * lift, 1.13 * lift, -.89 * lift],
        rightLowerArm: [0, 2.15 * bend, 0],
        rightHand: [.56 * weight, -.32 * weight, -1.08 * weight],
        rightIndexProximal: [0, -.12 * weight, 0],
        rightRingProximal: [0, .1 * weight, 0],
        rightLittleProximal: [0, .22 * weight, 0],
        rightThumbMetacarpal: [0, -.45 * weight, -.15 * weight],
      };
    }
    case 'wave': return {
      rightUpperArm: [0, 0, -.08 * weight],
      rightLowerArm: [0, 2.7 * weight, (.2 + .1 * beat) * weight],
      rightHand: [-1.51 * weight, -.28 * weight, .36 * weight],
    };
    case 'present': return {
      rightUpperArm: [.63 * weight, .25 * weight, -.28 * weight],
      rightLowerArm: [0, 1.4 * weight, (-.55 + .3 * offer) * weight],
      rightHand: [1.42 * weight, .86 * weight, .33 * weight],
    };
    default: return {};
  }
}

function updateMotion(elapsed) {
  if (!activeMotion) return;
  const t = elapsed - activeMotion.start;
  const duration = GESTURE_DURATIONS[activeMotion.name];
  if (!duration) return;
  if (t >= duration) { viewer.resetPose(); activeMotion = null; return; }
  for (const [bone, angles] of Object.entries(sampleGesture(activeMotion.name, t))) {
    applyBoneOffset(bone, ...angles);
  }
}

function updateLipSyncDemo(delta, elapsed) {
  if (lipSyncDemoOn) {
    if (elapsed > lipSyncNextSwitch) {
      lipSyncNextSwitch = elapsed + 0.12 + Math.random() * 0.18;
      const pick = VISEME_NAMES[Math.floor(Math.random() * VISEME_NAMES.length)];
      for (const n of VISEME_NAMES) lipSyncTargets[n] = n === pick ? 0.5 + Math.random() * 0.5 : 0;
    }
  } else {
    for (const n of VISEME_NAMES) lipSyncTargets[n] = 0;
  }
  const speed = Math.min(delta * 14, 1);
  for (const n of VISEME_NAMES) {
    lipSyncCurrent[n] += (lipSyncTargets[n] - lipSyncCurrent[n]) * speed;
    viewer.setMouthExpression(n, lipSyncCurrent[n]);
  }
}

viewer.onFrame = (delta, elapsed) => {
  updateMotion(elapsed);
  updateLipSyncDemo(delta, elapsed);
};

modelSelect.addEventListener('change', () => loadModel(modelSelect.value));

document.getElementById('motion-wave').addEventListener('click', () => startMotion('wave'));
document.getElementById('motion-nod').addEventListener('click', () => startMotion('nod'));
document.getElementById('motion-shake-head').addEventListener('click', () => startMotion('shake_head'));
document.getElementById('motion-present').addEventListener('click', () => startMotion('present'));
document.getElementById('motion-tilt-head').addEventListener('click', () => startMotion('tilt_head'));
document.getElementById('motion-bow').addEventListener('click', () => startMotion('bow'));
document.getElementById('motion-shrug').addEventListener('click', () => startMotion('shrug'));
document.getElementById('motion-hand-on-chest').addEventListener('click', () => startMotion('hand_on_chest'));
document.getElementById('motion-beckon').addEventListener('click', () => startMotion('beckon'));
document.getElementById('motion-salute').addEventListener('click', () => startMotion('salute'));
document.getElementById('motion-reset').addEventListener('click', () => {
  activeMotion = null;
  viewer.resetPose();
});

document.getElementById('toggle-lipsync').addEventListener('click', (e) => {
  lipSyncDemoOn = !lipSyncDemoOn;
  e.target.textContent = lipSyncDemoOn ? '停止' : '開始';
  e.target.classList.toggle('toggled', lipSyncDemoOn);
});

document.getElementById('toggle-breathing').addEventListener('click', (e) => {
  viewer.idleBreathing = !viewer.idleBreathing;
  e.target.textContent = viewer.idleBreathing ? '開啟' : '關閉';
  e.target.classList.toggle('toggled', viewer.idleBreathing);
});

document.getElementById('toggle-blink').addEventListener('click', (e) => {
  viewer.autoBlink = !viewer.autoBlink;
  e.target.textContent = viewer.autoBlink ? '開啟' : '關閉';
  e.target.classList.toggle('toggled', viewer.autoBlink);
  if (!viewer.autoBlink) viewer.setExpression('blink', 0);
});

loadModel(modelSelect.value);
