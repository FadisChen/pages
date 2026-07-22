import {
  ACCENTS,
  createCharacter,
  createMemory,
  estimateTokens,
  exportBackup,
  getApiKey,
  getTavilyKey,
  importBackup,
  loadData,
  resetAllData,
  saveData,
  saveSecrets,
  updateCharacter,
  updateMemory,
} from "./store.js";
import {
  describeLiveThinking,
  getLiveThinkingOption,
  LIVE_MODEL_OPTIONS,
  LIVE_THINKING_OPTIONS,
} from "./constants.js";
import {
  buildSystemPrompt,
  checkModel,
  consolidateMemories,
  extractMemories,
  LiveSession,
  optimizeCharacter,
} from "./gemini.js";
import { BrowserAudioEngine } from "./audio.js";
import { mergePartial } from "./transcript.js";

const VOICES = [
  "", "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina",
  "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar",
  "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia",
  "Sadaltager", "Sulafat",
];

const appElement = document.getElementById("app");
const modal = document.getElementById("modal");
const toastRegion = document.getElementById("toastRegion");
let data = loadData();
let route = { view: "home", id: null };
let activeCall = null;
let memoryJob = null;

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = button.dataset.nav;
    if (destination === "new") navigate("edit");
    else navigate(destination);
  });
});

modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});

appElement.addEventListener("click", handleAction);
window.addEventListener("storage", (event) => {
  if (event.key?.startsWith("myfriends.web")) {
    data = loadData();
    if (!activeCall) render();
  }
});
window.addEventListener("beforeunload", () => {
  activeCall?.session?.stop();
  activeCall?.audio?.stop();
});

render();

function navigate(view, id = null) {
  if (activeCall && !activeCall.ended && view !== "call") {
    endCall({ goHome: view === "home", nextRoute: { view, id } });
    return;
  }
  if (view === "call") {
    const character = characterById(id);
    if (!character) return navigate("home");
    activeCall = createCallState(character);
  } else if (activeCall?.ended) {
    activeCall = null;
  }
  route = { view, id };
  render();
  appElement.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  setNavigationState();
  if (route.view === "edit") renderCharacterForm();
  else if (route.view === "memories") renderMemories();
  else if (route.view === "settings") renderSettings();
  else if (route.view === "call") renderCall();
  else renderHome();
}

function setNavigationState() {
  const active = route.view === "settings" ? "settings" : "home";
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === active);
  });
}

