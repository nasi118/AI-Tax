"""Deterministically generate versioned ruleset JSON files.

Run: python scripts/build_rulesets.py
Outputs to ai_tax/rulesets/data/. Rulesets are immutable once released: a
correction bumps the version suffix and creates a NEW file — never edit a
released file in place.

2025 parameters are enacted law (Rev. Proc. 2024-40 as amended by the One Big
Beautiful Bill Act, P.L. 119-21). 2026-2030 are PROVISIONAL: indexed forward
from 2025 using an assumed 2.5% chained-CPI adjustment, with IRS rounding
conventions, and explicit sunset handling for the SALT cap.
"""
from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "ai_tax" / "rulesets" / "data"
ASSUMED_INFLATION = Decimal("0.025")

STATUSES = ["single", "married_filing_jointly", "married_filing_separately", "head_of_household"]

BASE_2025 = {
    "jurisdiction": "US-FEDERAL",
    "tax_year": 2025,
    "version": "us-federal-2025-v1",
    "status": "enacted",
    "effective_from": "2025-01-01",
    "effective_to": "2025-12-31",
    "approval_status": "approved",
    "source_references": [
        "Rev. Proc. 2024-40 (inflation adjustments for 2025)",
        "P.L. 119-21 One Big Beautiful Bill Act (2025 standard deduction, CTC, SALT cap)",
        "IRC §1 (rates), §63 (standard deduction), §24 (CTC), §164(b)(6) (SALT)",
        "IRC §1411 (net investment income tax)",
        "IRS Notice 2024-80 (2025 retirement plan limits)",
    ],
    "parameters": {
        "ordinary_brackets": {
            # [upper_bound_or_null, rate] pairs, ascending
            "single": [[11925, "0.10"], [48475, "0.12"], [103350, "0.22"], [197300, "0.24"],
                        [250525, "0.32"], [626350, "0.35"], [None, "0.37"]],
            "married_filing_jointly": [[23850, "0.10"], [96950, "0.12"], [206700, "0.22"], [394600, "0.24"],
                                        [501050, "0.32"], [751600, "0.35"], [None, "0.37"]],
            "married_filing_separately": [[11925, "0.10"], [48475, "0.12"], [103350, "0.22"], [197300, "0.24"],
                                           [250525, "0.32"], [375800, "0.35"], [None, "0.37"]],
            "head_of_household": [[17000, "0.10"], [64850, "0.12"], [103350, "0.22"], [197300, "0.24"],
                                   [250500, "0.32"], [626350, "0.35"], [None, "0.37"]],
        },
        "standard_deduction": {
            "single": 15750, "married_filing_jointly": 31500,
            "married_filing_separately": 15750, "head_of_household": 23625,
        },
        "additional_std_deduction_65": {
            "single": 2000, "married_filing_jointly": 1600,
            "married_filing_separately": 1600, "head_of_household": 2000,
        },
        "ltcg_0_top": {
            "single": 48350, "married_filing_jointly": 96700,
            "married_filing_separately": 48350, "head_of_household": 64750,
        },
        "ltcg_15_top": {
            "single": 533400, "married_filing_jointly": 600050,
            "married_filing_separately": 300000, "head_of_household": 566700,
        },
        "ltcg_rates": {"zero": "0.00", "mid": "0.15", "top": "0.20"},
        "ctc_per_child": 2200,
        "odc_per_dependent": 500,
        "ctc_phaseout_threshold": {
            "single": 200000, "married_filing_jointly": 400000,
            "married_filing_separately": 200000, "head_of_household": 200000,
        },
        "ctc_phaseout_rate_per_1000": 50,
        "capital_loss_limit": {
            "single": 3000, "married_filing_jointly": 3000,
            "married_filing_separately": 1500, "head_of_household": 3000,
        },
        "salt_cap": {
            "single": 40000, "married_filing_jointly": 40000,
            "married_filing_separately": 20000, "head_of_household": 40000,
        },
        "salt_cap_floor": {
            "single": 10000, "married_filing_jointly": 10000,
            "married_filing_separately": 5000, "head_of_household": 10000,
        },
        "salt_phasedown_magi_threshold": {
            "single": 500000, "married_filing_jointly": 500000,
            "married_filing_separately": 250000, "head_of_household": 500000,
        },
        "salt_phasedown_rate": "0.30",
        "medical_agi_floor_rate": "0.075",
        "niit_rate": "0.038",
        "niit_magi_threshold": {
            "single": 200000, "married_filing_jointly": 250000,
            "married_filing_separately": 125000, "head_of_household": 200000,
        },
        "ira_contribution_limit": 7000,
        "ira_catchup_50": 1000,
        "limit_401k": 23500,
        "catchup_401k_50": 7500,
    },
}

