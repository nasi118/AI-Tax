"""Generate docs/CAPABILITIES.md from capabilities/registry.json.

The JSON registry is the source of truth; the Markdown is a build artifact
kept in the repository for readers. Run after editing the registry:

    python scripts/build_capability_matrix.py

tests/test_capability_registry.py fails if the two drift apart.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "capabilities" / "registry.json"
OUTPUT = ROOT / "docs" / "CAPABILITIES.md"

CAPABILITY_ORDER = [
    ("ordinary_income_tax", "Ordinary income tax"),
    ("capital_gains_qualified_dividends", "Capital gains & qualified dividends"),
    ("niit", "Net investment income tax"),
    ("self_employment_tax", "Self-employment tax"),
    ("qbi_deduction", "QBI deduction (Sec. 199A)"),
    ("retirement_plan_calculations", "Retirement-plan calculations"),
    ("ira_and_sehi", "IRA & self-employed health insurance"),
    ("itemized_deductions", "Itemized deductions"),
    ("credits", "Credits"),
    ("amt", "Alternative minimum tax"),
    ("additional_medicare_tax", "Additional Medicare tax (0.9%)"),
    ("estimated_tax_safe_harbor", "Estimated-tax safe harbor"),
    ("state_calculations", "State calculations"),
    ("trust_estate_calculations", "Trust & estate calculations"),
    ("carryforwards", "Carryforwards"),
    ("five_year_projections", "Five-year projections"),
    ("reconciliation_coverage", "Reconciliation coverage"),
]

STATUS_BADGE = {
    "calculated": "**calculated**",
    "approximated": "*approximated*",
    "blocked": "`blocked (diagnostic)`",
    "not_detected": "not modeled / not detected",
}


def render(registry: dict) -> str:
    engines = registry["engines"]
    keys = list(engines)
    lines: list[str] = []
    a = lines.append
    a("# Engine Capability Matrix")
    a("")
    a("<!-- GENERATED FILE — edit capabilities/registry.json and run")
    a("     python scripts/build_capability_matrix.py  — do not edit by hand. -->")
    a("")
    a("Two calculation engines live in this repository with deliberately")
    a("different scopes. Every result must identify which engine and ruleset")
    a("produced it, and nothing may imply an engine supports a capability this")
    a("matrix marks otherwise. Status meanings:")
    a("")
    a("- **calculated** — modeled with real computation.")
    a("- *approximated* — modeled with a documented simplification (see notes).")
    a("- `blocked (diagnostic)` — detected from inputs and answered with a")
    a("  blocking, review-forcing diagnostic instead of a number.")
    a("- not modeled / not detected — out of scope and not detectable; callers")
    a("  and UIs must not imply support.")
    a("")
    for key in keys:
        e = engines[key]
        a(f"## {e['display_name']}")
        a("")
        a(f"- **Language:** {e['language']}  ")
        a(f"- **Code:** {', '.join('`' + c + '`' for c in e['code'])}  ")
        a(f"- **Version identity:** {e['version_source']}  ")
        years = ", ".join(
            f"{y} ({e['tax_year_status'][str(y)]})" for y in e["supported_tax_years"])
        a(f"- **Tax years:** {years}  ")
        a(f"- **Filing statuses:** {', '.join(e['filing_statuses'])}")
        a("")
        a("| Capability | Status | Notes |")
        a("|---|---|---|")
        for cap_key, cap_label in CAPABILITY_ORDER:
            c = e["capabilities"][cap_key]
            note = c["notes"]
            if c.get("diagnostics"):
                note += " Diagnostics: " + ", ".join(f"`{d}`" for d in c["diagnostics"]) + "."
            a(f"| {cap_label} | {STATUS_BADGE[c['status']]} | {note} |")
        a("")
        a("**Known limitations**")
        a("")
        for lim in e["known_limitations"]:
            a(f"- {lim}")
        a("")
    cc = registry["cross_engine_contract"]
    a("## Cross-engine contract")
    a("")
    a(f"Canonical shared-scope cases live in `{cc['cases']}` and run through both")
    a(f"engines in `{cc['tests']}`. {cc['notes']}")
    a("")
    t = cc["tolerances"]
    a(f"Tolerances: enacted years ±${t['enacted_dollars']} / ±{t['enacted_rate']}")
    a(f"rate (marginal rate exact); provisional years ±${t['provisional_drift_dollars']}")
    a(f"/ ±{t['provisional_drift_rate']} on parameter-sensitive metrics only.")
    a("")
    return "\n".join(lines)


def main() -> None:
    registry = json.loads(REGISTRY.read_text())
    OUTPUT.write_text(render(registry))
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
