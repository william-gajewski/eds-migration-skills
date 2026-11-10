---
name: project-intake
description: Turn a new client's request for work into a concise work plan (Markdown and PDF) the delivery team can share with the platform vendor and the client. Inputs can be an RFW, RFP, SOW draft, onboarding brief, discovery or kickoff notes. It covers purpose, team, scope of work (with a light survey of the current site), gaps and questions, a project plan against the usual four weeks (what would push it out or shorten it) and the meeting cadence. Commercial context goes in separate internal notes. It also writes PROGRESS.md, the repository's progress tracker that the progress-report skill keeps up to date. It draws on a real Edge Delivery Services migration, so it looks for what actually drives effort there (related sites, browser-built flows, regional content, search, forms, logins, redirects). Use it whenever someone shares a new client's documents and wants a plan, a scope summary, kickoff preparation or "what are we getting into", even if they never say "work plan".
---

# Project intake

A new client's documents say what they want. They rarely say what will make it hard: the related
site nobody mentioned, the flow that only exists in the browser, the data the client still owes.
This skill reads the documents, surveys the current site, checks both against what drove the
effort on a real migration, and writes a short plan the delivery team can share with the platform
vendor and the client: who's on the team, what's in scope, what's missing, whether the usual four
weeks hold, and when everyone meets. Commercial context goes in separate internal notes.

## What you need

- The client's documents: PDFs (read them with the Read tool, by page), Word files (convert with
  `pandoc file.docx -t gfm`), emails or notes pasted into the conversation.
- The current site's address(es), from the documents or the person.
- The team: our architect, developers and project manager, and the platform vendor's EA. Documents
  rarely name them, so they come from the person (migration-kickoff collects them before it runs
  this skill).
- The joint meeting's day, time and time zone, if it's set.
- Node 18 or later for the scripts. For the PDF: pandoc and typst (the renderer finds them on PATH,
  or where winget installs them). The aem-project-management plugin, if installed, provides the
  whitepaper template.

Scripts are in this skill's `scripts/` folder; call them by absolute path. Save everything in the
folder the person names, or `./intake/<client-name>/`.

## Workflow

### 1. Read every document and take notes

For each document, note its name and date. Then pull out, each with its source (`[brief p.3]`):

