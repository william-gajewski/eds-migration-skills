---
name: source-parity
description: Measure how closely a rebuilt or migrated page matches the original site it replaces, and find exactly what to change. Captures both pages at chosen widths, matches elements by text to report position, size and type differences, pixel-diffs full-page screenshots, sweeps widths, and reads the original site's own CSS rules with their media queries, so breakpoints and values are copied rather than guessed. Use it whenever someone wants a migrated page (AEM Edge Delivery Services, any CMS or framework rebuild) to match, look the same as, or be pixel-perfect with the legacy, source, old or live site; asks why a page looks different on phones, tablets or desktop; wants the source's breakpoints, font sizes or spacing; or needs evidence of parity before publishing, even if they never say "parity".
---

# Source parity

A page rebuilt from another site (an Edge Delivery Services migration, a redesign port, any CMS move)
is "done" when it matches the original at the widths people use. Eyeballing two browser windows
misses most differences and guesses the rest. This skill measures instead: it captures both pages,
pairs their elements by text, diffs the pixels, and reads the original site's CSS, so every change
you make is backed by a number and every breakpoint is the source's own.

The scripts measure; your job is to read the results as described here and turn them into CSS or
content changes, then measure again.

## What you need

- Two URLs: **ours** and the **source**. For ours, pick what you are changing:
  - code in progress: a local dev server (`aem up` serves the working tree's code with preview
    content);
  - content in progress: preview;
  - what visitors see: live.
- Node 20 or later (Playwright needs it), and Playwright in the project. It's an optional
  dependency, so it doesn't need to be in package.json: `npm i --no-save playwright && npx
  playwright install chromium`. The migration starter kit makes it a devDependency.
- Run the scripts from the project root: they load Playwright from the current directory's
  `node_modules` (or from `PARITY_NODE_MODULES`). They live in this skill's `scripts/` folder, so
  call them by absolute path.
- Write results to a gitignored folder in the project (for example `parity/<page>`), not the system
  temp folder, which some systems clean out after a few days.

## Workflow

### 1. Sweep the widths

```bash
node <skill>/scripts/sweep.mjs --ours <our url> --source <source url> \
  --widths 390,768,1280 --out parity/home
```

At each width it opens both pages as a phone (below `--mobile-below`, default 992px: phone user
agent, touch) or a desktop browser, closes common consent banners, scrolls through so lazy content
loads, and writes:

- `report.md` and `report.json`: one row per width (page heights, matched elements, how many are
  offset, the share of differing pixels), then per width the shifts, local offsets and pixel bands;
- `diff-<w>.txt`: every matched pair with what differs;
- `ours-<w>-full.png`, `src-<w>-full.png`, `pixdiff-<w>.png` (red = differs), and `-fold.png` first
  screens.

Start with 390, 768 and 1280 if you don't know the source's breakpoints. Once you do (step 3), sweep
both sides of each one (767/768, 991/992, 1199/1200), a small phone (360) and the widest desktop the
source designs for (1440). Sweeps take about 15 seconds per width.

### 2. Read the report

- **Heights equal and pixels under about 0.2%**: that width matches. What's left is photo
  re-encoding and anti-aliasing.
- **Heights differ**: first compare the header, main and footer boxes on the first line of
  `diff-<w>.txt`, which tells you which region differs. Then read the **shifts** from the top. A
  shift is where the vertical offset between the two pages changes and stays changed, so something
  between those two elements has a different height. Each later shift adds to the earlier ones, so
  fix them in page order and re-sweep.
- **Local offsets**: a few elements sit differently and then the page lines up again. Usually it's
  an element's own box (a button 39px tall on one side and 44px on the other) or two different
  elements sharing a text (a link and its label). Check their DIFF lines before acting on them.
- **Heights equal but many pixels differ**: the difference is horizontal or visual (alignment,
  colour, an image crop). Find the bands in `pixdiff-<w>.png` and compare them with `compose.mjs`.
- **Ours scrolls sideways** (the report says so): something overflows. Find the widest element.
- **Only ours / only source** lists: elements without a partner. That's content that exists on one
  side only, or text that differs between the two.

### 3. Measure the source before changing anything

Start with its breakpoints. `breakpoints.mjs` lists every width the source's CSS switches at, over
one page or several, with how many rules use each and where `<picture>` sources switch images. It
also points out ranges that leave a width in neither (`max-width: 990px` next to `min-width:
992px` leaves 991px out). Vendor CSS counts too, so check which widths the page's own layout uses.

```bash
node <skill>/scripts/breakpoints.mjs --url <source url> [--url <another page>]
```

Then the values:

```bash
node <skill>/scripts/probe.mjs --url <source url> --width 390 \
  --text "Care for your whole life" --depth 5 --ancestor-rules 1,2
