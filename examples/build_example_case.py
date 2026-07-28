"""Worked example: one approved base case, three scenarios, five-year audit workbook.

Run: python examples/build_example_case.py
Outputs to examples/output/: the case store, canonical JSON export, and the
permanent Excel audit package.

This runs entirely through ordinary application services — no LLM involved —
demonstrating that the validated base-year workflow works without AI.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from ai_tax.rulesets import DEFAULT_REGISTRY
from ai_tax.agent.tools import AgentToolkit, ToolContext
from ai_tax.schemas import (
    AdjustmentInputs,
    CaseState,
    FieldProjection,
    FilingStatus,
    Household,
    IncomeInputs,
    InputClass,
    ItemizedInputs,
    PaymentInputs,
    ProjectionMethod,
    ProjectionPolicy,
    Provenance,
    ReviewState,
    SourceType,
    YearInputs,
)
from ai_tax.services import CalculationService, compare_scenarios
from ai_tax.store import CaseStore

OUT = Path(__file__).resolve().parent / "output"


def user_prov(path: str) -> tuple[str, Provenance]:
    return path, Provenance(
        source_type=SourceType.USER_ENTRY, input_class=InputClass.CURRENT_YEAR_ESTIMATE,
        confidence="exact", entered_by="user-nasi", entered_at="2026-07-28T09:00:00Z",
        validation_status="validated")


def main() -> None:
    shutil.rmtree(OUT, ignore_errors=True)
    store = CaseStore(OUT / "store")
    calc = CalculationService(store, DEFAULT_REGISTRY)
    scenarios = calc.scenarios

    # 1. Base case: married couple, 58/57, one child in college (other dependent),
    #    W-2 income plus a taxable brokerage account. Base year 2025, horizon 2025-2029.
    case_id = store.create_case("user-nasi", "case_example")
    household = Household(
        filing_status=FilingStatus.MARRIED_FILING_JOINTLY,
        taxpayer_age_at_base_year_end=58, spouse_age_at_base_year_end=57,
        ctc_qualifying_children=0, other_dependents=1)
    base_inputs = YearInputs(
        tax_year=2025,
        income=IncomeInputs(wages="240000", taxable_interest="6000",
                            ordinary_dividends="14000", qualified_dividends="12000",
                            long_term_capital_gain="18000"),
        adjustments=AdjustmentInputs(pretax_401k_contribution="31000"),
        itemized=ItemizedInputs(state_local_taxes_paid="22000", mortgage_interest="9500",
                                charitable_cash="8000"),
        payments=PaymentInputs(federal_withholding="41000"))
    base_inputs.elections.itemize_deductions = True
    policy = ProjectionPolicy(
        base_year=2025, horizon_years=5,
        fields=[
            FieldProjection(path="income.wages", method=ProjectionMethod.GROWTH_RATE,
                            annual_rate="0.03", note="assumed 3% salary growth"),
            FieldProjection(path="payments.federal_withholding",
                            method=ProjectionMethod.GROWTH_RATE, annual_rate="0.03"),
            FieldProjection(path="income.long_term_capital_gain",
                            method=ProjectionMethod.FIXED,
                            note="planned annual harvesting kept at base level"),
        ],
        default_method=ProjectionMethod.COPIED_FROM_PRIOR_YEAR)
    provenance = dict(user_prov(f"years.2025.{p}") for p in [
        "income.wages", "income.taxable_interest", "income.ordinary_dividends",
        "income.qualified_dividends", "income.long_term_capital_gain",
        "adjustments.pretax_401k_contribution", "itemized.state_local_taxes_paid",
        "itemized.mortgage_interest", "itemized.charitable_cash",
        "payments.federal_withholding", "elections.itemize_deductions"])

    base = store.create_base_version(case_id, household, base_inputs, policy,
                                     provenance, "user-nasi")
    version, diags = store.validate_base(case_id, base.version_id, "user-nasi")
    print(f"base {base.version_id}: {version.state.value}, {len(diags)} diagnostics")

    base_calc = calc.run_for_base(case_id, base.version_id, "user-nasi", "idem-base")
    print(f"base calculation {base_calc.calculation_id}: "
          f"recon={base_calc.reconciliation_status} review={base_calc.review_status} "
          f"provisional={base_calc.provisional_years}")
    store.transition_base(case_id, base.version_id, CaseState.READY_FOR_REVIEW, "user-nasi")
    store.approve_base(case_id, base.version_id, "reviewer-cpa")
    for rec in store.list_reviews(case_id):
        if rec.state == ReviewState.PENDING:
            store.resolve_review(case_id, rec.review_id, "reviewer-cpa", ReviewState.APPROVED,
                                 "Provisional 2026-2029 rulesets acknowledged for planning use.")

    # 2. Three scenarios, each an explicit override patch on the approved base.
    def build(name, rationale, patch, key):
        s = scenarios.create_scenario(case_id, base.version_id, name, rationale, "user-nasi")
        s = scenarios.apply_overrides(s, patch, "user-nasi", key)
        result = calc.run_for_scenario(case_id, s.scenario_id, "user-nasi", f"{key}-calc")
        print(f"scenario '{name}' ({s.scenario_id}@v{s.version}): "
              f"recon={result.reconciliation_status}")
        return result

    roth = build(
        "Roth conversion ladder", "Convert 80k/yr in 2026-2028 before RMD age",
        [{"path": f"years.{y}.income.ira_conversion", "new_value": "80000",
          "old_value": "0", "reason": "Roth conversion ladder"} for y in (2026, 2027, 2028)],
        "idem-roth")
    harvest = build(
        "Capital gain deferral", "Stop annual harvesting from 2026 on",
        [{"path": f"years.{y}.income.long_term_capital_gain", "new_value": "0",
          "old_value": "18000", "reason": "defer gains"} for y in (2026, 2027, 2028, 2029)],
        "idem-harvest")
    giving = build(
        "Charitable bunching", "Bunch 3 years of gifts into 2026, standard deduction after",
        [{"path": "years.2026.itemized.charitable_cash", "new_value": "24000",
          "old_value": "8000", "reason": "bunch 2026-2028 gifts"},
         {"path": "years.2027.itemized.charitable_cash", "new_value": "0",
          "old_value": "8000", "reason": "gifts bunched into 2026"},
         {"path": "years.2028.itemized.charitable_cash", "new_value": "0",
          "old_value": "8000", "reason": "gifts bunched into 2026"},
         {"path": "years.2027.elections.itemize_deductions", "new_value": False,
          "old_value": "True", "reason": "standard deduction beats itemized in off year"},
         {"path": "years.2028.elections.itemize_deductions", "new_value": False,
          "old_value": "True", "reason": "standard deduction beats itemized in off year"}],
        "idem-giving")

    # 3. Comparison + permanent audit package + export, via the agent toolkit
    #    (same code path the agent uses).
    toolkit = AgentToolkit(store, DEFAULT_REGISTRY, OUT)
    ctx = ToolContext(actor="user-nasi", roles={"analyst", "planner"},
                      tenant_cases={case_id})
    calc_ids = [base_calc.calculation_id, roth.calculation_id,
                harvest.calculation_id, giving.calculation_id]
    cmp_ = compare_scenarios(store, calc_ids)
    print("cumulative 5-yr total-tax delta vs base:",
          dict(zip([c["label"] for c in cmp_["columns"]],
                   cmp_["cumulative_total_tax_delta_vs_baseline"])))
    pkg = toolkit.dispatch(ctx, "generate_excel_audit_package", {
        "case_id": case_id, "calculation_ids": calc_ids,
        "confirmed": True, "idempotency_key": "idem-package"})
    print("audit package:", pkg["result"]["package_file"], pkg["result"]["sha256"][:23])
    exp = toolkit.dispatch(ctx, "export_case", {"case_id": case_id, "format": "json"})
    print("export:", exp["result"]["export_file"])


if __name__ == "__main__":
    main()
