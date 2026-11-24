import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeInventory, normalizePageIdentity } from './analyze_inventory.mjs';

test('page identities normalize trailing slashes, html suffixes, and AEM home aliases', () => {
  assert.equal(
    normalizePageIdentity('https://example.com/content/site/en/services/home.html'),
    'https://example.com/services',
  );
  assert.equal(normalizePageIdentity('https://example.com/services/'), 'https://example.com/services');
});

test('saved crawl grouping trusts same-host canonicals and flags unsafe or invalid values', () => {
  const result = analyzeInventory({
    start_url: 'https://Example.com./',
    complete: true,
    max_pages: 500,
    request_settings: { delay_seconds: 1, workers: 4 },
    documents: [{ url: 'https://example.com/guide.pdf' }],
    pages: [
      {
        url: 'https://example.com/services/home.html',
        final_url: 'https://example.com/services/',
        canonical: 'https://example.com/services',
      },
      {
        url: 'https://example.com/services/index',
        final_url: 'https://example.com/services/index',
        canonical: 'https://EXAMPLE.com./services/',
      },
      {
        url: 'https://example.com/content/site/en/about/home.html',
        final_url: 'https://example.com/content/site/en/about/home.html',
      },
      {
        url: 'https://example.com/redirect',
        final_url: 'https://example.com/served/',
        canonical: 'https://outside.example/other',
      },
      {
        url: 'https://example.com/broken-canonical',
        final_url: 'https://example.com/broken-canonical',
        canonical: 'http://[',
      },
      { url: 'https://example.com/flow/step-one' },
      { url: 'https://example.com/flow/step-two' },
    ],
  });

  assert.equal(result.groups.find((group) => group.canonical_page.endsWith('/services')).pages.length, 2);
  assert.ok(result.groups.some((group) => group.canonical_page.endsWith('/about')));
  assert.ok(result.groups.some((group) => group.canonical_page.endsWith('/served')));
  assert.ok(result.groups.some((group) => group.canonical_page.endsWith('/flow/step-one')));
  assert.ok(result.groups.some((group) => group.canonical_page.endsWith('/flow/step-two')));
  assert.deepEqual(result.documents, [{ url: 'https://example.com/guide.pdf' }]);
  assert.deepEqual(
    result.risks.map((risk) => risk.type).sort(),
    ['malformed-canonical', 'off-host-canonical', 'redirect', 'redirect'],
  );
  assert.equal(
    result.groups.find((group) => group.canonical_page.endsWith('/served')).citation_urls[0],
    'https://example.com/served/',
  );
  assert.equal(result.crawl.complete, true);
  assert.equal(result.crawl.request_settings.delay_seconds, 1);
});
