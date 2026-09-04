# Gemini TTS Playground PRD

## 1. 文件資訊

- 文件狀態：Draft
- 版本：0.1
- 日期：2026-09-04
- 產品型態：RWD 純前端網頁應用程式
- 技術限制：原生 HTML、CSS、JavaScript；不使用 React、Vue、後端服務或資料庫
- API 使用方式：BYOK（Bring Your Own Key），使用者自行輸入 Gemini API Key

## 2. 產品概述

建立一個以繁體中文／台灣華語朗讀為主要場景的 Gemini TTS Playground。使用者可以輸入文字、選擇 TTS 模型與聲音設定，產生音檔後直接在瀏覽器試聽與下載 WAV 檔案。

稿件區與導演指示區各自提供一個「魔術棒」，兩個按鈕有不同職責。稿件魔術棒只產生適合語音朗讀的優化稿件；導演指示魔術棒只根據左側稿件產生導演指示。兩者結果填入不同區塊，不互相覆蓋。

## 3. 目標與非目標

### 3.1 產品目標

1. 讓使用者不需撰寫 API 程式碼即可測試 Gemini TTS。
2. 以繁體中文、台灣華語、清楚自然的朗讀體驗為預設方向。
3. 讓不同 TTS 模型只顯示自己支援的設定。
4. 產生結果可立即試聽、重新生成與下載。
5. 讓兩個獨立的「魔術棒」分別協助優化稿件與產生導演指示，不互相覆蓋內容。

### 3.2 非目標

- 不提供伺服器端 API Proxy、帳號系統或雲端儲存。
- 不保證產生 MP3、M4A 等壓縮格式；第一版只提供 WAV。
- 不提供 Live API 的即時雙向對話。
- 不納入 `gemini-2.5-pro-preview-tts`，因為免費層不可使用。
- 不承諾數值化的音高、音量、語速控制；Gemini TTS 主要透過自然語言提示控制表演。

## 4. 目標使用者與使用情境

### 4.1 目標使用者

- 想快速測試 Gemini TTS 的開發者。
- 需要製作中文旁白、教學稿、Podcast 試聽片段的內容製作者。
- 想比較不同模型、聲音與導演提示效果的使用者。

### 4.2 主要使用情境

1. 使用者貼上 API Key，輸入一段繁體中文，選擇聲音後生成音訊。
2. 使用者使用稿件魔術棒將生硬文字調整為適合朗讀的版本。
3. 使用者使用導演指示魔術棒，依照左側稿件產生合適的語氣、節奏與口音指示。
4. 使用者切換 2.5 Flash 與 3.1 Flash，比較聲音表現。
5. 使用者建立最多兩位說話者的對話稿並分配不同聲音。
6. 使用者在手機上完成設定、試聽與下載。

## 5. Gemini TTS 支援範圍

| 模型 | Endpoint | 免費層 | 單一說話者 | 多說話者 | 串流 | UI 特殊設定 |
|---|---|---:|---:|---:|---:|---|
| Gemini 3.1 Flash TTS Preview | `gemini-3.1-flash-tts-preview` | 支援 | 支援 | 支援，最多 2 位 | 支援 | 音訊標記、串流試聽 |
| Gemini 2.5 Flash Preview TTS | `gemini-2.5-flash-preview-tts` | 支援 | 支援 | 支援，最多 2 位 | 不支援 | 一般提示控制 |

兩個模型的輸入上限皆為 8,192 tokens、輸出上限皆為 16,384 tokens。TTS 工作階段上下文上限為 32,000 tokens；長篇內容需依段落切割。模型與免費層狀態以官方文件為準：

