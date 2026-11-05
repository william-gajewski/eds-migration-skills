---
name: progress-report
description: Write the client-facing progress report for a span of work on an AEM Edge Delivery Services migration (Document Authoring), as Markdown and PDF, with talking points for the call kept out of the document. By default it covers the time since the last report, else the last 7 days. It works from what actually happened rather than the plan (changes merged to main and work still on branches, pages previewed, published and unpublished in the site's audit log, the project log's decisions and findings, and the milestones in PROGRESS.md, which it brings up to date), checks every published page on live, and keeps our team's work apart from the client's and other teams'. Use it before a weekly or status call, and whenever someone asks for a status report, weekly update, progress summary, milestone update, sprint recap or "what did we get done this week / since <date>", even if they only say "write up this week for the client".
---

# Progress report

A weekly call goes better with a short document the client can read before it and keep after it:
what we finished, what's live, where the milestones stand, and what we need from them. On a
Document Authoring project most of that work never touches git. Pages are imported, previewed and
published in Document Authoring, so a summary of commits misses the migration itself. The site's
audit log records every preview and publish, with who did it. Other teams publish to the same site
and merge to the same repository, so the evidence also holds work that isn't ours, and a report
that claims it is wrong the first time someone checks.

This skill gathers the evidence for the span, checks on live what it says, brings the progress
tracker up to date, and writes the report in plain words for the client, with the internal points
kept for the call.

## What you need

- The project's repository, run from its root: an Edge Delivery Services project that names its site
  in `.migration/project.json` (or `fstab.yaml`), with `origin` pointing at GitHub.
