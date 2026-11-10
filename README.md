# eds-migration-skills

Claude Code plugins by William Gajewski, published as a plugin marketplace named `wgajewski-skills`.

| Plugin | For |
|:--|:--|
| `adobe-eds-skills` | Migrating a site to AEM Edge Delivery Services with Document Authoring (da.live) |

## adobe-eds-skills

| Skill | Use it to |
|:--|:--|
| `migration-kickoff` | start a project: check the machine, plan with `project-intake`, add the starter kit to the repository (a short AGENTS.md, a dated project log, LF line endings, smoke, accessibility and Lighthouse checks) and record the legacy site's breakpoints, screenshots and scores on day 1 |
| `project-intake` | turn a client's documents and a quick survey of their site into a work plan the team can share (purpose, team, scope, gaps and questions, a plan against the usual four weeks, meeting cadence; Markdown and PDF), separate internal notes for the commercial context, and a progress tracker (`PROGRESS.md`) for the repository |
| `source-parity` | measure how closely a migrated page matches the original at each screen width, and find what to change |
| `safe-publish` | preview, publish or restore after checking DA, preview and live, and who saved what, with a backup first |
| `legacy-redirects` | build, check and upload the redirects sheet without hiding pages that have been migrated |
| `progress-report` | write the client's progress report for the week (or any span) before the call: what our team merged and published, from git and the site's audit log, checked on live, with the milestones from `PROGRESS.md` (Markdown and PDF, plus talking points) |
| `project-outtake` | write one client-facing handover, every claim checked against the repo, the live site, the configuration and Lighthouse |

Claude picks a skill when a request matches its description. To call one directly, type
`/adobe-eds-skills:<skill>`, for example `/adobe-eds-skills:project-intake`.

`node adobe-eds-skills/migration-kickoff/scripts/check-machine.mjs` checks what the skills need. It
only reads, and prints the fix for each problem. After an install from GitHub, run it from the
marketplace's copy in `~/.claude/plugins/marketplaces/wgajewski-skills/`. The skills need:

- Node 20.19 or later: Playwright needs Node 20, and the lint in Adobe's boilerplate (stylelint 17)
  needs 20.19. The boilerplate's CI runs Node 24.
- `source-parity`: Playwright with Chromium (`npm i --no-save playwright`, then `npx playwright install chromium`).
- `project-outtake`: Chrome, for local Lighthouse runs.
- PDFs from `project-intake`, `project-outtake` and `progress-report`: pandoc, typst and the `aem-project-management` plugin, whose whitepaper template they use. Without them you get the Markdown only.
- `safe-publish`, `legacy-redirects`, `progress-report` and some `project-outtake` checks: a Document Authoring sign-in (`npx -y github:adobe-rnd/da-auth-helper token`). `progress-report` reads the site's audit log, which needs the site's `author` role or higher (`basic_author` can't read it).

## Install

The repository is private: ask its owner to add you as a collaborator, and accept the invitation
GitHub emails you.

1. **Give git a credential that works without a prompt.** Claude Code has no GitHub login of its
   own: it clones and updates through your git, and the background updates can't answer a prompt.
   The GitHub CLI is the simplest way:

   ```bash
   winget install GitHub.cli        # macOS: brew install gh
   gh auth login
   gh auth setup-git
   ```

   Git Credential Manager (part of Git for Windows) works too, once it holds a login, and so does
   an SSH key loaded in ssh-agent. A `GITHUB_TOKEN` or `GH_TOKEN` variable on its own doesn't.

2. **Add the marketplace and install the plugin.** Use the full HTTPS address: the
   `owner/repo` shorthand tries SSH first, so it behaves differently from machine to machine.

   ```bash
   claude plugin marketplace add https://github.com/william-gajewski/eds-migration-skills.git
   claude plugin install adobe-eds-skills@wgajewski-skills
   ```

   Inside a session, `/plugin marketplace add <the same URL>` and
   `/plugin install adobe-eds-skills@wgajewski-skills` do the same.

3. **Turn on auto-update.** It's off by default for marketplaces that aren't Anthropic's. In a
   session, run `/plugin`, open **Marketplaces**, choose `wgajewski-skills` and select
   **Enable auto-update**.

   If the menu has no **Enable auto-update**, Claude Code's own updates are switched off on your
   machine (`DISABLE_AUTOUPDATER`, `DISABLE_UPDATES`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or
   `"autoUpdates": false`), and that stops plugin updates too. Add
   `"FORCE_AUTOUPDATE_PLUGINS": "1"` to the `env` block of `~/.claude/settings.json`, restart Claude
   Code and look again. The machine check names the switch and where it's set.

4. **Check.** `claude plugin list` shows the plugin with a 12-character commit id as its version.
   The machine check (above) also reports whether auto-update is on.

### Updates

- The plugin sets no `version`, so its version is the commit id: every commit pushed to `main` is
  an update.
- With auto-update on, Claude Code checks within about ten minutes of a session's first message.
  When it finds one it says "Plugin updated", and the new version loads after `/reload-plugins` or
  at the next launch.
- To update now, refresh the marketplace, then the plugin (the first alone only refreshes the
  catalog), and start a new session:

  ```bash
  claude plugin marketplace update wgajewski-skills
  claude plugin update adobe-eds-skills@wgajewski-skills
  ```

- A background update that fails says nothing (usually a credential that wanted a prompt). If your
  version stops moving, run the two commands above, which show the error.
- The VS Code extension's plugin dialog has no auto-update switch. Turn it on once from the CLI's
  `/plugin` (the setting is shared), or use the marketplace's refresh icon there.

### Moving from a zip copy

If you installed from a zip of this repository, remove that marketplace first. The new one has the
same name, and removing a marketplace also uninstalls its plugins:

```bash
claude plugin marketplace remove wgajewski-skills
```

Then delete the unzipped folder (`~/claude-plugins/agent-skills`) and follow the steps above.

## Work on the skills

Add the marketplace from your clone instead of from GitHub. Claude Code then loads the plugin from
the clone itself, and an edit takes effect at the next session or after `/reload-plugins`. Both
marketplaces are called `wgajewski-skills`, so remove the GitHub one first:

```bash
git clone https://github.com/william-gajewski/eds-migration-skills.git
claude plugin marketplace remove wgajewski-skills
claude plugin marketplace add <path to your clone>
claude plugin install adobe-eds-skills@wgajewski-skills
```

- Every collaborator can push to `main`, and every commit there reaches everyone with auto-update
  within a session or two. Work on a branch and merge only what's ready.
- Every folder in `adobe-eds-skills/` with a `SKILL.md` is a skill (the manifest scans the plugin
  folder itself, `"skills": ["./"]`).
- After changing a manifest, run `claude plugin validate .` and `claude plugin validate ./adobe-eds-skills`.
  The only expected warning is the missing `version`.
- `project-intake`, `project-outtake` and `progress-report` have test cases in their `evals/`
  folders, in the format `claude plugin eval` reads: a fictional client's email, a handover of a
  public site, and a fictional project's week (a script builds its git history in a throwaway
  repository; its audit log is an export, and aem.live's own site stands in for its pages). The
  other skills' test cases ran against a client's live site, so they're kept outside the
  repository. Keep eval workspaces (outputs, grading) outside it too; `*-workspace/` folders are
  ignored.

## Keep client material out

This repository holds skills, not client work. Don't name clients, partners or people in the
skills, and don't commit client documents, plans, handovers, tokens or configuration dumps. Test
cases built on a client's site or documents are kept outside the repository; a folder named
`private/` is ignored if you need one next to a skill.
