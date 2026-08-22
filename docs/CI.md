# Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to
`main`. Jobs, all with `permissions: contents: read`:

| Job | What it gates |
|---|---|
| `python-tests` | The full pytest suite: golden 2025 cases, lifecycle/isolation/guardrail tests, capability-registry integrity, and the **cross-engine contract** (Node is installed so `contract/run_js.mjs` can run the JavaScript engine against the same canonical cases). |
| `js-golden-tests` | The 41 JavaScript golden regression tests (`tests/golden.test.mjs`). |
| `standalone-build` | `npm run build:standalone` equivalent; fails if `dist/tax-advisory-pro.html` is missing or empty. |
| `ui-acceptance` | The 62 Playwright UI acceptance tests against a served copy of the app. |
| `excel-audit-smoke` | Runs the end-to-end example: builds a base case + 3 scenarios × 5 years, generates the permanent Excel audit package (generation re-reads and verifies the workbook — REC-XLSX), and fails unless every calculation reports `recon=passed`. Also generates the S-corp reconciliation workbook. |
| `artifact-hygiene` | `scripts/check_no_generated_artifacts.py` — fails if generated artifacts (`examples/output/`, `dist/`, any `.xlsx`) or client exports (`export_*.json`, `audit.jsonl`) are tracked in git. |
| `dependency-review` | `actions/dependency-review-action` on pull requests (requires the dependency graph, enabled by default on public repositories). |
| `secret-scan` | Gitleaks over the full history (`fetch-depth: 0`). |

Action versions are the official major tags (`actions/checkout@v4`,
`actions/setup-python@v5`, `actions/setup-node@v4`,
`actions/dependency-review-action@v4`, `gitleaks/gitleaks-action@v2`).
Organizations that require SHA-pinning can resolve each tag to a commit SHA;
nothing in the workflow depends on floating behavior.

## Running the same gates locally

```bash
pip install -e .[dev]
python -m pytest                              # includes the cross-engine contract
node tests/golden.test.mjs
node tools/build-standalone.mjs
python examples/build_example_case.py         # Excel smoke + reconciliation
python scripts/check_no_generated_artifacts.py
# UI acceptance (needs playwright + a static server):
python3 -m http.server 8321 &  node tests/ui-acceptance.mjs
```

## Branch-protection recommendation (repository setting — apply manually)

This is a recommendation only; no remote repository settings are changed by
this branch. On `main`:

1. Require a pull request before merging (no direct pushes).
2. Required status checks (strict, require branches up to date):
   - `Python tests + cross-engine contract`
   - `JavaScript golden regression tests`
   - `UI acceptance (Playwright)`
   - `Excel audit package generation + reconciliation`
   - `No generated artifacts or client exports in git`
   - `Secret scanning (gitleaks)`
   - `Dependency review` (PRs)
   - `Standalone application build`
3. Do not allow force pushes or deletions.
4. Deployment (Vercel deploys the repo root on `main`) therefore only ever
   sees commits where the calculation, reconciliation, and security checks
   passed — deploys are gated by merge, not by a separate deploy pipeline.

## Failure policy

A red calculation, reconciliation, or security job is a release blocker.
Never widen contract tolerances or edit released rulesets to make CI green —
parameter corrections follow the ruleset-release procedure in
`docs/RUNBOOK.md` (new `-vN` version with citations, golden tests updated,
old results stay pinned to the old version).
