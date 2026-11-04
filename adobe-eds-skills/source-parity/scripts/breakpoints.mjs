// List the widths a site's CSS switches at: every min-width and max-width in the @media rules of
// the pages given (stylesheets on other hosts too, fetched outside the page, which can't read
// them), and the media of <picture> sources, which switch images rather than styles. A stylesheet
// shared by several pages counts once. On the legacy site this gives the breakpoints to sweep,
// and the ranges to copy.
//
// usage: node breakpoints.mjs --url <url> [--url <url>]... [--width 1280] [--mobile-below 992]
//          [--consent <selector,...>] [--json]
//   Each breakpoint is the first width of a range: min-width 768px and max-width 767px both make
//   768. Two that are 1px apart (max-width 990px next to min-width 992px) leave a width in neither
//   range; the report points them out.
import {
  CONSENT, isMain, list, loadPlaywright, num, openPage, parseArgs,
} from './lib/common.mjs';

// runs in the page: the @media conditions of each stylesheet it can read, with how many rules
// each holds, and the addresses of those it can't (another host, without CORS)
function collect() {
  const sheets = [];
  const unreadable = [];
  const read = (sheet, key) => {
    const media = [];
    const walk = (rules) => {
      [...rules].forEach((r) => {
        if (r instanceof CSSMediaRule) {
          media.push([r.media.mediaText, r.cssRules.length]);
          walk(r.cssRules);
        } else if (r instanceof CSSImportRule) {
          if (!r.styleSheet) return;
          try {
            read(r.styleSheet, r.styleSheet.href || `${key} @import`);
          } catch (e) {
            unreadable.push(r.styleSheet.href || r.href);
          }
          if (r.media && r.media.mediaText) media.push([r.media.mediaText, 1]);
        } else if (r.cssRules && !(typeof CSSContainerRule !== 'undefined' && r instanceof CSSContainerRule)) {
          walk(r.cssRules); // @supports, @layer; container queries aren't about the viewport
        }
      });
    };
    walk(sheet.cssRules);
    if (sheet.media && sheet.media.mediaText) media.push([sheet.media.mediaText, sheet.cssRules.length]);
    sheets.push({ key, media });
  };
  [...document.styleSheets].forEach((sheet, i) => {
    const key = sheet.href || `${window.location.href} <style> ${i}`;
    try {
      read(sheet, key);
    } catch (e) {
      if (sheet.href) unreadable.push(sheet.href);
    }
  });
  const pictures = [...document.querySelectorAll('picture source[media]')].map((s) => s.media);
  return { sheets, unreadable: [...new Set(unreadable)], pictures };
}

// the viewport widths in one media condition: (min-width: 48em), (max-width: 991.98px),
// (width >= 768px), (768px <= width < 992px). Print-only conditions are skipped.
export function widths(condition) {
  const cond = String(condition);
  if (/^\s*print\b/i.test(cond) || /^\s*not\s+screen\b/i.test(cond)) return [];
  const px = (v, unit) => Number(v) * (/r?em/i.test(unit) ? 16 : 1);
  const out = [];
  [...cond.matchAll(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|em|rem)\s*\)/gi)].forEach((m) => {
    out.push({ kind: m[1].toLowerCase(), value: px(m[2], m[3]), strict: false });
  });
  // range syntax: a value on either side of "width", or both
  [...cond.matchAll(/\(([^()]*\bwidth\b[^()]*)\)/gi)].forEach((m) => {
    const s = m[1];
    if (/^\s*(min|max)-|device-width/i.test(s)) return;
    const i = s.search(/\bwidth\b/i);
    const before = s.slice(0, i).match(/([\d.]+)(px|em|rem)\s*(<=|<|>=|>)\s*$/i);
    const after = s.slice(i + 5).match(/^\s*(<=|<|>=|>)\s*([\d.]+)(px|em|rem)/i);
    if (before) out.push({ kind: before[3][0] === '<' ? 'min' : 'max', value: px(before[1], before[2]), strict: before[3].length === 1 });
    if (after) out.push({ kind: after[1][0] === '>' ? 'min' : 'max', value: px(after[2], after[3]), strict: after[1].length === 1 });
  });
  return out;
}

// the first width of the range: min-width 768 starts at 768; max-width 767 (or 767.98, or
// width < 768) ends the range below 768
export function startOf({ kind, value, strict }) {
  if (kind === 'min') return strict ? Math.floor(value) + 1 : Math.ceil(value);
  if (strict) return Math.ceil(value);
  return Number.isInteger(value) ? value + 1 : Math.ceil(value);
}

