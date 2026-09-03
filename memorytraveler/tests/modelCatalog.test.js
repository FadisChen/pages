import test from "node:test";
import assert from "node:assert/strict";
import { toSelectableModels } from "../js/gemini/modelCatalog.js";

test("keeps only models supporting generateContent and strips the models/ prefix", () => {
  const raw = [
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1000000 },
    { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent", "countTokens"] }
  ];
  const result = toSelectableModels(raw);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((m) => m.id),
    ["gemini-2.5-flash", "gemini-2.5-pro"]
  );
  assert.equal(result[0].inputTokenLimit, 1000000);
});

test("sorts alphabetically by id", () => {
  const raw = [
    { name: "models/gemini-z", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] }
  ];
  const result = toSelectableModels(raw);
  assert.deepEqual(result.map((m) => m.id), ["gemini-a", "gemini-z"]);
});

test("returns an empty array when nothing supports generateContent", () => {
  const raw = [{ name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }];
  assert.deepEqual(toSelectableModels(raw), []);
});
