export const STORAGE_KEYS = Object.freeze({
  settings: "storygame.settings.v1",
  outline: "storygame.outline.v1",
  memories: "storygame.memories.v1",
  session: "storygame.session.v1"
});

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export const AFFINITY = Object.freeze({
  min: 0,
  max: 100,
  default: 50
});

export const ENDING_TYPES = Object.freeze([
  { id: "圓滿結局", emoji: "🌟" },
  { id: "溫馨結局", emoji: "💗" },
  { id: "遺憾結局", emoji: "🌧" },
  { id: "驚奇結局", emoji: "✨" },
  { id: "懸疑未解結局", emoji: "❓" },
  { id: "悲劇結局", emoji: "🖤" }
]);

export const TONE_OPTIONS = Object.freeze([
  "溫馨日常",
  "懸疑推理",
  "奇幻冒險",
  "輕鬆幽默",
  "驚悚恐怖",
  "浪漫愛情"
]);

export const DEFAULT_GENDER = "unspecified";

export const GENDER_OPTIONS = Object.freeze([
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "nonbinary", label: "非二元" },
  { value: DEFAULT_GENDER, label: "不指定" }
]);

export function normalizeGender(value) {
  return GENDER_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_GENDER;
}

export function genderLabel(value) {
  return GENDER_OPTIONS.find((option) => option.value === normalizeGender(value)).label;
}

export const STORY_CONTINUATION = Object.freeze({
  fallbackChoice: "繼續探索目前情境"
});

// Gemini's generateContent call is stateless: it never trims or summarizes
// context on its own. These thresholds normally bound how large the raw
// history we send is allowed to grow before we fold older turns into a rolling
// prose summary (see js/gemini/contextManager.js). A failed summary never
// discards raw history; the next turn retries instead.
export const COMPACTION = Object.freeze({
  turnThreshold: 24,    // contents entries (user+model), i.e. 12 exchanges
  charThreshold: 12000, // safety net for models with small context windows
  keepRaw: 10           // entries kept raw after compaction (5 exchanges)
});

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const TURN_SCHEMA = Object.freeze({
  type: "OBJECT",
  properties: {
    narrative: { type: "STRING" },
    friendLine: { type: "STRING" },
    choices: { type: "ARRAY", items: { type: "STRING" } },
    affinityDelta: { type: "INTEGER" },
    newClues: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["narrative", "choices"]
});

export function buildOutlineSchema() {
  return {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      outline: { type: "STRING" },
      friendName: { type: "STRING" },
      friendPersona: { type: "STRING" }
    },
    required: ["title", "outline", "friendName", "friendPersona"]
  };
}

export function buildSummarySchema() {
  return {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      summary: { type: "STRING" },
      highlights: { type: "ARRAY", items: { type: "STRING" } },
      endingType: {
        type: "STRING",
        enum: ENDING_TYPES.map((e) => e.id)
      }
    },
    required: ["summary", "highlights", "endingType"]
  };
}
