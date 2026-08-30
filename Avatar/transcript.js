export function normalizeTranscript(text) {
  return String(text || "").trim();
}

export function mergePartial(current, incoming) {
  const existing = normalizeTranscript(current);
  const next = normalizeTranscript(incoming);

  if (!existing) return next;
  if (!next) return existing;
  if (next.startsWith(existing)) return next;
  if (existing.endsWith(next)) return existing;
  return existing + next;
}
