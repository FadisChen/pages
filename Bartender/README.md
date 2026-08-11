# Bartender — 暮燈酒館

獨立的原生 HTML／CSS／ES Modules 酒館交談遊戲。你扮演酒保，透過 Gemini Live API 與會記得你的奇幻旅人語音／文字交談。正式入口為 `index.html`；`prototype.html` 僅保留為 throwaway 設計比較稿，正式頁面不引用它，也不引用既有 `web` 專案的 JavaScript、CSS、儲存鍵或元件。

## 特色

- **雙模式故事**：「療癒夜話」（陪伴、近況）與「灰燼群像」（線索、祕密），各角色人設與記憶會依模式切換。
- **Gemini Live 語音對話**：以 WebSocket 串接 Gemini Live API，支援語音／文字輸入切換與逐字幕。
- **角色記憶**：對話後可由記憶整理模型萃取重點，寫入角色的長期記憶並影響下次見面的系統提示。
- **客人模擬**：`GuestSimulation` 依時間排程角色到場、入座與離開，讓吧檯隨時間自然變化。
- **簡轉繁**：內建 vendored `opencc-js` 將模型輸出即時轉換為臺灣繁體用字。

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
  personas.js          六位角色的人設、語音與初始記憶
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
