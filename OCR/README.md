# 毛豬採購證明單 OCR Web App

本專案是一個以 **HTML + CSS + JavaScript** 實作的手機優先 OCR 網頁，主要用於固定版型的「毛豬採購證明單（豬單）」影像辨識。

設計目標不是將整張文件全文 OCR，而是讓使用者透過手機拍照或選取相簿照片後，先在 Client 端完成文件校正，再依固定版型擷取特定欄位，最後將辨識結果填入 HTML 表單供人工確認與修正。

目前主要檔案：

- `index_mobile_ocr_auto_v2.html`：目前最終版單檔網頁（已加入 OpenCV hard timeout / fast path / fallback）
- `README.md`：本文件

### 目前版本重點（v2）

上一版曾出現手機停在「正在自動偵測文件四角」的情況。v2 已將這個問題列為流程可靠性問題處理，而不是單純要求使用者等待：

- 固定版型滿版照片先走 **零下載 fast path**，符合條件時不等待 OpenCV.js。
- 使用者按「拍照 / 選圖」時會在背景預熱 OpenCV.js，利用使用者拍照或挑圖的時間下載。
- `<script>` 載入加入 **hard timeout**。
- `window.cv` / OpenCV Runtime 初始化加入 **hard timeout**。
- OpenCV 整體自動偵測等待上限約 **14 秒**，逾時立即 fallback，不再無限卡住。
- OpenCV 載入失敗後，後續透視校正不會再次阻塞等待；直接使用 JavaScript Homography 備援。
- 固定版型已幾乎填滿畫面時，直接使用瀏覽器原生 Canvas resize，省略不必要的逐像素 Homography。
- 使用者仍可在四角編輯器按「自動找四角」主動重新嘗試 OpenCV。
- Tesseract.js script 與 Worker 初始化也增加 timeout，避免 OCR 初始化永久等待。

---

## 1. 真實需求與最終操作流程

使用者主要透過手機操作，因此流程以「少操作、可人工修正、Client 端完成」為主：

1. 使用手機直接拍照，或從相簿選擇既有照片。
2. 載入影像並依 EXIF 方向顯示。
3. 嘗試自動偵測文件四角。
4. 若自動偵測信心足夠：
   - 自動做透視校正。
   - 再偵測文件內的水平線，做小角度水平修正。
5. 若自動偵測信心不足：
   - 顯示全螢幕四角編輯器。
   - 使用者可拖曳四個角點。
   - 可左轉 / 右轉 90°。
   - 可重新執行自動找四角。
6. 將校正後文件標準化為固定比例與尺寸。
7. 依固定版型 ROI 分區 OCR。
8. OCR 結果直接填入 HTML `<input>`。
9. 使用者確認、修正或增刪拍賣編號。
10. 最後可複製 JSON，交給後端 API、資料庫或其他流程。

流程概念：

```text
手機拍照 / 相簿選圖
        ↓
影像方向處理
        ↓
自動偵測文件四角
        ↓
  ┌──────────────┐
  │ 信心高       │────→ 自動透視校正
  │ 信心不足     │────→ 人工四角微調
  └──────────────┘
        ↓
水平線二次校正
        ↓
標準化固定版型
        ↓
固定 ROI OCR
        ↓
HTML Form
        ↓
人工確認 / 修正
        ↓
JSON
```

---

## 2. 使用技術

### Tesseract.js

用途：OCR。

目前載入：

```js
https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js
```

使用語言：

```js
['chi_tra', 'eng']
```

原因：

- 文件欄位包含繁體中文。
- 拍賣編號例如 `AC11-0026`，需要英文與數字。

OCR Worker 會重複使用，不會每個欄位都重新建立 Worker。

v2 同時替 Tesseract.js script 載入與 Worker 初始化加上 timeout，避免 CDN 或語言包載入異常時無限等待。

---

### OpenCV.js

用途：

- 文件邊緣偵測
- 輪廓搜尋
- 四邊形近似
- 透視變形
- 水平線偵測
- 小角度旋轉校正

目前載入：

```js
https://docs.opencv.org/4.x/opencv.js
```

