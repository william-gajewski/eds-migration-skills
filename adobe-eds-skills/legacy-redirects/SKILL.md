---
name: legacy-redirects
description: Build, check and upload the redirects sheet that keeps a partly migrated AEM Edge Delivery Services site (Document Authoring) free of 404s. Every link to a page not migrated yet goes to that page on the legacy site, rows drop out as pages arrive, and nothing goes live until the pages behind the dropped rows are published. Use it after every import or publishing batch of an EDS migration, whenever someone mentions redirects, redirects.json, 404s, broken or dead links, links to the old site, retired or renamed URLs, or a migrated page that redirects instead of showing, and before uploading or publishing a redirects sheet, even if they only say "run the redirects tool" or "some links 404".
---

# Legacy redirects

During a phased migration, migrated pages link to pages that haven't been migrated yet, and each of
those links 404s unless a redirect sends it to the legacy site. The redirects sheet does that, and it
has to shrink as pages arrive: on Edge Delivery Services **a redirect row wins over a page at the
same path**, on preview and live. A page published under a row can't be reached.

Two failures this skill exists to prevent, both seen on a real migration:

- A regenerated sheet dropped the rows of five pages that existed in DA but weren't published.
  Publishing the sheet 404ed those five URLs for six hours.
- A sheet built while the site rate-limited the run came out with 13 of its 466 rows.

## What you need

- Node 18 or later. No packages to install.
- A DA sign-in: the IMS token that `npx github:adobe-rnd/da-auth-helper token` caches in
  `~/.aem/da-token.json`. Run it with its output sent to `/dev/null`; never print the token.
- The project's config, `.migration/redirects.config.json` (or `--config <file>`). Run the scripts
  from the project root, calling them by absolute path (`<skill>/scripts/...`).

## Set up once per project

```bash
node <skill>/scripts/init.mjs --source https://www.legacy.example [--prefix partners=https://partners.legacy.example]
```

This writes the site, the legacy origins and the nav and footer fragments that the bulk metadata
sheet names. Write a prefix without its leading slash: Git Bash on Windows rewrites `/partners=...`
into a Windows path before the script sees it, and the script refuses the result. Then add what a crawl of the pages can't find on its own (keys and examples in
`references/config.md`):

- **fragments** that blocks load in the browser (side navs, shared panels, regional headers). Their
  links are in no page's HTML.
- **sheets** whose rows hold links a block renders (lists, directories): the link column and, if the
  sheet keeps each item's legacy URL, that column too.
- **force**: rows that must always exist. These are retired or renamed URLs, drafts that stay
  redirected, and legacy URLs that aren't valid EDS paths (mixed case) pointing at our lowercase page.
- **sources** with a `prefix` when a section comes from another legacy host (`/partners/x` is
  `partners.legacy.example/x`). Add `offsite: "keep"` when that host sends some pages to a login and
  visitors should still be sent to the page.

Commit the config with the project's code: it's the record of every forced row and why.

## Each batch

### 1. Build

```bash
node <skill>/scripts/build.mjs
```

It reads every page in the live query index, plus the fragments and the sheets. It finds the internal
links that 404 on live, re-checks every current row, and writes `redirects.json` and `report.md` to
`~/.legacy-redirects/<org>-<site>/<time>/`. It changes nothing on the site. A few hundred pages take
about three minutes.

Each 404ing link, and each current row, ends up as one of these:

| Found | Row |
|---|---|
| in `force` | the forced destination |
| a DA document at the path | none: publish the page instead |
| a DA folder index (`/x/index`) | `/x` -> `/x/` (an index page is served only at the trailing slash) |
| the legacy page doesn't exist either | none: fix the link |
| the legacy site redirects to a page we have | our page |
| anything else | the legacy URL |

When requests fail (rate limiting, an outage), the build stops and writes nothing. Run it again
later. The scripts keep under the platform's limits, but other tools may be hitting the same site.

### 2. Read the report

- **Dropped rows.** Every row whose path now has a DA document drops out, published or not. A dropped
  row whose page isn't published makes that URL 404 on live as soon as the sheet is published. Either
  publish those pages with the sheet, or keep their rows (add them to `force`) until they're ready.
  If the pages belong to someone else's batch, ask before publishing either.
- **New and changed rows**: links added since the last build.
- **DA's sheet differs from live**: someone's regenerated sheet may be waiting in DA for its pages.
- **Links to DA pages that aren't published**, and **links whose legacy page doesn't exist**: these
  get no row, so fix them in content.
- **Absolute links to the legacy site for pages we have.** Imports keep them, and they leave the site.
  Make them relative.

### 3. Check the file

```bash
node <skill>/scripts/check.mjs --file <out>/redirects.json
```

It reports rows that redirect to themselves, destinations that don't load, chains (a destination
that is another row's source) and rows that would hide a published page. It takes about a minute
per 500 rows, because the admin API allows 10 requests a second.

### 4. Upload and preview

```bash
node <skill>/scripts/upload.mjs <out>/redirects.json            # dry run: what would change
node <skill>/scripts/upload.mjs <out>/redirects.json --apply    # back up, upload to DA, preview
```

It uploads the reviewed file itself, not a fresh build. It refuses in two cases, each with its own
override:

- DA's sheet differs from live, which may be someone's regenerated sheet: `--replace-da`.
- The file drops more than a quarter of live's rows, which is what a partial build looks like:
  `--allow-drops`.

It never publishes. Once it's uploaded, preview serves the pages whose rows dropped, so check them
there.

### 5. Publish, with the person's go-ahead

Publishing changes the live site, so show the person the report's dropped and new rows first. Then:

1. Publish the pages the dropped rows stood for.
2. Publish the sheet straight after (with the `safe-publish` skill if it's installed: status, then
   publish). In between, live still redirects those pages.
3. Re-index those pages (`POST https://admin.hlx.page/index/<org>/<site>/<ref>/<path>`). A page
   published while a row still covered it isn't indexed, so it's missing from search and
   breadcrumbs, and the next build can't see its links.
4. Build again: the new pages' links to unmigrated pages need rows. Check, upload and publish that
   sheet too.

## Audit the live sheet any time

```bash
node <skill>/scripts/check.mjs                 # the live sheet; --host preview for preview's
```

## Rules of thumb

- **Don't hand-edit the sheet.** The next build drops or rewrites hand-made rows. Put permanent rows
  in `force`, with a note in the config saying why.
- **The sheet is shared by every batch.** Publishing it publishes whatever DA holds, including rows
  another batch dropped for pages it hasn't published yet. Check DA against live before uploading or
  publishing.
- **Delivery matches a row's source exactly.** A mixed-case or trailing-hyphen legacy URL can have a
  row, but no page can live at that path: EDS turns document names into lowercase a-z, 0-9 and `-`.
  The admin status API tidies paths the same way, so its answer for such a path is about another
  one. The scripts compare paths exactly.
- **Legacy hosts.** Some answer HEAD with 403, so the scripts use GET for them. A legacy page that
  redirects within its own site to a page we have becomes a row to our page.

## What this skill doesn't do

It doesn't publish (use `safe-publish`, or the admin API with the same discipline), rewrite links in
documents, or unpublish pages. For the config keys, the report's sections and the API calls, see
`references/config.md`.
