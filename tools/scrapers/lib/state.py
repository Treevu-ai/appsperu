"""state.py — Ejecución resumible por namespace.

Permite que un script procese N items y, si se interrumpe, retome desde donde quedó.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


class ResumableState:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            self.data = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self.data = {"done": {}, "started_at": datetime.now(timezone.utc).isoformat()}

    def is_done(self, key: str) -> bool:
        return key in self.data.get("done", {})

    def mark_done(self, key: str, **meta) -> None:
        self.data.setdefault("done", {})[key] = {
            "at": datetime.now(timezone.utc).isoformat(),
            **meta,
        }
        self._persist()

    def mark_failed(self, key: str, error: str) -> None:
        self.data.setdefault("failed", {})[key] = {
            "at": datetime.now(timezone.utc).isoformat(),
            "error": error[:500],
        }
        self._persist()

    def summary(self) -> dict:
        return {
            "done": len(self.data.get("done", {})),
            "failed": len(self.data.get("failed", {})),
            "started_at": self.data.get("started_at"),
        }

    def _persist(self) -> None:
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)
