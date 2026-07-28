# Audit / Control Matrix

| Control | Implementation | Evidence / test |
|---|---|---|
| Rules versioned & immutable | JSON files per year+version; registry read-only views | `test_ruleset_parameters_read_only`, `test_registry_serves_released_versions` |
| Ruleset pinning per year | `validate_pins` rejects mixing | `test_cross_year_pinning_rejected`, `test_missing_ruleset_pin_rejected` |
| Provisional law labeled | `provisional_policy` + `RULES-PROV-001` + workbook shading | `test_provisional_rulesets_labeled_with_policy`, `test_provisional_year_marks_review_required` |
| Deterministic engine | pure function, injected time/IDs | `test_determinism_identical_hashes` |
| Decimal-safe money | float rejection, explicit rounding | `test_floats_rejected`, `test_whole_dollar_rounding_half_up` |
| Golden cases | hand-computed 2025 expectations | `tests/test_engine_golden.py` |
| Lifecycle state machine | transition table in store | `test_illegal_transitions_rejected`, `test_approval_requires_review_state_and_supersedes` |
| Validation gate | errors block calculation | `test_validation_failure_blocks_calculation` |
| Reconciliation gate | engine checks + status; failed ⇒ review, never final | `assert_reconciled` in golden tests, `test_failed_reconciliation_reported_not_final` |
| Write-once snapshots + hashes | record/get with content hash | `test_calculation_snapshots_write_once_and_tamper_evident` |
| Scenario allowlist | path grammar + field allowlist | `test_overrides_allowlisted_paths_only` |
| Declared-change-only mutation | old-value match required | `test_undeclared_old_value_rejected` |
| Base isolation | copy-on-write materialization | `test_scenario_isolation_base_never_mutates` |
| Idempotent mutations | key registry in store | `test_apply_is_idempotent`, `test_equivalent_requests_produce_identical_actions` |
| Projection explicitness | methods required, rates recorded | `test_growth_rate_requires_explicit_rate`, `test_projection_growth_and_provenance` |
| Roll-forward reconciliation | REC-YOY checks | `test_rollforward_reconciliation_detects_drift` |
| Delta reconciliation | REC-DELTA in comparisons | `test_comparison_traces_to_overrides` |
| Workbook verification | REC-XLSX re-read after save | `test_workbook_generated_verified_and_immutable` |
| Package immutability | hash registration, re-issue refused | same test |
| Tool schema validation | jsonschema, no extra properties | `test_schema_validation_blocks_malformed_args` |
| RBAC + confirmation + idempotency on mutations | dispatch checks | `test_mutations_require_role_confirmation_and_idempotency` |
| Tenant/case isolation | `tenant_cases` allowlist incl. indirect reads | `test_tenant_isolation`, `test_runtime_denies_out_of_scope_calls_from_model` |
| No unrestricted tools | toolkit surface is the whole surface | `test_unknown_tool_rejected`, `test_agent_cannot_touch_base_or_undeclared_fields` |
| Injection isolation | `wrap_untrusted` | `test_untrusted_content_wrapped` |
| Review workflow | records, auto-escalation, immutable resolution | `test_review_escalation_tool`, `test_review_resolution_immutable` |
| Audit logging | append-only JSONL for tools + store mutations | `store.audit` (inspect `audit.jsonl` in the example output) |

## Deployment-level obligations (not in this library)

encryption in transit/at rest · retention & deletion schedules · telemetry
redaction pipeline · transport rate limits & timeouts · per-tenant storage
isolation · backup/restore for the store · access provisioning for reviewer
roles.
