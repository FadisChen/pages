const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const API_REVISION = "2026-05-20";

export class GeminiApiError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.details = details;
  }
}

function assertApiKey(apiKey) {
  if (!apiKey?.trim()) {
    throw new GeminiApiError("請先輸入 Gemini API Key。", { status: 400 });
  }
}

async function readError(response) {
  const raw = await response.text();
  if (!raw) return `Gemini API 回應錯誤（${response.status}）。`;

  try {
    const payload = JSON.parse(raw);
    const message = payload?.error?.message || payload?.message;
    return message ? `Gemini API：${message}` : raw;
  } catch {
    return raw;
  }
}

async function requestJson(path, apiKey, { method = "GET", body, signal } = {}) {
  assertApiKey(apiKey);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey.trim(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new GeminiApiError("無法連線到 Gemini API，請檢查網路或瀏覽器的跨來源限制。", {
      details: error,
    });
  }

  if (!response.ok) {
    throw new GeminiApiError(await readError(response), { status: response.status });
  }

  return response.json();
}

function findText(value, depth = 0) {
  if (!value || depth > 5) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => findText(item, depth + 1)).filter(Boolean).join("\n").trim();
  }
  if (typeof value !== "object") return "";

  for (const key of ["output_text", "text"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }

  for (const key of ["output", "steps", "content", "delta", "interaction"]) {
    const result = findText(value[key], depth + 1);
    if (result) return result;
  }

  return "";
}

function findAudio(value, depth = 0) {
  if (!value || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findAudio(item, depth + 1);
      if (result) return result;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const type = String(value.type || "").toLowerCase();
  const mimeType = String(value.mime_type || value.mimeType || "").toLowerCase();
  if (typeof value.data === "string" && (type === "audio" || mimeType.startsWith("audio/"))) {
    return {
      data: value.data,
      mimeType: value.mime_type || value.mimeType || "audio/l16",
      sampleRate: Number(value.sample_rate || value.sampleRate) || 24000,
      channels: Number(value.channels) || 1,
    };
  }

  for (const key of ["output_audio", "outputAudio", "audio", "steps", "output", "content", "interaction"]) {
    const result = findAudio(value[key], depth + 1);
    if (result) return result;
  }

  return null;
}

function buildTextBody({ model, prompt }) {
  return {
    model,
    input: prompt,
    response_format: { type: "text" },
    store: false,
    generation_config: { max_output_tokens: 768 },
  };
}

function buildAudioBody({ model, input, speechConfig, stream = false }) {
  return {
    model,
    input,
    response_format: { type: "audio" },
    generation_config: {
      speech_config: speechConfig,
    },
    store: false,
    ...(stream ? { stream: true } : {}),
  };
}

export async function testApiKey(apiKey, model = "gemini-2.5-flash-preview-tts", signal) {
  return requestJson(`/models/${encodeURIComponent(model)}`, apiKey, { signal });
}

export async function generateText({ apiKey, model, prompt, signal }) {
  const payload = await requestJson("/interactions", apiKey, {
    method: "POST",
    body: buildTextBody({ model, prompt }),
    signal,
  });
  const text = findText(payload);
  if (!text) {
    throw new GeminiApiError("Gemini 沒有回傳可用的文字內容。", { details: payload });
  }
  return { text, raw: payload };
}

export async function generateTts({ apiKey, model, input, speechConfig, signal }) {
  const payload = await requestJson("/interactions", apiKey, {
    method: "POST",
    body: buildAudioBody({ model, input, speechConfig }),
    signal,
  });
  const audio = findAudio(payload);
  if (!audio) {
    throw new GeminiApiError("Gemini 沒有回傳可用的音訊內容。", { details: payload });
  }
  return { ...audio, raw: payload };
}

function parseSseEvent(rawEvent) {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function handleStreamEvent(event, onAudio) {
  if (!event) return null;
  if (event.event_type === "interaction.failed" || event.event_type === "error") {
    throw new GeminiApiError(event.error?.message || "串流生成失敗。", {
      details: event,
    });
  }

  const delta = event.event_type === "step.delta" ? event.delta : null;
  if (delta?.type === "audio" && typeof delta.data === "string") {
    const chunk = {
      data: delta.data,
      mimeType: delta.mime_type || delta.mimeType || "audio/l16",
      sampleRate: Number(delta.sample_rate || delta.sampleRate) || 24000,
      channels: Number(delta.channels) || 1,
    };
    onAudio?.(chunk);
    return chunk;
  }
  return null;
}

export async function streamTts({ apiKey, model, input, speechConfig, signal, onAudio }) {
  assertApiKey(apiKey);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/interactions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "x-goog-api-key": apiKey.trim(),
      },
      body: JSON.stringify(buildAudioBody({ model, input, speechConfig, stream: true })),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new GeminiApiError("無法連線到 Gemini API，請檢查網路或瀏覽器的跨來源限制。", {
      details: error,
    });
  }

  if (!response.ok) {
    throw new GeminiApiError(await readError(response), { status: response.status });
  }
  if (!response.body) throw new GeminiApiError("瀏覽器不支援串流回應。", { status: 0 });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let buffer = "";

  const consume = (text) => {
    buffer += text;
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const rawEvent of events) {
      const chunk = handleStreamEvent(parseSseEvent(rawEvent), onAudio);
      if (chunk) chunks.push(chunk);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      consume(decoder.decode(value, { stream: true }));
    }
    consume(decoder.decode());
    if (buffer.trim()) {
      const chunk = handleStreamEvent(parseSseEvent(buffer), onAudio);
      if (chunk) chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  if (!chunks.length) {
    throw new GeminiApiError("串流沒有回傳可用的音訊內容。", { status: 200 });
  }
  return { chunks };
}

