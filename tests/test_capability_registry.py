"""Capability-registry integrity tests.

The registry is the machine-readable calculation boundary; these tests keep
it valid, keep the generated document in sync, and keep it honest against
docs/UNSUPPORTED.md (the Python engine must never be advertised as supporting
something that document rules out).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "capabilities" / "registry.json"

sys.path.insert(0, str(ROOT / "scripts"))


def _registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text())


def test_registry_shape_and_statuses():
    reg = _registry()
    allowed = set(reg["statuses"])
    assert allowed == {"calculated", "approximated", "blocked", "not_detected"}
    assert set(reg["engines"]) == {"tax-advisory-pro", "ai_tax"}
    for engine in reg["engines"].values():
        assert engine["supported_tax_years"], "engine must declare tax years"
        for year in engine["supported_tax_years"]:
            assert str(year) in engine["tax_year_status"]
        assert engine["filing_statuses"]
        for cap_key, cap in engine["capabilities"].items():
            assert cap["status"] in allowed, f"{cap_key}: bad status {cap['status']}"
            assert cap.get("notes"), f"{cap_key}: notes are required"
            if cap["status"] == "blocked":
                assert cap.get("diagnostics"), (
                    f"{cap_key}: a blocked capability must name its diagnostic codes")


def test_both_engines_cover_the_same_capability_keys():
    reg = _registry()
    keysets = [set(e["capabilities"]) for e in reg["engines"].values()]
    assert keysets[0] == keysets[1], (
        "both engines must be assessed against the identical capability list")


def test_generated_document_is_in_sync():
    from build_capability_matrix import OUTPUT, render

    expected = render(_registry())
    assert OUTPUT.exists(), "docs/CAPABILITIES.md missing — run scripts/build_capability_matrix.py"
    assert OUTPUT.read_text() == expected, (
        "docs/CAPABILITIES.md is stale — regenerate with "
        "python scripts/build_capability_matrix.py")


def test_registry_agrees_with_unsupported_doc():
    """docs/UNSUPPORTED.md rules the Python engine's out-of-scope list; the
    registry must not claim 'calculated' for anything that document excludes."""
    reg = _registry()
    ai_tax = reg["engines"]["ai_tax"]["capabilities"]
    must_not_be_calculated = [
        "self_employment_tax", "qbi_deduction", "amt", "additional_medicare_tax",
        "estimated_tax_safe_harbor", "state_calculations",
        "trust_estate_calculations", "carryforwards",
    ]
    for key in must_not_be_calculated:
        assert ai_tax[key]["status"] != "calculated", (
            f"registry claims ai_tax calculates {key}, but docs/UNSUPPORTED.md "
            "lists it as out of scope for engine-0.1.0")


def test_registry_diagnostic_codes_exist_in_engine_source():
    reg = _registry()
    engine_src = (ROOT / "ai_tax" / "engine.py").read_text()
    for cap in reg["engines"]["ai_tax"]["capabilities"].values():
        for code in cap.get("diagnostics", []):
            assert code in engine_src, (
                f"registry cites diagnostic {code} that ai_tax/engine.py does not emit")