- A Document Authoring sign-in with the site's **author** role or higher, for the audit log
  (`basic_author` can't read it): `npx -y github:adobe-rnd/da-auth-helper token > /dev/null`. Never
  print the token. If someone exported the log (the admin API's JSON), `--log-file <export>` reads that
  instead. Without either, the report covers code and notes only and says the pages weren't checked.
- Who "we" are: `.migration/team.json` lists our team's sign-ins, `{ "team": ["@ours.example"] }`. An
  entry starting with `@` matches a domain, `+login@users.noreply.github.com` a GitHub login's commits,
  anything else one address. Prefer domains: in a public repository the file is public.
- `PROGRESS.md`, the tracker project-intake writes from the work plan. Without it the report has no
  milestones section (step 3 says how to start one).
- Node 18 or later; pandoc and typst for the PDF, as for project-intake.

Scripts are in this skill's `scripts/` folder; call them by absolute path.

## Workflow

### 1. Gather the activity

```bash
node <skill>/scripts/activity.mjs [--from 2026-10-26 --to 2026-11-01 | --days 7] [--log-file export.json]
```

The span is in local days, inclusive: the dates the person gives, else from the end of the last
report in `status-reports/` to now, else the last 7 days. The script fetches `origin` (`--no-fetch`
skips it), takes a few seconds to a minute, and prints `activity.md`. It and `activity.json` go to a
folder outside the repository, since they hold sign-in domains and page paths for one run. It reads:

- **Code:** pull requests merged to `origin/main` in the span and commits that reached main without
  one, each with the areas it touched and whether our team wrote it; new blocks; branches with
  commits in the span that aren't merged yet (work in progress).
- **The site,** from the audit log: pages, fragments and sheets previewed, published, unpublished or
  deleted, by our team or others. The log's history since day 1 tells first publications from
  republications. Pages on preview but not published, pages live per section, and code deployments.
- **Live checks:** every path published or unpublished in the span is fetched on the `aem.live` host:
  live, redirected (a redirects row covers the page), or not found. Pages only on preview are
  checked on preview.
- **Notes:** PROJECT-LOG.md entries dated in the span; PROGRESS.md now and as it was when the span
  began; the previous report.

Read the warnings first. If our team isn't set, nothing is attributed: show the person the sign-ins
table, ask which are ours, write `.migration/team.json`, and run the script again. Don't guess from
the domains, because the client's own staff and other agencies are in the same table.

### 2. Read what the evidence points to

Read the previous report's "Next" section: the report says what became of each item. Read
PROGRESS.md, and BACKLOG.md or MIGRATION-CHECKLIST.md if the project keeps them. Open the pull
requests or pages behind anything you can't describe in a client's terms from its title.

Some work leaves no trace in either source: workshops, reviews, decisions taken on calls, content
the client sent. Don't hold the draft for it. Write from the evidence, and ask in your reply what
else happened in the span.

### 3. Bring PROGRESS.md up to date

For each row the evidence moves, change its status, date and evidence: a merged pull request, a
section of pages that went live (give the count, "10 of 14 live"), a branch started, an item the
client delivered (Received, from a log entry). The date is the evidence's (the merge, the publish,
the log entry), not today's. A milestone is In progress once anything it needs has started. Add the
new "Waiting on" items from the project log.
Leave a status that takes judgment as a question in your reply instead of setting it: Done for
something the client hasn't seen, Blocked, or Dropped without a "Decided" entry behind it. The file
stays uncommitted, so the person reviews the change before it goes in.

If there's no PROGRESS.md, offer to start one, from the work plan if there is one, with
`<skill>/../project-intake/references/progress-template.md`. Until then the report has no milestones
section.

### 4. Write the report

Follow `references/report-template.md`: its writing rules, skeleton and notes. In short:

- it's client-facing: "we" is our team and "you" the client, with no people's names, email addresses,
  other teams' names or internal remarks;
- it reports our work only: other teams' work stays out, or appears as the state it left ("7 of the
  40 /docs pages are live");
- a page is live only if the check found it live: one behind a redirects row, unpublished since or
  not found isn't, and it goes in the talking points instead;
- it says what changed for the client, not which files: one to three pages after the cover.

Save it as `status-reports/<end date>.md`, the name activity.md gives, with the `period-start` and
`period-end` it gives in the front matter: the next report starts where this one ends. Leave it as a
draft for the person to review and send; this skill doesn't send anything.

### 5. Render and look at it

```bash
node <skill>/scripts/render-pdf.mjs status-reports/<date>.md --no-contents --png
```

This writes the PDF beside the Markdown and page images to `<date>-pages/`. Read them, fix cramped
tables or an overlong page, and render again. Then delete the `-pages/` folder: the images are only
for this check. `--paper a4` switches from US letter. Without pandoc or typst, hand over the Markdown
and say the PDF wasn't made.

Before the first report is committed, `.hlxignore` has to list `status-reports/*`: Edge Delivery
Services serves every committed file that `.hlxignore` doesn't list, the PDF included, on the
site's own hosts. Add the line (the starter kit adds it on new projects) and say so. If the
repository is public, so are the reports: save them outside it and ask the person where they go.

### 6. Reply

- Where the report and its PDF are, the page count, and the period.
- **For the call**, internal and not in the document: what to open with, what to ask the client for,
  and what to raise (pages the checks didn't find live, other teams' changes that touch our work,
  previews waiting for a publish, a milestone whose remaining work doesn't fit before its target).
  Then what you left out of the report and why.
- The tracker changes you made, and the ones that need the person's decision.
- What couldn't be checked, and what checking it needs.
- The files to commit: the report, PROGRESS.md, `.hlxignore` or `.migration/team.json` if they
  changed. Nothing is staged.

## Judgment calls

- **Our work and theirs.** A pull request is ours when most of its commits are; "shared" ones are
  described as joint work or left out. A page the client's team published counts in the section
  totals, which describe the site, and not in what we did. Other agencies aren't named, in the
  report or in its tables.
- **Live means checked.** The audit log says what someone did; the check says what the site shows.
  When they disagree, the site wins, and the disagreement goes in the talking points with its likely
  cause: a redirects row that still covers a migrated page (rebuild the sheet with
  legacy-redirects), an unpublish by another team, a publish that didn't go through.
- **Previews.** A page on preview isn't done. Say it waits for the client's review when the tracker
  or the log says so, and otherwise leave it for the talking points. A shared fragment (nav, footer)
  previewed but not published is unpublished work that goes out with the next publish of it:
  raise it for the call.
- **Milestones.** Give the facts: the target, what's done, what's left, what's blocked. Whether a
  milestone is at risk is the person's call to make to the client, so ask in the talking points
  rather than writing it in.
- **Quiet weeks.** One page is fine. Say what's in progress and what's waiting, and don't pad it.
- **Long spans.** For a month or a phase, group pages by section and changes by workstream; the
  tables get counts, not lists.
- **Dates ahead.** "Next" says what we plan, not when it's done, unless the date is a target in
  PROGRESS.md.
