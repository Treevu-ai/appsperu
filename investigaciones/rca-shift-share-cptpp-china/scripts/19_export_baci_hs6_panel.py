"""
Extrae de BACI (CEPII, HS92, versión 202601) el panel a nivel de PRODUCTO
(6 dígitos del Sistema Armonizado) necesario para la gravedad por producto
con exposición diferencial — el núcleo empírico de la propuesta al XI
Concurso de Investigación de la Universidad del Pacífico.

Genera DOS salidas:

  1. baci_peru_exports_hs6.csv
     Exportaciones bilaterales de Perú (i=604) por producto HS6, socio y año.
     Es la VARIABLE DEPENDIENTE de la gravedad por producto.

  2. baci_partner_imports_hs6.csv
     Importaciones de cada socio desde el MUNDO (excluyendo a Perú) por
     producto HS6 y año. Es el control de DEMANDA del mercado de destino,
     necesario porque un socio puede importar más de un producto sin que
     Perú gane cuota — sin este control, la demanda se confunde con
     competitividad.

Diferencia clave con los scripts 07/08/10/15: esos agregan a capítulo (HS2)
y aquí se conserva el código de 6 dígitos (`k`).

Entrada: ruta al BACI_HS92_V202601.zip (parámetro --zip)
Salida:  ../data/raw/baci_peru_exports_hs6.csv
         ../data/raw/baci_partner_imports_hs6.csv

Uso:
    python 19_export_baci_hs6_panel.py --zip "<ruta al zip>"
"""
import argparse
import zipfile
from collections import defaultdict
from pathlib import Path

import pandas as pd

OUT_DIR = Path(__file__).parent / ".." / "data" / "raw"
ANIOS = range(2015, 2025)
PERU = 604
CHUNK = 500_000


def hs6(k: int) -> str:
    """Convierte el código numérico de BACI a cadena HS de 6 dígitos."""
    return f"{k:06d}"


def procesar_anio(zf: zipfile.ZipFile, anio: int):
    """Recorre un año y acumula (a) exportaciones peruanas y (b) importaciones
    de cada socio desde el resto del mundo, ambas por producto HS6."""
    nombre = f"BACI_HS92_Y{anio}_V202601.csv"

    exp_peru: dict[tuple[int, str], float] = defaultdict(float)
    imp_socios: dict[tuple[int, str], float] = defaultdict(float)

    with zf.open(nombre) as f:
        for chunk in pd.read_csv(f, chunksize=CHUNK):
            # 1) Exportaciones de Perú hacia cada socio, por producto
            sub_exp = chunk[chunk["i"] == PERU]
            if not sub_exp.empty:
                g = sub_exp.groupby(["j", "k"])["v"].sum()
                for (j, k), v in g.items():
                    exp_peru[(int(j), hs6(int(k)))] += v

            # 2) Importaciones de cada socio desde el MUNDO, por producto.
            #    Se excluye a Perú como origen para que este control mida la
            #    demanda externa del destino y no incluya el propio flujo
            #    que estamos explicando (evita fuga de la variable dependiente).
            sub_imp = chunk[chunk["i"] != PERU]
            if not sub_imp.empty:
                g = sub_imp.groupby(["j", "k"])["v"].sum()
                for (j, k), v in g.items():
                    imp_socios[(int(j), hs6(int(k)))] += v

    return exp_peru, imp_socios


def a_filas(acum: dict, anio: int) -> list[dict]:
    return [
        {"anio": anio, "partner_codigo": j, "hs6": h, "v_miles_usd": round(v, 2)}
        for (j, h), v in sorted(acum.items())
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    filas_exp: list[dict] = []
    filas_imp: list[dict] = []

    with zipfile.ZipFile(args.zip) as zf:
        for anio in ANIOS:
            exp, imp = procesar_anio(zf, anio)
            filas_exp.extend(a_filas(exp, anio))
            filas_imp.extend(a_filas(imp, anio))
            print(
                f"{anio}: {len(exp):,} combinaciones Perú-socio-producto | "
                f"{len(imp):,} combinaciones socio-producto (importaciones)"
            )

    df_exp = pd.DataFrame(filas_exp)
    df_imp = pd.DataFrame(filas_imp)

    df_exp.to_csv(OUT_DIR / "baci_peru_exports_hs6.csv", index=False)
    df_imp.to_csv(OUT_DIR / "baci_partner_imports_hs6.csv", index=False)

    print(f"\nEscrito baci_peru_exports_hs6.csv ({len(df_exp):,} filas, "
          f"{df_exp['hs6'].nunique()} productos HS6, "
          f"{df_exp['partner_codigo'].nunique()} socios)")
    print(f"Escrito baci_partner_imports_hs6.csv ({len(df_imp):,} filas)")


if __name__ == "__main__":
    main()
