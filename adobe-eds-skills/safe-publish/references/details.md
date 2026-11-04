# Safe publish: details

Contents:
1. What the comparisons see, and what they miss
2. History and backups
3. The APIs the scripts call
4. When something went out wrong
5. Checklist for a shared document

## 1. What the comparisons see, and what they miss

- **Documents.** The DA source (`admin.da.live/source/...html`) is compared with the rendered
  `.plain.html` on preview or live, by:
  - **links:** text and target; host names and DA image URLs stripped, `&amp;` and `%20` decoded;
  - **headings:** level and text;
  - **images:** count and alt text;
  - **text:** all whitespace removed.

  The page metadata and section-metadata tables are left out on the DA side, since the pipeline
  turns them into `<head>` tags and classes. So:
  - a metadata change (title, description, template) is not seen by `status.mjs`; `publish.mjs`
    compares `<head>` tags after publishing;
  - a style-only change (a section style, a block variant) shows up only as identical text: compare
    the preview's `.plain.html` and look for the class.
- **Preview vs live** is compared byte for byte on `.plain.html`: the strictest test, and what
  "identical" means in the output.
- **Sheets.** Rows as sets: a row only in DA, only in live, or both. Row order is ignored. For a
  multi-sheet workbook, the `data` sheet is compared, or the first one.
- **What none of this sees:** images replaced by a different file with the same alt text, code
  changes (they come from git, not DA), and pages that 404 because of a redirect row. Check
  redirects with the redirects sheet's own status.

## 2. History and backups

- **DA history** (`versionlist`) records every save with its time and user. Only saves that were
  previewed or published keep a snapshot (a `versionsource` URL) that can be read back. Other saves
  are listed but can't be restored from DA.
- **`publish.mjs --preview`** saves the DA source and both renderings before each preview, in
  `~/.safe-publish/<org>-<site>/<time>/`. The DA source file there can be uploaded again with
  `--from file:<path>`; the renderings are for comparison.
- **Reference copies.** Keeping a document's reviewed version in DA (under `/drafts/`, for example)
  gives you a restore source that has no expiry. Remember that a draft may take its header and
  footer from bulk metadata: give it explicit `Nav` and `Footer` rows when you preview it.

## 3. The APIs the scripts call

| Call | Used for |
|---|---|
| `GET admin.da.live/source/<org>/<site>/<path>.html` (or `.json`) | the DA source |
| `PUT admin.da.live/source/...`, multipart field `data` | replacing the DA source (`--from`); another field name returns 200 and writes nothing |
| `GET admin.da.live/versionlist/<org>/<site>/<path>.html` | history |
| `GET admin.da.live/versionsource/...` | a snapshot |
| `GET admin.hlx.page/status/<org>/<site>/<ref>/<path>` | preview and live times |
| `POST admin.hlx.page/preview/...` and `/live/...` | preview, publish |
| `POST admin.hlx.page/index/...` | re-index (the response lists each index's record) |
| `GET <ref>--<site>--<org>.aem.page/<path>.plain.html` (and `.aem.live`) | renderings, with a cache-busting query |

All with the IMS token as `Authorization: Bearer`. Fetch with Node's `fetch`, which decompresses:
`curl` without `--compressed` saves gzip bytes, and "the file doesn't contain my change" checks then
read garbage.

### Redirect rows in the admin status

A row in the redirects sheet wins over a page at its path, on preview and on live. The admin status
shows a row at a path without a page as an entry of its own: status 200, a `lastModified` (when the
row arrived), `sourceLocation: "markup:*"` and `redirectLocation` / `configRedirectLocation`. Read
naively, that looks like a published page. The scripts count an entry as a page only when its
`sourceLocation` is a real document (`markup:https://content.da.live/...`), and they fetch
renderings without following redirects, so a redirected path reads as "not served" rather than as
the redirect's target page.

So for a path with a row, `status.mjs` says so, `--preview` refuses (preview would only show the
redirect: upload a rebuilt redirects sheet first), and `--publish` with a row on live only publishes
the page, checks through the admin status that it's there, and leaves the re-index until the sheet
without the row is published (an index request made while the row covers the path does nothing).

The status API also tidies paths: lowercase, and characters other than a-z, 0-9 and `-` become `-`
(`/x/JaneDoe` reports on `/x/janedoe`). A row whose source is a mixed-case legacy URL still works on
delivery, which matches the row exactly.

## 4. When something went out wrong

1. **Get live back first.** Restore the DA source from the backup or a snapshot (`publish.mjs
   --from ... --preview --accept-drift`), check the preview's differences, then publish.
2. **Pages that went missing.** If a redirects sheet dropped rows, either publish the pages the rows
   stood for, or restore the sheet's previous version and publish it.
3. **Re-index** what was republished.
4. **Write down what happened:** the times, the rows or documents, and how it was noticed. That's
   what makes the next person check.

## 5. Checklist for a shared document

- `status.mjs` on the document, and on anything it depends on.
- Nothing saved in DA by others since the last publish, or they've agreed.
- `--preview`, then read the "what publishing changes" lines out to the person.
- Their go-ahead.
- `--publish`; live identical to the reviewed preview; `<head>` the same; re-indexed.
- Their pages are fine: for a fragment or sheet, open two or three pages that use it.
