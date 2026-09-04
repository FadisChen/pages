export const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
export const DEFAULT_OPTIMIZER_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_VOICE = "Kore";

export const TTS_MODELS = {
  "gemini-3.1-flash-tts-preview": {
    label: "Gemini 3.1 Flash TTS",
    shortLabel: "3.1 Flash TTS",
    badge: "低延遲 · 可串流",
    help: "較新的語音模型，支援串流試聽、雙人對話與音訊標記。",
    supportsMultiSpeaker: true,
    supportsStreaming: true,
    supportsAudioTags: true,
  },
  "gemini-2.5-flash-preview-tts": {
    label: "Gemini 2.5 Flash TTS",
    shortLabel: "2.5 Flash TTS",
    badge: "穩定生成",
    help: "價格效能平衡的語音模型，完成生成後播放，不提供串流選項。",
    supportsMultiSpeaker: true,
    supportsStreaming: false,
    supportsAudioTags: false,
  },
};

export const VOICES = [
  ["Zephyr", "明亮 Bright"],
  ["Puck", "活潑 Upbeat"],
  ["Charon", "資訊感 Informative"],
  ["Kore", "沉穩 Firm"],
  ["Fenrir", "興奮 Excited"],
  ["Leda", "年輕 Youthful"],
  ["Orus", "堅定 Firm"],
  ["Aoede", "輕快 Breezy"],
  ["Callirrhoe", "自在 Easy-going"],
  ["Autonoe", "明亮 Bright"],
  ["Enceladus", "氣音 Breathy"],
  ["Iapetus", "清晰 Clear"],
  ["Umbriel", "自在 Easy-going"],
  ["Algieba", "柔順 Smooth"],
  ["Despina", "柔順 Smooth"],
  ["Erinome", "清晰 Clear"],
  ["Algenib", "沙啞 Gravelly"],
  ["Rasalgethi", "資訊感 Informative"],
  ["Laomedeia", "活潑 Upbeat"],
  ["Achernar", "柔和 Soft"],
  ["Alnilam", "堅定 Firm"],
  ["Schedar", "平穩 Even"],
  ["Gacrux", "成熟 Mature"],
  ["Pulcherrima", "向前 Forward"],
  ["Achird", "友善 Friendly"],
  ["Zubenelgenubi", "隨和 Casual"],
  ["Vindemiatrix", "溫和 Gentle"],
  ["Sadachbia", "有活力 Lively"],
  ["Sadaltager", "知性 Knowledgeable"],
  ["Sulafat", "溫暖 Warm"],
].map(([value, style]) => ({ value, style }));

export const AUDIO_TAGS = [
  "[whispers]",
  "[laughs]",
  "[sighs]",
  "[gasp]",
  "[excited]",
  "[serious]",
  "[tired]",
  "[shouting]",
];

export const CONTENT_TYPES = [
  ["narration", "旁白／解說"],
  ["tutorial", "教學／教案"],
  ["podcast", "Podcast／節目"],
  ["commercial", "廣告／宣傳"],
  ["dialogue", "對話／劇本"],
];

