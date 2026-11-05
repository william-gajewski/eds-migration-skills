#!/usr/bin/env bash
# Builds this test's fictional project: ./origin.git, a bare repository standing in for GitHub, and
# ./project, a clone with five weeks of a migration's history. The dates are fixed, so the test reads
# the same on any day. The client, the people and the history are made up; the site is
# adobe/helix-website (aem.live's own), so that the live checks find real pages.
set -eu
here=$(pwd)
rm -rf origin.git project
git init -q --bare origin.git
git -C origin.git symbolic-ref HEAD refs/heads/main
git init -q project
cd project
git symbolic-ref HEAD refs/heads/main
git config core.autocrlf false
git config user.name "Fixture"
git config user.email "fixture@delivery.example"
git remote add origin "$here/origin.git"

put() { mkdir -p "$(dirname "$1")"; cat > "$1"; }
# commit <date> <author email> <message...>; COMMITTER_* set GitHub as the committer of a squash merge
commit() {
  local d="$1" a="$2"; shift 2
  git add -A
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" GIT_AUTHOR_NAME="${a%@*}" GIT_AUTHOR_EMAIL="$a" \
    GIT_COMMITTER_NAME="${COMMITTER_NAME:-${a%@*}}" GIT_COMMITTER_EMAIL="${COMMITTER_EMAIL:-$a}" git commit -q "$@"
}
# merge_pr <date> <merged by> <number> <branch> <title>: a merge commit as GitHub writes it
merge_pr() {
  local d="$1" a="$2" n="$3" b="$4" t="$5"
  GIT_AUTHOR_DATE="$d" GIT_COMMITTER_DATE="$d" GIT_AUTHOR_NAME="${a%@*}" GIT_AUTHOR_EMAIL="$a" \
    GIT_COMMITTER_NAME=GitHub GIT_COMMITTER_EMAIL=noreply@github.com \
    git merge -q --no-ff "$b" -m "Merge pull request #$n from example-learning/$b" -m "$t"
  git branch -q -D "$b"
}
DEV=dev1@delivery.example
LEAD=lead@delivery.example
AGENCY=dev@agency.example

# ---- the project log: its entries, written newest first by write_log ----
write_log() {
  {
    cat <<'EOF'
# Project log

Dated status, decisions and incidents for Example Learning, newest first. `AGENTS.md` holds the lasting facts and rules; this file holds what happened, when, and why.

<!-- An entry is a "## YYYY-MM-DD" heading and any of these lines:
- **Decided:** what, who decided, and why. A handover cites these for what is out of scope.
- **Published:** what went live, and what was checked on live.
- **Found:** a problem, with its fix or issue.
- **Waiting on:** what the client or another team owes, and since when.
-->
EOF
    for entry in "$@"; do printf '\n%s\n' "$entry"; done
  } > PROJECT-LOG.md
}
L0928=$(cat <<'EOF'
## 2026-09-28

- **Started:** the repository was set up with the migration starter kit.
- **Legacy site:** https://docs.example-learning.example. Baseline in `parity/baseline/`, not in git.
EOF
)
L1001=$(cat <<'EOF'
## 2026-10-01

- **Started:** the team has access to Document Authoring, GitHub and the site.
EOF
)
L1005=$(cat <<'EOF'
## 2026-10-05

- **Waiting on:** the brand guidelines (fonts, colors, logo files), from the client's marketing team.
EOF
)
L1014=$(cat <<'EOF'
## 2026-10-14

- **Decided:** search uses the site's query index, not the legacy search service (the client's product owner).
EOF
)
L1021=$(cat <<'EOF'
## 2026-10-21

- **Waiting on:** sign-off on the first /docs pages, on preview since Oct 21, from the client's content lead.
EOF
)
L1027=$(cat <<'EOF'
## 2026-10-27

- **Published:** six /developer pages, checked on live.
- **Received:** the brand guidelines, owed since Oct 5.
EOF
)
L1028=$(cat <<'EOF'
## 2026-10-28

- **Waiting on:** the analytics property ID for the production domain, from the client's analytics team, since Oct 28. The tag manager change (#16) needs it before go-live.
EOF
)
L1030=$(cat <<'EOF'
## 2026-10-30

- **Decided:** the /blog section stays on the legacy site for this phase; it moves with next year's redesign (the client's content lead, on the Oct 30 call).
- **Found:** the footer's legal links pointed at the legacy site. Fixed in #15.
EOF
)
L1102=$(cat <<'EOF'
## 2026-11-02

- **Found:** the hero video doesn't start on iPhones in Low Power Mode; the poster image shows instead.
EOF
)

