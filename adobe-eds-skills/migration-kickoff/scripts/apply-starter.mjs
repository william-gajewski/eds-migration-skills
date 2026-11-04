// Add the migration starter kit to a project's working tree. Nothing is staged, committed or
// overwritten: each file gets only what it lacks, a file that already has the kit's content is
// left alone, and what can't be merged safely is listed for you to do by hand. Run it again any
// time; it only adds what is missing.
//
//   AGENTS.md                the project section, below Adobe's boilerplate lines
//   CLAUDE.md                "see @AGENTS.md", as in the boilerplate, when there is none
//   PROJECT-LOG.md           the dated log, with day 1's entry
//   .gitattributes           * text=auto eol=lf
//   .editorconfig            [*] end_of_line = lf, insert_final_newline, utf-8
//   .vscode/settings.json    "files.eol": "\n"
//   .gitignore               the migration's local folders
//   .hlxignore               test/* and *.md, so the checks and the notes aren't served
//   .migration/project.json  org and site, which the migration skills read
//   test/checks/             smoke, axe and Lighthouse checks; package.json gets their npm scripts
//                            and devDependencies (playwright, axe-core)
//
// usage: node apply-starter.mjs [--repo <dir>] [--org <org> --site <site>] [--client "Name"]
//          [--legacy https://www.legacy.example]... [--day1 YYYY-MM-DD] [--branch <name>]
//          [--owner "who owns the pages' state"] [--teams "other teams writing content"]
//          [--breakpoints "768, 992, 1200"] [--prod www.client.example] [--dry-run]
//   org and site default to .migration/project.json, then the git remote's owner and name
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const MARK = '<!-- migration-kickoff: project section';
const TODO = '_to fill in_';
const DEV = { 'axe-core': '4.14.0', playwright: '1.64.1' };
const SCRIPTS = {
  'check:smoke': 'node test/checks/smoke.mjs',
  'check:axe': 'node test/checks/axe.mjs',
  'check:lighthouse': 'node test/checks/lighthouse.mjs',
};
const IGNORE = ['/import-work/', '/drafts/', '/content/', '/parity/', '/intake/', '/test/checks/results/', '.env'];
const CHECKS = ['README.md', 'lib.mjs', 'smoke.mjs', 'axe.mjs', 'lighthouse.mjs', 'paths.txt'];

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const set = (k, v) => { opts[k] = k in opts ? [].concat(opts[k], v) : v; };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) set(a.slice(2, eq), a.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        set(a.slice(2), argv[i + 1]);
        i += 1;
      } else set(a.slice(2), true);
    }
  }
  return opts;
}

