// Before previewing or publishing: do DA, preview and live agree, and who has saved the document
// in DA since it was last published? Read-only.
//
// usage: node status.mjs <path> ... [--org o --site s --ref main] [--json]
//   paths as people write them: /  /nav  /footer  /shop/  /redirects.json
import {
  api, compareDocs, compareSheets, describe, docSummary, iso, isMain, loadConfig, loadToken, pageAt, parseArgs, resolvePath, rowAt, run, sheetRows,
} from './lib/eds.mjs';

// "2026-10-27 13:14 by x", "never", or what a redirect row does to the path on that tier
function tierLine(x) {
  const row = rowAt(x);
  if (!pageAt(x)) return row ? `never (a redirect row sends the path to ${row})` : 'never';
  const when = `${iso(x.lastModified)}${x.lastModifiedBy ? ` by ${x.lastModifiedBy}` : ''}`;
  return row ? `${when}, hidden: a redirect row sends visitors to ${row}` : when;
}

export async function status(cfg, a, input) {
  const p = resolvePath(input);
  const [st, da, prev, live, versions] = await Promise.all([
    a.status(p).catch((e) => ({ error: e.message })),
    a.daGet(p),
    a.rendered('preview', p),
    a.rendered('live', p),
    a.versions(p),
  ]);
  const liveTime = pageAt(st.live) ? Date.parse(st.live.lastModified) : 0;
  const previewTime = pageAt(st.preview) ? Date.parse(st.preview.lastModified) : 0;
  const sinceLive = versions.filter((v) => v.ts > liveTime);
  const r = {
    path: p.admin,
    kind: p.sheet ? 'sheet' : 'document',
    preview: tierLine(st.preview),
    live: tierLine(st.live),
    previewNewer: previewTime > liveTime,
    savesSinceLive: sinceLive.map((v) => `${iso(v.time)} ${v.users || '?'}${v.label ? ` (${v.label})` : ''}`),
    exists: { da: da !== null, preview: prev !== null, live: live !== null },
    redirect: { preview: rowAt(st.preview), live: rowAt(st.live) },
  };
  if (da === null) {
    r.verdict = live === null ? 'not in DA and not live' : 'not in DA, but live: the document was deleted or moved in DA';
    if (r.redirect.live || r.redirect.preview) r.verdict += ` (a redirect row sends the path to ${r.redirect.live || r.redirect.preview})`;
    return r;
  }
  let daLive; let daPrev;
  if (p.sheet) {
    daLive = live !== null ? compareSheets(sheetRows(da), sheetRows(live)) : null;
    daPrev = prev !== null ? compareSheets(sheetRows(da), sheetRows(prev)) : null;
    r.previewEqualsLive = prev !== null && live !== null && compareSheets(sheetRows(prev), sheetRows(live)).same;
  } else {
    const sda = docSummary(da, cfg);
    daLive = live !== null ? compareDocs(sda, docSummary(live, cfg)) : null;
    daPrev = prev !== null ? compareDocs(sda, docSummary(prev, cfg)) : null;
    r.previewEqualsLive = prev !== null && live !== null && prev === live;
  }
  if (prev === null && live === null) delete r.previewEqualsLive; // nothing served on either
  r.daVsLive = daLive ? describe(daLive, 'DA', 'live') : ['  not live'];
  r.daVsPreview = daPrev ? describe(daPrev, 'DA', 'preview') : ['  not previewed'];
  const daIsLive = daLive?.same;
  if (live === null) r.verdict = 'not live yet: publishing creates the page';
  else if (daIsLive && r.previewEqualsLive) r.verdict = 'in sync: DA, preview and live agree';
  else if (daIsLive) r.verdict = 'DA matches live, preview differs: preview again to bring preview back in line';
  else if (daPrev?.same) r.verdict = 'DA changes are previewed, not published: publishing puts them live (review the DA vs live differences)';
  else r.verdict = `DA has changes that are not on preview or live${r.savesSinceLive.length ? ` (saved since the last publish by ${[...new Set(sinceLive.map((v) => v.users || '?'))].join(', ')})` : ''}: previewing or publishing puts them out; review them first`;
  // A row in the redirects sheet wins over a page at its path: until the row goes, nobody sees the
  // page there, however often it is previewed or published.
  if (r.redirect.live || r.redirect.preview) {
    const tiers = [r.redirect.preview && 'preview', r.redirect.live && 'live'].filter(Boolean).join(' and ');
    if (live === null) r.daVsLive = ['  not live (redirected)'];
    if (prev === null) r.daVsPreview = ['  not previewed (redirected)'];
    r.verdict = `a redirect row covers this path on ${tiers} (-> ${r.redirect.live || r.redirect.preview}): visitors are redirected and never see this page. `
      + 'Rebuild the redirects sheet (a path with a DA document loses its row) and upload it, so preview shows the page; publish the page, then the sheet straight after, then re-index the page.';
  }
  return r;
}

if (isMain(import.meta.url)) {
  run(async () => {
    const { opts, pos } = parseArgs();
    if (!pos.length) throw new Error('usage: node status.mjs <path> ... [--org o --site s] [--json]');
    const cfg = loadConfig(opts);
    const a = api(cfg, loadToken());
    const out = [];
    for (const p of pos) out.push(await status(cfg, a, p));
    if (opts.json) {
      console.log(JSON.stringify(out, null, 1));
      return;
    }
    console.log(`${cfg.org}/${cfg.site} (${cfg.ref})`);
    out.forEach((r) => {
      console.log(`\n${r.path} (${r.kind})`);
      console.log(`  preview: ${r.preview} | live: ${r.live}`);
      console.log(`  saved in DA since the last publish: ${r.savesSinceLive?.length ? r.savesSinceLive.join('; ') : 'nothing'}`);
      if (r.daVsLive) {
        console.log('  DA vs live:');
        r.daVsLive.forEach((l) => console.log(`  ${l}`));
      }
      if (r.daVsPreview && !r.previewEqualsLive) {
        console.log('  DA vs preview:');
        r.daVsPreview.forEach((l) => console.log(`  ${l}`));
      }
      if (r.previewEqualsLive !== undefined) console.log(`  preview vs live: ${r.previewEqualsLive ? 'identical' : 'different'}`);
      console.log(`  => ${r.verdict}`);
    });
  });
}
