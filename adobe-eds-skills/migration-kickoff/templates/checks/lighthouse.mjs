/* eslint-env node */
/* eslint-disable no-console, import/extensions */
/* eslint-disable no-await-in-loop, no-restricted-syntax -- runs go one after another */
// Lighthouse lab scores, run locally with Chrome: for each URL and device, the median of several
// runs by performance score. Use it for the legacy site's baseline (--url, at kickoff) and for
// this site's pages after each batch. aem.page and aem.live send noindex, so their SEO score is
// low by design: judge SEO on the production domain.
//
// usage: node test/checks/lighthouse.mjs [--host local|preview|live|<url>]
//          [--paths a,b/c | --list <file> | --url <full url>...] [--runs 3]
//          [--device mobile|desktop|both] [--out <file.json>]
// Needs Chrome (or CHROME_PATH). It runs lighthouse@12 through npx, the version project-outtake
// uses, so the kickoff baseline and the handover's numbers compare.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RESULTS, die, hostLabel, hostOf, parseArgs, pathsOf,
} from './lib.mjs';

const LIGHTHOUSE = 'lighthouse@12';
const opts = parseArgs();
const urls = opts.url ? [].concat(opts.url).map(String) : pathsOf(opts).map((p) => `${hostOf(opts)}${p}`);
const runs = Math.max(1, Number(opts.runs || 3));
const devices = { mobile: ['mobile'], desktop: ['desktop'], both: ['mobile', 'desktop'] }[String(opts.device || 'both')];
if (!devices) die(`--device ${opts.device}: expected mobile, desktop or both`);
const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const chrome = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => p && fs.existsSync(p));
if (!chrome) die('Chrome was not found: install it, or set CHROME_PATH to a Chromium-based browser.');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-lh-'));
function measure(url, device) {
  const file = path.join(tmp, `${device}-${Date.now()}.json`);
  const args = ['-y', LIGHTHOUSE, url, '--quiet', '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new',
    '--only-categories=performance,accessibility,best-practices,seo', ...(device === 'desktop' ? ['--preset=desktop'] : [])];
  const run = { env: { ...process.env, CHROME_PATH: chrome }, encoding: 'utf8', timeout: 240000 };
  // Windows runs npx through cmd.exe: one quoted command line rather than an argument list
  if (process.platform === 'win32') spawnSync(['npx', ...args].map((a) => (/[\s&|<>^"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)).join(' '), { ...run, shell: true });
  else spawnSync('npx', args, run);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

const rows = [];
let version = '';
for (const url of urls) {
  for (const device of devices) {
    const all = [];
    for (let i = 0; i < runs; i += 1) {
      console.error(`measuring ${url} (${device}, run ${i + 1} of ${runs})`);
      const lh = measure(url, device);
      if (lh?.categories) all.push(lh);
    }
    if (!all.length) {
      rows.push({ url, device, error: 'no report (the page did not load, or Lighthouse failed)' });
    } else {
      const perf = (lh) => lh.categories.performance?.score ?? 0;
      all.sort((a, b) => perf(a) - perf(b));
      const lh = all[Math.floor((all.length - 1) / 2)];
      version = lh.lighthouseVersion;
      const score = (k) => Math.round((lh.categories[k]?.score ?? 0) * 100);
      const audit = (k) => lh.audits?.[k]?.displayValue || '';
      rows.push({
        url,
        device,
        performance: score('performance'),
        runs: all.map((x) => Math.round(perf(x) * 100)),
        accessibility: score('accessibility'),
        bestPractices: score('best-practices'),
        seo: score('seo'),
        lcp: audit('largest-contentful-paint'),
        cls: audit('cumulative-layout-shift'),
        tbt: audit('total-blocking-time'),
      });
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

const md = [`# Lighthouse, ${new Date().toISOString().slice(0, 10)}`, '',
  `Lighthouse ${version || LIGHTHOUSE} run locally (simulated throttling), the median of ${runs} run${runs === 1 ? '' : 's'} by performance score. "Runs" lists every run's performance score.`, '',
  '| URL | Device | Performance | Runs | Accessibility | Best practices | SEO | LCP | CLS | TBT |',
  '|:------|:------|----:|:------|----:|----:|----:|:----|:----|:----|',
  ...rows.map((r) => (r.error
    ? `| ${r.url} | ${r.device} | ${r.error} | | | | | | | |`
    : `| ${r.url} | ${r.device} | ${r.performance} | ${r.runs.join(', ')} | ${r.accessibility} | ${r.bestPractices} | ${r.seo} | ${r.lcp} | ${r.cls} | ${r.tbt} |`)),
  ''];
if (urls.some((u) => /\/\/[^/]*--[^/]*\.aem\.(page|live)\b/.test(u))) md.push('aem.page and aem.live send `noindex`, so their SEO score is low by design.', '');
console.log(md.join('\n'));

const out = opts.out ? path.resolve(String(opts.out)) : path.join(RESULTS, `lighthouse-${hostLabel(urls[0])}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({
  date: new Date().toISOString(), lighthouse: version, runs, rows,
}, null, 1)}\n`);
fs.writeFileSync(`${out.replace(/\.json$/i, '')}.md`, md.join('\n'));
console.log(`Written: ${path.relative(process.cwd(), out)} and its .md`);
process.exitCode = rows.every((r) => r.error) ? 1 : 0;
