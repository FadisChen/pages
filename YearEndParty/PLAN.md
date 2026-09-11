# 計劃書 — 尾牙主持人 Nami（Gemini Live + VRM Avatar）

> 2026-09-11 更新：本文件保留第一版設計紀錄。語音傳輸已由 MediaStream 改為有序 PCM data channel，Gemini／收音／播放已集中為共用模組。**目前實作、問題證據與後續計畫以 [ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md) 為準。**

## 0. 與既有專案的關係

`Avatar/` 資料夾不只是一份 PRD，而是一個已經可以動的完整實作——`Avatar/index.html` + `Avatar/app.js`（three.js + `@pixiv/three-vrm` + Gemini Live WebSocket + client-side lip sync，全部串好了）、`Avatar/SpringSnow無料版.vrm`（實際的 VRM 模型檔）、以及一組共用小工具模組。**YearEndParty 不是從 PRD 重新做一個 Avatar 系統，而是直接 fork `Avatar/app.js` 這份已驗證可動的程式碼，在上面加尾牙主持人需要的行為。**

| 來源 | 提供什麼 | 在本專案中的角色 |
| --- | --- | --- |
| `Avatar/app.js`（1049 行） | 完整、已可運作的 VRM 渲染、State Machine、Lip Sync、Gemini Live WebSocket client、情緒 tool call、逐字稿、設定面板 | **直接 fork 並修改**，是 `stage.js`／`app.js` 的基礎 |
| `Avatar/SpringSnow無料版.vrm`（15.6 MB） | 實際的 VRM 角色模型 | 透過相對路徑 `../Avatar/...` 重用同一份檔案，**不複製** |
| `Avatar/washi-enso.png`、`Avatar/favicon.svg` | 舞台背景圖、favicon | 同樣以相對路徑重用 |
| `Avatar/avatar-emotions.js`、`live-audio-policy.js`、`session-context.js`、`transcript.js` | Emotion function-calling tool、音訊播放策略、session 環境上下文、逐字稿正規化等小工具模組 | 以 ES module 相對匯入重用，不重複貼一份程式碼 |

核心決策：**push-to-talk 由工作人員決定收音**，用 Gemini Live 的 **手動語音活動偵測**（`automaticActivityDetection.disabled: true` + 手動送 `activityStart` / `activityEnd`）實作「按下才聽、放開才輪到 Gemini 講話」。

---

## 0.1 架構修正：投影端與操作端要拆成兩台裝置

第一版原型（`index.html`／`app.js`）把 Avatar 舞台、設定、push-to-talk 按鈕、Rundown 按鈕、逐字稿全部放在同一個網頁——這在討論後發現不符合實際使用情境：**工作人員拿的是手機、投影出去的是另一台接在投影機（與會場音響）上的筆電**，兩者是不同裝置，不能靠同一個瀏覽器內分頁互傳（`BroadcastChannel` 之類的方案只能在同一瀏覽器內的分頁之間用）。

因此拆成三個網頁：

| 檔案 | 裝置 | 職責 |
| --- | --- | --- |
| `stage.html` + `stage.js` + `stage.css` | 投影端筆電（接投影機＋會場音響） | 顯示 VRM Avatar、連線 Gemini Live、播放語音。**不含任何現場控制項**，不顯示字幕/逐字稿。 |
| `operator.html` + `operator.js` + `operator.css` | 工作人員手機 | push-to-talk 收音、Rundown 環節按鈕、現場備註文字、簡易狀態回饋。**不渲染 Avatar、不連 Gemini、不播放聲音**。 |
| `index.html` + `app.js` + `styles.css` | 任何一台裝置（單機） | 保留作為「單機測試模式」：不用兩台裝置、不用配對，直接在同一頁測試 push-to-talk／Rundown 的邏輯是否符合預期，適合正式上場前先驗證行為，不用每次都拉兩台裝置對接。 |

`webrtc-link.js` 是 `stage.js` 與 `operator.js` 共用的小模組，定義配對用的房號產生規則、ICE 伺服器設定、Rundown 環節清單，確保兩邊不會各自漂移。

### 兩台裝置怎麼「牽線」

手機錄到的音訊要送到筆電、筆電才能把音訊丟給 Gemini；Gemini 回覆的語音則在筆電這邊播放（接會場音響），不是手機喇叭。純靜態網頁沒辦法讓兩台不在同一個瀏覽器裡的裝置直接對話，中間需要一個牽線機制——採用 **WebRTC**：

