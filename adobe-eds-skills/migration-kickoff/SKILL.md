---
name: migration-kickoff
description: Start an AEM Edge Delivery Services migration (Document Authoring) the same way every time. It checks the machine, turns the client's documents into a work plan with project-intake, then sets up the project's repository with the starter kit, the redirects config and a day-1 record of the legacy site (its breakpoints, screenshots and Lighthouse scores). The kit is a short AGENTS.md with the project's facts and lasting rules, a dated project log, LF line endings, ignore rules, .migration/project.json, and smoke, accessibility and Lighthouse checks. Use it when a new client, site or migration starts, when someone says "kick off", "new project", "set up the repo", "starter kit" or "check my machine", or when an existing migration repository lacks these basics, even if they only say "new client X".
---

# Migration kickoff

What a project records on day 1 is what every later session knows. Set up from memory, each project
starts with different notes, CRLF files that fail lint, a legacy site nobody measured before it
changed, and an AGENTS.md that grows until it's mostly old status. This skill does the setup once,
the same way. It stops after the plan for the person's review, and leaves anything outward-facing,
such as a new repository or site, to them. It never creates repositories, commits, pushes or
publishes.

`<skill>` below is this skill's folder. The other migration skills are next to it, so
source-parity's scripts are in `<skill>/../source-parity/scripts/`.

## What you need

- Node 20.19 or later, and git. The machine check (step 1) lists the rest and how to install it.
- The client's documents (files or pasted text) and the legacy site's address.
- For step 4, a clone of the project's repository. Creating the repository and the site isn't part
  of this skill (see step 3).

## Workflow

### 1. Check the machine

```bash
node <skill>/scripts/check-machine.mjs
```

It only reads, and prints a fix for each problem. Fix every FAIL before going on. Each warning says
what it affects (PDFs, Lighthouse, deep clones), so it can wait until the step that needs it. On
Windows, set `core.autocrlf` and `core.longpaths` before cloning: a clone made with
`core.autocrlf=true` has CRLF files, and Adobe's boilerplate has no `.gitattributes` to undo that.

### 2. Plan with project-intake

Collect these once, and ask for what's missing:

- the client's name, and their documents;
- the legacy site or sites;
- the org and site names, if known (`main--<site>--<org>.aem.page`);
- day 1's date and the working branch;
- who owns the pages' state: the person who decides what is published, and what is restored when DA
  and live disagree. Ask; don't assume it's whoever runs the kickoff;
- the other teams that write the same content (the client's authors, agencies, other developers);
- our team's sign-in domains (or addresses, when we sign in with the client's accounts), so that
  progress reports count only our work;
- the team for the plan: our architect, developers and project manager, and the platform vendor's
  EA ("to be assigned" is an answer);
- the joint call with the platform vendor and the client: its day, time and time zone, and who
  attends, if it's set.

Run the `project-intake` skill on the documents, with the team and the meeting you collected. Keep
its output outside the repository, in a workspace folder next to the clone
(`<projects>/<client>/intake/`): the plan, its internal notes and the client's documents never go in
git (the plan names people; the notes and the documents are confidential). The exception is
`PROGRESS.md`, the progress tracker it writes for the repository, which step 4 copies in.

**Stop here.** The person reviews the plan and takes its blocking questions to the client. Go on when
they say so.

### 3. Get the repository

- **It exists:** clone it next to the intake folder (on Windows,
  `git -c core.longpaths=true clone <url>`), then create the working branch (`git switch -c <branch>`).
- **It doesn't:** don't create it here. A repository and a site are outward-facing, and they often
  belong to the client's or a partner's GitHub organization. Give the person these steps, and wait:
  1. a private repository from `adobe/aem-boilerplate`, in the right organization. Adobe's
     `create-site` skill does this with the `gh` CLI, but makes the repository public unless told
     otherwise;
  2. the AEM Code Sync GitHub app on that repository;
  3. the site in Document Authoring, with its nav, footer and index (`create-site` seeds them);
  4. preview and publish roles for the people who need them, in the site's configuration.

Check whether the repository is public: `https://api.github.com/repos/<owner>/<repo>` answers 200
without signing in only when it is. In a public repository, `AGENTS.md` and `PROJECT-LOG.md` are
public too, so name roles and teams there, not people.

### 4. Add the starter kit

```bash
node <skill>/scripts/apply-starter.mjs --repo <clone> --org <org> --site <site> \
  --client "<Client>" --legacy https://www.legacy.example --day1 <YYYY-MM-DD> \
  --branch <branch> --owner "<who owns the pages' state>" --teams "<other teams>" \
  --progress <projects>/<client>/intake/PROGRESS.md --team "@ours.example" --dry-run
```

The dry run shows what it would do; run it again without `--dry-run`. It only adds what a file
lacks and never overwrites, so it's safe on a repository that already has some of the kit. What it
can't merge (a `.gitattributes` without an LF rule, a CLAUDE.md that doesn't import AGENTS.md) it
lists for you to do by hand. `--legacy` can be given once per legacy host. Read the tracker before
it goes in: it's committed, so it must not name people or carry anything from the plan's internal
notes.

Then, in the clone:

```bash
npm install                       # adds playwright and axe-core to package-lock.json
npx playwright install chromium
npm run lint
```

