// Put a reviewed redirects sheet (build.mjs's output) in DA and preview it. Never publishes.
//
// usage: node upload.mjs <out>/redirects.json [--config .migration/redirects.config.json]
//          [--apply] [--replace-da] [--org o --site s --ref main]
//   without --apply: a dry run; says what the upload would change, writes nothing
//   exit code 2 when it refuses (see the two overrides below), 1 on an error
//   --apply: back up DA's and live's sheets, upload the file to DA, preview it, and check that
//   preview now serves exactly the file's rows
//   --allow-drops: upload although it drops more than a quarter of live's rows
//   --replace-da: upload although DA's sheet differs from live (someone's regenerated sheet may be
//   waiting there; use it once you know whose rows those are)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  UA, adminFetch, detectSite, isMain, loadConf, loadToken, parseArgs, run, siteFetch, sleep, stamp,
} from './lib/site.mjs';

// a sheet's rows, whether DA holds it as one sheet or as a workbook with one tab
const rowsOf = (j) => (Array.isArray(j?.data) ? j.data : (j?.data?.data || []));
const key = (r) => `${r.Source} -> ${r.Destination}`;

function diff(from, to) {
  const a = new Map(from.map((r) => [r.Source, r.Destination]));
  const b = new Map(to.map((r) => [r.Source, r.Destination]));
  return {
    added: to.filter((r) => !a.has(r.Source)),
    removed: from.filter((r) => !b.has(r.Source)),
    changed: to.filter((r) => a.has(r.Source) && a.get(r.Source) !== r.Destination).map((r) => ({ ...r, was: a.get(r.Source) })),
  };
}

