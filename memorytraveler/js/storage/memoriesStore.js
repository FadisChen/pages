import { readJson, writeJson, removeKey } from "./localJson.js";
import { STORAGE_KEYS } from "../core/constants.js";

export function loadMemories() {
  const raw = readJson(STORAGE_KEYS.memories, []);
  return Array.isArray(raw) ? raw : [];
}

export function appendMemory(record) {
  const memories = loadMemories();
  memories.unshift(record);
  writeJson(STORAGE_KEYS.memories, memories);
  return memories;
}

export function clearMemories() {
  removeKey(STORAGE_KEYS.memories);
}
