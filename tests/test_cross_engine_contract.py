"""Cross-engine contract tests.

Runs the same canonical cases (contract/cases.json) through both calculation
implementations — the JavaScript Tax Advisory Pro engine (via
contract/run_js.mjs under Node) and the Python ai_tax engine (via
contract/run_py.py in-process) — and compares the normalized metric set.

Tolerance model (documented in contract/cases.json):

* Enacted years (both engines carry enacted parameters — TY2025): dollar
  metrics must agree within ±$5 (the Python engine rounds every line item to
  whole dollars as it goes; the JS engine rounds at display), rates within
  ±0.005, and the marginal ordinary rate exactly.
* Provisional years (the Python ruleset's own ``status`` is "provisional" —
  TY2026+): the Python parameters are labeled projections generated before
  the applicable revenue procedure, while the JS constants encode the
  published values. Structural metrics that do not depend on
  inflation-adjusted parameters (total income, AGI, preferential income,
  NIIT, payments) stay at the strict tolerance; parameter-sensitive metrics
  are allowed a bounded, documented drift (±$250 / ±0.02) so that genuine
  formula regressions still fail loudly. Any difference beyond the bound
  fails with a diagnostic naming both engines, the ruleset status, and the
  values.

Parity is never forced by hardcoding expected results into production code;
this module only compares what the two engines actually produce.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "contract" / "cases.json"

STRICT_DOLLARS = 5.0
STRICT_RATE = 0.005
PROVISIONAL_DRIFT_DOLLARS = 250.0
PROVISIONAL_DRIFT_RATE = 0.02

# Metrics that do not depend on inflation-adjusted (projectable) parameters.
STRUCTURAL_METRICS = {
    "total_income", "agi", "preferential_income", "niit", "total_payments",
}
RATE_METRICS = {"effective_rate", "marginal_ordinary_rate"}


def _provisional_years() -> set[int]:
    from ai_tax.rulesets import DEFAULT_REGISTRY

    case_years = {c["year"] for c in json.loads(CASES.read_text())["cases"]}
    return {y for y in case_years if DEFAULT_REGISTRY.latest_for_year(y).is_provisional}


@pytest.fixture(scope="module")
def spec() -> dict:
    return json.loads(CASES.read_text())


@pytest.fixture(scope="module")
def js_results() -> dict:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is not available; cross-engine contract requires both engines")
    proc = subprocess.run(
        [node, str(ROOT / "contract" / "run_js.mjs"), str(CASES)],
        capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, f"JS harness failed:\n{proc.stderr}"
    return json.loads(proc.stdout)["results"]


@pytest.fixture(scope="module")
def py_results() -> dict:
    import importlib.util

    py_path = ROOT / "contract" / "run_py.py"
    module_spec = importlib.util.spec_from_file_location("contract_run_py", py_path)
    run_py = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(run_py)
    spec = json.loads(CASES.read_text())
    return {c["id"]: run_py.run_case(c) for c in spec["cases"]}


def _case_ids() -> list[str]:
    return [c["id"] for c in json.loads(CASES.read_text())["cases"]]


@pytest.mark.parametrize("case_id", _case_ids())
def test_engines_reconcile(case_id: str, spec: dict, js_results: dict, py_results: dict) -> None:
    case = next(c for c in spec["cases"] if c["id"] == case_id)
    js = js_results[case_id]
    py = py_results[case_id]
    provisional = case["year"] in _provisional_years()

    assert py.pop("reconciliation_status", "passed") == "passed", (
        f"{case_id}: Python engine reported failed internal reconciliation")

    failures = []
    for metric, js_value in js.items():
        py_value = py.get(metric)
        assert py_value is not None, f"{case_id}: Python harness missing metric {metric}"
        is_rate = metric in RATE_METRICS
        if metric == "marginal_ordinary_rate" and not provisional:
            tol = 0.0
        elif is_rate:
            tol = PROVISIONAL_DRIFT_RATE if provisional and metric not in STRUCTURAL_METRICS else STRICT_RATE
        elif provisional and metric not in STRUCTURAL_METRICS:
            tol = PROVISIONAL_DRIFT_DOLLARS
        else:
            tol = STRICT_DOLLARS
        diff = abs(js_value - py_value)
        if diff > tol:
            failures.append(
                f"  {metric}: js={js_value} py={py_value} diff={diff:.2f} tol={tol}"
                + ("  [provisional-year drift bound exceeded]" if provisional else ""))
    assert not failures, (
        f"CROSS-ENGINE MISMATCH — case {case_id} (TY{case['year']}, "
        f"python ruleset {'PROVISIONAL' if provisional else 'enacted'}):\n"
        + "\n".join(failures)
        + "\n  JS engine: tax-advisory-pro (src/02-engine.js, src/03-scenario.js)"
        + "\n  PY engine: ai_tax.engine"
        + "\n  If the difference is a legitimate parameter update, release a new"
          " ruleset version with citations (docs/RUNBOOK.md) — do not widen"
          " tolerances and do not edit released rulesets.")


def test_provisional_divergence_is_bounded_and_labeled(spec: dict, js_results: dict, py_results: dict) -> None:
    """The enacted-vs-provisional parameter gap must stay small and disclosed.

    If this fails, either the provisional projection has drifted far from the
    published parameters (release an updated, cited ruleset version) or one
    engine has a formula regression.
    """
    prov_years = _provisional_years()
    assert 2026 in prov_years, (
        "TY2026 is expected to be provisional in ai_tax until a ruleset built "
        "from the published revenue procedure is released; if it is now "
        "enacted, tighten this contract to strict tolerances for 2026.")
    for case in spec["cases"]:
        if case["year"] not in prov_years:
            continue
        js = js_results[case["id"]]
        py = py_results[case["id"]]
        gap = abs(js["total_federal_tax"] - py["total_federal_tax"])
        assert gap <= PROVISIONAL_DRIFT_DOLLARS, (
            f"{case['id']}: provisional-year total tax gap {gap:.2f} exceeds "
            f"the documented {PROVISIONAL_DRIFT_DOLLARS} bound")
