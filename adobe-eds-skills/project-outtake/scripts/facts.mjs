// Gather the facts a client handover needs, each with its evidence and a status: in place, not set
// up, unknown (couldn't be checked), or info. Sources: the project repository, the live site, the
// site configuration (Config Service and Document Authoring, with a sign-in) and PageSpeed
// Insights. Read-only; never prints a token, and records access roles as counts, not emails.
//
// usage: node facts.mjs [--repo .] [--org o --site s --ref main] [--pages /,/about] [--psi 3]
//          [--no-psi] [--out <dir>]
//   writes <out>/facts.json and <out>/facts.md (default out: ./handover)
//   --psi n: lab scores for n pages (default 2: the home page and the largest section's first page),
//   mobile and desktop, with PageSpeed Insights when PSI_API_KEY is set (keyless calls share a
//   quota that is usually spent), else Lighthouse run locally with Chrome. --pages picks the pages.
//   --runs n: runs per page and device (default 3); the run with the median performance score is
//   reported, because single runs vary by several points.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' };

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) opts[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; } else opts[a.slice(2)] = true;
  }
  return opts;
}

const opts = parseArgs();
const repo = path.resolve(opts.repo || '.');
const out = path.resolve(opts.out || 'handover');
const checks = [];
const add = (area, id, label, status, value, evidence) => checks.push({
  area, id, label, status, value, evidence,
});

const exists = (p) => fs.existsSync(path.join(repo, p));
const read = (p) => { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch (e) { return ''; } };
const ls = (p) => { try { return fs.readdirSync(path.join(repo, p), { withFileTypes: true }); } catch (e) { return []; } };
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : '';
};

async function get(url, init = {}, timeout = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: ctrl.signal });
    const body = await r.text();
    return { status: r.status, ok: r.ok, headers: r.headers, body };
  } catch (e) {
    return { status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message), body: '' };
  } finally {
    clearTimeout(timer);
  }
}
const json = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };

// ---- the site ----
function siteOf() {
  let { org, site } = opts;
  const ref = opts.ref || 'main';
  const pj = read('.migration/project.json');
  if ((!org || !site) && pj) {
    try {
      const s = Object.values(JSON.parse(pj).sites || {}).find((x) => x.previewOrg && x.previewSite);
      if (s) { org = org || s.previewOrg; site = site || s.previewSite; }
    } catch (e) { /* not usable */ }
  }
  const fstab = read('fstab.yaml').match(/content\.da\.live\/([^/\s]+)\/([^/\s]+)/);
  if ((!org || !site) && fstab) { org = org || fstab[1]; site = site || fstab[2]; }
  const remote = git('remote', 'get-url', 'origin').match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
  if ((!org || !site) && remote) { org = org || remote[1].toLowerCase(); site = site || remote[2].toLowerCase(); }
  return {
    org,
    site,
    ref,
    repo: remote ? `${remote[1]}/${remote[2]}` : null,
    preview: org && site ? `https://${ref}--${site}--${org}.aem.page` : null,
    live: org && site ? `https://${ref}--${site}--${org}.aem.live` : null,
  };
}

// an IMS token from the usual caches; used for the configuration reads only, never printed
function token() {
  if (process.env.DA_TOKEN) return process.env.DA_TOKEN;
  const files = [path.join(os.homedir(), '.aem', 'da-token.json'), path.join(repo, '.hlx', '.da-token.json'), path.join(os.homedir(), '.aem', 'ims-token.json')];
  for (const f of files) {
    try {
      const t = JSON.parse(fs.readFileSync(f, 'utf8'));
      const tok = t.access_token || t.authToken || t.token;
      const exp = t.expires_at || (t.authTokenExpiry ? t.authTokenExpiry * 1000 : 0);
      if (tok && (!exp || exp > Date.now() + 60000)) return tok;
    } catch (e) { /* next */ }
  }
  return null;
}

// blocks that come from the AEM boilerplate and the AEM Block Collection
const BOILERPLATE = ['accordion', 'breadcrumbs', 'cards', 'carousel', 'columns', 'embed', 'footer', 'form', 'fragment', 'header', 'hero', 'modal', 'quote', 'search', 'table', 'tabs', 'video'];

