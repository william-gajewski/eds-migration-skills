#!/usr/bin/env node
/**
 * Create a first-pass, robots-aware inventory of public pages on one host.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USER_AGENT = 'EDSBlockDiscovery/1.0 (+https://www.aem.live/)';
const MAX_BYTES = 5_000_000;
const QUERY_CONTENT_KEYS = new Set(['id', 'lang', 'locale', 'page', 'q', 'category']);

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
  let titleDepth = 0;
  let activeSection = null;
  let rawTextTag = null;
  let canonical = null;
  let cursor = 0;

  const addText = (raw) => {
    const text = decodeEntities(raw).trim();
    if (!text) return;
    if (titleDepth) titleParts.push(text);
    if (activeSection) {
      activeSection.text.push(text);
      if (activeSection.headingDepth) activeSection.heading += `${text} `;
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
      if (tag === 'title' && titleDepth) titleDepth -= 1;
      if (activeSection) {
        if (/^h[1-6]$/.test(tag)) {
          activeSection.headingDepth = Math.max(0, activeSection.headingDepth - 1);
        } else if (tag === activeSection.tag) {
          activeSection.heading = activeSection.heading.replace(/\s+/g, ' ').trim();
          activeSection.text = activeSection.text.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
          delete activeSection.headingDepth;
          sections.push(activeSection);
          activeSection = null;
        }
      }
      continue;
    }

    const attrs = parseAttributes(token.slice(match[0].length));
    if (tag === 'title') titleDepth += 1;
    if (tag === 'link' && attrs.rel?.toLowerCase() === 'canonical') {
      canonical = attrs.href || null;
    }
    if (tag === 'a' && attrs.href) links.push(attrs.href);

    if (activeSection) {
      if (tag === 'img') activeSection.image_count += 1;
      else if (tag === 'a') activeSection.link_count += 1;
      else if (tag === 'video' || tag === 'iframe') activeSection.media_count += 1;
      else if (/^h[1-6]$/.test(tag)) activeSection.headingDepth += 1;
    }
    if ((tag === 'section' || tag === 'article') && !activeSection) {
      activeSection = {
        tag,
        classes: (attrs.class || '').split(/\s+/).filter(Boolean),
        label: attrs['aria-label'] || attrs['data-block-name'] || null,
        heading: '',
        text: [],
        image_count: 0,
        link_count: 0,
        media_count: 0,
        headingDepth: 0,
      };
    }

    if (tag === 'script' || tag === 'style') rawTextTag = tag;
  }

  return {
    title: titleParts.join(' ').replace(/\s+/g, ' ').trim(),
    canonical,
    links,
    sections,
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

async function fetchResource(url, timeout) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeout * 1000),
  });
  if (!response.ok) throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  const type = contentType(response);
  const body = await responseBody(response);
  return { finalUrl: response.url, status: response.status, contentType: type, body };
}

class RateLimiter {
  constructor(interval) {
    this.interval = interval;
    this.nextRequest = 0;
    this.lock = Promise.resolve();
  }

  async wait() {
    let release;
    const previous = this.lock;
    this.lock = new Promise((resolve) => { release = resolve; });
    await previous;
    const now = performance.now() / 1000;
    const scheduled = Math.max(now, this.nextRequest);
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
  const agent = USER_AGENT.toLowerCase();
  const matching = robot.groups.filter((entry) => entry.agents.some((name) => name && name !== '*' && agent.includes(name)));
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

function robotsCanFetch(robot, value) {
  if (robot.disallowAll) return false;
  if (robot.allowAll) return true;
  const { rules } = applicableRobotsGroup(robot);
  const url = new URL(value);
  let target;
  try {
    target = encodeURIComponent(decodeURIComponent(`${url.pathname}${url.search}`)).replace(/%2F/gi, '/');
  } catch {
    target = `${url.pathname}${url.search}`;
  }
  const matching = [];
  for (const rule of rules) {
    let pattern = rule.path;
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

async function inspectPage(url, timeout, limiter) {
  await limiter.wait();
  const response = await fetchResource(url, timeout);
  const page = {
    url,
    final_url: normalizeUrl(response.finalUrl) || response.finalUrl,
    status: response.status,
    content_type: response.contentType,
    title: '',
    canonical: null,
    sections: [],
  };
  let links = [];
  if (response.contentType === 'text/html') {
    const parsed = inspectHtml(new TextDecoder().decode(response.body));
    page.title = parsed.title;
    if (parsed.canonical) page.canonical = normalizeUrl(new URL(parsed.canonical, response.finalUrl).href);
    page.sections = parsed.sections;
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
  const error = failure.error || '';
  if (error.includes('disallowed by robots.txt') || error.includes('response exceeds')) return false;
  if (error.startsWith('HTTP Error ')) {
    const status = Number(error.split(/\s+/)[2]?.replace(':', ''));
    return status === 408 || status === 429 || status >= 500;
  }
  return true;
}

function decodeXml(value) {
  return decodeEntities(value);
}

async function sitemapLocations(value, timeout, seen = new Set(), depth = 0) {
  if (seen.has(value) || depth > 3) return [];
  seen.add(value);
  try {
    const response = await fetchResource(value, timeout);
    const text = new TextDecoder().decode(response.body);
    if (!['application/xml', 'text/xml'].includes(response.contentType) && !text.trimStart().startsWith('<')) return [];
    const rootTag = text.match(/<\s*(?:[\w.-]+:)?(sitemapindex|urlset)\b/i)?.[1]?.toLowerCase();
    const locations = [...text.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc\s*>/gi)]
      .map((match) => decodeXml(match[1].trim()));
    if (rootTag === 'sitemapindex') {
      const nested = await Promise.all(locations.map((location) => sitemapLocations(location, timeout, seen, depth + 1)));
      return nested.flat();
    }
    return locations.map(normalizeUrl).filter(Boolean);
  } catch {
    return [];
  }
}

function usage() {
  return [
    'Usage: node site_inventory.mjs <url> [options]',
    '',
    'Options:',
    '  --max-pages <n>       Maximum URLs to process (default: 500)',
    '  --delay <seconds>     Minimum seconds between request starts (default: 1)',
    '  --workers <n>         Maximum concurrent page requests (default: 4)',
    '  --path-prefix <path>  Restrict crawling to a URL path and its descendants',
    '  --progress-every <n>  Progress/checkpoint interval (default: 25)',
    '  --retries <n>         Transient retries when resuming (default: 1)',
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
    progressEvery: 25,
    retries: 1,
    timeout: 15,
    pathPrefix: null,
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
    args[name] = numeric.has(name) ? Number(value) : value;
  }
  if (!startUrl) throw new Error('a starting URL is required');
  args.start = normalizeUrl(startUrl);
  if (!args.start) throw new Error('URL must be an absolute HTTP or HTTPS URL');
  if (args.pathPrefix) args.pathPrefix = normalizePathPrefix(args.pathPrefix);
  if (!isWithinPathPrefix(args.start, args.pathPrefix)) {
    throw new Error('The starting URL is outside --path-prefix');
  }
  if (!Number.isInteger(args.maxPages) || !Number.isInteger(args.workers) || !Number.isInteger(args.progressEvery) || !Number.isInteger(args.retries)
      || args.maxPages < 1 || args.workers < 1 || args.progressEvery < 1 || args.delay < 0 || args.retries < 0 || args.timeout <= 0
      || !Number.isFinite(args.maxPages + args.workers + args.progressEvery + args.delay + args.retries + args.timeout)) {
    throw new Error('--max-pages, --workers, and --progress-every must be positive; --delay and --retries cannot be negative');
  }
  if (args.resume && args.out === '-') throw new Error('--resume requires a JSON file path via --out');
  return args;
}

function buildResult(start, maxPages, robotsUrl, robotsError, sitemapUrls, pages, failures, queue, pending, visited, complete) {
  const discoveredUrls = new Set([...visited, ...queue, ...pending.values()]);
  return {
    start_url: start,
    generated_at: new Date().toISOString(),
    max_pages: maxPages,
    pages_discovered: discoveredUrls.size,
    pages_crawled: pages.length,
    robots_url: robotsUrl,
    robots_error: robotsError,
    sitemaps: sitemapUrls,
    limit_reached: Boolean(queue.length && visited.size >= maxPages),
    complete,
    queued_urls: [...new Set([...queue, ...pending.values()])].sort(),
    visited_urls: [...visited].sort(),
    pages,
    failures,
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

async function crawl(args) {
  const start = args.start;
  const parts = new URL(start);
  const origin = parts.origin;
  const robotsUrl = `${origin}/robots.txt`;
  let robot;
  let robotsError = null;
  try {
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(args.timeout * 1000),
    });
    if (!response.ok && response.status !== 404 && response.status !== 401 && response.status !== 403) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }
    const text = response.status === 404 || response.status === 401 || response.status === 403
      ? ''
      : new TextDecoder().decode(await responseBody(response));
    robot = parseRobots(text, response.status);
  } catch (error) {
    robotsError = error.message;
    writeResult({
      start_url: start,
      generated_at: new Date().toISOString(),
      max_pages: args.maxPages,
      pages: [],
      failures: [{ url: robotsUrl, error: robotsError }],
      complete: false,
    }, args.out);
    return 0;
  }

  const robotsGroup = applicableRobotsGroup(robot);
  const crawlDelay = robotsGroup.crawlDelays.length ? Math.max(...robotsGroup.crawlDelays) : 0;
  const sitemapUrls = robot.sitemaps.length ? robot.sitemaps : [`${origin}/sitemap.xml`];
  const seeds = (await Promise.all(sitemapUrls.map((url) => sitemapLocations(url, args.timeout))))
    .flat()
    .filter((url) => {
      const candidate = new URL(url);
      return candidate.host.toLowerCase() === parts.host.toLowerCase()
        && isWithinPathPrefix(url, args.pathPrefix);
    });
  const queueSet = new Set([start, ...seeds]);
  const pages = [];
  let failures = [];
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
    failures = previous.failures || [];
    for (const url of previous.visited_urls || []) visited.add(url);
    for (const failure of failures) attempts.set(failure.url, failure.attempts || 1);

    const resumeUrls = new Set((previous.queued_urls || []).filter((url) => isWithinPathPrefix(url, args.pathPrefix)));
    const recorded = new Set([
      ...pages.map((page) => page.url),
      ...failures.map((failure) => failure.url),
    ]);
    for (const url of visited) if (!recorded.has(url)) resumeUrls.add(url);
    for (const url of resumeUrls) queueSet.add(url);
    for (const url of resumeUrls) visited.delete(url);
    for (const failure of failures) {
      if (retryableFailure(failure) && (attempts.get(failure.url) || 1) <= args.retries) {
        visited.delete(failure.url);
        queueSet.add(failure.url);
      }
    }
    if (previous.complete && ![...queueSet].some((url) => !visited.has(url))) {
      throw new Error('The resume file is complete and has no retryable failures');
    }
    queue = [...queueSet].filter((url) => !visited.has(url));
  }

  const limiter = new RateLimiter(Math.max(args.delay, crawlDelay));
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
      visited.add(url);
      if (!robotsCanFetch(robot, url)) {
        failures.push({ url, error: 'disallowed by robots.txt' });
        outcomesSinceCheckpoint += 1;
        continue;
      }
      const task = inspectPage(url, args.timeout, limiter);
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
      const attemptsForUrl = (attempts.get(url) || 0) + 1;
      attempts.set(url, attemptsForUrl);
      failures = failures.filter((failure) => failure.url !== url);
      failures.push({ url, error: completed.error.message, attempts: attemptsForUrl });
    } else {
      pages.push(completed.value.page);
      failures = failures.filter((failure) => failure.url !== url);
      for (const href of completed.value.links) {
        let candidate;
        try {
          candidate = normalizeUrl(href);
        } catch {
          candidate = null;
        }
        if (candidate
            && new URL(candidate).host.toLowerCase() === parts.host.toLowerCase()
            && isWithinPathPrefix(candidate, args.pathPrefix)
            && !queueSet.has(candidate)) {
          queueSet.add(candidate);
          queue.push(candidate);
        }
      }
    }
    outcomesSinceCheckpoint += 1;

    if (outcomesSinceCheckpoint >= args.progressEvery) {
      console.error(`Crawled ${pages.length} pages; ${failures.length} failures/disallowed; ${queue.length + pending.size} queued.`);
      if (args.out !== '-') {
        writeResult(buildResult(
          start, args.maxPages, robotsUrl, robotsError, sitemapUrls,
          pages, failures, queue, pending, visited, false,
        ), args.out);
      }
      outcomesSinceCheckpoint = 0;
    }
  }

  const result = buildResult(
    start, args.maxPages, robotsUrl, robotsError, sitemapUrls,
    pages, failures, queue, pending, visited,
    !queue.length && !pending.size && visited.size < args.maxPages,
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
