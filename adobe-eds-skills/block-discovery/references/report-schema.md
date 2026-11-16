# Block discovery working schema

Use this shape internally when preparing the two user-facing deliverables: the Markdown discovery
report and the block inventory CSV. Do not create a separate JSON deliverable unless requested.
Keep counts distinct: a block's `occurrence_count` and `variations` never increase
`summary.unique_custom_blocks`. Page records and page-to-block mappings are working evidence and
are intentionally omitted from exported deliverables.

```json
{
  "site": {
    "start_url": "https://www.example.com/",
    "scope": "Entire host",
    "generated_at": "YYYY-MM-DD",
    "crawl_limit": 500,
    "coverage_percent": 0,
    "notes": []
  },
  "summary": {
    "pages_discovered": 0,
    "pages_inspected": 0,
    "unique_custom_blocks": 0,
    "block_occurrences": 0,
    "block_variations": 0,
    "global_structures": [],
    "standard_eds_structures": [],
    "existing_blocks_reused": [],
    "effort_developer_days": {
      "low": 0,
      "likely": 0,
      "high": 0
    },
    "estimate_type": "greenfield"
  },
  "blocks": [
    {
      "id": "hero",
      "name": "hero",
      "category": "content",
      "purpose": "Primary page introduction",
      "authoring_model": [],
      "variations": [],
      "occurrence_count": 0,
      "complexity": "medium",
      "effort_developer_days": {
        "low": 2,
        "likely": 3,
        "high": 4
      },
      "javascript_or_integrations": [],
      "confidence": "high",
      "evidence_pages": [],
      "existing_project_block": null,
      "notes": []
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
  "risks_and_questions": [],
  "effort_assumptions": [],
  "implementation_sequence": []
}
```

For partial audits, describe what was not inspected in `site.notes` and report coverage below 100%.
Use `null` or an empty array when information is unknown; do not invent evidence or estimates.
