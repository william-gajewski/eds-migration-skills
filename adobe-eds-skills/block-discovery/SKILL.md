---
name: block-discovery
description: After project-intake and before block implementation, identify the reusable EDS block candidates a source site requires, distinguish Adobe or project blocks from custom work, and produce an evidence-backed block inventory. Use when asked how many blocks a site migration needs or which blocks should be built.
---

# Block Discovery

## Purpose

Determine the smallest maintainable set of custom blocks needed to migrate a website to AEM
Edge Delivery Services (EDS). This skill follows `project-intake` and informs implementation
planning; it does not create blocks, migrate content, or estimate cost, duration, or developer-days.

Count custom blocks separately from their occurrences, variations, Adobe-provided blocks, project
blocks, global structures, and standard document content. Never call a sample-based result a
complete site audit.

## Inputs

Required:
- A public website URL.

Optional:
- Confirmed site scope, sitemap URL/XML, URL list, page exclusions, authenticated browser session,
  screenshots, design files, existing EDS repository or block library, authoring requirements,
  target breakpoints, and migration constraints.

The inventory helper accepts HTTP(S) URLs only; do not promise that it crawls local folders. If
scope or authorization for automated requests is unclear, clarify it before crawling.

## Workflow

### 1. Agree on scope and request budget

1. Normalize the starting URL and identify the canonical host and requested section.
2. Confirm with the user or site owner that automated requests are allowed, especially before a
   full-site crawl. Agree on the host, path, request/page limit, and any exclusions. Do not infer
   permission to crawl thousands of production URLs from a request to inventory blocks.
3. Check `robots.txt`, its sitemap references, and sitemap indexes. Respect robots rules, crawl
   delay, access controls, and the agreed request budget. Do not bypass authentication, paywalls,
   bot protections, or access restrictions.
4. By default, use sitemap counts and a representative sample of pages grouped by page template.
   Crawl more pages only when the agreed scope and budget justify it. Clearly report redirects,
   canonical aliases, failures, exclusions, sample size, and coverage.
5. Deduplicate pages by normalized canonical URL. Keep query parameters only when they represent
   distinct content.

For an approved crawl, use `scripts/site_inventory.mjs` as a first-pass inventory helper:

```bash
node <skill>/scripts/site_inventory.mjs https://www.example.com \
  --authorized-by "Site owner, YYYY-MM-DD" --contact crawler@example.com \
  --max-pages 500 --workers 4 --delay 1 --path-prefix /section/ \
  --out <projects>/<client>/discovery/site-inventory.json
```

For an explicitly scoped sample, provide a URL-list file instead of crawling a sitemap or
following page links:

```bash
node <skill>/scripts/site_inventory.mjs https://www.example.com \
  --urls <projects>/<client>/discovery/sample-urls.txt \
  --exclude /account/ --contact crawler@example.com \
  --out <projects>/<client>/discovery/site-inventory.json
```

The URL list contains one absolute URL per line. This mode does not follow links and can be used
without an authorization record for a sample. Sitemap or link-following crawls require
`--authorized-by`; caps over 500 also require it. Supply a public contact URL or email with
`--contact` when available. The saved crawl records authorization, User-Agent, requested and
effective delay, worker limit, exclusions, failures, and discovered documents separately from HTML
pages. Document URLs are counted, not downloaded as page evidence.

The crawler stays on the starting host, checks robots rules on requests and redirects, honors the
longer of `--delay` and robots `Crawl-delay`, and defaults to at most one request start per second.
It reads only HTML page bodies, caps response bodies at 5 MB, records sitemap failures, retries
transient fetch failures during the run, and saves an atomic checkpoint every 250 outcomes. Resume
an interrupted crawl with the same arguments plus `--resume`. Sitemaps can be nested and gzip
compressed. The helper does not execute JavaScript or establish complete coverage.
Its page evidence includes class-token element counts from the fetched HTML. Use these as markup
signals for occurrence analysis only after validating the class-to-block mapping on representative
rendered pages; do not treat arbitrary CSS classes or repeated card items as block placements.

Group the saved crawl before using it as page evidence:

```bash
node <skill>/scripts/analyze_inventory.mjs \
  <projects>/<client>/discovery/site-inventory.json \
  --out <projects>/<client>/discovery/grouped-inventory.json
```

The grouping helper trusts a canonical only when its authority matches the crawl host (case
insensitive, with a trailing hostname dot ignored). Otherwise it groups on the final served URL
and records the canonical as a risk. It normalizes trailing slashes, `.html`, and AEM
`/content/<site>/<locale>/.../home` aliases. Use final served URLs for citations; review redirect,
canonical, exclusion, and failure risks before sampling.

Keep the crawl JSON and the page-to-block evidence map as working evidence next to the deliverables,
outside the repository. Do not delete them after analysis: they support verification of the counts.
They are not additional user-facing reports.

### 2. Sample page templates

1. Use sitemap URL counts and available page metadata to group pages into archetypes such as home,
   landing, product, article, listing, detail, campaign, contact, and utility.
2. Select a few representative pages from each archetype, including materially different layouts,
   interaction patterns, and edge cases. Record the selection method and any unsampled groups.
3. Inspect those pages in a browser when possible. Check the header, navigation, footer, ordered
   content sections, media, forms, interactions, and representative responsive states.
4. Do not claim a section, behavior, or component was observed on pages that were not inspected.
   Extrapolate only from a stated pattern and label the inference and confidence.

### 3. Identify candidates and retain evidence

