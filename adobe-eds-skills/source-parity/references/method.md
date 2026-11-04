# Parity method: details and pitfalls

Contents:
1. Choosing widths and finding the source's breakpoints
2. How the scripts see a page
3. False positives
4. Reading the source's CSS
5. CSS that holds at the pixel level
6. Edge Delivery Services projects
7. Interactions: menus, search, accordions
8. Reporting

## 1. Choosing widths and finding the source's breakpoints

Widths worth measuring:
- a small phone (360);
- the common phone (390);
- both sides of every breakpoint;
- the desktop widths the design was made for (often 1280 and 1440).

Find the breakpoints by probing a container or a heading on the source and reading the `@media`
conditions in its rules. Frameworks give you a head start:

| Framework | Usual breakpoints (min-width) |
|---|---|
| Bootstrap 4/5 | 576, 768, 992, 1200 (1400 in 5) |
| Tailwind | 640, 768, 1024, 1280, 1536 |
| Foundation | 640, 1024, 1200 |

Sites add their own on top (1024, 1080, 1100 are common for heroes), so read the rules rather than
assuming.

Watch for **gaps and overlaps** between ranges:
- **Gaps:** `(min-width: 768px) and (max-width: 990px)` next to `(min-width: 992px)` leaves 991px
  covered by neither, so the base (phone) rules apply there. Sweep 991 and 992 to see whether the
  source has such a gap.
- **Overlaps:** a `(width <= 992px)` rule and a `(width >= 992px)` rule both apply at exactly 992.

Our own code should use non-overlapping pairs (`width < 992px` / `width >= 992px`). A source gap is
a bug you note, not one you copy, unless asked.

## 2. How the scripts see a page

- **Device.** Below `--mobile-below` (default 992) the page opens as a phone: a phone user agent,
  `isMobile`, touch, at the given width and 900px tall (844 for `interact.mjs`). From there, a
  desktop browser. Some sites change markup by user agent; if the two sides disagree only at the
  threshold, sweep with `--mobile-below` set to the source's own phone breakpoint.
- **Waiting.** Each page waits 2.5 seconds after `load` for fonts and late scripts.
- **Consent banners.** Common ones are closed without accepting (OneTrust, Cookiebot, TrustArc).
  For another, pass `--consent "<its close button selector>"`.
- **Scrolling.** The page is scrolled through before measuring, so lazy images get their height,
  then it's back at the top. The `-fold.png` shot is taken before scrolling: the first screen as a
  visitor sees it.
- **What's dumped:** every visible element with its own text, every image, link, button and input,
  with its box (page coordinates) and type. Elements inside a closed drawer or a zero-height
  `overflow: hidden` container are left out.
- **Pairing.** `diff.mjs` pairs elements by normalised text (images by file name), in document
  order, preferring the same tag.

## 3. False positives

- **Lazy images measured before they load** report 0 height. A footer logo that hadn't loaded once
  made a source footer look 136px shorter than ours. The scripts scroll first; if you measure
  some other way, scroll first too.
- **`curl` without `--compressed`** saves gzip bytes, so a "the deployed file lacks my change"
  check reads garbage. Use `curl --compressed`, or Node's `fetch`.
- **Pairing artifacts:**
  - A link that wraps a label on one side and a bare label on the other share the text, so they
    pair. Their DIFF line then lists font and colour differences that aren't real: look at the tags
    (`[a/div]`).
  - The same text in two places ("Learn More") pairs in order, so an extra one on one side pairs
    the rest wrongly.

  Both show up as local offsets.
- **Element boxes vs drawn pixels.** An icon button 39px tall on one side and 44px on the other is
  a box difference that may be invisible. Use `bbox.mjs` to compare what's drawn.
- **Photos.** Image services resize and re-encode, so photos differ in 0.01–0.1% of pixels even
  when identical. A tablet crop shown wider than its file (788px wide at 900) is scaled by both
  browsers alike.
- **Fonts.** A font kit from another host (an Adobe Fonts kit vs local copies) can move text by a
  pixel or two through different vertical metrics. When text is consistently off by 1–2px, compare
  the font sources before touching line-heights.
- **Weights the font doesn't have.** A computed `font-weight` of 100 on one side and 300 on the
  other draws the same glyphs when the font family only ships 300: the browser uses the nearest
  weight it has. On one migration's homepage check, 28 of 37 "differences" at 1280 were this. When a DIFF line
  lists only `fw` and the pixel diff is clean there, it isn't a difference.
