"""Document-import pipeline: upload → validate → classify → extract → map →
score → dedupe → preview → correct → approve → provenance-linked facts.

Design rules enforced in code, not prose:

* An extraction is NEVER authoritative. Extracted values become ClientFacts
  only through an explicit reviewer decision, and every decision is a new
  immutable record — the original extraction stays as evidence.
* Imported values never overwrite approved facts. An approval that collides
  with an existing approved fact issues a new fact that ``supersedes`` the
  old one; both remain readable forever.
* Low-confidence, conflicting, duplicate, or unsupported fields land in the
  review queue; nothing routes around a human.
* Field mapping reuses the scenario override grammar and allowlist
  (scenarios.parse_path), so imports cannot reach fields scenarios cannot.

Extractors and scanners are pluggable callables. This ships with:

* ``basic_file_validator`` — media-type/extension allowlist, size ceiling,
  and a malware-scan hook (a real scanner is a deployment integration; the
  hook's contract is scan(content) -> "clean" | "infected").
* ``keyword_classifier`` — deterministic document classification.
* ``TextW2Extractor`` — a deterministic, regex-based extractor for plain-text
  W-2 summaries (fixed patterns, no AI, no network), demonstrating the whole
  lifecycle end to end. Real parsers (PDF, OCR, LLM-assisted) plug in behind
  the same interface, and their output goes through the same review gate.
"""
from __future__ import annotations

import hashlib
import re
from decimal import Decimal
from pathlib import Path
from typing import Callable, Optional, Sequence

from .money import d
from .records import ClientFact, DocumentScanStatus, ExtractedFact, RecordState, SourceDocument
from .scenarios import ScenarioError, parse_path
from .schemas import InputClass, Provenance, SourceType
from .persistence import PersistenceBackend, UnknownRecord


class ImportError_(Exception):
    pass


REVIEW_CONFIDENCE_THRESHOLD = Decimal("0.90")

DOCUMENTS_COLLECTION = "documents_raw"
EXTRACTIONS_COLLECTION = "extracted_facts"
FACTS_COLLECTION = "client_facts"

ALLOWED_MEDIA = {
    "text/plain": {".txt"},
    "text/csv": {".csv"},
    "application/pdf": {".pdf"},
    "image/png": {".png"},
    "image/jpeg": {".jpg", ".jpeg"},
}
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def basic_file_validator(filename: str, media_type: str, content: bytes,
                         malware_scan: Optional[Callable[[bytes], str]] = None) -> DocumentScanStatus:
    ext = Path(filename).suffix.lower()
    if media_type not in ALLOWED_MEDIA or ext not in ALLOWED_MEDIA[media_type]:
        return DocumentScanStatus.REJECTED_TYPE
    if len(content) > MAX_UPLOAD_BYTES or len(content) == 0:
        return DocumentScanStatus.REJECTED_TYPE
    if malware_scan is not None and malware_scan(content) != "clean":
        return DocumentScanStatus.REJECTED_MALWARE
    return DocumentScanStatus.CLEAN


def keyword_classifier(filename: str, text: str) -> tuple[Optional[str], Decimal]:
    """Deterministic first-pass classification; humans can always override."""
    hay = (filename + " " + text[:4000]).lower()
    rules = [
        ("W-2", ("w-2", "wage and tax statement")),
        ("1099-INT", ("1099-int", "interest income")),
        ("1099-DIV", ("1099-div", "dividends and distributions")),
        ("1040", ("form 1040", "u.s. individual income tax return")),
    ]
    for label, needles in rules:
        if any(n in hay for n in needles):
            return label, Decimal("0.95")
    return None, Decimal("0")


class TextW2Extractor:
    """Deterministic plain-text W-2 extractor (fixed regex list, no AI)."""

    method = "regex:text-w2"
    version = "1.0"

    PATTERNS = [
        ("income.wages", re.compile(r"box\s*1\D+([\d,]+(?:\.\d{2})?)", re.I), Decimal("0.95")),
        ("payments.federal_withholding", re.compile(r"box\s*2\D+([\d,]+(?:\.\d{2})?)", re.I), Decimal("0.95")),
    ]

    def extract(self, text: str, tax_year: int) -> list[dict]:
        out = []
        for field, pattern, confidence in self.PATTERNS:
            m = pattern.search(text)
            if m:
                out.append({
                    "field_path": f"years.{tax_year}.{field}",
                    "value": d(m.group(1).replace(",", "")),
                    "confidence": confidence,
                    "location": f"char {m.start()}-{m.end()}",
                    "source_text": m.group(0)[:200],
                })
        return out


