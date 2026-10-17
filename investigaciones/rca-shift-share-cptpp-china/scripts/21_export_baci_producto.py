"""
Paso 21 — Extrae de BACI (una sola pasada por el zip) dos insumos de nivel producto:

  1. baci_peru_todos_socios_hs4.csv
     Exportaciones de Perú (i=604) hacia CADA socio, por producto HS4 y año
     (2015-2024). Es la variable dependiente de la gravedad por producto.

  2. baci_pais_hs4_2015.csv y baci_pais_hs4_2024.csv
     Exportaciones mundiales de CADA país por producto HS4 (i -> mundo) en 2015
     y 2024. Alimentan el cálculo de complejidad económica (ECI, proximidad).

Uso:
    python 21_export_baci_producto.py --zip "../data/raw/BACI_HS92_V202601.zip"
"""
import argparse
import zipfile
from collections import defaultdict
from pathlib import Path

import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw"
ANIOS = list(range(2015, 2025))
ANIOS_MATRIZ = {2015, 2024}
PERU = 604
CHUNK = 1_000_000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", default=str(RAW / "BACI_HS92_V202601.zip"))
    args = parser.parse_args()

    peru = defaultdict(float)                      # (anio, j, hs4) -> v
    matriz = {a: defaultdict(float) for a in ANIOS_MATRIZ}  # anio -> (i, hs4) -> v

    with zipfile.ZipFile(args.zip) as zf:
        for anio in ANIOS:
            nombre = f"BACI_HS92_Y{anio}_V202601.csv"
            with zf.open(nombre) as f:
                for chunk in pd.read_csv(f, chunksize=CHUNK):
                    chunk = chunk[["i", "j", "k", "v"]]
                    chunk["hs4"] = chunk["k"] // 100
                    # (1) Perú exportador
                    sub = chunk[chunk["i"] == PERU]
                    if not sub.empty:
                        g = sub.groupby(["j", "hs4"])["v"].sum()
                        for (j, h), val in g.items():
                            peru[(anio, int(j), int(h))] += float(val)
                    # (2) matriz país -> producto (solo años seleccionados)
                    if anio in ANIOS_MATRIZ:
                        g = chunk.groupby(["i", "hs4"])["v"].sum()
                        for (i, h), val in g.items():
                            matriz[anio][(int(i), int(h))] += float(val)
            print(f"{anio}: Perú {len(peru):,} filas acumuladas")

    df_peru = pd.DataFrame(
        [{"anio": t, "partner_codigo": j, "hs4": h, "v_miles_usd": round(v, 3)}
         for (t, j, h), v in peru.items()]
    ).sort_values(["anio", "partner_codigo", "hs4"])
    df_peru.to_csv(RAW / "baci_peru_todos_socios_hs4.csv", index=False)
    print(f"\nPERÚ -> socios HS4: {len(df_peru):,} filas | "
          f"{df_peru['partner_codigo'].nunique()} socios | {df_peru['hs4'].nunique()} productos HS4")

    for anio in ANIOS_MATRIZ:
        df = pd.DataFrame(
            [{"iso_i": i, "hs4": h, "v_miles_usd": round(v, 3)}
             for (i, h), v in matriz[anio].items()]
        ).sort_values(["iso_i", "hs4"])
        df.to_csv(RAW / f"baci_pais_hs4_{anio}.csv", index=False)
        print(f"matriz país-HS4 {anio}: {len(df):,} filas | {df['iso_i'].nunique()} países")


if __name__ == "__main__":
    main()
