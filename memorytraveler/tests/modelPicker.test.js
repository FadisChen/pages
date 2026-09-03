import test from "node:test";
import assert from "node:assert/strict";
import { pickDefaultModel } from "../js/utils/modelPicker.js";

test("prefers the exact recommended default when present", () => {
  const ids = ["gemini-2.5-pro", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
  assert.equal(pickDefaultModel(ids, "gemini-3.5-flash-lite"), "gemini-3.5-flash-lite");
});

test("falls back to a flash-lite model when the default isn't listed", () => {
  const ids = ["gemini-2.5-pro", "gemini-2.0-flash-lite", "gemini-2.5-flash"];
  assert.equal(pickDefaultModel(ids, "gemini-3.5-flash-lite"), "gemini-2.0-flash-lite");
});

test("falls back to a flash model when no flash-lite exists", () => {
  const ids = ["gemini-2.5-pro", "gemini-2.5-flash"];
  assert.equal(pickDefaultModel(ids, "gemini-3.5-flash-lite"), "gemini-2.5-flash");
});

test("falls back to the first entry when nothing matches", () => {
  const ids = ["text-embedding-004", "gemini-2.5-pro"];
  assert.equal(pickDefaultModel(ids, "gemini-3.5-flash-lite"), "text-embedding-004");
});

test("returns null for an empty list", () => {
  assert.equal(pickDefaultModel([], "gemini-3.5-flash-lite"), null);
});
