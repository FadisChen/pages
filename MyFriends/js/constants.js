export const LIVE_MODEL_OPTIONS = Object.freeze([
  Object.freeze({
    id: "gemini-3.1-flash-live-preview",
    label: "3.1（同步工具呼叫）",
    asyncToolCalling: false,
  }),
  Object.freeze({
    id: "gemini-2.5-flash-native-audio-preview-12-2025",
    label: "2.5（非同步工具呼叫）",
    asyncToolCalling: true,
  }),
]);

export const DEFAULT_LIVE_MODEL = LIVE_MODEL_OPTIONS[0].id;

export function getLiveModelOption(id) {
  return LIVE_MODEL_OPTIONS.find((option) => option.id === id) || LIVE_MODEL_OPTIONS[0];
}

export const LIVE_THINKING_OPTIONS = Object.freeze([
  Object.freeze({ id: "", label: "自動", thinkingBudget: null }),
  Object.freeze({ id: "MINIMAL", label: "Minimal", thinkingBudget: 512 }),
  Object.freeze({ id: "LOW", label: "Low", thinkingBudget: 1024 }),
  Object.freeze({ id: "MEDIUM", label: "Medium", thinkingBudget: 4096 }),
  Object.freeze({ id: "HIGH", label: "High", thinkingBudget: 8192 }),
]);

export function getLiveThinkingOption(id) {
  const normalized = String(id || "").trim().toUpperCase();
  // 舊版曾提供 OFF；3.1 Live 沒有 off level，載入角色時遷移到最接近的 Minimal。
  if (normalized === "OFF") return LIVE_THINKING_OPTIONS[1];
  return LIVE_THINKING_OPTIONS.find((option) => option.id === normalized) || LIVE_THINKING_OPTIONS[0];
}

export function describeLiveThinking(modelId, thinkingId) {
  const model = getLiveModelOption(modelId);
  const thinking = getLiveThinkingOption(thinkingId);
  if (!thinking.id) {
    return model.asyncToolCalling
      ? "2.5 使用 dynamic thinking，由模型自動調整思考量。"
      : "3.1 使用 Live API 預設的 Minimal 思考強度。";
  }
  return model.asyncToolCalling
    ? `2.5 thinkingBudget：${thinking.thinkingBudget.toLocaleString()} tokens`
    : `3.1 thinkingLevel：${thinking.id.toLowerCase()}`;
}
