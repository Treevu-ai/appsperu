"""atu_transporte.py — Scraper de datos abiertos de la ATU Lima/Callao.

Portal: https://sistemas.protransporte.gob.pe/DatosAbiertos/

Categorías disponibles:
  Metropolitano      → /DatosAbiertos/Metropolitano
  Corredores Complementarios → /DatosAbiertos/CorredoresCompl
  Transporte Regular         → /DatosAbiertos/TransporteReg
  Transporte Especial        → /DatosAbiertos/TransporteEsp
  Ferroviario              → /DatosAbiertos/Ferroviario

Estrategia:
  - Cada categoría contiene subpáginas de reportes tipo /rpt001, /rpt002 ...
  - Cada reporte expone un endpoint JSON POST: /rptNNN_generar_datos
  - Se envía un rango amplio de fechas para obtener todo el histórico.
  - Los archivos XLS/PDF se generan en el cliente con Highcharts, por lo que
    no hay URLs estáticas para descargar. Este scraper usa el endpoint JSON.

Uso:
  python -m tools.scrapers.scripts.atu_transporte
  python -m tools.scrapers.scripts.atu_transporte --categories Metropolitano Ferroviario
  python -m tools.scrapers.scripts.atu_transporte --list                 # solo lista categorías
  python -m tools.scrapers.scripts.atu_transporte --fecini 2020-01-01 --fecfin 2024-12-31

Salidas:
  cache/atu_transporte/{category}_{slug}_{date}.json    — datos normalizados
  cache/atu_transporte/raw/{category}/                   — XLS originales descargados
  reports/atu_transporte_{date}.jsonl                   — reporte de calidad
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.cache import DiskCache
from lib.http import RateLimitedClient
from lib.quality import Report, append_report
from lib.normalizer import clean_text, parse_date

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = "https://sistemas.protransporte.gob.pe"
USER_AGENT = "Rastro-ATU-Scraper/1.0 (+https://rastro.fyi)"
OUT_DIR = Path(__file__).resolve().parent.parent / "cache" / "atu_transporte"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR = OUT_DIR / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)
MAX_SIZE_MB = 20

# Cliente HTTP con rate limit
client = RateLimitedClient(user_agent=USER_AGENT, default_timeout=60)

# Categorías y sus rutas
CATEGORIES: dict[str, dict] = {
    "Metropolitano": {
        "slug": "metropolitano",
        "path": "/DatosAbiertos/Metropolitano",
        "description": "Datos del Metropolitano de Lima (corredor rojo)",
    },
    "Corredores Complementarios": {
        "slug": "corredores-complementarios",
        "path": "/DatosAbiertos/CorredoresCompl",
        "description": "Datos de los corredores azules, rojos y alimentadores",
    },
    "Transporte Regular": {
        "slug": "transporte-regular",
        "path": "/DatosAbiertos/TransporteReg",
        "description": "Datos del transporte regular de Lima y Callao",
    },
    "Transporte Especial": {
        "slug": "transporte-especial",
        "path": "/DatosAbiertos/TransporteEsp",
        "description": "Datos de taxi, colectivo y otros modos especiales",
    },
    "Ferroviario": {
        "slug": "ferroviario",
        "path": "/DatosAbiertos/Ferroviario",
        "description": "Datos del sistema ferroviario (Metro de Lima en construcción)",
    },
}

DEFAULT_FECINI = "2022-01-01"
DEFAULT_FECFIN = "2024-12-31"

# Mapeo de extensiones a parsers
HAS_OPENPYXL = False
HAS_XLRD = False

try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    pass

try:
    import xlrd
    HAS_XLRD = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def fetch_html(url: str) -> str:
    """Descarga página HTML con rate limit."""
    last_err = None
    for attempt in range(3):
        try:
            client._wait(url)
            req = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed: {last_err}")


def fetch_file(url: str, dest: Path, max_bytes: int) -> dict[str, Any]:
    """Descarga archivo con HEAD check de tamaño. Devuelve metadata."""
    # HEAD para verificar tamaño
    try:
        client._wait(url)
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as resp:
            size = int(resp.headers.get("Content-Length") or 0)
            content_type = resp.headers.get("Content-Type", "")
    except Exception:
        size = 0
        content_type = ""

    if size > MAX_SIZE_MB * 1024 * 1024:
        return {
            "downloaded": False, "size": size, "local_path": "",
            "error": f"Archivo demasiado grande ({size / 1024 / 1024:.1f} MB, max {MAX_SIZE_MB} MB)",
        }

    try:
        client._wait(url)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            content = resp.read()
    except Exception as e:
        return {"downloaded": False, "size": size, "local_path": "", "error": str(e)[:200]}

    dest.write_bytes(content)
    return {
        "downloaded": True, "size": len(content),
        "local_path": str(dest), "content_type": content_type, "error": "",
    }


# ---------------------------------------------------------------------------
# Descubrimiento de enlaces en páginas
# ---------------------------------------------------------------------------

def discover_reports(html: str, base_url: str) -> list[dict[str, str]]:
    """Descubre subpáginas de reportes tipo /rptNNN dentro del HTML."""
    import re
    reports = []
    seen = set()

    for m in re.finditer(r'href=["\']([^"\']*?/rpt\d+[^"\']*)["\']', html):
        path = m.group(1)
        if path.startswith("http"):
            full_url = path
        elif path.startswith("/"):
            full_url = BASE_URL + path
        else:
            full_url = base_url.rstrip("/") + "/" + path
        code = re.search(r'/rpt(\d+)', path)
        report_id = code.group(1) if code else path.split("/")[-1]
        if report_id not in seen:
            seen.add(report_id)
            reports.append({
                "url": full_url,
                "report_id": report_id,
                "filename": f"rpt{report_id}",
            })

    return reports


def fetch_report_data(report_url: str, fecini: str, fecfin: str) -> dict[str, Any]:
    """Llama al endpoint JSON POST del reporte y devuelve el objeto resultado."""
    endpoint = report_url.rstrip("/") + "_generar_datos"
    payload = json.dumps({"fecini": fecini, "fecfin": fecfin}).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

    parsed = json.loads(raw)
    if not parsed.get("tipo") or "resultado" not in parsed:
        raise RuntimeError(f"Respuesta inesperada del endpoint: {raw[:200]}")

    return parsed["resultado"]


def export_category_csv(category: str, slug: str, date_str: str) -> None:
    """Exporta todos los JSONs de una categoría a CSV consolidado."""
    cat_dir = RAW_DIR / slug
    csv_dir = OUT_DIR / "csv"
    csv_dir.mkdir(parents=True, exist_ok=True)

    csv_path = csv_dir / f"{slug}_{date_str}.csv"
    files = sorted(cat_dir.glob(f"{slug}_*_{date_str}.json"))

    rows_written = 0
    with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=['periodo', 'total'])
        writer.writeheader()
        for f in files:
            try:
                data = json.loads(f.read_text(encoding='utf-8'))
                for row in data:
                    writer.writerow({
                        'periodo': row.get('periodo', ''),
                        'total': row.get('total', ''),
                    })
                    rows_written += 1
            except Exception:
                continue

    print(f"[csv] {csv_path.name}: {rows_written} filas", file=sys.stderr)


# ---------------------------------------------------------------------------
# Parser de XLS/XLSX
# ---------------------------------------------------------------------------

def parse_xls_content(content: bytes, filename: str) -> list[dict]:
    """Parsea contenido binario XLS/XLSX a lista de dicts."""
    rows_out = []

    # Detectar tipo por magic bytes
    is_xlsx = content[:4] == b"PK\x03\x04"  # ZIP = XLSX
    is_xls = content[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # OLE2 = XLS

    if is_xlsx and HAS_OPENPYXL:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                headers = []
                for i, row in enumerate(ws.iter_rows(values_only=True)):
                    if i == 0:
                        headers = [clean_text(str(c)) if c is not None else f"col_{j}"
                                   for j, c in enumerate(row)]
                        continue
                    if not any(c is not None for c in row):
                        continue
                    vals = [clean_text(str(c)) if c is not None else "" for c in row]
                    row_dict = dict(zip(headers, vals))
                    row_dict["_sheet"] = sheet_name
                    row_dict["_source_file"] = filename
                    rows_out.append(row_dict)
        except Exception as e:
            raise RuntimeError(f"openpyxl parse error: {e}")

    elif is_xls and HAS_XLRD:
        try:
            wb = xlrd.open_workbook(file_contents=content)
            for sheet_idx in range(wb.nsheets):
                ws = wb.sheet_by_index(sheet_idx)
                sheet_name = ws.name
                headers = []
                for i in range(ws.nrows):
                    row_vals = [ws.cell_value(i, j) for j in range(ws.ncols)]
                    if i == 0:
                        headers = [clean_text(str(c)) if c else f"col_{j}"
                                   for j, c in enumerate(row_vals)]
                        continue
                    if not any(c for c in row_vals):
                        continue
                    vals = [clean_text(str(c)) for c in row_vals]
                    row_dict = dict(zip(headers, vals))
                    row_dict["_sheet"] = sheet_name
                    row_dict["_source_file"] = filename
                    rows_out.append(row_dict)
        except Exception as e:
            raise RuntimeError(f"xlrd parse error: {e}")

    else:
        # No hay parser, guardar como binario
        raise RuntimeError(
            f"No se pudo parsear {filename}: "
            f"XLSX requiere openpyxl({'disponible' if HAS_OPENPYXL else 'NO INSTALADO'}, "
            f"XLS requiere xlrd({'disponible' if HAS_XLRD else 'NO INSTALADO'})"
        )

    return rows_out


# ---------------------------------------------------------------------------
# Ejecución
# ---------------------------------------------------------------------------

@dataclass
class CategoryResult:
    category: str
    slug: str
    url: str
    success: bool
    reports_found: int
    reports_scraped: int
    rows_extracted: int
    files: list[dict]
    error: str
    duration_sec: float


def scrape_category(category: str, meta: dict, max_bytes: int,
                    fecini: str = DEFAULT_FECINI,
                    fecfin: str = DEFAULT_FECFIN) -> CategoryResult:
    """Scrapea una categoría de la ATU vía endpoints JSON de reportes."""
    slug = meta["slug"]
    path = meta["path"]
    url = f"{BASE_URL}{path}"
    t0 = time.monotonic()

    cat_dir = RAW_DIR / slug
    cat_dir.mkdir(exist_ok=True)

    try:
        html = fetch_html(url)
    except Exception as e:
        return CategoryResult(
            category=category, slug=slug, url=url,
            success=False, reports_found=0, reports_scraped=0,
            rows_extracted=0, files=[], error=str(e)[:300],
            duration_sec=round(time.monotonic() - t0, 2),
        )

    reports = discover_reports(html, url)
    files_out = []
    rows_total = 0
    scraped = 0

    for report in reports:
        report_url = report["url"]
        report_id = report["report_id"]
        safe_id = "".join(c if c.isalnum() or c in ".-_" else "_" for c in report_id)

        try:
            result_data = fetch_report_data(report_url, fecini, fecfin)
            rows = result_data.get("periodo", [])
            totals = result_data.get("total", [])
            rows_count = max(len(rows), len(totals))

            if rows_count:
                records = [
                    {"periodo": p, "total": t}
                    for p, t in zip(rows, totals)
                ]
                # Guardar JSON del reporte
                date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                fname = f"{slug}_{safe_id}_{date_str}.json"
                out_path = cat_dir / fname
                out_path.write_text(
                    json.dumps(records, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                files_out.append({
                    "downloaded": True,
                    "size": out_path.stat().st_size,
                    "local_path": str(out_path),
                    "report_id": report_id,
                    "report_url": report_url,
                    "rows": rows_count,
                })
                rows_total += rows_count
                scraped += 1
        except Exception as e:
            files_out.append({
                "downloaded": False,
                "size": 0,
                "local_path": "",
                "report_id": report_id,
                "report_url": report_url,
                "error": str(e)[:200],
            })

    return CategoryResult(
        category=category, slug=slug, url=url,
        success=True,
        reports_found=len(reports),
        reports_scraped=scraped,
        rows_extracted=rows_total,
        files=files_out,
        error="",
        duration_sec=round(time.monotonic() - t0, 2),
    )


def run(out_dir: Path, categories: list[str], max_size: int,
        list_only: bool, fecini: str, fecfin: str) -> Report:
    started = time.monotonic()
    rep = Report(
        entity="atu",
        dataset="transporte_lima",
        started_at=datetime.now(timezone.utc).isoformat(),
        duration_sec=0,
        source_url=BASE_URL,
        notes="Scraper ATU Lima/Callao — JSON endpoints por reporte rptNNN",
    )

    if list_only:
        print(f"[categories] {len(CATEGORIES)} categorías disponibles:", file=sys.stderr)
        for cat, meta in CATEGORIES.items():
            print(f"  {cat}: {meta['description']}", file=sys.stderr)
        rep.items_total = len(CATEGORIES)
        rep.items_success = len(CATEGORIES)
        rep.duration_sec = round(time.monotonic() - started, 2)
        return rep

    target_categories = [c for c in categories] if categories else list(CATEGORIES.keys())
    rep.items_total = len(target_categories)

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    manifest: dict[str, Any] = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "fecini": fecini,
        "fecfin": fecfin,
        "total_categories": len(target_categories),
        "categories": [],
    }

    total_reports = 0
    total_rows = 0

    for cat in target_categories:
        if cat not in CATEGORIES:
            print(f"[skip] categoría desconocida: {cat}", file=sys.stderr)
            continue

        meta = CATEGORIES[cat]
        print(f"[{cat}] {meta['path']}...", end=" ", flush=True)

        result = scrape_category(cat, meta, max_size * 1024 * 1024, fecini, fecfin)
        total_reports += result.reports_scraped
        total_rows += result.rows_extracted

        if result.success:
            print(
                f"✓ {result.reports_found} reportes, "
                f"{result.reports_scraped} scrapeados, "
                f"{result.rows_extracted} filas",
                file=sys.stderr,
            )
        else:
            print(f"✗ {result.error[:80]}", file=sys.stderr)
            rep.add_error(cat, result.error[:200])

        manifest["categories"].append(asdict(result))

        # Guardar resultado de la categoría
        safe_slug = meta["slug"]
        out_path = out_dir / f"{safe_slug}_{date_str}.json"
        out_path.write_text(
            json.dumps(asdict(result), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # Exportar CSV consolidado por categoría
        export_category_csv(cat, safe_slug, date_str)

    manifest_path = out_dir / f"manifest_{date_str}.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[manifest] guardado en {manifest_path}", file=sys.stderr)

    rep.items_success = sum(1 for r in manifest["categories"] if r["success"])
    rep.items_failed = rep.items_total - rep.items_success
    rep.duration_sec = round(time.monotonic() - started, 2)

    print(
        f"Total: {rep.items_success}/{rep.items_total} categorías, "
        f"{total_reports} reportes, {total_rows} filas en {rep.duration_sec}s",
        file=sys.stderr,
    )
    return rep


def main() -> int:
    p = argparse.ArgumentParser(
        description="Scraper ATU Lima/Callao — datos abiertos de transporte"
    )
    p.add_argument("--categories", nargs="+",
                   help="Categorías a scrapear (ej: Metropolitano Ferroviario)")
    p.add_argument("--max-size", type=int, default=MAX_SIZE_MB,
                   help=f"Tamaño máximo por archivo en MB (default: {MAX_SIZE_MB})")
    p.add_argument("--list", dest="list_only", action="store_true",
                   help="Solo lista las categorías disponibles")
    p.add_argument("--fecini", default=DEFAULT_FECINI,
                   help="Fecha inicio del reporte (YYYY-MM-DD, default: %(default)s)")
    p.add_argument("--fecfin", default=DEFAULT_FECFIN,
                   help="Fecha fin del reporte (YYYY-MM-DD, default: %(default)s)")
    args = p.parse_args()

    cats = args.categories or []
    rep = run(OUT_DIR, cats, args.max_size, args.list_only, args.fecini, args.fecfin)

    reports_dir = Path(__file__).resolve().parent.parent / "reports"
    append_report(reports_dir, rep)

    print(
        f"Reporte: {rep.items_success}/{rep.items_total} categorías éxito, "
        f"{rep.items_failed} fallidas, {rep.duration_sec}s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