function renderHome() {
  const count = data.characters.length;
  appElement.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Your circle</span>
          <h1>${greeting()}，今天想找誰聊聊？</h1>
          <p>每位朋友都有自己的個性，也只記得你們之間的故事。</p>
        </div>
        <span class="count-pill">${count} 位朋友</span>
      </header>

      ${count ? `
        <section class="hero-panel">
          <div class="hero-copy">
            <span class="eyebrow">A quiet place to talk</span>
            <h2>不用想好怎麼說，開口就可以。</h2>
            <p>用自然語音聊近況、找靈感，或只是讓一個熟悉的聲音陪你一會兒。</p>
            <div class="hero-actions">
              <button class="button button-primary" type="button" data-action="call" data-id="${attr(data.characters[0].id)}">與 ${html(data.characters[0].name)} 對話 <span>↗</span></button>
              <button class="button button-secondary" type="button" data-action="new-character">＋ 建立新朋友</button>
            </div>
          </div>
          <div class="hero-art" aria-hidden="true"><div class="orbit"><span class="orbit-face">••</span></div></div>
        </section>
        <div class="section-heading"><h2>你的朋友</h2><span>點選通話按鈕開始語音對話</span></div>
        <section class="friend-grid" aria-label="朋友列表">${data.characters.map(friendCard).join("")}</section>
      ` : emptyHome()}
    </div>`;
}

function emptyHome() {
  return `
    <section class="empty-state">
      <div>
        <span class="empty-mark" aria-hidden="true">＋</span>
        <h2>從第一聲「嗨」開始</h2>
        <p>建立一位 AI 朋友，替他取名、寫下個性並選擇聲音。你們聊過的重要事情，會留在這台裝置裡。</p>
        <button class="button button-primary" type="button" data-action="new-character">建立第一位朋友</button>
      </div>
    </section>`;
}

function friendCard(character) {
  const memories = memoriesFor(character.id);
  return `
    <article class="friend-card" style="--friend-accent:${attr(character.accent)}">
      <div class="friend-top">
        <span class="avatar" aria-hidden="true">${html(initial(character.name))}</span>
        <div class="friend-menu">
          <button class="icon-button" type="button" data-action="memories" data-id="${attr(character.id)}" aria-label="管理 ${attr(character.name)} 的記憶" title="記憶">⌘</button>
          <button class="icon-button" type="button" data-action="edit" data-id="${attr(character.id)}" aria-label="編輯 ${attr(character.name)}" title="編輯">✎</button>
          <button class="icon-button" type="button" data-action="delete-character" data-id="${attr(character.id)}" aria-label="刪除 ${attr(character.name)}" title="刪除">×</button>
        </div>
      </div>
      <h3>${html(character.name)}</h3>
      <p class="friend-description">${html(character.description || "一位還在慢慢認識你的朋友。")}</p>
      <div class="tag-row">
        <span class="tag">♪ ${html(character.voiceName || "預設聲音")}</span>
      </div>
      <div class="friend-action">
        <small>⌘ ${memories.length} 條記憶</small>
        <button class="button button-primary button-small" type="button" data-action="call" data-id="${attr(character.id)}">開始對話</button>
      </div>
    </article>`;
}

function renderCharacterForm() {
  const existing = route.id ? characterById(route.id) : null;
  if (route.id && !existing) return navigate("home");
  const character = existing || {
    name: "",
    description: "",
    voiceName: "Aoede",
    accent: ACCENTS[data.characters.length % ACCENTS.length],
  };
  appElement.innerHTML = `
    <div class="page">
      <button class="back-button" type="button" data-action="home">← 返回朋友列表</button>
      <header class="page-header">
        <div><span class="eyebrow">${existing ? "Tune the friendship" : "Meet someone new"}</span><h1>${existing ? `編輯 ${html(character.name)}` : "建立一位新朋友"}</h1><p>寫下你希望對方是什麼樣的人，剩下的可以慢慢認識。</p></div>
      </header>
      <form id="characterForm" class="form-layout" novalidate>
        <section class="panel">
          <h2>基本資料</h2><p class="panel-intro">人設會成為每次對話的核心指引。</p>
          <div class="form-field">
            <label for="characterName">名字 <small>必填</small></label>
            <input class="input" id="characterName" name="name" maxlength="80" value="${attr(character.name)}" placeholder="例如：小晴" required>
            <p class="error-text hidden" id="nameError">請替這位朋友取一個名字。</p>
          </div>
          <div class="form-field">
            <label for="characterDescription">角色描述 <button class="button button-quiet button-small" id="optimizeButton" type="button">✦ 幫我潤飾</button></label>
            <textarea class="textarea" id="characterDescription" name="description" maxlength="12000" placeholder="例如：你是一位溫暖、幽默的老朋友。善於傾聽，不急著給建議……" required>${html(character.description)}</textarea>
            <p class="field-hint">可以包含個性、說話方式、擅長話題與你希望保留的界線。</p>
            <p class="error-text hidden" id="descriptionError">請寫下一小段角色描述。</p>
          </div>
          <div class="form-field">
            <label for="voiceName">聲音</label>
            <select class="select" id="voiceName" name="voiceName">${VOICES.map((voice) => `<option value="${attr(voice)}" ${voice === character.voiceName ? "selected" : ""}>${html(voice || "系統預設")}</option>`).join("")}</select>
            <p class="field-hint">Gemini 提供 30 種預設聲線；實際音色會依模型版本略有差異。</p>
          </div>
          <div class="form-field">
            <span class="field-label">代表色</span>
            <div class="accent-row">${ACCENTS.map((color) => `<label class="accent-choice" style="--swatch:${color}"><input type="radio" name="accent" value="${color}" ${color === character.accent ? "checked" : ""}><span aria-label="${color}"></span></label>`).join("")}</div>
          </div>
          <div class="form-actions">
            ${existing ? `<button class="button button-danger" type="button" data-action="delete-character" data-id="${attr(existing.id)}">刪除</button>` : ""}
            <button class="button button-secondary" type="button" data-action="home">取消</button>
            <button class="button button-primary" type="submit">${existing ? "儲存變更" : "建立朋友"}</button>
          </div>
        </section>
        <aside class="panel preview-card" id="characterPreview" style="--preview-accent:${attr(character.accent)}">
          <span class="eyebrow">Preview</span>
          <div class="preview-avatar" id="previewAvatar">${html(initial(character.name || "？"))}</div>
          <h3 id="previewName">${html(character.name || "還沒有名字")}</h3>
          <p id="previewDescription">${html(shorten(character.description || "在這裡預覽你們的第一張朋友卡片。", 70))}</p>
          <div class="preview-meta"><span class="tag" id="previewVoice">♪ ${html(character.voiceName || "預設聲音")}</span></div>
        </aside>
      </form>
    </div>`;

  const form = document.getElementById("characterForm");
  form.addEventListener("input", updateCharacterPreview);
  form.addEventListener("submit", (event) => saveCharacterForm(event, existing));
  document.getElementById("optimizeButton").addEventListener("click", optimizeDescription);
}

function updateCharacterPreview() {
  const form = document.getElementById("characterForm");
  const values = new FormData(form);
  const name = String(values.get("name") || "").trim();
  const description = String(values.get("description") || "").trim();
  const accent = String(values.get("accent") || ACCENTS[0]);
  document.getElementById("previewName").textContent = name || "還沒有名字";
  document.getElementById("previewAvatar").textContent = initial(name || "？");
  document.getElementById("previewDescription").textContent = shorten(description || "在這裡預覽你們的第一張朋友卡片。", 70);
  document.getElementById("previewVoice").textContent = `♪ ${values.get("voiceName") || "預設聲音"}`;
  document.getElementById("characterPreview").style.setProperty("--preview-accent", accent);
}

function saveCharacterForm(event, existing) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const input = {
    name: String(values.get("name") || "").trim(),
    description: String(values.get("description") || "").trim(),
    voiceName: String(values.get("voiceName") || ""),
    accent: String(values.get("accent") || ACCENTS[0]),
  };
  document.getElementById("nameError").classList.toggle("hidden", Boolean(input.name));
  document.getElementById("descriptionError").classList.toggle("hidden", Boolean(input.description));
  if (!input.name || !input.description) return;
  if (existing) data.characters = data.characters.map((item) => item.id === existing.id ? updateCharacter(existing, input) : item);
  else data.characters.push(createCharacter(input));
  persist();
  toast(existing ? "角色設定已更新。" : `已建立 ${input.name}，現在可以開始聊天了。`);
  navigate("home");
}

async function optimizeDescription() {
  const key = getApiKey();
  if (!key) {
    toast("請先在偏好設定輸入 Gemini API key。", true);
    return;
  }
  const button = document.getElementById("optimizeButton");
  const name = document.getElementById("characterName").value.trim();
  const field = document.getElementById("characterDescription");
  if (!field.value.trim()) return toast("先寫幾句原始想法，我才能幫你潤飾。", true);
  setBusy(button, true, "潤飾中…");
  try {
    field.value = await optimizeCharacter(key, data.settings.flashModel, name, field.value.trim());
    updateCharacterPreview();
    toast("已潤飾角色描述，你仍可自由修改。 ");
  } catch (error) { toast(error.message, true); }
  finally { setBusy(button, false); }
}

function renderMemories() {
  const character = characterById(route.id);
  if (!character) return navigate("home");
  const memories = memoriesFor(character.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const used = memories.reduce((sum, item) => sum + estimateTokens(item.content), 0);
  const budget = data.settings.memoryBudgetTokens;
  const ratio = Math.min(100, Math.round((used / Math.max(1, budget)) * 100));
  appElement.innerHTML = `
    <div class="page">
      <button class="back-button" type="button" data-action="home">← 返回朋友列表</button>
      <header class="page-header">
        <div><span class="eyebrow">Long-term memory</span><h1>${html(character.name)}記得的事</h1><p>這些記憶只屬於你和 ${html(character.name)}，可隨時修正或刪除。</p></div>
      </header>
      <section class="panel memory-summary">
        <div>
          <div class="budget-copy"><span>記憶預算</span><span>約 ${used.toLocaleString()} / ${budget.toLocaleString()} tokens</span></div>
          <div class="budget-track"><div class="budget-fill ${used > budget ? "is-over" : ""}" style="--budget:${ratio}%"></div></div>
          <p class="field-hint">超過預算時，AI 會在通話結束後整併未鎖定的內容。</p>
        </div>
        <button class="button button-primary" type="button" data-action="new-memory" data-id="${attr(character.id)}">＋ 新增記憶</button>
      </section>
      ${memories.length ? `<section class="memory-list">${memories.map(memoryCard).join("")}</section>` : `
        <section class="empty-state"><div><span class="empty-mark">⌘</span><h2>還沒有留下記憶</h2><p>你可以手動新增；語音對話結束後，AI 也會挑出值得長期記住的事。</p><button class="button button-primary" type="button" data-action="new-memory" data-id="${attr(character.id)}">新增第一條記憶</button></div></section>`}
    </div>`;
}

function memoryCard(memory) {
  return `
    <article class="memory-item">
      <span class="memory-symbol" aria-hidden="true">${memory.locked ? "◆" : "⌘"}</span>
      <div><p class="memory-content">${html(memory.content)}</p><div class="memory-meta"><span class="${memory.locked ? "locked-label" : ""}">${memory.locked ? "◆ 已鎖定" : "AI 記錄"}</span><span>${formatDate(memory.updatedAt)}</span><span>約 ${estimateTokens(memory.content)} tokens</span></div></div>
      <button class="icon-button" type="button" data-action="edit-memory" data-id="${attr(memory.id)}" aria-label="編輯記憶">✎</button>
    </article>`;
}

function openMemoryEditor(memory, characterId) {
  const isNew = !memory;
  openModal(`
    <form class="modal-card" id="memoryForm">
      <h2>${isNew ? "新增一段記憶" : "編輯這段記憶"}</h2>
      <p>手動新增或編輯的內容預設鎖定，AI 整併時不會更動。</p>
      <div class="form-field"><label for="memoryContent">記憶內容</label><textarea class="textarea" id="memoryContent" maxlength="4000" required placeholder="例如：使用者養了一隻叫 Mochi 的貓">${html(memory?.content || "")}</textarea></div>
      <div class="switch-row"><div class="switch-copy"><strong>鎖定這條記憶</strong><small>避免 AI 在日後整理時改寫或移除</small></div><label class="switch"><input id="memoryLocked" type="checkbox" ${memory?.locked !== false ? "checked" : ""}><span></span></label></div>
      <div class="modal-actions">${isNew ? "" : `<button class="button button-danger" id="deleteMemoryButton" type="button">刪除</button>`}<button class="button button-secondary" type="button" data-close-modal>取消</button><button class="button button-primary" type="submit">儲存</button></div>
    </form>`, () => {
      const form = document.getElementById("memoryForm");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const content = document.getElementById("memoryContent").value.trim();
        if (!content) return;
        const locked = document.getElementById("memoryLocked").checked;
        if (memory) data.memories = data.memories.map((item) => item.id === memory.id ? updateMemory(memory, content, locked) : item);
        else data.memories.push(createMemory(characterId, content, locked));
        persist();
        modal.close();
        renderMemories();
        toast(isNew ? "已新增記憶。" : "記憶已更新。 ");
      });
      document.querySelector("[data-close-modal]").addEventListener("click", () => modal.close());
      document.getElementById("deleteMemoryButton")?.addEventListener("click", () => {
        data.memories = data.memories.filter((item) => item.id !== memory.id);
        persist();
        modal.close();
        renderMemories();
        toast("已刪除記憶。 ");
      });
    });
}

function renderSettings() {
  const settings = data.settings;
  const thinking = getLiveThinkingOption(settings.liveThinkingLevel);
  const thinkingIndex = Math.max(0, LIVE_THINKING_OPTIONS.indexOf(thinking));
  appElement.innerHTML = `
    <div class="page">
      <header class="page-header"><div><span class="eyebrow">Preferences</span><h1>偏好設定</h1><p>BYOK 直連 Gemini；本站沒有帳號、雲端資料庫或應用程式後端。</p></div></header>
      <form id="settingsForm" class="settings-grid">
        <section class="panel">
          <h2>Gemini API</h2><p class="panel-intro">金鑰只會由瀏覽器直接傳給 Google。</p>
          <div class="form-field"><label for="apiKey">Gemini API key</label><div class="secret-wrap"><input class="input" id="apiKey" type="password" autocomplete="off" value="${attr(getApiKey())}" placeholder="AIza…"><button class="secret-toggle" type="button" data-action="toggle-secret" data-target="apiKey">顯示</button></div></div>
          <div class="switch-row"><div class="switch-copy"><strong>在這個瀏覽器記住金鑰</strong><small>關閉時只保留到此分頁／瀏覽器工作階段結束</small></div><label class="switch"><input id="rememberApiKey" type="checkbox" ${settings.rememberApiKey ? "checked" : ""}><span></span></label></div>
          <div class="setting-divider"></div>
          <div class="form-field"><label for="liveModel">Live 模型 <small>語音通話使用</small></label><select class="select" id="liveModel">${LIVE_MODEL_OPTIONS.map((option) => `<option value="${attr(option.id)}" ${option.id === settings.liveModel ? "selected" : ""}>${html(option.label)}</option>`).join("")}</select><p class="field-hint">3.1 以低延遲同步工具呼叫為主；2.5 支援 NON_BLOCKING 非同步工具呼叫，工具結果會在模型空閒時回報。</p></div>
          <div class="form-field">
            <label class="thinking-label" for="settingsThinkingLevel"><span>思考強度 <small>套用到所有角色</small></span><output id="thinkingValue" for="settingsThinkingLevel">${html(thinking.label)}</output></label>
            <input class="thinking-range" id="settingsThinkingLevel" type="range" min="0" max="${LIVE_THINKING_OPTIONS.length - 1}" step="1" value="${thinkingIndex}" aria-valuetext="${attr(thinking.label)}">
            <div class="thinking-scale" aria-hidden="true">${LIVE_THINKING_OPTIONS.map((option) => `<span>${html(option.label)}</span>`).join("")}</div>
            <p class="thinking-description" id="thinkingHint">${html(describeLiveThinking(settings.liveModel, thinking.id))}</p>
          </div>
          <div class="form-field"><label for="flashModel">Flash 模型 <small>記憶與潤飾</small></label><input class="input" id="flashModel" value="${attr(settings.flashModel)}"></div>
          <button class="button button-secondary button-small" type="button" id="testConnectionButton">測試連線</button><p class="status-text" id="connectionStatus"></p>
        </section>
        <section class="panel">
          <h2>記憶與上下文</h2><p class="panel-intro">每位角色的記憶彼此隔離，逐字稿不會保存。</p>
          <div class="form-field"><label for="memoryBudget">每位角色記憶預算 <small>tokens</small></label><input class="input" id="memoryBudget" type="number" min="200" max="100000" value="${settings.memoryBudgetTokens}"><p class="field-hint">超過時只整併未鎖定的記憶。</p></div>
          <div class="form-field"><label for="triggerTokens">上下文壓縮觸發 <small>tokens</small></label><input class="input" id="triggerTokens" type="number" min="1000" max="1000000" value="${settings.triggerTokens}"></div>
          <div class="security-banner"><span>⌁</span><div><strong>關於 localStorage</strong>角色與記憶會一直保留，直到你清除網站資料。它們不會跨瀏覽器同步，也不等同加密儲存。</div></div>
        </section>
        <section class="panel">
          <h2>即時查詢</h2><p class="panel-intro">讓朋友在通話中查詢近期資訊與附近地點。</p>
          <div class="switch-row"><div class="switch-copy"><strong>啟用即時查詢工具</strong><small>透過 Gemini 的 Google 搜尋／地圖建立基準</small></div><label class="switch"><input id="toolsEnabled" type="checkbox" ${settings.toolsEnabled ? "checked" : ""}><span></span></label></div>
          <div class="setting-divider"></div>
          <div class="switch-row"><div class="switch-copy"><strong>允許附近地點查詢</strong><small>只有模型需要查附近地點時才向瀏覽器請求定位</small></div><label class="switch"><input id="locationEnabled" type="checkbox" ${settings.locationEnabled ? "checked" : ""}><span></span></label></div>
          <div class="form-field" style="margin-top:20px"><label for="groundingModel">查詢模型</label><input class="input" id="groundingModel" value="${attr(settings.groundingModel)}"></div>
          <div class="form-field"><label for="tavilyKey">Tavily API key <small>選填備援</small></label><div class="secret-wrap"><input class="input" id="tavilyKey" type="password" autocomplete="off" value="${attr(getTavilyKey())}" placeholder="tvly-…"><button class="secret-toggle" type="button" data-action="toggle-secret" data-target="tavilyKey">顯示</button></div></div>
        </section>
        <section class="panel">
          <h2>本機資料</h2><p class="panel-intro">備份包含角色、設定與記憶，不包含任何 API key。</p>
          <div class="hero-actions"><button class="button button-secondary" type="button" id="exportButton">匯出備份</button><button class="button button-secondary" type="button" id="importButton">匯入備份</button><input class="hidden" id="importFile" type="file" accept="application/json,.json"><button class="button button-danger" type="button" id="resetButton">清除全部資料</button></div>
        </section>
        <section class="panel span-two">
          <div class="form-actions" style="padding-top:0;border:0"><button class="button button-primary" type="submit">儲存偏好設定</button></div>
        </section>
      </form>
    </div>`;

  document.getElementById("settingsForm").addEventListener("submit", saveSettings);
  document.getElementById("liveModel").addEventListener("change", renderSettingsThinking);
  document.getElementById("settingsThinkingLevel").addEventListener("input", renderSettingsThinking);
  document.getElementById("testConnectionButton").addEventListener("click", testConnection);
  document.getElementById("exportButton").addEventListener("click", exportData);
  document.getElementById("importButton").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", importData);
  document.getElementById("resetButton").addEventListener("click", confirmReset);
}

function saveSettings(event) {
  event.preventDefault();
  const apiKey = document.getElementById("apiKey").value.trim();
  const tavilyKey = document.getElementById("tavilyKey").value.trim();
  const remember = document.getElementById("rememberApiKey").checked;
  data.settings = {
    ...data.settings,
    liveModel: document.getElementById("liveModel").value,
    liveThinkingLevel: selectedSettingsThinkingOption().id,
    flashModel: document.getElementById("flashModel").value.trim(),
    groundingModel: document.getElementById("groundingModel").value.trim(),
    memoryBudgetTokens: rangedNumber(document.getElementById("memoryBudget").value, 200, 100000, 3000),
    triggerTokens: rangedNumber(document.getElementById("triggerTokens").value, 1000, 1000000, 25600),
    rememberApiKey: remember,
    toolsEnabled: document.getElementById("toolsEnabled").checked,
    locationEnabled: document.getElementById("locationEnabled").checked,
  };
  saveSecrets(apiKey, tavilyKey, remember);
  persist();
  toast("偏好設定已儲存。 ");
}

function selectedSettingsThinkingOption() {
  const slider = document.getElementById("settingsThinkingLevel");
  return LIVE_THINKING_OPTIONS[Number(slider?.value)] || LIVE_THINKING_OPTIONS[0];
}

function renderSettingsThinking() {
  const thinking = selectedSettingsThinkingOption();
  const model = document.getElementById("liveModel").value;
  document.getElementById("thinkingValue").value = thinking.label;
  document.getElementById("thinkingHint").textContent = describeLiveThinking(model, thinking.id);
  document.getElementById("settingsThinkingLevel").setAttribute("aria-valuetext", thinking.label);
}

async function testConnection() {
  const key = document.getElementById("apiKey").value.trim();
  const liveModel = document.getElementById("liveModel").value;
  const flashModel = document.getElementById("flashModel").value.trim();
  const button = document.getElementById("testConnectionButton");
  const status = document.getElementById("connectionStatus");
  if (!key || !flashModel) {
    status.textContent = "請先輸入 API key 與模型名稱。";
    status.className = "status-text is-error";
    return;
  }
  setBusy(button, true, "測試中…");
  status.textContent = "正在向 Gemini 驗證模型存取權…";
  status.className = "status-text";
  try {
    await Promise.all([checkModel(key, liveModel), checkModel(key, flashModel)]);
    status.textContent = `連線成功，可使用 ${liveModel} 與 ${flashModel}。`;
    status.className = "status-text is-success";
  } catch (error) {
    status.textContent = error.message;
    status.className = "status-text is-error";
  } finally { setBusy(button, false); }
}

function exportData() {
  const blob = new Blob([exportBackup(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `myfriends-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("備份已匯出，不含 API key。 ");
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    data = saveData(importBackup(await file.text()));
    toast(`已匯入 ${data.characters.length} 位朋友與 ${data.memories.length} 條記憶。`);
    renderSettings();
  } catch (error) { toast(error.message, true); }
}

