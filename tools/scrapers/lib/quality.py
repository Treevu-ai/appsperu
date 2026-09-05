"""quality.py — Reporte de calidad de una corrida de scraping."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Report:
    entity: str
    dataset: str
    started_at: str
    duration_sec: float
    items_total: int = 0
    items_success: int = 0
    items_failed: int = 0
    source_url: str = ""
    cache_path: str = ""
    errors_sample: list = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)

    def add_error(self, where: str, msg: str) -> None:
        if len(self.errors_sample) < 30:
            self.errors_sample.append({"where": where, "error": msg[:200]})

    def success_rate(self) -> float:
        return self.items_success / self.items_total if self.items_total else 0.0


def append_report(reports_dir: Path, report: Report, date: str | None = None) -> None:
    """Append el reporte como línea JSONL en {reports_dir}/{YYYY-MM-DD}.jsonl."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = reports_dir / f"{date}.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(report.to_dict(), ensure_ascii=False) + "\n")
