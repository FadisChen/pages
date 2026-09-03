import test from "node:test";
import assert from "node:assert/strict";
import { createFakeStorage } from "./testUtils/fakeStorage.js";
import * as settingsStore from "../js/storage/settingsStore.js";
import * as outlineStore from "../js/storage/outlineStore.js";
import * as memoriesStore from "../js/storage/memoriesStore.js";
import * as sessionStore from "../js/storage/sessionStore.js";

test("settingsStore defaults to empty strings when nothing saved", () => {
  globalThis.localStorage = createFakeStorage();
  assert.deepEqual(settingsStore.loadSettings(), {
    apiKey: "",
    model: "",
    playerGender: "unspecified",
    friendGender: "unspecified"
  });
});

test("settingsStore round-trips and clear() resets to empty", () => {
  globalThis.localStorage = createFakeStorage();
  settingsStore.saveSettings({
    apiKey: "abc",
    model: "gemini-3.5-flash-lite",
    playerGender: "female",
    friendGender: "male"
  });
  assert.deepEqual(settingsStore.loadSettings(), {
    apiKey: "abc",
    model: "gemini-3.5-flash-lite",
    playerGender: "female",
    friendGender: "male"
  });
  settingsStore.clearSettings();
  assert.deepEqual(settingsStore.loadSettings(), {
    apiKey: "",
    model: "",
    playerGender: "unspecified",
    friendGender: "unspecified"
  });
});

test("settingsStore falls back to unspecified for unknown genders", () => {
  globalThis.localStorage = createFakeStorage();
  settingsStore.saveSettings({ apiKey: "abc", model: "m", playerGender: "alien", friendGender: "" });
  assert.deepEqual(settingsStore.loadSettings(), {
    apiKey: "abc",
    model: "m",
    playerGender: "unspecified",
    friendGender: "unspecified"
  });
});

test("outlineStore defaults missing genders for existing drafts", () => {
  globalThis.localStorage = createFakeStorage();
  outlineStore.saveOutline({
    title: "舊草稿",
    outline: "故事",
    friendName: "小海",
    friendPersona: "",
    playerName: "旅人",
    tone: "奇幻冒險"
  });
  assert.equal(outlineStore.loadOutline().playerGender, "unspecified");
  assert.equal(outlineStore.loadOutline().friendGender, "unspecified");
});

test("memoriesStore.appendMemory prepends (newest first)", () => {
  globalThis.localStorage = createFakeStorage();
  memoriesStore.appendMemory({ id: "1" });
  memoriesStore.appendMemory({ id: "2" });
  const all = memoriesStore.loadMemories();
  assert.deepEqual(all.map((m) => m.id), ["2", "1"]);
});

test("memoriesStore.clearMemories empties the list", () => {
  globalThis.localStorage = createFakeStorage();
  memoriesStore.appendMemory({ id: "1" });
  memoriesStore.clearMemories();
  assert.deepEqual(memoriesStore.loadMemories(), []);
});

test("sessionStore round-trips a snapshot and clears it", () => {
  globalThis.localStorage = createFakeStorage();
  assert.equal(sessionStore.loadSession(), null);
  sessionStore.saveSession({ log: [{ type: "narrative" }] });
  assert.deepEqual(sessionStore.loadSession(), { log: [{ type: "narrative" }] });
  sessionStore.clearSession();
  assert.equal(sessionStore.loadSession(), null);
});
