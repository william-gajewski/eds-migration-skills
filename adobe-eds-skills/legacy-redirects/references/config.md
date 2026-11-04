# legacy-redirects: config, report and APIs

## Contents

1. The config file
2. Keys
3. A worked example
4. The report, section by section
5. What the scripts call, and the platform's limits

## 1. The config file

`.migration/redirects.config.json` in the project (or any file, with `--config`). JSON, so no
comments: give a forced row a reason with `{ "to": ..., "why": ... }`. `init.mjs` writes a first
version; edit it from there.

```json
{
  "org": "acme",
  "site": "www",
  "ref": "main",
  "sources": [
    { "prefix": "/partners", "origin": "https://partners.acme.example", "offsite": "keep" },
    { "prefix": "", "origin": "https://www.acme.example" }
  ],
  "fragments": ["/partners/fragments/nav", "/partners/fragments/sidenav/claims"],
  "sheets": [
    { "path": "/partners/lists/news.json", "linkColumn": "Link", "sourceColumn": "Source" }
  ],
  "force": {
    "/shop": "/shop/",
    "/help": { "to": "/", "why": "the legacy /help is its home page" }
  },
  "ignore": ["^/(modals|fragments)/", "^/drafts/"],
  "sheet": "/redirects.json"
}
```

## 2. Keys

| Key | Default | Meaning |
|---|---|---|
| `org`, `site`, `ref` | `.migration/project.json`, `fstab.yaml`, `--org/--site/--ref`; ref `main` | the EDS site |
| `sources` | required | where each part of the site came from. `prefix` is our path prefix (`""` for the rest); `origin` is the legacy origin, where our `/prefix/x` was `origin/x`. The longest matching prefix wins. |
| `sources[].offsite` | redirect to where the legacy page goes | `"keep"`: when the legacy page redirects off its own host (to a login, say), keep the row pointing at the legacy page itself, which sends signed-in visitors on to it |
| `fragments` | `[]` | documents that blocks load in the browser. Their links are in no page's HTML. `/nav`, `/footer` and the nav and footer values in the bulk metadata sheet are always read. Fragments are read on preview and live. |
| `sheets` | `[]` | sheets whose rows hold links a block renders. `linkColumn` (default `Link`) holds our path. `sourceColumn`, if set, holds the item's legacy URL, which becomes the row's destination (useful when the link's path was tidied into a valid page path, e.g. a comma replaced). |
| `force` | `{}` | rows that are always written, before any other check: `"path": "destination"` or `"path": { "to", "why" }`. Use it for retired or renamed URLs, drafts in DA that must stay redirected, legacy URLs that can't be page paths (mixed case) pointing at our page, and folder paths (`/shop` -> `/shop/`). |
| `ignore` | `["^/(modals|fragments)/"]` | regular expressions for link paths never to redirect |
| `sheet` | `/redirects.json` | the redirects sheet |
| `index` | `/query-index.json` | the index that lists the site's pages. It must include every published page, so use the metadata index rather than a search index that excludes sections. |
| `bulkMetadata` | `/metadata.json` | the bulk metadata sheet (for nav and footer fragments); `false` to skip it |
| `ownOrigins` | `[]` | other origins that are this site (a production domain): absolute links to them count as internal |

## 3. A worked example

The project these scripts came from migrated a corporate site and its provider site into one EDS
site:

- `sources`: `/providers` came from `providers.<legacy>` with `offsite: "keep"`, because 35 provider
  pages redirect to a partner login; everything else came from `www.<legacy>`.
- `fragments`: 23 entries. The shop header and footer, the provider nav, footer and a shared panel,
  six provider side navs (each lists every page in its section, which gave 64 of 65 new rows one
  day), and twelve regional headers and footers.
- `sheets`: five provider list sheets rendered by a list block, with `Link` and `Source` columns.
- `force`: 13 rows. An old FAQ URL pointing at the migrated FAQ, the shop's old homes and its folder
  path, the provider home's folder path, the regional footers' `/help`, and seven leadership bios
  whose legacy URLs were mixed case or ended in a hyphen.

The first build reproduced the hand-maintained 505-row sheet row for row, apart from 11 rows whose
pages had just been imported into DA and weren't published. The report flagged them as "404s once
this sheet is published".

## 4. The report, section by section

- **Header.** Pages and fragments read, link targets found, how many 404, and the new sheet's row
  count against live's. It also says whether DA's sheet has the same rows as live.
- **Dropped rows.** For each: the path, its old destination, why it drops ("has a DA document", or
  "the legacy page returns 404: fix the link"), and whether the page is published. "NO" means the URL
  404s on live once the sheet is published. A row alone also has an entry in the admin status, so
  only a real source document counts as published.
- **New and changed rows.**
- **Links to pages that exist in DA but aren't published.** They 404 on live now and get no row,
  because a DA document exists. Publish the pages, or force rows for them.
- **Links whose legacy page doesn't exist either.** A row would only move the 404 to the legacy
  site; fix the link.
- **Absolute links to the legacy site for pages this site has.** Make them relative paths.

## 5. What the scripts call, and the platform's limits

| Call | Used for |
|---|---|
| `GET <live>/query-index.json`, `/metadata.json`, `<sheet>` | pages, fragments, the current sheet |
| `GET <live or preview><page>.plain.html` | links |
| `HEAD <live><path>` with redirects not followed | which links 404 |
| `GET <legacy origin><path>` (following redirects) | whether the legacy page exists, and where it goes |
| `HEAD admin.da.live/source/<org>/<site><path>.html` (and `/index.html`) | whether a DA document exists |
| `GET admin.da.live/source/<org>/<site>/redirects.json` | DA's copy of the sheet |
| `GET admin.hlx.page/status/<org>/<site>/<ref><path>` | whether a page is published (or previewed) |
| `POST admin.da.live/source/...` (multipart, field `data`) and `POST admin.hlx.page/preview/...` | upload and preview (upload.mjs only) |

Limits (https://www.aem.live/docs/limits):

- **aem.live and aem.page: 200 requests a second** from one IP per host, then 429. The scripts keep
  to 100.
- **Admin API: 10 requests a second** per project, then 429 with `x-retry-after` (often 60 seconds).
  The scripts keep to 8 and wait when told to.
- **A site can't have more than 100,000 redirects.** A full-site sheet of legacy URLs stays far below
  that, but a sheet of every legacy asset URL might not.
- **Document names** become lowercase a-z, 0-9 and `-`; anything else turns into `-`. A legacy URL
  outside that set can be a row's source, but never a page's path.

DA's own API has no published limit. The build treats any DA answer other than 200 or 404 as a
failure, because reading it as "no document" would keep a row over a page.
