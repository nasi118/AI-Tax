# Security Threat Model

Scope: the Tax Planning Analyst Agent, its tool layer, and the data it can
reach. Assets: taxpayer PII and financial data, calculation integrity, audit
trail integrity, tenant isolation.

## Threats and mitigations

| # | Threat | Mitigation | Enforced in |
|---|---|---|---|
| T1 | Prompt injection via imported documents, notes, or scenario rationale redirects the agent | All free text returned to the model is wrapped in `<untrusted_data>` with `<`/`>` neutralized; policy states document text is never an instruction; guardrails hold in code even if the model complies with the injection (see T2–T5) | `tools.wrap_untrusted`, `policy.py`, test `test_untrusted_content_wrapped` |
| T2 | Model invents or alters tax numbers | The model has no write path to calculations: results are engine-produced, snapshot-hashed, write-once; tampered snapshots fail integrity on read | `store.record_calculation` / `get_calculation` |
| T3 | Model mutates the base case or undeclared fields | No base-mutating tool exists in the toolkit; scenario overrides are allowlisted paths with declared old values; materialization is copy-on-write | `scenarios.py`, tests `test_agent_cannot_touch_base…`, `test_scenario_isolation…` |
| T4 | Cross-tenant / cross-case access | `ToolContext.tenant_cases` allowlist checked on every dispatch, including indirect access via calculation IDs and comparisons | `AgentToolkit.dispatch`, `_get_result`, `_compare` |
| T5 | Unauthorized or accidental mutation | Mutating tools require the `planner` role + `confirmed=true` (post-preview) + an idempotency key; replays return the original result | `dispatch`, `_add(mutating=True)` |
| T6 | Malformed tool arguments (type confusion, extra fields) | JSON Schema validation with `additionalProperties: false` on every tool | `dispatch` |
| T7 | Audit-trail erasure or falsification | Append-only JSONL audit log of every tool call, denial, and store mutation; issued packages registered with SHA-256; re-registration refused | `store.audit`, `register_package` |
| T8 | Float drift / rounding manipulation | Floats are rejected at construction; all math is `Decimal` with explicit IRS rounding functions | `money.py` |
| T9 | Cross-year parameter mixing | Registry rejects pinning a ruleset to a different year; engine refuses unpinned years | `RulesetRegistry.validate_pins` |
| T10 | Silent use of provisional law | Provisional rulesets carry a labeled policy + uncertainty warning; every provisional year emits a review-forcing diagnostic and is flagged in the identity block and workbook | `engine.py`, `excel_audit.py` |
| T11 | Runaway agent loops / resource abuse | Bounded tool rounds per request (`max_tool_rounds`); no shell/code/filesystem/database tools exist | `runtime.py`, toolkit surface |
| T12 | PII leakage through logs | Audit entries store truncated argument summaries, not full documents; telemetry redaction is a deployment requirement documented in CONTROLS.md | `store.audit` |

## Residual risks / deployment requirements

- Encryption in transit and at rest, retention/deletion schedules, and
  transport-level rate limits are infrastructure obligations of the hosting
  environment, not this library; they are tracked in `CONTROLS.md`.
- The JSON-file store has no row-level security of its own; production must
  mount per-tenant storage or replace the store behind its interface.
- The model may still *say* wrong things in prose; mandatory review status,
  identity blocks, and the evaluation suite reduce (not eliminate) this, which
  is why the pilot requires human review of all material output.
