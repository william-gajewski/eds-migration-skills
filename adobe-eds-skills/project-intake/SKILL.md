---
name: project-intake
description: Turn a new client's request for work into a concise internal work plan, as Markdown and PDF and without estimates. Inputs can be an RFW, RFP, SOW draft, onboarding brief, discovery or kickoff notes. The plan covers scope, the current site (from a light survey of its sitemaps and pages), the target platform, workstreams with activities and deliverables, client dependencies, risks and the questions to ask. It draws on a real Edge Delivery Services migration, so it looks for what actually drives effort there (related sites, browser-built flows, regional content, search, forms, logins, redirects). Use it whenever someone shares a new client's documents and wants a plan, a scope summary, kickoff preparation or "what are we getting into", even if they never say "work plan".
---

# Project intake

A new client's documents say what they want. They rarely say what will make it hard: the related
site nobody mentioned, the flow that only exists in the browser, the data the client still owes.
This skill reads the documents, surveys the current site, checks both against what drove the
effort on a real migration, and writes a short internal plan the delivery lead can estimate and
staff from, along with the questions to take back to the client.

## What you need

- The client's documents: PDFs (read them with the Read tool, by page), Word files (convert with
  `pandoc file.docx -t gfm`), emails or notes pasted into the conversation.
- The current site's address(es), from the documents or the person.
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
- milestones the client named;
- people: role, organization, and what they own or decide;
- what the client owes (data, access, decisions, handoffs);
- constraints (compliance, brand, dates) and the tools in use today (search, forms, analytics).

Client documents often carry internal remarks and commercial figures. Keep commercial context for
the "Internal context" section. Leave remarks about people out entirely.

### 2. Survey the sites

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

### 3. Check the drivers

Go through `references/complexity-drivers.md` with your notes and the survey. Each driver lists
its signals, what it adds to the plan, the questions it raises, and what it cost on the reference
project. Use a driver only where there's a signal. Each one becomes an activity, a dependency, a
risk or a question, whichever fits.

### 4. Write the plan

Follow `references/plan-template.md`: its skeleton, writing rules and section notes. In short:

- it's internal, with **no estimates** (no durations, effort, team sizes or cost);
- every fact cites its source, and anything else is marked as an assumption or a question;
- the target platform is named, and the plan stays in that model's terms;
- it's three to seven pages after the cover, the short end for a small site.

Save it as `<dir>/<client>-work-plan.md`.

### 5. Render and look at it

```bash
node <skill>/scripts/render-pdf.mjs <dir>/<client>-work-plan.md --no-contents --png
```

This writes the PDF beside the Markdown, which is kept. With `--png` it also writes page images to
`<name>-pages/`. Read them: check that tables aren't cramped and the length is right, then fix and
render again. `--paper a4` switches from US letter. If pandoc or typst is missing, the script says
so; hand over the Markdown and say the PDF wasn't made.

### 6. Report

Tell the person where the plan and the survey are and how many pages the plan runs. Give the scope
decisions it raises, the three or four questions that block the start, and anything you couldn't
check (an unreachable site, a document you couldn't read).

## Judgment calls

- **Gaps:** when the documents are thin, the plan is short and the question list is long. Don't
  fill the gaps with typical scope.
- **Which AEM:** "AEM" alone doesn't name a target. Ask which one, and say in the plan which model
  it assumes until the client answers.
- **The documents vs the survey:** say both, and make it a question. For example, the brief says
  20 pages but the sitemap lists 1,400.
- **Platform claims:** check what the platform does in the aem.live documentation (the docs-search
  skill, if installed), not in sales material.
- **Confidential documents:** the plan is internal. Don't publish it or post it anywhere public.