# Parameters that stay fixed by statute (not inflation-indexed).
UNINDEXED = {
    "ltcg_rates", "ctc_phaseout_threshold", "ctc_phaseout_rate_per_1000",
    "capital_loss_limit", "salt_phasedown_rate", "medical_agi_floor_rate",
    "niit_rate", "niit_magi_threshold", "odc_per_dependent",
    "salt_cap_floor", "salt_phasedown_magi_threshold",
}

# IRS-style rounding increments for indexed dollar amounts.
ROUND_TO = {
    "ordinary_brackets": 25, "standard_deduction": 100, "additional_std_deduction_65": 50,
    "ltcg_0_top": 50, "ltcg_15_top": 50, "ctc_per_child": 100,
    "ira_contribution_limit": 500, "ira_catchup_50": 100,
    "limit_401k": 500, "catchup_401k_50": 500, "salt_cap": 100,
}


def _round_to(value: Decimal, increment: int) -> int:
    inc = Decimal(increment)
    return int((value / inc).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * inc)


def _index(amount: int, years_out: int, increment: int) -> int:
    factor = (Decimal("1") + ASSUMED_INFLATION) ** years_out
    return _round_to(Decimal(amount) * factor, increment)


def build_provisional(year: int) -> dict:
    n = year - 2025
    p = json.loads(json.dumps(BASE_2025["parameters"]))  # deep copy

    for key, spec in list(p.items()):
        if key in UNINDEXED:
            continue
        inc = ROUND_TO.get(key)
        if inc is None:
            continue
        if key == "ordinary_brackets":
            for fs in STATUSES:
                p[key][fs] = [
                    [None if ub is None else _index(ub, n, inc), rate]
                    for ub, rate in spec[fs]
                ]
        elif isinstance(spec, dict):
            p[key] = {fs: _index(v, n, inc) for fs, v in spec.items()}
        else:
            p[key] = _index(spec, n, inc)

    # OBBBA SALT cap: 40,400 in 2026 then +1%/yr through 2029; reverts to the
    # 10,000/5,000 statutory cap in 2030 (sunset).
    if year <= 2029:
        salt_factor = Decimal("1.01") ** (year - 2026)
        p["salt_cap"] = {
            fs: _round_to(Decimal(40400 if fs != "married_filing_separately" else 20200) * salt_factor, 100)
            for fs in STATUSES
        }
        sunset = "SALT cap increase sunsets after 2029; 2030 reverts to 10,000/5,000."
    else:
        p["salt_cap"] = {
            "single": 10000, "married_filing_jointly": 10000,
            "married_filing_separately": 5000, "head_of_household": 10000,
        }
        sunset = "Post-sunset statutory SALT cap of 10,000 (5,000 MFS) applied."

    return {
        "jurisdiction": "US-FEDERAL",
        "tax_year": year,
        "version": f"us-federal-{year}-v1",
        "status": "provisional",
        "effective_from": f"{year}-01-01",
        "effective_to": f"{year}-12-31",
        "approval_status": "approved_as_provisional",
        "source_references": BASE_2025["source_references"],
        "provisional_policy": {
            "source_year": 2025,
            "projection_method": "inflation_linked",
            "assumed_inflation": str(ASSUMED_INFLATION),
            "sunset_handling": sunset,
            "uncertainty_warning": (
                f"Tax year {year} parameters are PROVISIONAL projections from enacted 2025 "
                "law using an assumed 2.5% annual chained-CPI adjustment. They are NOT "
                "enacted law and official IRS figures will differ."
            ),
        },
        "parameters": p,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rulesets = [BASE_2025] + [build_provisional(y) for y in range(2026, 2031)]
    for rs in rulesets:
        path = OUT / f"{rs['version']}.json"
        path.write_text(json.dumps(rs, indent=2, sort_keys=True) + "\n")
        print(f"wrote {path.name}")


if __name__ == "__main__":
    main()
