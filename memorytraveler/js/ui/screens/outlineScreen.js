import { $, setStatus, clearStatus } from "../dom.js";
import { TONE_OPTIONS } from "../../core/constants.js";
import { generateRandomOutline } from "../../gemini/outlineGenerator.js";

export function initOutlineScreen(ctx, router, { startNewGame, resumeGame }) {
  const titleInput = $("titleInput");
  const outlineInput = $("outlineInput");
  const friendNameInput = $("friendNameInput");
  const playerNameInput = $("playerNameInput");
  const friendPersonaInput = $("friendPersonaInput");
  const toneInput = $("toneInput");
  const randomOutlineBtn = $("randomOutlineBtn");
  const startGameBtn = $("startGameBtn");
  const saveOutlineBtn = $("saveOutlineBtn");
  const outlineStatus = $("outlineStatus");
  const resumeBanner = $("resumeBanner");
  const resumeBannerText = $("resumeBannerText");
  const resumeGameBtn = $("resumeGameBtn");
  const discardSessionBtn = $("discardSessionBtn");
  let randomizing = false;

  function loadFromContext() {
    const o = ctx.outline;
    titleInput.value = o.title || "";
    outlineInput.value = o.outline || "";
    friendNameInput.value = o.friendName || "小海";
    playerNameInput.value = o.playerName || "";
    friendPersonaInput.value = o.friendPersona || "";
    toneInput.value = TONE_OPTIONS.includes(o.tone) ? o.tone : TONE_OPTIONS[2];
  }

  function readForm() {
    return {
      title: titleInput.value.trim(),
      outline: outlineInput.value.trim(),
      friendName: friendNameInput.value.trim() || "小海",
      friendPersona: friendPersonaInput.value.trim(),
      playerName: playerNameInput.value.trim(),
      tone: toneInput.value,
      playerGender: ctx.settings.playerGender,
      friendGender: ctx.settings.friendGender
    };
  }

  function hasExistingContent() {
    const outline = readForm();
    return Boolean(
      outline.title ||
      outline.outline ||
      outline.friendPersona ||
      outline.playerName ||
      (outline.friendName && outline.friendName !== "小海")
    );
  }

  function applyRandomOutline(outline) {
    titleInput.value = outline.title;
    outlineInput.value = outline.outline;
    friendNameInput.value = outline.friendName;
    friendPersonaInput.value = outline.friendPersona;
  }

  function setOutlineActionsDisabled(disabled) {
    randomOutlineBtn.disabled = disabled;
    startGameBtn.disabled = disabled;
    saveOutlineBtn.disabled = disabled;
  }

  function refreshResumeBanner() {
    const snap = ctx.peekSession();
    const resumable = ctx.hasResumableSession();
    if (!snap || !resumable) {
      resumeBanner.hidden = true;
      return;
    }
    resumeBannerText.textContent = `偵測到尚未完成的旅程：《${snap.outline?.title || "未命名故事"}》，已進行 ${snap.log.length} 段。`;
    resumeBanner.hidden = false;
  }

  saveOutlineBtn.addEventListener("click", () => {
    ctx.saveOutline(readForm());
    setStatus(outlineStatus, "草稿已儲存於本機。", "ok");
  });

  randomOutlineBtn.addEventListener("click", async () => {
    if (randomizing) return;
    if (!ctx.settings.apiKey || !ctx.settings.model) {
      setStatus(outlineStatus, "請先到「設定」頁輸入 API Key 與 Model。", "err");
      return;
    }

    randomizing = true;
    setOutlineActionsDisabled(true);
    setStatus(outlineStatus, "正在生成故事設定…", "loading");
    try {
      const generated = await generateRandomOutline(ctx.settings.apiKey, ctx.settings.model, toneInput.value, {
        playerGender: ctx.settings.playerGender,
        friendGender: ctx.settings.friendGender
      });
      applyRandomOutline(generated);
      setStatus(outlineStatus, "✓ 已生成新的故事設定，可直接修改或開始遊戲。", "ok");
    } catch (err) {
      setStatus(outlineStatus, `生成失敗：${err.message}`, "err");
    } finally {
      randomizing = false;
      setOutlineActionsDisabled(false);
    }
  });

  startGameBtn.addEventListener("click", async () => {
    const outline = readForm();
    clearStatus(outlineStatus);
    startGameBtn.disabled = true;
    const result = await startNewGame(outline);
    startGameBtn.disabled = false;
    if (!result.ok) {
      setStatus(outlineStatus, result.error, "err");
      if (result.error.indexOf("設定") !== -1) router.show("settings");
    }
  });

  resumeGameBtn.addEventListener("click", () => {
    resumeGame();
  });

  discardSessionBtn.addEventListener("click", () => {
    if (!window.confirm("確定要放棄尚未完成的旅程嗎？此動作無法復原。")) return;
    ctx.clearGameSession();
    refreshResumeBanner();
  });

  loadFromContext();

  return {
    onShow() {
      clearStatus(outlineStatus);
      refreshResumeBanner();
    }
  };
}
