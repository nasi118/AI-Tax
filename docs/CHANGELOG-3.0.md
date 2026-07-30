# Tax Advisory Pro 3.0 — Interface Redesign

Interface, layout, usability and information-architecture update. **No tax
logic changed.** The deterministic engine, scenario pipeline, tax-year
parameter tables, import/export, reports and audit trail are untouched:
`src/00`–`04`, `06`, `07`, `11`–`18` and everything under `api/` are
byte-identical to 2.1.

## Regression results

| Suite | Before redesign | After redesign |
|---|---|---|
| `npm test` (golden engine regression, `tests/golden.test.mjs`) | 41 passed, 0 failed | **41 passed, 0 failed — identical assertions, identical frozen totals (24,161 / 17,889 / 16,594)** |
| In-app engine self-test (Reference tab) | all passing | all passing |
| New UI interaction suite (`tests/ui-acceptance.mjs`) | — | **50 passed, 0 failed** |

Run the UI suite with a static server on the repo root:
`npm start` then `node tests/ui-acceptance.mjs http://localhost:3000`.

## Architecture summary

The app remains a build-less static React app (vendored React 18, numbered
`src/` files sharing global scope). The redesign adds three interface-only
modules and rewires presentation:

- **`src/19-ui-shell.js`** — UI-preference store (`tp_ui_prefs_v1` in
  localStorage, observable, never mixed with tax data), the collapsible
  `Section` primitive (persisted open state, lazy children, aria-expanded,
  full-workspace mode, Expand-all/Collapse-all/Default-view per page), the
  `Drawer` primitive (Esc to close, focus return) and `StatLine`.
- **`src/20-tools-panel.js`** — the right tools rail: active-scenario
  snapshot, bracket headroom (bracket room, 0% LTCG capacity, NIIT and
  Additional-Medicare distances, §199A threshold position), validation
  center with counts, calculator launcher, quick calculator with tape
  (copy / insert-into-input / save-to-notes).
- **`src/21-calculators.js`** — ten contextual calculators opening in a
  right drawer, prefilled from the active scenario, computing **only**
  through `computeScenario`/`bracketFill` on temporary clones: S-Corp
  Salary Optimizer (test levels Sole-prop / Aggressive 30% / Minimum
  supported 40% / Standard 50% / Conservative 60% / All salary / Custom,
  documentation-risk words, no "optimal" claim), QBI limitation waterfall
  with the binding constraint highlighted, SSTB phase-out sensitivity
  sweep, Tax Brackets & headroom, Charitable planning (incremental engine
  delta, two-year bunching, appreciated-property estimate), Audit Risk
  review (qualitative levels only — explicitly no numeric probability),
  §163(j) (standalone, OBBBA EBITDA ATI), Payroll breakdown, Roth
  conversion, Retirement plan-design comparison. Each offers Create test
  scenario (clones through the normal pipeline, logged to the audit
  trail), Ask AI to review, and Add note.

## Interface changes

- **Shell** — three-area layout: grouped left navigation (Planning /
  Calculations / Administration, collapsible groups, 220px ↔ 62px icon
  rail with tooltips; tax year and filing status move to the top toolbar
  when collapsed), main workspace capped ~1,420px, right tools panel
  300px ↔ 52px icon rail, hideable, states persisted. Breakpoints: 3
  areas ≥1280px; auto-collapsed rails to 1280px; nav drawer + tools
  drawer + one-column below 900px.
