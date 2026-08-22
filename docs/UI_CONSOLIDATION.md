# UI Consolidation — Inventory, Canonical Ownership Map, Final Navigation

This document is the mandatory pre-deletion inventory for the interface
requirements: every tab, Recalculate surface, AI entry point, duplicate data
structure, format control, and movable component across both repositories,
followed by the proposed final navigation and canonical ownership. **No
duplicate tab or structure is deleted until its row's gates are met**
(fields mapped → formulas independently validated → canonical replacement
exists → data migration → tests → navigation/redirects updated → no report,
calculator, or AI prompt references it).

## A. Inventory

### A.1 Tabs / sections

**Canonical workbench (this repo, `src/`)** — 13 tabs, 3 nav groups:
Planning: `dashboard`, `clients`, `scenarios`, `ai`, `guide`, `report` ·
Calculations: `se`, `magi`, `qbi`, `health` · Administration: `audit`,
`data`, `reference`. Plus the tools rail (client snapshot, goal monitor,
bracket headroom, validation center, calculators, quick calculator) and
calculator drawers (S-corp salary, QBI, business).

**Legacy platform shell (`AI-Tax-APP`)** — 34 sections:
dashboard, client-profile, clients, tax-comparison, schedule-1, schedule-a,
schedule-c, schedule-e, investment-income, entity-strategy, retirement,
home-office, vehicle, obbba, year-end, creative, advisory, planning-guide,
scenarios, whatif, quarterly, documents, deadlines, state-tax,
client-report, ai-strategist, trust-center, form-1041, review-1041, gst,
trust-ref, planner-1040 (iframe → `planner/`), workbench (iframe → this
app), plus the embedded planner's own tabs (planner / report / scenarios /
coverage / import-export).

### A.2 Recalculation implementations (current)

| Where | Mechanism |
|---|---|
| Workbench | **Reactive canonical engine**: every commit re-runs `computeScenario` for all of the active client's scenarios via one memoized pipeline (`results` in `10-app.js`). One implementation, no manual button yet. |
| AI-Tax-APP shell | Per-section imperative `calculate*()` functions (one per calculator tab) — many parallel implementations. |
| planner/ | Own engine + full re-render on commit. |

### A.3 AI entry points

| Surface | Repo | Transport today |
|---|---|---|
| AI Analysis workspace (`ai` tab) | workbench | shared `15-ai-chat` transport (`/api/grok` proxy → BYO fallback) |
| Ask AI (per module tab, header) | workbench | same (routes into workspace) |
| Scenario AI panels (per-card inline) | workbench | same |
| AI Optimize | workbench | same |
| AI Build Report | workbench | same |
| Quick reviews (tools rail) | workbench | same |
| AI Tax Strategist | AI-Tax-APP | separate implementation (now Claude proxy + BYO) — **duplicate** |
| Trust/estate AI | AI-Tax-APP | none today (static content) |
| Planner | planner/ | none by design (deterministic notes parser) |

### A.4 Duplicate data structures (localStorage)

| Key(s) | Owner | Classification |
|---|---|---|
| `tp_clients_v1` (clients + scenarios) | workbench | **Canonical** client + scenario state |
| `tp:*` UI prefs (`getUIPref`) | workbench | Canonical UI prefs |
| `tp-ai-settings` | workbench | Canonical AI BYO settings |
| `tap-*` / shell state in AI-Tax-APP | legacy shell | Migrate → canonical, then remove |
| `tax-planner-project-v1` | planner/ | Migrate (planner scenarios → workbench scenarios where representable), else export/archive |
| `ai_tax_strategist_anthropic_key` | legacy shell | Remove after AI consolidation (BYO lives in `tp-ai-settings`) |
| Python `ai_tax` store | server-side | Canonical audit-grade record (separate concern; unchanged) |

### A.5 Format controls (current)

Workbench `22-appearance.js`: theme, background, font (4 options), text
size, border tone/width/radius, gridlines, density (ledger), per-tab
overrides with global/tab scope + reset. AI-Tax-APP has its own tab-paint
system (`tap-*`) — duplicate, slated for migration/removal.

### A.6 Movable/collapsible components (current)

Dashboard collapsible sections (persisted open state, restore-default,
collapse-all), tools rail collapse + icon rail, ledger column widths +
density, calculator drawers. No reorder/resize yet.

## B. Canonical ownership map (per legacy AI-Tax-APP section)

