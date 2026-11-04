# Handover template

One document for the client's whole team: the product owner, the authors and publishing lead, the
site administrators and the developers. Each reads the summary, then their own section. The
aem-project-management handover-author, -admin and -developer guides run to dozens of pages each. This one is the short,
client-facing version: what they have, what it means for them, and what to do next, with links to
the long guides when the project has them.

Aim for six to ten pages after the cover (about 2,500 to 3,500 words). Use tables for anything
with more than three items.

## Writing rules

- **Client-facing.** No internal commentary, commercial figures, blame, or remarks about people.
  Write "we" for the delivery team and "you" for the client.
- **Every statement about their site has a status**, from the facts or a check you ran:

  | Status | Use when |
  |:--------------------|:-------------------------------------------------------|
  | **In place** | seen: in the repository, on the live site, in the configuration, or measured |
  | **Not set up** | the platform supports it, but it isn't configured or built on this site |
  | **Not in scope** | agreed out of scope, with a source (plan, SOW, decision) |
  | **Not checked** | couldn't be verified; say what checking needs (access, a sign-in) |

  Never upgrade a status because a deck or a brief says so.
- **Platform and site stay apart.** "The platform can" needs a platform documentation link. "Your site
  has" needs a fact. Write both when they differ.
- **Measured numbers carry their method:** tool, date, device, runs, host. Explain what a number
  doesn't mean. For example, a low SEO score on an `aem.live` host is that host's `noindex`.
- **Names:** "AEM Edge Delivery Services" (or "Edge Delivery Services"), never the acronym, and
  "Document Authoring (da.live)". Use product names as the current platform documentation does.
- **Known issues are useful, not embarrassing.** State each with its impact and a recommendation.
- **PDF tables:** pipe tables with left-aligned `:---` separators. The number of dashes sets each
  column's width. Give every table a real header row: the PDF template bolds the first row.

## Skeleton

```markdown
---
title: "<Client> on AEM Edge Delivery Services"
subtitle: "Handover"
date: "<Month D, YYYY>"
---

# At a glance

<Three or four sentences: what was built, how much of it is live, what the team can do with it
now, and the most important next step.>

| Item | Where |
|:------------------|:----------------------------------------------------------|
| Live site | <URL> (<N> pages published) |
| Preview | <URL> |
| Authoring | Document Authoring: <da.live URL> |
| Code | <repository>, branch `main` |
| Production domain | <domain, or "Not set up yet: the aem.live host serves the site"> |

Status key: **In place** (seen on the site), **Not set up** (the platform supports it; this site
doesn't have it yet), **Not in scope** (agreed out), **Not checked** (couldn't be verified).

# What was delivered

| Area | Status | Notes |
|:---------------------|:--------------|:-----------------------------------------------|
| Pages | In place | <N> published; largest sections ... |
| Templates and blocks | In place | <n> templates; <n> project blocks |
| Header and footer | ... | ... |
| <each feature in scope: search, forms, regional content, lists> | ... | ... |
| Redirects for pages not migrated | ... | ... |
| Analytics and consent | ... | ... |
| Accessibility | ... | <measured scores; the checks that exist> |
| Performance | ... | <median lab scores, with method> |
| Testing and CI | ... | <what runs, where> |

# Your questions

<One subsection per question the client asked, in their words and their order. If they sent no
questions, cover the topics they're most likely to raise (client-questions.md) in four or five
short subsections, and title the section "Common questions".>

## <The question, shortened>

<The answer, two to five sentences, with a documentation link for platform statements.>

**On your site today:** <status>: <evidence in one line>.

**To go further:** <what it would take, only when the status isn't In place>.

# For authors

- **Where you work:** <links>; access comes from <role or person>.
- **How a page is built:** <four to six bullets: documents, sections, blocks and variants, section
  styles, metadata, fragments>.
- **Publishing:** preview, then publish. Fragments and sheets publish separately. Check the shared
  documents (<home, nav, footer>) before publishing them.

| Task | How |
|:--------------------------|:--------------------------------------------------------|
| <five to eight common tasks> | <one line each> |

**Who changes what:** authors <...>; developers <...>.

# For site administrators

- **Access:** roles and how to add a person; who holds which role (counts, not names).
- **Publishing operations:** bulk preview and publish, unpublish, cache, and the redirects routine.
- **Configuration:** where it lives (site configuration, Document Authoring config), and who can
  change it.
- **Going live:** <checklist: production CDN and domain, robots and sitemap on the production host,
  redirects for the old URLs>, linking https://www.aem.live/docs/go-live-checklist.

# For developers

- **Repository and local work:** clone, `npm install`, `aem up` at http://localhost:3000.
- **Structure:** blocks, templates, scripts, styles; the conventions that matter (CSS scoping,
  where third-party scripts go).
- **Branches and releases:** branch previews, merge to `main` is the release, rollback by revert.
- **CI and tests:** <what runs on push; what exists but doesn't run in CI>.
- **Tooling:** <tools/ folders and when they're used>.
- **Further reading:** <the project's developer guide or AGENTS.md, if present>.

# Known issues and limitations

| Issue | Impact | Recommendation |
|:---------------------------|:---------------------------|:---------------------------|

# Next steps

1. <Ordered by what unblocks the most; say who would do each (your team, the delivery team, the platform vendor)>.

# References

- <Platform documentation links used above>
- <The project's own guides, if any>
```

## Notes on the sections

- **What was delivered:** cover each area the plan or SOW promised (ask for it, or use the intake
  plan), plus the ones every site needs: redirects, analytics, accessibility, performance, CI.
  Something promised but not built is "Not set up", with the reason in the notes.
- **Your questions:** keep the client's wording and order so they can tick answers off. Don't
  answer a question with a capability the site doesn't have without saying it isn't set up.
- **Authors, administrators, developers:** a page or less each. Link the long guides, or offer to
  generate them (the aem-project-management handover-author, handover-admin and handover-developer
  skills).
- **Known issues:** from the facts (CI gaps, layout shift or contrast audits, missing scripts), the
  project's notes (AGENTS.md, PROJECT-LOG.md, BACKLOG.md, issue trackers), and what you saw while checking. Each
  needs an impact and a recommendation.
- **Next steps:** at most eight, the first three being what stands between the client and going
  live.