function confirmReset() {
  openConfirm({
    title: "清除所有本機資料？",
    message: "角色、記憶、設定與保存在瀏覽器的 API key 都會刪除。這個動作無法復原。",
    confirmLabel: "全部清除",
    danger: true,
    onConfirm: () => {
      data = resetAllData();
      modal.close();
      toast("所有本機資料已清除。 ");
      navigate("home");
    },
  });
}

function renderCall() {
  const call = activeCall;
  if (!call) return navigate("home");
  const character = call.character;
  appElement.innerHTML = `
    <div class="page call-page">
      <section class="call-stage" style="--call-accent:${attr(character.accent)}">
        <div class="call-top">
          <button class="back-button" style="margin:0" type="button" data-action="leave-call">← 返回</button>
          <div class="connection" id="connectionState"><span class="connection-dot"></span><span id="connectionText">準備好了</span></div>
        </div>
        <div class="call-person" id="callPerson">
          <div class="call-avatar-wrap"><span class="sound-ring"></span><div class="call-avatar">${html(initial(character.name))}</div></div>
          <h1>${html(character.name)}</h1>
          <p id="callPrompt">按下開始，允許麥克風後就能自然說話</p>
        </div>
        <div class="transcript" id="transcript" aria-live="polite"><div class="transcript-empty">你們的即時字幕會出現在這裡<br>逐字稿只用於會後整理，不會被保存</div></div>
        <div class="call-controls"><button class="call-button" id="callButton" type="button" data-action="start-call">● 開始對話</button></div>
        <p class="call-footnote">建議戴耳機，能減少回音與誤觸發插話。</p>
      </section>
    </div>`;
  updateCallUi();
  updateTranscript();
}

