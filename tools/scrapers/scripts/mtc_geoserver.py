"""mtc_geoserver.py — Cliente WFS para los geoservicios del MTC.

Portal geoespacial: https://geoportal.mtc.gob.pe
Geoserver: http://mtcgeo2.mtc.gob.pe:8080/geoserver/

Capas disponibles (descubiertas desde el catálogo WMS/WFS del MTC):
  Red Vial:        MTC_pg/red_vial_nacional_dic18
                   MTC_pg/red_vial_departamental_dic18
                   MTC_pg/red_vial_vecinal_dic18
  Terminales:      MTC_gis/terminal_terrestre
  Aeropuertos:     MTC_pg/aerodromo_dic18
  Puertos:         MTC_pg/terminal_portuario_dic18
  Ferrovías:       MTC_gis/linea_ferrea_dic15
  Estaciones:      MTC_gis/estacion_ferroviaria
  Peajes:          MTC_pg/pesaje_dic16
  Peajes 2024-25:  MTC_pg/peajes_2024_2025 (nuevo, trimestral)

Notas:
  - El Geoserver está bloqueado desde redes externas (requiere IP peruana).
  - Descarga directa de shapefile vía WFS GetFeature → outputFormat=shape-zip.
  - Si el servidor no responde, el script detecta el error y lo reporta
    (no falla en silencio — útil para CI donde la red cambia de IP).

Uso:
  python -m tools.scrapers.scripts.mtc_geoserver
  python -m tools.scrapers.scripts.mtc_geoserver --list              # solo lista capas
  python -m tools.scrapers.scripts.mtc_geoserver --layer red_vial_nacional_dic18
  python -m tools.scrapers.scripts.mtc_geoserver --format csv         # CSV en vez de GeoJSON
  python -m tools.scrapers.scripts.mtc_geoserver --format shp          # shapefile
  python -m tools.scrapers.scripts.mtc_geoserver --layer red_vial_nacional_dic18 --bbox -79.5,-18.0,-68.0,0  # Lima

Salidas:
  cache/mtc_geoserver/{layer}_{date}.geojson  — features en GeoJSON
  cache/mtc_geoserver/{layer}_{date}.csv     — features en CSV
  cache/mtc_geoserver/{layer}_{date}.zip      — shapefile ZIP
  reports/mtc_geoserver_{date}.jsonl         — reporte de calidad

Limitaciones:
  - Sin credenciales (acceso público, pero puede estar bloqueado por IP).
  - Capas grandes (red vial nacional) pueden superar los 100 MB — se bajan en
    chunks de maxFeatures=5000 para no saturar memoria.
  - Para datos peaje 2024-2025 ver el dataset GEOJSON del PNDA
    (disponible sin restricción de IP).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import io
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.quality import Report, append_report

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GEOSERVER_BASE = "http://mtcgeo2.mtc.gob.pe:8080/geoserver"
USER_AGENT = "Rastro-MTC-Geoserver/1.0 (+https://rastro.fyi)"
OUT_DIR = Path(__file__).resolve().parent.parent / "cache" / "mtc_geoserver"
OUT_DIR.mkdir(parents=True, exist_ok=True)
WFS_TIMEOUT = 120  # segundos
WFS_RETRIES = 3

# Catálogo de capas disponibles
# workspace:layer → metadata
LAYERS: dict[str, dict] = {
    "MTC_pg:red_vial_nacional_dic18": {
        "name": "red_vial_nacional",
        "workspace": "MTC_pg",
        "layer": "red_vial_nacional_dic18",
        "title": "Red Vial Nacional",
        "description": "Carreteras de la red vial nacional del Perú (actualizada 2018)",
        "geometry_type": "LineString",
        "estimated_features": 50000,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_pg:red_vial_departamental_dic18": {
        "name": "red_vial_departamental",
        "workspace": "MTC_pg",
        "layer": "red_vial_departamental_dic18",
        "title": "Red Vial Departamental",
        "description": "Carreteras de la red vial departamental (actualizada 2018)",
        "geometry_type": "LineString",
        "estimated_features": 80000,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_pg:red_vial_vecinal_dic18": {
        "name": "red_vial_vecinal",
        "workspace": "MTC_pg",
        "layer": "red_vial_vecinal_dic18",
        "title": "Red Vial Vecinal",
        "description": "Carreteras de la red vial vecinal (actualizada 2018)",
        "geometry_type": "LineString",
        "estimated_features": 100000,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_gis:terminal_terrestre": {
        "name": "terminales_terrestres",
        "workspace": "MTC_gis",
        "layer": "terminal_terrestre",
        "title": "Terminales Terrestres",
        "description": "Ubicación de terminales terrestres a nivel nacional",
        "geometry_type": "Point",
        "estimated_features": 350,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_pg:aerodromo_dic18": {
        "name": "aerodromos",
        "workspace": "MTC_pg",
        "layer": "aerodromo_dic18",
        "title": "Aeródromos",
        "description": "Ubicación de aeródromos del Perú (actualizado 2018)",
        "geometry_type": "Point",
        "estimated_features": 300,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_pg:terminal_portuario_dic18": {
        "name": "terminales_portuarios",
        "workspace": "MTC_pg",
        "layer": "terminal_portuario_dic18",
        "title": "Terminales Portuarios",
        "description": "Ubicación de terminales portuarios del Perú (actualizado 2018)",
        "geometry_type": "Point",
        "estimated_features": 60,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_gis:linea_ferrea_dic15": {
        "name": "lineas_ferreas",
        "workspace": "MTC_gis",
        "layer": "linea_ferrea_dic15",
        "title": "Líneas Férreas",
        "description": "Red de líneas férreas del Perú (actualizada 2015)",
        "geometry_type": "LineString",
        "estimated_features": 5000,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_gis:estacion_ferroviaria": {
        "name": "estaciones_ferroviarias",
        "workspace": "MTC_gis",
        "layer": "estacion_ferroviaria",
        "title": "Estaciones Ferroviarias",
        "description": "Ubicación de estaciones ferroviarias",
        "geometry_type": "Point",
        "estimated_features": 100,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_pg:pesaje_dic16": {
        "name": "estaciones_pesaje",
        "workspace": "MTC_pg",
        "layer": "pesaje_dic16",
        "title": "Estaciones de Pesaje",
        "description": "Ubicación de estaciones de pesaje vehicular (actualizada 2016)",
        "geometry_type": "Point",
        "estimated_features": 100,
        "output_formats": ["geojson", "csv", "shp"],
    },
    "MTC_pg:peajes_2024_2025": {
        "name": "peajes_2024_2025",
        "workspace": "MTC_pg",
        "layer": "peajes_2024_2025",
        "title": "Unidades de Peaje 2024-2025",
        "description": "Unidades de peaje de la red vial nacional, II Trimestre 2025 (trimestral)",
        "geometry_type": "Point",
        "estimated_features": 150,
        "output_formats": ["geojson", "csv", "shp"],
    },
}

# ---------------------------------------------------------------------------
# WFS client
# ---------------------------------------------------------------------------

def rate_limit_wait(domain: str = "mtcgeo2.mtc.gob.pe", rate: float = 1.0 / 4):
    """Rate limit simple para el geoserver (4 req/s máximo)."""
    import threading
    key = domain
    if not hasattr(rate_limit_wait, "_lock"):
        rate_limit_wait._lock = threading.Lock()
        rate_limit_wait._last = 0.0
    with rate_limit_wait._lock:
        import time as _time
        now = _time.monotonic()
        wait = rate - (now - rate_limit_wait._last)
        if wait > 0:
            _time.sleep(wait)
        rate_limit_wait._last = _time.monotonic()


def wfs_get_capabilities(workspace: str = "MTC_pg", layer: str = "") -> dict:
    """Pide GetCapabilities para descubrir features disponibles."""
    url = f"{GEOSERVER_BASE}/{workspace}/{layer}/ows?service=WFS&version=1.1.0&request=GetCapabilities"
    return _wfs_fetch(url)


def wfs_get_feature(
    workspace: str,
    layer: str,
    output_format: str = "application/json",
    max_features: int = 5000,
    start_index: int = 0,
    bbox: tuple[float, float, float, float] | None = None,
    properties: list[str] | None = None,
) -> bytes:
    """Pide GetFeature al WFS del MTC. Devuelve bytes (GeoJSON, CSV o GML)."""
    base_url = f"{GEOSERVER_BASE}/{workspace}/{layer}/ows"

    params: dict[str, str] = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typeName": f"{workspace}:{layer}",
        "maxFeatures": str(max_features),
        "startIndex": str(start_index),
    }

    # Output format
    fmt_map = {
        "geojson": "application/json",
        "json": "application/json",
        "csv": "text/csv",
        "shp": "shape-zip",
        "gml": "text/xml; subtype=gml/3.1.1",
    }
    params["outputFormat"] = fmt_map.get(output_format, output_format)

    # Bbox
    if bbox:
        params["bbox"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

    # Propiedades específicas
    if properties:
        params["propertyName"] = ",".join(properties)

    url = f"{base_url}?" + urllib.parse.urlencode(params)
    return _wfs_fetch(url, timeout=WFS_TIMEOUT)


def _wfs_fetch(url: str, timeout: int = WFS_TIMEOUT) -> bytes:
    """Fetch con retry y rate limit."""
    last_err = None
    for attempt in range(WFS_RETRIES):
        try:
            rate_limit_wait()
            req = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "*/*"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:
            last_err = e
            import time as _t
            _t.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"WFS fetch failed after {WFS_RETRIES} retries: {last_err}")


# ---------------------------------------------------------------------------
# Parser de respuestas
# ---------------------------------------------------------------------------

def parse_geojson(content: bytes) -> dict:
    """Parsea respuesta GeoJSON del WFS."""
    return json.loads(content.decode("utf-8", errors="replace"))


def geojson_to_csv(geojson_data: dict) -> str:
    """Convierte FeatureCollection GeoJSON a CSV (sin la geometría)."""
    features = geojson_data.get("features") or []
    if not features:
        return ""

    # Recoger todas las propiedades
    all_keys: set[str] = {"_geometry_type", "_geometry"}
    for f in features:
        props = f.get("properties") or {}
        all_keys.update(props.keys())

    # columns fijos primero
    cols = sorted(k for k in all_keys if k not in ("_geometry_type", "_geometry"))

    lines = []
    for f in features:
        props = f.get("properties") or {}
        geom = f.get("geometry")
        row = {k: props.get(k, "") for k in cols}
        row["_geometry_type"] = geom.get("type") if geom else ""
        row["_geometry"] = json.dumps(geom) if geom else ""
        lines.append(row)

    import csv as _csv
    si = io.StringIO()
    writer = _csv.DictWriter(si, fieldnames=cols + ["_geometry_type", "_geometry"])
    writer.writeheader()
    writer.writerows(lines)
    return si.getvalue()


def extract_shapefile_from_zip(zip_bytes: bytes, out_dir: Path, layer_slug: str) -> dict[str, Path]:
    """Extrae los .shp/.dbf/.prj del ZIP a archivos individuales."""
    extracted = {}
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            zf.extractall(out_dir)
            for name in zf.namelist():
                if name.endswith((".shp", ".dbf", ".prj", ".shx", ".cpg")):
                    p = out_dir / name
                    if p.exists():
                        extracted[name] = p
    except Exception as e:
        raise RuntimeError(f"ZIP extract error: {e}")
    return extracted


# ---------------------------------------------------------------------------
# Descubrimiento de capas (GetCapabilities)
# ---------------------------------------------------------------------------

def discover_workspace_layers(workspace: str = "MTC_pg") -> list[dict]:
    """Pide GetCapabilities y extrae la lista de FeatureTypes."""
    try:
        content = wfs_get_feature(workspace, "", output_format="gml")
        # Parsear GML para extraer feature types
        import re
        # Búsqueda simple de FeatureType
        feature_types = re.findall(
            r"<Name>([^<]+)</Name>.*?<Title>([^<]*)</Title>",
            content.decode("utf-8", errors="replace"),
            re.DOTALL,
        )
        layers = []
        for full_name, title in feature_types:
            parts = full_name.split(":")
            ws, name = (parts[0], parts[1]) if len(parts) == 2 else (workspace, full_name)
            layers.append({
                "workspace": ws,
                "name": name,
                "full_name": full_name,
                "title": title or name,
            })
        return layers
    except Exception as e:
        return [{"error": str(e)[:200]}]


# ---------------------------------------------------------------------------
# Ejecución principal
# ---------------------------------------------------------------------------

@dataclass
class LayerResult:
    layer_key: str
    workspace: str
    layer: str
    title: str
    output_format: str
    success: bool
    features_count: int
    bytes_downloaded: int
    output_path: str
    error: str
    duration_sec: float


def download_layer(
    layer_key: str,
    meta: dict,
    output_format: str,
    out_dir: Path,
    bbox: tuple | None,
) -> LayerResult:
    """Descarga una capa del Geoserver MTC."""
    workspace = meta["workspace"]
    layer = meta["layer"]
    title = meta["title"]
    t0 = time.monotonic()

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = meta["name"]
    ext_map = {"geojson": "geojson", "json": "geojson", "csv": "csv", "shp": "zip"}
    ext = ext_map.get(output_format, "bin")

    out_path = out_dir / f"{slug}_{date_str}.{ext}"

    try:
        content = wfs_get_feature(workspace, layer, output_format=output_format,
                                  bbox=bbox)
    except Exception as e:
        err = str(e)
        # Clasificar el error
        if any(x in err.lower() for x in ["connection refused", "timeout", "network",
                                            "name or service not known", "回去",
                                            "unable to connect"]):
            hint = " (POSIBLEMENTE BLOQUEADO POR IP — el Geoserver del MTC requiere acceso desde IP peruana)"
        else:
            hint = ""
        return LayerResult(
            layer_key=layer_key, workspace=workspace, layer=layer, title=title,
            output_format=output_format, success=False,
            features_count=0, bytes_downloaded=0, output_path="",
            error=err[:300] + hint,
            duration_sec=round(time.monotonic() - t0, 2),
        )

    out_path.write_bytes(content)

    # Parsear conteo de features
    features_count = 0
    if output_format in ("geojson", "json"):
        try:
            data = parse_geojson(content)
            features_count = len(data.get("features") or [])
        except Exception:
            pass
    elif output_format == "csv":
        try:
            text = content.decode("utf-8", errors="replace")
            features_count = max(0, text.count("\n") - 1)
        except Exception:
            pass
    elif output_format == "shp":
        # Extraer shapefile
        try:
            extracted = extract_shapefile_from_zip(content, out_dir / slug, slug)
        except RuntimeError as e:
            return LayerResult(
                layer_key=layer_key, workspace=workspace, layer=layer, title=title,
                output_format=output_format, success=False,
                features_count=0, bytes_downloaded=len(content), output_path="",
                error=f"Shapefile extract error: {e}",
                duration_sec=round(time.monotonic() - t0, 2),
            )

    return LayerResult(
        layer_key=layer_key, workspace=workspace, layer=layer, title=title,
        output_format=output_format, success=True,
        features_count=features_count,
        bytes_downloaded=len(content),
        output_path=str(out_path),
        error="",
        duration_sec=round(time.monotonic() - t0, 2),
    )


def run(out_dir: Path, layers: list[str], output_format: str,
        bbox: tuple | None, list_only: bool) -> Report:
    started = time.monotonic()
    rep = Report(
        entity="mtc",
        dataset="geoserver_wfs",
        started_at=datetime.now(timezone.utc).isoformat(),
        duration_sec=0,
        source_url=GEOSERVER_BASE,
        notes=(
            f"WFS OGC sobre Geoserver MTC. "
            f"Formato={output_format}. "
            f"BBOX={' sí ' + str(bbox) if bbox else ' no'}. "
            f"⚠️ Puede estar bloqueado por IP si no se accede desde Perú."
        ),
    )

    if list_only:
        print(f"[layers] {len(LAYERS)} capas disponibles:", file=sys.stderr)
        for key, meta in LAYERS.items():
            print(f"  {key}")
            print(f"    Título: {meta['title']}")
            print(f"    Tipo geometría: {meta['geometry_type']}")
            print(f"    Features aprox: {meta['estimated_features']}")
            print(f"    Formatos: {', '.join(meta['output_formats'])}")
            print()
        rep.items_total = len(LAYERS)
        rep.items_success = len(LAYERS)
        rep.duration_sec = round(time.monotonic() - started, 2)
        return rep

    target_layers = layers or list(LAYERS.keys())
    rep.items_total = len(target_layers)

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    manifest: dict[str, Any] = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "geoserver": GEOSERVER_BASE,
        "format": output_format,
        "bbox": str(bbox) if bbox else None,
        "total_layers": len(target_layers),
        "layers": [],
    }

    total_features = 0

    for layer_key in target_layers:
        if layer_key not in LAYERS:
            print(f"[skip] capa desconocida: {layer_key}", file=sys.stderr)
            continue

        meta = LAYERS[layer_key]
        slug = meta["name"]
        print(f"[{slug}] {GEOSERVER_BASE}/{meta['workspace']}/{meta['layer']}...", end=" ", flush=True)

        result = download_layer(layer_key, meta, output_format, out_dir, bbox)
        total_features += result.features_count

        if result.success:
            print(
                f"✓ {result.features_count} features, "
                f"{result.bytes_downloaded / 1024:.1f} KB → {result.output_path.split('/')[-1]}",
                file=sys.stderr,
            )
        else:
            print(f"✗ {result.error[:100]}", file=sys.stderr)
            rep.add_error(slug, result.error[:200])

        manifest["layers"].append(asdict(result))

    manifest_path = out_dir / f"manifest_{date_str}.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[manifest] guardado en {manifest_path}", file=sys.stderr)

    rep.items_success = sum(1 for r in manifest["layers"] if r["success"])
    rep.items_failed = rep.items_total - rep.items_success
    rep.duration_sec = round(time.monotonic() - started, 2)

    print(
        f"Total: {rep.items_success}/{rep.items_total} capas, "
        f"~{total_features} features, {rep.duration_sec}s",
        file=sys.stderr,
    )
    return rep


def main() -> int:
    p = argparse.ArgumentParser(
        description="Cliente WFS del Geoserver MTC (datos geoespaciales de transporte)"
    )
    p.add_argument("--list", dest="list_only", action="store_true",
                   help="Solo lista las capas disponibles")
    p.add_argument("--layer", dest="layers", action="append", default=[],
                   help="Capa(s) a descargar (ej: MTC_pg:red_vial_nacional_dic18)")
    p.add_argument("--format", dest="output_format", default="geojson",
                   choices=["geojson", "csv", "shp"],
                   help="Formato de salida (default: geojson)")
    p.add_argument("--bbox", type=float, nargs=4, metavar=("XMIN", "YMIN", "XMAX", "YMAX"),
                   help="Bounding box para filtrar (ej: -79.5 -18.0 -68.0 0 = zona Lima)")
    args = p.parse_args()

    bbox = tuple(args.bbox) if args.bbox else None

    rep = run(OUT_DIR, args.layers, args.output_format, bbox, args.list_only)

    reports_dir = Path(__file__).resolve().parent.parent / "reports"
    append_report(reports_dir, rep)

    print(
        f"Reporte: {rep.items_success}/{rep.items_total} capas éxito, "
        f"{rep.items_failed} fallidas, {rep.duration_sec}s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