OpenCV.js 仍採延遲載入，但 v2 會在使用者按下「拍照 / 選圖」時背景預熱，盡量把下載時間藏在拍照或挑圖流程內。若手機啟用了 Data Saver，則不主動預熱。

同時加入 hard timeout 與 fallback；OpenCV 是「自動校正增強能力」，不再是整個 OCR 流程的 single point of failure。

---

### Canvas API

Canvas 用於：

- 原始照片保存
- 影像縮放
- 人工四角編輯
- ROI 裁切
- OCR 前處理
- OpenCV 與 Tesseract 的中介影像

如果 OpenCV 無法使用，程式仍保留純 JavaScript Homography 的透視變形 fallback。

---

## 3. 為什麼不再做「整頁全文 OCR」

一開始採用整張文件 OCR，但實際測試發現：

- 表格線會干擾版面分析。
- QR Code 容易產生大量亂碼。
- 戳章區沒有辨識價值。
- 文件下半部空白與格線會增加 OCR 雜訊。
- 中文姓名可能被其他文字或表格結構影響。
- `AC09`、`AC11`、`AC12` 等拍賣編號在不同文件中會變動，不能寫死批次碼。

因此最終策略改為：

> 固定版型 → 幾何校正 → 固定 ROI → 各欄位獨立 OCR → 結構化解析。

這比整頁 OCR 更符合實際需求。

---

## 4. 固定版型與標準化

目前假設文件版型固定，紙張大致為直式 3:4 比例：

```js
const FORM_ASPECT = 0.75; // width / height
const NORMALIZED_WIDTH = 1600;
const NORMALIZED_HEIGHT = Math.round(NORMALIZED_WIDTH / FORM_ASPECT);
```

照片經透視校正後，會統一轉成固定大小。

這一步非常重要，因為 ROI 使用的是「百分比座標」，只有在每張文件都先標準化後，同一組 ROI 才能穩定套用。

---

## 5. 固定 ROI 設計

目前分別辨識：

- 市場名稱
- 文件名稱
- 拍賣日期
- 承銷人編號
- 承銷人姓名
- 左側拍賣編號
- 右側拍賣編號

ROI 使用 0~1 比例座標，例如：

```js
const ROI = {
  market:       { x1: 0.075, y1: 0.022, x2: 0.925, y2: 0.070 },
  document:     { x1: 0.245, y1: 0.067, x2: 0.755, y2: 0.103 },
  date:         { x1: 0.165, y1: 0.101, x2: 0.375, y2: 0.122 },
  dealerNumber: { x1: 0.175, y1: 0.123, x2: 0.285, y2: 0.140 },
  dealerName:   { x1: 0.170, y1: 0.143, x2: 0.355, y2: 0.161 },
  codesLeft:    { x1: 0.285, y1: 0.188, x2: 0.525, y2: 0.715 },
  codesRight:   { x1: 0.705, y1: 0.188, x2: 0.990, y2: 0.715 }
};
```

### 開發心得

固定版型文件的 OCR 準確度，通常「ROI 是否切對」比單純一直調 Tesseract 參數更重要。

因此後續若有更多真實樣本，優先應檢查：

1. 文件是否真的被校正成同一比例。
2. ROI 是否完全涵蓋目標文字。
3. ROI 是否包含太多表格線或其他欄位。
4. 中文姓名 ROI 是否太窄。

---

## 6. 各欄位採不同 OCR 策略

所有欄位不應使用相同 OCR 設定。

### 中文單行欄位

例如：

- 市場名稱
- 文件名稱
- 承銷人姓名

使用：

```text
PSM = SINGLE_LINE
```

---

### 承銷人編號

只允許數字：

```js
tessedit_char_whitelist = '0123456789'
```

這可以避免數字被辨識成中文字或英文。

---

### 拍賣編號

只允許：

```text
A-Z
0-9
-
```

範例：

```text
AC09-0007
AC11-0026
AC12-0068
```

拍賣編號批次不能寫死為 `AC09`。

目前解析邏輯支援不同 `ACxx` 批次，並修正常見 OCR 混淆：

