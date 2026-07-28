"""Deterministic federal tax calculation engine.

    calculate(inputs, pinned_rulesets, engine_version) -> CalculationResult

The engine is the sole calculation authority. It is a pure function of
(canonical inputs, pinned ruleset versions, engine version): identical inputs
always produce identical results. Timestamps and IDs are supplied by the
caller so nothing here reads clocks or randomness.

Every calculated line carries a stable line ID, formula text, upstream line
IDs, ruleset parameter IDs, and source input paths, so results reconcile and
audit end-to-end. Unsupported situations emit diagnostics that force human
review — they are never silently approximated.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_CEILING

from . import ENGINE_VERSION, SCHEMA_VERSION
from .money import ZERO, clamp_floor_zero, d, round_whole_dollar
from .rulesets import Ruleset, RulesetRegistry
from .schemas import (
    CalculationResult,
    Diagnostic,
    FilingStatus,
    Household,
    LineItem,
    ReconciliationCheck,
    Severity,
    YearInputs,
    YearResult,
    content_hash,
)


class EngineError(Exception):
    pass


# ---------------------------------------------------------------------------
# Input validation (also used by the base-case lifecycle)
# ---------------------------------------------------------------------------

NON_NEGATIVE_INCOME = [
    "wages", "taxable_interest", "ordinary_dividends", "qualified_dividends",
    "ira_distribution", "ira_conversion", "other_income",
]


def validate_inputs(household: Household, years: dict[int, YearInputs]) -> list[Diagnostic]:
    diags: list[Diagnostic] = []
    for year, yi in sorted(years.items()):
        if yi.tax_year != year:
            diags.append(Diagnostic(
                code="VAL-YEAR-001", severity=Severity.ERROR,
                message=f"YearInputs tagged {yi.tax_year} stored under year {year}",
                requires_review=True))
        for field in NON_NEGATIVE_INCOME:
            if getattr(yi.income, field) < ZERO:
                diags.append(Diagnostic(
                    code="VAL-NEG-001", severity=Severity.ERROR,
                    message=f"{year}: income.{field} must not be negative",
                    requires_review=True))
        if yi.income.qualified_dividends > yi.income.ordinary_dividends:
            diags.append(Diagnostic(
                code="VAL-DIV-001", severity=Severity.ERROR,
                message=f"{year}: qualified dividends exceed ordinary dividends",
                requires_review=True))
        if yi.income.self_employment_income != ZERO:
            diags.append(Diagnostic(
                code="UNSUP-SE-001", severity=Severity.ERROR,
                message=f"{year}: self-employment income is not supported by this "
                        "engine version (SE tax, QBI); route to human review",
                requires_review=True))
        for field in ("federal_withholding", "estimated_payments"):
            if getattr(yi.payments, field) < ZERO:
                diags.append(Diagnostic(
                    code="VAL-PAY-001", severity=Severity.ERROR,
                    message=f"{year}: payments.{field} must not be negative",
                    requires_review=True))
    if household.filing_status == FilingStatus.MARRIED_FILING_JOINTLY and household.spouse_age_at_base_year_end is None:
        diags.append(Diagnostic(
            code="VAL-HH-001", severity=Severity.WARNING,
            message="MFJ filing status without spouse age; 65+ additional standard "
                    "deduction for spouse cannot be evaluated"))
    return diags


# ---------------------------------------------------------------------------
# Bracket math
# ---------------------------------------------------------------------------

def tax_from_brackets(taxable: Decimal, rs: Ruleset, fs: FilingStatus) -> Decimal:
    """Progressive tax on ordinary income. Unrounded (rounded by caller).

    Note: for taxable income under the tax-table range this computes the exact
    formula value rather than the IRS tax-table lookup; differences are within
    the table's $50 band and are disclosed via diagnostic ENG-TABLE-001.
    """
    tax = ZERO
    lower = ZERO
    for upper, rate in rs.brackets(fs):
        if upper is None or taxable <= upper:
            tax += (taxable - lower) * rate
            return tax
        tax += (upper - lower) * rate
        lower = upper
    return tax  # pragma: no cover


def marginal_ordinary_rate(taxable: Decimal, rs: Ruleset, fs: FilingStatus) -> Decimal:
    for upper, rate in rs.brackets(fs):
        if upper is None or taxable <= upper:
            return rate
    return rs.brackets(fs)[-1][1]  # pragma: no cover


# ---------------------------------------------------------------------------
# One-year calculation
# ---------------------------------------------------------------------------

def calculate_year(yi: YearInputs, household: Household, rs: Ruleset) -> YearResult:
    fs = household.filing_status
    year = yi.tax_year
    trace: list[str] = []
    diags = validate_inputs(household, {year: yi})
    forms: dict[str, list[LineItem]] = {"F1040": [], "SCH1": [], "SCHA": [], "SCHD": [], "S8812": [], "F8960": []}
    ws: dict[str, list[LineItem]] = {"QDCGT": []}

    def add(form: str, line_id: str, label: str, value: Decimal, formula: str,
            upstream: list[str] | None = None, params: list[str] | None = None,
            sources: list[str] | None = None, sheet: str | None = None) -> Decimal:
        value = round_whole_dollar(value)
        item = LineItem(
            line_id=line_id, label=label, value=value, formula=formula,
            upstream_line_ids=upstream or [], parameter_ids=params or [],
            source_input_ids=sources or [], location=sheet or form)
        (ws if form in ws else forms)[form].append(item)
        trace.append(f"{line_id} = {value} ({formula})")
        return value

    inc = yi.income
    src = lambda f: [f"years.{year}.{f}"]

    # --- Schedule D (simplified: current-year netting, loss limit, no carryforward)
    st = add("SCHD", "SCHD.L7", "Net short-term capital gain/(loss)", inc.short_term_capital_gain,
             "input", sources=src("income.short_term_capital_gain"))
    lt = add("SCHD", "SCHD.L15", "Net long-term capital gain/(loss)", inc.long_term_capital_gain,
             "input", sources=src("income.long_term_capital_gain"))
    combined = add("SCHD", "SCHD.L16", "Combined net gain/(loss)", st + lt,
                   "SCHD.L7 + SCHD.L15", upstream=["SCHD.L7", "SCHD.L15"])
    loss_limit = rs.amount("capital_loss_limit", fs)
    if combined < ZERO:
        allowed = max(combined, -loss_limit)
        if combined < -loss_limit:
            diags.append(Diagnostic(
                code="ENG-CLCF-001", severity=Severity.WARNING,
                message=f"{year}: net capital loss {combined} exceeds the {loss_limit} "
                        "limit; carryforward tracking is not modeled in this engine version",
                related_line_ids=["SCHD.L21"], requires_review=True))
    else:
        allowed = combined
    cap_gain_1040 = add("SCHD", "SCHD.L21", "Allowed capital gain/(loss) to Form 1040",
                        allowed, f"max(SCHD.L16, -{loss_limit})", upstream=["SCHD.L16"],
                        params=[rs.param_id("capital_loss_limit", fs)])

    # --- Income (Form 1040)
    l1 = add("F1040", "F1040.L1", "Wages", inc.wages, "input", sources=src("income.wages"))
    l2b = add("F1040", "F1040.L2b", "Taxable interest", inc.taxable_interest, "input",
              sources=src("income.taxable_interest"))
    add("F1040", "F1040.L3a", "Qualified dividends", inc.qualified_dividends, "input",
        sources=src("income.qualified_dividends"))
    l3b = add("F1040", "F1040.L3b", "Ordinary dividends", inc.ordinary_dividends, "input",
              sources=src("income.ordinary_dividends"))
    l4b = add("F1040", "F1040.L4b", "Taxable IRA distributions (incl. Roth conversion)",
              inc.ira_distribution + inc.ira_conversion,
              "income.ira_distribution + income.ira_conversion",
              sources=src("income.ira_distribution") + src("income.ira_conversion"))
    l7 = add("F1040", "F1040.L7", "Capital gain/(loss)", cap_gain_1040, "SCHD.L21",
             upstream=["SCHD.L21"])
    l8 = add("SCH1", "SCH1.L10", "Other income (Schedule 1)",
             inc.other_income + inc.self_employment_income,
             "income.other_income + income.self_employment_income",
             sources=src("income.other_income") + src("income.self_employment_income"))
    add("F1040", "F1040.L8", "Other income from Schedule 1", l8, "SCH1.L10", upstream=["SCH1.L10"])
    total_income = add("F1040", "F1040.L9", "Total income",
                       l1 + l2b + l3b + l4b + l7 + l8,
                       "L1 + L2b + L3b + L4b + L7 + L8",
                       upstream=["F1040.L1", "F1040.L2b", "F1040.L3b", "F1040.L4b", "F1040.L7", "F1040.L8"])

    # --- Adjustments (Schedule 1 Part II)
    ira_limit = rs.amount("ira_contribution_limit")
    if household.taxpayer_age_at_base_year_end >= 50:
        ira_limit += rs.amount("ira_catchup_50")
    ira_claimed = yi.adjustments.traditional_ira_contribution
    ira_ded = min(ira_claimed, ira_limit)
    if ira_claimed > ira_limit:
        diags.append(Diagnostic(
            code="ENG-IRA-001", severity=Severity.ERROR,
            message=f"{year}: IRA contribution {ira_claimed} exceeds limit {ira_limit}; "
                    "deduction capped at the limit — verify the input",
            related_line_ids=["SCH1.L20"], requires_review=True))
    k401_limit = rs.amount("limit_401k")
    if household.taxpayer_age_at_base_year_end >= 50:
        k401_limit += rs.amount("catchup_401k_50")
    k401_claimed = yi.adjustments.pretax_401k_contribution
    k401_ded = min(k401_claimed, k401_limit)
    if k401_claimed > k401_limit:
        diags.append(Diagnostic(
            code="ENG-401K-001", severity=Severity.ERROR,
            message=f"{year}: 401(k) deferral {k401_claimed} exceeds limit {k401_limit}; "
                    "capped — verify the input",
            related_line_ids=["SCH1.L24"], requires_review=True))
    ira_line = add("SCH1", "SCH1.L20", "Traditional IRA deduction", ira_ded,
                   f"min(input, {ira_limit})", params=[rs.param_id("ira_contribution_limit")],
                   sources=src("adjustments.traditional_ira_contribution"))
    k401_line = add("SCH1", "SCH1.L24", "Pre-tax 401(k) deferral (modeled as adjustment)",
                    k401_ded, f"min(input, {k401_limit})", params=[rs.param_id("limit_401k")],
                    sources=src("adjustments.pretax_401k_contribution"))
    adjustments = add("F1040", "F1040.L10", "Adjustments to income", ira_line + k401_line,
                      "SCH1.L20 + SCH1.L24", upstream=["SCH1.L20", "SCH1.L24"])
    agi = add("F1040", "F1040.L11", "Adjusted gross income", total_income - adjustments,
              "L9 - L10", upstream=["F1040.L9", "F1040.L10"])

    # --- Deduction: standard vs itemized (Schedule A)
    salt_cap = rs.amount("salt_cap", fs)
    salt_floor = rs.amount("salt_cap_floor", fs)
    salt_thresh = rs.amount("salt_phasedown_magi_threshold", fs)
    salt_rate = rs.rate("salt_phasedown_rate")
    effective_cap = max(salt_floor, salt_cap - clamp_floor_zero(agi - salt_thresh) * salt_rate)
    salt = add("SCHA", "SCHA.L7", "State and local taxes (capped)",
               min(yi.itemized.state_local_taxes_paid, effective_cap),
               f"min(input, cap {round_whole_dollar(effective_cap)})",
               params=[rs.param_id("salt_cap", fs)], upstream=["F1040.L11"],
               sources=src("itemized.state_local_taxes_paid"))
    mort = add("SCHA", "SCHA.L8e", "Home mortgage interest", yi.itemized.mortgage_interest,
               "input (acquisition-debt limit not modeled)",
               sources=src("itemized.mortgage_interest"))
    char = add("SCHA", "SCHA.L14", "Charitable contributions (cash)", yi.itemized.charitable_cash,
               "input", sources=src("itemized.charitable_cash"))
    if yi.itemized.charitable_cash > agi * d("0.60"):
        diags.append(Diagnostic(
            code="ENG-CHAR-001", severity=Severity.WARNING,
            message=f"{year}: cash charitable contributions exceed 60% of AGI; the AGI "
                    "limitation and carryover are not modeled",
            related_line_ids=["SCHA.L14"], requires_review=True))
    med_floor = rs.rate("medical_agi_floor_rate")
    medical = add("SCHA", "SCHA.L4", "Medical expenses above AGI floor",
                  clamp_floor_zero(yi.itemized.medical_expenses - agi * med_floor),
                  f"max(0, input - {med_floor} * AGI)",
                  params=[rs.param_id("medical_agi_floor_rate")], upstream=["F1040.L11"],
                  sources=src("itemized.medical_expenses"))
    itemized_total = add("SCHA", "SCHA.L17", "Total itemized deductions",
                         salt + mort + char + medical,
                         "SCHA.L4 + L7 + L8e + L14",
                         upstream=["SCHA.L4", "SCHA.L7", "SCHA.L8e", "SCHA.L14"])

    std = rs.amount("standard_deduction", fs)
    extra = rs.amount("additional_std_deduction_65", fs)
    if household.taxpayer_age_at_base_year_end + (year - yi.tax_year) >= 65 or household.taxpayer_age_at_base_year_end >= 65:
        std += extra
    if household.spouse_age_at_base_year_end is not None and household.spouse_age_at_base_year_end >= 65:
        std += extra
    itemizing = yi.elections.itemize_deductions
    deduction_val = itemized_total if itemizing else std
    if itemizing and std > itemized_total:
        diags.append(Diagnostic(
            code="ENG-DED-001", severity=Severity.INFO,
            message=f"{year}: standard deduction {std} exceeds elected itemized "
                    f"{itemized_total}; election retained as entered"))
    elif not itemizing and itemized_total > std:
        diags.append(Diagnostic(
            code="ENG-DED-002", severity=Severity.INFO,
            message=f"{year}: itemized deductions {itemized_total} exceed the standard "
                    f"deduction {std}; consider the itemization election"))
    deduction = add("F1040", "F1040.L12", "Deduction (standard or itemized)", deduction_val,
                    "SCHA.L17 elected" if itemizing else "standard deduction",
                    upstream=["SCHA.L17"] if itemizing else [],
                    params=[] if itemizing else [rs.param_id("standard_deduction", fs)],
                    sources=src("elections.itemize_deductions"))
    taxable = add("F1040", "F1040.L15", "Taxable income",
                  clamp_floor_zero(agi - deduction), "max(0, L11 - L12)",
                  upstream=["F1040.L11", "F1040.L12"])

    # --- Qualified dividends & capital gain tax worksheet (rate stacking)
    net_lt_pref = max(ZERO, min(lt, combined)) if combined > ZERO else ZERO
    pref = min(taxable, inc.qualified_dividends + net_lt_pref)
    ordinary_part = add("QDCGT", "QDCGT.L7", "Taxable income taxed at ordinary rates",
                        taxable - pref, "L15 - preferential income",
                        upstream=["F1040.L15", "F1040.L3a", "SCHD.L21"], sheet="QDCGT")
    add("QDCGT", "QDCGT.L6", "Preferential-rate income (QD + net LTCG)", pref,
        "min(L15, qualified dividends + net LT gain)",
        upstream=["F1040.L15", "F1040.L3a", "SCHD.L15"], sheet="QDCGT")
    tax_ord = tax_from_brackets(ordinary_part, rs, fs)
    zero_top = rs.amount("ltcg_0_top", fs)
    fifteen_top = rs.amount("ltcg_15_top", fs)
    in_zero = clamp_floor_zero(min(zero_top, taxable) - ordinary_part)
    in_fifteen = clamp_floor_zero(min(fifteen_top, taxable) - ordinary_part - in_zero)
    in_twenty = clamp_floor_zero(pref - in_zero - in_fifteen)
    pref_tax = in_fifteen * rs.rate("ltcg_rates", "mid") + in_twenty * rs.rate("ltcg_rates", "top")
    stacked = tax_ord + pref_tax
    all_ordinary = tax_from_brackets(taxable, rs, fs)
    tax_value = min(stacked, all_ordinary)
    add("QDCGT", "QDCGT.L20", "0%-rate amount", in_zero, "min(0% ceiling, L15) - ordinary part",
        params=[rs.param_id("ltcg_0_top", fs)], sheet="QDCGT")
    add("QDCGT", "QDCGT.L21", "15%-rate amount", in_fifteen, "up to 15% ceiling",
        params=[rs.param_id("ltcg_15_top", fs)], sheet="QDCGT")
    add("QDCGT", "QDCGT.L22", "20%-rate amount", in_twenty, "remainder of preferential income",
        sheet="QDCGT")
    tax16 = add("F1040", "F1040.L16", "Tax (QDCGT worksheet)", tax_value,
                "min(bracket tax on ordinary part + preferential-rate tax, bracket tax on all income)",
                upstream=["QDCGT.L7", "QDCGT.L20", "QDCGT.L21", "QDCGT.L22"],
                params=[rs.param_id("ordinary_brackets", fs), rs.param_id("ltcg_rates")])
    if taxable > ZERO and taxable < d(100000):
        diags.append(Diagnostic(
            code="ENG-TABLE-001", severity=Severity.INFO,
            message=f"{year}: tax computed by formula; IRS tax-table lookup for taxable "
                    "income under $100,000 may differ within the table band"))

    # --- Child tax credit (Schedule 8812, nonrefundable model)
    magi = agi  # no foreign-income addbacks modeled
    ctc_base = (rs.amount("ctc_per_child") * household.ctc_qualifying_children
                + rs.amount("odc_per_dependent") * household.other_dependents)
    excess = clamp_floor_zero(magi - rs.amount("ctc_phaseout_threshold", fs))
    increments = (excess / d(1000)).to_integral_value(rounding=ROUND_CEILING)
    reduction = increments * rs.amount("ctc_phaseout_rate_per_1000")
    ctc_allowed = min(clamp_floor_zero(ctc_base - reduction), tax16)
    add("S8812", "S8812.L5", "Credit before phaseout", ctc_base,
        "ctc_per_child * children + odc * other dependents",
        params=[rs.param_id("ctc_per_child"), rs.param_id("odc_per_dependent")],
        sources=["household.ctc_qualifying_children", "household.other_dependents"])
    add("S8812", "S8812.L10", "Phaseout reduction", reduction,
        "50 per 1,000 (or part) of MAGI over threshold",
        params=[rs.param_id("ctc_phaseout_threshold", fs)], upstream=["F1040.L11"])
    ctc = add("S8812", "S8812.L14", "Allowed CTC/ODC (nonrefundable)", ctc_allowed,
              "min(max(0, L5 - L10), F1040.L16)", upstream=["S8812.L5", "S8812.L10", "F1040.L16"])
    if ctc_base > ZERO and ctc_allowed < clamp_floor_zero(ctc_base - reduction):
        diags.append(Diagnostic(
            code="ENG-ACTC-001", severity=Severity.INFO,
            message=f"{year}: credit limited by tax; refundable additional CTC is not modeled"))
    l19 = add("F1040", "F1040.L19", "Child tax credit / credit for other dependents", ctc,
              "S8812.L14", upstream=["S8812.L14"])
    tax_after_credits = add("F1040", "F1040.L22", "Tax after credits",
                            clamp_floor_zero(tax16 - l19), "max(0, L16 - L19)",
                            upstream=["F1040.L16", "F1040.L19"])

    # --- Net investment income tax (Form 8960)
    nii = clamp_floor_zero(l2b + l3b + cap_gain_1040)
    niit_threshold = rs.amount("niit_magi_threshold", fs)
    niit_base = min(nii, clamp_floor_zero(magi - niit_threshold))
    niit = add("F8960", "F8960.L17", "Net investment income tax",
               niit_base * rs.rate("niit_rate"),
               "3.8% * min(net investment income, max(0, MAGI - threshold))",
               params=[rs.param_id("niit_rate"), rs.param_id("niit_magi_threshold", fs)],
               upstream=["F1040.L2b", "F1040.L3b", "SCHD.L21", "F1040.L11"])
    l23 = add("F1040", "F1040.L23", "Other taxes (NIIT)", niit, "F8960.L17", upstream=["F8960.L17"])
    total_tax = add("F1040", "F1040.L24", "Total tax", tax_after_credits + l23,
                    "L22 + L23", upstream=["F1040.L22", "F1040.L23"])

    # --- Payments and balance
    wh = add("F1040", "F1040.L25", "Federal income tax withheld", yi.payments.federal_withholding,
             "input", sources=src("payments.federal_withholding"))
    est = add("F1040", "F1040.L26", "Estimated tax payments", yi.payments.estimated_payments,
              "input", sources=src("payments.estimated_payments"))
    payments = add("F1040", "F1040.L33", "Total payments", wh + est, "L25 + L26",
                   upstream=["F1040.L25", "F1040.L26"])
    balance = total_tax - payments
    if balance >= ZERO:
        add("F1040", "F1040.L37", "Amount you owe", balance, "L24 - L33",
            upstream=["F1040.L24", "F1040.L33"])
        add("F1040", "F1040.L34", "Refund", ZERO, "not applicable", upstream=[])
    else:
        add("F1040", "F1040.L34", "Refund", -balance, "L33 - L24",
            upstream=["F1040.L24", "F1040.L33"])
        add("F1040", "F1040.L37", "Amount you owe", ZERO, "not applicable", upstream=[])

    if rs.is_provisional:
        diags.append(Diagnostic(
            code="RULES-PROV-001", severity=Severity.WARNING,
            message=f"{year}: calculated under PROVISIONAL ruleset {rs.ruleset_id} — "
                    + (rs.provisional_policy or {}).get("uncertainty_warning", ""),
            requires_review=True))

    denom = agi if agi > ZERO else d(1)
    summary = {
        "total_income": total_income,
        "agi": agi,
        "deduction": deduction,
        "taxable_income": taxable,
        "regular_tax": tax16,
        "child_tax_credit": ctc,
        "niit": niit,
        "total_tax": total_tax,
        "total_payments": payments,
        "balance_due": clamp_floor_zero(balance),
        "refund": clamp_floor_zero(-balance),
        "effective_rate": (total_tax / denom).quantize(d("0.0001")),
        "marginal_ordinary_rate": marginal_ordinary_rate(ordinary_part, rs, fs),
    }

    result = YearResult(
        tax_year=year, ruleset_id=rs.ruleset_id, ruleset_status=rs.status,
        summary=summary, forms=forms, worksheets=ws, diagnostics=diags,
        calculation_trace=trace)
    result.reconciliation = run_year_reconciliation(result)
    return result


# ---------------------------------------------------------------------------
# Reconciliation (release gate — recomputed from produced line items)
# ---------------------------------------------------------------------------

def run_year_reconciliation(yr: YearResult) -> list[ReconciliationCheck]:
    L = lambda lid: yr.line(lid).value
    checks: list[ReconciliationCheck] = []

    def check(check_id: str, description: str, expected: Decimal, actual: Decimal,
              lines: list[str], material: bool = True, tolerance: Decimal = ZERO):
        diff = actual - expected
        checks.append(ReconciliationCheck(
            check_id=check_id, description=description,
            status="passed" if abs(diff) <= tolerance else "failed",
            expected=expected, actual=actual, difference=diff,
            tolerance=tolerance, material=material, supporting_line_ids=lines))

    check("REC-INC-001", "Total income equals the sum of income lines",
          L("F1040.L1") + L("F1040.L2b") + L("F1040.L3b") + L("F1040.L4b") + L("F1040.L7") + L("F1040.L8"),
          L("F1040.L9"),
          ["F1040.L1", "F1040.L2b", "F1040.L3b", "F1040.L4b", "F1040.L7", "F1040.L8", "F1040.L9"])
    check("REC-CG-001", "Form 1040 capital gain equals Schedule D allowed amount",
          L("SCHD.L21"), L("F1040.L7"), ["SCHD.L21", "F1040.L7"])
    check("REC-ADJ-001", "Adjustments equal Schedule 1 detail",
          L("SCH1.L20") + L("SCH1.L24"), L("F1040.L10"), ["SCH1.L20", "SCH1.L24", "F1040.L10"])
    check("REC-AGI-001", "AGI equals total income minus adjustments",
          L("F1040.L9") - L("F1040.L10"), L("F1040.L11"), ["F1040.L9", "F1040.L10", "F1040.L11"])
    check("REC-DED-001", "Itemized total equals Schedule A detail",
          L("SCHA.L4") + L("SCHA.L7") + L("SCHA.L8e") + L("SCHA.L14"), L("SCHA.L17"),
          ["SCHA.L4", "SCHA.L7", "SCHA.L8e", "SCHA.L14", "SCHA.L17"])
    check("REC-TI-001", "Taxable income follows the prescribed sequence",
          clamp_floor_zero(L("F1040.L11") - L("F1040.L12")), L("F1040.L15"),
          ["F1040.L11", "F1040.L12", "F1040.L15"])
    check("REC-CTC-001", "CTC on Form 1040 equals Schedule 8812",
          L("S8812.L14"), L("F1040.L19"), ["S8812.L14", "F1040.L19"])
    check("REC-TAX-001", "Tax after credits equals tax minus credits",
          clamp_floor_zero(L("F1040.L16") - L("F1040.L19")), L("F1040.L22"),
          ["F1040.L16", "F1040.L19", "F1040.L22"])
    check("REC-TAX-002", "Total tax equals tax after credits plus other taxes",
          L("F1040.L22") + L("F1040.L23"), L("F1040.L24"),
          ["F1040.L22", "F1040.L23", "F1040.L24"])
    check("REC-PAY-001", "Total payments equal withholding plus estimates",
          L("F1040.L25") + L("F1040.L26"), L("F1040.L33"),
          ["F1040.L25", "F1040.L26", "F1040.L33"])
    check("REC-BAL-001", "Balance due / refund follows from total tax and payments",
          L("F1040.L24") - L("F1040.L33"), L("F1040.L37") - L("F1040.L34"),
          ["F1040.L24", "F1040.L33", "F1040.L34", "F1040.L37"])
    check("REC-SUM-001", "Summary total tax matches Form 1040",
          L("F1040.L24"), yr.summary["total_tax"], ["F1040.L24"])
    check("REC-SUM-002", "Summary taxable income matches Form 1040",
          L("F1040.L15"), yr.summary["taxable_income"], ["F1040.L15"])
    return checks


# ---------------------------------------------------------------------------
# Multi-year entry point
# ---------------------------------------------------------------------------

def calculate(
    *,
    calculation_id: str,
    case_id: str,
    target_id: str,
    target_kind: str,
    household: Household,
    years_inputs: dict[int, YearInputs],
    pinned_rulesets: dict[int, str],
    registry: RulesetRegistry,
    calculated_at: str,
    scenario_version: int | None = None,
    engine_version: str = ENGINE_VERSION,
) -> CalculationResult:
    """Deterministic multi-year calculation with pinned ruleset versions."""
    if engine_version != ENGINE_VERSION:
        raise EngineError(f"engine version mismatch: requested {engine_version}, running {ENGINE_VERSION}")
    missing = set(years_inputs) - set(pinned_rulesets)
    if missing:
        raise EngineError(f"no ruleset pinned for years: {sorted(missing)}")
    registry.validate_pins({y: pinned_rulesets[y] for y in years_inputs})

    year_results: dict[int, YearResult] = {}
    for year in sorted(years_inputs):
        rs = registry.get(pinned_rulesets[year])
        year_results[year] = calculate_year(years_inputs[year], household, rs)

    failed = any(
        c.status == "failed" and c.material
        for yr in year_results.values() for c in yr.reconciliation
    )
    needs_review = failed or any(
        g.requires_review for yr in year_results.values() for g in yr.diagnostics
    )
    provisional_years = [y for y, yr in year_results.items() if yr.ruleset_status == "provisional"]

    snapshot = content_hash({
        "household": household.model_dump(mode="json"),
        "years": {str(y): yi.model_dump(mode="json") for y, yi in years_inputs.items()},
        "pins": {str(y): r for y, r in pinned_rulesets.items()},
    })
    return CalculationResult(
        calculation_id=calculation_id, case_id=case_id, target_id=target_id,
        target_kind=target_kind, scenario_version=scenario_version,
        engine_version=ENGINE_VERSION, schema_version=SCHEMA_VERSION,
        ruleset_versions={y: pinned_rulesets[y] for y in years_inputs},
        input_snapshot_hash=snapshot, calculated_at=calculated_at,
        years=year_results,
        reconciliation_status="failed" if failed else "passed",
        review_status="required" if (needs_review or provisional_years) else "not_required",
        provisional_years=sorted(provisional_years),
    )
