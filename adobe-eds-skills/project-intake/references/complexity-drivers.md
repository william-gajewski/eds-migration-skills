# Complexity drivers

What drove the effort on a real migration (a corporate site, its shop and a related provider
site, moved to Edge Delivery Services with Document Authoring in 2026), and how to spot each one
before the work starts. Go through the list with the client's documents and the survey
open. A driver earns a place in the plan only when there's a signal for it; then it becomes an
activity, a dependency, a risk or an open question, whichever fits. Don't list the drivers that
don't apply.

## Contents

1. Sites and hosts
2. Pages built in the browser
3. Regional or personalized content
4. Search
5. Forms
6. Logged-in and gated areas
7. Header and footer variants
8. Look and feel: copy, standardize or redesign
9. Content volume, templates and generated lists
10. Phased migration and redirects
11. Documents and the DAM
12. Several teams in one content tree
13. Tags, analytics, consent and monitoring
14. Accessibility, legal text and compliance
15. Access, environments and cut-over
16. Client-owned data and handoffs
17. Target platform and authoring model

## 1. Sites and hosts

- **Signals:** the survey's "related sites linked" line; several hosts in the documents; a section
  of the site that lives on its own subdomain.
- **In the plan:** a scope decision per host (moves, stays, links out), and where each moving host
  lands (its own site, or a folder of one site). Each host has its own chrome, templates and
  redirects.
- **Ask:** which related sites move, at which URLs, and in which order?
- **On the reference project:** the brief scoped the main site and its shop subdomain. The survey
  showed 21 of 24 sampled pages linking to a provider site the brief didn't mention. That site
  (464 sitemap URLs, its own header, footer and side navs) was migrated later, into a folder of the
  main site, with a mapping for its links and redirects.

## 2. Pages built in the browser

- **Signals:** the survey's "little or repeated text in the HTML" row, an Angular, React or Vue
  front end, or a transactional flow (shopping, quoting, enrollment, account).
- **In the plan:** these can't be imported from their HTML. Plan requirements and an architecture
  for a native rebuild, the APIs the flow calls, and end-to-end tests. The source's content has to
  be read from the rendered page.
- **Ask:** API documentation and test credentials. Will the APIs accept calls from the new host
  (CORS)? Do they need the old app's session?
- **On the reference project:** the shop, a single-page app, sent the same empty shell for every
  URL. Its ZIP lookup API accepted calls only from the shop's own host and needed the app's
  session, so the rebuild used interim data.

## 3. Regional or personalized content

- **Signals:** a ZIP, county, state or region chooser (survey row); brands, plans, prices or legal
  text that vary by location; "personalization" in the documents.
- **In the plan:** where the mapping data comes from and who owns it, a stand-in while it's
  missing, the variations to build (links, documents, logos, legal text, sections), and a test
  matrix across regions.
- **Ask:** the source of truth for the mapping, how often it changes, and the edge cases: a ZIP in
  several counties, PO box ZIPs, visitors outside the area.
- **On the reference project:** 8 regions changed brand, logos, links, brochures and 7 versions of legal text.
  The client's ZIP list was owed from kickoff, so a stand-in was built from public government
  data, with known gaps.

## 4. Search

- **Signals:** a search vendor (survey row or documents), search used client-side, a large site.
- **In the plan:** a decision to keep the vendor, replace it, or use the platform's index. Note
  what each needs: API access, an indexing feed, relevance tuning, an owner.
- **Ask:** the features that matter (type-ahead, filters, synonyms, analytics) and who owns search
  today.
- **On the reference project:** a hosted search service was replaced with a client-side index of
  about 1.2 KB a page. That works for a few hundred pages, but the full 1,400-page site would need
  a search service.

## 5. Forms

- **Signals:** forms in the survey (and where they post), captchas, documents that mention
  enrollment, contact, claims or fraud reports.
- **In the plan:** a forms inventory, then a decision on where submissions go and who builds that.
  Plan a security and privacy review, early: health, financial and personal data raise the bar.
- **Ask:** where each form's data goes today, whether it holds PII or PHI, and who reviews it.
- **On the reference project:** the forms posted to legacy AEM servlets, behind a captcha and
  without CORS, so the migrated forms couldn't submit. A 55-field fraud report form stayed on the
  old site until a forms solution was chosen.

## 6. Logged-in and gated areas

- **Signals:** login links in the survey, partner or member portals, "post-login" in the documents.
- **In the plan:** a list of gated destinations and how links to them behave. Usually they're out
  of scope, but still linked, and they must keep working.
- **Ask:** which gated areas stay where they are, and for how long?
- **On the reference project:** post-login was out of scope. 35 provider pages sat behind a partner
  login; links to them went to the old site, marked with a lock icon.

## 7. Header and footer variants

- **Signals:** different headers or footers by section, brand or region; mega menus; alert bars.
- **In the plan:** inventory every variant in the first weeks, because each appears on every page
  of its section. Build them as content fragments, and reserve their height so pages don't shift
  when they load.
- **On the reference project:** there were nine header and footer pairs: corporate, shop, provider, and six
  regional member sites.

## 8. Look and feel: copy, standardize or redesign

