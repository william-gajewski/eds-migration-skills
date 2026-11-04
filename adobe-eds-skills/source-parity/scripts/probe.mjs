// Measure elements on a page at one width: for each anchor (found by its own text or by a CSS
// selector), its box and type, its ancestors' boxes (padding, margin, flex, max-width...), and the
// CSS rules that match it, each with the media query it sits in. On the legacy site this gives
// the exact values and breakpoints to copy, instead of values guessed from screenshots.
//
// usage: node probe.mjs --url <url> --width <px> [--text "Heading text"]... [--sel "css"]...
//          [--anchors anchors.json] [--depth 4] [--ancestor-rules 1,2] [--nth 0]
//          [--all-rules] [--no-rules] [--mobile-below 992] [--consent sel,...]
// anchors.json: [{ "name": "hero h1", "sel": "main h1", "depth": 6, "ancRules": [1, 2] },
//                { "name": "card", "text": "Shopping for a new plan", "nth": 0, "rules": false }]
import fs from 'node:fs';
import {
  CONSENT, isMain, list, loadPlaywright, num, openPage, parseArgs,
} from './lib/common.mjs';

// runs in the page
function probeAll({ anchors, allRules }) {
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const shown = (e) => e.getBoundingClientRect().width > 0;
  const find = (a) => {
    if (a.sel) return [...document.querySelectorAll(a.sel)].filter(shown)[a.nth || 0];
    const t = a.text.toLowerCase();
    return [...document.querySelectorAll('body *')].filter((e) => own(e).toLowerCase().startsWith(t) && shown(e))[a.nth || 0];
  };
  const nz = (v) => !/^(0px ?)+$/.test(v);
  const box = (e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const cls = typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).join('.')}` : '';
    return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${cls}`.slice(0, 110)
      + ` [x ${Math.round(r.left * 10) / 10}, y ${Math.round((r.top + window.scrollY) * 10) / 10}, ${Math.round(r.width * 10) / 10} x ${Math.round(r.height * 10) / 10}]`
      + ` ${cs.display}${cs.position !== 'static' ? ` position:${cs.position}` : ''}`
      + `${nz(cs.padding) ? ` padding:${cs.padding}` : ''}${nz(cs.margin) ? ` margin:${cs.margin}` : ''}`
      + `${cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? ` bg:${cs.backgroundColor}` : ''}${cs.backgroundImage !== 'none' ? ' bg-image' : ''}`
      + `${cs.boxShadow !== 'none' ? ` shadow:${cs.boxShadow}` : ''}`
      + `${cs.borderTopWidth !== '0px' || cs.borderBottomWidth !== '0px' ? ` border:${cs.borderTop} / ${cs.borderBottom}` : ''}`
      + `${cs.display.includes('flex') ? ` flex:${cs.flexDirection},${cs.justifyContent},${cs.alignItems}${cs.gap !== 'normal' ? `,gap ${cs.gap}` : ''}` : ''}`
      + `${cs.display.includes('grid') ? ` grid:${cs.gridTemplateColumns}` : ''}`
      + `${cs.maxWidth !== 'none' ? ` max-width:${cs.maxWidth}` : ''}${!['start', 'left'].includes(cs.textAlign) ? ` text-align:${cs.textAlign}` : ''}`
      + `${cs.order !== '0' ? ` order:${cs.order}` : ''}${cs.overflow !== 'visible' ? ` overflow:${cs.overflow}` : ''}`;
  };
  const type = (e) => {
    const cs = getComputedStyle(e);
    return `font: ${cs.fontFamily.split(',')[0].replace(/"/g, '')} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight}, letter-spacing ${cs.letterSpacing}, color ${cs.color}${cs.textTransform !== 'none' ? `, ${cs.textTransform}` : ''}`;
  };
  const unreadable = new Set();
  const NOISE = /^\*, ::before, ::after|^\*,\s*::?before|^html|^body$/;
  const rules = (el) => {
    const res = [];
    for (const sheet of document.styleSheets) {
      let rs;
      try { rs = sheet.cssRules; } catch (e) { unreadable.add(sheet.href); continue; }
      const file = (sheet.href || 'inline').split('/').pop().split('?')[0].slice(0, 40);
      const walk = (l, media) => {
        for (const r of l) {
          if (r.cssRules && (r.media || r.conditionText)) {
            const cond = r.media ? r.media.mediaText : r.conditionText;
            if (!allRules && /^print$/.test(cond)) continue;
            walk(r.cssRules, `${media ? `${media} & ` : ''}${cond}`);
          } else if (r.selectorText) {
            let m = false;
            try { m = el.matches(r.selectorText); } catch (e) { m = false; }
            if (!m || !r.style.cssText) continue;
            const sel = r.selectorText.replace(/\s+/g, ' ');
            if (!allRules && NOISE.test(sel)) continue;
            res.push(`    ${media ? `@media ${media} ` : ''}${sel.slice(0, 140)} { ${r.style.cssText.slice(0, 300)} }  <${file}>`);
          }
        }
      };
      walk(rs, '');
    }
    return res;
  };
  const out = anchors.map((a) => {
    const e = find(a);
    const name = a.name || a.sel || a.text;
    if (!e) return `## ${name}: NOT FOUND`;
    const lines = [`## ${name}: ${box(e)}`, `   ${type(e)}`];
    let anc = e;
    for (let i = 0; i < (a.depth ?? 4) && anc.parentElement && anc.parentElement !== document.body; i += 1) {
      anc = anc.parentElement;
      lines.push(`   ^${i + 1} ${box(anc)}`);
    }
    if (a.rules !== false) {
      lines.push('   rules:', ...rules(e));
      (a.ancRules || []).forEach((n) => {
        let x = e;
        for (let i = 0; i < n && x.parentElement; i += 1) x = x.parentElement;
        lines.push(`   rules on ^${n} ${box(x).split(' [')[0]}:`, ...rules(x));
      });
    }
    return lines.join('\n');
  });
  if (unreadable.size) out.push(`(stylesheets that can't be read from the page, cross-origin: ${[...unreadable].join(', ')}. Fetch them and search them directly.)`);
  return out.join('\n\n');
}

