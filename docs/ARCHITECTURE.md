# Architecture

Five layers, dependency arrows point down only:

```
┌───────────────────────────────────────────────────────────┐
│ E. Presentation / agent runtime (ai_tax/agent/runtime.py) │
│    conversational UI over a structured workflow           │
├───────────────────────────────────────────────────────────┤
│ D. Agent orchestration (ai_tax/agent/tools.py, policy.py) │
│    13 typed tools · JSON-Schema validation · RBAC ·       │
│    tenant isolation · preview-before-commit · idempotency │
├───────────────────────────────────────────────────────────┤
│ C. Case & scenario storage (store.py, scenarios.py,       │
│    projection.py, services.py, excel_audit.py)            │
│    lifecycle states · immutable versions · override       │
│    patches · reviews · audit log · audit packages         │
├───────────────────────────────────────────────────────────┤
│ B. Deterministic engine (engine.py, money.py)             │
│    calculate(inputs, rulesets, engine_version) → result   │
│    line items · trace · diagnostics · reconciliation      │
├───────────────────────────────────────────────────────────┤
│ A. Rulesets (rulesets/data/*.json)                        │
│    immutable · versioned per tax year · enacted vs        │
│    provisional · source references                        │
└───────────────────────────────────────────────────────────┘
```

## Core invariants

1. **The engine is the calculation authority.** The agent has no arithmetic
   role; every number it presents comes from a tool result with a line ID.
2. **Determinism.** Identical (inputs, pinned ruleset versions, engine
   version) → identical result and identical `result_hash`. The engine reads
   no clocks and no randomness; timestamps and IDs are injected by callers.
3. **Immutability.** Released rulesets, base versions (content), scenario
   versions, calculation snapshots, and issued audit packages are write-once.
   Corrections create new versions. Snapshot reads verify a stored content
   hash and fail loudly on tampering.
4. **Explicit change control.** Scenarios store only allowlisted, path-based
   overrides with old/new value, year, reason, source, actor, timestamp.
   Materialization applies the patch to a fresh copy of the base, so
   undeclared mutation is structurally impossible.
5. **Reconciliation is a release gate.** Machine-readable checks are computed
   inside the engine from the produced line items, again for scenario deltas,
   for projection roll-forwards, and for the Excel workbook against the
   persisted result. Any failed material check blocks "final" status and
   forces review.
6. **Year integrity.** Every calculation year pins one ruleset version for
   that year; cross-year pinning is rejected at the registry.
7. **Untrusted data stays data.** Free text that flows back to the model is
   wrapped in `<untrusted_data>` with angle brackets neutralized.

## Workflow (with or without the agent)

```
Collect → Validate → Preview → Confirm → Calculate
       → Reconcile → Review → Export
```

Base-case lifecycle states:
`draft → imported? → validation_failed | ready_for_calculation → calculated |
reconciliation_failed → ready_for_review → approved → superseded`

Only an APPROVED base version anchors formal scenarios;
`allow_unapproved=True` exists solely for clearly-labeled provisional
previews.

## Result identity

Every `CalculationResult` exposes `identity_block()`: case ID, target and
kind, scenario version, tax years, per-year ruleset versions, engine version,
input snapshot hash, timestamp, reconciliation status, warning count, review
status, result hash. The agent policy requires repeating this block whenever
results are presented.

## Specialist agents (later phases)

Roth-conversion, capital-gains, charitable-giving, and other specialists plug
into the SAME toolkit: they may propose structured scenario overrides through
`preview_scenario_changes` / `apply_scenario_overrides`, and nothing else. No
specialist gets its own tax math.
