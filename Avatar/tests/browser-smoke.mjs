// Avatar audio smoke check using real Web Audio and a virtual microphone.
// Only Gemini responses and the unused VRM bootstrap are simulated.
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repo = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "avatar-browser-"));
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/") { res.setHeader("Content-Type", "text/html"); res.end('<html><body><script type="module" src="/app.js"></script></body></html>'); return; }
    const target = resolve(repo, `.${pathname}`);
    if (!target.startsWith(resolve(repo) + sep)) { res.writeHead(403).end(); return; }
    let body = await readFile(target);
    if (pathname === "/app.js") {
      let code = body.toString().replace(/^import[^\n]*(?:from "three[^\n]*|from "@pixiv[^\n]*);\r?\n/gm, "");
      code = code.replace(/  if \(document.readyState[\s\S]*$/, "globalThis.avatarTest = { MicrophoneInput, GeminiAudioPlayer, GeminiLiveClient, EventBus };\n})();");
      body = Buffer.from(code);
    }
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" })[extname(target)] || "application/octet-stream");
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const executable = process.env.AVATAR_BROWSER || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = spawn(executable, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required", "about:blank"], { windowsHide: true, stdio: "ignore" });
let socket;
try {
  let debugPort;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { debugPort = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(debugPort, "Browser did not expose a debugging endpoint");
  console.log("Browser started; connecting to DevTools");
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("DevTools WebSocket timed out")), 5000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = error => { clearTimeout(timer); reject(error); };
  });
  let id = 0;
  const pending = new Map(), errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
    if (message.id && pending.has(message.id)) { const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(message.error) : entry.resolve(message.result); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)); }, 8000);
    pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call("Runtime.enable");
  console.log("Loading continuous capture and real AudioWorklet");
  await call("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 50; i++) {
    if (await evaluate("Boolean(window.avatarTest)")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(await evaluate("Boolean(window.avatarTest)"), "Avatar classes did not load");
  await evaluate(`(async () => {
    const { EventBus, GeminiAudioPlayer, GeminiLiveClient, MicrophoneInput } = avatarTest;
    window.capturedPcm = [];
    window.sent = [];
    window.bus = new EventBus();
    window.player = new GeminiAudioPlayer(bus);
    window.client = new GeminiLiveClient(bus);
    window.mic = new MicrophoneInput(player, bus);
    client.stopped = false;
    client.socket = { readyState: 1, send: raw => sent.push(JSON.parse(raw)) };
    await mic.start(bytes => { capturedPcm.push([...bytes]); client.sendAudio(bytes); });
    window.track = mic.stream.getAudioTracks()[0];
  })()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(await evaluate("capturedPcm.length > 5"));
  assert.equal(await evaluate("sent.length"), 0); // Capture alone must not replay pre-connect audio.
  await evaluate("client.ready = true");
  await new Promise(resolve => setTimeout(resolve, 250));
  const before = await evaluate("capturedPcm.length");
  // Audio processing must continue while the UI/render thread is busy.
  await evaluate("{ const until = performance.now() + 300; while (performance.now() < until) {} }");
  await new Promise(resolve => setTimeout(resolve, 100));
  const after = await evaluate("capturedPcm.length");
  assert.ok(after - before >= 12, "AudioWorklet lost samples during a busy UI thread");
  assert.ok(await evaluate("capturedPcm.every(bytes => bytes.length === 640)"));
  assert.ok(await evaluate("sent.length > 5 && sent.every(message => message.realtimeInput.audio.mimeType === 'audio/pcm;rate=16000')"));
  await evaluate("mic.stop()");
  const stoppedAt = await evaluate("capturedPcm.length");
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(await evaluate("capturedPcm.length"), stoppedAt);
  assert.equal(await evaluate("track.readyState"), "ended");
  await evaluate("mic.start(bytes => capturedPcm.push([...bytes]))");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(await evaluate("capturedPcm.length") > stoppedAt, "Capture could not restart on the existing AudioContext");
  await evaluate("mic.stop(); player.close()");
  assert.deepEqual(errors, []);
  console.log(`PASS: Edge continuous capture, ${after} PCM frames, busy UI thread, offline gating, track release and restart`);

} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Only the unique temporary profile created above is removed.
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && profile.includes("avatar-browser-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
}
