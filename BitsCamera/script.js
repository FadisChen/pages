// ---- DOM references ----
const video = document.getElementById('video');
const displayCanvas = document.getElementById('display');
const displayCtx = displayCanvas.getContext('2d');
const offscreenCanvas = document.getElementById('offscreen');
const offCtx = offscreenCanvas.getContext('2d');
const sampleCanvas = document.createElement('canvas');
const sampleCtx = sampleCanvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
const retryBtn = document.getElementById('retryBtn');
const flipBtn = document.getElementById('flipBtn');
const captureBtn = document.getElementById('captureBtn');
const settingsBtn = document.getElementById('settingsBtn');
const paramPanel = document.getElementById('paramPanel');
const paramPanelTitle = document.getElementById('paramPanelTitle');
const paramPanelClose = document.getElementById('paramPanelClose');
const paramPanelBody = document.getElementById('paramPanelBody');
const colorModeBtn = document.getElementById('colorModeBtn');

// ---- State ----
let currentStyle = 'floyd';
let colorMode = false;
let mirrorCurrent = true;
let currentStream = null;
let videoDevices = [];
let currentDeviceIndex = 0;
let activeDeviceId = null;

const STYLE_LABELS = {
  floyd: 'Floyd-Steinberg',
  bayer: 'Bayer',
  halftone: '網點半色調',
  posterize: '色階馬賽克',
};

const STYLE_CONFIG = {
  floyd: {
    type: 'dither',
    params: {
      grain: { label: '顆粒粗細', min: 100, max: 360, step: 20, value: 240 },
      bias: { label: '明暗偏移', min: -60, max: 60, step: 5, value: 0 },
    },
  },
  bayer: {
    type: 'dither',
    params: {
      grain: { label: '顆粒粗細', min: 100, max: 360, step: 20, value: 240 },
      bias: { label: '明暗偏移', min: -60, max: 60, step: 5, value: 0 },
    },
  },
  halftone: {
    type: 'halftone',
    params: {
      density: { label: '網點密度', min: 24, max: 120, step: 4, value: 64 },
      strength: { label: '網點強度', min: 0.7, max: 1.6, step: 0.05, value: 1.05 },
    },
  },
  posterize: {
    type: 'posterize',
    params: {
      grain: { label: '馬賽克顆粒', min: 40, max: 200, step: 10, value: 120 },
      levels: { label: '灰階層級', min: 2, max: 8, step: 1, value: 5 },
    },
  },
};

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// ---- Overlay helpers ----
function showOverlay(text, showRetry) {
  overlayText.textContent = text;
  overlay.classList.remove('hidden');
  retryBtn.classList.toggle('hidden', !showRetry);
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

// ---- Camera lifecycle ----
async function startCamera(deviceId) {
  stopCamera();
  showOverlay('正在請求相機權限…', false);
  try {
    const constraints = {
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;
    video.srcObject = stream;
    await video.play();

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    mirrorCurrent = settings.facingMode ? settings.facingMode === 'user' : true;
    activeDeviceId = settings.deviceId || deviceId || null;

    hideOverlay();
    await listDevices();
    resizeDisplayCanvas();
  } catch (err) {
    handleCameraError(err);
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
}

function handleCameraError(err) {
  let msg = '無法存取相機，請確認裝置與權限設定。';
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    msg = '相機權限被拒絕，請在瀏覽器設定中允許存取相機後重試。';
  } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    msg = '找不到可用的相機裝置。';
  } else if (err.name === 'NotReadableError') {
    msg = '相機目前被其他程式占用中，請關閉後重試。';
  } else if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    msg = '相機需要在 HTTPS 或 localhost 環境下才能使用，請透過本機伺服器開啟此頁面。';
  }
  showOverlay(msg, true);
}

async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoDevices = devices.filter((d) => d.kind === 'videoinput');
    flipBtn.classList.toggle('hidden', videoDevices.length <= 1);
    if (currentStream) {
      const currentId = currentStream.getVideoTracks()[0].getSettings().deviceId;
      const idx = videoDevices.findIndex((d) => d.deviceId === currentId);
      if (idx >= 0) currentDeviceIndex = idx;
    }
  } catch (e) {
    // enumerateDevices can fail before permission is granted; safe to ignore
  }
}

// Stops the camera while the tab/page is hidden (saves battery, turns off
// the OS camera-in-use indicator) and reacquires the same device on return.
function handleVisibilityChange() {
  if (document.hidden) {
    if (currentStream) stopCamera();
    return;
  }
  if (currentStream) return;
  startCamera(activeDeviceId);
}

