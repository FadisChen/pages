# Bartender — 陋室

獨立的原生 HTML／CSS／ES Modules 酒館交談遊戲。你扮演酒保，透過 Gemini Live API 與會記得你的奇幻旅人進行語音交談。正式入口為 `index.html`；`prototype.html` 僅保留為 throwaway 設計比較稿，正式頁面不引用它，也不引用既有 `web` 專案的 JavaScript、CSS、儲存鍵或元件。

## 特色

- **雙模式故事**：「療癒夜話」（陪伴、近況）與「灰燼群像」（線索、祕密），各角色人設與記憶會依模式切換。
- **Gemini Live 語音對話**：以 WebSocket 串接 Gemini Live API，使用麥克風輸入。
- **角色記憶**：對話後可由記憶整理模型萃取重點，寫入角色的長期記憶並影響下次見面的系統提示。
- **客人模擬**：`GuestSimulation` 依時間排程角色到場、入座與離開，讓吧檯隨時間自然變化。
- **簡轉繁**：內建 vendored `opencc-js` 將模型輸出即時轉換為臺灣繁體用字。

## 雙模式故事

「療癒夜話」與「灰燼群像」共用同一套互動引擎（吧檯畫面、`GuestSimulation` 客人到場模擬、對話與記憶整理機制皆相同），差異只在敘事內容與存檔：

- **角色人設**：十二位角色的立繪、聲線、姓名不變，但 `personas.js` 為每人準備兩套 `persona` 文字與種子記憶——療癒夜話偏純陪伴、近況閒聊；灰燼群像則讓每位角色捲入「灰燼商隊」失蹤懸案，各自握有需靠信任度逐步透露的線索。
- **存檔互相獨立**：兩模式使用不同的 localStorage key（見 `store.js` 的 `cozy` / `story`），玩家在角色設定裡的人設修改與新增記憶只影響當前模式，不會互相繼承。
- **系統提示標註模式**：`gemini.js` 的 `buildSystemInstruction` 會把目前模式寫入 system instruction，讓 AI 維持對應的敘事基調；語氣規則（臺灣繁中、PG-13、不加動作旁白等）則兩模式共用。

### 灰燼群像故事導演

灰燼群像另外由 `story.js` 維護不可被即興對話改寫的故事正典、角色有限視角、線索前置條件與跨角色知情狀態。Live 對話開始前只注入當前角色有權知道的內容；完整真相不會整包交給角色模型。

通話結束後會平行整理兩種資料：一般關係記憶只保存關於酒保的長期資訊，故事事件則只產生結構化候選 ID。候選事件仍須通過 `story.js` 驗證才會寫入 `storyState`，未知線索、其他角色的專屬線索與不符合前置條件的事件都會被拒絕。療癒夜話不建立 `storyState`，也不執行故事事件分析。

## 技術棧

純原生 HTML／CSS／ES Modules，無框架、無建置步驟；測試使用 Node.js 內建 `node --test`（無外部相依套件）。

## 專案結構

```
index.html          正式入口
styles.css           正式樣式
prototype.html/.css/.js   設計比較稿（不供正式頁面引用）
js/
  app.js             畫面渲染與互動流程
  gemini.js           Gemini Live 連線、系統提示與記憶整理
  audio.js            瀏覽器端錄音／播放（Web Audio API）
  simulation.js        客人到場／離開模擬
  personas.js          十二位角色的人設、語音與初始記憶
  story.js             灰燼群像正典、角色有限視角、線索與狀態驗證
  store.js             設定、存檔與 API key 的 localStorage／sessionStorage 存取
  transcript.js         語音轉錄的即時合併與歷史紀錄
  models.js            模型名稱預設值與正規化
  traditional.js        簡轉繁封裝
vendor/opencc-cn2t.js   vendored 簡轉繁函式庫（MIT，見同目錄授權檔）
assets/               角色與場景圖片
tests/                 對應 js/ 模組的單元測試
```

## 本機啟動

```powershell
python -m http.server 4173 --directory Bartender
```

若已使用 VS Code Live Server，也可以直接開啟 `Bartender/index.html`。

## 設定 Gemini API Key

進入遊戲後於「設定」輸入 Gemini API key。預設只放在 `sessionStorage`（關閉分頁即清除）；只有勾選「記住」才會寫入 `localStorage`。Live 與記憶整理模型名稱都可在全域設定中調整。

## 測試

```powershell
node --test Bartender/tests/*.test.mjs
```

## Sound assets

The in-game door, tavern chatter, pouring, and ice sounds are from [Taira Komori's free sound effects](https://taira-komori.net/freesoundtw.html). Source categories: [open/close](https://taira-komori.net/openclose01tw.html), [food and drink](https://taira-komori.net/eating01tw.html), and [environment](https://taira-komori.net/enviroment01tw.html).
