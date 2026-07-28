"""Multi-year projection: expand base-year inputs across the planning horizon.

Every projected value uses an explicit, recorded method. The agent (or any
caller) can never introduce a growth rate silently: rates live in the
ProjectionPolicy, which is part of the base version and shows up in the audit
package. A roll-forward reconciliation re-derives the projection and compares
it with what is stored.
"""
from __future__ import annotations

from decimal import Decimal

from .money import ZERO, d, round_whole_dollar
from .schemas import (
    FieldProjection,
    ProjectionMethod,
    ProjectionPolicy,
    Provenance,
    ReconciliationCheck,
    SourceType,
    InputClass,
    YearInputs,
)

# Field paths within YearInputs that projection may touch.
PROJECTABLE_SECTIONS = ("income", "adjustments", "itemized", "payments")


class ProjectionError(Exception):
    pass


def _get(yi: YearInputs, path: str) -> Decimal:
    section, field = path.split(".", 1)
    return getattr(getattr(yi, section), field)


def _set(yi: YearInputs, path: str, value: Decimal) -> None:
    section, field = path.split(".", 1)
    setattr(getattr(yi, section), field, value)


def _iter_paths(yi: YearInputs):
    for section in PROJECTABLE_SECTIONS:
        model = getattr(yi, section)
        for field in type(model).model_fields:
            yield f"{section}.{field}"


def _method_for(policy: ProjectionPolicy, path: str) -> FieldProjection:
    for fp in policy.fields:
        if fp.path == path:
            return fp
    return FieldProjection(path=path, method=policy.default_method)


def project_years(
    base_inputs: YearInputs,
    policy: ProjectionPolicy,
    *,
    entered_by: str,
    entered_at: str,
) -> tuple[dict[int, YearInputs], dict[str, Provenance]]:
    """Return {year: YearInputs} for the full horizon plus projection provenance."""
    if policy.base_year != base_inputs.tax_year:
        raise ProjectionError(
            f"policy base year {policy.base_year} != inputs year {base_inputs.tax_year}")
    if policy.horizon_years < 5:
        raise ProjectionError("projection horizon must cover at least five years")

    years: dict[int, YearInputs] = {policy.base_year: base_inputs.model_copy(deep=True)}
    provenance: dict[str, Provenance] = {}
    prior = base_inputs
    for offset in range(1, policy.horizon_years):
        year = policy.base_year + offset
        yi = prior.model_copy(deep=True)
        yi.tax_year = year
        for path in _iter_paths(base_inputs):
            fp = _method_for(policy, path)
            base_val = _get(base_inputs, path)
            prior_val = _get(prior, path)
            if fp.method == ProjectionMethod.FIXED:
                value = base_val
            elif fp.method == ProjectionMethod.COPIED_FROM_PRIOR_YEAR:
                value = prior_val
            elif fp.method in (ProjectionMethod.GROWTH_RATE, ProjectionMethod.INFLATION_LINKED):
                if fp.annual_rate is None:
                    raise ProjectionError(
                        f"{path}: method {fp.method.value} requires an explicit annual_rate")
                value = round_whole_dollar(prior_val * (d(1) + fp.annual_rate))
            elif fp.method == ProjectionMethod.NOT_APPLICABLE:
                value = ZERO
            elif fp.method == ProjectionMethod.SCHEDULED_EVENT:
                # Scheduled events are applied as scenario overrides; the
                # projection itself carries the base value forward.
                value = prior_val
            elif fp.method == ProjectionMethod.USER_ENTERED_BY_YEAR:
                # Values must already exist per-year; keep prior until overridden.
                value = prior_val
            elif fp.method == ProjectionMethod.RULESET_DERIVED:
                raise ProjectionError(f"{path}: ruleset_derived projection not supported for inputs")
            else:  # pragma: no cover
                raise ProjectionError(f"{path}: unknown method {fp.method}")
            _set(yi, path, value)
            provenance[f"years.{year}.{path}"] = Provenance(
                source_type=SourceType.PROJECTION,
                input_class=InputClass.PROJECTED_VALUE,
                confidence="projected",
                entered_by=entered_by,
                entered_at=entered_at,
                validation_status="derived",
                notes=f"method={fp.method.value}"
                      + (f" rate={fp.annual_rate}" if fp.annual_rate is not None else ""),
            )
        years[year] = yi
        prior = yi
    return years, provenance


def rollforward_checks(
    base_inputs: YearInputs,
    policy: ProjectionPolicy,
    stored_years: dict[int, YearInputs],
    override_paths: set[str] = frozenset(),
) -> list[ReconciliationCheck]:
    """REC-YOY: re-derive the projection and confirm stored years match it,
    excluding paths explicitly overridden by an approved scenario patch."""
    derived, _ = project_years(base_inputs, policy, entered_by="recon", entered_at="recon")
    checks: list[ReconciliationCheck] = []
    for year, yi in sorted(stored_years.items()):
        if year == policy.base_year:
            continue
        mismatches: list[str] = []
        for path in _iter_paths(yi):
            full = f"years.{year}.{path}"
            if full in override_paths:
                continue
            if year in derived and _get(derived[year], path) != _get(yi, path):
                mismatches.append(full)
        checks.append(ReconciliationCheck(
            check_id=f"REC-YOY-{year}",
            description=f"Year {year} inputs roll forward from the projection policy",
            status="passed" if not mismatches else "failed",
            expected=ZERO, actual=d(len(mismatches)), difference=d(len(mismatches)),
            material=True, supporting_line_ids=mismatches))
    return checks
