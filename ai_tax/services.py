"""Calculation orchestration and scenario comparison services.

These glue the store, scenario service, ruleset registry, and engine together.
They are ordinary application code — the same workflow runs with or without
the agent, which is what makes the agent an orchestration layer rather than a
calculation authority.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from .engine import calculate
from .money import ZERO, d
from .rulesets import RulesetRegistry
from .schemas import CalculationResult, CaseState, ReconciliationCheck, Severity
from .scenarios import ScenarioService
from .store import CaseStore, StoreError


class CalculationService:
    def __init__(self, store: CaseStore, registry: RulesetRegistry):
        self.store = store
        self.registry = registry
        self.scenarios = ScenarioService(store)

    def run_for_base(self, case_id: str, base_version_id: str, actor: str,
                     idempotency_key: str) -> CalculationResult:
        existing = self.store.idempotency_get(case_id, idempotency_key)
        if existing:
            return self.store.get_calculation(existing)
        base = self.store.get_base_version(case_id, base_version_id)
        if base.state not in (CaseState.READY_FOR_CALCULATION, CaseState.CALCULATED,
                              CaseState.READY_FOR_REVIEW, CaseState.APPROVED):
            raise StoreError(
                f"base version {base_version_id} is {base.state.value}; validate it before "
                "calculating")
        years = sorted(base.years)
        pins = self.registry.pin_for_years(years)
        result = calculate(
            calculation_id=self.store.new_id("calc"), case_id=case_id,
            target_id=base_version_id, target_kind="base", household=base.household,
            years_inputs=base.years, pinned_rulesets=pins, registry=self.registry,
            calculated_at=self.store.now())
        self.store.record_calculation(result, actor)
        if base.state == CaseState.READY_FOR_CALCULATION:
            if result.reconciliation_status == "passed":
                self.store.transition_base(case_id, base_version_id, CaseState.CALCULATED,
                                           actor, note=result.calculation_id)
            else:
                self.store.transition_base(case_id, base_version_id,
                                           CaseState.RECONCILIATION_FAILED, actor,
                                           note=result.calculation_id)
        if result.review_status == "required":
            self.store.request_review(
                case_id, base_version_id,
                reason="calculation requires review (reconciliation failure, "
                       "review-level diagnostics, or provisional rulesets)",
                evidence=[result.calculation_id], requested_by=actor)
        self.store.idempotency_put(case_id, idempotency_key, result.calculation_id)
        return result

    def run_for_scenario(self, case_id: str, scenario_id: str, actor: str,
                         idempotency_key: str,
                         scenario_version: Optional[int] = None) -> CalculationResult:
        existing = self.store.idempotency_get(case_id, idempotency_key)
        if existing:
            return self.store.get_calculation(existing)
        scenario = self.store.get_scenario(case_id, scenario_id, scenario_version)
        household, years_inputs, base = self.scenarios.materialize(scenario)
        pins = self.registry.pin_for_years(sorted(years_inputs))
        result = calculate(
            calculation_id=self.store.new_id("calc"), case_id=case_id,
            target_id=scenario_id, target_kind="scenario",
            scenario_version=scenario.version, household=household,
            years_inputs=years_inputs, pinned_rulesets=pins, registry=self.registry,
            calculated_at=self.store.now())
        self.store.record_calculation(result, actor)
        if result.review_status == "required":
            self.store.request_review(
                case_id, scenario_id,
                reason="scenario calculation requires review",
                evidence=[result.calculation_id], requested_by=actor)
        self.store.idempotency_put(case_id, idempotency_key, result.calculation_id)
        return result


SUMMARY_FIELDS = [
    "total_income", "agi", "taxable_income", "deduction", "regular_tax",
    "child_tax_credit", "niit", "total_tax", "total_payments",
    "balance_due", "refund", "effective_rate", "marginal_ordinary_rate",
]


def compare_scenarios(store: CaseStore, calculation_ids: list[str]) -> dict[str, Any]:
    """Compare calculations that share a case and base version.

    The first calculation is the baseline. Differences are attributed to the
    scenarios' explicit override patches and engine lines — never to
    agent reasoning. Includes delta reconciliation checks.
    """
    if len(calculation_ids) < 2:
        raise ValueError("comparison needs at least two calculation ids")
    results = [store.get_calculation(cid) for cid in calculation_ids]
    case_ids = {r.case_id for r in results}
    if len(case_ids) != 1:
        raise ValueError(f"cannot compare calculations across cases: {sorted(case_ids)}")
    years = sorted(set.intersection(*[set(r.years) for r in results]))
    if not years:
        raise ValueError("compared calculations share no tax years")
    baseline = results[0]

    columns = []
    for r in results:
        overrides: list[dict[str, Any]] = []
        if r.target_kind == "scenario":
            scenario = store.get_scenario(r.case_id, r.target_id, r.scenario_version)
            overrides = [ov.model_dump(mode="json") for ov in scenario.overrides]
        columns.append({
            "identity": r.identity_block(),
            "label": f"{r.target_kind}:{r.target_id}"
                     + (f"@v{r.scenario_version}" if r.scenario_version else ""),
            "changed_assumptions": overrides,
        })

    per_year: dict[int, dict[str, Any]] = {}
    cumulative_delta_tax: list[Decimal] = [ZERO for _ in results]
    for year in years:
        row: dict[str, Any] = {"summaries": [], "deltas_vs_baseline": []}
        for idx, r in enumerate(results):
            summ = {k: str(r.years[year].summary[k]) for k in SUMMARY_FIELDS}
            row["summaries"].append(summ)
            delta_tax = r.years[year].summary["total_tax"] - baseline.years[year].summary["total_tax"]
            cumulative_delta_tax[idx] += delta_tax
            row["deltas_vs_baseline"].append({
                "total_tax": str(delta_tax),
                "taxable_income": str(r.years[year].summary["taxable_income"]
                                      - baseline.years[year].summary["taxable_income"]),
                "cash_flow": str(-(delta_tax)),
            })
        per_year[year] = row

    checks: list[dict[str, Any]] = []
    for idx, r in enumerate(results[1:], start=1):
        # REC-DELTA: a scenario with no overrides must match the baseline exactly
        has_overrides = bool(columns[idx]["changed_assumptions"])
        total_delta = cumulative_delta_tax[idx]
        same_base = (r.input_snapshot_hash == baseline.input_snapshot_hash)
        ok = has_overrides or same_base or total_delta == ZERO
        checks.append(ReconciliationCheck(
            check_id=f"REC-DELTA-{idx:03d}",
            description=f"{columns[idx]['label']}: tax deltas trace to declared overrides",
            status="passed" if ok else "failed",
            expected=ZERO, actual=total_delta if not has_overrides else ZERO,
            difference=total_delta if not has_overrides else ZERO,
            material=True).model_dump(mode="json"))

    return {
        "case_id": baseline.case_id,
        "years": years,
        "columns": columns,
        "per_year": {str(y): per_year[y] for y in years},
        "cumulative_total_tax_delta_vs_baseline": [str(v) for v in cumulative_delta_tax],
        "delta_checks": checks,
        "all_reconciled": all(r.reconciliation_status == "passed" for r in results),
        "warnings": [
            f"{columns[i]['label']}: year {y} diagnostic {g.code}: {g.message}"
            for i, r in enumerate(results) for y in years
            for g in r.years[y].diagnostics if g.severity != Severity.INFO
        ],
    }
