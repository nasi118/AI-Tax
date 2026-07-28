"""Golden tax cases with hand-computed expected values (2025 enacted ruleset)."""
from decimal import Decimal

import pytest

from ai_tax.engine import calculate, calculate_year
from ai_tax.money import d
from ai_tax.rulesets import DEFAULT_REGISTRY
from ai_tax.schemas import Severity

from .conftest import mfj_household, single_household, year_inputs

RS_2025 = DEFAULT_REGISTRY.get("us-federal-2025-v1")


def run(household, yi):
    return calculate_year(yi, household, RS_2025)


def assert_reconciled(yr):
    failed = [c.check_id for c in yr.reconciliation if c.status == "failed"]
    assert not failed, failed


def test_zero_income():
    yr = run(single_household(), year_inputs())
    assert yr.summary["total_tax"] == 0
    assert yr.summary["taxable_income"] == 0
    assert yr.summary["refund"] == 0
    assert_reconciled(yr)


def test_wage_only_single():
    # 60,000 - 15,750 std = 44,250 TI
    # 10%*11,925 + 12%*(44,250-11,925) = 1,192.50 + 3,879.00 = 5,071.50 -> 5072
    yr = run(single_household(), year_inputs(income={"wages": "60000"}))
    assert yr.summary["taxable_income"] == 44250
    assert yr.summary["total_tax"] == 5072
    assert yr.summary["marginal_ordinary_rate"] == d("0.12")
    assert_reconciled(yr)


def test_bracket_boundary_exact():
    # Taxable income exactly at the 10% ceiling: wages 27,675 - 15,750 = 11,925
    yr = run(single_household(), year_inputs(income={"wages": "27675"}))
    assert yr.summary["taxable_income"] == 11925
    assert yr.summary["regular_tax"] == 1193  # 1,192.50 rounds half-up
    assert yr.summary["marginal_ordinary_rate"] == d("0.10")


def test_mfj_with_children_standard_deduction():
    # AGI 198,000; TI 166,500; ordinary part 151,500
    # tax = 2,385 + 8,772 + 22%*54,550 = 23,158 + 15%*15,000 = 25,408
    # CTC 2 * 2,200 = 4,400 -> total 21,008
    yr = run(mfj_household(children=2), year_inputs(
        income={"wages": "180000", "taxable_interest": "2000",
                "ordinary_dividends": "6000", "qualified_dividends": "5000",
                "long_term_capital_gain": "10000"},
        payments={"federal_withholding": "24000"}))
    assert yr.summary["regular_tax"] == 25408
    assert yr.summary["child_tax_credit"] == 4400
    assert yr.summary["total_tax"] == 21008
    assert yr.summary["refund"] == 2992
    assert_reconciled(yr)


def test_ltcg_zero_bracket():
    # wages 30,000, LTCG 20,000 -> TI 34,250; all LTCG inside the 0% ceiling
    yr = run(single_household(), year_inputs(
        income={"wages": "30000", "long_term_capital_gain": "20000"}))
    assert yr.line("QDCGT.L20").value == 20000  # all at 0%
    assert yr.summary["regular_tax"] == 1472    # tax on 14,250 ordinary only


def test_itemized_vs_standard():
    itemized = year_inputs(income={"wages": "300000"},
                           itemized={"state_local_taxes_paid": "30000",
                                     "mortgage_interest": "15000",
                                     "charitable_cash": "10000"})
    itemized.elections.itemize_deductions = True
    yr = run(mfj_household(), itemized)
    assert yr.line("SCHA.L17").value == 55000  # SALT under 40k cap + 15k + 10k
    assert yr.summary["deduction"] == 55000
    std = run(mfj_household(), year_inputs(income={"wages": "300000"}))
    assert std.summary["deduction"] == 31500
    assert yr.summary["total_tax"] < std.summary["total_tax"]


def test_salt_phasedown_above_500k_magi():
    yi = year_inputs(income={"wages": "700000"},
                     itemized={"state_local_taxes_paid": "45000"})
    yi.elections.itemize_deductions = True
    yr = run(mfj_household(), yi)
    # cap = max(10,000, 40,000 - 30%*(700,000-500,000)) = 10,000
    assert yr.line("SCHA.L7").value == 10000