# ---- the progress tracker: its header and its sections at two points in time ----
TRACKER_HEAD=$(cat <<'EOF'
# Progress

What we deliver for Example Learning and where each part stands, from the work plan of September 28, 2026. The `progress-report` skill reads this file for each status report and proposes changes from the evidence. Change a row when its status changes, and put the why in PROJECT-LOG.md.

<!-- Statuses: Not started, In progress, In review (on preview, waiting for the client's sign-off), Done, Blocked (say on what), Dropped (cite the decision in PROJECT-LOG.md). Waiting on the client: Open, Received, Not needed. Target: a date the client gave or agreed, else "-". Updated: when the status last changed. -->
EOF
)

# ---- week 0: the boilerplate and the starter kit ----
put package.json <<'EOF'
{
  "name": "example-learning",
  "private": true,
  "scripts": { "lint": "eslint . && stylelint blocks/**/*.css styles/*.css" }
}
EOF
put head.html <<'EOF'
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="/scripts/aem.js" type="module"></script>
<script src="/scripts/scripts.js" type="module"></script>
<link rel="stylesheet" href="/styles/styles.css"/>
EOF
put scripts/aem.js <<'EOF'
// the boilerplate's aem.js (shortened for this test)
export function sampleRUM() {}
EOF
put scripts/scripts.js <<'EOF'
import { sampleRUM } from './aem.js';

sampleRUM();
EOF
put styles/styles.css <<'EOF'
:root { --text-color: #131313; }
EOF
for b in header footer cards hero columns fragment; do
  mkdir -p "blocks/$b"
  printf '%s\n' "export default function decorate(block) {" "  block.classList.add('$b-ready');" "}" > "blocks/$b/$b.js"
  printf '%s\n' ".$b { display: block; }" > "blocks/$b/$b.css"
done
put .hlxignore <<'EOF'
.*
*.md
LICENSE
package.json
package-lock.json
test/*
EOF
commit "2026-09-28T15:00:00+0000" "$DEV" -m "Initial commit from the boilerplate"

put AGENTS.md <<'EOF'
# Example Learning: Edge Delivery Services migration

<!-- Test fixture: a fictional client. adobe/helix-website stands in for its site, so the live
checks find real pages. -->

<!-- migration-kickoff: project section. Lasting facts and rules only; dated status goes in PROJECT-LOG.md. -->

## Project

- **Client:** Example Learning. A migration of https://docs.example-learning.example to AEM Edge Delivery Services, authored in Document Authoring.
- **Org / site:** `adobe` / `helix-website` (also in `.migration/project.json`).
- **Preview / live:** `https://main--helix-website--adobe.aem.page/`, `https://main--helix-website--adobe.aem.live/`. Production domain: _to fill in_.
- **Day 1:** 2026-09-28. Working branch: `main`; pull requests go to `main`.
- **Who owns the pages' state:** the delivery lead.
- **Other teams writing the same content:** the client's content team (they author and publish /docs pages), and the client's analytics agency (tag manager and consent code).

## Where things are

- `PROJECT-LOG.md`: dated status, decisions and incidents, newest first.
- `PROGRESS.md`: what we deliver, the client's milestones and what the client owes, with their status.
- `status-reports/`: the progress reports for the weekly call.
EOF
put .migration/project.json <<'EOF'
{
  "type": "da",
  "sites": {
    "helix-website": {
      "previewOrg": "adobe",
      "previewSite": "helix-website",
      "contentHostUrl": "https://content.da.live/adobe/helix-website/"
    }
  }
}
EOF
put .migration/team.json <<'EOF'
{ "team": ["@delivery.example"] }
EOF
put .gitattributes <<'EOF'
* text=auto eol=lf
EOF
put .gitignore <<'EOF'
node_modules/
# Migration working files: local only. Client documents and plans never go in git.
/import-work/
/drafts/
/content/
/parity/
/intake/
EOF
write_log "$L0928"
commit "2026-09-28T16:00:00+0000" "$LEAD" -m "Migration starter kit"

{ printf '%s\n' "$TRACKER_HEAD"; cat <<'EOF'

## Milestones

| Milestone | Target | Needs | Status | Updated | Source |
|:---|:---|:---|:---|:---|:---|
| Developer docs live | 2026-11-13 | 2. Foundation (header, footer, docs page template); 3. Migration (/developer) | Not started | 2026-09-28 | SOW, milestone 1 |
| Full site launch | 2027-01-15 | All workstreams | Not started | 2026-09-28 | SOW, milestone 2 |

## 1. Mobilize

Done when: the team has access, every legacy page is in the inventory, and the redirects routine runs.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| Access for the team (DA, GitHub, the site's roles) | Not started | 2026-09-28 | |
| Content and template inventory | Not started | 2026-09-28 | |
| Redirects to the legacy site | Not started | 2026-09-28 | |

## 2. Foundation

Done when: the header, footer and page templates match the legacy site at each breakpoint.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| Header, desktop and phones | Not started | 2026-09-28 | |
| Footer | Not started | 2026-09-28 | |
| Docs page template, with sidebar navigation | Not started | 2026-09-28 | |
| Search | Not started | 2026-09-28 | |

## 3. Migration

Done when: every page in scope is live, and the redirects send the rest to the legacy site.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| /developer section (14 pages) | Not started | 2026-09-28 | |
| /docs section (40 pages) | Not started | 2026-09-28 | |
| /blog section (60 pages) | Not started | 2026-09-28 | |

## 4. Quality and launch

Done when: each template passes the accessibility checks and the go-live checklist is complete.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| Accessibility checks on each template | Not started | 2026-09-28 | |
| Go-live checklist and production domain | Not started | 2026-09-28 | |

## Waiting on the client

| Needed | From (role) | Needed for | Asked | Status |
|:---|:---|:---|:---|:---|
| Brand guidelines (fonts, colors, logo files) | Marketing | 2. Foundation | - | Open |
EOF
} > PROGRESS.md
commit "2026-09-30T15:00:00+0000" "$LEAD" -m "Progress tracker from the work plan"

# ---- weeks 1 to 4 ----
git switch -q -c header-desktop
printf '%s\n' "export default function decorate(block) {" "  block.classList.add('header-ready');" "  block.querySelector('nav')?.classList.add('desktop');" "}" > blocks/header/header.js
commit "2026-10-05T15:00:00+0000" "$DEV" -m "Header: desktop navigation"
git switch -q main
merge_pr "2026-10-06T15:00:00+0000" "$LEAD" 9 header-desktop "Header: desktop navigation"
write_log "$L1005" "$L1001" "$L0928"
commit "2026-10-06T16:00:00+0000" "$LEAD" -m "Project log: Oct 1 and 5"

git switch -q -c cards-four-up
echo ".cards ul { grid-template-columns: repeat(4, 1fr); }" >> blocks/cards/cards.css
commit "2026-10-19T15:00:00+0000" "$DEV" -m "Cards: four-up layout for the developer hub"
git switch -q main
merge_pr "2026-10-20T15:00:00+0000" "$LEAD" 12 cards-four-up "Cards: four-up layout for the developer hub"

git switch -q -c hero-phones
echo "@media (width < 600px) { .hero { min-height: 240px; } }" >> blocks/hero/hero.css
commit "2026-10-21T15:00:00+0000" "$DEV" -m "Hero: shorter on phones"
git switch -q main
merge_pr "2026-10-22T15:00:00+0000" "$LEAD" 13 hero-phones "Hero: shorter on phones"

{ printf '%s\n' "$TRACKER_HEAD"; cat <<'EOF'

## Milestones

| Milestone | Target | Needs | Status | Updated | Source |
|:---|:---|:---|:---|:---|:---|
| Developer docs live | 2026-11-13 | 2. Foundation (header, footer, docs page template); 3. Migration (/developer) | In progress | 2026-10-06 | SOW, milestone 1 |
| Full site launch | 2027-01-15 | All workstreams | Not started | 2026-09-28 | SOW, milestone 2 |

## 1. Mobilize

Done when: the team has access, every legacy page is in the inventory, and the redirects routine runs.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| Access for the team (DA, GitHub, the site's roles) | Done | 2026-10-01 | PROJECT-LOG 2026-10-01 |
| Content and template inventory | Done | 2026-10-09 | MIGRATION-CHECKLIST.md |
| Redirects to the legacy site | Done | 2026-10-12 | /redirects published Oct 12 |

## 2. Foundation

Done when: the header, footer and page templates match the legacy site at each breakpoint.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| Header, desktop and phones | In progress | 2026-10-06 | #9 desktop navigation |
| Footer | In progress | 2026-10-16 | /footer published Oct 16; links still to do |
| Docs page template, with sidebar navigation | Not started | 2026-09-28 | |
| Search | Not started | 2026-09-28 | |

## 3. Migration

Done when: every page in scope is live, and the redirects send the rest to the legacy site.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| /developer section (14 pages) | In progress | 2026-10-22 | 4 of 14 live |
| /docs section (40 pages) | In progress | 2026-10-15 | 3 of 40 live; 2 on preview for sign-off |
| /blog section (60 pages) | Not started | 2026-09-28 | |

## 4. Quality and launch

Done when: each template passes the accessibility checks and the go-live checklist is complete.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| Accessibility checks on each template | Not started | 2026-09-28 | |
| Go-live checklist and production domain | Not started | 2026-09-28 | |

## Waiting on the client

| Needed | From (role) | Needed for | Asked | Status |
|:---|:---|:---|:---|:---|
| Brand guidelines (fonts, colors, logo files) | Marketing | 2. Foundation | 2026-10-05 | Open |
| Sign-off on the first /docs pages, on preview | Content lead | 3. Migration: /docs | 2026-10-21 | Open |
EOF
} > PROGRESS.md
write_log "$L1021" "$L1014" "$L1005" "$L1001" "$L0928"
commit "2026-10-23T15:00:00+0000" "$LEAD" -m "Progress tracker and project log: Oct 23"

# ---- the week of the report, Oct 26 to Nov 1 ----
put status-reports/2026-10-25.md <<'EOF'
---
title: "Example Learning: progress report"
subtitle: "October 19 to 25, 2026"
date: "October 26, 2026"
period-start: "2026-10-19T00:00:00-04:00"
period-end: "2026-10-26T00:00:00-04:00"
---

# Summary

We published the developer hub's first four pages and the redirects for pages not migrated yet. The
header works on desktop; phones come next week. Two /docs pages are on preview for your sign-off.

# Next

1. Publish the next six /developer pages.
2. Finish the header for phones, and the footer's links.
3. Start the docs page template's sidebar navigation.
4. Your sign-off on the two /docs pages on preview.
EOF
commit "2026-10-26T13:00:00+0000" "$LEAD" -m "Status report for Oct 19 to 25"

git switch -q -c header-mobile
printf '%s\n' "export default function decorate(block) {" "  block.classList.add('header-ready');" "  block.querySelector('nav')?.classList.add('desktop');" "  block.querySelector('.nav-hamburger')?.addEventListener('click', () => block.classList.toggle('open'));" "}" > blocks/header/header.js
commit "2026-10-23T18:00:00+0000" "$DEV" -m "Header: menu button and drawer on phones"
echo "@media (width < 900px) { .header .nav-hamburger { display: block; } }" >> blocks/header/header.css
commit "2026-10-26T12:00:00+0000" "$DEV" -m "Header: close the menu on Escape"
git switch -q main
merge_pr "2026-10-26T15:00:00+0000" "$LEAD" 14 header-mobile "Header: navigation menu on phones"

git switch -q -c footer-links
echo ".footer .legal { font-size: 0.875rem; }" >> blocks/footer/footer.css
commit "2026-10-27T13:00:00+0000" "$DEV" -m "Footer: links to the migrated pages, and the legal line"
git switch -q main
merge_pr "2026-10-27T15:00:00+0000" "$LEAD" 15 footer-links "Footer: links and legal line"

git switch -q -c analytics-consent
put scripts/delayed.js <<'EOF'
// the client's tag manager, loaded after consent (the analytics agency's change)
export default function loadTags() {}
EOF
echo '<link rel="preconnect" href="https://tags.example-learning.example"/>' >> head.html
commit "2026-10-27T20:00:00+0000" "$AGENCY" -m "Analytics: load the tag manager after consent"
git switch -q main
merge_pr "2026-10-28T15:00:00+0000" "$AGENCY" 16 analytics-consent "Analytics: load the tag manager after consent"

git switch -q -c docs-sidebar
put blocks/sidebar/sidebar.js <<'EOF'
export default function decorate(block) {
  block.setAttribute('role', 'navigation');
}
EOF
put blocks/sidebar/sidebar.css <<'EOF'
.sidebar { position: sticky; top: 0; }
EOF
put styles/templates/docs.css <<'EOF'
.docs main { display: grid; grid-template-columns: 240px 1fr; }
EOF
commit "2026-10-28T19:00:00+0000" "$DEV" -m "Docs pages: sidebar navigation block and template"
git switch -q main
merge_pr "2026-10-29T15:00:00+0000" "$LEAD" 17 docs-sidebar "Docs pages: sidebar navigation"

write_log "$L1030" "$L1028" "$L1027" "$L1021" "$L1014" "$L1005" "$L1001" "$L0928"
commit "2026-10-30T15:00:00+0000" "$LEAD" -m "Project log: Oct 27 to 30"

echo "@media (600px <= width < 900px) { .cards img { aspect-ratio: 4 / 3; } }" >> blocks/cards/cards.css
COMMITTER_NAME=GitHub COMMITTER_EMAIL=noreply@github.com commit "2026-10-31T15:00:00+0000" "$DEV" -m "Cards: image ratio on tablets (#18)"

# work in progress: a branch with commits in the week, not merged
git switch -q -c search-results
put blocks/search/search.js <<'EOF'
export default async function decorate(block) {
  block.textContent = 'Search';
}
EOF
commit "2026-10-29T20:00:00+0000" "$DEV" -m "Search: query the index"
echo "// results list" >> blocks/search/search.js
commit "2026-10-31T19:00:00+0000" "$DEV" -m "Search: results list"
git push -q origin search-results
git switch -q main

# ---- after the week: not part of the report ----
echo ".hero video { object-fit: cover; }" >> blocks/hero/hero.css
COMMITTER_NAME=GitHub COMMITTER_EMAIL=noreply@github.com commit "2026-11-02T16:00:00+0000" "$DEV" -m "Hero: video background (#19)"
write_log "$L1102" "$L1030" "$L1028" "$L1027" "$L1021" "$L1014" "$L1005" "$L1001" "$L0928"
commit "2026-11-02T17:00:00+0000" "$LEAD" -m "Project log: Nov 2"

git push -q -u origin main
git fetch -q origin
echo "Built $(pwd): $(git rev-list --count main) commits on main; origin is $here/origin.git"
