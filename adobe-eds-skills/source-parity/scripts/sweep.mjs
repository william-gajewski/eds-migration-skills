// Sweep widths: at each one, capture our page and the source page, diff them by text and by
// pixels, and write a report: one row per width (page heights, matched elements, how many are
// offset, the pixel difference), then per width where the offsets start and what differs.
//
// usage: node sweep.mjs --ours <url> --source <url> --widths 390,768,1280 [--out <dir>]
//          [--height 900] [--mobile-below 992] [--consent <selector,...>] [--tolerance 48]
// writes <out>/report.md, report.json, and per width the captures, diff-<w>.txt, pixdiff-<w>.png
import fs from 'node:fs';
import path from 'node:path';
import {
  CONSENT, isMain, list, loadPlaywright, num, parseArgs,
} from './lib/common.mjs';
import { capture } from './capture.mjs';
import { diffDumps } from './diff.mjs';
import { pixdiff } from './pixdiff.mjs';

export async function sweep({
  ours, source, widths, out = 'parity', height = 900, mobileBelow = 992, consent = CONSENT, tolerance = 48, log = console.log,
}) {
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const width of widths) {
      const common = {
        width, out, height, mobileBelow, consent,
      };
      const o = await capture(browser, { ...common, url: ours, name: 'ours' });
      const s = await capture(browser, { ...common, url: source, name: 'src' });
      const { text, summary } = diffDumps(o, s, width);
      fs.writeFileSync(path.join(out, `diff-${width}.txt`), text);
      fs.writeFileSync(path.join(out, `diff-${width}.json`), JSON.stringify(summary, null, 1));
      const px = await pixdiff(browser, { dir: out, width, tolerance });
      const row = {
        width,
        oursH: o.docH,
        srcH: s.docH,
        deltaH: o.docH - s.docH,
        oursScrollW: o.scrollW,
        matched: summary.matched,
        offset: summary.offset,
        differing: summary.differing,
        pixelsPct: Number(px.pct.toFixed(3)),
        changes: summary.changes,
        local: summary.local,
        bands: px.bands.filter((b) => b.px >= 20).sort((a, b) => b.px - a.px).slice(0, 6),
        oursErrors: o.errors,
        srcErrors: s.errors,
      };
      results.push(row);
      log(`${width}: ours ${row.oursH}px, source ${row.srcH}px (${row.deltaH >= 0 ? '+' : ''}${row.deltaH}); ${row.offset}/${row.matched} offset, ${row.differing} differ; ${row.pixelsPct}% of pixels differ${row.oursScrollW > width ? `; ours scrolls sideways (${row.oursScrollW}px)` : ''}`);
    }
  } finally {
    await browser.close();
  }

  const md = [
    `# Parity: ${ours} vs ${source}`,
    '',
    `Measured ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC; a phone (user agent, touch) below ${mobileBelow}px, a desktop browser from there. Pixel tolerance ${tolerance}/255.`,
    '',
    '| Width | Ours (px) | Source (px) | Height difference | Matched elements | Offset | With differences | Pixels differ |',
    '|---|---|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.width} | ${r.oursH} | ${r.srcH} | ${r.deltaH >= 0 ? '+' : ''}${r.deltaH} | ${r.matched} | ${r.offset} | ${r.differing} | ${r.pixelsPct}% |`),
    '',
  ];
  results.forEach((r) => {
    md.push(`## ${r.width}px`, '');
    if (r.oursScrollW > r.width) md.push(`- Ours scrolls sideways: ${r.oursScrollW}px wide.`);
    md.push(`- Shifts (the vertical offset changes and stays: something above differs in height): ${r.changes.length ? '' : 'none.'}`);
    r.changes.slice(0, 8).forEach((c) => md.push(`  - dy ${c.from} -> ${c.to}, between ${c.after} and ${c.at}`));
    if (r.changes.length > 8) md.push(`  - ... ${r.changes.length - 8} more in diff-${r.width}.txt`);
    md.push(`- Local offsets (a few elements sit differently, then the page lines up again): ${r.local.length ? r.local.map((c) => `${c.elements} from ${c.at} (dy ${c.to})`).join('; ') : 'none'}.`);
    md.push(`- Largest pixel bands: ${r.bands.length ? r.bands.map((b) => `rows ${b.from}-${b.to} (${b.px} px)`).join(', ') : 'none'}.`);
    if (r.oursErrors.length) md.push(`- Errors on ours: ${r.oursErrors.slice(0, 5).join('; ')}`);
    if (r.srcErrors.length) md.push(`- Errors on the source: ${r.srcErrors.slice(0, 5).join('; ')}`);
    md.push(`- Details: diff-${r.width}.txt, pixdiff-${r.width}.png (red = differs), ours-${r.width}-full.png, src-${r.width}-full.png.`, '');
  });
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n'));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({
    ours, source, mobileBelow, tolerance, measured: new Date().toISOString(), widths: results,
  }, null, 1));
  return results;
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  if (!opts.ours || !opts.source || !opts.widths) {
    console.error('usage: node sweep.mjs --ours <url> --source <url> --widths 390,768,1280 [--out <dir>] [--mobile-below 992] [--consent sel,...] [--tolerance 48]');
    process.exit(1);
  }
  await sweep({
    ours: opts.ours,
    source: opts.source,
    widths: list(opts.widths).map(Number),
    out: opts.out || 'parity',
    height: num(opts.height, 900),
    mobileBelow: num(opts['mobile-below'], 992),
    consent: opts.consent ? list(opts.consent) : CONSENT,
    tolerance: num(opts.tolerance, 48),
  });
  console.log(`report: ${path.join(opts.out || 'parity', 'report.md')}`);
}
