// Build the redirects sheet that keeps a partly migrated site free of 404s: every internal link that
// 404s on the new site goes to the same page on the legacy site (or to our page, when the legacy
// site itself redirects to one we have). Rows already in the sheet are re-checked, so a path that
// now has a DA document drops out.
//
// It reads links from every page in the live query index, the fragments (config "fragments", plus
// the nav and footer paths in the bulk metadata sheet) and the link columns of config "sheets",
// on live and preview.
//
// usage: node build.mjs [--config .migration/redirects.config.json] [--out <dir>]
//          [--org o --site s --ref main] [--concurrency 8]
//   writes <out>/redirects.json (DA sheet format) and <out>/report.md; changes nothing on the site.
//   Read the report, check the file (check.mjs --file), then upload that file (upload.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  UA, adminFetch, detectSite, iso, isMain, loadConf, loadToken, normPath, parseArgs, pool, run, siteFetch, stamp,
} from './lib/site.mjs';

export async function build(opts = {}, log = console.log) {
  const conf = loadConf(opts);
  const site = detectSite(opts, conf);
  const auth = { Authorization: `Bearer ${loadToken()}` };
  const conc = Number(opts.concurrency || 8);
  const out = opts.out || path.join(os.homedir(), '.legacy-redirects', `${site.org}-${site.site}`, stamp());
  fs.mkdirSync(out, { recursive: true });

  // Responses that are neither a success nor a 404 (rate limiting, server errors) mean the run saw
  // an incomplete site: stop before writing a sheet. (A sheet built from 429s once came out with 13
  // of its 466 rows.)
  const failures = [];
  const note = (res, url) => {
    if (!res.ok && res.status !== 404) failures.push(`${res.status} ${url}`);
    return res;
  };
  const getJson = async (url) => {
    const r = note(await siteFetch(url, { headers: UA }), url);
    return r.ok ? r.json() : null;
  };
  const ownHosts = new Set([new URL(site.live).host, new URL(site.preview).host, ...(conf.ownOrigins || []).map((o) => new URL(o).host)]);

  // 1. what to read: pages, fragments, sheets
  const index = await getJson(`${site.live}${conf.index || '/query-index.json'}?limit=100000`);
  if (!index) throw new Error(`can't read the live query index (${conf.index || '/query-index.json'})`);
  const meta = conf.bulkMetadata === false ? null : await getJson(`${site.live}${conf.bulkMetadata || '/metadata.json'}?limit=10000`);
  const metaFragments = (meta?.data || []).flatMap((r) => [r.nav, r.footer, r.Nav, r.Footer]).filter((v) => typeof v === 'string' && v.startsWith('/'));
  const fragments = [...new Set(['/nav', '/footer', ...metaFragments, ...conf.fragments].map(normPath))];
  const pages = [...new Set([...fragments, ...index.data.map((r) => normPath(r.path))])];

  // 2. internal links, and which documents link to them
  const from = new Map();
  const add = (p, doc) => {
    if (!from.has(p)) from.set(p, new Set());
    from.get(p).add(doc);
  };
  // absolute links to the legacy site, by the path they'd have here: imports keep them, and they
  // leave the site even once we have the page
  const legacyHosts = new Map(conf.sources.map((s) => [new URL(s.origin).host, s]));
  const legacyLinks = new Map();
  const internal = (href, doc) => {
    if (/\{\{|%7B%7B/i.test(href) || href.startsWith('//')) return; // tokens filled in the browser
    let u;
    try { u = new URL(href, site.live); } catch (e) { return; }
    if (!href.startsWith('/') && !ownHosts.has(u.host)) {
      const s = legacyHosts.get(u.host);
      if (s && !/\.(?!html?$)[a-z0-9]{2,5}$/i.test(u.pathname)) { // pages, not files
        const p = normPath(`${s.prefix || ''}${u.pathname}`);
        if (!legacyLinks.has(p)) legacyLinks.set(p, { href, docs: new Set() });
        legacyLinks.get(p).docs.add(doc);
      }
      return;
    }
    const p = normPath(u.pathname);
    if (conf.ignore.some((re) => re.test(p))) return;
    add(p, doc);
  };
  const crawl = [...pages.map((p) => [site.live, p]), ...fragments.map((p) => [site.preview, p])];
  await pool(crawl, conc, async ([host, p]) => {
    const url = `${host}${p === '/' ? '/index' : p}.plain.html`;
    const res = note(await siteFetch(url, { headers: UA }), url);
    if (!res.ok) return;
    const html = await res.text();
    [...html.matchAll(/href="([^"]+)"/g)].forEach(([, h]) => internal(h.replace(/&amp;/g, '&'), p));
  });
  // sheet link columns; a row's source column (the item's URL on the legacy site) is its destination
  const listed = new Map();
  await pool(conf.sheets.flatMap((s) => [[site.live, s], [site.preview, s]]), 4, async ([host, s]) => {
    const j = await getJson(`${host}${s.path}?limit=100000`);
    (j?.data || []).forEach((row) => {
      const link = String(row[s.linkColumn || 'Link'] || '');
      if (!link.startsWith('/') || link.startsWith('//')) return;
      const p = normPath(new URL(link, site.live).pathname);
      add(p, `sheet ${s.path}`);
      if (s.sourceColumn && row[s.sourceColumn]) listed.set(p, row[s.sourceColumn]);
    });
  });
  const targets = [...from.keys()];

  // 3. which of them 404 on live
  const statuses = await pool(targets, conc + 2, async (p) => {
    const url = `${site.live}${encodeURI(p)}`;
    const r = await siteFetch(url, { method: 'HEAD', redirect: 'manual', headers: UA });
    if (r.status === 429 || r.status >= 500) failures.push(`${r.status} ${url}`);
    return [p, r.status];
  });
  const dead = statuses.filter(([, s]) => s === 404).map(([p]) => p);
  const known = new Map(statuses);
  const legacyOurs = (await pool([...legacyLinks.keys()], conc + 2, async (p) => {
    if (!known.has(p)) known.set(p, (await siteFetch(`${site.live}${encodeURI(p)}`, { method: 'HEAD', redirect: 'manual', headers: UA })).status);
    return known.get(p) === 200 ? p : null;
  })).filter(Boolean);

  // 4. the sheet as it is: live, and DA (another batch's regenerated sheet may be waiting there)
  const live = await getJson(`${site.live}${conf.sheet}?limit=100000`);
  const currentRows = live?.data || [];
  const daRes = await fetch(`https://admin.da.live/source/${site.org}/${site.site}${conf.sheet}`, { headers: auth });
  const daRows = daRes.ok ? ((await daRes.json()).data || []) : null;
  const key = (r) => `${r.Source} -> ${r.Destination}`;
  const daDiff = daRows ? {
    onlyDa: daRows.filter((r) => !currentRows.some((c) => key(c) === key(r))).length,
    onlyLive: currentRows.filter((c) => !daRows.some((r) => key(c) === key(r))).length,
  } : null;

  if (failures.length) {
    throw new Error(`stopped: ${failures.length} requests failed (e.g. ${failures.slice(0, 3).join('; ')}). Nothing written; run again later.`);
  }

  // 5. one row per candidate path, or a reason it gets none
  const sourceOf = (p) => {
    const s = conf.sources.find((x) => !x.prefix || p === x.prefix || p.startsWith(`${x.prefix}/`));
    return { ...s, prefix: s.prefix || '', path: p.slice((s.prefix || '').length) || '/' };
  };
  // A DA answer other than 200 or 404 (401, 429, 5xx) says nothing about the document: treating it
  // as "no document" would keep a row over a page. Record it, and stop before writing.
  const daDoc = async (doc) => {
    const url = `https://admin.da.live/source/${site.org}/${site.site}${encodeURI(doc)}`;
    const { status } = await fetch(url, { method: 'HEAD', headers: auth }).catch(() => ({ status: 0 }));
    if (status !== 200 && status !== 404) failures.push(`${status} ${url}`);
    return status === 200;
  };
  const classify = async (p) => {
    if (conf.force[p]) return { Source: p, Destination: conf.force[p], why: `forced (config)${conf.forceWhy[p] ? `: ${conf.forceWhy[p]}` : ''}` };
    if (await daDoc(`${p === '/' ? '/index' : p}.html`)) return { skip: 'has a DA document', kind: 'doc' };
    if (p !== '/' && await daDoc(`${p}/index.html`)) return { Source: p, Destination: `${p}/`, why: 'folder index: served with the trailing slash' };
    const s = sourceOf(p);
    const list = listed.get(p);
    const legacyUrl = list || `${s.origin}${encodeURI(s.path)}`;
    const src = await fetch(legacyUrl, { headers: UA }).catch(() => ({ status: 0 }));
    if (src.body?.cancel) src.body.cancel();
    // rate limiting or an outage on the legacy site would drop good rows: stop instead
    if ([0, 429, 502, 503, 504].includes(src.status)) failures.push(`${src.status} ${legacyUrl}`);
    if (src.status !== 200) return { skip: `the legacy page returns ${src.status}: fix the link`, kind: 'source' };
    if (list) return { Source: p, Destination: list, why: 'listed source URL' };
    const final = new URL(src.url);
    const finalPath = normPath(final.pathname);
    if (final.origin === s.origin && finalPath !== s.path) {
      // the legacy site itself redirects: when we have that page, send visitors to ours
      const ours = await siteFetch(`${site.live}${s.prefix}${finalPath}`, { method: 'HEAD', redirect: 'manual', headers: UA });
      if (ours.status === 200) return { Source: p, Destination: `${s.prefix}${finalPath}`, why: 'the legacy site redirects to a page we have' };
    }
    const offsite = final.origin !== s.origin;
    const keep = !offsite || s.offsite === 'keep';
    return { Source: p, Destination: keep ? `${s.origin}${s.path}` : src.url, why: offsite ? `the legacy page redirects off-site${keep ? ' (kept: config offsite "keep")' : ''}` : 'legacy page' };
  };
  const candidates = [...new Set([...dead, ...currentRows.map((r) => normPath(r.Source)), ...Object.keys(conf.force)])].sort();
  const results = await pool(candidates, 6, async (p) => ({ p, ...(await classify(p)) }));
  if (failures.length) {
    throw new Error(`stopped: ${failures.length} requests failed while classifying (e.g. ${failures.slice(0, 3).join('; ')}). Nothing written; run again later.`);
  }
  const rows = results.filter((r) => r.Source).map(({ Source, Destination }) => ({ Source, Destination }));

  // 6. rows that drop out: is the page they stood for published? If not, it 404s once the sheet is.
  const before = new Map(currentRows.map((r) => [normPath(r.Source), r.Destination]));
  const after = new Set(rows.map((r) => r.Source));
  const dropped = await pool(results.filter((r) => before.has(r.p) && !after.has(r.p)), 4, async (r) => {
    let published = null;
    if (r.kind === 'doc') {
      const st = await adminFetch(`https://admin.hlx.page/status/${site.org}/${site.site}/${site.ref}${r.p === '/' ? '/index' : encodeURI(r.p)}`, { headers: auth });
      const live = st.ok ? ((await st.json()).live || {}) : null;
      // a row alone also has a live entry ("markup:*"); only a real source document is a page
      if (!live) published = `unknown (status ${st.status})`;
      else published = live.status === 200 && live.sourceLocation && live.sourceLocation !== 'markup:*' ? iso(live.lastModified) : false;
    }
    return { ...r, was: before.get(r.p), published };
  });
  const added = rows.filter((r) => !before.has(r.Source));
  const changed = rows.filter((r) => before.has(r.Source) && before.get(r.Source) !== r.Destination);
  const unpublishedLinks = results.filter((r) => r.kind === 'doc' && !before.has(r.p) && dead.includes(r.p));
  const brokenSource = results.filter((r) => r.kind === 'source');

  // 7. write the sheet and the report
  const sheetFile = path.join(out, path.basename(conf.sheet));
  fs.writeFileSync(sheetFile, `${JSON.stringify({
    total: rows.length, offset: 0, limit: rows.length, data: rows, ':type': 'sheet',
  }, null, 2)}\n`);
  const linkers = (p) => [...(from.get(p) || [])].slice(0, 3).join(', ') + ((from.get(p)?.size || 0) > 3 ? ` (+${from.get(p).size - 3})` : '');
  const md = [
    `# Redirects for ${site.org}/${site.site}: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `- Read ${pages.length} pages and fragments (${fragments.length} fragments), ${conf.sheets.length} sheets: ${targets.length} internal link targets, ${dead.length} return 404 on live.`,
    `- Sheet: **${rows.length} rows** (live has ${currentRows.length}): ${added.length} new, ${changed.length} changed, ${dropped.length} dropped. Written to \`${sheetFile}\`.`,
    daDiff && (daDiff.onlyDa || daDiff.onlyLive) ? `- **DA's ${conf.sheet} differs from live** (${daDiff.onlyDa} rows only in DA, ${daDiff.onlyLive} only live): someone's regenerated sheet may be waiting there. Uploading replaces it; find out whose it is first.` : `- DA's ${conf.sheet} has the same rows as live.`,
    '',
    '## Dropped rows: check before publishing',
    '',
    dropped.length ? '| Path | Was | Why dropped | Page published? |\n|---|---|---|---|' : 'None.',
    ...dropped.map((r) => `| ${r.p} | ${r.was} | ${r.skip || r.why} | ${r.kind === 'doc' ? (r.published ? (String(r.published).startsWith('unknown') ? r.published : `yes (${r.published})`) : '**NO: it 404s once this sheet is published; publish the page with it**') : 'n/a'} |`),
    '',
    '## New and changed rows',
    '',
    ...(added.length || changed.length ? [...added.map((r) => `- new: ${r.Source} -> ${r.Destination}`), ...changed.map((r) => `- changed: ${r.Source}: ${before.get(r.Source)} -> ${r.Destination}`)] : ['None.']),
    '',
    '## Links to pages that exist in DA but aren\'t published (they 404 until published)',
    '',
    ...(unpublishedLinks.length ? unpublishedLinks.map((r) => `- ${r.p} (linked from ${linkers(r.p)})`) : ['None.']),
    '',
    '## Links whose legacy page doesn\'t exist either (fix the link)',
    '',
    ...(brokenSource.length ? brokenSource.map((r) => `- ${r.p}: ${r.skip} (linked from ${linkers(r.p)})`) : ['None.']),
    '',
    '## Absolute links to the legacy site for pages this site has (make them relative)',
    '',
    ...(legacyOurs.length ? [
      `${legacyOurs.length} pages: each of these links leaves the site although the page is here.`,
      '',
      ...legacyOurs.slice(0, 60).map((p) => {
        const { href, docs } = legacyLinks.get(p);
        return `- ${p}: ${href} (in ${[...docs].slice(0, 3).join(', ')}${docs.size > 3 ? ` (+${docs.size - 3})` : ''})`;
      }),
      ...(legacyOurs.length > 60 ? [`- ... and ${legacyOurs.length - 60} more`] : []),
    ] : ['None.']),
    '',
  ];
  fs.writeFileSync(path.join(out, 'report.md'), md.join('\n'));
  log(md.slice(0, 5).join('\n'));
  log(`report: ${path.join(out, 'report.md')}`);

  log(`next: read the report, check the file (check.mjs --file "${sheetFile}"), then upload it (upload.mjs "${sheetFile}").`);
  if (opts.upload) log('(build doesn\'t upload: upload the reviewed file with upload.mjs)');
  return {
    rows, added, changed, dropped, dead, out, legacyOurs,
  };
}

if (isMain(import.meta.url)) run(async () => { await build(parseArgs().opts); });
