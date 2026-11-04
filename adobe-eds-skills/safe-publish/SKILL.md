---
name: safe-publish
description: Preview, publish or restore pages, fragments and sheets on an AEM Edge Delivery Services site that uses Document Authoring (DA) without surprises. It checks whether DA, preview and live agree and who saved in DA since the last publish, backs up before anything changes, shows exactly what live would gain or lose, publishes only the preview that was reviewed, then checks live and re-indexes; it can also roll a document back to a known-good version. Use it whenever you are about to preview, publish, republish or restore anything on a DA-based site, above all shared documents (homepage, nav, footer, metadata or redirects sheets), and whenever someone asks if it's safe to publish, what changed in DA, who edited a page, or how to undo an edit, even if they only say "publish this".
---

# Safe publish

On a Document Authoring site, DA is shared: anyone's save sits there unpublished until someone
previews or publishes the document, and then it goes out with whatever that person meant to
publish. Two things this prevents, both seen on a real migration:

- A bulk write put months-old copies of the homepage, nav and footer into DA. Preview showed the
  reverted homepage, and whoever published next would have shipped it, header and footer included.
- A redirects sheet regenerated for one batch dropped another batch's rows. Publishing it took
  five pages offline for six hours.

Both were visible beforehand: DA differed from live, and someone else had saved since the last
publish. This skill checks that every time, keeps a backup, and publishes only what was reviewed.

## What you need

- Node 18 or later. No packages to install.
- A DA sign-in. The scripts read the IMS token that `npx github:adobe-rnd/da-auth-helper token`
  caches (`~/.aem/da-token.json`), or `aem content`'s `.hlx/.da-token.json`. Sign in with its
  output sent to `/dev/null`, so the token never shows; never print it or paste it anywhere. When it
  expires (about a day), the scripts say so.
- The site: taken from the project's `.migration/project.json` or `fstab.yaml` when you run from the
  project root, or pass `--org <org> --site <site>` (and `--ref <branch>`, default `main`).

The scripts are in this skill's `scripts/` folder; call them by absolute path. Paths are written as
people write them: `/`, `/nav`, `/shop/`, `/redirects.json`, or without the leading slash (`index`,
`nav`). A path ending in `.json` is a sheet. Git Bash on Windows rewrites `/nav` into a Windows path
before the script sees it; the scripts undo that and say so. Writing paths without the slash avoids
it.

## Workflow

### 1. Check before you touch anything

```bash
node <skill>/scripts/status.mjs / /nav /footer /redirects.json
```

For each path: when it was previewed and published, who saved it in DA since then, how the DA
source differs from live (links, headings, images, text; rows for a sheet), whether preview equals
live, and a verdict:

| Verdict | Meaning | What to do |
|---|---|---|
| in sync | DA, preview and live agree | go ahead |
| not live yet | first publish | review the preview, then publish |
| DA changes are previewed, not published | someone previewed changes | find out whose and whether they're ready |
| DA has changes that are not on preview or live | unpublished saves in DA | stop: see step 2 |
| DA matches live, preview differs | a stray preview | preview again to line it up |
| a redirect row covers this path | the redirects sheet sends visitors elsewhere, so the page can't be seen | rebuild and upload the redirects sheet so preview shows the page; publish the page, then the sheet straight after; re-index the page |

Check every shared document a change touches, not just the one you're editing. A header or footer
fragment, the bulk metadata sheet and the redirects sheet affect every page.

### 2. When DA holds changes you didn't make

Someone's work is waiting there, or something overwrote good content. Find out which:

```bash
node <skill>/scripts/versions.mjs /footer            # who saved, when; * = after the last publish
node <skill>/scripts/compare.mjs da:/footer live:/footer
```

Report it to the person you're working for: what differs, who saved it, when. Don't publish someone
else's unreviewed work, and don't overwrite it, until they decide. If they decide to restore the
live version, go to step 5.

### 3. Dry run, then preview

```bash
node <skill>/scripts/publish.mjs /footer                # dry run: the checks, nothing written
node <skill>/scripts/publish.mjs /footer --preview      # back up, preview, compare with live
```

`--preview` saves the DA source, the preview and live renderings and the history to
`~/.safe-publish/<org>-<site>/<time>/` (outside the project and the temp folder), previews, then
prints what publishing would change: the differences between the new preview and live. It records
that preview as reviewed.

It refuses to write while DA holds changes that differ from live and were saved since the last
publish, unless you add `--accept-drift`. Add it only once those changes have been looked at and
are meant to go out, or meant to be replaced.

### 4. Publish what was reviewed

Show the person the preview's differences and get their go-ahead: publishing changes the live site.
Then:

```bash
node <skill>/scripts/publish.mjs /footer --publish
```

It publishes only when the preview is still the one reviewed (someone else re-previewing in
between stops it). It then:
- waits until live equals the reviewed preview;
- compares the `<head>` metadata;
- re-indexes the page (publishing doesn't always update its index entry: the homepage's stayed
  three weeks old).

### 5. Restore a known-good version

```bash
node <skill>/scripts/publish.mjs /footer --from version:<snapshot url> --preview --accept-drift
node <skill>/scripts/publish.mjs / --from file:<backup or reference copy> --preview --accept-drift
node <skill>/scripts/publish.mjs / --from da:/drafts/home-reference --preview --accept-drift
```

`versions.mjs` lists snapshot URLs, but only for saves that were previewed or published. For other
states use a backup (`~/.safe-publish/...`) or a reference copy kept in DA.

Before restoring, `compare.mjs file:<copy> live:/x` shows how close the copy is to live: content,
images and the copy's metadata rows. A reference copy kept as a draft often carries draft-only rows
(its own footer, `Robots: noindex`) that must not reach the real page, and it may predate later
changes, such as images added since. When the aim is "back to what's live", the preview after the
restore should be identical to live: the script says so. Then there's nothing to publish.

## Shared sheets

Redirects, bulk metadata, search suggestions: one sheet, many owners. Before publishing one:

- run `status.mjs` on it, and check the rows only in DA and only on live;
- if a tool regenerated it, confirm that every row it dropped belongs to a page that is live or
  will be published with it;
- publish the pages a sheet change depends on in the same session, pages first.

On a migration, the `legacy-redirects` skill (if installed) builds, checks and uploads the
redirects sheet; publish it with this one.

## Code and content order

Preview and live run the main branch's code. Content that needs new code (a new block, new block
markup, extra images a block will combine) breaks preview and live until that code merges. Merge the
code first, check the content on a draft with the branch's code locally, then preview and publish
the real document.

## What this skill doesn't do

Unpublishing, deleting and bulk operations are left to the admin API or an operations skill. Apply
the same discipline to them: status first, backup, and the person's go-ahead before anything goes
live.

More detail (verdicts, what the comparisons see and miss, the APIs used, recovering when something
went out wrong): `references/details.md`.
