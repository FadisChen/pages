import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SHOW_CONFIG, loadShowConfig, normalizeShowConfig, resolveSegment } from "../show-config.js";

const jsonConfig = JSON.parse(readFileSync(new URL("../config/show-config.json", import.meta.url), "utf8"));

test("deployed show JSON is valid and contains the built-in rundown", () => {
  const config = normalizeShowConfig(jsonConfig);
  assert.deepEqual(config, DEFAULT_SHOW_CONFIG);
  assert.equal(config.segments.length, 8);
  assert.equal(resolveSegment(config, "lucky_draw")?.label, "抽獎");
});

test("invalid show content is rejected before it reaches the runtime", () => {
  assert.throws(() => normalizeShowConfig({ schemaVersion: 1, segments: [{ id: "opening", label: "開場", context: "x" }, { id: "opening", label: "重複", context: "x" }] }), /重複/);
  assert.throws(() => normalizeShowConfig({ schemaVersion: 1, segments: [{ id: "bad id", label: "開場", context: "x" }] }), /格式錯誤/);
  assert.throws(() => normalizeShowConfig({ schemaVersion: 2, segments: [{ id: "opening", label: "開場", context: "x" }] }), /不支援/);
});

test("loader uses valid JSON and falls back without throwing", async () => {
  const loaded = await loadShowConfig({ fetchImpl: async () => ({ ok: true, json: async () => jsonConfig }) });
  assert.deepEqual(loaded, DEFAULT_SHOW_CONFIG);

  let error;
  const fallback = await loadShowConfig({ fetchImpl: async () => ({ ok: false, status: 503 }), onError: value => { error = value; } });
  assert.ok(error instanceof Error);
  assert.deepEqual(fallback, DEFAULT_SHOW_CONFIG);
});
