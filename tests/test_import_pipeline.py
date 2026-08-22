"""Import-pipeline tests: upload validation and rejection audit, deterministic
extraction with provenance, review queue (low confidence / conflict /
duplicate / unsupported), preview, human decisions (approve / correct /
reject), supersede-not-overwrite semantics, decision immutability, and the
handoff into the existing scenario-override calculation flow."""
from __future__ import annotations

import itertools
from decimal import Decimal

import pytest

from ai_tax.imports import (
    ImportError_,
    ImportService,
    TextW2Extractor,
    basic_file_validator,
)
from ai_tax.persistence import JsonFileBackend
from ai_tax.records import DocumentScanStatus, RecordState


W2_TEXT = """ACME CORP — Wage and Tax Statement (W-2) 2026
Box 1  Wages, tips, other compensation   145,250.00
Box 2  Federal income tax withheld        23,400.00
"""


@pytest.fixture()
def svc(tmp_path):
    counter = itertools.count(1)
    return ImportService(
        JsonFileBackend(tmp_path),
        now_fn=lambda: "2026-08-22T00:00:00Z",
        id_fn=lambda prefix: f"{prefix}_{next(counter):06d}")


def _upload(svc, **kw):
    args = dict(tenant_id="t1", client_id="cl1", filename="w2.txt",
                media_type="text/plain", content=W2_TEXT.encode(),
                uploaded_by="preparer")
    args.update(kw)
    return svc.upload(**args)


# ------------------------------------------------------- upload/validation --

def test_file_validator_rules():
    assert basic_file_validator("a.txt", "text/plain", b"x") == DocumentScanStatus.CLEAN
    assert basic_file_validator("a.exe", "application/x-msdownload", b"x") == DocumentScanStatus.REJECTED_TYPE
    assert basic_file_validator("a.txt", "application/pdf", b"x") == DocumentScanStatus.REJECTED_TYPE  # ext/type mismatch
    assert basic_file_validator("a.txt", "text/plain", b"") == DocumentScanStatus.REJECTED_TYPE
    assert basic_file_validator("a.txt", "text/plain", b"x",
                                malware_scan=lambda c: "infected") == DocumentScanStatus.REJECTED_MALWARE


def test_upload_clean_and_classified(svc):
    doc = _upload(svc)
    assert doc.scan_status == DocumentScanStatus.CLEAN
    assert doc.classification == "W-2"
    assert len(doc.file_sha256) == 64


def test_rejected_upload_is_recorded_then_refused(svc):
    with pytest.raises(ImportError_):
        _upload(svc, filename="evil.exe", media_type="application/x-msdownload")
    audit = svc.backend.read_stream("audit")
    assert any(e["action"] == "import_upload" and "rejected_type" in e["detail"] for e in audit)


# ------------------------------------------------------------- extraction --

def test_extraction_carries_provenance_and_confidence(svc):
    doc = _upload(svc)
    facts = svc.extract(doc.document_id, W2_TEXT, 2026)
    by_field = {f.proposed_field_path: f for f in facts}
    wages = by_field["years.2026.income.wages"]
    assert wages.proposed_value == Decimal("145250.00")
    assert wages.file_sha256 == doc.file_sha256
    assert wages.extraction_method == "regex:text-w2"
    assert wages.page_or_location and wages.source_text
    assert by_field["years.2026.payments.federal_withholding"].proposed_value == Decimal("23400.00")


def test_extraction_is_not_authoritative(svc):
    """No ClientFact exists until a human decides."""
    doc = _upload(svc)
    svc.extract(doc.document_id, W2_TEXT, 2026)
    assert svc.approved_facts("cl1") == []
    assert all(item["requires_review"] for item in svc.review_queue("cl1"))


# ------------------------------------------------------------ review queue --

def test_low_confidence_flagged(svc):
    doc = _upload(svc)

    class ShakyExtractor(TextW2Extractor):
        def extract(self, text, tax_year):
            rows = super().extract(text, tax_year)
            for r in rows:
                r["confidence"] = Decimal("0.40")
            return rows

    svc.extract(doc.document_id, W2_TEXT, 2026, extractor=ShakyExtractor())
    queue = svc.review_queue("cl1")
    assert all(any("low confidence" in r for r in item["reasons"]) for item in queue)


