// Dependency-free Edge/Chromium smoke check. Gemini and PeerJS signaling are simulated;
// getUserMedia, AudioContext, AudioWorklet, DOM controls and PCM processing run in the browser.
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "yep-browser-"));
const fakePeer = `
class Events {
  constructor() { this.events = new Map(); }
  on(name, fn) { const items = this.events.get(name) || []; items.push(fn); this.events.set(name, items); }
  off(name, fn) { this.events.set(name, (this.events.get(name) || []).filter(item => item !== fn)); }
  emit(name, value) { for (const fn of this.events.get(name) || []) fn(value); }
}
window.sent = [];
window.Peer = class extends Events {
  constructor() { super(); this.open = true; }
  connect() {
    const conn = new Events(); conn.open = true;
    conn.send = data => window.sent.push(data.type === 'audio' ? { ...data, bytes: Array.from(data.bytes) } : data);
    conn.close = () => { conn.open = false; conn.emit('close'); };
    window.connection = conn;
    setTimeout(() => conn.emit('open'), 0);
    return conn;
  }
  destroy() { this.destroyed = true; this.emit('close'); }
};`;
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const target = resolve(repo, `.${pathname}`);
    if (!target.startsWith(resolve(repo) + sep)) { res.writeHead(403).end(); return; }
    let body = await readFile(target);
    if (pathname.endsWith("operator.html")) body = Buffer.from(body.toString().replace(/<script src="https:[^"]*peerjs[^\n]*<\/script>/, `<script>${fakePeer}</script>`));
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" })[extname(target)] || "application/octet-stream");
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const executable = process.env.YEP_BROWSER || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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
  console.log("Loading operator UI and real AudioWorklet");
  await call("Page.navigate", { url: `http://127.0.0.1:${port}/YearEndParty/operator.html` });
  for (let i = 0; i < 50; i++) {
    if (await evaluate("document.querySelectorAll('.segment-button').length === 6")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate("document.getElementById('roomInput').value = 'yep-test'; document.getElementById('connectForm').requestSubmit()");
  for (let i = 0; i < 50; i++) {
    if (await evaluate("Boolean(window.connection)")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(await evaluate("Boolean(window.connection)"), "Microphone / worklet / pairing did not initialize");
  assert.equal(await evaluate("document.getElementById('pttButton').disabled"), true);
  await evaluate("connection.emit('data', {type:'connection', status:'connected'})");
  assert.equal(await evaluate("document.getElementById('pttButton').disabled"), false);
  await evaluate("document.getElementById('pttButton').dispatchEvent(new PointerEvent('pointerdown', {pointerId:1, pointerType:'touch', bubbles:true}))");
  await new Promise(resolve => setTimeout(resolve, 450));
  await evaluate("document.getElementById('pttButton').dispatchEvent(new PointerEvent('pointerup', {pointerId:1, pointerType:'touch', bubbles:true}))");
  await new Promise(resolve => setTimeout(resolve, 150));
  const messages = await evaluate("sent");
  assert.deepEqual(messages[0], { type: "ptt", active: true });
  assert.deepEqual(messages.at(-1), { type: "ptt", active: false });
  assert.ok(messages.slice(1, -1).length > 5);
  assert.ok(messages.slice(1, -1).every(frame => frame.type === "audio" && frame.bytes.length <= 640 && frame.bytes.length % 2 === 0));
  await evaluate("connection.emit('data', {type:'transcript', role:'user', text:'下一個環節是頒獎'}); connection.emit('data', {type:'connection', status:'reconnecting'})");
  assert.equal(await evaluate("document.getElementById('lastHeard').textContent"), "下一個環節是頒獎");
  assert.equal(await evaluate("document.getElementById('pttButton').disabled"), true);
  await evaluate("connection.emit('data', {type:'connection', status:'connected'}); document.getElementById('pttButton').dispatchEvent(new PointerEvent('pointerdown', {pointerId:2, pointerType:'touch', bubbles:true}))");
  await new Promise(resolve => setTimeout(resolve, 150));
  await evaluate("connection.emit('data', {type:'connection', status:'failed'})");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await evaluate("document.getElementById('pttButton').disabled"), true);
  assert.equal(await evaluate("document.getElementById('pttButton').getAttribute('aria-pressed')"), "false");
  assert.equal(await evaluate("document.getElementById('controlPanel').hidden"), false);
  assert.deepEqual(await evaluate("sent.at(-1)"), { type: "ptt", active: false });
  await evaluate("document.getElementById('disconnectButton').click()");
  assert.equal(await evaluate("document.getElementById('controlPanel').hidden"), true);
  assert.deepEqual(errors, []);
  console.log(`PASS: Edge microphone/worklet, ${messages.length - 2} ordered PCM frames, PTT release, readiness, transcript and disconnect`);
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Only the unique temporary profile created above is removed.
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && profile.includes("yep-browser-")) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
  }
}
