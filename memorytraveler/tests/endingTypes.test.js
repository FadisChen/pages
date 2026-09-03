import test from "node:test";
import assert from "node:assert/strict";
import { findEndingTypeMeta, isUnlocked } from "../js/utils/endingTypes.js";
import { ENDING_TYPES } from "../js/core/constants.js";

test("finds a known ending type's emoji", () => {
  const meta = findEndingTypeMeta("圓滿結局");
  assert.equal(meta.emoji, "🌟");
});

test("falls back to a generic meta for an unknown id", () => {
  const meta = findEndingTypeMeta("外星人結局");
  assert.equal(meta.id, "外星人結局");
  assert.equal(meta.emoji, "📖");
});

test("falls back cleanly for an empty/undefined id", () => {
  const meta = findEndingTypeMeta(undefined);
  assert.equal(meta.id, "未知結局");
});

test("ENDING_TYPES has no duplicate ids", () => {
  const ids = ENDING_TYPES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("isUnlocked reflects memory records", () => {
  const memories = [{ endingType: "悲劇結局" }, { endingType: "圓滿結局" }];
  assert.equal(isUnlocked(memories, "圓滿結局"), true);
  assert.equal(isUnlocked(memories, "驚奇結局"), false);
});
