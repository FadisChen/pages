# Orbit Friend — Gemini Live Avatar

這個資料夾是一個可獨立啟動的純前端頁面，沒有引用 `web/` 其他目錄的程式、圖片或套件。Three.js 與 `@pixiv/three-vrm` 由 HTML import map 從 CDN 載入，VRM 模型使用本資料夾內的 `SpringSnow無料版.vrm`。它使用瀏覽器原生 WebSocket 連接 Gemini Live API，使用 Web Audio API 完成麥克風 PCM 取樣、回覆音訊排程與 client-side lip sync。

## 啟動

在專案根目錄執行：

```powershell
python -m http.server 4174 --directory web/Avatar
```

開啟 <http://localhost:4174/>。

## 使用

1. 點擊頁面右上角的設定 icon，在彈出視窗貼上 Gemini API key、選擇 voice／thinking level，並可調整 Nami 的人物設定。必要的對話與 Avatar 工具規則由 Avatar 內部固定，不會顯示在設定介面。可調整的設定會保存至目前瀏覽器的 `localStorage`；API key 請只用於開發測試。
2. 按「開始對話」，允許麥克風權限並等待 `CONNECTED`；通話中同一顆按鈕會變成紅色的「結束對話」。
3. 若瀏覽器詢問定位權限，可允許 Avatar 取得本次 session 的約略座標；若拒絕，仍會使用時區與瀏覽器語系作為地點近似資訊。這些時間／地點資料只送出一次作為 Live session 初始上下文，不會保存或顯示在逐字稿。
4. 使用耳機降低回音；Gemini 回傳的 24 kHz PCM 會直接送進 Web Audio 播放器與嘴型分析器。

## Avatar 操作

- 在角色舞台上以滑鼠左鍵或單指左右拖曳旋轉角色。
- 舞台固定以電視主播式構圖聚焦角色上半身，下緣約在胸部以下、腰部以上。
- Gemini 只在需要明顯表情或情緒轉折時最多呼叫一次 `set_avatar_emotion({ emotion })`；呼吸、眨眼、說話微動與嘴型仍由本地動畫處理。

## Gemini Live model 與 voice

Live model 固定使用 `gemini-3.1-flash-live-preview`，並共用 Avatar emotion tool：

- `gemini-3.1-flash-live-preview`：使用 `thinkingLevel`，function calling 採同步回應。

Voice 下拉選單包含官方 30 組 prebuilt voice：

`Zephyr`、`Puck`、`Charon`、`Kore`、`Fenrir`、`Leda`、`Orus`、`Aoede`、`Callirrhoe`、`Autonoe`、`Enceladus`、`Iapetus`、`Umbriel`、`Algieba`、`Despina`、`Erinome`、`Algenib`、`Rasalgethi`、`Laomedeia`、`Achernar`、`Alnilam`、`Schedar`、`Gacrux`、`Pulcherrima`、`Achird`、`Zubenelgenubi`、`Vindemiatrix`、`Sadachbia`、`Sadaltager`、`Sulafat`。

正式環境不應把永久 API key 放進前端或 localStorage；請改成由安全的 token provider 發放 ephemeral token。VRM renderer 已將音訊／viseme／狀態／情緒分層，Gemini 或 Audio pipeline 不需要直接操作 Three.js 物件。模型載入依賴外部 CDN 與本地 HTTP server，請不要用 `file://` 直接開啟 HTML。
