# AvatarTrueMan

`AvatarTrueMan/` 是不依賴 Three.js、VRM 或 WebGL 的 Canvas 2D 真人感 Gemini Live Demo。

## 啟動

請從專案根目錄啟動 HTTP server，不能直接用 `file://` 開啟，因為頁面要載入 manifest、圖片與 AudioWorklet：

```powershell
python -m http.server 5173
```

然後開啟：

```text
http://localhost:5173/AvatarTrueMan/
```

在「連線設定」貼上 Gemini API key。這個 key 只適合本機 Demo，會保存到瀏覽器 `localStorage`；正式部署應改成後端簽發 ephemeral token。

## 架構

- `avatar-2d.js`：以 manifest 管理五官素材與形變座標；嘴巴分開控制唇厚與口腔開合，眼皮局部閉合，表情從當下混合狀態銜接。呼吸、重心轉移及說話時的輕微起伏以共用變換維持五官對齊，整張人像只繪製一次以避免橫條接縫。
- `audio.js`：AudioWorklet 以 16 kHz、20 ms PCM16 little-endian chunk 擷取麥克風，並用 24 kHz 排程播放 Live 音訊。
- `live-client.js`：Gemini Live WebSocket、automatic VAD、上下行 transcription、session resumption、context compression 與 emotion tool。
- `app.js`：狀態機、字幕、插話清理與 UI 控制。
- `assets/avatar-manifest.json`：所有圖片座標與素材路徑的唯一來源。

生成圖檔的原始輸出以 checkerboard 表示透明背景；Canvas 載入基底圖時會將邊界連通的 checkerboard 轉成 alpha，避免舞台顯示格紋。五官素材只取固定臉部 patch，因此不會把全幅背景疊回畫面。

## 測試

```powershell
node --test tests/*.test.mjs
```

`tests/browser-smoke.py` 是 Playwright smoke test；若本機已安裝 Python Playwright，可搭配 `webapp-testing` skill 的 `with_server.py` 執行。Gemini 連線不在 smoke test 內，避免測試消耗 API 或要求麥克風權限。

`tests/visual-check.js` 可用 Playwright CLI 的 `run-code --filename AvatarTrueMan/tests/visual-check.js` 從專案根目錄執行（先啟動 server、開啟瀏覽器並建立 `output/playwright/`）。它檢查合成中心不透出底圖、邊界羽化，並輸出五種嘴型、眨眼、表情與吸吐氣的對照圖。素材座標集中在 manifest 的 `rig`；更換照片時需要一起校正。

嘴型由播放中的音量與頻帶估計，並非逐字音素辨識；音量增益在 `audio.js`，音量到下顎開合的曲線在 `avatar-2d.js`。不明確的頻帶使用放鬆的張嘴形狀，低音量不選圓唇。保留 o 較寬、u 較窄的圓口差異；兩者使用 o 的張嘴素材，避免原 u 素材過度噘唇，再分別控制口腔寬高。唇厚與開口獨立控制，減少噘唇不會一併壓低張嘴幅度。呼吸約 4.8 秒一循環，吸氣較快、吐氣較慢；系統開啟減少動態效果時停用姿態、呼吸與自動眨眼。

執行 `visual-check.js` 後，可在同一個 Playwright session 執行 `run-code --filename AvatarTrueMan/tests/motion-preview.js`，輸出 `output/playwright/avatar-motion-preview.webm`。這段預覽用合成的嘴型事件展示待機、說話及停止，沒有呼叫 Gemini API。

表情至少保留 3.5 秒，正常播放結束後再保留 1.8 秒並淡回 neutral；持續說話時延後退場。插話、断線與結束通話可直接開始回復 neutral，不必等待停留時間。新的非 neutral 表情會取代上一個表情並取消舊的退場排程。

嘴型以最近 12 ms 的波形與相對音量低谷判定收口，靜音不再等待母音穩定器。下顎快速收回並保留短暫閉合，恢復聲音後再張開；不依文字強制每個字閉嘴，也不對持續母音插入週期性的閉嘴。

`tests/speech-preview.js` 會讀取 `output/playwright/avatar-speech.wav`（本機測試使用 Windows Hanhan 合成「哈囉。很高興見到你。你好嗎？」），重採樣成 24 kHz PCM，走實際播放器、LipSyncEngine 與人像事件流程。先執行 `visual-check.js`，再以相同 session 的 `run-code --filename` 執行；輸出含聲音的 `output/playwright/avatar-speech-preview.webm`，並驗證開合及表情停留。這是本機音訊測試，不是 Gemini 連線測試。
