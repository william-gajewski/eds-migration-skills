/* eslint-env node */
/* eslint-disable no-console */
// Shared by the smoke, axe and Lighthouse checks: arguments, the host to test, the paths to test,
// and Playwright.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS = path.join(ROOT, 'test', 'checks', 'results');

// --key value, --key=value and bare --flag; a key given more than once collects its values
export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const set = (k, v) => { opts[k] = k in opts ? [].concat(opts[k], v) : v; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) set(a.slice(2, eq), a.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        set(a.slice(2), argv[i + 1]);
        i += 1;
      } else set(a.slice(2), true);
    }
  }
  return opts;
}

export const list = (v) => [].concat(v ?? []).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);

// a usage error: say what's wrong and stop, without a stack trace
export function die(message) {
  console.error(message);
  process.exit(1);
}

// org and site from .migration/project.json, else from the git remote (github.com/<org>/<site>)
export function siteOf() {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(ROOT, '.migration', 'project.json'), 'utf8'));
    const s = Object.values(pj.sites || {}).find((x) => x.previewOrg && x.previewSite);
    if (s) return { org: s.previewOrg, site: s.previewSite };
  } catch (e) {
    // no usable project.json: try the remote
  }
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', cwd: ROOT });
  const m = (r.stdout || '').match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
  return m ? { org: m[1].toLowerCase(), site: m[2].toLowerCase() } : {};
}

// --host local (aem up, on --port or 3000), preview, live, or a URL
export function hostOf(opts) {
  const host = String(opts.host || 'local');
  if (/^https?:\/\//.test(host)) return host.replace(/\/+$/, '');
  if (host === 'local') return `http://localhost:${opts.port || 3000}`;
  const { org, site } = siteOf();
  if (!org || !site) die('Unknown site: set previewOrg and previewSite in .migration/project.json, or pass --host <url>.');
  const ref = opts.ref || 'main';
  if (host === 'preview') return `https://${ref}--${site}--${org}.aem.page`;
  if (host === 'live') return `https://${ref}--${site}--${org}.aem.live`;
  return die(`--host ${host}: expected local, preview, live or a URL`);
}

// --paths a,b/c, or --list <file>, else test/checks/paths.txt (one path per line, # for comments)
export function pathsOf(opts) {
  let raw = list(opts.paths);
  if (!raw.length) {
    const file = opts.list ? path.resolve(String(opts.list)) : path.join(ROOT, 'test', 'checks', 'paths.txt');
    if (!fs.existsSync(file)) die(`${file} doesn't exist: pass --paths or --list.`);
    raw = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  }
  return raw.map((p) => {
    // Git Bash turns an argument such as /about into C:/Program Files/Git/about
    if (/^[A-Za-z]:[\\/]/.test(p)) die(`${p}: Git Bash rewrote a path into a Windows path. Leave out the leading slash (about/us), or set MSYS_NO_PATHCONV=1.`);
    return `/${p.replace(/^\/+/, '')}`;
  });
}

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (e) {
    console.error('Playwright is missing: run "npm install", then "npx playwright install chromium".');
    process.exit(2);
  }
  return null;
}

// a file-name-safe label for a path: / is "home", /a/b is "a-b"
export const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase());
export const hostLabel = (host) => new URL(host).host.replace(/[^a-z0-9.-]/gi, '-');

// run work over items, a few at a time, keeping their order
export async function pool(items, size, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      out[i] = await work(items[i], i);
    }
  }));
  return out;
}

// load a page and scroll through it, so lazy blocks and images are in place
export async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 80); });
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}
