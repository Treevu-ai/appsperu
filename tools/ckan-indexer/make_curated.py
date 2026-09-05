#!/usr/bin/env python3
"""
make_curated.py — Genera el subset curado que se embebe en Rastro.

Lee:
  docs/inventario-fuentes/catalog.json
Escribe:
  apps/rastro-web/src/data/catalog-summary.json
  apps/rastro-web/src/data/catalog-curated.json
  apps/rastro-web/src/data/catalog-orgs.json

Estrategia de filtrado:
  En DKAN/PNDA el "organization" real no está poblado, pero el ministerio
  aparece como prefijo del título ("MINSA - SALUD MENTAL") o en los tags.
  Agrupamos por ese prefijo y priorizamos los grupos que más importan a Rastro.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
CATALOG = REPO / "docs" / "inventario-fuentes" / "catalog.json"
DATA_OUT = REPO / "apps" / "rastro-web" / "src" / "data"

# Ministerio / prefijo de título → label canónico (orden = prioridad)
PREFIX_MAP = [
    ("MEF", "Ministerio de Economía y Finanzas"),
    ("MINSA", "Ministerio de Salud"),
    ("MINEDU", "Ministerio de Educación"),
    ("MIDIS", "Ministerio de Desarrollo e Inclusión Social"),
    ("MVCS", "Ministerio de Vivienda, Construcción y Saneamiento"),
    ("MIMP", "Ministerio de la Mujer y Poblaciones Vulnerables"),
    ("MINJUS", "Ministerio de Justicia y Derechos Humanos"),
    ("MININTER", "Ministerio del Interior"),
    ("MTPE", "Ministerio de Trabajo y Promoción del Empleo"),
    ("MTC", "Ministerio de Transportes y Comunicaciones"),
    ("MINEM", "Ministerio de Energía y Minas"),
    ("PRODUCE", "Ministerio de la Producción"),
    ("MINCETUR", "Ministerio de Comercio Exterior y Turismo"),
    ("MINDEF", "Ministerio de Defensa"),
    ("RREE", "Ministerio de Relaciones Exteriores"),
    ("MINAM", "Ministerio del Ambiente"),
    ("MINCUL", "Ministerio de Cultura"),
    ("ESSALUD", "Seguro Social de Salud (EsSalud)"),
    ("SUNAT", "SUNAT"),
    ("RENIEC", "RENIEC"),
    ("BCRP", "Banco Central de Reserva del Perú"),
    ("SBS", "Superintendencia de Banca y Seguros"),
    ("INEI", "Instituto Nacional de Estadística e Informática"),
    ("OSCE", "Organismo Supervisor de las Contrataciones del Estado"),
    ("CGR", "Contraloría General de la República"),
    ("ONPE", "Oficina Nacional de Procesos Electorales"),
    ("JNE", "Jurado Nacional de Elecciones"),
    ("SUNARP", "Superintendencia Nacional de los Registros Públicos"),
    ("SUSALUD", "Superintendencia Nacional de Salud"),
    ("SUNEDU", "Superintendencia Nacional de Educación Superior"),
    ("CEPLAN", "Centro Nacional de Planeamiento Estratégico"),
    ("PCM", "Presidencia del Consejo de Ministros"),
    ("INVIERTE", "Invierte.pe"),
]

# Tags que indican datasets relevantes para Rastro
RASTRO_TAGS = {
    "inversion", "inversión", "obras", "contratacion", "contratación",
    "compras", "presupuesto", "ejecucion", "ejecución", "transparencia",
    "contralor", "auditoría", "auditoria", "control", "licitacion", "licitación",
    "proveedor", "entidades", "viáticos", "viaticos",
}


def detect_org(ds: dict) -> str | None:
    """Devuelve el label canónico de la org, o None si no se puede identificar.

    Estrategia en orden:
    1) Prefijo en el título ("MINSA -", "BCRP -")
    2) Tag directo con el nombre del ministerio
    3) URL del dataset o del resource que menciona el ministerio
    4) Heurística: "Poder ejecutivo" + "Transparencia" → MEF (Portal de Transparencia)
    """
    title = (ds.get("title") or "").strip()
    title_upper = title.upper()
    tags = [t.lower() for t in ds.get("tags", [])]

    # 1) Prefijo en el título
    for prefix, label in PREFIX_MAP:
        if title_upper.startswith(prefix + " ") or title_upper.startswith(prefix + ":") or title_upper.startswith(prefix + " -") or title_upper.startswith(prefix + " -"):
            return label

    # 2) Tag match (más laxo)
    for prefix, label in PREFIX_MAP:
        if any(prefix.lower() == t or prefix.lower() in t for t in tags):
            return label

    # 3) URL match
    url_blob = ((ds.get("url") or "") + " " + " ".join(r.get("url", "") for r in ds.get("resources", []))).lower()
    for prefix, label in PREFIX_MAP:
        if f".{prefix.lower()}." in url_blob or f"/{prefix.lower()}/" in url_blob or f"-{prefix.lower()}-" in url_blob or f"_{prefix.lower()}_" in url_blob:
            return label

    # 4) Heurística: MEF "Poder ejecutivo" + keywords de transparencia
    title_lower = title.lower()
    tag_blob = " ".join(tags)
    if "poder ejecutivo" in tag_blob or "poder ejecutivo" in title_lower:
        mef_keywords = ["viático", "viatico", "vehículo", "vehiculo", "publicidad", "teléfono", "telefono",
                        "orden", "personal", "tramite", "trámite", "presupuesto", "inversión", "inversion",
                        "remuneración", "remuneracion", "transferencia", "pasantía", "pasantia"]
        if any(k in title_lower or k in tag_blob for k in mef_keywords):
            return "MEF · Portal de Transparencia"

    # 5) Heurística: SUNAT por keywords fiscales
    sunat_keywords = ["tributario", "tributaria", "ruc", "comprobante", "factura electrónica",
                      "igv", "impuesto", "declaración", "declaracion", "contribuyente"]
    if any(k in title_lower for k in sunat_keywords):
        return "SUNAT"

    # 6) Heurística: INEI por keywords estadísticos
    if "inei" in title_lower or "censo" in title_lower or "enaho" in title_lower or "encuesta nacional" in title_lower:
        return "Instituto Nacional de Estadística e Informática"

    # 7) Heurística: ESSALUD por keywords
    if "essalud" in title_lower or "seguro social" in title_lower:
        return "Seguro Social de Salud (EsSalud)"

    return None


def main() -> int:
    if not CATALOG.exists():
        print(f"ERROR: {CATALOG} no existe. Corré el indexer primero.", file=sys.stderr)
        return 1

    DATA_OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    datasets = data.get("datasets", [])

    # ---- 1. Stats summary ----
    by_format: Counter = Counter()
    by_org_real: Counter = Counter()
    for d in datasets:
        org_label = detect_org(d) or "Sin clasificar"
        by_org_real[org_label] += 1
        for r in d.get("resources", []):
            fmt = r.get("format") or "?"
            by_format[fmt] += 1

    summary = {
        "generated_at": data.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        "ckan_base": data.get("ckan_base"),
        "total_datasets": len(datasets),
        "resources_checked": sum(by_format.values()),
        "live_pct": 0,
        "dead_count": 0,
        "top_orgs": [
            {"title": t, "count": c}
            for t, c in by_org_real.most_common(20)
        ],
        "top_formats": [
            {"format": t, "count": c}
            for t, c in by_format.most_common(10)
        ],
    }

    # Leer quality del reporte
    quality_md = REPO / "docs" / "inventario-fuentes" / "reporte-calidad.md"
    if quality_md.exists():
        text = quality_md.read_text(encoding="utf-8")
        for line in text.splitlines():
            if "Vivos (2xx):" in line and "**" in line:
                try:
                    n = int(line.split("**")[1].replace(",", ""))
                    summary["live_pct"] = round(n / max(1, summary["resources_checked"]) * 100, 1)
                except (ValueError, IndexError):
                    pass
            if "Muertos (4xx/5xx):" in line and "**" in line:
                try:
                    summary["dead_count"] = int(line.split("**")[1].replace(",", ""))
                except (ValueError, IndexError):
                    pass

    (DATA_OUT / "catalog-summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[write] {DATA_OUT / 'catalog-summary.json'}", file=sys.stderr)

    # ---- 2. Curated subset ----
    by_org_filtered: dict[str, list] = {}
    rastro_relevant_orphan: list = []

    for d in datasets:
        org_label = detect_org(d)
        if org_label is None:
            # ¿Es relevante para Rastro por tags?
            tag_blob = " ".join(d.get("tags", [])).lower()
            title = d.get("title", "").lower()
            if any(k in tag_blob + " " + title for k in RASTRO_TAGS):
                rastro_relevant_orphan.append(d)
            continue
        by_org_filtered.setdefault(org_label, []).append(d)

    if rastro_relevant_orphan:
        by_org_filtered["Otros relevantes (por tags)"] = rastro_relevant_orphan

    # Para cada org, ordenar por # recursos y tomar top 6
    curated = []
    for org_label, items in by_org_filtered.items():
        items.sort(key=lambda d: -d.get("num_resources", 0))
        for d in items[:6]:
            curated.append({
                "name": d["name"],
                "title": d["title"],
                "notes": (d.get("notes") or "")[:200],
                "organization": {
                    "id": None,
                    "name": None,
                    "title": org_label,
                },
                "tags": d.get("tags", [])[:6],
                "resources": [
                    {
                        "id": r.get("id"),
                        "url": r.get("url"),
                        "format": r.get("format"),
                        "size_kb": r.get("size_kb"),
                        "description": (r.get("description") or "")[:120],
                    }
                    for r in d.get("resources", [])[:3]
                ],
                "url": d.get("url"),
                "modified": d.get("modified"),
                "num_resources": d.get("num_resources", 0),
            })

    # Orden final: priorizados por org, luego alfabético
    priority_index = {label: i for i, (_, label) in enumerate(PREFIX_MAP)}
    def sort_key(d):
        org = (d.get("organization") or {}).get("title") or "zzz"
        return (priority_index.get(org, 999), -(d.get("num_resources") or 0), d.get("title") or "")
    curated.sort(key=sort_key)

    curated_payload = {
        "generated_at": summary["generated_at"],
        "count": len(curated),
        "datasets": curated,
    }
    (DATA_OUT / "catalog-curated.json").write_text(
        json.dumps(curated_payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[write] {DATA_OUT / 'catalog-curated.json'} ({len(curated)} datasets, {len(by_org_filtered)} orgs)", file=sys.stderr)

    # ---- 3. Orgs index ----
    orgs = []
    for title, items in by_org_filtered.items():
        orgs.append({
            "slug": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-"),
            "title": title,
            "count": len(items),
        })
    orgs.sort(key=lambda o: (
        priority_index.get(o["title"], 999),
        -o["count"],
    ))
    (DATA_OUT / "catalog-orgs.json").write_text(
        json.dumps({"generated_at": summary["generated_at"], "orgs": orgs}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[write] {DATA_OUT / 'catalog-orgs.json'} ({len(orgs)} orgs)", file=sys.stderr)

    # Resumen
    print(f"\n=== Resumen ===", file=sys.stderr)
    print(f"Total datasets indexados: {len(datasets)}", file=sys.stderr)
    print(f"Datasets clasificados por ministerio: {sum(len(v) for k, v in by_org_filtered.items() if k != 'Otros relevantes (por tags)')}", file=sys.stderr)
    print(f"Por tag (sin ministerio claro): {len(rastro_relevant_orphan)}", file=sys.stderr)
    print(f"Curados para Rastro: {len(curated)} (top 4 por org)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
