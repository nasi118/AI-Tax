"""Ruleset governance: the release record and validation gate for parameter sets.

`ai_tax/rulesets/GOVERNANCE.json` records, for every released ruleset version:
jurisdiction, tax year, legal status (enacted | proposed | projected |
superseded), effective dates, source citations, source retrieval date,
generator + generator version, reviewer, approval timestamp, superseding
version, a content checksum of the released file, and the engine versions
the ruleset is compatible with.

`validate_governance()` deterministically rejects:

* a data file without a governance entry (or an entry without its file);
* checksum mismatch — i.e. silent modification of a released ruleset;
* missing or empty source citations;
* more than one active ruleset for the same (jurisdiction, tax year) scope;
* projected/proposed law without the visible disclosure the engine surfaces
  (`provisional_policy.uncertainty_warning`, which drives RULES-PROV-001);
* an active ruleset that does not list a compatible engine version;
* an approved entry without reviewer + approval timestamp (the initial
  pre-governance releases are grandfathered as ``legacy-unreviewed`` and
  tracked in the issue backlog — new releases cannot use that status).

The sidecar is maintained by ``scripts/update_ruleset_governance.py``, which
only ever ADDS entries; it exits non-zero when an existing entry's checksum
no longer matches its file.
"""
from __future__ import annotations

import json
from pathlib import Path

from .. import ENGINE_VERSION
from ..schemas import content_hash

DATA_DIR = Path(__file__).resolve().parent / "data"
GOVERNANCE_PATH = DATA_DIR.parent / "GOVERNANCE.json"

LEGAL_STATUSES = {"enacted", "proposed", "projected", "superseded"}
# The one grandfathered review status for releases that predate governance.
LEGACY_REVIEW_STATUS = "legacy-unreviewed"

# File-status → allowed governance legal_status values.
_STATUS_MAP = {"enacted": {"enacted", "superseded"},
               "provisional": {"projected", "proposed", "superseded"}}


class GovernanceError(Exception):
    pass


def load_governance() -> dict:
    if not GOVERNANCE_PATH.exists():
        raise GovernanceError(f"missing governance file {GOVERNANCE_PATH}")
    return json.loads(GOVERNANCE_PATH.read_text())


def ruleset_checksum(ruleset_file: Path) -> str:
    return content_hash(json.loads(ruleset_file.read_text()))


def validate_governance(data_dir: Path = DATA_DIR) -> list[str]:
    """Return every violation found (empty list = valid)."""
    errors: list[str] = []
    gov = load_governance()
    entries: dict = gov.get("rulesets", {})
    files = {p.stem: p for p in sorted(data_dir.glob("us-federal-*.json"))}

    for rid in files:
        if rid not in entries:
            errors.append(f"{rid}: released data file has no governance entry")
    for rid in entries:
        if rid not in files:
            errors.append(f"{rid}: governance entry has no data file")

    active_scopes: dict[tuple, list[str]] = {}
    for rid, e in entries.items():
        path = files.get(rid)
        if path is None:
            continue
        raw = json.loads(path.read_text())

        if e.get("legal_status") not in LEGAL_STATUSES:
            errors.append(f"{rid}: legal_status {e.get('legal_status')!r} is not one of {sorted(LEGAL_STATUSES)}")
        elif e["legal_status"] not in _STATUS_MAP.get(raw.get("status"), set()):
            errors.append(f"{rid}: legal_status {e['legal_status']!r} inconsistent with file status {raw.get('status')!r}")

        if e.get("checksum") != content_hash(raw):
            errors.append(
                f"{rid}: checksum mismatch — the released ruleset file was modified "
                "after approval. Corrections require a NEW -vN version, never an edit.")

        if not e.get("source_citations"):
            errors.append(f"{rid}: missing source citations")
        if not e.get("source_retrieved_at"):
            errors.append(f"{rid}: missing source retrieval date")
        for field in ("effective_from", "effective_to", "generator", "generator_version"):
            if not e.get(field):
                errors.append(f"{rid}: missing {field}")

        if e.get("legal_status") in ("projected", "proposed"):
            warning = (raw.get("provisional_policy") or {}).get("uncertainty_warning")
            if not warning:
                errors.append(
                    f"{rid}: projected/proposed law without a visible disclosure "
                    "(provisional_policy.uncertainty_warning)")

        superseded = bool(e.get("superseded_by")) or e.get("legal_status") == "superseded"
        if not superseded:
            scope = (e.get("jurisdiction"), e.get("tax_year"))
            active_scopes.setdefault(scope, []).append(rid)
            if not e.get("compatible_engine_versions"):
                errors.append(f"{rid}: active ruleset lists no compatible engine versions")
            review_status = e.get("review_status")
            if review_status != LEGACY_REVIEW_STATUS and not (e.get("reviewer") and e.get("approved_at")):
                errors.append(f"{rid}: active ruleset lacks reviewer/approval timestamp")

    for scope, rids in active_scopes.items():
        if len(rids) > 1:
            errors.append(
                f"duplicate active rulesets for {scope[0]} tax year {scope[1]}: {sorted(rids)} "
                "— supersede all but one")
    return errors


def check_engine_compatibility(ruleset_id: str, engine_version: str = ENGINE_VERSION) -> None:
    """Raise when an engine/ruleset pair is not declared compatible."""
    gov = load_governance()
    entry = gov.get("rulesets", {}).get(ruleset_id)
    if entry is None:
        raise GovernanceError(f"ruleset {ruleset_id!r} has no governance entry")
    compatible = entry.get("compatible_engine_versions") or []
    if engine_version not in compatible:
        raise GovernanceError(
            f"engine {engine_version} is not declared compatible with ruleset "
            f"{ruleset_id} (compatible: {compatible})")
