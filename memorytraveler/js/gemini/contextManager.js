import { contentsCharCount } from "../utils/geminiContent.js";
import { COMPACTION } from "../core/constants.js";
import { buildCompactionPrompt } from "./promptBuilder.js";

// Pure decision: does this contents array need folding into a summary yet?
export function shouldCompact(contents, thresholds = COMPACTION) {
  return contents.length > thresholds.turnThreshold || contentsCharCount(contents) > thresholds.charThreshold;
}

// Pure split: everything except the most recent `keepRaw` entries is
// "older" and a candidate for summarization.
export function splitForCompaction(contents, keepRaw = COMPACTION.keepRaw) {
  const keep = Math.min(keepRaw, contents.length);
  const boundary = contents.length - keep;
  return {
    older: contents.slice(0, boundary),
    recent: contents.slice(boundary)
  };
}

// Orchestrates a compaction pass: given the current history, rolling summary,
// and the current story state, returns the new { contents, storySummary }.
// A failed or empty summary must never discard unsummarized history; the next
// turn can retry the compaction with the original contents intact.
export async function compactHistory(
  { contents, storySummary, outline, affinity, clues },
  summarize,
  thresholds = COMPACTION
) {
  if (!shouldCompact(contents, thresholds)) {
    return { contents, storySummary };
  }
  const { older, recent } = splitForCompaction(contents, thresholds.keepRaw);
  if (older.length === 0) {
    return { contents, storySummary };
  }
  try {
    const prompt = buildCompactionPrompt(older, storySummary, { outline, affinity, clues });
    const nextSummary = (await summarize(prompt)).trim();
    if (!nextSummary) throw new Error("summary was empty");
    return { contents: recent, storySummary: nextSummary };
  } catch (err) {
    console.warn("[contextManager] compaction call failed, keeping raw history for retry:", err);
    return { contents, storySummary };
  }
}
