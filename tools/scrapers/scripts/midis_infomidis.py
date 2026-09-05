"""midis_infomidis.py — Cobertura de programas MIDIS a nivel distrital.

Portal oficial: https://app.midis.gob.pe/Infomidis/
Geoportal: https://geoportal.midis.gob.pe

El portal expone CSV de indicadores distritales vía botones "Exportar".
Para evitar scraping del HTML dinámico, capturamos los endpoints REST que
consume el frontend. Validar con DevTools antes de usar en producción.

Uso:
  python -m tools.scrapers.scripts.midis_infomidis
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.cache import DiskCache
from lib.http import RateLimitedClient
from lib.quality import Report, append_report


# Endpoints tentativos del portal INFOMIDIS. Validar antes de usar.
# Estructura: (nombre, url, ttl_dias)
ENDPOINTS = [
    ("cobertura_distrital", "https://app.midis.gob.pe/Infomidis/api/cobertura?nivel=distrital", 30),
    ("indicadores_socioeconomicos", "https://app.midis.gob.pe/Infomidis/api/indicadores?tipo=socioeconomico", 30),
    ("desnutricion_cronica", "https://app.midis.gob.pe/Infomidis/api/dci?ano=2024", 30),
]


def fetch(url: str, client: RateLimitedClient) -> dict:
    return client.get(url, as_json=True, timeout=30)


def run(out_dir: Path, client: RateLimitedClient, cache: DiskCache) -> list[Report]:
    reports = []
    for name, url, ttl_days in ENDPOINTS:
        started = time.monotonic()
        rep = Report(
            entity="midis",
            dataset=f"infomidis_{name}",
            started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            duration_sec=0,
            source_url=url,
        )
        try:
            # TTL personalizado por dataset
            local_cache = DiskCache(cache.root, ttl_days=ttl_days)
            data, source = local_cache.get_or_fetch(
                f"midis/infomidis/{name}",
                lambda: fetch(url, client),
            )
            rep.items_total = 1
            rep.items_success = 1
            rep.notes = f"source={source} · ttl={ttl_days}d"
            out_path = out_dir / f"{name}.json"
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            rep.cache_path = str(out_path)
        except Exception as e:
            rep.items_failed = 1
            rep.add_error(name, str(e))
        rep.duration_sec = round(time.monotonic() - started, 2)
        reports.append(rep)
    return reports


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--cache-root", type=Path, default=Path(__file__).resolve().parent.parent / "cache")
    p.add_argument("--reports-dir", type=Path, default=Path(__file__).resolve().parent.parent / "reports")
    args = p.parse_args()

    out_dir = args.cache_root / "midis" / "infomidis" / time.strftime("%Y-%m-%d")
    out_dir.mkdir(parents=True, exist_ok=True)
    client = RateLimitedClient()
    cache = DiskCache(args.cache_root, ttl_days=30)

    reports = run(out_dir, client, cache)
    for rep in reports:
        append_report(args.reports_dir, rep)
        status = "✓" if rep.items_success else "✗"
        print(f"{status} {rep.entity}/{rep.dataset}: {rep.notes}")
    print()
    print("NOTA: Los endpoints de INFOMIDIS son tentativos. Validar con DevTools")
    print("      (Network tab) antes de usar en producción. Si cambian, actualizar")
    print("      la lista ENDPOINTS arriba.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
