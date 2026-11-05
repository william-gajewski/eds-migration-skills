# Progress report template

The report is for the client: the people on the weekly call and whoever they forward it to. It
says what we finished in the period, what's live, where the milestones stand, and what we need from
them. One to three pages after the cover; a quiet week is one. People read it on a phone before
the call, so the summary has to stand on its own.

## Writing rules

- **Client-facing.** "We" is our team and "you" the client. No people's names or email addresses,
  no other teams' names, no internal remarks, blame or commercial figures.
- **Our work only.** What the client's team or another agency did isn't ours to report. Leave it
  out, or give the state it left without crediting anyone ("7 of the 40 /docs pages are live"). It
  can go in the talking points.
- **Every claim has its evidence**, from activity.md or a check you ran:

  | Say | Only when |
  |:----------------------|:----------------------------------------------------------|
  | **Live** | the check found the page live, on the date you give |
  | **Released** | the change is merged to main, which is what the site runs |
  | **On preview** | previewed and not published; add "for your review" only when the tracker or the log says it waits for them |
  | **In progress** | a branch, a preview or a log entry shows work started |
  | **Done** | PROGRESS.md says so, and its evidence holds |

  Don't upgrade a status because the plan, the previous report or someone's memory says so.
- **Plain words.** Say what changed for the client, not which files: "the menu works on phones",
  not "blocks/header CSS". A pull request number can follow in parentheses, for their developers.
- **Numbers with their basis.** "Eight pages went live for the first time, all checked on Nov 2."
  Counts of pages come from the audit log and the checks, not from the tracker's last figure.
- **Dates** as "Nov 3". The period is in the subtitle; don't repeat it in every section.
- **Bad news plainly.** A slipped milestone, a blocker or a regression, with what we're doing about
  it. Leave the judgment of risk to the person (see the talking points).
- **Names:** "Edge Delivery Services", never the acronym, and "Document Authoring".
- **PDF tables:** pipe tables with left-aligned `:---` separators; the number of dashes sets each
  column's width. Give every table a real header row: the PDF template bolds the first row.

## Skeleton

```markdown
---
title: "<Client>: progress report"
subtitle: "<Month D> to <Month D, YYYY>"
date: "<Month D, YYYY>"
period-start: "<from activity.md>"
period-end: "<from activity.md>"
---

# Summary

<Two to four sentences: the most important progress, where the nearest milestone stands, and the
one thing we need from you most.>

| This period | |
|:------------------------|:----------------------------------------------------|
| Pages | <n> live for the first time, <n> updated (checked on <date>) |
| Changes released | <n>: <three or four words each> |
| Milestones | <nearest milestone: target, and what's left> |
| Waiting on you | <n> items |

# Milestones

| Milestone | Target | Status | Where it stands |
|:----------------------|:----------|:------------|:-------------------------------------|
| <from PROGRESS.md> | <date or -> | <status> | <what's done, what's left, what's blocked> |

| Workstream | Done | In progress | Not started |
|:--------------------------|-------:|-------:|-------:|
| <n. name> | <n> | <n> | <n> |

Moved this period:

- **<deliverable>** (<workstream>): <was> to <now>. <evidence in a few words>.

# Work completed

## <Workstream, in the tracker's order>

- <an outcome the client would recognize, with its evidence: "the header menu works on phones (#14)">

# Pages

| Section | Live now | In scope | New this period |
|:--------------------|--------:|--------:|:---------------------------------|
| </section> | <n> | <n> | <n, or the pages when there are few> |

<Pages on preview for your review, if any.>

# Decisions

- <Mon D>: <the decision> (<who decided, as a role>).

# Issues found and fixed

| Issue | Impact | Status |
|:----------------------------|:----------------------------|:--------------------|
| <what> | <what it affected> | <fixed (#n), or what we're doing> |

# Waiting on you

| Needed | For | Asked |
|:----------------------------|:--------------------------|:----------|
| <open item from PROGRESS.md> | <what it holds up> | <Mon D> |

# Next

1. <What we plan next: what the last report's "Next" didn't finish, work in progress, the nearest
   milestone's open deliverables.>
```

## Notes on the sections

- **Summary:** someone who reads only this should know whether the project is moving and what
  they owe. Lead with outcomes ("the developer hub is nearly complete"), not activity counts.
- **Milestones:** from PROGRESS.md. Dated milestones first, then each workstream's deliverables by
  status, then what moved this period with its evidence. Without a tracker, drop the section and
  say in the reply that one would add it.
- **Work completed:** grouped by the tracker's workstreams, in its order, so the client can follow
  one thread from week to week. Each bullet is an outcome. Merge small changes into one bullet; a
  week of fixes on one template is one line.
- **Pages:** live counts by section come from the audit log, minus pages the checks didn't find
  live; the scope comes from the tracker or the migration checklist. Name the pages when there are
  a few, count them when there are many. Pages the client's team published count in "Live now" but
  not in what we did. Drafts and the block library stay out.
- **Decisions:** only those the client took part in or needs to know, from the log's "Decided"
  lines. Internal ones stay in the log.
- **Issues:** what the client would notice or asked about, found and fixed in the period, or still
  open with what we're doing. Internal tooling problems stay out.
- **Waiting on you:** the open items from PROGRESS.md's "Waiting on the client", oldest first. Not
  items marked Received or Not needed. If there's nothing, say "Nothing this week".
- **Next:** compare with the previous report's "Next". Carry over what isn't done, and say so in a
  word ("still in progress"). No dates unless PROGRESS.md holds them as targets.
- **Empty sections:** leave them out, except "Waiting on you".

## Talking points (in the reply, not the document)

- **Open with:** the two or three things to say first.
- **Ask:** decisions and items we need, with how long each has waited.
- **Raise:** what the checks found (a page behind a redirects row, a page unpublished by someone
  else, a preview never published), other teams' changes that touch our work, shared fragments
  previewed but not published, and any milestone whose remaining work doesn't fit before its target,
  for the person to decide whether to call it at risk.
- **Left out:** what you kept out of the document, and why.
- **Not checked:** what couldn't be verified, and what checking it needs.
