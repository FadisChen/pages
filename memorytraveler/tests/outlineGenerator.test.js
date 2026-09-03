import test from "node:test";
import assert from "node:assert/strict";
import { generateRandomOutline } from "../js/gemini/outlineGenerator.js";

function respondWith(payload) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] };
}

test("generateRandomOutline requests structured output and parses the result", async () => {
  let capturedBody = null;
  const generated = await generateRandomOutline("key", "model", "懸疑推理", {
    playerGender: "male",
    friendGender: "male",
    generateContentFn: async (apiKey, model, body) => {
      capturedBody = { apiKey, model, body };
      return respondWith({
        title: "星砂旅店",
        outline: "旅人入住一間只在流星雨夜晚出現的旅店。",
        friendName: "夏芽",
        friendPersona: "好奇直率，總能從細節發現異常。"
      });
    }
  });

  assert.equal(capturedBody.apiKey, "key");
  assert.equal(capturedBody.model, "model");
  assert.equal(capturedBody.body.generationConfig.responseMimeType, "application/json");
  assert.equal(capturedBody.body.generationConfig.temperature, 1.3);
  assert.deepEqual(capturedBody.body.generationConfig.responseSchema.required, ["title", "outline", "friendName", "friendPersona"]);
  assert.match(capturedBody.body.contents[0].parts[0].text, /懸疑推理/);
  assert.match(capturedBody.body.contents[0].parts[0].text, /同性別/);
  assert.deepEqual(generated, {
    title: "星砂旅店",
    outline: "旅人入住一間只在流星雨夜晚出現的旅店。",
    friendName: "夏芽",
    friendPersona: "好奇直率，總能從細節發現異常。"
  });
});