If lint fails on line breaks, the clone has CRLF files: set `git config --global core.autocrlf
input` and clone again. Fill in what the kit left as "_to fill in_" in AGENTS.md's Project section
as it becomes known (the production domain, for one).

### 5. Set up the redirects config

```bash
node <skill>/../legacy-redirects/scripts/init.mjs --source https://www.legacy.example \
  [--prefix section=https://other.legacy.example]
```

Run it from the clone: it reads `.migration/project.json`. Don't build or upload a sheet yet, as no
migrated page links anywhere so far. The `legacy-redirects` skill takes over after the first batch.

### 6. Record the legacy site as it is on day 1

The legacy site keeps changing during a migration, and it is often switched off at the end. Record
it now, in `parity/baseline/` in the clone (gitignored):

1. **Pages.** One URL per page type: the home page and a page from each large section of the intake
   survey (`survey.json`), about six to eight. Confirm the list with the person.
2. **Breakpoints.** Run these from the clone, where Playwright is installed:

   ```bash
   node <skill>/../source-parity/scripts/breakpoints.mjs --url <page> --url <page> ...
   ```

   Ask which of the most used widths the page's own layout switches at (vendor CSS counts too), and
   write those in AGENTS.md's Project section. Every later parity sweep uses them.
3. **Screenshots.** For each page, at a phone width, each breakpoint and the widest desktop:

   ```bash
   node <skill>/../source-parity/scripts/capture.mjs --url <page> --name src --width <w> \
     --out parity/baseline/<page-name>
   ```

4. **Lighthouse,** on the production legacy host rather than a staging copy. Each run takes up to
   about a minute, and it makes 3 per page on phone and desktop, so eight pages take most of an
   hour: run it in the background.

   ```bash
   npm run check:lighthouse -- --url <page> --url <page> --out parity/baseline/lighthouse.json
   ```

Then replace the "_to be added by the kickoff_" line in PROJECT-LOG.md's day-1 entry with the pages,
the breakpoints and the median scores, and say the captures are in `parity/baseline/` on this
machine only.

### 7. Check the new site, if it has pages

If preview already serves pages (create-site's index), run `npm run check:smoke -- --host preview`
and `npm run check:axe -- --host preview`, so the checks are known to work before the first batch.

### 8. Report

- what changed in the working tree, as the list to commit (nothing is staged);
- what stays out of git: the plan, `parity/baseline/`, `import-work/`;
- the machine check's open warnings, and what's still "_to fill in_";
- the plan's verdict on the four weeks, and its blocking questions for the client;
- what's next: the first import batch, then `legacy-redirects` after each batch, `safe-publish` for
  every preview and publish, `source-parity` for each template, and `progress-report` before each
  client call.

## The starter kit

| File | What it holds |
|:--|:--|
| `AGENTS.md` | Adobe's boilerplate lines, then the project section: the project's facts (site, hosts, legacy site and its breakpoints, day 1, who owns the pages' state, the other teams), where things are, and the lasting rules for content, publishing, redirects and code. About 70 lines. |
| `CLAUDE.md` | `see @AGENTS.md`, as the boilerplate ships it, so Claude Code reads the same file as other agent tools |
| `PROJECT-LOG.md` | dated status, decisions and incidents, newest first; project-outtake and progress-report read it |
| `PROGRESS.md` | project-intake's tracker, copied in with `--progress`: the client's milestones, each workstream's deliverables and what the client owes, with their status; progress-report keeps it up to date and writes its reports to `status-reports/` |
| `.gitattributes`, `.editorconfig`, `.vscode/settings.json` | LF line endings for git, editors and VS Code |
| `.gitignore`, `.hlxignore` | local folders (`import-work/`, `drafts/`, `content/`, `parity/`, `intake/`, check results, PDF page images) kept out of git; the checks, the notes, the handover (`project-guides/`) and the progress reports (`status-reports/`) kept off the site, which serves every committed file `.hlxignore` doesn't list |
| `.migration/project.json` | org and site, in the shape the import tools and the migration skills read |
| `.migration/team.json` | our team's sign-in domains, from `--team`; progress-report reads them to tell our work from the client's and other teams' |
| `test/checks/` | `check:smoke`, `check:axe` and `check:lighthouse`, run locally against `aem up`, preview or live; `playwright` and `axe-core` become devDependencies |

CI stays the boilerplate's lint workflow. The checks run locally; a workflow that runs them on the
branch preview after each push is for a real project's first weeks, where it can be tested.

## Rules of thumb

- **AGENTS.md loads in every agent session, for everyone.** Keep it to lasting facts and rules, under
  about 150 lines. A decision with a date, an incident or "published on" belongs in PROJECT-LOG.md.
  When a rule changes, change it in AGENTS.md and log the date and the reason.
- **Ask who owns the pages' state on day 1.** It decides what you do when someone's DA edits differ
  from live.
- **Client material stays out of the repository**: documents, the plan, pricing, tokens, and
  configuration dumps (a site's configuration holds secrets).
- **Measure the legacy site before anyone changes it.** A redesign announced mid-project, a
  campaign banner or a consent tool can all change it, and the day-1 baseline is what the handover
  compares against.

## What this skill doesn't do

It doesn't create repositories or sites, install the Code Sync app, change site configuration or
access, stage, commit, push or publish. For imports use Adobe's `page-import` or the project's own
importer; for the work plan alone, `project-intake`.
