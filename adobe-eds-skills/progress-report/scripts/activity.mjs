// Gather what happened on an AEM Edge Delivery Services project in a span of time, for a client
// progress report: changes merged to main and work still on branches (git); pages, fragments and
// sheets previewed, published and unpublished (the site's audit log); PROJECT-LOG.md entries; and
// PROGRESS.md as it is and as it was when the span began. Every path published or unpublished in
// the span is checked on the live host. Activity is split into our team's and everyone else's by
// sign-in (.migration/team.json). Read-only apart from `git fetch`: it never prints the token, and
// keeps sign-in domains, not email addresses or IPs.
//
// usage: node activity.mjs [--repo .] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days 7]
//          [--team @ours.example,someone@client.example] [--log-file export.json]
//          [--history-from YYYY-MM-DD] [--org o --site s] [--no-fetch] [--no-live] [--out <dir>]
//   The span is in local days, inclusive. Default: from the end of the newest report in
//   status-reports/ to now, else the last 7 days (today and the 6 before it).
//   --log-file: an export of the audit log (the admin API's JSON: one response, a list of responses
//   or a list of entries) instead of reading it with a sign-in.
//   --history-from: how far back to read the log, to tell first publications from republications
//   (default: day 1 in AGENTS.md, else the oldest PROJECT-LOG.md entry, else 180 days back).
//   Writes activity.md and activity.json to --out (default: progress-report/<org>-<site>/ in the
//   system temp folder, outside the repository), and prints activity.md.
//
// The audit log (GET admin.hlx.page/log/{org}/{site}/{ref}, author role or higher; basic_author
// lacks log:read): entries come oldest first, 1,000 a page, with links.next until the end. The ref
// in the URL doesn't filter it: every branch's entries come back. Content is shared by all
// branches, so a preview on a branch host counts. A bulk preview or publish logs one entry with
// paths[] and then one entry per path; the bulk entry is used only for paths without their own.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' };
const REPORTS = 'status-reports';
const LIST = 40; // longest list in activity.md; activity.json has everything

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) opts[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { opts[a.slice(2)] = argv[i + 1]; i += 1; } else opts[a.slice(2)] = true;
  }
  return opts;
}

const opts = parseArgs();
const repo = path.resolve(String(opts.repo || '.'));
const now = new Date();
const warnings = [];
const warn = (w) => warnings.push(w);
const fail = (m) => { console.error(m); process.exit(1); };

const lf = (t) => String(t ?? '').replace(/\r\n?/g, '\n');
const read = (p) => { try { return fs.readFileSync(path.join(repo, p), 'utf8'); } catch (e) { return null; } };
const git = (...args) => {
  const r = spawnSync('git', args, {
    cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  return { ok: r.status === 0, out: (r.stdout || '').replace(/\s+$/, ''), err: (r.stderr || r.error?.message || '').trim() };
};
const gitOut = (...args) => { const r = git(...args); return r.ok ? r.out : ''; };
const lines = (t) => t.split('\n').filter(Boolean);

async function get(url, init = {}, timeout = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init.headers || {}) }, signal: ctrl.signal });
    const body = await r.text();
    return { status: r.status, ok: r.ok, headers: r.headers, body };
  } catch (e) {
    return { status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message), body: '' };
  } finally {
    clearTimeout(timer);
  }
}
const json = (r) => { try { return JSON.parse(r.body); } catch (e) { return null; } };

// ---- dates: the span is in local days ----
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(dayStart(String(s)).getTime());
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const stamp = (d) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
// an instant with the local offset, as the report's front matter keeps it: 2026-11-02T00:00:00-05:00
const isoLocal = (d) => {
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};
const gitDate = (d) => d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' +0000');
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';

// ---- the site ----
function siteOf() {
  let org = opts.org && String(opts.org).toLowerCase();
  let site = opts.site && String(opts.site).toLowerCase();
  const pj = read('.migration/project.json');
  if ((!org || !site) && pj) {
    try {
      const s = Object.values(JSON.parse(pj).sites || {}).find((x) => x.previewOrg && x.previewSite);
      if (s) { org = org || s.previewOrg; site = site || s.previewSite; }
    } catch (e) { warn('.migration/project.json isn\'t valid JSON.'); }
  }
  const fstab = (read('fstab.yaml') || '').match(/content\.da\.live\/([^/\s]+)\/([^/\s]+)/);
  if ((!org || !site) && fstab) { org = org || fstab[1]; site = site || fstab[2]; }
  const remote = gitOut('remote', 'get-url', 'origin').match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if ((!org || !site) && remote) { org = org || remote[1].toLowerCase(); site = site || remote[2].toLowerCase(); }
  return {
    org,
    site,
    repo: remote ? `${remote[1]}/${remote[2]}` : null,
    live: org && site ? `https://main--${site}--${org}.aem.live` : null,
    preview: org && site ? `https://main--${site}--${org}.aem.page` : null,
  };
}

// ---- who did it: our team's sign-ins, from .migration/team.json or --team ----
let team = [];
let teamSource = null;
if (opts.team && opts.team !== true) {
  team = String(opts.team).split(',');
  teamSource = '--team';
} else {
  const tf = read('.migration/team.json');
  if (tf) {
    try {
      team = [].concat(JSON.parse(tf).team || []);
      teamSource = '.migration/team.json';
    } catch (e) { warn('.migration/team.json isn\'t valid JSON. Its shape: { "team": ["@ours.example", "someone@client.example"] }'); }
  }
}
team = team.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
const bare = (email) => String(email || '').trim().toLowerCase().replace(/^<|>$/g, '');
// "@domain" and "+login@users.noreply.github.com" match the end of an address; anything else, the
// whole address
const isOurs = (e) => team.some((t) => (t.startsWith('@') || t.startsWith('+') ? e.endsWith(t) : e === t));
function who(email) {
  const e = bare(email);
  if (!e) return { who: 'unknown', domain: '-' };
  if (!e.includes('@')) return { who: 'system', domain: e.slice(0, 40) };
  // a GitHub noreply address (12345+login@users.noreply.github.com) keeps its login: it's public,
  // and it's what .migration/team.json needs to match commits made with it
  const noreply = e.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  const domain = noreply ? `+${noreply[1]}@users.noreply.github.com` : e.split('@').pop();
  if (!team.length) return { who: 'unassigned', domain };
  return { who: isOurs(e) ? 'ours' : 'others', domain };
}

