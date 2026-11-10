# Work plan template

The plan is for the delivery team, written so it can go as is to the platform vendor's team and
the client's project lead: what the client wants and why, who's on the project, what's in scope,
what's missing, whether the usual four weeks hold, and when everyone meets. Commercial context
goes in separate internal notes (the last section of this file), never in the plan.

Aim for three to seven pages after the cover: three for a small site or a thin request, about seven
for several sites with rebuilt flows. Prefer tables to prose and one idea per row, and keep tables
to the rows that matter. Everything in it either comes from a source (say which) or is labeled as
an assumption or a question.

## Writing rules

- **Cite.** After a fact, name its source in brackets: `[brief p.3]`, `[kickoff notes]`,
  `[survey]`, or the role and date for what someone told you (`[delivery lead, Nov 9]`). Something
  no source says is an assumption ("Assumption: ...") or an open question.
- **Four weeks, not an estimate.** The plan's only duration is the usual four weeks, or a length
  the documents or the person give, with what would push it out or shorten it. Don't add weeks up
  or put a number on a factor: the delivery lead sets the length. No effort, rates, cost or
  pricing, and no view on how many people the work needs (the Team section lists who's assigned).
  Sizing signals (page counts, templates, sites, forms, integrations) belong in it.
- **Don't invent scope.** If the documents don't say whether something is in scope, it goes under
  "To decide", with who decides.
- **People: names in the Team section, roles elsewhere.** Record what each person owns or decides.
  Leave out remarks about people, even when the source makes them ("slow-moving", "difficult").
- **Nothing commercial.** Deal size, renewal timing, sales strategy and how the delivery is
  positioned go in the internal notes, so the plan can be shared as is.
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
subtitle: "Work plan (draft)"
date: "<Month D, YYYY>"
---

# Purpose and summary

<Purpose, in one or two sentences: what the client wants and why [source]. Then three or four
sentences: the sites and their size, the target platform and authoring model, whether the four
weeks hold, and the biggest unknowns.>

| Item | Detail |
|:-------------|:------------------------------------------------------|
| Client | <organization; the part running the project, if different> |
| Sites | <host (pages)> ... |
| Target | <platform and authoring model> |
| Timeline | <four weeks, the norm, or the length the documents give [source]>: <fits / fits if ... / doesn't fit> |
| Sources | <each document, with its date>; site survey of <hosts>, <date> |

# Team

| Organization | Role | Name | Owns or decides |
|:-----------------|:-------------------|:-------------------|:----------------------------------|
| <platform vendor's name> | EA | <name, or to be assigned> | <what they own or decide> |
| <our organization, as the client knows it> | Architect | <name, or to be assigned> | <...> |
| <our organization> | Developers | <names, or to be assigned> | <...> |
| <our organization> | Project manager | <name, or to be assigned> | <...> |
| <client> | <role> [source] | <name> | <what they own or decide> |
| <other party> | <role> [source] | <name> | <what they own or decide> |

# Scope of work

| In scope | Out of scope | To decide (who decides) |
|:----------------------|:----------------------|:------------------------------|
| <item> [source] | <item> [source] | <item> (<role>) |

## Starting point

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

## Target

- **Platform:** <target>, and what follows from it (where content is authored, where code lives,
  how pages are published).
- **Sites and repositories:** <one site or several; one repository or shared code>.
- **What gets rebuilt, kept or linked:** <integrations and features, one line each>.

## Deliverables

<Three to six workstreams, in order. Typical: Mobilize, Foundation, Migration, special features (one
workstream per large feature: a transactional flow, regional logic, search), Quality and launch.>

| # | Workstream | Deliverables | Done when |
|:-|:------------------|:----------------------------------------|:----------------------------|
| 1 | <workstream> | <deliverable>; <deliverable> | <exit criteria in one line> |

# Gaps and questions

<A few bullets: what the documents don't cover and what the survey couldn't see. The scope still
to decide stays in Scope of work; the questions below ask about both.>

## What we need from the client

| Needed | From (role) | Needed for | Status |
|:------------------------------|:------------------|:---------------------|:--------------|
| <data, access, decision> | <role> | <workstream or week> | <owed since / not asked> |

## Questions

<Numbered, grouped by topic. Each says why it matters in a few words. Put the ones that block
the first week first.>

1. **<Topic>:** <question> (<why: what it changes>)

# Project plan

<The verdict, in one or two sentences: the work fits the four weeks, fits if <conditions>, or
doesn't fit, and why [signals]. Name the work that falls outside them.>

| Week | Focus | Ends with | Needs |
|:-----|:----------------------------------|:----------------------------|:----------------------|
| 1 | <Mobilize: kickoff, access, inventory, the look-and-feel bar> | <...> | <access, decisions> |
| 2 | <...> | <...> | <...> |
| 3 | <...> | <...> | <...> |
| 4 | <...> | <...> | <...> |
| Later | <work outside the four weeks, if any: a phase of its own to plan> | | |

## What could move it

| Factor | Signal | Effect | What we do about it |
|:--------------------------|:--------------------------|:--------------|:--------------------------|
| <what the work holds, or what could happen> | <where it shows up> [source] | Pushes it out | <mitigation> |
| <...> | <...> | Could shorten it | <what to confirm> |

## First actions

- [ ] <access request, kickoff question, inventory step, decision to get>

# Meeting cadence

| Meeting | When | Who | Covers |
|:-------------------|:--------------------------|:----------------------|:----------------------|
| Joint project call | <weekday, time, time zone [source]; or to agree at kickoff> | <the platform vendor, our team and the client, by name> | <progress, decisions, what we need> |

<Other standing meetings, one row each. Then one line: we send a progress report before each joint
call.>
```

## Notes on the sections

- **Purpose and summary:** someone reading only this should know what the client is buying and
  why, whether the four weeks hold, and where the uncertainty is.
- **Team:** our team and the platform vendor's EA come from the person (or migration-kickoff), the
  client's and other parties' people from the documents. Name each organization: the platform
  vendor is the company behind the target platform, and our organization goes by the name the
  client knows it by ("Our team" only when nobody has said). A role nobody named is "to be
  assigned". Give each role as its source does, without inferring it from a job title. Several
  people in one role can share a row.
- **Starting point:** quote numbers from the survey with their basis (sitemap count, sampled
  pages). Say what the survey can't see: it reads server HTML without running scripts, so
  browser-built content and logged-in areas are invisible to it.
- **Deliverables:** things the client can see (a template, a feature, a section of pages, a
  checklist); they become PROGRESS.md's rows. Mobilize usually holds access, the content and
  template inventory, the redirect routine and the look-and-feel bar.
- **Gaps and questions:** ask what the documents leave open and what the drivers raise. Don't ask
  what the documents already answer. No day and time for the joint call is a question here.
- **Project plan:** shape the weeks to the project. The usual shape: week 1 mobilize (kickoff,
  access, the template and component inventory, the look-and-feel bar, the legacy site's day-1
  record), week 2 foundation (styles, header and footer, the blocks the first templates need,
  importers), week 3 migration (import by template, parity checks, redirects after each batch, the
  client's review on preview), week 4 quality and launch (accessibility and performance checks,
  fixes from review, publishing, the cut-over steps, handover). Work that doesn't fit, such as a
  rebuilt flow or a search service, goes in the Later row, and the verdict says so.
- **What could move it:** a factor needs a signal. "The client may be slow" is not one; "the ZIP
  list owed since kickoff [brief p.3]" is. The drivers in complexity-drivers.md push the weeks out
  when they apply. What can shorten them: few templates, standard blocks instead of pixel parity,
  content that's ready and frozen, access and decisions in place before week 1. The effect is
  "Pushes it out" or "Could shorten it", never a number of weeks.
- **First actions:** concrete actions in order, each one line, for the first week.
- **Meeting cadence:** the joint call with the platform vendor and the client, and any other
  standing meeting the documents or the person name, with the time zone. If nothing is set, write
  "to agree at kickoff" and ask.
- **Thin requests:** when the documents are short or the survey couldn't run, most of the plan is
  unknown, and the questions carry it. Keep Starting point and Target to a few lines each, leave
  out any row or bullet that would only say "unknown", and ask for each thing once: what the client
  has to hand over (data, access, a decision) in "What we need from the client", everything else
  in Questions.

## Internal notes

Write `<client>-internal-notes.md` beside the plan when the documents hold commercial context or
say how the delivery is positioned, and skip it when they don't. It's for our team only: Markdown
without a PDF, facts only, each cited, and no remarks about people. Like the plan, it stays out of
the repository.

```markdown
# <Client>: internal notes

Not for the client. Goes with the work plan of <Month D, YYYY>.

- **Commercial:** <deal size, renewal timing, the wider opportunity> [source]
- **Positioning:** <how the delivery is presented, and how our team appears to the client> [source]
- **Other:** <anything else the client shouldn't read, such as sales strategy> [source]
```
