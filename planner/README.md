# Tax Planner — Individual 1040 (TY2024–TY2028)

A Form 1040 planning workbench, rebuilt as clean, dependency-vendored static
source from the compiled reference app
(`Tax_Planner___Individual_1040_TY2026`). No build step: serve this directory
(or the repo root) statically and open `index.html`. It is the module the main
app's **1040 Planner** tab opens on, and it also works standalone at this
path.

## It is standalone

The planner is not driven by, and does not read from, any client profile or
host application. It opens on its own project, computes with its own engine,
and saves to its own storage. There is **no automatic bridge**: nothing pulls
a client's return in when it loads, and no earlier step — creating a client,
opening a profile — is required before it can be used.

Bringing an outside return in is a deliberate act. `window.TaxPlanner
.importScenarios(list, opts)` is the opt-in path, called from within the
planner document; it is never invoked on load, and there is no message
listener that another frame could import through. Imported scenarios are
tagged; scenarios created here are not, and a later import replaces only the
tagged ones.

## Tax years

Every rate, bracket, threshold and limit is versioned by year, and a
projection is computed wholly within one year's law:

| Year | Provenance | Basis |
| --- | --- | --- |
| 2024 | published | Rev. Proc. 2023-34; SSA 2024 wage base; pre-OBBBA law |
| 2025 | published | Rev. Proc. 2024-40 as amended by OBBBA P.L. 119-21 |
| 2026 | published | Rev. Proc. 2025-32; OBBBA P.L. 119-21; SSA 2026 wage base |
| 2027 | **projected** | 2026 amounts indexed one year at an assumed 2.2% chained CPI-U; §70120 SALT schedule applied as enacted |
| 2028 | **projected** | as 2027, indexed two years |

A projected year is never presented as authority: the selector marks it, the
Scenarios tab carries a banner, and the provenance travels on the computed
result itself. No year reuses another year's amounts — the projected sets are
derived by indexing each amount on its own statutory increment, leaving
non-indexed amounts alone, and taking already-legislated figures from the
statute.

## What it does

- **Planner** — a full Form 1040 build-up (wages, interest/dividends,
  Schedule C, Schedule E with §469 passive-loss limitation, Schedule D with
  0/15/20/25/28% preference bands, other income incl. Social Security
  taxability, above-the-line planning deductions, standard vs. itemized with
  the 2026 SALT cap phase-down and the OBBBA 2/37 haircut, §199A QBI with
  SSTB phase-out and W-2/UBIA limits, AMT (estimated), NIIT, Additional
  Medicare, CTC/ODC, and the §6654 estimated-tax safe harbor). Every line has
  an authority citation, a completeness status, and a calculation-detail
  drawer.
- **Report** — a print-ready client deliverable (browser print → PDF).
- **Scenarios** — the comparison matrix, and the tab the planner is really
  for. Rows are Form 1040 / schedule / planning line items in return order;
  columns are the declared baseline and each scenario. Cells backed by a
  single record are editable in place and recompute that scenario alone;
  cells backed by several records send you to the drawer that can edit them
  properly. Groups expand and collapse individually or all at once, and the
  return's own subtotals (AGI, taxable income, total tax, effective and
  marginal rate) stay visible whatever is collapsed. Columns can be added,
  duplicated, renamed, deleted, reordered, and any one of them declared the
  baseline — baseline is a declared position and does not move to whichever
  scenario has the lowest tax. Lowest tax is not marked "best": tax cost is
  one factor and risk, feasibility and substantiation are others. Includes a
  **Strategy Scenario Library** (`js/library.js`): one-click planning
  scenarios sourced from the uploaded practice guides (Roth IRA client
  letter, HNWI Tax Planning & Strategies Guide, CCH Capital Gains & Casualty
  Losses, Entity Classification (CCH), Essential Tax & Wealth Planning Guide
  2025) — Roth conversion bracket-fill, Solo 401(k)/SEP/HSA maximization,
  NQDC deferral, QCDs, DAF bunching, appreciated-stock gifts, tax-loss and
  gain harvesting, QOF deferral, QSBS §1202 exclusion, installment sales,
  S-corp reasonable-compensation election, municipal-bond reallocation,
  disaster casualty losses, and 529 front-loading. Each entry cites its
  authority, clones the baseline, applies real engine inputs to the clone,
  and adds the result as a new column in the matrix with its saving or cost
  against the baseline shown in the column header.
- **Coverage** — an honest matrix of what is implemented, partial, estimated,
  or out of scope.
- **Import/Export** — round-trippable Excel workbook (ExcelJS), project JSON,
  and a deterministic client-notes parser (fixed regex list, no AI, no
  network).

## Structure

- `index.html` — shell, Tailwind config, custom component CSS
- `js/engine.js` — the tax engine, TY2024–TY2028 (decimal.js, precision 40); exposes
  `window.TaxEngine`
- `js/app.js` — the UI (vanilla JS, no framework); state persists to
  `localStorage` under `tax-planner-project-v1`
- `js/excel.js` — Excel workbook build/parse; exposes `window.TaxExcel`
- `vendor/` — vendored `tailwindcss` (play CDN build), `decimal.js`, and
  `exceljs` so the app works fully offline

## Parameters & authority

2026 parameters follow Rev. Proc. 2025-32 and P.L. 119-21 (OBBBA) as encoded
in the reference app (`js/engine.js` → `PARAMS` / `PARAM_AUTHORITIES`).
Planning estimates only — not a filed return and not tax advice.