function createCallState(character) {
  return {
    character,
    status: "ready",
    collector: new TranscriptCollector(),
    session: null,
    audio: null,
    started: false,
    ended: false,
    ending: false,
    sessionOpened: false,
    startCuePlayed: false,
    memoryStatus: "",
  };
}

async function startCall() {
  const call = activeCall;
  if (!call || call.started || call.ending) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    toast("開始對話前，請先設定 Gemini API key。", true);
    navigate("settings");
    return;
  }
  call.started = true;
  call.status = "permission";
  updateCallUi();
  try {
    call.audio = new BrowserAudioEngine({ onAudioChunk: (bytes) => call.session?.sendAudio(bytes) });
    await call.audio.start();
    const memories = memoriesFor(call.character.id).map((item) => item.content);
    call.session = new LiveSession({
      apiKey,
      model: data.settings.liveModel,
      thinkingLevel: data.settings.liveThinkingLevel,
      character: call.character,
      systemInstruction: buildSystemPrompt(call.character.description, memories),
      triggerTokens: data.settings.triggerTokens,
      toolsEnabled: data.settings.toolsEnabled,
      toolContext: {
        apiKey,
        tavilyKey: getTavilyKey(),
        model: data.settings.groundingModel,
        locationEnabled: data.settings.locationEnabled,
        onActivity: (label) => { call.collector.onTool(label); updateTranscript(); },
      },
    }, {
      onStatus: (status) => {
        call.status = status;
        updateCallUi();
        if (status === "listening" && !call.startCuePlayed) {
          call.sessionOpened = true;
          call.startCuePlayed = true;
          void call.audio?.playSessionCue("start");
        }
      },
      onAudio: (bytes) => call.audio?.playPcm24k(bytes),
      onUserTranscript: (text) => { call.collector.onUser(text); updateTranscript(); },
      onModelTranscript: (text) => { call.collector.onModel(text); updateTranscript(); },
      onInterrupted: () => { call.audio?.flushPlayback(); call.collector.onInterrupted(); updateTranscript(); },
      onTurnComplete: () => { call.collector.onTurnComplete(); updateTranscript(); },
      onError: (error) => toast(error.message, true),
    });
    call.session.start();
  } catch (error) {
    call.started = false;
    call.status = "failed";
    await call.audio?.stop();
    call.audio = null;
    updateCallUi();
    toast(`無法開始通話：${error.message}`, true);
  }
}

