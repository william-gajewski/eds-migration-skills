# Site checks

Smoke, accessibility and Lighthouse checks for this site, run against a local `aem up`, preview or
live. CI runs lint only; run these after a change, after each import batch, and before a demo or a
handover.

## Setup

```bash
npm install                       # playwright and axe-core are devDependencies
npx playwright install chromium   # once per Playwright version
```

Lighthouse needs Chrome (or `CHROME_PATH`). It runs `lighthouse@12` through npx, the version the
handover skill uses, so numbers from different days compare.

## Run

```bash
npm run check:smoke -- --host preview      # local (aem up on 3000, the default), preview, live or a URL
npm run check:axe -- --host live
npm run check:lighthouse -- --host live --device mobile
npm run check:lighthouse -- --url https://www.legacy.example/ --out parity/baseline/lighthouse.json
```

The paths come from `paths.txt`; `--paths a,b/c` or `--list <file>` picks others. In Git Bash,
leave out the leading slash or set `MSYS_NO_PATHCONV=1`: Git Bash turns `/about` into a Windows path.

| Check | Fails on | Writes |
|:--|:--|:--|
| `smoke.mjs` | HTTP errors, script errors, failed requests to the site, broken images, blocks that didn't load, sideways scrolling, at 390, 768 and 1280 (`--widths`). Warns on a missing h1 or an empty header or footer. | screenshots in `results/smoke-<host>/` |
| `axe.mjs` | axe-core violations (WCAG 2.1 A and AA, best practice) of serious or critical impact (`--fail-on`), at 1280 and 390. `--scope main` skips the header and footer. | `results/axe-<host>.json` |
| `lighthouse.mjs` | nothing: it reports the median of 3 runs per URL and device (`--runs`, `--device`) | `results/lighthouse-<host>.json` and `.md`, or `--out` |

`results/` is gitignored. aem.page and aem.live send `noindex`, so their SEO score is low by design.
