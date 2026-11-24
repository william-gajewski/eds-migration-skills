#!/usr/bin/env node
/**
 * Create a first-pass, robots-aware inventory of public pages on one host.
 */

import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const USER_AGENT_TOKEN = 'eds-migration-skills-block-discovery';
const USER_AGENT = `${USER_AGENT_TOKEN}/1.0`;
const MAX_BYTES = 5_000_000;
const QUERY_CONTENT_KEYS = new Set(['id', 'lang', 'locale', 'page', 'q', 'category', 'plan']);
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.docm', '.odt', '.rtf', '.xls', '.xlsx', '.xlsm', '.ods',
  '.ppt', '.pptx', '.pptm', '.odp', '.csv', '.tsv', '.epub', '.zip',
]);
const DOCUMENT_CONTENT_TYPES = [
  /^application\/pdf$/,
  /^application\/msword$/,
  /^application\/vnd\.ms-(?:excel|powerpoint|word)$/,
  /^application\/vnd\.openxmlformats-officedocument\.(?:wordprocessingml|spreadsheetml|presentationml)\./,
  /^application\/vnd\.oasis\.opendocument\./,
  /^application\/rtf$/,
  /^text\/csv$/,
];

function requestHeaders(args = {}) {
  const isContactUrl = args.contact && /^https?:\/\//i.test(args.contact);
  const headers = {
    'User-Agent': isContactUrl ? `${USER_AGENT} (+${args.contact})` : USER_AGENT,
  };
  if (args.contact && !isContactUrl) headers.From = args.contact;
  return headers;
}

function normalizedHostname(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  return url.port ? `${hostname}:${url.port}` : hostname;
}

function isDocumentUrl(value) {
  return DOCUMENT_EXTENSIONS.has(path.extname(new URL(value).pathname).toLowerCase());
}

function isDocumentContentType(value) {
  return DOCUMENT_CONTENT_TYPES.some((pattern) => pattern.test(value));
}

function isExcludedUrl(value, exclusions) {
  const pathname = new URL(value).pathname;
  return exclusions.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

function normalizeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;

  let pathname = url.pathname || '/';
  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname !== '/' && pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  const query = [...url.searchParams]
    .filter(([key]) => QUERY_CONTENT_KEYS.has(key.toLowerCase()))
    .sort(([keyA, valueA], [keyB, valueB]) => (
      (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)
      || (valueA < valueB ? -1 : valueA > valueB ? 1 : 0)
    ));
  const search = new URLSearchParams(query).toString();
  return `${url.protocol}//${url.host}${pathname}${search ? `?${search}` : ''}`;
}

function normalizePathPrefix(value) {
  if (!value) return null;
  const pathname = new URL(value, 'https://scope.invalid').pathname.replace(/\/{2,}/g, '/');
  if (pathname === '/') return '/';
  return `${pathname.replace(/\/+$/, '')}/`;
}

function isWithinPathPrefix(value, prefix) {
  if (!prefix || prefix === '/') return true;
  const pathname = new URL(value).pathname;
  return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
}

function decodeEntities(value) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return ({
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    })[code.toLowerCase()] ?? entity;
  });
}

