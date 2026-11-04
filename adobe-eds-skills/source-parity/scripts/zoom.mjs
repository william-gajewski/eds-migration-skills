// Zoomed side-by-side crops (ours left, the source right) of small areas of the two full-page
// screenshots, pixelated so edges stay sharp: icons, logos, rules, button corners.
//
// usage: node zoom.mjs --width <px> [--dir <capture dir>] [--scale 4] <name:x:y:w:h> ...
// writes <dir>/zoom-<width>-<name>.png
import fs from 'node:fs';
import path from 'node:path';
import {
  isMain, loadPlaywright, num, parseArgs,
} from './lib/common.mjs';

export async function zoom(browser, {
  dir = '.', width, scale = 4, areas,
}) {
  const abs = path.resolve(dir);
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  const files = [];
  for (const [name, x, y, w, h] of areas) {
    const cell = (file, label) => `<div><div class="l">${label}</div><div class="c" style="width:${w * scale}px;height:${h * scale}px"><img src="${file}" style="transform:scale(${scale});transform-origin:0 0;margin:-${y * scale}px 0 0 -${x * scale}px"></div></div>`;
    const html = path.join(abs, '_zoom.html');
    fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;padding:8px;display:flex;gap:24px;background:#ddd;font:12px monospace}
      .c{overflow:hidden;outline:1px solid #f0f;background:#fff}.c img{display:block;image-rendering:pixelated}
    </style></head><body>${cell(`ours-${width}-full.png`, `OURS ${name} (${x},${y} ${w}x${h})`)}${cell(`src-${width}-full.png`, 'SOURCE')}</body></html>`);
    await page.goto(`file:///${html.split(path.sep).join('/')}`);
    const out = path.join(abs, `zoom-${width}-${name}.png`);
    await page.screenshot({ path: out, fullPage: true });
    files.push(out);
  }
  await page.close();
  return files;
}

if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs();
  const areas = pos.map((a) => {
    const [n, ...v] = a.split(':');
    return [n, ...v.map(Number)];
  });
  if (!opts.width || !areas.length) {
    console.error('usage: node zoom.mjs --width <px> [--dir <capture dir>] [--scale 4] name:x:y:w:h ...');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  (await zoom(browser, {
    dir: opts.dir || '.', width: Number(opts.width), scale: num(opts.scale, 4), areas,
  })).forEach((f) => console.log(f));
  await browser.close();
}
