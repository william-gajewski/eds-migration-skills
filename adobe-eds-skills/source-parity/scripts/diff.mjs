// Text-matched diff of two capture.mjs dumps (ours and the source) at one width. Elements are
// paired by their text (images by file name), in document order, so a difference in one place
// doesn't misalign everything after it. For each pair it reports the vertical offset
// (dy = source y - our y) and what differs: position, size, type, colours.
//
// The shifts are what to read first: where dy changes between consecutive pairs and stays changed,
// something between those two elements has a different height on the two sites.
//
// usage: node diff.mjs --width <px> [--dir <capture dir>] [--ours ours] [--src src]
// writes <dir>/diff-<width>.txt and diff-<width>.json
import fs from 'node:fs';
import path from 'node:path';
import { isMain, parseArgs } from './lib/common.mjs';

const QUOTES = new RegExp(`[${String.fromCharCode(0x2018, 0x2019)}]`, 'g');
const DQUOTES = new RegExp(`[${String.fromCharCode(0x201c, 0x201d)}]`, 'g');
const norm = (t) => t.toLowerCase().replace(QUOTES, "'").replace(DQUOTES, '"')
  .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const key = (i) => (i.tag === 'img' ? `img:${i.src}` : norm(i.text));
const px = (v) => (v === 'normal' ? v : `${Math.round(parseFloat(v) * 10) / 10}`);
const NONE = 'rgba(0, 0, 0, 0)';
const fmt = (i) => `${String(i.x).padStart(6)},${String(Math.round(i.y)).padStart(6)} ${String(i.w).padStart(6)}x${String(i.h).padEnd(6)} `
  + `${px(i.fs)}/${px(i.lh)} ${i.fw} ${i.ff.slice(0, 14)}${i.ls !== 'normal' ? ` ls${px(i.ls)}` : ''} ${i.color.replace('rgb', '')}`
  + `${i.bg !== NONE ? ` bg${i.bg.replace('rgb', '')}` : ''} ${i.ta}${i.tt !== 'none' ? ` ${i.tt}` : ''}`;