function parseAttributes(source) {
  const attrs = Object.create(null);
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function inspectHtml(html) {
  const titleParts = [];
  const links = [];
  const sections = [];
  const componentClasses = new Set();
  const classCounts = new Map();
  const sectionStack = [];
  let inHead = false;
  let titleDepth = 0;
  let rawTextTag = null;
  let canonical = null;
  let cursor = 0;

  const addText = (raw) => {
    const text = decodeEntities(raw).trim();
    if (!text) return;
    if (titleDepth && inHead) titleParts.push(text);
    for (const section of sectionStack) {
      section.text.push(text);
      if (section.headingDepth) section.heading += `${text} `;
    }
  };

  while (cursor < html.length) {
    if (rawTextTag) {
      const closing = html.toLowerCase().indexOf(`</${rawTextTag}`, cursor);
      if (closing === -1) break;
      cursor = closing;
      rawTextTag = null;
    }

    if (html[cursor] !== '<') {
      const next = html.indexOf('<', cursor);
      addText(html.slice(cursor, next === -1 ? html.length : next));
      cursor = next === -1 ? html.length : next;
      continue;
    }

    if (html.startsWith('<!--', cursor)) {
      const end = html.indexOf('-->', cursor + 4);
      cursor = end === -1 ? html.length : end + 3;
      continue;
    }

    let end = cursor + 1;
    let quote = null;
    while (end < html.length) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
      end += 1;
    }
    if (end === html.length) break;

    const token = html.slice(cursor + 1, end).trim();
    cursor = end + 1;
    if (!token || token[0] === '!' || token[0] === '?') continue;

    const closing = token[0] === '/';
    const match = token.match(/^\/?\s*([^\s/>]+)/);
    if (!match) continue;
    const tag = match[1].toLowerCase();

    if (closing) {
      if (tag === 'head') inHead = false;
      if (tag === 'title' && titleDepth) titleDepth -= 1;
      if (/^h[1-6]$/.test(tag)) {
        for (const section of sectionStack) {
          section.headingDepth = Math.max(0, section.headingDepth - 1);
        }
      }
      const sectionIndex = sectionStack.map((section) => section.tag).lastIndexOf(tag);
      if (sectionIndex !== -1) {
        const closed = sectionStack.splice(sectionIndex);
        for (const section of closed) {
          section.heading = section.heading.replace(/\s+/g, ' ').trim();
          section.text = section.text.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
          delete section.headingDepth;
          sections.push(section);
        }
      }
      continue;
    }

    const attrs = parseAttributes(token.slice(match[0].length));
    if (tag === 'head') inHead = true;
    if (tag === 'title') titleDepth += 1;
    if (tag === 'link' && attrs.rel?.toLowerCase() === 'canonical') {
      canonical = attrs.href || null;
    }
    if (tag === 'a' && attrs.href) links.push(attrs.href);

    for (const className of (attrs.class || '').split(/\s+/).filter(Boolean)) {
      classCounts.set(className, (classCounts.get(className) || 0) + 1);
      if (/^cmp-/i.test(className)) componentClasses.add(className);
    }

    if (tag === 'img' || tag === 'a' || tag === 'video' || tag === 'iframe' || /^h[1-6]$/.test(tag)) {
      for (const section of sectionStack) {
        if (tag === 'img') section.image_count += 1;
        else if (tag === 'a') section.link_count += 1;
        else if (tag === 'video' || tag === 'iframe') section.media_count += 1;
        else section.headingDepth += 1;
      }
    }
    if (tag === 'section' || tag === 'article') {
      sectionStack.push({
        tag,
        classes: (attrs.class || '').split(/\s+/).filter(Boolean),
        label: attrs['aria-label'] || attrs['data-block-name'] || null,
        heading: '',
        text: [],
        image_count: 0,
        link_count: 0,
        media_count: 0,
        headingDepth: 0,
      });
    }

    if (tag === 'script' || tag === 'style') rawTextTag = tag;
  }

  return {
    title: titleParts.join(' ').replace(/\s+/g, ' ').trim(),
    canonical,
    links,
    sections,
    component_classes: [...componentClasses].sort(),
    class_counts: Object.fromEntries([...classCounts].sort(([a], [b]) => a.localeCompare(b))),
  };
}

