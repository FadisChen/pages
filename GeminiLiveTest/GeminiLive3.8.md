# Gemini Live 3.8 API 開發重點

整理日期：2026-09-22。適用於本專案以原生 JavaScript、WebSocket 實作的即時語音測試頁面。

本文區分三種資訊：**官方規格**、**本專案實作／觀察**、**尚未確認的問題**。範例是原生 WebSocket JSON，不可直接當成 Google GenAI SDK 的參數結構。

## 1. 模型選擇

| 項目 | `gemini-3.8-live` | `gemini-3.8-live-extended-thinking` |
| --- | --- | --- |
| 使用情境 | 即時對話、簡單工具任務 | 較複雜的規劃、耗時工具任務 |
| 思考設定 | 不送 `thinkingConfig` | 支援 `LOW`、`MEDIUM`、`HIGH`，不支援 `MINIMAL` |
| 工具宣告 | 可使用同步或非同步工具 | 所有工具必須宣告 `NON_BLOCKING` |
| 回合判斷 | 一般以 `turnComplete` 判斷回合完成 | 必須另外追蹤 `interactionStatus` |

一般版不能設定思考深度，不代表模型完全沒有推理。延伸思考版則可能在工作尚未結束前，多次說出進度說明。[官方 Thinking 文件](https://ai.google.dev/gemini-api/docs/live-api/thinking)

**本專案設定：**預設使用延伸思考版、`LOW`、`Zephyr` 音色；提供一般版快速切換。切換設定後需重新連線，既有 session 不會因畫面欄位變更而重新 setup。

## 2. 連線與 setup

本專案使用的端點：

```text
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent
```

BYOK 測試頁以 `?key=<API_KEY>` 帶入金鑰。`setup` 是每條連線的第一個設定訊息；收到 `setupComplete` 後，才送音訊、文字或工具結果。[WebSocket API reference](https://ai.google.dev/api/live)

以下是配合本專案工具設計的延伸思考版 setup：

```json
{
  "setup": {
    "model": "models/gemini-3.8-live-extended-thinking",
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": { "voiceName": "Zephyr" }
        }
      },
      "thinkingConfig": { "thinkingLevel": "LOW" }
    },
    "systemInstruction": {
      "parts": [{ "text": "請以繁體中文回應。slow_lookup 是模擬查詢，請明確區分模擬結果與真實資料。" }]
    },
    "inputAudioTranscription": {},
    "outputAudioTranscription": {},
    "tools": [{
      "functionDeclarations": [{
        "name": "slow_lookup",
        "description": "延遲數秒後回傳模擬資料，供非同步工具測試。",
        "behavior": "NON_BLOCKING",
        "parameters": {
          "type": "OBJECT",
          "properties": { "query": { "type": "STRING" } },
          "required": ["query"]
        }
      }]
    }]
  }
}
```

改用一般版時，將 `model` 換為 `models/gemini-3.8-live`，並移除 `generationConfig.thinkingConfig`。此範例刻意只宣告一個工具；本專案還有 `get_current_time`。

**欄位位置：**上例為原生協定，`thinkingConfig` 在 `setup.generationConfig` 內；官方 SDK 範例可能把它放在 SDK 的 `config` 物件內，由 SDK 轉換，不能直接混用。[Thinking setup 範例](https://ai.google.dev/gemini-api/docs/live-api/thinking#step-1-session-setup)

## 3. 音訊、文字與逐字稿

| 資料 | 開發重點 |
| --- | --- |
| 麥克風輸入 | 本專案轉成 16 kHz、16-bit signed PCM、little-endian，再 Base64 編碼 |
| 模型音訊 | 標準輸出為 24 kHz PCM；本專案讀取 MIME 的 `rate` 決定播放器取樣率 |
| 回應模式 | 本專案固定 `AUDIO`；需要文字觀察時使用輸出逐字稿 |
| 文字輸入 | 仍可與模型對話，不必把回應模式改成 `TEXT` |

官方總覽列出的語音輸出格式為 PCM 音訊。[Live API overview](https://ai.google.dev/gemini-api/docs/live-api#technical-specifications)

本專案送音訊的訊息形狀如下；`<BASE64_PCM>` 必須替換成實際 PCM 資料，不能放 WAV 標頭或直接放壓縮音訊：

```json
{
  "realtimeInput": {
    "audio": {
      "data": "<BASE64_PCM>",
      "mimeType": "audio/pcm;rate=16000"
    }
  }
}
```

本專案送文字使用：

```json
{
  "clientContent": {
    "turns": [{ "role": "user", "parts": [{ "text": "請用 slow_lookup 查詢台中市政府" }] }],
    "turnComplete": true
  }
}
```

開啟 `inputAudioTranscription`、`outputAudioTranscription` 後，分別處理 `serverContent.inputTranscription.text` 與 `serverContent.outputTranscription.text`。逐字稿與其他訊息不保證完全同步，不能靠文字先後推斷工具是否已成功執行。[WebSocket API reference](https://ai.google.dev/api/live#bidigeneratecontentservercontent)

## 4. 非同步工具：宣告、執行、回傳

工具流程在本專案為：

1. 收到 `toolCall.functionCalls`，保留每個呼叫的 `id`、`name`、`args`。
2. `handleFunctionCall()` 啟動工作，將任務登記到 `pendingToolIds`。
3. 等待期間繼續處理音訊及其他伺服器事件，不阻塞訊息接收。
4. 完成時確認任務尚未取消、仍屬於同一次呼叫，再回傳結果。

以下是本專案使用的成功回傳形狀：

```json
{
  "toolResponse": {
    "functionResponses": [{
      "id": "call_123",
      "name": "slow_lookup",
      "response": {
        "result": {
          "query": "台中市政府",
          "summary": "這是示範用模擬結果，並非真實查詢。",
          "elapsedMs": 5000
        }
      }
    }]
  }
}
```

`id` 必須對應伺服器發出的呼叫；Live API 使用專用的 `toolResponse` 訊息回傳，不要改成一般聊天文字。[WebSocket 工具回應規格](https://ai.google.dev/api/live#bidigeneratecontenttoolresponse)

### NON_BLOCKING 與 scheduling 是不同能力

本專案曾送出 `FunctionResponse.scheduling`，實際收到：

```text
code: 1007
Function response scheduling is not supported for this model.
```

**本專案處理策略：**保留 `NON_BLOCKING` 宣告，但所有工具結果均不送 `scheduling`，也不提供排程選項。這是針對本次實際錯誤的相容性處理，不能推論所有模型永久不支援排程。

一般工具教學中的 `INTERRUPT`、`WHEN_IDLE`、`SILENT` 不應不加區分地套用到延伸思考模型。不要為了繞過錯誤，把不支援的控制欄位移入 `response`，並宣稱排程功能已可用。

目前的 `response.result` 與官方 Thinking SDK 範例用法相符；尚無證據證明必須更名為 `output` 才能解決模型口頭回報失敗的問題。[Thinking 工具回傳範例](https://ai.google.dev/gemini-api/docs/live-api/thinking#sdk-implementation-examples)

### 取消與重連

收到 `toolCallCancellation.ids` 後，不再回傳那些工作的結果。插話可能造成工具取消，因此「背景執行」不代表工作一定不會被取消。[工具取消規格](https://ai.google.dev/api/live#bidigeneratecontenttoolcallcancellation)

本專案用每次呼叫的任務物件識別工作；即使重連後 `id` 相同，舊 Promise 也不能把結果送進新任務。真實 HTTP／資料庫工具若支援取消，應另外中止實際工作；目前模擬工具僅阻止取消後的結果回傳。

## 5. 延伸思考的狀態判斷

| 事件／狀態 | 本專案應如何解讀 |
| --- | --- |
| `turnComplete: true`、`IN_PROGRESS` | 語句已結束，背景任務仍在進行；不是錯誤 |
| 尚有 `pendingToolIds` | 前端工具尚未回傳或尚未結束 |
| 工具結果交給 WebSocket | 僅表示呼叫 `send()` 成功，不是伺服器處理確認 |
| `interactionStatus: "IDLE"` | 伺服器表示目前互動已完成 |
| 模型說「查詢失敗」 | 對話內容，必須搭配工具與連線紀錄診斷 |

延伸思考可能在一個任務內輸出多段話；不能在第一個 `turnComplete` 就清掉工作、停止接收或斷線。[Thinking lifecycle](https://ai.google.dev/gemini-api/docs/live-api/thinking#step-3-model-response-and-state-lifecycle)

文件的 SDK／協定範例存在不同狀態位置；本專案同時讀取 `msg.interactionStatus` 與 `msg.serverContent.interactionStatus`。狀態訊息未帶新值時，保留前值。實際顯示也參考前端待回傳工具。

**前端設計建議：**分別追蹤伺服器互動狀態、工具工作狀態及喇叭播放佇列。模型生成完畢與本地音訊播放完畢不是同一時刻；目前 badge 尚未完整整合播放佇列狀態。

## 6. VAD、插話與主動語音判斷

本專案提供以下設定：

| 設定 | 用途 |
| --- | --- |
| `realtimeInputConfig.activityHandling` | 選擇 `START_OF_ACTIVITY_INTERRUPTS` 或 `NO_INTERRUPTION` |
| `automaticActivityDetection.startOfSpeechSensitivity` | 開始說話偵測靈敏度 |
| `automaticActivityDetection.endOfSpeechSensitivity` | 結束說話偵測靈敏度 |
| `silenceDurationMs` | 結束語音前等待的靜音時間 |
| `prefixPaddingMs` | 保留語音起點之前的音訊 |
| `proactivity.proactiveAudio` | 讓模型判斷輸入聲音是否值得回應 |

proactive audio 與 VAD、插話是不同設定：前者影響是否回應，後者影響語音活動偵測及打斷方式。[Capabilities guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities)

使用自動 VAD 時，若音訊暫停超過一秒，例如關閉麥克風，應送出以下訊息清空未完成音訊；之後可恢復串流。本專案在按下靜音時立即送出：[Automatic VAD](https://ai.google.dev/gemini-api/docs/live-api/capabilities#automatic-vad)

```json
{ "realtimeInput": { "audioStreamEnd": true } }
```

收到 `serverContent.interrupted` 時，本專案停止並清空本地音訊播放。這不等同於取消所有工具，工具仍依伺服器的取消 ID 處理。若日後關閉自動 VAD，需另實作 `activityStart`／`activityEnd`，不能照搬本頁靜音策略。

## 7. 本次問題與確認程度

| 問題 | 狀態 | 處理／證據 |
| --- | --- | --- |
| 回傳 scheduling 導致 1007 | 有使用者實際錯誤紀錄，已修改客戶端 | 移除工具結果排程欄位 |
| 延伸思考的時間工具沒有 NON_BLOCKING | 已修正 | setup 建立時為所有工具設定 |
| 漏讀最外層 interactionStatus | 已修正 | 同時支援兩個位置 |
| 麥克風靜音沒有 audioStreamEnd | 已修正 | 靜音事件送出音訊結束 |
| 舊工具結果可能污染重連後相同 ID | 已修正 | 比對任務物件身分 |
| 連線關閉／send 失敗仍誤報或吞掉錯誤 | 已修正 | 明確記錄「工具結果未送出」 |
| 延伸思考口頭說無法查詢，一般版正常 | **使用者重測已正常；原始根因尚未確認** | 2026-09-22 使用者回報更新後測試看起來均正常；未取得原失敗 session 的完整工具生命週期紀錄 |

最後一項不能僅靠「背景工作尚未完成」訊息判定為逾時、格式錯誤或模型服務故障。`slow_lookup` 本來只回傳模擬文字，不會連網查詢市政府資料；模型的自然語言回答也不是查詢成功的可靠證據。

### 建議診斷順序

1. 重新整理頁面並建立新的 session，確認 setup 模型名稱。
2. 確認是否真的收到 `slow_lookup` 呼叫與 ID；沒有呼叫時，前端工具沒有機會執行。
3. 對照同一 ID 是否被取消，或出現送出失敗。
4. 若已交給 WebSocket，觀察後續狀態、關閉原因與模型回應，不能直接宣稱伺服器已收到。
5. 用相同提示、設定、工具及資料比較兩種模型；先測不插話，再測等待期間插話，一次只改一個變因。

紀錄請保留事件時間、模型、呼叫 ID、狀態及錯誤；不要記錄 API Key 或含金鑰的完整 WebSocket URL。

## 8. 專案對照與驗證

| 檔案／函式 | 責任 |
| --- | --- |
| [index.html](index.html)／`buildSetupConfig()` | 建立模型、語音、思考與工具設定 |
| `sendAudioChunk()`、`sendTextMessage()` | 音訊及文字輸入 |
| `onServerJson()` | 分派回應、逐字稿、狀態、工具呼叫及取消 |
| `executeSlowLookup()` | 隨機等待 4～7 秒後產生模擬結果 |
| `handleFunctionCall()`、`sendToolResponse()` | 工具生命週期與結果送出 |
| `PCMPlayer` | PCM 播放、靜音及打斷 |
| [live-api.test.cjs](live-api.test.cjs) | Node.js VM 載入實際頁面腳本的回歸測試 |

從專案根目錄執行：

```powershell
node --test live-api.test.cjs
```

最近一次執行為 **10 項通過**，涵蓋非同步工具、排程欄位、模型 setup、互動狀態、取消、重連、靜音，以及送出失敗。這些是模擬 DOM／WebSocket 測試，**不等同真實 Gemini 服務與麥克風端到端驗證**。

**使用者實測回饋（2026-09-22）：**依前次建議重測後，回報「看起來都正常了」。此回饋表示本次重測未再觀察到問題；未提供逐項測試紀錄，因此不宣稱完整測試矩陣均已驗證，也不推定先前口頭回報失敗的唯一原因。

## 9. 正式應用前仍需補齊

以下是開發待辦，並非宣稱本頁已實作：

- 認證：目前 BYOK 頁面會把金鑰存於 localStorage；正式瀏覽器應用應評估後端核發短效 token。官方建議用 ephemeral tokens 取代直接下發長效 API Key。[官方連線架構建議](https://ai.google.dev/gemini-api/docs/live-api#choose-an-implementation-approach)
- 連線生命週期：目前 `goAway` 僅顯示提醒，沒有自動重連、session resumption 或長對話的 context window compression。
- 真實工具：替換模擬資料，加入實際業務的參數驗證、逾時、取消與錯誤契約。
- 實機驗證：測試長時間連線、麥克風權限、插話、背景分頁及斷線重連。測試矩陣需分開一般版與延伸思考版。

API 與模型能力可能更新；升級時應重新核對官方文件及實際模型回應，不要把本次相容性處理當成永久的通用規則。
