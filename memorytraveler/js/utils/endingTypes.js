import { ENDING_TYPES } from "../core/constants.js";

export function findEndingTypeMeta(id) {
  const found = ENDING_TYPES.find((e) => e.id === id);
  return found || { id: id || "未知結局", emoji: "📖" };
}

export function isUnlocked(memories, endingTypeId) {
  return memories.some((m) => m.endingType === endingTypeId);
}