- `O / Q / D → 0`
- `I / l / L / | → 1`
- `Z → 2`
- `S → 5`
- `B → 8`

---

## 7. 中文姓名的特殊處理

實際測試中，承銷人姓名是較容易出現不穩定的欄位。

例如曾測試：

- 劉惠文
- 林雅雯
- 王志明

一開始將「拍賣日期 + 承銷人編號 + 承銷人姓名」放在較大的區域一起 OCR，結果姓名容易被表格、標籤或插值縮放影響。

最後改為：

> 承銷人姓名使用獨立、小範圍 ROI。

並採兩階段 OCR：

1. 第一輪：二值化。
2. 若信心低或找不到合理中文姓名：
   - 擴大一點 ROI。
   - 改用灰階高對比。
   - 再跑第二輪 OCR。

這比將姓名放在大範圍文字區一起辨識穩定。

### 開發心得

中文筆畫較細，並不是「放得越大、二值化越強」就一定越準。

某些手機照片經瀏覽器插值放大、再二值化後，中文字細筆畫可能被吃掉。

因此中文姓名最好：

- ROI 小而精準。
- 保留足夠原始細節。
- 第一輪與第二輪使用不同影像前處理。

---

## 8. OCR 前處理

每個 ROI 會先裁切並依需要放大。

目前主要採：

1. 灰階化。
2. 建立灰階 histogram。
3. 使用 Otsu 自動閾值。
4. 二值化。

對中文姓名，在低信心時改用：

- 灰階
- 輕微 contrast stretch
- 不強制二值化

這是因為過度二值化可能破壞中文字的細筆畫。

---

## 9. 自動文件四角偵測

OpenCV 流程：

1. 將照片縮小到最長邊約 1200 px。
2. 灰階。
3. Gaussian Blur。
4. Canny Edge Detection。
5. Morphological Close。
6. `findContours()`。
7. 過濾太小的 contour。
8. `approxPolyDP()` 尋找四邊形。
9. 計算候選四邊形：
   - 面積覆蓋率
   - 版型比例相似度
   - 是否接近畫面中央
10. 計算 confidence。

信心門檻：

```js
const AUTO_APPLY_CONFIDENCE = 0.78;
const AUTO_REVIEW_CONFIDENCE = 0.52;
```

- `>= 0.78`：自動套用。
- 中等信心：先把四角放好，要求使用者確認。
- 太低：人工校正。

---

## 10. 固定版型滿版 fallback

真實樣本有一個特殊情況：

> 文件本身幾乎已填滿照片，紙張外框甚至不在畫面中。

此時傳統的「找最大紙張四邊形」可能找不到。

因此加入另一個固定版型策略：

- 檢查圖片是否接近 3:4。
- 尋找表格區的長水平黑線。
- 若版型比例與表格線特徵吻合，視為「文件已填滿畫面」。
- 直接使用整張影像四角作為文件四角。

這個 fallback 對目前提供的真實拍攝方式很重要。

---

## 11. 水平線二次校正

只做透視校正仍可能殘留約 0.5°~3° 的微小旋轉。

固定 ROI 對小角度偏斜很敏感，因此又加入第二次校正：

1. 二值化。
2. Morphological Open 強化長水平線。
3. `HoughLinesP()` 找表格線。
4. 取接近水平的長線。
5. 計算中位數角度。
6. 在合理範圍內自動反向旋正。

若偏斜角度太大，不直接自動修正，以免誤判。

---

## 12. 人工四角編輯器

即使有自動偵測，也不應完全取消人工調整。

手機現場可能遇到：

- 紙張邊界被裁掉。
- 桌面與紙張顏色太接近。
- 陰影。
- 反光。
- 文件折痕。
- 手指遮住角落。
- 拍攝角度過斜。
- 背景也有矩形物件。

因此保留全螢幕四角編輯器。

功能：

- 四角控制點。
- 大型 touch hit area。
- 左轉 90°。
- 右轉 90°。
- 重新自動找四角。
- 重設四角。
- 套用校正後開始 OCR。

---

## 13. 手機 RWD 設計

