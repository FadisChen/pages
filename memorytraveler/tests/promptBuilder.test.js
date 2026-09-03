import test from "node:test";
import assert from "node:assert/strict";
import { buildRandomOutlinePrompt, buildSystemInstruction, buildCompactionPrompt, buildSummaryPrompt } from "../js/gemini/promptBuilder.js";
import { userContent, modelContent } from "../js/utils/geminiContent.js";

const outline = {
  title: "霧港的最後一班船",
  outline: "轉學生捲入都市傳說",
  friendName: "小海",
  friendPersona: "樂觀開朗",
  playerName: "旅人",
  tone: "奇幻冒險",
  playerGender: "female",
  friendGender: "female"
};

test("buildSystemInstruction includes outline, friend, affinity and clue rules", () => {
  const text = buildSystemInstruction(outline, 65, ["生鏽鑰匙：似乎能打開閣樓"]);
  assert.match(text, /轉學生捲入都市傳說/);
  assert.match(text, /小海/);
  assert.match(text, /65\/100/);
  assert.match(text, /生鏽鑰匙：似乎能打開閣樓/);
  assert.match(text, /玩家性別設定為「女性」/);
  assert.match(text, /同性別/);
  assert.match(text, /自訂行動/);
  assert.match(text, /affinityDelta/);
  assert.match(text, /newClues/);
});

test("buildRandomOutlinePrompt uses the selected tone as its creative axis", () => {
  const prompt = buildRandomOutlinePrompt("溫馨日常", "以一間深夜書店作為故事核心", {
    playerGender: "male",
    friendGender: "male"
  });
  assert.match(prompt, /唯一的故事風格／語氣主軸是「溫馨日常」/);
  assert.match(prompt, /深夜書店/);
  assert.match(prompt, /同性別/);
  assert.match(prompt, /長期發展/);
  assert.match(prompt, /title、outline、friendName、friendPersona/);
});

test("buildRandomOutlinePrompt keeps unspecified gender flexible", () => {
  const prompt = buildRandomOutlinePrompt("懸疑推理", "", {
    playerGender: "unspecified",
    friendGender: "female"
  });
  assert.match(prompt, /不指定/);
  assert.match(prompt, /保留生成彈性/);
  assert.doesNotMatch(prompt, /兩位角色的性別設定相同/);
});

test("buildRandomOutlinePrompt keeps explicitly different genders", () => {
  const prompt = buildRandomOutlinePrompt("溫馨日常", "", {
    playerGender: "male",
    friendGender: "female"
  });
  assert.match(prompt, /性別設定不同/);
  assert.doesNotMatch(prompt, /生成同性別/);
});

test("buildSystemInstruction states no clues yet when the list is empty", () => {
  const text = buildSystemInstruction(outline, 50, []);
  assert.match(text, /尚未取得任何物品或線索/);
});

test("buildSystemInstruction keeps the story open indefinitely", () => {
  const text = buildSystemInstruction(outline, 50, [], 30);
  assert.match(text, /第 30 個劇情回合/);
  assert.match(text, /沒有預設最長回合數/);
  assert.match(text, /不要自行結束故事/);
  assert.doesNotMatch(text, /isEnding/);
  assert.doesNotMatch(text, /收束主要衝突/);
});

test("buildCompactionPrompt includes prior summary and the plain-text transcript", () => {
  const older = [userContent("玩家選擇：往左"), modelContent("你走進了森林。")];
  const prompt = buildCompactionPrompt(older, "先前摘要文字", {
    outline,
    affinity: 65,
    clues: ["生鏽鑰匙"]
  });
  assert.match(prompt, /先前摘要文字/);
  assert.match(prompt, /玩家：玩家選擇：往左/);
  assert.match(prompt, /濃縮成一段/);
  assert.match(prompt, /固定故事與角色設定/);
  assert.match(prompt, /樂觀開朗/);
  assert.match(prompt, /性別：女性/);
  assert.match(prompt, /生鏽鑰匙/);
  assert.match(prompt, /不要自行解決伏筆或結束故事/);
});

test("buildCompactionPrompt omits the summary section when there is none yet", () => {
  const prompt = buildCompactionPrompt([userContent("x")], "");
  assert.doesNotMatch(prompt, /既有摘要/);
});

test("buildSummaryPrompt includes affinity, clues, and all ending type options", () => {
  const prompt = buildSummaryPrompt({
    outline,
    storySummary: "",
    contents: [userContent("玩家選擇：往左")],
    affinity: 80,
    clues: ["地圖"]
  });
  assert.match(prompt, /80\/100/);
  assert.match(prompt, /地圖/);
  assert.match(prompt, /圓滿結局/);
  assert.match(prompt, /悲劇結局/);
});

test("buildSummaryPrompt reports 'no clues' when the list is empty", () => {
  const prompt = buildSummaryPrompt({ outline, storySummary: "", contents: [], affinity: 50, clues: [] });
  assert.match(prompt, /已收集的物品／線索：無/);
});
