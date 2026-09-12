import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../chess/vendor/three/three.core.js';

const source = readFileSync(new URL('../js/motion-retargeter.js', import.meta.url), 'utf8');
const context = vm.createContext({ THREE });
vm.runInContext(source.replace(/^import .*;$/gm, '').replaceAll('export ', '') +
  '\nglobalThis.api = { MotionRetargeter, FINGERS, FINGER_BONES, ARM_BONES, matchHands };', context);
const { MotionRetargeter, FINGERS, FINGER_BONES, matchHands } = context.api;

// Read the shipped VRM files, including actual bone proportions and rest axes.
// Reconstruct three-vrm's normalized rig (identity rotations, raw rest positions).
function fixture(file = 'su.vrm') {
  const bytes = readFileSync(new URL('../' + file, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const raw = gltf.nodes.map(node => {
    const obj = new THREE.Object3D();
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(obj.position, obj.quaternion, obj.scale);
    else {
      if (node.translation) obj.position.fromArray(node.translation);
      if (node.rotation) obj.quaternion.fromArray(node.rotation);
      if (node.scale) obj.scale.fromArray(node.scale);
    }
    return obj;
  });
  gltf.nodes.forEach((node, i) => node.children?.forEach(child => raw[i].add(raw[child])));
  const v0 = !!gltf.extensions.VRM;
  const names = new Map();
  const human = v0 ? gltf.extensions.VRM.humanoid.humanBones : Object.entries(gltf.extensions.VRMC_vrm.humanoid.humanBones).map(([bone, value]) => ({ bone, ...value }));
  for (const item of human) {
    let name = item.bone;
    if (v0 && name.includes('ThumbProximal')) name = name.replace('Proximal', 'Metacarpal');
    else if (v0 && name.includes('ThumbIntermediate')) name = name.replace('Intermediate', 'Proximal');
    names.set(raw[item.node], name);
  }
  const nodes = new Map([...names.values()].map(name => [name, new THREE.Object3D()]));
  const root = new THREE.Object3D();
  for (const [original, name] of names) {
    const node = nodes.get(name);
    let parent = original.parent;
    while (parent && !names.has(parent)) parent = parent.parent;
    (parent ? nodes.get(names.get(parent)) : root).add(node);
    node.position.copy(original.getWorldPosition(new THREE.Vector3()));
    if (parent) node.position.sub(parent.getWorldPosition(new THREE.Vector3()));
  }
  if (v0) root.rotation.y = Math.PI;
  const normalizedRestPose = Object.fromEntries([...nodes].map(([name, node]) => [name, { rotation: node.quaternion.toArray() }]));
  const rest = new Map([...nodes].map(([name, node]) => [name, node.quaternion.clone()]));
  const humanoid = { normalizedRestPose, getNormalizedBoneNode: name => nodes.get(name) };
  const solver = new MotionRetargeter({ humanoid }, rest);
  const inv = solver.coordinateFrame.clone().invert();
  const mp = v => { const p = v.clone().applyQuaternion(inv); return { x: p.x, y: -p.y, z: -p.z, visibility: 1 }; };
  const at = name => solver.rest.get(name).position.clone();
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [i, name] of [[11, 'leftUpperArm'], [12, 'rightUpperArm'], [13, 'leftLowerArm'], [14, 'rightLowerArm'], [15, 'leftHand'], [16, 'rightHand'], [23, 'leftUpperLeg'], [24, 'rightUpperLeg']]) p[i] = mp(at(name));
  const pose = { worldLandmarks: [p], landmarks: [p] };
  let now = 0;
  const run = (hands = null, options = {}, frames = 120) => {
    for (let i = 0; i < frames; i++) {
      now += 1000 / 30;
      solver.update(pose, hands, { mirror: false, now, dt: 1 / 30, ...options });
    }
  };
  const direction = (a, b) => nodes.get(b).getWorldPosition(new THREE.Vector3()).sub(nodes.get(a).getWorldPosition(new THREE.Vector3())).normalize();
  const handPoints = (side = 'left') => {
    const result = Array(21); result[0] = at(side + 'Hand');
    for (const [digit, { points, bones }] of Object.entries(FINGERS)) {
      bones.forEach((bone, i) => { result[points[i]] = at(side + digit + bone); });
      result[points[3]] = result[points[2]].clone().multiplyScalar(2).sub(result[points[1]]);
    }
    return result;
  };
  const handResult = (points, side = 'left') => ({ landmarks: [[p[side === 'left' ? 15 : 16], ...points.slice(1).map(mp)]],
    worldLandmarks: [points.map(mp)], handedness: [[{ categoryName: side === 'left' ? 'Left' : 'Right', score: 0.99 }]] });
  return { nodes, solver, mp, at, p, pose, run, direction, handPoints, handResult };
}

const nearDirection = (actual, expected, message) => assert.ok(actual.angleTo(expected) < 0.015,
  `${message}: direction error ${THREE.MathUtils.radToDeg(actual.angleTo(expected))} degrees`);

for (const file of ['su.vrm', 'mia.vrm', 'sha.vrm', 'SpringSnow.vrm', 'Purple.vrm']) {
  test(`${file}: 45/90/135 degree elbow bends preserve the measured angle on both arms`, () => {
    for (const side of ['left', 'right']) for (const degrees of [45, 90, 135]) {
      const f = fixture(file), elbow = side === 'left' ? 13 : 14, wrist = elbow + 2;
      const upper = f.at(side + 'LowerArm').sub(f.at(side + 'UpperArm')).normalize();
      const front = f.solver.front.clone().addScaledVector(upper, -f.solver.front.dot(upper)).normalize();
      const lower = upper.clone().multiplyScalar(Math.cos(degrees * Math.PI / 180)).addScaledVector(front, Math.sin(degrees * Math.PI / 180));
      f.p[wrist] = f.mp(f.at(side + 'LowerArm').addScaledVector(lower, 0.25));
      f.run();
      nearDirection(f.direction(side + 'UpperArm', side + 'LowerArm'), upper, 'upper arm');
      nearDirection(f.direction(side + 'LowerArm', side + 'Hand'), lower, 'forearm');
    }
  });
  test(`${file}: thumb CMC and finger phalanges follow their own rest axes`, () => {
    const f = fixture(file), points = f.handPoints();
    const rotation = new THREE.Quaternion().setFromAxisAngle(f.solver.front, 0.7);
    const origin = points[1].clone();
    for (const i of [2, 3, 4]) points[i].sub(origin).applyQuaternion(rotation).add(origin);
    // Bend index PIP beyond 90 degrees without folding its angle back.
    const pivot = points[6].clone();
    const bend = new THREE.Quaternion().setFromAxisAngle(f.solver.front, 2.1);
    for (const i of [7, 8]) points[i].sub(pivot).applyQuaternion(bend).add(pivot);
    f.run(f.handResult(points));
    nearDirection(f.direction('leftThumbMetacarpal', 'leftThumbProximal'), points[2].clone().sub(points[1]), 'thumb CMC');
    nearDirection(f.direction('leftIndexIntermediate', 'leftIndexDistal'), points[7].clone().sub(points[6]), 'index PIP');
    assert.ok(f.nodes.get('leftThumbMetacarpal').quaternion.angleTo(new THREE.Quaternion()) > 0.1);
  });
}

test('wrist world orientation does not inherit an extra elbow/shoulder rotation', () => {
  const f = fixture(), points = f.handPoints();
  f.run(f.handResult(points));
  const before = f.nodes.get('leftHand').getWorldQuaternion(new THREE.Quaternion());
  f.p[13] = f.mp(f.at('leftUpperArm').add(new THREE.Vector3(0, -0.25, 0)));
  f.p[15] = f.mp(f.at('leftUpperArm').add(new THREE.Vector3(0, -0.25, 0.25)));
  f.run(f.handResult(points));
  assert.ok(before.angleTo(f.nodes.get('leftHand').getWorldQuaternion(new THREE.Quaternion())) < 0.01);
});

test('mirroring reflects directions and swaps anatomical sides together', () => {
  const f = fixture();
  f.p[13] = f.mp(f.at('leftUpperArm').add(new THREE.Vector3(0, -0.25, 0)));
  f.p[15] = f.mp(f.at('leftUpperArm').add(new THREE.Vector3(0, -0.25, 0.25)));
  f.run(null, { mirror: true });
  nearDirection(f.direction('rightUpperArm', 'rightLowerArm'), new THREE.Vector3(0, -1, 0), 'mirrored upper arm');
  nearDirection(f.direction('rightLowerArm', 'rightHand'), new THREE.Vector3(0, 0, 1), 'mirrored forearm');
});

test('hand association uses pose wrist proximity and never assigns two hands to one arm', () => {
  const f = fixture();
  const result = { landmarks: [[{ x: 0.2, y: 0.4, z: 0 }], [{ x: 0.8, y: 0.4, z: 0 }]],
    worldLandmarks: [f.handPoints().map(f.mp), f.handPoints('right').map(f.mp)],
    handedness: [[{ categoryName: 'Left', score: 0.9 }], [{ categoryName: 'Left', score: 0.9 }]] };
  const pose = []; pose[15] = { x: 0.8, y: 0.4, z: 0, visibility: 1 }; pose[16] = { x: 0.2, y: 0.4, z: 0, visibility: 1 };
  assert.equal(JSON.stringify(matchHands(result, pose)), JSON.stringify([{ side: 'right', index: 0 }, { side: 'left', index: 1 }]));
});

test('missing/invalid detections hold briefly then relax wrists AND fingers', () => {
  const f = fixture(), points = f.handPoints();
  for (const p of points) p.applyAxisAngle(f.solver.front, 0.7);
  f.run(f.handResult(points));
  const bone = f.nodes.get('leftHand'), before = bone.quaternion.clone();
  f.run(null, {}, 1);
  assert.ok(before.angleTo(bone.quaternion) < 0.001);
  f.run(null);
  assert.ok(bone.quaternion.angleTo(new THREE.Quaternion()) < 0.001);
  const invalid = f.handResult(points); invalid.worldLandmarks[0][5].x = NaN;
  f.run(invalid);
  for (const node of f.nodes.values()) assert.ok(node.quaternion.toArray().every(Number.isFinite));
});

test('whole-body loss also relaxes previously tracked arms', () => {
  const f = fixture();
  f.p[15] = f.mp(f.at('leftLowerArm').add(new THREE.Vector3(0, 0, 0.2)));
  f.run();
  f.pose.worldLandmarks = []; f.pose.landmarks = [];
  f.run();
  assert.ok(f.nodes.get('leftLowerArm').quaternion.angleTo(new THREE.Quaternion()) < 0.001);
});

test('time-based smoothing agrees at 15 and 60 fps', () => {
  const a = fixture(), b = fixture();
  for (const [f, fps] of [[a, 15], [b, 60]]) {
    f.p[15] = f.mp(f.at('leftLowerArm').add(new THREE.Vector3(0, 0, 0.2)));
    for (let i = 1; i <= fps; i++) f.solver.update(f.pose, null, { mirror: false, now: i * 1000 / fps, dt: 1 / fps });
  }
  assert.ok(a.nodes.get('leftLowerArm').getWorldQuaternion(new THREE.Quaternion()).angleTo(
    b.nodes.get('leftLowerArm').getWorldQuaternion(new THREE.Quaternion())) < 0.001);
});

test('rotated palms and spread fingers follow both sides in either mirror mode', () => {
  for (const side of ['left', 'right']) for (const mirror of [false, true]) {
    const f = fixture(), points = f.handPoints(side);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, -0.5, 0.7));
    const wrist = points[0].clone();
    // Rotate the whole hand, then spread only the index MCP.
    for (const p of points) p.sub(wrist).applyQuaternion(rotation).add(wrist);
    const mcp = points[5].clone();
    for (const i of [6, 7, 8]) points[i].sub(mcp).applyAxisAngle(f.solver.front, 0.3).add(mcp);
    f.run(f.handResult(points, side), { mirror });
    const targetSide = mirror ? (side === 'left' ? 'right' : 'left') : side;
    const expected = points[6].clone().sub(points[5]);
    if (mirror) {
      expected.applyQuaternion(f.solver.coordinateFrame.clone().invert());
      expected.x *= -1;
      expected.applyQuaternion(f.solver.coordinateFrame);
    }
    nearDirection(f.direction(targetSide + 'IndexProximal', targetSide + 'IndexIntermediate'), expected, 'index spread');
  }
});

