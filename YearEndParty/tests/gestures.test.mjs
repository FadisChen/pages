import test from "node:test";
import assert from "node:assert/strict";
import { AvatarGesturePlayer, AVATAR_GESTURES, normalizeAvatarGesture } from "../avatar-gestures.js";

test("invalid gesture arguments cannot select arbitrary animations", () => {
  for (const args of [null, [], "nod", {}, { gesture: "dance" }]) assert.equal(normalizeAvatarGesture(args).ok, false);
  for (const gesture of AVATAR_GESTURES) assert.equal(normalizeAvatarGesture({ gesture }).ok, true);
});

test("gestures wait for speech and expire if speech never arrives", () => {
  const player = new AvatarGesturePlayer();
  player.queue("nod", "one");
  assert.deepEqual(player.update(1, false), {});
  assert.equal(player.active, null);
  assert.ok(Object.keys(player.update(.1, true)).includes("head"));
  player.reset(true);
  player.queue("wave", "two");
  assert.deepEqual(player.update(9, false), {});
  assert.equal(player.pending, null);
});

test("a completed turn keeps queued speech gestures but drops silent ones", () => {
  for (const playing of [false, true]) {
    const player = new AvatarGesturePlayer();
    player.queue("nod", "one");
    player.finishTurn();
    player.update(.1, playing);
    assert.equal(Boolean(player.active), playing);
    assert.equal(player.pending, null);
  }
});

test("all gestures remain bounded and return to the base pose", () => {
  for (const gesture of AVATAR_GESTURES) {
    const player = new AvatarGesturePlayer();
    player.queue(gesture, gesture);
    let movement = 0;
    for (let frame = 0; frame < 240; frame++) {
      for (const angles of Object.values(player.update(1 / 60, true))) {
        assert.ok(angles.every(angle => Number.isFinite(angle) && Math.abs(angle) <= Math.PI));
        movement += angles.reduce((sum, angle) => sum + Math.abs(angle), 0);
      }
    }
    assert.ok(movement > 1, gesture);
    assert.equal(player.active, null);
  }
});

test("interruption fades the current pose without advancing the gesture", () => {
  const player = new AvatarGesturePlayer();
  player.queue("wave", "one");
  const before = player.update(.6, true).rightLowerArm[1];
  player.reset();
  const after = player.update(.1, true).rightLowerArm[1];
  assert.ok(after > 0 && after < before);
  assert.deepEqual(player.update(.2, true), {});
  assert.equal(player.active, null);
});

test("waving moves the forearm about the elbow while keeping the wrist steady", () => {
  const player = new AvatarGesturePlayer();
  player.queue("wave", "wave");
  const first = player.update(.5, true);
  const second = player.update(.33, true);
  assert.notDeepEqual(first.rightLowerArm, second.rightLowerArm);
  assert.deepEqual(first.rightHand, second.rightHand);
  assert.deepEqual(first.rightUpperArm, second.rightUpperArm);
});
