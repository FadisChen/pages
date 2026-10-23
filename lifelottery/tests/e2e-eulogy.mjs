// End-to-end check of the 生平 (eulogy, PLAN 5.3): Playwright + Chromium against `npx http-server lifelottery`.
//
//   node tests/e2e-eulogy.mjs          (from lifelottery/)
//
// Environment (all optional): LL_SHOTS=<dir> for the screenshots (default <os tmp>/lifelottery-eulogy-shots), LL_PORT, LL_CHROMIUM.
//
// What it covers
//   * a whole life on auto-choice in four contexts (mobile and desktop, light and dark): the 生平 card is at the top of the
//     summary (right under the name), well-formed, the same after a reload, and the share card shows its short version;
//   * the album detail view shows the same text; an old album record without any eulogy gets one on the fly;
//   * the share card's extreme cases (long name, three-line message, a migrant with four countries, a newborn, no map): every
//     painted string lies on the paper and the eulogy takes at most two lines (three without a message);
//   * zero console errors.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), 'lifelottery-eulogy-shots');
fs.mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try { return require(c); } catch (e) { /* next */ }
  }
  throw new Error('Playwright not found. Install it or point NODE_PATH at the global modules.');
}
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});
async function startServer(port) {
  const proc = spawn('npx', ['--yes', 'http-server', ROOT, '-p', String(port), '-c-1', '-s', '-a', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url); if (r.ok) return { proc, url }; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) { /* gone */ }
  throw new Error('http-server did not start');
}
const killServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) { try { proc.kill('SIGTERM'); } catch (e2) { /* gone */ } } };

let passed = 0;
const failures = [];
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${String(e && e.message || e).split('\n').join('\n       ')}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const consoleProblems = [];
function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') consoleProblems.push(`[${label}] console.error: ${m.text()}`); });
  page.on('pageerror', (e) => consoleProblems.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') consoleProblems.push(`[${label}] requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
}
const waitHash = (page, re, timeout = 120000) => page.waitForFunction((src) => new RegExp(src).test(location.hash), re.source, { timeout });
async function noHScroll(page, label) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert(m.sw <= m.cw + 1, `horizontal scroll on ${label}: ${m.sw} > ${m.cw}`);
}

