# Runbook

## Setup

```bash
pip install -e .[dev]        # add [agent] for the Anthropic-backed runtime
python -m pytest             # 55 tests
python examples/build_example_case.py   # end-to-end demo, no LLM required
```

The example writes `examples/output/`: a case store, canonical JSON export,
and the permanent Excel audit package (base + 3 scenarios × 5 years).

## Everyday operations

### Regenerate rulesets (new year / correction)
Edit `scripts/build_rulesets.py`, then `python scripts/build_rulesets.py`.
Released files are immutable: a correction bumps the `-vN` suffix and adds a
new file; never edit a released JSON in place. Add golden tests for any new
enacted year.

### Base-case workflow (no AI required)
1. `CaseStore.create_case` → `create_base_version` (inputs + projection
   policy + provenance)
2. `validate_base` → `ready_for_calculation` or `validation_failed`
3. `CalculationService.run_for_base` (idempotency key required)
4. `transition_base(..., READY_FOR_REVIEW)` → reviewer calls `approve_base`
5. Reviews auto-open for provisional years / diagnostics; resolve with
   `resolve_review`

### Scenarios
`ScenarioService.create_scenario` (approved base only) →
`preview_overrides` → show the user old/new/year/reason →
`apply_overrides` (idempotency key) → `run_for_scenario` →
`compare_scenarios` → `generate_audit_package`.

### Running the agent
```python
from ai_tax.agent.tools import AgentToolkit, ToolContext
from ai_tax.agent.runtime import TaxPlanningAnalystAgent
toolkit = AgentToolkit(store, DEFAULT_REGISTRY, package_dir)
ctx = ToolContext(actor="user-1", roles={"analyst", "planner"},
                  tenant_cases={case_id})
agent = TaxPlanningAnalystAgent(toolkit, ctx)   # needs ANTHROPIC_API_KEY
print(agent.run("Compare a $75k Roth conversion in 2026 against my base case"))
```
Pilot requirement: keep human review mandatory — the toolkit auto-opens
review records whenever a calculation requires one.

## Incident responses

- **Reconciliation failure** (`reconciliation_status=failed`): the base moves
  to `reconciliation_failed`, review auto-opens, and the agent must not call
  the result final. Fix the engine or inputs, create a new version, recompute.
- **Integrity error on `get_calculation`**: the snapshot on disk was altered.
  Treat as an incident; restore from backup; the audit log identifies writers.
- **Audit package dispute**: packages are immutable and hash-registered.
  Verify the file's SHA-256 against the case's `packages` registry; a
  mismatch means the file is not the issued package.
- **Wrong tax parameter discovered**: release a `-v2` ruleset with corrected
  values and sources; recalculate affected cases; old results remain, pinned
  to the old version, for the record.