async function responseBody(response, limit = MAX_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error(`response exceeds ${limit} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function contentType(response) {
  return (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}

function charsetFromResponse(response) {
  const value = response.headers.get('content-type') || '';
  return value.match(/;\s*charset\s*=\s*"?([^;"\s]+)/i)?.[1] || 'utf-8';
}

function inScope(url, originHost, pathPrefix) {
  const candidate = new URL(url);
  return candidate.host.toLowerCase() === originHost.toLowerCase()
    && isWithinPathPrefix(url, pathPrefix);
}

async function fetchResource(url, timeout, {
  limiter = null,
  robot = null,
  originHost = new URL(url).host,
  pathPrefix = null,
  bodyTypes = null,
  headers = { 'User-Agent': USER_AGENT },
  maxRedirects = 10,
} = {}) {
  let requestUrl = url;
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (!inScope(requestUrl, originHost, pathPrefix)) {
      throw new Error(`redirect or resource is outside crawl scope: ${requestUrl}`);
    }
    if (robot && !robotsCanFetch(robot, requestUrl)) {
      throw new Error(`disallowed by robots.txt: ${requestUrl}`);
    }
    if (limiter) await limiter.wait();
    const response = await fetch(requestUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout * 1000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error(`HTTP redirect ${response.status} without a Location header`);
      if (redirects === maxRedirects) throw new Error(`too many redirects from ${url}`);
      requestUrl = new URL(location, requestUrl).href;
      continue;
    }
    if (!response.ok) {
      const error = new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after');
      await response.body?.cancel();
      throw error;
    }

    const type = contentType(response);
    if (bodyTypes && !bodyTypes.has(type)) {
      await response.body?.cancel();
      return {
        finalUrl: requestUrl,
        status: response.status,
        contentType: type,
        charset: charsetFromResponse(response),
        body: new Uint8Array(),
      };
    }
    const body = await responseBody(response);
    return {
      finalUrl: requestUrl,
      status: response.status,
      contentType: type,
      charset: charsetFromResponse(response),
      body,
    };
  }
  throw new Error(`too many redirects from ${url}`);
}

class RateLimiter {
  constructor(interval) {
    this.interval = interval;
    this.nextRequest = 0;
    this.lastRequest = null;
    this.lock = Promise.resolve();
  }

  setInterval(interval) {
    this.interval = interval;
    if (this.lastRequest !== null) {
      this.nextRequest = Math.max(this.nextRequest, this.lastRequest + interval);
    }
  }

  async wait() {
    let release;
    const previous = this.lock;
    this.lock = new Promise((resolve) => { release = resolve; });
    await previous;
    const now = performance.now() / 1000;
    const scheduled = Math.max(now, this.nextRequest);
    this.lastRequest = scheduled;
    this.nextRequest = scheduled + this.interval;
    release();
    const delay = scheduled - now;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay * 1000));
  }
}

function parseRobots(text, status = 200) {
  if (status === 404) return { allowAll: true, disallowAll: false, groups: [], sitemaps: [] };
  if (status === 401 || status === 403) return { allowAll: false, disallowAll: true, groups: [], sitemaps: [] };

  const groups = [];
  const sitemaps = [];
  let group = null;
  let hasRule = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!group || hasRule) {
        group = { agents: [], rules: [], crawlDelays: [] };
        groups.push(group);
        hasRule = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      if (!group) {
        group = { agents: [], rules: [], crawlDelays: [] };
        groups.push(group);
      }
      if (value) group.rules.push({ path: value, allow: key === 'allow' });
      hasRule = true;
    } else if (key === 'crawl-delay' && group) {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay >= 0) group.crawlDelays.push(delay);
      hasRule = true;
    }
  }
  return { allowAll: false, disallowAll: false, groups, sitemaps };
}

function applicableRobotsGroup(robot) {
  const matching = robot.groups.filter((entry) => (
    entry.agents.some((name) => name.toLowerCase() === USER_AGENT_TOKEN.toLowerCase())
  ));
  if (matching.length) {
    return {
      rules: matching.flatMap((entry) => entry.rules),
      crawlDelays: matching.flatMap((entry) => entry.crawlDelays),
    };
  }
  const wildcard = robot.groups.filter((entry) => entry.agents.includes('*'));
  return {
    rules: wildcard.flatMap((entry) => entry.rules),
    crawlDelays: wildcard.flatMap((entry) => entry.crawlDelays),
  };
}

function normalizeRobotsPath(value) {
  const encoded = encodeURI(value).replace(/%25([0-9a-f]{2})/gi, '%$1');
  return encoded.replace(/%([0-9a-f]{2})/gi, (match, hex) => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(character) ? character : `%${hex.toUpperCase()}`;
  });
}

function robotsCanFetch(robot, value) {
  if (robot.disallowAll) return false;
  if (robot.allowAll) return true;
  const { rules } = applicableRobotsGroup(robot);
  const url = new URL(value);
  const target = normalizeRobotsPath(`${url.pathname}${url.search}`);
  const matching = [];
  for (const rule of rules) {
    let pattern = normalizeRobotsPath(rule.path);
    if (!pattern) continue;
    const anchored = pattern.endsWith('$');
    if (anchored) pattern = pattern.slice(0, -1);
    const regex = new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : '.*'}`);
    if (regex.test(target)) {
      matching.push({ specificity: pattern.replaceAll('*', '').length, allow: rule.allow });
    }
  }
  matching.sort((a, b) => a.specificity - b.specificity || Number(a.allow) - Number(b.allow));
  return matching.length ? matching.at(-1).allow : true;
}

function decodeHtml(body, charset) {
  return new TextDecoder(charset).decode(body);
}

async function inspectPage(url, timeout, limiter, robot, originHost, pathPrefix, args) {
  const response = await fetchResource(url, timeout, {
    limiter,
    robot,
    originHost,
    pathPrefix,
    bodyTypes: new Set(['text/html', 'application/xhtml+xml']),
    headers: requestHeaders(args),
  });
  const page = {
    url,
    final_url: normalizeUrl(response.finalUrl) || response.finalUrl,
    status: response.status,
    content_type: response.contentType,
    title: '',
    canonical: null,
    sections: [],
    component_classes: [],
    class_counts: {},
  };
  let links = [];
  if (response.contentType === 'text/html' || response.contentType === 'application/xhtml+xml') {
    const parsed = inspectHtml(decodeHtml(response.body, response.charset));
    page.title = parsed.title;
    if (parsed.canonical) {
      try {
        const canonical = new URL(parsed.canonical, response.finalUrl).href;
        page.canonical = normalizeUrl(canonical) || canonical;
      } catch {
        page.canonical = parsed.canonical;
      }
    }
    page.sections = parsed.sections;
    page.component_classes = parsed.component_classes;
    page.class_counts = parsed.class_counts;
    links = parsed.links.flatMap((href) => {
      try {
        return [new URL(href, response.finalUrl).href];
      } catch {
        return [];
      }
    });
  }
  return { page, links };
}

