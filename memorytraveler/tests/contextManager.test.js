import test from "node:test";
import assert from "node:assert/strict";
import { shouldCompact, splitForCompaction, compactHistory } from "../js/gemini/contextManager.js";
import { userContent, modelContent } from "../js/utils/geminiContent.js";
import { COMPACTION } from "../js/core/constants.js";

const thresholds = { turnThreshold: 4, charThreshold: 1000, keepRaw: 2 };

function makeContents(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(i % 2 === 0 ? userContent(`u${i}`) : modelContent(`m${i}`));
  }
  return out;
}

test("shouldCompact is false under both thresholds", () => {
  assert.equal(shouldCompact(makeContents(3), thresholds), false);
});

test("shouldCompact is true once turn count exceeds the threshold", () => {
  assert.equal(shouldCompact(makeContents(5), thresholds), true);
});

test("shouldCompact is true once char count exceeds the threshold, even with few turns", () => {
  const contents = [userContent("x".repeat(2000))];
  assert.equal(shouldCompact(contents, thresholds), true);
});

test("default compaction waits for a larger batch and keeps five exchanges", () => {
  assert.equal(shouldCompact(makeContents(COMPACTION.turnThreshold), COMPACTION), false);
  assert.equal(shouldCompact(makeContents(COMPACTION.turnThreshold + 1), COMPACTION), true);
  const { recent } = splitForCompaction(makeContents(30), COMPACTION.keepRaw);
  assert.equal(recent.length, 10);
});

test("splitForCompaction keeps exactly keepRaw entries as recent", () => {
  const { older, recent } = splitForCompaction(makeContents(6), 2);
  assert.equal(older.length, 4);
  assert.equal(recent.length, 2);
  assert.deepEqual(recent, makeContents(6).slice(4));
});

test("splitForCompaction never keeps more than the total length", () => {
  const { older, recent } = splitForCompaction(makeContents(1), 2);
  assert.equal(older.length, 0);
  assert.equal(recent.length, 1);
});

test("compactHistory is a no-op below the threshold", async () => {
  const contents = makeContents(2);
  const result = await compactHistory({ contents, storySummary: "" }, async () => "summary", thresholds);
  assert.equal(result.contents, contents);
  assert.equal(result.storySummary, "");
});

test("compactHistory folds older turns into a summary once over threshold", async () => {
  const contents = makeContents(6);
  let calledWithPrompt = null;
  const result = await compactHistory(
    { contents, storySummary: "" },
    async (prompt) => {
      calledWithPrompt = prompt;
      return "  這是濃縮後的摘要。  ";
    },
    thresholds
  );
  assert.equal(result.contents.length, 2);
  assert.deepEqual(result.contents, contents.slice(4));
  assert.equal(result.storySummary, "這是濃縮後的摘要。");
  assert.match(calledWithPrompt, /濃縮成一段/);
});

test("compactHistory keeps raw history (and retries later) if the summarize call fails", async () => {
  const contents = makeContents(6);
  const result = await compactHistory(
    { contents, storySummary: "既有摘要" },
    async () => {
      throw new Error("quota exceeded");
    },
    thresholds
  );
  assert.deepEqual(result.contents, contents);
  assert.equal(result.storySummary, "既有摘要");
});

test("compactHistory keeps raw history when the summary is empty", async () => {
  const contents = makeContents(6);
  const result = await compactHistory({ contents, storySummary: "既有摘要" }, async () => "  ", thresholds);
  assert.deepEqual(result.contents, contents);
  assert.equal(result.storySummary, "既有摘要");
});
