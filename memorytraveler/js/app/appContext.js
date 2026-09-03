import * as settingsStore from "../storage/settingsStore.js";
import * as outlineStore from "../storage/outlineStore.js";
import * as memoriesStore from "../storage/memoriesStore.js";
import * as sessionStore from "../storage/sessionStore.js";
import { fetchSelectableModels } from "../gemini/modelCatalog.js";
import { GameEngine } from "../core/gameEngine.js";
import { DEFAULT_GENDER, normalizeGender } from "../core/constants.js";

// A small dependency-injection object shared by every screen module. Not a
// generic pub-sub store: screens call these methods directly and re-render
// themselves afterwards, which is simple enough for an app this size without
// hiding control flow behind subscriptions.
export function createAppContext() {
  const ctx = {
    settings: settingsStore.loadSettings(),
    outline: outlineStore.loadOutline(),
    memories: memoriesStore.loadMemories(),
    availableModels: [],
    engine: null
  };

  ctx.saveSettings = (next) => {
    ctx.settings = {
      apiKey: next.apiKey || "",
      model: next.model || "",
      playerGender: normalizeGender(next.playerGender),
      friendGender: normalizeGender(next.friendGender)
    };
    settingsStore.saveSettings(ctx.settings);
  };

  ctx.clearSettings = () => {
    ctx.settings = {
      apiKey: "",
      model: "",
      playerGender: DEFAULT_GENDER,
      friendGender: DEFAULT_GENDER
    };
    ctx.availableModels = [];
    settingsStore.clearSettings();
  };

  ctx.saveOutline = (next) => {
    const resolved = {
      ...next,
      playerGender: normalizeGender(next?.playerGender ?? ctx.settings.playerGender),
      friendGender: normalizeGender(next?.friendGender ?? ctx.settings.friendGender)
    };
    ctx.outline = resolved;
    outlineStore.saveOutline(resolved);
    return resolved;
  };

  ctx.fetchModels = async (apiKey) => {
    const models = await fetchSelectableModels(apiKey);
    ctx.availableModels = models;
    return models;
  };

  ctx.addMemory = (record) => {
    ctx.memories = memoriesStore.appendMemory(record);
    return ctx.memories;
  };

  ctx.clearMemories = () => {
    ctx.memories = [];
    memoriesStore.clearMemories();
  };

  // Returns the raw persisted session (if any) without constructing an
  // engine, so the outline screen can offer a "resume" option cheaply.
  ctx.peekSession = () => sessionStore.loadSession();

  ctx.hasResumableSession = () => {
    const snap = ctx.peekSession();
    return !!(snap && Array.isArray(snap.log) && snap.log.length > 0);
  };

  ctx.startNewGame = (outline) => {
    const resolvedOutline = ctx.saveOutline(outline);
    ctx.engine = new GameEngine({ apiKey: ctx.settings.apiKey, model: ctx.settings.model, outline: resolvedOutline });
    ctx.persistSession();
    return ctx.engine;
  };

  ctx.resumeGame = () => {
    const snap = ctx.peekSession();
    if (!snap) return null;
    const normalizedSnapshot = {
      ...snap,
      outline: {
        ...snap.outline,
        playerGender: normalizeGender(snap.outline?.playerGender),
        friendGender: normalizeGender(snap.outline?.friendGender)
      }
    };
    ctx.engine = GameEngine.fromSnapshot(normalizedSnapshot, { apiKey: ctx.settings.apiKey, model: ctx.settings.model });
    ctx.outline = ctx.engine.outline;
    return ctx.engine;
  };

  ctx.persistSession = () => {
    if (ctx.engine) sessionStore.saveSession(ctx.engine.toSnapshot());
  };

  ctx.clearGameSession = () => {
    ctx.engine = null;
    sessionStore.clearSession();
  };

  return ctx;
}
