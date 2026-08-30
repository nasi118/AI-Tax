# Tax Planner — Individual 1040 (TY2026)

A Form 1040 planning workbench for tax year 2026, rebuilt as clean,
dependency-vendored static source from the compiled reference app
(`Tax_Planner___Individual_1040_TY2026`). No build step: serve this directory
(or the repo root) statically and open `index.html`. It is the module the
main app's **Scenarios** tab opens on — where it replaced that tab's static
side-by-side attribute table — and it also works standalone at this path.

When embedded, the host pushes scenarios in from its library through
`window.TaxPlannerHost` (see `js/planner-bridge.js` at the repo root) and
reads the engine's results back. Imported scenarios carry a `hostId`;
scenarios created here have none, and a host re-import replaces only the
imported ones.

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
- **Scenarios** — create/duplicate/rename/delete scenarios and compare 2–4
  side by side with deltas vs. baseline and an input diff. Includes a
  **Strategy Scenario Library** (`js/library.js`): one-click planning
  scenarios sourced from the uploaded practice guides (Roth IRA client
  letter, HNWI Tax Planning & Strategies Guide, CCH Capital Gains & Casualty
  Losses, Entity Classification (CCH), Essential Tax & Wealth Planning Guide
  2025) — Roth conversion bracket-fill, Solo 401(k)/SEP/HSA maximization,
  NQDC deferral, QCDs, DAF bunching, appreciated-stock gifts, tax-loss and
  gain harvesting, QOF deferral, QSBS §1202 exclusion, installment sales,
  S-corp reasonable-compensation election, municipal-bond reallocation,
  disaster casualty losses, and 529 front-loading. Each entry cites its
  authority, applies real engine inputs to a cloned scenario, and
  pre-selects the comparison vs. baseline.
- **Coverage** — an honest matrix of what is implemented, partial, estimated,
  or out of scope.
- **Import/Export** — round-trippable Excel workbook (ExcelJS), project JSON,
  and a deterministic client-notes parser (fixed regex list, no AI, no
  network).

## Structure

- `index.html` — shell, Tailwind config, custom component CSS
- `js/engine.js` — the TY2026 tax engine (decimal.js, precision 40); exposes
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
