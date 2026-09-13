# Orbit Friend — Gemini Live Avatar

這是一個不需要建置的純前端頁面。Three.js 與 `@pixiv/three-vrm` 由 HTML import map 從 CDN 載入；五個可選的 VRM 模型位於同層的 `../vrm/`，因此部署時必須保留 `Avatar/` 與 `vrm/` 的相對位置。它使用瀏覽器原生 WebSocket 連接 Gemini Live API，使用 Web Audio API 完成麥克風 PCM 取樣、回覆音訊排程與 client-side lip sync。

## 啟動

在專案根目錄執行：

```powershell
python -m http.server 4174
```

開啟 <http://localhost:4174/Avatar/>。伺服器根目錄必須是 `pages/`，不能只提供 `Avatar/`，否則模型會回傳 404。

## 使用

1. 點擊頁面右上角的設定 icon，在彈出視窗貼上 Gemini API key、選擇 voice／thinking level，並可調整 Nami 的人物設定。必要的對話與 Avatar 工具規則由 Avatar 內部固定，不會顯示在設定介面。可調整的設定會保存至目前瀏覽器的 `localStorage`；API key 請只用於開發測試。
2. 按「開始對話」，允許麥克風權限並等待 `CONNECTED`；通話中同一顆按鈕會變成紅色的「結束對話」。
3. 若瀏覽器詢問定位權限，可允許 Avatar 取得本次 session 的約略座標；若拒絕，仍會使用時區與瀏覽器語系作為地點近似資訊。這些時間／地點資料只送出一次作為 Live session 初始上下文，不會保存或顯示在逐字稿。
4. 使用耳機降低回音；Gemini 回傳的 24 kHz PCM 會直接送進 Web Audio 播放器與嘴型分析器。

## Avatar 操作

- 在角色舞台上以滑鼠左鍵或單指左右拖曳旋轉角色。
- 設定中可切換 SpringSnow、Mia、Sha、Su、Purple；切換時釋放舊模型，過期的載入結果不會覆蓋目前角色或進度。
- 舞台固定以電視主播式構圖聚焦角色上半身，下緣約在胸部以下、腰部以上。
- Gemini 只在需要明顯表情或情緒轉折時最多呼叫一次 `set_avatar_emotion({ emotion })`；呼吸、眨眼、說話微動與嘴型仍由本地動畫處理。
- Gemini 可依回覆語意呼叫 `play_avatar_gesture({ gesture })`：`nod` 點頭、`shake_head` 搖頭、`wave` 手心朝前、以手肘為支點小幅揮動前臂、`present` 手心向上且前臂向外展示、`tilt_head` 歪頭。每個回覆最多一個動作，可與表情同時使用，沒有合適情境時不觸發。
- 動作由 `avatar-gestures.js` 在本地播放，疊加在待機姿勢之後；等語音播放才開始，插話、斷線、結束通話時淡出，切換模型時清除。沒有語音的待播動作會在回覆結束或等待逾時後清除。這是回覆層級的搭配，沒有逐字音訊對齊。
- 除了 `../vrm/*.vrm` 模型，Avatar 不引用專案其他目錄的 script、動作檔或素材；沿用既有 CDN Three.js／three-vrm，無需 MediaPipe。

## Gemini Live model 與 voice

Live model 固定使用 `gemini-3.1-flash-live-preview`，並共用 Avatar emotion tool：

- `gemini-3.1-flash-live-preview`：使用 `thinkingLevel`，function calling 採同步回應。

Voice 下拉選單包含官方 30 組 prebuilt voice：

`Zephyr`、`Puck`、`Charon`、`Kore`、`Fenrir`、`Leda`、`Orus`、`Aoede`、`Callirrhoe`、`Autonoe`、`Enceladus`、`Iapetus`、`Umbriel`、`Algieba`、`Despina`、`Erinome`、`Algenib`、`Rasalgethi`、`Laomedeia`、`Achernar`、`Alnilam`、`Schedar`、`Gacrux`、`Pulcherrima`、`Achird`、`Zubenelgenubi`、`Vindemiatrix`、`Sadachbia`、`Sadaltager`、`Sulafat`。

正式環境不應把永久 API key 放進前端或 localStorage；請改成由安全的 token provider 發放 ephemeral token。VRM renderer 已將音訊／viseme／狀態／情緒分層，Gemini 或 Audio pipeline 不需要直接操作 Three.js 物件。模型載入依賴外部 CDN 與本地 HTTP server，請不要用 `file://` 直接開啟 HTML。

## 回歸驗證

在 repo 根目錄執行（已使用 Node.js 24 與 Windows Edge 驗證）：

```powershell
node --test Avatar/tests/audio-regressions.test.mjs Avatar/tests/gestures.test.mjs
node Avatar/tests/browser-smoke.mjs
```

單元測試涵蓋音訊不中斷、取樣率、過期連線、麥克風取消、模型載入競態與失敗後通話清理。瀏覽器測試使用真實 Web Audio／AudioWorklet 與虛擬麥克風，檢查忙碌主執行緒下的收音、離線音訊不重播、停止及重新啟動；可用 `AVATAR_BROWSER` 指定 Chromium 執行檔。

測試會模擬 Gemini 回應及模型載入，不驗證真實 Gemini 服務或 VRM 畫面。人工驗收時，請確認五個模型可載入、快速切換後保留最後選擇，並以實際 API key 測試語音、插話、斷線重連與結束後再次通話。

另有實際 VRM 畫面測試（需已安裝 `playwright-cli`，並啟動上述 HTTP server）：

```powershell
New-Item -ItemType Directory -Force output/playwright | Out-Null
playwright-cli -s=avatar-gestures open http://127.0.0.1:4174/Avatar/
playwright-cli -s=avatar-gestures run-code (Get-Content -Raw Avatar/tests/browser-gestures.js)
playwright-cli -s=avatar-gestures close
```

此測試在測試分頁中注入控制入口，載入五個真實模型、輸出五種動作對照圖至 `output/playwright/avatar-gestures.png`，並在 1280 × 800 視窗逐幀檢查可見中指末節骨骼的側邊／上緣邊界；不修改正式頁面、不連接 Gemini。它不取代不同視窗尺寸、旋轉角度或服裝穿模的人工檢查。

## 作為 YearEndParty 的優化參考

本輪只修改 `Avatar/`，保留連續收音與伺服器自動 VAD。已確認 `YearEndParty/app.js`、`stage.js` 也有相同的模型載入流程，後續可依下列順序套用並驗證：

| 項目 | Avatar 的處理方式 | YearEndParty 驗收重點 |
| --- | --- | --- |
| 模型切換 | 每次載入重設進度；忽略舊請求進度並釋放晚到的模型 | 單機與投影端快速切換後只保留最後選擇 |
| 場景釋放 | 使待處理載入失效，釋放場景與 renderer | 投影端須另外涵蓋浮動視窗的搬移與關閉，搬移不代表銷毀 |
| 最終連線失敗 | `failed` 結束通話、停止麥克風及音訊、重設按鈕；`reconnecting` 保留通話 | 單機 PTT 狀態，以及投影端與手機間的連線狀態需同步處理 |
| 通話結束 | 在等待麥克風停止完成之前，先完成通話 UI 與音訊狀態清理 | 快速結束再開始時，舊通話不得清掉新通話狀態 |

YearEndParty 已將 Live session、播放器、麥克風拆成模組；後續共用化可沿用這些職責邊界，但需保留 Avatar 的自動 VAD 與 YearEndParty 的 PTT 起訖差異。先移植上述修復及測試，再決定共用模組，避免直接覆蓋現場主持流程。
