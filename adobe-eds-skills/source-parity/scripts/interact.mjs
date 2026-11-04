// Drive a page through a few steps and screenshot the states: a menu opened, a search box opened,
// an accordion expanded. Run it on both sites with their own selectors and compare the shots.
//
// usage: node interact.mjs --url <url> --width <px> --steps "<step>;<step>;..." [--out <dir>]
//          [--name ours] [--height 844] [--mobile-below 992]
//   steps: click:<selector>  key:<Key>  wait:<ms>  scroll:<y>  shot:<label>  fullshot:<label>
//   e.g. --steps "shot:closed;click:header .nav-hamburger;wait:500;shot:menu"
// writes <out>/ix-<name>-<width>-<label>.png and prints the focused element after each step
import fs from 'node:fs';
import path from 'node:path';
import {
  CONSENT, isMain, list, loadPlaywright, num, openPage, parseArgs,
} from './lib/common.mjs';

export async function interact(browser, {
  url, width, steps, out = '.', name = 'page', height = 844, mobileBelow = 992, consent = CONSENT,
}) {
  fs.mkdirSync(out, { recursive: true });
  const { ctx, page } = await openPage(browser, url, {
    width, height, mobileBelow, consent, scroll: false,
  });
  const log = [];
  for (const step of steps) {
    const i = step.indexOf(':');
    const op = step.slice(0, i);
    const arg = step.slice(i + 1);
    if (op === 'click') await page.click(arg);
    else if (op === 'key') await page.keyboard.press(arg);
    else if (op === 'wait') await page.waitForTimeout(Number(arg));
    else if (op === 'scroll') await page.evaluate((y) => window.scrollTo(0, y), Number(arg));
    else if (op === 'shot' || op === 'fullshot') {
      const f = path.join(out, `ix-${name}-${width}-${arg}.png`);
      await page.screenshot({ path: f, fullPage: op === 'fullshot' });
      log.push(`shot ${f}`);
      continue;
    } else throw new Error(`unknown step: ${step}`);
    const focused = await page.evaluate(() => {
      const a = document.activeElement;
      return a && a !== document.body ? `${a.tagName.toLowerCase()}${a.className && typeof a.className === 'string' ? `.${a.className.split(' ')[0]}` : ''}` : 'body';
    });
    log.push(`${step} -> focus ${focused}`);
  }
  log.push(...page.errors.map((e) => `error ${e}`));
  await ctx.close();
  return log;
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  if (!opts.url || !opts.width || !opts.steps) {
    console.error('usage: node interact.mjs --url <url> --width <px> --steps "shot:a;click:sel;wait:500;shot:b" [--out <dir>] [--name ours]');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  (await interact(browser, {
    url: opts.url,
    width: Number(opts.width),
    steps: String(opts.steps).split(';').map((s) => s.trim()).filter(Boolean),
    out: opts.out || '.',
    name: opts.name || 'page',
    height: num(opts.height, 844),
    mobileBelow: num(opts['mobile-below'], 992),
    consent: opts.consent ? list(opts.consent) : CONSENT,
  })).forEach((l) => console.log(l));
  await browser.close();
}
