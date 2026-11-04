// Render a Markdown document to PDF with pandoc and typst, using the whitepaper template and fonts
// of the aem-project-management plugin when it is installed (pandoc's own typst layout
// otherwise). The Markdown is kept. The template is patched in a scratch copy: no hyphenation in
// table cells, and optionally no contents page. Pandoc reads the Markdown without "smart"
// typography, so "--" in host names (main--site--org.aem.live) stays two hyphens.
//
// usage: node render-pdf.mjs <file.md> [<file.pdf>] [--paper us-letter|a4] [--no-contents] [--break-sections] [--png]
//   --no-contents: no contents page; --break-sections: start each top-level section on a new page
//   (by default sections follow each other); --png: also write page images to <name>-pages/
//   The Markdown needs YAML front matter with at least a title (subtitle and date are used too).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) opts[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; } else opts[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { opts, pos };
}

const works = (cmd) => {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? cmd : null;
};
const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(p, d.name)); } catch (e) { return []; } };

// pandoc and typst: on PATH, or where winget puts them on Windows
function findTools() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const pandoc = works('pandoc') || [path.join(local, 'Pandoc', 'pandoc.exe')].find((p) => fs.existsSync(p) && works(p));
  let typst = works('typst');
  if (!typst) {
    const pkgs = path.join(local, 'Microsoft', 'WinGet', 'Packages');
    typst = dirs(pkgs).filter((d) => /Typst\.Typst/i.test(d)).flatMap(dirs).map((d) => path.join(d, 'typst.exe')).find((p) => fs.existsSync(p) && works(p));
  }
  return { pandoc, typst };
}

// the aem-project-management plugin's whitepaper template and fonts
function findWhitepaper() {
  const roots = [process.env.CLAUDE_PLUGIN_ROOT, path.join(process.cwd(), '.claude', 'plugins', 'project-management')].filter(Boolean);
  const cache = path.join(os.homedir(), '.claude', 'plugins', 'cache');
  dirs(cache).forEach((market) => dirs(market).filter((d) => /project-management$/.test(d)).forEach((plugin) => {
    dirs(plugin).sort().reverse().forEach((version) => roots.push(version));
  }));
  const root = roots.find((r) => fs.existsSync(path.join(r, 'templates', 'whitepaper.typ')));
  return root ? { template: path.join(root, 'templates', 'whitepaper.typ'), fonts: path.join(root, 'fonts') } : null;
}

const { opts, pos } = parseArgs();
const md = pos[0] && path.resolve(pos[0]);
if (!md || !fs.existsSync(md)) {
  console.error('usage: node render-pdf.mjs <file.md> [<file.pdf>] [--paper us-letter|a4] [--no-contents] [--break-sections] [--png]');
  process.exit(1);
}
const pdf = path.resolve(pos[1] || md.replace(/\.md$/i, '.pdf'));
const source = fs.readFileSync(md, 'utf8');
if (!/^---\r?\n[\s\S]*?\btitle\s*:/m.test(source)) {
  console.error(`${md}: add YAML front matter with a title first (--- / title: "..." / date: "..." / ---).`);
  process.exit(1);
}
const { pandoc, typst } = findTools();
if (!pandoc || !typst) {
  console.error(`Missing ${[!pandoc && 'pandoc', !typst && 'typst'].filter(Boolean).join(' and ')}. Install them (winget install JohnMacFarlane.Pandoc Typst.Typst; brew install pandoc typst), or share the Markdown as it is.`);
  process.exit(2);
}

const args = [path.basename(md), '-f', 'markdown-smart', '-o', pdf, `--pdf-engine=${typst}`, '-V', `papersize=${opts.paper || 'us-letter'}`];
const env = { ...process.env };
const wp = findWhitepaper();
let scratch = null;
const notes = [];
if (wp) {
  // a scratch copy beside the Markdown (pandoc's typst import is resolved from there)
  let t = fs.readFileSync(wp.template, 'utf8');
  t = t.replace(/(show table\.cell: it => \{\s*set text\(hyphenate: )true/, '$1false');
  // short documents: sections follow each other instead of each starting a page
  if (!opts['break-sections']) t = t.replace(/(show heading\.where\(level: 1\): it => \{\s*)pagebreak\(weak: true\)/, '$1v(0.5cm)');
  if (opts['no-contents']) {
    const at = t.indexOf('// ---- Table of Contents ----');
    const end = at > -1 ? t.indexOf('pagebreak()', at) : -1;
    if (end > -1) t = t.slice(0, at) + t.slice(end + 'pagebreak()'.length);
    else notes.push('the template changed: the contents page was kept');
  }
  scratch = path.join(path.dirname(md), `.render-${process.pid}-whitepaper.typ`);
  fs.writeFileSync(scratch, t);
  args.push('-V', `template=${path.basename(scratch)}`, '-V', 'mainfont=Source Sans 3', '-V', 'fontsize=10pt');
  env.TYPST_FONT_PATHS = wp.fonts;
} else {
  notes.push("The whitepaper template isn't installed (aem-project-management plugin): pandoc's plain typst layout was used");
}

const cwd = path.dirname(md);
const r = spawnSync(pandoc, args, { cwd, env, encoding: 'utf8' });
// page images to look at (no PDF viewer needed): pandoc writes the typst source, typst renders it
let previews = null;
if (r.status === 0 && opts.png) {
  const typ = path.join(cwd, `.render-${process.pid}.typ`);
  const vars = args.slice(args.indexOf('-V'));
  const t = spawnSync(pandoc, [path.basename(md), '-f', 'markdown-smart', '-t', 'typst', '-s', '-o', typ, ...vars], { cwd, env, encoding: 'utf8' });
  previews = pdf.replace(/\.pdf$/i, '-pages');
  fs.mkdirSync(previews, { recursive: true });
  const c = t.status === 0 && spawnSync(typst, ['compile', '--format', 'png', '--ppi', '100', typ, path.join(previews, 'page-{p}.png')], { cwd, env, encoding: 'utf8' });
  if (!c || c.status !== 0) notes.push(`page images failed: ${((c && c.stderr) || t.stderr || '').trim().split('\n')[0]}`);
  fs.rmSync(typ, { force: true });
}
if (scratch) fs.rmSync(scratch, { force: true });
if (r.status !== 0) {
  console.error(`pandoc failed (${r.status}):\n${(r.stderr || '').trim()}`);
  process.exit(r.status || 1);
}
const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
// the template asks for Helvetica Neue before falling back to its own fonts: not worth reporting
const warnings = (r.stderr || '').split('\n').filter((l) => /warning|error/i.test(l) && !/unknown font family/i.test(l));
if (warnings.length) notes.push(warnings.slice(0, 3).join(' '));
console.log(`PDF: ${pdf} (${pages} pages)${previews ? `\npage images: ${previews}` : ''}${notes.length ? `\nnote: ${notes.join('; ')}` : ''}`);