async function endCall({ goHome = false, nextRoute = null } = {}) {
  const call = activeCall;
  if (!call || call.ending) return;
  if (call.ended) {
    activeCall = null;
    if (nextRoute) { route = nextRoute; render(); }
    else if (goHome) navigate("home");
    return;
  }
  call.ending = true;
  call.status = "stopped";
  updateCallUi();
  call.session?.stop();
  call.audio?.flushPlayback();
  if (call.sessionOpened) await call.audio?.playSessionCue("end");
  await call.audio?.stop();
  call.ended = true;
  call.ending = false;
  call.memoryStatus = "正在整理這次對話的記憶…";
  const transcript = call.collector.snapshot();
  updateCallUi();
  updateTranscript();

  memoryJob = processCallMemory(call.character, transcript)
    .then((message) => {
      call.memoryStatus = message;
      toast(message);
      if (activeCall === call && route.view === "call") updateCallUi();
    })
    .catch((error) => {
      call.memoryStatus = `記憶更新失敗：${error.message}`;
      toast(call.memoryStatus, true);
      if (activeCall === call && route.view === "call") updateCallUi();
    });

  if (nextRoute || goHome) {
    activeCall = null;
    route = nextRoute || { view: "home", id: null };
    render();
  }
}

async function processCallMemory(character, transcript) {
  if (!transcript.length) return "這次沒有可整理的對話內容。";
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("找不到 Gemini API key");
  const current = memoriesFor(character.id);
  const additions = await extractMemories(apiKey, data.settings.flashModel, character.name, transcript, current.map((item) => item.content));
  additions.forEach((content) => data.memories.push(createMemory(character.id, content, false)));

  let all = memoriesFor(character.id);
  const total = all.reduce((sum, item) => sum + estimateTokens(item.content), 0);
  if (total > data.settings.memoryBudgetTokens) {
    const locked = all.filter((item) => item.locked);
    const unlocked = all.filter((item) => !item.locked);
    if (unlocked.length) {
      const lockedTokens = locked.reduce((sum, item) => sum + estimateTokens(item.content), 0);
      const target = Math.max(200, data.settings.memoryBudgetTokens - lockedTokens);
      const merged = await consolidateMemories(apiKey, data.settings.flashModel, unlocked.map((item) => item.content), target);
      if (merged.length) {
        const unlockedIds = new Set(unlocked.map((item) => item.id));
        data.memories = data.memories.filter((item) => !unlockedIds.has(item.id));
        merged.forEach((content) => data.memories.push(createMemory(character.id, content, false)));
      }
    }
  }
  persist();
  return additions.length ? `已為 ${character.name} 新增 ${additions.length} 條記憶。` : "這次對話沒有需要新增的長期記憶。";
}

