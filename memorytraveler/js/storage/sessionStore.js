// Persists the in-progress game session so a reload / accidental tab close
// doesn't lose a playthrough. Distinct from memoriesStore, which only
// records a *completed* game's final summary.
import { readJson, writeJson, removeKey } from "./localJson.js";
import { STORAGE_KEYS } from "../core/constants.js";

export function loadSession() {
  return readJson(STORAGE_KEYS.session, null);
}

export function saveSession(session) {
  writeJson(STORAGE_KEYS.session, session);
}

export function clearSession() {
  removeKey(STORAGE_KEYS.session);
}
