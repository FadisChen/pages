// Thin, defensive wrapper around localStorage: never throw on a blocked or
// full storage (private browsing, quota exceeded, disabled storage). Reads
// `globalThis.localStorage` lazily (not `window.localStorage`) so this stays
// unit-testable under Node by swapping in a fake storage object.
export function readJson(key, fallback) {
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] failed to read "${key}":`, err);
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[storage] failed to write "${key}":`, err);
    return false;
  }
}

export function removeKey(key) {
  try {
    globalThis.localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] failed to remove "${key}":`, err);
  }
}
