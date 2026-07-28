"""Canonical, typed, versioned data models.

Every value that feeds a calculation is tax-year aware and attributable
(provenance, source, confidence, change history). Calculated values are never
stored as user inputs — they only exist inside CalculationResult.
"""
from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .money import d


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class FilingStatus(str, Enum):
    SINGLE = "single"
    MARRIED_FILING_JOINTLY = "married_filing_jointly"
    MARRIED_FILING_SEPARATELY = "married_filing_separately"
    HEAD_OF_HOUSEHOLD = "head_of_household"


class CaseState(str, Enum):
    DRAFT = "draft"
    IMPORTED = "imported"
    VALIDATION_FAILED = "validation_failed"
    READY_FOR_CALCULATION = "ready_for_calculation"
    CALCULATED = "calculated"
    RECONCILIATION_FAILED = "reconciliation_failed"
    READY_FOR_REVIEW = "ready_for_review"
    APPROVED = "approved"
    SUPERSEDED = "superseded"


class SourceType(str, Enum):
    USER_ENTRY = "user_entry"
    DOCUMENT_IMPORT = "document_import"
    PRIOR_YEAR_RETURN = "prior_year_return"
    PROJECTION = "projection"
    REVIEWER_ADJUSTMENT = "reviewer_adjustment"


class InputClass(str, Enum):
    HISTORICAL_FACT = "historical_fact"
    CURRENT_YEAR_ESTIMATE = "current_year_estimate"
    ELECTION = "election"
    PLANNING_ASSUMPTION = "planning_assumption"
    PROJECTED_VALUE = "projected_value"


class ProjectionMethod(str, Enum):
    FIXED = "fixed"
    USER_ENTERED_BY_YEAR = "user_entered_by_year"
    INFLATION_LINKED = "inflation_linked"
    GROWTH_RATE = "growth_rate"
    RULESET_DERIVED = "ruleset_derived"
    SCHEDULED_EVENT = "scheduled_event"
    COPIED_FROM_PRIOR_YEAR = "copied_from_prior_year"
    NOT_APPLICABLE = "not_applicable"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ReviewState(str, Enum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"


# ---------------------------------------------------------------------------
# Base model: Decimal-safe, frozen-friendly
# ---------------------------------------------------------------------------

class TaxModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
    )


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

class Provenance(TaxModel):
    """Attribution for a single canonical input value."""
    source_type: SourceType
    input_class: InputClass
    source_document: Optional[str] = None
    source_location: Optional[str] = None
    confidence: Optional[str] = None  # e.g. "exact", "estimated", "low"
    entered_by: str
    entered_at: str  # ISO-8601, supplied by caller (engine never reads clocks)
    validation_status: str = "unvalidated"
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Year inputs (canonical input schema for one tax year)
# ---------------------------------------------------------------------------

