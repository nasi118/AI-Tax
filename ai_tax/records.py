"""Canonical persistence records beyond the case/calculation core.

These pydantic models define the production data model for the record types
that the JSON store will carry into a real database: tenants, users and
roles, clients, client facts, source documents, extracted facts, and
report/package manifests. The case, base-version, scenario, calculation,
review, and ruleset records already live in schemas.py / the store; this
module completes the inventory documented in docs/PERSISTENCE.md.

Invariants enforced here:

* Records that represent history (facts, documents, extracted facts,
  manifests) are frozen — corrections create a NEW record that supersedes
  the old one via ``supersedes``; nothing historical is edited in place.
* Every fact carries provenance (who/when/source) and a review status.
* Everything is tenant-scoped; ``tenant_id`` is required, not defaulted,
  on client-data records so cross-tenant writes cannot happen by omission.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from .schemas import Provenance


class RecordState(str, Enum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    SUPERSEDED = "superseded"
    ARCHIVED = "archived"


ALLOWED_RECORD_TRANSITIONS: dict[RecordState, set[RecordState]] = {
    RecordState.DRAFT: {RecordState.IN_REVIEW, RecordState.ARCHIVED},
    RecordState.IN_REVIEW: {RecordState.APPROVED, RecordState.DRAFT, RecordState.ARCHIVED},
    RecordState.APPROVED: {RecordState.SUPERSEDED, RecordState.ARCHIVED},
    RecordState.SUPERSEDED: set(),
    RecordState.ARCHIVED: set(),
}


def validate_record_transition(current: RecordState, new: RecordState) -> None:
    if new not in ALLOWED_RECORD_TRANSITIONS[current]:
        raise ValueError(f"illegal record transition {current.value} -> {new.value}")


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class MutableModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


# ---------------------------------------------------------------------------
# Tenancy and access
# ---------------------------------------------------------------------------

class Tenant(MutableModel):
    tenant_id: str
    name: str
    created_at: str
    state: RecordState = RecordState.APPROVED
    # Data-retention policy hooks (enforced by operations tooling, recorded here)
    retention_days_client_data: Optional[int] = None
    retention_days_audit: Optional[int] = None


class Role(str, Enum):
    ANALYST = "analyst"      # read + calculate
    PLANNER = "planner"      # scenario mutations (preview/approve/apply)
    REVIEWER = "reviewer"    # approve bases, resolve reviews
    ADMIN = "admin"          # tenant/user administration


class User(MutableModel):
    user_id: str
    tenant_id: str
    display_name: str
    email: str
    roles: set[Role] = Field(default_factory=set)
    active: bool = True
    created_at: str


# ---------------------------------------------------------------------------
# Clients and facts
# ---------------------------------------------------------------------------

class ClientRecord(MutableModel):
    """A client of the firm. Cases reference clients; scenarios live in cases."""
    client_id: str            # immutable system id (UUID)
    tenant_id: str
    client_number: Optional[str] = None   # optional human-readable number
    display_name: str
    state: RecordState = RecordState.DRAFT
    created_by: str
    created_at: str
    case_ids: list[str] = Field(default_factory=list)


class ClientFact(FrozenModel):
    """One material fact about a client (an input value with provenance).

    Facts are immutable: a correction issues a new fact whose ``supersedes``
    points at the old one. ``field_path`` uses the same grammar as scenario
    overrides (e.g. "years.2026.income.wages").
    """
    fact_id: str
    tenant_id: str
    client_id: str
    tax_year: int
    field_path: str
    value: Decimal | str | bool
    effective_date: Optional[str] = None
    provenance: Provenance
    review_state: RecordState = RecordState.DRAFT
    supersedes: Optional[str] = None


# ---------------------------------------------------------------------------
# Source documents and extraction (consumed by the import pipeline)
# ---------------------------------------------------------------------------

class DocumentScanStatus(str, Enum):
    PENDING = "pending"
    CLEAN = "clean"
    REJECTED_TYPE = "rejected_type"
    REJECTED_MALWARE = "rejected_malware"


class SourceDocument(FrozenModel):
    """An uploaded source document (W-2, 1099, prior return…). Write-once;
    the binary lives outside this record, addressed by content hash."""
    document_id: str
    tenant_id: str
    client_id: str
    filename: str
    media_type: str
    file_sha256: str
    uploaded_by: str
    uploaded_at: str
    scan_status: DocumentScanStatus = DocumentScanStatus.PENDING
    classification: Optional[str] = None       # e.g. "W-2", "1099-INT"
    classification_confidence: Optional[Decimal] = None


class ExtractedFact(FrozenModel):
    """A candidate fact extracted from a source document.

    NEVER authoritative: an extraction becomes a ClientFact only after a
    human decision. Low confidence, conflicts, and unsupported fields go to
    the review queue instead.
    """
    extraction_id: str
    tenant_id: str
    client_id: str
    document_id: str
    file_sha256: str
    page_or_location: Optional[str] = None
    source_text: Optional[str] = None
    extraction_method: str                     # e.g. "llm:claude-…", "regex:w2-box1"
    extraction_version: str
    confidence: Decimal
    proposed_field_path: str
    proposed_value: Decimal | str | bool
    tax_year: int
    reviewer: Optional[str] = None
    reviewer_decision: Optional[str] = None    # "approved" | "corrected" | "rejected"
    final_value: Decimal | str | bool | None = None
    approved_at: Optional[str] = None
    resulting_fact_id: Optional[str] = None    # the ClientFact this became, if approved


# ---------------------------------------------------------------------------
# Report / package manifests
# ---------------------------------------------------------------------------

class PackageManifest(FrozenModel):
    """Issued audit package / report identity — write-once, hash-anchored."""
    manifest_id: str
    tenant_id: str
    case_id: str
    filename: str
    file_sha256: str
    generated_at: str
    generated_by: str
    engine_version: str
    ruleset_versions: dict[int, str]
    base_version_id: str
    scenario_refs: list[str] = Field(default_factory=list)
    calculation_ids: list[str] = Field(default_factory=list)
    reconciliation_status: str
    review_status: str