- the client, and who runs the project on their side;
- the sites and their addresses;
- the goals and the reasons behind them;
- in scope, out of scope, and what's undecided;
- the target platform and authoring model (or that it isn't stated);
- milestones and dates the client named, and any agreed length (an SOW's weeks, a launch date);
- people: name, role, organization, and what they own or decide, the platform vendor's and ours
  included;
- standing meetings: day, time, time zone, who attends;
- what the client owes (data, access, decisions, handoffs);
- constraints (compliance, brand, dates) and the tools in use today (search, forms, analytics).

Client documents often carry internal remarks and commercial figures. Keep commercial context, and
how the delivery is positioned, for the internal notes. Leave remarks about people out entirely.

### 2. Fill in what the documents don't say

The plan needs three things the documents usually leave out: our architect, developers and project
manager and the platform vendor's EA; the joint meeting's day, time and time zone; and the length,
if it isn't the usual four weeks. Take what migration-kickoff collected or the person already said.
If you can ask the person directly, ask once for the rest, with any other question you have. Don't
hold the plan for the answers: what's still unknown is "to be assigned" or "to agree at kickoff",
and goes in your report's questions. Don't guess names or roles from email threads or signatures.

### 3. Survey the sites

```bash
node <skill>/scripts/survey.mjs https://www.client.example https://shop.client.example --out <dir>/survey
```

For each site, the survey reads robots.txt, the sitemaps and about 24 pages spread over the
sections. It takes seconds to a minute per site and writes `survey.md` and `survey.json`. It
reports:

- the page count by section;
- the platform and front-end framework;
- forms and where they post;
- search, login links, and regional or location choosers;
- PDFs, languages, tags, consent, chat and video;
- pages that send little text, or the same shell as other URLs (built in the browser);
- pages with exactly the same content as another URL (duplicates to consolidate);
- related sites the pages link to.

Read the related-sites line closely: a host many pages link to, but the documents don't
mention, is a scope question. It reads server HTML without running scripts, so it can't see
browser-built content or logged-in areas. If a site can't be reached (not public yet, behind a
VPN), say so in the plan and make the survey a first-week action.

### 4. Check the drivers

Go through `references/complexity-drivers.md` with your notes and the survey. Each driver lists
its signals, what it adds to the plan, the questions it raises, and what it cost on the reference
project. Use a driver only where there's a signal. Each one becomes a scope item, something we need
from the client, a question, or a factor that moves the four weeks, whichever fits.

### 5. Write the plan

Follow `references/plan-template.md`: its skeleton, writing rules and section notes. In short:

- six sections: purpose and summary, team, scope of work, gaps and questions, project plan, and
  meeting cadence;
- it can be shared as is: nothing commercial, no positioning, no remarks about people;
- the only duration is the four weeks (or the length the documents or the person give): a verdict
  on whether the work fits, the weeks, and what could push them out or shorten them, each with its
  signal. No effort, cost or pricing, and no week counts added to the factors;
- every fact cites its source, and anything else is marked as an assumption or a question;
- the target platform is named, and the plan stays in that model's terms;
- it's three to seven pages after the cover, the short end for a small site or a thin request.

Save it as `<dir>/<client>-work-plan.md`. If the documents hold commercial context or say how the
delivery is positioned, write that to `<dir>/<client>-internal-notes.md`, as the end of the
template describes, and keep it out of the plan.

### 6. Write the progress tracker

Turn the plan into `<dir>/PROGRESS.md`, following `references/progress-template.md`: the milestones
the client named (with only the dates they gave), each workstream's deliverables from "Scope of
work", and what we need from the client as "Waiting on the client", every status Not started unless
the documents say otherwise. The project plan's weeks aren't targets until the client agrees to
them. The tracker goes into the project's repository (migration-kickoff copies it in with the
starter kit), where the progress-report skill keeps it up to date for each status report. So,
unlike the plan, it names no people, and it holds nothing from the internal notes.

### 7. Render and look at it

```bash
node <skill>/scripts/render-pdf.mjs <dir>/<client>-work-plan.md --no-contents --png
```

This writes the PDF beside the Markdown, which is kept. With `--png` it also writes page images to
`<name>-pages/`. Read them: check that tables aren't cramped and the length is right, then fix and
render again. `--paper a4` switches from US letter. If pandoc or typst is missing, the script says
so; hand over the Markdown and say the PDF wasn't made.

### 8. Report

Tell the person where the plan, the internal notes, the tracker and the survey are and how many
pages the plan runs. Give the verdict on the four weeks and what drives it, the scope decisions it
raises, the three or four questions that block the start, who is still to be assigned, and anything
you couldn't check (an unreachable site, a document you couldn't read). The tracker goes in the
repository's root once there is one; the plan and the notes stay out of it.

## Judgment calls

- **Gaps:** when the documents are thin, the plan is short and the question list is long. Don't
  fill the gaps with typical scope.
- **The four weeks:** they're the norm, not a promise. Say whether this work fits and why, from
  the drivers' signals, and name the work that falls outside them. Say which way each factor moves
  the plan, and leave the new length to the delivery lead. When a date the client named (a launch,
  a campaign) doesn't leave room for the work, say so and ask.
- **Which AEM:** "AEM" alone doesn't name a target. Ask which one, and say in the plan which model
  it assumes until the client answers.
- **The documents vs the survey:** say both, and make it a question. For example, the brief says
  20 pages but the sitemap lists 1,400.
- **Platform claims:** check what the platform does in the aem.live documentation (the docs-search
  skill, if installed), not in sales material.
- **How we're presented:** the Team section shows our team as the client knows it. If the documents
  say we work under the platform vendor's name, list our people that way, and put the positioning
  itself in the internal notes. Then the plan doesn't name our company anywhere else either, not
  even in passing.
- **Sharing:** the plan is written so it can be shared, but whether and with whom is the person's
  call. The client's documents and the internal notes stay internal. Don't publish or post any of
  it.
