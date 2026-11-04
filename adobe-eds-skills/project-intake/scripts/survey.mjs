// A light survey of a client's current site(s), to ground a work plan: how many pages there are and
// in which sections (from the sitemaps), what the site runs on, and which features need planning
// (forms, search, logins, regional or personalized content, pages rendered in the browser, PDFs,
// languages, tag managers and consent tools), read from a sample of pages. Read-only: robots.txt,
// the sitemaps and a few dozen pages per site, a few requests at a time.
//
// usage: node survey.mjs <url> [<url> ...] [--out <dir>] [--sample 24] [--max-urls 50000]
//   writes <out>/survey.json and <out>/survey.md (default out: ./intake-survey)
//   It reads the HTML the server sends and runs no JavaScript: content a page builds in the
//   browser isn't seen, and such pages are flagged.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const NOT_PAGES = /\.(pdf|jpe?g|png|gif|svg|webp|ico|mp4|mov|zip|docx?|xlsx?|pptx?|csv|txt|xml|json|ics|css|js|map|woff2?|ttf|otf|eot|webmanifest)$/i;

function parseArgs(argv = process.argv.slice(2)) {
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

async function get(url, { method = 'GET', timeout = 20000, binary = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, headers: UA, redirect: 'follow', signal: ctrl.signal });
    let body = null;
    if (method !== 'HEAD') {
      const buf = Buffer.from(await r.arrayBuffer());
      const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf; // .xml.gz sitemaps
      body = binary ? raw : raw.toString('utf8');
    }
    return {
      status: r.status, url: r.url, type: r.headers.get('content-type') || '', body, ms: Date.now() - t0,
    };
  } catch (e) {
    return { status: 0, url, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message), ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, size, fn) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// robots.txt: its sitemaps, and the Disallow rules that apply to every crawler
function parseRobots(text = '') {
  const sitemaps = [];
  const disallow = [];
  let applies = false;
  text.split(/\r?\n/).forEach((line) => {
    const m = line.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const [, key, value] = m;
    const k = key.toLowerCase();
    if (k === 'sitemap') sitemaps.push(value);
    else if (k === 'user-agent') applies = value === '*';
    else if (k === 'disallow' && applies && value) disallow.push(value);
  });
  return { sitemaps, disallow };
}

