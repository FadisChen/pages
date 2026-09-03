import test from "node:test";
import assert from "node:assert/strict";
import {
  userContent,
  modelContent,
  contentsCharCount,
  contentsToPlainText,
  extractResponseText
} from "../js/utils/geminiContent.js";

test("userContent/modelContent build the expected shape", () => {
  assert.deepEqual(userContent("hi"), { role: "user", parts: [{ text: "hi" }] });
  assert.deepEqual(modelContent("yo"), { role: "model", parts: [{ text: "yo" }] });
});

test("contentsCharCount sums text length across all parts", () => {
  const contents = [userContent("abc"), modelContent("de")];
  assert.equal(contentsCharCount(contents), 5);
});

test("contentsToPlainText labels user/model turns in Chinese", () => {
  const contents = [userContent("你好"), modelContent("嗨")];
  assert.equal(contentsToPlainText(contents), "玩家：你好\n劇情：嗨");
});

test("extractResponseText pulls and joins all text parts", () => {
  const resp = { candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] };
  assert.equal(extractResponseText(resp), "ab");
});

test("extractResponseText throws on an unexpected shape", () => {
  assert.throws(() => extractResponseText({}), /Gemini 回應格式不符預期/);
  assert.throws(() => extractResponseText({ candidates: [] }), /Gemini 回應格式不符預期/);
});