```text
┌─────────────┐   WebRTC 音訊 track（手機麥克風→筆電）      ┌──────────────────┐
│  手機         │ ───────────────────────────────────────▶ │  投影端筆電          │
│ operator.html│                                            │  stage.html         │
│              │   WebRTC data channel（ptt/segment/note）  │                     │
│  收音、按鈕    │ ───────────────────────────────────────▶ │  Gemini Live / VRM   │
│              │ ◀─────────────────────────────────────── │  (播放語音、渲染Avatar)│
│              │   data channel（status/connection/逐字稿） │                     │
└─────────────┘                                            └──────────────────┘
        ▲                                                            ▲
        └───────────── 透過 PeerJS 免費公用訊號伺服器交換連線資訊 ─────┘
                （只負責「牽線」，牽好線之後音訊直接兩機互傳）
```

- 用 **PeerJS** 套件包裝原生 WebRTC API，靠它的免費公用雲端 broker 做「配對」（交換 SDP/ICE 連線資訊），配對成功後音訊與指令直接在兩台裝置間傳送（P2P 打不通時走 PeerJS 的 TURN 中繼），不經過我們自己架的伺服器。
- 投影端筆電開啟 `stage.html` 後自動產生一組房號（例如 `yep-8f3k2a`）並顯示 QR code；手機開啟 `operator.html`，掃碼或輸入房號、按「連線」（同時會跳出麥克風授權），就配對完成。
- 配對成功後，`stage.html` 的配對面板會自動收起，投影出去的畫面只剩 Avatar，不會讓觀眾看到房號或 QR code；筆電右上角有個小圖示可以隨時再打開配對面板（例如手機需要重新配對時）。

### 已知風險

**很多飯店／會場的 Wi-Fi 會做「用戶隔離」**（同網段裝置互相看不到，只能連外網），這種情況下純 STUN 可能打不通，需要 TURN 中繼才能連上；PeerJS 免費雲端不保證提供穩定的 TURN。**正式上場前務必在實際會場網路測過配對**；如果測試發現連不上，`webrtc-link.js` 裡的 `ICE_SERVERS` 陣列已經預留位置，補上自己買的 TURN 服務憑證（例如 Twilio Network Traversal Service、metered.ca 等）即可。

---

## 1. 專案概述

### 1.1 目標

打造一個瀏覽器端的「尾牙主持人」網頁應用：沿用 Avatar 資料夾裡的 VRM 虛擬角色 Nami，由現場工作人員用手機 push-to-talk 遙控，她負責串場、抽獎、帶氣氛、跟台下互動的口白，聲音（透過會場音響）與嘴型／表情即時同步，畫面投影給全場看。

### 1.2 非目標

沿用 Avatar PRD 的原則：不做自建 Backend、GPU Server、伺服器端 Lip Sync/TTS、AI 影片生成、AI 即時生成骨骼動畫。WebRTC 配對用的 PeerJS 公用 broker 只做「牽線」，不算違反這個原則——它不處理任何 AI／音訊／渲染邏輯，純粹是交換連線資訊的中介。

---

## 2. Gemini Live 音訊/State Machine 架構（stage.js）

沿用 `Avatar/app.js` 已經實作的分層（`GeminiLiveClient` → `EventBus` → `AvatarStateMachine` / `VRMAvatarController` / `LipSyncEngine`，彼此解耦）。跟原本 Avatar 頁面的差異只在「輸入來源」：

- **音訊輸入**：原本是本機 `getUserMedia()`；`stage.js` 換成 `RemoteMicInput`，把 WebRTC 從手機傳來的 `MediaStream` 接進 Web Audio pipeline（`createMediaStreamSource` → `ScriptProcessor` → resample → PCM16），其餘完全一樣。
- **控制輸入**：原本是本機按鈕；`stage.js` 改成監聽 `PeerLink`（PeerJS 包裝）送來的 data channel 訊息（`ptt` / `segment` / `note`）。
- **輸出回饋**：`stage.js` 額外把 `avatar.state`、`gemini.status`、逐字稿透過 data channel 廣播回手機，讓操作者知道現在狀態、Gemini 有沒有連線、剛剛聽到/講了什麼。

### 2.1 Push-to-talk（手動 VAD）

`GeminiLiveClient.setupMessage()` 用 `realtimeInputConfig: { automaticActivityDetection: { disabled: true } }`，並新增：

```js
activityStart() { this.send({ realtimeInput: { activityStart: {} } }); }
activityEnd() { this.send({ realtimeInput: { activityEnd: {} } }); }
```