// ---- Canvas sizing ----
function resizeDisplayCanvas() {
  if (!video.videoWidth) return;
  const stage = document.querySelector('.stage');
  const rect = stage.getBoundingClientRect();
  const aspect = video.videoWidth / video.videoHeight;

  let dispW = rect.width;
  let dispH = dispW / aspect;
  if (dispH > rect.height) {
    dispH = rect.height;
    dispW = dispH * aspect;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  displayCanvas.width = Math.round(dispW * dpr);
  displayCanvas.height = Math.round(dispH * dpr);
  displayCanvas.style.width = `${Math.round(dispW)}px`;
  displayCanvas.style.height = `${Math.round(dispH)}px`;
}

function getProcessDims(baseWidth) {
  const aspect = video.videoHeight / video.videoWidth;
  const w = baseWidth;
  const h = Math.max(1, Math.round(w * aspect));
  return { w, h };
}

function drawVideoToCanvas(ctx, w, h, mirror) {
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
}

function blit(srcCanvas) {
  displayCtx.imageSmoothingEnabled = false;
  displayCtx.drawImage(
    srcCanvas,
    0, 0, srcCanvas.width, srcCanvas.height,
    0, 0, displayCanvas.width, displayCanvas.height
  );
}

// ---- Dithering / effect algorithms ----
function applyFloydSteinberg(imageData, w, h, bias, useColor) {
  const data = imageData.data;

  if (useColor) {
    const channels = [0, 1, 2].map((channel) => {
      const values = new Float32Array(w * h);
      for (let i = 0, p = 0; p < values.length; i += 4, p++) {
        values[p] = data[i + channel] + bias;
      }
      return values;
    });

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        for (const channel of channels) {
          const old = channel[idx];
          const nv = old < 128 ? 0 : 255;
          const err = old - nv;
          channel[idx] = nv;
          if (x + 1 < w) channel[idx + 1] += err * 7 / 16;
          if (x - 1 >= 0 && y + 1 < h) channel[idx + w - 1] += err * 3 / 16;
          if (y + 1 < h) channel[idx + w] += err * 5 / 16;
          if (x + 1 < w && y + 1 < h) channel[idx + w + 1] += err * 1 / 16;
        }
      }
    }

    for (let p = 0, i = 0; p < w * h; p++, i += 4) {
      data[i] = channels[0][p] < 128 ? 0 : 255;
      data[i + 1] = channels[1][p] < 128 ? 0 : 255;
      data[i + 2] = channels[2][p] < 128 ? 0 : 255;
      data[i + 3] = 255;
    }
    return;
  }

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] + bias;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const nv = old < 128 ? 0 : 255;
      const err = old - nv;
      gray[idx] = nv;
      if (x + 1 < w) gray[idx + 1] += err * 7 / 16;
      if (x - 1 >= 0 && y + 1 < h) gray[idx + w - 1] += err * 3 / 16;
      if (y + 1 < h) gray[idx + w] += err * 5 / 16;
      if (x + 1 < w && y + 1 < h) gray[idx + w + 1] += err * 1 / 16;
    }
  }
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = gray[p] < 128 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
}

function applyBayer(imageData, w, h, bias, useColor) {
  const data = imageData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const threshold = (BAYER_8[y & 7][x & 7] + 0.5) / 64 * 255;
      if (useColor) {
        data[i] = data[i] + bias < threshold ? 0 : 255;
        data[i + 1] = data[i + 1] + bias < threshold ? 0 : 255;
        data[i + 2] = data[i + 2] + bias < threshold ? 0 : 255;
      } else {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] + bias;
        const v = gray < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      data[i + 3] = 255;
    }
  }
}

function applyPosterize(imageData, levels, useColor) {
  const data = imageData.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    if (useColor) {
      data[i] = Math.round(Math.round(data[i] / step) * step);
      data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
      data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
    } else {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const v = Math.round(Math.round(gray / step) * step);
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    data[i + 3] = 255;
  }
}

