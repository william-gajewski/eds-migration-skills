<!-- migration-kickoff: project section. Lasting facts and rules only; dated status goes in PROJECT-LOG.md. -->

## Project

- **Client:** {{CLIENT}}. A migration of {{LEGACY}} to AEM Edge Delivery Services, authored in Document Authoring.
- **Org / site:** `{{ORG}}` / `{{SITE}}` (also in `.migration/project.json`).
- **Content:** `https://content.da.live/{{ORG}}/{{SITE}}/`, edited at `https://da.live/edit#/{{ORG}}/{{SITE}}/<path>`.
- **Preview / live:** `https://main--{{SITE}}--{{ORG}}.aem.page/`, `https://main--{{SITE}}--{{ORG}}.aem.live/`. Production domain: {{PROD}}.
- **Legacy site:** {{LEGACY}}. Its CSS breakpoints: {{BREAKPOINTS}}.
- **Day 1:** {{DAY1}}. Working branch: `{{BRANCH}}`; pull requests go to `main`.
- **Who owns the pages' state:** {{OWNER}}. They decide what is published, and what is restored when DA and live disagree.
- **Other teams writing the same content:** {{TEAMS}}.

## Where things are

- `PROJECT-LOG.md`: dated status, decisions and incidents, newest first. Read it when you need the history; add an entry when something is decided, published or found broken.
- `MIGRATION-CHECKLIST.md` and `BACKLOG.md`, once they exist: every legacy page with its status, and the open work.
- `.migration/project.json`: org and site, which the migration skills read. `.migration/redirects.config.json`: the redirects tool's settings, with every forced row and why.
- `test/checks/`: smoke, accessibility and Lighthouse checks, `npm run check:smoke`, `check:axe` and `check:lighthouse`, each with `-- --host local|preview|live`. Their paths are in `test/checks/paths.txt`.
- Local only (gitignored): `import-work/`, `drafts/`, `content/`, `parity/` (the legacy site's day-1 baseline is in `parity/baseline/`) and `test/checks/results/`. The work plan and the client's documents are kept outside the repository.

## Content and publishing

- Content lives in Document Authoring, not in git; `content/` and `drafts/` are local copies for `aem up`. Upload through the DA Source API, then preview. Publishing is a separate step.
- Before previewing or publishing a shared document (homepage, nav, footer, metadata, redirects, placeholders), compare DA, preview and live, and check who saved in DA since the last publish: their unpublished saves go out with yours. The `safe-publish` skill does this, with a backup first.
- Check the preview in a browser before publishing. After publishing, check live, not preview.
- On the pages the owner above looks after, when someone's unannounced DA edits differ from live: back up, restore the live version, verify, and report who changed what. Flag teammates' work instead of overwriting it.
- Every `<img src>` must load when a page is previewed, or it becomes `about:error`; a metadata `Image` that 404s does this. SVGs over 40 KB are rejected.

## Redirects

- `/redirects` sends links to pages not migrated yet to the legacy site. Rebuild it with the `legacy-redirects` skill after every import or publishing batch; don't hand-edit it.
- A redirect row wins over a page at the same path, on preview and live.
- A rebuilt sheet drops the row of every path that has a DA document, published or not. Before publishing it, check that each dropped row's page is live or is published with it.
- Publish the pages, then the sheet straight after. Re-index pages that were published while a row covered them.

## Code

- Line endings are LF (`.gitattributes`, `.editorconfig`, VS Code's `files.eol`). On Windows, run `git config --global core.autocrlf input` before cloning.
- Run `npm run lint` before every pull request; CI runs it on every push.
- Link to this site's pages with relative paths. Imports keep the legacy site's absolute links, so make the links to migrated pages relative.
- Shared registries (template lists in `scripts.js`, lint configs, `package.json` scripts): diff a change against `origin/main` before handing it over, and after the merge check that every entry from `main` survived.
- Match migrated pages to the legacy site with the `source-parity` skill, at the breakpoints above: copy the legacy CSS values, don't eyeball them.
- Skills: the `adobe-eds-skills` plugin for the migration, and Adobe's `aem-edge-delivery-services` for imports and blocks. If `/plugin marketplace add adobe/skills` fails (it clones over SSH), add `https://github.com/adobe/skills.git` instead.

## Keeping this file short

This file loads in every agent session, for everyone on the project, so keep it under about 150 lines and to lasting facts and rules. Status, dated decisions, incidents and "published on" notes go in `PROJECT-LOG.md`. When a rule here changes, change it here and log the date and the reason there.