function updateCallUi() {
  const call = activeCall;
  const state = document.getElementById("connectionState");
  const text = document.getElementById("connectionText");
  const prompt = document.getElementById("callPrompt");
  const button = document.getElementById("callButton");
  const person = document.getElementById("callPerson");
  if (!call || !state || !button) return;
  const labels = {
    ready: "準備好了",
    permission: "等待麥克風權限…",
    connecting: "正在連線…",
    reconnecting: "重新連線中…",
    listening: "正在聽你說",
    speaking: `${call.character.name} 說話中`,
    failed: "連線失敗",
    stopped: call.memoryStatus || "通話已結束",
  };
  text.textContent = labels[call.status] || call.status;
  state.className = `connection ${call.status === "listening" ? "is-listening" : call.status === "speaking" ? "is-speaking" : call.status === "failed" ? "is-error" : ""}`;
  person.classList.toggle("is-live", call.status === "speaking" || call.status === "listening");
  if (call.status === "listening") prompt.textContent = "正在聽你說，隨時可以自然插話";
  else if (call.status === "speaking") prompt.textContent = "你可以在任何時候開口打斷";
  else if (call.ended) prompt.textContent = call.memoryStatus || "通話已結束";
  if (call.ended) {
    button.textContent = "返回朋友列表";
    button.className = "call-button";
    button.dataset.action = "finish-call";
    button.disabled = false;
  } else if (call.started) {
    button.textContent = "■ 結束對話";
    button.className = "call-button is-end";
    button.dataset.action = "end-call";
    button.disabled = call.ending;
  } else {
    button.textContent = call.status === "permission" ? "等待授權…" : "● 開始對話";
    button.className = "call-button";
    button.dataset.action = "start-call";
    button.disabled = call.status === "permission";
  }
}

