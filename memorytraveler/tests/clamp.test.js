import test from "node:test";
import assert from "node:assert/strict";
import { clamp } from "../js/utils/clamp.js";

test("clamp keeps in-range values unchanged", () => {
  assert.equal(clamp(50, 0, 100), 50);
});

test("clamp caps values above max", () => {
  assert.equal(clamp(150, 0, 100), 100);
});

test("clamp floors values below min", () => {
  assert.equal(clamp(-20, 0, 100), 0);
});

test("clamp handles boundary values", () => {
  assert.equal(clamp(0, 0, 100), 0);
  assert.equal(clamp(100, 0, 100), 100);
});