class ImportService:
    """Orchestrates the import lifecycle over the persistence backend."""

    def __init__(self, backend: PersistenceBackend, now_fn: Callable[[], str],
                 id_fn: Callable[[str], str],
                 malware_scan: Optional[Callable[[bytes], str]] = None):
        self.backend = backend
        self.now = now_fn
        self.new_id = id_fn
        self.malware_scan = malware_scan

    # -- 1-3: upload, validation, classification ----------------------------
    def upload(self, *, tenant_id: str, client_id: str, filename: str,
               media_type: str, content: bytes, uploaded_by: str) -> SourceDocument:
        scan = basic_file_validator(filename, media_type, content, self.malware_scan)
        sha = hashlib.sha256(content).hexdigest()
        text = content.decode("utf-8", errors="ignore") if media_type.startswith("text/") else ""
        classification, cls_conf = (None, Decimal("0"))
        if scan == DocumentScanStatus.CLEAN:
            classification, cls_conf = keyword_classifier(filename, text)
        doc = SourceDocument(
            document_id=self.new_id("doc"), tenant_id=tenant_id, client_id=client_id,
            filename=filename, media_type=media_type, file_sha256=sha,
            uploaded_by=uploaded_by, uploaded_at=self.now(), scan_status=scan,
            classification=classification,
            classification_confidence=cls_conf if classification else None)
        self.backend.put_immutable(DOCUMENTS_COLLECTION, doc.document_id,
                                   doc.model_dump(mode="json"))
        self.backend.append("audit", {
            "at": self.now(), "actor": uploaded_by, "action": "import_upload",
            "target": doc.document_id,
            "detail": f"{filename} sha256={sha[:16]} scan={scan.value} class={classification}"})
        if scan != DocumentScanStatus.CLEAN:
            raise ImportError_(
                f"upload rejected ({scan.value}): {filename} — recorded for audit, not processed")
        return doc

    def get_document(self, document_id: str) -> SourceDocument:
        return SourceDocument.model_validate(
            self.backend.get_immutable(DOCUMENTS_COLLECTION, document_id))

    # -- 4-7: extraction, mapping, confidence, duplicates -------------------
    def extract(self, document_id: str, text: str, tax_year: int,
                extractor=None, actor: str = "system") -> list[ExtractedFact]:
        doc = self.get_document(document_id)
        extractor = extractor or TextW2Extractor()
        results = []
        for raw in extractor.extract(text, tax_year):
            try:
                parse_path(raw["field_path"])  # allowlist + grammar gate
                supported = True
            except ScenarioError:
                supported = False
            ex = ExtractedFact(
                extraction_id=self.new_id("ext"), tenant_id=doc.tenant_id,
                client_id=doc.client_id, document_id=document_id,
                file_sha256=doc.file_sha256,
                page_or_location=raw.get("location"),
                source_text=raw.get("source_text"),
                extraction_method=getattr(extractor, "method", "unknown"),
                extraction_version=getattr(extractor, "version", "0"),
                confidence=raw["confidence"] if supported else Decimal("0"),
                proposed_field_path=raw["field_path"],
                proposed_value=raw["value"], tax_year=tax_year)
            self.backend.put_immutable(EXTRACTIONS_COLLECTION, ex.extraction_id,
                                       ex.model_dump(mode="json"))
            self.backend.append("audit", {
                "at": self.now(), "actor": actor, "action": "import_extract",
                "target": ex.extraction_id,
                "detail": f"{ex.proposed_field_path}={ex.proposed_value} "
                          f"conf={ex.confidence} supported={supported}"})
            results.append(ex)
        return results

    def approved_facts(self, client_id: str) -> list[ClientFact]:
        out = []
        for rid in self.backend.list_immutable(FACTS_COLLECTION):
            fact = ClientFact.model_validate(self.backend.get_immutable(FACTS_COLLECTION, rid))
            if fact.client_id == client_id and fact.review_state == RecordState.APPROVED:
                out.append(fact)
        superseded = {f.supersedes for f in out if f.supersedes}
        return [f for f in out if f.fact_id not in superseded]

    def _pending_extractions(self, client_id: str) -> list[ExtractedFact]:
        pending = []
        decided: set[str] = set()
        rows = []
        for rid in self.backend.list_immutable(EXTRACTIONS_COLLECTION):
            ex = ExtractedFact.model_validate(
                self.backend.get_immutable(EXTRACTIONS_COLLECTION, rid))
            if ex.client_id != client_id:
                continue
            rows.append((rid, ex))
            if ex.reviewer_decision is not None:
                decided.add(ex.extraction_id)
        for rid, ex in rows:
            if ex.reviewer_decision is None and ex.extraction_id not in decided and not rid.endswith("_decided"):
                pending.append(ex)
        return pending

    def review_queue(self, client_id: str) -> list[dict]:
        """Everything that needs a human: every pending extraction is listed,
        with the reasons it cannot be auto-trusted spelled out."""
        approved = {(f.tax_year, f.field_path): f for f in self.approved_facts(client_id)}
        seen: dict[tuple, str] = {}
        queue = []
        for ex in self._pending_extractions(client_id):
            reasons = []
            try:
                parse_path(ex.proposed_field_path)
            except ScenarioError as e:
                reasons.append(f"unsupported field: {e}")
            if ex.confidence < REVIEW_CONFIDENCE_THRESHOLD:
                reasons.append(f"low confidence {ex.confidence}")
            key = (ex.tax_year, ex.proposed_field_path)
            if key in approved and str(approved[key].value) != str(ex.proposed_value):
                reasons.append(
                    f"conflicts with approved fact {approved[key].fact_id} "
                    f"(current {approved[key].value})")
            if key in seen:
                reasons.append(f"duplicate of extraction {seen[key]}")
            else:
                seen[key] = ex.extraction_id
            queue.append({"extraction": ex, "reasons": reasons,
                          "requires_review": True})  # review is never optional
        return queue

    # -- 8-11: preview, correction, approval, provenance-linked facts -------
    def preview(self, extraction_id: str, client_id: str) -> dict:
        ex = ExtractedFact.model_validate(
            self.backend.get_immutable(EXTRACTIONS_COLLECTION, extraction_id))
        current = {(f.tax_year, f.field_path): f for f in self.approved_facts(client_id)}
        cur = current.get((ex.tax_year, ex.proposed_field_path))
        return {
            "extraction_id": ex.extraction_id,
            "field_path": ex.proposed_field_path,
            "proposed_value": ex.proposed_value,
            "current_approved_value": cur.value if cur else None,
            "would_supersede_fact": cur.fact_id if cur else None,
            "confidence": ex.confidence,
            "source": {"document_id": ex.document_id, "sha256": ex.file_sha256,
                       "location": ex.page_or_location, "text": ex.source_text},
        }

    def decide(self, extraction_id: str, *, client_id: str, reviewer: str,
               decision: str, corrected_value=None) -> Optional[ClientFact]:
        """Record the reviewer decision (immutable) and, on approval, issue
        the provenance-linked ClientFact. Never mutates the original
        extraction and never overwrites an approved fact."""
        if decision not in ("approved", "corrected", "rejected"):
            raise ImportError_(f"invalid decision {decision!r}")
        ex = ExtractedFact.model_validate(
            self.backend.get_immutable(EXTRACTIONS_COLLECTION, extraction_id))
        if self.backend.immutable_exists(EXTRACTIONS_COLLECTION, f"{extraction_id}_decided"):
            raise ImportError_(f"extraction {extraction_id} already decided (immutable)")
        if ex.client_id != client_id:
            raise ImportError_("extraction does not belong to this client")

        final_value = corrected_value if decision == "corrected" else ex.proposed_value
        fact: Optional[ClientFact] = None
        if decision in ("approved", "corrected"):
            try:
                parse_path(ex.proposed_field_path)
            except ScenarioError as e:
                raise ImportError_(f"cannot approve an unsupported field: {e}")
            current = {(f.tax_year, f.field_path): f for f in self.approved_facts(client_id)}
            prior = current.get((ex.tax_year, ex.proposed_field_path))
            fact = ClientFact(
                fact_id=self.new_id("fact"), tenant_id=ex.tenant_id,
                client_id=client_id, tax_year=ex.tax_year,
                field_path=ex.proposed_field_path, value=final_value,
                provenance=Provenance(
                    source_type=SourceType.DOCUMENT_IMPORT,
                    input_class=InputClass.HISTORICAL_FACT,
                    source_document=ex.document_id,
                    source_location=ex.page_or_location,
                    confidence=str(ex.confidence),
                    entered_by=reviewer, entered_at=self.now(),
                    validation_status="reviewer_approved"),
                review_state=RecordState.APPROVED,
                supersedes=prior.fact_id if prior else None)
            self.backend.put_immutable(FACTS_COLLECTION, fact.fact_id,
                                       fact.model_dump(mode="json"))
        decided = ex.model_copy(update={
            "reviewer": reviewer, "reviewer_decision": decision,
            "final_value": final_value if decision != "rejected" else None,
            "approved_at": self.now() if decision != "rejected" else None,
            "resulting_fact_id": fact.fact_id if fact else None})
        self.backend.put_immutable(EXTRACTIONS_COLLECTION, f"{extraction_id}_decided",
                                   decided.model_dump(mode="json"))
        self.backend.append("audit", {
            "at": self.now(), "actor": reviewer, "action": "import_decision",
            "target": extraction_id,
            "detail": f"{decision} {ex.proposed_field_path} -> "
                      f"{fact.fact_id if fact else 'no fact'}"})
        return fact

    # -- 12-13: recalculation inputs ----------------------------------------
    def facts_as_overrides(self, client_id: str) -> list[dict]:
        """Approved facts in scenario-override shape, ready for the existing
        preview/apply/calculate/reconcile flow (services + store). The import
        pipeline deliberately does NOT run its own calculation path."""
        return [{"path": f.field_path, "new_value": str(f.value),
                 "reason": f"imported fact {f.fact_id}",
                 "fact_id": f.fact_id}
                for f in self.approved_facts(client_id)]
