// Gemini Live transcription may return simplified Chinese. This compact local
// fallback keeps common UI/conversation terms in Traditional Chinese without a
// runtime dependency. The model prompt also explicitly requests Traditional Chinese.
const COMMON_MAP = Object.freeze({
  台: "臺", 后: "後", 里: "裡", 这: "這", 个: "個", 们: "們", 你: "你", 说: "說", 话: "話",
  吗: "嗎", 过: "過", 来: "來", 对: "對", 时: "時", 间: "間", 现: "現", 在: "在", 会: "會", 发: "發",
  觉: "覺", 让: "讓", 关: "關", 于: "於", 与: "與", 为: "為", 还: "還", 这: "這", 么: "麼", 见: "見",
  开: "開", 听: "聽", 语: "語", 音: "音", 体: "體", 验: "驗", 轻: "輕", 松: "鬆", 爱: "愛", 头: "頭",
});

export function toTraditionalChinese(text) {
  return String(text ?? "").replace(/[\u4e00-\u9fff]/g, (character) => COMMON_MAP[character] || character);
}
