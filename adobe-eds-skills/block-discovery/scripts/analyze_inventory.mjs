#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function normalizedAuthority(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  return url.port ? `${hostname}:${url.port}` : hostname;
}

function normalizePageIdentity(value) {
  const url = new URL(value);
  let pathname = url.pathname.replace(/\/{2,}/g, '/');
  pathname = pathname.replace(/\.html?$/i, '');
  pathname = pathname.replace(/^\/content\/[^/]+\/[^/]+(?=\/|$)/i, '');
  pathname = pathname.replace(/\/home$/i, '') || '/';
  if (pathname !== '/') pathname = pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${normalizedAuthority(url.href)}${pathname}${url.search}`;
}

function analyzeInventory(inventory) {
  if (!inventory || typeof inventory.start_url !== 'string' || !Array.isArray(inventory.pages)) {
    throw new Error('inventory must contain start_url and a pages array');
  }
  const crawlAuthority = normalizedAuthority(inventory.start_url);
  const groups = new Map();
  const risks = [];

  for (const page of inventory.pages) {
    if (typeof page.url !== 'string') throw new Error('each page must contain a requested url');
    const servedUrl = page.final_url || page.url;
    let identitySource = servedUrl;
    if (page.canonical) {
      try {
        const canonicalUrl = new URL(page.canonical, servedUrl);
        if (canonicalUrl.username || canonicalUrl.password) throw new Error('canonical URL contains credentials');
        if (normalizedAuthority(canonicalUrl.href) === crawlAuthority) {
          identitySource = canonicalUrl.href;
        } else {
          risks.push({
            type: 'off-host-canonical',
            url: servedUrl,
            canonical: page.canonical,
          });
        }
      } catch {
        risks.push({
          type: 'malformed-canonical',
          url: servedUrl,
          canonical: page.canonical,
        });
      }
    }

    if (servedUrl !== page.url) {
      risks.push({ type: 'redirect', requested_url: page.url, served_url: servedUrl });
    }
    const identity = normalizePageIdentity(identitySource);
    if (!groups.has(identity)) {
      groups.set(identity, {
        canonical_page: identity,
        served_urls: [],
        requested_urls: [],
        pages: [],
      });
    }
    const group = groups.get(identity);
    if (!group.served_urls.includes(servedUrl)) group.served_urls.push(servedUrl);
    if (!group.requested_urls.includes(page.url)) group.requested_urls.push(page.url);
    group.pages.push(page);
  }

  for (const group of groups.values()) {
    group.served_urls.sort();
    group.requested_urls.sort();
    group.pages.sort((a, b) => a.url.localeCompare(b.url));
    group.citation_urls = group.served_urls;
  }

  return {
    start_url: inventory.start_url,
    generated_at: new Date().toISOString(),
    crawl: {
      generated_at: inventory.generated_at || null,
      max_pages: inventory.max_pages ?? null,
      pages_discovered: inventory.pages_discovered ?? null,
      pages_crawled: inventory.pages_crawled ?? inventory.pages?.length ?? 0,
      documents_discovered: inventory.documents_discovered ?? inventory.documents?.length ?? 0,
      complete: inventory.complete ?? false,
      limit_reached: inventory.limit_reached ?? false,
      request_settings: inventory.request_settings || null,
      robots_url: inventory.robots_url || null,
      robots_error: inventory.robots_error || null,
      sitemaps: inventory.sitemaps || [],
    },
    groups: [...groups.values()].sort((a, b) => a.canonical_page.localeCompare(b.canonical_page)),
    risks,
    documents: inventory.documents || [],
    exclusions: inventory.exclusions || [],
    failures: inventory.failures || [],
  };
}

function main(argv) {
  if (argv.length < 1 || argv.length > 3 || argv.includes('--help')) {
    console.log('Usage: node analyze_inventory.mjs <inventory.json> [--out <path>]');
    return argv.includes('--help') ? 0 : 2;
  }
  const inputPath = argv[0];
  const outIndex = argv.indexOf('--out');
  if ((outIndex === -1 && argv.length !== 1)
      || (outIndex !== -1 && (outIndex !== 1 || !argv[outIndex + 1] || argv.length !== 3))) {
    throw new Error('expected an input path and optional --out <path>');
  }
  const outputPath = outIndex === -1 ? '-' : argv[outIndex + 1];
  const inventory = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const result = `${JSON.stringify(analyzeInventory(inventory), null, 2)}\n`;
  if (outputPath === '-') process.stdout.write(result);
  else {
    const temporaryPath = `${outputPath}.tmp`;
    fs.writeFileSync(temporaryPath, result, 'utf8');
    fs.renameSync(temporaryPath, outputPath);
  }
  return 0;
}

export { analyzeInventory, normalizePageIdentity };

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
