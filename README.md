# AI-Tax

**[Open the live Tax Planning Workbench](https://nasi118.github.io/AI-Tax/)**

[Architecture](docs/ARCHITECTURE.md) · [Capabilities](docs/CAPABILITIES.md) · [Controls](docs/CONTROLS.md) · [Runbook](docs/RUNBOOK.md) · [Known limitations](docs/UNSUPPORTED.md)

> **Public demo:** Use fictional or de-identified information only. Client profiles and some optional AI settings are stored in the browser. Do not enter real taxpayer data, production credentials, or confidential client information in the public deployment.

This is the **canonical repository and main application**. The separate `AI-Tax-APP` repository is retained as a legacy/reference implementation while selected capabilities are consolidated here; see [Consolidation](docs/CONSOLIDATION.md).

Two complementary components live in this repository:

1. **Tax Planning Workbench** (formerly Tax Advisory Pro) — a dependency-free static web app (React 18, no
   build step) for TY2025/TY2026 individual tax planning. Served from the
   repo root; this is what GitHub Pages and connected static deployments serve.
2. **`ai_tax` (Python)** — an audit-grade deterministic tax calculation
   engine with versioned rulesets, immutable base-case/scenario lifecycle,
   reconciliation, permanent Excel audit packages, and a constrained
   **Tax Planning Analyst Agent** as an orchestration/explanation layer.

---

## Tax Planning Workbench — Individual Planning (TY2025 / TY2026)

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

### Tests

```sh
npm test
python -m pytest
```

The JavaScript suite covers deterministic golden cases, client-identity/data-flow behavior, and the OpenAI API proxy handler (offline — it stubs `fetch` and needs no key). The Python suite covers calculation, lifecycle, isolation, reconciliation, import, persistence, and governance controls. CI also runs the cross-engine contract, UI acceptance, standalone-build, and audit-workbook checks described in [CI](docs/CI.md).

### AI backend

The AI advisory features call the **OpenAI API** through a server-side
proxy, so the credential never reaches the browser.

| | |
|---|---|
| Environment variable | `OPENAI_API_KEY` (set it on the deployment, not in the repo) |
| Endpoint | `POST https://api.openai.com/v1/responses` — the Responses API, which is what OpenAI recommends for these reasoning models |
| Models | `gpt-5.6-sol` (default, most capable) · `gpt-5.6-terra` (lower cost) · `gpt-5.6-luna` (fastest); chosen in Settings → AI advisory layer |
| Proxy | `api/_lib/openai-proxy.js` — POST-only, request-size ceiling, per-IP rate limit, sanitized history, upstream timeout, refusal handling |
| Routes | `/api/ai/chat` (reviewer), `/api/ai/analyze`, `/api/ai/optimize`, `/api/ai/build-report` |

The proxy pins explicit model ids rather than the floating `gpt-5.6` alias, so
a change on OpenAI's side cannot silently move which model produced a piece of
tax analysis. A model id it does not serve — a stale one from an older cached
client, a hand-edited preference — falls back to the default, and the response
says which model actually ran.

`/api/grok` is a deprecated alias of `/api/ai/chat`, retained so an older
cached client build keeps working; it runs the same OpenAI-backed handler.
Each route sets its own token budget and reasoning effort, and every one must
finish inside the function duration in `vercel.json` (60s) — the proxy's own
50s budget leaves margin so a slow request returns a readable error instead of
a bare platform timeout.

Without the key the routes answer `501` and the app falls back to its
bring-your-own-key path, where a user's own OpenAI or Grok key is kept in that
browser's `localStorage` and sent only to that provider. Send
`GET /api/ai/chat` to check whether a deployment is configured.

> The Python agent runtime (`ai_tax/agent/runtime.py`, the optional `[agent]`
> extra) is a **separate** subsystem and still uses the Anthropic SDK with its
> own tool-calling loop and `ANTHROPIC_API_KEY`. It is not part of the web
> app's AI layer and was not moved to OpenAI.

### Data and deployment boundaries

- The public URL is a demonstration and evaluation environment, not a production client portal.
- Browser client profiles are persisted in `localStorage`; they are not a substitute for authenticated, tenant-isolated server storage.
- Optional direct-provider AI settings may persist a user-supplied API key in that browser. Do not use production keys in the public deployment.
- The deterministic engine—not an AI model—is the calculation authority. AI features are limited to controlled assistance and explanation.
- Results are planning estimates and require professional review against current law, source documents, and applicable federal and state rules.

### Single-file standalone build

To produce one self-contained HTML file that runs offline straight from
`file://` (handy for sharing with a client or advisor):

```sh
npm run build:standalone       # writes dist/tax-advisory-pro.html
```

The 1040 Planner module is **not** included in that file. It is a separate
document with its own engine and vendored libraries, and inlining it would add
well over a megabyte to a file meant to be emailed. Opened from `file://`, the
1040 Planner tab says so plainly instead of showing a frame that cannot load;
every other tab — the Scenarios ledger included — behaves exactly as it does
in the hosted app.

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
  27-scenarios-planner.js  The 1040 Planner tab — mounts the embedded module
  28-settings.js      Application settings (behaviour, not presentation)
  10-app.js           App shell component + mount
planner/            Self-contained 1040 Planner module (TY2024–TY2028): its
                    own UI, engine and vendored libraries. Runs on its own tab
                    and standalone at /planner/
api/                Vercel serverless AI routes (OpenAI proxy)
tools/              Build script for the standalone single-file version
```

**Two independent engines, never mixed.** The **Scenarios** tab keeps the
line-by-line comparison ledger, its row editors and the strategy library, all
computed by the workbench engine (`src/02-engine.js` / `src/03-scenario.js`)
that also drives the Dashboard, the SE / MAGI / QBI / SEHI modules, Report and
Audit. The **1040 Planner (TY2026)** tab hosts a separate module with its own
multi-year engine (TY2024–TY2028) and its own saved projects, and is
deliberately **unlinked** from that pipeline — nothing passes workbench
scenarios into it and nothing it computes flows back out. A figure on screen
is never half from one engine and half from the other.

The planner is also **standalone in its own right**: it reads no client
profile, and no client has to exist before it can be opened and used.
Bringing a return in is an explicit action, never something that happens on
load. Its Scenarios tab is a line-by-line comparison matrix — rows are Form
1040 and schedule lines in return order, columns are the declared baseline
and each scenario — and its tax year is selected per project, with any year
that has no published inflation adjustment (2027, 2028) marked **Projected /
Estimated** wherever its figures appear.

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
tests/*.py        pytest suite: golden cases, lifecycle, isolation, guardrails,
                  cross-engine contract, persistence, imports, governance
docs/             ASSESSMENT · ARCHITECTURE · RUNBOOK · THREAT_MODEL ·
                  UNSUPPORTED · CONTROLS · CAPABILITIES · CI · PERSISTENCE ·
                  CONSOLIDATION · ISSUE_BACKLOG · BASELINE-2026-08-22
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

---

## Canonical-foundation layer (both components)

- **Capability boundary** — `capabilities/registry.json` is the
  machine-readable matrix of what each engine calculates, approximates,
  blocks, or does not detect; `docs/CAPABILITIES.md` is generated from it
  (`python scripts/build_capability_matrix.py`). Results and reports must
  identify their engine and ruleset; UIs must not imply unsupported scope.
- **Cross-engine contract** — `contract/` runs identical canonical cases
  through both engines and reconciles them within explicit tolerances
  (`tests/test_cross_engine_contract.py`).
- **CI** — `.github/workflows/ci.yml` gates every PR: pytest + contract, JS
  golden tests, Playwright UI acceptance, standalone build, Excel
  audit-package smoke with reconciliation, artifact hygiene, dependency
  review, secret scanning. See `docs/CI.md` (includes the branch-protection
  recommendation).
- **Ruleset governance** — `ai_tax/rulesets/GOVERNANCE.json` records legal
  status, citations, retrieval dates, reviewer, checksums, and engine
  compatibility per release; `ai_tax/rulesets/governance.py` validates
  deterministically (tamper detection, duplicate scopes, undisclosed
  projections). Corrections are new `-vN` releases, never edits.
- **Persistence** — `ai_tax/persistence.py` is the narrow backend interface
  (documents with optimistic concurrency, write-once records, append-only
  streams, retention hooks); `docs/PERSISTENCE.md` maps every canonical
  record and the database migration boundary.
- **Document imports** — `ai_tax/imports.py`: upload → validate → classify →
  extract → review-queue → human decision → provenance-linked facts;
  extractions are never authoritative and approved facts are superseded,
  never overwritten.
- **Consolidation** — `docs/CONSOLIDATION.md` classifies the legacy
  `AI-Tax-APP` capabilities (migrate / redesign / defer / reject) and defines
  archival acceptance criteria; the prioritized work plan is
  `docs/ISSUE_BACKLOG.md`.

---

**Ownership Notice:** The proprietary software, workflows, methodologies, original tax scenarios, documentation, and related materials in this project are © 2026 AI Tax Strategy Advisors. All Rights Reserved. Third-party and public-domain materials retain their respective ownership status. See `NOTICE.md`.
