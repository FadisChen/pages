function clip(value, maxLength = 16000) {
  return String(value || "").trim().slice(0, maxLength);
}

export function buildScriptOptimizationPrompt({ script, contentType = "旁白／解說" }) {
  return `你是一位熟悉台灣華語的專業中文口語編輯。請把下方稿件優化成適合 Gemini TTS 朗讀的繁體中文稿件。

內容類型：${contentType}

請遵守：
1. 保留原稿的事實、數字、專有名詞、順序與核心意圖，不自行補充或刪除重要資訊。
2. 改善不自然的書面語、句子長度、標點與分段，讓朗讀更順暢。
3. 使用台灣常用的繁體中文；需要時可用全形標點協助停頓。
4. 只輸出優化後的稿件，不要輸出標題、Markdown、解釋、修改摘要或導演指示。

--- 原稿開始 ---
${clip(script)}
--- 原稿結束 ---`;
}

export function buildDirectorNotesPrompt({
  script,
  ttsModel,
  voice,
  language,
  speakerMode,
  contentType,
}) {
  const languageText = language === "cmn" ? "中文國語（cmn），偏台灣華語" : "依稿件自動偵測語言";
  const modeText = speakerMode === "multi" ? "雙說話者對話" : "單一說話者旁白";

  return `你是一位專業配音導演，請只根據下方稿件寫出給 TTS 模型使用的導演指示。

設定脈絡：
- 內容類型：${contentType}
- TTS 模型：${ttsModel}
- 聲音：${voice}
- 語言方向：${languageText}
- 表演形式：${modeText}

請遵守：
1. 只輸出導演指示，不要重寫、複製或朗讀稿件，不要加上「導演指示：」標題。
2. 以繁體中文撰寫，提供可直接貼給 TTS 模型的具體指示。
3. 視稿件內容指定語氣、情緒、節奏、停頓、重音、語尾、音量與場景；若是對話，說明角色區分。
4. 預設使用自然、清楚、親切的台灣華語；不要提出稿件中沒有根據的劇情或事實。
5. 指示控制在 80 至 180 字左右，簡潔但要能實際影響表演。

--- 稿件開始（只供分析，不要輸出） ---
${clip(script)}
--- 稿件結束 ---`;
}

export function buildTtsPrompt({
  script,
  directorNotes,
  language,
  contentType,
  speakerMode,
}) {
  const languageText = language === "cmn" ? "繁體中文、自然的台灣華語" : "依稿件自動偵測語言";
  const modeText = speakerMode === "multi" ? "請依稿件中的說話者標籤切換角色聲音" : "單一說話者完成全文";
  const notes = directorNotes.trim() || "請以清楚、自然、親切的台灣華語朗讀，依標點做自然停頓。";

  return `你是專業語音演員。請將「稿件」轉成音訊，不要朗讀或輸出任何導演指示、欄位名稱或分隔線。

語言：${languageText}
內容類型：${contentType}
表演形式：${modeText}

導演指示（只用來控制表演，不要朗讀）：
${clip(notes, 6000)}

--- 稿件開始 ---
${clip(script, 30000)}
--- 稿件結束 ---`;
}

