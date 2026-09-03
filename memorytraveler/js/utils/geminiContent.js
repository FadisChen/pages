// Helpers for working with Gemini's `contents` array shape:
// [{ role: 'user' | 'model', parts: [{ text: string }] }]

export function userContent(text) {
  return { role: "user", parts: [{ text }] };
}

export function modelContent(text) {
  return { role: "model", parts: [{ text }] };
}

export function contentsCharCount(contents) {
  return contents.reduce((sum, c) => {
    return sum + c.parts.reduce((s, p) => s + (p.text ? p.text.length : 0), 0);
  }, 0);
}

export function contentsToPlainText(contents) {
  return contents
    .map((c) => {
      const role = c.role === "user" ? "玩家" : "劇情";
      const text = c.parts.map((p) => p.text || "").join("");
      return `${role}：${text}`;
    })
    .join("\n");
}

export function extractResponseText(apiResponse) {
  const parts = apiResponse?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("Gemini 回應格式不符預期");
  }
  return parts.map((p) => p.text || "").join("");
}
