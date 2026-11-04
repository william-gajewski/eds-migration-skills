// Shared helpers for safe-publish: the site (org, site, ref), the IMS token (read from the cache
// files the sign-in tools write, never printed), the DA and admin APIs, and content summaries that
// compare a DA source document with a rendered .plain.html, or a DA sheet with a published one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --key value, --key=value and bare --flag; positional arguments are kept in order
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

// org, site and ref: --org/--site/--ref, then EDS_ORG/EDS_SITE/EDS_REF, then the project's
// .migration/project.json (previewOrg/previewSite), then fstab.yaml's DA mountpoint
export function loadConfig(opts = {}) {
  let org = opts.org || process.env.EDS_ORG;
  let site = opts.site || process.env.EDS_SITE;
  const ref = opts.ref || process.env.EDS_REF || 'main';
  if (!org || !site) {
    const pj = path.join(process.cwd(), '.migration', 'project.json');
    if (fs.existsSync(pj)) {
      const sites = Object.values(JSON.parse(fs.readFileSync(pj, 'utf8')).sites || {});
      const s = sites.find((x) => x.previewOrg && x.previewSite);
      if (s) { org = org || s.previewOrg; site = site || s.previewSite; }
    }
  }
  if (!org || !site) {
    const fstab = path.join(process.cwd(), 'fstab.yaml');
    const m = fs.existsSync(fstab) && fs.readFileSync(fstab, 'utf8').match(/content\.da\.live\/([^/\s]+)\/([^/\s]+)/);
    if (m) { org = org || m[1]; site = site || m[2]; }
  }
  if (!org || !site) throw new Error('Unknown site: pass --org and --site (or set EDS_ORG and EDS_SITE).');
  return {
    org,
    site,
    ref,
    preview: `https://${ref}--${site}--${org}.aem.page`,
    live: `https://${ref}--${site}--${org}.aem.live`,
  };
}

// The IMS token from DA_TOKEN, DA_TOKEN_FILE, ~/.aem/da-token.json (da-auth-helper) or
// .hlx/.da-token.json (aem content). Never print it.
export function loadToken() {
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
  throw new Error(`${expired ? 'The cached DA token has expired' : 'No DA token found'}. Sign in: npx github:adobe-rnd/da-auth-helper token > /dev/null (the output is the token: keep it out of the terminal).`);
}

// A path as people write it ("/", "/index", "nav", "/shop/", "redirects.json") to the document's
// DA path, its admin API path and how to fetch it rendered.
// Git Bash on Windows rewrites an argument like /nav into C:/Program Files/Git/nav (wherever Git
// is installed). Undo that, and say how to avoid it.
export function unmangle(p) {
  const m = String(p).match(/^[A-Za-z]:[\\/](?:.*[\\/])?Git[\\/](.*)$/);
  if (!m) return p;
  if (!unmangle.warned) {
    console.error('(Git Bash rewrote a /path argument; set MSYS_NO_PATHCONV=1, or write paths without the leading slash)');
    unmangle.warned = true;
  }
  return `/${m[1].replace(/\\/g, '/')}`;
}

export function resolvePath(p) {
  let x = unmangle(String(p).trim()).replace(/^\/+/, '');
  if (x === '' || x.endsWith('/')) x += 'index';
  x = x.replace(/\.(html|md|plain\.html)$/, '');
  const sheet = x.endsWith('.json');
  return {
    input: p,
    sheet,
    da: sheet ? x : `${x}.html`,
    admin: `/${x}`,
    rendered: sheet ? `/${x}` : `/${x}.plain.html`,
    web: sheet ? `/${x}` : `/${x === 'index' ? '' : x.replace(/\/index$/, '/')}`,
  };
}