function retryableFailure(failure) {
  if (typeof failure !== 'string' && failure.kind === 'urls') return false;
  const error = typeof failure === 'string' ? failure : failure.message || failure.error || '';
  if (error.includes('disallowed by robots.txt')
      || error.includes('outside crawl scope')
      || error.includes('response exceeds')) return false;
  const status = failure.status ?? Number(error.match(/^HTTP Error (\d+)/)?.[1]);
  return status === 408 || status === 429 || status >= 500 || !status;
}

function retryDelay(error, attempt) {
  const retryAfter = error.retryAfter;
  if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)) {
    return Math.min(Number(retryAfter), 60) * 1000;
  }
  const retryDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(retryDate)) return Math.max(0, Math.min(retryDate - Date.now(), 60_000));
  return Math.min(30, 2 ** (attempt - 1)) * 1000;
}

async function withRetries(operation, retries, priorAttempts = 0) {
  let lastError;
  let usedAttempts = 0;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    usedAttempts = attempt;
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt > retries || !retryableFailure(error)) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(error, attempt)));
    }
  }
  lastError.attempts = priorAttempts + usedAttempts;
  throw lastError;
}

async function inspectPageWithRetries(url, args, limiter, robot, originHost, priorAttempts = 0) {
  return withRetries(
    () => inspectPage(url, args.timeout, limiter, robot, originHost, args.pathPrefix, args),
    args.retries,
    priorAttempts,
  );
}

function decodeXml(value) {
  return decodeEntities(value);
}

function decodeSitemapBody(body, url, type) {
  let bytes = body;
  if (new URL(url).pathname.toLowerCase().endsWith('.gz')
      || type === 'application/gzip' || type === 'application/x-gzip') {
    bytes = gunzipSync(bytes, { maxOutputLength: MAX_BYTES });
  }
  return new TextDecoder().decode(bytes);
}

async function sitemapLocations(value, {
  timeout,
  limiter,
  robot,
  originHost,
  headers,
  failures,
  exclusions,
  retries,
  seen = new Set(),
  depth = 0,
}) {
  if (depth > 3) {
    failures.push({ url: value, error: 'sitemap nesting exceeds maximum depth 3', kind: 'sitemap' });
    return [];
  }
  if (seen.has(value)) return [];
  seen.add(value);
  try {
    const response = await withRetries(
      () => fetchResource(value, timeout, { limiter, robot, originHost, headers }),
      retries,
    );
    const text = decodeSitemapBody(response.body, value, response.contentType);
    if (!['application/xml', 'text/xml', 'application/gzip', 'application/x-gzip'].includes(response.contentType)
        && !text.trimStart().startsWith('<')) {
      throw new Error(`unexpected sitemap content type: ${response.contentType || '(missing)'}`);
    }
    const rootTag = text.match(/<\s*(?:[\w.-]+:)?(sitemapindex|urlset)\b/i)?.[1]?.toLowerCase();
    if (!rootTag) throw new Error('sitemap has no sitemapindex or urlset root element');
    const locations = [...text.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/gi)]
      .map((match) => decodeXml(match[1].trim()));
    if (rootTag === 'sitemapindex') {
      const nested = [];
      for (const location of locations) {
        nested.push(...await sitemapLocations(location, {
          timeout, limiter, robot, originHost, headers, failures, exclusions, retries, seen, depth: depth + 1,
        }));
      }
      return nested;
    }
    return locations.map(normalizeUrl).filter(Boolean);
  } catch (error) {
    if (error.message.includes('disallowed by robots.txt')) {
      exclusions.push({ url: value, reason: 'sitemap disallowed by robots.txt' });
    } else if (error.message.includes('outside crawl scope')) {
      exclusions.push({ url: value, reason: 'sitemap is outside crawl scope' });
    } else {
      failures.push({
        url: value,
        error: error.message,
        attempts: error.attempts || 1,
        kind: 'sitemap',
      });
    }
    return [];
  }
}

