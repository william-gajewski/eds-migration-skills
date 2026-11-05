# Progress tracker template

`PROGRESS.md` goes in the project's repository, next to `PROJECT-LOG.md`. It holds what the project
delivers and where each part stands: the milestones the client named, each workstream's
deliverables, and what the client owes. The `progress-report` skill reads it for every status
report, updates it from the evidence (merged pull requests, pages live, the project log), and
reports what moved. The log keeps the history (what was decided, when, by whom); this file keeps
the current state.

Unlike the work plan, it's committed, so:

- no people's names: roles and teams;
- nothing from the plan's "Internal context": no commercial figures, positioning or remarks;
- in a public repository it's public too.

## Writing rules

- **Deliverables, not activities.** One row per thing the client would recognize: a template, a
  feature, a section of pages, a checklist. Merge small ones until each workstream has three to six
  rows, fifteen to thirty in all. The plan's activities are how we get there; they stay in the plan.
- **Statuses:** Not started, In progress, In review (on preview, waiting for the client's sign-off),
  Done, Blocked (say on what), Dropped (cite the "Decided" entry in PROJECT-LOG.md). For what the
  client owes: Open, Received, Not needed. A milestone is In progress once anything it needs has
  started.
- **Start honest.** Every row starts Not started, unless the documents say it's done, with the plan's
  date in Updated. Updated changes when the status does.
- **Targets only from the client.** A target is a date the client gave or agreed, with its source.
  The plan has no estimates, and neither does this file: otherwise the target is "-". "Before the
  spring campaign" is a target of "spring (date to confirm)", and a question in the plan.
- **Page sections with their size.** "/plans section (120 pages)", from the survey or the inventory,
  so the report can say how many are live.
- **Evidence in a few words:** a pull request, a page live, a log date. Empty while Not started.
- **Tables for the parser:** pipe tables with a header row and a Status column, one table per
  section, under `## ` headings. The progress-report script reads them, so keep the columns as below.

## Skeleton

```markdown
# Progress

What we deliver for <Client> and where each part stands, from the work plan of <Month D, YYYY>. The
`progress-report` skill reads this file for each status report and proposes changes from the
evidence. Change a row when its status changes, and put the why in PROJECT-LOG.md.

<!-- Statuses: Not started, In progress, In review (on preview, waiting for the client's sign-off), Done, Blocked (say on what), Dropped (cite the decision in PROJECT-LOG.md). Waiting on the client: Open, Received, Not needed. Target: a date the client gave or agreed, else "-". Updated: when the status last changed. -->

## Milestones

| Milestone | Target | Needs | Status | Updated | Source |
|:---|:---|:---|:---|:---|:---|
| <a milestone the client named> | <YYYY-MM-DD, or -> | <workstreams or deliverables it needs> | Not started | <plan date> | <[brief p.2]> |

## 1. <Workstream>

Done when: <the plan's exit criteria>.

| Deliverable | Status | Updated | Evidence |
|:---|:---|:---|:---|
| <deliverable> | Not started | <plan date> | |

## Waiting on the client

| Needed | From (role) | Needed for | Asked | Status |
|:---|:---|:---|:---|:---|
| <data, access or decision> | <role> | <workstream or deliverable> | <YYYY-MM-DD, or - if not asked yet> | Open |
```

Leave out the Milestones section when the documents name none. The workstreams are the plan's, in
its order and with its numbers. "Waiting on the client" is the plan's "Client dependencies" table.
