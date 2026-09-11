# 尾牙主持人 Nami — Year End Party Host

用 [`Avatar/`](../Avatar/) 資料夾裡同一個 VRM 角色（Nami）與 Gemini Live API，做成一個給尾牙現場用的虛擬主持人。完整規劃、架構決策與風險討論見 [`PLAN.md`](./PLAN.md)。

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

兩台裝置之間用 WebRTC（PeerJS 免費公用訊號伺服器牽線）直接互傳音訊與控制指令，細節與已知風險（會場 Wi-Fi 用戶隔離可能需要自備 TURN）見 `PLAN.md` 第 0.1 節。

## 檔案結構

```text
YearEndParty/
├── PLAN.md              完整規劃書：架構、決策理由、風險、Roadmap
├── README.md             本檔案
│
├── index.html/app.js/styles.css      單機測試模式
├── stage.html/stage.js/stage.css     投影端
├── operator.html/operator.js/operator.css   手機遙控端
└── webrtc-link.js        stage.js 與 operator.js 共用：配對設定、Rundown 環節清單
```

## 目前的限制

- 情緒表情（`set_avatar_emotion`）已接上；抽獎、音效、AI 建議換環節等擴充 tool 還沒做。
- API Key 是開發測試模式（存在瀏覽器 localStorage），沒有做 ephemeral token，正式對外使用前需要處理。
- 沒有在真實的兩台裝置／真實會場網路下測試過 WebRTC 配對，上場前務必實測。

更完整的規劃、待辦與風險清單見 [`PLAN.md`](./PLAN.md)。
