import { $, setStatus, clearStatus } from "../dom.js";
import { escapeHtml } from "../../utils/escapeHtml.js";

export function initGameScreen(ctx, router, { onEndGame }) {
  const gameTitle = $("gameTitle");
  const gameSubtitle = $("gameSubtitle");
  const endGameBtn = $("endGameBtn");
  const affinityValue = $("affinityValue");
  const affinityFill = $("affinityFill");
  const toggleCluesBtn = $("toggleCluesBtn");
  const cluesCount = $("cluesCount");
  const cluesPanel = $("cluesPanel");
  const cluesList = $("cluesList");
  const storyLog = $("storyLog");
  const choicesList = $("choicesList");
  const customActionForm = $("customActionForm");
  const customActionInput = $("customActionInput");
  const gameStatus = $("gameStatus");

  let busy = false;

  function renderAffinity() {
    const value = ctx.engine.affinity;
    affinityValue.textContent = value;
    affinityFill.style.width = `${value}%`;
  }

  function renderClues() {
    const clues = ctx.engine.clues;
    cluesCount.textContent = clues.length;
    cluesList.innerHTML = "";
    if (clues.length === 0) {
      const li = document.createElement("li");
      li.className = "clues-empty";
      li.textContent = "尚未取得任何物品或線索。";
      cluesList.appendChild(li);
      return;
    }
    clues.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      cluesList.appendChild(li);
    });
  }

  function appendSystemLine(text) {
    const div = document.createElement("div");
    div.className = "entry-system";
    div.textContent = text;
    storyLog.appendChild(div);
    storyLog.scrollTop = storyLog.scrollHeight;
  }

  function appendNarrative(entry) {
    const div = document.createElement("div");
    div.className = "entry-narr";
    let html = `<div class="narrative-label">劇情</div><p>${escapeHtml(entry.text)}</p>`;
    if (entry.friendLine) {
      html += `<div class="friend-line"><span class="who">${escapeHtml(ctx.outline.friendName)}：</span>${escapeHtml(entry.friendLine)}</div>`;
    }
    let tags = "";
    if (typeof entry.affinityDelta === "number" && entry.affinityDelta !== 0) {
      const cls = entry.affinityDelta > 0 ? "tag-pos" : "tag-neg";
      tags += `<span class="tag ${cls}">好感度 ${entry.affinityDelta > 0 ? "+" : ""}${entry.affinityDelta}</span>`;
    }
    (entry.newClues || []).forEach((c) => {
      tags += `<span class="tag tag-clue">🔎 ${escapeHtml(c)}</span>`;
    });
    if (tags) html += `<div class="entry-tags">${tags}</div>`;
    div.innerHTML = html;
    storyLog.appendChild(div);
    storyLog.scrollTop = storyLog.scrollHeight;
  }

  function appendChoiceEcho(text) {
    const div = document.createElement("div");
    div.className = "entry-choice";
    div.innerHTML = `<span class="who">選項</span>${escapeHtml(text)}`;
    storyLog.appendChild(div);
    storyLog.scrollTop = storyLog.scrollHeight;
    return div;
  }

  function renderFullLog() {
    storyLog.innerHTML = "";
    ctx.engine.log.forEach((entry) => {
      if (entry.type === "choice") appendChoiceEcho(entry.text);
      else appendNarrative(entry);
    });
  }

  function renderChoices(choices) {
    choicesList.innerHTML = "";
    const hasChoices = Array.isArray(choices) && choices.length > 0;
    if (!hasChoices) {
      const p = document.createElement("div");
      p.className = "hint";
      p.textContent = "目前沒有預設選項，你仍可輸入自訂行動繼續，或按右上角「結束遊戲」整理這趟旅程。";
      choicesList.appendChild(p);
    }
    customActionForm.hidden = false;
    if (!hasChoices) return;
    choices.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.innerHTML = `<span class="choice-num">${i + 1}</span>${escapeHtml(c)}`;
      btn.addEventListener("click", () => handleChoice(c));
      choicesList.appendChild(btn);
    });
  }

  function renderLoading(isLoading) {
    busy = isLoading;
    endGameBtn.disabled = isLoading;
    customActionInput.disabled = isLoading;
    if (isLoading) {
      choicesList.innerHTML = "";
      const div = document.createElement("div");
      div.className = "typing";
      div.innerHTML = `${escapeHtml(ctx.outline.friendName)} 正在思考 <span class="dots"><span></span><span></span><span></span></span>`;
      choicesList.appendChild(div);
    }
  }

  function applyTurnResult() {
    renderAffinity();
    renderClues();
    renderChoices(ctx.engine.currentChoices);
    clearStatus(gameStatus);
    ctx.persistSession();
  }

  async function handleChoice(choiceText, { clearCustomInput = false } = {}) {
    if (busy) return;
    // Echoed optimistically for immediate feedback. On failure this bubble
    // simply stays as a record of the attempt; the engine's own `log` (the
    // source of truth for session resume) only gains an entry on success.
    appendChoiceEcho(choiceText);
    renderLoading(true);
    try {
      const turn = await ctx.engine.choose(choiceText);
      appendNarrative({ text: turn.narrative, friendLine: turn.friendLine, affinityDelta: turn.affinityDelta, newClues: turn.newClues });
      applyTurnResult();
      if (clearCustomInput) customActionInput.value = "";
    } catch (err) {
      setStatus(gameStatus, `發生錯誤：${err.message}（可重新選擇再試一次）`, "err");
      renderChoices(ctx.engine.currentChoices);
    } finally {
      renderLoading(false);
    }
  }

  customActionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const actionText = customActionInput.value.trim();
    if (!actionText) {
      setStatus(gameStatus, "請先輸入你的行動。", "err");
      customActionInput.focus();
      return;
    }
    void handleChoice(actionText, { clearCustomInput: true });
  });

  endGameBtn.addEventListener("click", () => {
    if (busy) return;
    if (!ctx.engine || ctx.engine.log.length === 0) return;
    if (!window.confirm("確定要結束這趟旅程嗎？結束後會為你生成回憶摘要。")) return;
    onEndGame();
  });

  toggleCluesBtn.addEventListener("click", () => {
    cluesPanel.hidden = !cluesPanel.hidden;
  });

  function resetView() {
    gameTitle.firstChild.textContent = `${ctx.outline.title || "未命名故事"} `;
    gameSubtitle.textContent = `與 ${ctx.outline.friendName} 一起冒險`;
    storyLog.innerHTML = "";
    choicesList.innerHTML = "";
    customActionForm.hidden = true;
    customActionInput.value = "";
    cluesPanel.hidden = true;
    clearStatus(gameStatus);
    renderAffinity();
    renderClues();
  }

  async function startNewGame(outlineFormData) {
    if (!ctx.settings.apiKey || !ctx.settings.model) {
      return { ok: false, error: "請先到「設定」頁輸入 API Key 與 Model。" };
    }
    if (!outlineFormData.outline.trim()) {
      return { ok: false, error: "請輸入劇情大綱。" };
    }
    ctx.saveOutline(outlineFormData);
    ctx.startNewGame(outlineFormData);
    resetView();
    router.show("game");
    appendSystemLine("故事開始…");
    renderLoading(true);
    try {
      const turn = await ctx.engine.start();
      appendNarrative({ text: turn.narrative, friendLine: turn.friendLine, affinityDelta: turn.affinityDelta, newClues: turn.newClues });
      applyTurnResult();
    } catch (err) {
      setStatus(gameStatus, `開場劇情生成失敗：${err.message}`, "err");
      renderChoices([]);
    } finally {
      renderLoading(false);
    }
    return { ok: true };
  }

  function resumeGame() {
    const engine = ctx.resumeGame();
    if (!engine) return { ok: false };
    resetView();
    renderFullLog();
    renderAffinity();
    renderClues();
    renderChoices(engine.currentChoices);
    router.show("game");
    return { ok: true };
  }

  return {
    startNewGame,
    resumeGame,
    onShow() {}
  };
}