const label = (w) => {
  const v = `${Math.round(w.value * 100) / 100}px`;
  if (!w.strict) return `${w.kind}-width ${v}`;
  return `width ${w.kind === 'min' ? '>' : '<'} ${v}`;
};

export function tally(conditions) {
  const at = new Map();
  conditions.forEach(([cond, rules]) => widths(cond).forEach((w) => {
    const start = startOf(w);
    const row = at.get(start) || {
      width: start, min: 0, max: 0, values: new Map(),
    };
    row[w.kind] += Math.max(1, rules);
    row.values.set(label(w), (row.values.get(label(w)) || 0) + Math.max(1, rules));
    at.set(start, row);
  }));
  return [...at.values()].sort((a, b) => a.width - b.width).map((r) => ({ ...r, values: Object.fromEntries(r.values) }));
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  const urls = [].concat(opts.url || []).map(String);
  if (!urls.length) {
    console.error('usage: node breakpoints.mjs --url <url> [--url <url>]... [--width 1280] [--json]');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const bySheet = new Map();
  const fetched = new Map();
  const pictures = [];
  const failed = [];
  for (const url of urls) {
    // eslint-disable-next-line no-await-in-loop -- one page at a time, gently on the legacy site
    const { ctx, page } = await openPage(browser, url, {
      width: num(opts.width, 1280), mobileBelow: num(opts['mobile-below'], 992), consent: opts.consent ? list(opts.consent) : CONSENT, settle: 1500, scroll: false,
    }).catch((e) => ({ error: e }));
    if (!page) {
      failed.push(url);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const got = await page.evaluate(collect);
      got.sheets.forEach((s) => { if (!bySheet.has(s.key)) bySheet.set(s.key, s.media); });
      pictures.push(...got.pictures);
      for (const href of got.unreadable) {
        if (!fetched.has(href)) {
          // eslint-disable-next-line no-await-in-loop
          const css = await page.request.get(href).then((r) => (r.ok() ? r.text() : '')).catch(() => '');
          fetched.set(href, [...css.matchAll(/@media\s+([^{]+)\{/gi)].map((m) => [m[1].trim(), 1]));
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await ctx.close();
    }
  }
  await browser.close();

  const conditions = [...bySheet.values(), ...fetched.values()].flat();
  const rows = tally(conditions);
  const art = tally(pictures.map((m) => [m, 1]));
  // a max-width range that ends 2px before a min-width range starts leaves one width in neither
  const gaps = rows.filter((r) => r.max && !r.min).map((r) => [r, rows.find((s) => s.width === r.width + 1 && s.min)])
    .filter(([, next]) => next).map(([r, next]) => `${r.width}px is in neither range: the max-width rules that end at ${r.width - 1}px meet min-width rules from ${next.width}px`);
  if (opts.json) {
    console.log(JSON.stringify({
      urls, sheets: bySheet.size, fetched: [...fetched.keys()], failed, breakpoints: rows, pictures: art, gaps,
    }, null, 1));
  } else {
    console.log(`Breakpoints in the CSS of ${urls.length - failed.length} page${urls.length - failed.length === 1 ? '' : 's'}: ${bySheet.size} stylesheet${bySheet.size === 1 ? '' : 's'} read in the page, ${fetched.size} fetched from other hosts\n`);
    const top = [...rows].sort((a, b) => (b.min + b.max) - (a.min + a.max)).slice(0, 6);
    if (top.length) console.log(`Most used: ${top.map((r) => `${r.width} (${r.min + r.max} rules)`).join(', ')}. Vendor CSS (a grid, a widget) counts too: check which of these the page's own layout uses.\n`);
    console.log('  width   rules starting   rules ending below   values (rules)');
    rows.forEach((r) => console.log(`  ${String(r.width).padEnd(7)} ${String(r.min).padEnd(16)} ${String(r.max).padEnd(20)} ${Object.entries(r.values).map(([v, n]) => `${v} (${n})`).join(', ')}`));
    if (!rows.length) console.log('  none: no width media queries (a fixed or fluid layout), or the CSS is built in the browser');
    if (art.length) console.log(`\n<picture> sources switch images at: ${art.map((r) => `${r.width} (${Object.keys(r.values).join(', ')})`).join('; ')}`);
    gaps.forEach((g) => console.log(`\nnote: ${g}`));
    if (failed.length) console.log(`\ncould not open: ${failed.join(', ')}`);
    console.log('\nRules in a stylesheet the page loads only on some pages or after a click are counted only if one of these pages loaded it.');
  }
}