- **Signals:** "no new design", "standardize components", "keep the current look", or a design
  system in the documents.
- **In the plan:** agree the bar: pixel parity, structural parity, or a standardized set of blocks.
  Agree the widths to check, and who signs off. Pixel parity means measuring the old site's CSS,
  breakpoints and fonts.
- **Ask:** copy, standardize or redesign? Who decides, and by when?
- **On the reference project:** there was no new design, and standardization was wanted but not signed off.
  The homepage was matched at 15 widths, from 360 to 1440 pixels.

## 9. Content volume, templates and generated lists

- **Signals:** sitemap counts by section (survey), how many page types there are, and lists fed by
  feeds or databases (news, policies, press releases, directories).
- **In the plan:** a template inventory and a migration order by template, an importer and QA per
  template, and generated lists rebuilt from sheets or feeds.
- **Ask:** what not to migrate (outdated, duplicate or campaign pages), any content freeze, and who
  approves migrated pages.
- **On the reference project:** 1,441 sitemap pages in 51 sections. There were around 40 templates with an
  importer each. Five provider lists came from the old site's feeds and were snapshotted into
  sheets.

## 10. Phased migration and redirects

- **Signals:** a migration in batches, links between migrated and unmigrated pages, legacy URL
  patterns (`.html` endings, mixed case), existing redirect rules.
- **In the plan:** a redirect routine from the first batch (legacy-redirects skill), with a publish
  order: pages, then the redirects sheet, then a re-index. Also a cut-over plan for the legacy URLs.
- **Ask:** the redirect rules on the current platform or CDN, vanity URLs, and URLs printed on
  paper or in campaigns.
- **On the reference project:** 505 redirect rows. On one occasion a regenerated sheet took five pages offline
  for six hours.

## 11. Documents and the DAM

- **Signals:** PDF links (survey), `/content/dam/` paths, plan documents, brochures and policies
  by region.
- **In the plan:** an asset decision: keep the current DAM and link to it, move assets, or connect
  a DAM to authoring. Note who keeps the documents current after launch.
- **Ask:** will the current DAM stay up after cut-over? Who owns the PDFs?
- **On the reference project:** 59 PDF links on 24 sampled pages, linked to the old DAM. SVGs over 40 KB are
  rejected by the platform and had to be converted.

## 12. Several teams in one content tree

- **Signals:** several delivery partners, an offshore team, client authors trying things during the
  build.
- **In the plan:** who owns which paths, a drafts area for client authors, and a publishing routine
  that checks shared documents before publishing (safe-publish skill).
- **On the reference project:** stale copies of the homepage, nav and footer were written into shared content
  and nearly went live; a sandboxed drafts folder was set up for the client's authors.

## 13. Tags, analytics, consent and monitoring

- **Signals:** tag managers, analytics, consent and monitoring tools (survey rows).
- **In the plan:** re-implement them, loaded late so they don't slow the page, with a content
  security policy, consent before tags, and analytics parity (the data layer).
- **Ask:** who owns the tags, the data layer specification, and the consent categories.
- **On the reference project:** a consent manager and a monitoring script were on all 24 sampled
  pages, and a tag manager on 22.

## 14. Accessibility, legal text and compliance

- **Signals:** a regulated industry (health, finance, government), nondiscrimination or language
  assistance notices, legal text by region.
- **In the plan:** accessibility checks (WCAG 2.1 AA), who governs legal text, and the compliance
  sign-off.
- **Ask:** who reviews accessibility and legal text, and when?

## 15. Access, environments and cut-over

- **Signals:** a new organization or site; the client's GitHub, DNS and CDN; corporate access
  policies.
- **In the plan:** access requests in the first week (code repository, site configuration roles,
  content editor, publishing), the production CDN and domain, and the cut-over steps.
- **Ask:** who administers GitHub, DNS and the CDN, and which CDN the client uses?
- **On the reference project:** site admin wasn't org admin, so some configuration couldn't be read. No
  production CDN was configured during the build.

## 16. Client-owned data and handoffs

- **Signals:** "will send", "to provide", "owed by" in the documents; data or knowledge held by
  the client's IT or another vendor.
- **In the plan:** a dependency register: what, from whom, needed by when, and what happens while
  it's missing.
- **On the reference project:** the ZIP list, the technical handoff of the custom components, and the decision
  on standardization were all owed by the client.

## 17. Target platform and authoring model

- **Signals:** "AEM" without saying which; Universal Editor, Document Authoring or a page editor;
  Java or OSGi back-end code; headless GraphQL; an on-premise AEM in flight.
- **In the plan:** name the target (Edge Delivery Services with Document Authoring, Edge Delivery
  Services with Universal Editor, AEM as a Cloud Service, or AEM 6.5) and keep the plan in that
  model's terms. Back-end logic and headless uses need a home: an API, a serverless function, or
  the system that stays.
- **Ask:** which authoring experience the authors expect, what back-end code the current site runs,
  and what consumes content headlessly.
- **On the reference project:** after the demo, the client asked whether AEM as a Cloud Service without Edge
  Delivery Services was an option, and where their Java and GraphQL code would go. Settle that at
  intake.
