# AI-Tax

Two complementary components live in this repository:

1. **Tax Advisory Pro** — a dependency-free static web app (React 18, no
   build step) for TY2025/TY2026 individual tax planning. Served from the
   repo root; this is what Vercel deploys.
2. **`ai_tax` (Python)** — an audit-grade deterministic tax calculation
   engine with versioned rulesets, immutable base-case/scenario lifecycle,
   reconciliation, permanent Excel audit packages, and a constrained
   **Tax Planning Analyst Agent** as an orchestration/explanation layer.

---

## Tax Advisory Pro — Individual Planning Workbench (TY2025 / TY2026)

A deterministic federal individual income tax planning engine for tax years
2025 and 2026, built as a dependency-free static web app (React 18, no build
step).

### Features

- **Dashboard** — key figures at a glance: total income, AGI, deductions, total tax, effective rate
- **Scenarios** — side-by-side comparison of planning scenarios (e.g. sole proprietor vs. S-Corp election) with lowest-tax highlighting
- **SE & Retirement** — self-employment tax and retirement plan design (solo 401(k), SEP-IRA, defined benefit)
- **MAGI Phase-Outs** — tracking of MAGI-driven phase-out ranges across credits and deductions
- **QBI Workbench** — Sec. 199A qualified business income deduction modeling, including SSTB and wage/UBIA limits
- **SEHI & IRA** — self-employed health insurance deduction and IRA deduction/contribution interplay
- **Planning Guide / Reference** — built-in reference tables for brackets, thresholds, and limits
- **Audit Trail** — log of assumption and input changes
- **Import / Export** — save and load client data; XLSX export
- **Report** — client-ready report with print/PDF and HTML download
- Floating **Calculator** and **Notes** tools

### Running the app

It's a fully static site — serve the repo root with any static file server:

```sh
npm start                      # uses `serve` on http://localhost:3000
# or
python3 -m http.server 8000
```

Then open the printed URL. There is no build step and no runtime network
dependency (React is vendored in `vendor/`).

### Single-file standalone build

To produce one self-contained HTML file that runs offline straight from
`file://` (handy for sharing with a client or advisor):

```sh
npm run build:standalone       # writes dist/tax-advisory-pro.html
```

### Project layout

```
index.html          App shell — loads styles and scripts in order
css/styles.css      Application styles
vendor/             React 18.3.1 UMD builds + polyfills (no CDN needed)
src/                Application code (plain JS, React.createElement — no JSX build)
  00-format.js        Number/currency formatters
  01-constants.js     TY2025/TY2026 brackets, thresholds, limits
  02-engine.js        Core tax computation engine
  03-scenario.js      Scenario model and computation orchestration
  04-seed.js          Seed/demo client data
  11-styles.js        Runtime-injected styles (print/report)
  12-xlsx.js          Minimal XLSX writer
  05-ui-primitives.js Shared UI components
  13-export.js        Report/export generation
  14-tools.js         Calculator and Notes tools
  06-modules.js       SE/retirement, MAGI, QBI, SEHI/IRA modules
  07-analysis.js      Analysis views
  08-pages.js         Page components
  09-reference.js     Reference/guide pages
  10-app.js           App shell component + mount
tools/              Build script for the standalone single-file version
```

The `src/` files were authored as one script and share the global scope —
`index.html` loads them in their original order, which must be preserved.

> **Note:** This tool is a planning aid. It is not tax advice; verify results
> against current IRS guidance before relying on them.

---

## `ai_tax` — deterministic engine + Tax Planning Analyst Agent (Python)

The core design rule: **the engine — never the language model — is the
calculation authority.** The agent collects facts, creates scenarios through
preview/approve/apply, invokes the engine via typed tools, reconciles
results, generates permanent Excel audit packages, and escalates anything
uncertain, unsupported, or unreconciled to human review. It cannot invent tax
parameters, mutate the base case, or present a failed result as final — those
guarantees are enforced in code, not just in the prompt.

### Layout

```
ai_tax/
  money.py        Decimal-safe arithmetic, explicit tax rounding
  schemas.py      canonical typed models (provenance on every input)
  rulesets/       immutable per-year parameter files + registry
  engine.py       deterministic calculation: line items, trace, reconciliation
  projection.py   five-year projections with explicit methods
  store.py        case store: lifecycle states, immutable versions, reviews, audit log
  scenarios.py    allowlisted path-based override patches (copy-on-write)
  services.py     calculation orchestration + scenario comparison
  excel_audit.py  permanent, verified, immutable .xlsx audit packages
  agent/          typed tools, runtime policy, Anthropic-backed runtime
scripts/build_rulesets.py   deterministic ruleset generator
examples/build_example_case.py   full workflow demo (no LLM needed)
tests/*.py        55 tests: golden cases, lifecycle, isolation, guardrails
docs/             ASSESSMENT · ARCHITECTURE · RUNBOOK · THREAT_MODEL ·
                  UNSUPPORTED · CONTROLS
```

### Quick start

```bash
pip install -e .[dev]
python -m pytest
python examples/build_example_case.py   # base case + 3 scenarios + audit workbook
```

See `docs/RUNBOOK.md` for the agent runtime and operations, and
`docs/UNSUPPORTED.md` for the engine's explicit scope boundaries.

> All output is a **planning estimate**, not filed-return advice. Future-year
> parameters (2026+) are provisional projections of enacted 2025 law and are
> labeled as such everywhere they appear.
