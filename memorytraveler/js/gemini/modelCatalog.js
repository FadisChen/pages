import { listModelsRaw } from "./client.js";

// Pure transform: raw ListModels entries -> the shape the UI needs, keeping
// only models that actually support generateContent (excludes e.g. embedding
// models) and normalizing the id (API returns "models/gemini-...").
export function toSelectableModels(rawModels) {
  return rawModels
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => ({
      id: (m.name || "").replace(/^models\//, ""),
      displayName: m.displayName || m.name || "",
      inputTokenLimit: typeof m.inputTokenLimit === "number" ? m.inputTokenLimit : null
    }))
    .filter((m) => m.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function fetchSelectableModels(apiKey, opts) {
  const raw = await listModelsRaw(apiKey, opts);
  return toSelectableModels(raw);
}
