# Changelog

All notable changes to OPL Studio UI are documented here.

## [Unreleased] — 2026-06-30

### Added

- **Settings → Workflow** — configure plan review gate, solutioning loop (max passes, GitHub search limit), and auto-approve plans from the UI; preferences sync to `POST /api/workflow/config` (no `config.yaml` edit required).
- **Settings → GitHub** — connect a personal access token for solutioning research and repo search.
- **Plan review** — `solution_spec.md` tab in plan review when the solutioning loop ran.

### Changed

- **`useWorkflowPrefs`** — loads and saves workflow settings via the backend API; localStorage used as a read-through cache for Landing and PlanReview.
- **App startup** — prefetches workflow config from the API on mount.
