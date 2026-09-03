import { GEMINI_API_BASE } from "../core/constants.js";

async function parseJsonResponse(res) {
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`無法解析 Gemini 回應（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Fetches every model page (bounded) and returns the raw ListModels models[].
export async function listModelsRaw(apiKey, { fetchImpl = fetch, maxModels = 2000 } = {}) {
  let all = [];
  let pageToken = null;
  do {
    const url = new URL(`${GEMINI_API_BASE}/models`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetchImpl(url.toString());
    const data = await parseJsonResponse(res);
    all = all.concat(data.models || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken && all.length < maxModels);
  return all;
}

export async function generateContent(apiKey, model, body, { fetchImpl = fetch } = {}) {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseJsonResponse(res);
}
