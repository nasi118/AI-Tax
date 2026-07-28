from __future__ import annotations

import itertools
from pathlib import Path

import pytest

from ai_tax.rulesets import DEFAULT_REGISTRY
from ai_tax.schemas import (
    AdjustmentInputs,
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
    SourceType,
    YearInputs,
)
from ai_tax.services import CalculationService
from ai_tax.store import CaseStore


@pytest.fixture
def store(tmp_path: Path) -> CaseStore:
    counter = itertools.count(1)
    tick = itertools.count(1)
    return CaseStore(
        tmp_path / "store",
        now_fn=lambda: f"2026-07-28T00:00:{next(tick) % 60:02d}Z",
        id_fn=lambda prefix: f"{prefix}_{next(counter):04d}",
    )


@pytest.fixture
def calc_service(store: CaseStore) -> CalculationService:
    return CalculationService(store, DEFAULT_REGISTRY)


def mfj_household(children: int = 0, age: int = 45) -> Household:
    return Household(
        filing_status=FilingStatus.MARRIED_FILING_JOINTLY,
        taxpayer_age_at_base_year_end=age, spouse_age_at_base_year_end=age,
        ctc_qualifying_children=children)


def single_household(age: int = 40) -> Household:
    return Household(filing_status=FilingStatus.SINGLE, taxpayer_age_at_base_year_end=age)


def year_inputs(year: int = 2025, **kw) -> YearInputs:
    return YearInputs(
        tax_year=year,
        income=IncomeInputs(**kw.get("income", {})),
        adjustments=AdjustmentInputs(**kw.get("adjustments", {})),
        itemized=ItemizedInputs(**kw.get("itemized", {})),
        payments=PaymentInputs(**kw.get("payments", {})),
    )


def default_policy(base_year: int = 2025) -> ProjectionPolicy:
    return ProjectionPolicy(
        base_year=base_year, horizon_years=5,
        fields=[FieldProjection(path="income.wages",
                                method=ProjectionMethod.GROWTH_RATE, annual_rate="0.03")],
        default_method=ProjectionMethod.COPIED_FROM_PRIOR_YEAR)


def some_provenance() -> dict[str, Provenance]:
    return {"years.2025.income.wages": Provenance(
        source_type=SourceType.USER_ENTRY, input_class=InputClass.CURRENT_YEAR_ESTIMATE,
        entered_by="user-1", entered_at="2026-07-28T00:00:00Z")}


def make_approved_base(store: CaseStore, calc: CalculationService, *,
                       household=None, base_inputs=None, policy=None):
    """Drive a base version through the full lifecycle to APPROVED."""
    case_id = store.create_case("user-1")
    base = store.create_base_version(
        case_id, household or mfj_household(children=1),
        base_inputs or year_inputs(income={"wages": "180000"},
                                   payments={"federal_withholding": "25000"}),
        policy or default_policy(), some_provenance(), "user-1")
    store.validate_base(case_id, base.version_id, "user-1")
    result = calc.run_for_base(case_id, base.version_id, "user-1", "idem-base-approve")
    from ai_tax.schemas import CaseState
    store.transition_base(case_id, base.version_id, CaseState.READY_FOR_REVIEW, "user-1")
    store.approve_base(case_id, base.version_id, "reviewer-1")
    return case_id, base, result
