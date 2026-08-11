import { createDefaultCharacters, defaultCharacter, VOICES } from './personas.js';
import { DEFAULT_LIVE_MODEL, DEFAULT_MEMORY_MODEL, normalizeModelName } from './models.js';

const LEGACY_DEFAULT_MEMORY_MODEL = 'gemini-3.5-flash-lite';
const SETTINGS_VERSION = 2;

export const STORAGE_KEYS = Object.freeze({
  settings: 'myfriends.bartender.settings.v1',
  cozy: 'myfriends.bartender.save.cozy.v1',
  story: 'myfriends.bartender.save.story.v1',
  apiSession: 'myfriends.bartender.geminiKey.session',
  apiLocal: 'myfriends.bartender.geminiKey',
});

export const DEFAULT_SETTINGS = Object.freeze({
  playerName: '酒保',
  inputMode: 'voice',
  captionsVisible: true,
  rememberApiKey: false,
  liveModelName: DEFAULT_LIVE_MODEL,
  memoryModelName: DEFAULT_MEMORY_MODEL,
});

export function loadSettings() {
  const value = parse(localStorage.getItem(STORAGE_KEYS.settings));
  return cleanSettings(value, true);
}

export function saveSettings(value) {
  const clean = cleanSettings(value);
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(clean));
  return clean;
}

export function loadSave(mode) {
  const normalized = mode === 'story' ? 'story' : 'cozy';
  return cleanSave(parse(localStorage.getItem(STORAGE_KEYS[normalized])), normalized);
}

export function saveMode(value) {
  const clean = cleanSave(value, value?.mode === 'story' ? 'story' : 'cozy');
  localStorage.setItem(STORAGE_KEYS[clean.mode], JSON.stringify(clean));
  return clean;
}

export function resetCharacter(save, characterId) {
  const replacement = defaultCharacter(save.mode, characterId);
  if (!replacement) return save;
  const target = String(characterId).toLocaleLowerCase();
  return { ...save, characters: save.characters.map((item) => item.id.toLocaleLowerCase() === target ? replacement : item), updatedAt: Date.now() };
}

export function getApiKey() {
  return sessionStorage.getItem(STORAGE_KEYS.apiSession) || localStorage.getItem(STORAGE_KEYS.apiLocal) || '';
}

export function saveApiKey(key, remember) {
  sessionStorage.removeItem(STORAGE_KEYS.apiSession);
  localStorage.removeItem(STORAGE_KEYS.apiLocal);
  const clean = String(key || '').trim();
  if (clean) (remember ? localStorage : sessionStorage).setItem(remember ? STORAGE_KEYS.apiLocal : STORAGE_KEYS.apiSession, clean);
}

function cleanSettings(value, migrateLegacyDefault = false) {
  const memoryModelName = normalizeModelName(value?.memoryModelName, DEFAULT_SETTINGS.memoryModelName);
  const shouldMigrateMemoryModel = migrateLegacyDefault
    && Number(value?.version || 1) < SETTINGS_VERSION
    && memoryModelName === LEGACY_DEFAULT_MEMORY_MODEL;
  return {
    version: SETTINGS_VERSION,
    playerName: String(value?.playerName || DEFAULT_SETTINGS.playerName).trim().slice(0, 40) || DEFAULT_SETTINGS.playerName,
    inputMode: value?.inputMode === 'text' ? 'text' : 'voice',
    captionsVisible: value?.captionsVisible !== false,
    rememberApiKey: Boolean(value?.rememberApiKey),
    liveModelName: normalizeModelName(value?.liveModelName, DEFAULT_SETTINGS.liveModelName),
    memoryModelName: shouldMigrateMemoryModel ? DEFAULT_SETTINGS.memoryModelName : memoryModelName,
  };
}

function cleanSave(value, mode) {
  const defaults = createDefaultCharacters(mode);
  const supplied = Array.isArray(value?.characters) ? value.characters : [];
  return {
    version: 1,
    mode,
    characters: defaults.map((fallback) => cleanCharacter(supplied.find((item) => item?.id === fallback.id), fallback)),
    updatedAt: Number(value?.updatedAt) || Date.now(),
  };
}

function cleanCharacter(value, fallback) {
  return {
    ...fallback,
    name: String(value?.name || fallback.name).trim().slice(0, 40) || fallback.name,
    voice: VOICES.includes(value?.voice) ? value.voice : fallback.voice,
    persona: String(value?.persona || fallback.persona).trim().slice(0, 4000) || fallback.persona,
    memories: cleanMemories(value?.memories, fallback.memories),
    lastMetAt: Number(value?.lastMetAt) || null,
    encounterCount: Math.max(0, Math.round(Number(value?.encounterCount) || 0)),
  };
}

function cleanMemories(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map((memory, index) => ({
    id: String(memory?.id || `memory-${Date.now()}-${index}`),
    content: String(memory?.content || '').trim().slice(0, 500),
    locked: Boolean(memory?.locked),
    importance: Math.min(5, Math.max(1, Math.round(Number(memory?.importance) || 3))),
    createdAt: Number(memory?.createdAt) || Date.now(),
  })).filter((memory) => memory.content);
}

function parse(raw) {
  try { return JSON.parse(raw); }
  catch { return null; }
}
