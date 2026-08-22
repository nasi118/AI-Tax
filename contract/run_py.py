"""Cross-engine contract harness — Python side.

Maps each canonical case from contract/cases.json onto the ai_tax input
schemas, runs ai_tax.engine.calculate with the default ruleset registry, and
emits the same normalized metric set as contract/run_js.mjs.

The normalized metrics are drawn from the engine's own line items and summary
— nothing is recomputed here except the two derived comparison quantities
(preferential-band ordinary tax via the engine's public tax_from_brackets,
and the AGI-denominated effective rate the contract defines for both sides).
This file must never hardcode expected values.
"""
from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path

from ai_tax.engine import calculate, tax_from_brackets
from ai_tax.money import d
from ai_tax.rulesets import DEFAULT_REGISTRY
from ai_tax.schemas import (
    AdjustmentInputs,
    Elections,
    FilingStatus,
    Household,
    IncomeInputs,
    ItemizedInputs,
    PaymentInputs,
    YearInputs,
)

RULESET_BY_YEAR = {2025: "us-federal-2025-v1", 2026: "us-federal-2026-v1"}


def run_case(case: dict) -> dict:
    year = case["year"]
    inc = case.get("income", {})
    itz = case.get("itemized", {})
    pay = case.get("payments", {})
    household = Household(
        filing_status=FilingStatus(case["filing_status"]),
        taxpayer_age_at_base_year_end=case.get("taxpayer_age", 45),
        spouse_age_at_base_year_end=case.get("spouse_age"),
        ctc_qualifying_children=case.get("ctc_children", 0),
        other_dependents=0,
    )
    yi = YearInputs(
        tax_year=year,
        income=IncomeInputs(**{k: d(str(v)) for k, v in inc.items()}),
        adjustments=AdjustmentInputs(),
        itemized=ItemizedInputs(**{k: d(str(v)) for k, v in itz.items()}),
        payments=PaymentInputs(**{k: d(str(v)) for k, v in pay.items()}),
        elections=Elections(itemize_deductions=bool(case.get("itemize"))),
    )
    result = calculate(
        calculation_id=f"contract-{case['id']}",
        case_id="contract",
        target_id="contract",
        target_kind="base",
        household=household,
        years_inputs={year: yi},
        pinned_rulesets={year: RULESET_BY_YEAR[year]},
        registry=DEFAULT_REGISTRY,
        calculated_at="1970-01-01T00:00:00Z",
    )
    yr = result.years[year]
    s = yr.summary
    line = lambda lid: yr.line(lid).value
    rs = DEFAULT_REGISTRY.get(RULESET_BY_YEAR[year])
    ordinary_part = line("QDCGT.L7")
    ordinary_tax = tax_from_brackets(ordinary_part, rs, household.filing_status)
    agi = s["agi"]
    return {
        "total_income": float(s["total_income"]),
        "agi": float(agi),
        "deduction_used": float(s["deduction"]),
        "taxable_income": float(s["taxable_income"]),
        "ordinary_taxable": float(ordinary_part),
        "preferential_income": float(line("QDCGT.L6")),
        "ordinary_tax": float(ordinary_tax),
        "regular_tax": float(s["regular_tax"]),
        "credits_applied": float(s["child_tax_credit"]),
        "niit": float(s["niit"]),
        "total_federal_tax": float(s["total_tax"]),
        "total_payments": float(s["total_payments"]),
        "balance_due": float(s["balance_due"]),
        "refund": float(s["refund"]),
        "effective_rate": float((s["total_tax"] / agi) if agi > 0 else Decimal(0)),
        "marginal_ordinary_rate": float(s["marginal_ordinary_rate"]),
        "reconciliation_status": result.reconciliation_status,
    }


def main() -> None:
    cases_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("cases.json")
    spec = json.loads(cases_path.read_text())
    results = {c["id"]: run_case(c) for c in spec["cases"]}
    from ai_tax import ENGINE_VERSION

    json.dump(
        {"engine": f"ai_tax {ENGINE_VERSION}",
         "rules": {y: r for y, r in RULESET_BY_YEAR.items()},
         "results": results},
        sys.stdout, indent=2, default=str)


if __name__ == "__main__":
    main()
