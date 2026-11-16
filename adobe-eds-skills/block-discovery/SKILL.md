---
name: eds-block-discovery
description: Analyze an existing website for an Adobe Experience Manager Edge Delivery Services migration. Discover pages, inspect page sections and recurring patterns, consolidate them into a reusable block inventory, map blocks to pages, and estimate implementation effort. Use when asked to assess a website, count EDS blocks/components, plan an EDS migration, or produce a block inventory.
---

# EDS Block Discovery

## Purpose

Produce an evidence-based estimate of the **unique custom EDS blocks** needed to migrate a
website. Analyze the whole in-scope site, not just its homepage. Optimize for the smallest
maintainable block set without hiding genuinely different structures or behaviors inside one
overly generic block.

This skill is for discovery and estimation. It does not automatically implement blocks or migrate
content unless separately requested.

## Inputs

Required:
- Public website URL or an accessible local site export.

Optional:
- Sitemap URL/XML, explicit URL list, page exclusions, authenticated browser session, screenshots,
  design files, existing EDS repository, existing block library, authoring requirements, target
  breakpoints, and migration constraints.

If the user has not specified the scope, ask whether the analysis should cover the entire domain or
a section/subdirectory. Do not ask for information that can be discovered safely from the site.

## Workflow

### 1. Establish scope and evidence

1. Normalize the starting URL and identify the canonical host.
2. Find `robots.txt`, sitemap references, sitemap indexes, and XML sitemaps where accessible.
3. Discover internal links from navigation, footer, and page content if a sitemap is absent or
   incomplete.
4. Respect robots directives, access controls, rate limits, and the user's stated exclusions. Do
   not attempt to bypass authentication, paywalls, bot protections, or access restrictions.
5. Record redirects, canonical URLs, HTTP status, fetch failures, and pages excluded from scope.
6. Deduplicate URLs by normalized canonical URL; retain meaningful query parameters only when they
   represent distinct content.
7. Report crawl limits and coverage. A partial crawl must never be described as a complete site
   audit.

Use `scripts/site_inventory.mjs` as a first-pass inventory helper:

```bash
node <skill>/scripts/site_inventory.mjs https://www.example.com \
  --max-pages 500 --workers 4 --path-prefix /section/ \
  --out <work-dir>/site-inventory.json
```

The helper is a polite, same-host, public-page crawler. It follows robots.txt, sitemap URLs, and
internal links up to the page limit and records page metadata and semantic section observations.
Use `--path-prefix` to keep sitemap seeds and discovered links within a requested subdirectory.
`--workers` bounds concurrent fetches; `--delay` is the minimum time between request starts and is
increased when robots.txt specifies a longer crawl delay. When writing to a file, the helper
periodically saves an atomic, resumable checkpoint. If interrupted, continue with the same URL and
output path plus `--resume`; transient failures are retried up to `--retries` times (default one).
It does not execute JavaScript, authenticate, or establish that a site is fully covered. Inspect
the output and use browser inspection for rendered or interactive content.
Treat this JSON as temporary working data, not a deliverable. Remove it and other crawl scratch
files after producing the final report and block inventory.

### 2. Inspect pages and page archetypes

For every in-scope page, inspect:
- title, canonical URL, page type/archetype, and primary navigation path;
- header, navigation, footer, breadcrumbs, and global notices;
- ordered content sections and their DOM/semantic structure;
- headings, text, images, video, links, cards, lists, tables, forms, and embeds;
- interactive behavior: tabs, accordions, carousels, menus, filters, search, modals, pagination,
  and forms;
- responsive differences at representative desktop, tablet, and mobile widths;
- accessibility semantics, keyboard behavior, and meaningful ARIA attributes;
- external services, APIs, analytics-dependent UI, and other integration dependencies.

Prefer rendered browser inspection (for example, Playwright or an available browser agent) for
JavaScript-rendered pages and interactive behavior. Use screenshots and DOM evidence together. Do
not infer functionality from appearance alone.

Group pages into archetypes such as home, landing, product, article, listing, detail, campaign,
contact, and utility. These are page templates, not automatically EDS blocks.

### 3. Identify block candidates

For each visually or functionally distinct section, capture:
- observed label/name and page URL;
- position/order on page;
- concise purpose and content model;
- DOM signature: relevant tag hierarchy, stable class names, data attributes, and child patterns;
- visual signature: layout, columns, media placement, background, spacing, typography, and
  responsive behavior;
- interaction signature and dependencies;
- authoring fields and content constraints;
- evidence reference (URL, screenshot, selector, or observation note).

Do not equate every `<section>`, row, or wrapper with a block. A block is a reusable authorable
content/behavior unit. Page layout wrappers, headings, paragraphs, links, and simple lists may be
default document content or sections rather than custom blocks.

### 4. Consolidate candidates into reusable blocks

Compare candidates using all of the following:
1. Same purpose and authoring intent.
2. Same underlying content model and field relationships.
3. Same structural/layout behavior.
4. Same interaction contract.
5. Variations can be expressed safely through block options, classes, or authored content without
   creating a confusing authoring experience.