- **Moving parts.** Carousels, videos, animated counters and rotating banners differ from shot to
  shot. Exclude their rows when judging the pixel percentage.
- **Different heights spoil the pixel diff.** Everything below the first shift differs, so fix
  heights first, then read the percentage.

## 4. Reading the source's CSS

- `probe.mjs` lists the rules that match an element, in stylesheet order, with their media
  conditions. Later rules win at equal specificity; `!important` wins over both.
- Inherited values (font, colour, line-height) come from ancestors: use `--ancestor-rules 1,2,3`
  to see their rules.
- Cross-origin stylesheets can't be read from the page; the probe names them. Fetch them with
  `curl --compressed` and search them directly.
- Copy units as the source writes them. If the source says `line-height: 1.1` or `padding:
  1.6rem`, use that, not the computed `35.2px` or `25.6px`. Chrome rounds px values to 1/64px, and
  a converted value can round differently, which shows up as one-pixel edges further down the page.
- **Layout systems.** When the source positions things with flex sizes (`flex: 1 1 0%`, `width:
  90%` beside `width: 10%`), reproduce the same sizes. Then elements land where theirs land at
  every width: a logo "a little left of centre" because its column is 90% of the row, for example.
- **Overlays.** A text block over a photo, centred with auto margins in a full-height container,
  starts at the top when it's taller than the photo. `justify-content: safe center` does the same.

## 5. CSS that holds at the pixel level

- **Scope.** Put page-specific overrides under the page's template class (`body.home ...`). Put
  shared header and footer changes in their blocks, and check the other page types that use them:
  regional or section variants, and other fragments using the same block.
- **Shared blocks.** Before changing a block's base CSS for one page, check which other pages use
  it. Prefer a page-scoped override, or extend an existing variant's selector list, when another
  page type already has the source's layout for that component.
- **Breakpoints.** Use `width < N` / `width >= N` pairs. Keep a block's own breakpoints (often 900
  in starter projects) from leaking into the source's range: if the source's tablet layout runs to
  991px, override the block's from-900 rules up to 991 for that page.
- **Art direction.** When the source swaps photo crops by width, use the source's crops and its
  switching points (read them from its `<picture>` sources), and keep each photo at its own
  proportions rather than cropping one image with `object-fit`.
- **Margins.** In flex and grid containers margins don't collapse, so a block's last margin adds
  to the next block's. Set the gap on one side only.

## 6. Edge Delivery Services projects

- **Which "ours".** `aem up` serves the working tree's code with preview content: use it while
  changing code, on a spare port (`aem up --port 3100 --no-open`) so a server the person already
  runs keeps running. Preview (`*.aem.page`) and live (`*.aem.live`) run the main branch's code, so
  a branch's change can only be measured locally until it merges.
- **Test copies of a page** (under `/drafts/`, say) can get a different header and footer from the
  bulk metadata sheet. Give the draft explicit `Nav` and `Footer` metadata rows, or you measure the
  wrong chrome.
- **Fragments.** Headers and footers are fragments loaded by script after the page; the scripts'
  wait covers them. Measure the header's height, which the site's stylesheet should reserve, so the
  page doesn't jump when the header arrives.
- **Content vs code.** Content changes (extra images for art direction, a moved heading) need the
  matching code first, or preview and live render them wrongly in between. Merge the code, then
  publish the content.
- **`.plain.html`** omits the `<head>`: compare metadata separately when checking a content change.

## 7. Interactions: menus, search, accordions

- Run `interact.mjs` on both sites with their own selectors, and compare the shots. Watch for:
  - a fixed drawer under an element that stays in the page flow (the bar covering the menu);
  - focus that doesn't follow the screen;
  - a box that doesn't take its full row.
- Tab order: after each step the script prints the focused element. For a bar laid out by CSS
  order or grid placement, make the DOM order match the screen.
- Escape and outside taps: step through them (`key:Escape`, `click:main`) and check the states.

## 8. Reporting

A report someone else can trust has:
- **The table:** width, ours, source, height difference, pixel percentage, before and after.
- **The changes:** each with the source rule it copies (selector and media condition).
- **What's left:** each item with a reason (source quirk not copied, content difference, range not
  matched yet, a known pairing artifact).
- **Where the evidence is:** the report folders and the most telling `compose` or `zoom` images.
