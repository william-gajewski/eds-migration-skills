---
name: team-availability
description: Check whether the team in a project-intake plan is actually available, using an approved roster and out-of-office (OOO) data, for an AEM Edge Delivery Services project. It maps absences to the plan's weeks, checks allocations and open roles, flags meeting times outside attendees' working hours, and writes an internal note kept outside the repository. Use it after project-intake whenever someone asks who is out during the project, whether a role is covered, whether a roster is current, or whether a meeting time works across time zones, even if they only say "is everyone around in January?". It doesn't write the plan; project-intake does.
---

# AEM Edge Delivery Services team availability check

Run this skill after `project-intake` has written the work plan. If there is no intake plan yet,
say so and suggest running `project-intake` first; do not build one here. Keep it separate: the
intake plan is written for sharing, while roster and out-of-office (OOO) information is internal
and changes often. Check the proposed team and schedule against approved sources; do not make a
second project plan or promise a delivery date.

Re-run this check at least weekly while the project start is upcoming, and whenever the start date,
assignments, allocations or meeting details change. A new availability check does not require
rewriting an unchanged intake plan.

## Find the inputs

1. Read the intake plan's **Team** and **Project plan** sections. Read its meeting cadence when
   checking the listed attendees' availability. Find the approved roster and availability source
   the user identifies, using the structure in [resourcing data template](./references/resourcing-data-template.md).
2. Use a source only if it is accessible in the workspace or through an enabled connector. A share
   URL alone is not access. Never claim to have checked a link, calendar or drive you cannot open;
   ask for an accessible, sanitized export or authorized connector. Never copy private share links,
   credentials or authorization details into repository files.
3. Check when the roster and availability were last verified. Treat information as stale if its
   verification date is more than 30 days before the check. Missing or contradictory verification
   dates mean freshness is unknown. Flag stale or unknown data, do not treat it as confirmation,
   and ask for an updated source.
4. A confirmed project start date is required to map OOO dates to project weeks. If it is missing or
   unconfirmed, ask for it as a blocking question. Do not label absences Week 1, Week 2, or similar.
   You may still list each person's absence dates, and any overlap with dates the plan names (a
   launch or a milestone), without project-week labels.
5. Read only the availability information needed for this check. Use OOO dates only, never reasons.
   Do not copy real names, OOO dates or project details into this skill, its templates, or its eval
   inputs. Do not publish or share the internal note.

## Check staffing and availability

- Compare each role and allocation in the intake plan with the roster. Keep confirmed assignments
  distinct from recommendations. If the plan says a role is to be assigned, suggest a roster
  candidate only when their role and stated capacity fit; mark the person and assignment as
  **proposed**, not confirmed. If the roster is stale, incomplete or does not show a fit, state the
  gap and ask for a decision rather than presenting availability as certain.
- Use only the allocation and effective dates the source provides. Do not invent allocations,
  convert them to person-hours, or treat unlisted capacity as full-time.
- With a confirmed start date, map each OOO date to the intake plan's project weeks. Week 1 starts
  on the confirmed start date; each following project week is the next seven calendar days. Show
  ISO date ranges in the internal note, and interpret workdays and OOO dates in each person's
  stated time zone. If a time zone or date is unclear, flag it rather than guessing.
- Identify OOO overlaps with planned work, reduced capacity during planned work, and uncovered
  roles. For each, state the affected role and project week (when known), the evidence and freshness
  limitation, the schedule or staffing impact, and the decision or mitigation needed. Do not invent
  a backup; propose one only when the roster supports it.
- If meeting details and attendee schedules are available, compare the meeting's stated day, time
  and time zone with each attendee's workdays and working hours in their own time zone. Flag
  conflicts or missing details. Never infer a meeting time or working hours from where someone
  lives.

## Write the internal note

Save one internal Markdown note next to the intake plan, in
`<projects>/<client>/intake/<client>-availability-note.md`. This directory must be outside the
project's Git repository. If its location is unknown or inside the repository, ask for an
approved external destination; do not save the note in the repository as a fallback.

Include:

- the intake plan and roster/availability sources reviewed, their last-verified dates, and any
  freshness or access limitations;
- a role-by-role result with the person and team side where known, confirmed or proposed status,
  stated allocation and effective dates, relevant OOO date ranges and project weeks, conflicts,
  and decisions needed;
- meeting attendee conflicts or missing time-zone/working-hours details, if applicable;
- a short set of anonymized rows that can be used in the shared plan's **What could move it**
  section. Each row may name only the affected role and project week; omit people, exact dates,
  OOO details and reasons.

Do not edit or overwrite the shareable intake plan by default. If asked to update its **What could
move it** section, add only anonymized role-and-week rows; never expose names, exact OOO dates or
reasons there. End the note with the decisions needed to confirm staffing and availability.
