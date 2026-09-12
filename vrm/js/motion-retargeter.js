import * as THREE from 'three';

// three-vrm uses VRM 1 bone names, including for imported VRM 0 files.
export const FINGERS = {
  Thumb: { points: [1, 2, 3, 4], bones: ['Metacarpal', 'Proximal', 'Distal'] },
  Index: { points: [5, 6, 7, 8], bones: ['Proximal', 'Intermediate', 'Distal'] },
  Middle: { points: [9, 10, 11, 12], bones: ['Proximal', 'Intermediate', 'Distal'] },
  Ring: { points: [13, 14, 15, 16], bones: ['Proximal', 'Intermediate', 'Distal'] },
  Little: { points: [17, 18, 19, 20], bones: ['Proximal', 'Intermediate', 'Distal'] },
};
const SIDES = ['left', 'right'];
export const FINGER_BONES = SIDES.flatMap(side => Object.entries(FINGERS).flatMap(
  ([digit, { bones }]) => bones.map(segment => `${side}${digit}${segment}`)
));
export const ARM_BONES = SIDES.flatMap(side => ['Shoulder', 'UpperArm', 'LowerArm', 'Hand'].map(b => side + b));
const POSE = { left: [11, 13, 15], right: [12, 14, 16] };
const EPS = 1e-8;
const HOLD_MS = 250;
const valid = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const visible = p => valid(p) && (p.visibility ?? 1) >= 0.5;
const diff = (a, b) => a.clone().sub(b);

// Orthonormal frame: primary direction plus a perpendicular reference.
function basis(direction, reference) {
  if (direction.lengthSq() < EPS) return null;
  const x = direction.clone().normalize();
  const y = reference.clone().addScaledVector(x, -reference.dot(x));
  if (y.lengthSq() < EPS) return null;
  y.normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y))
  );
}

function palmFrame(wrist, middle, index, little) {
  return basis(diff(middle, wrist), diff(index, little));
}

// Associate hands in IMAGE space only. Pose/Hand world origins are unrelated.
// Prefer wrist proximity to classifier labels (which can flip on occlusion).
export function matchHands(result, pose) {
  const hands = (result?.landmarks ?? []).map((lm, i) => ({ lm, i })).filter(({ lm, i }) =>
    valid(lm?.[0]) && result.worldLandmarks?.[i]?.length === 21 && result.worldLandmarks[i].every(valid)
  ).slice(0, 2);
  const cost = (hand, side) => {
    const wrist = pose?.[POSE[side][2]];
    const label = result.handedness?.[hand.i]?.[0];
    const mismatch = label?.categoryName?.toLowerCase() !== side;
    if (visible(wrist)) {
      const distance = Math.hypot(hand.lm[0].x - wrist.x, hand.lm[0].y - wrist.y);
      return distance > 0.25 ? Infinity : distance + (mismatch ? 0.015 : 0);
    }
    return label?.score >= 0.5 && !mismatch ? 0.3 : Infinity;
  };
  let best = { score: Infinity, pairs: [] };
  // Exhaustive one-to-one assignment for at most two hands, allowing rejection.
  const visit = (index, used, score, pairs) => {
    if (index === hands.length) {
      if (score < best.score) best = { score, pairs };
      return;
    }
    visit(index + 1, used, score + 0.6, pairs);
    for (const side of SIDES) {
      if (!used.includes(side)) visit(index + 1, [...used, side], score + cost(hands[index], side),
        [...pairs, { side, index: hands[index].i }]);
    }
  };
  visit(0, [], 0, []);
  return best.pairs;
}