| Legacy section | Classification | Canonical owner / gate |
|---|---|---|
| workbench (iframe) | **Canonical** | This app — becomes the platform itself |
| dashboard, client-profile, clients | Redirect → canonical | workbench `dashboard`/`clients` |
| scenarios, whatif | Redirect → canonical | workbench `scenarios` |
| ai-strategist | Remove after verified replacement | workbench `ai` (context-grounded) |
| schedule-1 | Merge into canonical | workbench Schedule 1 inputs (`scenarios` ledger) + validation |
| schedule-a | Merge into canonical | workbench Schedule A (ledger + itemized module) |
| schedule-c | Merge into canonical | workbench Schedule C (business entities) |
| schedule-e | Merge into canonical | workbench passthrough/rental entities |
| investment-income | Merge into canonical | workbench investment inputs + NIIT module |
| entity-strategy | Merge into canonical | workbench S-corp calculators + scenarios |
| retirement | Merge into canonical | workbench `se` (SE & Retirement) |
| qbi (in comparison views) | Already present | workbench `qbi` |
| home-office, vehicle | **Migrate** (workflow calculators) | new workbench calculator drawers; formulas independently validated first |
| tax-comparison | **Migrate** | workbench year-comparison view (TY2025⇄TY2026 exists in modules; needs one dedicated view) |
| quarterly | **Migrate** | new workbench module paired with a Sec. 6654 engine module (backlog; see CONSOLIDATION.md) |
| state-tax | Defer | display-only without an engine invites false confidence |
| documents | Redesign | superseded by `ai_tax/imports.py` + review-queue UI |
| deadlines | Migrate | static data → workbench guide/administration page |
| client-report | Redesign | workbench `report` absorbs missing presentation pieces |
| planning-guide, obbba, year-end, creative, advisory | Merge into canonical | workbench `guide` content categories |
| trust-center, form-1041, review-1041, gst, trust-ref | **Migrate, engine-first** | blocked on governed 1041/GST rulesets + golden tests (CONSOLIDATION.md) |
| planner-1040 (planner/) | Merge into canonical | unique engine features (safe harbor, AMT est., SS taxability, 2/37, strategy library) become workbench engine modules with golden tests; then planner archived |

## C. Proposed final navigation (single app = the workbench)

```
Planning        Dashboard · Client Profiles · Scenarios · AI Analysis ·
                Planning Guide · Report
Calculations    SE & Retirement · MAGI Phase-Outs · QBI Workbench ·
                SEHI & IRA · Year Comparison* · Quarterly Payments* ·
                Home Office & Vehicle*
Trusts &        Trust Center* · Form 1041* · GST*        (engine-first gate)
Estates*
Administration  Audit Trail · Import / Export · Documents & Review Queue* ·
                Deadlines* · Reference
```
`*` = added only when its row's gates in §B are met. Exactly one version of
Client Profiles, Scenarios, Reports, AI Chat/Analysis, Quarterly payments,
Document tracking, Settings/Customize survives. Legacy routes get redirects
or an explanatory pointer; nothing is hidden-but-active.

## D. Mandatory interaction requirements — implementation locations

| Requirement | Where implemented |
|---|---|
| Canonical recalculation service + per-tab Recalculate + scopes + identity/status strip | `src/25-recalc.js` + `10-app.js` header (all tabs) |
| One AI framework + visible context + staleness | `15-ai-chat` transport (already single in canonical app) + context/staleness additions in `10/16/18` |
| Edit Format preserved & expanded | `22-appearance.js` (global/tab scopes kept) |
| Calibri + font list + fallbacks | `APPEARANCE_FONTS` (`Calibri, Carlito, "Segoe UI", Arial, sans-serif`; no font binaries committed) |
| Text vs number font, number size/weight, tabular numerals | CSS var `--app-font-num` on numeric classes + appearance controls |
| Number-format controls (presentation-only) | one shared service: `00-format.js` reading `TP_NUMFMT`; every tab already calls these formatters |
| Move/resize cards | Edit Layout mode: grid order + span presets, undo, reset, keyboard controls, per-user/per-tab persistence (dashboard first, framework reusable) |
| Versioned preference schema | `tp_prefs_v2` (versioned, validated, migratable, exportable, reset-safe, ignorant of unknown widgets) |
| Accessibility guards | warnings in the appearance panel; critical strip (recalculate, client, year, scenario, engine/rules, validation, recon/AI status) not hideable |