Merge candidates when the structure and behavior are materially the same and differences are
content or controlled presentation variants.

Split candidates when they have materially different content models, interaction/state behavior,
accessibility requirements, responsive behavior, data sources, or authoring workflows.

Do not merge solely because two sections look similar. Do not split solely because colors, images,
copy, alignment, or spacing differ.

For every merge/split decision, record a short rationale and confidence (high/medium/low). Flag
uncertain pairs for human review rather than forcing a decision.

### 5. Check existing EDS capabilities and project blocks

If an EDS repository is available:
- inspect existing `blocks/`, `scripts/`, `styles/`, `models/`, `filters/`, and project
  conventions;
- identify blocks that already satisfy a candidate, blocks that need extension, and genuinely
  new blocks;
- avoid recommending a duplicate of an existing block;
- distinguish project-specific blocks from standard document structures and reusable shared
  utilities.

If no repository or block library is supplied, label the result as a **greenfield estimate**. Do
not claim that a candidate is already available in the project.

### 6. Classify the final inventory

Use these categories:
- Global: header, navigation, footer, breadcrumb, announcement.
- Content: hero, image/text, cards, teaser, quote, stats, content list.
- Interactive: tabs, accordion, carousel, filter, search, modal.
- Media: video, gallery, media viewer, dynamic media integration.
- Forms: contact, lead, application, embedded form.
- Specialized/integration: map, calculator, API-driven widget, third-party embed.
- Standard document structure: headings, paragraphs, lists, tables, links, and simple
  layout/content patterns that do not require a custom block.

A header/footer may be implemented as site-level EDS structure rather than an ordinary content
block. Report them separately and state the implementation assumption.

### 7. Estimate effort

Estimate implementation effort in **developer-days**, not elapsed calendar days. Use the following
starting ranges and adjust with evidence:
- Low: 0.5–1.5 days.
- Medium: 2–4 days.
- High: 5–10 days.
- Very high: 10+ days; break into independently estimable work items.

Include in each estimate the block's authoring model, HTML decoration, CSS/responsive work,
JavaScript/accessibility, unit or browser tests, and integration work as applicable. State what is
excluded (content migration, DAM asset cleanup, author training, QA/UAT, deployment, analytics,
translations, etc.).

Do not multiply the effort for one block by its occurrence count. Reuse count informs testing and
authoring validation, not the number of implementations. Add separate effort for distinct
variants only when they materially add implementation complexity.

Provide low/likely/high totals and assumptions. Avoid false precision; ranges are preferred.

### 8. Validate coverage

Before finalizing:
- ensure every discovered in-scope page is mapped to an archetype;
- ensure every observed section is mapped to a block, standard structure, global structure,
  out-of-scope item, or unresolved candidate;
- verify repeated candidates were checked for consolidation;
- verify unique blocks are not confused with block occurrences or variations;
- list inaccessible, uninspected, and dynamically hidden content;
- clearly separate observed facts, inferred recommendations, and open questions.

## Required deliverables

Create only these two files:

1. **Block discovery report** — executive summary, crawl/inspection coverage, unique custom block
   count, global structures, standard EDS content, key consolidation decisions, effort range,
   risks/open questions, and recommended implementation sequence. Summarize page coverage and
   evidence; do not add separate page-inventory, sitemap-inventory, or page-to-block-matrix files.
2. **Block inventory CSV** — one row per recommended block, including its purpose, authoring model,
   variants, occurrence count, complexity, effort range, integrations, confidence, evidence pages,
   and notes. Use `assets/block-inventory-template.csv` as the spreadsheet-ready template.

Use `references/report-schema.md` as the internal data shape for preparing these deliverables;
do not emit a separate JSON report unless the user asks for one. Crawl data, page mappings, and
sitemap entries are working evidence only and should not be retained as additional deliverables.

## Counting rules

Always report these as separate numbers:
- **Unique custom blocks**: distinct reusable block implementations recommended.
- **Block occurrences**: total placements across all pages.
- **Block variations**: supported options/styles within a block.
- **Global structures**: site-wide elements such as header/footer, reported separately unless the
  project explicitly models them as blocks.
- **Standard EDS structures**: content handled without custom block code.
- **Existing blocks reused**: already present in the supplied project/repository.

Never add occurrences or variations to the unique block count.

Every block-inventory row must populate `occurrence_count`; never leave it blank or use zero to
mean unknown. Use an internal page-to-block evidence map while analyzing and deduplicate URL
aliases by canonical page. Count verified placements when directly observed; otherwise use an
estimated page-appearance count and label it as an estimate in `notes`, not as an exact placement
count. Use `unverified` when no defensible count can be derived. Do not export the internal
page-to-block map as a separate file.

## Output quality rules

- Never invent pages, behavior, or component requirements.
- Cite each block recommendation with at least one evidence page or mark it as inferred.
- Use concise, consistent, kebab-case block names.
- Include confidence and unresolved questions.
- Do not call a crawl complete if coverage is partial.
- Do not present effort ranges as commitments.
- Prefer reuse, but do not create an unmaintainable mega-block with dozens of unrelated modes.
