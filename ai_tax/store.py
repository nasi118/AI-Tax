"""Case store: base-case lifecycle, immutable versions, reviews, audit log.

The store is the system of record (never chat history). Base versions and
calculation results are write-once; lifecycle progress mutates only the
`state` field through an enforced transition table, and every read/write is
appended to an audit log.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from .engine import validate_inputs
from .persistence import (
    ConflictError,
    ImmutableViolation,
    JsonFileBackend,
    PersistenceBackend,
    UnknownRecord,
)
from .projection import project_years
from .schemas import (
    BaseCaseVersion,
    CaseState,
    Household,
    CalculationResult,
    ProjectionPolicy,
    Provenance,
    ReviewRecord,
    ReviewState,
    Scenario,
    Severity,
    YearInputs,
)


class StoreError(Exception):
    pass


ALLOWED_TRANSITIONS: dict[CaseState, set[CaseState]] = {
    CaseState.DRAFT: {CaseState.READY_FOR_CALCULATION, CaseState.VALIDATION_FAILED},
    CaseState.IMPORTED: {CaseState.READY_FOR_CALCULATION, CaseState.VALIDATION_FAILED},
    CaseState.VALIDATION_FAILED: {CaseState.READY_FOR_CALCULATION, CaseState.VALIDATION_FAILED},
    CaseState.READY_FOR_CALCULATION: {CaseState.CALCULATED, CaseState.RECONCILIATION_FAILED},
    CaseState.CALCULATED: {CaseState.READY_FOR_REVIEW, CaseState.RECONCILIATION_FAILED},
    CaseState.RECONCILIATION_FAILED: {CaseState.READY_FOR_CALCULATION},
    CaseState.READY_FOR_REVIEW: {CaseState.APPROVED, CaseState.VALIDATION_FAILED},
    CaseState.APPROVED: {CaseState.SUPERSEDED},
    CaseState.SUPERSEDED: set(),
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class CaseStore:
    def __init__(
        self,
        root: Path,
        now_fn: Callable[[], str] = _utc_now,
        id_fn: Callable[[str], str] | None = None,
        backend: PersistenceBackend | None = None,
    ):
        """All storage flows through a PersistenceBackend (see persistence.py).

        The default JsonFileBackend preserves the historical on-disk layout,
        so existing stores load unchanged; passing a different backend is the
        supported path to a real database.
        """
        self.root = Path(root)
        self.backend = backend or JsonFileBackend(self.root)
        (self.root / "packages").mkdir(parents=True, exist_ok=True)
        self.now = now_fn
        self._id_fn = id_fn or (lambda prefix: f"{prefix}_{uuid.uuid4().hex[:12]}")

    # -- audit (append-only stream) ----------------------------------------
    def audit(self, actor: str, action: str, target: str, detail: str = "") -> None:
        self.backend.append("audit", {"at": self.now(), "actor": actor,
                                      "action": action, "target": target,
                                      "detail": detail})

    def new_id(self, prefix: str) -> str:
        return self._id_fn(prefix)

    # -- case document persistence ----------------------------------------
    def _load(self, case_id: str) -> dict:
        """Read a case document; the revision rides along for optimistic
        concurrency and is consumed again by _save."""
        try:
            doc, rev = self.backend.read_doc("cases", case_id)
        except UnknownRecord:
            raise StoreError(f"unknown case {case_id!r}")
        doc["_rev_loaded"] = rev
        return doc

    def _save(self, case_id: str, doc: dict) -> None:
        rev = doc.pop("_rev_loaded", None)
        try:
            self.backend.write_doc("cases", case_id, doc, expected_revision=rev)
        except ConflictError as e:
            raise StoreError(f"concurrent modification of case {case_id}: {e}")

    # -- cases -------------------------------------------------------------
    def create_case(self, created_by: str, case_id: Optional[str] = None,
                    tenant_id: str = "tenant_default") -> str:
        case_id = case_id or self.new_id("case")
        if self.backend.doc_exists("cases", case_id):
            raise StoreError(f"case {case_id} already exists")
        self.backend.write_doc("cases", case_id, {
            "case_id": case_id, "tenant_id": tenant_id,
            "created_by": created_by, "created_at": self.now(),
            "base_versions": [], "scenarios": [], "reviews": [],
            "calculation_ids": [], "idempotency": {}, "packages": [],
        }, expected_revision=None)
        self.audit(created_by, "create_case", case_id, f"tenant={tenant_id}")
        return case_id

    def case_exists(self, case_id: str) -> bool:
        return self.backend.doc_exists("cases", case_id)

    # -- base versions (immutable content; state transitions only) ---------
    def create_base_version(
        self,
        case_id: str,
        household: Household,
        base_inputs: YearInputs,
        policy: ProjectionPolicy,
        provenance: dict[str, Provenance],
        created_by: str,
        supersedes: Optional[str] = None,
    ) -> BaseCaseVersion:
        doc = self._load(case_id)
        now = self.now()
        years, projection_prov = project_years(
            base_inputs, policy, entered_by=created_by, entered_at=now)
        version = BaseCaseVersion(
            version_id=self.new_id("base"), case_id=case_id, state=CaseState.DRAFT,
            base_year=base_inputs.tax_year, household=household, years=years,
            projection_policy=policy,
            provenance={**provenance, **projection_prov},
            created_by=created_by, created_at=now, supersedes=supersedes,
            state_history=[{"state": "draft", "at": now, "by": created_by}],
        )
        doc["base_versions"].append(version.model_dump(mode="json"))
        self._save(case_id, doc)
        self.audit(created_by, "create_base_version", version.version_id)
        return version

    def get_base_version(self, case_id: str, version_id: str) -> BaseCaseVersion:
        doc = self._load(case_id)
        for raw in doc["base_versions"]:
            if raw["version_id"] == version_id:
                return BaseCaseVersion.model_validate(raw)
        raise StoreError(f"unknown base version {version_id!r} in case {case_id}")

    def list_base_versions(self, case_id: str) -> list[BaseCaseVersion]:
        return [BaseCaseVersion.model_validate(r) for r in self._load(case_id)["base_versions"]]

    def transition_base(
        self, case_id: str, version_id: str, new_state: CaseState, actor: str, note: str = ""
    ) -> BaseCaseVersion:
        doc = self._load(case_id)
        for raw in doc["base_versions"]:
            if raw["version_id"] == version_id:
                current = CaseState(raw["state"])
                if new_state not in ALLOWED_TRANSITIONS[current]:
                    raise StoreError(
                        f"illegal base-case transition {current.value} -> {new_state.value}")
                raw["state"] = new_state.value
                raw["state_history"].append(
                    {"state": new_state.value, "at": self.now(), "by": actor, "note": note})
                self._save(case_id, doc)
                self.audit(actor, "transition_base", version_id,
                           f"{current.value}->{new_state.value} {note}")
                return BaseCaseVersion.model_validate(raw)
        raise StoreError(f"unknown base version {version_id!r}")

    def validate_base(self, case_id: str, version_id: str, actor: str):
        """Run schema/business validation; move to ready_for_calculation or
        validation_failed. Returns (version, diagnostics)."""
        version = self.get_base_version(case_id, version_id)
        diags = validate_inputs(version.household, version.years)
        blocked = any(g.severity == Severity.ERROR for g in diags)
        target = CaseState.VALIDATION_FAILED if blocked else CaseState.READY_FOR_CALCULATION
        version = self.transition_base(case_id, version_id, target, actor,
                                       note=f"{len(diags)} diagnostics")
        return version, diags

    def approve_base(self, case_id: str, version_id: str, reviewer: str) -> BaseCaseVersion:
        version = self.get_base_version(case_id, version_id)
        if version.state != CaseState.READY_FOR_REVIEW:
            raise StoreError(
                f"base version must be ready_for_review to approve (is {version.state.value})")
        approved = self.transition_base(case_id, version_id, CaseState.APPROVED, reviewer)
        for other in self.list_base_versions(case_id):
            if other.version_id != version_id and other.state == CaseState.APPROVED:
                self.transition_base(case_id, other.version_id, CaseState.SUPERSEDED,
                                     reviewer, note=f"superseded by {version_id}")
        return approved

    # -- scenarios ---------------------------------------------------------
    def put_scenario(self, scenario: Scenario, actor: str) -> None:
        doc = self._load(scenario.case_id)
        for raw in doc["scenarios"]:
            if raw["scenario_id"] == scenario.scenario_id and raw["version"] == scenario.version:
                raise StoreError(
                    f"scenario {scenario.scenario_id} v{scenario.version} already exists (immutable)")
        doc["scenarios"].append(scenario.model_dump(mode="json"))
        self._save(scenario.case_id, doc)
        self.audit(actor, "put_scenario", f"{scenario.scenario_id}@v{scenario.version}")

    def get_scenario(self, case_id: str, scenario_id: str, version: Optional[int] = None) -> Scenario:
        doc = self._load(case_id)
        matches = [Scenario.model_validate(r) for r in doc["scenarios"]
                   if r["scenario_id"] == scenario_id]
        if not matches:
            raise StoreError(f"unknown scenario {scenario_id!r}")
        if version is not None:
            for s in matches:
                if s.version == version:
                    return s
            raise StoreError(f"unknown scenario version {scenario_id}@v{version}")
        return max(matches, key=lambda s: s.version)

    def list_scenarios(self, case_id: str) -> list[Scenario]:
        return [Scenario.model_validate(r) for r in self._load(case_id)["scenarios"]]

    # -- idempotency -------------------------------------------------------
    def idempotency_get(self, case_id: str, key: str) -> Optional[str]:
        return self._load(case_id)["idempotency"].get(key)

    def idempotency_put(self, case_id: str, key: str, result_ref: str) -> None:
        doc = self._load(case_id)
        doc["idempotency"][key] = result_ref
        self._save(case_id, doc)

    # -- calculations (write-once snapshots) -------------------------------
    def record_calculation(self, result: CalculationResult, actor: str) -> None:
        payload = result.model_dump(mode="json")
        payload["_result_hash"] = result.result_hash()
        try:
            self.backend.put_immutable("calculations", result.calculation_id, payload)
        except ImmutableViolation:
            raise StoreError(f"calculation {result.calculation_id} already recorded (immutable)")
        doc = self._load(result.case_id)
        doc["calculation_ids"].append(result.calculation_id)
        self._save(result.case_id, doc)
        self.audit(actor, "record_calculation", result.calculation_id,
                   f"target={result.target_id} recon={result.reconciliation_status}")

    def get_calculation(self, calculation_id: str) -> CalculationResult:
        try:
            raw = self.backend.get_immutable("calculations", calculation_id)
        except UnknownRecord:
            raise StoreError(f"unknown calculation {calculation_id!r}")
        stored_hash = raw.pop("_result_hash", None)
        result = CalculationResult.model_validate(raw)
        if stored_hash is not None and result.result_hash() != stored_hash:
            raise StoreError(
                f"calculation {calculation_id} failed integrity check: snapshot was altered")
        return result

    # -- audit packages (write-once) ---------------------------------------
    def register_package(self, case_id: str, filename: str, file_hash: str, actor: str) -> None:
        doc = self._load(case_id)
        for pkg in doc["packages"]:
            if pkg["filename"] == filename:
                raise StoreError(f"audit package {filename} already issued (immutable)")
        doc["packages"].append({"filename": filename, "hash": file_hash, "at": self.now()})
        self._save(case_id, doc)
        self.audit(actor, "register_package", filename, file_hash)

    # -- reviews -----------------------------------------------------------
    def request_review(self, case_id: str, target_id: str, reason: str,
                       evidence: list[str], requested_by: str) -> ReviewRecord:
        doc = self._load(case_id)
        record = ReviewRecord(
            review_id=self.new_id("rev"), target_id=target_id, reason=reason,
            evidence=evidence, requested_by=requested_by, requested_at=self.now())
        doc["reviews"].append(record.model_dump(mode="json"))
        self._save(case_id, doc)
        self.audit(requested_by, "request_review", record.review_id, reason)
        return record

    def resolve_review(self, case_id: str, review_id: str, reviewer: str,
                       state: ReviewState, findings: str) -> ReviewRecord:
        doc = self._load(case_id)
        for raw in doc["reviews"]:
            if raw["review_id"] == review_id:
                if raw["state"] in (ReviewState.APPROVED.value, ReviewState.REJECTED.value):
                    raise StoreError("review already resolved; adjustments create a new review")
                raw.update(state=state.value, reviewer=reviewer,
                           reviewed_at=self.now(), findings=findings)
                self._save(case_id, doc)
                self.audit(reviewer, "resolve_review", review_id, state.value)
                return ReviewRecord.model_validate(raw)
        raise StoreError(f"unknown review {review_id!r}")

    def list_reviews(self, case_id: str) -> list[ReviewRecord]:
        return [ReviewRecord.model_validate(r) for r in self._load(case_id)["reviews"]]
