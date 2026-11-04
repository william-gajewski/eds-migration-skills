// Shared helpers for the source-parity scripts: finding Playwright, reading arguments, opening a
// page the way a phone or a desktop browser would, closing consent banners, and scrolling through
// a page so lazy-loaded content is in place before anything is measured.
import { createRequire } from 'node:module';
import path from 'node:path';

export const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
export const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Consent-banner buttons that dismiss without accepting (OneTrust, Cookiebot, TrustArc). A banner
// left open covers the first screen of the page and spoils its screenshots.
export const CONSENT = [
  '#onetrust-close-btn-handler',
  '.onetrust-close-btn-handler',
  '#onetrust-reject-all-handler',
  '#CybotCookiebotDialogBodyButtonDecline',
  '#truste-consent-required',
];

// Playwright is not a dependency of the skill: it is looked up in PARITY_NODE_MODULES, then in the
// current directory's node_modules (run the scripts from the project root), then next to the
// skill.
export function loadPlaywright() {
  const bases = [];
  if (process.env.PARITY_NODE_MODULES) {
    const dir = path.resolve(process.env.PARITY_NODE_MODULES);
    bases.push(path.join(path.basename(dir) === 'node_modules' ? path.dirname(dir) : dir, 'noop.js'));
  }
  bases.push(path.join(process.cwd(), 'noop.js'));
  bases.push(import.meta.url);
  for (const base of bases) {
    try {
      return createRequire(base)('playwright');
    } catch (e) {
      // not here: try the next place
    }
  }
  console.error('Playwright was not found. In the project: npm i --no-save playwright && npx playwright install chromium');
  console.error('(or set PARITY_NODE_MODULES to a node_modules folder that has it)');
  process.exit(2);
  return null;
}

// --key value, --key=value and bare --flag; a key given more than once collects its values in an
// array; everything else is positional.
export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const pos = [];
  const set = (k, v) => {
    if (k in opts) opts[k] = [].concat(opts[k], v);
    else opts[k] = v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) set(a.slice(2, eq), a.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        set(a.slice(2), argv[i + 1]);
        i += 1;
      } else set(a.slice(2), true);
    } else pos.push(a);
  }
  return { opts, pos };
}

export const list = (v) => [].concat(v ?? []).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean);
export const num = (v, dflt) => (v === undefined || v === true ? dflt : Number(v));

export async function dismissConsent(page, selectors = CONSENT) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el && await el.isVisible().catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(600);
      return sel;
    }
  }
  return null;
}

export async function scrollThrough(page, step = 600, pause = 120) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(pause);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
}

// A phone below `mobileBelow` (a phone user agent, touch, the mobile viewport), a desktop browser
// from there. Same-site responses of 400 or more and page errors are kept on page.errors.
export async function openPage(browser, url, {
  width, height = 900, mobileBelow = 992, ua, consent = CONSENT, settle = 2500, scroll = true,
} = {}) {
  const mobile = width < mobileBelow;
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    userAgent: ua || (mobile ? MOBILE_UA : DESKTOP_UA),
  });
  const page = await ctx.newPage();
  page.errors = [];
  const host = new URL(url).host;
  page.on('pageerror', (e) => page.errors.push(`pageerror ${e.message.slice(0, 120)}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).host === host) page.errors.push(`${r.status()} ${r.url().slice(0, 120)}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(settle);
  page.consentClosed = await dismissConsent(page, consent);
  if (scroll) await scrollThrough(page);
  return { ctx, page };
}

// true when the module is the script node was started with
export const isMain = (metaUrl) => {
  const arg = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const file = decodeURIComponent(new URL(metaUrl).pathname).replace(/^\/([A-Za-z]:)/, '$1');
  return path.resolve(file) === arg;
};
