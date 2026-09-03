import test from "node:test";
import assert from "node:assert/strict";
import { readJson, writeJson, removeKey } from "../js/storage/localJson.js";
import { createFakeStorage, createThrowingStorage } from "./testUtils/fakeStorage.js";

test("writeJson then readJson round-trips a value", () => {
  globalThis.localStorage = createFakeStorage();
  writeJson("k", { a: 1 });
  assert.deepEqual(readJson("k", null), { a: 1 });
});

test("readJson returns the fallback when the key is absent", () => {
  globalThis.localStorage = createFakeStorage();
  assert.deepEqual(readJson("missing", { default: true }), { default: true });
});

test("readJson returns the fallback on corrupt JSON instead of throwing", () => {
  const storage = createFakeStorage();
  storage.setItem("bad", "{not valid json");
  globalThis.localStorage = storage;
  assert.deepEqual(readJson("bad", "fallback"), "fallback");
});

test("removeKey deletes a stored value", () => {
  const storage = createFakeStorage();
  globalThis.localStorage = storage;
  writeJson("k", 123);
  removeKey("k");
  assert.equal(readJson("k", "gone"), "gone");
});

test("readJson/writeJson never throw when storage access itself throws", () => {
  globalThis.localStorage = createThrowingStorage();
  assert.doesNotThrow(() => writeJson("k", 1));
  assert.doesNotThrow(() => removeKey("k"));
  assert.equal(readJson("k", "fallback"), "fallback");
});
