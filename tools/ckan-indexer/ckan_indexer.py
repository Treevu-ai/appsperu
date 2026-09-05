#!/usr/bin/env python3
"""
ckan_indexer.py — Indexa el catálogo CKAN de datosabiertos.gob.pe.

Uso:
  python ckan_indexer.py --quick          # 200 datasets, sin HEAD checks (~30s)
  python ckan_indexer.py --limit 1000     # 1000 datasets, con HEAD checks (~5-8 min)
  python ckan_indexer.py --full           # todos los datasets (~15-25 min)
  python ckan_indexer.py --resume         # continúa desde state/progress.json

Salidas:
  docs/inventario-fuentes/catalog.json   — catálogo completo normalizado
  docs/inventario-fuentes/catalog.csv    — vista plana para Excel
  docs/inventario-fuentes/por-ministerio.md — agrupado por ministerio
  docs/inventario-fuentes/reporte-calidad.md — métricas de calidad

Sin dependencias externas. Solo stdlib (Python 3.9+).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CKAN_BASE = os.environ.get("CKAN_BASE", "https://www.datosabiertos.gob.pe")
USER_AGENT = "Rastro-CKAN-Indexer/1.0 (+https://rastro.fyi)"
RATE_LIMIT_PER_SEC = 15
HEAD_TIMEOUT = 8
GET_TIMEOUT = 30
MAX_WORKERS = 10

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "inventario-fuentes"
DEFAULT_STATE = HERE / "state"

# Ministerios / entidades a destacar (Rastro-relevant). Se rankean primero.
PRIORIDAD_ORGS = [
    "ministerio-de-economia-y-finanzas-mef",
    "contraloria-general-de-la-republica",
    "ministerio-de-desarrollo-e-inclusion-social-midis",
    "ministerio-de-salud-minsa",
    "ministerio-de-educacion-minedu",
    "ministerio-de-vivienda-construccion-y-saneamiento-mvcs",
    "ministerio-de-la-mujer-y-poblaciones-vulnerables-mimp",
    "ministerio-de-justicia-y-derechos-humanos-minjus",
    "ministerio-del-interior-mininter",
    "ministerio-de-trabajo-y-promocion-del-empleo-mtpe",
    "instituto-nacional-de-estadistica-e-informatica-inei",
    "sunat",
    "reniec",
    "banco-central-de-reserva-del-peru-bcrp",
    "superintendencia-de-banca-y-seguros-sbs",
    "essalud",
    "ministerio-de-transportes-y-comunicaciones-mtc",
    "ministerio-de-energia-y-minas-minem",
    "ministerio-de-la-produccion-produce",
    "ministerio-de-comercio-exterior-y-turismo-mincetur",
    "ministerio-de-defensa-mindef",
    "ministerio-de-relaciones-exteriores-rree",
    "ministerio-del-ambiente-minam",
    "ministerio-de-cultura-mincul",
    "presidencia-del-consejo-de-ministros-pcm",
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

class RateLimiter:
    def __init__(self, per_sec: int) -> None:
        self.min_interval = 1.0 / per_sec
        self.last = 0.0
        self.lock = BoundedSemaphore(1)

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            delta = now - self.last
            if delta < self.min_interval:
                time.sleep(self.min_interval - delta)
            self.last = time.monotonic()


def http_get_json(url: str, rate: RateLimiter, retries: int = 3) -> dict:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            rate.wait()
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=GET_TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed after {retries} retries: {last_err}")


def http_head(url: str, rate: RateLimiter) -> dict:
    """HEAD request, returns {status, content_type, content_length, final_url, error}."""
    rate.wait()
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=HEAD_TIMEOUT) as resp:
            return {
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type", ""),
                "content_length": int(resp.headers.get("Content-Length") or 0),
                "final_url": resp.geturl(),
                "error": None,
            }
    except urllib.error.HTTPError as e:
        return {"status": e.code, "content_type": "", "content_length": 0, "final_url": url, "error": str(e)}
    except Exception as e:  # timeout, ssl, dns, etc.
        return {"status": 0, "content_type": "", "content_length": 0, "final_url": url, "error": str(e)[:160]}


# ---------------------------------------------------------------------------
# CKAN API
# ---------------------------------------------------------------------------

def ckan_package_list(rate: RateLimiter) -> list[str]:
    """Devuelve todos los nombres/ids de datasets en el catálogo."""
    print(f"[ckan] listando datasets desde {CKAN_BASE} ...", file=sys.stderr)
    url = f"{CKAN_BASE}/api/3/action/package_list"
    data = http_get_json(url, rate)
    if not data.get("success"):
        raise RuntimeError(f"CKAN package_list no devolvió success: {data}")
    return data["result"]


def ckan_package_show(name: str, rate: RateLimiter) -> dict | None:
    """Devuelve el detalle de un dataset. None si no se pudo obtener.

    NOTA: PNDA usa DKAN (no CKAN clásico) y devuelve `result` como list[1]
    en vez de dict. Se desenvuelve acá para que el resto del código vea un dict.
    """
    url = f"{CKAN_BASE}/api/3/action/package_show?id={urllib.parse.quote(name)}"
    try:
        data = http_get_json(url, rate)
    except RuntimeError as e:
        print(f"  [warn] package_show {name}: {e}", file=sys.stderr)
        return None
    if not data.get("success"):
        return None
    result = data["result"]
    if isinstance(result, list):
        if not result:
            return None
        result = result[0]
    if not isinstance(result, dict):
        return None
    return result


# ---------------------------------------------------------------------------
# Normalización
# ---------------------------------------------------------------------------

def norm_resource(res: dict) -> dict:
    # DKAN puede traer `size` como string ("1024") o None. Coercemos a float.
    size_raw = res.get("size")
    size_kb: float | None = None
    if size_raw is not None:
        try:
            size_kb = round(float(size_raw) / 1024, 1)
        except (TypeError, ValueError):
            size_kb = None
    return {
        "id": res.get("id"),
        "name": res.get("name") or res.get("description") or "",
        "url": res.get("url") or "",
        "format": (res.get("format") or "").upper().strip(),
        "size_kb": size_kb,
        "created": res.get("created"),
        "last_modified": res.get("last_modified") or res.get("revision_timestamp"),
        "description": (res.get("description") or "")[:240],
    }


def normalize(pkg: dict) -> dict:
    # DKAN no tiene `organization` en el resultado; usa `maintainer` y `author`.
    # Mantenemos un dict de organización uniforme, aunque venga vacío.
    org_raw = pkg.get("organization")
    if isinstance(org_raw, dict):
        org = {
            "id": org_raw.get("id"),
            "name": org_raw.get("name"),
            "title": org_raw.get("title") or org_raw.get("name"),
        }
    elif isinstance(org_raw, str) and org_raw:
        org = {"id": None, "name": org_raw, "title": org_raw}
    else:
        # Fallback DKAN: usar maintainer o author como pseudo-organización
        fallback = pkg.get("maintainer") or pkg.get("author") or ""
        org = {"id": None, "name": fallback.strip() or None, "title": fallback.strip() or None}

    # DKAN tags puede ser lista de strings o lista de dicts; manejamos ambos
    raw_tags = pkg.get("tags") or []
    if raw_tags and isinstance(raw_tags[0], dict):
        tags = [t.get("name") for t in raw_tags if t.get("name")]
    else:
        tags = [str(t) for t in raw_tags if t]

    resources = [norm_resource(r) for r in (pkg.get("resources") or []) if r.get("url")]

    return {
        "id": pkg.get("id") or pkg.get("name"),
        "name": pkg.get("name"),
        "title": pkg.get("title") or pkg.get("name"),
        "notes": (pkg.get("notes") or "").strip(),
        "organization": org if (org.get("id") or org.get("name") or org.get("title")) else None,
        "author": pkg.get("author"),
        "author_email": pkg.get("author_email"),
        "license_id": pkg.get("license_id"),
        "license_title": pkg.get("license_title"),
        "isopen": pkg.get("isopen"),
        "state": pkg.get("state"),
        "private": pkg.get("private"),
        "num_resources": len(resources),
        "num_tags": len(tags),
        "tags": tags,
        "resources": resources,
        "created": pkg.get("metadata_created"),
        "modified": pkg.get("metadata_modified"),
        "url": pkg.get("url"),
    }


# ---------------------------------------------------------------------------
# Quality check
# ---------------------------------------------------------------------------

@dataclass
class QualityMetrics:
    total: int = 0
    resources_checked: int = 0
    live: int = 0  # 2xx
    redirect: int = 0  # 3xx
    dead: int = 0  # 4xx/5xx
    error: int = 0  # network error
    by_format: dict = field(default_factory=dict)
    by_org: dict = field(default_factory=dict)
    problemas: list = field(default_factory=list)

    def record(self, ds: dict, head_results: list[dict]) -> None:
        self.total += 1
        org_title = (ds["organization"] or {}).get("title") or "Sin organización"
        org_count = self.by_org.setdefault(org_title, {"datasets": 0, "resources": 0, "live": 0})
        org_count["datasets"] += 1
        for res, h in zip(ds["resources"], head_results):
            self.resources_checked += 1
            org_count["resources"] += 1
            fmt = res["format"] or "?"
            fmt_count = self.by_format.setdefault(fmt, {"count": 0, "live": 0})
            fmt_count["count"] += 1
            if h["status"] and 200 <= h["status"] < 300:
                self.live += 1
                fmt_count["live"] += 1
                org_count["live"] += 1
            elif h["status"] and 300 <= h["status"] < 400:
                self.redirect += 1
            elif h["status"] and 400 <= h["status"] < 600:
                self.dead += 1
                if self.dead <= 30:  # no acumular miles de problemas
                    self.problemas.append({
                        "dataset": ds["title"],
                        "org": org_title,
                        "url": res["url"],
                        "format": fmt,
                        "status": h["status"],
                    })
            else:
                self.error += 1


# ---------------------------------------------------------------------------
# Indexer
# ---------------------------------------------------------------------------

def fetch_all_details(names: list[str], rate: RateLimiter, do_head: bool, state_path: Path | None = None, state: dict | None = None) -> list[dict]:
    """Baja package_show + HEAD checks. Devuelve lista de dicts {ds, head_results}.

    Si state_path y state se pasan, persiste incrementalmente cada 25 datasets
    para que un kill/restart no pierda trabajo (usar --resume después).
    """
    out: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        future_to_name = {pool.submit(ckan_package_show, n, rate): n for n in names}
        for i, fut in enumerate(as_completed(future_to_name), 1):
            name = future_to_name[fut]
            pkg = fut.result()
            if pkg is None:
                continue
            ds = normalize(pkg)
            head_results: list[dict] = []
            if do_head and ds["resources"]:
                # HEAD checks paralelos por dataset (limita a 8 por dataset)
                res_urls = [r["url"] for r in ds["resources"][:8]]
                with ThreadPoolExecutor(max_workers=8) as inner:
                    h_futures = {inner.submit(http_head, u, rate): idx for idx, u in enumerate(res_urls)}
                    tmp = [None] * len(res_urls)
                    for hf in as_completed(h_futures):
                        idx = h_futures[hf]
                        tmp[idx] = hf.result()
                    head_results = [t or {"status": 0, "error": "no result"} for t in tmp]
            out.append({"ds": ds, "head": head_results})
            if i % 25 == 0:
                print(f"  [progress] {i}/{len(names)} datasets procesados", file=sys.stderr)
                if state_path is not None and state is not None:
                    # extend, no reemplazar, para no duplicar
                    state.setdefault("results", []).extend(out[-25:])
                    state.setdefault("completed", []).extend([r["ds"]["name"] for r in out[-25:]])
                    save_state(state_path, state)
    return out


# ---------------------------------------------------------------------------
# Reporters
# ---------------------------------------------------------------------------

def write_json(path: Path, datasets: list[dict]) -> None:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ckan_base": CKAN_BASE,
        "count": len(datasets),
        "datasets": [d["ds"] for d in datasets],
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def write_csv(path: Path, datasets: list[dict]) -> None:
    cols = [
        "name", "title", "organization", "num_resources", "num_tags",
        "license_id", "isopen", "state", "first_resource_url", "first_resource_format",
        "first_resource_status", "created", "modified",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for d in datasets:
            ds = d["ds"]
            res0 = ds["resources"][0] if ds["resources"] else {}
            head0 = d["head"][0] if d["head"] else {}
            w.writerow({
                "name": ds["name"],
                "title": ds["title"],
                "organization": (ds["organization"] or {}).get("title"),
                "num_resources": ds["num_resources"],
                "num_tags": ds["num_tags"],
                "license_id": ds["license_id"],
                "isopen": ds["isopen"],
                "state": ds["state"],
                "first_resource_url": res0.get("url"),
                "first_resource_format": res0.get("format"),
                "first_resource_status": head0.get("status"),
                "created": ds["created"],
                "modified": ds["modified"],
            })


def write_quality_md(path: Path, q: QualityMetrics) -> None:
    lines = [
        "# Reporte de calidad — Catálogo CKAN",
        "",
        f"**Generado:** {datetime.now(timezone.utc).isoformat()}",
        f"**Fuente:** {CKAN_BASE}",
        f"**Datasets analizados:** {q.total}",
        f"**Resources chequeados (HEAD):** {q.resources_checked}",
        "",
        "## Resumen",
        "",
        f"- 🟢 Vivos (2xx): **{q.live}** ({q.live / max(1, q.resources_checked) * 100:.1f}%)",
        f"- 🟡 Redirect (3xx): **{q.redirect}**",
        f"- 🔴 Muertos (4xx/5xx): **{q.dead}**",
        f"- ⚫ Error de red/timeout: **{q.error}**",
        "",
        "## Top formatos",
        "",
        "| Formato | Total | Vivos | % vivos |",
        "|---|---:|---:|---:|",
    ]
    for fmt, c in sorted(q.by_format.items(), key=lambda x: -x[1]["count"])[:15]:
        live_pct = c["live"] / max(1, c["count"]) * 100
        lines.append(f"| {fmt or '?'} | {c['count']} | {c['live']} | {live_pct:.1f}% |")

    lines += [
        "",
        "## Top ministerios/entidades (por volumen de resources)",
        "",
        "| Organización | Datasets | Resources | Vivos |",
        "|---|---:|---:|---:|",
    ]
    for org, c in sorted(q.by_org.items(), key=lambda x: -x[1]["resources"])[:25]:
        lines.append(f"| {org} | {c['datasets']} | {c['resources']} | {c['live']} |")

    if q.problemas:
        lines += [
            "",
            f"## Muestra de URLs muertas ({len(q.problemas)} primeras)",
            "",
            "| Dataset | Organización | Formato | URL | Status |",
            "|---|---|---|---|---:|",
        ]
        for p in q.problemas[:30]:
            lines.append(f"| {p['dataset']} | {p['org']} | {p['format']} | {p['url']} | {p['status']} |")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_por_organizacion_md(path: Path, datasets: list[dict], q: QualityMetrics) -> None:
    by_org: dict[str, list[dict]] = {}
    for d in datasets:
        org = (d["ds"]["organization"] or {}).get("title") or "Sin organización"
        by_org.setdefault(org, []).append(d)

    lines = [
        "# Catálogo CKAN por ministerio / entidad",
        "",
        f"**Generado:** {datetime.now(timezone.utc).isoformat()}",
        f"**Total datasets:** {len(datasets)}",
        f"**Organizaciones únicas:** {len(by_org)}",
        "",
        "---",
        "",
    ]

    # Ordenar: primero las entidades de PRIORIDAD_ORGS, luego alfabético
    def sort_key(item):
        org, _ = item
        org_slug = ((org or "").lower().replace(" ", "-"))
        if org_slug in PRIORIDAD_ORGS:
            return (0, PRIORIDAD_ORGS.index(org_slug), org)
        return (1, 0, org)

    for org, items in sorted(by_org.items(), key=sort_key):
        total_res = sum(d["ds"]["num_resources"] for d in items)
        live = sum(1 for d in items for h in d["head"] if h.get("status") and 200 <= h["status"] < 300)
        lines.append(f"## {org}")
        lines.append("")
        lines.append(f"- **Datasets:** {len(items)}")
        lines.append(f"- **Resources totales:** {total_res}")
        if items and items[0]["head"]:
            lines.append(f"- **Resources verificados vivos:** {live}")
        lines.append("")
        # Top 10 datasets por # resources
        top = sorted(items, key=lambda d: -d["ds"]["num_resources"])[:10]
        lines.append("| Dataset | Resources | Formato principal | Licencia |")
        lines.append("|---|---:|---|---|")
        for d in top:
            ds = d["ds"]
            formats = [r["format"] for r in ds["resources"] if r["format"]]
            main_fmt = max(set(formats), key=formats.count) if formats else "—"
            lines.append(f"| [{ds['title']}]({ds.get('url') or '#'}) | {ds['num_resources']} | {main_fmt} | {ds.get('license_title') or '—'} |")
        lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# State (resumable)
# ---------------------------------------------------------------------------

def load_state(state_path: Path) -> dict:
    if state_path.exists():
        return json.loads(state_path.read_text(encoding="utf-8"))
    return {"completed": [], "results": []}


def save_state(state_path: Path, state: dict) -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    state_path.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group()
    g.add_argument("--quick", action="store_true", help="200 datasets, sin HEAD checks")
    g.add_argument("--limit", type=int, help="N datasets con HEAD checks")
    g.add_argument("--full", action="store_true", help="Todos los datasets con HEAD checks")
    p.add_argument("--resume", action="store_true", help="Continúa desde state/progress.json")
    p.add_argument("--no-head", action="store_true", help="Salta HEAD checks incluso en --limit/--full")
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--state", type=Path, default=DEFAULT_STATE / "progress.json")
    args = p.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    args.state.parent.mkdir(parents=True, exist_ok=True)
    rate = RateLimiter(RATE_LIMIT_PER_SEC)

    # 1. Listar
    all_names = ckan_package_list(rate)
    print(f"[ckan] {len(all_names)} datasets en el catálogo", file=sys.stderr)

    # 2. Aplicar límite
    if args.quick:
        target = all_names[:200]
        do_head = False
    elif args.limit:
        target = all_names[: args.limit]
        do_head = not args.no_head
    elif args.full:
        target = all_names
        do_head = not args.no_head
    else:
        target = all_names[:1000]
        do_head = not args.no_head

    # 3. Resume?
    state = load_state(args.state) if args.resume else {"completed": [], "results": []}
    pending = [n for n in target if n not in state["completed"]]
    print(f"[ckan] target={len(target)} pending={len(pending)} ya_completados={len(state['completed'])}", file=sys.stderr)

    # 4. Fetch (con persistencia incremental si hay state)
    new_results = fetch_all_details(pending, rate, do_head, state_path=args.state, state=state)
    # Si fue muy corto y no se disparó el save incremental, agregar ahora
    if len(new_results) < 25:
        state.setdefault("results", []).extend(new_results)
        state.setdefault("completed", []).extend([r["ds"]["name"] for r in new_results])
    save_state(args.state, state)

    datasets = state["results"]
    print(f"[ckan] total datasets con metadata: {len(datasets)}", file=sys.stderr)

    # 5. Quality
    q = QualityMetrics()
    for d in datasets:
        q.record(d["ds"], d["head"])
    print(f"[quality] live={q.live} dead={q.dead} redirect={q.redirect} error={q.error}", file=sys.stderr)

    # 6. Outputs
    print(f"[write] {args.output}", file=sys.stderr)
    write_json(args.output / "catalog.json", datasets)
    write_csv(args.output / "catalog.csv", datasets)
    write_quality_md(args.output / "reporte-calidad.md", q)
    write_por_organizacion_md(args.output / "por-ministerio.md", datasets, q)
    print("[done] OK", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
