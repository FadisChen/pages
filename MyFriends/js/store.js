import { DEFAULT_LIVE_MODEL, getLiveModelOption, getLiveThinkingOption } from "./constants.js";

const DATA_KEY = "myfriends.web.data.v1";
const API_KEY_LOCAL = "myfriends.web.geminiKey";
const API_KEY_SESSION = "myfriends.web.geminiKey.session";
const TAVILY_KEY_LOCAL = "myfriends.web.tavilyKey";
const TAVILY_KEY_SESSION = "myfriends.web.tavilyKey.session";

export const ACCENTS = ["#e96f51", "#4f7c6b", "#5378a6", "#9a6aa6", "#d19a34", "#ba596d"];

export const DEFAULT_SETTINGS = Object.freeze({
  liveModel: DEFAULT_LIVE_MODEL,
  liveThinkingLevel: "",
  flashModel: "gemini-3.5-flash",
  groundingModel: "gemini-2.5-flash",
  memoryBudgetTokens: 3000,
  triggerTokens: 25600,
  rememberApiKey: false,
  toolsEnabled: true,
  locationEnabled: false,
});

function emptyData() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    characters: [],
    memories: [],
    updatedAt: Date.now(),
  };
}

function parseJson(raw) {
  try { return JSON.parse(raw); }
  catch { return null; }
}

function cleanData(value) {
  if (!value || typeof value !== "object") return emptyData();
  const settings = value.settings && typeof value.settings === "object" ? value.settings : {};
  return {
    version: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      liveModel: getLiveModelOption(settings.liveModel).id,
      liveThinkingLevel: getLiveThinkingOption(settings.liveThinkingLevel).id,
      flashModel: stringValue(settings.flashModel, DEFAULT_SETTINGS.flashModel),
      groundingModel: stringValue(settings.groundingModel, DEFAULT_SETTINGS.groundingModel),
      memoryBudgetTokens: numberInRange(settings.memoryBudgetTokens, 200, 100000, DEFAULT_SETTINGS.memoryBudgetTokens),
      triggerTokens: numberInRange(settings.triggerTokens, 1000, 1000000, DEFAULT_SETTINGS.triggerTokens),
      rememberApiKey: Boolean(settings.rememberApiKey),
      toolsEnabled: settings.toolsEnabled !== false,
      locationEnabled: Boolean(settings.locationEnabled),
    },
    characters: Array.isArray(value.characters) ? value.characters.map(cleanCharacter).filter(Boolean) : [],
    memories: Array.isArray(value.memories) ? value.memories.map(cleanMemory).filter(Boolean) : [],
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
}

function cleanCharacter(value, index = 0) {
  if (!value || typeof value !== "object") return null;
  const name = stringValue(value.name).trim().slice(0, 80);
  if (!name) return null;
  return {
    id: stringValue(value.id) || makeId(),
    name,
    description: stringValue(value.description).trim().slice(0, 12000),
    voiceName: stringValue(value.voiceName).slice(0, 80),
    accent: isHexColor(value.accent) ? value.accent : ACCENTS[index % ACCENTS.length],
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Number(value.createdAt) || Date.now(),
  };
}

function cleanMemory(value) {
  if (!value || typeof value !== "object") return null;
  const content = stringValue(value.content).trim().slice(0, 4000);
  const characterId = stringValue(value.characterId);
  if (!content || !characterId) return null;
  return {
    id: stringValue(value.id) || makeId(),
    characterId,
    content,
    locked: Boolean(value.locked),
    createdAt: Number(value.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Number(value.createdAt) || Date.now(),
  };
}

function stringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberInRange(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function loadData() {
  return cleanData(parseJson(localStorage.getItem(DATA_KEY)));
}

export function saveData(data) {
  const clean = cleanData({ ...data, updatedAt: Date.now() });
  localStorage.setItem(DATA_KEY, JSON.stringify(clean));
  return clean;
}

export function createCharacter(input) {
  const now = Date.now();
  return cleanCharacter({
    ...input,
    id: makeId(),
    createdAt: now,
    updatedAt: now,
  });
}

export function updateCharacter(current, input) {
  return cleanCharacter({ ...current, ...input, id: current.id, createdAt: current.createdAt, updatedAt: Date.now() });
}

export function createMemory(characterId, content, locked = true) {
  const now = Date.now();
  return cleanMemory({ id: makeId(), characterId, content, locked, createdAt: now, updatedAt: now });
}

export function updateMemory(current, content, locked = true) {
  return cleanMemory({ ...current, content, locked, id: current.id, createdAt: current.createdAt, updatedAt: Date.now() });
}

export function getApiKey() {
  return sessionStorage.getItem(API_KEY_SESSION) || localStorage.getItem(API_KEY_LOCAL) || "";
}

export function getTavilyKey() {
  return sessionStorage.getItem(TAVILY_KEY_SESSION) || localStorage.getItem(TAVILY_KEY_LOCAL) || "";
}

export function saveSecrets(apiKey, tavilyKey, remember) {
  [API_KEY_LOCAL, TAVILY_KEY_LOCAL].forEach((key) => localStorage.removeItem(key));
  [API_KEY_SESSION, TAVILY_KEY_SESSION].forEach((key) => sessionStorage.removeItem(key));
  const target = remember ? localStorage : sessionStorage;
  if (apiKey) target.setItem(remember ? API_KEY_LOCAL : API_KEY_SESSION, apiKey.trim());
  if (tavilyKey) target.setItem(remember ? TAVILY_KEY_LOCAL : TAVILY_KEY_SESSION, tavilyKey.trim());
}

export function clearSecrets() {
  [API_KEY_LOCAL, TAVILY_KEY_LOCAL].forEach((key) => localStorage.removeItem(key));
  [API_KEY_SESSION, TAVILY_KEY_SESSION].forEach((key) => sessionStorage.removeItem(key));
}

export function exportBackup(data) {
  const clean = cleanData(data);
  return JSON.stringify({
    format: "myfriends-web-backup",
    exportedAt: new Date().toISOString(),
    data: { ...clean, settings: { ...clean.settings, rememberApiKey: false } },
  }, null, 2);
}

export function importBackup(text) {
  const parsed = parseJson(text);
  if (!parsed || parsed.format !== "myfriends-web-backup" || !parsed.data) {
    throw new Error("這不是有效的 MyFriends 備份檔。 ");
  }
  const data = cleanData(parsed.data);
  const characterIds = new Set(data.characters.map((item) => item.id));
  data.memories = data.memories.filter((item) => characterIds.has(item.characterId));
  return data;
}

export function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const character of String(text || "")) {
    const code = character.codePointAt(0);
    if ((code >= 0x3000 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

export function resetAllData() {
  localStorage.removeItem(DATA_KEY);
  clearSecrets();
  return emptyData();
}

