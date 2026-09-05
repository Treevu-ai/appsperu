"""cache.py — Cache en disco con TTL por defecto.

Estructura:
  {root}/{namespace}/{YYYY-MM-DD}.json
  {root}/{namespace}/_meta.json  (última corrida, errores, etc.)

Si la corrida de hoy existe y es reciente (dentro de TTL), la devuelve sin volver a fetchear.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


class DiskCache:
    def __init__(self, root: Path, ttl_days: int = 1) -> None:
        self.root = Path(root)
        self.ttl_days = ttl_days

    def _dir(self, namespace: str) -> Path:
        d = self.root / namespace
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _path(self, namespace: str, date: str) -> Path:
        return self._dir(namespace) / f"{date}.json"

    def latest(self, namespace: str) -> dict | None:
        """Devuelve el snapshot más reciente dentro de TTL, o None si está vencido."""
        d = self._dir(namespace)
        files = sorted(d.glob("*.json"))
        if not files:
            return None
        latest_path = files[-1]
        # TTL check
        mtime = datetime.fromtimestamp(latest_path.stat().st_mtime, tz=timezone.utc)
        age_days = (datetime.now(timezone.utc) - mtime).days
        if age_days > self.ttl_days:
            return None
        return json.loads(latest_path.read_text(encoding="utf-8"))

    def save(self, namespace: str, data: dict, date: str | None = None) -> Path:
        date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        path = self._path(namespace, date)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return path

    def get_or_fetch(
        self,
        namespace: str,
        fetcher: Callable[[], dict],
        *,
        force: bool = False,
    ) -> tuple[dict, str]:
        """Si hay cache fresco, lo devuelve. Si no, corre fetcher() y guarda.

        Returns: (data, source) donde source es "cache" o "fresh".
        """
        if not force:
            cached = self.latest(namespace)
            if cached is not None:
                return cached, "cache"
        data = fetcher()
        self.save(namespace, data)
        return data, "fresh"