/** Play a whole life on auto-choice (short pace) with a fixed seed up to the summary screen. */
async function playToSummary(page, base, seed) {
  await page.goto(`${base}?debug=fast&seed=${seed}`);
  await page.click('[data-action="start"]');
  await waitHash(page, /#\/setup/);
  await page.check('#pace-short');
  await page.check('#era-present');
  await page.check('#autoChoice');
  await page.click('button[type="submit"]');
  await waitHash(page, /#\/lottery/);
  await page.waitForSelector('.birth-country');
  await page.click('[data-action="begin"]');
  await waitHash(page, /#\/death/);
  await page.click('[data-action="to-summary"]');
  await waitHash(page, /#\/summary/);
  await page.waitForSelector('.eulogy-card');
}

const eulogyInfo = (page) => page.evaluate(() => {
  const card = document.querySelector('[data-role="eulogy"]');
  if (!card) return null;
  const hero = document.querySelector('.review-hero');
  const first = document.querySelector('.screen-review').children;
  return { text: card.querySelector('.eulogy-text').textContent, title: card.querySelector('h2').textContent, shape: card.dataset.shape, name: hero.querySelector('h1').textContent, isAfterHero: [...first].indexOf(card) === [...first].indexOf(hero) + 1, top: Math.round(card.getBoundingClientRect().top + scrollY), heroBottom: Math.round(hero.getBoundingClientRect().bottom + scrollY) };
});

const playwright = loadPlaywright();
const port = Number(process.env.LL_PORT) || await freePort();
const { proc: server, url: BASE } = await startServer(port);
console.log(`serving ${ROOT} at ${BASE}\nscreenshots: ${SHOTS}`);

let browser;
try {
  const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await playwright.chromium.launch(exe ? { executablePath: exe } : {});
  const MOBILE = { width: 390, height: 844 };
  const DESKTOP = { width: 1280, height: 900 };
  let reference = null; // { text, short, record } of the first life

  console.log('\nThe summary right after a life (mobile and desktop, light and dark)');
  for (const [tag, viewport, scheme, scale] of [['mobile-light', MOBILE, 'light', 2], ['mobile-dark', MOBILE, 'dark', 2], ['desktop-light', DESKTOP, 'light', 1], ['desktop-dark', DESKTOP, 'dark', 1]]) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: scale });
    await ctx.addInitScript(() => {
      window.__cardTexts = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__cardTexts.push({ t: String(t), font: this.font }); return orig.call(this, t, ...a); };
    });
    const page = await ctx.newPage();
    watch(page, tag);
    await step(`${tag}: a life on auto-choice ends in the summary with a 生平 card right under the name`, async () => {
      await playToSummary(page, BASE, 'e2e-eulogy-1');
      const e = await eulogyInfo(page);
      assert(e, 'eulogy card');
      assert(e.title === '生平', `title ${e.title}`);
      assert(e.isAfterHero, 'the eulogy is the first card after the hero');
      assert(e.top - e.heroBottom < 80, `the eulogy starts right under the hero (${e.top} vs ${e.heroBottom})`);
      const n = [...e.text].length;
      assert(n >= 60 && n <= 260, `eulogy length ${n}: ${e.text}`);
      assert(!/undefined|NaN|null|\[object/.test(e.text), e.text);
      assert(e.text.includes(e.name), `the eulogy names the person (${e.name})`);
      assert((e.text.match(/[。！？]/g) || []).length >= 3, 'three or more sentences');
      await noHScroll(page, `${tag} summary`);
      if (!reference) reference = { text: e.text, shape: e.shape };
      else assert(e.text === reference.text, `the same seed gives the same eulogy in every context:\n${e.text}\n${reference.text}`);
    });
    await step(`${tag}: the card's short eulogy is painted on the share card, on the paper, in at most three lines`, async () => {
      await page.waitForSelector('#share-canvas');
      await page.waitForFunction(() => window.__cardTexts.some((x) => x.t.includes('你也來抽一支籤吧')));
      const painted = await page.evaluate(() => window.__cardTexts.slice(-80));
      const { short, rec } = await page.evaluate(async () => {
        const { eulogyOf } = await import('./js/engine/eulogy.js');
        const rec = JSON.parse(localStorage.getItem('lifelottery.album')).records[0];
        return { short: eulogyOf(rec).short, rec: rec.id };
      });
      const lines = painted.filter((x) => /^(2[2-9]|3[0-2])px /.test(x.font) && !x.font.includes('500') && !x.font.includes('700') && !x.font.includes('800') && x.font.includes('Songti') && short.includes(x.t.replace(/…$/, '')));
      assert(lines.length >= 1 && lines.length <= 3, `eulogy lines on the card: ${lines.length} (${short})`);
      assert(lines.map((l) => l.t).join('').replace(/…$/, '').length >= Math.min(short.length, 8), 'the eulogy text is on the card');
      void rec;
      await page.locator('.eulogy-card').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `summary-${tag}-top.png`), fullPage: false });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOTS, `summary-${tag}.png`), fullPage: true });
      await page.locator('.share-card').scrollIntoViewIfNeeded();
      await page.locator('.share-card').screenshot({ path: path.join(SHOTS, `sharecard-section-${tag}.png`) });
      const png = await page.evaluate(() => document.getElementById('share-canvas').toDataURL('image/png').split(',')[1]);
      fs.writeFileSync(path.join(SHOTS, `sharecard-${tag}.png`), Buffer.from(png, 'base64'));
    });
    if (tag === 'mobile-light') {
      await step('mobile-light: a reload of the summary gives the same words; the album detail says the same', async () => {
        const before = (await eulogyInfo(page)).text;
        await page.reload();
        await page.waitForSelector('.eulogy-card');
        assert((await eulogyInfo(page)).text === before, 'same eulogy after a reload');
        await page.click('a[href="#/album"].btn');
        await waitHash(page, /#\/album$/);
        await page.waitForSelector('.album-card');
        await page.click('.album-card .album-link');
        await page.waitForSelector('.eulogy-card');
        const e = await eulogyInfo(page);
        assert(e.text === before, `album detail: ${e.text}`);
        assert(e.isAfterHero, 'the eulogy is at the top of the album detail too');
        await page.screenshot({ path: path.join(SHOTS, 'album-detail-mobile-light.png'), fullPage: false });
        reference.record = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.album')).records[0]);
      });
    }
    await ctx.close();
  }

  console.log('\nOld records and imports');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'light' });
    const page = await ctx.newPage();
    watch(page, 'old-record');
    await step('an album record from before Phase 5B (no eulogy field) gets a eulogy on the fly, the same on every visit', async () => {
      assert(reference && reference.record, 'a record from the first life');
      const rec = JSON.parse(JSON.stringify(reference.record));
      delete rec.summary.eulogy;
      delete rec.summary.focusYears;
      await page.addInitScript((r) => { try { if (!localStorage.getItem('lifelottery.album')) localStorage.setItem('lifelottery.album', JSON.stringify({ v: 1, records: [r] })); } catch (e) { /* none */ } }, rec);
      await page.goto(`${BASE}#/album/${encodeURIComponent(rec.id)}`);
      await page.waitForSelector('.eulogy-card');
      const a = (await eulogyInfo(page)).text;
      assert(a === reference.text, `an old record reads the same as the new one:\n${a}\n${reference.text}`);
      await page.reload();
      await page.waitForSelector('.eulogy-card');
      assert((await eulogyInfo(page)).text === a, 'stable on reload');
    });
    await step('a thin record (name, age, year only) shows the brief version, without an error', async () => {
      const thin = { id: 'thin-1', savedAt: Date.now(), message: '', summary: { name: '甲乙', age: 40, birthYear: 1960, statHistory: [{ age: 0, health: 80, happiness: 60, knowledge: 2, wealth: 30, social: 50 }] } };
      await page.evaluate((r) => localStorage.setItem('lifelottery.album', JSON.stringify({ v: 1, records: [r] })), thin);
      await page.goto(`${BASE}#/album/thin-1`);
      await page.reload();
      await page.waitForSelector('.eulogy-card');
      const t = (await eulogyInfo(page)).text;
      assert(t.includes('甲乙') && t.includes('40歲'), `brief eulogy: ${t}`);
    });
    await ctx.close();
  }

  console.log('\nShare card: extreme cases keep the eulogy on the paper');
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addInitScript(() => {
      window.__paint = null;
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...rest) {
        if (window.__paint) {
          const m = this.getTransform();
          const w = this.measureText(String(t)).width;
          const al = this.textAlign;
          const left = al === 'right' ? x - w : al === 'center' ? x - w / 2 : x;
          const p1 = m.transformPoint({ x: left, y }), p2 = m.transformPoint({ x: left + w, y });
          window.__paint.push({ t: String(t), x1: Math.min(p1.x, p2.x), x2: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y), font: this.font });
        }
        return orig.call(this, t, x, y, ...rest);
      };
    });
    const page = await ctx.newPage();
    watch(page, 'cards');
    await page.goto(`${BASE}?debug=fast`);
    const MSG3 = '謝謝你一路走來，無論順境或逆境都沒有放棄，願下一世你能過得輕鬆一些，也記得偶爾停下腳步看看天空，那裡一直都有星星，陪著每一個努力生活的人。';
    const cases = [
      ['normal', 'TWN', {}, '路上小心，謝謝你。'],
      ['long-name', 'IDN', { name: 'Muhammad Abdullahi Ibrahim Abubakar Al-Rashid bin Sultan Hassan', countriesLived: ['印尼', '沙烏地阿拉伯'] }, MSG3],
      ['migrant-4-countries', 'PHL', { name: '瑪麗亞・桑托斯・克魯茲', countriesLived: ['菲律賓', '沙烏地阿拉伯', '阿拉伯聯合大公國', '加拿大'], countryName: '加拿大', age: 71 }, MSG3],
      ['newborn', 'NGA', { age: 0, cause: { id: 'neonatal', label: '新生兒疾病', text: '' } }, ''],
      ['newborn-with-message', 'NGA', { age: 0, cause: { id: 'neonatal', label: '新生兒疾病', text: '' } }, MSG3],
      ['child', 'IND', { age: 9, cause: { id: 'lri', label: '下呼吸道感染', text: '' } }, '好好休息。'],
      ['refugee', 'SYR', { countriesLived: ['敘利亞', '德國'], countryName: '德國', highlights: [{ age: 24, year: 2050, text: '為了躲避戰亂，離開家鄉，來到德國。' }], age: 66 }, MSG3],
      ['no-map', 'JPN', { homeCountry: { code: '', name: '某個不存在的國家' }, countriesLived: [] }, MSG3],
    ];
    for (const [name, cc, over, message] of cases) {
      await step(`share card (${name}): the short eulogy is there, on the paper, at most ${message ? 'two' : 'three'} lines`, async () => {
        const out = await page.evaluate(async ({ cc, over, message, name }) => {
          const { createLife, advanceYear } = await import('./js/engine/life.js');
          const { getSummary } = await import('./js/engine/summary.js');
          const { normalizeRecord } = await import('./js/storage.js');
          const { drawShareCard } = await import('./js/ui/sharecard.js');
          const { eulogyOf } = await import('./js/engine/eulogy.js');
          const s = createLife({ era: 'present' }, `card-${name}`, { countryCode: cc });
          let g = 0; while (s.alive && g++ < 140) advanceYear(s, { auto: true });
          const sum = JSON.parse(JSON.stringify(getSummary(s)));
          delete sum.eulogy;
          Object.assign(sum, over);
          const rec = normalizeRecord({ id: `card-${name}`, savedAt: Date.now(), message, summary: sum, meta: { drawMode: 'births' } });
          const c = document.createElement('canvas');
          window.__paint = [];
          drawShareCard(c, rec);
          const paint = window.__paint; window.__paint = null;
          return { paint, short: eulogyOf(rec).short, png: c.toDataURL('image/png').split(',')[1], w: c.width, h: c.height };
        }, { cc, over, message, name });
        fs.writeFileSync(path.join(SHOTS, `sharecard-eulogy-${name}.png`), Buffer.from(out.png, 'base64'));
        assert(out.w === 1080 && out.h === 1350, 'card size');
        assert(out.short && [...out.short].length <= 60 && (out.short.match(/[。！？]/g) || []).length <= 2, `short eulogy: ${out.short}`);
        const onPaper = out.paint.filter((p) => p.y > 200 && p.y < 1280);
        for (const p of onPaper) {
          assert(p.x1 >= 150 - 8 || /^[0-9]$/.test(p.t) || p.font.includes('800'), `left edge ${p.x1.toFixed(0)} of "${p.t}"`);
          assert(p.x2 <= 1000, `"${p.t}" ends at ${p.x2.toFixed(0)} (paper ends at 1020)`);
          assert(p.y <= 1264, `"${p.t}" sits at y=${p.y.toFixed(0)} (paper ends at 1270)`);
        }
        // the eulogy lines: serif, 22-32px, not the message font (500 32px) and not bold
        const lines = onPaper.filter((p) => /^(2[2-9]|3[0-2])px /.test(p.font) && !/^(500|600|700|800) /.test(p.font) && p.font.includes('Songti') && p.y > 880);
        assert(lines.length >= 1 && lines.length <= (message ? 2 : 3), `eulogy lines: ${lines.map((l) => l.t).join(' | ')}`);
        const joined = lines.map((l) => l.t).join('');
        const plain = joined.replace(/…$/, '');
        assert(out.short.startsWith(plain.slice(0, 8)) || out.short.includes(plain.slice(0, 8)), `the card says the short eulogy: "${joined}" vs "${out.short}"`);
        if (message) {
          const msgLines = out.paint.filter((p) => p.font.includes('500 32px'));
          assert(msgLines.length === 3 || (message.length < 30 && msgLines.length === 1), `message lines ${msgLines.length}`);
          if (message === MSG3) assert(msgLines.map((l) => l.t).join('') === message, 'the whole three-line message still fits');
        }
        assert(out.paint.some((p) => p.t.includes('你也來抽一支籤吧')), 'the footer');
      });
    }
    await ctx.close();
  }

  console.log('\nConsole');
  await step('zero console errors, page errors or failed requests across the whole run', async () => {
    assert(consoleProblems.length === 0, consoleProblems.slice(0, 20).join('\n'));
  });
} finally {
  if (browser) await browser.close().catch(() => {});
  killServer(server);
}

console.log(`\n${passed} passed, ${failures.length} failed; screenshots in ${SHOTS}`);
if (failures.length) {
  console.log(`\nFailures:\n${failures.map((f) => ` - ${f.name}`).join('\n')}`);
  process.exit(1);
}
process.exit(0);