function usage() {
  return [
    'Usage: node site_inventory.mjs <url> [options]',
    '',
    'Options:',
    '  --max-pages <n>       Maximum HTML pages to process (default: 500)',
    '  --authorized-by <who, when>  Required for link-following crawls and caps over 500',
    '  --contact <url-or-email>     Optional public crawl contact',
    '  --urls <file>         Sample URLs, one per line; does not follow links',
    '  --sitemap <url>       Use this sitemap instead of robots.txt references',
    '  --exclude <path>      Exclude a path prefix (repeatable)',
    '  --delay <seconds>     Minimum seconds between request starts (default: 1)',
    '  --workers <n>         Maximum concurrent page requests (default: 4)',
    '  --path-prefix <path>  Restrict crawling to a URL path and its descendants',
    '  --progress-every <n>  Progress/checkpoint interval (default: 250)',
    '  --retries <n>         Transient retries per run (default: 1)',
    '  --timeout <seconds>   Per-request timeout (default: 15)',
    '  --out <path>          Output JSON file (default: stdout)',
    '  --resume              Resume an incomplete JSON output file',
    '  --help                Show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    maxPages: 500,
    delay: 1,
    workers: 4,
    progressEvery: 250,
    retries: 1,
    timeout: 15,
    pathPrefix: null,
    urlsFile: null,
    sitemaps: [],
    exclusions: [],
    authorizedBy: null,
    contact: null,
    out: '-',
    resume: false,
  };
  const names = new Map([
    ['--max-pages', 'maxPages'],
    ['--delay', 'delay'],
    ['--workers', 'workers'],
    ['--path-prefix', 'pathPrefix'],
    ['--progress-every', 'progressEvery'],
    ['--retries', 'retries'],
    ['--timeout', 'timeout'],
    ['--out', 'out'],
    ['--authorized-by', 'authorizedBy'],
    ['--contact', 'contact'],
    ['--urls', 'urlsFile'],
    ['--sitemap', 'sitemap'],
    ['--exclude', 'exclude'],
  ]);
  const numeric = new Set(['maxPages', 'delay', 'workers', 'progressEvery', 'retries', 'timeout']);
  let startUrl = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--resume') {
      args.resume = true;
      continue;
    }
    const [option, inlineValue] = arg.split(/=(.*)/s, 2);
    const name = names.get(option);
    if (!name) {
      if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
      if (startUrl) throw new Error(`unexpected argument: ${arg}`);
      startUrl = arg;
      continue;
    }
    const value = inlineValue ?? argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
    if (name === 'sitemap') args.sitemaps.push(value);
    else if (name === 'exclude') args.exclusions.push(value);
    else args[name] = numeric.has(name) ? Number(value) : value;
  }
  if (!startUrl) throw new Error('a starting URL is required');
  args.start = normalizeUrl(startUrl);
  if (!args.start) throw new Error('URL must be an absolute HTTP or HTTPS URL');
  if (args.pathPrefix) args.pathPrefix = normalizePathPrefix(args.pathPrefix);
  if (!isWithinPathPrefix(args.start, args.pathPrefix)) {
    throw new Error('The starting URL is outside --path-prefix');
  }
  if (args.urlsFile && args.sitemaps.length) {
    throw new Error('--urls sampling cannot be combined with --sitemap');
  }
  if (args.maxPages > 500 && !args.authorizedBy?.trim()) {
    throw new Error('--authorized-by "<who, when>" is required when --max-pages exceeds 500');
  }
  if (!args.urlsFile && !args.authorizedBy?.trim()) {
    throw new Error('--authorized-by "<who, when>" is required for sitemap or link-following crawls; use --urls for a sample');
  }
  if (args.authorizedBy && !args.authorizedBy.trim()) {
    throw new Error('--authorized-by cannot be empty');
  }
  if (args.contact) {
    if (/[\r\n]/.test(args.contact)) throw new Error('--contact cannot contain line breaks');
    if (/^https?:\/\//i.test(args.contact)) {
      const contact = new URL(args.contact);
      if (contact.username || contact.password) throw new Error('--contact URL cannot contain credentials');
      args.contact = contact.href;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.contact)) {
      throw new Error('--contact must be an HTTP(S) URL or email address');
    }
  }
  args.exclusions = args.exclusions.map((value) => {
    if (value.startsWith('/')) return normalizePathPrefix(value);
    const url = normalizeUrl(value);
    if (!url || normalizedHostname(url) !== normalizedHostname(args.start)) {
      throw new Error('--exclude must be a path prefix or URL on the starting host');
    }
    return normalizePathPrefix(new URL(url).pathname);
  });
  args.sitemaps = args.sitemaps.map((value) => {
    const url = normalizeUrl(value);
    if (!url) throw new Error('--sitemap must be an absolute HTTP(S) URL');
    if (normalizedHostname(url) !== normalizedHostname(args.start)) {
      throw new Error('--sitemap must be on the starting host');
    }
    return url;
  });
  if (!Number.isInteger(args.maxPages) || !Number.isInteger(args.workers) || !Number.isInteger(args.progressEvery) || !Number.isInteger(args.retries)
      || args.maxPages < 1 || args.workers < 1 || args.progressEvery < 1 || args.delay < 0 || args.retries < 0 || args.timeout <= 0
      || !Number.isFinite(args.maxPages + args.workers + args.progressEvery + args.delay + args.retries + args.timeout)) {
    throw new Error('--max-pages, --workers, and --progress-every must be positive; --delay and --retries cannot be negative');
  }
  if (args.resume && args.out === '-') throw new Error('--resume requires a JSON file path via --out');
  return args;
}

