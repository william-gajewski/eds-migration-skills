// Pixel diff of ours-<w>-full.png against src-<w>-full.png: the share of pixels that differ by more
// than a tolerance (per colour channel, 0-255), the bands of rows where they cluster, and a diff
// image: differing pixels red over a faded copy of ours. Only the area both screenshots share is
// compared, so when the pages differ in height, everything below the first shift differs too:
// fix heights first (diff.mjs), then read the percentage.
//
// usage: node pixdiff.mjs --width <px> [--dir <capture dir>] [--tolerance 48]
// writes <dir>/pixdiff-<width>.png and pixdiff-<width>.json
import fs from 'node:fs';
import path from 'node:path';
import {
  isMain, loadPlaywright, num, parseArgs,
} from './lib/common.mjs';

// runs in the page
async function compare({ a, s, tol }) {
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const [ia, is] = await Promise.all([load(a), load(s)]);
  const w = Math.min(ia.width, is.width);
  const h = Math.min(ia.height, is.height);
  const pixels = (img) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, w, h);
  };
  const da = pixels(ia);
  const ds = pixels(is);
  const out = new ImageData(w, h);
  let n = 0;
  const rows = new Array(h).fill(0);
  for (let i = 0; i < w * h; i += 1) {
    const k = i * 4;
    const d = Math.max(Math.abs(da.data[k] - ds.data[k]), Math.abs(da.data[k + 1] - ds.data[k + 1]), Math.abs(da.data[k + 2] - ds.data[k + 2]));
    if (d > tol) {
      n += 1;
      rows[Math.floor(i / w)] += 1;
      out.data[k] = 255; out.data[k + 1] = 0; out.data[k + 2] = 0; out.data[k + 3] = 255;
    } else {
      out.data[k] = 255 - (255 - da.data[k]) / 4;
      out.data[k + 1] = 255 - (255 - da.data[k + 1]) / 4;
      out.data[k + 2] = 255 - (255 - da.data[k + 2]) / 4;
      out.data[k + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(out, 0, 0);
  // bands of rows with differences, gaps under 12 rows merged
  const bands = [];
  let cur = null;
  rows.forEach((r, y) => {
    if (!r) return;
    if (cur && y - cur.to <= 12) { cur.to = y; cur.px += r; } else { cur = { from: y, to: y, px: r }; bands.push(cur); }
  });
  return {
    w, h, oursH: ia.height, srcH: is.height, n, pct: (100 * n) / (w * h), bands, png: c.toDataURL('image/png'),
  };
}

export async function pixdiff(browser, { dir = '.', width, tolerance = 48 }) {
  const page = await browser.newPage();
  const dataUrl = (f) => `data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`;
  const res = await page.evaluate(compare, { a: dataUrl(`ours-${width}-full.png`), s: dataUrl(`src-${width}-full.png`), tol: tolerance });
  await page.close();
  fs.writeFileSync(path.join(dir, `pixdiff-${width}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
  delete res.png;
  res.tolerance = tolerance;
  fs.writeFileSync(path.join(dir, `pixdiff-${width}.json`), JSON.stringify(res, null, 1));
  return res;
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  if (!opts.width) {
    console.error('usage: node pixdiff.mjs --width <px> [--dir <capture dir>] [--tolerance 48]');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const r = await pixdiff(browser, { dir: opts.dir || '.', width: Number(opts.width), tolerance: num(opts.tolerance, 48) });
  await browser.close();
  console.log(`${opts.width}: ours ${r.oursH}px, source ${r.srcH}px tall; ${r.n} pixels differ (${r.pct.toFixed(3)}%) at tolerance ${r.tolerance}`);
  r.bands.filter((b) => b.px >= 20).forEach((b) => console.log(`  rows ${b.from}-${b.to}: ${b.px} px`));
}