export async function probe(browser, {
  url, width, anchors, allRules = false, mobileBelow = 992, consent = CONSENT, height = 900,
}) {
  const { ctx, page } = await openPage(browser, url, {
    width, height, mobileBelow, consent,
  });
  const text = await page.evaluate(probeAll, { anchors, allRules });
  await ctx.close();
  return `# ${url} at ${width}px\n${text}`;
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  const depth = num(opts.depth, 4);
  const ancRules = list(opts['ancestor-rules']).map(Number);
  const rulesOn = !opts['no-rules'];
  const anchors = [
    ...(opts.anchors ? JSON.parse(fs.readFileSync(opts.anchors, 'utf8')) : []),
    ...[].concat(opts.text ?? []).map((t) => ({
      text: String(t), depth, ancRules, rules: rulesOn, nth: num(opts.nth, 0),
    })),
    ...[].concat(opts.sel ?? []).map((s) => ({
      sel: String(s), depth, ancRules, rules: rulesOn, nth: num(opts.nth, 0),
    })),
  ];
  if (!opts.url || !opts.width || !anchors.length) {
    console.error('usage: node probe.mjs --url <url> --width <px> (--text "..." | --sel "css" | --anchors file.json) [--depth 4] [--ancestor-rules 1,2] [--all-rules] [--no-rules]');
    process.exit(1);
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  console.log(await probe(browser, {
    url: opts.url,
    width: Number(opts.width),
    anchors,
    allRules: !!opts['all-rules'],
    mobileBelow: num(opts['mobile-below'], 992),
    consent: opts.consent ? list(opts.consent) : CONSENT,
  }));
  await browser.close();
}
