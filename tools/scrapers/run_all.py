#!/usr/bin/env python3
"""run_all.py — Runner agregado para todos los scrapers.

Descubre los scripts en scripts/ y los corre en serie.
Genera un reporte consolidado.

Uso:
  python tools/scrapers/run_all.py
  python tools/scrapers/run_all.py --only sunat inpe
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS_DIR = HERE / "scripts"
REPORTS_DIR = HERE / "reports"


def list_scripts() -> list[str]:
    return sorted(p.stem for p in SCRIPTS_DIR.glob("*.py") if p.stem != "__init__")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--only", nargs="*", help="Solo correr estos scripts (nombres sin .py)")
    p.add_argument("--skip", nargs="*", default=[], help="Saltar estos scripts")
    args = p.parse_args()

    available = list_scripts()
    if args.only:
        unknown = set(args.only) - set(available)
        if unknown:
            print(f"ERROR: scripts no encontrados: {unknown}", file=sys.stderr)
            print(f"Disponibles: {available}", file=sys.stderr)
            return 1
        targets = args.only
    else:
        targets = [s for s in available if s not in args.skip]

    print(f"Corriendo {len(targets)} scrapers: {targets}\n")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    consolidated = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "scripts_run": targets,
        "results": [],
    }

    for name in targets:
        print(f"--- {name} ---")
        t0 = time.monotonic()
        try:
            mod = importlib.import_module(f"scripts.{name}")
            rc = mod.main()
        except SystemExit as e:
            rc = e.code if e.code is not None else 0
        except Exception as e:
            print(f"  ✗ crashed: {e}", file=sys.stderr)
            rc = 2
        elapsed = round(time.monotonic() - t0, 2)
        consolidated["results"].append({"script": name, "rc": rc, "elapsed_sec": elapsed})
        print(f"  rc={rc} en {elapsed}s\n")

    consolidated_path = REPORTS_DIR / f"consolidated-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
    consolidated_path.write_text(json.dumps(consolidated, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Reporte consolidado: {consolidated_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
