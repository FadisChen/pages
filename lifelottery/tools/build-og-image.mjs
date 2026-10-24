// Renders tools/og-image.html to og-image.png (1200x630), the picture that link previews show (Open Graph / Twitter card).
//
//   node tools/build-og-image.mjs            LL_CHROMIUM=<path> picks the browser
//
// The template is plain HTML/CSS in the game's dark theme and needs no network. Re-run it when the look of the game changes.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'og-image.png');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try { return require(c); } catch (e) { /* next */ }
  }
  throw new Error('Playwright not found. Install it or point NODE_PATH at the global modules.');
}

const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await loadPlaywright().chromium.launch(exe ? { executablePath: exe } : {});
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
  await page.goto(pathToFileURL(path.join(ROOT, 'tools', 'og-image.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
