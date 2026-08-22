# Engine Capability Matrix

<!-- GENERATED FILE — edit capabilities/registry.json and run
     python scripts/build_capability_matrix.py  — do not edit by hand. -->

Two calculation engines live in this repository with deliberately
different scopes. Every result must identify which engine and ruleset
produced it, and nothing may imply an engine supports a capability this
matrix marks otherwise. Status meanings:

- **calculated** — modeled with real computation.
- *approximated* — modeled with a documented simplification (see notes).
- `blocked (diagnostic)` — detected from inputs and answered with a
  blocking, review-forcing diagnostic instead of a number.
- not modeled / not detected — out of scope and not detectable; callers
  and UIs must not imply support.

## Tax Advisory Pro workbench engine (JavaScript)

- **Language:** JavaScript  
- **Code:** `src/01-constants.js`, `src/02-engine.js`, `src/03-scenario.js`  
- **Version identity:** ENGINE_VERSION / RULES_VERSION in src/01-constants.js  
- **Tax years:** 2025 (enacted (Rev. Proc. 2024-40 et al.)), 2026 (enacted (Rev. Proc. 2025-32, Notice 2025-67))  
- **Filing statuses:** single, married_filing_jointly, married_filing_separately, head_of_household

| Capability | Status | Notes |
|---|---|---|
| Ordinary income tax | **calculated** | Progressive brackets per filing status; formula method (no tax-table lookup). |
| Capital gains & qualified dividends | **calculated** | ST/LT netting, Sec. 1211(b) loss limit, 0/15/20% stacking; only net LT gain plus qualified dividends reach the preferential bands. |
| Net investment income tax | **calculated** | 3.8% on min(net investment income, MAGI excess); Sec. 1411 activity classification per passthrough entity with review flags when facts are insufficient. |
| Self-employment tax | **calculated** | Schedule C SE tax with the W-2 Social Security wage-base coordination; S-corp payroll FICA modeled per entity. |
| QBI deduction (Sec. 199A) | **calculated** | Sec. 199A with SSTB phase-out, W-2/UBIA limits, aggregation, prior negative-QBI carryforward in and carryforward-out reporting; entity figures derivable from linked Schedule C / S-corp entities. |
| Retirement-plan calculations | **calculated** | Solo 401(k), SEP-IRA, and defined-benefit design with limits; S-corp employer-plan capacity reported but never double-deducted at the shareholder level. |
| IRA & self-employed health insurance | **calculated** | IRA deduction with active-participant MAGI phase-outs; self-employed health insurance with the earned-income cap; each provision uses its own MAGI variant. |
| Itemized deductions | **calculated** | SALT cap with the TY2026 phase-down and income-vs-sales-tax election, mortgage interest (acquisition-debt limit NOT modeled), charitable with AGI caps and the TY2026 0.5% floor, medical 7.5% floor, TY2026 Sec. 68-style 2/37 overall limitation. |
| Credits | **calculated** | Nonrefundable CTC with the per-$1,000 phase-out; user-entered 'other credits' pass through uncalculated. |
| Alternative minimum tax | not modeled / not detected | Alternative minimum tax is not modeled and not detected. |
| Additional Medicare tax (0.9%) | **calculated** | 0.9% on wages/SE earnings over the threshold. |
| Estimated-tax safe harbor | not modeled / not detected | Sec. 6654 safe harbors and penalties are not modeled. |
| State calculations | not modeled / not detected | No state or local return computation; state taxes enter only as itemized-deduction inputs. |
| Trust & estate calculations | not modeled / not detected | No Form 1041, trust, estate, or K-1 fiduciary modeling. |
| Carryforwards | *approximated* | Capital-loss and negative-QBI carryforward amounts are computed and reported for the year, but no multi-year carryforward ledger is maintained. |
| Five-year projections | not modeled / not detected | Two-year planning (TY2025 + TY2026) only; no five-year projection. |
| Reconciliation coverage | *approximated* | 41 golden regression tests and an in-app audit trail; no machine-readable per-calculation reconciliation gate. |

**Known limitations**

- Floating-point arithmetic (display rounding only, no Decimal); differences vs the Python engine bounded by the cross-engine contract tolerances.
- Mortgage acquisition-debt limit not modeled.
- No AMT, no estimated-tax safe harbor, no state returns.
- Results carry ENGINE_VERSION/RULES_VERSION but there is no immutable calculation snapshot store.

## ai_tax deterministic engine (Python)

