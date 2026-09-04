import {
  AUDIO_TAGS,
  DEFAULT_OPTIMIZER_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VOICE,
  TTS_MODELS,
  VOICES,
} from "./model-catalog.js";
import {
  generateText,
  generateTts,
  GeminiApiError,
  streamTts,
  testApiKey,
} from "./gemini-api.js";
import {
  buildDirectorNotesPrompt,
  buildScriptOptimizationPrompt,
  buildTtsPrompt,
} from "./prompts.js";
import {
  base64ToBytes,
  concatBytes,
  formatDuration,
  pcmToWavBlob,
  PcmStreamPlayer,
} from "./audio.js";

const $ = (id) => document.getElementById(id);
const TOKEN_LIMIT = 8192;
const API_KEY_STORAGE_KEY = "tts-playground.api-key";
const EXAMPLE_SCRIPT = "午安，歡迎來到今天的城市觀察。\n\n從一杯咖啡開始，我們一起走進街角，看看熟悉的日常裡，還藏著哪些值得被聽見的故事。";

const els = {
  connectionState: $("connectionState"),
  connectionLabel: $("connectionLabel"),
  openKeyButton: $("openKeyButton"),
  keyDialog: $("keyDialog"),
  keyForm: $("keyForm"),
  apiKeyInput: $("apiKeyInput"),
  toggleKeyButton: $("toggleKeyButton"),
  testKeyButton: $("testKeyButton"),
  saveKeyButton: $("saveKeyButton"),
  keyStatus: $("keyStatus"),
  scriptInput: $("scriptInput"),
  scriptMeta: $("scriptMeta"),
  scriptLength: $("scriptLength"),
  lineNumbers: $("lineNumbers"),
  loadExampleButton: $("loadExampleButton"),
  clearScriptButton: $("clearScriptButton"),
  scriptWandButton: $("scriptWandButton"),
  scriptReviewDialog: $("scriptReviewDialog"),
  scriptReviewText: $("scriptReviewText"),
  applyScriptButton: $("applyScriptButton"),
  discardScriptButton: $("discardScriptButton"),
  dismissScriptReviewButton: $("dismissScriptReviewButton"),
  ttsModel: $("ttsModel"),
  modelBadge: $("modelBadge"),
  modelHelp: $("modelHelp"),
  optimizerModel: $("optimizerModel"),
  singleSpeakerOption: $("singleSpeakerOption"),
  multiSpeakerOption: $("multiSpeakerOption"),
  singleSpeakerConfig: $("singleSpeakerConfig"),
  multiSpeakerConfig: $("multiSpeakerConfig"),
  singleVoice: $("singleVoice"),
  speakerOneName: $("speakerOneName"),
  speakerOneVoice: $("speakerOneVoice"),
  speakerTwoName: $("speakerTwoName"),
  speakerTwoVoice: $("speakerTwoVoice"),
  languageSelect: $("languageSelect"),
  contentType: $("contentType"),
  directorWandButton: $("directorWandButton"),
  directorNotes: $("directorNotes"),
  audioTagsGroup: $("audioTagsGroup"),
  audioTagList: $("audioTagList"),
  streamingControl: $("streamingControl"),
  streamingToggle: $("streamingToggle"),
  streamingHelp: $("streamingHelp"),
  generateButton: $("generateButton"),
  cancelButton: $("cancelButton"),
  outputStatus: $("outputStatus"),
  audioEmpty: $("audioEmpty"),
  audioResult: $("audioResult"),
  audioPlayer: $("audioPlayer"),
  playButton: $("playButton"),
  waveform: $("waveform"),
  audioTime: $("audioTime"),
  downloadButton: $("downloadButton"),
  outputMeta: $("outputMeta"),
  toastRegion: $("toastRegion"),
};

const storedApiKey = readStoredApiKey();
const state = {
  apiKey: storedApiKey,
  busy: false,
  abortController: null,
  pendingOptimizedScript: "",
  audioUrl: "",
  streamPlayer: null,
};

function readStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistApiKey(apiKey) {
  try {
    if (apiKey) localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function populateVoices() {
  const voiceSelects = [els.singleVoice, els.speakerOneVoice, els.speakerTwoVoice];
  for (const select of voiceSelects) {
    select.replaceChildren();
    for (const voice of VOICES) {
      const option = document.createElement("option");
      option.value = voice.value;
      option.textContent = `${voice.value} · ${voice.style}`;
      select.append(option);
    }
    select.value = DEFAULT_VOICE;
  }
  els.speakerOneVoice.value = "Kore";
  els.speakerTwoVoice.value = "Puck";
}

function populateAudioTags() {
  els.audioTagList.replaceChildren();
  for (const tag of AUDIO_TAGS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip";
    button.textContent = tag;
    button.addEventListener("click", () => insertAtCursor(tag));
    els.audioTagList.append(button);
  }
}

function renderWaveform() {
  const heights = [36, 58, 44, 76, 52, 85, 48, 68, 92, 54, 70, 42, 62, 38, 78, 50, 66, 45, 82, 57, 72, 40, 61, 47, 88, 55, 74, 42];
  els.waveform.replaceChildren();
  for (const height of heights) {
    const bar = document.createElement("span");
    bar.style.setProperty("--bar-height", `${height}%`);
    els.waveform.append(bar);
  }
}

function getSelectedText(select) {
  return select.options[select.selectedIndex]?.textContent?.trim() || select.value;
}

function estimateTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  const cjkCount = (value.match(/[\u2e80-\u9fff]/g) || []).length;
  const otherCount = value.length - cjkCount;
  return Math.ceil(cjkCount * 1.1 + otherCount * 0.28);
}

function updateScriptMetrics() {
  const text = els.scriptInput.value;
  const characters = Array.from(text).length;
  const tokens = estimateTokens(text);
  els.scriptMeta.textContent = `${characters.toLocaleString()} 字 · 預估 ${tokens.toLocaleString()} tokens`;
  els.scriptLength.textContent = `${tokens.toLocaleString()} / ${TOKEN_LIMIT.toLocaleString()} tokens`;
  els.scriptLength.classList.toggle("is-over-limit", tokens > TOKEN_LIMIT);
  const lineCount = Math.max(1, text.split("\n").length);
  els.lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
}

function updateConnection(status, label) {
  els.connectionState.dataset.state = status;
  els.connectionLabel.textContent = label;
}

function updateWandState() {
  const canUseWand = Boolean(!state.busy && state.apiKey && els.scriptInput.value.trim() && els.optimizerModel.value.trim());
  els.scriptWandButton.disabled = !canUseWand;
  els.directorWandButton.disabled = !canUseWand;
}

function renderModelCapabilities() {
  const model = TTS_MODELS[els.ttsModel.value] || TTS_MODELS[DEFAULT_TTS_MODEL];
  els.modelBadge.textContent = model.badge;
  els.modelHelp.textContent = model.help;
  els.audioTagsGroup.hidden = !model.supportsAudioTags;
  els.streamingToggle.disabled = !model.supportsStreaming || state.busy;
  els.streamingControl.classList.toggle("is-disabled", !model.supportsStreaming || state.busy);
  if (!model.supportsStreaming) els.streamingToggle.checked = false;
  els.streamingHelp.textContent = model.supportsStreaming ? "3.1 Flash 可邊生成邊播放" : "此模型完成生成後播放";
  renderSpeakerMode();
}

function renderSpeakerMode() {
  const model = TTS_MODELS[els.ttsModel.value] || TTS_MODELS[DEFAULT_TTS_MODEL];
  const multiInput = document.querySelector('input[name="speakerMode"][value="multi"]');
  const multiSupported = model.supportsMultiSpeaker;
  multiInput.disabled = !multiSupported;
  els.multiSpeakerOption.classList.toggle("is-disabled", !multiSupported);
  if (!multiSupported && multiInput.checked) document.querySelector('input[name="speakerMode"][value="single"]').checked = true;
  const isMulti = document.querySelector('input[name="speakerMode"]:checked')?.value === "multi";
  els.singleSpeakerConfig.hidden = isMulti;
  els.multiSpeakerConfig.hidden = !isMulti;
  els.singleSpeakerOption.classList.toggle("is-active", !isMulti);
  els.multiSpeakerOption.classList.toggle("is-active", isMulti);
}

function selectedSpeakerSummary() {
  const isMulti = document.querySelector('input[name="speakerMode"]:checked')?.value === "multi";
  if (!isMulti) return els.singleVoice.value;
  return `${els.speakerOneName.value.trim() || "說話者 A"}（${els.speakerOneVoice.value}）、${els.speakerTwoName.value.trim() || "說話者 B"}（${els.speakerTwoVoice.value}）`;
}

function getSpeakerConfig() {
  const language = els.languageSelect.value === "auto" ? undefined : els.languageSelect.value;
  const isMulti = document.querySelector('input[name="speakerMode"]:checked')?.value === "multi";
  if (!isMulti) return [{ voice: els.singleVoice.value, ...(language ? { language } : {}) }];

  const firstName = els.speakerOneName.value.trim();
  const secondName = els.speakerTwoName.value.trim();
  if (!firstName || !secondName) {
    throw new Error("雙人模式需要填寫兩位說話者名稱。您也可以切回單人模式。\n");
  }
  return [
    { speaker: firstName, voice: els.speakerOneVoice.value, ...(language ? { language } : {}) },
    { speaker: secondName, voice: els.speakerTwoVoice.value, ...(language ? { language } : {}) },
  ];
}

function getContentType() {
  return getSelectedText(els.contentType);
}

function openKeyDialog() {
  els.apiKeyInput.value = state.apiKey;
  els.keyStatus.textContent = "";
  els.keyStatus.className = "modal-status";
  if (!els.keyDialog.open) els.keyDialog.showModal();
  els.apiKeyInput.focus();
}

function setKeyStatus(message, type = "") {
  els.keyStatus.textContent = message;
  els.keyStatus.className = `modal-status ${type}`.trim();
}

async function testCurrentKey() {
  const key = els.apiKeyInput.value.trim();
  if (!key) {
    setKeyStatus("請先貼上 API Key。", "is-error");
    return;
  }
  els.testKeyButton.disabled = true;
  els.testKeyButton.textContent = "測試中…";
  setKeyStatus("正在確認目前 TTS 模型的存取權限…");
  try {
    await testApiKey(key, els.ttsModel.value);
    state.apiKey = key;
    updateConnection("ready", "已連線 · Key 僅存本頁");
    updateWandState();
    setKeyStatus("連線成功，可以開始使用兩支魔術棒與生成音訊。", "is-success");
  } catch (error) {
    updateConnection("error", "連線失敗 · 請檢查 API Key");
    setKeyStatus(friendlyError(error), "is-error");
  } finally {
    els.testKeyButton.disabled = false;
    els.testKeyButton.textContent = "測試連線";
  }
}

function saveCurrentKey() {
  const key = els.apiKeyInput.value.trim();
  if (!key) {
    if (state.apiKey) {
      const removed = persistApiKey("");
      state.apiKey = "";
      updateConnection("empty", "尚未設定 API Key");
      updateWandState();
      els.keyDialog.close();
      showToast(removed ? "已移除本機保存的 API Key。" : "已清除本頁的 API Key。", "success");
      return;
    }
    setKeyStatus("請先貼上 API Key。", "is-error");
    return;
  }
  state.apiKey = key;
  const persisted = persistApiKey(key);
  updateConnection("ready", persisted ? "已載入 · 瀏覽器記住 Key" : "Key 已載入 · localStorage 不可用");
  updateWandState();
  els.keyDialog.close();
  if (!persisted) {
    showToast("瀏覽器禁止 localStorage，Key 僅會保留在本頁。", "error");
  } else {
    showToast("API Key 已保存至此瀏覽器。", "success");
  }
}

function setRequestState(isBusy, statusText = "") {
  state.busy = isBusy;
  if (isBusy) {
    els.cancelButton.hidden = false;
    els.cancelButton.textContent = "取消目前請求";
    els.generateButton.disabled = true;
  } else {
    els.cancelButton.hidden = true;
    els.generateButton.disabled = false;
    state.abortController = null;
  }
  if (statusText) els.outputStatus.textContent = statusText;
  renderModelCapabilities();
  updateWandState();
}

function setWandLoading(button, loading, label) {
  button.classList.toggle("is-loading", loading);
  button.lastElementChild.textContent = loading ? "處理中…" : label;
}

function friendlyError(error) {
  if (error?.name === "AbortError") return "已取消目前請求。";
  if (error instanceof GeminiApiError) {
    if (error.status === 401 || error.status === 403) return "API Key 無效、沒有權限，或目前 Key 無法使用這個模型。";
    if (error.status === 429) return "已達免費層的請求或用量限制，請稍後再試。";
    if (error.status >= 500) return "Gemini 服務暫時無法完成請求，請稍後再試。";
    return error.message;
  }
  return error?.message || "發生未預期的錯誤，輸入內容仍已保留。";
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast is-${type}`;
  toast.textContent = message;
  els.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function insertAtCursor(text) {
  const input = els.scriptInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  input.selectionStart = input.selectionEnd = start + text.length;
  syncScript();
  input.focus();
}

function syncScript() {
  updateScriptMetrics();
  updateWandState();
}

function closeScriptReview() {
  state.pendingOptimizedScript = "";
  if (els.scriptReviewDialog.open) els.scriptReviewDialog.close();
}

async function optimizeScript() {
  if (!state.apiKey) {
    openKeyDialog();
    return;
  }
  const script = els.scriptInput.value.trim();
  if (!script) {
    showToast("請先輸入稿件，再使用稿件魔術棒。", "error");
    return;
  }

  state.abortController = new AbortController();
  setRequestState(true, "優化稿件中…");
  setWandLoading(els.scriptWandButton, true, "優化稿件");
  try {
    const result = await generateText({
      apiKey: state.apiKey,
      model: els.optimizerModel.value.trim(),
      prompt: buildScriptOptimizationPrompt({ script, contentType: getContentType() }),
      signal: state.abortController.signal,
    });
    state.pendingOptimizedScript = result.text;
    els.scriptReviewText.textContent = result.text;
    if (!els.scriptReviewDialog.open) els.scriptReviewDialog.showModal();
    showToast("優化稿件已產生，請確認是否取代左側內容。", "success");
  } catch (error) {
    if (error.name !== "AbortError") showToast(friendlyError(error), "error");
  } finally {
    setWandLoading(els.scriptWandButton, false, "優化稿件");
    setRequestState(false);
    els.outputStatus.textContent = els.audioResult.hidden ? "等待生成" : "已有結果 · 可重新生成";
  }
}

async function generateDirectorNotes() {
  if (!state.apiKey) {
    openKeyDialog();
    return;
  }
  const script = els.scriptInput.value.trim();
  if (!script) {
    showToast("請先輸入稿件，再使用導演指示魔術棒。", "error");
    return;
  }
  if (els.directorNotes.value.trim() && !window.confirm("目前已有導演指示，要用新的建議覆寫嗎？")) return;

  state.abortController = new AbortController();
  setRequestState(true, "產生導演指示中…");
  setWandLoading(els.directorWandButton, true, "依稿件產生");
  try {
    const result = await generateText({
      apiKey: state.apiKey,
      model: els.optimizerModel.value.trim(),
      prompt: buildDirectorNotesPrompt({
        script,
        ttsModel: els.ttsModel.value,
        voice: selectedSpeakerSummary(),
        language: els.languageSelect.value,
        speakerMode: document.querySelector('input[name="speakerMode"]:checked')?.value || "single",
        contentType: getContentType(),
      }),
      signal: state.abortController.signal,
    });
    els.directorNotes.value = result.text;
    showToast("導演指示已填入右側欄位，仍可手動修改。", "success");
  } catch (error) {
    if (error.name !== "AbortError") showToast(friendlyError(error), "error");
  } finally {
    setWandLoading(els.directorWandButton, false, "依稿件產生");
    setRequestState(false);
    els.outputStatus.textContent = els.audioResult.hidden ? "等待生成" : "已有結果 · 可重新生成";
  }
}

function stopStreamPlayer() {
  if (state.streamPlayer) {
    state.streamPlayer.stop();
    state.streamPlayer = null;
  }
}

function makeFileName(voice) {
  const date = new Date();
  const dateText = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  const modelText = els.ttsModel.value.replace(/[^a-z0-9-]/gi, "-");
  const voiceText = String(voice).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `tts-${dateText}-${modelText}-${voiceText}.wav`;
}

function showAudioResult({ pcm, sampleRate, channels, voice }) {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  const blob = pcmToWavBlob(pcm, { sampleRate, channels, bitDepth: 16 });
  state.audioUrl = URL.createObjectURL(blob);
  els.audioPlayer.src = state.audioUrl;
  els.audioPlayer.load();
  els.downloadButton.href = state.audioUrl;
  els.downloadButton.download = makeFileName(voice);
  els.outputMeta.textContent = `${TTS_MODELS[els.ttsModel.value]?.shortLabel || els.ttsModel.value} · ${voice} · WAV · ${Math.round(sampleRate / 1000)} kHz · 16-bit PCM`;
  els.audioEmpty.hidden = true;
  els.audioResult.hidden = false;
  els.outputStatus.textContent = "已完成 · 可試聽";
}

async function generateAudio() {
  if (!state.apiKey) {
    openKeyDialog();
    return;
  }
  const script = els.scriptInput.value.trim();
  if (!script) {
    showToast("請先輸入想要朗讀的稿件。", "error");
    els.scriptInput.focus();
    return;
  }

  let speechConfig;
  try {
    speechConfig = getSpeakerConfig();
  } catch (error) {
    showToast(error.message, "error");
    return;
  }

  stopStreamPlayer();
  state.abortController = new AbortController();
  setRequestState(true, "準備生成音訊…");
  els.generateButton.classList.add("is-loading");
  let streamSucceeded = false;

  try {
    const model = TTS_MODELS[els.ttsModel.value] || TTS_MODELS[DEFAULT_TTS_MODEL];
    const isStreaming = model.supportsStreaming && els.streamingToggle.checked;
    const input = buildTtsPrompt({
      script,
      directorNotes: els.directorNotes.value,
      language: els.languageSelect.value,
      contentType: getContentType(),
      speakerMode: speechConfig.length > 1 ? "multi" : "single",
    });

    let chunks = [];
    let sampleRate = 24000;
    let channels = 1;
    if (isStreaming) {
      setRequestState(true, "串流生成中…");
      const liveChunks = [];
      try {
        state.streamPlayer = new PcmStreamPlayer({ sampleRate, channels });
      } catch {
        state.streamPlayer = null;
      }
      const result = await streamTts({
        apiKey: state.apiKey,
        model: els.ttsModel.value,
        input,
        speechConfig,
        signal: state.abortController.signal,
        onAudio: (chunk) => {
          sampleRate = chunk.sampleRate || sampleRate;
          channels = chunk.channels || channels;
          const bytes = base64ToBytes(chunk.data);
          liveChunks.push(bytes);
          state.streamPlayer?.append(bytes);
          els.outputStatus.textContent = "串流生成中 · 正在播放";
        },
      });
      chunks = result.chunks.map((chunk) => base64ToBytes(chunk.data));
      if (!chunks.length) chunks = liveChunks;
      streamSucceeded = true;
    } else {
      setRequestState(true, "生成音訊中…");
      const result = await generateTts({
        apiKey: state.apiKey,
        model: els.ttsModel.value,
        input,
        speechConfig,
        signal: state.abortController.signal,
      });
      sampleRate = result.sampleRate || sampleRate;
      channels = result.channels || channels;
      chunks = [base64ToBytes(result.data)];
    }

    setRequestState(true, "封裝 WAV 音訊…");
    const pcm = concatBytes(chunks);
    showAudioResult({ pcm, sampleRate, channels, voice: selectedSpeakerSummary() });
    showToast(isStreaming ? "串流完成，WAV 已準備好下載。" : "音訊生成完成，可以試聽或下載。", "success");
  } catch (error) {
    if (error.name !== "AbortError") {
      if (error.status === 401 || error.status === 403) {
        updateConnection("error", "Key 無效或模型不可用");
      }
      showToast(friendlyError(error), "error");
      els.outputStatus.textContent = "生成失敗 · 請保留設定後重試";
    } else {
      els.outputStatus.textContent = "已取消生成";
    }
  } finally {
    if (!streamSucceeded) stopStreamPlayer();
    els.generateButton.classList.remove("is-loading");
    setRequestState(false);
  }
}

function applyOptimizedScript() {
  if (!state.pendingOptimizedScript) return;
  els.scriptInput.value = state.pendingOptimizedScript;
  closeScriptReview();
  syncScript();
  showToast("優化稿件已取代左側內容。", "success");
}

function loadExample() {
  if (els.scriptInput.value.trim() && !window.confirm("載入範例會取代目前左側稿件，確定嗎？")) return;
  els.scriptInput.value = EXAMPLE_SCRIPT;
  closeScriptReview();
  syncScript();
  showToast("已載入繁體中文旁白範例。", "success");
}

function clearScript() {
  if (els.scriptInput.value.trim() && !window.confirm("確定要清除左側稿件嗎？")) return;
  els.scriptInput.value = "";
  closeScriptReview();
  syncScript();
}

function bindEvents() {
  els.openKeyButton.addEventListener("click", openKeyDialog);
  els.keyForm.addEventListener("submit", (event) => {
    if (event.submitter?.id === "saveKeyButton") {
      event.preventDefault();
      saveCurrentKey();
    }
  });
  els.toggleKeyButton.addEventListener("click", () => {
    const showing = els.apiKeyInput.type === "text";
    els.apiKeyInput.type = showing ? "password" : "text";
    els.toggleKeyButton.textContent = showing ? "顯示" : "隱藏";
    els.toggleKeyButton.setAttribute("aria-label", showing ? "顯示 API Key" : "隱藏 API Key");
  });
  els.testKeyButton.addEventListener("click", testCurrentKey);

  els.scriptInput.addEventListener("input", syncScript);
  els.scriptWandButton.addEventListener("click", optimizeScript);
  els.directorWandButton.addEventListener("click", generateDirectorNotes);
  els.applyScriptButton.addEventListener("click", applyOptimizedScript);
  els.discardScriptButton.addEventListener("click", closeScriptReview);
  els.dismissScriptReviewButton.addEventListener("click", closeScriptReview);
  els.scriptReviewDialog.addEventListener("close", () => {
    state.pendingOptimizedScript = "";
  });
  els.loadExampleButton.addEventListener("click", loadExample);
  els.clearScriptButton.addEventListener("click", clearScript);

  els.ttsModel.addEventListener("change", renderModelCapabilities);
  els.optimizerModel.addEventListener("input", updateWandState);
  for (const input of document.querySelectorAll('input[name="speakerMode"]')) input.addEventListener("change", renderSpeakerMode);

  els.generateButton.addEventListener("click", generateAudio);
  els.cancelButton.addEventListener("click", () => state.abortController?.abort());
  els.playButton.addEventListener("click", () => {
    if (els.audioPlayer.paused) els.audioPlayer.play().catch(() => {});
    else els.audioPlayer.pause();
  });
  els.audioPlayer.addEventListener("play", () => {
    els.playButton.textContent = "❚❚";
    els.playButton.setAttribute("aria-label", "暫停音訊");
  });
  els.audioPlayer.addEventListener("pause", () => {
    els.playButton.textContent = "▶";
    els.playButton.setAttribute("aria-label", "播放音訊");
  });
  els.audioPlayer.addEventListener("timeupdate", () => {
    els.audioTime.textContent = `${formatDuration(els.audioPlayer.currentTime)} / ${formatDuration(els.audioPlayer.duration)}`;
  });
  els.audioPlayer.addEventListener("loadedmetadata", () => {
    els.audioTime.textContent = `${formatDuration(els.audioPlayer.currentTime)} / ${formatDuration(els.audioPlayer.duration)}`;
  });

  window.addEventListener("beforeunload", () => {
    stopStreamPlayer();
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  });
}

populateVoices();
populateAudioTags();
renderWaveform();
els.ttsModel.value = DEFAULT_TTS_MODEL;
els.optimizerModel.value = DEFAULT_OPTIMIZER_MODEL;
renderSpeakerMode();
renderModelCapabilities();
updateScriptMetrics();
if (state.apiKey) updateConnection("ready", "已載入 · 瀏覽器記住 Key");
updateWandState();
bindEvents();