export class MotionRetargeter {
  constructor(vrm, restPose) {
    this.vrm = vrm;
    this.restPose = restPose;
    this.rest = new Map();
    this.filtered = new Map();
    this.lastSeen = new Map();
    this.armNormals = new Map();
    const humanoid = vrm.humanoid;
    const saved = new Map();
    // Capture the actual T-pose, before the viewer's arms-down idle offsets.
    for (const [name, transform] of Object.entries(humanoid.normalizedRestPose)) {
      const node = humanoid.getNormalizedBoneNode(name);
      if (!node) continue;
      saved.set(name, node.quaternion.clone());
      node.quaternion.fromArray(transform.rotation ?? [0, 0, 0, 1]);
    }
    for (const name of saved.keys()) {
      const node = humanoid.getNormalizedBoneNode(name);
      this.rest.set(name, { node, position: node.getWorldPosition(new THREE.Vector3()),
        world: node.getWorldQuaternion(new THREE.Quaternion()), local: node.quaternion.clone() });
    }
    for (const [name, q] of saved) this.rest.get(name).node.quaternion.copy(q);
    const left = this.rest.get('leftUpperArm').position;
    const right = this.rest.get('rightUpperArm').position;
    const up = diff(left.clone().add(right).multiplyScalar(0.5), this.rest.get('hips').position);
    // Avatar's anatomical left, up, front. Also handles rotateVRM0's scene transform.
    this.coordinateFrame = basis(diff(left, right), up);
    this.front = new THREE.Vector3(0, 0, 1).applyQuaternion(this.coordinateFrame);
  }

  point(p, mirror) {
    return new THREE.Vector3(mirror ? -p.x : p.x, -p.y, -p.z).applyQuaternion(this.coordinateFrame);
  }

  setWorld(name, target, now, dt) {
    const rest = this.rest.get(name);
    if (!rest || !target) return;
    const previous = this.filtered.get(name) ?? rest.node.getWorldQuaternion(new THREE.Quaternion());
    previous.slerp(target, 1 - Math.exp(-dt / 0.065)).normalize();
    this.filtered.set(name, previous);
    this.lastSeen.set(name, now);
    const parent = rest.node.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    rest.node.quaternion.copy(parent.invert().multiply(previous));
    rest.node.updateWorldMatrix(false, false);
  }

  relax(names, now, dt, immediate = false) {
    for (const name of names) {
      const rest = this.rest.get(name);
      if (!rest || (!immediate && now - (this.lastSeen.get(name) ?? -Infinity) < HOLD_MS)) continue;
      rest.node.quaternion.slerp(this.restPose.get(name) ?? rest.local, immediate ? 1 : 1 - Math.exp(-dt / 0.25));
      this.filtered.delete(name);
      if (immediate) this.lastSeen.delete(name);
    }
  }

  reset() {
    this.relax(['chest', ...ARM_BONES, ...FINGER_BONES], 0, 0, true);
    this.filtered.clear();
    this.lastSeen.clear();
    this.armNormals.clear();
  }

