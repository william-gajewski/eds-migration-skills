---
name: project-outtake
description: Write one concise, client-facing handover document for an AEM Edge Delivery Services project, as Markdown and PDF. It covers what was delivered and its verified status, answers to the client's own questions, short sections for authors, site administrators and developers, known issues and next steps. Every claim is checked against the project's repository, live site, configuration and measured Lighthouse scores. The document says what's in place, what the platform supports but this site doesn't have yet, and what couldn't be checked, never repeating a sales deck's claims as facts. Use it at the end of an engagement or phase, after a demo, when a client sends follow-up or open questions, or whenever someone asks for handover documentation, a client wrap-up or a short version of the aem-project-management handover guides.
---

# Project outtake

At the end of an engagement the client needs one document they can act on: what they have, what
it means for each of their teams, what's still open, and straight answers to what they asked.
The aem-project-management plugin's handover-author, handover-admin and handover-developer skills
produce three long guides for people taking over the work. This skill produces the short, client-facing version.

It checks every statement against the project itself. After the reference project's demo, the
client received answers saying a Lighthouse budget ran in CI and authors pulled images from the
DAM. On that site, CI only ran lint, and no DAM was connected. A handover that repeats such claims
fails the first time someone checks.

## What you need

- The project's repository (run from its root): an Edge Delivery Services project with
  `scripts/aem.js`. For other platforms the document structure still applies, but the facts script
  doesn't.
- The client's questions, if they sent any (a document, an email, notes). Ask for them.
- What was promised (the work plan, SOW or intake plan), to compare against what was delivered, if
  there is one.
- For the configuration facts (content source, production CDN, roles, DAM connection), a DA
  sign-in: `npx github:adobe-rnd/da-auth-helper token > /dev/null`. Never print the token. Without
  it those checks come back as "Not checked".
- Node 18 or later, and Chrome for the Lighthouse runs (or a `PSI_API_KEY`). pandoc and typst for
  the PDF.

Scripts are in this skill's `scripts/` folder; call them by absolute path. Save the handover where
the person says, or in `project-guides/` in the repository. Before it's committed there, check that
`.hlxignore` lists `project-guides/*`: the site serves every committed file `.hlxignore` doesn't
list, the PDF and facts.json included. The starter kit adds the line.

## Workflow

### 1. Gather the facts

```bash
node <skill>/scripts/facts.mjs --out project-guides/handover-facts
```

It writes `facts.md` and `facts.json`, with a status for each check: In place, Not set up, Unknown
or info. It reads:

- **The repository:** project blocks and untouched boilerplate, templates, the content security
  policy, third-party scripts, Universal Editor files, form blocks, CI steps, test scripts,
  branches and tooling.
- **The live site:** pages published by section, the sitemap, robots, redirects, the metadata and
  placeholders sheets.
- **The configuration, with a sign-in:** content source, production CDN, access roles (counted,
  never named), and whether AEM Assets is connected to Document Authoring.
- **Lab scores:** the home page and the largest section, on mobile and desktop. It uses PageSpeed
  Insights when `PSI_API_KEY` is set (keyless calls share a quota that's usually spent), else
  Lighthouse with local Chrome. Each is the median of three runs, with the audits that held the
  scores down.

This takes about five minutes, mostly Lighthouse. `--psi 1` or `--runs 1` make it quicker, and
`--pages /,/plans` picks the pages.

The code facts describe the branch that's checked out, and the facts report which branch that is
and how far it is from `origin/main`. The live site runs `main`. If the working copy is a feature
branch behind main, don't switch the person's checkout. Clone the repository at `origin/main`
somewhere else and pass `--repo <that folder> --no-psi`; the live-site and Lighthouse facts don't
depend on the branch. On Windows, clone with `git -c core.longpaths=true`, because deep folders
hit the 260-character path limit.

### 2. Read what the project already knows

Read the project's notes for known issues, decisions and the delivered scope. Those are AGENTS.md,
PROJECT-LOG.md (its dated "Decided" lines are the sources for what is out of scope), README,
BACKLOG, a migration checklist and any existing guides in `project-guides/`. Take statuses
from the facts. When a note and a fact disagree, the fact wins: notes go stale. Say so if it
matters.

### 3. Answer the client's questions

For each question, find its topic in `references/client-questions.md`. Each topic says what to
verify, gives an answer pattern, and lists the pitfalls. It keeps "the platform can" (cite the platform
documentation; the docs-search skill can find pages) apart from "your site has" (cite the facts).
Run any extra check a question needs: open the page, read the block's code, call the endpoint. If
the client sent no questions, answer the four or five they're most likely to ask.

### 4. Write the handover

Follow `references/handover-template.md`: its skeleton, status key and writing rules. In short:

- it's client-facing, with no internal or commercial remarks;
- every statement about the site has a status: **In place**, **Not set up**, **Not in scope** or
  **Not checked**;
- measured numbers say how they were measured;
- it's six to ten pages.

Save it as `<dir>/<client>-handover.md`.

### 5. Render and look at it

```bash
node <skill>/scripts/render-pdf.mjs <dir>/<client>-handover.md --png
```

This writes the PDF beside the Markdown, which is kept, with a cover and a contents page; add
`--no-contents` to drop the contents page. With `--png` it writes page images to `<name>-pages/`.
Read them, fix any cramped tables or overlong sections, and render again. `--paper a4` switches
from US letter.

### 6. Report

Tell the person where the document is and its page count. Give the statuses that will surprise the
client (claims they heard that aren't true of their site yet, issues found while checking), and
what couldn't be checked and what checking it needs.

## Judgment calls

- **The client's wording.** Keep their questions in their words and order, so they can match
  answers to questions.
- **Unverifiable is a status, not a gap to fill.** If you couldn't sign in, say "Not checked" and
  name what checking needs.
- **Bad news goes in plainly.** A known issue with its impact and a fix is worth more to the client
  than a clean-looking document.
- **Length.** Cut detail before cutting statuses. Point to the long guides (the
  aem-project-management handover-author, handover-admin and handover-developer skills) for depth.