const opts = parseArgs();
const repo = path.resolve(String(opts.repo || '.'));
const dry = Boolean(opts['dry-run']);
if (!fs.existsSync(repo)) {
  console.error(`${repo} doesn't exist.`);
  process.exit(1);
}
const done = [];
const manual = [];
const rel = (file) => path.relative(repo, file).split(path.sep).join('/');
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const lf = (text) => text.replace(/\r\n/g, '\n');
const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
const note = (verb, file, why = '') => done.push([verb, rel(file), why]);
function write(file, text, verb, why = '') {
  note(verb, file, why);
  if (dry) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
const at = (...p) => path.join(repo, ...p);

// ---- the site ----
let org = opts.org && String(opts.org).toLowerCase();
let site = opts.site && String(opts.site).toLowerCase();
const projectJson = read(at('.migration', 'project.json'));
if (projectJson && (!org || !site)) {
  try {
    const s = Object.values(JSON.parse(projectJson).sites || {}).find((x) => x.previewOrg && x.previewSite);
    if (s) {
      org = org || s.previewOrg;
      site = site || s.previewSite;
    }
  } catch (e) {
    manual.push('.migration/project.json isn\'t valid JSON: fix it, then run this again.');
  }
}
if (!org || !site) {
  const m = (git('remote', 'get-url', 'origin').stdout || '').match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);
  if (m) {
    org = org || m[1].toLowerCase();
    site = site || m[2].toLowerCase();
  }
}
if (!org || !site) {
  console.error('Unknown site: pass --org and --site (the names in main--<site>--<org>.aem.page).');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(org) || !/^[a-z0-9-]+$/.test(site)) {
  console.error(`--org ${org} --site ${site}: Edge Delivery Services names are lowercase letters, digits and hyphens.`);
  process.exit(1);
}
const legacy = [].concat(opts.legacy || []).map((u) => String(u).replace(/\/+$/, ''));
const badLegacy = legacy.find((u) => !/^https?:\/\/[^/\s]+/.test(u));
if (badLegacy) {
  console.error(`--legacy ${badLegacy}: expected an address such as https://www.legacy.example`);
  process.exit(1);
}
const day1 = String(opts.day1 || new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(day1)) {
  console.error(`--day1 ${day1}: expected YYYY-MM-DD`);
  process.exit(1);
}
const vars = {
  CLIENT: String(opts.client || site),
  ORG: org,
  SITE: site,
  LEGACY: legacy.length ? legacy.join(', ') : TODO,
  DAY1: day1,
  BRANCH: String(opts.branch || 'main'),
  OWNER: String(opts.owner || TODO),
  TEAMS: String(opts.teams || TODO),
  BREAKPOINTS: String(opts.breakpoints || `${TODO} (source-parity's breakpoints.mjs, on the legacy site)`),
  PROD: String(opts.prod || TODO),
};
const fill = (text) => lf(text).replace(/\{\{([A-Z0-9]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
const kit = (...p) => fs.readFileSync(path.join(KIT, ...p), 'utf8');

// ---- AGENTS.md: Adobe's lines stay; the project section goes below them ----
const title = `# ${vars.CLIENT}: Edge Delivery Services migration`;
const agents = read(at('AGENTS.md'));
const section = fill(kit('AGENTS.project.md'));
if (agents === null) {
  write(at('AGENTS.md'), `${title}\n\n${section}`, 'created', 'no boilerplate AGENTS.md was there');
} else if (agents.includes(MARK)) {
  note('unchanged', at('AGENTS.md'), 'already has the project section');
} else {
  const lines = lf(agents).split('\n');
  if (/^# AGENTS\.md\s*$/.test(lines[0])) lines[0] = title;
  write(at('AGENTS.md'), `${lines.join('\n').replace(/\n*$/, '\n\n')}${section}`, 'updated', 'project section added below Adobe\'s lines');
}
const length = lf(dry ? `${agents || ''}\n${section}` : read(at('AGENTS.md'))).split('\n').length;
if (length > 150) manual.push(`AGENTS.md is ${length} lines: move dated status and decisions to PROJECT-LOG.md.`);

// ---- CLAUDE.md ----
const claude = read(at('CLAUDE.md'));
if (claude === null) write(at('CLAUDE.md'), 'see @AGENTS.md\n', 'created', 'as in the boilerplate');
else if (/@AGENTS\.md/.test(claude)) note('unchanged', at('CLAUDE.md'), 'imports AGENTS.md');
else manual.push('CLAUDE.md doesn\'t import AGENTS.md: add a line "@AGENTS.md" to it.');

// ---- PROJECT-LOG.md ----
if (read(at('PROJECT-LOG.md')) === null) write(at('PROJECT-LOG.md'), fill(kit('PROJECT-LOG.md')), 'created', `day 1 is ${day1}`);
else note('unchanged', at('PROJECT-LOG.md'), 'exists');

// ---- line endings ----
const attributes = read(at('.gitattributes'));
if (attributes === null) write(at('.gitattributes'), '* text=auto eol=lf\n', 'created');
else if (/^\*\s.*\beol=lf\b/m.test(attributes)) note('unchanged', at('.gitattributes'), 'eol=lf');
else manual.push('.gitattributes has no "* text=auto eol=lf" line: add it as the first line.');

const editor = read(at('.editorconfig'));
const block = '[*]\nend_of_line = lf\ninsert_final_newline = true\ncharset = utf-8\n';
if (editor === null) {
  write(at('.editorconfig'), `root = true\n\n${block}\n[*.js]\nindent_size = 2\n\n[*.css]\nindent_size = 4\n`, 'created');
} else if (/^\s*end_of_line\s*=\s*lf\b/m.test(editor)) {
  note('unchanged', at('.editorconfig'), 'end_of_line = lf');
} else if (/^\s*end_of_line\s*=/m.test(editor)) {
  manual.push('.editorconfig sets end_of_line to something other than lf: change it to lf.');
} else {
  // the preamble (root = true) has to come before the first section
  const body = lf(editor);
  const first = body.search(/^\[/m);
  const pre = first === -1 ? body : body.slice(0, first);
  const rest = first === -1 ? '' : body.slice(first);
  const preamble = /^\s*root\s*=/m.test(pre) ? pre.replace(/\n*$/, '\n\n') : `root = true\n\n${pre.trim() ? `${pre.trim()}\n\n` : ''}`;
  write(at('.editorconfig'), `${preamble}${block}\n${rest}`.replace(/\n*$/, '\n'), 'updated', 'end_of_line = lf for every file');
}

const vscodeFile = at('.vscode', 'settings.json');
const vscode = read(vscodeFile);
if (vscode === null) {
  write(vscodeFile, `${JSON.stringify({ 'files.eol': '\n' }, null, 2)}\n`, 'created');
} else {
  let settings = null;
  try {
    settings = JSON.parse(vscode);
  } catch (e) {
    // comments or trailing commas: VS Code allows them, JSON.parse doesn't
  }
  if (!settings) manual.push('.vscode/settings.json isn\'t plain JSON: add "files.eol": "\\n" to it by hand.');
  else if (settings['files.eol'] === '\n') note('unchanged', vscodeFile, 'files.eol is LF');
  else if (settings['files.eol']) manual.push(`.vscode/settings.json sets files.eol to ${JSON.stringify(settings['files.eol'])}: change it to "\\n".`);
  else write(vscodeFile, `${JSON.stringify({ ...settings, 'files.eol': '\n' }, null, 2)}\n`, 'updated', 'files.eol');
}

// ---- ignore rules ----
const bare = (line) => line.trim().replace(/^\//, '').replace(/\/\**$/, '');
const gitignore = read(at('.gitignore'));
const ignored = new Set(lf(gitignore || '').split('\n').map(bare).filter(Boolean));
const missing = IGNORE.filter((line) => !ignored.has(bare(line)));
if (missing.length) {
  const head = gitignore ? lf(gitignore).replace(/\n*$/, '\n\n') : '';
  write(at('.gitignore'), `${head}# Migration working files: local only. Client documents and plans never go in git.\n${missing.join('\n')}\n`, gitignore === null ? 'created' : 'updated', missing.join(' '));
} else note('unchanged', at('.gitignore'), 'has the migration folders');

const hlx = read(at('.hlxignore'));
if (hlx === null) {
  write(at('.hlxignore'), '.*\n*.md\nLICENSE\npackage.json\npackage-lock.json\ntest/*\n', 'created', 'every committed file is served unless listed here');
} else {
  const rules = new Set(lf(hlx).split('\n').map((l) => l.trim()));
  const add = ['test/*', '*.md'].filter((r) => !rules.has(r) && !(r === 'test/*' && (rules.has('test/') || rules.has('test/**'))));
  if (add.length) write(at('.hlxignore'), `${lf(hlx).replace(/\n*$/, '\n')}${add.join('\n')}\n`, 'updated', `${add.join(' ')}, so ${add.includes('*.md') ? 'AGENTS.md and the log' : 'the checks'} aren't served`);
  else note('unchanged', at('.hlxignore'), 'test/* and *.md');
}

// ---- .migration/project.json, in the shape the import tools and the migration skills read ----
if (projectJson === null) {
  const pj = {
    type: 'da',
    sites: {
      [site]: {
        libraryUrl: `https://main--${site}--${org}.aem.page/docs/library/blocks.json`,
        previewOrg: org,
        previewSite: site,
        contentHostUrl: `https://content.da.live/${org}/${site}/`,
      },
    },
  };
  write(at('.migration', 'project.json'), `${JSON.stringify(pj, null, 2)}\n`, 'created', `${org}/${site}`);
} else {
  let s = null;
  try {
    s = Object.values(JSON.parse(projectJson).sites || {}).find((x) => x.previewOrg && x.previewSite);
  } catch (e) {
    // reported above
  }
  if (s && (s.previewOrg !== org || s.previewSite !== site)) manual.push(`.migration/project.json names ${s.previewOrg}/${s.previewSite}, not ${org}/${site}: check which is right.`);
  else note('unchanged', at('.migration', 'project.json'), `${org}/${site}`);
}

// ---- the checks ----
CHECKS.forEach((name) => {
  const file = at('test', 'checks', name);
  const text = lf(kit('checks', name));
  const have = read(file);
  if (have === null) write(file, text, 'created');
  else if (lf(have) === text) note('unchanged', file, 'same as the kit\'s');
  else note('kept', file, 'differs from the kit\'s version; yours is kept');
});

const pkgFile = at('package.json');
const pkgText = read(pkgFile);
if (pkgText === null) {
  manual.push('No package.json, so this isn\'t an Edge Delivery Services project yet: add the checks\' npm scripts and devDependencies by hand.');
} else {
  const pkg = JSON.parse(pkgText);
  const added = [];
  pkg.scripts = pkg.scripts || {};
  Object.entries(SCRIPTS).forEach(([k, v]) => {
    if (!pkg.scripts[k]) {
      pkg.scripts[k] = v;
      added.push(k);
    }
  });
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const dev = { ...pkg.devDependencies };
  Object.entries(DEV).forEach(([k, v]) => {
    if (!deps[k]) {
      dev[k] = v;
      added.push(`${k} ${v}`);
    }
  });
  // npm keeps dependencies sorted
  pkg.devDependencies = Object.fromEntries(Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)));
  const indent = (pkgText.match(/^[ \t]+(?=")/m) || ['  '])[0];
  if (added.length) write(pkgFile, `${JSON.stringify(pkg, null, indent)}\n`, 'updated', added.join(', '));
  else note('unchanged', pkgFile, 'has the scripts and devDependencies');
}

// ---- files checked out with CRLF (core.autocrlf true when the clone was made) ----
const eol = git('ls-files', '--eol');
const isRepo = eol.status === 0;
const crlf = isRepo ? eol.stdout.split('\n').filter((l) => /\bw\/crlf\b/.test(l)).length : 0;
if (!isRepo) manual.push(`${repo} isn't a git repository: the kit is in place, but clone the project's repository and run this there.`);
else if (crlf) manual.push(`${crlf} files were checked out with CRLF line endings, so lint fails (linebreak-style). Set "git config --global core.autocrlf input", clone again and run this script in the new clone. Once the kit's .gitattributes is committed, every clone gets LF.`);

// ---- report ----
console.log(`Starter kit for ${org}/${site} in ${repo}${dry ? ' (dry run: nothing written)' : ''}\n`);
const wide = Math.max(...done.map(([, f]) => f.length));
done.forEach(([verb, file, why]) => console.log(`  ${verb.padEnd(9)}  ${file.padEnd(wide)}  ${why}`));
if (manual.length) {
  console.log('\nBy hand:');
  manual.forEach((m) => console.log(`  - ${m}`));
}
const changed = done.filter(([verb]) => ['created', 'updated'].includes(verb)).map(([, f]) => f);
console.log(`\nNext, in ${repo}:`);
console.log('  npm install                       # adds playwright and axe-core to package-lock.json');
console.log('  npx playwright install chromium');
console.log('  npm run lint');
if (changed.length) console.log(`\nNothing is staged or committed. To commit: ${changed.join(', ')}, and package-lock.json after npm install.`);
