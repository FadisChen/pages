# 回憶旅人 Memory Traveler

一款純前端的 AI 互動小說遊戲。玩家先設定一段劇情大綱，接著由 Google Gemini API 即時生成劇情、朋友角色的反應與選項，隨著好感度與線索累積走向六種不同結局，並將完成的旅程收藏進「回憶相簿」。

沒有後端、沒有建置流程——純 HTML/CSS/JavaScript（ES Modules），API 請求直接從瀏覽器發送到 Gemini。

## 特色功能

- **大綱起點**：手動輸入劇情大綱，或依語氣（溫馨日常、懸疑推理、奇幻冒險…）讓 AI 隨機生成一份可編輯的草稿。
- **互動敘事**：每回合由 AI 產生劇情、朋友角色的台詞、可選行動，也支援輸入自訂行動。
- **好感度與線索**：對話與選擇會影響與朋友角色的好感度（0–100），並隨劇情收集線索。
- **長對話自動摘要**：對話累積超過門檻（回合數或字數）時，自動將較舊的歷史摘要成一段摘要文字，避免無限增長，同時保證摘要失敗時不會遺失原始歷史。
- **六種結局 × 回憶相簿**：故事結束時生成標題、摘要、亮點與結局類型；每個結局都會收錄進相簿並顯示收集進度。
- **三種視覺主題**：曙光手帳／午夜檔案／野地剪貼簿，可即時切換並記住偏好。
- **本機續存**：設定、大綱草稿、進行中的遊戲進度、回憶相簿皆存在瀏覽器 `localStorage`，重新整理頁面可繼續未完成的旅程。

## 快速開始

需要一個靜態伺服器（`index.html` 用 ES Modules 載入 `js/main.js`，直接以 `file://` 開啟會因瀏覽器的模組安全限制而失敗）。例如：

```bash
cd game
npx serve .
# 或
python -m http.server 8000
```

開啟瀏覽器造訪對應網址後：

1. 進入「設定」頁，貼上你的 [Gemini API Key](https://aistudio.google.com/apikey)，並選擇/取得可用的 model。
2. 進入「大綱」頁，撰寫或隨機生成故事起點。
3. 點擊「開始遊戲」進入互動劇情。

> ⚠️ 這是純前端應用，API Key 只會保存在你自己瀏覽器的 `localStorage`，請求也直接從瀏覽器打到 Gemini API。請勿在公用電腦保存 Key，並定期到 Google AI Studio 檢查金鑰使用狀況。

## 測試

使用 Node.js 內建測試執行器（`node --test`），無其他相依套件：

```bash
cd memorytraveler
npm test
```

## 專案結構

```
memorytraveler/
├── index.html              # 單頁應用，五個畫面（設定／大綱／遊戲／結局／相簿）皆為 <section>
├── css/styles.css          # 三套主題樣式
├── assets/styles/          # 主題選擇縮圖
└── js/
    ├── main.js              # 進入點：組裝 context、router、各畫面模組
    ├── app/appContext.js    # 畫面共用的狀態與動作（設定／大綱／回憶／遊戲引擎）
    ├── core/
    │   ├── gameEngine.js     # DOM-free 的敘事引擎：回合推進、好感度、線索、存讀檔快照
    │   └── constants.js      # 儲存鍵、預設值、結局類型、Gemini 回應 schema
    ├── gemini/
    │   ├── client.js          # 呼叫 Gemini generateContent / ListModels 的最底層封裝
    │   ├── modelCatalog.js    # 篩選/整理出可用於對話的 model 清單
    │   ├── promptBuilder.js   # 組出 system instruction、摘要、隨機大綱等 prompt
    │   ├── responseValidators.js # 驗證/解析 Gemini 回傳的 JSON
    │   ├── outlineGenerator.js   # 隨機大綱生成
    │   └── contextManager.js     # 對話歷史過長時的自動摘要壓縮邏輯
    ├── storage/              # 對 localStorage 的薄封裝（settings/outline/memories/session）
    ├── ui/
    │   ├── router.js          # 畫面切換（含 hash 深連結還原）
    │   ├── theme.js           # 三套主題切換與記憶
    │   └── screens/           # 每個畫面各自的初始化與渲染邏輯
    └── utils/                 # clamp、id 產生、HTML escape、model 挑選…等小工具
└── tests/                   # 對應上述模組的單元測試
```

## 運作方式

- `GameEngine`（[js/core/gameEngine.js](js/core/gameEngine.js)）刻意不依賴 DOM，只負責維護對話歷史、好感度、線索與紀錄，並可透過 `toSnapshot()` / `fromSnapshot()` 完整還原，供「繼續旅程」使用。
- 每回合會先呼叫 `compactHistory`（[js/gemini/contextManager.js](js/gemini/contextManager.js)）檢查歷史是否過長；需要壓縮時才會多打一次 Gemini 摘要，失敗則保留原始歷史，下一回合再試。
- 每次 Gemini 回應都會用 `responseSchema` 強制結構化 JSON 輸出，再由 [js/gemini/responseValidators.js](js/gemini/responseValidators.js) 驗證欄位完整性，避免格式錯誤污染遊戲狀態。
- `js/app/appContext.js` 是各畫面共用的簡單相依注入物件，畫面模組直接呼叫其方法並自行重繪，沒有額外的訂閱/發佈機制。

## 資料儲存

所有資料皆以 JSON 存於 `localStorage`（鍵值定義於 [js/core/constants.js](js/core/constants.js)）：

| 內容 | 用途 |
| --- | --- |
| `storygame.settings.v1` | API Key、model、玩家/朋友性別預設 |
| `storygame.outline.v1` | 最近一次的大綱草稿 |
| `storygame.session.v1` | 進行中遊戲的完整快照，用於重新整理後續玩 |
| `storygame.memories.v1` | 已完成旅程的回憶相簿紀錄 |
| `memorytraveler.ui-theme.v1` | 使用者選擇的視覺主題 |

清除瀏覽器資料或使用「清除已存設定」/「清除全部回憶」按鈕會移除對應資料，不會影響 Gemini 端的任何內容。
