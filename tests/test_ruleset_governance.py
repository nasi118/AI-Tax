"""Ruleset governance tests: the shipped registry passes validation; each
deterministic rejection rule fires (missing citation, duplicate active scope,
silent modification of a released file, projected law without disclosure,
incompatible engine/ruleset pair, unreviewed new release)."""
from __future__ import annotations

import copy
import json

import pytest

from ai_tax.rulesets import governance as gv


def _fresh(monkeypatch, tmp_path, mutate_gov=None, mutate_file=None):
    """Copy the real data dir + governance sidecar into tmp, apply mutations,
    and point the module at the copies."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    for p in gv.DATA_DIR.glob("us-federal-*.json"):
        (data_dir / p.name).write_text(p.read_text())
    gov = json.loads(gv.GOVERNANCE_PATH.read_text())
    if mutate_gov:
        mutate_gov(gov)
    if mutate_file:
        mutate_file(data_dir)
    gov_path = tmp_path / "GOVERNANCE.json"
    gov_path.write_text(json.dumps(gov))
    monkeypatch.setattr(gv, "GOVERNANCE_PATH", gov_path)
    return data_dir


def test_shipped_registry_is_valid():
    assert gv.validate_governance() == []


def test_every_release_has_full_governance_record():
    gov = gv.load_governance()
    for rid, e in gov["rulesets"].items():
        assert e["source_citations"], rid
        assert e["source_retrieved_at"], rid
        assert e["legal_status"] in gv.LEGAL_STATUSES, rid
        assert e["checksum"], rid
        assert e["compatible_engine_versions"], rid
        assert e["generator"] and e["generator_version"], rid


def test_silent_modification_detected(monkeypatch, tmp_path):
    def tamper(data_dir):
        p = data_dir / "us-federal-2025-v1.json"
        raw = json.loads(p.read_text())
        raw["parameters"]["standard_deduction"]["single"] = 99999
        p.write_text(json.dumps(raw))
    data_dir = _fresh(monkeypatch, tmp_path, mutate_file=tamper)
    errs = gv.validate_governance(data_dir)
    assert any("checksum mismatch" in e and "us-federal-2025-v1" in e for e in errs)


def test_missing_citation_rejected(monkeypatch, tmp_path):
    def strip(gov):
        gov["rulesets"]["us-federal-2025-v1"]["source_citations"] = []
    data_dir = _fresh(monkeypatch, tmp_path, mutate_gov=strip)
    assert any("missing source citations" in e for e in gv.validate_governance(data_dir))


def test_duplicate_active_scope_rejected(monkeypatch, tmp_path):
    def dupe(gov):
        e = copy.deepcopy(gov["rulesets"]["us-federal-2026-v1"])
        gov["rulesets"]["us-federal-2026-v2"] = e
    def dupe_file(data_dir):
        p = data_dir / "us-federal-2026-v1.json"
        raw = json.loads(p.read_text())
        raw["version"] = "us-federal-2026-v2"
        (data_dir / "us-federal-2026-v2.json").write_text(json.dumps(raw))
    data_dir = _fresh(monkeypatch, tmp_path, mutate_gov=dupe, mutate_file=dupe_file)
    errs = gv.validate_governance(data_dir)
    assert any("duplicate active rulesets" in e and "2026" in e for e in errs)


def test_projected_without_disclosure_rejected(monkeypatch, tmp_path):
    def strip_warning(data_dir):
        p = data_dir / "us-federal-2027-v1.json"
        raw = json.loads(p.read_text())
        del raw["provisional_policy"]["uncertainty_warning"]
        p.write_text(json.dumps(raw))
    def resync_checksum(gov):
        pass  # checksum will also mismatch; both errors are acceptable signals
    data_dir = _fresh(monkeypatch, tmp_path, mutate_gov=resync_checksum,
                      mutate_file=strip_warning)
    errs = gv.validate_governance(data_dir)
    assert any("without a visible disclosure" in e for e in errs)


def test_new_release_cannot_skip_review(monkeypatch, tmp_path):
    def pending(gov):
        e = gov["rulesets"]["us-federal-2026-v1"]
        e["review_status"] = "pending"
        e["reviewer"] = None
        e["approved_at"] = None
    data_dir = _fresh(monkeypatch, tmp_path, mutate_gov=pending)
    assert any("lacks reviewer/approval" in e for e in gv.validate_governance(data_dir))


def test_incompatible_engine_pair_rejected(monkeypatch, tmp_path):
    def narrow(gov):
        gov["rulesets"]["us-federal-2026-v1"]["compatible_engine_versions"] = ["engine-9.9.9"]
    _fresh(monkeypatch, tmp_path, mutate_gov=narrow)
    with pytest.raises(gv.GovernanceError):
        gv.check_engine_compatibility("us-federal-2026-v1")


def test_unknown_ruleset_compatibility_rejected():
    with pytest.raises(gv.GovernanceError):
        gv.check_engine_compatibility("us-federal-1999-v1")
