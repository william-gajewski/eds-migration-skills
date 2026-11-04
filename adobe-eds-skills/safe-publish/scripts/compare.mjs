// Compare two versions of a document or sheet: links, headings, images and text (rows for a sheet).
// Read-only. Each side is one of:
//   da:<path>                 the DA source now
//   version:<url>             a DA history snapshot (a versionsource URL from versions.mjs)
//   preview:<path>  live:<path>   the rendered page or sheet
//   file:<local file>         a backup or a document you are about to upload
// usage: node compare.mjs <side A> <side B> [--org o --site s] [--max 20]
//   e.g. node compare.mjs da:/footer live:/footer
//        node compare.mjs file:backup/index.html live:/
import fs from 'node:fs';
import {
  api, compareDocs, compareSheets, describe, docSummary, isMain, loadConfig, loadToken, metadataRows, parseArgs, resolvePath, run, sheetRows,
} from './lib/eds.mjs';

export async function load(a, side) {
  const i = side.indexOf(':');
  const kind = side.slice(0, i);
  const ref = kind === 'file' || kind === 'version' ? side.slice(i + 1) : side.slice(i + 1);
  if (kind === 'file') return { text: fs.readFileSync(ref, 'utf8'), sheet: /\.json$/i.test(ref) };
  if (kind === 'version') return { text: await a.daGetUrl(new URL(ref, 'https://admin.da.live').pathname), sheet: /\.json$/i.test(ref) };
  const p = resolvePath(ref);
  if (kind === 'da') return { text: await a.daGet(p), sheet: p.sheet };
  if (kind === 'preview' || kind === 'live') return { text: await a.rendered(kind, p), sheet: p.sheet };
  throw new Error(`unknown side "${side}": use da:, version:, preview:, live: or file:`);
}

export function compareTexts(cfg, A, B) {
  if (A.sheet || B.sheet) return compareSheets(sheetRows(A.text), sheetRows(B.text));
  return compareDocs(docSummary(A.text, cfg), docSummary(B.text, cfg));
}

if (isMain(import.meta.url)) {
  run(async () => {
    const { opts, pos } = parseArgs();
    if (pos.length !== 2) throw new Error('usage: node compare.mjs <side A> <side B>   (sides: da:<path>, version:<url>, preview:<path>, live:<path>, file:<file>)');
    const cfg = loadConfig(opts);
    const a = api(cfg, loadToken());
    const [A, B] = await Promise.all(pos.map((s) => load(a, s)));
    if (A.text === null || B.text === null) throw new Error(`${A.text === null ? pos[0] : pos[1]} doesn't exist`);
    console.log(`${pos[0]}  vs  ${pos[1]}`);
    describe(compareTexts(cfg, A, B), 'A', 'B', Number(opts.max || 20)).forEach((l) => console.log(l));
    // page metadata: only sources have the block (a rendered page has it in its <head>)
    if (!A.sheet && !B.sheet) {
      const [ma, mb] = [metadataRows(A.text), metadataRows(B.text)];
      if (ma && mb) {
        const keys = [...new Set([...Object.keys(ma), ...Object.keys(mb)])].filter((k) => ma[k] !== mb[k]);
        console.log(keys.length ? '  metadata differs:' : '  metadata: same');
        keys.forEach((k) => console.log(`    ${k}: A "${ma[k] ?? '(none)'}" | B "${mb[k] ?? '(none)'}"`));
      } else if (ma || mb) {
        const [label, rows] = ma ? ['A', ma] : ['B', mb];
        console.log(`  metadata rows in ${label} (the other side is rendered; compare them with its <head>):`);
        Object.entries(rows).forEach(([k, v]) => console.log(`    ${k}: ${v.slice(0, 100)}`));
      }
    }
  });
}
