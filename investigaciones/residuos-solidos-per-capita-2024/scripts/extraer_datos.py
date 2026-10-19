"""Extracción — investigaciones/residuos-solidos-per-capita-2024

Conecta al proyecto Neon `appsperu` usando `DATABASE_URL_UNPOOLED` del `.env.local`
de la raíz del repo (el nombre de base se reescribe por cada fuente) y exporta los
CSV crudos a `data/raw/`.

Uso:
    python investigaciones/residuos-solidos-per-capita-2024/scripts/extraer_datos.py

Solo lectura: todas las consultas son SELECT.
"""
from __future__ import annotations

import csv
import pathlib
import re
import sys
import urllib.parse as up

import psycopg2

HERE = pathlib.Path(__file__).resolve().parents[1]   # .../residuos-solidos-per-capita-2024
REPO = HERE.parents[1]                               # raíz del monorepo appsperu
RAW = HERE / "data" / "raw"

QUERIES: dict[str, tuple[str, str]] = {
    # tabla principal: panel distrital MINAM/SIGERSOL 2019-2024
    "residuos_distrital_2019_2024.csv": ("residuos_solidos", """
        SELECT ubigeo, anio, departamento, provincia, distrito,
               region_natural, tipo_municipalidad,
               poblacion_total, poblacion_urbana, poblacion_rural,
               clasificacion_municipal_mef,
               generacion_percapita_dom,
               generacion_dom_urbana_tdia, generacion_dom_urbana_tanio,
               generacion_mun_tdia, generacion_mun_tanio,
               generacion_percapita_mun,
               fecha_corte::date AS fecha_corte
        FROM residuos_solidos_municipales
        ORDER BY ubigeo, anio
    """),
    # empresas formales MTPE: agregado mensual 2025 por distrito
    "empresas_distrital_2025.csv": ("actividad_empresarial", """
        SELECT ubigeo,
               anio,
               count(*)                                          AS meses_reportados,
               round(avg(numero_empresas)::numeric, 1)           AS empresas_prom_mensual,
               max(numero_empresas)                              AS empresas_max_mensual,
               max(numero_empresas) FILTER (WHERE mes = 12)      AS empresas_diciembre,
               sum(numero_empresas)                              AS empresas_suma_meses
        FROM empresas_privadas_distrito
        GROUP BY ubigeo, anio
        ORDER BY ubigeo
    """),
    # inversión pública Invierte.pe agregada por distrito (acumulado a 2024 y total)
    "inversion_publica_por_ubigeo.csv": ("radar_inversiones", """
        SELECT ubigeo,
               count(*) FILTER (WHERE fecha_registro <= DATE '2024-12-31')            AS n_hasta_2024,
               sum(monto_viable)    FILTER (WHERE fecha_registro <= DATE '2024-12-31') AS viable_hasta_2024,
               sum(costo_actualizado) FILTER (WHERE fecha_registro <= DATE '2024-12-31') AS costo_hasta_2024,
               count(*)                                                               AS n_total,
               sum(monto_viable)                                                       AS viable_total,
               sum(costo_actualizado)                                                  AS costo_total,
               count(*) FILTER (WHERE avance_ejecucion IS NOT NULL)                    AS n_con_avance,
               round(avg(avance_ejecucion) FILTER (WHERE avance_ejecucion BETWEEN 0 AND 100)::numeric, 2) AS avance_prom,
               count(*) FILTER (WHERE avance_ejecucion NOT BETWEEN 0 AND 100)          AS avance_invalidos,
               count(*) FILTER (WHERE avance_ejecucion BETWEEN 0 AND 100 AND avance_ejecucion < 50) AS n_avance_bajo
        FROM investments
        WHERE ubigeo IS NOT NULL
        GROUP BY ubigeo
        ORDER BY ubigeo
    """),
    # cobertura de programas sociales (corte único 2026-04-30)
    "cobertura_social_2026_04_30.csv": ("programas_sociales", """
        SELECT *
        FROM cobertura_social
        ORDER BY ubigeo
    """),
}


def base_url() -> str:
    env = REPO / ".env.local"
    if not env.exists():
        sys.exit(f"No se encontró {env}")
    txt = env.read_text(encoding="utf-8")
    m = re.search(r'^DATABASE_URL_UNPOOLED="?([^"\n]+)"?', txt, re.M)
    if not m:
        sys.exit("DATABASE_URL_UNPOOLED no está definido en .env.local")
    return m.group(1)


def connect(database: str, url: str):
    u = up.urlparse(url)
    return psycopg2.connect(u._replace(path="/" + database).geturl())


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    url = base_url()
    total = 0
    for filename, (database, sql) in QUERIES.items():
        with connect(database, url) as conn:
            cur = conn.cursor()
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            rows_data = cur.fetchall()
            cur.close()
        rows = 0
        with open(RAW / filename, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(cols)
            for row in rows_data:
                w.writerow(["" if v is None else v for v in row])
                rows += 1
        total += rows
        print(f"[ok] {database}.{filename} -> {rows} filas, {len(cols)} columnas")
    print(f"[ok] total {total} filas exportadas a {RAW}")


if __name__ == "__main__":
    main()
