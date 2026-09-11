# 計劃書 — 尾牙主持人 Nami（Gemini Live + VRM Avatar）

## 0. 與既有專案的關係（重要修正）

規劃這個資料夾之前，先完整看過 `Avatar/` 資料夾才發現：它**不只是一份 PRD**，而是一個已經可以動的完整實作——`Avatar/index.html` + `Avatar/app.js`（three.js + `@pixiv/three-vrm` + Gemini Live WebSocket + client-side lip sync，全部串好了）、`Avatar/SpringSnow無料版.vrm`（實際的 VRM 模型檔）、以及一組共用小工具模組。這個發現改變了原本的規劃方向：**YearEndParty 不是從 PRD 重新做一個 Avatar 系統，而是直接 fork `Avatar/app.js` 這份已驗證可動的程式碼，在上面加尾牙主持人需要的行為。**

| 來源 | 提供什麼 | 在本專案中的角色 |
| --- | --- | --- |
| `Avatar/app.js`（1049 行） | 完整、已可運作的 VRM 渲染、State Machine、Lip Sync、Gemini Live WebSocket client、情緒 tool call、逐字稿、設定面板 | **直接 fork 並修改**，是 YearEndParty/app.js 的基礎 |
| `Avatar/SpringSnow無料版.vrm`（15.6 MB） | 實際的 VRM 角色模型 | 透過相對路徑 `../Avatar/...` 重用同一份檔案，**不複製** |
| `Avatar/washi-enso.png`、`Avatar/favicon.svg` | 舞台背景圖、favicon | 同樣以相對路徑重用 |
| `Avatar/avatar-emotions.js`、`live-audio-policy.js`、`session-context.js`、`transcript.js` | Emotion function-calling tool、音訊播放策略、session 環境上下文、逐字稿正規化等小工具模組 | 以 ES module 相對匯入重用，不重複貼一份程式碼 |
| `Avatar/PRD — Gemini Live Web Avatar.md`、`TECHNICAL_SPEC.md` | 原始架構設計文件 | 佐證 `app.js` 的設計決策（分層、State Machine、Lip Sync 原理），本文件不重複抄錄 |

**為什麼重用檔案而不是複製一份：** VRM（15.6 MB）與背景圖（1.8 MB）都是大型二進位檔，repo 裡重複存放同一份角色資產既浪費空間、也會讓兩邊之後各自修改角色時不同步。程式碼邏輯檔（`avatar-emotions.js` 等）體積小、功能單純穩定，用 ES module 相對匯入即可，不需要複製。真正需要「fork 而非重用」的只有 `app.js`／`index.html`／`styles.css`——因為 push-to-talk、Rundown 環節、主持人人設是這個專案獨有的行為，屬於必要的改動。

核心決策沿用上一輪對話的結論：**push-to-talk 由工作人員決定收音**，用 Gemini Live 的 **手動語音活動偵測**（`automaticActivityDetection.disabled: true` + 手動送 `activityStart` / `activityEnd`）實作「按下才聽、放開才輪到 Gemini 講話」——這與 `Avatar/app.js` 目前使用的自動 VAD（`disabled: false`）不同，是這次 fork 的核心修改點。

---

## 1. 專案概述

### 1.1 目標

打造一個瀏覽器端的「尾牙主持人」網頁應用：沿用 Avatar 資料夾裡的 VRM 虛擬角色 Nami，由現場工作人員用 push-to-talk 按鈕跟她對話／下指令，她負責串場、抽獎、帶氣氛、跟台下互動的口白，聲音與嘴型／表情即時同步。

### 1.2 使用情境

尾牙主持人跟原本 Avatar 頁面最大的不同，是它不是「一人一機」的私人對話，而是**有觀眾**的現場演出，操作者（工作人員）與「聽眾」（台下來賓）是分開的兩群人。目前這版原型仍是單一頁面（工作人員自己手上的筆電/平板），畫面同時包含控制項與 Avatar；日後若要投影到大螢幕給全場看，建議另外拆一支「乾淨畫面」（只有 Avatar + 字幕，沒有任何控制項），見第 9 節 Roadmap。

### 1.3 非目標

沿用 Avatar PRD 的原則：不做自建 Backend、GPU Server、伺服器端 Lip Sync/TTS、AI 影片生成、AI 即時生成骨骼動畫。一切維持純前端、Client-side 運算，這點 `Avatar/app.js` 已經完整做到。

