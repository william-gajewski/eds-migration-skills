// Write a starting redirects config for a project: the site, the legacy origin(s), the fragments
// found in the bulk metadata sheet, and empty sheets/force lists to fill in.
//
// usage: node init.mjs --source https://www.legacy.example [--prefix section=https://other.example]...
//          [--out .migration/redirects.config.json] [--org o --site s] [--force]
import fs from 'node:fs';
import path from 'node:path';
import {
  UA, detectSite, isMain, normPath, parseArgs, run,
} from './lib/site.mjs';

export async function init(opts = {}, log = console.log) {
  if (!opts.source) throw new Error('usage: node init.mjs --source https://www.legacy.example [--prefix section=https://other.example]');
  const site = detectSite(opts);
  const file = opts.out || path.join(process.cwd(), '.migration', 'redirects.config.json');
  if (fs.existsSync(file) && !opts.force) throw new Error(`${file} exists; pass --force to replace it`);
  // Git Bash rewrites an argument that starts with "/" into a Windows path, and the ":" in a URL
  // into ";": "/partners=https://x" arrives as "C:\...\Git\partners=https;\x". Write the prefix
  // without its slash ("partners=https://x"), or refuse a rewritten one rather than guess.
  const prefixes = [].concat(opts.prefix || []).map((p) => {
    const eq = String(p).indexOf('=');
    const prefix = String(p).slice(0, eq);
    const origin = String(p).slice(eq + 1);
    if (eq < 1 || /^[A-Za-z]:|\\/.test(prefix) || !/^https?:\/\/[^/;\\]+/.test(origin)) {
      throw new Error(`--prefix ${p}: expected <path>=<origin>, e.g. partners=https://partners.legacy.example. In Git Bash, leave out the path's leading slash (Git Bash rewrites /partners into a Windows path).`);
    }
    return { prefix: normPath(`/${prefix.replace(/^\/+/, '')}`), origin: new URL(origin).origin };
  });
  if (!/^https?:\/\/[^/;\\]+/.test(String(opts.source))) throw new Error(`--source ${opts.source}: expected an origin such as https://www.legacy.example`);
  // nav and footer fragments named in the bulk metadata sheet
  const meta = await fetch(`${site.live}/metadata.json?limit=10000`, { headers: UA }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const fragments = [...new Set((meta?.data || []).flatMap((r) => [r.nav, r.footer, r.Nav, r.Footer])
    .filter((v) => typeof v === 'string' && v.startsWith('/')).map(normPath))].filter((f) => !['/nav', '/footer'].includes(f)).sort();
  const conf = {
    org: site.org,
    site: site.site,
    ref: site.ref,
    sources: [...prefixes, { prefix: '', origin: new URL(String(opts.source)).origin }],
    fragments,
    sheets: [],
    force: {},
    ignore: ['^/(modals|fragments)/', '^/drafts/'],
    sheet: '/redirects.json',
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(conf, null, 2)}\n`);
  log(`wrote ${file}: ${conf.sources.length} source(s), ${fragments.length} fragments from the bulk metadata (/nav and /footer are always read).`);
  log('Add fragments that blocks load (side navs, shared panels), sheets whose rows hold links, and forced rows; see the skill\'s references/config.md.');
  return conf;
}

if (isMain(import.meta.url)) run(async () => { await init(parseArgs().opts); });