- **Language:** Python  
- **Code:** `ai_tax/engine.py`, `ai_tax/money.py`, `ai_tax/rulesets/`  
- **Version identity:** ai_tax.ENGINE_VERSION (engine-0.1.0); per-year ruleset versions pinned on every calculation  
- **Tax years:** 2025 (enacted), 2026 (provisional projection), 2027 (provisional projection), 2028 (provisional projection), 2029 (provisional projection), 2030 (provisional projection)  
- **Filing statuses:** single, married_filing_jointly, married_filing_separately, head_of_household

| Capability | Status | Notes |
|---|---|---|
| Ordinary income tax | **calculated** | Progressive brackets; formula method with ENG-TABLE-001 disclosure under $100,000 taxable. |
| Capital gains & qualified dividends | **calculated** | Current-year ST/LT netting, Sec. 1211(b) limit, 0/15/20% stacking via the QDCG worksheet; min(stacked, all-ordinary) safeguard. |
| Net investment income tax | **calculated** | 3.8% on min(interest + dividends + allowed capital gain, MAGI excess). |
| Self-employment tax | `blocked (diagnostic)` | Any self-employment income produces a blocking, review-forcing diagnostic; SE tax and QBI are not computed. Diagnostics: `UNSUP-SE-001`. |
| QBI deduction (Sec. 199A) | `blocked (diagnostic)` | Not modeled; blocked together with self-employment income. Diagnostics: `UNSUP-SE-001`. |
| Retirement-plan calculations | *approximated* | Pre-tax 401(k) deferral modeled as an adjustment with limit + catch-up caps (ENG-401K-001 when exceeded); no employer-plan design. |
| IRA & self-employed health insurance | *approximated* | Traditional IRA deduction capped at the limit; active-participant MAGI phase-outs NOT modeled. SEHI not modeled. Diagnostics: `ENG-IRA-001`. |
| Itemized deductions | *approximated* | SALT cap with phase-down, mortgage (no acquisition-debt limit), charitable at face value with a review warning above 60% of AGI (no cap/carryover), medical 7.5% floor. No Sec. 68-style overall limitation. Diagnostics: `ENG-CHAR-001`. |
| Credits | **calculated** | Nonrefundable CTC/ODC with phase-out; refundable additional CTC not modeled (disclosed). Diagnostics: `ENG-ACTC-001`. |
| Alternative minimum tax | not modeled / not detected | Documented out of scope in docs/UNSUPPORTED.md. |
| Additional Medicare tax (0.9%) | not modeled / not detected | Documented out of scope; NIIT is modeled, Additional Medicare is not. |
| Estimated-tax safe harbor | not modeled / not detected | Estimated-tax penalties and safe harbors not modeled. |
| State calculations | not modeled / not detected | SALT modeled only as an itemized-deduction input. |
| Trust & estate calculations | not modeled / not detected | Trusts, estates, entities, K-1s out of scope. |
| Carryforwards | `blocked (diagnostic)` | Net capital loss beyond the annual limit triggers a review-forcing diagnostic; no carryforward ledger. Diagnostics: `ENG-CLCF-001`. |
| Five-year projections | **calculated** | projection.py: explicit per-field methods (hold/growth/explicit), provenance, REC-YOY roll-forward reconciliation. |
| Reconciliation coverage | **calculated** | Machine-readable checks computed inside the engine (REC-*), again for scenario deltas (REC-DELTA), projections (REC-YOY), and the Excel workbook (REC-XLSX); failed material checks block 'final' status. |

**Known limitations**

- TY2026+ parameters are provisional projections generated before the applicable revenue procedure; every provisional-year calculation carries RULES-PROV-001 and forces review.
- Bounded 1040 scope per docs/UNSUPPORTED.md; unsupported-but-detectable situations block rather than approximate.
- JSON-file store; production persistence is a documented follow-up behind the existing narrow interface.

## Cross-engine contract

Canonical shared-scope cases live in `contract/cases.json` and run through both
engines in `tests/test_cross_engine_contract.py`. Shared scope compared on canonical inputs: total income, AGI, deduction, taxable income, ordinary/preferential split, ordinary tax, regular tax, credits, NIIT, total federal tax, payments, balance due/refund, effective rate (total tax / AGI on both sides), marginal ordinary rate. TY2026 differences are parameter-level (enacted vs provisional projection) and bounded; releasing an enacted-sourced us-federal-2026-v2 ruleset tightens the contract to strict.

Tolerances: enacted years ±$5 / ±0.005
rate (marginal rate exact); provisional years ±$250
/ ±0.02 on parameter-sensitive metrics only.