const locs = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<loc>\\s*([^<\\s]+)\\s*</loc>`, 'gi'))].map((m) => m[1].replace(/&amp;/g, '&'));

// the registrable part of a host, near enough: the last two labels (three for co.uk-style names)
const baseDomain = (host) => {
  const p = host.split('.');
  return p.slice(p.length > 2 && p[p.length - 2].length <= 3 && p[p.length - 1].length === 2 ? -3 : -2).join('.');
};

// what to look for in a page's HTML: [label, pattern]
const SIGNALS = {
  platform: [
    ['Adobe Experience Manager (Sites)', /\/etc\.clientlibs\/|\/content\/dam\/|data-cmp-|\/libs\/granite\//i],
    ['AEM Edge Delivery Services', /\/scripts\/aem\.js|\.aem\.(live|page)|\.hlx\.(live|page)/i],
    ['Sitecore', /\/-\/media\/|sitecore/i],
    ['Drupal', /drupal-settings-json|Drupal\.settings|\/sites\/default\/files\//i],
    ['WordPress', /\/wp-content\/|\/wp-includes\//i],
    ['Adobe Commerce (Magento)', /Magento_|mage\/cookies/i],
    ['Shopify', /cdn\.shopify\.com/i],
    ['Salesforce Experience Cloud', /\/s\/sfsites\/|\.force\.com/i],
    ['HubSpot CMS', /\.hs-sites\.com|hubspot\.net\/hub\//i],
    ['Contentful', /ctfassets\.net/i],
    ['Optimizely CMS (Episerver)', /episerver|optimizely\.cms/i],
  ],
  framework: [
    ['Angular', /ng-version=|<app-root[\s>]|_ngcontent-|mat-app-background|\bng-app\b/i],
    ['Next.js', /__NEXT_DATA__|\/_next\/static\//i],
    ['Nuxt / Vue', /__NUXT__|data-v-[0-9a-f]{8}/i],
    ['React', /data-reactroot|react-dom(\.production)?(\.min)?\.js/i],
    ['jQuery', /jquery[.-]?[\d.]*(\.min)?\.js/i],
  ],
  tags: [
    ['Adobe Tags (Launch)', /assets\.adobedtm\.com/i],
    ['Google Tag Manager', /googletagmanager\.com\/gtm/i],
    ['Adobe Analytics (AppMeasurement)', /AppMeasurement|s_code\.js|omtrdc\.net/i],
    ['Adobe Web SDK', /alloy(\.min)?\.js|__alloyNS/i],
    ['Adobe Target', /\bat\.js\b|adobe\.target|mboxCreate/i],
    ['Google Analytics', /google-analytics\.com|gtag\(\s*['"]config/i],
    ['Meta Pixel', /connect\.facebook\.net/i],
    ['Hotjar', /static\.hotjar\.com/i],
    ['Quantum Metric', /quantummetric/i],
    ['Dynatrace', /ruxitagent|dynatrace/i],
    ['New Relic', /js-agent\.newrelic|NREUM/i],
  ],
  consent: [
    ['OneTrust', /cdn\.cookielaw\.org|otSDKStub|optanon/i],
    ['Cookiebot', /consent\.cookiebot/i],
    ['TrustArc', /trustarc|consent\.truste/i],
    ['Osano', /cmp\.osano/i],
  ],
  search: [
    ['Lucidworks Fusion', /lucidworks/i],
    ['Coveo', /coveo/i],
    ['Algolia', /algolia/i],
    ['Google Programmable Search', /cse\.google\.com/i],
    ['Yext', /yextapis|yext\.com/i],
    ['Bloomreach', /bloomreach|brcdn\.com/i],
    ['Elastic / Swiftype', /swiftype|elastic-cloud/i],
  ],
  chat: [
    ['LivePerson', /liveperson|lpcdn\.lpsnmedia/i],
    ['Salesforce chat', /embeddedservice|salesforceliveagent/i],
    ['Genesys', /genesys/i],
    ['Drift', /js\.driftt\.com/i],
    ['Intercom', /widget\.intercom\.io/i],
    ['Zendesk', /zdassets\.com|zopim/i],
  ],
  video: [
    ['YouTube', /youtube(-nocookie)?\.com\/(embed|iframe_api)/i],
    ['Vimeo', /player\.vimeo\.com/i],
    ['Brightcove', /brightcove/i],
    ['Kaltura', /kaltura/i],
    ['Vidyard', /vidyard/i],
    ['Wistia', /wistia/i],
  ],
  fonts: [
    ['Adobe Fonts', /use\.typekit\.net|p\.typekit\.net/i],
    ['Google Fonts', /fonts\.googleapis\.com/i],
  ],
  captcha: [
    ['reCAPTCHA', /recaptcha/i],
    ['hCaptcha', /hcaptcha/i],
  ],
  maps: [
    ['Google Maps', /maps\.googleapis\.com|google\.com\/maps\/embed/i],
  ],
};

const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();

function inspect(html, pageUrl, base) {
  const out = { signals: {} };
  Object.entries(SIGNALS).forEach(([group, list]) => {
    out.signals[group] = list.filter(([, re]) => re.test(html)).map(([label]) => label);
  });
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(([, attrs, inner]) => {
    const action = (attrs.match(/\baction\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    const isSearch = /type\s*=\s*["']search["']|role\s*=\s*["']search["']|\/search|\bsearch\b/i.test(attrs + action) || /type\s*=\s*["']search["']/i.test(inner);
    const fields = (inner.match(/<(input|select|textarea)\b/gi) || []).length;
    return { action, isSearch, fields };
  });
  out.forms = forms.filter((f) => !f.isSearch && f.fields > 1).map((f) => f.action || '(no action: submitted by script)');
  out.searchForm = forms.some((f) => f.isSearch) || /<input[^>]+type\s*=\s*["']search["']/i.test(html);
  const hrefs = [...html.matchAll(/\bhref\s*=\s*["']([^"'#]+)["']/gi)].map(([, h]) => h.replace(/&amp;/g, '&'));
  const abs = hrefs.map((h) => { try { return new URL(h, pageUrl); } catch (e) { return null; } }).filter(Boolean);
  out.pdfLinks = abs.filter((u) => /\.pdf$/i.test(u.pathname)).length;
  out.loginLinks = [...new Set(abs.filter((u) => /(^|\/|-)(log-?in|sign-?in|signin|logon|my-?account|member-?portal)(\/|$|\.|-)/i.test(u.pathname) || /^(login|signin|auth|sso|portal|my|members?)\./i.test(u.host)).map((u) => `${u.host}${u.pathname}`.slice(0, 80)))].slice(0, 5);
  out.relatedHosts = [...new Set(abs.filter((u) => u.host !== new URL(pageUrl).host && baseDomain(u.host) === base).map((u) => u.host))];
  out.externalHosts = [...new Set(abs.filter((u) => /^https?:$/.test(u.protocol) && baseDomain(u.host) !== base).map((u) => u.host))].length;
  out.iframes = [...new Set([...html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(([, s]) => { try { return new URL(s, pageUrl).host; } catch (e) { return s; } }))];
  out.hreflang = [...new Set([...html.matchAll(/hreflang\s*=\s*["']([^"']+)["']/gi)].map(([, l]) => l))];
  out.lang = (html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  out.generator = (html.match(/<meta[^>]+name\s*=\s*["']generator["'][^>]+content\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  out.noindex = /<meta[^>]+name\s*=\s*["']robots["'][^>]+noindex/i.test(html);
  // regional or personalized content: a ZIP, postal code, county or region chooser in the page
  out.regional = /zip\s?code|postal code|enter (your )?zip|select (your )?(state|region|county)|change (your )?(location|area|region)|name\s*=\s*["'](zip|zipcode|postal)/i.test(html);
  const main = (html.match(/<main\b[\s\S]*?<\/main>/i) || [html.match(/<body\b[\s\S]*<\/body>/i)?.[0] || html])[0];
  const words = text(main);
  out.textChars = words.length;
  out.textKey = `${words.length}:${words.slice(0, 200)}:${words.slice(-200)}`;
  out.scripts = (html.match(/<script\b/gi) || []).length;
  // little server-sent text but many scripts: the page builds its content in the browser
  out.clientRendered = out.textChars < 300 && out.scripts >= 5;
  out.htmlKB = Math.round(Buffer.byteLength(html) / 1024);
  return out;
}

async function surveySite(input, { sample = 24, maxUrls = 50000 } = {}) {
  const start = new URL(/^https?:\/\//.test(input) ? input : `https://${input}`);
  const home = await get(start.href);
  const origin = home.status ? new URL(home.url).origin : start.origin;
  const site = {
    input, origin, homeStatus: home.status, homeError: home.error || null, notes: [],
  };
  if (!home.status) {
    site.notes.push(`The site didn't answer (${home.error}). Nothing else was read.`);
    return site;
  }
  if (home.url !== start.href) site.notes.push(`${start.href} redirects to ${home.url}.`);
  const head = await get(origin, { method: 'HEAD' });
  if (head.status && head.status !== home.status) site.notes.push(`HEAD gets ${head.status} where GET gets ${home.status}: tools must use GET (a firewall or CDN rule).`);

  // sitemaps
  const robots = await get(`${origin}/robots.txt`);
  const rules = parseRobots(robots.status === 200 ? robots.body : '');
  site.robots = { status: robots.status, sitemaps: rules.sitemaps, disallow: rules.disallow.slice(0, 20) };
  const queue = [...new Set([...rules.sitemaps, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])];
  const seen = new Set();
  const urls = new Set();
  const read = [];
  while (queue.length && seen.size < 200 && urls.size < maxUrls) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await get(sm, { timeout: 45000 });
    if (r.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(r.body || '')) continue;
    if (/<sitemapindex\b/i.test(r.body)) locs(r.body, 'sitemap').forEach((u) => { if (!seen.has(u)) queue.push(u); });
    const found = locs(r.body, 'url');
    found.slice(0, maxUrls - urls.size).forEach((u) => urls.add(u));
    read.push({ url: sm, urls: found.length });
  }
  site.sitemaps = read;
  site.sitemapCapped = urls.size >= maxUrls;

  // no sitemap: count what the homepage links to, as a floor
  let list = [...urls];
  site.countSource = 'sitemaps';
  if (!list.length) {
    site.countSource = 'homepage links (no sitemap found): a floor, not a count';
    list = [...new Set([...(home.body || '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)]
      .map(([, h]) => { try { return new URL(h.replace(/&amp;/g, '&'), home.url); } catch (e) { return null; } })
      .filter((u) => u && u.origin === origin).map((u) => u.href))];
  }

  // pages by host and section
  const hosts = {};
  const sections = {};
  let pdfs = 0;
  list.forEach((href) => {
    let u;
    try { u = new URL(href); } catch (e) { return; }
    hosts[u.host] = (hosts[u.host] || 0) + 1;
    if (NOT_PAGES.test(u.pathname)) { if (/\.pdf$/i.test(u.pathname)) pdfs += 1; return; }
    if (u.origin !== origin) return;
    const segs = u.pathname.replace(/\.html?$/i, '').split('/').filter(Boolean);
    const sec = segs.length ? `/${segs[0]}` : '/';
    sections[sec] = sections[sec] || { pages: 0, sub: {}, urls: [] };
    sections[sec].pages += 1;
    if (sections[sec].urls.length < 400) sections[sec].urls.push(u.href);
    if (segs.length > 1) sections[sec].sub[`/${segs[0]}/${segs[1]}`] = (sections[sec].sub[`/${segs[0]}/${segs[1]}`] || 0) + 1;
  });
  const sectionRows = Object.entries(sections).sort((a, b) => b[1].pages - a[1].pages);
  site.pages = sectionRows.reduce((n, [, s]) => n + s.pages, 0);
  site.pdfsInSitemap = pdfs;
  site.otherHostsInSitemap = Object.fromEntries(Object.entries(hosts).filter(([h]) => h !== new URL(origin).host));
  site.sections = sectionRows.map(([name, s]) => ({
    name, pages: s.pages, top: Object.entries(s.sub).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} (${n})`),
  }));

  // a sample of pages, spread over the sections (largest first), skipping what robots.txt disallows
  const allowed = (href) => { const p = new URL(href).pathname; return !rules.disallow.some((d) => d !== '/' && p.startsWith(d.replace(/\*.*$/, ''))); };
  const picks = [home.url];
  const perSection = sectionRows.map(([name, s]) => [name, s.urls.filter(allowed)]);
  for (let round = 0; picks.length < sample && round < 50; round += 1) {
    let added = false;
    perSection.forEach(([, arr]) => {
      if (picks.length >= sample || round >= arr.length) return;
      const step = Math.max(1, Math.floor(arr.length / Math.ceil(sample / Math.max(1, perSection.length))));
      const href = arr[(round * step) % arr.length];
      if (!picks.includes(href)) { picks.push(href); added = true; }
    });
    if (!added) break;
  }
  const base = baseDomain(new URL(origin).host);
  const pages = await pool(picks, 4, async (href) => {
    const r = href === home.url ? home : await get(href);
    const page = { url: href, status: r.status, finalUrl: r.url, ms: r.ms };
    if (r.status === 200 && /html/i.test(r.type || 'text/html') && r.body) Object.assign(page, inspect(r.body, r.url, base));
    else page.error = r.error || `${r.status} ${r.type || ''}`.trim();
    return page;
  });
  site.sample = pages;

  // roll the sample up: for each feature, the pages it was found on
  const ok = pages.filter((p) => p.signals);
  // Different URLs with the same text: one HTML shell whose content is built in the browser (a
  // single-page app), or a "not found" page served with status 200.
  const byText = {};
  ok.forEach((p) => {
    const key = new URL(p.finalUrl).pathname.replace(/\.html?$/i, '').replace(/\/$/, '') || '/';
    (byText[p.textKey] = byText[p.textKey] || new Set()).add(key);
  });
  // Same text with an app framework, or almost no text: a shell. Same text with real content:
  // the same page published at several URLs (duplicates worth consolidating).
  const app = (p) => (p.signals.framework || []).some((f) => /Angular|Nuxt|React/.test(f));
  ok.forEach((p) => {
    const same = byText[p.textKey].size > 1;
    if (same && (app(p) || p.textChars < 300)) { p.sameShell = true; p.clientRendered = true; } else if (same) p.duplicate = true;
    p.group = same ? [...byText[p.textKey]].join(', ') : null;
    delete p.textKey;
  });
  const groups = (flag) => [...new Set(ok.filter((p) => p[flag]).map((p) => p.group))];
  if (groups('sameShell').length) site.notes.push(`${ok.filter((p) => p.sameShell).length} sampled pages send the same HTML shell as another URL (${groups('sameShell').map((g) => g.split(', ').slice(0, 3).join(', ')).join('; ')}): content built in the browser, or a "not found" page sent with status 200. Open them in a browser.`);
  if (groups('duplicate').length) site.notes.push(`${ok.filter((p) => p.duplicate).length} sampled pages have exactly the same content as another URL (${groups('duplicate').map((g) => g.split(', ').slice(0, 3).join(', ')).join('; ')}): the same page published several times, worth one page (and redirects) on the new site.`);
  site.sampled = { requested: picks.length, read: ok.length };
  const tally = {};
  ok.forEach((p) => Object.entries(p.signals).forEach(([g, labels]) => labels.forEach((l) => {
    tally[g] = tally[g] || {};
    tally[g][l] = (tally[g][l] || 0) + 1;
  })));
  site.signals = Object.fromEntries(Object.entries(tally).map(([g, m]) => [g, Object.entries(m).sort((a, b) => b[1] - a[1])]));
  const count = (f) => ok.filter(f).length;
  const actions = {};
  ok.forEach((p) => p.forms.forEach((a) => { actions[a] = (actions[a] || 0) + 1; }));
  const related = {};
  ok.forEach((p) => p.relatedHosts.forEach((h) => { related[h] = (related[h] || 0) + 1; }));
  site.features = {
    forms: { pages: count((p) => p.forms.length), actions: Object.entries(actions).sort((a, b) => b[1] - a[1]).slice(0, 8) },
    search: { pages: count((p) => p.searchForm), vendors: site.signals.search || [] },
    logins: { pages: count((p) => p.loginLinks.length), examples: [...new Set(ok.flatMap((p) => p.loginLinks))].slice(0, 6) },
    regional: { pages: count((p) => p.regional) },
    clientRendered: { pages: count((p) => p.clientRendered), urls: ok.filter((p) => p.clientRendered).map((p) => p.url).slice(0, 6) },
    pdfLinks: { pages: count((p) => p.pdfLinks), links: ok.reduce((n, p) => n + p.pdfLinks, 0) },
    languages: { htmlLang: [...new Set(ok.map((p) => p.lang).filter(Boolean))], hreflang: [...new Set(ok.flatMap((p) => p.hreflang))].slice(0, 12) },
    iframes: [...new Set(ok.flatMap((p) => p.iframes))].slice(0, 10),
    noindex: count((p) => p.noindex),
    relatedSites: Object.entries(related).sort((a, b) => b[1] - a[1]),
  };
  const slow = ok.filter((p) => p.ms > 3000).length;
  if (slow) site.notes.push(`${slow} of ${ok.length} sampled pages took over 3 seconds to answer.`);
  const failed = pages.filter((p) => !p.signals);
  if (failed.length) site.notes.push(`${failed.length} sampled pages failed: ${failed.slice(0, 3).map((p) => `${p.url} (${p.error})`).join('; ')}.`);
  return site;
}

const pct = (n, d) => (d ? `${n}/${d}` : '0');

function markdown(sites, when) {
  const L = [`# Site survey, ${when.slice(0, 10)}`, '', 'Read from robots.txt, the sitemaps and a sample of pages, without running their JavaScript: content a page builds in the browser isn\'t seen. Counts come from the sitemaps, which can be incomplete or out of date.', ''];
  sites.forEach((s) => {
    L.push(`## ${s.origin}`, '');
    if (!s.homeStatus) { L.push(`- Not reachable: ${s.homeError}.`, ...s.notes.map((n) => `- ${n}`), ''); return; }
    const top = (s.signals?.platform || []).map(([l, n]) => `${l} (${pct(n, s.sampled.read)} sampled pages)`).join(', ') || 'not recognized';
    L.push(
      `- Pages: **${s.pages.toLocaleString('en-US')}** in ${s.sections.length} top-level sections (${s.countSource}${s.sitemapCapped ? ', capped' : ''}); ${s.pdfsInSitemap} PDFs listed.`,
      `- Platform: ${top}.${(s.signals?.framework || []).length ? ` Front-end: ${s.signals.framework.map(([l, n]) => `${l} (${pct(n, s.sampled.read)})`).join(', ')}.` : ''}`,
      `- Sampled ${s.sampled.read} of ${s.sampled.requested} pages.`,
      '',
      '| Section | Pages | Largest subsections |',
      '|:--------------|------:|:------------------------------------------|',
      ...s.sections.slice(0, 15).map((x) => `| ${x.name} | ${x.pages} | ${x.top.join(', ') || '-'} |`),
      ...(s.sections.length > 15 ? [`| (${s.sections.length - 15} more) | ${s.sections.slice(15).reduce((n, x) => n + x.pages, 0)} | |`] : []),
      '',
    );
    const f = s.features;
    const g = (k) => (s.signals?.[k] || []).map(([l, n]) => `${l} (${pct(n, s.sampled.read)})`).join(', ') || 'none seen';
    L.push(
      '| Feature | Sampled pages | Detail |',
      '|:----------------|------:|:----------------------------------------------|',
      `| Forms (not search) | ${pct(f.forms.pages, s.sampled.read)} | ${f.forms.actions.map(([a, n]) => `${a} (${n})`).join('; ') || '-'} |`,
      `| Search | ${pct(f.search.pages, s.sampled.read)} | ${g('search')} |`,
      `| Login links | ${pct(f.logins.pages, s.sampled.read)} | ${f.logins.examples.join(', ') || '-'} |`,
      `| Regional or location chooser | ${pct(f.regional.pages, s.sampled.read)} | ZIP, postal code, county or region prompts in the HTML |`,
      `| Little or repeated text in the HTML (likely built in the browser) | ${pct(f.clientRendered.pages, s.sampled.read)} | ${f.clientRendered.urls.join(', ') || '-'} |`,
      `| PDF links | ${pct(f.pdfLinks.pages, s.sampled.read)} | ${f.pdfLinks.links} links |`,
      `| Languages | | lang: ${f.languages.htmlLang.join(', ') || '-'}; hreflang: ${f.languages.hreflang.join(', ') || '-'} |`,
      `| Tags and analytics | | ${g('tags')} |`,
      `| Consent | | ${g('consent')} |`,
      `| Chat | | ${g('chat')} |`,
      `| Video | | ${g('video')} |`,
      `| Fonts | | ${g('fonts')} |`,
      `| Captcha | | ${g('captcha')} |`,
      `| Embedded iframes | | ${f.iframes.join(', ') || '-'} |`,
      '',
    );
    if (f.relatedSites.length) L.push(`- Related sites linked from the sample: ${f.relatedSites.map(([h, n]) => `${h} (${n} pages)`).join(', ')}.`);
    if (Object.keys(s.otherHostsInSitemap || {}).length) L.push(`- The sitemaps also list other hosts: ${Object.entries(s.otherHostsInSitemap).map(([h, n]) => `${h} (${n})`).join(', ')}.`);
    s.notes.forEach((n) => L.push(`- ${n}`));
    L.push('');
  });
  return L.join('\n');
}

const { opts, pos } = parseArgs();
if (!pos.length) {
  console.error('usage: node survey.mjs <url> [<url> ...] [--out <dir>] [--sample 24] [--max-urls 50000]');
  process.exit(1);
}
const out = path.resolve(opts.out || 'intake-survey');
fs.mkdirSync(out, { recursive: true });
const when = new Date().toISOString();
const sites = [];
for (const u of pos) {
  process.stderr.write(`surveying ${u} ...\n`);
  sites.push(await surveySite(u, { sample: Number(opts.sample || 24), maxUrls: Number(opts['max-urls'] || 50000) }));
}
fs.writeFileSync(path.join(out, 'survey.json'), JSON.stringify({ surveyed: when, sites }, null, 1));
fs.writeFileSync(path.join(out, 'survey.md'), markdown(sites, when));
console.log(markdown(sites, when));
console.log(`\nwritten: ${path.join(out, 'survey.md')} and survey.json`);
