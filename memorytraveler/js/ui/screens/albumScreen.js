import { $ } from "../dom.js";
import { escapeHtml } from "../../utils/escapeHtml.js";
import { ENDING_TYPES } from "../../core/constants.js";
import { findEndingTypeMeta, isUnlocked } from "../../utils/endingTypes.js";

export function initAlbumScreen(ctx, router) {
  const albumUnlockGrid = $("albumUnlockGrid");
  const albumProgress = $("albumProgress");
  const albumList = $("albumList");
  const clearMemoriesBtn = $("clearMemoriesBtn");

  function formatDate(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function render() {
    const unlockedCount = ENDING_TYPES.filter((e) => isUnlocked(ctx.memories, e.id)).length;
    albumProgress.textContent = `結局收集進度：${unlockedCount}/${ENDING_TYPES.length}`;
    albumUnlockGrid.innerHTML = "";
    ENDING_TYPES.forEach((e) => {
      const unlocked = isUnlocked(ctx.memories, e.id);
      const chip = document.createElement("div");
      chip.className = `ending-chip${unlocked ? " unlocked" : " locked"}`;
      chip.textContent = unlocked ? `${e.emoji} ${e.id}` : "❔ 未解鎖";
      albumUnlockGrid.appendChild(chip);
    });

    albumList.innerHTML = "";
    if (ctx.memories.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "尚無回憶紀錄，完成一段故事後會自動收錄在這裡。";
      albumList.appendChild(empty);
      return;
    }

    ctx.memories.forEach((m) => {
      const meta = findEndingTypeMeta(m.endingType);
      const card = document.createElement("div");
      card.className = "memory-list-card";
      let html =
        `<div class="mlc-header">` +
        `<div class="mlc-title">${escapeHtml(m.title)}</div>` +
        `<span class="mlc-badge">${meta.emoji} ${escapeHtml(meta.id)}</span>` +
        `</div>` +
        `<div class="mlc-sub">${escapeHtml(m.storyTitle)} · ${formatDate(m.savedAt)} · 好感度 ${m.affinity}/100</div>` +
        `<div class="mlc-summary">${escapeHtml(m.summary)}</div>`;
      if (m.highlights?.length) {
        html += `<ul class="mlc-highlights">${m.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`;
      }
      if (m.clues?.length) {
        html += `<div class="mlc-clues">🔎 ${escapeHtml(m.clues.join("、"))}</div>`;
      }
      card.innerHTML = html;
      albumList.appendChild(card);
    });
  }

  clearMemoriesBtn.addEventListener("click", () => {
    if (!window.confirm("確定要清除所有回憶相簿紀錄嗎？此動作無法復原。")) return;
    ctx.clearMemories();
    render();
  });

  return { onShow: render };
}
