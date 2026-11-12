---
tags: [eds-delivery-planner, project-intake]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

For this evaluation, treat the check date as 2026-11-12. Use
`/adobe-eds-skills:eds-delivery-planner` to check the intake plans and fictional staffing inputs
under `projects/atlas/` and `projects/beacon/`. Save one internal availability note beside each
plan in its `intake/` directory. Those intake directories are outside their respective project
repositories. Do not edit either shareable plan.

The Atlas plan has a confirmed start date; the Beacon plan does not. Report the availability and
staffing conflicts supported by the inputs, ask for blocking decisions, and include only
anonymized role-and-week wording that could be used in Atlas's shared plan. Do not use Bash or
modify files outside these two intake directories.

Input files: place-files.sh, files/make-project.sh
