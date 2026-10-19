"""Extracción — investigaciones/inversion-publica-crecimiento-exportador-regional

Conecta al proyecto Neon `appsperu` usando `DATABASE_URL_UNPOOLED` del `.env.local`
de la raíz del repo (el nombre de base se reescribe) y exporta los CSV crudos a
`data/raw/`.

Fuentes (verificadas 2026-10-19):
  - radar_inversiones.investments        150.042 proyectos 2001-2026 (Invierte.pe/SNIP)
  - identidad_fiscal.ruc_exportaciones_fob  13.575 filas, 339 RUC, 2019-2026, 15 aduanas
  - identidad_fiscal.contribuyentes       padrón SUNAT (cruce RUC→ubigeo)

Salidas:
  - inversiones_region_anio.csv       panel departamento×año de finalizaciones (2015-2026)
  - inversiones_productiva_detalle.csv proyectos de los 3 pliegos productivos (validación)
  - exportadores_fob_ruc.csv          registros FOB por RUC (crudo)
  - padron_exportadores_ubigeo.csv    339 RUC → ubigeo/departamento de domicilio fiscal

Solo lectura: todas las consultas son SELECT.

Uso:
    python investigaciones/inversion-publica-crecimiento-exportador-regional/scripts/extraer_datos.py
"""
from __future__ import annotations

import csv
import pathlib
import sys
import urllib.parse as up

import psycopg2

HERE = pathlib.Path(__file__).resolve().parents[1]   # .../inversion-publica-...
REPO = HERE.parents[1]                               # raíz del monorepo
RAW = HERE / "data" / "raw"

# códigos INEI de departamento (prefijo del ubigeo distrital)
DEPTOS = {
    "01": "AMAZONAS", "02": "ANCASH", "03": "APURIMAC", "04": "AREQUIPA",
    "05": "AYACUCHO", "06": "CAJAMARCA", "07": "CALLAO", "08": "CUSCO",
    "09": "HUANCAVELICA", "10": "HUANUCO", "11": "ICA", "12": "JUNIN",
    "13": "LA LIBERTAD", "14": "LAMBAYEQUE", "15": "LIMA", "16": "LORETO",
    "17": "MADRE DE DIOS", "18": "MOQUEGUA", "19": "PASCO", "20": "PIURA",
    "21": "PUNO", "22": "SAN MARTIN", "23": "TACNA", "24": "TUMBES",
    "25": "UCAYALI",
}

QUERIES: dict[str, tuple[str, str]] = {
    # panel departamento×año de finalizaciones de obra (ventana 2015-2026 para
    # soportar rezagos de 3 años desde el inicio del panel de exportadores en 2019).
    # OJO (hallazgo de calidad de datos): 48.263 proyectos tienen
    # fecha_fin_ejecucion > 2026 (hasta 2070) — son fechas proyectadas; se excluyen.
    # Clasificación doble de "infraestructura productiva":
    #   * por `funcion` (tipo de obra): TRANSPORTE, ENERGÍA, AGROPECUARIA
    #   * por `sector` (pliego ejecutor): TRANSPORTES Y COMUNICACIONES,
    #     AGRICULTURA Y RIEGO, ENERGIA Y MINAS  (la de la propuesta original)
    "inversiones_region_anio.csv": ("radar_inversiones", """
        SELECT LEFT(ubigeo, 2)                        AS cod_dep,
               max(departamento)                      AS departamento,
               EXTRACT(YEAR FROM fecha_fin_ejecucion) AS anio,
               count(*) FILTER (WHERE funcion IN ('TRANSPORTE', 'ENERGÍA', 'AGROPECUARIA'))
                                                          AS n_prod_funcion,
               COALESCE(sum(monto_viable) FILTER (WHERE funcion IN ('TRANSPORTE', 'ENERGÍA', 'AGROPECUARIA')), 0)
                                                          AS monto_prod_funcion,
               count(*) FILTER (WHERE sector IN ('TRANSPORTES Y COMUNICACIONES',
                                                 'AGRICULTURA Y RIEGO', 'ENERGIA Y MINAS'))
                                                          AS n_prod_sector,
               COALESCE(sum(monto_viable) FILTER (WHERE sector IN ('TRANSPORTES Y COMUNICACIONES',
                                                                   'AGRICULTURA Y RIEGO', 'ENERGIA Y MINAS')), 0)
                                                          AS monto_prod_sector,
               count(*)                                  AS n_total,
               COALESCE(sum(monto_viable), 0)            AS monto_total
        FROM investments
        WHERE fecha_fin_ejecucion BETWEEN '2015-01-01' AND '2026-12-31'
          AND ubigeo ~ '^[0-9]{6}$'
        GROUP BY 1, 3
        ORDER BY 1, 3
    """),
    # detalle de los proyectos de los 3 pliegos productivos (2.912 filas):
    # materia de la revisión manual de clasificación (paso 2 de la propuesta)
    "inversiones_productiva_detalle.csv": ("radar_inversiones", """
        SELECT cui, nombre, sector, funcion, nivel, entidad,
               departamento, provincia, distrito, ubigeo,
               monto_viable, costo_actualizado, num_habitantes_benef,
               fecha_registro, fecha_viabilidad, fecha_fin_ejecucion,
               avance_ejecucion, estado, situacion
        FROM investments
        WHERE sector IN ('TRANSPORTES Y COMUNICACIONES', 'AGRICULTURA Y RIEGO',
                         'ENERGIA Y MINAS')
        ORDER BY sector, fecha_fin_ejecucion NULLS LAST
    """),
    # registros FOB por RUC (muestra parcial de Aduanet: 339/13.366 RUC)
    "exportadores_fob_ruc.csv": ("identidad_fiscal", """
        SELECT ruc, anio, mes, aduana_codigo, aduana_nombre,
               pais_nombre, fob_usd
        FROM ruc_exportaciones_fob
        ORDER BY ruc, anio, mes
    """),
    # domicilio fiscal (ubigeo) de los RUC exportadores vía padrón SUNAT
    "padron_exportadores_ubigeo.csv": ("identidad_fiscal", """
        SELECT DISTINCT ON (f.ruc) f.ruc, c.ubigeo
        FROM (SELECT DISTINCT ruc FROM ruc_exportaciones_fob) f
        LEFT JOIN contribuyentes c USING (ruc)
        ORDER BY f.ruc
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
                if archivo == "padron_exportadores_ubigeo.csv":
                    escritor.writerow(["ruc", "ubigeo", "departamento"])
                else:
                    escritor.writerow(columnas)
                filas = 0
                for fila in cur:
                    if archivo == "padron_exportadores_ubigeo.csv":
                        ruc, ubigeo = fila
                        dep = DEPTOS.get((ubigeo or "")[:2]) if ubigeo and len(ubigeo) == 6 else None
                        fila = (ruc, ubigeo, dep)
                    escritor.writerow(fila)
                    filas += 1
            total += filas
            print(f"[ok] {base}.{archivo} -> {filas:,} filas, {len(columnas)} columnas")
    print(f"[ok] total {total:,} filas exportadas a {RAW}")


if __name__ == "__main__":
    main()