For each distinct authorable section, capture:
- observed name/purpose and candidate content model;
- canonical evidence page URL and page archetype;
- position, relevant DOM hierarchy, stable class names, and component classes such as `div.cmp-*`;
- visual/layout signature, responsive behavior, and interaction/dependency evidence;
- proposed authoring fields, constraints, and meaningful variants.

Do not treat every wrapper, `<section>`, row, heading, paragraph, simple list, or page template as a
block. Record candidates and their page mapping in the working evidence file. Cite accessible source
page URLs (and selectors or screenshots where useful); do not cite internal AEM repository paths as
evidence of a source-site component.

### 4. Consolidate candidates

Compare candidates using all of the following:
1. Same purpose and authoring intent.
2. Same underlying content model and field relationships.
3. Same structure and layout behavior.
4. Same interaction contract.
5. Differences can be expressed safely through authored content or controlled options.

Merge when structure and behavior are materially the same; split when content models, interaction
or state, accessibility, responsive behavior, data sources, or authoring workflows materially
differ. Do not merge solely for visual similarity or split solely for changes in copy, color, image,
alignment, or spacing. Record merge/split rationale and confidence.

Treat a multi-step flow as one workflow/block candidate, not one block occurrence per step URL.
Consolidate similarly structured checklist flows unless their purpose, content model, or interaction
contract requires separate authoring.

### 5. Check Adobe and project capabilities before counting custom work

1. If available, use Adobe's `block-collection-and-party` skill to check candidate coverage.
   Otherwise, check the current Adobe Block Collection catalog and cite the source and date checked.
2. Compare candidates against the full Block Collection set: accordion, breadcrumbs, cards,
   carousel, columns, embed, footer, form, fragment, header, hero, modal, quote, search, table,
   tabs, and video. Treat breadcrumbs as a header/navigation add-on when applicable. Form is
   deprecated and Modal is an autoblock; note those statuses rather than presenting them as
   ordinary recommended custom blocks.
3. Do not count a candidate as custom merely because the project repository was not supplied.
4. If an EDS project repository or library is available, inspect its `blocks/`, `scripts/`,
   `styles/`, `models/`, and conventions. Mark satisfied candidates as project reuse and identify
   extensions separately from new blocks.
5. Use these `implementation_status` values consistently: `custom`, `adobe-reuse`, `project-reuse`,
   `standard-structure`, `global-structure`, and `unresolved`. If a capability cannot be verified,
   label it unresolved rather than assuming it is absent.

### 6. Count and classify

Report these independently:
- **Unique custom blocks**: distinct implementations that need to be created.
- **Custom-block range**: when unresolved reuse or consolidation decisions prevent an exact total,
  report a confirmed minimum and a defensible maximum. Count only confirmed custom rows in the
  minimum; add only unresolved candidates that could plausibly require a new custom block to the
  maximum, and state the assumptions. Do not label the maximum as the confirmed count.
- **Block occurrences**: observed placements or estimated page appearances, without adding them to
  the custom-block count.
- **Block variations**: supported styles/options within a block, counted separately.
- **Adobe blocks reused**, **project blocks reused**, **global structures**, and **standard EDS
  structures**.

Use the candidate category `global`, `content`, `interactive`, `media`, `forms`, `specialized`,
`standard`, or `unresolved`.

Use `unresolved` when evidence does not establish a block boundary, behavior, authoring model, or
reuse status. Do not silently classify an unresolved candidate as custom or omit it from the
uncertainty range. Count variations only when they are meaningful supported authoring options; do
not count copy, image, color, alignment, or spacing changes as variations by themselves.

For each inventory row, use an integer `occurrence_count` only when there is a defensible number;
leave it empty when unknown and set `occurrence_method` to `unverified`. Otherwise set the method
to `verified placements` or `estimated page appearances`. Never put words such as `unverified` in
the numeric count. State how estimates were derived and their sample coverage. Count a cross-page
workflow once, not once for every step page. Do not count page templates as blocks.

### 7. Validate coverage and evidence

Before finalizing:
- ensure discovered pages are assigned to an archetype or explicitly excluded/unresolved;
- map each observed section to a candidate, an existing Adobe/project capability, standard
  structure, global structure, or unresolved item;
- verify candidate consolidations and status against the evidence map;
- reconcile unique custom block, occurrence, and variation totals independently;
- ensure report coverage, sample counts, and CSV evidence-page counts agree;
- list inaccessible, uninspected, dynamic, and unsampled content, with confidence and open questions.

### 8. Write the deliverables

Save client material outside the skill and project repositories, in
`<projects>/<client>/discovery/` (or the team's equivalent approved client-output folder).

Create only these two user-facing files:

1. **Block discovery report** — scope and authorization, sample/crawl coverage, unique custom block
   count, occurrence and variation totals, Adobe/project reuse, global structures, standard EDS
   content, consolidation decisions, evidence limitations, risks, and open questions.
2. **Block inventory CSV** — one row per candidate, including implementation status, purpose,
   authoring model, variations, numeric occurrence count and method, complexity, integrations,
   confidence, evidence pages, and notes. Use `assets/block-inventory-template.csv`.

Keep the crawl JSON and page-to-block map as internal working evidence next to those files, not as
additional reports and never in the repositories. Do not output developer-day, cost, or calendar
duration estimates; those are not reliable block-discovery measures and belong in later project
planning if requested.

## Output quality rules

- Never invent pages, behavior, or component requirements.
- Cite each recommendation with at least one source page or mark it inferred.
- Use concise, consistent, kebab-case candidate names.
- Keep unique blocks, occurrences, variations, and reuse statuses distinct.
- Do not call a sample or capped crawl complete.
- Prefer reuse without hiding materially different content models or interactions in a mega-block.