test('head world orientation remains stable when the tracked chest rotates', () => {
  const f = fixture();
  const page = readFileSync(new URL('../js/vtuber.js', import.meta.url), 'utf8');
  const context = vm.createContext({ THREE, retargeter: f.solver, mirrorMode: false, headGain: 1,
    curYaw: 0, curPitch: 0, curRoll: 0, viewer: { getBone: name => f.nodes.get(name) } });
  vm.runInContext(page.slice(page.indexOf('const _m4'), page.indexOf('viewer.onFrame =')), context);
  context.matrix = new THREE.Matrix4().toArray();
  f.nodes.get('chest').rotation.set(0.2, 0.4, -0.3);
  vm.runInContext('applyHeadRotation(matrix)', context);
  const actual = f.nodes.get('head').getWorldQuaternion(new THREE.Quaternion());
  assert.ok(actual.angleTo(f.solver.rest.get('head').world) < 0.001);
});

test('tracked hands stay oriented while an occluded parent arm relaxes', () => {
  const f = fixture(), points = f.handPoints();
  f.p[15] = f.mp(f.at('leftLowerArm').add(new THREE.Vector3(0, 0, 0.2)));
  f.run(f.handResult(points));
  const expected = f.nodes.get('leftHand').getWorldQuaternion(new THREE.Quaternion());
  f.pose.worldLandmarks = []; f.pose.landmarks = [];
  for (let i = 0; i < 30; i++) {
    f.run(f.handResult(points), {}, 1);
    assert.ok(expected.angleTo(f.nodes.get('leftHand').getWorldQuaternion(new THREE.Quaternion())) < 0.001,
      'relaxing an untracked parent must happen before solving its tracked hand');
  }
});
