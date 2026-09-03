import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../js/core/gameEngine.js";
import { STORY_CONTINUATION } from "../js/core/constants.js";

const outline = {
  title: "森林寶藏",
  outline: "主角在森林中尋找失落的寶藏。",
  friendName: "小海",
  friendPersona: "",
  playerName: "",
  tone: "奇幻冒險",
  playerGender: "female",
  friendGender: "female"
};

function respondWith(payload) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] };
}

function respondWithText(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function isSummaryCall(body) {
  return !!body.generationConfig?.responseSchema?.properties?.endingType;
}

function isTurnCall(body) {
  return !!body.systemInstruction;
}

test("start() runs the opening turn and applies affinity/clue effects", async () => {
  let capturedBody = null;
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async (apiKey, model, body) => {
      capturedBody = body;
      return respondWith({
        narrative: "你發現了一張破舊的地圖。",
        friendLine: "這看起來很重要！",
        choices: ["撿起地圖", "無視它"],
        affinityDelta: 8,
        newClues: ["破舊地圖：似乎標示了寶藏位置"]
      });
    }
  });

  const turn = await engine.start();

  assert.equal(turn.narrative, "你發現了一張破舊的地圖。");
  assert.equal(engine.affinity, 58); // default 50 + 8
  assert.deepEqual(engine.clues, ["破舊地圖：似乎標示了寶藏位置"]);
  assert.equal(engine.log.length, 1);
  assert.equal(engine.log[0].type, "narrative");
  assert.equal(engine.currentChoices.length, 2);
  assert.ok(isTurnCall(capturedBody));
  assert.match(capturedBody.systemInstruction.parts[0].text, /尚未取得任何物品或線索/);
  assert.match(capturedBody.systemInstruction.parts[0].text, /同性別/);
});

test("choose() clamps affinity at the upper bound and dedupes clues", async () => {
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () =>
      respondWith({
        narrative: "劇情推進。",
        choices: ["A", "B"],
        affinityDelta: 200, // deliberately absurd to exercise clamping
        newClues: ["線索一", "線索一"] // duplicate within the same turn
      })
  });
  engine.affinity = 90;

  await engine.choose("往前走");

  assert.equal(engine.affinity, 100);
  assert.deepEqual(engine.clues, ["線索一"]);
  assert.equal(engine.log.length, 2);
  assert.equal(engine.log[0].type, "choice");
  assert.equal(engine.log[0].text, "往前走");
  assert.equal(engine.log[1].type, "narrative");
});

test("choose() passes free-form player actions to the turn prompt and logs them", async () => {
  let capturedBody = null;
  const action = "跳下碼頭查看水下的光";
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async (apiKey, model, body) => {
      capturedBody = body;
      return respondWith({ narrative: "你看見水下閃過一道銀光。", choices: ["繼續查看"] });
    }
  });

  await engine.choose(action);

  const latestContent = capturedBody.contents[capturedBody.contents.length - 1];
  assert.equal(latestContent.parts[0].text, `玩家行動：${action}`);
  assert.equal(engine.log[0].text, action);
});

test("story continues beyond the old cap and ignores a legacy ending flag", async () => {
  let turnNumber = 0;
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () => {
      turnNumber++;
      return respondWith({ narrative: `第 ${turnNumber} 段`, choices: [], isEnding: true });
    }
  });

  const firstTurn = await engine.start();
  for (let i = 1; i < 30; i++) {
    await engine.choose("繼續");
  }

  assert.equal(engine.log.filter((entry) => entry.type === "narrative").length, 30);
  assert.deepEqual(engine.currentChoices, [STORY_CONTINUATION.fallbackChoice]);
  assert.equal("isEnding" in firstTurn, false);
  assert.equal("isEnding" in engine, false);
});

test("empty choices always receive a fallback continuation", async () => {
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () => respondWith({ narrative: "故事繼續。", choices: [] })
  });

  await engine.start();

  assert.deepEqual(engine.currentChoices, [STORY_CONTINUATION.fallbackChoice]);
});

test("choose() clamps affinity at the lower bound", async () => {
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () => respondWith({ narrative: "x", choices: [], affinityDelta: -999 })
  });
  engine.affinity = 10;
  await engine.choose("退縮");
  assert.equal(engine.affinity, 0);
});

test("a failed turn does not corrupt contents/log (nothing is committed)", async () => {
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () => {
      throw new Error("network down");
    }
  });
  await assert.rejects(() => engine.choose("嘗試"), /network down/);
  assert.equal(engine.log.length, 0);
  assert.equal(engine.contents.length, 0);
});

test("concurrent calls are rejected by the busy guard", async () => {
  let resolveFirst;
  const gate = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () => {
      await gate;
      return respondWith({ narrative: "x", choices: [] });
    }
  });

  const first = engine.choose("A");
  await assert.rejects(() => engine.choose("B"), /仍在進行中/);
  resolveFirst();
  await first;
});