export function api(cfg, token) {
  const auth = { Authorization: `Bearer ${token}` };
  const { org, site, ref } = cfg;
  const adm = (op, p) => `https://admin.hlx.page/${op}/${org}/${site}/${ref}${p.admin}`;
  const bust = () => `nocache=${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  return {
    async daGet(p) {
      const r = await fetch(`https://admin.da.live/source/${org}/${site}/${p.da}`, { headers: auth });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`DA GET ${p.da}: ${r.status}`);
      return r.text();
    },
    async daGetUrl(urlPath) {
      const r = await fetch(`https://admin.da.live${urlPath}`, { headers: auth });
      if (!r.ok) throw new Error(`DA GET ${urlPath}: ${r.status}`);
      return r.text();
    },
    async daPut(p, body) {
      const fd = new FormData();
      fd.append('data', new Blob([body], { type: p.sheet ? 'application/json' : 'text/html' }), path.basename(p.da));
      const r = await fetch(`https://admin.da.live/source/${org}/${site}/${p.da}`, { method: 'PUT', headers: auth, body: fd });
      if (!r.ok) throw new Error(`DA PUT ${p.da}: ${r.status}`);
      return r.status;
    },
    async versions(p) {
      const r = await fetch(`https://admin.da.live/versionlist/${org}/${site}/${p.da}`, { headers: auth });
      if (!r.ok) return [];
      const list = await r.json().catch(() => []);
      return (Array.isArray(list) ? list : []).map((v) => ({
        time: v.timestamp ? new Date(v.timestamp).toISOString() : null,
        ts: v.timestamp || 0,
        users: (v.users || []).map((u) => u.email).join(', '),
        label: v.label || '',
        url: v.url || '',
      })).sort((a, b) => b.ts - a.ts);
    },
    async status(p) {
      const r = await fetch(adm('status', p), { headers: auth });
      if (!r.ok) throw new Error(`status ${p.admin}: ${r.status}`);
      return r.json();
    },
    async post(op, p) {
      const r = await fetch(adm(op, p), { method: 'POST', headers: auth });
      const text = await r.text();
      return { status: r.status, ok: r.ok, text };
    },
    // null when nothing is served at the path: a 404, or a redirect (a row in the redirects sheet
    // wins over a page at its path; following it would compare the redirect's target)
    async rendered(host, p) {
      const base = host === 'live' ? cfg.live : cfg.preview;
      const url = `${base}${p.rendered}${p.sheet ? `?limit=100000&${bust()}` : `?${bust()}`}`;
      const r = await fetch(url, { cache: 'no-store', redirect: 'manual' });
      if (r.status === 404 || (r.status >= 300 && r.status < 400)) return null;
      if (!r.ok) throw new Error(`GET ${url}: ${r.status}`);
      return r.text();
    },
    async head(host, p) {
      if (p.sheet) return null;
      const base = host === 'live' ? cfg.live : cfg.preview;
      const r = await fetch(`${base}${p.web}?${bust()}`, { cache: 'no-store', redirect: 'manual' });
      if (!r.ok) return null;
      const html = await r.text();
      return (html.match(/<(title|meta|link rel="canonical")[^>]*>[^<]*/g) || [])
        .map((t) => t.replace(/aem\.(page|live)/g, 'aem.HOST').replace(/(media_[0-9a-f]+)\.[a-z]+\?[^"]*/g, '$1'))
        .sort();
    },
  };
}

// A redirects-sheet row in an admin status entry (preview or live), and whether the entry is a
// page. A row at a path with no page shows up as an entry of its own: status 200, a lastModified,
// and sourceLocation "markup:*"; only an entry with a real source document is a page.
export const rowAt = (x) => x?.configRedirectLocation || x?.redirectLocation || null;
export const pageAt = (x) => Boolean(x?.status === 200 && x.sourceLocation && x.sourceLocation !== 'markup:*');

// ---- comparing content ----

// named entities DA writes in its source; the rendered page has the characters themselves
const CODES = {
  amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, nbsp: 32, copy: 169, reg: 174, trade: 8482, ldquo: 8220, rdquo: 8221, lsquo: 8216,
  rsquo: 8217, sbquo: 8218, bdquo: 8222, mdash: 8212, ndash: 8211, hellip: 8230, bull: 8226, middot: 183, laquo: 171, raquo: 187,
  deg: 176, times: 215, divide: 247, plusmn: 177, frac12: 189, frac14: 188, frac34: 190, sup2: 178, sup3: 179, cent: 162, pound: 163,
  euro: 8364, yen: 165, sect: 167, para: 182, dagger: 8224, Dagger: 8225, prime: 8242, Prime: 8243, shy: 173, zwj: 8205, zwnj: 8204,
  eacute: 233, egrave: 232, aacute: 225, agrave: 224, iacute: 237, oacute: 243, uacute: 250, ntilde: 241, ccedil: 231, uuml: 252,
  ouml: 246, auml: 228, Eacute: 201, Ntilde: 209, iexcl: 161, iquest: 191, larr: 8592, rarr: 8594, uarr: 8593, darr: 8595, check: 10003,
};
const ENTITIES = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [k, String.fromCodePoint(v)]));
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
});
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Removes <div class="name ..."> blocks (with their nested divs): the page metadata and section
// metadata tables that DA keeps as content and the pipeline turns into <head> tags and classes.
export function stripBlocks(html, names = ['metadata', 'section-metadata']) {
  let out = html;
  names.forEach((name) => {
    const open = new RegExp(`<div class="${name}(?:\\s[^"]*)?">`, 'i');
    let m;
    while ((m = open.exec(out))) {
      let depth = 0;
      const re = /<\/?div\b[^>]*>/gi;
      re.lastIndex = m.index;
      let end = out.length;
      let t;
      while ((t = re.exec(out))) {
        depth += t[0][1] === '/' ? -1 : 1;
        if (depth === 0) { end = re.lastIndex; break; }
      }
      out = out.slice(0, m.index) + out.slice(end);
    }
  });
  return out;
}

