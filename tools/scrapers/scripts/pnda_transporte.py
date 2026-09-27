"""pnda_transporte.py — Descarga datasets de transporte desde el PNDA (datosabiertos.gob.pe).

Usa la API CKAN/DKAN del portal. Funciona igual que ckan_indexer.py pero:
  1. Solo filtra datasets cuyo topic/name/tag contenga "transporte" o variantes.
  2. Para cada dataset relevante, descarga los recursos (CSV, XLS, XLSX, JSON, GEOJSON).
  3. Guarda cada recurso normalizado en cache/ con estructura plana.

Uso:
  python -m tools.scrapers.scripts.pnda_transporte
  python -m tools.scrapers.scripts.pnda_transporte --quick           # sin HEAD checks, ~1 min
  python -m tools.scrapers.scripts.pnda_transporte --limit 50         # solo 50 datasets relevantes
  python -m tools.scrapers.scripts.pnda_transporte --org mtc           # filtro por org slug
  python -m tools.scrapers.scripts.pnda_transporte --list             # solo lista datasets, no descarga

Salidas:
  cache/pnda_transporte/datasets_{date}.json        — catálogo filtrado
  cache/pnda_transporte/resources_{date}.json       — recursos con URLs alive
  reports/pnda_transporte_{date}.jsonl             — reporte de calidad por corrida
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.cache import DiskCache
from lib.http import RateLimitedClient
from lib.quality import Report, append_report

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CKAN_BASE = "https://www.datosabiertos.gob.pe"
USER_AGENT = "Rastro-CKAN-Transporte/1.0 (+https://rastro.fyi)"
OUT_DIR = Path(__file__).resolve().parent.parent / "cache" / "pnda_transporte"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Keywords para filtrar datasets de transporte
TRANSPORTE_KEYWORDS = [
    "transporte", "tráfico", "trafico", "vehículo", "vehiculo",
    "carretera", "aeropuerto", "aerodromo", "puerto", "ferrocarril",
    "metro", "bus", "ruta", "paradero", "peaje", "licencia",
    "circulación", "circulacion", "vial", "terminal", "flota",
    "accidente", "velocidad", "pasajero", "carga", "ínea", "linea",
    "sutran", "osITRAN", "ositrán", "atu", "metro",
    "modalidad", "sistema integrado", "sit",
]

TRANSPORTE_ORGS = {
    "ministerio-de-transportes-y-comunicaciones-mtc",
    "autoridad-de-transporte-urbano-para-lima-y-callao-atu",
    "superintendencia-de-transporte-terrestre-de-personas-carga-y-mercancia",
    "organismo-supervisor-de-la-inversion-en-infraestructura-de-transporte-de-uso-p",
    "autoridad-portuaria-nacional-apn",
    "direccion-general-de-aeronautica-civil",
    "os-tran", "sutran", "atu",
}

# Formatos priorizados para descarga (en orden de preferencia)
PREFERRED_FORMATS = ["CSV", "XLS", "XLSX", "JSON", "GEOJSON", "XML"]

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

client = RateLimitedClient(user_agent=USER_AGENT, default_timeout=30)


def http_get_json(url: str) -> dict:
    """GET JSON con rate limit y retry."""
    last_err = None
    for attempt in range(3):
        try:
            client._wait(url)
            req = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed: {last_err}")


def http_head(url: str) -> dict:
    """HEAD con rate limit. Devuelve {status, content_length, error}."""
    try:
        client._wait(url)
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {
                "status": resp.status,
                "content_length": int(resp.headers.get("Content-Length") or 0),
                "error": None,
            }
    except urllib.error.HTTPError as e:
        return {"status": e.code, "content_length": 0, "error": str(e)}
    except Exception as e:
        return {"status": 0, "content_length": 0, "error": str(e)[:120]}


# ---------------------------------------------------------------------------
# CKAN API
# ---------------------------------------------------------------------------

def ckan_package_list() -> list[str]:
    """Lista todos los nombres de datasets."""
    print("[ckan] listando todos los datasets...", file=sys.stderr)
    data = http_get_json(f"{CKAN_BASE}/api/3/action/package_list")
    if not data.get("success"):
        raise RuntimeError(f"package_list failed: {data}")
    result = data["result"]
    print(f"[ckan] {len(result)} datasets en catálogo", file=sys.stderr)
    return result


def ckan_package_show(name: str) -> dict | None:
    """Detalle de un dataset. DKAN-safe (devuelve dict aunque venga como list[1])."""
    url = f"{CKAN_BASE}/api/3/action/package_show?id={urllib.parse.quote(name)}"
    try:
        data = http_get_json(url)
    except RuntimeError:
        return None
    if not data.get("success"):
        return None
    result = data["result"]
    if isinstance(result, list):
        result = result[0] if result else None
    if not isinstance(result, dict):
        return None
    return result


# ---------------------------------------------------------------------------
# Filtro de transporte
# ---------------------------------------------------------------------------

def es_transporte(pkg: dict) -> bool:
    """Decide si un dataset es relevante para transporte."""
    org = pkg.get("organization", {})
    org_name = ""
    if isinstance(org, dict):
        org_name = (org.get("name") or "").lower()
    elif isinstance(org, str):
        org_name = org.lower()

    org_id = org_name

    # Org exacta o parcial
    for og in TRANSPORTE_ORGS:
        if og in org_name or org_name in og:
            return True

    # Keywords en título, nombre, notas, tags
    searchable = " ".join([
        pkg.get("name", ""),
        pkg.get("title", ""),
        pkg.get("notes", ""),
    ]).lower()

    tags_raw = pkg.get("tags") or []
    tags = []
    if tags_raw and isinstance(tags_raw[0], dict):
        tags = [t.get("name", "") for t in tags_raw if t.get("name")]
    else:
        tags = [str(t) for t in tags_raw]

    searchable += " ".join(tags)

    matches = sum(1 for kw in TRANSPORTE_KEYWORDS if kw.lower() in searchable)
    return matches >= 1


# ---------------------------------------------------------------------------
# Normalización de recursos
# ---------------------------------------------------------------------------

def norm_resource(res: dict) -> dict:
    """Normaliza un recurso DKAN a dict plano."""
    size_raw = res.get("size")
    size_kb = None
    if size_raw is not None:
        try:
            size_kb = round(float(size_raw) / 1024, 1)
        except (TypeError, ValueError):
            pass

    fmt = (res.get("format") or "").upper().strip()
    if not fmt:
        url = res.get("url", "")
        if ".csv" in url.lower():
            fmt = "CSV"
        elif ".xlsx" in url.lower() or ".xls" in url.lower():
            fmt = "XLS"
        elif ".geojson" in url.lower():
            fmt = "GEOJSON"
        elif ".json" in url.lower():
            fmt = "JSON"
        elif ".xml" in url.lower():
            fmt = "XML"

    return {
        "id": res.get("id"),
        "name": res.get("name") or res.get("description") or "",
        "url": res.get("url") or "",
        "format": fmt,
        "size_kb": size_kb,
        "created": res.get("created"),
        "last_modified": res.get("last_modified") or res.get("revision_timestamp"),
        "description": (res.get("description") or "")[:240],
    }


def prioritize_resources(resources: list[dict]) -> list[dict]:
    """Ordena recursos: prioriza formatos preferidos, luego con URL."""
    ranked = []
    for r in resources:
        if not r.get("url"):
            continue
        fmt = r.get("format", "")
        score = 0
        for i, pf in enumerate(PREFERRED_FORMATS):
            if pf in fmt:
                score = len(PREFERRED_FORMATS) - i
                break
        ranked.append((score, r))
    ranked.sort(key=lambda x: -x[0])
    return [r for _, r in ranked]


# ---------------------------------------------------------------------------
# Descargador de recursos
# ---------------------------------------------------------------------------

@dataclass
class ResourceResult:
    resource_id: str
    url: str
    format: str
    downloaded: bool
    bytes_downloaded: int
    local_path: str
    error: str
    content_preview: str


def download_resource(res: dict, cache_dir: Path) -> ResourceResult:
    """Descarga un recurso al cache. Solo archivos pequeños (< 50 MB)."""
    url = res["url"]
    fmt = res["format"]
    rid = res.get("id", "unknown")

    # Verificar tamaño primero
    head = http_head(url)
    if head["status"] and 200 <= head["status"] < 400:
        size_bytes = head["content_length"]
        if size_bytes > 100 * 1024 * 1024:  # > 100 MB, saltar
            return ResourceResult(
                resource_id=rid, url=url, format=fmt,
                downloaded=False, bytes_downloaded=0,
                local_path="",
                error=f"Too large ({size_bytes / 1024 / 1024:.1f} MB, max 100 MB)",
                content_preview="",
            )

    # Descargar
    try:
        client._wait(url)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            content = resp.read()
    except Exception as e:
        return ResourceResult(
            resource_id=rid, url=url, format=fmt,
            downloaded=False, bytes_downloaded=0,
            local_path="",
            error=str(e)[:200],
            content_preview="",
        )

    # Guardar
    ext = fmt.lower() if fmt else "bin"
    safe_name = f"{rid}.{ext}"
    local_path = cache_dir / safe_name
    local_path.write_bytes(content)

    # Preview: primeras líneas
    preview = ""
    if fmt in ("CSV", "XLS", "XLSX", "JSON", "GEOJSON"):
        try:
            text = content[:2048].decode("utf-8", errors="replace")
            preview = text[:300]
        except Exception:
            pass

    return ResourceResult(
        resource_id=rid, url=url, format=fmt,
        downloaded=True, bytes_downloaded=len(content),
        local_path=str(local_path),
        error="",
        content_preview=preview,
    )


# ---------------------------------------------------------------------------
# Ejecución principal
# ---------------------------------------------------------------------------

def run(out_dir: Path, limit: int | None, org_filter: str | None,
        list_only: bool, quick: bool) -> Report:
    """Descarga todos los datasets de transporte del PNDA."""
    started = time.monotonic()
    rep = Report(
        entity="pnda",
        dataset="transporte",
        started_at=datetime.now(timezone.utc).isoformat(),
        duration_sec=0,
        source_url=CKAN_BASE,
        notes="Filtro CKAN/DKAN PNDA → solo datasets de transporte",
    )

    # 1. Listar todos los datasets
    try:
        all_names = ckan_package_list()
    except Exception as e:
        rep.add_error("package_list", str(e))
        rep.duration_sec = round(time.monotonic() - started, 2)
        return rep

    # 2. Filtrar los relevantes
    transporte_datasets: list[dict] = []
    seen_ids: set[str] = set()

    print(f"[filter] revisando {len(all_names)} datasets para transporte...", file=sys.stderr)
    for i, name in enumerate(all_names, 1):
        if i % 200 == 0:
            print(f"[filter] {i}/{len(all_names)}...", file=sys.stderr)
        if limit and len(transporte_datasets) >= limit:
            break

        pkg = ckan_package_show(name)
        if pkg is None:
            continue

        pkg_id = pkg.get("id") or name
        if pkg_id in seen_ids:
            continue
        seen_ids.add(pkg_id)

        if org_filter:
            org = pkg.get("organization") or {}
            org_name = (org.get("name") or "").lower()
            if org_filter.lower() not in org_name:
                continue

        if es_transporte(pkg):
            transporte_datasets.append(pkg)

    print(f"[filter] {len(transporte_datasets)} datasets de transporte encontrados", file=sys.stderr)
    rep.items_total = len(transporte_datasets)

    # 3. Guardar catálogo filtrado
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    catalog_path = out_dir / f"datasets_{date_str}.json"
    catalog_out = []
    for pkg in transporte_datasets:
        resources = [norm_resource(r) for r in (pkg.get("resources") or []) if r.get("url")]
        org = pkg.get("organization") or {}
        catalog_out.append({
            "id": pkg.get("id") or pkg.get("name"),
            "name": pkg.get("name"),
            "title": pkg.get("title") or pkg.get("name"),
            "notes": (pkg.get("notes") or "")[:500],
            "organization": (org.get("title") or org.get("name") or ""),
            "organization_name": org.get("name", ""),
            "tags": [t.get("name") if isinstance(t, dict) else str(t)
                     for t in (pkg.get("tags") or []) if t],
            "resources": resources,
            "num_resources": len(resources),
            "created": pkg.get("metadata_created"),
            "modified": pkg.get("metadata_modified"),
        })

    catalog_path.write_text(
        json.dumps(catalog_out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[catalog] guardado en {catalog_path}", file=sys.stderr)

    if list_only:
        rep.items_success = len(transporte_datasets)
        rep.duration_sec = round(time.monotonic() - started, 2)
        return rep

    # 4. Descargar recursos (solo si no es --quick)
    if quick:
        print("[skip] modo quick — no se descargan recursos", file=sys.stderr)
        rep.items_success = len(transporte_datasets)
        rep.duration_sec = round(time.monotonic() - started, 2)
        return rep

    # 5. Descargar recursos priorizados
    resources_dir = out_dir / f"resources_{date_str}"
    resources_dir.mkdir(exist_ok=True)
    all_resource_results: list[dict] = []

    downloaded_count = 0
    skipped_count = 0

    for ds in transporte_datasets:
        resources = [norm_resource(r) for r in (ds.get("resources") or []) if r.get("url")]
        prioritized = prioritize_resources(resources)
        # Solo el recurso mejor rankeado por dataset para no saturar
        if not prioritized:
            continue

        best = prioritized[0]
        ds_id = ds.get("id") or ds.get("name", "unknown")
        ds_cache_dir = resources_dir / ds_id.replace("/", "_")
        ds_cache_dir.mkdir(exist_ok=True)

        result = download_resource(best, ds_cache_dir)
        downloaded_count += 1 if result.downloaded else 0
        skipped_count += 0 if result.downloaded else 1

        all_resource_results.append({
            "dataset_id": ds_id,
            "dataset_title": ds.get("title", ""),
            **asdict(result),
        })

    # Guardar resultados de recursos
    resources_out_path = out_dir / f"resources_{date_str}.json"
    resources_out_path.write_text(
        json.dumps(all_resource_results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    rep.items_success = downloaded_count
    rep.items_failed = skipped_count
    rep.duration_sec = round(time.monotonic() - started, 2)

    # Preview de errores
    failed_results = [r for r in all_resource_results if not r["downloaded"]]
    for r in failed_results[:10]:
        rep.add_error(r["dataset_id"], r["error"])

    print(
        f"[done] {downloaded_count} recursos descargados, "
        f"{skipped_count} omitidos de {len(transporte_datasets)} datasets",
        file=sys.stderr,
    )

    return rep


def main() -> int:
    p = argparse.ArgumentParser(
        description="Descarga datasets de transporte desde el PNDA (datosabiertos.gob.pe)"
    )
    p.add_argument("--quick", action="store_true",
                   help="Solo lista datasets, no descarga recursos")
    p.add_argument("--limit", type=int, default=None,
                   help="Límite de datasets a procesar")
    p.add_argument("--org", dest="org_filter", default=None,
                   help="Filtrar por slug de organización (ej: mtc)")
    p.add_argument("--list", dest="list_only", action="store_true",
                   help="Solo lista datasets, no descarga nada")
    args = p.parse_args()

    rep = run(OUT_DIR, args.limit, args.org_filter, args.list_only, args.quick)

    # Guardar reporte
    reports_dir = Path(__file__).resolve().parent.parent / "reports"
    append_report(reports_dir, rep)

    print(
        f"Reporte: {rep.items_success}/{rep.items_total} datasets éxito, "
        f"{rep.items_failed} fallidos, {rep.duration_sec}s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
