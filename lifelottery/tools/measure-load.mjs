// Landing-screen load timing with Playwright (PLAN Phase 5E): how long until the first paint and until the landing screen is
// usable, on a cold cache, with and without network throttling. Starts its own static server.
//
//   node tools/measure-load.mjs [runs=5]         LL_CHROMIUM=<path> picks the browser
//
// LL_PRELOAD=none|all|split|fp-none|fp-body|fp-raf|fp-nocountries rewrites index.html on the fly to compare ways of preloading:
// none = no modulepreload at all; all = every module preloaded at load; split = as generated; fp-none = only the lazy template;
// fp-body / fp-raf = first-paint links moved to the very end of <body> / injected after the first frame.
//
// Prints the median of: FCP (first-contentful-paint), `ready` (the start button is in the DOM), `load` event, the number of
// requests and the bytes transferred up to `ready`.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = Number(process.argv[2]) || 5;

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try { return require(c); } catch (e) { /* next */ }
  }
  throw new Error('Playwright not found');
}
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});
async function startServer(port) {
  const proc = spawn('npx', ['--yes', 'http-server', ROOT, '-p', String(port), '-c-1', '-s', '-a', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) return proc; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('http-server did not start');
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const playwright = loadPlaywright();
const port = await freePort();
const server = await startServer(port);
const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await playwright.chromium.launch(exe ? { executablePath: exe } : {});
const PROFILES = [
  ['no throttling', null],
  ['fast 4G (9 Mbit/s, 60 ms)', { offline: false, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 60 }],
  ['slow 4G (1.6 Mbit/s, 150 ms)', { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 }],
];
try {
  for (const [label, net] of PROFILES) {
    const rows = [];
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (net) await cdp.send('Network.emulateNetworkConditions', net);
      if (process.env.LL_PRELOAD) {
        await page.route(/\/(index\.html)?(\?.*)?$/, async (route) => {
          if (route.request().resourceType() !== 'document') return route.continue();
          const res = await route.fetch();
          let html = await res.text();
          if (process.env.LL_PRELOAD === 'none') html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
          else if (process.env.LL_PRELOAD === 'all') html = html.replace(/ fetchpriority="low"/g, '');
          else if (process.env.LL_PRELOAD === 'fp-nocountries') html = html.replace('  <link rel="modulepreload" href="js/data/countries.js">\n', '');
          else if (process.env.LL_PRELOAD === 'fp-raf') {
            const links = [...html.matchAll(/^  <link rel="modulepreload" href="([^"]+)">\n/gm)];
            for (const l of links) html = html.replace(l[0], '');
            html = html.replace('</body>', `<script>requestAnimationFrame(() => { for (const h of ${JSON.stringify(links.map((l) => l[1]))}) { const l = document.createElement('link'); l.rel = 'modulepreload'; l.href = h; document.head.append(l); } });</script></body>`);
          } else if (process.env.LL_PRELOAD === 'fp-none' || process.env.LL_PRELOAD === 'fp-body') {
            const links = [...html.matchAll(/^  <link rel="modulepreload" href="[^"]+">\n/gm)].map((m) => m[0]);
            for (const l of links) html = html.replace(l, '');
            if (process.env.LL_PRELOAD === 'fp-body') html = html.replace('</body>', `${links.join('')}</body>`);
          }
          await route.fulfill({ response: res, body: html });
        });
      }
      let requests = 0, bytes = 0;
      page.on('response', async (r) => { requests++; try { bytes += (await r.body()).length; } catch (e) { /* aborted */ } });
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/?measure=${label.length}-${i}`, { waitUntil: 'commit' });
      await page.waitForSelector('[data-action="start"]', { timeout: 120000 });
      const ready = Date.now() - t0;
      const reqAtReady = requests, bytesAtReady = bytes;
      await page.waitForLoadState('load');
      const t = await page.evaluate(() => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const nav = performance.getEntriesByType('navigation')[0];
        return { fcp: fcp ? fcp.startTime : NaN, load: nav.loadEventEnd };
      });
      rows.push({ fcp: t.fcp, ready, load: t.load, requests: reqAtReady, kb: bytesAtReady / 1024 });
      await ctx.close();
    }
    const f = (k) => Math.round(median(rows.map((r) => r[k])));
    console.log(`${label.padEnd(30)} FCP ${String(f('fcp')).padStart(5)} ms   ready ${String(f('ready')).padStart(5)} ms   load ${String(f('load')).padStart(5)} ms   requests@ready ${f('requests')}   KB@ready ${f('kb')}`);
  }
} finally {
  await browser.close().catch(() => {});
  try { process.kill(-server.pid, 'SIGTERM'); } catch (e) { /* gone */ }
}
process.exit(0);