function buildResult(args, robotsUrl, robotsError, sitemapUrls, pages, failures, exclusions, documents, queue, pending, visited, complete, effectiveDelay) {
  const discoveredUrls = new Set([...visited, ...queue, ...pending.values()]);
  return {
    start_url: args.start,
    generated_at: new Date().toISOString(),
    max_pages: args.maxPages,
    pages_discovered: discoveredUrls.size,
    pages_crawled: pages.length,
    documents_discovered: documents.length,
    request_settings: {
      authorized_by: args.authorizedBy,
      contact: args.contact,
      user_agent: requestHeaders(args)['User-Agent'],
      from: args.contact && !/^https?:\/\//i.test(args.contact) ? args.contact : null,
      delay_seconds: args.delay,
      effective_delay_seconds: effectiveDelay,
      workers: args.workers,
    },
    robots_url: robotsUrl,
    robots_error: robotsError,
    sitemaps: sitemapUrls,
    limit_reached: Boolean(queue.length && visited.size >= args.maxPages),
    complete,
    queued_urls: [...new Set([...queue, ...pending.values()])].sort(),
    visited_urls: [...visited].sort(),
    pages,
    failures,
    exclusions,
    documents,
  };
}

function writeResult(result, outputPath) {
  const data = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath === '-') {
    process.stdout.write(data);
    return;
  }
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, data, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
}

async function fetchRobots(url, timeout, originHost, limiter, headers) {
  let requestUrl = url;
  for (let redirects = 0; redirects <= 10; redirects += 1) {
    if (new URL(requestUrl).host.toLowerCase() !== originHost.toLowerCase()) {
      throw new Error(`robots.txt redirect is outside the site host: ${requestUrl}`);
    }
    await limiter.wait();
    const response = await fetch(requestUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout * 1000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error(`robots.txt redirect ${response.status} without a Location header`);
      if (redirects === 10) throw new Error('too many redirects fetching robots.txt');
      requestUrl = new URL(location, requestUrl).href;
      continue;
    }
    if (response.status === 404 || response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      return parseRobots('', response.status);
    }
    if (!response.ok) {
      const error = new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after');
      await response.body?.cancel();
      throw error;
    }
    return parseRobots(new TextDecoder().decode(await responseBody(response)), response.status);
  }
  throw new Error('too many redirects fetching robots.txt');
}