手機端按下 push-to-talk → data channel 送 `{type:'ptt', active:true}` → `stage.js` 呼叫 `gemini.activityStart()`；放開 → 送 `{type:'ptt', active:false}` → `stage.js` 呼叫 `gemini.activityEnd()`（這個訊號同時代表「這輪講完了」，Gemini 收到後才會開始生成語音回覆）。手機的麥克風音訊在整個配對期間持續透過 WebRTC 傳給筆電，筆電只有在 `pttActive` 為真時才把音訊 chunk 轉送給 Gemini——沒按按鈕時，即使音訊「有送到筆電」，也絕不會送進 Gemini。

### 2.2 Rundown 環節與情境感知

環節清單（id/label/context）定義在 `webrtc-link.js` 的 `SEGMENTS`，operator.js 只用 id/label 畫按鈕，stage.js 收到 `{type:'segment', id}` 後查出對應的 `context` 文字，透過既有的 `gemini.sendText()`（`realtimeInput.text`）送給 Gemini。環節切換由工作人員手動決定，系統提示詞（`REQUIRED_SYSTEM_PROMPT`）明確要求 Gemini 不要自己宣布換環節、不要自己編造得獎名單。

---

## 3. Function-calling Tools

沿用 `Avatar/avatar-emotions.js` 的 `set_avatar_emotion`（原封不動匯入）。規劃中、原型未實作的擴充：

| Tool | 用途 |
| --- | --- |
| `draw_winner` | 從名單中抽出一位得獎者（抽獎邏輯在前端做，Gemini 只負責觸發與口播） |
| `play_sound_effect` | 播放音效（歡呼、鼓聲，可參考 `Bartender/js/audio.js` 的 sound asset 機制） |
| `suggest_next_segment` | 建議切換環節，仍需工作人員在手機上按確認才真的切換 |

---

## 4. Avatar / Lip Sync

完全沿用 `Avatar/app.js` 已經做好的實作（VRM 載入、骨骼綁定、表情別名解析、呼吸/眨眼/頭部微動 idle 動畫、以頻段能量分類 viseme 的 lip sync、State Machine 動畫權重混合、情緒 crossfade）。`stage.js` 唯一改動是把 `AVATAR_MODEL_URL` 指到 `../Avatar/SpringSnow無料版.vrm`，其餘渲染／動畫程式碼沒有動。

---

## 5. 三個入口的實際涵蓋範圍

### 5.1 `stage.html`（投影端，正式上場用）
- 沿用 Avatar 的 VRM 渲染／Lip Sync／State Machine／Gemini Live client。
- `RemoteMicInput`：從 WebRTC 遠端 `MediaStream` 擷取音訊，取代本機麥克風。
- `PeerLink`：PeerJS 配對、自動產生房號、QR code、data channel 收發、斷線自動嘗試 reconnect（`peer.reconnect()`）。
- 配對面板：顯示房號＋QR，配對成功後自動收起；右上角圖示可再打開（重新配對用）。
- 「開始對話」按鈕：啟動 AudioContext（需要使用者手勢，瀏覽器 autoplay 政策要求）＋建立 Gemini Live session，活動開始前按一次即可，之後不需要再操作這台筆電。
- 設定面板（API Key／Voice／人設文字）保留，因為 Gemini 連線設定是「事前在筆電上設好一次」的事，不是現場即時控制。

### 5.2 `operator.html`（手機遙控端，正式上場用）
- 配對畫面：輸入/掃碼房號 → 連線（會跳出麥克風授權）。
- Push-to-talk 大按鈕（按住＝送話，放開＝結束這輪換 Gemini 講）。
- 麥克風音量小進度條（視覺回饋「你正在被收音」）。
- Rundown 環節按鈕（跟 `SEGMENTS` 清單一致）。
- 現場備註文字輸入（透過 data channel `note` 轉發成 `gemini.sendText`）。
- 簡易狀態回饋：目前 Nami 狀態（聆聽中/思考中/主持中）、Gemini 連線狀態、最近幾句對話摘要。
- 沒有 VRM、沒有 three.js、沒有 Gemini 連線——頁面很輕，適合手機瀏覽器。

### 5.3 `index.html`（單機測試模式，開發/彩排前快速驗證用）
- 維持第一版原型的設計：同一台裝置上同時有 Avatar、push-to-talk 按鈕、Rundown 按鈕、逐字稿，方便一個人快速測試「按住說話→放開→Gemini 回應」「切環節→Gemini 承接」的行為是否正確，不必每次都找兩台裝置、走配對流程。