---

## 2. 系統架構

沿用 `Avatar/app.js` 已經實作的分層（`GeminiLiveClient` → `EventBus` → `AvatarStateMachine` / `VRMAvatarController` / `LipSyncEngine`，彼此解耦），本專案在這個架構上疊加兩塊新東西：**Push-to-talk 控制**與**Rundown 環節狀態**。

```text
┌────────────────────────────────────────────────────────────────┐
│                            Browser                              │
│                                                                   │
│  工作人員操作                                                      │
│   ├─ 「按住說話」按鈕（pointerdown/up，新增）                        │
│   ├─ Rundown 環節按鈕（開場／抽獎／遊戲／頒獎／自由聊天／尾聲，新增）    │
│   └─ 文字輸入框（沿用既有 composer，可當「現場備註」用）              │
│         │                                                        │
│         ▼                                                        │
│  ┌────────────────────────┐   手動 VAD（本次修改）：                │
│  │ GeminiLiveClient        │   activityStart / audio chunk / activityEnd │
│  │（fork 自 Avatar/app.js） │   文字：realtimeInput.text（環節狀態，沿用既有 sendText）│
│  └───────────┬─────────────┘                                    │
│              │ Gemini Audio 24kHz + function call（沿用既有）        │
│              ▼                                                   │
│  ┌────────────────────┐        ┌──────────────────────┐         │
│  │ GeminiAudioPlayer    │──────▶│ AnalyserNode           │        │
│  │（沿用既有）           │        │（沿用既有 RMS+頻段分類）  │        │
│  └────────────────────┘        └──────────┬───────────┘         │
│                                             ▼                     │
│                                    AvatarStateMachine              │
│                                    （沿用既有 IDLE/LISTENING/       │
│                                     THINKING/SPEAKING/INTERRUPTED）│
│                                             │                     │
│                                             ▼                     │
│                                  VRMAvatarController                │
│                                  （沿用既有：呼吸、眨眼、頭部微動、   │
│                                   表情 crossfade、viseme 嘴型）      │
│                                             │                     │
│                                             ▼                     │
│                         Three.js + ../Avatar/SpringSnow無料版.vrm  │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. 語音互動設計：Push-to-talk（手動 VAD）

### 3.1 為什麼不用自動 VAD

`Avatar/app.js` 目前用 `realtimeInputConfig: { automaticActivityDetection: { disabled: false } }`，讓伺服器自己偵測「使用者講完了」。尾牙現場有背景音樂、群眾噪音、多人同時講話，伺服器端 VAD 很容易誤判，導致主持人搶話或該回應時沒反應。

### 3.2 實際改動（對照 `Avatar/app.js` → `YearEndParty/app.js`）

`GeminiLiveClient.setupMessage()`：

```diff
- realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
+ realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
```

`GeminiLiveClient` 新增兩個方法：

```js
activityStart() { this.send({ realtimeInput: { activityStart: {} } }); }
activityEnd() { this.send({ realtimeInput: { activityEnd: {} } }); }
```

`App` 新增 push-to-talk 按鈕邏輯（用 Pointer Capture，確保放開時一定收得到 `pointerup`，即使手指/滑鼠移出了按鈕範圍——寫法跟 `VRMAvatarController.bindViewControls()` 裡角色拖曳旋轉的作法一致）：

- **按下**：`gemini.activityStart()` → `stateMachine.toListening()`。
- **放開**：`gemini.activityEnd()` → `stateMachine.toThinking()`。這個訊號同時代表「使用者這輪講完了」，Gemini 收到後才會開始生成語音回覆——這就是「按鈕決定何時輪到 Gemini 說話」的具體實作。

麥克風串流本身**在整場通話期間持續開啟**（沿用 `Avatar/app.js` 既有的 `MicrophoneInput`，避免每次按 push-to-talk 都重新跳出瀏覽器權限視窗），只有實際送到 Gemini 的那一步用 `pttActive` 旗標把關：

```diff
- await this.mic.start((pcm) => this.gemini.sendAudio(pcm));
+ await this.mic.start((pcm) => { if (this.pttActive) this.gemini.sendAudio(pcm); });
```

在完全沒有按下按鈕的期間，即使麥克風硬體是開的，也**不會有任何 audio 送進 Gemini**，Gemini 也就完全不會生成語音。

### 3.3 情境感知的落差與補償

session 的對話記憶不會因為沒送 audio 而消失（同一條 WebSocket 內，之前每輪的逐字稿都留著，`Avatar/app.js` 本來就有 `sessionResumption` 與 `contextWindowCompression`）；但 Gemini **無法感知「按鈕沒按時」現場發生的事**，這是協定本質限制，不是靠一直開麥克風能解決的。

因此語音跟文字分工：

- **語音（push-to-talk）**：只負責「這一句要她回應的內容」。
- **文字**：Rundown 環節切換時，把狀態餵給 Gemini。這條路徑**不需要新機制**——`Avatar/app.js` 原本就有 `GeminiLiveClient.sendText(text)`，走 `realtimeInput.text`（原本是給使用者在文字輸入框打字用的），本專案直接重用同一個方法，環節按鈕點擊時呼叫 `gemini.sendText(segment.context)` 即可。原本的文字輸入框則保留給「現場備註」自由填寫使用。

### 3.4 Barge-in（打斷）

`activityHandling` 預設是「新的 `activityStart` 會打斷 Gemini 正在講的話」，這次沒有特別調整這個設定，維持預設——對主持人情境是優點（工作人員隨時能按按鈕搶話喊卡）。原型裡 push-to-talk 按鈕在 Gemini 講話中仍可按下（允許搶話），沒有額外鎖定；是否要加鎖定視覺提示留給日後彩排時依實際體感調整。

---

## 4. Rundown 環節系統

尾牙有既定流程，這是 `Avatar/app.js` 原本沒有、本專案新增的部分。

```js
const SEGMENTS = [
  { id: "opening",    label: "開場",     context: "…" },
  { id: "lucky_draw",  label: "幸運抽獎", context: "…" },
  { id: "game",        label: "遊戲互動", context: "…" },
  { id: "award",       label: "頒獎",     context: "…" },
  { id: "freechat",    label: "自由聊天", context: "…" },
  { id: "closing",     label: "尾聲",     context: "…" },
];
```

- 每個環節對應一段文字（見 `YearEndParty/app.js` 內 `SEGMENTS` 常數的實際內容），切換時透過 `gemini.sendText(segment.context)` 送出。
- 環節切換由工作人員手動點擊，**不**讓 Gemini 自己決定要不要換環節——這條規則寫進了 `REQUIRED_SYSTEM_PROMPT`（系統固定的行為規則，不對工作人員開放編輯），明確要求 Gemini 只依照工作人員切換的環節主持、不要自己宣布換環節、不要自己編造得獎名單。
- 未來可擴充：讓 Gemini 透過 function call 建議換下一段，但由工作人員按確認鍵才真的切換——維持「AI 建議、人決定」。原型未實作。

---

## 5. Function-calling Tools

沿用 `Avatar/avatar-emotions.js` 的 `set_avatar_emotion`（原封不動匯入，見 `YearEndParty/app.js` 開頭的 import），並規劃尾牙場景需要的擴充（原型只接了情緒，其餘列為之後階段）：

| Tool | 用途 | 狀態 |
| --- | --- | --- |
| `set_avatar_emotion` | 表情（neutral/happy/sad/angry/surprised） | 已接上（沿用既有實作） |
| `draw_winner` | 從名單中抽出一位得獎者（實際抽獎邏輯在前端做，Gemini 只負責觸發與口播） | 待做 |
| `play_sound_effect` | 播放音效（歡呼、鼓聲、答錯音，可參考 `Bartender/js/audio.js` 的 sound asset 機制） | 待做 |
| `suggest_next_segment` | 建議切換環節，需工作人員確認 | 待做（可選） |

---

## 6. Avatar / Lip Sync

**這部分不是本次新開發的內容**，完全沿用 `Avatar/app.js` 已經做好、且結構完整的實作，原型直接繼承：

- VRM 載入、骨骼綁定、表情別名解析（`resolveBones` / `resolveExpressions`）。
- Idle 動畫：呼吸（sin 波）、眨眼（隨機間隔 + easing）、頭部/視線微動（低頻疊加正弦波，非逐 frame 隨機）。
- Lip Sync：分析 `GeminiAudioPlayer` 的 `AnalyserNode`，用三段頻率能量（低/中/高頻平均）分類 viseme（`aa`/`ih`/`ou`/`ee`/`oh`），攻擊/釋放不同速率平滑嘴型權重，避免抖動。
- State Machine：`IDLE → LISTENING → THINKING → SPEAKING`，加上 `INTERRUPTED` 分支，各狀態間的動畫權重（`stateWeights`）用指數平滑混合，驅動頭部姿態、身體微晃、呼吸幅度。
- 情緒表情用 300ms 左右的 crossfade（`emotionMix`），不是瞬間切換。

本專案唯一在這塊的改動，只有把 `AVATAR_MODEL_URL` 從 `./SpringSnow無料版.vrm` 改成 `../Avatar/SpringSnow無料版.vrm`（重用同一份 VRM 檔），其餘渲染／動畫程式碼完全沒動。

---

## 7. UI 設計

原型是**單頁**（工作人員自己使用的操作端），在 `Avatar/index.html` 的版面基礎上新增兩塊：

```text
┌───────────────────────────────────────────────┐
│ YEAR END PARTY HOST（原型）      設定 icon        │
├───────────────────────────────┬─────────────────┤
│                                │ Nami／連線狀態      │
│                                ├─────────────────┤
│         Avatar 舞台             │ [開始對話／結束對話] │
│      （沿用既有 VRM 渲染）        ├─────────────────┤
│                                │  ●按住說話         │← 新增，大按鈕
│                                │  (手動VAD說明文字)   │
├───────────────────────────────┤├─────────────────┤
│ RUNDOWN                       │  LIVE TRANSCRIPT  │
│ [開場][抽獎][遊戲][頒獎]         │  （逐字稿，沿用既有） │
│ [自由聊天][尾聲]      ← 新增     │  [文字輸入/現場備註] │
└───────────────────────────────┴─────────────────┘
```

投影端（Stage Display，給觀眾看的乾淨畫面）**規劃但未實作**：只留 Avatar + 字幕，沒有任何控制項；等操作端在真實環境驗證過 push-to-talk 節奏後再拆，避免同時改兩塊互相干擾除錯。

---

## 8. 原型（`index.html` / `app.js` / `styles.css`）實際涵蓋範圍

**有做（可直接測試）：**
- 完整 fork `Avatar/app.js`：VRM 渲染、Lip Sync、State Machine、Gemini Live WebSocket、情緒 tool call、逐字稿、設定面板（API Key / Voice / 主持人人設文字）全部繼承，**不是佔位符，是真的 VRM 角色**。
- 手動 VAD push-to-talk：`realtimeInputConfig.automaticActivityDetection.disabled: true`，按住＝`activityStart`+送audio，放開＝`activityEnd`。
- Rundown 環節按鈕（6 個環節），點擊透過 `realtimeInput.text` 送出環節狀態文字，並在畫面上顯示目前環節。
- 系統提示詞（`REQUIRED_SYSTEM_PROMPT`）已針對尾牙場景調整：熱情口條、不自作主張換環節、收到環節切換文字時簡短承接而非逐字覆誦。
- 沿用既有的斷線自動重試、`sessionResumption`、麥克風錯誤訊息、AudioContext user-gesture 啟動流程。
- 資產重用：VRM／背景圖／favicon／emotion tool／audio policy／session context／transcript 工具全部透過相對路徑指向 `../Avatar/`，沒有複製任何大型二進位檔進這個資料夾。

**沒做（留給後續階段，見第 9 節）：**
- `draw_winner` / `play_sound_effect` / `suggest_next_segment` 等擴充 tool。
- 投影端獨立頁面（Stage Display）。
- Ephemeral token / 正式環境金鑰保護（原型沿用 Avatar 既有的「開發測試用 localStorage 金鑰」模式）。
- 多人（多工作人員）協作、多裝置同步狀態。
- 現場實機的 FPS / 延遲 / 噪音實測與調整。

### 8.1 如何測試

1. 這個原型**不是獨立可攜的資料夾**——它透過相對路徑依賴 `../Avatar/` 底下的檔案，所以必須從 repo 根目錄（`pages/`）起一個涵蓋兩個資料夾的靜態伺服器，例如在 repo 根目錄執行 `python3 -m http.server 4173`，然後開 `http://localhost:4173/YearEndParty/index.html`（不能只把 `YearEndParty/` 資料夾單獨複製出去用）。需要 `https://` 或 `localhost` 才能用麥克風。
2. 點右上角設定 icon，貼上已開通 Gemini Live API 的 API Key，按「開始對話」，允許麥克風權限。
3. 等待狀態變成 `CONNECTED`，按住「按住說話」按鈕說一句話、放開，觀察：狀態變化（LISTENING→THINKING→SPEAKING）、VRM 嘴型與頭部動畫、逐字稿是否正確、放開瞬間是否很快進入回覆（驗證手動 VAD 沒有多等一段靜音判斷時間）。
4. 點 Rundown 環節按鈕，觀察逐字稿面板裡是否出現「環節切換：xxx」的系統訊息，並在下一次對話中觀察 Nami 是否用一兩句話自然承接、而不是逐字複誦。
5. 測試 barge-in：Nami 講話中再按一次「按住說話」，確認會被打斷並回到聆聽狀態。