function updateTranscript() {
  const transcript = document.getElementById("transcript");
  if (!transcript || !activeCall) return;
  const lines = activeCall.collector.preview();
  transcript.innerHTML = lines.length ? lines.map((line) => {
    if (line.role === "tool") return `<div class="transcript-tool">${html(line.text)}</div>`;
    const label = line.role === "user" ? "你" : activeCall.character.name;
    return `<div class="transcript-line ${line.role === "model" ? "is-model" : ""}"><strong>${html(label)}</strong><p>${html(line.text)}</p></div>`;
  }).join("") : `<div class="transcript-empty">你們的即時字幕會出現在這裡<br>逐字稿只用於會後整理，不會被保存</div>`;
  transcript.scrollTop = transcript.scrollHeight;
}

async function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id, target } = button.dataset;
  if (action === "home") navigate("home");
  else if (action === "new-character") navigate("edit");
  else if (action === "edit") navigate("edit", id);
  else if (action === "memories") navigate("memories", id);
  else if (action === "call") navigate("call", id);
  else if (action === "delete-character") confirmDeleteCharacter(id);
  else if (action === "new-memory") openMemoryEditor(null, id);
  else if (action === "edit-memory") {
    const memory = data.memories.find((item) => item.id === id);
    if (memory) openMemoryEditor(memory, memory.characterId);
  } else if (action === "toggle-secret") {
    const input = document.getElementById(target);
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "顯示" : "隱藏";
  } else if (action === "start-call") await startCall();
  else if (action === "end-call") await endCall();
  else if (action === "leave-call") await endCall({ goHome: true });
  else if (action === "finish-call") { activeCall = null; navigate("home"); }
}

