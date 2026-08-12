export const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const DEFAULT_MEMORY_MODEL = 'gemini-3.1-flash-lite';

export function normalizeModelName(value, fallback) {
  const model = String(value || '').trim().replace(/^models\//i, '').slice(0, 160);
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(model) ? model : fallback;
}