export function diffDumps(ours, src, width) {
  const pool = new Map();
  src.items.forEach((i, n) => {
    const k = key(i);
    if (!k) return;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push({ ...i, n });
  });
  const used = new Set();
  const pairs = [];
  const onlyOurs = [];
  ours.items.forEach((o) => {
    const k = key(o);
    if (!k) return;
    const cands = (pool.get(k) || []).filter((s) => !used.has(s.n));
    const s = cands.find((c) => c.tag === o.tag) || cands[0]; // prefer the same tag
    if (!s) { onlyOurs.push(o); return; }
    used.add(s.n);
    pairs.push([o, s]);
  });
  const onlySrc = src.items.filter((s, n) => key(s) && !used.has(n));

  const rows = pairs.map(([o, s]) => {
    const d = [];
    if (Math.abs(o.x - s.x) > 1) d.push(`x${Math.round(o.x - s.x)}`);
    if (Math.abs(o.w - s.w) > 1) d.push(`w${Math.round(o.w - s.w)}`);
    if (Math.abs(o.h - s.h) > 1) d.push(`h${Math.round(o.h - s.h)}`);
    if (o.tag !== 'img') {
      [['fs', 'fs'], ['lh', 'lh'], ['fw', 'fw'], ['ff', 'ff'], ['color', 'color'], ['ta', 'align'], ['ls', 'ls'], ['tt', 'tt'], ['bg', 'bg']]
        .forEach(([f, label]) => {
          // start and left are the same alignment
          if (f === 'ta' && ['start', 'left'].includes(o.ta) && ['start', 'left'].includes(s.ta)) return;
          if (o[f] !== s[f]) d.push(label);
        });
    } else if (o.fit !== s.fit || o.nat !== s.nat) d.push(`img ${o.nat} ${o.fit} vs ${s.nat} ${s.fit}`);
    return {
      o, s, dy: Math.round(s.y - o.y), diffs: d,
    };
  });

  // Runs of pairs with the same dy (within 1px), in our document order. Where dy changes and stays
  // changed, something above has a different height: a shift. Where it changes and comes back to
  // the earlier value, only those elements sit differently (their own box, or a pairing of two
  // different elements with the same text): a local offset.
  const runs = [];
  rows.forEach((r, i) => {
    const run = runs[runs.length - 1];
    if (run && Math.abs(r.dy - run.dy) <= 1) run.end = i;
    else runs.push({ dy: r.dy, start: i, end: i });
  });
  const label = (r) => `${r.o.tag} "${r.o.text.slice(0, 40)}" (ours y ${Math.round(r.o.y)})`;
  const changes = [];
  const local = [];
  const LOCAL_MAX = 6; // a return to the baseline within this many elements makes an offset local
  let baseline = 0; // the offset the page settles at; only shifts move it
  for (let k = 0; k < runs.length; k += 1) {
    const run = runs[k];
    if (Math.abs(run.dy - baseline) > 1) {
      // look ahead: does the offset come back to the baseline within a few elements?
      let j = k + 1;
      let count = run.end - run.start + 1;
      while (j < runs.length && Math.abs(runs[j].dy - baseline) > 1 && count <= LOCAL_MAX) {
        count += runs[j].end - runs[j].start + 1;
        j += 1;
      }
      const entry = {
        after: run.start ? label(rows[run.start - 1]) : '(top of page)',
        at: label(rows[run.start]),
        from: baseline,
        to: run.dy,
        elements: count,
      };
      if (j < runs.length && Math.abs(runs[j].dy - baseline) <= 1 && count <= LOCAL_MAX) {
        local.push(entry);
        k = j - 1;
      } else {
        entry.elements = run.end - run.start + 1;
        changes.push(entry);
        baseline = run.dy;
      }
    }
  }

  const summary = {
    width,
    ours: { docH: ours.docH, scrollW: ours.scrollW, header: ours.header, main: ours.main, footer: ours.footer },
    src: { docH: src.docH, scrollW: src.scrollW, header: src.header, main: src.main, footer: src.footer },
    matched: rows.length,
    offset: rows.filter((r) => r.dy !== 0).length,
    differing: rows.filter((r) => r.diffs.length).length,
    onlyOurs: onlyOurs.length,
    onlySrc: onlySrc.length,
    changes,
    local,
  };

  const b = (x) => (x ? `${Math.round(x.y)}+${Math.round(x.h)}` : '-');
  const lines = [
    `width ${width}: ours ${ours.docH}px tall (header ${b(ours.header)}, main ${b(ours.main)}, footer ${b(ours.footer)})`
    + ` | source ${src.docH}px tall (header ${b(src.header)}, main ${b(src.main)}, footer ${b(src.footer)})`,
    `${rows.length} matched, ${summary.offset} offset vertically, ${summary.differing} with differences; ${onlyOurs.length} only ours, ${onlySrc.length} only source`,
    '',
    '--- shifts (dy = source y - our y changes here and stays: something above has a different height)',
    ...(changes.length ? changes.map((c) => `  dy ${c.from} -> ${c.to}: between ${c.after} and ${c.at}`) : ['  none']),
    '',
    '--- local offsets (dy changes for a few elements, then returns: their own position differs, or two different elements share the text)',
    ...(local.length ? local.map((c) => `  dy ${c.from} -> ${c.to} for ${c.elements} element(s) from ${c.at}`) : ['  none']),
    '',
    '--- matched elements',
  ];
  rows.forEach(({
    o, s, dy, diffs,
  }) => {
    lines.push(`[${o.tag}/${s.tag}] "${o.text.slice(0, 48)}"  dy=${dy}  ${diffs.length ? `DIFF ${diffs.join(' ')}` : 'ok'}`);
    if (diffs.length) {
      lines.push(`   ours ${fmt(o)}`);
      lines.push(`   src  ${fmt(s)}`);
    }
  });
  const extra = (i) => `  [${i.tag}${i.cls ? `.${i.cls}` : ''}] "${i.text.slice(0, 60)}" ${fmt(i)}${i.src ? ` ${i.src} ${i.nat} ${i.fit}` : ''}`;
  lines.push('', '--- only ours', ...onlyOurs.map(extra), '', '--- only source', ...onlySrc.map(extra));
  return { text: lines.join('\n'), summary };
}

if (isMain(import.meta.url)) {
  const { opts } = parseArgs();
  const width = opts.width;
  if (!width) {
    console.error('usage: node diff.mjs --width <px> [--dir <capture dir>] [--ours ours] [--src src]');
    process.exit(1);
  }
  const dir = opts.dir || '.';
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, `${n}-${width}.json`), 'utf8'));
  const { text, summary } = diffDumps(read(opts.ours || 'ours'), read(opts.src || 'src'), Number(width));
  fs.writeFileSync(path.join(dir, `diff-${width}.txt`), text);
  fs.writeFileSync(path.join(dir, `diff-${width}.json`), JSON.stringify(summary, null, 1));
  console.log(text);
}
