import test from "node:test";
import assert from "node:assert/strict";
import { parseTurnResponse, parseOutlineResponse, parseSummaryResponse } from "../js/gemini/responseValidators.js";

test("parseTurnResponse accepts a well-formed payload", () => {
  const turn = parseTurnResponse(
    JSON.stringify({
      narrative: "你走進森林。",
      friendLine: "小心點！",
      choices: ["往左", "往右"],
      isEnding: true,
      affinityDelta: 5,
      newClues: ["地圖：似乎有用"]
    })
  );
  assert.equal(turn.narrative, "你走進森林。");
  assert.equal(turn.affinityDelta, 5);
  assert.deepEqual(turn.newClues, ["地圖：似乎有用"]);
  assert.equal("isEnding" in turn, false);
});

test("parseTurnResponse defaults missing optional fields", () => {
  const turn = parseTurnResponse(JSON.stringify({ narrative: "劇情", choices: [] }));
  assert.equal(turn.friendLine, "");
  assert.equal(turn.affinityDelta, 0);
  assert.deepEqual(turn.newClues, []);
});

test("parseTurnResponse truncates a non-integer affinityDelta", () => {
  const turn = parseTurnResponse(JSON.stringify({ narrative: "劇情", choices: [], affinityDelta: 3.7 }));
  assert.equal(turn.affinityDelta, 3);
});

test("parseTurnResponse rejects invalid JSON", () => {
  assert.throws(() => parseTurnResponse("not json"), /無法解析/);
});

test("parseTurnResponse rejects missing narrative", () => {
  assert.throws(() => parseTurnResponse(JSON.stringify({ choices: [] })), /narrative/);
});

test("parseTurnResponse rejects missing choices", () => {
  assert.throws(() => parseTurnResponse(JSON.stringify({ narrative: "x" })), /choices/);
});

test("parseOutlineResponse accepts a complete random outline", () => {
  const outline = parseOutlineResponse(
    JSON.stringify({
      title: "月影郵局",
      outline: "一名旅人在山城郵局收到一封來自未來的信，必須在月蝕前找出寄信人。",
      friendName: "澪",
      friendPersona: "敏銳、冷靜，習慣把重要線索藏在玩笑裡。",
    })
  );
  assert.equal(outline.title, "月影郵局");
  assert.equal(outline.friendName, "澪");
});

test("parseOutlineResponse rejects missing fields", () => {
  assert.throws(
    () => parseOutlineResponse(JSON.stringify({ title: "月影郵局", outline: "故事", friendName: "澪" })),
    /friendPersona/
  );
  assert.throws(
    () => parseOutlineResponse(JSON.stringify({ title: "", outline: "故事", friendName: "澪", friendPersona: "敏銳" })),
    /title/
  );
});

test("parseSummaryResponse accepts a well-formed payload", () => {
  const summary = parseSummaryResponse(
    JSON.stringify({
      title: "回憶",
      summary: "一段旅程",
      highlights: ["發現地圖", "解謎"],
      endingType: "圓滿結局"
    })
  );
  assert.equal(summary.endingType, "圓滿結局");
  assert.equal(summary.highlights.length, 2);
});

test("parseSummaryResponse rejects invalid JSON", () => {
  assert.throws(() => parseSummaryResponse("{broken"), /無法解析/);
});

test("parseSummaryResponse rejects missing summary", () => {
  assert.throws(() => parseSummaryResponse(JSON.stringify({ highlights: [] })), /summary/);
});
