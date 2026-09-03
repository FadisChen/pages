import { $ } from "../dom.js";
import { escapeHtml } from "../../utils/escapeHtml.js";
import { findEndingTypeMeta } from "../../utils/endingTypes.js";
import { createId } from "../../utils/id.js";

export function initEndingScreen(ctx, router, { startNewGame }) {
  const memoryTitle = $("memoryTitle");
  const memorySummary = $("memorySummary");
  const memoryHighlights = $("memoryHighlights");
  const endingTypeBadge = $("endingTypeBadge");
  const restartSameBtn = $("restartSameBtn");
  const newStoryBtn = $("newStoryBtn");
  const viewAlbumBtn = $("viewAlbumBtn");

  async function begin() {
    router.show("ending");
    memoryTitle.textContent = "這趟旅程的回憶";
    memorySummary.textContent = "正在整理回憶中…";
    memoryHighlights.innerHTML = "";
    endingTypeBadge.hidden = true;

    const engine = ctx.engine;
    if (!engine) {
      memorySummary.textContent = "找不到目前的遊戲進度。";
      return;
    }

    try {
      const result = await engine.finish();
      const title = result.title || ctx.outline.title || "這趟旅程的回憶";
      memoryTitle.textContent = title;
      memorySummary.textContent = result.summary || "";
      memoryHighlights.innerHTML = "";
      result.highlights.forEach((h) => {
        const li = document.createElement("li");
        li.innerHTML = `<span class="mark">✦</span><span>${escapeHtml(h)}</span>`;
        memoryHighlights.appendChild(li);
      });

      const meta = findEndingTypeMeta(result.endingType);
      endingTypeBadge.textContent = `${meta.emoji} ${meta.id}`;
      endingTypeBadge.hidden = false;

      ctx.addMemory({
        id: createId("mem"),
        savedAt: Date.now(),
        storyTitle: ctx.outline.title || "未命名故事",
        friendName: ctx.outline.friendName,
        tone: ctx.outline.tone,
        title,
        summary: result.summary || "",
        highlights: result.highlights,
        endingType: meta.id,
        affinity: engine.affinity,
        clues: engine.clues.slice()
      });

      // The playthrough is genuinely over now — clear the resumable session
      // so the outline screen no longer offers to resume it.
      ctx.clearGameSession();
    } catch (err) {
      memorySummary.textContent = `回憶摘要生成失敗：${err.message}`;
    }
  }

  restartSameBtn.addEventListener("click", () => {
    startNewGame(ctx.outline);
  });

  newStoryBtn.addEventListener("click", () => {
    router.show("outline");
  });

  viewAlbumBtn.addEventListener("click", () => {
    router.show("album");
  });

  return { begin, onShow() {} };
}
