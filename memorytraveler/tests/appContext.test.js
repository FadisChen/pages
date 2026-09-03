import test from "node:test";
import assert from "node:assert/strict";
import { createAppContext } from "../js/app/appContext.js";
import * as sessionStore from "../js/storage/sessionStore.js";
import { createFakeStorage } from "./testUtils/fakeStorage.js";

test("startNewGame resolves gender defaults into the outline and session", () => {
  globalThis.localStorage = createFakeStorage();
  const ctx = createAppContext();
  ctx.saveSettings({ apiKey: "key", model: "model", playerGender: "female", friendGender: "female" });

  ctx.startNewGame({
    title: "舊草稿",
    outline: "兩位旅人尋找失落的車站。",
    friendName: "小海",
    friendPersona: "敏銳",
    playerName: "旅人",
    tone: "奇幻冒險"
  });

  assert.equal(ctx.outline.playerGender, "female");
  assert.equal(ctx.outline.friendGender, "female");
  assert.equal(ctx.peekSession().outline.playerGender, "female");
  assert.equal(ctx.peekSession().outline.friendGender, "female");
});

test("legacy sessions marked as ending remain resumable", () => {
  globalThis.localStorage = createFakeStorage();
  const ctx = createAppContext();
  sessionStore.saveSession({ isEnding: true, log: [{ type: "narrative", text: "旅程仍在繼續" }] });

  assert.equal(ctx.hasResumableSession(), true);
});