此專案的主要裝置是手機，因此 UI 不是由 Desktop 再縮小，而是 Mobile First。

### 目前考量

- `viewport-fit=cover`
- `safe-area-inset-top`
- `safe-area-inset-bottom`
- Input 字級至少 16px，降低 iOS Safari 聚焦時自動縮放。
- 主要按鈕高度約 48px。
- 觸控操作採 Pointer Events。
- 四角拖曳範圍比畫面上的圓點更大。
- 手機版拍賣編號採單欄。
- Desktop 才切成雙欄。
- 文件編輯器手機全螢幕。

---

## 14. 結果表單設計

OCR 完成後不直接當成最終資料。

所有欄位都放入可編輯 HTML Form：

- 市場名稱
- 文件名稱
- 拍賣日期
- 承銷人編號
- 承銷人姓名
- 拍賣編號清單

使用者可以：

- 修正文字。
- 修正錯誤拍賣編號。
- 刪除錯誤項目。
- 手動新增漏掉的拍賣編號。

這是重要的產品設計原則：

> OCR 是協助輸入，不是不可質疑的最終答案。

---

## 15. JSON 輸出

使用者確認後，可取得：

```json
{
  "市場名稱": "高雄市鳳山區農會綜合市場(鳳山肉品市場旗山分場)",
  "文件名稱": "毛豬採購證明單(豬單)",
  "拍賣日期": "115 年 3 月 9 日",
  "承銷人編號": "38",
  "承銷人姓名": "王志明",
  "拍賣編號": [
    "AC11-0001",
    "AC11-0002",
    "AC11-0026"
  ]
}
```

後續可將「複製 JSON」改為真正呼叫後端 API。

---

# 16. 「正在自動偵測文件四角」卡住問題：v2 已修正

## 原因

上一版第一次自動偵測需要延遲載入 OpenCV.js，因此第一次本來就可能比後續慢，但程式另外存在兩個真正的可靠性風險：

1. `<script>` 載入只等待 `load/error`，沒有 hard timeout。
2. `window.cv` 若是長時間 pending 的 Promise，原本的 while/deadline 無法中斷那個 `await`。

因此在行動網路、CDN、DNS、WebView 或 OpenCV Runtime 異常時，UI 可能長時間停在：

```text
正在自動偵測文件四角…
```

這不是正常的「第一次比較慢」，而是流程可能被外部元件阻塞。

---

## v2 的處理策略

### 1. 固定版型 fast path 先於 OpenCV

程式會先用純 Canvas / JavaScript 檢查：

- 文件是否為直式固定比例。
- 表格上方是否存在夠強的長水平線。
- 文件是否幾乎填滿整張照片。

若信心高於：

```js
const TEMPLATE_FAST_PATH_CONFIDENCE = 0.84;
```

就直接判定為固定版型滿版照片，不等待 OpenCV。

這對目前實際樣本非常重要，因為許多手機照片本來就已經把紙張邊緣裁在畫面外；這時即使載入 OpenCV，也未必能找到完整紙張輪廓。

---

### 2. 拍照 / 選圖時背景預熱 OpenCV

使用者按下：

```text
開啟相機拍照
從手機選取照片
```

時就會呼叫：

```js
warmOpenCVInBackground();
```

它不會阻塞 UI。使用者在拍照或相簿挑圖的幾秒鐘內，OpenCV 可以先下載與初始化。

若：

```js
navigator.connection?.saveData === true
```

則不做背景預熱，尊重行動數據節省設定。

---

### 3. 外部 script hard timeout

現在 `loadExternalScript()` 有真正的 timer；如果 CDN 長時間沒有回應，會移除停在半載入狀態的 `<script>` 並 reject。

目前設定：

```js
const SCRIPT_LOAD_TIMEOUT_MS = 12000;
```

因此不會永遠只等 `load/error`。

---

### 4. OpenCV Runtime hard timeout

`window.cv` 若本身是 Promise，也會用 `Promise.race()` 包住：

```js
withTimeout(candidate, OPENCV_RUNTIME_TIMEOUT_MS, ...);
```

目前設定：

