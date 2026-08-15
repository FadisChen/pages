# BitsCamera

即時將相機畫面轉換成黑白灰點陣效果的網頁相機 App。純前端、無建置工具，支援 PWA 安裝與手機直向/橫向自適應版面。

## 功能

- **4 種即時點陣效果**，可即時切換：
  - Floyd-Steinberg 誤差擴散抖動
  - Bayer 有序抖動
  - 網點半色調
  - 色階馬賽克
- **參數面板**：點擊右下角 ⚙ 開啟，內容依目前風格動態切換，拖動滑桿即時反映在畫面上
  | 風格 | 可調參數 |
  |---|---|
  | Floyd-Steinberg / Bayer | 顆粒粗細、明暗偏移 |
  | 網點半色調 | 網點密度、網點強度 |
  | 色階馬賽克 | 馬賽克顆粒、灰階層級 |
- **拍照存檔**：將當下畫面存成帶時間戳記的 PNG
- **前後鏡頭切換**（裝置有多鏡頭時才顯示）
- **PWA**：可加入主畫面、全螢幕開啟、離線可用（app shell 快取）
- **響應式版面**：直向控制項浮在畫面上/下方、橫向浮在左/右側，相機畫面全程盡量滿版顯示

## 需求

- 支援 `getUserMedia` 的現代瀏覽器（Chrome、Safari、Edge）
- 必須在 **HTTPS 或 localhost** 環境下執行，這是瀏覽器對相機權限的安全限制，直接用 `file://` 開啟無法使用相機

## 本機開發

用任何靜態伺服器開啟即可，例如 VS Code 的 **Live Server** 擴充套件，或：

```bash
python -m http.server 8000
```

然後瀏覽器開啟 `http://localhost:8000`。

## 手機測試

手機需與開發機在同一區網，並用開發機的區網 IP 開啟（例如 `http://192.168.x.x:8000`）。

> 注意：Service Worker 安裝與 iOS「加入主畫面」需要真正的 HTTPS，區網 IP 走 HTTP 無法使用這兩項功能（相機預覽本身仍可正常運作）。若要在部署前於手機測試完整 PWA 行為，可用 ngrok 之類的工具建立 HTTPS 通道。

## 部署

純前端靜態專案，可部署到任何靜態主機（GitHub Pages、Netlify、Vercel 等），部署後網域需為 HTTPS。

**重要**：往後只要修改了 `style.css` 或 `script.js`，記得同步把 `sw.js` 裡的 `CACHE_NAME` 版號往上加一版，否則回訪的使用者會因為 Service Worker 的快取機制持續讀到舊版本。

## 檔案結構

```
index.html                 主頁面
style.css                  樣式（含直向/橫向浮動版面）
script.js                  相機存取、4 種點陣演算法、參數面板、PWA 生命週期
manifest.json               PWA manifest
sw.js                       Service Worker（app shell 版本化快取）
icons/
  icon-source.html          圖示來源頁（用與 App 相同的網點演算法產生圖示）
  icon-192.png
  icon-512.png
  icon-512-maskable.png
  apple-touch-icon.png
  favicon-32.png
```

## 已知限制

- 橫向側欄版面用 CSS 媒體查詢判斷「觸控裝置 + 螢幕矮」，觸控筆電（如 Surface）可能被誤判為手機，這是純 CSS 判斷式的固有侷限
- 未提供拍照相簿/歷史紀錄，拍照後直接下載單張 PNG
- 未提供效果參數的儲存/記憶功能，重新整理頁面後會回到預設值
