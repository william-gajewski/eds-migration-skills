// Check this machine for what the migration skills and the starter kit need: Node, git and its
// line-ending and long-path settings, Playwright's Chromium, Chrome (Lighthouse), pandoc and typst
// (PDFs), the AEM CLI, the Claude Code plugins and a Document Authoring sign-in. It only reads:
// each fix is printed for you to run. Windows and macOS; Linux mostly works too.
//
// usage: node check-machine.mjs [--json]
//   exit 1 when something required is missing (a FAIL line), 0 otherwise
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const HOME = os.homedir();
const LOCAL = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const CONFIG = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
// Claude Code's plugin folder (installed_plugins.json, known_marketplaces.json, marketplaces/, cache/)
const PLUGINS = process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR || path.join(CONFIG, 'plugins');

const results = [];
const add = (status, label, detail = '', fix = '') => results.push({
  status, label, detail, fix,
});
const pick = (win, mac) => (WIN ? win : mac);

// the first line a command prints for --version, or null. On Windows the npm shims (aem, npx) are
// .cmd files that only run through the shell, so those get one command string
function version(cmd, args = ['--version'], shell = false) {
  const r = shell
    ? spawnSync([cmd, ...args].join(' '), { encoding: 'utf8', shell: true, timeout: 30000 })
    : spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout || r.stderr}`.trim().split(/\r?\n/)[0];
}
const dirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) {
    return [];
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
};

// ---- Node: Playwright needs 20, the boilerplate's stylelint 17 needs 20.19 ----
const [major, minor] = process.versions.node.split('.').map(Number);
const nodeFix = pick('winget install OpenJS.NodeJS.LTS', 'brew install node');
if (major < 20 || (major === 20 && minor < 19)) {
  add('fail', `Node ${process.versions.node}`, 'too old: Playwright needs Node 20, and the boilerplate\'s lint (stylelint 17) needs 20.19', nodeFix);
} else if (major === 20) {
  add('warn', `Node ${process.versions.node}`, 'Node 20 reached end of life on 2026-04-30; the boilerplate\'s CI runs Node 24', nodeFix);
} else {
  add('ok', `Node ${process.versions.node}${major % 2 ? ' (not an LTS line, which is fine for these tools)' : ''}`);
}

// ---- git, and the settings that broke Windows checkouts before ----
const gitVersion = version('git');
if (!gitVersion) {
  add('fail', 'git not found', '', pick('winget install Git.Git', 'xcode-select --install'));
} else {
  add('ok', gitVersion.replace(/^git version /, 'git '));
  // read outside any repository, so only the system and global settings count
  const cfg = (key) => {
    const r = spawnSync('git', ['-C', os.tmpdir(), 'config', '--get', key], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '';
  };
  const autocrlf = cfg('core.autocrlf');
  if (autocrlf === 'true') {
    add('warn', 'git core.autocrlf is true', 'clones get CRLF line endings, and a repository without a .gitattributes (Adobe\'s boilerplate has none) then fails lint (linebreak-style). Set it before cloning', 'git config --global core.autocrlf input');
  } else {
    add('ok', `git core.autocrlf ${autocrlf || 'not set (false)'}`);
  }
  if (WIN) {
    if (cfg('core.longpaths') !== 'true') add('warn', 'git core.longpaths is off', 'deep repositories fail to clone or check out with "Filename too long"', 'git config --global core.longpaths true');
    else add('ok', 'git core.longpaths true');
  }
}

// ---- Playwright's browser, for source-parity and the smoke and axe checks ----
const envBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
let pwRoot = path.join(HOME, '.cache', 'ms-playwright');
if (envBrowsers && envBrowsers !== '0') pwRoot = envBrowsers;
else if (WIN) pwRoot = path.join(LOCAL, 'ms-playwright');
else if (MAC) pwRoot = path.join(HOME, 'Library', 'Caches', 'ms-playwright');
const chromiums = dirs(pwRoot).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d));
if (chromiums.length) {
  add('ok', `Playwright Chromium (${chromiums.join(', ')})`, 'a project on another Playwright version needs its own: run "npx playwright install chromium" there');
} else {
  add('warn', 'Playwright Chromium not installed', 'source-parity and the starter kit\'s smoke and axe checks need it', 'npx playwright install chromium   (in the project, after npm install)');
}

// ---- Chrome, for Lighthouse: the places the Lighthouse scripts look ----
const chrome = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => p && fs.existsSync(p));
if (chrome) add('ok', `Chrome for Lighthouse: ${chrome}`);
else add('warn', 'Chrome not found', 'Lighthouse runs (the kickoff baseline, project-outtake) need it, or CHROME_PATH set to a Chromium-based browser', pick('winget install Google.Chrome', 'brew install --cask google-chrome'));

// ---- pandoc and typst, for the PDFs: on PATH, or where winget puts them ----
const works = (cmd) => (version(cmd) ? cmd : null);
const pandoc = works('pandoc') || [path.join(LOCAL, 'Pandoc', 'pandoc.exe')].find((p) => fs.existsSync(p) && works(p));
const pkgs = path.join(LOCAL, 'Microsoft', 'WinGet', 'Packages');
const typst = works('typst') || dirs(pkgs).filter((d) => /Typst\.Typst/i.test(d))
  .flatMap((d) => dirs(path.join(pkgs, d)).map((s) => path.join(pkgs, d, s, 'typst.exe')))
  .find((p) => fs.existsSync(p) && works(p));
const offPath = (found, cmd) => (found && found !== cmd ? ' (not on this shell\'s PATH; open a new terminal. The PDF scripts find it anyway)' : '');
if (pandoc) add('ok', `pandoc${offPath(pandoc, 'pandoc')}`);
else add('warn', 'pandoc not found', 'project-intake and project-outtake then write Markdown only, no PDF', pick('winget install JohnMacFarlane.Pandoc', 'brew install pandoc'));
if (typst) add('ok', `typst${offPath(typst, 'typst')}`);
else add('warn', 'typst not found', 'project-intake and project-outtake then write Markdown only, no PDF', pick('winget install Typst.Typst', 'brew install typst'));

// ---- AEM CLI and GitHub CLI ----
const aem = version('aem', ['--version'], WIN);
if (aem) add('ok', `AEM CLI ${aem}`);
else add('warn', 'AEM CLI not found', '"aem up" serves the working tree\'s code with preview content, for local checks', 'npm install -g @adobe/aem-cli');
const gh = version('gh');
if (gh) add('ok', gh.replace(/ \(.*$/, ''));
else {
  add('info', 'GitHub CLI not found', 'the simplest git credential for the private skills repository, which background updates use without a prompt (Git Credential Manager or an SSH key work too); Adobe\'s create-site skill also uses it', `${pick('winget install GitHub.cli', 'brew install gh')}, then gh auth login and gh auth setup-git`);
}

// ---- Claude Code plugins (installed_plugins.json is Claude Code's own record; it can change) ----
const installedFile = path.join(PLUGINS, 'installed_plugins.json');
const installed = readJson(installedFile)?.plugins;
if (!installed) {
  add('info', 'Claude Code plugins not checked', `couldn't read ${installedFile}: run "claude plugin list", or /plugins in VS Code`);
} else {
  const settings = readJson(path.join(CONFIG, 'settings.json')) || {};
  const enabled = settings.enabledPlugins || {};
  const want = [
    ['adobe-eds-skills', null, 'the migration skills', 'claude plugin install adobe-eds-skills@wgajewski-skills --scope user'],
    ['aem-edge-delivery-services', 'adobe-skills', 'Adobe\'s import, block and Document Authoring skills', 'claude plugin install aem-edge-delivery-services@adobe-skills --scope user'],
    ['aem-project-management', 'adobe-skills', 'Adobe\'s auth and admin skills', 'claude plugin install aem-project-management@adobe-skills --scope user'],
  ];
  want.forEach(([name, market, what, fix]) => {
    const entries = Object.keys(installed)
      .filter((k) => k.split('@')[0] === name && (!market || k.endsWith(`@${market}`)))
      .flatMap((k) => [].concat(installed[k] || []).map((e) => ({ key: k, ...e })));
    const user = entries.find((e) => e.scope === 'user');
    if (user && enabled[user.key] === false) add('warn', `${user.key} is disabled`, what, `claude plugin enable ${user.key}`);
    else if (user) add('ok', `${user.key}${user.version ? ` ${user.version}` : ''}`);
    else if (entries.length) {
      const where = entries.map((e) => e.projectPath).filter(Boolean);
      add('warn', `${name} is installed for ${where.length > 1 ? `${where.length} projects` : 'one project'} only`, `${where.join(', ')}; other projects don't get ${what}`, fix);
    } else add('warn', `${name} not installed`, what, fix);
  });
  // where the migration skills come from, and whether they update themselves
  const market = readJson(path.join(PLUGINS, 'known_marketplaces.json'))?.['wgajewski-skills'];
  // a settings entry's autoUpdate wins over known_marketplaces.json's (the /plugin toggle writes both)
  const autoUpdate = settings.extraKnownMarketplaces?.['wgajewski-skills']?.autoUpdate ?? market?.autoUpdate;
  const repo = 'https://github.com/william-gajewski/eds-migration-skills.git';
  const toGit = `claude plugin marketplace remove wgajewski-skills, claude plugin marketplace add ${repo}, then ${want[0][3]}`;
  if (market?.source?.source === 'directory') {
    add('info', `wgajewski-skills is a local folder (${market.source.path})`, 'fine for a clone you edit; a zip copy never updates', `to follow the repository: ${toGit}`);
  } else if (market && JSON.stringify(market.source || {}).includes('/agent-skills')) {
    add('warn', 'wgajewski-skills points at the old repository', JSON.stringify(market.source), toGit);
  } else if (market && autoUpdate !== true) {
    add('warn', 'wgajewski-skills: auto-update is off', 'new commits arrive only when you update by hand', '/plugin, Marketplaces, wgajewski-skills, Enable auto-update (or by hand: claude plugin marketplace update wgajewski-skills, then claude plugin update adobe-eds-skills@wgajewski-skills)');
  } else if (market) {
    add('ok', `wgajewski-skills updates itself${market.lastUpdated ? ` (last ${String(market.lastUpdated).slice(0, 10)})` : ''}`);
  }
  // the PDF scripts look for the whitepaper template in the plugin cache, whatever its scope
  const cache = path.join(PLUGINS, 'cache');
  const template = dirs(cache).flatMap((m) => dirs(path.join(cache, m)).filter((d) => /project-management$/.test(d))
    .flatMap((p) => dirs(path.join(cache, m, p)).map((v) => path.join(cache, m, p, v, 'templates', 'whitepaper.typ'))))
    .find((f) => fs.existsSync(f));
  if (template) add('ok', 'PDF template (aem-project-management\'s whitepaper)');
  else add('warn', 'PDF template not found', 'the PDFs fall back to pandoc\'s plain layout; it comes with aem-project-management', want[2][3]);
}