async function crawl(args) {
  const start = args.start;
  const parts = new URL(start);
  const origin = parts.origin;
  const robotsUrl = `${origin}/robots.txt`;
  const limiter = new RateLimiter(args.delay);
  const headers = requestHeaders(args);
  let robot;
  let robotsError = null;
  try {
    robot = await withRetries(
      () => fetchRobots(robotsUrl, args.timeout, parts.host, limiter, headers),
      args.retries,
    );
  } catch (error) {
    robotsError = error.message;
    writeResult({
      start_url: start,
      generated_at: new Date().toISOString(),
      max_pages: args.maxPages,
      pages_discovered: 0,
      pages_crawled: 0,
      documents_discovered: 0,
      request_settings: {
        authorized_by: args.authorizedBy,
        contact: args.contact,
        user_agent: headers['User-Agent'],
        from: headers.From || null,
        delay_seconds: args.delay,
        effective_delay_seconds: args.delay,
        workers: args.workers,
      },
      pages: [],
      documents: [],
      exclusions: [],
      robots_url: robotsUrl,
      robots_error: robotsError,
      sitemaps: [],
      limit_reached: false,
      failures: [{ url: robotsUrl, error: robotsError, attempts: error.attempts || 1 }],
      complete: false,
    }, args.out);
    return 1;
  }

  const robotsGroup = applicableRobotsGroup(robot);
  const crawlDelay = robotsGroup.crawlDelays.length ? Math.max(...robotsGroup.crawlDelays) : 0;
  const effectiveDelay = Math.max(args.delay, crawlDelay);
  limiter.setInterval(effectiveDelay);
  const sitemapUrls = args.urlsFile
    ? []
    : args.sitemaps.length ? args.sitemaps : robot.sitemaps.length ? robot.sitemaps : [`${origin}/sitemap.xml`];
  const sitemapFailures = [];
  const sitemapExclusions = [];
  const sitemapSeeds = [];
  if (!args.urlsFile) {
    for (const url of sitemapUrls) {
      sitemapSeeds.push(...await sitemapLocations(url, {
        timeout: args.timeout,
        limiter,
        robot,
        originHost: parts.host,
        headers,
        failures: sitemapFailures,
        exclusions: sitemapExclusions,
        retries: args.retries,
      }));
    }
  }
  let failures = [...sitemapFailures];
  const exclusions = [];
  const exclusionKeys = new Set();
  const recordExclusion = (url, reason) => {
    const key = `${url}\n${reason}`;
    if (exclusionKeys.has(key)) return;
    exclusionKeys.add(key);
    exclusions.push({ url, reason });
  };
  for (const exclusion of sitemapExclusions) recordExclusion(exclusion.url, exclusion.reason);

  const documentSources = new Map();
  const recordDocument = (url, source) => {
    if (!documentSources.has(url)) documentSources.set(url, new Set());
    if (source) documentSources.get(url).add(source);
  };
  const listedUrls = args.urlsFile
    ? fs.readFileSync(args.urlsFile, 'utf8').split(/\r?\n/).flatMap((raw, index) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return [];
      try {
        const normalized = normalizeUrl(new URL(line, start).href);
        if (!normalized) throw new Error('URL must use HTTP or HTTPS');
        return [normalized];
      } catch (error) {
        failures.push({
          url: `${args.urlsFile}:${index + 1}`,
          error: `invalid URL list entry: ${error.message}`,
          kind: 'urls',
        });
        return [];
      }
    })
    : [start, ...sitemapSeeds];
  const seeds = [];
  for (const url of listedUrls) {
    const candidate = new URL(url);
    if (candidate.host.toLowerCase() !== parts.host.toLowerCase()) {
      recordExclusion(url, 'outside starting host');
      continue;
    }
    if (!isWithinPathPrefix(url, args.pathPrefix)) {
      recordExclusion(url, 'outside --path-prefix');
      continue;
    }
    if (isDocumentUrl(url)) {
      recordDocument(url, args.urlsFile ? 'URL list' : 'sitemap');
      continue;
    }
    if (isExcludedUrl(url, args.exclusions)) {
      recordExclusion(url, 'excluded by --exclude');
      continue;
    }
    seeds.push(url);
  }
  const queueSet = new Set(seeds);
  const pages = [];
  const visited = new Set();
  const attempts = new Map();
  let queue = [...queueSet];

  if (args.resume) {
    let previous;
    try {
      previous = JSON.parse(fs.readFileSync(args.out, 'utf8'));
    } catch (error) {
      throw new Error(`Cannot resume from ${args.out}: ${error.message}`);
    }
    if (previous.start_url !== start) throw new Error('The resume file belongs to a different start URL');
    pages.push(...(previous.pages || []));
    failures = [...sitemapFailures, ...(previous.failures || []).filter((failure) => failure.kind !== 'sitemap')];
    for (const exclusion of previous.exclusions || []) {
      recordExclusion(exclusion.url, exclusion.reason);
    }
    for (const document of previous.documents || []) {
      for (const source of document.discovered_on || []) recordDocument(document.url, source);
      recordDocument(document.url, null);
    }
    for (const url of previous.visited_urls || []) visited.add(url);
    for (const failure of failures) attempts.set(failure.url, failure.attempts || 1);

    const resumeUrls = new Set((previous.queued_urls || []).filter((url) => (
      isWithinPathPrefix(url, args.pathPrefix) && !isExcludedUrl(url, args.exclusions)
    )));
    const recorded = new Set([
      ...pages.map((page) => page.url),
      ...failures.map((failure) => failure.url),
    ]);
    for (const url of visited) if (!recorded.has(url)) resumeUrls.add(url);
    for (const url of resumeUrls) queueSet.add(url);
    for (const url of resumeUrls) visited.delete(url);
    for (const failure of failures) {
      if (retryableFailure(failure)) {
        visited.delete(failure.url);
        queueSet.add(failure.url);
      }
    }
    if (previous.complete && ![...queueSet].some((url) => !visited.has(url))) {
      throw new Error('The resume file is complete and has no retryable failures');
    }
    queue = [...queueSet].filter((url) => !visited.has(url));
  }

  const pending = new Map();
  let outcomesSinceCheckpoint = 0;
  while (queue.length || pending.size) {
    while (queue.length && pending.size < args.workers && visited.size < args.maxPages) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      let candidate;
      try {
        candidate = new URL(url);
      } catch {
        continue;
      }
      if (candidate.host.toLowerCase() !== parts.host.toLowerCase()) continue;
      if (!isWithinPathPrefix(url, args.pathPrefix)) continue;
      if (isDocumentUrl(url)) {
        recordDocument(url, 'linked or listed');
        continue;
      }
      if (isExcludedUrl(url, args.exclusions)) {
        recordExclusion(url, 'excluded by --exclude');
        continue;
      }
      if (!robotsCanFetch(robot, url)) {
        recordExclusion(url, 'disallowed by robots.txt');
        outcomesSinceCheckpoint += 1;
        continue;
      }
      visited.add(url);
      const task = inspectPageWithRetries(
        url, args, limiter, robot, parts.host, attempts.get(url) || 0,
      );
      pending.set(task, url);
    }

    if (!pending.size) break;
    const completed = await Promise.race([...pending.keys()].map((task) => task.then(
      (value) => ({ task, value }),
      (error) => ({ task, error }),
    )));
    const url = pending.get(completed.task);
    pending.delete(completed.task);
    if (completed.error) {
      if (completed.error.message.includes('outside crawl scope')) {
        recordExclusion(url, 'redirect or resource outside crawl scope');
      } else {
        const attemptsForUrl = (attempts.get(url) || 0) + 1;
        attempts.set(url, completed.error.attempts || attemptsForUrl);
        failures = failures.filter((failure) => failure.url !== url);
        failures.push({
          url,
          error: completed.error.message,
          attempts: completed.error.attempts || attemptsForUrl,
        });
      }
    } else {
      if (isDocumentContentType(completed.value.page.content_type)) {
        recordDocument(completed.value.page.final_url, 'response content type');
      } else {
        pages.push(completed.value.page);
      }
      failures = failures.filter((failure) => failure.url !== url);
      for (const href of completed.value.links) {
        let candidate;
        try {
          candidate = normalizeUrl(href);
        } catch {
          candidate = null;
        }
        if (!candidate || new URL(candidate).host.toLowerCase() !== parts.host.toLowerCase()) continue;
        if (!isWithinPathPrefix(candidate, args.pathPrefix)) continue;
        if (isDocumentUrl(candidate)) {
          recordDocument(candidate, completed.value.page.final_url);
          continue;
        }
        if (isExcludedUrl(candidate, args.exclusions)) {
          recordExclusion(candidate, 'excluded by --exclude');
          continue;
        }
        if (!args.urlsFile && !queueSet.has(candidate)) {
          queueSet.add(candidate);
          queue.push(candidate);
        }
      }
    }
    outcomesSinceCheckpoint += 1;

    if (outcomesSinceCheckpoint >= args.progressEvery) {
      console.error(`Crawled ${pages.length} pages; ${failures.length} failures; ${exclusions.length} exclusions; ${queue.length + pending.size} queued.`);
      if (args.out !== '-') {
        writeResult(buildResult(
          args, robotsUrl, robotsError, sitemapUrls,
          pages, failures, exclusions,
          [...documentSources].map(([url, sources]) => ({ url, discovered_on: [...sources].sort() })),
          queue, pending, visited, false, effectiveDelay,
        ), args.out);
      }
      outcomesSinceCheckpoint = 0;
    }
  }

  const result = buildResult(
    args, robotsUrl, robotsError, sitemapUrls,
    pages, failures, exclusions,
    [...documentSources].map(([url, sources]) => ({ url, discovered_on: [...sources].sort() })),
    queue, pending, visited,
    !queue.length && !pending.size,
    effectiveDelay,
  );
  writeResult(result, args.out);
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    if (args.help) {
      console.log(usage());
      return 0;
    }
  } catch (error) {
    console.error(`error: ${error.message}\n\n${usage()}`);
    return 2;
  }
  try {
    return await crawl(args);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 1;
  }
}

export {
  applicableRobotsGroup,
  decodeSitemapBody,
  fetchResource,
  inspectHtml,
  inspectPageWithRetries,
  isDocumentContentType,
  normalizeUrl,
  parseArgs,
  parseRobots,
  robotsCanFetch,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