class IncomeInputs(TaxModel):
    wages: Decimal = Decimal("0")
    taxable_interest: Decimal = Decimal("0")
    ordinary_dividends: Decimal = Decimal("0")
    qualified_dividends: Decimal = Decimal("0")
    short_term_capital_gain: Decimal = Decimal("0")  # may be negative
    long_term_capital_gain: Decimal = Decimal("0")   # may be negative
    ira_distribution: Decimal = Decimal("0")
    ira_conversion: Decimal = Decimal("0")           # Roth conversion amount
    self_employment_income: Decimal = Decimal("0")   # UNSUPPORTED: triggers review
    other_income: Decimal = Decimal("0")

    @field_validator("*", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return d(v) if not isinstance(v, Decimal) else v


class AdjustmentInputs(TaxModel):
    traditional_ira_contribution: Decimal = Decimal("0")
    pretax_401k_contribution: Decimal = Decimal("0")  # reduces W-2 wages upstream; modeled as adjustment

    @field_validator("*", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return d(v) if not isinstance(v, Decimal) else v


class ItemizedInputs(TaxModel):
    state_local_taxes_paid: Decimal = Decimal("0")
    mortgage_interest: Decimal = Decimal("0")
    charitable_cash: Decimal = Decimal("0")
    medical_expenses: Decimal = Decimal("0")

    @field_validator("*", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return d(v) if not isinstance(v, Decimal) else v


class PaymentInputs(TaxModel):
    federal_withholding: Decimal = Decimal("0")
    estimated_payments: Decimal = Decimal("0")

    @field_validator("*", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return d(v) if not isinstance(v, Decimal) else v


class Elections(TaxModel):
    itemize_deductions: bool = False


class YearInputs(TaxModel):
    tax_year: int
    income: IncomeInputs = Field(default_factory=IncomeInputs)
    adjustments: AdjustmentInputs = Field(default_factory=AdjustmentInputs)
    itemized: ItemizedInputs = Field(default_factory=ItemizedInputs)
    payments: PaymentInputs = Field(default_factory=PaymentInputs)
    elections: Elections = Field(default_factory=Elections)


class Household(TaxModel):
    filing_status: FilingStatus
    taxpayer_age_at_base_year_end: int = 40
    spouse_age_at_base_year_end: Optional[int] = None
    ctc_qualifying_children: int = 0
    other_dependents: int = 0


# ---------------------------------------------------------------------------
# Projection policy
# ---------------------------------------------------------------------------

class FieldProjection(TaxModel):
    """Explicit projection method for one input field path."""
    path: str  # e.g. "income.wages"
    method: ProjectionMethod
    annual_rate: Optional[Decimal] = None  # for growth_rate / inflation_linked
    note: Optional[str] = None

    @field_validator("annual_rate", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return None if v is None else (d(v) if not isinstance(v, Decimal) else v)


class ProjectionPolicy(TaxModel):
    base_year: int
    horizon_years: int = 5
    fields: list[FieldProjection] = Field(default_factory=list)
    default_method: ProjectionMethod = ProjectionMethod.COPIED_FROM_PRIOR_YEAR


# ---------------------------------------------------------------------------
# Case / base version / scenario
# ---------------------------------------------------------------------------

class BaseCaseVersion(TaxModel):
    version_id: str
    case_id: str
    state: CaseState = CaseState.DRAFT
    base_year: int
    household: Household
    years: dict[int, YearInputs]
    projection_policy: Optional[ProjectionPolicy] = None
    provenance: dict[str, Provenance] = Field(default_factory=dict)  # keyed by field path
    created_by: str
    created_at: str
    supersedes: Optional[str] = None
    state_history: list[dict[str, str]] = Field(default_factory=list)

    def input_snapshot_hash(self) -> str:
        return content_hash(self.model_dump(mode="json", exclude={"state", "state_history"}))


class ScenarioOverride(TaxModel):
    path: str          # e.g. "years.2026.income.ira_conversion"
    old_value: Any
    new_value: Any
    reason: str
    source: str        # "user" | "agent_proposal_confirmed"
    changed_by: str
    changed_at: str


class Scenario(TaxModel):
    scenario_id: str
    case_id: str
    base_version_id: str
    name: str
    rationale: str
    version: int = 1
    overrides: list[ScenarioOverride] = Field(default_factory=list)
    created_by: str
    created_at: str
    superseded_by: Optional[str] = None


# ---------------------------------------------------------------------------
# Calculation request / result
# ---------------------------------------------------------------------------

class LineItem(TaxModel):
    line_id: str                      # stable, e.g. "F1040.L15"
    label: str
    value: Decimal
    formula: str                      # human-readable calculation code
    upstream_line_ids: list[str] = Field(default_factory=list)
    parameter_ids: list[str] = Field(default_factory=list)   # ruleset parameter refs
    source_input_ids: list[str] = Field(default_factory=list)  # canonical input paths
    rounding: str = "whole_dollar"
    location: str = ""                # schedule/worksheet name

    @field_validator("value", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return d(v) if not isinstance(v, Decimal) else v


class Diagnostic(TaxModel):
    code: str
    severity: Severity
    message: str
    related_line_ids: list[str] = Field(default_factory=list)
    requires_review: bool = False


class ReconciliationCheck(TaxModel):
    check_id: str
    description: str
    status: str                       # "passed" | "failed"
    expected: Decimal
    actual: Decimal
    difference: Decimal
    tolerance: Decimal = Decimal("0")
    material: bool = True
    supporting_line_ids: list[str] = Field(default_factory=list)

    @field_validator("expected", "actual", "difference", "tolerance", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return d(v) if not isinstance(v, Decimal) else v


class YearResult(TaxModel):
    tax_year: int
    ruleset_id: str
    ruleset_status: str               # "enacted" | "provisional"
    summary: dict[str, Decimal]
    forms: dict[str, list[LineItem]]
    worksheets: dict[str, list[LineItem]]
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    reconciliation: list[ReconciliationCheck] = Field(default_factory=list)
    calculation_trace: list[str] = Field(default_factory=list)

    @field_validator("summary", mode="before")
    @classmethod
    def _no_floats(cls, v):
        return {k: (d(x) if not isinstance(x, Decimal) else x) for k, x in v.items()}

    def line(self, line_id: str) -> LineItem:
        for items in list(self.forms.values()) + list(self.worksheets.values()):
            for li in items:
                if li.line_id == line_id:
                    return li
        raise KeyError(line_id)


class CalculationResult(TaxModel):
    calculation_id: str
    case_id: str
    target_id: str                    # base version id or scenario id
    target_kind: str                  # "base" | "scenario"
    scenario_version: Optional[int] = None
    engine_version: str
    schema_version: str
    ruleset_versions: dict[int, str]  # year -> ruleset_id
    input_snapshot_hash: str
    calculated_at: str
    years: dict[int, YearResult]
    reconciliation_status: str        # "passed" | "failed"
    review_status: str = "not_required"  # not_required | required | approved | rejected
    provisional_years: list[int] = Field(default_factory=list)

    def result_hash(self) -> str:
        return content_hash(self.model_dump(mode="json", exclude={"calculated_at"}))

    def identity_block(self) -> dict[str, Any]:
        """The mandatory context every presented result must carry."""
        return {
            "case_id": self.case_id,
            "target_id": self.target_id,
            "target_kind": self.target_kind,
            "scenario_version": self.scenario_version,
            "tax_years": sorted(self.years),
            "ruleset_versions": {str(y): r for y, r in self.ruleset_versions.items()},
            "engine_version": self.engine_version,
            "input_snapshot_hash": self.input_snapshot_hash,
            "calculation_timestamp": self.calculated_at,
            "reconciliation_status": self.reconciliation_status,
            "validation_warnings": sum(
                1 for yr in self.years.values()
                for g in yr.diagnostics if g.severity != Severity.INFO
            ),
            "review_status": self.review_status,
            "result_hash": self.result_hash(),
        }


# ---------------------------------------------------------------------------
# Review / export
# ---------------------------------------------------------------------------

class ReviewRecord(TaxModel):
    review_id: str
    target_id: str
    reason: str
    evidence: list[str] = Field(default_factory=list)
    state: ReviewState = ReviewState.PENDING
    reviewer: Optional[str] = None
    reviewed_at: Optional[str] = None
    findings: Optional[str] = None
    requested_by: str
    requested_at: str


class ExportManifest(TaxModel):
    export_id: str
    case_id: str
    calculation_ids: list[str]
    schema_version: str
    engine_version: str
    ruleset_versions: dict[str, str]
    file_hashes: dict[str, str]
    created_by: str
    created_at: str


# ---------------------------------------------------------------------------
# Hashing helpers
# ---------------------------------------------------------------------------

def content_hash(obj: Any) -> str:
    """Stable sha256 over canonical JSON."""
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()
