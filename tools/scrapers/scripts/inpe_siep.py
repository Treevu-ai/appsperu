"""inpe_siep.py — Población penitenciaria del INPE.

Portal oficial: https://siep.inpe.gob.pe
Geoportal ArcGIS: https://portal-inpe.opendata.arcgis.com

El ArcGIS REST permite hacer queries JSON con filtros, sin scraping HTML.
Patrón ArcGIS REST:
  https://{host}/arcgis/rest/services/{service}/FeatureServer/{layer}/query
    ?where={sql_where}&outFields=*&f=json&resultRecordCount={limit}

Uso:
  python -m tools.scrapers.scripts.inpe_siep
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


# Servicios ArcGIS del INPE. Validar contra el directorio del geoportal.
ARCGIS_SERVICES = [
    {
        "name": "poblacion_penitenciaria",
        "url": "https://services6.arcgis.com/u6NuecVNDzK2Mp9F/arcgis/rest/services/Poblacion_Penitenciaria/FeatureServer/0/query",
        "where": "1=1",
        "limit": 1000,
    },
    {
        "name": "establecimientos_penitenciarios",
        "url": "https://services6.arcgis.com/u6NuecVNDzK2Mp9F/arcgis/rest/services/Establecimientos_Penitenciarios/FeatureServer/0/query",
        "where": "1=1",
        "limit": 500,
    },
]


def fetch_arcgis_layer(service: dict, client: RateLimitedClient) -> dict:
    params = f"where={service['where']}&outFields=*&f=json&resultRecordCount={service['limit']}"
    url = f"{service['url']}?{params}"
    return client.get(url, as_json=True, timeout=60)


def run(out_dir: Path, client: RateLimitedClient, cache: DiskCache) -> list[Report]:
    reports = []
    for svc in ARCGIS_SERVICES:
        started = time.monotonic()
        rep = Report(
            entity="inpe",
            dataset=svc["name"],
            started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            duration_sec=0,
            source_url=svc["url"],
        )
        try:
            data, source = cache.get_or_fetch(
                f"inpe/{svc['name']}",
                lambda: fetch_arcgis_layer(svc, client),
            )
            # ArcGIS devuelve {"features": [...], "exceededTransferLimit": bool}
            features = data.get("features", []) if isinstance(data, dict) else []
            rep.items_total = len(features)
            rep.items_success = len(features)
            rep.notes = f"source={source} · exceededTransferLimit={data.get('exceededTransferLimit', False) if isinstance(data, dict) else 'N/A'}"
            out_path = out_dir / f"{svc['name']}.json"
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            rep.cache_path = str(out_path)
        except Exception as e:
            rep.items_failed = 1
            rep.add_error(svc["name"], str(e))
        rep.duration_sec = round(time.monotonic() - started, 2)
        reports.append(rep)
    return reports


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--cache-root", type=Path, default=Path(__file__).resolve().parent.parent / "cache")
    p.add_argument("--reports-dir", type=Path, default=Path(__file__).resolve().parent.parent / "reports")
    args = p.parse_args()

    out_dir = args.cache_root / "inpe" / time.strftime("%Y-%m-%d")
    out_dir.mkdir(parents=True, exist_ok=True)
    client = RateLimitedClient()
    cache = DiskCache(args.cache_root, ttl_days=7)

    reports = run(out_dir, client, cache)
    for rep in reports:
        append_report(args.reports_dir, rep)
        status = "✓" if rep.items_success else "✗"
        print(f"{status} {rep.entity}/{rep.dataset}: {rep.items_success}/{rep.items_total} items · {rep.notes}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