**這次交付過程中的測試限制說明**：本機驗證了檔案正確部署（HTML/JS/CSS 皆可正常存取、`app.js` 語法檢查通過、HTML 與 JS 之間所有 DOM id 一一對應、VRM／圖片／共用模組的相對路徑皆可正確解析到 `../Avatar/`）。但這個沙箱環境的對外網路政策封鎖了 `cdnjs.cloudflare.com` 與 `cdn.jsdelivr.net`（three.js / `@pixiv/three-vrm` 的來源），所以沒有在這裡實際跑出畫面確認 VRM 有渲染出來——這是**沙箱環境的限制，不是頁面本身的問題**：這兩個 CDN 網域跟 `Avatar/index.html` 原本使用的完全相同，那個頁面本來就能正常動，所以理論上這裡也會動，但請你在自己的瀏覽器上實際打開測試一次以確認。

---

## 9. 開發階段 Roadmap

| Phase | 內容 | 狀態 |
| --- | --- | --- |
| 0 | Fork `Avatar/app.js`：手動 VAD push-to-talk + Rundown 環節文字通道 + 尾牙系統提示詞 | **本次交付** |
| 1 | 擴充 Tools：`draw_winner`、`play_sound_effect`、`suggest_next_segment` | 待開始 |
| 2 | 投影端獨立頁面（Stage Display，只有 Avatar + 字幕） | 待開始 |
| 3 | 現場網路降級方案、金鑰保護（ephemeral token，若要脫離內部測試環境） | 待開始 |
| 4 | 現場彩排：實機 FPS / 延遲 / 噪音下的 push-to-talk 節奏調整 | 待開始 |

