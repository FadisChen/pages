import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { FINGER_BONES } from './motion-retargeter.js';

// Some VRoid exports have much more sensitive mouth-region morph targets than
// others; without this a viseme or a mouth-heavy emotion (happy/sad/surprised)
// blows past the face geometry. Values carried over from the sibling Avatar
// project, which already validated them against these same model files.
export const MOUTH_INTENSITY = {
  'SpringSnow.vrm': 1,
  'mia.vrm': 0.6,
  'sha.vrm': 0.45,
  'su.vrm': 0.45,
  'Purple.vrm': 1,
};

const TRACKED_BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  ...FINGER_BONES,
];

function randomBlinkDelay() {
  return 2 + Math.random() * 4;
}

export class VRMViewer {
  constructor(canvas, { transparent = false } = {}) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    if (!transparent) this.scene.background = new THREE.Color(0x14141c);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.3, 2.4);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445, 1.3));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(1, 1.6, 1.2);
    this.scene.add(dir);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.2, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 6;
    this.controls.update();

    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));

    this.vrm = null;
    this.bindPose = new Map();

    this.lookAtTarget = new THREE.Object3D();
    this.lookAtTarget.position.set(0, 1.4, 3);
    this.scene.add(this.lookAtTarget);

    this.autoBlink = true;
    this.idleBreathing = true;
    this.mouthIntensity = 1;
    this._blinkPhase = 'idle';
    this._blinkTimer = randomBlinkDelay();

    this.onFrame = null;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    this.resize();

    this._raf = requestAnimationFrame(() => this._animate());
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = Math.max(parent.clientWidth, 1);
    const h = Math.max(parent.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async loadVRM(url, onProgress) {
    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      this._disposeVrm(this.vrm);
      this.vrm = null;
      this.bindPose.clear();
    }

    this.mouthIntensity = MOUTH_INTENSITY[url.split('/').pop()] ?? 1;

    const gltf = await this.loader.loadAsync(url, onProgress);
    const vrm = gltf.userData.vrm;

    this._safeCall(VRMUtils, 'removeUnnecessaryVertices', gltf.scene);
    this._safeCall(VRMUtils, 'combineSkeletons', gltf.scene);
    if (vrm.meta?.metaVersion === '0') {
      this._safeCall(VRMUtils, 'rotateVRM0', vrm);
    }

    vrm.scene.traverse((obj) => { obj.frustumCulled = false; });
    this.scene.add(vrm.scene);

    if (vrm.lookAt) {
      vrm.lookAt.target = this.lookAtTarget;
      vrm.lookAt.autoUpdate = true;
    }

    this.vrm = vrm;
    for (const name of TRACKED_BONES) {
      const node = vrm.humanoid?.getNormalizedBoneNode?.(name);
      if (node) this.bindPose.set(name, node.quaternion.clone());
    }
    this._applyArmsDownRestPose();
    this.resetPose();

    return vrm;
  }

  // Humanoid bones load in a T-pose; drop the arms to the sides so the
  // model doesn't look like it's stuck mid-star-jump by default.
  _applyArmsDownRestPose() {
    const ARM_DOWN = THREE.MathUtils.degToRad(72);
    const ELBOW_BEND = THREE.MathUtils.degToRad(12);
    const offsets = {
      rightUpperArm: [0, 0, -ARM_DOWN],
      leftUpperArm: [0, 0, ARM_DOWN],
      rightLowerArm: [0, 0, -ELBOW_BEND],
      leftLowerArm: [0, 0, ELBOW_BEND],
    };
    for (const [name, [x, y, z]] of Object.entries(offsets)) {
      const bind = this.bindPose.get(name);
      if (!bind) continue;
      const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
      this.bindPose.set(name, bind.clone().multiply(offset));
    }
  }

  _safeCall(obj, method, ...args) {
    try {
      if (obj && typeof obj[method] === 'function') obj[method](...args);
    } catch (err) {
      console.warn(`[VRMViewer] ${method} failed:`, err);
    }
  }

  _disposeVrm(vrm) {
    vrm.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const val = mat[key];
          if (val && val.isTexture) val.dispose();
        }
        mat.dispose?.();
      }
    });
    this._safeCall(VRMUtils, 'deepDispose', vrm.scene);
  }

  getBone(name) {
    return this.vrm?.humanoid?.getNormalizedBoneNode?.(name) || null;
  }

  getBindQuaternion(name) {
    return this.bindPose.get(name) || null;
  }

  resetPose() {
    for (const [name, quat] of this.bindPose.entries()) {
      const node = this.getBone(name);
      if (node) node.quaternion.copy(quat);
    }
  }

  getExpressionNames() {
    const em = this.vrm?.expressionManager;
    if (!em || !em.expressions) return [];
    return em.expressions.map((e) => e.expressionName).filter(Boolean);
  }

  setExpression(name, value) {
    const em = this.vrm?.expressionManager;
    if (!em || typeof em.setValue !== 'function') return;
    try {
      em.setValue(name, value);
    } catch (err) {
      // unknown expression name on this model; ignore
    }
  }

  // For visemes and mouth-heavy emotions (happy/sad/surprised), scaled by the
  // per-model mouthIntensity so models with oversensitive mouth morphs don't
  // distort past the face geometry.
  setMouthExpression(name, value) {
    this.setExpression(name, value * this.mouthIntensity);
  }

  getExpression(name) {
    const em = this.vrm?.expressionManager;
    if (!em) return 0;
    try {
      return em.getValue?.(name) ?? 0;
    } catch {
      return 0;
    }
  }

  _updateBlink(delta) {
    const em = this.vrm?.expressionManager;
    if (!em) return;
    this._blinkTimer -= delta;
    if (this._blinkPhase === 'idle') {
      if (this._blinkTimer <= 0) {
        this._blinkPhase = 'closing';
        this._blinkTimer = 0.06;
      }
      return;
    }
    if (this._blinkPhase === 'closing') {
      const t = 1 - Math.max(this._blinkTimer, 0) / 0.06;
      this.setExpression('blink', t);
      if (this._blinkTimer <= 0) {
        this._blinkPhase = 'opening';
        this._blinkTimer = 0.09;
      }
      return;
    }
    if (this._blinkPhase === 'opening') {
      const t = Math.max(this._blinkTimer, 0) / 0.09;
      this.setExpression('blink', t);
      if (this._blinkTimer <= 0) {
        this.setExpression('blink', 0);
        this._blinkPhase = 'idle';
        this._blinkTimer = randomBlinkDelay();
      }
    }
  }

  _updateBreathing(elapsed) {
    const chest = this.getBone('chest');
    const chestBind = this.getBindQuaternion('chest');
    if (chest && chestBind) {
      const breathe = Math.sin(elapsed * 1.1) * 0.025;
      chest.quaternion.copy(chestBind).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(breathe, 0, 0))
      );
    }
    const head = this.getBone('head');
    const headBind = this.getBindQuaternion('head');
    if (head && headBind) {
      const sway = Math.sin(elapsed * 0.6) * 0.02;
      head.quaternion.copy(headBind).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sway, 0))
      );
    }
  }

  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += delta;

    if (this.vrm) {
      if (this.idleBreathing) this._updateBreathing(this.elapsed);
      if (this.autoBlink) this._updateBlink(delta);
      if (this.onFrame) this.onFrame(delta, this.elapsed);
      this.vrm.update(delta);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    if (this.vrm) this._disposeVrm(this.vrm);
    this.renderer.dispose();
  }
}