def test_ctc_phaseout_boundary():
    # excess exactly 31,000 -> 31 increments of $50 -> reduction 1,550
    exact = run(mfj_household(children=1), year_inputs(income={"wages": "431000"}))
    assert exact.summary["agi"] == 431000
    assert exact.summary["child_tax_credit"] == 2200 - 1550
    # one dollar more -> fraction of a 1,000 counts as a full increment
    over = run(mfj_household(children=1), year_inputs(income={"wages": "431001"}))
    assert over.summary["child_tax_credit"] == 2200 - 1600
    # at the threshold -> no reduction
    at = run(mfj_household(children=1), year_inputs(income={"wages": "400000"}))
    assert at.summary["child_tax_credit"] == 2200


def test_niit_over_threshold():
    yr = run(single_household(), year_inputs(
        income={"wages": "190000", "taxable_interest": "20000"}))
    # MAGI 210,000; NII 20,000; base min(20,000, 10,000) -> 3.8% = 380
    assert yr.summary["niit"] == 380
    assert_reconciled(yr)


def test_capital_loss_limited_and_flagged():
    yr = run(single_household(), year_inputs(
        income={"wages": "80000", "long_term_capital_gain": "-10000"}))
    assert yr.line("F1040.L7").value == -3000
    codes = [g.code for g in yr.diagnostics]
    assert "ENG-CLCF-001" in codes
    assert any(g.requires_review for g in yr.diagnostics)


def test_self_employment_income_unsupported():
    yr = run(single_household(), year_inputs(income={"wages": "0", "self_employment_income": "40000"}))
    diag = next(g for g in yr.diagnostics if g.code == "UNSUP-SE-001")
    assert diag.severity == Severity.ERROR and diag.requires_review


def test_excess_ira_contribution_flagged_and_capped():
    yr = run(single_household(age=40), year_inputs(
        income={"wages": "100000"},
        adjustments={"traditional_ira_contribution": "9000"}))
    assert yr.line("SCH1.L20").value == 7000
    assert any(g.code == "ENG-IRA-001" for g in yr.diagnostics)


def test_negative_wages_rejected():
    yr = run(single_household(), year_inputs(income={"wages": "-5"}))
    assert any(g.code == "VAL-NEG-001" for g in yr.diagnostics)


def test_determinism_identical_hashes():
    hh = mfj_household(children=1)
    kwargs = dict(
        calculation_id="calc_x", case_id="case_x", target_id="base_x", target_kind="base",
        household=hh, years_inputs={2025: year_inputs(income={"wages": "123456"})},
        pinned_rulesets={2025: "us-federal-2025-v1"}, registry=DEFAULT_REGISTRY,
        calculated_at="2026-07-28T00:00:00Z")
    a, b = calculate(**kwargs), calculate(**kwargs)
    assert a.result_hash() == b.result_hash()
    assert a.input_snapshot_hash == b.input_snapshot_hash


def test_provisional_year_marks_review_required():
    result = calculate(
        calculation_id="calc_y", case_id="case_y", target_id="base_y", target_kind="base",
        household=single_household(),
        years_inputs={2026: year_inputs(2026, income={"wages": "50000"})},
        pinned_rulesets={2026: "us-federal-2026-v1"}, registry=DEFAULT_REGISTRY,
        calculated_at="2026-07-28T00:00:00Z")
    assert result.provisional_years == [2026]
    assert result.review_status == "required"
    assert any(g.code == "RULES-PROV-001" for g in result.years[2026].diagnostics)


def test_missing_ruleset_pin_rejected():
    from ai_tax.engine import EngineError
    with pytest.raises(EngineError, match="no ruleset pinned"):
        calculate(
            calculation_id="c", case_id="c", target_id="t", target_kind="base",
            household=single_household(),
            years_inputs={2025: year_inputs(), 2026: year_inputs(2026)},
            pinned_rulesets={2025: "us-federal-2025-v1"}, registry=DEFAULT_REGISTRY,
            calculated_at="2026-07-28T00:00:00Z")
