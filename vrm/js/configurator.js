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

function applyBoneOffset(boneName, x, y, z) {
  const bone = viewer.getBone(boneName);
  const bind = viewer.getBindQuaternion(boneName);
  if (bone && bind) bone.quaternion.copy(bind).multiply(eulerQuat(x, y, z));
}

function updateMotion(elapsed) {
  if (!activeMotion) return;
  const t = elapsed - activeMotion.start;

  if (activeMotion.name === 'wave') {
    const duration = 2.6;
    if (t > duration) { viewer.resetPose(); activeMotion = null; return; }
    const raiseIn = Math.min(t / 0.4, 1);
    const raiseOut = t > duration - 0.4 ? Math.max((duration - t) / 0.4, 0) : 1;
    const raise = Math.min(raiseIn, raiseOut);
    // rightUpperArm's Z axis is the confirmed shoulder-abduction axis (used
    // for the arms-down rest pose too); wiggle it gently on top of the raised
    // pose instead of touching lower-arm axes we haven't verified.
    const wiggle = Math.sin(t * 9) * 0.15;
    applyBoneOffset('rightUpperArm', 0, 0, raise * (1.0 + wiggle));
    applyBoneOffset('rightLowerArm', -1.3 * raise, 0, 0);
  } else if (activeMotion.name === 'nod') {
    const duration = 1.6;
    if (t > duration) { viewer.resetPose(); activeMotion = null; return; }
    const amt = Math.sin(t * Math.PI * 2.2) * 0.35;
    applyBoneOffset('head', -Math.max(amt, 0) * 0.9, 0, 0);
  } else if (activeMotion.name === 'shake') {
    const duration = 1.8;
    if (t > duration) { viewer.resetPose(); activeMotion = null; return; }
    const amt = Math.sin(t * Math.PI * 2.4) * 0.45;
    applyBoneOffset('head', 0, amt, 0);
  } else if (activeMotion.name === 'look') {
    const duration = 4.0;
    if (t > duration) {
      viewer.lookAtTarget.position.set(0, 1.4, 3);
      activeMotion = null;
      return;
    }
    const sweep = Math.sin((t / duration) * Math.PI * 2);
    viewer.lookAtTarget.position.set(sweep * 1.2, 1.4, 2.4);
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
document.getElementById('motion-shake').addEventListener('click', () => startMotion('shake'));
document.getElementById('motion-look').addEventListener('click', () => startMotion('look'));
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
