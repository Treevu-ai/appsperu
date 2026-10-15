"""
Extrae de BACI las exportaciones TOTALES de Perú hacia TODOS sus socios
comerciales (no solo los 12 del CPTPP+China), por año — insumo para el
modelo de gravedad (panel mundial, siguiendo la literatura real: ver
hallazgo de investigación bibliográfica en README.md).

Entrada: ruta al BACI_HS92_V202601.zip (parámetro --zip)
Salida:  ../data/raw/baci_peru_todos_socios.csv  (anio, partner_codigo, v_miles_usd)

Uso:
    python 15_export_baci_peru_todos_socios.py --zip "<ruta al zip>"
"""
import argparse
import zipfile
from pathlib import Path
from collections import defaultdict

import pandas as pd

OUT_DIR = Path(__file__).parent / ".." / "data" / "raw"
ANIOS = range(2015, 2025)
PERU = 604
CHUNK = 500_000


def procesar_anio(zf: zipfile.ZipFile, anio: int) -> dict:
    nombre = f"BACI_HS92_Y{anio}_V202601.csv"
    acc: dict[int, float] = defaultdict(float)
    with zf.open(nombre) as f:
        for chunk in pd.read_csv(f, chunksize=CHUNK):
            sub = chunk[chunk["i"] == PERU]
            if sub.empty:
                continue
            g = sub.groupby("j")["v"].sum()
            for j, v in g.items():
                acc[j] += v
    return acc


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    filas = []
    with zipfile.ZipFile(args.zip) as zf:
        for anio in ANIOS:
            acc = procesar_anio(zf, anio)
            for j, v in sorted(acc.items()):
                filas.append({"anio": anio, "partner_codigo": j, "v_miles_usd": round(v, 2)})
            print(f"{anio}: {len(acc)} socios")

    df = pd.DataFrame(filas)
    df.to_csv(OUT_DIR / "baci_peru_todos_socios.csv", index=False)
    print(f"\nEscrito {OUT_DIR / 'baci_peru_todos_socios.csv'} ({len(df)} filas, "
          f"{df['partner_codigo'].nunique()} socios distintos)")


if __name__ == "__main__":
    main()
