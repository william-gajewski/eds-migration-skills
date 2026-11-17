import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  decodeSitemapBody,
  fetchResource,
  inspectHtml,
  inspectPageWithRetries,
  main,
  normalizeUrl,
  parseRobots,
  robotsCanFetch,
} from './site_inventory.mjs';

async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    host: `127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('distinct plan query values remain distinct URLs', () => {
  assert.notEqual(
    normalizeUrl('https://example.com/plans?plan=gold'),
    normalizeUrl('https://example.com/plans?plan=silver'),
  );
});

test('robots patterns match query strings without percent-encoding separators', () => {
  const robot = parseRobots([
    'User-agent: *',
    'Disallow: /*?',
    'Disallow: /search?q=',
  ].join('\n'));

  assert.equal(robotsCanFetch(robot, 'https://example.com/plans?id=7'), false);
  assert.equal(robotsCanFetch(robot, 'https://example.com/search?q=dental'), false);
  assert.equal(robotsCanFetch(robot, 'https://example.com/search?category=dental'), false);
});

test('a different product token does not match inside the full user-agent string', () => {
  const robot = parseRobots([
    'User-agent: aem',
    'Disallow: /',
    'User-agent: *',
    'Allow: /',
  ].join('\n'));

  assert.equal(robotsCanFetch(robot, 'https://example.com/'), true);
});

test('HTML inspection retains nested sections and div cmp classes without SVG titles', () => {
  const result = inspectHtml([
    '<html><head><title>Plans</title></head><body>',
    '<section class="cmp-parent"><h2>Section title</h2>',
    '<section><div class="cmp-card cmp-card--featured">Nested</div><div class="cmp-card">Another</div></section>',
    '<svg><title>Close menu</title></svg></section>',
    '</body></html>',
  ].join(''));

  assert.equal(result.title, 'Plans');
  assert.deepEqual(result.component_classes, ['cmp-card', 'cmp-card--featured', 'cmp-parent']);
  assert.equal(result.class_counts['cmp-card'], 2);
  assert.equal(result.class_counts['cmp-parent'], 1);
  assert.equal(result.sections.length, 2);
  assert.match(result.sections.find((section) => section.tag === 'section').text, /Nested/);
});

test('gzip-compressed sitemap bodies are decoded', () => {
  const xml = '<urlset><url><loc>https://example.com/page</loc></url></urlset>';
  assert.equal(
    decodeSitemapBody(gzipSync(Buffer.from(xml)), 'https://example.com/sitemap.xml.gz', 'application/gzip'),
    xml,
  );
});

test('non-HTML page bodies are not read and redirects cannot escape the path scope', async () => {
  let outsideRequests = 0;
  const fixture = await startServer((request, response) => {
    if (request.url === '/section/document.pdf') {
      response.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': 6_000_000,
      });
      response.end(Buffer.alloc(6_000_000));
      return;
    }
    if (request.url === '/section/redirect') {
      response.writeHead(302, { Location: '/outside/page' });
      response.end();
      return;
    }
    if (request.url === '/outside/page') outsideRequests += 1;
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html></html>');
  });

  try {
    const pdf = await fetchResource(`${fixture.origin}/section/document.pdf`, 5, {
      originHost: fixture.host,
      pathPrefix: '/section/',
      bodyTypes: new Set(['text/html']),
    });
    assert.equal(pdf.contentType, 'application/pdf');
    assert.equal(pdf.body.byteLength, 0);

    await assert.rejects(
      fetchResource(`${fixture.origin}/section/redirect`, 5, {
        originHost: fixture.host,
        pathPrefix: '/section/',
      }),
      /outside crawl scope/,
    );
    assert.equal(outsideRequests, 0);
  } finally {
    await fixture.close();
  }
});

test('transient HTTP failures are retried during the same run', async () => {
  let requests = 0;
  const fixture = await startServer((_request, response) => {
    requests += 1;
    if (requests === 1) {
      response.writeHead(503, { 'Retry-After': '0' });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>Recovered</title></head></html>');
  });

  try {
    const result = await inspectPageWithRetries(
      `${fixture.origin}/page`,
      { timeout: 5, retries: 1, pathPrefix: null },
      { wait: async () => {} },
      parseRobots('User-agent: *\nAllow: /'),
      fixture.host,
    );
    assert.equal(result.page.title, 'Recovered');
    assert.equal(requests, 2);
  } finally {
    await fixture.close();
  }
});

test('a failed robots.txt fetch is recorded and exits unsuccessfully', async () => {
  const fixture = await startServer((_request, response) => {
    response.writeHead(503, { 'Content-Type': 'text/plain' });
    response.end('Unavailable');
  });
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'block-discovery-'));
  const outputPath = path.join(outputDir, 'inventory.json');

  try {
    const exitCode = await main([
      `${fixture.origin}/`,
      '--delay', '0',
      '--out', outputPath,
    ]);
    const result = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(exitCode, 1);
    assert.equal(result.complete, false);
    assert.match(result.failures[0].error, /HTTP Error 503/);
  } finally {
    await fixture.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('a gzip sitemap is crawled into HTML-only page inventory', async () => {
  let origin;
  let sitemap;
  let sitemapRequests = 0;
  const fixture = await startServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml.gz`);
      return;
    }
    if (request.url === '/sitemap.xml.gz') {
      sitemapRequests += 1;
      if (sitemapRequests === 1) {
        response.writeHead(503, { 'Retry-After': '0' });
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/gzip' });
      response.end(sitemap);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>Page</title></head><body><div class="cmp-hero">Hi</div></body></html>');
  });
  origin = fixture.origin;
  sitemap = gzipSync(Buffer.from([
    '<urlset>',
    `<url><loc>${origin}/start</loc></url>`,
    `<url><loc>${origin}/page</loc></url>`,
    '</urlset>',
  ].join('')));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'block-discovery-'));
  const outputPath = path.join(outputDir, 'inventory.json');

  try {
    const exitCode = await main([
      `${fixture.origin}/start`,
      '--delay', '0',
      '--workers', '2',
      '--max-pages', '5',
      '--out', outputPath,
    ]);
    const result = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(exitCode, 0);
    assert.equal(result.pages_crawled, 2);
    assert.equal(result.complete, true);
    assert.equal(sitemapRequests, 2);
    assert.deepEqual(result.pages[0].component_classes, ['cmp-hero']);
  } finally {
    await fixture.close();
    await rm(outputDir, { recursive: true, force: true });
  }
});