// ---- Document Authoring sign-in: only the expiry is read, never the token ----
const token = readJson(path.join(HOME, '.aem', 'da-token.json'));
const signIn = `npx -y github:adobe-rnd/da-auth-helper token > /dev/null${WIN ? '   (PowerShell: > $null)' : ''}`;
const needs = 'safe-publish, legacy-redirects uploads and some project-outtake checks need it; it lasts about a day';
if (!token) add('info', 'Not signed in to Document Authoring', needs, signIn);
else if (Number(token.expires_at) > Date.now() + 60000) add('ok', `Document Authoring sign-in, valid until ${new Date(Number(token.expires_at)).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
else add('info', 'Document Authoring sign-in has expired', needs, signIn);

// ---- report ----
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 1));
} else {
  const mark = {
    ok: 'ok  ', warn: 'warn', fail: 'FAIL', info: 'info',
  };
  let system = process.platform;
  if (WIN) system = 'Windows';
  else if (MAC) system = 'macOS';
  console.log(`Machine check: ${system} ${os.release()}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n`);
  results.forEach((r) => {
    console.log(`  ${mark[r.status]}  ${r.label}${r.detail ? `: ${r.detail}` : ''}`);
    if (r.fix) console.log(`          fix: ${r.fix}`);
  });
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n${n('fail')} failed, ${n('warn')} warning${n('warn') === 1 ? '' : 's'}, ${n('info')} note${n('info') === 1 ? '' : 's'}.`);
}
process.exitCode = results.some((r) => r.status === 'fail') ? 1 : 0;
