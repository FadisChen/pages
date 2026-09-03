import { $, setStatus, clearStatus } from "../dom.js";
import { generateContent } from "../../gemini/client.js";
import { pickDefaultModel } from "../../utils/modelPicker.js";
import { DEFAULT_GENDER, DEFAULT_MODEL, normalizeGender } from "../../core/constants.js";
import { userContent } from "../../utils/geminiContent.js";

export function initSettingsScreen(ctx, router) {
  const apiKeyInput = $("apiKeyInput");
  const toggleKeyBtn = $("toggleKeyBtn");
  const modelSelect = $("modelSelect");
  const fetchModelsBtn = $("fetchModelsBtn");
  const modelListStatus = $("modelListStatus");
  const manualModelWrap = $("manualModelWrap");
  const modelInput = $("modelInput");
  const toggleManualModelBtn = $("toggleManualModelBtn");
  const playerGenderSelect = $("playerGenderSelect");
  const friendGenderSelect = $("friendGenderSelect");
  const saveSettingsBtn = $("saveSettingsBtn");
  const testConnBtn = $("testConnBtn");
  const clearSettingsBtn = $("clearSettingsBtn");
  const settingsStatus = $("settingsStatus");

  function showManualModel(show) {
    manualModelWrap.hidden = !show;
    toggleManualModelBtn.textContent = show ? "改用清單選取 model" : "改用手動輸入 model 名稱";
    modelSelect.disabled = show;
    if (show && !modelInput.value.trim()) {
      modelInput.value = ctx.settings.model || DEFAULT_MODEL;
    }
  }

  function getSelectedModel() {
    if (!manualModelWrap.hidden) return modelInput.value.trim();
    return modelSelect.value.trim();
  }

  function populateModelSelect(models, preferredId) {
    modelSelect.innerHTML = "";
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.displayName}（${m.id}）${m.inputTokenLimit ? `・約 ${Math.round(m.inputTokenLimit / 1000)}K tokens 上限` : ""}`;
      modelSelect.appendChild(opt);
    });
    if (preferredId) modelSelect.value = preferredId;
  }

  function seedModelSelectFromSaved() {
    const savedModel = ctx.settings.model || DEFAULT_MODEL;
    modelSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = savedModel;
    opt.textContent = `${savedModel}（尚未取得清單，可點右側按鈕更新）`;
    modelSelect.appendChild(opt);
    modelSelect.value = savedModel;
  }

  async function doFetchModels(apiKey, preferredId) {
    if (!apiKey) {
      setStatus(modelListStatus, "請先輸入 API Key。", "err");
      return;
    }
    setStatus(modelListStatus, "正在取得可用模型清單…", "loading");
    fetchModelsBtn.disabled = true;
    try {
      const models = await ctx.fetchModels(apiKey);
      if (models.length === 0) {
        setStatus(modelListStatus, `沒有取得到支援 generateContent 的模型，請改用手動輸入（預設 ${DEFAULT_MODEL}）。`, "err");
        showManualModel(true);
        return;
      }
      const ids = models.map((m) => m.id);
      const chosen = preferredId && ids.includes(preferredId) ? preferredId : pickDefaultModel(ids, DEFAULT_MODEL);
      populateModelSelect(models, chosen);
      setStatus(modelListStatus, `✓ 取得 ${models.length} 個可用模型。`, "ok");
      showManualModel(false);
    } catch (err) {
      setStatus(modelListStatus, `取得模型清單失敗：${err.message}（可改用手動輸入，預設 ${DEFAULT_MODEL}）`, "err");
      showManualModel(true);
    } finally {
      fetchModelsBtn.disabled = false;
    }
  }

  function loadFromContext() {
    apiKeyInput.value = ctx.settings.apiKey || "";
    playerGenderSelect.value = normalizeGender(ctx.settings.playerGender);
    friendGenderSelect.value = normalizeGender(ctx.settings.friendGender);
    seedModelSelectFromSaved();
    showManualModel(false);
    if (ctx.settings.apiKey) {
      doFetchModels(ctx.settings.apiKey, ctx.settings.model);
    }
  }

  toggleKeyBtn.addEventListener("click", () => {
    const isPw = apiKeyInput.type === "password";
    apiKeyInput.type = isPw ? "text" : "password";
    toggleKeyBtn.textContent = isPw ? "隱藏" : "顯示";
  });

  toggleManualModelBtn.addEventListener("click", () => {
    showManualModel(manualModelWrap.hidden);
  });

  fetchModelsBtn.addEventListener("click", () => {
    doFetchModels(apiKeyInput.value.trim(), null);
  });

  saveSettingsBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    const model = getSelectedModel() || DEFAULT_MODEL;
    if (!apiKey) {
      setStatus(settingsStatus, "請輸入 API Key。", "err");
      return;
    }
    ctx.saveSettings({
      apiKey,
      model,
      playerGender: playerGenderSelect.value,
      friendGender: friendGenderSelect.value
    });
    setStatus(settingsStatus, `已儲存（model：${model}），正在前往劇情大綱設置…`, "ok");
    setTimeout(() => router.show("outline"), 500);
  });

  clearSettingsBtn.addEventListener("click", () => {
    ctx.clearSettings();
    apiKeyInput.value = "";
    modelInput.value = "";
    playerGenderSelect.value = DEFAULT_GENDER;
    friendGenderSelect.value = DEFAULT_GENDER;
    modelSelect.innerHTML = "";
    showManualModel(true);
    setStatus(settingsStatus, "已清除本機儲存的設定。", "ok");
  });

  testConnBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const model = getSelectedModel();
    if (!apiKey || !model) {
      setStatus(settingsStatus, "請先輸入 API Key 並選擇/輸入 Model 名稱再測試。", "err");
      return;
    }
    setStatus(settingsStatus, "測試連線中…", "loading");
    try {
      await generateContent(apiKey, model, { contents: [userContent("請只回傳文字：ok")] });
      setStatus(settingsStatus, "✓ 連線成功，Key 與 Model 皆可用。", "ok");
    } catch (err) {
      setStatus(settingsStatus, `✗ 連線失敗：${err.message}`, "err");
    }
  });

  loadFromContext();

  return {
    onShow() {
      clearStatus(settingsStatus);
    }
  };
}