```js
const OPENCV_RUNTIME_TIMEOUT_MS = 9000;
const OPENCV_TOTAL_TIMEOUT_MS = 14000;
```

所以初次自動偵測真正會阻塞使用者的最大時間是有限的，而不是理論上的 while deadline。

---

### 5. OpenCV 失敗立即 fallback

若 OpenCV 載入或初始化失敗：

```text
OpenCV timeout / error
        ↓
固定版型候選可用？
   ├─ 是 → 使用固定版型
   └─ 否 → 開啟人工四角編輯器
```

人工調整四角後，透視變形仍可使用純 JavaScript Homography，因此不會因 OpenCV 不可用而完全無法 OCR。

---

### 6. 校正階段不再第二次等待 OpenCV

上一版的另一個 UX 風險是：即使自動偵測階段 OpenCV 已經失敗，後面的校正階段又可能再次呼叫 `ensureOpenCV()`。

v2 改成：

```js
const cv = cvApi?.Mat ? cvApi : null;
```

也就是「已經就緒才用」，否則直接 fallback，不再讓使用者第二次等待。

---

### 7. 滿版固定文件不做昂貴 Homography

若 fast path 判定四角就是整張影像邊界，透視矩陣其實接近單純 resize。

因此 v2 使用原生 Canvas：

```js
ctx.drawImage(source, 0, 0, outW, outH);
```

取代 JavaScript 逐像素 Homography。

這對手機效能差異很大，因為標準化文件約有數百萬像素；能交給瀏覽器原生影像管線處理就不要在 JavaScript 逐 pixel 內插。

---

## v2 後應如何判斷「第一次較慢」

合理情況：

- 第一次使用 OpenCV contour detection 時可能需要數秒下載與初始化。
- 第二次通常因 runtime / browser cache 已存在而較快。
- Tesseract `chi_tra` 第一次初始化也會比後續慢。

不再合理的情況：

- 永久停在「正在自動偵測文件四角」。
- OpenCV CDN 掛掉後整個 OCR 都不能使用。

v2 在 OpenCV 最長等待超過設定上限後會自動進入備援流程。

---

## 正式環境仍建議 self-host

雖然 hard timeout 解決「卡死」，正式環境仍建議將 OpenCV.js 與 Tesseract 相關資源改成自家 CDN / static assets：

- 固定版本。
- 可設定長效 cache。
- 可觀測載入失敗率。
- 不依賴第三方文件站。
- 公司內網環境較容易管理 CSP。

自動校正應永遠視為 enhancement：

> **OpenCV 不可用時，使用者仍應能透過人工四角校正完成 OCR。**


## 17. 效能心得

### 不要在手機上使用原始超高解析度做所有運算

目前限制：

```js
const MAX_SOURCE_SIDE = 2600;
const DETECT_LONG_SIDE = 1200;
```

做自動四角偵測時只需要低解析度。

真正 OCR 與透視校正才需要較高解析度。

這能降低：

- 記憶體
- OpenCV Mat 大小
- Edge Detection 時間
- contour 數量
- iPhone Safari 記憶體壓力

---

### Canvas 記憶體必須主動釋放

手機瀏覽器對大型 Canvas 非常敏感。

不再使用的暫存 Canvas 建議：

```js
canvas.width = 1;
canvas.height = 1;
```

OpenCV Mat 則務必：

```js
mat.delete();
```

否則連續掃描多張文件後，可能出現頁面 reload 或瀏覽器直接殺掉分頁。

---

## 18. 開發過程的重要心得

### 1. 不要為單張範例寫死資料

早期曾把拍賣編號寫成固定 `AC09`，造成後續：

- `AC11`
- `AC12`

無法辨識。

固定版型不代表固定資料。

應固定的是：

- 版面位置
- 欄位規則
- 格式

不能固定的是：

- 承銷人姓名
- 承銷人編號
- AC 批次
- 拍賣編號數量

---

### 2. OCR 的問題很多時候其實是影像幾何問題

如果文件歪斜，持續調：

- PSM
- whitelist
- threshold
- DPI

效果通常有限。

先把：

- 裁切
- 透視
- 旋轉
- 固定比例