function renderHalftone(params, useColor) {
  const { w, h } = getProcessDims(params.density.value);

  sampleCanvas.width = w;
  sampleCanvas.height = h;
  sampleCtx.imageSmoothingEnabled = true;
  drawVideoToCanvas(sampleCtx, w, h, mirrorCurrent);
  const data = sampleCtx.getImageData(0, 0, w, h).data;

  const dw = displayCanvas.width;
  const dh = displayCanvas.height;
  const cellW = dw / w;
  const cellH = dh / h;
  const maxR = (Math.min(cellW, cellH) / 2) * params.strength.value;

  displayCtx.fillStyle = '#fff';
  displayCtx.fillRect(0, 0, dw, dh);
  displayCtx.fillStyle = '#000';

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const t = 1 - gray / 255;
      if (t <= 0.02) continue;
      const r = maxR * Math.sqrt(t);
      const cx = (x + 0.5) * cellW;
      const cy = (y + 0.5) * cellH;
      displayCtx.beginPath();
      displayCtx.arc(cx, cy, r, 0, Math.PI * 2);
      if (useColor) {
        displayCtx.fillStyle = `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
      }
      displayCtx.fill();
      if (useColor) displayCtx.fillStyle = '#000';
    }
  }
}

// ---- Main render loop ----
function renderFrame() {
  requestAnimationFrame(renderFrame);
  if (document.hidden) return;
  if (!video.videoWidth || !displayCanvas.width) return;

  const cfg = STYLE_CONFIG[currentStyle];
  if (cfg.type === 'halftone') {
    renderHalftone(cfg.params, colorMode);
    return;
  }

  const { w, h } = getProcessDims(cfg.params.grain.value);
  offscreenCanvas.width = w;
  offscreenCanvas.height = h;
  offCtx.imageSmoothingEnabled = true;
  drawVideoToCanvas(offCtx, w, h, mirrorCurrent);

  const imgData = offCtx.getImageData(0, 0, w, h);
  if (currentStyle === 'floyd') applyFloydSteinberg(imgData, w, h, cfg.params.bias.value, colorMode);
  else if (currentStyle === 'bayer') applyBayer(imgData, w, h, cfg.params.bias.value, colorMode);
  else if (currentStyle === 'posterize') applyPosterize(imgData, cfg.params.levels.value, colorMode);
  offCtx.putImageData(imgData, 0, 0);

  blit(offscreenCanvas);
}

// ---- Parameter panel ----
function renderParamPanel() {
  const cfg = STYLE_CONFIG[currentStyle];
  paramPanelTitle.textContent = STYLE_LABELS[currentStyle];
  paramPanelBody.innerHTML = '';

  Object.values(cfg.params).forEach((param) => {
    const row = document.createElement('div');
    row.className = 'param-row';

    const labelRow = document.createElement('div');
    labelRow.className = 'param-label-row';
    const label = document.createElement('span');
    label.textContent = param.label;
    const valueEl = document.createElement('span');
    valueEl.className = 'param-value';
    valueEl.textContent = param.value;
    labelRow.append(label, valueEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = param.min;
    slider.max = param.max;
    slider.step = param.step;
    slider.value = param.value;
    slider.addEventListener('input', () => {
      param.value = Number(slider.value);
      valueEl.textContent = param.value;
    });

    row.append(labelRow, slider);
    paramPanelBody.appendChild(row);
  });
}

settingsBtn.addEventListener('click', () => {
  if (!paramPanel.classList.contains('open')) renderParamPanel();
  paramPanel.classList.toggle('open');
});

paramPanelClose.addEventListener('click', () => paramPanel.classList.remove('open'));

function updateColorModeButton() {
  colorModeBtn.setAttribute('aria-label', `色彩模式：${colorMode ? '彩色' : '黑白'}`);
  colorModeBtn.setAttribute('aria-pressed', String(colorMode));
  colorModeBtn.querySelectorAll('.mode-toggle-option').forEach((option) => {
    option.classList.toggle('active', (option.dataset.mode === 'color') === colorMode);
  });
}

colorModeBtn.addEventListener('click', () => {
  colorMode = !colorMode;
  updateColorModeButton();
});
updateColorModeButton();

// ---- UI wiring ----
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = btn.dataset.style;
    if (paramPanel.classList.contains('open')) renderParamPanel();
  });
});

flipBtn.addEventListener('click', () => {
  if (videoDevices.length < 2) return;
  currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
  startCamera(videoDevices[currentDeviceIndex].deviceId);
});

retryBtn.addEventListener('click', () => startCamera());

captureBtn.addEventListener('click', () => {
  displayCanvas.classList.add('flash');
  setTimeout(() => displayCanvas.classList.remove('flash'), 250);

  displayCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `bitscamera_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});

window.addEventListener('resize', resizeDisplayCanvas);
video.addEventListener('loadedmetadata', resizeDisplayCanvas);
document.addEventListener('visibilitychange', handleVisibilityChange);

// Some mobile browsers briefly report stale layout dimensions during the
// rotation animation, so re-check a couple of times after the event fires
// rather than trusting a single synchronous recalculation.
function handleOrientationChange() {
  resizeDisplayCanvas();
  setTimeout(resizeDisplayCanvas, 150);
  setTimeout(resizeDisplayCanvas, 400);
}

if (screen.orientation && screen.orientation.addEventListener) {
  screen.orientation.addEventListener('change', handleOrientationChange);
} else {
  window.addEventListener('orientationchange', handleOrientationChange);
}

// ---- Boot ----
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  showOverlay('此瀏覽器不支援相機存取，或目前不是安全連線環境（需要 HTTPS 或 localhost）。', false);
} else {
  startCamera();
}
requestAnimationFrame(renderFrame);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}
