# Tax Advisory Pro 3.3 — Professional workbench polish

Interface and workflow update. **No tax logic changed** — `src/00`–`04`,
`06`, `07` and the Python `ai_tax/` engine are untouched, and the golden
engine suite is identical before and after (41/41, same frozen totals).

Everything below is additive; no existing module, tool, or workflow was
removed or replaced. Older 3.0/3.1 patterns were reused wherever one already
solved the requirement (tools rail states, drawer primitives, quick-calculator
insert mechanism, appearance system, section framework).

## New in 3.3

- **Ownership line everywhere** — `© 2026 AI Tax Strategy Advisors. All
  Rights Reserved.` renders in a main-area footer on every tab, desktop and
  mobile, without opening any menu (the expanded-sidebar copy remains).
- **Three-state left navigation** — expanded ↔ icon rail (existing) plus a
  fully **hidden** state with a `☰ Menu` restore button in the topbar;
  state persists (`navMode`, migrating the legacy boolean). The mobile
  drawer gains an explicit close (X) button; outside-tap and
  close-on-navigate were already present.
- **Persistent desk calculator** — the 2.x floating tape calculator returns
  on the dock (alongside Notes and Ask AI): running tape, memory keys, %,
  keyboard entry, pull-from-scenario chips, send-tape-to-notes — plus new
  **Copy tape** and **Insert into input** (writes the result into the last
  focused money field, the quick calculator's mechanism). The tape now lives
  in the app shell and the preference store, so it survives navigation and
  reload.
- **Copy for Excel** — table serialisation to TSV with numerics cleaned to
  real numbers (`$`/commas stripped, parentheses → negatives, percent
  literals preserved), on the Scenarios ledger (CSS-grid aware), the
  Form 1040 walk, and the Audit Trail. This complements — never replaces —
  the full `.xlsx` export, whose Cover sheet now also carries the client ID,
  engine/rules versions, and the generation timestamp.
- **Pop-out / duplicate view** — topbar controls open the current view in a
  new tab or a pop-out window via `?tab=` / `?client=` URL parameters
  (interface state only, never tax data). All views share one client store —
  nothing is duplicated — and a `storage` listener refreshes open views when
  another one saves.
- **Undo / redo** — topbar buttons and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y for
  field-level scenario input edits (the `update()` pipeline). Undo/redo
  replays the change through the same pipeline, so the audit trail records
  it as a new entry — history is appended, never rewritten. Structural
  actions (add/copy/delete scenario, imports, AI scenario creation) are out
  of scope and keep their own confirmations.
- **Calculation trace** — "?" buttons on dashboard KPIs and Form 1040 walk
  rows open a "Where did this come from?" drawer: inputs, intermediate
  values, the formula description, statutory parameters with authorities,
  scenario, tax-year basis, engine/rules versions and calc time. Every
  amount is read from the engine result; **Ask AI to explain** sends the
  trace as context with an explicit instruction that the engine's amounts
  are authoritative. **Copy trace** included.
- **Command bar** — Ctrl/Cmd+K (and a visible ⌕ Search button, mobile
  included): navigation-first search over pages, clients, scenarios,
  calculators and real actions (recalculate, exports, notes, customize,
  undo, tools, new tab). Recent destinations appear when the query is empty.
  It never fabricates content or authority results.
- **Pinned calculators** — star any calculator in the tools rail to keep it
  at the top of the launcher (persisted per device).
- **Section-level report export** — checkbox chips choose which report
  sections print/download; the on-screen report stays complete and the
  disclaimer always prints.

## Files

New `src/26-workbench.js` (copy-for-Excel, command bar, trace drawer,
pop-out helpers, recents) · `src/10-app.js` (shell wiring, nav mode,
undo/redo, URL params, storage sync, footer, dock calculator) ·
`src/08-pages.js` (trace hooks, ledger/walk copy) · `src/14-tools.js`
(calculator tape lift + insert/copy, DataPage client prefill, audit copy) ·
`src/20-tools-panel.js` (pins) · `src/13-export.js` (cover identity rows) ·
`css/styles.css` · `index.html` · new `tests/ui-workbench.mjs` (39
assertions, desktop + mobile) wired into CI.

## Verification

golden 41/41 · client-identity 32/32 · ui-acceptance 62/62 ·
ui-format-layout 32/32 · ui-workbench 39/39 (1440×900 and 390×844).
No secrets client-side; AI still proposes — the engine stays authoritative.
