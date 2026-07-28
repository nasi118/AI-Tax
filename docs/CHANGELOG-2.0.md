# Tax Advisory Pro 2.0 — Logic Corrections, UX Improvements, and AI Review Layer

Engine version **2.0.0** · Rules version **OBBBA-TY2025/TY2026-2026-07**

The application remains a deterministic tax calculation engine. AI explains,
reviews, and proposes; it never calculates and never silently changes inputs.

## Calculation defects corrected (Priority 0)

1. **Schedule A SALT election** — state/local income tax and general sales tax
   were previously **added together**. Now the larger of the two is elected
   (`Math.max`), property taxes are added, then the cap and phase-down apply.
   The election used ("State income tax elected" / "General sales tax
   elected") is displayed in the Schedule A editor.
2. **Senior deduction phaseout** — the 6% phaseout of excess MAGI was
   previously **multiplied by the number of qualifying seniors**. It now
   applies once. Regression: MFJ, 2 seniors, MAGI $200,000 → $9,000 (was
   $6,000).
3. **Schedule 1-A filing-status restriction** — the senior, tip, overtime and
   vehicle-loan-interest deductions are now **blocked up front for married
   filing separately** with a visible "Not available when married filing
   separately." message, instead of being computed normally.
4. **Student-loan-interest deduction** — previously the entered amount flowed
   into Schedule 1 **at face value**. Now: statutory $2,500 cap, MAGI
   phase-out by filing status ($85k–$100k single/HoH, $170k–$200k MFJ,
   parameter-driven per tax year), MFS disallowance, and its §221 MAGI is AGI
   computed without this deduction. The editor shows entered / maximum /
   MAGI / phase-out % / allowed.
5. **S-corporation opportunity probe** — the automated S-corp probe derived
   K-1 as `profit − compensation`, ignoring employer payroll tax; the main
   engine deducted it. The probe now uses the same
   `profit − comp − employer FICA` derivation as the engine (single-engine
   principle).
6. **S-corporation payroll-tax components** — employer and employee Social
   Security and Medicare are computed and displayed separately per entity,
   with the wage base applied per wage source; Additional Medicare Tax is
   computed at the return level. Employer FICA is never part of the Form 1040
   balance due (it reduces the K-1), and the report now carries an explicit
   reconciliation: Form 1040 tax liability → modeled payroll taxes → total
   modeled federal economic tax → payments → balance due.
7. **QBI binding-limit display** — the three QBI amounts were displayed as
   independent limits with the minimum labeled "binding", which is wrong
   during the phase-in and below the threshold. The wage/UBIA amount now
   shows **"N/A — not applicable below the threshold"** when taxable income
   is below the threshold, and a card is marked binding only when it actually
   equals the allowed deduction. The allowed deduction remains
   `min(entity-level components after wage/UBIA and SSTB rules, 20% taxable-income cap)`.
8. **QBI Schedule C deduction allocation** — the half-SE-tax, retirement and
   SEHI allocation against linked Schedule C QBI is now **traceable per
   business**: the QBI workbench displays each business's allocated amounts
   and the allocation method (proportional to positive Schedule C profit).
9. **NIIT classification** — a single passive checkbox no longer drives §1411
   treatment. Each passthrough activity carries a controlled classification
   (portfolio / passive T-or-B / nonpassive T-or-B excluded / nonpassive
   rental potentially excluded / rental included / trader / self-rental /
   working capital / excluded / human review). Rental income leaves the NIIT
   base only when affirmatively classified; unclassified activities keep
   their legacy treatment **and are flagged for human review**. A per-activity
   inclusion table is shown in the passthrough editor.

## Scenario comparison and economics

- **Spendable after-tax cash** added:
  `after-tax economic income − retirement − HSA − charitable cash outflows`,
  with the outflows carried separately (`cashOutflows`). Employer payroll tax
  already reduced the K-1 and is never subtracted twice.
- **Comparison ledger** gained rows: after-tax economic income, retirement and
  HSA funding, charitable cash outflow, spendable after-tax cash, and delta
  rows (tax / economic income / spendable cash vs base). Delta rows are green
  **only** when the movement is favorable *and* the scenarios' gross
  economics reconcile; a tax drop bought with an income drop is not colored
  as a win (marked †, "Not directly comparable — economic inputs differ.").
- **Badges** — "best" is gone. Independent indicators only: "Lowest modeled
  tax" and "Highest modeled spendable cash", plus "Blocking validation error"
  / "Requires human review" chips. No automated "Recommended" designation
  exists; recommendation requires human judgment outside the tool.
- **Charitable bunching** is modeled over a real two-year window (TY2025 +
  TY2026 parameters when the base year is 2025), reporting the two-year
  benefit, the average annual benefit, the bunch-year reduction and the
  off-year increase separately. The headline number is the annualized
  benefit; a two-year benefit is never labeled "per year".

## Validation and provenance

- New `validateScenario` engine (three levels: blocking error / material
  warning / informational review): qualified vs ordinary dividends, taxable
  Social Security vs benefits (and the 85% ceiling), senior/blind counts by
  filing status, HSA limit and catch-up age, Roth-conversion sourcing,
  S-corp compensation vs business economics, legacy K-1 reconciliation,
  negative UBIA, hand-entered QBI W-2 wages, negative Schedule A entries,
  capital-loss limits, tax-exempt interest in MAGI, credit floors, NIIT
  review flags, MFS Schedule 1-A entries, student-loan limits.
- Findings surface as a workspace banner for the active scenario, chips on
  scenario cards, a sheet in the Excel export, and in the AI snapshot.
- Provenance: the QBI workbench, Schedule A (SALT election + cap), senior
  deduction, student-loan and S-corp panels each show source inputs,
  intermediate amounts, the binding limitation and the final amount; ledger
  cells drill into their editors. (A universal click-any-cell provenance
  drawer remains on the limitations list below.)

## Excel export and report

- New **Economics & Validation** sheet: gross economic income → spendable
  after-tax cash reconciliation per scenario, full validation listing, and
  engine/rules version identifiers. Existing sheets remain formula-driven
  with tie-outs.
- Wording: "Total tax" → **"Total modeled federal tax"** across dashboard,
  ledger, report, export and AI context; "lowest tax" → "lowest modeled
  tax"; the report carries a modeled-estimate disclaimer and the 1040-vs-
  economic reconciliation.

## UI

- Workspace widened to 1,360px; larger inputs; higher-contrast explanatory
  text (unchanged design language otherwise).
- Small screens get a collapsible navigation drawer (hamburger + overlay)
  instead of a stacked sidebar; the comparison ledger scrolls horizontally;
  floating tools clamp to the viewport; the AI drawer is full-screen on
  mobile.
- Charts: numbered scenario aliases that survive truncation, full names and
  totals on hover, base scenario marked.

## AI Tax Reviewer (read-only) and secure Grok integration

- The dock button is now **Ask AI**, opening the right-side **AI Tax
  Reviewer** drawer: active tax year, filing status, scenario, engine and
  rules versions, include-current-scenario checkbox, chat, quick-review
  buttons (Explain calculation / Review for arithmetic errors / Review QBI /
  Compare to base / Identify missing facts / Reconcile after-tax cash /
  Review NIIT treatment / Review S-corporation conversion), and the permanent
  notice "AI review only. No calculations or inputs are changed
  automatically."
- **Governance**: the model receives a de-identified snapshot of engine
  outputs (per the specified schema — no names, SSNs, addresses, documents;
  none of those exist in the data model). It may propose input changes only
  in a strict `PROPOSED CHANGE` format; the app renders a proposal card with
  Reject / **Apply and recalculate**. Approval changes the input through the
  normal update path, re-runs the deterministic engine, and writes both the
  field diff and an "AI-proposed change approved" entry to the audit trail.
  AI text is never stored as a tax number. Fields are restricted to an input
  whitelist.
- **Secure architecture**: the deployed app calls `POST /api/grok`, a
  serverless function that holds `XAI_API_KEY` in the deployment environment
  (never in browser code or the repository). The endpoint is POST-only,
  size-limited, rate-limited per IP, sanitizes and truncates history,
  enforces upstream timeouts, returns controlled errors, and logs usage
  without tax data. When the endpoint is unavailable (offline standalone
  file), the reviewer falls back to a clearly-labeled bring-your-own-key
  mode: the user's key stays in their browser's localStorage and goes only
  to the chosen provider — no key ever ships in code.

## Regression tests

`npm test` (tests/golden.test.mjs) — 41 checks, including every corrected
calculation: SALT 15k/8k/10k → raw 25k; senior MFJ ×2 @ 200k MAGI → $9,000;
MFS Schedule 1-A → $0 + warning; student loan below/within/above phase-out +
MFS + over-max; S-corp 750k/150k → employer FICA $11,475, K-1 $588,525; QBI on
those facts → $75,000 wage-bound with the cap at $140,705 and below-threshold
N/A display; economics identities (Δafter-tax = −Δtax only when economics
match); two-year bunching label integrity; validation levels; NIIT
classifications; frozen seed-scenario totals.

## Known limitations (not modeled / partially delivered)

- **Universal provenance drawer**: computation detail is exposed in the
  module panels and drill-downs listed above, not yet as a click-any-cell
  modal on every calculated figure.
- **State income taxes** are not modeled (federal only).
- **AMT** is not modeled.
- **Multi-year modeling** exists only for the charitable-bunching comparison
  (TY2025/TY2026); other strategies are single-year.
- **Administrative/implementation costs** have no dedicated input yet;
  S-corp administrative costs can be carried in the entity's "other
  expenses", which already reduce the K-1. The `cashOutflows.other` slot is
  reserved.
- **Wage-base coordination across multiple employers** applies the Social
  Security wage base per wage source (each employer withholds independently,
  matching withholding mechanics); excess employee-side withholding
  reclaimable on Schedule 3 is not separately modeled.
- **Rate limiting in /api/grok** is per warm serverless instance (best
  effort), not a shared store.
- **Roth-conversion source validation** is informational only — the model
  cannot see whether conversions came from balances rather than
  distributions.
- The **taxable Social Security** amount is a direct input (the app does not
  compute the 0/50/85% inclusion worksheet); validation enforces the 85%
  ceiling.

---

# 2.1 — AI Optimization, AI Analysis workspace, and AI-Built Client Reports

Operating model enforced end to end: **AI identifies and proposes → human
reviews → application creates a scenario → deterministic engine calculates →
AI explains and compares → human approves → report and audit trail update.**

## Three connected AI capabilities
- **AI Optimize** (Summary tab): validation gate (blocking errors make all
  output provisional), objective selection (12 objectives + custom, two-year
  option), AI strategy identification grounded in supplied facts, structured
  candidate scenarios (whitelisted input changes + facts to confirm + benefit
  classification), a review screen (create selected / all / cancel), engine
  recalculation of every created scenario, and a results dashboard ranking
  ENGINE numbers across tax, after-tax income, spendable cash, facts and
  badges — never total tax alone. Cards: open / compare to base / add to
  report / approve for planning / reject / request deeper analysis.
- **AI Analysis workspace** (new nav tab): context panel (active / base /
  selected / all / multi-year TY2025+TY2026 scope, engine and rules versions,
  validation status, include-calculations and include-warnings toggles),
  question box with 13 quick actions, structured collapsible advisory
  responses (executive conclusion → recommended next steps), proposed-change
  cards with Reject / Create-test-scenario, and a saved history with
  workpapers / report / Word / PDF / delete actions — every run and save is
  an audit-trail entry.
- **AI Build Report** (Summary tab): setup (scenario set, 6 report types,
  5 audiences, 5 tones, detail level, 13 sections, client identifier only),
  grounded narrative generation (amounts must trace to the engine package;
  supportingFields metadata retained per section), embedded key figures,
  tax-composition and after-tax charts on separate scales, scenario table,
  and a per-section editor: edit, regenerate-one (others untouched), shorten
  / more technical / more client-friendly, hide, reorder, advisor comment,
  restore AI wording, approve, lock, and stale-section flags when scenario
  data changes ("never silently update an approved narrative").

## Integration
- Summary tab: AI advisory bar (AI Optimize · AI Compare Scenarios · AI
  Build Report) and a per-scenario **AI** menu (explain / opportunities /
  compare to base / calculation logic / missing facts / optimization start)
  showing the analysis context before running.
- Module tabs (SE, MAGI, QBI, SEHI): **Ask AI about this section** button
  routes to the workspace with module + scenario context.
- The Ask AI reviewer drawer remains for quick in-place review.

## Secure backend
- `/api/ai/analyze`, `/api/ai/optimize`, `/api/ai/build-report` (plus the
  `/api/grok` alias) share one hardened proxy: POST-only, 400 KB cap, per-IP
  rate limit, sanitized/truncated history, per-route timeouts, controlled
  errors, usage logged without tax data, `XAI_API_KEY` server-side only.
  GET returns a configuration health check. Authentication is delegated to
  the deployment platform (Vercel SSO on previews) — a public production
  deployment must add its own auth in front of these routes.
- Controlled data package (§16 shape): de-identified, engine-generated,
  multi-scenario, with objectives, validations, unresolved facts, and
  modeled limitations; optional second-year results for multi-year analyses.

## Governance and audit
- AI-created scenarios are named, tagged (`aiGenerated`), and traced to
  their starting scenario; every creation, analysis, report build, section
  regeneration, and section approval writes an audit-trail entry. Proposals
  apply only whitelisted input fields; non-whitelisted changes are skipped
  and disclosed. No AI text is ever stored as a tax amount.

## Acceptance results
24/24 automated acceptance checks pass (scenario-level AI · optimization
workflow · analysis workspace · report builder/editor · governance · audit),
41/41 golden engine tests remain green, all 12 tabs render clean, and the
key scan confirms no API key in any browser-served file.

## Limitations
- 3- and 5-year planning periods are not offered — the engine carries two
  years of statutory parameters (TY2025/TY2026); multi-year analyses use
  the real two-year window.
- Word export is HTML-based (.doc); PDF export uses the browser print
  dialog.
- Report "replace graph" is limited to the built-in chart set; graphs are
  engine-rendered, not AI-generated.
- The /api rate limit is per warm serverless instance; a shared store would
  be needed for strict global limits.