// ---- the span ----
const reports = (() => {
  try { return fs.readdirSync(path.join(repo, REPORTS)).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort(); } catch (e) { return []; }
})();
const frontMatter = (text) => { const m = lf(text).match(/^---\n([\s\S]*?)\n---/); return m ? m[1] : ''; };
const fmValue = (fm, key) => { const m = fm.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]*?)["']?\\s*$`, 'm')); return m ? m[1] : null; };
const reportEnd = (file) => {
  const pe = fmValue(frontMatter(read(path.join(REPORTS, file))), 'period-end');
  return pe && !Number.isNaN(Date.parse(pe)) ? new Date(pe) : addDays(dayStart(file.slice(0, 10)), 1);
};

let start;
let end;
let how;
if (opts.from || opts.to) {
  if (opts.from && !isDay(opts.from)) fail(`--from ${opts.from}: expected YYYY-MM-DD`);
  if (opts.to && !isDay(opts.to)) fail(`--to ${opts.to}: expected YYYY-MM-DD`);
  end = opts.to ? addDays(dayStart(String(opts.to)), 1) : now;
  if (end > now) end = now;
  start = opts.from ? dayStart(String(opts.from)) : addDays(dayStart(ymd(new Date(end.getTime() - 1))), -6);
  how = `given (${opts.from ? `--from ${opts.from}` : 'the 7 days to --to'}${opts.to ? ` --to ${opts.to}` : ', to now'})`;
} else if (opts.days) {
  const n = Number(opts.days);
  if (!Number.isInteger(n) || n < 1) fail(`--days ${opts.days}: expected a whole number of days`);
  start = addDays(dayStart(ymd(now)), -(n - 1));
  end = now;
  how = `the last ${n} days (--days)`;
} else {
  const today = ymd(now);
  const prev = [...reports].reverse().find((f) => f.slice(0, 10) < today);
  if (prev) {
    start = reportEnd(prev);
    end = now;
    how = `since the last report, ${REPORTS}/${prev}`;
  } else {
    start = addDays(dayStart(today), -6);
    end = now;
    how = `the last 7 days (no earlier report in ${REPORTS}/)`;
  }
}
if (!(start < end)) fail(`The span ${stamp(start)} to ${stamp(end)} is empty: the start has to be before the end, and not in the future.`);
const startDay = ymd(start);
const endDay = ymd(new Date(end.getTime() - 1));
const reportFile = `${REPORTS}/${endDay}.md`;
const previous = [...reports].reverse().find((f) => f.slice(0, 10) < endDay) || null;
const inSpan = (t) => t >= start.getTime() && t < end.getTime();

// ---- paths on the site ----
function kindOf(p) {
  const x = p.toLowerCase();
  if (/^\/drafts(\/|$)/.test(x)) return 'draft';
  if (/^\/(docs\/library|tools|\.helix)(\/|$)/.test(x)) return 'library';
  if (/\.json$/.test(x)) return 'sheet';
  if (/\.(svg|png|jpe?g|gif|webp|avif|ico|pdf|mp4|webm|mov|zip|docx?|xlsx?|pptx?|txt|csv)$/.test(x)) return 'file';
  if (/(^|\/)(nav|footer)$/.test(x) || /(^|\/)fragments\//.test(x)) return 'fragment';
  return 'page';
}
const sectionOf = (p) => { const s = p.split('/')[1]; return s && p.split('/').length > 2 ? `/${s}` : '/'; };

// ---- the code: git ----
function readGit() {
  const out = {
    fetched: null, main: null, current: null, changes: [], branches: [], newBlocks: [], base: null,
  };
  if (!git('rev-parse', '--git-dir').ok) { warn(`${repo} isn't a git repository: no code facts.`); return out; }
  if (!opts['no-fetch'] && gitOut('remote').split('\n').includes('origin')) {
    const f = git('fetch', '--prune', '--quiet', 'origin');
    out.fetched = f.ok ? 'fetched origin' : `git fetch origin failed: ${f.err.split('\n')[0]}`;
    if (!f.ok) warn(`${out.fetched}. The code facts come from the last fetch and may lag origin.`);
  } else out.fetched = opts['no-fetch'] ? 'not fetched (--no-fetch)' : 'no origin remote';
  out.main = ['origin/main', 'main'].find((r) => git('rev-parse', '--verify', '--quiet', r).ok) || null;
  if (!out.main) { warn('No origin/main or main branch: no code facts.'); return out; }
  if (out.main === 'main') warn('There\'s no origin/main, so the code facts come from the local main branch.');
  const branch = gitOut('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = lines(gitOut('status', '--porcelain')).length;
  out.current = {
    branch,
    behind: Number(gitOut('rev-list', '--count', `HEAD..${out.main}`) || 0),
    ahead: Number(gitOut('rev-list', '--count', `${out.main}..HEAD`) || 0),
    uncommitted: dirty,
  };

  // What reached main in the span: pull requests merged in it (GitHub dates a merge commit, and a
  // squashed one, when the button is pressed), and commits dated in it that no pull request brought
  // in (pushed to main, or in a local merge). Not the first-parent chain: one "Merge branch 'main'"
  // pushed from a local main makes it skip the real history.
  const all = lines(gitOut('log', out.main, '--format=%H%x09%P%x09%cI%x09%s')).map((l) => {
    const [h, p, d, ...s] = l.split('\t');
    return {
      h, ps: p ? p.split(' ') : [], t: Date.parse(d), s: s.join('\t'),
    };
  });
  const isPr = (c) => c.ps.length > 1 && /^Merge pull request #\d+ from /.test(c.s);
  const isSquash = (c) => c.ps.length === 1 && /\s\(#\d+\)$/.test(c.s);
  const inPr = new Set();
  all.filter((c) => isPr(c) && c.t >= start.getTime()).forEach((c) => lines(gitOut('rev-list', `${c.ps[0]}..${c.ps[1]}`)).forEach((h) => inPr.add(h)));
  const picked = all.filter((c) => inSpan(c.t) && (isPr(c) || isSquash(c) || (c.ps.length === 1 && !inPr.has(c.h)))).map((c) => c.h).reverse();
  out.localMerges = all.filter((c) => inSpan(c.t) && c.ps.length > 1 && !isPr(c)).length;
  // PROGRESS.md as it was when the span began: its last version committed before then
  out.base = (lines(gitOut('log', out.main, '--format=%H%x09%cI', '--', 'PROGRESS.md')).map((l) => l.split('\t')).find(([, d]) => Date.parse(d) < start.getTime()) || [null])[0];
  const areasOf = (files) => [...new Set(files.map((f) => {
    let m = f.match(/^blocks\/([^/]+)\//);
    if (m) return `blocks/${m[1]}`;
    m = f.match(/^templates\/([^/]+)\//) || f.match(/^styles\/templates\/([^/.]+)/);
    if (m) return `templates/${m[1]}`;
    if (/^(head\.html|404\.html)$/.test(f)) return f;
    if (/^\.github\//.test(f)) return 'ci';
    if (/^(package(-lock)?\.json|\.eslintrc|\.stylelintrc|\.hlxignore|\.gitignore|\.gitattributes|\.editorconfig|\.nvmrc|\.migration\/|\.vscode\/)/.test(f)) return 'config';
    if (/\.md$/i.test(f)) return 'notes';
    return f.includes('/') ? f.split('/')[0] : f;
  }))].sort();
  const newBlocks = new Set();
  out.changes = picked.map((sha) => {
    const [cdate, author, parents, ...body] = gitOut('show', '-s', '--format=%cI%n%aE%n%P%n%B', sha).split('\n');
    const ps = (parents || '').split(' ').filter(Boolean);
    const text = body.map((l) => l.trim());
    const subject = text[0] || '';
    const rest = text.slice(1).filter(Boolean);
    let type = 'commit';
    let pr = null;
    let from = null;
    let title = subject;
    let m = subject.match(/^Merge pull request #(\d+) from (\S+)/);
    if (ps.length > 1 && m) {
      type = 'pull request';
      pr = Number(m[1]);
      from = m[2].replace(/^[^/]+\//, '');
      title = rest[0] || from;
    } else if (ps.length > 1) type = 'merge';
    else {
      m = subject.match(/^(.*\S)\s+\(#(\d+)\)$/);
      if (m) { type = 'pull request (squashed)'; pr = Number(m[2]); title = m[1]; }
    }
    // who wrote it: for a merged pull request, the authors of the commits it brought in (the merge
    // commit's author is whoever pressed the button)
    let authors = [author];
    if (ps.length > 1) {
      const a = lines(gitOut('log', '--format=%aE', `${ps[0]}..${ps[1]}`));
      if (a.length) authors = a;
    }
    const classes = authors.map((a) => who(a).who);
    const mine = classes.filter((c) => c === 'ours').length;
    let by = 'others';
    if (!team.length) by = 'unassigned';
    else if (mine * 2 >= classes.length) by = 'ours';
    else if (mine) by = 'shared';
    const files = lines(ps.length > 1 ? gitOut('diff', '--name-only', ps[0], sha) : gitOut('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha));
    // a block whose script or styles this change created is a new block
    const added = lines(ps.length > 1 ? gitOut('diff', '--name-only', '--diff-filter=A', ps[0], sha, '--', 'blocks') : gitOut('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', '--diff-filter=A', sha, '--', 'blocks'));
    added.forEach((f) => { const m = f.match(/^blocks\/([^/]+)\/([^/]+)\.(js|css)$/); if (m && m[1] === m[2]) newBlocks.add(m[1]); });
    return {
      sha: sha.slice(0, 7),
      date: cdate,
      type,
      pr,
      branch: from,
      title,
      revert: /^Revert\b/.test(title) || /^Revert\b/.test(subject),
      by,
      domains: [...new Set(authors.map((a) => who(a).domain))],
      files: files.length,
      areas: areasOf(files),
      notesOnly: files.length > 0 && files.every((f) => /\.md$/i.test(f)),
    };
  });

  // new blocks that are still on main
  const blocksNow = new Set(lines(gitOut('ls-tree', '-d', '--name-only', `${out.main}:blocks/`)).map((b) => b.replace(/^blocks\//, '')));
  out.newBlocks = [...newBlocks].filter((b) => blocksNow.has(b)).sort();

  // branches with commits in the span that aren't on main: work in progress
  const refs = lines(gitOut('for-each-ref', 'refs/remotes/origin', '--format=%(refname:short)%09%(committerdate:iso-strict)%09%(authoremail)%09%(subject)'));
  out.branches = refs.map((l) => l.split('\t'))
    .filter(([name]) => !['origin', 'origin/HEAD', 'origin/main'].includes(name))
    .map(([name, date, email, subject]) => {
      const ref = name;
      const span = Number(gitOut('rev-list', '--count', `--since=${gitDate(start)}`, `--until=${gitDate(end)}`, `${out.main}..${ref}`) || 0);
      return {
        name: name.replace(/^origin\//, ''), last: date, subject, ahead: Number(gitOut('rev-list', '--count', `${out.main}..${ref}`) || 0), inSpan: span, by: who(email).who, domain: who(email).domain,
      };
    })
    .filter((b) => b.ahead > 0 && b.inSpan > 0)
    .sort((a, b) => (a.last < b.last ? 1 : -1));
  return out;
}

// ---- the notes: PROJECT-LOG.md and PROGRESS.md ----
const stripComments = (t) => lf(t).replace(/<!--[\s\S]*?-->/g, '');
function parseLog(text) {
  const out = [];
  let date = null;
  let last = null;
  stripComments(text).split('\n').forEach((line) => {
    const h = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\b/);
    if (h) { date = h[1]; last = null; return; }
    if (/^#{1,2}\s/.test(line)) { date = null; last = null; return; }
    if (!date) return;
    const b = line.match(/^\s*[-*]\s+(?:\*\*([^*]+?)\*\*:?\s*)?(.*)$/);
    if (b) {
      last = { date, kind: (b[1] || '').replace(/:$/, '').trim(), text: b[2].trim() };
      out.push(last);
    } else if (last && line.trim() && /^\s/.test(line)) last.text += ` ${line.trim()}`;
    else last = null;
  });
  return out;
}

const STATUSES = ['not started', 'in progress', 'in review', 'done', 'blocked', 'dropped', 'open', 'received', 'not needed'];
function parseTracker(text) {
  const sections = [];
  const problems = [];
  let cur = null;
  let header = null;
  stripComments(text).split('\n').forEach((line, i) => {
    const h = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h) {
      const title = h[1].trim();
      let kind = 'workstream';
      if (/milestone/i.test(title)) kind = 'milestones';
      else if (/waiting/i.test(title)) kind = 'waiting';
      cur = { title, kind, rows: [] };
      sections.push(cur);
      header = null;
      return;
    }
    if (!/^\s*\|/.test(line)) { header = null; return; }
    if (!cur) return;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.every((c) => /^:?-+:?$/.test(c))) return;
    if (!header) { header = cells.map((c) => c.toLowerCase()); return; }
    const row = {};
    header.forEach((k, j) => { row[k] = cells[j] ?? ''; });
    if (!('status' in row)) return;
    const raw = row.status;
    const norm = raw.toLowerCase().replace(/[*_`]/g, '').trim();
    const status = STATUSES.find((s) => norm === s || norm.startsWith(`${s} `) || norm.startsWith(`${s}:`) || norm.startsWith(`${s},`)) || norm;
    if (!STATUSES.includes(status)) problems.push(`line ${i + 1}: "${raw}" isn't a status this skill knows (${STATUSES.join(', ')})`);
    cur.rows.push({
      item: cells[0], status, raw, updated: row.updated || '', target: row.target || '', needs: row.needs || row['needed for'] || '', evidence: row.evidence || row.notes || row.source || '', asked: row.asked || '', from: row['from (role)'] || row.from || '',
    });
  });
  return { sections: sections.filter((s) => s.rows.length), problems };
}

function readNotes(g) {
  // the log: the working copy and main, so an entry not merged yet and one not pulled yet both count
  const texts = [read('PROJECT-LOG.md'), g.main ? gitOut('show', `${g.main}:PROJECT-LOG.md`) : ''].filter(Boolean);
  const seen = new Set();
  const entries = texts.flatMap(parseLog).filter((e) => {
    const k = `${e.date}|${e.kind}|${e.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const log = {
    found: texts.length > 0,
    entries: entries.filter((e) => e.date >= startDay && e.date <= endDay).sort((a, b) => (a.date < b.date ? 1 : -1)),
    oldest: entries.map((e) => e.date).sort()[0] || null,
  };

  // the tracker now (working copy, else main) and as it was on main when the span began
  let nowText = read('PROGRESS.md');
  let nowFrom = 'the working copy';
  if (nowText === null && g.main) {
    const t = git('show', `${g.main}:PROGRESS.md`);
    if (t.ok) { nowText = t.out; nowFrom = g.main; }
  }
  const tracker = { found: nowText !== null, from: nowFrom };
  if (nowText !== null) {
    const nowT = parseTracker(nowText);
    const thenR = g.base ? git('show', `${g.base}:PROGRESS.md`) : { ok: false };
    const thenT = thenR.ok ? parseTracker(thenR.out) : null;
    const key = (s, r) => `${s.title.replace(/^\d+\.\s*/, '').toLowerCase()}|${r.item.toLowerCase()}`;
    const thenRows = new Map();
    (thenT?.sections || []).forEach((s) => s.rows.forEach((r) => thenRows.set(key(s, r), r)));
    const changed = [];
    nowT.sections.forEach((s) => s.rows.forEach((r) => {
      const was = thenRows.get(key(s, r));
      if (thenT && !was) changed.push({ section: s.title, item: r.item, was: null, now: r.status });
      else if (was && was.status !== r.status) changed.push({ section: s.title, item: r.item, was: was.status, now: r.status });
      thenRows.delete(key(s, r));
    }));
    thenRows.forEach((r, k) => changed.push({ section: k.split('|')[0], item: r.item, was: r.status, now: null }));
    Object.assign(tracker, {
      sections: nowT.sections,
      problems: nowT.problems,
      then: thenT ? `${g.main} at ${g.base.slice(0, 7)}, the last change before the span` : null,
      changed,
    });
  }
  return { log, tracker };
}

// ---- the site: the audit log ----
function token() {
  if (process.env.DA_TOKEN) return process.env.DA_TOKEN;
  const files = [path.join(os.homedir(), '.aem', 'da-token.json'), path.join(repo, '.hlx', '.da-token.json'), path.join(os.homedir(), '.aem', 'ims-token.json')];
  for (const f of files) {
    try {
      const t = JSON.parse(fs.readFileSync(f, 'utf8'));
      const tok = t.access_token || t.authToken || t.token;
      const exp = t.expires_at || (t.authTokenExpiry ? t.authTokenExpiry * 1000 : 0);
      if (tok && (!exp || exp > Date.now() + 60000)) return tok;
    } catch (e) { /* next */ }
  }
  return null;
}

async function fetchLog(site, from, to) {
  const tok = token();
  if (!tok) return { error: 'no DA sign-in found (or it expired): npx -y github:adobe-rnd/da-auth-helper token > /dev/null' };
  let url = `https://admin.hlx.page/log/${site.org}/${site.site}/main?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  let headers = { Authorization: `Bearer ${tok}` };
  const entries = [];
  let pages = 0;
  let tries = 0;
  while (url) {
    const r = await get(url, { headers }, 60000);
    if (r.status === 429 && tries < 5) {
      tries += 1;
      const wait = Number(r.headers?.get('x-retry-after')) || 2;
      await new Promise((ok) => { setTimeout(ok, Math.min(wait < 100 ? wait * 1000 : wait, 30000)); });
      continue;
    }
    if (r.status === 401 && headers.Authorization) { headers = { 'x-auth-token': tok }; continue; }
    if (r.status === 401) return { error: 'the sign-in was refused (expired?): sign in again' };
    if (r.status === 403) return { error: 'this sign-in can\'t read the site\'s audit log: it needs the author role or higher on the site (basic_author lacks log:read)' };
    if (r.status === 404) return { error: `the admin API doesn't know ${site.org}/${site.site}` };
    if (!r.ok) return { error: `the audit log answered ${r.status || r.error}` };
    tries = 0;
    const j = json(r);
    entries.push(...(j?.entries || []));
    pages += 1;
    if (pages % 10 === 0) process.stderr.write(`audit log: ${entries.length} entries so far\n`);
    url = j?.links?.next || null;
  }
  return { entries, source: 'the admin API' };
}

function readLogFile(file) {
  const j = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const list = Array.isArray(j) ? j.flatMap((x) => (x && Array.isArray(x.entries) ? x.entries : [x])) : (j.entries || []);
  return list.filter((e) => e && typeof e === 'object');
}

function readSite(entries) {
  const ok = (e) => !e.status || (e.status >= 200 && e.status < 300);
  const events = [];
  const byPath = new Map();
  const bulk = [];
  const code = { main: 0, branches: 0 };
  const config = [];
  const sign = new Map();
  const seen = (a, kind) => {
    const k = `${a.domain}|${a.who}`;
    const s = sign.get(k) || {
      domain: a.domain, who: a.who, previewed: 0, published: 0, unpublished: 0, code: 0, config: 0,
    };
    s[kind] += 1;
    sign.set(k, s);
  };
  entries.forEach((e) => {
    if (!ok(e) || !e.route) return;
    const t = Number(e.timestamp);
    const a = who(e.user);
    if (e.route === 'code' && inSpan(t)) {
      if (e.ref === 'main') code.main += 1; else code.branches += 1;
      seen(a, 'code');
    }
    if (e.route === 'config' && inSpan(t)) {
      config.push({ at: new Date(t).toISOString(), path: e.path, who: a.who, domain: a.domain });
      seen(a, 'config');
    }
    if (e.route !== 'preview' && e.route !== 'live') return;
    const method = e.method === 'DELETE' ? 'DELETE' : 'POST';
    if (Array.isArray(e.paths) && e.paths.length) {
      bulk.push({ t, route: e.route, method, paths: e.paths.filter((p) => typeof p === 'string'), ...a });
    } else if (e.path) {
      const x = { t, route: e.route, method, path: e.path, ...a };
      events.push(x);
      if (!byPath.has(x.path)) byPath.set(x.path, []);
      byPath.get(x.path).push(x);
    }
  });
  // a bulk request also logs each of its paths; use it only for paths without an entry of their own
  bulk.forEach((b) => b.paths.forEach((p) => {
    const own = (byPath.get(p) || []).some((x) => x.route === b.route && x.method === b.method && Math.abs(x.t - b.t) < 15 * 60000);
    if (own) return;
    const x = {
      t: b.t, route: b.route, method: b.method, path: p, who: b.who, domain: b.domain, bulk: true,
    };
    events.push(x);
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(x);
  }));

  const act = (x) => {
    if (x.route === 'live') return x.method === 'DELETE' ? 'unpublished' : 'published';
    return x.method === 'DELETE' ? 'deleted' : 'previewed';
  };
  const items = [];
  byPath.forEach((list, p) => {
    list.sort((a, b) => a.t - b.t);
    const upTo = (t) => list.filter((x) => x.t < t);
    const lastLive = (t) => upTo(t).filter((x) => x.route === 'live').pop();
    const during = list.filter((x) => inSpan(x.t));
    during.forEach((x) => seen(x, act(x)));
    const liveAtStart = lastLive(start.getTime())?.method === 'POST';
    const liveAtEnd = lastLive(end.getTime())?.method === 'POST';
    if (!during.length) {
      items.push({ path: p, kind: kindOf(p), section: sectionOf(p), liveAtStart, liveAtEnd });
      return;
    }
    const pub = during.filter((x) => act(x) === 'published');
    const unpub = during.filter((x) => act(x) === 'unpublished');
    const prev = during.filter((x) => act(x) === 'previewed');
    const del = during.filter((x) => act(x) === 'deleted');
    const publishedBefore = upTo(start.getTime()).some((x) => act(x) === 'published');
    const lastPub = upTo(end.getTime()).filter((x) => act(x) === 'published').pop();
    const lastPrev = upTo(end.getTime()).filter((x) => act(x) === 'previewed').pop();
    const short1 = (x) => (x ? { at: new Date(x.t).toISOString(), who: x.who, domain: x.domain } : null);
    items.push({
      path: p,
      kind: kindOf(p),
      section: sectionOf(p),
      liveAtStart,
      liveAtEnd,
      first: pub.length && !publishedBefore ? short1(pub[0]) : null,
      again: pub.length && publishedBefore ? short1(pub[pub.length - 1]) : null,
      times: pub.length,
      unpublished: unpub.length && !liveAtEnd ? short1(unpub[unpub.length - 1]) : null,
      deleted: del.length ? short1(del[del.length - 1]) : null,
      // previewed in the span and newer than what's live: waiting to be published (or reviewed)
      onPreview: prev.length && !pub.length && (!lastPub || lastPrev.t > lastPub.t) ? { ...short1(prev[prev.length - 1]), everLive: Boolean(lastPub) } : null,
    });
  });
  return {
    items, code, config, signins: [...sign.values()], events: events.length,
  };
}

// ---- live checks ----
async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) {
      const j = i;
      i += 1;
      out[j] = await fn(list[j]);
    }
  }));
  return out;
}
const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(decodeURIComponent(s))).join('/');
async function check(base, p, kind, host = 'live') {
  const bust = `nocache=${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const url = `${base}${encodePath(p)}${kind === 'sheet' ? `?limit=1&${bust}` : `?${bust}`}`;
  const r = await get(url, { redirect: 'manual', cache: 'no-store' }, 20000);
  if (r.status === 200) return { found: host === 'preview' ? 'on preview' : 'live' };
  if (r.status >= 300 && r.status < 400) {
    const loc = (r.headers.get('location') || '').replace(base, '').replace(/[?&]nocache=[^&]*$/, '');
    return { found: 'redirected', to: loc };
  }
  if (r.status === 404) return { found: 'not found' };
  if (r.status === 401 || r.status === 403) return { found: 'protected' };
  return { found: r.status ? `answered ${r.status}` : `no answer (${r.error})` };
}

// ---- main ----
async function main() {
  const site = siteOf();
  const g = readGit();
  const notes = readNotes(g);

  // the log, from far enough back to know whether a page was ever published before
  let historyFrom = null;
  if (opts['history-from']) {
    if (!isDay(opts['history-from'])) fail(`--history-from ${opts['history-from']}: expected YYYY-MM-DD`);
    historyFrom = dayStart(String(opts['history-from']));
  } else {
    const day1 = (read('AGENTS.md') || '').match(/\*\*Day 1:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    if (day1 && isDay(day1[1])) historyFrom = dayStart(day1[1]);
    else if (notes.log.oldest) historyFrom = dayStart(notes.log.oldest);
    else historyFrom = addDays(start, -180);
  }
  if (historyFrom > start) historyFrom = start;

  const log = { source: null, error: null, from: historyFrom.toISOString(), entries: 0 };
  let entries = [];
  if (opts['log-file']) {
    try {
      entries = readLogFile(String(opts['log-file']));
      log.source = `the export ${path.resolve(String(opts['log-file']))}`;
    } catch (e) { log.error = `couldn't read --log-file: ${e.message}`; }
  } else if (site.org && site.site) {
    const r = await fetchLog(site, historyFrom, end);
    if (r.error) log.error = r.error; else { entries = r.entries; log.source = r.source; }
  } else log.error = 'unknown site: pass --org and --site';
  log.entries = entries.length;
  const times = entries.map((e) => Number(e.timestamp)).filter(Boolean).sort((a, b) => a - b);
  if (times.length) { log.first = new Date(times[0]).toISOString(); log.last = new Date(times[times.length - 1]).toISOString(); }
  if (log.error) warn(`Audit log not read: ${log.error}. Pages previewed and published aren't in this summary.`);
  else if (opts['log-file'] && times.length && (times[0] > start.getTime() || times[times.length - 1] < start.getTime())) warn(`The log export covers ${log.first.slice(0, 10)} to ${log.last.slice(0, 10)}, which misses part of the span or the history before it.`);
  const s = readSite(entries);

  // check on live what the span published or unpublished, and on preview what waits there
  const pub = s.items.filter((x) => (x.first || x.again || x.unpublished) && !['draft', 'library'].includes(x.kind));
  const pre = s.items.filter((x) => x.onPreview && !['draft', 'library'].includes(x.kind));
  let checkedAt = null;
  if (!opts['no-live'] && site.live && (pub.length || pre.length)) {
    checkedAt = new Date();
    const home = await get(`${site.live}/`, { redirect: 'manual' }, 20000);
    if (home.status === 401 || home.status === 403) warn('The live host asks for a sign-in, so the live checks say "protected": check those pages in a signed-in browser.');
    const cap = 500;
    if (pub.length + pre.length > cap) warn(`${pub.length + pre.length} paths to check: only the first ${cap} were checked.`);
    const todo = [...pub.map((x) => ['live', x]), ...pre.map((x) => ['preview', x])].slice(0, cap);
    const res = await pool(todo, 8, ([host, x]) => check(host === 'live' ? site.live : site.preview, x.path, x.kind, host));
    todo.forEach(([host, x], i) => { x[host === 'live' ? 'live' : 'preview'] = res[i]; });
  }
  const problems = [];
  pub.forEach((x) => {
    if (!x.live) return;
    if (x.liveAtEnd && x.live.found !== 'live' && x.live.found !== 'protected') problems.push({ path: x.path, kind: x.kind, problem: `published ${short(new Date((x.first || x.again).at))} (${(x.first || x.again).who}) but the live host says ${x.live.found}${x.live.to ? ` to ${x.live.to}` : ''}${x.live.found === 'redirected' ? ': a redirects row covers it' : ''}` });
    if (!x.liveAtEnd && x.live.found === 'live') problems.push({ path: x.path, kind: x.kind, problem: `unpublished ${short(new Date(x.unpublished.at))} (${x.unpublished.who}) but still served on live` });
  });
  pre.forEach((x) => {
    if (x.preview && !['on preview', 'protected'].includes(x.preview.found)) problems.push({ path: x.path, kind: x.kind, problem: `previewed ${short(new Date(x.onPreview.at))} but the preview host says ${x.preview.found}` });
  });

  // live now: the log says so, and the check (where one ran) didn't say otherwise
  s.items.forEach((x) => { x.liveNow = x.liveAtEnd && (!x.live || ['live', 'protected'].includes(x.live.found)); });
  // pages live per section, from the log's history, less what the checks didn't find live
  const sections = new Map();
  s.items.filter((x) => x.kind === 'page').forEach((x) => {
    const sec = sections.get(x.section) || {
      section: x.section, atStart: 0, atEnd: 0, firstOurs: 0, firstOthers: 0,
    };
    if (x.liveAtStart) sec.atStart += 1;
    if (x.liveNow) sec.atEnd += 1;
    if (x.first && x.liveNow) { if (x.first.who === 'ours') sec.firstOurs += 1; else sec.firstOthers += 1; }
    sections.set(x.section, sec);
  });

  // where the files go
  let publicRepo = null;
  if (site.repo) {
    const r = await get(`https://api.github.com/repos/${site.repo}`, { headers: { Accept: 'application/vnd.github+json' } }, 10000);
    if (r.status === 200) publicRepo = true; else if (r.status === 404) publicRepo = false;
    if (publicRepo) warn(`github.com/${site.repo} is public: a report committed there is public too. Ask before saving reports in the repository.`);
  }
  const hlx = lf(read('.hlxignore') || '').split('\n').map((l) => l.trim());
  const hidden = ['status-reports/*', 'status-reports/', 'status-reports/**', 'status-reports', '/status-reports', '/status-reports/', '/status-reports/*', '/status-reports/**'].some((r) => hlx.includes(r));
  if (!hidden) warn('.hlxignore doesn\'t list status-reports/*: add it before a report is committed. Every committed file that .hlxignore doesn\'t list is served on the site, a PDF included.');
  if (fs.existsSync(path.join(repo, reportFile))) warn(`${reportFile} exists: writing the report for this span again replaces it.`);
  if (!team.length) warn(`Our team isn't set, so nothing is attributed. Ask which sign-in domains below are ours and save them in .migration/team.json: { "team": ["@ours.example"] }.`);
  if (!notes.tracker.found) warn('No PROGRESS.md: the report has no milestones section until there is one.');
  else if (notes.tracker.problems.length) warn(`PROGRESS.md: ${notes.tracker.problems.length} rows with a status this skill doesn't know (listed below).`);
  if (g.current?.uncommitted) warn(`The working copy has ${g.current.uncommitted} uncommitted changes: PROGRESS.md and PROJECT-LOG.md are read from it, the code from ${g.main}.`);

  const activity = {
    generated: now.toISOString(),
    repo,
    site,
    span: {
      start: isoLocal(start), end: isoLocal(end), startDay, endDay, tz, how, reportFile, previousReport: previous ? `${REPORTS}/${previous}` : null, previousEnd: previous ? isoLocal(reportEnd(previous)) : null,
    },
    team: { source: teamSource, entries: team.map((t) => (t.startsWith('@') || t.startsWith('+') ? t : `@${t.split('@').pop()} (an address)`)) },
    git: g,
    log: { ...log, events: s.events },
    paths: s.items.filter((x) => x.first || x.again || x.unpublished || x.deleted || x.onPreview),
    sections: [...sections.values()].filter((x) => x.atStart || x.atEnd).sort((a, b) => b.atEnd - a.atEnd),
    code: s.code,
    config: s.config,
    checkedAt: checkedAt ? checkedAt.toISOString() : null,
    problems,
    notes,
    signins: s.signins.sort((a, b) => (b.published + b.previewed) - (a.published + a.previewed)),
    publicRepo,
    hlxignore: hidden,
    warnings,
  };

  // ---- activity.md ----
  const md = [];
  const day = (iso) => short(new Date(iso));
  const more = (list) => (list.length > LIST ? [`- ... and ${list.length - LIST} more (activity.json)`] : []);
  const cls = ['ours', 'others', 'shared', 'unassigned', 'system', 'unknown'];
  md.push(`# Activity: ${site.org || '?'}/${site.site || '?'}, ${short(start)} to ${short(new Date(end.getTime() - 1))}, ${endDay.slice(0, 4)}`, '');
  md.push(`- **Span:** ${stamp(start)} to ${stamp(end)} (${tz}), ${how}. Report file: \`${reportFile}\`; front matter \`period-start: "${isoLocal(start)}"\`, \`period-end: "${isoLocal(end)}"\`.`);
  md.push(`- **Previous report:** ${previous ? `\`${REPORTS}/${previous}\`, which ended ${stamp(reportEnd(previous))}. Read its "Next" section.` : 'none.'}`);
  md.push(`- **Our team:** ${team.length ? `${activity.team.entries.join(', ')} (${teamSource})` : 'not set'}. "ours" below is their work, "others" everyone else's; "system" is the platform's own jobs.`);
  md.push(`- **Code:** ${g.main ? `${g.main} (${g.fetched})${g.current ? `; checked out: ${g.current.branch}, ${g.current.behind} behind and ${g.current.ahead} ahead of ${g.main}` : ''}` : 'no git facts'}.`);
  md.push(`- **Site:** ${site.live || '?'}; audit log ${log.error ? `not read (${log.error})` : `from ${log.source}, ${log.entries} entries from ${(log.first || '').slice(0, 10)} to ${(log.last || '').slice(0, 10)} (history read from ${ymd(historyFrom)})`}.`, '');
  if (warnings.length) md.push('## Warnings', '', ...warnings.map((w) => `- ${w}`), '');

  md.push('## Code merged to main', '');
  const real = g.changes.filter((c) => !c.notesOnly);
  if (!g.changes.length) md.push('Nothing in the span.', '');
  else {
    const n = (b) => real.filter((c) => c.by === b).length;
    md.push(`${real.length} changes (${cls.filter((b) => n(b)).map((b) => `${n(b)} ${b}`).join(', ')})${g.changes.length > real.length ? `, plus ${g.changes.length - real.length} that only touched notes (.md files)` : ''}${g.localMerges ? `; ${g.localMerges} merges without a pull request (a branch merged locally and pushed) aren't listed, but their commits are` : ''}. Pull requests are dated when merged; other commits when committed.`, '');
    md.push('| Date | Change | By | Areas |', '|:------|:------------------------------------|:-------|:------------------------|');
    real.slice(-LIST).forEach((c) => md.push(`| ${day(c.date)} | ${c.pr ? `#${c.pr} ` : ''}${c.title.replace(/\|/g, '/')}${c.revert ? ' (revert)' : ''}${c.type === 'commit' ? ' (direct commit)' : ''}${c.type === 'merge' ? ' (merge)' : ''} | ${c.by}${c.by !== 'ours' ? ` (${c.domains.join(', ')})` : ''} | ${c.areas.join(', ')} |`));
    md.push('');
  }
  if (g.newBlocks.length) md.push(`New blocks on main: ${g.newBlocks.join(', ')}.`, '');
  if (g.branches.length) {
    md.push('## Work in progress: branches with commits in the span, not merged', '', '| Branch | Last commit | Commits not on main | By | Last subject |', '|:----------------|:-------|----:|:-------|:------------------------|');
    g.branches.slice(0, LIST).forEach((b) => md.push(`| ${b.name} | ${day(b.last)} | ${b.ahead} | ${b.by}${b.by !== 'ours' ? ` (${b.domain})` : ''} | ${b.subject.replace(/\|/g, '/')} |`));
    md.push('');
  }

  md.push('## Site activity (audit log)', '');
  if (log.error) md.push(`Not read: ${log.error}.`, '');
  else {
    const P = activity.paths;
    // each row counts paths by who did the action its function returns
    const of = (kinds, f, b) => P.filter((x) => [].concat(kinds).includes(x.kind) && f(x) && f(x).who === b).length;
    const row = (label, kinds, f) => `| ${label} | ${['ours', 'others', 'unassigned'].map((b) => of(kinds, f, b) || '').join(' | ')} |`;
    md.push('| | Ours | Others | Unassigned |', '|:----------------------------------------|----:|----:|----:|',
      row('Pages published for the first time, live now', 'page', (x) => (x.liveNow ? x.first : null)),
      row('Pages published again, live now', 'page', (x) => (x.liveNow ? x.again : null)),
      row('Pages published in the span, not live now', 'page', (x) => (x.liveNow ? null : x.again || x.first)),
      row('Pages on preview, not published', 'page', (x) => x.onPreview),
      row('Pages unpublished that were live before', 'page', (x) => (x.liveAtStart ? x.unpublished : null)),
      row('Pages deleted', 'page', (x) => x.deleted),
      row('Fragments published (nav, footer, fragments)', 'fragment', (x) => x.again || x.first),
      row('Sheets published', 'sheet', (x) => x.again || x.first),
      row('Files published (images, PDFs)', 'file', (x) => x.again || x.first),
      row('Drafts and library previewed (leave out)', ['draft', 'library'], (x) => x.onPreview || x.again || x.first),
      '', `Code synced from GitHub in the span: ${s.code.main} times to main, ${s.code.branches} to other branches. Site configuration changes: ${s.config.length}${s.config.length ? ` (${[...new Set(s.config.map((c) => c.path))].slice(0, 6).join(', ')})` : ''}.`, '');
    const check = (x) => {
      const c = x.live || x.preview;
      if (!c) return opts['no-live'] ? 'not checked (--no-live)' : 'not checked';
      return `${c.found}${c.to ? ` to ${c.to}` : ''}`;
    };
    const table = (title, list, at, extra = () => '') => {
      if (!list.length) return;
      md.push(`### ${title}`, '', '| Path | When | By | Check |', '|:--------------------------------------|:-------|:--------|:------------|');
      list.slice(0, LIST).forEach((x) => md.push(`| ${x.path} | ${day(at(x).at)} | ${at(x).who}${at(x).who !== 'ours' ? ` (${at(x).domain})` : ''} | ${check(x)}${extra(x)} |`));
      md.push(...more(list), '');
    };
    const notDraft = (x) => !['draft', 'library'].includes(x.kind);
    table('Pages published for the first time', P.filter((x) => x.kind === 'page' && x.first), (x) => x.first, (x) => (x.unpublished ? `; unpublished ${day(x.unpublished.at)} (${x.unpublished.who})` : ''));
    table('Pages published again', P.filter((x) => x.kind === 'page' && x.again), (x) => x.again, (x) => (x.times > 1 ? `; ${x.times} times` : ''));
    table('On preview, not published (waiting for review or a publish)', P.filter((x) => notDraft(x) && x.onPreview), (x) => x.onPreview, (x) => (x.onPreview.everLive ? '; newer than live' : '; never published'));
    table('Unpublished (live before the span)', P.filter((x) => notDraft(x) && x.unpublished && x.liveAtStart), (x) => x.unpublished);
    table('Deleted', P.filter((x) => notDraft(x) && x.deleted), (x) => x.deleted);
    table('Fragments, sheets and files published', P.filter((x) => ['fragment', 'sheet', 'file'].includes(x.kind) && (x.first || x.again)), (x) => x.again || x.first, (x) => `; ${x.first ? 'first time' : 'again'}${x.times > 1 ? `, ${x.times} times` : ''}`);
    if (checkedAt) md.push(`Checked on ${site.live} (and ${site.preview} for pages on preview) at ${stamp(checkedAt)}.`, '');
    else if (pub.length || pre.length) md.push('The live checks didn\'t run, so "live now" is only what the audit log says.', '');
    if (problems.length) md.push('### Problems the checks found', '', ...problems.map((x) => `- ${x.path}: ${x.problem}.`), '');
    if (activity.sections.length) {
      md.push('### Pages live by section', '', `From the audit log since ${ymd(historyFrom)}, less pages the checks didn't find live. "First" counts pages first published in the span that are still live.`, '',
        '| Section | Live at the start | Live now | First, ours | First, others |', '|:--------------------|----:|----:|----:|----:|');
      activity.sections.slice(0, LIST).forEach((x) => md.push(`| ${x.section} | ${x.atStart} | ${x.atEnd} | ${x.firstOurs || ''} | ${x.firstOthers || ''} |`));
      md.push('');
    }
  }

  md.push('## Project log entries in the span (PROJECT-LOG.md)', '');
  if (!notes.log.found) md.push('No PROJECT-LOG.md.', '');
  else if (!notes.log.entries.length) md.push(`None dated ${startDay} to ${endDay}.`, '');
  else md.push(...notes.log.entries.map((e) => `- ${e.date}${e.kind ? ` **${e.kind}:**` : ''} ${e.text}`), '');

  md.push('## Progress tracker (PROGRESS.md)', '');
  const t = notes.tracker;
  if (!t.found) md.push('No PROGRESS.md.', '');
  else {
    md.push(`Read from ${t.from}; compared with ${t.then || 'nothing: it wasn\'t on main when the span began'}.`, '');
    if (t.then) md.push(t.changed.length ? `Changed during the span: ${t.changed.map((c) => `${c.item} (${c.was || 'new'} -> ${c.now || 'removed'})`).join('; ')}.` : 'No status changed during the span.', '');
    t.sections.forEach((sec) => {
      const counts = STATUSES.map((st) => [st, sec.rows.filter((r) => r.status === st).length]).filter(([, n]) => n);
      md.push(`### ${sec.title}`, '', `${counts.map(([st, n]) => `${n} ${st}`).join(', ')}.`, '');
      if (sec.kind === 'waiting') {
        md.push('| Needed | Status | From | Needed for | Asked |', '|:------------------------------|:------------|:-----------|:-----------|:-----------|');
        sec.rows.forEach((r) => md.push(`| ${r.item} | ${r.raw} | ${r.from} | ${r.needs} | ${r.asked} |`));
      } else if (sec.kind === 'milestones') {
        md.push('| Milestone | Status | Target | Needs | Updated | Source |', '|:------------------------------|:------------|:-----------|:------------------|:-----------|:-----------|');
        sec.rows.forEach((r) => md.push(`| ${r.item} | ${r.raw} | ${r.target} | ${r.needs} | ${r.updated} | ${r.evidence} |`));
      } else {
        md.push('| Deliverable | Status | Updated | Evidence |', '|:------------------------------|:------------|:-----------|:------------------|');
        sec.rows.forEach((r) => md.push(`| ${r.item} | ${r.raw} | ${r.updated} | ${r.evidence} |`));
      }
      md.push('');
    });
    if (t.problems.length) md.push(...t.problems.map((p) => `- ${p}`), '');
  }
  const other = ['BACKLOG.md', 'MIGRATION-CHECKLIST.md'].filter((f) => read(f) !== null);
  if (other.length) md.push(`Also in the repository: ${other.join(', ')}.`, '');

  md.push('## Sign-ins in the span', '', 'Actions per sign-in domain (no addresses are kept).', '', '| Domain | Counted as | Previewed | Published | Unpublished | Code syncs |', '|:--------------------|:--------|----:|----:|----:|----:|');
  activity.signins.forEach((x) => md.push(`| ${x.domain} | ${x.who} | ${x.previewed} | ${x.published} | ${x.unpublished} | ${x.code} |`));
  const authors = new Map();
  g.changes.forEach((c) => c.domains.forEach((d) => authors.set(d, (authors.get(d) || 0) + 1)));
  if (authors.size) md.push('', `Authors of the changes on main in the span (changes each): ${[...authors].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} (${n})`).join(', ')}.`);
  md.push('');

  const outDir = path.resolve(String(opts.out || path.join(os.tmpdir(), 'progress-report', `${site.org || 'site'}-${site.site || 'unknown'}`)));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'activity.json'), JSON.stringify(activity, null, 1));
  fs.writeFileSync(path.join(outDir, 'activity.md'), md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nwritten: ${path.join(outDir, 'activity.md')} and activity.json`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