  update(poseResult, handResult, { mirror = true, now, dt, poseEnabled = true, handsEnabled = true }) {
    const seen = new Set();
    const world = poseResult?.worldLandmarks?.[0];
    const image = poseResult?.landmarks?.[0];
    const drive = (name, q) => {
      if (!q) return;
      this.setWorld(name, q, now, dt);
      seen.add(name);
    };
    if (poseEnabled && world) {
      // Torso orientation supplies a stable straight-elbow reference; no root translation.
      if ([11, 12, 23, 24].every(i => visible(image?.[i]) && valid(world[i]))) {
        const l = this.point(world[mirror ? 12 : 11], mirror);
        const r = this.point(world[mirror ? 11 : 12], mirror);
        const hips = this.point(world[23], mirror).add(this.point(world[24], mirror)).multiplyScalar(0.5);
        const frame = basis(diff(l, r), l.clone().add(r).multiplyScalar(0.5).sub(hips));
        const chest = this.rest.get('chest');
        if (frame && chest) drive('chest', frame.multiply(this.coordinateFrame.clone().invert()).multiply(chest.world));
      }
    }
    if (!seen.has('chest')) this.relax(['chest'], now, dt);
    if (poseEnabled && world) {
      for (const source of SIDES) {
        const indices = POSE[source];
        if (!indices.every(i => visible(image?.[i]) && valid(world[i]))) continue;
        const side = mirror ? (source === 'left' ? 'right' : 'left') : source;
        const [s, e, w] = indices.map(i => this.point(world[i], mirror));
        const upper = diff(e, s), lower = diff(w, e);
        if (upper.lengthSq() < EPS || lower.lengthSq() < EPS) continue;
        const a = this.rest.get(side + 'UpperArm'), b = this.rest.get(side + 'LowerArm');
        const hand = this.rest.get(side + 'Hand');
        const restUpper = diff(b.position, a.position), restLower = diff(hand.position, b.position);
        const restNormal = new THREE.Vector3().crossVectors(restUpper, this.front).normalize();
        const normal = new THREE.Vector3().crossVectors(upper.clone().normalize(), lower.clone().normalize());
        if (normal.length() > 0.12) this.armNormals.set(side, normal.normalize());
        else {
          const chest = this.rest.get('chest');
          const torsoDelta = chest ? chest.node.getWorldQuaternion(new THREE.Quaternion()).multiply(chest.world.clone().invert()) : new THREE.Quaternion();
          normal.copy(this.armNormals.get(side) ?? restNormal.clone().applyQuaternion(torsoDelta));
        }
        const armTarget = (restDirection, direction, rest) => {
          const from = basis(restDirection, restNormal), to = basis(direction, normal);
          return from && to ? to.multiply(from.invert()).multiply(rest.world) : null;
        };
        const upperTarget = armTarget(restUpper, upper, a);
        const shoulder = this.rest.get(side + 'Shoulder');
        if (shoulder && upperTarget) {
          const parentQ = shoulder.node.parent.getWorldQuaternion(new THREE.Quaternion());
          const shoulderRest = parentQ.clone().multiply(shoulder.local);
          const restDirection = restUpper.clone().applyQuaternion(a.world.clone().invert())
            .applyQuaternion(parentQ.clone().multiply(a.local)).normalize();
          const swing = new THREE.Quaternion().setFromUnitVectors(restDirection, upper.clone().normalize());
          drive(side + 'Shoulder', new THREE.Quaternion().slerp(swing, 0.25).multiply(shoulderRest));
        }
        // Absolute targets become parent-relative locals AFTER each parent is updated.
        drive(side + 'UpperArm', upperTarget);
        drive(side + 'LowerArm', armTarget(restLower, lower, b));
      }
    }
    // Missing parents also update before tracked children; otherwise relaxation
    // would rotate an already-solved hand a second time at the end of the frame.
    this.relax(ARM_BONES.filter(name => !name.endsWith('Hand') && !seen.has(name)), now, dt);

    const assignments = handsEnabled ? matchHands(handResult, poseEnabled ? image : null) : [];
    const debug = [];
    for (const { side: source, index } of assignments) {
      const side = mirror ? (source === 'left' ? 'right' : 'left') : source;
      const p = handResult.worldLandmarks[index].map(lm => this.point(lm, mirror));
      const rest = this.rest.get(side + 'Hand');
      const middle = this.rest.get(side + 'MiddleProximal');
      const indexBone = this.rest.get(side + 'IndexProximal');
      const little = this.rest.get(side + 'LittleProximal');
      if (!rest || !middle || !indexBone || !little) continue;
      const from = palmFrame(rest.position, middle.position, indexBone.position, little.position);
      const to = palmFrame(p[0], p[9], p[5], p[17]);
      if (!from || !to) continue;
      const palmDelta = to.multiply(from.invert());
      drive(side + 'Hand', palmDelta.clone().multiply(rest.world));
      for (const [digit, { points, bones }] of Object.entries(FINGERS)) {
        for (let i = 0; i < bones.length; i++) {
          const name = side + digit + bones[i];
          const bone = this.rest.get(name);
          if (!bone) continue;
          const next = this.rest.get(side + digit + bones[i + 1]);
          const previous = this.rest.get(side + digit + bones[i - 1]);
          // VRM has no tip bone: extend the last phalanx's rest axis.
          const axis = next ? diff(next.position, bone.position) : previous ? diff(bone.position, previous.position) : null;
          const direction = diff(p[points[i + 1]], p[points[i]]);
          if (!axis || axis.lengthSq() < EPS || direction.lengthSq() < EPS) continue;
          // Minimal swing in the palm frame preserves spread, flexion, and thumb
          // opposition without assuming every finger curls about a fixed Z axis.
          axis.applyQuaternion(palmDelta).normalize();
          const swing = new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize());
          drive(name, swing.multiply(palmDelta).multiply(bone.world));
        }
      }
      debug.push(`${source === 'left' ? '左' : '右'}手 → 角色${side === 'left' ? '左' : '右'}手（三維掌面）`);
    }
    this.relax(['leftHand', 'rightHand', ...FINGER_BONES].filter(name => !seen.has(name)), now, dt);
    return debug.length ? debug.join('\n') : '未偵測到可靠手掌；短暫保留後回到休息姿勢';
  }
}
