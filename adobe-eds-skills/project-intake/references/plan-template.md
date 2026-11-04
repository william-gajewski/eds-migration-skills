# Work plan template

The plan is internal: it is for the delivery lead and team, to agree scope and order and to take
the right questions to the client. It carries no estimates: no durations, dates you invented,
effort, team sizes or cost. Sizing signals (page counts, templates, sites, forms, integrations)
belong in it, because they are what the lead will estimate from.

Aim for three to seven pages after the cover: three for a small site, about seven for several
sites with rebuilt flows. Prefer tables to prose and one idea per row, and keep tables to the rows that
matter. Everything in it either comes from a source (say which) or is labeled as an assumption or
a question.

## Writing rules

- **Cite.** After a fact, name its source in brackets: `[brief p.3]`, `[kickoff notes]`,
  `[survey]`. Something no source says is an assumption ("Assumption: ...") or an open question.
- **Don't invent scope.** If the documents don't say whether something is in scope, it goes under
  "To decide", with who decides.
- **People: roles and decisions only.** Record what each person owns or decides. Leave out remarks
  about people, even when the source makes them ("slow-moving", "difficult").
- **Commercial context stays in its section.** Deal size, renewal timing, sales strategy and
  internal positioning go only in "Internal context", so the rest can be lifted into client
  material.
- **One platform model.** Name the target (see complexity-drivers.md, 17) and use its terms only.
  Don't mix Document Authoring, Universal Editor, AEM as a Cloud Service and AEM 6.5 vocabulary.
- **Platform claims are checked.** Before saying the platform does something, check it in the
  aem.live documentation (the docs-search skill can search it). Don't repeat sales-deck claims.
- **Plain words.** Spell out "Edge Delivery Services" at first use. Define any client jargon or
  internal code names once.
- **Tables for the PDF:** pipe tables with left-aligned `:---` separators. The number of dashes in
  each column sets its share of the width, so give wide columns more dashes. Give every table a
  real header row: the PDF template bolds the first row, so an empty header makes the first data
  row look like one.

## Skeleton

```markdown
---
title: "<Client>: <program or project name>"
subtitle: "Work plan (internal draft)"
date: "<Month D, YYYY>"
---

# Summary

<3 to 5 sentences: what the client wants and why, the sites and their size, the target platform
and authoring model, how the work divides into workstreams, and the biggest unknowns.>

| Item | Detail |
|:-------------|:------------------------------------------------------|
| Client | <organization; the part running the project, if different> |
| Sites | <host (pages)> ... |
| Target | <platform and authoring model> |
| Sources | <each document, with its date>; site survey of <hosts>, <date> |

# Scope

| In scope | Out of scope | To decide (who decides) |
|:----------------------|:----------------------|:------------------------------|
| <item> [source] | <item> [source] | <item> (<role>) |

# Starting point

<One table row per site from the survey: pages, platform, largest sections. Then what the survey
and the documents found that affects the work. Only what applies.>

| Site | Pages | Platform | Largest sections |
|:-------------------|-----:|:-----------------------|:----------------------------------|

- **Forms:** ...
- **Search:** ...
- **Logged-in areas:** ...
- **Regional or personalized content:** ...
- **Pages built in the browser:** ...
- **Documents and assets:** ...
- **Tags, analytics, consent:** ...
- **Related sites not in the documents:** <host (n of N sampled pages link to it)>: scope to decide.

# Target

- **Platform:** <target>, and what follows from it (where content is authored, where code lives,
  how pages are published).
- **Sites and repositories:** <one site or several; one repository or shared code>.
- **What gets rebuilt, kept or linked:** <integrations and features, one line each>.

# Workstreams

<Three to six workstreams. Typical: Mobilize, Foundation, Migration, special features (one
workstream per large feature: a transactional flow, regional logic, search), Quality and launch.
For each: an objective, then its activities in order.>

## 1. <Workstream>

<Objective in one or two sentences.>

| Activity | Deliverables | Needs |
|:----------------------------|:----------------------------|:----------------------|
| <activity> | <deliverable>; <deliverable> | <dependency, or another activity> |

Done when: <exit criteria in one line>.

<Three to five activities per workstream. Merge small ones.>

# Client dependencies

| Needed | From (role) | Needed for | Status |
|:------------------------------|:------------------|:---------------------|:--------------|
| <data, access, decision> | <role> | <workstream or activity> | <owed since / not asked> |

# Risks

| Risk | Signal | Mitigation |
|:--------------------------|:--------------------------|:--------------------------|
| <what could go wrong> | <where it shows up> [source] | <what the plan does about it> |

# Questions for the client

<Numbered, grouped by topic. Each says why it matters in a few words. Put the ones that block
the first workstreams first.>

1. **<Topic>:** <question> (<why: what it changes>)

# Internal context

<Facts the team needs that don't go to the client: commercial context, how the delivery is
positioned, the delivery model. Facts only.>

- **<Organization>:** <name> (<role; what they own or decide>), ...

# First actions

- [ ] <access request, kickoff question, inventory step, decision to get>
```

## Notes on the sections

- **Summary:** someone reading only this table and paragraph should know what is being bought and
  where the uncertainty is.
- **Starting point:** quote numbers from the survey with their basis (sitemap count, sampled
  pages). Say what the survey can't see: it reads server HTML without running scripts, so
  browser-built content and logged-in areas are invisible to it.
- **Workstreams:** activities are things the team does; deliverables are things the client can
  see. Keep each workstream to three to five activities. The Mobilize workstream usually holds
  access, the content and template inventory, the redirect routine and the look-and-feel bar.
- **Risks:** a risk needs a signal. "The client may be slow" is not a risk; "the ZIP list owed
  since kickoff [brief p.3]" is.
- **Questions:** ask what the documents leave open and what the drivers raise. Don't ask what the
  documents already answer.
- **First actions:** concrete actions in order, each one line, for the start of the work.
