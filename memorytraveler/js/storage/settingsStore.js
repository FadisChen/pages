import { readJson, writeJson, removeKey } from "./localJson.js";
import { DEFAULT_GENDER, STORAGE_KEYS, normalizeGender } from "../core/constants.js";

const EMPTY = Object.freeze({
  apiKey: "",
  model: "",
  playerGender: DEFAULT_GENDER,
  friendGender: DEFAULT_GENDER
});

export function loadSettings() {
  const raw = readJson(STORAGE_KEYS.settings, EMPTY);
  return {
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" ? raw.model : "",
    playerGender: normalizeGender(raw.playerGender),
    friendGender: normalizeGender(raw.friendGender)
  };
}

export function saveSettings(settings) {
  writeJson(STORAGE_KEYS.settings, {
    apiKey: settings.apiKey || "",
    model: settings.model || "",
    playerGender: normalizeGender(settings.playerGender),
    friendGender: normalizeGender(settings.friendGender)
  });
}

export function clearSettings() {
  removeKey(STORAGE_KEYS.settings);
}
