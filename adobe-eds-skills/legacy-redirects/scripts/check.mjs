// Audit a published redirects sheet: rows that send a path to itself, rows whose destination doesn't
// load, chains (a destination that is itself a row's source), and rows that hide a published page (a
// redirect row wins over a page at the same path, so the page can't be reached).
//
// usage: node check.mjs [--config .migration/redirects.config.json] [--host live|preview]
//          [--file <sheet.json>] [--org o --site s --ref main] [--no-status]
//   --host: whose sheet, destinations and pages to check (default live)
//   --file: check a sheet that isn't published yet (build.mjs's output) against that host
//   exit code: 0 when every row is fine, 1 when one has a problem (or the check failed)
//   --no-status: skip the published-page check (it needs a DA sign-in, and takes about a minute
//   per 500 rows: the admin API allows about 10 requests a second)
import fs from 'node:fs';
import {
  UA, adminFetch, detectSite, iso, isMain, loadConf, loadToken, parseArgs, pool, run, siteFetch,
} from './lib/site.mjs';

// a row's source or destination as a path on this site, exactly as delivery matches it: decoded,
// case and trailing slash kept ("/shop" and "/shop/" are different paths); null for another site
const sitePath = (value, hosts) => {
  let u;
  try { u = new URL(String(value || ''), 'https://this.site'); } catch (e) { return null; }
  if (u.host !== 'this.site' && !hosts.has(u.host)) return null;
  try { return decodeURI(u.pathname); } catch (e) { return u.pathname; }
};

export async function check(opts = {}, log = console.log) {
  let conf = { sheet: '/redirects.json' };
  try { conf = loadConf(opts); } catch (e) { if (opts.config) throw e; }
  const site = detectSite(opts, conf);
  const host = opts.host === 'preview' ? site.preview : site.live;
  const hosts = new Set([new URL(site.live).host, new URL(site.preview).host, ...(conf.ownOrigins || []).map((o) => new URL(o).host)]);
  const token = opts['no-status'] ? null : loadToken({ optional: true });
  const tier = opts.host === 'preview' ? 'preview' : 'live';
  let rows;
  let label;
  if (opts.file) {
    rows = JSON.parse(fs.readFileSync(opts.file, 'utf8')).data || [];
    label = `${opts.file} (checked against ${tier})`;
  } else {
    const r = await siteFetch(`${host}${conf.sheet}?limit=100000`, { headers: UA });
    if (!r.ok) throw new Error(`can't read ${host}${conf.sheet}: ${r.status}`);
    rows = (await r.json()).data || [];
    label = `${host}${conf.sheet}`;
  }
  const sources = new Set(rows.map((x) => sitePath(x.Source, hosts)));
  const problems = {
    self: [], broken: [], chain: [], hides: [], unchecked: [],
  };

  await pool(rows, 6, async (row) => {
    const src = sitePath(row.Source, hosts);
    const dest = String(row.Destination || '');
    const destPath = sitePath(dest, hosts);
    if (destPath !== null && destPath === src) { problems.self.push(row); return; }
    if (destPath !== null && sources.has(destPath)) problems.chain.push(row);
    const url = destPath !== null && dest.startsWith('/') ? `${host}${dest}` : dest;
    const res = await siteFetch(url, { headers: UA }).catch(() => ({ status: 0, url }));
    if (res.status !== 200) problems.broken.push({ ...row, status: res.status, final: res.url || url });
    if (res.body?.cancel) res.body.cancel();
    if (!token) return;
    // The admin status of a path tells a page from a redirect: a page has a real source document
    // ("markup:https://content.da.live/..."); a row alone shows "markup:*". The status API also
    // lowercases and tidies the path (MixedCase -> mixedcase), so only a status for the
    // row's exact path counts: a mixed-case row next to its lowercase page hides nothing.
    const st = await adminFetch(`https://admin.hlx.page/status/${site.org}/${site.site}/${site.ref}${src === '/' ? '/index' : encodeURI(src)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!st.ok) { problems.unchecked.push({ ...row, status: st.status }); return; }
    const page = (await st.json())[tier] || {};
    const at = page.url ? decodeURI(new URL(page.url).pathname) : null;
    const real = page.status === 200 && page.sourceLocation && page.sourceLocation !== 'markup:*';
    if (real && at === src) {
      problems.hides.push({ ...row, published: iso(page.lastModified), source: page.sourceLocation });
    }
  });

  log(`${label}: ${rows.length} rows`);
  log(`- redirect to themselves (do nothing; drop them): ${problems.self.length}`);
  problems.self.forEach((x) => log(`    ${x.Source}`));
  log(`- destination doesn't load (visitors land on an error): ${problems.broken.length}`);
  problems.broken.forEach((x) => log(`    ${x.Source} -> ${x.Destination}: ${x.status}${x.final && x.final !== x.Destination ? ` at ${x.final}` : ''}`));
  log(`- chains (the destination is itself redirected by the sheet): ${problems.chain.length}`);
  problems.chain.forEach((x) => log(`    ${x.Source} -> ${x.Destination}`));
  if (token) {
    log(`- hide a ${tier === 'live' ? 'published' : 'previewed'} page (the row wins; the page can't be reached): ${problems.hides.length}`);
    problems.hides.forEach((x) => log(`    ${x.Source} (page ${tier === 'live' ? 'published' : 'previewed'} ${x.published}) -> ${x.Destination}`));
    if (problems.unchecked.length) {
      log(`- not checked for a hidden page (the admin status failed): ${problems.unchecked.length}`);
      problems.unchecked.slice(0, 10).forEach((x) => log(`    ${x.Source}: ${x.status}`));
    }
  } else log('- published pages hidden by a row: not checked (no DA sign-in, or --no-status)');
  return problems;
}

// exit code 1 when a row has a problem, so a script or CI step can stop on it
if (isMain(import.meta.url)) {
  run(async () => {
    const p = await check(parseArgs().opts);
    if (p.self.length || p.broken.length || p.chain.length || p.hides.length) process.exitCode = 1;
  });
}
