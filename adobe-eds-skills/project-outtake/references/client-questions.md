# Client questions

What clients ask after an Edge Delivery Services demo or handover, taken from a real one (a client's
"open questions" after their demo), with what to verify before answering and how to answer. Each
answer has two parts: what the platform can do, citing the platform documentation, and what their site
has today, citing the facts (`facts.md`) or a check you ran. Never let the first stand in for the
second.

The platform documentation calls the authoring tool "Document Authoring" (da.live). Some newer pages and
decks call the same tool "Experience Workspace". Use "Document Authoring (da.live)", and mention the
other name once if the client used it.

## Contents

1. Performance
2. Authoring experience
3. Assets and reusable content
4. Migration path: which AEM
5. Technical fit: back-end logic and headless
6. Repositories and deployment
7. Branches, releases and environments
8. Analytics, consent and personalization
9. Search engines and going live
10. Security and access

## 1. Performance

**They ask:** will the scores we saw hold in production, or did the test setup inflate them?

**Verify:** the lab scores in the facts (pages, devices, median of runs, tool and version), the
audits that held them down, field data (PageSpeed Insights reports it only with enough real
traffic), Operational Telemetry in `aem.js`, and which third-party scripts the site doesn't load
yet (compare the facts' tag check with the old site).

**Answer pattern:**

- Lab scores measure a page in a standard simulated setup, and field data measures real visitors.
  Give the measured lab numbers with how they were taken: tool, date, device, number of runs.
- What changes in production: the production CDN and domain, and any tags, consent and analytics
  added later. Third-party scripts are the usual cause of lost scores; the platform loads them
  late, three seconds after the page, to protect them.
- How they'll know: Operational Telemetry collects sampled real-user Core Web Vitals without
  cookies (https://www.aem.live/docs/operational-telemetry). PageSpeed Insights' field data
  appears once the production domain has traffic.
- The platform's own guidance on keeping scores high: https://www.aem.live/developer/keeping-it-100

**Pitfalls:**

- Don't promise 100.
- Don't say a performance budget runs in CI unless the facts show it.
- A low SEO score on an `aem.live` host is the `noindex` that host sends; say so rather than
  reporting it as a problem.
- Report the median and say scores vary between runs.

## 2. Authoring experience

**They ask:** how do authors add components, pick variants, and control alignment, color, spacing
and tabs?

**Verify:** the content source (Document Authoring or Universal Editor), whether the block library
is set up for authors, the blocks and their variants, the section styles in the CSS, and whether a
tabs block exists and is styled.

**Answer pattern (Document Authoring):**

- A page is a document; sections are split by horizontal rules.
- A block is a table whose first row names it. A variant goes in brackets after the name, for
  example `Cards (dark)`.
- Color, spacing and alignment come from styles the developers define, chosen with a Section
  Metadata table (`Style: dark, center`). Authors pick from a set; they don't set arbitrary values.
  That keeps pages consistent, and new styles are a small code change.
- Tabs, accordions and carousels are blocks.
- Blocks don't nest. Shared pieces are fragments.
- The Library panel lists the project's blocks with examples.
- Docs: https://www.aem.live/docs/authoring

**Universal Editor instead:** visual, in-context editing with component properties, which needs
AEM as a Cloud Service authoring. https://www.aem.live/developer/ue-tutorial

**Pitfalls:** list only blocks and styles that exist and work on their site. Name the ones that
exist but aren't styled or used.

## 3. Assets and reusable content

**They ask:** how will authors get to DAM images and PDFs, what's the cloud DAM, and what replaces
Experience Fragments and Content Fragments?

**Verify:** whether AEM Assets is connected to Document Authoring (the DA site config key
`aem.repositoryId`), where images and PDFs live today (uploaded into the content, or linked to the
old DAM), and the fragments and sheets in use.

**Answer pattern:**

- Images put into documents are stored with the content and served optimized.
- AEM Assets as a Cloud Service can be connected so authors pick assets while editing. That needs
  AEM as a Cloud Service with a publish tier or Dynamic Media, and configuration in Cloud Manager
  and the site's DA config. https://docs.da.live/administrators/guides/setup-aem-assets
- Experience Fragments map to fragments: a document included by path
  (https://www.aem.live/docs/fragments).
- Structured, reusable data maps to spreadsheets served as JSON
  (https://www.aem.live/developer/spreadsheets). Content Fragments can also stay in AEM as a Cloud
  Service and be read by blocks, if they keep that system.

**Pitfalls:** don't say authors pull from the DAM unless the connection is in place. PDFs linked to
the old DAM break when it's switched off; say so if the facts show such links.

## 4. Migration path: which AEM

**They ask:** is AEM as a Cloud Service without Edge Delivery Services an option, and how would
authoring differ?

**Verify:** nothing on the site. Check the client's current platform in the intake material or the
facts: AEM 6.5 on-premise or AMS, AEM as a Cloud Service, or another CMS.

**Answer pattern:** describe each option separately, in its own terms. Don't mix their vocabulary.

| Option | Authoring | Code and release | Delivery |
|:--------------------|:----------------------------|:----------------------------|:----------------------|
| Edge Delivery Services with Document Authoring (what was built) | Documents in the browser | Blocks in GitHub; push to deploy, no build | Edge Delivery Services |
| Edge Delivery Services with Universal Editor | Visual editor on AEM as a Cloud Service authoring | Blocks in GitHub, plus component models | Edge Delivery Services |
| AEM as a Cloud Service (Sites) | Page editor or Universal Editor | Java and HTL components through Cloud Manager pipelines | AEM publish tier, dispatcher and CDN |
| AEM 6.5 (on-premise or AMS) | Page editor | Java and HTL; their own release process | Their publish servers and dispatcher |

Compare them on what the client asked: authoring, development model, release process, performance.
Leave licensing and cost to the account team.

**Pitfalls:**

- Don't present Edge Delivery Services as AEM as a Cloud Service with a different editor. The
  development and delivery models differ.
- Don't put down the client's current platform.

## 5. Technical fit: back-end logic and headless

**They ask:** where does our Java back-end logic go, and what about headless GraphQL?

**Verify:** the old site's server-side endpoints (servlet paths such as `/bin/...` in forms and
feeds), what the new site calls and whether that works (CORS, sessions), and any headless consumers.

**Answer pattern:**

- Edge Delivery Services runs no server-side Java. Logic either stays behind an existing API that
  blocks call (the API must accept the new host), or moves to serverless functions; App Builder
  is the platform vendor's option, a separate product. The CDN can also run logic at the edge.
- Headless: Edge Delivery Services pages are available as plain HTML, spreadsheets as JSON, and
  the query index as JSON. GraphQL over Content Fragments stays with AEM as a Cloud Service if
  they keep it.

**Pitfalls:**

- App Builder and API Mesh are separate products and not part of what was set up. Say "available,
  not set up".
- Report the endpoints that don't work from the new site (for example, a form posting to a servlet
  with no CORS).

## 6. Repositories and deployment

**They ask:** can each site have its own repository, and does this remove the build and Cloud
Manager constraints we had?

**Verify:** the facts' code source, CI workflows and steps, and branches. Also whether the site is
standard or repoless; the Config Service shows it.

**Answer pattern:**

- Each site can have its own repository, or several sites can share one codebase ("repoless",
  https://www.aem.live/docs/repoless).
- Code goes from GitHub to the platform by the AEM Code Sync app on every push: no build step, and
  no Cloud Manager pipeline for this code.
- CI is GitHub Actions the client owns. Say exactly what it runs today (often lint only), and what
  could be added: tests, accessibility, performance checks.

**Pitfalls:** don't claim branch protection or required checks you haven't seen. The facts can't
see GitHub settings, so say "not checked".

## 7. Branches, releases and environments

**They ask:** how do branching, review, release and rollback work, and is there a staging
environment?

**Verify:** the branches (is there a stage branch?), the CI steps, and the preview and live hosts.

**Answer pattern:**

- Every branch is previewable at `https://<branch>--<site>--<org>.aem.page/`, showing that branch's
  code against the shared preview content.
- Merging to main is the release. Rollback is a revert.
- Content is previewed and published separately from code, so a code release doesn't wait for
  content, and the other way round.
- A long-lived stage branch can serve UAT if they want one. It adds merge overhead.

**Pitfalls:** branch previews share content, so a branch can't preview content changes in
isolation. Say so if they expect separate environments with their own content.

## 8. Analytics, consent and personalization

**Verify:** the facts' tag check against the tools the old site loads (from the intake survey, if
there was one).

**Answer:** what is in place now. Then where tags belong (`scripts/delayed.js`, loaded late, under
the content security policy), and the consent order: consent first, then tags. Experimentation
(A/B tests) has documented support (https://www.aem.live/docs/experimentation). Name
personalization options only as options, with the product that would provide them.

**Pitfalls:** if the old site loads analytics or consent tools that the new site doesn't, say it
plainly. It changes the performance comparison too.

## 9. Search engines and going live

**Verify:** robots.txt and `x-robots-tag` on the live host, the sitemap, redirects, and the
production CDN and domain (the facts).

**Answer:**

- The `aem.live` host is kept out of search engines on purpose.
- Going live needs a production domain on a CDN (https://www.aem.live/docs/cdn-guide,
  https://www.aem.live/docs/byo-cdn-setup), redirects for the old URLs, and a sitemap on the
  production host.
- The go-live checklist: https://www.aem.live/docs/go-live-checklist

## 10. Security and access

**Verify:** the content security policy (facts), whether preview or live needs a sign-in, access
roles (counts), and where credentials live (they shouldn't be in the repository).

**Answer:** who can edit, preview and publish, and how to add people (site configuration roles,
https://www.aem.live/docs/authentication-setup-site). Also what the content security policy
allows, and the platform's security overview: https://www.aem.live/docs/security