// The page metadata block's rows (DA sources and local files only: a rendered page has them in its
// <head>): { key: value }
export function metadataRows(html) {
  const m = html.match(/<div class="metadata">[\s\S]*$/i);
  if (!m) return null;
  const block = stripBlocks(m[0], []).slice(0, m[0].length);
  const rows = {};
  [...block.matchAll(/<div>\s*<div>([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/gi)].forEach(([, k, v]) => {
    const key = stripTags(k);
    if (key) rows[key] = stripTags(v);
  });
  return rows;
}

const normHref = (h, cfg) => {
  let x = decode(h).replace(/^https:\/\/[a-z0-9-]+--[a-z0-9-]+--[a-z0-9-]+\.aem\.(page|live)/i, '');
  if (cfg) x = x.replace(new RegExp(`^https://content\\.da\\.live/${cfg.org}/${cfg.site}`), '');
  try { x = decodeURI(x); } catch (e) { /* keep as is */ }
  return x;
};

export function docSummary(html, cfg) {
  const body = stripBlocks(html.replace(/^[\s\S]*?<main[^>]*>|<\/main>[\s\S]*$/gi, ''));
  const links = [...body.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map(([, h, t]) => `${stripTags(t)} -> ${normHref(h, cfg)}`);
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(([, l, t]) => `h${l} ${stripTags(t)}`);
  const alts = [...body.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => decode((tag.match(/\balt="([^"]*)"/i) || [, ''])[1]).trim());
  // pictures, not <source>/<img> counts: the pipeline writes several sources per image
  const images = (body.match(/<picture\b/gi) || []).length || alts.length;
  const text = stripTags(body).replace(/\s+/g, '');
  return {
    links, headings, images, alts, text,
  };
}

const onlyIn = (a, b) => {
  const pool = [...b];
  return a.filter((x) => { const i = pool.indexOf(x); if (i > -1) { pool.splice(i, 1); return false; } return true; });
};

export function compareDocs(a, b) {
  const res = {
    links: { onlyA: onlyIn(a.links, b.links), onlyB: onlyIn(b.links, a.links), a: a.links.length, b: b.links.length },
    headings: { onlyA: onlyIn(a.headings, b.headings), onlyB: onlyIn(b.headings, a.headings) },
    images: { a: a.images, b: b.images },
    alts: { onlyA: onlyIn(a.alts.filter(Boolean), b.alts.filter(Boolean)), onlyB: onlyIn(b.alts.filter(Boolean), a.alts.filter(Boolean)) },
    textSame: a.text === b.text,
  };
  if (!res.textSame) {
    let i = 0;
    while (i < a.text.length && a.text[i] === b.text[i]) i += 1;
    res.textAt = { a: a.text.slice(Math.max(0, i - 30), i + 60), b: b.text.slice(Math.max(0, i - 30), i + 60) };
  }
  res.same = !res.links.onlyA.length && !res.links.onlyB.length && !res.headings.onlyA.length && !res.headings.onlyB.length
    && res.images.a === res.images.b && !res.alts.onlyA.length && !res.alts.onlyB.length && res.textSame;
  return res;
}

// rows of a sheet (DA's source JSON or a published .json), by sheet name ('data' for a single sheet)
export function sheetRows(json, name) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  if (Array.isArray(j.data)) return j.data;
  const names = j[':names'] || Object.keys(j).filter((k) => !k.startsWith(':'));
  const n = name && j[name] ? name : (names.includes('data') ? 'data' : names[0]);
  const s = j[n] || (j.data && j.data[n]);
  return (s && s.data) || [];
}

const rowKey = (r) => JSON.stringify(Object.keys(r).sort().reduce((o, k) => { o[k] = r[k]; return o; }, {}));
export function compareSheets(a, b) {
  const ka = a.map(rowKey);
  const kb = b.map(rowKey);
  const onlyA = onlyIn(ka, kb).map((k) => JSON.parse(k));
  const onlyB = onlyIn(kb, ka).map((k) => JSON.parse(k));
  return {
    a: a.length, b: b.length, onlyA, onlyB, same: !onlyA.length && !onlyB.length,
  };
}

// a few lines describing a comparison, for people
export function describe(cmp, la = 'A', lb = 'B', max = 6) {
  if (cmp.same) return ['  same content'];
  const out = [];
  if ('onlyA' in cmp) { // a sheet comparison
    out.push(`  rows: ${la} ${cmp.a}, ${lb} ${cmp.b}; ${cmp.onlyA.length} only in ${la}, ${cmp.onlyB.length} only in ${lb}`);
    cmp.onlyA.slice(0, max).forEach((r) => out.push(`    only in ${la}: ${JSON.stringify(r).slice(0, 150)}`));
    cmp.onlyB.slice(0, max).forEach((r) => out.push(`    only in ${lb}: ${JSON.stringify(r).slice(0, 150)}`));
    return out;
  }
  if (cmp.links.onlyA.length || cmp.links.onlyB.length) {
    out.push(`  links: ${la} ${cmp.links.a}, ${lb} ${cmp.links.b}`);
    cmp.links.onlyA.slice(0, max).forEach((l) => out.push(`    only in ${la}: ${l.slice(0, 140)}`));
    cmp.links.onlyB.slice(0, max).forEach((l) => out.push(`    only in ${lb}: ${l.slice(0, 140)}`));
    const more = cmp.links.onlyA.length + cmp.links.onlyB.length - Math.min(max, cmp.links.onlyA.length) - Math.min(max, cmp.links.onlyB.length);
    if (more > 0) out.push(`    ... ${more} more`);
  }
  cmp.headings.onlyA.slice(0, max).forEach((h) => out.push(`  heading only in ${la}: ${h.slice(0, 120)}`));
  cmp.headings.onlyB.slice(0, max).forEach((h) => out.push(`  heading only in ${lb}: ${h.slice(0, 120)}`));
  if (cmp.images.a !== cmp.images.b) out.push(`  images: ${la} ${cmp.images.a}, ${lb} ${cmp.images.b}`);
  cmp.alts.onlyA.slice(0, max).forEach((t) => out.push(`  image text only in ${la}: ${t.slice(0, 100)}`));
  cmp.alts.onlyB.slice(0, max).forEach((t) => out.push(`  image text only in ${lb}: ${t.slice(0, 100)}`));
  if (!cmp.textSame) out.push(`  text differs: ${la} "...${cmp.textAt.a}..." | ${lb} "...${cmp.textAt.b}..."`);
  return out;
}

// timestamps the admin API gives as HTTP dates
export const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-');

// Run a script's main: errors print as one line (no stack trace), exit code 1.
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
