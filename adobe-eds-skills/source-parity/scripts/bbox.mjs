// The bounding box of the "ink" in an area of both full-page screenshots: the pixels that differ
// from the area's background (its top-left pixel). For icons, logos and rules this gives their
// drawn size and position to the pixel, which element boxes don't (an SVG or a font glyph rarely
// fills its box).
//
// usage: node bbox.mjs --width <px> [--dir <capture dir>] [--threshold 60] <name:x:y:w:h> ...
//   pick an area a little larger than the icon, on a plain background
import fs from 'node:fs';
import path from 'node:path';
import {
  isMain, loadPlaywright, num, parseArgs,
} from './lib/common.mjs';

// runs in the page
async function measure({ files, areas, threshold }) {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const res = [];
  for (const [label, src] of files) {
    const img = await load(src);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    for (const [name, ax, ay, aw, ah] of areas) {
      const d = x.getImageData(ax, ay, aw, ah).data;
      const bg = [d[0], d[1], d[2]];
      let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
      for (let yy = 0; yy < ah; yy += 1) {
        for (let xx = 0; xx < aw; xx += 1) {
          const k = (yy * aw + xx) * 4;
          if (Math.max(Math.abs(d[k] - bg[0]), Math.abs(d[k + 1] - bg[1]), Math.abs(d[k + 2] - bg[2])) > threshold) {
            x0 = Math.min(x0, xx); y0 = Math.min(y0, yy); x1 = Math.max(x1, xx); y1 = Math.max(y1, yy);
          }
        }
      }
      res.push(`${name.padEnd(12)} ${label.padEnd(6)} ${x1 < 0 ? 'no ink' : `x ${ax + x0}-${ax + x1} (${x1 - x0 + 1}px)  y ${ay + y0}-${ay + y1} (${y1 - y0 + 1}px)`}`);
    }
  }
  return res.sort();
}

export async function bbox(browser, {
  dir = '.', width, areas, threshold = 60,
}) {
  const page = await browser.newPage();
  const url = (f) => `data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`;
  const out = await page.evaluate(measure, {
    files: [['ours', url(`ours-${width}-full.png`)], ['source', url(`src-${width}-full.png`)]], areas, threshold,
  });
  await page.close();
  return out;
}

if (isMain(import.meta.url)) {
  const { opts, pos } = parseArgs();
  const areas = pos.map((a) => {
    const [n, ...v] = a.split(':');
    return [n, ...v.map(Number)];
  });
  if (!opts.width || !areas.length) {
    console.error('usage: node bbox.mjs --width <px> [--dir <capture dir>] [--threshold 60] name:x:y:w:h ...');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  console.log((await bbox(browser, {
    dir: opts.dir || '.', width: Number(opts.width), areas, threshold: num(opts.threshold, 60),
  })).join('\n'));
  await browser.close();
}
