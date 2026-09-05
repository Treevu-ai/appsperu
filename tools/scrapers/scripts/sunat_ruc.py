"""sunat_ruc.py — Wrapper del RUC de SUNAT.

NO scrapeamos el portal de SUNAT (CAPTCHA + throttling agresivo).
Usamos openruc.com, un tercero que ya rompió el CAPTCHA y expone el RUC como API
gratis, sin auth, edge-cached.

Uso:
  python -m tools.scrapers.scripts.sunat_ruc 20100047218
  python -m tools.scrapers.scripts.sunat_ruc --bulk rucs.txt

Riesgo documentado:
  openruc.com es un tercero. Si cae, hay que volver a scraping (no viable en prod).
  En el README de la arquitectura listamos esta dependencia como punto único de fallo.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Permitir import desde tools/scrapers/scripts/ o desde la raíz
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.cache import DiskCache
from lib.http import RateLimitedClient
from lib.quality import Report, append_report


def fetch_ruc(ruc: str, client: RateLimitedClient) -> dict:
    url = f"https://openruc.com/api/ruc/{ruc}"
    return client.get(url, as_json=True, timeout=10)


def run_single(ruc: str, out_path: Path, client: RateLimitedClient, cache: DiskCache) -> Report:
    started = time.monotonic()
    rep = Report(
        entity="sunat",
        dataset="ruc",
        started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        duration_sec=0,
        source_url=f"https://openruc.com/api/ruc/{ruc}",
    )
    try:
        data, source = cache.get_or_fetch(
            f"sunat/ruc/{ruc}",
            lambda: fetch_ruc(ruc, client),
        )
        rep.items_total = 1
        rep.items_success = 1
        rep.notes = f"source={source}"
    except Exception as e:
        rep.items_total = 1
        rep.items_failed = 1
        rep.add_error(ruc, str(e))
        data = {"ruc": ruc, "error": str(e)}

    rep.duration_sec = round(time.monotonic() - started, 2)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    rep.cache_path = str(out_path)
    return rep


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("ruc", nargs="?", help="RUC a consultar (11 dígitos)")
    p.add_argument("--bulk", type=Path, help="Archivo con un RUC por línea")
    p.add_argument("--cache-root", type=Path, default=Path(__file__).resolve().parent.parent / "cache")
    p.add_argument("--reports-dir", type=Path, default=Path(__file__).resolve().parent.parent / "reports")
    args = p.parse_args()

    if not args.ruc and not args.bulk:
        p.error("Especificá un RUC o --bulk archivo.txt")
    if args.ruc and not args.ruc.isdigit():
        p.error("RUC debe ser numérico")
    if args.ruc and len(args.ruc) != 11:
        p.error("RUC peruano debe tener 11 dígitos")

    client = RateLimitedClient()
    cache = DiskCache(args.cache_root, ttl_days=30)
    rucs = [args.ruc] if args.ruc else [l.strip() for l in args.bulk.read_text(encoding="utf-8").splitlines() if l.strip()]

    reports = []
    for ruc in rucs:
        date = time.strftime("%Y-%m-%d")
        out_path = args.cache_root / "sunat" / "ruc" / ruc / f"{date}.json"
        rep = run_single(ruc, out_path, client, cache)
        append_report(args.reports_dir, rep)
        reports.append(rep)
        if rep.items_success:
            print(f"✓ {ruc} (cache={'cache' if 'cache' in rep.notes else 'fresh'})")
        else:
            print(f"✗ {ruc}: {rep.errors_sample}")

    success = sum(r.items_success for r in reports)
    failed = sum(r.items_failed for r in reports)
    print(f"\n{success} ok · {failed} fail · {len(reports)} total")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
