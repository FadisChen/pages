// Chooses a sensible default model id out of a ListModels result: prefer an
// exact match on the app's recommended default, then anything flash-lite,
// then anything flash, then whatever is first.
export function pickDefaultModel(ids, preferredDefault) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  if (preferredDefault && ids.includes(preferredDefault)) return preferredDefault;
  const lite = ids.find((id) => id.includes("flash-lite"));
  if (lite) return lite;
  const flash = ids.find((id) => id.includes("flash"));
  if (flash) return flash;
  return ids[0];
}
