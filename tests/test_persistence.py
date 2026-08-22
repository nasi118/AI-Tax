"""Persistence-interface and canonical-record tests: backend contract
(optimistic concurrency, write-once records, append-only streams, retention
hook), CaseStore-on-backend compatibility with pre-revision stores, tenant
scoping, and record-model invariants (immutability, state transitions)."""
from __future__ import annotations

import json
from decimal import Decimal

import pytest

from ai_tax.persistence import (
    ConflictError,
    ImmutableViolation,
    JsonFileBackend,
    PersistenceError,
    UnknownRecord,
)
from ai_tax.records import (
    ALLOWED_RECORD_TRANSITIONS,
    ClientFact,
    ExtractedFact,
    PackageManifest,
    RecordState,
    validate_record_transition,
)
from ai_tax.schemas import Provenance
from ai_tax.store import CaseStore, StoreError


# ---------------------------------------------------------------- backend --

def test_document_optimistic_concurrency(tmp_path):
    b = JsonFileBackend(tmp_path)
    rev1 = b.write_doc("cases", "c1", {"x": 1}, expected_revision=None)
    assert rev1 == 1
    with pytest.raises(ConflictError):
        b.write_doc("cases", "c1", {"x": 2}, expected_revision=None)  # exists
    doc, rev = b.read_doc("cases", "c1")
    assert (doc["x"], rev) == (1, 1)
    rev2 = b.write_doc("cases", "c1", {"x": 2}, expected_revision=rev)
    assert rev2 == 2
    # A writer holding the stale revision must conflict, not overwrite.
    with pytest.raises(ConflictError):
        b.write_doc("cases", "c1", {"x": 99}, expected_revision=rev)
    assert b.read_doc("cases", "c1")[0]["x"] == 2


def test_immutable_records_are_write_once(tmp_path):
    b = JsonFileBackend(tmp_path)
    b.put_immutable("calculations", "calc1", {"total": 1})
    with pytest.raises(ImmutableViolation):
        b.put_immutable("calculations", "calc1", {"total": 2})
    assert b.get_immutable("calculations", "calc1") == {"total": 1}
    with pytest.raises(UnknownRecord):
        b.get_immutable("calculations", "nope")


def test_stream_is_append_only_and_ordered(tmp_path):
    b = JsonFileBackend(tmp_path)
    for i in range(5):
        b.append("audit", {"n": i})
    assert [e["n"] for e in b.read_stream("audit")] == [0, 1, 2, 3, 4]


def test_retention_hook_requires_reason_and_leaves_tombstone(tmp_path):
    b = JsonFileBackend(tmp_path)
    b.write_doc("clients", "cl1", {"name": "x"}, expected_revision=None)
    with pytest.raises(PersistenceError):
        b.retire_doc("clients", "cl1", reason="  ", actor="admin")
    b.retire_doc("clients", "cl1", reason="client requested deletion", actor="admin")
    assert not b.doc_exists("clients", "cl1")
    # payload preserved (no destructive delete), tombstone in the audit stream
    retired = tmp_path / "retired" / "clients" / "cl1.json"
    assert retired.exists() and json.loads(retired.read_text())["name"] == "x"
    tombstones = [e for e in b.read_stream("audit") if e["action"] == "retire_doc"]
    assert tombstones and tombstones[0]["reason"] == "client requested deletion"


def test_export_all_round_trips(tmp_path):
    b = JsonFileBackend(tmp_path)
    b.write_doc("cases", "c1", {"x": 1}, expected_revision=None)
    b.put_immutable("calculations", "k1", {"y": 2})
    b.append("audit", {"z": 3})
    out = b.export_all()
    assert out["documents"]["cases"]["c1"]["x"] == 1
    assert out["immutable"]["calculations"]["k1"]["y"] == 2
    assert out["streams"]["audit"][0]["z"] == 3


# ------------------------------------------------------------- CaseStore --