const VENDORS = [
  ['Adobe Tags (Launch)', /assets\.adobedtm\.com|launch-[a-z0-9]+\.min\.js/i],
  ['Adobe Web SDK', /alloy|@adobe\/alloy|edge\.adobedc\.net/i],
  ['Adobe Analytics', /AppMeasurement|omtrdc/i],
  ['Adobe Target', /\bat\.js\b|adobe\.target/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm/i],
  ['Google Analytics', /google-analytics\.com|gtag\(/i],
  ['OneTrust', /cookielaw\.org|otSDKStub|optanon/i],
  ['Cookiebot', /cookiebot/i],
  ['Dynatrace', /dynatrace|ruxitagent/i],
  ['Hotjar', /hotjar/i],
];

async function main() {
  const site = siteOf();
  const tok = token();
  const facts = {
    generated: new Date().toISOString(), repo, site, checks, blocks: [], ci: [], psi: [],
  };

  // ---- Code ----
  const eds = exists('scripts/aem.js');
  add('Code', 'eds-project', 'Edge Delivery Services project (scripts/aem.js)', eds ? 'in-place' : 'unknown', eds, 'scripts/aem.js');
  if (site.repo) add('Code', 'repository', 'Code repository', 'info', `github.com/${site.repo}`, 'git remote origin');
  const branches = git('branch', '-r').split('\n').map((b) => b.trim()).filter((b) => b && !b.includes('->')).map((b) => b.replace(/^origin\//, ''));
  if (branches.length) {
    add('Code', 'branches', 'Remote branches', 'info', `${branches.length}: ${branches.slice(0, 12).join(', ')}${branches.length > 12 ? ', ...' : ''}`, 'git branch -r');
    const stage = branches.find((b) => /^(stage|staging|uat|release)$/i.test(b));
    add('Code', 'stage-branch', 'A long-lived stage or UAT branch', stage ? 'in-place' : 'not-set-up', stage || null, 'git branch -r');
  }
  // the counts below come from the checked-out branch; what's live comes from main
  const current = git('rev-parse', '--abbrev-ref', 'HEAD');
  const main = git('rev-parse', '--verify', '--quiet', `origin/${site.ref}`);
  if (current) {
    const same = main && git('rev-parse', 'HEAD') === main;
    const behind = main && !same ? git('rev-list', '--count', `HEAD..origin/${site.ref}`) : '';
    const ahead = main && !same ? git('rev-list', '--count', `origin/${site.ref}..HEAD`) : '';
    add('Code', 'branch-read', `Branch these code facts come from (live runs origin/${site.ref})`, 'info', `${current}${main ? (same ? `, same as origin/${site.ref}` : `: ${ahead} commits not on origin/${site.ref}, ${behind} on it not here`) : ''}`, 'git');
  }
  const commits = git('rev-list', '--count', 'HEAD');
  const last = git('log', '-1', '--format=%cI');
  if (commits) add('Code', 'activity', 'Commits on the current branch; last commit', 'info', `${commits}; ${last.slice(0, 10)}`, 'git log');

  // blocks: a block named like a boilerplate or Block Collection block and never changed after it
  // arrived is untouched boilerplate; anything else was built or changed for the project (commit
  // counts alone mislead: a squash-merged block has one commit)
  const blockDirs = ls('blocks').filter((d) => d.isDirectory()).map((d) => d.name).sort();
  facts.blocks = blockDirs.map((name) => {
    const log = git('log', '--format=%an', '--', `blocks/${name}`).split('\n').filter(Boolean);
    const known = BOILERPLATE.includes(name);
    return {
      name, commits: log.length, boilerplateName: known, project: !known || log.length > 1,
    };
  });
  const projectBlocks = facts.blocks.filter((b) => b.project);
  add('Code', 'blocks', 'Blocks: project-built / untouched boilerplate', 'info', `${projectBlocks.length} / ${facts.blocks.length - projectBlocks.length}`, 'blocks/ and git history per block');
  const tmplFiles = ls('styles/templates').filter((d) => d.isFile() && d.name.endsWith('.css')).map((d) => d.name.replace(/\.css$/, ''));
  const tmplDirs = ls('templates').filter((d) => d.isDirectory()).map((d) => d.name);
  const templates = [...new Set([...tmplFiles, ...tmplDirs])];
  add('Code', 'templates', 'Page templates', templates.length ? 'in-place' : 'not-set-up', templates.length ? `${templates.length}: ${templates.slice(0, 12).join(', ')}${templates.length > 12 ? ', ...' : ''}` : 'none', 'styles/templates/ or templates/');
  const icons = ls('icons').filter((d) => /\.svg$/i.test(d.name)).length;
  if (icons) add('Code', 'icons', 'SVG icons', 'info', icons, 'icons/');

  const head = read('head.html');
  const csp = /content-security-policy/i.test(head);
  add('Code', 'csp', 'Content Security Policy in head.html', csp ? 'in-place' : 'not-set-up', csp ? (head.match(/nonce/i) ? 'with nonce-based scripts' : 'set') : null, 'head.html');
  const delayed = read('scripts/delayed.js');
  const allCode = `${head}\n${delayed}\n${read('scripts/scripts.js')}`;
  const vendors = VENDORS.filter(([, re]) => re.test(allCode)).map(([l]) => l);
  add('Integrations', 'tags', 'Analytics, tag manager or consent scripts in the code', vendors.length ? 'in-place' : 'not-set-up', vendors.join(', ') || 'none found in head.html, scripts.js or delayed.js', 'head.html, scripts/scripts.js, scripts/delayed.js');
  const typekit = /typekit\.net/i.test(head + read('styles/fonts.css') + read('styles/styles.css'));
  const fontFiles = ls('fonts').filter((d) => /\.(woff2?|ttf|otf)$/i.test(d.name)).length;
  add('Code', 'fonts', 'Web fonts', 'info', [typekit && 'Adobe Fonts kit', fontFiles && `${fontFiles} font files in fonts/`].filter(Boolean).join('; ') || 'system fonts', 'head.html, styles/, fonts/');
  const rum = /sampleRUM|rum-js|helix-rum/i.test(read('scripts/aem.js'));
  add('Operations', 'telemetry', 'Operational Telemetry (sampled real-user data, formerly RUM, in aem.js)', rum ? 'in-place' : 'unknown', rum ? 'collects a sample of page views, Core Web Vitals and clicks; no cookies' : null, 'scripts/aem.js');

  // Universal Editor
  const ue = ['component-models.json', 'component-definition.json', 'component-filters.json'].filter(exists);
  const ueDir = exists('ue') || exists('models');
  add('Code', 'universal-editor', 'Universal Editor models', ue.length || ueDir ? 'in-place' : 'not-set-up', ue.join(', ') || (ueDir ? 'ue/ or models/' : 'none'), 'component-*.json, ue/, models/');
  if (/ue\/scripts\/ue\.js/.test(read('scripts/scripts.js')) && !exists('ue')) add('Code', 'ue-broken', 'scripts.js loads ue/scripts/ue.js, which is missing', 'not-set-up', 'pages fail to load in Universal Editor', 'scripts/scripts.js');

  // forms and search blocks
  const formBlocks = blockDirs.filter((b) => /form/i.test(b));
  const endpoints = [...new Set(formBlocks.flatMap((b) => [...read(`blocks/${b}/${b}.js`).matchAll(/https?:\/\/[^'"`\s)]+/g)].map((m) => { try { return new URL(m[0]).host; } catch (e) { return m[0]; } })))];
  if (formBlocks.length) add('Integrations', 'forms', 'Form blocks, and the hosts their code posts to', 'info', `${formBlocks.join(', ')}${endpoints.length ? `; hosts: ${endpoints.join(', ')}` : ''}`, 'blocks/*form*');
  const searchBlocks = blockDirs.filter((b) => /search/i.test(b));
  if (searchBlocks.length) add('Integrations', 'search', 'Search', 'in-place', `${searchBlocks.join(', ')} block`, 'blocks/*search*');

  // CI: what each workflow runs
  const wfDir = '.github/workflows';
  const workflows = ls(wfDir).filter((d) => /\.ya?ml$/i.test(d.name)).map((d) => ({ name: d.name, text: read(`${wfDir}/${d.name}`) }));
  facts.ci = workflows.map((w) => ({ file: w.name, runs: [...w.text.matchAll(/^\s*(?:-\s*)?run:\s*\|?\s*(.*)$/gim)].map((m) => m[1].trim()).filter(Boolean), uses: [...w.text.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]) }));
  const ciText = workflows.map((w) => w.text).join('\n');
  add('Quality', 'ci', 'CI workflows', workflows.length ? 'in-place' : 'not-set-up', workflows.map((w) => w.name).join(', ') || 'none', '.github/workflows/');
  add('Quality', 'ci-lint', 'Linting in CI', /lint|eslint|stylelint/i.test(ciText) ? 'in-place' : 'not-set-up', null, '.github/workflows/');
  add('Quality', 'ci-tests', 'Automated tests in CI', /\b(npm (run )?test|playwright|jest|vitest|mocha|wtr)\b/i.test(ciText) ? 'in-place' : 'not-set-up', null, '.github/workflows/');
  add('Quality', 'ci-performance', 'Performance budget (Lighthouse or PageSpeed) in CI', /lighthouse|pagespeed|\bpsi\b/i.test(ciText) ? 'in-place' : 'not-set-up', null, '.github/workflows/');
  add('Quality', 'ci-a11y', 'Accessibility checks in CI', /axe|pa11y|accessibility/i.test(ciText) ? 'in-place' : 'not-set-up', null, '.github/workflows/');
  const pkg = (() => { try { return JSON.parse(read('package.json')); } catch (e) { return {}; } })();
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const testDirs = ['test', 'tests', 'tools/tests', '__tests__', 'e2e'].filter(exists);
  const testFiles = testDirs.flatMap((d) => git('ls-files', d).split('\n').filter((f) => /\.(m?js|cjs|ts)$/.test(f)));
  const axe = /axe-core|@axe-core/.test(JSON.stringify(deps)) || testFiles.some((f) => /axe|a11y|accessib/i.test(f) || /axe-core/.test(read(f)));
  add('Quality', 'tests', 'Test scripts in the repository', testFiles.length ? 'in-place' : 'not-set-up', testFiles.length ? `${testFiles.length} files in ${testDirs.join(', ')}${axe ? ' (including axe accessibility checks)' : ''}` : 'none', testDirs.join(', ') || 'test folders');
  if (pkg.scripts) add('Code', 'npm-scripts', 'npm scripts', 'info', Object.keys(pkg.scripts).join(', '), 'package.json');
  const node = (read('.nvmrc').trim() || pkg.engines?.node || '').toString();
  if (node) add('Code', 'node', 'Node.js version', 'info', node, '.nvmrc or package.json engines');
  const tools = ls('tools').filter((d) => d.isDirectory()).map((d) => d.name);
  if (tools.length) add('Code', 'tools', 'Tooling folders under tools/', 'info', tools.join(', '), 'tools/');
  const docs = ['AGENTS.md', 'README.md', 'CLAUDE.md', 'PROJECT-LOG.md', 'BACKLOG.md', 'MIGRATION-CHECKLIST.md'].filter(exists)
    .concat(ls('project-guides').filter((d) => /\.(md|pdf)$/i.test(d.name)).map((d) => `project-guides/${d.name}`));
  if (docs.length) add('Code', 'docs', 'Project documents in the repository', 'info', docs.join(', '), 'repository root');

  // ---- the live site ----
  if (site.live) {
    const idx = await get(`${site.live}/query-index.json?limit=10000`);
    const index = json(idx);
    if (index?.data) {
      const sections = {};
      index.data.forEach((r) => { const s = `/${(r.path || '').split('/')[1] || ''}`; sections[s] = (sections[s] || 0) + 1; });
      facts.sections = Object.entries(sections).sort((a, b) => b[1] - a[1]);
      add('Content', 'pages', 'Pages published (live query index)', 'info', index.total ?? index.data.length, `${site.live}/query-index.json`);
      add('Content', 'sections', 'Largest sections', 'info', facts.sections.slice(0, 8).map(([s, n]) => `${s} (${n})`).join(', '), 'query index');
      facts.indexPaths = index.data.map((r) => r.path);
    } else add('Content', 'pages', 'Pages published (live query index)', 'unknown', null, `${site.live}/query-index.json returned ${idx.status || idx.error}`);
    const sm = await get(`${site.live}/sitemap.xml`);
    add('Operations', 'sitemap', 'Sitemap', sm.ok && /<(urlset|sitemapindex)/.test(sm.body) ? 'in-place' : 'not-set-up', sm.ok ? `${(sm.body.match(/<loc>/g) || []).length} entries` : `${sm.status}`, `${site.live}/sitemap.xml`);
    const robots = await get(`${site.live}/robots.txt`);
    if (robots.ok) add('Operations', 'robots', 'robots.txt on the live host', 'info', /Disallow:\s*\/\s*$/m.test(robots.body) ? 'disallows all crawling' : 'allows crawling', `${site.live}/robots.txt`);
    const redirects = json(await get(`${site.live}/redirects.json?limit=100000`));
    add('Operations', 'redirects', 'Redirects sheet', redirects?.data ? 'in-place' : 'not-set-up', redirects?.data ? `${redirects.total ?? redirects.data.length} rows` : null, `${site.live}/redirects.json`);
    const meta = json(await get(`${site.live}/metadata.json?limit=10000`));
    add('Content', 'bulk-metadata', 'Bulk metadata sheet', meta?.data ? 'in-place' : 'not-set-up', meta?.data ? `${meta.data.length} rows` : null, `${site.live}/metadata.json`);
    const ph = await get(`${site.live}/placeholders.json`);
    add('Content', 'placeholders', 'Placeholders sheet', ph.ok ? 'in-place' : 'not-set-up', null, `${site.live}/placeholders.json`);
    const homePage = await get(`${site.live}/`, { redirect: 'manual' });
    const hdr = (k) => homePage.headers?.get(k);
    if (homePage.status) add('Operations', 'live-headers', 'Live home page response', 'info', `${homePage.status}; cache-control: ${hdr('cache-control') || '-'}; x-robots-tag: ${hdr('x-robots-tag') || '-'}`, `${site.live}/`);
  }

  // ---- configuration (needs a sign-in) ----
  if (site.org && site.site) {
    if (tok) {
      const tryConf = async (url) => {
        let r = await get(url, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.status === 401) r = await get(url, { headers: { 'x-auth-token': tok } });
        return r;
      };
      const conf = await tryConf(`https://admin.hlx.page/config/${site.org}/sites/${site.site}.json`);
      const c = json(conf);
      if (conf.ok && c) {
        add('Site', 'content-source', 'Content source', 'info', `${c.content?.source?.type || '?'}: ${c.content?.source?.url || '?'}`, 'Config Service site config');
        add('Site', 'code-source', 'Code source', 'info', `${c.code?.owner}/${c.code?.repo}`, 'Config Service site config');
        const prodHost = c.cdn?.prod?.host || c.cdn?.host;
        add('Operations', 'cdn', 'Production CDN and domain', prodHost ? 'in-place' : 'not-set-up', prodHost ? `${c.cdn?.prod?.type || 'CDN'}: ${prodHost}` : 'none configured: the aem.live host is the production site', 'Config Service site config (cdn)');
        const roles = c.access?.admin?.role || c.access?.site?.role || c.access?.role || null;
        if (roles) add('Site', 'roles', 'Access roles (people per role)', 'info', Object.entries(roles).map(([r, list]) => `${r}: ${Array.isArray(list) ? list.length : 1}`).join(', '), 'Config Service site config (access)');
        else add('Site', 'roles', 'Access roles', 'unknown', 'not in the site config', 'Config Service site config');
        if (c.access?.site?.allow || c.access?.preview?.allow) add('Site', 'protected', 'Preview or live protected by sign-in', 'in-place', null, 'Config Service site config (access)');
      } else add('Site', 'config', 'Site configuration (Config Service)', 'unknown', `couldn't read it (${conf.status || conf.error})`, `admin.hlx.page/config/${site.org}/sites/${site.site}.json`);
      const da = await get(`https://admin.da.live/config/${site.org}/${site.site}/`, { headers: { Authorization: `Bearer ${tok}` } });
      const dj = json(da);
      if (da.ok && dj) {
        const rows = JSON.stringify(dj);
        const assets = /aem\.repositoryId|aem\.assets|"aem\.[a-z.]*"/i.test(rows);
        add('Integrations', 'dam', 'AEM Assets connected to Document Authoring', assets ? 'in-place' : 'not-set-up', assets ? 'AEM Assets settings in the DA site config' : 'images are uploaded into Document Authoring', 'DA site config');
        const library = /library/i.test(rows);
        add('Content', 'library', 'Block library for authors (DA Library panel)', library ? 'in-place' : 'not-set-up', null, 'DA site config');
      } else add('Integrations', 'dam', 'AEM Assets connected to Document Authoring', 'unknown', `couldn't read the DA config (${da.status || da.error})`, `admin.da.live/config/${site.org}/${site.site}/`);
    } else add('Site', 'config', 'Site configuration', 'unknown', 'no sign-in token found: content source, CDN, roles and DAM not checked', 'Config Service, DA config');
  }

  // ---- PageSpeed Insights ----
  if (site.live && !opts['no-psi']) {
    let pages = opts.pages ? String(opts.pages).split(',') : ['/'];
    if (!opts.pages && facts.indexPaths) {
      const n = Number(opts.psi || 2);
      const bySection = {};
      facts.indexPaths.forEach((p) => { const s = p.split('/')[1]; if (s && !bySection[s] && !/^(drafts|fragments|modals|docs|nav|footer)$/.test(s)) bySection[s] = p; });
      const order = (facts.sections || []).map(([s]) => s.slice(1)).filter((s) => bySection[s]);
      pages = ['/', ...order.slice(0, Math.max(0, n - 1)).map((s) => bySection[s])];
    }
    // PageSpeed Insights with an API key (keyless calls share one daily quota that is usually
    // spent), else Lighthouse run locally with Chrome: the same engine and simulated throttling
    const key = process.env.PSI_API_KEY;
    const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => p && fs.existsSync(p));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'facts-lh-'));
    const measure = async (url, strategy) => {
      if (key) {
        const r = await get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo&key=${key}`, {}, 120000);
        const j = json(r);
        return j?.lighthouseResult ? { lh: j.lighthouseResult, source: 'PageSpeed Insights', field: Boolean(j.loadingExperience?.metrics) } : { error: j?.error?.message || r.error || r.status };
      }
      if (!chrome) return { error: 'no PSI_API_KEY and no Chrome found (set CHROME_PATH)' };
      const file = path.join(tmp, `${strategy}-${Date.now()}.json`);
      const args = ['-y', 'lighthouse@12', url, '--quiet', '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new', '--only-categories=performance,accessibility,best-practices,seo', ...(strategy === 'desktop' ? ['--preset=desktop'] : [])];
      // Windows runs npx through cmd.exe: pass one quoted command line rather than an argument list
      const win = process.platform === 'win32';
      const run = { env: { ...process.env, CHROME_PATH: chrome }, encoding: 'utf8', timeout: 240000 };
      if (win) spawnSync(['npx', ...args].map((a) => (/[\s&|<>^"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)).join(' '), { ...run, shell: true });
      else spawnSync('npx', args, run);
      try { return { lh: JSON.parse(fs.readFileSync(file, 'utf8')), source: 'Lighthouse (local)', field: null }; } catch (e) { return { error: 'Lighthouse produced no report' }; }
    };
    const runs = Math.max(1, Number(opts.runs || 3));
    for (const p of pages) {
      for (const strategy of ['mobile', 'desktop']) {
        const all = [];
        for (let i = 0; i < runs; i += 1) all.push(await measure(`${site.live}${p}`, strategy));
        const good = all.filter((x) => x.lh).sort((a, b) => (a.lh.categories.performance?.score ?? 0) - (b.lh.categories.performance?.score ?? 0));
        const m = good.length ? good[Math.floor((good.length - 1) / 2)] : all[0];
        if (!m.lh) { facts.psi.push({ page: p, strategy, error: m.error }); continue; }
        m.range = good.map((x) => Math.round((x.lh.categories.performance?.score ?? 0) * 100));
        const { lh } = m;
        const score = (k) => Math.round((lh.categories?.[k]?.score ?? 0) * 100);
        const audit = (k) => lh.audits?.[k]?.displayValue || '';
        // what pulled each category down: its weighted audits that didn't pass
        const failing = Object.fromEntries(Object.entries(lh.categories || {}).map(([k, c]) => [k, (c.auditRefs || [])
          .filter((a) => a.weight > 0 && lh.audits[a.id]?.score !== null && lh.audits[a.id]?.score < 0.9)
          .sort((a, b) => b.weight - a.weight).slice(0, 4).map((a) => `${lh.audits[a.id].title}${lh.audits[a.id].displayValue ? ` (${lh.audits[a.id].displayValue})` : ''}`)]));
        facts.psi.push({
          page: p, strategy, source: m.source, version: lh.lighthouseVersion, runs: m.range, performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo'), lcp: audit('largest-contentful-paint'), cls: audit('cumulative-layout-shift'), tbt: audit('total-blocking-time'), field: m.field, failing,
        });
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    const okPsi = facts.psi.filter((x) => x.performance !== undefined);
    add('Quality', 'psi', `Lab scores, live host (${okPsi[0]?.source || 'not measured'}${okPsi[0]?.version ? ` ${okPsi[0].version}` : ''}): performance/accessibility/best practices/SEO`, okPsi.length ? 'info' : 'unknown', okPsi.length ? okPsi.map((x) => `${x.page} ${x.strategy}: ${x.performance}/${x.accessibility}/${x.bestPractices}/${x.seo}`).join('; ') : [...new Set(facts.psi.map((x) => x.error))].join('; '), 'see the table below');
    const field = okPsi.filter((x) => x.field !== null);
    add('Quality', 'field-data', 'Field data from real Chrome users (CrUX) for these URLs', field.some((x) => x.field) ? 'in-place' : 'unknown', field.length ? (field.some((x) => x.field) ? 'available' : 'none: not enough real traffic on this host') : 'only PageSpeed Insights reports it (set PSI_API_KEY)', 'PageSpeed Insights loadingExperience');
  }

  // ---- write ----
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'facts.json'), JSON.stringify(facts, null, 1));
  const label = { 'in-place': 'In place', 'not-set-up': 'Not set up', unknown: 'Unknown', info: '' };
  const areas = [...new Set(checks.map((c) => c.area))];
  const md = [`# Handover facts: ${site.org || '?'}/${site.site || '?'}, ${facts.generated.slice(0, 16).replace('T', ' ')} UTC`, '',
    `Repository ${repo}${site.live ? `; live ${site.live}` : ''}. Statuses: In place (seen), Not set up (looked for, not there), Unknown (couldn't check).`, ''];
  areas.forEach((a) => {
    md.push(`## ${a}`, '', '| Check | Status | Value | Evidence |', '|:------------------------|:-----------|:------------------------------|:------------------|');
    checks.filter((c) => c.area === a).forEach((c) => md.push(`| ${c.label} | ${label[c.status]} | ${String(c.value ?? '').replace(/\|/g, '/')} | ${c.evidence} |`));
    md.push('');
  });
  if (facts.psi.length) {
    md.push('## Lab scores', '', 'The median run of each page and device; "Runs" lists the performance score of every run.', '', '| Page | Device | Performance | Runs | Accessibility | Best practices | SEO | LCP | CLS | TBT |', '|:------|:------|----:|:------|----:|----:|----:|:----|:----|:----|');
    facts.psi.forEach((x) => md.push(x.error ? `| ${x.page} | ${x.strategy} | ${x.error} | | | | | | | |` : `| ${x.page} | ${x.strategy} | ${x.performance} | ${(x.runs || []).join(', ')} | ${x.accessibility} | ${x.bestPractices} | ${x.seo} | ${x.lcp} | ${x.cls} | ${x.tbt} |`));
    md.push('', 'Audits that held the scores down:', '');
    facts.psi.filter((x) => x.failing).forEach((x) => Object.entries(x.failing).filter(([, a]) => a.length).forEach(([k, a]) => md.push(`- ${x.page} ${x.strategy}, ${k}: ${a.join('; ')}`)));
    md.push('');
  }
  if (facts.ci.length) {
    md.push('## CI steps', '');
    facts.ci.forEach((w) => md.push(`- ${w.file}: runs ${w.runs.join('; ') || '-'}${w.uses.length ? `; uses ${w.uses.join(', ')}` : ''}`));
    md.push('');
  }
  md.push('## Blocks', '', `Project-built: ${projectBlocks.map((b) => b.name).join(', ') || 'none'}.`, '', `Untouched boilerplate: ${facts.blocks.filter((b) => !b.project).map((b) => b.name).join(', ') || 'none'}.`, '');
  fs.writeFileSync(path.join(out, 'facts.md'), md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nwritten: ${path.join(out, 'facts.md')} and facts.json`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