### 5.4 尚未做的部分
- `draw_winner` / `play_sound_effect` / `suggest_next_segment` 擴充 tool。
- Ephemeral token / 正式環境金鑰保護（原型沿用「開發測試用 localStorage 金鑰」模式，設定在 `stage.html`）。
- 多支手機同時操作、或操作權轉移。
- 現場實機的 FPS / 延遲 / 噪音 / WebRTC 連通性實測。

### 5.5 如何測試

**單機測試模式**：從 repo 根目錄起靜態伺服器（例如 `python3 -m http.server 4173`），開 `http://localhost:4173/YearEndParty/index.html`（一定要從 repo 根目錄起服務，`../Avatar/` 相對路徑才解析得到）。

**兩機模式**：
1. 同樣從 repo 根目錄起服務，且**必須是 HTTPS 或至少讓兩台裝置都能連到同一個可公開存取的網址**——`localhost` 只在同一台機器上有效，手機開不到筆電的 `localhost`。正式測試建議直接部署到 GitHub Pages（本身就是 HTTPS）之後用手機開真正的網址；本機測試可以用 `ngrok`／類似的內網穿透工具暫時給一個 HTTPS 網址。
2. 筆電開 `stage.html`，貼 API Key（設定 icon）、按「開始對話」。
3. 記下畫面上的房號／掃 QR code。
4. 手機開 `operator.html?room=<房號>`（掃碼會自動帶入），按「連線」，允許麥克風。
5. 手機按住「按住說話」說話、放開，確認筆電那邊 Avatar 有反應、語音有播放；點 Rundown 按鈕，確認 Nami 有承接環節切換。

**這次交付過程中的測試限制**：本機驗證了檔案正確部署（`stage.html`/`operator.html`/`webrtc-link.js` 等皆可正常存取、JS 語法檢查通過、HTML 與 JS 之間所有 DOM id 一一對應）。但這個開發沙箱環境的對外網路政策封鎖了 CDN（three.js／PeerJS／QRCode 的來源）與跨裝置測試所需的真實網路環境，沒有辦法在這裡實際跑出兩台裝置配對成功的畫面——這需要你在自己的環境（兩支真實裝置＋可公開存取的網址）測試一次以確認。

---

## 6. 開發階段 Roadmap

| Phase | 內容 | 狀態 |
| --- | --- | --- |
| 0 | 單機原型：手動 VAD push-to-talk + Rundown 環節文字通道 + 尾牙系統提示詞 | 已交付（`index.html`） |
| 1 | 兩裝置分離：`stage.html`（投影端）+ `operator.html`（手機遙控端）+ WebRTC 配對 | **本次交付** |
| 2 | 擴充 Tools：`draw_winner`、`play_sound_effect`、`suggest_next_segment` | 待開始 |
| 3 | 金鑰保護（ephemeral token，若要脫離內部測試環境） | 待開始 |
| 4 | 現場彩排：實機 FPS / 延遲 / 噪音 / 會場 Wi-Fi 下的 WebRTC 連通性測試，必要時補 TURN | 待開始 |

---

## 7. 風險與待決策事項

- **WebRTC 連通性（新增，見 0.1 節）**：會場 Wi-Fi 用戶隔離可能讓純 STUN 打不通，需要實測，必要時自備 TURN。
- **API Key 曝露**：沿用 Avatar 既有模式，開發測試用 localStorage 儲存金鑰，設定在 `stage.html`（投影端筆電）。若僅在內部封閉網路、限定活動當天使用可接受；要更廣泛使用需導入 ephemeral token。
- **現場網路穩定性**：Gemini Live 走 WebSocket，會場 Wi-Fi 不穩時需要斷線重連（已沿用既有重試邏輯）；WebRTC 連線本身也可能斷（已加 `peer.reconnect()` 與 UI 重新配對機制），正式上場前建議實測會場網路。
- **噪音環境對麥克風輸入品質的影響**：即使是 push-to-talk，按著按鈕時若背景音樂太大聲，仍可能讓 Gemini 聽錯內容，建議搭配指向性麥克風或降噪 headset mic（接到操作手機上）。
- **VRM 效能**：投影機/現場筆電效能不明，需要實機測試 FPS（Avatar PRD 目標 desktop ≥55、最低 30 FPS）。
- **語音延遲的現場容忍度**：主持人若「思考」太久，現場會冷場，THINKING 狀態已有頭部微動/眨眼掩飾空檔，實際效果仍需現場驗證。
- **決定權歸屬**：目前設計是「環節切換由人決定，AI 不自作主張換環節」，這是為了活動可控性犧牲一些 AI 自主性，需要跟主辦方確認這個取捨是否符合期待。