- [Gemini TTS 官方指南](https://ai.google.dev/gemini-api/docs/speech-generation?hl=zh-tw)
- [Gemini 模型列表](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API 價格](https://ai.google.dev/gemini-api/docs/pricing)

## 6. 功能需求

### FR-01 API Key（BYOK）

- 提供 API Key 輸入框，預設使用密碼遮罩。
- 提供顯示／隱藏 Key 功能。
- 提供「測試連線」按鈕。
- 使用者按下儲存後，API Key 直接保存至瀏覽器 Local Storage，重新整理後自動載入；不寫入原始碼、URL 或 IndexedDB。
- 若瀏覽器拒絕 Local Storage，需退回僅保存於本次頁面工作階段，並提示使用者。
- 頁面需明確告知使用者：API Key 會在瀏覽器端使用，公開網站不應填入不願暴露的共用 Key。
- 頁面提供 AI Studio API Key 管理頁連結。

### FR-02 文字輸入

- 提供大型多行文字輸入框。
- 顯示字數與預估 Token 數。
- 支援貼上、清除、載入範例文字。
- 顯示超過模型限制時的警告。
- 以段落、句號、問號、驚嘆號等自然邊界切割長文本。
- 生成期間禁止重複送出，並提供取消目前請求的操作。

### FR-03 雙魔術棒

#### FR-03A 稿件魔術棒

- 按鈕固定放在左側「稿件」標題旁。
- 只有在左側稿件有內容且 API Key 有效時啟用。
- 使用設定頁的 Gemini model name 呼叫文字模型。
- 只產生「優化後稿件」，不可產生或修改導演指示。
- 結果先在左側稿件區顯示預覽，使用者按「套用優化稿件」後才取代左側內容。
- 原始稿件在使用者套用前不可被覆蓋。

#### FR-03B 導演指示魔術棒

- 按鈕固定放在右側「導演指示」標題旁。
- 只有在左側稿件有內容且 API Key 有效時啟用。
- 使用同一個 Gemini model name 呼叫文字模型。
- 讀取目前左側稿件、TTS 模型、聲音、語言與說話者設定。
- 只產生「導演指示」，不可修改左側稿件。
- 成功後將結果填入右側導演指示文字區，使用者仍可編輯。
- 若導演指示已有內容，覆寫前需確認。

兩個魔術棒使用不同的提示詞與輸出目標；TTS 模型只負責輸出音訊。

### FR-04 模型設定

- 顯示模型名稱、用途、免費層狀態、是否為 Preview。
- 提供可編輯的 `Gemini model name` 欄位，供兩個魔術棒使用。
- 預設值為 `gemini-3.5-flash-lite`。
- 此欄位只控制魔術棒文字模型，不控制 TTS 模型。
- 切換模型時，依模型能力更新可見設定。
- 免費層模式下，僅顯示本 PRD 列出的兩個 Flash TTS 模型。
- 以中央能力設定表控制 `supportsStreaming`、`supportsAudioTags`、`supportsMultiSpeaker` 等欄位。

### FR-05 說話者與聲音

- 單一說話者模式：選擇一個預建聲音。
- 多說話者模式：最多建立兩位說話者，各自選擇聲音。
- 多說話者名稱必須與稿件中的說話者標籤一致。
- 聲音清單使用官方預建聲音名稱與風格標籤。
- 預設聲音需適合中文旁白，實際候選以測試結果決定。

### FR-06 語言與表演控制

- 語言預設為自動偵測，並提供「中文國語 `cmn`」提示。
- 預設導演指示包含「請使用台灣華語、繁體中文朗讀」。
- 提供自然語言欄位：語氣、語速、口音、情緒、場景、自訂導演筆記。
- 3.1 模型顯示音訊標記快速插入，例如 `[whispers]`、`[laughs]`、`[sighs]`、`[excited]`。
- 非英文稿件使用英文音訊標記，以符合官方建議。

### FR-07 音訊生成、試聽與下載

- 使用 Interactions API，以 `response_format: { type: "audio" }` 要求音訊輸出。
- 取得 Base64 PCM 後，在瀏覽器端封裝成 WAV Blob。
- 顯示 HTML Audio Player，支援播放、暫停、進度與音量調整。
- 提供 WAV 下載按鈕。
- 檔名包含日期、模型與聲音名稱，例如 `tts-20260904-kore.wav`。
- 顯示本次生成使用的模型、聲音、稿件版本與生成時間。
- 3.1 模型可選擇串流試聽；串流資料仍需完整收集後才能下載完整 WAV。

### FR-08 生成歷史

- MVP 只保留目前結果。
- 後續可加入瀏覽器 IndexedDB 歷史，儲存音訊 Blob 與設定快照。
- 不將文字或音訊上傳至自有伺服器。

## 7. 建議頁面資訊架構

```text
頁首
├─ 產品名稱與說明
├─ API Key 狀態
└─ 模型選擇

主要內容
├─ 稿件區
│  ├─ 文字輸入框
│  ├─ 稿件魔術棒：產生優化後稿件
│  └─ 字數／Token 資訊
├─ 聲音設定區
│  ├─ 單人／雙人模式
│  ├─ 聲音選擇
│  ├─ 語言與台灣華語提示
│  ├─ 風格、情緒、速度
│  ├─ 音訊標記（僅適用模型顯示）
│  ├─ Gemini model name（魔術棒文字模型）
│  └─ 導演指示文字區與導演指示魔術棒
└─ 音訊結果區
   ├─ 生成按鈕
   ├─ Audio Player
   ├─ 下載 WAV
   └─ 生成資訊
```

桌面版採雙欄佈局；平板與手機版改為單欄，順序為「API／模型 → 稿件 → 聲音設定 → 生成 → 音訊結果」。

## 8. 雙魔術棒處理流程

```text
左側原始稿件 ──稿件魔術棒──> 優化稿件預覽 ──使用者套用──> 左側稿件

目前左側稿件 ──導演指示魔術棒──> 右側導演指示

左側稿件 + 右側導演指示
  → Gemini TTS
  → PCM → WAV
  → 試聽與下載
```

稿件魔術棒提示需要求模型：

- 保留事實、數字、專有名詞與原始意圖。
- 以繁體中文輸出。
- 只輸出優化後稿件。
- 不輸出導演指示、解釋或變更摘要。

導演指示魔術棒提示需要求模型：

- 只根據左側目前稿件產生導演指示。
- 使用繁體中文與台灣華語朗讀方向。
- 指定語氣、節奏、停頓、重音、口音、情緒與場景。
- 不重寫稿件，不輸出稿件內容。

TTS 最終提示應使用清楚的前言與稿件分隔標記，避免模型把風格指示朗讀出來。

## 9. 技術方案

### 9.1 前端技術

- HTML5
- CSS3，使用 CSS Grid、Flexbox、Media Query、CSS Custom Properties
- 原生 JavaScript ES Modules
- 可使用 Vite 作為本地開發與打包工具，但不使用前端框架；目前採零建置靜態檔案
- 使用原生 `fetch` 呼叫 Gemini 官方 Interactions API，避免把 SDK 與額外依賴放入公開前端
- Web Audio API／Blob／URL.createObjectURL
- 不使用後端與伺服器儲存

### 9.2 建議模組

```text
js/
├─ app.js
├─ state.js
├─ model-catalog.js
├─ gemini-client.js
├─ optimizer-service.js
├─ tts-service.js
├─ prompt-builder.js
├─ pcm-to-wav.js
└─ ui.js
```

### 9.3 API 與音訊處理

- 新專案使用 Interactions API。
- 單一說話者使用 `speech_config` 搭配 `voice`。
- 多說話者使用最多兩組 `speaker` 與 `voice`。
- 音訊輸出由 Base64 解碼為 PCM，再加上 WAV Header。
- `gemini-3.1-flash-tts-preview` 提供可選的 SSE 串流試聽；`gemini-2.5-flash-preview-tts` 使用完整回應流程。
- 串流播放先以 Web Audio API 排程 PCM chunk；完成後仍以完整 PCM 封裝可下載的 WAV。

## 10. 錯誤與限制處理

- `401/403`：提示 API Key 無效、無權限或模型不可用。
- `429`：提示免費層 RPM、TPM 或 RPD 已達上限，顯示稍後重試。
- `500`：對 3.1 的偶發文字 Token／伺服器錯誤最多自動重試一次。
- `PROHIBITED_CONTENT`：提示檢查內容與朗讀指示，並提供清楚的 TTS 前言。
- 網路錯誤：保留輸入內容與設定，不清除使用者資料。
- 長文本：在送出前提示切段，生成結果可按段落逐段下載。

## 11. 安全與隱私

- BYOK 是本產品的必要設計：每位使用者使用自己的 API Key。
- 不將 Key 寫入原始碼、環境變數注入的公開 bundle、URL 或 IndexedDB；使用者按下儲存後寫入該瀏覽器的 Local Storage。
- Local Storage 內容是瀏覽器端明文資料，頁面需明確提醒使用者：共用電腦或可被其他腳本讀取的環境不應保存。
- 頁面需提醒：瀏覽器端 Key 可被使用者本人或瀏覽器開發者工具看到。
- 不適合把開發者自己的 Key 放進公開網站。
- 免費層輸入內容依官方價格頁可能被用於改善產品；頁面需提醒使用者避免輸入個資或機密內容。
- 建議使用者在 Google AI Studio／Google Cloud 將 Key 限制於 Gemini API，並設定用量監控。

## 12. RWD 與可用性需求

- 支援寬度 320px 以上的手機、平板與桌面瀏覽器。
- 手機版所有欄位改為單欄，主要按鈕至少 44px 高。
- 音訊控制與下載按鈕在手機上不可超出視窗寬度。
- 文字輸入框可拖曳高度，但不得造成橫向捲軸。
- 使用語意 HTML、鍵盤操作、可見 focus 狀態與 ARIA label。
- 顏色對比符合 WCAG AA 方向。
- 生成中顯示明確狀態：準備中、優化中、生成中、轉換音訊、完成、失敗。

## 13. 驗收標準

- 使用有效的免費層 API Key，可選擇兩個 Flash TTS 模型並完成生成。
- 產生的音訊可在 Chrome、Edge、Safari、Firefox 播放。
- WAV 下載後可使用一般播放器開啟。
- 切換 3.1／2.5 Flash 時，串流與音訊標記等不適用設定會正確隱藏或停用。
- 單人與雙人稿件的聲音配置正確。
- 稿件魔術棒只更新左側稿件預覽，不會未經確認覆蓋原稿。
- 導演指示魔術棒只更新右側導演指示，不會修改左側稿件。
- 兩個魔術棒都使用設定頁的 Gemini model name，預設為 `gemini-3.5-flash-lite`。
- 在 320px、768px、1280px 寬度下沒有主要內容溢出。
- API Key 不會出現在 URL、頁面文字或 IndexedDB；使用者儲存後會存在 Local Storage。
- 429、401、500 與網路中斷時，使用者仍能保留原始稿件與設定。

## 14. 開發階段

### Phase 1：TTS MVP

- BYOK
- 單一說話者
- 2.5 Flash 與 3.1 Flash 模型選擇
- 聲音選擇
- WAV 產生、試聽、下載
- 基本 RWD

### Phase 2：模型差異化

- 模型能力表
- 雙說話者
- 3.1 音訊標記
- 長文本切段
- 429、500、取消與重試處理

### Phase 3：魔術棒

- 朗讀指示優化
- 稿件優化
- 差異比較與確認套用
- 內容類型與預設提示

### Phase 4：體驗完善

- 3.1 串流試聽
- IndexedDB 生成歷史
- 聲音快速試聽
- 繁體中文測試案例與品質評估

## 15. 參考文件

- [Gemini TTS 生成指南](https://ai.google.dev/gemini-api/docs/speech-generation?hl=zh-tw)
- [Gemini 模型](https://ai.google.dev/gemini-api/docs/models)
- [Gemini API 價格與免費層](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini API Key 使用與安全](https://ai.google.dev/gemini-api/docs/api-key)
- [Gemini Interactions API](https://ai.google.dev/api/interactions-api)