```

For each anchor (`--text` for an element's own text, `--sel` for a CSS selector, or `--anchors
file.json` for many), it prints:

- the element's box and type;
- its ancestors' boxes: padding, margin, flex, max-width;
- the source's CSS rules that match it, each with the `@media` condition it sits in.

Copy breakpoints and values from those rules, not from screenshots. A rule like `@media (min-width:
768px) and (max-width: 990px) { padding: 0 64px }` tells you the tablet range and its value exactly.
Probe each side of a breakpoint, and probe ours the same way to see which of our rules win.

When you don't know the source's markup yet, probe something easy to find (`--sel "header img"`,
`--text "Some heading"`) with `--no-rules` and a deep `--depth`. Its ancestors name the containers.
Then probe those containers, with rules, from an anchors file at each width. The same file works
for every width, so a table of values across widths takes one loop.

### 4. Change, then sweep again

Make the change in the project (CSS, block code or content), then re-run the sweep, first for the
widths it affects and then for all of them. Keep each round's report folder, so you can show the
before and after.

### 5. Look closer when numbers aren't enough

| Script | Use it for |
|---|---|
| `compose.mjs --width W --dir D name:oursFrom:oursTo[:srcFrom:srcTo]` | side-by-side crops of the two full pages, each at its own offsets |
| `zoom.mjs --width W --dir D --scale 4 name:x:y:w:h` | icons, logos, rules, corners, pixelated so the edges stay sharp |
| `bbox.mjs --width W --dir D name:x:y:w:h` | the drawn size and position of an icon or logo to the pixel (its box rarely tells you) |
| `interact.mjs --url U --width W --steps "shot:a;click:sel;wait:500;shot:b"` | menus, search boxes, accordions: their open states and focus order |
| `capture.mjs`, `diff.mjs`, `pixdiff.mjs` | the sweep's steps, one at a time |

Read the screenshots: the numbers tell you where to look, and the images tell you what is wrong.

### 6. Report

End with:
- the final table, from `report.md`;
- what you changed, and why (the source rule each change copies);
- what still differs, and why it was left: a source bug not copied, a content difference, a range
  out of scope.

When the work is going into a pull request, the before and after tables are the evidence.

## What not to fix

- **Source quirks.** Old sites have gaps between their own breakpoints: for example tablet rules
  that stop at 990px while desktop starts at 992px, so the page falls back to phone sizes at exactly
  991px. Note these and leave them, unless the person you're working for wants them copied.
- **Content differences.** Different text, a renamed link or an extra paragraph shows up as offsets
  too. Fix the content, not the CSS, or note it.
- **Source drift.** The source changes over time (a footer heading gains padding, a list grows), so
  an earlier match can stop matching. Re-sweep before you conclude that your own change broke
  something.

## More detail

Read `references/method.md` when a result doesn't make sense, or before the first sweep on a new
project. It covers:
- choosing widths and finding the source's breakpoints;
- every known false positive (lazy images, gzip, matching artifacts, fonts);
- CSS techniques that keep pixel-level matches stable;
- notes for Edge Delivery Services projects: test drafts, art-directed images, header and footer
  fragments, local vs preview vs live.
