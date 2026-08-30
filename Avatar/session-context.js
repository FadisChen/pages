const LOCATION_TIMEOUT_MS = 2500;

function resolveLocale(locale) {
  return String(locale || globalThis.navigator?.language || "zh-TW").trim() || "zh-TW";
}

function resolveTimeZone(timeZone) {
  if (timeZone) return String(timeZone);
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch (_) { return "UTC"; }
}

function formatCoordinate(value) {
  return Number(value).toFixed(4);
}

export function formatSessionContext({ now = new Date(), locale, timeZone, location = null } = {}) {
  const resolvedLocale = resolveLocale(locale);
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const formattedTime = new Intl.DateTimeFormat(resolvedLocale, { dateStyle: "full", timeStyle: "long", timeZone: resolvedTimeZone }).format(now);
  const locationLine = location
    ? `瀏覽器約略位置：緯度 ${formatCoordinate(location.latitude)}、經度 ${formatCoordinate(location.longitude)}${Number.isFinite(location.accuracy) ? `（定位誤差約 ${Math.round(location.accuracy)} 公尺）` : ""}。`
    : "瀏覽器未提供 GPS 座標；請以時區與語系作為目前地點的近似資訊。";
  return [
    "【本次 Live session 的環境資訊】",
    `目前時間：${formattedTime}。`,
    `ISO 參考時間：${now.toISOString()}。`,
    `時區：${resolvedTimeZone}。`,
    `瀏覽器語系：${resolvedLocale}。`,
    locationLine,
    "這是 session 啟動時的快照，僅供回答時間、日期或所在地相關問題；不要主動朗讀這段環境資訊，也不要把它當成使用者問題。",
  ].join("\n");
}

function readLocation(position) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, accuracy: Number(position?.coords?.accuracy) };
}

export function collectSessionContext({ now = new Date(), locale, timeZone, navigatorObject = globalThis.navigator, timeoutMs = LOCATION_TIMEOUT_MS } = {}) {
  const base = { now, locale: resolveLocale(locale), timeZone: resolveTimeZone(timeZone) };
  const geolocation = navigatorObject?.geolocation;
  if (!geolocation?.getCurrentPosition) return Promise.resolve(formatSessionContext(base));

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(null), timeoutMs);
    const finish = (position) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(formatSessionContext({ ...base, location: readLocation(position) }));
    };
    try {
      geolocation.getCurrentPosition(finish, () => finish(null), { enableHighAccuracy: false, maximumAge: 300000, timeout: timeoutMs });
    } catch (_) {
      finish(null);
    }
  });
}
