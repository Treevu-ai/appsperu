"""mimp_estadisticas.py — Estadísticas del MIMP (CEM, AURORA, Línea 100).

Portal oficial: https://www.gob.pe/71356-estadisticas-del-mimp
GeoMIMP: https://app.mimp.gob.pe/GeomimpWeb

Los reportes están disponibles como PDF ejecutivos. Para data granular, el portal
GeoMIMP expone endpoints internos que se pueden capturar.

Uso:
  python -m tools.scrapers.scripts.mimp_estadisticas
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


# Endpoints tentativos de GeoMIMP. Validar con DevTools.
ENDPOINTS = [
    ("cem_cobertura", "https://app.mimp.gob.pe/GeomimpWeb/api/cem?cobertura=true", 30),
    ("aurora_indicadores", "https://app.mimp.gob.pe/GeomimpWeb/api/aurora/indicadores", 30),
    ("linea_100", "https://app.mimp.gob.pe/GeomimpWeb/api/linea100?anio=2024", 30),
]


def fetch(url: str, client: RateLimitedClient) -> dict:
    return client.get(url, as_json=True, timeout=30)


def run(out_dir: Path, client: RateLimitedClient, cache: DiskCache) -> list[Report]:
    reports = []
    for name, url, ttl in ENDPOINTS:
        started = time.monotonic()
        rep = Report(
            entity="mimp",
            dataset=f"estadisticas_{name}",
            started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            duration_sec=0,
            source_url=url,
        )
        try:
            local_cache = DiskCache(cache.root, ttl_days=ttl)
            data, source = local_cache.get_or_fetch(
                f"mimp/estadisticas/{name}",
                lambda: fetch(url, client),
            )
            rep.items_total = 1
            rep.items_success = 1
            rep.notes = f"source={source} · ttl={ttl}d"
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

    out_dir = args.cache_root / "mimp" / "estadisticas" / time.strftime("%Y-%m-%d")
    out_dir.mkdir(parents=True, exist_ok=True)
    client = RateLimitedClient()
    cache = DiskCache(args.cache_root, ttl_days=30)

    reports = run(out_dir, client, cache)
    for rep in reports:
        append_report(args.reports_dir, rep)
        status = "✓" if rep.items_success else "✗"
        print(f"{status} {rep.entity}/{rep.dataset}: {rep.notes}")
    print()
    print("NOTA: Endpoints de GeoMIMP son tentativos. Validar con DevTools.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
