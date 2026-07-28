# Tax Advisory Pro — Individual Planning Workbench (TY2025 / TY2026)

A deterministic federal individual income tax planning engine for tax years 2025 and 2026, built as a dependency-free static web app (React 18, no build step).

## Features

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

## Running the app

It's a fully static site — serve the repo root with any static file server:

```sh
npm start                      # uses `serve` on http://localhost:3000
# or
python3 -m http.server 8000
```

Then open the printed URL. There is no build step and no runtime network dependency (React is vendored in `vendor/`).

## Single-file standalone build

To produce one self-contained HTML file that runs offline straight from `file://` (handy for sharing with a client or advisor):

```sh
npm run build:standalone       # writes dist/tax-advisory-pro.html
```

## Project layout

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

The `src/` files were authored as one script and share the global scope — `index.html` loads them in their original order, which must be preserved.

> **Note:** This tool is a planning aid. It is not tax advice; verify results against current IRS guidance before relying on them.
