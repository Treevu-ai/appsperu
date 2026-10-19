"""Extracción — investigaciones/infraestructura-logistica-competitividad-exportadora

Conecta al proyecto Neon `appsperu` usando `DATABASE_URL_UNPOOLED` del `.env.local`
de la raíz del repo (el nombre de base se reescribe) y exporta los CSV crudos a
`data/raw/`.

Fuentes (verificadas 2026-10-19):
  - identidad_fiscal.ruc_exportaciones_fob  13.575 filas, 339 RUC, 2019-2026, 15 aduanas
  - infraestructura_mtc.terminales_portuarios 507 filas (múltiples cortes → dedupe)
  - infraestructura_mtc.indice_vulnerabilidad_portuaria 302 filas (2 cortes por terminal)
  - infraestructura_mtc.cargas_portuarias_historico 741 filas (19 puertos, 2010-2017)
  - infraestructura_mtc.aerodromos 595 filas (la aduana aérea del Callao → Jorge Chávez)
  - infraestructura_mtc.peajes 233 filas (proxy de conectividad terrestre)

Salidas:
  - exportaciones_aduana_ruc.csv      registros FOB por RUC (crudo)
  - terminales_portuarios_snapshot.csv estado más reciente/informativo por terminal
  - indice_vulnerabilidad_snapshot.csv cálculo más reciente por terminal
  - cargas_portuarias_historico.csv   serie de cargas 2010-2017 por puerto
  - aerodromos.csv                    aeródromos (tipos Aeropuerto/Internacional)
  - peajes.csv                        peajes con coordenadas

Solo lectura: todas las consultas son SELECT.

Uso:
    python investigaciones/infraestructura-logistica-competitividad-exportadora/scripts/extraer_datos.py
"""
from __future__ import annotations

import csv
import pathlib
import sys
import urllib.parse as up

import psycopg2

HERE = pathlib.Path(__file__).resolve().parents[1]   # .../infraestructura-logistica-...
REPO = HERE.parents[1]                               # raíz del monorepo
RAW = HERE / "data" / "raw"

QUERIES: dict[str, tuple[str, str]] = {
    # crudo: FOB por RUC×año×mes×aduana×país (muestra parcial de Aduanet)
    "exportaciones_aduana_ruc.csv": ("identidad_fiscal", """
        SELECT ruc, anio, mes, aduana_codigo, aduana_nombre, pais_nombre, fob_usd
        FROM ruc_exportaciones_fob
        ORDER BY aduana_codigo, anio, mes, ruc
    """),
    # dedupe: la tabla tiene varios cortes por terminal y filas con
    # 'Información no disponible'; se prefiere el estado informativo y el corte más reciente
    "terminales_portuarios_snapshot.csv": ("infraestructura_mtc", """
        SELECT DISTINCT ON (codigo_puerto, upper(nombre_terminal))
               codigo_puerto, nombre_terminal, localidad, ambito, tipo_terminal,
               alcance, uso, estado, estado_conservacion, es_concesionado,
               latitud, longitud, fecha_corte
        FROM terminales_portuarios
        ORDER BY codigo_puerto, upper(nombre_terminal),
                 (estado_conservacion <> 'Información no disponible') DESC,
                 fecha_corte DESC NULLS LAST
    """),
    # el índice tiene 2 cortes por terminal con scores distintos → queda el más reciente
    "indice_vulnerabilidad_snapshot.csv": ("infraestructura_mtc", """
        SELECT DISTINCT ON (codigo_puerto, upper(nombre_terminal))
               codigo_puerto, nombre_terminal, ambito, alcance,
               estado_conservacion, es_concesionado, score_vulnerabilidad,
               fecha_corte, calculado_en
        FROM indice_vulnerabilidad_portuaria
        ORDER BY codigo_puerto, upper(nombre_terminal), calculado_en DESC
    """),
    "cargas_portuarias_historico.csv": ("infraestructura_mtc", """
        SELECT nivel, ambito, puerto, uso, anio, volumen_tm
        FROM cargas_portuarias_historico
        ORDER BY puerto, anio
    """),
    "aerodromos.csv": ("infraestructura_mtc", """
        SELECT codigo_aerodromo, nombre, tipo_aerodromo, estado, es_concesionado,
               departamento, provincia, distrito, latitud, longitud, fecha_corte
        FROM aerodromos
        WHERE tipo_aerodromo ILIKE '%aeropuerto%'
        ORDER BY nombre
    """),
    "peajes.csv": ("infraestructura_mtc", """
        SELECT codigo_peaje, nombre, id_departamento, departamento, distrito,
               es_concesionado, estado, latitud, longitud
        FROM peajes
        ORDER BY id_departamento, nombre
    """),
}


def cargar_url() -> str:
    for linea in (REPO / ".env.local").read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea.startswith("DATABASE_URL_UNPOOLED="):
            url = linea.split("=", 1)[1].strip().strip('"').strip("'")
            partes = up.urlsplit(url)
            q = [(k, v) for k, v in up.parse_qsl(partes.query, keep_blank_values=True)
                 if k != "channel_binding"]  # channel_binding es de node-postgres
            return up.urlunsplit((partes.scheme, partes.netloc, partes.path,
                                  up.urlencode(q), partes.fragment))
    sys.exit("no se encontro DATABASE_URL_UNPOOLED en .env.local")


BASE = cargar_url()


def conectar(db: str):
    partes = up.urlsplit(BASE)
    url = up.urlunsplit((partes.scheme, partes.netloc, "/" + db,
                         partes.query, partes.fragment))
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True, autocommit=False)
    return conn


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    total = 0
    for archivo, (base, consulta) in QUERIES.items():
        with conectar(base) as con, con.cursor() as cur:
            cur.execute(consulta)
            columnas = [d.name for d in cur.description]
            destino = RAW / archivo
            with destino.open("w", encoding="utf-8", newline="") as fh:
                escritor = csv.writer(fh)
                escritor.writerow(columnas)
                filas = 0
                for fila in cur:
                    escritor.writerow(fila)
                    filas += 1
            total += filas
            print(f"[ok] {base}.{archivo} -> {filas:,} filas, {len(columnas)} columnas")
    print(f"[ok] total {total:,} filas exportadas a {RAW}")


if __name__ == "__main__":
    main()
