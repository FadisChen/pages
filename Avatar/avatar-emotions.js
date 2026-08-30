const AVATAR_EMOTIONS = Object.freeze([
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
]);

const AVATAR_EMOTION_TOOL = Object.freeze({
  name: "set_avatar_emotion",
  description: "只有在回覆需要明顯表情或情緒轉折時，為 Nami 選擇一個表情。每個回覆最多呼叫一次；不需要時不要呼叫；不要用它控制身體動作、嘴型、呼吸或連續動畫。",
  parameters: Object.freeze({
    type: "OBJECT",
    properties: Object.freeze({
      emotion: Object.freeze({
        type: "STRING",
        enum: AVATAR_EMOTIONS,
        description: "回覆的主要表情。",
      }),
    }),
    required: ["emotion"],
  }),
});

function normalizeAvatarEmotion(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "set_avatar_emotion 需要 object 參數。" };
  }
  if (!AVATAR_EMOTIONS.includes(args.emotion)) {
    return { ok: false, error: `不支援的 emotion：${String(args.emotion ?? "")}。` };
  }
  return { ok: true, emotion: args.emotion };
}

function createAvatarToolResponse(call, result) {
  const functionResponse = {
    id: call?.id || "",
    name: call?.name || AVATAR_EMOTION_TOOL.name,
    response: result?.ok
      ? { result: "applied" }
      : { error: result?.error || "set_avatar_emotion 參數無效。" },
  };
  return { toolResponse: { functionResponses: [functionResponse] } };
}

export {
  AVATAR_EMOTION_TOOL,
  AVATAR_EMOTIONS,
  createAvatarToolResponse,
  normalizeAvatarEmotion,
};
