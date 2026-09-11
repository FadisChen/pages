# 尾牙主持人 Nami — Year End Party Host

用 [`Avatar/`](../Avatar/) 資料夾裡同一個 VRM 角色（Nami）與 Gemini Live API，做成一個給尾牙現場用的虛擬主持人。目前的問題診斷、修復內容與後續規劃見 [`ARCHITECTURE_PLAN.md`](./ARCHITECTURE_PLAN.md)；第一版設計紀錄保留於 [`PLAN.md`](./PLAN.md)。

## 三個入口

| 檔案 | 給誰用 | 做什麼 |
| --- | --- | --- |
| `stage.html` | 投影端筆電（接投影機＋會場音響） | 只顯示 VRM Avatar、連線 Gemini Live、播放語音。沒有任何控制項、沒有字幕——投影出去的畫面很乾淨。 |
| `operator.html` | 工作人員手機 | push-to-talk 收音按鈕、Rundown 環節按鈕、現場備註。不顯示 Avatar、不連 Gemini、不播放聲音。 |
| `index.html` | 任何一台裝置（單機） | 把上面兩者合併在同一頁，方便一個人在同一台裝置上快速測試 push-to-talk／環節切換的行為，不用配對兩台裝置。 |

正式上場用 `stage.html` + `operator.html` 這一組（見下方「兩機模式」）；開發或彩排前想先確認邏輯對不對，開 `index.html` 最快。

## 啟動方式

這個資料夾**不是獨立可攜的**——`stage.js`／`app.js` 透過相對路徑重用 `../Avatar/` 底下的 VRM 模型、背景圖、favicon 與幾個共用小工具模組，所以一定要從 **repo 根目錄**（`pages/`，`Avatar/` 與 `YearEndParty/` 的共同上層）起靜態伺服器：

```bash
cd pages
python3 -m http.server 4173
```

然後依用途開對應網址：

- 單機測試：`http://localhost:4173/YearEndParty/index.html`
- 投影端：`http://localhost:4173/YearEndParty/stage.html`
- 遙控端：`http://localhost:4173/YearEndParty/operator.html`

麥克風需要安全來源（`https://` 或 `localhost`），`file://` 直接開啟不會動。

## 兩機模式（正式上場）

1. **兩台裝置都要能連到同一個可公開存取的網址**——`localhost` 只有同一台機器能開，手機開不到筆電的 `localhost`。建議直接部署到 GitHub Pages（本身是 HTTPS）；本機測試可以用 ngrok 之類的內網穿透工具暫時給一個 HTTPS 網址。
2. 筆電開 `stage.html`，點右上角設定 icon 貼上 Gemini API key（開發測試用，存在這台筆電瀏覽器的 localStorage），按「開始對話」。
3. 畫面會顯示配對用的房號與 QR code。
4. 手機開 `operator.html`（掃 QR code 會自動帶入房號），按「連線」，允許麥克風權限。
5. 配對成功後，`stage.html` 的配對面板會自動收起，只留乾淨的 Avatar 畫面；手機按住「按住說話」收音、放開輪到 Nami 回應，用 Rundown 按鈕切換環節。

兩台裝置之間用 WebRTC（PeerJS 公用訊號伺服器牽線）的同一條有序 data channel 傳送 PCM 音訊與控制指令。手機與單機共用 AudioWorklet 收音，放開後會先送完句尾，再結束回合。更新時須同時重新整理手機與投影端，新舊音訊協定不能混用。會場 Wi-Fi 若限制 P2P，仍可能需要自備 TURN。

## 檔案結構

```text
YearEndParty/
├── ARCHITECTURE_PLAN.md  目前架構、修復證據、後續 Plan 與驗收方式
├── PLAN.md              第一版設計紀錄
├── README.md             本檔案
│
├── index.html/app.js/styles.css      單機測試模式
├── stage.html/stage.js/stage.css     投影端
├── operator.html/operator.js/operator.css   手機遙控端
├── webrtc-link.js        配對設定、Rundown 環節清單與訊息契約
├── host-config.js        模型與系統提示詞
├── live-session.js       Gemini 回合、工具呼叫與重連
├── audio-player.js       PCM 播放排程與分析器
├── microphone.js         單機與手機共用的收音生命週期
├── pcm-capture.worklet.js 音訊執行緒上的取樣、PCM 與 PTT 起訖
└── tests/                語音回歸測試與 Edge 瀏覽器檢查
```

## 目前的限制

- 情緒表情（`set_avatar_emotion`）已接上；抽獎、音效、AI 建議換環節等擴充 tool 還沒做。
- API Key 是開發測試模式（存在瀏覽器 localStorage），沒有做 ephemeral token，正式對外使用前需要處理。
- 沒有在真實的兩台裝置／真實會場網路下測試過 WebRTC 配對，上場前務必實測。

在 repo 根目錄執行 `node --test YearEndParty/tests/host-regressions.test.mjs` 驗證音訊時序；`node YearEndParty/tests/browser-smoke.mjs` 使用已安裝的 Edge 與虛擬麥克風檢查收音流程（可用 `YEP_BROWSER` 環境變數指定 Chromium 路徑）。測試不呼叫 Gemini，真實辨識與聲線品質仍需按 [`ARCHITECTURE_PLAN.md`](./ARCHITECTURE_PLAN.md) 實機驗收。
