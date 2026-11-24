# Block discovery working schema

Use this shape internally when preparing the two user-facing deliverables: the Markdown discovery
report and block inventory CSV. Keep the crawl JSON and page-to-block mapping alongside them as
working evidence outside the repositories; do not emit them as additional reports.

The custom block count includes only rows whose `implementation_status` is `custom`. Occurrences,
variations, Adobe/project reuse, global structures, and standard content are separate. A missing
count is `null` with `occurrence_method` set to `unverified`; it is never zero to mean unknown.

```json
{
  "site": {
    "start_url": "https://www.example.com/",
    "scope": "Approved /section/ path",
    "authorization": "Approved by site owner on YYYY-MM-DD",
    "generated_at": "YYYY-MM-DD",
    "crawl_complete": false,
    "limit_reached": false,
    "pages_discovered": 0,
    "pages_sampled": 0,
    "documents_discovered": 0,
    "coverage_percent": 0,
    "sampling_method": "Sitemap counts, grouped by template; two representative pages per group",
    "request_settings": {
      "authorized_by": "Site owner, YYYY-MM-DD",
      "contact": "crawler@example.com",
      "user_agent": "eds-migration-skills-block-discovery/1.0",
      "delay_seconds": 1,
      "effective_delay_seconds": 1,
      "workers": 4
    },
    "exclusions": [],
    "failures": [],
    "notes": []
  },
  "summary": {
    "unique_custom_blocks": 0,
    "unique_custom_blocks_range": {
      "minimum": 0,
      "maximum": 0,
      "assumptions": []
    },
    "occurrences": {
      "verified_placements": 0,
      "estimated_page_appearances": 0,
      "unverified_blocks": 1
    },
    "custom_block_variations": 0,
    "adobe_blocks_reused": [],
    "project_blocks_reused": [],
    "global_structures": [],
    "standard_eds_structures": []
  },
  "blocks": [
    {
      "id": "hero",
      "name": "hero",
      "category": "content",
      "implementation_status": "adobe-reuse",
      "existing_block": "Block Collection hero",
      "purpose": "Primary page introduction",
      "authoring_model": [],
      "variations": [],
      "occurrence_count": null,
      "occurrence_method": "unverified",
      "complexity": "medium",
      "javascript_or_integrations": [],
      "confidence": "medium",
      "evidence_pages": [],
      "notes": []
    }
  ],
  "page_to_block_evidence": [
    {
      "canonical_page": "https://www.example.com/",
      "served_page": "https://www.example.com/",
      "archetype": "home",
      "inspected": true,
      "block_ids": ["hero"],
      "evidence": "Observed .cmp-hero in the main content"
    }
  ],
  "consolidation_decisions": [
    {
      "candidates": [],
      "decision": "merge",
      "rationale": "Same purpose, content model, structure, and behavior.",
      "confidence": "high"
    }
  ],
  "risks_and_questions": []
}
```

For partial audits, report the sample and exclusions, and keep coverage below 100%. Cite source
page URLs rather than internal repository paths. Do not invent counts, evidence, or capabilities.
Use final served URLs for citations. Record an exact custom-block total only when all relevant
candidates are resolved; otherwise provide a minimum/maximum range with explicit assumptions.
Count cross-page workflows once, independent of how many step pages appear in the evidence map.
