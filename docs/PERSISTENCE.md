# Persistence Design

Development and demo continue to run on the JSON-file store; production
replaces exactly one class. This document defines the interface, the
canonical records, the invariants a production backend must uphold, and the
migration boundary.

## The narrow interface (`ai_tax/persistence.py`)

`PersistenceBackend` is the complete storage surface — three primitives:

| Primitive | Semantics | Used for |
|---|---|---|
| **Documents** | Mutable JSON documents with **optimistic concurrency**: reads return a revision; writes declare the expected revision; a mismatch raises `ConflictError` (no silent last-writer-wins). `expected_revision=None` means create. | cases, tenants, users, clients |
| **Immutable records** | Write-once JSON payloads; a second `put` raises `ImmutableViolation`; no update, no delete. | calculation snapshots, source documents, extracted facts, package manifests |
| **Streams** | Append-only, ordered. | audit events |

Destructive deletion does not exist. The data-retention hook is
`retire_doc(collection, id, reason, actor)`: requires a reason, preserves
the payload in a `retired/` area, and appends a tombstone to the audit
stream. `export_all()` produces a complete logical export (backup,
portability, tenant offboarding).

`JsonFileBackend` implements the interface over the historical layout
(`cases/*.json`, `calculations/*.json`, `audit.jsonl`) — stores written
before the revision field existed load as revision 0 and upgrade on the
next write. `CaseStore` performs all I/O through the backend; nothing above
the interface touches disk.

## Canonical record inventory

| Record | Where | Mutability | Notes |
|---|---|---|---|
| Tenant / firm | `records.Tenant` | document | carries retention-policy fields |
| User + roles | `records.User`, `records.Role` | document | analyst / planner / reviewer / admin — mirrors the agent-toolkit RBAC |
| Client | `records.ClientRecord` | document | immutable system id; optional human client number; owns `case_ids` |
| Client fact | `records.ClientFact` | **frozen** | provenance + tax year + effective date + review state; corrections supersede |
| Source document | `records.SourceDocument` | **frozen** | file hash, scan status, classification (import pipeline) |
| Extracted fact | `records.ExtractedFact` | **frozen** | never authoritative; approval issues a new record + ClientFact |
| Case | store `cases/` document | document | container: versions, scenarios, reviews, idempotency, packages |
| Base-case version | `schemas.BaseCaseVersion` | content-immutable | state transitions only, enforced table |
| Scenario version | `schemas.Scenario` | **write-once per version** | allowlisted path overrides |
| Calculation run | `schemas.CalculationResult` | **write-once + hash** | tamper-evident on read |
| Ruleset version | `rulesets/data/*.json` | **released = immutable** | corrections bump `-vN` |
| Review / approval | `schemas.ReviewRecord` | resolve-once | resolution immutable |
| Reconciliation result | inside `CalculationResult` | write-once | REC-* checks, release gate |
| Audit event | `audit` stream | **append-only** | every tool call, denial, store mutation |
| Package manifest | `records.PackageManifest` | **frozen** | engine/ruleset versions, SHA-256, review status |

## Required properties → where enforced

- **Tenant isolation** — `tenant_id` is required on client-data records and
  recorded on cases (`create_case(tenant_id=…)`); the agent toolkit enforces
  the per-context `tenant_cases` allowlist on every dispatch. A production
  backend must additionally scope queries by tenant (row-level security or
  per-tenant schemas).
- **Immutable historical versions / no destructive overwrite** — write-once
  primitives + content hashes; `retire_doc` preserves payloads.
- **Append-only audit** — stream primitive; no update/delete surface exists.
- **Optimistic concurrency** — document revisions, `ConflictError`.
- **Explicit states** — case lifecycle table in `store.py`; generic
  draft → in_review → approved → superseded / archived machine for other
  records in `records.py` (`validate_record_transition`).
- **Idempotency keys** — per-case registry (`idempotency_get/put`), already
  required by calculation and scenario mutations.
- **Retention & deletion hooks** — `retire_doc` + per-tenant retention
  fields on `Tenant`; enforcement schedule is an operations job.
- **Exportability / backup & restore** — `export_all()`; restore = write
  the export into a fresh backend root, then verify calculation hashes
  (`get_calculation` re-verifies on read). Issued packages are re-verified
  against their registered SHA-256.
- **Dev/prod separation** — dev/demo stores live under `examples/output/`
  (gitignored, regenerated); production roots are external paths with their
  own backend instance. Demo data never ships inside the package.

## Migration boundary (the exact next step)

To move to a real database, implement `PersistenceBackend` once, e.g. for
PostgreSQL:

```
documents:  table per collection (id text pk, doc jsonb, rev int)
            UPDATE … SET doc=$2, rev=rev+1 WHERE id=$1 AND rev=$3  → 0 rows = ConflictError
immutable:  table per collection (id text pk, payload jsonb)  — INSERT only,
            unique-violation = ImmutableViolation
streams:    append-only table (seq bigserial, stream text, entry jsonb)
retired:    retired_documents table with reason/actor/at
```

Then `CaseStore(root, backend=PostgresBackend(dsn))`. No calculation,
lifecycle, reconciliation, or agent code changes. Credentials/infrastructure
provisioning is deliberately out of scope for this repository — stop at the
backend class and wire the DSN through deployment configuration.

## What this deliberately does not do

No ORM, no second database dependency "to check a box", and no schema for
data the application does not yet write (per-schedule CSVs, telemetry).
`tests/test_persistence.py` is the executable contract a replacement
backend must pass.
