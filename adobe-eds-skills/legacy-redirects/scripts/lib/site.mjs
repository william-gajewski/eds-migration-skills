// Shared helpers for legacy-redirects: the site and its redirects config, the IMS token (never
// printed), a fetch pool, and path handling.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' };

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) opts[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; } else opts[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { opts, pos };
}

// org/site/ref from --org/--site/--ref, the config file, EDS_ORG/EDS_SITE, .migration/project.json
// or fstab.yaml
export function detectSite(opts = {}, conf = {}) {
  let org = opts.org || conf.org || process.env.EDS_ORG;
  let site = opts.site || conf.site || process.env.EDS_SITE;
  const ref = opts.ref || conf.ref || process.env.EDS_REF || 'main';
  if (!org || !site) {
    const pj = path.join(process.cwd(), '.migration', 'project.json');
    if (fs.existsSync(pj)) {
      const s = Object.values(JSON.parse(fs.readFileSync(pj, 'utf8')).sites || {}).find((x) => x.previewOrg && x.previewSite);
      if (s) { org = org || s.previewOrg; site = site || s.previewSite; }
    }
  }
  if (!org || !site) {
    const fstab = path.join(process.cwd(), 'fstab.yaml');
    const m = fs.existsSync(fstab) && fs.readFileSync(fstab, 'utf8').match(/content\.da\.live\/([^/\s]+)\/([^/\s]+)/);
    if (m) { org = org || m[1]; site = site || m[2]; }
  }
  if (!org || !site) throw new Error('Unknown site: pass --org and --site, or put them in the config.');
  return {
    org, site, ref, live: `https://${ref}--${site}--${org}.aem.live`, preview: `https://${ref}--${site}--${org}.aem.page`,
  };
}

// The project's redirects config: --config, else .migration/redirects.config.json
export function loadConf(opts = {}) {
  const file = opts.config || path.join(process.cwd(), '.migration', 'redirects.config.json');
  if (!fs.existsSync(file)) throw new Error(`No redirects config at ${file}. Create one with init.mjs --source <legacy origin>, or pass --config <file>.`);
  const conf = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(conf.sources) || !conf.sources.length) throw new Error(`${file}: "sources" needs at least one { "prefix": "", "origin": "https://..." }`);
  conf.sources = [...conf.sources].sort((a, b) => (b.prefix || '').length - (a.prefix || '').length);
  conf.fragments = conf.fragments || [];
  conf.sheets = (conf.sheets || []).map((s) => (typeof s === 'string' ? { path: s } : s));
  // a forced row is "path": "destination", or "path": { "to": "destination", "why": "..." }
  const force = Object.entries(conf.force || {});
  const bad = force.filter(([, v]) => typeof (typeof v === 'string' ? v : v?.to) !== 'string');
  if (bad.length) throw new Error(`${file}: "force" needs "path": "destination" or { "to": "destination", "why": "..." } (${bad.map(([k]) => k).join(', ')})`);
  conf.forceWhy = Object.fromEntries(force.filter(([, v]) => v?.why).map(([k, v]) => [k, v.why]));
  conf.force = Object.fromEntries(force.map(([k, v]) => [k, typeof v === 'string' ? v : v.to]));
  conf.ignore = (conf.ignore || ['^/(modals|fragments)/']).map((r) => new RegExp(r));
  conf.sheet = conf.sheet || '/redirects.json';
  conf.file = file;
  return conf;
}

export function loadToken({ optional = false } = {}) {
  if (process.env.DA_TOKEN) return process.env.DA_TOKEN;
  const files = [process.env.DA_TOKEN_FILE, path.join(os.homedir(), '.aem', 'da-token.json'), path.join(process.cwd(), '.hlx', '.da-token.json')].filter(Boolean);
  let expired = false;
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const t = JSON.parse(fs.readFileSync(f, 'utf8'));
    const token = t.access_token || t.token;
    if (!token) continue;
    if (t.expires_at && t.expires_at < Date.now() + 120000) { expired = true; continue; }
    return token;
  }
  if (optional) return null;
  throw new Error(`${expired ? 'The cached DA token has expired' : 'No DA token found'}. Sign in: npx github:adobe-rnd/da-auth-helper token > /dev/null (the output is the token: keep it out of the terminal).`);
}

export const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// The admin API allows 10 requests a second per project, aem.live and aem.page 200 a second from
// one IP per host (https://www.aem.live/docs/limits); beyond that they answer 429 (the admin API
// with x-retry-after, in seconds). Space the calls out, and on a 429 wait and try again.
function limiter(rate, tries = 5) {
  let slot = 0;
  return async (url, init = {}) => {
    for (let attempt = 1; ; attempt += 1) {
      const now = Date.now();
      const at = Math.max(now, slot);
      slot = at + 1000 / rate;
      if (at > now) await sleep(at - now);
      const res = await fetch(url, init);
      if (res.status !== 429 || attempt >= tries) return res;
      if (res.body?.cancel) res.body.cancel();
      const wait = Number(res.headers.get('x-retry-after') || res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(Math.min(wait, 90) * 1000 + 250);
    }
  };
}
export const adminFetch = limiter(8);
export const siteFetch = limiter(100); // half the delivery limit: other tools may be running too

export async function pool(items, size, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// A link's path as a sheet row writes it: decoded, no .html, no trailing slash ("/" stays)
export const normPath = (p) => {
  let x = p;
  try { x = decodeURI(p); } catch (e) { /* keep as is */ }
  return x.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
};

export async function run(main) {
  try {
    await main();
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}

export const isMain = (metaUrl) => {
  const arg = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const file = decodeURIComponent(new URL(metaUrl).pathname).replace(/^\/([A-Za-z]:)/, '$1');
  return path.resolve(file) === arg;
};

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
export const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-');
