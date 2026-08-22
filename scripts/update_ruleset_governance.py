"""Maintain ai_tax/rulesets/data/GOVERNANCE.json.

Adds governance entries for released ruleset files that do not have one yet
(deriving jurisdiction/year/status/citations/effective dates from the file
itself and computing the content checksum). Existing entries are NEVER
modified: if a released file's checksum no longer matches its recorded
entry, this script exits non-zero — that is the tamper signal, and the fix
is a new -vN release, not an edit.

New entries are created with review_status="pending" and no reviewer; a
human fills in reviewer/approved_at (and flips review_status to "approved")
as part of the release review. Only the initial pre-governance releases may
carry review_status="legacy-unreviewed".

Run: python scripts/update_ruleset_governance.py
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ai_tax import ENGINE_VERSION  # noqa: E402
from ai_tax.rulesets.governance import DATA_DIR, GOVERNANCE_PATH  # noqa: E402
from ai_tax.schemas import content_hash  # noqa: E402

GENERATOR = "scripts/build_rulesets.py"
GENERATOR_VERSION = "1.0"


def main() -> int:
    gov = {"governance_version": "1.0", "rulesets": {}}
    if GOVERNANCE_PATH.exists():
        gov = json.loads(GOVERNANCE_PATH.read_text())
    entries = gov.setdefault("rulesets", {})

    tampered = []
    added = []
    for path in sorted(DATA_DIR.glob("us-federal-*.json")):
        raw = json.loads(path.read_text())
        rid = raw["version"]
        checksum = content_hash(raw)
        if rid in entries:
            if entries[rid].get("checksum") != checksum:
                tampered.append(rid)
            continue
        entries[rid] = {
            "jurisdiction": raw["jurisdiction"],
            "tax_year": raw["tax_year"],
            "legal_status": "enacted" if raw["status"] == "enacted" else "projected",
            "effective_from": raw.get("effective_from"),
            "effective_to": raw.get("effective_to"),
            "source_citations": raw.get("source_references", []),
            "source_retrieved_at": str(date.today()),
            "generator": GENERATOR,
            "generator_version": GENERATOR_VERSION,
            "reviewer": None,
            "review_status": "pending",
            "approved_at": None,
            "superseded_by": None,
            "checksum": checksum,
            "compatible_engine_versions": [ENGINE_VERSION],
        }
        added.append(rid)

    if tampered:
        print("TAMPER DETECTED — released ruleset files no longer match their "
              "approved checksums:", file=sys.stderr)
        for rid in tampered:
            print(f"  {rid}", file=sys.stderr)
        print("Release a new -vN version with citations; never edit a released file.",
              file=sys.stderr)
        return 1

    GOVERNANCE_PATH.write_text(json.dumps(gov, indent=2, sort_keys=True) + "\n")
    print(f"governance entries: {len(entries)} total, {len(added)} added")
    for rid in added:
        print(f"  + {rid} (review_status=pending — needs reviewer sign-off)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