def test_unsupported_field_flagged_and_unapprovable(svc):
    doc = _upload(svc)

    class RogueExtractor:
        method = "test:rogue"
        version = "0"
        def extract(self, text, tax_year):
            return [{"field_path": f"years.{tax_year}.income.self_employment_income",
                     "value": Decimal("50000"), "confidence": Decimal("0.99"),
                     "location": None, "source_text": None}]

    ex = svc.extract(doc.document_id, W2_TEXT, 2026, extractor=RogueExtractor())[0]
    queue = svc.review_queue("cl1")
    assert any("unsupported field" in r for item in queue for r in item["reasons"])
    with pytest.raises(ImportError_):
        svc.decide(ex.extraction_id, client_id="cl1", reviewer="rev", decision="approved")


def test_duplicate_extractions_flagged(svc):
    doc = _upload(svc)
    svc.extract(doc.document_id, W2_TEXT, 2026)
    svc.extract(doc.document_id, W2_TEXT, 2026)  # same document extracted twice
    queue = svc.review_queue("cl1")
    dup_reasons = [r for item in queue for r in item["reasons"] if "duplicate" in r]
    assert dup_reasons, "re-extracted values must be flagged as duplicates"


# ------------------------------------------------- decisions & supersession --

def test_approval_issues_fact_with_provenance(svc):
    doc = _upload(svc)
    ex = svc.extract(doc.document_id, W2_TEXT, 2026)[0]
    fact = svc.decide(ex.extraction_id, client_id="cl1", reviewer="rev", decision="approved")
    assert fact.review_state == RecordState.APPROVED
    assert fact.provenance.source_document == doc.document_id
    assert fact.provenance.entered_by == "rev"
    assert svc.approved_facts("cl1")[0].fact_id == fact.fact_id


def test_correction_records_both_values(svc):
    doc = _upload(svc)
    ex = svc.extract(doc.document_id, W2_TEXT, 2026)[0]
    fact = svc.decide(ex.extraction_id, client_id="cl1", reviewer="rev",
                      decision="corrected", corrected_value=Decimal("145000"))
    assert fact.value == Decimal("145000")
    decided = svc.backend.get_immutable("extracted_facts", f"{ex.extraction_id}_decided")
    assert decided["proposed_value"] == "145250.00"          # original preserved
    assert decided["final_value"] == "145000"
    assert decided["reviewer_decision"] == "corrected"


def test_conflicting_import_supersedes_never_overwrites(svc):
    doc = _upload(svc)
    ex1, _ = svc.extract(doc.document_id, W2_TEXT, 2026)
    first = svc.decide(ex1.extraction_id, client_id="cl1", reviewer="rev", decision="approved")

    corrected_text = W2_TEXT.replace("145,250.00", "150,000.00")
    doc2 = _upload(svc, filename="w2-corrected.txt", content=corrected_text.encode())
    ex2 = svc.extract(doc2.document_id, corrected_text, 2026)[0]
    queue = svc.review_queue("cl1")
    assert any("conflicts with approved fact" in r for item in queue for r in item["reasons"])

    second = svc.decide(ex2.extraction_id, client_id="cl1", reviewer="rev", decision="approved")
    assert second.supersedes == first.fact_id
    # Both records still exist; the effective set contains only the new one.
    assert svc.backend.get_immutable("client_facts", first.fact_id)["value"] == "145250.00"
    effective = {f.fact_id for f in svc.approved_facts("cl1")}
    assert effective == {second.fact_id}


def test_decision_is_immutable_and_rejection_creates_no_fact(svc):
    doc = _upload(svc)
    ex = svc.extract(doc.document_id, W2_TEXT, 2026)[0]
    assert svc.decide(ex.extraction_id, client_id="cl1", reviewer="rev", decision="rejected") is None
    assert svc.approved_facts("cl1") == []
    with pytest.raises(ImportError_):
        svc.decide(ex.extraction_id, client_id="cl1", reviewer="rev2", decision="approved")


# ------------------------------------------------------- calculation handoff --

def test_facts_flow_into_override_shape(svc):
    doc = _upload(svc)
    for ex in svc.extract(doc.document_id, W2_TEXT, 2026):
        svc.decide(ex.extraction_id, client_id="cl1", reviewer="rev", decision="approved")
    overrides = svc.facts_as_overrides("cl1")
    paths = {o["path"] for o in overrides}
    assert paths == {"years.2026.income.wages", "years.2026.payments.federal_withholding"}
    # Same grammar the scenario/calculation pipeline validates — the import
    # pipeline hands off, it does not calculate.
    from ai_tax.scenarios import parse_path
    for o in overrides:
        parse_path(o["path"])