- **Design system** — adopted the reference visual language: navy sidebar
  (#0b1526), cool grey page (#e9edf3), blue accent (#1d4ed8/#1e40af),
  subtle card shadows. Typography scaled up: body 14px, page titles 23px,
  card headings 13.5px sentence case, table text 13px, KPI figures 27px,
  tabular numerals everywhere; editable inputs stay blue-on-white with
  focus rings, calculated values dark on grey, totals bordered/bold,
  grand totals inverted.
- **Dashboard** — one proportionate toolbar (scenario, year, status, Edit
  inputs, Analyze with AI, Build report), six KPI cards with accent
  stripes and a manual-override warning icon, scenario chart at 300px
  with a metric switcher (Total modeled tax / After-tax income /
  Spendable cash / Effective rate — separate scales, never a shared
  axis), Form 1040 walk collapsed to twelve key totals with a detailed
  toggle, and lazily-computed sections (the marginal-rate sweep only
  runs when its section is open).
- **Scenarios** — cards with Base / Lowest modeled tax / Highest
  after-tax income / Highest spendable cash / AI proposed / Needs review
  badges and the after-tax + spendable rows; per-card **Analyze with AI**
  expands an inline panel (or right drawer) that states its context,
  offers the six quick analyses, and can never change inputs; ledger
  columns narrowed to 148–190px with sticky headers and line-item
  column, Comfortable/Standard/Compact density, collapsible groups
  including a new Economic & cash-flow reconciliation group, and
  Expand/Collapse-all-groups controls — all persisted.
- **Planning Guide** — category bubbles with counts (six categories +
  Law Changes subtab), only the selected category renders, compact
  accordions (name, one-line blurb, risk pill → full text, authorities,
  Model-with-AI, Save-to-workpapers), search across all categories, risk
  filter, Expand/Collapse all. OBBBA law-change cards moved off the
  first screen into their subtab.
- **Accessibility** — aria-expanded/controls on every collapsible,
  Escape closes drawers and full-workspace sections with focus return,
  :focus-visible outlines, buttons throughout (no clickable divs).
- **Performance** — collapsed sections, guide categories and calculators
  render nothing until opened; collapse/navigation state changes trigger
  no engine recomputation.

## Files changed

`index.html` · `css/styles.css` · `src/05-ui-primitives.js` (Money focus
tracking, StackedBars axisFormat) · `src/08-pages.js` (Dashboard,
ScenariosPage, ScenarioAIPanel) · `src/09-reference.js` (PlanningGuide) ·
`src/10-app.js` (shell, nav groups, tools wiring, calculator pipeline) ·
new `src/19-ui-shell.js`, `src/20-tools-panel.js`,
`src/21-calculators.js` · new `tests/ui-acceptance.mjs` ·
`docs/screenshots-3.0/` (before/after) · this changelog.

## Confirmations

- Calculation logic preserved: engine files untouched; golden suite
  identical before and after.
- No API key in frontend code (scan of `index.html`, `src/`, `css/`,
  `vendor/` finds only placeholder hints); AI traffic still routes
  through the server-side `/api/ai/*` proxies.
- Scenario add/copy/rename/delete, import/export, reports and the audit
  trail verified working; calculator-created scenarios appear in the
  audit trail ("Scenario created from calculator").
- AI cannot silently change inputs (asserted by the UI suite); proposals
  still require approval and run through the engine.

## Known items / not done

- Ledger columns are bounded (148–190px) rather than drag-resizable.
- Collapse state persists per page, not per page-and-scenario.
- The Planning Guide keeps the six existing content categories plus Law
  Changes; the additional categories in the design brief would require
  new tax content, which was out of scope for an interface change.
- The QBI and SSTB calculators are analytical (engine sweep) rather than
  free-input what-if forms; §163(j) is standalone at the entity level.
- Universal click-any-cell provenance (carried over from 2.x) remains
  limited to the existing drill rows and calculator breakdowns.
- The old floating calculator window was superseded by the tools-rail
  quick calculator; the Notes and Ask AI floating tools remain.

---

# 3.1 — Appearance customization

Adds a **Customize** panel (topbar, every tab) for adjusting formatting and
theming per tab or application-wide. Presentation only — settings live in
the same device-local UI-preference store, never with tax data, and every
value is bounded to presets so a saved preference cannot make the app
unreadable.

- **Scope switch** — "Entire application" or "This tab": each tab can carry
  its own overrides on top of the global settings, with a one-click clear.
- **Color themes** — Classic Blue, Indigo, Emerald, Graphite, Burgundy, and
  Dark (full dark surface set including charts, inputs and grand-total rows).
- **Background** — theme default, six curated tints, or a custom color picker.
- **Fonts** — System Sans, Humanist, Georgia Serif, Monospace; text size
  Compact / Default / Large / Extra large (scales tables, cells, KPIs and
  inputs coherently).
- **Borders** — strength (light/medium/strong border color), width
  (hairline/bold), corner style (rounded/soft/square), and optional vertical
  table gridlines.
- **Column resizing** — Labels and Columns sliders in the Scenarios ledger
  toolbar resize the line-item column (200–320px) and every scenario column
  (145–260px) within bounded limits, persisted.

Implementation: new `src/22-appearance.js` (presets + effective-settings
resolution + panel); `css/styles.css` refactored so surfaces use
`var(--card)`/`var(--grand-bg)` and the app root re-resolves theme variables,
plus modifier classes (`ap-fs-*`, `ap-bw-2`, `ap-rad-*`, `ap-gridv`,
`ap-dark`); `src/10-app.js` applies the effective settings per tab;
`src/08-pages.js` adds the ledger column sliders.

Verification: golden engine suite still **41/41**; UI acceptance suite
extended to **62/62** (theme variables apply, background repaints, text
size/border/corner/gridline classes, per-tab override isolation and
clearing, column resize rerender, reset to defaults). Screenshots:
`docs/screenshots-3.0/appearance-*.png`.
