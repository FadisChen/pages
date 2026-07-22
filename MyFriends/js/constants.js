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