function confirmDeleteCharacter(id) {
  const character = characterById(id);
  if (!character) return;
  const count = memoriesFor(id).length;
  openConfirm({
    title: `刪除「${character.name}」？`,
    message: `${count ? `你們之間的 ${count} 條記憶也會一起刪除。` : "這位角色會從瀏覽器中刪除。"}這個動作無法復原。`,
    confirmLabel: "刪除角色",
    danger: true,
    onConfirm: () => {
      data.characters = data.characters.filter((item) => item.id !== id);
      data.memories = data.memories.filter((item) => item.characterId !== id);
      persist();
      modal.close();
      toast(`已刪除 ${character.name}。`);
      navigate("home");
    },
  });
}

function openConfirm({ title, message, confirmLabel, danger, onConfirm }) {
  openModal(`<div class="modal-card"><h2>${html(title)}</h2><p>${html(message)}</p><div class="modal-actions"><button class="button button-secondary" type="button" id="cancelConfirm">取消</button><button class="button ${danger ? "button-danger" : "button-primary"}" type="button" id="acceptConfirm">${html(confirmLabel)}</button></div></div>`, () => {
    document.getElementById("cancelConfirm").addEventListener("click", () => modal.close());
    document.getElementById("acceptConfirm").addEventListener("click", onConfirm);
  });
}

function openModal(markup, onOpen) {
  modal.innerHTML = markup;
  modal.showModal();
  onOpen?.();
}

function persist() { data = saveData(data); }
function characterById(id) { return data.characters.find((item) => item.id === id); }
function memoriesFor(characterId) { return data.memories.filter((item) => item.characterId === characterId); }

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早安";
  if (hour < 18) return "午安";
  return "晚安";
}

function initial(value) { return Array.from(String(value || "？"))[0] || "？"; }
function shorten(value, length) { return value.length > length ? `${value.slice(0, length)}…` : value; }
function formatDate(timestamp) { return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "short", day: "numeric" }).format(new Date(timestamp)); }
function rangedNumber(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback; }

function html(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
function attr(value) { return html(value).replace(/`/g, "&#96;"); }

function setBusy(button, busy, busyLabel = "處理中…") {
  if (!button) return;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.originalLabel;
}

function toast(message, isError = false) {
  const element = document.createElement("div");
  element.className = `toast ${isError ? "is-error" : ""}`;
  element.textContent = message;
  toastRegion.appendChild(element);
  setTimeout(() => element.remove(), 4500);
}

class TranscriptCollector {
  constructor() {
    this.lines = [];
    this.userBuffer = "";
    this.modelBuffer = "";
  }
  onUser(text) { this.flushModel(); this.userBuffer = mergePartial(this.userBuffer, text); }
  onModel(text) { this.flushUser(); this.modelBuffer = mergePartial(this.modelBuffer, text); }
  onInterrupted() { this.flushModel(); }
  onTurnComplete() { this.flushUser(); this.flushModel(); }
  onTool(text) { this.flushUser(); this.flushModel(); this.lines.push({ role: "tool", text }); }
  flushUser() {
    const text = this.userBuffer.trim();
    if (text) this.lines.push({ role: "user", text });
    this.userBuffer = "";
  }
  flushModel() {
    const text = this.modelBuffer.trim();
    if (text) this.lines.push({ role: "model", text });
    this.modelBuffer = "";
  }
  preview() {
    const output = [...this.lines];
    const userText = this.userBuffer.trim();
    const modelText = this.modelBuffer.trim();
    if (userText) output.push({ role: "user", text: userText });
    if (modelText) output.push({ role: "model", text: modelText });
    return output;
  }
  snapshot() { this.flushUser(); this.flushModel(); return this.lines.filter((line) => line.role !== "tool"); }
}