---

## 10. 風險與待決策事項

- **API Key 曝露**：沿用 Avatar 既有模式，開發測試用 localStorage 儲存金鑰。若僅在內部封閉網路、限定活動當天使用可接受；要更廣泛使用需導入 ephemeral token。
- **現場網路穩定性**：Gemini Live 走 WebSocket，會場 Wi-Fi 不穩時需要斷線重連（已沿用既有重試邏輯），正式上場前建議實測會場網路。
- **CDN 依賴**：VRM 渲染依賴 `cdnjs.cloudflare.com` 與 `cdn.jsdelivr.net` 兩個外部 CDN（跟 Avatar 頁面相同），若尾牙現場網路對這兩個網域有防火牆限制，頁面會整個載入失敗，建議提前在會場網路環境測試，必要時考慮把 three.js / three-vrm 改成本機打包。
- **噪音環境對麥克風輸入品質的影響**：即使是 push-to-talk，按著按鈕時若背景音樂太大聲，仍可能讓 Gemini 聽錯內容，建議搭配指向性麥克風或降噪 headset mic。
- **VRM 效能**：投影機/現場筆電效能不明，需要實機測試 FPS（Avatar PRD 目標 desktop ≥55、最低 30 FPS）。
- **語音延遲的現場容忍度**：主持人若「思考」太久，現場會冷場，THINKING 狀態已有頭部微動/眨眼掩飾空檔，實際效果仍需現場驗證。
- **決定權歸屬**：目前設計是「環節切換由人決定，AI 不自作主張換環節」，這是為了活動可控性犧牲一些 AI 自主性，需要跟主辦方確認這個取捨是否符合期待。
