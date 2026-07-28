"""Scenario service: copy-on-write planning scenarios over an approved base.

A scenario references an exact base version and stores ONLY its differences as
an explicit, allowlisted, path-based override patch. Materialization applies
the patch to a fresh deep copy of the base, so the base case can never drift,
and any mutation not present in the approved override set simply cannot occur.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from .money import d
from .schemas import (
    BaseCaseVersion,
    CaseState,
    Household,
    Scenario,
    ScenarioOverride,
    YearInputs,
)
from .store import CaseStore, StoreError


class ScenarioError(Exception):
    pass


# Only these YearInputs fields may be changed by a scenario. Household,
# provenance, tax_year, and everything else is off-limits by construction.
ALLOWLISTED_FIELDS: set[str] = {
    "income.wages", "income.taxable_interest", "income.ordinary_dividends",
    "income.qualified_dividends", "income.short_term_capital_gain",
    "income.long_term_capital_gain", "income.ira_distribution",
    "income.ira_conversion", "income.other_income",
    "adjustments.traditional_ira_contribution", "adjustments.pretax_401k_contribution",
    "itemized.state_local_taxes_paid", "itemized.mortgage_interest",
    "itemized.charitable_cash", "itemized.medical_expenses",
    "payments.federal_withholding", "payments.estimated_payments",
    "elections.itemize_deductions",
}

_PATH_RE = re.compile(r"^years\.(\d{4})\.([a-z_]+\.[a-z_0-9]+)$")


def parse_path(path: str) -> tuple[int, str]:
    m = _PATH_RE.match(path)
    if not m:
        raise ScenarioError(
            f"invalid override path {path!r}; expected years.<year>.<section>.<field>")
    year, field = int(m.group(1)), m.group(2)
    if field not in ALLOWLISTED_FIELDS:
        raise ScenarioError(f"field {field!r} is not allowlisted for scenario overrides")
    return year, field


def _get(yi: YearInputs, field: str) -> Any:
    section, name = field.split(".", 1)
    return getattr(getattr(yi, section), name)


def _set(yi: YearInputs, field: str, value: Any) -> None:
    section, name = field.split(".", 1)
    setattr(getattr(yi, section), name, value)


def _coerce(field: str, value: Any) -> Any:
    if field == "elections.itemize_deductions":
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in ("true", "false"):
            return value.lower() == "true"
        raise ScenarioError(f"{field} requires a boolean, got {value!r}")
    try:
        return d(value)
    except (TypeError, InvalidOperation) as exc:
        raise ScenarioError(f"{field}: {exc}") from exc


def _serialize(value: Any) -> Any:
    """JSON-safe canonical form for storing override values."""
    return value if isinstance(value, bool) else str(value)


class ScenarioService:
    def __init__(self, store: CaseStore):
        self.store = store

    # -- creation ----------------------------------------------------------
    def create_scenario(
        self,
        case_id: str,
        base_version_id: str,
        name: str,
        rationale: str,
        created_by: str,
        allow_unapproved: bool = False,
    ) -> Scenario:
        base = self.store.get_base_version(case_id, base_version_id)
        if base.state != CaseState.APPROVED and not allow_unapproved:
            raise ScenarioError(
                f"base version {base_version_id} is {base.state.value}; only an APPROVED "
                "base may anchor formal planning scenarios (pass allow_unapproved for a "
                "clearly-labeled provisional preview)")
        scenario = Scenario(
            scenario_id=self.store.new_id("scn"), case_id=case_id,
            base_version_id=base_version_id, name=name, rationale=rationale,
            version=1, overrides=[], created_by=created_by, created_at=self.store.now())
        self.store.put_scenario(scenario, created_by)
        return scenario

    # -- effective values / materialization --------------------------------
    def materialize(self, scenario: Scenario) -> tuple[Household, dict[int, YearInputs], BaseCaseVersion]:
        """Fresh deep copy of the base with ONLY the approved patch applied."""
        base = self.store.get_base_version(scenario.case_id, scenario.base_version_id)
        years = {y: yi.model_copy(deep=True) for y, yi in base.years.items()}
        for ov in scenario.overrides:
            year, field = parse_path(ov.path)
            if year not in years:
                raise ScenarioError(f"override {ov.path}: year {year} not in base horizon")
            _set(years[year], field, _coerce(field, ov.new_value))
        return base.household, years, base

    def effective_value(self, scenario: Scenario, path: str) -> Any:
        year, field = parse_path(path)
        _, years, _ = self.materialize(scenario)
        if year not in years:
            raise ScenarioError(f"year {year} not in base horizon")
        return _get(years[year], field)

    # -- preview -----------------------------------------------------------
    def preview_overrides(self, scenario: Scenario, proposed: list[dict[str, Any]]) -> dict[str, Any]:
        """Validate a proposed patch without committing anything.

        Each proposal: {path, new_value, reason}. Returns per-item diffs with
        the current effective old value, plus blocking errors.
        """
        diffs: list[dict[str, Any]] = []
        errors: list[str] = []
        for item in proposed:
            path = str(item.get("path", ""))
            try:
                year, field = parse_path(path)
                new_value = _coerce(field, item["new_value"])
                old_value = self.effective_value(scenario, path)
                if not str(item.get("reason", "")).strip():
                    raise ScenarioError(f"{path}: a reason is required for every override")
                diffs.append({
                    "path": path, "year": year, "field": field,
                    "old_value": _serialize(old_value), "new_value": _serialize(new_value),
                    "reason": item["reason"],
                    "no_op": old_value == new_value,
                })
            except (ScenarioError, KeyError) as exc:
                errors.append(f"{path or '<missing path>'}: {exc}")
        return {"scenario_id": scenario.scenario_id,
                "base_version_id": scenario.base_version_id,
                "valid": not errors, "diffs": diffs, "errors": errors}

    # -- apply (creates an immutable new scenario version) -----------------
    def apply_overrides(
        self,
        scenario: Scenario,
        approved: list[dict[str, Any]],
        changed_by: str,
        idempotency_key: str,
        source: str = "user",
    ) -> Scenario:
        if not idempotency_key.strip():
            raise ScenarioError("idempotency_key is required for mutating operations")
        existing = self.store.idempotency_get(scenario.case_id, idempotency_key)
        if existing is not None:
            sid, _, ver = existing.partition("@v")
            return self.store.get_scenario(scenario.case_id, sid, int(ver))

        preview = self.preview_overrides(scenario, approved)
        if not preview["valid"]:
            raise ScenarioError("cannot apply overrides: " + "; ".join(preview["errors"]))

        now = self.store.now()
        new_overrides = list(scenario.overrides)
        for diff, item in zip(preview["diffs"], approved):
            declared_old = item.get("old_value")
            if declared_old is not None and str(declared_old) != str(diff["old_value"]):
                raise ScenarioError(
                    f"{diff['path']}: declared old value {declared_old!r} does not match "
                    f"current effective value {diff['old_value']!r} — refusing undeclared mutation")
            new_overrides.append(ScenarioOverride(
                path=diff["path"], old_value=diff["old_value"], new_value=diff["new_value"],
                reason=diff["reason"], source=source, changed_by=changed_by, changed_at=now))

        new_version = Scenario(
            scenario_id=scenario.scenario_id, case_id=scenario.case_id,
            base_version_id=scenario.base_version_id, name=scenario.name,
            rationale=scenario.rationale, version=scenario.version + 1,
            overrides=new_overrides, created_by=changed_by, created_at=now)
        self.store.put_scenario(new_version, changed_by)
        self.store.idempotency_put(
            scenario.case_id, idempotency_key,
            f"{new_version.scenario_id}@v{new_version.version}")
        return new_version
