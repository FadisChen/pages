// Gemini's responseSchema constrains the *shape* Gemini aims for, but the
// model can still occasionally omit an optional field or send an odd type.
// These validators normalize/parse the raw JSON text defensively rather than
// trusting it blindly, since one malformed turn shouldn't crash the game.

export function parseTurnResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("劇情回傳無法解析為 JSON");
  }
  if (!parsed || typeof parsed.narrative !== "string" || !parsed.narrative.trim()) {
    throw new Error("劇情回傳缺少必要欄位（narrative）");
  }
  if (!Array.isArray(parsed.choices)) {
    throw new Error("劇情回傳缺少必要欄位（choices）");
  }
  return {
    narrative: parsed.narrative,
    friendLine: typeof parsed.friendLine === "string" ? parsed.friendLine : "",
    choices: parsed.choices.filter((c) => typeof c === "string" && c.trim()),
    affinityDelta: Number.isFinite(parsed.affinityDelta) ? Math.trunc(parsed.affinityDelta) : 0,
    newClues: Array.isArray(parsed.newClues) ? parsed.newClues.filter((c) => typeof c === "string" && c.trim()) : []
  };
}

export function parseOutlineResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("隨機大綱回傳無法解析為 JSON");
  }

  const requiredFields = ["title", "outline", "friendName", "friendPersona"];
  const missingField = requiredFields.find((field) => typeof parsed?.[field] !== "string" || !parsed[field].trim());
  if (missingField) {
    throw new Error(`隨機大綱回傳缺少必要欄位（${missingField}）`);
  }
  return {
    title: parsed.title.trim(),
    outline: parsed.outline.trim(),
    friendName: parsed.friendName.trim(),
    friendPersona: parsed.friendPersona.trim()
  };
}

export function parseSummaryResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("摘要回傳無法解析為 JSON");
  }
  if (!parsed || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
    throw new Error("摘要回傳缺少必要欄位（summary）");
  }
  if (!Array.isArray(parsed.highlights)) {
    throw new Error("摘要回傳缺少必要欄位（highlights）");
  }
  return {
    title: typeof parsed.title === "string" ? parsed.title : "",
    summary: parsed.summary,
    highlights: parsed.highlights.filter((h) => typeof h === "string" && h.trim()),
    endingType: typeof parsed.endingType === "string" ? parsed.endingType : ""
  };
}