export async function upload(file, opts = {}, log = console.log) {
  if (!file || !fs.existsSync(file)) throw new Error('usage: node upload.mjs <path to the built redirects.json> [--apply]');
  let conf = { sheet: '/redirects.json' };
  try { conf = loadConf(opts); } catch (e) { if (opts.config) throw e; }
  const site = detectSite(opts, conf);
  const auth = { Authorization: `Bearer ${loadToken()}` };
  const rows = rowsOf(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!rows.length || rows.some((r) => !r.Source || !r.Destination)) throw new Error(`${file}: expected rows with Source and Destination`);
  const dups = rows.map((r) => r.Source).filter((s, i, all) => all.indexOf(s) !== i);
  if (dups.length) throw new Error(`${file}: duplicate sources (${[...new Set(dups)].slice(0, 5).join(', ')})`);

  const daUrl = `https://admin.da.live/source/${site.org}/${site.site}${conf.sheet}`;
  const liveRes = await siteFetch(`${site.live}${conf.sheet}?limit=100000`, { headers: UA });
  if (!liveRes.ok && liveRes.status !== 404) throw new Error(`can't read live ${conf.sheet}: ${liveRes.status}`);
  const liveJson = liveRes.ok ? await liveRes.json() : { data: [] };
  const liveRows = rowsOf(liveJson);
  const daRes = await fetch(daUrl, { headers: auth });
  if (!daRes.ok && daRes.status !== 404) throw new Error(`can't read DA ${conf.sheet}: ${daRes.status}`);
  const daText = daRes.ok ? await daRes.text() : null;
  const daRows = daText ? rowsOf(JSON.parse(daText)) : [];

  const vsLive = diff(liveRows, rows);
  const daVsLive = diff(liveRows, daRows);
  const daDiffers = daText !== null && (daVsLive.added.length || daVsLive.removed.length || daVsLive.changed.length);
  log(`${file}: ${rows.length} rows; live has ${liveRows.length}, DA has ${daText === null ? 'no sheet' : daRows.length}.`);
  log(`against live: ${vsLive.added.length} new, ${vsLive.removed.length} dropped, ${vsLive.changed.length} changed.`);
  vsLive.removed.slice(0, 20).forEach((r) => log(`  dropped: ${r.Source} (was -> ${r.Destination})`));
  if (vsLive.removed.length > 20) log(`  ... and ${vsLive.removed.length - 20} more dropped`);
  if (daDiffers) {
    log(`DA's ${conf.sheet} differs from live: ${daVsLive.added.length} rows only in DA, ${daVsLive.removed.length} only live, ${daVsLive.changed.length} changed.`);
    daVsLive.added.slice(0, 5).forEach((r) => log(`  only in DA: ${key(r)}`));
    daVsLive.removed.slice(0, 5).forEach((r) => log(`  only live: ${key(r)}`));
    if (!opts['replace-da']) {
      log('Not uploading: someone\'s regenerated sheet may be waiting in DA for its pages. Find out whose it is; if it\'s your own earlier upload, or it should be replaced, run again with --replace-da.');
      return { refused: true, vsLive, daVsLive };
    }
  }
  // a sheet built from a partial crawl (rate limiting, an outage) loses most of its rows: once one
  // came out with 13 of 466. A batch drops its own pages' rows, rarely a quarter of the sheet.
  if (liveRows.length >= 20 && vsLive.removed.length > liveRows.length / 4 && !opts['allow-drops']) {
    log(`Not uploading: it drops ${vsLive.removed.length} of live's ${liveRows.length} rows. That's what a sheet built from an incomplete run looks like; rebuild it, or pass --allow-drops if the drops are meant.`);
    return { refused: true, vsLive, daVsLive };
  }
  if (!opts.apply) {
    log('Dry run: nothing written. Add --apply to upload and preview it.');
    return { dryRun: true, vsLive, daVsLive };
  }

  const backup = path.join(os.homedir(), '.legacy-redirects', `${site.org}-${site.site}`, `${stamp()}-upload`);
  fs.mkdirSync(backup, { recursive: true });
  if (daText !== null) fs.writeFileSync(path.join(backup, 'da-before.json'), daText);
  fs.writeFileSync(path.join(backup, 'live-before.json'), JSON.stringify(liveJson, null, 2));
  fs.copyFileSync(file, path.join(backup, 'uploaded.json'));

  const body = new FormData();
  const sheet = { total: rows.length, offset: 0, limit: rows.length, data: rows, ':type': 'sheet' };
  body.append('data', new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' }), path.basename(conf.sheet));
  const put = await fetch(daUrl, { method: 'POST', body, headers: auth });
  if (!put.ok) throw new Error(`DA upload failed: ${put.status} (backup in ${backup})`);
  const pv = await adminFetch(`https://admin.hlx.page/preview/${site.org}/${site.site}/${site.ref}${conf.sheet}`, { method: 'POST', headers: auth });
  if (!pv.ok) throw new Error(`uploaded to DA, but the preview failed: ${pv.status} ${pv.headers.get('x-error') || ''}`);

  // preview is served from a CDN: give it a moment, then check it serves what was uploaded
  let previewRows = [];
  for (let i = 0; i < 6; i += 1) {
    const r = await siteFetch(`${site.preview}${conf.sheet}?limit=100000&nocache=${Date.now()}`, { headers: UA });
    previewRows = r.ok ? rowsOf(await r.json()) : [];
    const d = diff(rows, previewRows);
    if (!d.added.length && !d.removed.length && !d.changed.length) break;
    await sleep(5000);
  }
  const left = diff(rows, previewRows);
  const same = !left.added.length && !left.removed.length && !left.changed.length;
  log(`uploaded to DA and previewed: ${site.preview}${conf.sheet} ${same ? `serves the ${rows.length} rows` : `differs from the file (${left.added.length} extra, ${left.removed.length} missing, ${left.changed.length} changed)`}.`);
  log(`backup: ${backup}`);
  log('Not published. Publish the pages the dropped rows stood for first, then publish the sheet (status first: DA, preview and live), then re-index those pages.');
  return {
    uploaded: true, same, vsLive, backup,
  };
}

if (isMain(import.meta.url)) {
  run(async () => {
    const { opts, pos } = parseArgs();
    const r = await upload(pos[0], opts);
    if (r.refused) process.exitCode = 2; // so `upload && publish` stops
  });
}
