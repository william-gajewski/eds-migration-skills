// Capture one page at one width: a first-screen screenshot (before scrolling, what a visitor sees
// on arrival), a full-page screenshot, and a dump of every visible text element, image and control
// with its box and computed type, for diff.mjs to match against the other site.
//
// usage: node capture.mjs --url <url> --name <ours|src> --width <px> [--out <dir>]
//          [--height 900] [--mobile-below 992] [--ua <string>] [--consent <selector,...>]
// writes <out>/<name>-<width>.json, <name>-<width>-full.png and <name>-<width>-fold.png
import fs from 'node:fs';
import path from 'node:path';
import {
  CONSENT, isMain, list, loadPlaywright, num, openPage, parseArgs, scrollThrough,
} from './lib/common.mjs';

// runs in the page
function dumpPage() {
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const items = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'TEMPLATE'].includes(el.tagName.toUpperCase())) return;
    const isImg = el.tagName === 'IMG';
    const isCtl = ['A', 'BUTTON', 'INPUT'].includes(el.tagName);
    const t = ownText(el);
    if (!isImg && !isCtl && !t) return;
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.left > window.innerWidth + 1) return; // off-screen (a closed drawer)
    let anc = el;
    let clipped = false;
    while ((anc = anc.parentElement)) {
      const acs = getComputedStyle(anc);
      if (acs.display === 'none' || acs.visibility === 'hidden') { clipped = true; break; }
      if ((acs.overflow === 'hidden' || acs.overflowY === 'hidden') && anc.getBoundingClientRect().height < 1) { clipped = true; break; }
    }
    if (clipped) return;
    const cs = getComputedStyle(el);
    items.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 3).join('.') : '',
      text: (t || el.getAttribute('aria-label') || el.alt || el.getAttribute('title') || el.value || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
      x: Math.round(r.left * 10) / 10,
      y: Math.round((r.top + window.scrollY) * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      fs: cs.fontSize,
      lh: cs.lineHeight,
      ff: cs.fontFamily.split(',')[0].replace(/"/g, ''),
      fw: cs.fontWeight,
      ls: cs.letterSpacing,
      color: cs.color,
      bg: cs.backgroundColor,
      ta: cs.textAlign,
      tt: cs.textTransform,
      src: isImg ? (el.currentSrc || el.src).split('/').pop().split('?')[0].slice(0, 60) : undefined,
      nat: isImg ? `${el.naturalWidth}x${el.naturalHeight}` : undefined,
      fit: isImg ? `${cs.objectFit} ${cs.objectPosition}` : undefined,
    });
  });
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { y: r.top + window.scrollY, h: r.height };
  };
  return {
    docH: document.documentElement.scrollHeight,
    scrollW: document.documentElement.scrollWidth,
    header: box('header'),
    main: box('main'),
    footer: box('footer'),
    items,
  };
}

export async function capture(browser, {
  url, name, width, out = '.', height = 900, mobileBelow = 992, ua, consent = CONSENT,
}) {
  fs.mkdirSync(out, { recursive: true });
  const { ctx, page } = await openPage(browser, url, {
    width, height, mobileBelow, ua, consent, scroll: false,
  });
  await page.screenshot({ path: path.join(out, `${name}-${width}-fold.png`) });
  await scrollThrough(page);
  const dump = await page.evaluate(dumpPage);
  dump.url = url;
  dump.width = width;
  dump.errors = page.errors;
  dump.consentClosed = page.consentClosed;
  fs.writeFileSync(path.join(out, `${name}-${width}.json`), JSON.stringify(dump, null, 1));
  await page.screenshot({ path: path.join(out, `${name}-${width}-full.png`), fullPage: true });
  await ctx.close();
  return dump;
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  if (!opts.url || !opts.name || !opts.width) {
    console.error('usage: node capture.mjs --url <url> --name <ours|src> --width <px> [--out <dir>] [--mobile-below 992] [--consent sel,...]');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const d = await capture(browser, {
    url: opts.url,
    name: opts.name,
    width: Number(opts.width),
    out: opts.out || '.',
    height: num(opts.height, 900),
    mobileBelow: num(opts['mobile-below'], 992),
    ua: opts.ua,
    consent: opts.consent ? list(opts.consent) : CONSENT,
  });
  await browser.close();
  const fmt = (b) => (b ? `${Math.round(b.y)}+${Math.round(b.h)}` : '-');
  console.log(`${opts.name}@${opts.width}: page ${d.docH}px tall, ${d.scrollW}px wide; header ${fmt(d.header)}, main ${fmt(d.main)}, footer ${fmt(d.footer)}; ${d.items.length} elements; ${d.errors.length} errors${d.errors.length ? `: ${d.errors.slice(0, 3).join(' | ')}` : ''}`);
}
