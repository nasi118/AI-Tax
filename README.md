# AI-Tax

A tax planning application built around a **deterministic tax calculation
engine**, with a constrained **Tax Planning Analyst Agent** as an
orchestration and explanation layer on top.

The core design rule: **the engine — never the language model — is the
calculation authority.** The agent collects facts, creates scenarios through
preview/approve/apply, invokes the engine via typed tools, reconciles
results, generates permanent Excel audit packages, and escalates anything
uncertain, unsupported, or unreconciled to human review. It cannot invent tax
parameters, mutate the base case, or present a failed result as final — those
guarantees are enforced in code, not just in the prompt.

## Layout

```
ai_tax/
  money.py        Decimal-safe arithmetic, explicit tax rounding
  schemas.py      canonical typed models (provenance on every input)
  rulesets/       immutable per-year parameter files + registry
  engine.py       deterministic calculation: line items, trace, reconciliation
  projection.py   five-year projections with explicit methods
  store.py        case store: lifecycle states, immutable versions, reviews, audit log
  scenarios.py    allowlisted path-based override patches (copy-on-write)
  services.py     calculation orchestration + scenario comparison
  excel_audit.py  permanent, verified, immutable .xlsx audit packages
  agent/          typed tools, runtime policy, Anthropic-backed runtime
scripts/build_rulesets.py   deterministic ruleset generator
examples/build_example_case.py   full workflow demo (no LLM needed)
tests/            55 tests: golden cases, lifecycle, isolation, guardrails
docs/             ASSESSMENT · ARCHITECTURE · RUNBOOK · THREAT_MODEL ·
                  UNSUPPORTED · CONTROLS
```

## Quick start

```bash
pip install -e .[dev]
python -m pytest
python examples/build_example_case.py   # base case + 3 scenarios + audit workbook
```

See `docs/RUNBOOK.md` for the agent runtime and operations, and
`docs/UNSUPPORTED.md` for the engine's explicit scope boundaries.

> All output is a **planning estimate**, not filed-return advice. Future-year
> parameters (2026+) are provisional projections of enacted 2025 law and are
> labeled as such everywhere they appear.
