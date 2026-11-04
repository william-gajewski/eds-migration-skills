// Side-by-side crops of the two full-page screenshots, ours on the left and the source on the
// right, each region cropped at its own offsets (the same section often sits at different heights
// on the two sites until they match).
//
// usage: node compose.mjs --width <px> [--dir <capture dir>] <name:oursFrom:oursTo[:srcFrom:srcTo]> ...
//   e.g. node compose.mjs --width 390 --dir parity hero:0:900 band:1700:2100:2060:2600
// writes <dir>/cmp-<width>-<name>.png
import fs from 'node:fs';
import path from 'node:path';
import {
  isMain, loadPlaywright, parseArgs,
} from './lib/common.mjs';

export async function compose(browser, { dir = '.', width, regions }) {
  const abs = path.resolve(dir);
  const page = await browser.newPage({ viewport: { width: width * 2 + 48, height: 600 } });
  const files = [];
  for (const [name, o0, o1, s0 = o0, s1 = o1] of regions) {
    const col = (file, y0, y1, label) => `<div><div class="l">${label} y ${y0}-${y1}</div><div class="c" style="height:${y1 - y0}px"><img src="${file}" style="margin-top:-${y0}px"></div></div>`;
    const html = path.join(abs, '_compose.html');
    fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;padding:8px;display:flex;gap:32px;align-items:flex-start;background:#ddd;font:12px monospace}
      .c{width:${width}px;overflow:hidden;outline:1px solid #f0f;background:#fff}.c img{display:block}.l{padding:0 0 4px}
    </style></head><body>${col(`ours-${width}-full.png`, o0, o1, 'OURS')}${col(`src-${width}-full.png`, s0, s1, 'SOURCE')}</body></html>`);
    await page.goto(`file:///${html.split(path.sep).join('/')}`);
    await page.waitForLoadState('load');
    const out = path.join(abs, `cmp-${width}-${name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    files.push(out);
  }
  await page.close();
  return files;
}

if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs();
  const regions = pos.map((r) => {
    const [n, ...v] = r.split(':');
    return [n, ...v.map(Number)];
  });
  if (!opts.width || !regions.length) {
    console.error('usage: node compose.mjs --width <px> [--dir <capture dir>] name:oursFrom:oursTo[:srcFrom:srcTo] ...');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  (await compose(browser, { dir: opts.dir || '.', width: Number(opts.width), regions })).forEach((f) => console.log(f));
  await browser.close();
}
