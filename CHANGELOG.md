# Changelog

All notable changes to OPL Studio UI are documented here.

## [Unreleased]

### Added
- **LLM key gate on Build / Import / Migration / Refactor** — Landing loads `/api/llm/status`, warns when unconfigured, disables submit, and links to Settings → API Configuration
- `getLlmStatus` + `formatJobCreateError` for `llm_not_configured` API responses
- Cypress component coverage (`LandingLlmGate.cy.tsx`)

## [2.5.0] - 2026-07-16

### Configurable workflows
- Settings → Workflow for plan review, solutioning, and auto-approve (syncs via `/api/workflow/config`)
- Landing always sends capability profile; Approvals labeling covers plan + solution auto-approve

### Fixed
- Files **Push to Git** toolbar visibility and private-repo success copy
- PatternFly FormGroup helperText typing

### Added
- Settings → GitHub token for solutioning research
- Plan review `solution_spec.md` tab when solutioning ran

## [2.4.0] - 2026-07-13

### Added
- Capability profile dropdown on job create (Auto / Fast / Full)
- Validation report panel via authenticated API client