def test_store_reads_pre_revision_layout(tmp_path):
    """A case file written before the revision field existed loads as rev 0
    and upgrades cleanly on the next write."""
    (tmp_path / "cases").mkdir(parents=True)
    (tmp_path / "cases" / "old1.json").write_text(json.dumps({
        "case_id": "old1", "created_by": "legacy", "created_at": "2025-01-01",
        "base_versions": [], "scenarios": [], "reviews": [],
        "calculation_ids": [], "idempotency": {}, "packages": [],
    }))
    store = CaseStore(tmp_path)
    assert store.case_exists("old1")
    store.idempotency_put("old1", "k", "v")  # read-modify-write upgrades _rev
    doc, rev = store.backend.read_doc("cases", "old1")
    assert rev == 1 and doc["idempotency"]["k"] == "v"


def test_store_tenant_scoping_recorded(tmp_path):
    store = CaseStore(tmp_path)
    cid = store.create_case("alice", tenant_id="tenant_a")
    doc, _ = store.backend.read_doc("cases", cid)
    assert doc["tenant_id"] == "tenant_a"
    audit = store.backend.read_stream("audit")
    assert any(e["action"] == "create_case" and "tenant_a" in e["detail"] for e in audit)


def test_store_duplicate_case_rejected(tmp_path):
    store = CaseStore(tmp_path)
    store.create_case("alice", case_id="case_x")
    with pytest.raises(StoreError):
        store.create_case("alice", case_id="case_x")


# --------------------------------------------------------------- records --

def _prov() -> Provenance:
    return Provenance(source_type="user_entry", input_class="historical_fact",
                      entered_by="tester", entered_at="2026-01-01T00:00:00Z")


def test_client_fact_is_immutable():
    fact = ClientFact(
        fact_id="f1", tenant_id="t1", client_id="c1", tax_year=2026,
        field_path="years.2026.income.wages", value=Decimal("100000"),
        provenance=_prov())
    with pytest.raises(Exception):
        fact.value = Decimal("1")  # frozen
    corrected = fact.model_copy(update={"fact_id": "f2", "value": Decimal("110000"),
                                        "supersedes": "f1"})
    assert corrected.supersedes == "f1" and fact.value == Decimal("100000")


def test_extracted_fact_is_never_born_approved():
    e = ExtractedFact(
        extraction_id="x1", tenant_id="t1", client_id="c1", document_id="d1",
        file_sha256="ab" * 32, extraction_method="regex:w2-box1",
        extraction_version="1.0", confidence=Decimal("0.42"),
        proposed_field_path="years.2026.income.wages",
        proposed_value=Decimal("100000"), tax_year=2026)
    assert e.reviewer_decision is None and e.resulting_fact_id is None
    with pytest.raises(Exception):
        e.reviewer_decision = "approved"  # frozen — approval issues a new record


def test_record_state_machine():
    validate_record_transition(RecordState.DRAFT, RecordState.IN_REVIEW)
    validate_record_transition(RecordState.IN_REVIEW, RecordState.APPROVED)
    validate_record_transition(RecordState.APPROVED, RecordState.SUPERSEDED)
    with pytest.raises(ValueError):
        validate_record_transition(RecordState.SUPERSEDED, RecordState.DRAFT)
    with pytest.raises(ValueError):
        validate_record_transition(RecordState.DRAFT, RecordState.APPROVED)  # review is not skippable
    assert ALLOWED_RECORD_TRANSITIONS[RecordState.ARCHIVED] == set()


def test_package_manifest_identity_fields():
    m = PackageManifest(
        manifest_id="m1", tenant_id="t1", case_id="case1",
        filename="pkg_x.xlsx", file_sha256="cd" * 32,
        generated_at="2026-01-01T00:00:00Z", generated_by="svc",
        engine_version="engine-0.1.0", ruleset_versions={2026: "us-federal-2026-v1"},
        base_version_id="base_1", reconciliation_status="passed",
        review_status="required")
    with pytest.raises(Exception):
        m.file_sha256 = "00" * 32  # frozen — issued identity cannot drift
