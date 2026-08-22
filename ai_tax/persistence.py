"""Narrow persistence interface — the seam for a future real database.

Three primitives cover everything the application stores; a production
database backend implements exactly these and nothing else:

* **Documents** — mutable JSON documents with optimistic concurrency: every
  read returns a revision, every write declares the revision it expects
  (``None`` means "create"), and a mismatch raises ``ConflictError`` instead
  of silently overwriting a concurrent change.
* **Immutable records** — write-once JSON payloads (calculation snapshots,
  issued packages). A second write to the same id raises
  ``ImmutableViolation``; there is no update or delete.
* **Streams** — append-only JSONL (audit events). Entries can only be
  appended and read back in order.

Destructive deletion does not exist. ``retire_doc`` is the data-retention
hook: it moves a document to a ``retired/`` area with a required reason and
leaves a tombstone entry in the audit stream — historical tax calculations
are never destructively overwritten or silently removed.

The bundled ``JsonFileBackend`` keeps the existing on-disk layout
(``cases/*.json``, ``calculations/*.json``, ``audit.jsonl``) so stores
written by earlier versions load unchanged; documents gain a ``_rev``
counter on first write. Swapping in a database is a backend change only —
see docs/PERSISTENCE.md for the schema mapping and migration boundary.
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional


class PersistenceError(Exception):
    pass


class ConflictError(PersistenceError):
    """The document changed since it was read (optimistic-concurrency failure)."""


class ImmutableViolation(PersistenceError):
    """Attempted overwrite of a write-once record."""


class UnknownRecord(PersistenceError):
    pass


class PersistenceBackend(ABC):
    """The complete storage surface. Nothing above this layer touches disk."""

    # -- documents (revision-checked) ---------------------------------------
    @abstractmethod
    def read_doc(self, collection: str, doc_id: str) -> tuple[dict, int]:
        """Return (document, revision). Raises UnknownRecord."""

    @abstractmethod
    def write_doc(self, collection: str, doc_id: str, doc: dict,
                  expected_revision: Optional[int]) -> int:
        """Write and return the new revision.

        expected_revision=None creates (ConflictError if it already exists);
        otherwise the stored revision must match or ConflictError is raised.
        """

    @abstractmethod
    def doc_exists(self, collection: str, doc_id: str) -> bool: ...

    @abstractmethod
    def list_docs(self, collection: str) -> list[str]: ...

    @abstractmethod
    def retire_doc(self, collection: str, doc_id: str, reason: str, actor: str) -> None:
        """Data-retention hook: move a document out of the active set.

        Requires a reason; implementations must preserve the payload in a
        retired area (no destructive delete) and record a tombstone in the
        'audit' stream.
        """

    # -- immutable records ---------------------------------------------------
    @abstractmethod
    def put_immutable(self, collection: str, record_id: str, payload: dict) -> None: ...

    @abstractmethod
    def get_immutable(self, collection: str, record_id: str) -> dict: ...

    @abstractmethod
    def immutable_exists(self, collection: str, record_id: str) -> bool: ...

    @abstractmethod
    def list_immutable(self, collection: str) -> list[str]: ...

    # -- append-only streams -------------------------------------------------
    @abstractmethod
    def append(self, stream: str, entry: dict) -> None: ...

    @abstractmethod
    def read_stream(self, stream: str) -> list[dict]: ...

    # -- export / backup -----------------------------------------------------
    def export_all(self) -> dict[str, Any]:
        """Complete logical export (backup / portability / tenant export)."""
        out: dict[str, Any] = {"documents": {}, "immutable": {}, "streams": {}}
        for coll in self.document_collections():
            out["documents"][coll] = {
                doc_id: self.read_doc(coll, doc_id)[0] for doc_id in self.list_docs(coll)
            }
        for coll in self.immutable_collections():
            out["immutable"][coll] = {
                rid: self.get_immutable(coll, rid) for rid in self.list_immutable(coll)
            }
        for stream in self.streams():
            out["streams"][stream] = self.read_stream(stream)
        return out

    @abstractmethod
    def document_collections(self) -> list[str]: ...

    @abstractmethod
    def immutable_collections(self) -> list[str]: ...

    @abstractmethod
    def streams(self) -> list[str]: ...


def _safe_id(record_id: str) -> str:
    if not record_id.replace("_", "").replace("-", "").isalnum():
        raise PersistenceError(f"invalid record id {record_id!r}")
    return record_id


class JsonFileBackend(PersistenceBackend):
    """Development/demo backend over the existing JSON file layout.

    Layout compatibility: a store written by earlier versions (documents
    without ``_rev``) reads as revision 0 and upgrades on the next write.
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    # -- documents -----------------------------------------------------------
    def _doc_path(self, collection: str, doc_id: str) -> Path:
        d = self.root / _safe_id(collection)
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{_safe_id(doc_id)}.json"

    def read_doc(self, collection: str, doc_id: str) -> tuple[dict, int]:
        path = self._doc_path(collection, doc_id)
        if not path.exists():
            raise UnknownRecord(f"unknown {collection} document {doc_id!r}")
        doc = json.loads(path.read_text())
        rev = int(doc.pop("_rev", 0))
        return doc, rev

    def write_doc(self, collection: str, doc_id: str, doc: dict,
                  expected_revision: Optional[int]) -> int:
        path = self._doc_path(collection, doc_id)
        if expected_revision is None:
            if path.exists():
                raise ConflictError(f"{collection}/{doc_id} already exists")
            new_rev = 1
        else:
            if not path.exists():
                raise UnknownRecord(f"unknown {collection} document {doc_id!r}")
            current = int(json.loads(path.read_text()).get("_rev", 0))
            if current != expected_revision:
                raise ConflictError(
                    f"{collection}/{doc_id}: expected revision {expected_revision}, "
                    f"stored revision is {current} — reload and retry")
            new_rev = current + 1
        payload = dict(doc)
        payload["_rev"] = new_rev
        path.write_text(json.dumps(payload, indent=1, default=str))
        return new_rev

    def doc_exists(self, collection: str, doc_id: str) -> bool:
        return self._doc_path(collection, doc_id).exists()

    def list_docs(self, collection: str) -> list[str]:
        d = self.root / _safe_id(collection)
        if not d.exists():
            return []
        return sorted(p.stem for p in d.glob("*.json"))

    def retire_doc(self, collection: str, doc_id: str, reason: str, actor: str) -> None:
        if not reason.strip():
            raise PersistenceError("retiring a document requires a reason")
        path = self._doc_path(collection, doc_id)
        if not path.exists():
            raise UnknownRecord(f"unknown {collection} document {doc_id!r}")
        retired_dir = self.root / "retired" / _safe_id(collection)
        retired_dir.mkdir(parents=True, exist_ok=True)
        target = retired_dir / path.name
        if target.exists():
            raise ImmutableViolation(f"retired copy of {collection}/{doc_id} already exists")
        path.rename(target)
        self.append("audit", {"action": "retire_doc", "collection": collection,
                              "target": doc_id, "reason": reason, "actor": actor})

    # -- immutable records ---------------------------------------------------
    def _imm_path(self, collection: str, record_id: str) -> Path:
        d = self.root / _safe_id(collection)
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{_safe_id(record_id)}.json"

    def put_immutable(self, collection: str, record_id: str, payload: dict) -> None:
        path = self._imm_path(collection, record_id)
        if path.exists():
            raise ImmutableViolation(
                f"{collection}/{record_id} already recorded (write-once)")
        path.write_text(json.dumps(payload, indent=1, default=str))

    def get_immutable(self, collection: str, record_id: str) -> dict:
        path = self._imm_path(collection, record_id)
        if not path.exists():
            raise UnknownRecord(f"unknown {collection} record {record_id!r}")
        return json.loads(path.read_text())

    def immutable_exists(self, collection: str, record_id: str) -> bool:
        return self._imm_path(collection, record_id).exists()

    def list_immutable(self, collection: str) -> list[str]:
        return self.list_docs(collection)

    # -- streams -------------------------------------------------------------
    def _stream_path(self, stream: str) -> Path:
        return self.root / f"{_safe_id(stream)}.jsonl"

    def append(self, stream: str, entry: dict) -> None:
        with self._stream_path(stream).open("a") as f:
            f.write(json.dumps(entry, default=str) + "\n")

    def read_stream(self, stream: str) -> list[dict]:
        path = self._stream_path(stream)
        if not path.exists():
            return []
        return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]

    # -- inventory -----------------------------------------------------------
    DOCUMENT_COLLECTIONS = ["cases", "tenants", "users", "clients"]
    IMMUTABLE_COLLECTIONS = ["calculations", "documents_raw", "extracted_facts", "manifests"]
    STREAMS = ["audit"]

    def document_collections(self) -> list[str]:
        return [c for c in self.DOCUMENT_COLLECTIONS if (self.root / c).exists()]

    def immutable_collections(self) -> list[str]:
        return [c for c in self.IMMUTABLE_COLLECTIONS if (self.root / c).exists()]

    def streams(self) -> list[str]:
        return [s for s in self.STREAMS if self._stream_path(s).exists()]
