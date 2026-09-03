import { readJson, writeJson } from "./localJson.js";
import { DEFAULT_GENDER, STORAGE_KEYS, TONE_OPTIONS, normalizeGender } from "../core/constants.js";

const EMPTY = Object.freeze({
  title: "",
  outline: "",
  friendName: "小海",
  friendPersona: "",
  playerName: "",
  tone: TONE_OPTIONS[2],
  playerGender: DEFAULT_GENDER,
  friendGender: DEFAULT_GENDER
});

export function loadOutline() {
  const raw = readJson(STORAGE_KEYS.outline, EMPTY);
  return {
    title: raw.title || "",
    outline: raw.outline || "",
    friendName: raw.friendName || "小海",
    friendPersona: raw.friendPersona || "",
    playerName: raw.playerName || "",
    tone: raw.tone || TONE_OPTIONS[2],
    playerGender: normalizeGender(raw.playerGender),
    friendGender: normalizeGender(raw.friendGender)
  };
}

export function saveOutline(outline) {
  writeJson(STORAGE_KEYS.outline, outline);
}
