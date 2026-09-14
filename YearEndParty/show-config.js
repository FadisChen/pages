import { DEFAULT_USER_SYSTEM_PROMPT } from "./host-config.js";

const SHOW_CONFIG_SCHEMA_VERSION = 1;
const SEGMENT_ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
const MAX_LABEL_LENGTH = 80;
const MAX_CONTEXT_LENGTH = 2000;

// This fallback keeps the pages usable when the JSON file is unavailable (for
// example when a page is opened from file://). The deployed JSON remains the
// editable source of activity content.
const FALLBACK_SHOW_CONFIG = {
  schemaVersion: SHOW_CONFIG_SCHEMA_VERSION,
  host: { userSystemPrompt: DEFAULT_USER_SYSTEM_PROMPT },
  segments: [
    { id: "opening", label: "開場", context: "[環節切換] 現在進入「開場」。請歡迎大家、簡短介紹今天主持人與活動亮點，帶動期待感。" },
    { id: "vp_speech", label: "副總致詞", context: "[環節切換] 現在進入「副總致詞」。請用熱情但得體的語氣，邀請 James 副總上台致詞，簡短歡迎即可，致詞內容交給他本人，不要代為發言。" },
    { id: "manager_speech", label: "部門主管致詞", context: "[環節切換] 現在進入「部門主管致詞」。請邀請 Jerry 處長上台致詞，語氣保持熱情尊重，簡短歡迎即可，致詞內容交給他本人，不要代為發言。" },
    { id: "meal", label: "用餐", context: "[環節切換] 現在進入「用餐」。請提醒大家開動享用美食，並提一下待會後段還有金色三麥最具特色的啤酒可以享用，帶動期待感。" },
    { id: "game", label: "小遊戲", context: "[環節切換] 現在進入「小遊戲：123木頭人」。請邀請大家拿出手機掃描 QRCode 加入遊戲，並提醒大家仔細聆聽遊戲規則，說明前三名抵達終點的人會有獎賞。" },
    { id: "outstanding_employee", label: "部門優良員工", context: "[環節切換] 現在進入「部門優良員工」表揚。請用真誠的語氣帶出這個環節的意義；得獎名單會由工作人員另外用文字告訴你，收到後再逐一唸名字恭喜對方。" },
    { id: "lucky_draw", label: "抽獎", context: "[環節切換] 現在進入「抽獎」。請營造懸念、公布獎項亮點；得獎名單會由工作人員另外用文字告訴你，收到後再唸名字恭喜對方。" },
    { id: "closing", label: "尾聲", context: "[環節切換] 現在進入「尾聲」。請感謝大家參與、溫馨收尾，預告活動即將結束。" },
  ],
};

function cloneConfig(config) {
  return {
    schemaVersion: config.schemaVersion,
    host: { userSystemPrompt: config.host.userSystemPrompt },
    segments: config.segments.map((segment) => ({ ...segment })),
  };
}

function normalizeShowConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("活動設定必須是 JSON 物件。");
  if (raw.schemaVersion !== SHOW_CONFIG_SCHEMA_VERSION) throw new Error(`不支援的活動設定版本：${raw.schemaVersion}`);
  const hostPrompt = String(raw.host?.userSystemPrompt || "").trim() || DEFAULT_USER_SYSTEM_PROMPT;
  if (hostPrompt.length > MAX_CONTEXT_LENGTH) throw new Error("主持人設定文字過長。");
  if (!Array.isArray(raw.segments) || raw.segments.length === 0) throw new Error("至少需要一個活動環節。");

  const ids = new Set();
  const segments = raw.segments.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 個環節格式錯誤。`);
    const id = String(item.id || "").trim();
    const label = String(item.label || "").trim();
    const context = String(item.context || "").trim();
    if (!SEGMENT_ID_PATTERN.test(id)) throw new Error(`環節 ${index + 1} 的 id 格式錯誤。`);
    if (ids.has(id)) throw new Error(`環節 id 重複：${id}`);
    if (!label || label.length > MAX_LABEL_LENGTH) throw new Error(`環節 ${id} 的標題無效。`);
    if (!context || context.length > MAX_CONTEXT_LENGTH) throw new Error(`環節 ${id} 的提示文字無效。`);
    ids.add(id);
    return { id, label, context };
  });
  return { schemaVersion: SHOW_CONFIG_SCHEMA_VERSION, host: { userSystemPrompt: hostPrompt }, segments };
}

function resolveSegment(config, id) {
  const normalizedId = String(id || "").trim();
  return config?.segments?.find((segment) => segment.id === normalizedId) || null;
}

async function loadShowConfig({ fetchImpl = globalThis.fetch, url = "./config/show-config.json", onError } = {}) {
  const fallback = normalizeShowConfig(FALLBACK_SHOW_CONFIG);
  try {
    if (typeof fetchImpl !== "function") throw new Error("目前環境不支援載入活動設定檔。");
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response?.ok) throw new Error(`活動設定檔載入失敗（HTTP ${response?.status || "unknown"}）。`);
    return normalizeShowConfig(await response.json());
  } catch (error) {
    onError?.(error);
    return cloneConfig(fallback);
  }
}

const DEFAULT_SHOW_CONFIG = Object.freeze(normalizeShowConfig(FALLBACK_SHOW_CONFIG));

export { DEFAULT_SHOW_CONFIG, SHOW_CONFIG_SCHEMA_VERSION, loadShowConfig, normalizeShowConfig, resolveSegment };