處理好，OCR 才會穩。

---

### 3. 固定版型適合 ROI OCR

如果文件版型固定，沒有必要讓 OCR 引擎猜整頁 layout。

只 OCR 真正需要的欄位，可以同時提高：

- 準確率
- 效能
- 後處理容易度

---

### 4. 不要只驗證 OCR raw text

真正要測的是完整使用流程：

```text
原始照片
→ 瀏覽器縮放
→ 透視校正
→ ROI 裁切
→ 前處理
→ Tesseract
→ Regex / parser
→ HTML Form
```

曾發生單獨裁 ROI 可以辨識姓名，但放進完整網頁影像縮放流程後結果不同。

因此 regression test 要測 end-to-end，而不是只看其中一個步驟。

---

### 5. OCR 必須允許人工確認

即使某批樣本達到很高準確率，也不應直接把 OCR 視為最終資料。

尤其：

- 人名
- 編號
- 日期

錯一個字可能就代表完全不同的資料。

因此「OCR → Form → 人工確認」是必要設計，不只是方便功能。

---

## 19. 建議後續優化順序

建議優先順序：

### 已完成：OpenCV 載入卡住修正

- [x] script hard timeout
- [x] runtime hard timeout
- [x] timeout 後立即 fallback
- [x] 固定版型 fast path
- [x] 拍照 / 選圖期間背景預熱
- [x] 校正階段不重複等待 OpenCV
- [x] 顯示目前載入 / fallback 狀態

### P0：建立真實照片 regression set

至少保留：

- 正拍
- 微歪
- 左斜
- 右斜
- 反光
- 偏暗
- 文件填滿畫面
- 文件四周有背景
- 不同承銷人
- 不同 AC 批次
- 12 / 25 / 26 筆等不同筆數

每次修改 ROI 或前處理後重新測試。

### P1：欄位 confidence UI

將低信心欄位標示黃色或紅色，讓使用者優先檢查。

例如：

```text
承銷人姓名  [王志明]  ⚠ 請確認
```

### P2：拍賣編號完整性檢查

可利用「總項數」做 validation。

例如 OCR 讀到：

```text
總項數 = 26
```

但拍賣編號只有 25 筆，就提醒：

```text
預期 26 筆，目前辨識到 25 筆，請確認是否漏掉 1 筆。
```

### P3：送後端 API

表單確認後直接 POST JSON，而不是只提供複製 JSON。

### P4：PWA

如果現場使用頻率高，可以考慮：

- PWA
- Service Worker
- 快取 OpenCV / Tesseract
- 首次載入後離線使用部分功能

---

## 20. 部署注意事項

目前使用第三方 CDN，因此正式環境至少需要：

- 可連外網路。
- HTTPS。
- CSP 允許對應 CDN script / worker / wasm。

如果部署在公司內部封閉網路，建議將以下資源改成 self-host：

- Tesseract.js
- Tesseract core / wasm
- `chi_tra` traineddata
- `eng` traineddata
- OpenCV.js

---

## 21. 隱私

目前設計的主要影像處理與 OCR 都在瀏覽器端執行。

若未另外串接後端 API，使用者選擇的照片不需要上傳到伺服器。

這對含有採購或交易資訊的文件是一個重要優點。

正式上線仍應檢查：

- CDN 是否符合資訊安全政策。
- 是否禁止將 OCR raw data 寫入第三方 log。
- 是否有瀏覽器端錯誤追蹤工具會意外記錄敏感內容。

---

## 22. 目前結論

目前最適合這個需求的架構不是「通用 OCR」，而是：

> **固定表單影像掃描器 + 幾何校正 + 固定 ROI OCR + 人工確認表單。**

其中影響最終準確率最大的順序通常是：

1. 文件有沒有完整拍到。
2. 四角 / 透視有沒有校正正確。
3. 水平是否對齊。
4. ROI 是否切對。
5. 影像前處理。
6. Tesseract PSM / whitelist。
7. 後處理 Regex。

換句話說，OCR Engine 本身只是整個流程的一部分；對固定表單來說，**前面的文件正規化與後面的資料驗證同樣重要**。
