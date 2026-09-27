"""ositran_data.py — Scraper de OSITRAN Data (portal de datos abiertos).

Usa Playwright para extraer tablas dinámicas del portal de OSITRAN:
  https://serviciosdigitales.ositran.gob.pe:8443/PortalDatosOsitran/

El portal carga reportes vía JSP/JSPX con tablas HTML renderizadas en el servidor
(o semi-renderizadas con JS). Playwright espera el render completo antes de extraer.

Códigos de reportes descubiertos (desde el HTML del portal):
  Aeropuertos:    1, 2, 3, 4, 5, 6
  Carreteras:     7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
  Ferroviario:   (incluido en carreteras)
  Metro Lima:    22, 23, 24, 25, 27, 28, 29
  Puertos:       36, 49, 50, 51, 53, 54, 55
  Inversiones:   38, 39, 40, 41, 43
  Reclamos:      44, 45, 46, 47, 48
  Puentes:       56
  Atención:       30, 31
  Integridad:    57, 58, 59

Uso:
  python -m tools.scrapers.scripts.ositran_data
  python -m tools.scrapers.scripts.ositran_data --codes 1 2 3         # solo estos códigos
  python -m tools.scrapers.scripts.ositran_data --codes 30 31           # solo atención al usuario
  python -m tools.scrapers.scripts.ositran_data --timeout 30            # esperar más antes de extraer
  python -m tools.scrapers.scripts.ositran_data --list-codes            # solo muestra códigos disponibles

Salidas:
  cache/ositran_data/{code}_{slug}_{date}.json   — tabla normalizada por reporte
  cache/ositran_data/manifest_{date}.json         — índice de todos los reportes
  reports/ositran_data_{date}.jsonl              — reporte de calidad por corrida
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.cache import DiskCache
from lib.quality import Report, append_report

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = "https://serviciosdigitales.ositran.gob.pe:8443/PortalDatosOsitran"
REPORT_URL = f"{BASE_URL}/reporte.jsp"
USER_AGENT = "Rastro-OSITRAN-Scraper/1.0 (+https://rastro.fyi)"
OUT_DIR = Path(__file__).resolve().parent.parent / "cache" / "ositran_data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Mapa de códigos a metadata (descubierto desde el HTML del portal)
REPORT_CATALOG: dict[int, dict] = {
    # Aeropuertos
    1:  {"section": "aeropuertos", "slug": "info",         "label": "Aeropuertos - Información"},
    2:  {"section": "aeropuertos", "slug": "pasajeros",    "label": "Aeropuertos - Tráfico de pasajeros"},
    3:  {"section": "aeropuertos", "slug": "carga",        "label": "Aeropuertos - Tráfico de carga"},
    4:  {"section": "aeropuertos", "slug": "operaciones",  "label": "Aeropuertos - Tráfico de operaciones"},
    5:  {"section": "aeropuertos", "slug": "recaudacion",   "label": "Aeropuertos - Recaudación ingresos totales"},
    6:  {"section": "aeropuertos", "slug": "llamadas",     "label": "Aeropuertos - Llamadas de emergencia"},
    # Carreteras
    7:  {"section": "carreteras", "slug": "info",         "label": "Carreteras - Información"},
    8:  {"section": "carreteras", "slug": "trafico",       "label": "Carreteras - Tráfico vehicular"},
    9:  {"section": "carreteras", "slug": "imd",           "label": "Carreteras - IMD"},
    10: {"section": "carreteras", "slug": "ejes",          "label": "Carreteras - Ejes"},
    11: {"section": "carreteras", "slug": "recaudacion",   "label": "Carreteras - Recaudación"},
    12: {"section": "carreteras", "slug": "reclamos",      "label": "Carreteras - Reclamos"},
    13: {"section": "carreteras", "slug": "consumos",      "label": "Carreteras - Consumos"},
    14: {"section": "carreteras", "slug": "accidentes",    "label": "Carreteras - Accidentes"},
    15: {"section": "carreteras", "slug": "velocidad",     "label": "Carreteras - Velocidad promedio"},
    16: {"section": "carreteras", "slug": "tiempo",        "label": "Carreteras - Tiempo de recorrido"},
    17: {"section": "carreteras", "slug": "pavimento",     "label": "Carreteras - Estado de pavimento"},
    18: {"section": "carreteras", "slug": "senalizacion",  "label": "Carreteras - Señalización"},
    19: {"section": "carreteras", "slug": "iluminacion",   "label": "Carreteras - Iluminación"},
    20: {"section": "carreteras", "slug": "pasajes",       "label": "Carreteras - Pasajes"},
    21: {"section": "carreteras", "slug": "nivel-servicio","label": "Carreteras - Nivel de servicio"},
    # Metro de Lima
    22: {"section": "metro", "slug": "info",              "label": "Metro - Información"},
    23: {"section": "metro", "slug": "pasajeros",         "label": "Metro - Tráfico de pasajeros"},
    24: {"section": "metro", "slug": "km",                "label": "Metro - KM recorridos"},
    25: {"section": "metro", "slug": "recaudacion",      "label": "Metro - Recaudación"},
    27: {"section": "metro", "slug": "incidentes-bp",   "label": "Metro - Incidentes bienes y personas"},
    28: {"section": "metro", "slug": "incidentes-so",    "label": "Metro - Incidentes seguridad operativa"},
    29: {"section": "metro", "slug": "averias",          "label": "Metro - Averías"},
    # Puertos
    36: {"section": "puertos", "slug": "info",          "label": "Puertos - Información"},
    49: {"section": "puertos", "slug": "naves",         "label": "Puertos - Tráfico de naves"},
    50: {"section": "puertos", "slug": "carga",          "label": "Puertos - Tráfico de carga"},
    51: {"section": "puertos", "slug": "contenedores",  "label": "Puertos - Tráfico de contenedores"},
    53: {"section": "puertos", "slug": "accidentes",    "label": "Puertos - Accidentes"},
    54: {"section": "puertos", "slug": "ingresos-usd",  "label": "Puertos - Ingresos en dólares"},
    55: {"section": "puertos", "slug": "ingresos-pen",  "label": "Puertos - Ingresos en soles"},
    # Inversiones
    38: {"section": "inversiones", "slug": "info",       "label": "Inversiones - Información infraestructura"},
    39: {"section": "inversiones", "slug": "aeropuerto", "label": "Inversiones - Aeropuerto"},
    40: {"section": "inversiones", "slug": "carreteras", "label": "Inversiones - Carreteras"},
    41: {"section": "inversiones", "slug": "ferreas",    "label": "Inversiones - Vías férreas y Metro"},
    43: {"section": "inversiones", "slug": "puertos",    "label": "Inversiones - Puertos"},
    # Reclamos
    44: {"section": "reclamos", "slug": "info",         "label": "Reclamos - Información infraestructura"},
    45: {"section": "reclamos", "slug": "aeropuerto",   "label": "Reclamos - Aeropuerto"},
    46: {"section": "reclamos", "slug": "carreteras",   "label": "Reclamos - Carreteras"},
    47: {"section": "reclamos", "slug": "metro",        "label": "Reclamos - Metro de Lima"},
    48: {"section": "reclamos", "slug": "puertos",      "label": "Reclamos - Puertos"},
    # Puentes
    56: {"section": "puentes", "slug": "alerta",       "label": "Puentes en Alerta"},
    # Atención al usuario
    30: {"section": "atencion", "slug": "consultas",    "label": "Atención - Consultas de usuarios"},
    31: {"section": "atencion", "slug": "educacion",    "label": "Atención - Educación y acercamiento"},
    # Integridad
    57: {"section": "integridad", "slug": "dashboard",   "label": "Integridad - Dashboard"},
    58: {"section": "integridad", "slug": "servidores",  "label": "Integridad - Servidores"},
    59: {"section": "integridad", "slug": "proveedores", "label": "Integridad - Proveedores"},
}

DEFAULT_TIMEOUT = 20  # segundos esperando que la tabla cargue
DEFAULT_WAIT_FOR_SELECTOR = "table"

# ---------------------------------------------------------------------------
# Playwright helpers
# ---------------------------------------------------------------------------

_playwright_browser = None
_playwright_context = None


def get_browser():
    """Lanza Chromium una sola vez y reutiliza el contexto."""
    global _playwright_browser, _playwright_context
    if _playwright_browser is None:
        from playwright.sync_api import sync_playwright
        pw = sync_playwright().start()
        _playwright_browser = pw.chromium.launch(headless=True)
        _playwright_context = _playwright_browser.new_context(
            user_agent=USER_AGENT,
            ignore_https_errors=True,
        )
    return _playwright_browser, _playwright_context


def close_browser():
    global _playwright_browser, _playwright_context
    if _playwright_browser:
        try:
            _playwright_browser.close()
        except Exception:
            pass
        _playwright_browser = None
        _playwright_context = None


def extract_tables_from_page(page) -> list[list[list[str]]]:
    """Extrae todas las tablas de la página actual como listas de listas de strings."""
    tables_data = []

    def get_text(el):
        return (el.inner_text() or "").strip()

    def is_header_row(row_el):
        # Las filas de encabezado suelen tener <th> o estar en <thead>
        return bool(row_el.query_selector("th")) or bool(row_el.evaluate(
            "el => el.closest('thead') !== null"
        ))

    table_els = page.query_selector_all("table")
    for table_el in table_els:
        rows = table_el.query_selector_all("tr")
        table_rows = []
        for row in rows:
            cells = row.query_selector_all("th, td")
            cell_texts = [get_text(c) for c in cells]
            # Saltar filas vacías
            if any(c.strip() for c in cell_texts):
                table_rows.append(cell_texts)
        if table_rows:
            tables_data.append(table_rows)

    return tables_data


@dataclass
class ReportResult:
    code: int
    slug: str
    section: str
    label: str
    url: str
    success: bool
    tables_count: int
    rows_count: int
    cols_count: int
    headers: list[str]
    data: list[dict]
    error: str
    duration_sec: float


def scrape_report(code: int, timeout: int = DEFAULT_TIMEOUT) -> ReportResult:
    """Hace scrape de un reporte de OSITRAN. Devuelve tabla normalizada."""
    meta = REPORT_CATALOG.get(code, {
        "section": "unknown", "slug": str(code), "label": f"Reporte {code}"
    })
    slug = meta["slug"]
    section = meta["section"]
    label = meta["label"]
    url = f"{REPORT_URL}?code={code}"

    t0 = time.monotonic()

    try:
        browser, context = get_browser()
        page = context.new_page()

        # Navegar y esperar a que cargue
        page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)

        # Esperar tabla o cualquier contenido
        try:
            page.wait_for_selector("table", timeout=timeout * 1000)
        except Exception:
            pass  # puede que no tenga tabla, ok

        # Esperar un poco más para JS
        page.wait_for_timeout(2000)

        # Extraer tablas
        tables = extract_tables_from_page(page)
        page.close()

    except Exception as e:
        return ReportResult(
            code=code, slug=slug, section=section, label=label, url=url,
            success=False, tables_count=0, rows_count=0, cols_count=0,
            headers=[], data=[], error=str(e)[:300],
            duration_sec=round(time.monotonic() - t0, 2),
        )

    if not tables:
        return ReportResult(
            code=code, slug=slug, section=section, label=label, url=url,
            success=True, tables_count=0, rows_count=0, cols_count=0,
            headers=[], data=[],
            error="No se encontraron tablas en la página",
            duration_sec=round(time.monotonic() - t0, 2),
        )

    # Usar la tabla más grande (probablemente la principal)
    main_table = max(tables, key=lambda t: len(t))
    if not main_table:
        return ReportResult(
            code=code, slug=slug, section=section, label=label, url=url,
            success=True, tables_count=len(tables), rows_count=0, cols_count=0,
            headers=[], data=[],
            error="Tabla vacía",
            duration_sec=round(time.monotonic() - t0, 2),
        )

    # Primera fila = headers
    headers = main_table[0]
    rows = main_table[1:]

    # Normalizar a lista de dicts
    normalized_rows = []
    for row in rows:
        if len(row) >= len(headers):
            normalized_rows.append(dict(zip(headers, row[:len(headers)])))
        elif len(row) >= 2:
            # Si la fila tiene menos columnas,填充
            normalized_rows.append(dict(zip(headers[:len(row)], row)))

    return ReportResult(
        code=code, slug=slug, section=section, label=label, url=url,
        success=True,
        tables_count=len(tables),
        rows_count=len(normalized_rows),
        cols_count=len(headers),
        headers=headers,
        data=normalized_rows,
        error="",
        duration_sec=round(time.monotonic() - t0, 2),
    )


# ---------------------------------------------------------------------------
# Ejecución principal
# ---------------------------------------------------------------------------

def run(out_dir: Path, codes: list[int], timeout: int, list_only: bool) -> Report:
    started = time.monotonic()
    rep = Report(
        entity="ositran",
        dataset="datos_abiertos",
        started_at=datetime.now(timezone.utc).isoformat(),
        duration_sec=0,
        source_url=BASE_URL,
        notes="Scraper Playwright sobre OSITRAN Data — reportes dinámicos JSP",
    )

    try:
        if list_only:
            print(f"[codes] {len(REPORT_CATALOG)} códigos disponibles:", file=sys.stderr)
            for code, meta in sorted(REPORT_CATALOG.items()):
                print(f"  {code:3d} | {meta['section']:15s} | {meta['slug']:20s} | {meta['label']}", file=sys.stderr)
            rep.items_total = len(REPORT_CATALOG)
            rep.items_success = len(REPORT_CATALOG)
            rep.duration_sec = round(time.monotonic() - started, 2)
            return rep

        target_codes = codes or sorted(REPORT_CATALOG.keys())
        rep.items_total = len(target_codes)

        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        manifest: dict[str, Any] = {
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "total_reports": len(target_codes),
            "reports": [],
        }
        all_success = 0
        all_failed = 0

        for code in target_codes:
            meta = REPORT_CATALOG.get(code, {})
            slug = meta.get("slug", str(code))
            print(f"[{code:3d}] {slug}...", end=" ", flush=True)

            result = scrape_report(code, timeout=timeout)
            all_success += 1 if result.success else 0
            all_failed += 0 if result.success else 1

            if result.success:
                # Guardar JSON del reporte
                safe_slug = slug.replace("/", "_").replace(" ", "_")
                fname = f"{code:03d}_{safe_slug}_{date_str}.json"
                out_path = out_dir / fname
                out_path.write_text(
                    json.dumps(asdict(result), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                print(f"✓ {result.rows_count} filas, {result.cols_count} cols", file=sys.stderr)
            else:
                print(f"✗ {result.error[:80]}", file=sys.stderr)
                rep.add_error(f"code_{code}", result.error[:200])

            manifest["reports"].append({
                "code": code,
                "slug": slug,
                "section": result.section,
                "label": result.label,
                "url": result.url,
                "success": result.success,
                "tables_count": result.tables_count,
                "rows_count": result.rows_count,
                "cols_count": result.cols_count,
                "headers": result.headers[:20],  # primeras 20 columnas
                "error": result.error[:200],
                "duration_sec": result.duration_sec,
                "local_file": str(out_path) if (result.success and result.data) else "",
            })

        manifest_path = out_dir / f"manifest_{date_str}.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[manifest] guardado en {manifest_path}", file=sys.stderr)

    finally:
        close_browser()

    rep.items_success = all_success
    rep.items_failed = all_failed
    rep.duration_sec = round(time.monotonic() - started, 2)

    return rep


def main() -> int:
    p = argparse.ArgumentParser(
        description="Scraper Playwright de OSITRAN Data (datos abiertos)"
    )
    p.add_argument("--codes", type=int, nargs="+", default=None,
                   help="Códigos de reporte a scrapear (ej: 1 2 3)")
    p.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT,
                   help=f"Segundos de espera por página (default: {DEFAULT_TIMEOUT})")
    p.add_argument("--list-codes", dest="list_only", action="store_true",
                   help="Solo lista los códigos de reporte disponibles")
    args = p.parse_args()

    rep = run(OUT_DIR, args.codes or [], args.timeout, args.list_only)

    reports_dir = Path(__file__).resolve().parent.parent / "reports"
    append_report(reports_dir, rep)

    print(
        f"Reporte: {rep.items_success}/{rep.items_total} reportes éxito, "
        f"{rep.items_failed} fallidos, {rep.duration_sec}s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
