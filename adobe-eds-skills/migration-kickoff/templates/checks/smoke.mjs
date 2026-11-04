/* eslint-env node */
/* eslint-disable no-console, import/extensions */
// Smoke test: each path at phone, tablet and desktop width, against a local aem up, preview or
// live. A render fails on an HTTP error, a script error, a failed request to the site, a broken
// image, a block that didn't load, or a page that scrolls sideways. A missing h1 and an empty
// header or footer are warnings. Full-page screenshots go to test/checks/results/smoke-<host>/.
//
// usage: node test/checks/smoke.mjs [--host local|preview|live|<url>] [--port 3000] [--ref main]
//          [--paths a,b/c | --list <file>] [--widths 390,768,1280] [--no-shots]
import fs from 'node:fs';
import path from 'node:path';
import {
  RESULTS, hostLabel, hostOf, list, loadPlaywright, parseArgs, pathsOf, pool, settle, slug,
} from './lib.mjs';

const opts = parseArgs();
const host = hostOf(opts);
const paths = pathsOf(opts);
const widths = list(opts.widths || '390,768,1280').map(Number);
const shots = path.join(RESULTS, `smoke-${hostLabel(host)}`);
if (!opts['no-shots']) fs.mkdirSync(shots, { recursive: true });
const { origin } = new URL(host);
const SITE_REQUEST = /\.aem\.(page|live)\/|content\.da\.live\//;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const jobs = widths.flatMap((w) => paths.map((p) => ({ w, p })));

const results = await pool(jobs, 4, async ({ w, p }) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0].slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.startsWith(origin) || SITE_REQUEST.test(u))) failed.push(`${r.status()} ${u.replace(origin, '').slice(0, 120)}`);
  });
  let status = 0;
  try {
    const resp = await page.goto(`${host}${p}`, { waitUntil: 'load', timeout: 60000 });
    status = resp ? resp.status() : 0;
    await settle(page);
  } catch (e) {
    errors.push(`navigation: ${e.message.split('\n')[0]}`);
  }
  const m = await page.evaluate(() => ({
    path: window.location.pathname,
    h1: Boolean(document.querySelector('main h1')),
    broken: [...document.querySelectorAll('img')].filter((i) => i.getAttribute('src') === 'about:error' || (i.complete && i.currentSrc && i.naturalWidth === 0)).length,
    unloaded: [...document.querySelectorAll('.block')].filter((b) => b.dataset.blockStatus !== 'loaded').map((b) => b.dataset.blockName || b.classList[0]),
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    header: Boolean(document.querySelector('header')?.children.length),
    footer: Boolean(document.querySelector('footer')?.children.length),
  })).catch(() => ({}));
  if (!opts['no-shots']) await page.screenshot({ path: path.join(shots, `${slug(p)}-${w}.png`), fullPage: true }).catch(() => {});
  await ctx.close();
  const fails = [
    status >= 400 && `HTTP ${status}`,
    errors.length && plural(errors.length, 'script error'),
    failed.length && plural(failed.length, 'failed request'),
    m.broken && plural(m.broken, 'broken image'),
    m.unloaded?.length && `blocks not loaded: ${m.unloaded.join(', ')}`,
    m.sideways && 'scrolls sideways',
  ].filter(Boolean);
  const warns = [m.h1 === false && 'no h1', m.header === false && 'empty header', m.footer === false && 'empty footer'].filter(Boolean);
  return {
    w, p, status, moved: m.path && m.path !== p ? m.path : null, fails, warns, errors, failed,
  };
});
await browser.close();

console.log(`Smoke test, ${host}: ${plural(paths.length, 'path')} at ${widths.join(', ')}\n`);
const width = Math.min(60, Math.max(...paths.map((p) => p.length)));
results.forEach((r) => {
  let verdict = 'ok';
  if (r.fails.length) verdict = `FAIL  ${[...r.fails, ...r.warns].join(', ')}`;
  else if (r.warns.length) verdict = `warn  ${r.warns.join(', ')}`;
  console.log(`  @${String(r.w).padEnd(5)} ${r.p.padEnd(width)}  ${r.moved ? `(-> ${r.moved}) ` : ''}${verdict}`);
  r.errors.slice(0, 2).forEach((e) => console.log(`           error: ${e}`));
  r.failed.slice(0, 2).forEach((e) => console.log(`           failed: ${e}`));
});
const failedRenders = results.filter((r) => r.fails.length).length;
const warned = results.filter((r) => !r.fails.length && r.warns.length).length;
console.log(`\n${plural(results.length, 'render')}: ${failedRenders} failed, ${warned} with warnings.${opts['no-shots'] ? '' : ` Screenshots: ${path.relative(process.cwd(), shots) || '.'}`}`);
process.exitCode = failedRenders ? 1 : 0;