test("finish() returns the parsed summary and does not touch affinity/clues", async () => {
  let capturedBody = null;
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async (apiKey, model, body) => {
      capturedBody = body;
      return respondWith({
        title: "森林寶藏的回憶",
        summary: "你與小海找到了寶藏。",
        highlights: ["發現地圖", "找到寶藏"],
        endingType: "圓滿結局"
      });
    }
  });
  engine.affinity = 70;
  engine.clues = ["地圖"];

  const result = await engine.finish();

  assert.equal(result.endingType, "圓滿結局");
  assert.equal(result.highlights.length, 2);
  assert.equal(engine.affinity, 70);
  assert.deepEqual(engine.clues, ["地圖"]);
  assert.ok(isSummaryCall(capturedBody));
  assert.match(capturedBody.contents[0].parts[0].text, /70\/100/);
  assert.match(capturedBody.contents[0].parts[0].text, /地圖/);
});

test("history compaction runs transparently across many turns", async () => {
  let turnNumber = 0;
  let compactionCalls = 0;
  let lastTurnBody = null;
  const continuityOutline = {
    ...outline,
    friendPersona: "敏銳，總能注意到細節",
    playerName: "旅人"
  };
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline: continuityOutline,
    generateContentFn: async (apiKey, model, body) => {
      if (!isTurnCall(body)) {
        compactionCalls++;
        return respondWithText("這是壓縮後的摘要。");
      }
      turnNumber++;
      lastTurnBody = body;
      return respondWith({ narrative: `第 ${turnNumber} 段`, choices: ["繼續"], affinityDelta: 0, newClues: [] });
    }
  });

  await engine.start();
  for (let i = 0; i < 30; i++) {
    await engine.choose("繼續");
  }

  assert.ok(compactionCalls >= 1, "expected at least one compaction pass over 31 turns");
  assert.ok(compactionCalls <= 3, `expected compaction to stay infrequent, got ${compactionCalls} calls`);
  // Without compaction, 31 successful turns would leave 62 raw entries
  // (2 per turn); compaction should keep it well under that.
  assert.ok(engine.contents.length < 62, `expected compaction to bound raw contents, got ${engine.contents.length}`);
  assert.ok(engine.storySummary.length > 0);
  assert.match(lastTurnBody.systemInstruction.parts[0].text, /敏銳，總能注意到細節/);
  assert.match(lastTurnBody.systemInstruction.parts[0].text, /玩家性別設定為「女性」/);
  assert.match(lastTurnBody.systemInstruction.parts[0].text, /劇情摘要/);
  // The full narrative/choice log is preserved for display even though the
  // raw `contents` sent to Gemini gets trimmed.
  assert.equal(engine.log.length, 1 + 30 * 2);
});

test("toSnapshot/fromSnapshot round-trips full engine state", async () => {
  const engine = new GameEngine({
    apiKey: "k",
    model: "m",
    outline,
    generateContentFn: async () =>
      respondWith({ narrative: "x", friendLine: "y", choices: ["A", "B"], affinityDelta: 5, newClues: ["c1"] })
  });
  await engine.start();

  const snapshot = engine.toSnapshot();
  const restored = GameEngine.fromSnapshot(snapshot, { apiKey: "k2", model: "m2" });

  assert.equal(restored.apiKey, "k2"); // explicit override wins
  assert.equal(restored.model, "m2");
  assert.deepEqual(restored.outline, outline);
  assert.equal(restored.affinity, engine.affinity);
  assert.deepEqual(restored.clues, engine.clues);
  assert.deepEqual(restored.log, engine.log);
  assert.deepEqual(restored.currentChoices, engine.currentChoices);
  assert.equal("isEnding" in snapshot, false);
  assert.equal("isEnding" in restored, false);
});

test("fromSnapshot falls back to the snapshot's own apiKey/model when none given", () => {
  const restored = GameEngine.fromSnapshot({
    apiKey: "stored-key",
    model: "stored-model",
    outline,
    contents: [],
    storySummary: "",
    affinity: 50,
    clues: [],
    log: [],
    currentChoices: []
  });
  assert.equal(restored.apiKey, "stored-key");
  assert.equal(restored.model, "stored-model");
});

test("fromSnapshot ignores a legacy ending flag and restores a continuation", () => {
  const restored = GameEngine.fromSnapshot({
    apiKey: "stored-key",
    model: "stored-model",
    outline,
    contents: [],
    storySummary: "",
    affinity: 50,
    clues: [],
    log: [{ type: "narrative", text: "早期劇情" }],
    currentChoices: [],
    isEnding: true
  });

  assert.equal("isEnding" in restored, false);
  assert.deepEqual(restored.currentChoices, [STORY_CONTINUATION.fallbackChoice]);
});
