"""
Extrae de BACI (CEPII, HS92, versión 202601) dos series agregadas a nivel de
capítulo arancelario (HS2, comparable con `cmd_code` de Comtrade):

  1. Exportaciones de Perú por capítulo y año -> data/raw/baci_peru_hs2.csv
  2. Exportaciones MUNDIALES por capítulo y año -> data/raw/baci_mundo_hs2.csv
     (el denominador que Comtrade no pudo completar por cuota — ver
     data/raw/README.md)

Lee directo del zip descargado (no lo descomprime entero), en chunks, para
no cargar ~350MB por año en memoria de una vez.

Entrada: ruta al BACI_HS92_V202601.zip (parámetro --zip)
Salida:  ../data/raw/baci_peru_hs2.csv, ../data/raw/baci_mundo_hs2.csv

Uso:
    python 07_export_baci.py --zip "<ruta al zip>"
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


def hs2(k: int) -> str:
    return f"{k:06d}"[:2]


def procesar_anio(zf: zipfile.ZipFile, anio: int) -> tuple[dict, dict]:
    nombre = f"BACI_HS92_Y{anio}_V202601.csv"
    peru_acc: dict[str, float] = defaultdict(float)
    mundo_acc: dict[str, float] = defaultdict(float)

    with zf.open(nombre) as f:
        for chunk in pd.read_csv(f, chunksize=CHUNK):
            chunk["hs2"] = chunk["k"].apply(hs2)
            mundo_g = chunk.groupby("hs2")["v"].sum()
            for h, v in mundo_g.items():
                mundo_acc[h] += v
            peru_g = chunk[chunk["i"] == PERU].groupby("hs2")["v"].sum()
            for h, v in peru_g.items():
                peru_acc[h] += v

    return peru_acc, mundo_acc


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    peru_filas = []
    mundo_filas = []

    with zipfile.ZipFile(args.zip) as zf:
        for anio in ANIOS:
            peru_acc, mundo_acc = procesar_anio(zf, anio)
            for h, v in sorted(peru_acc.items()):
                peru_filas.append({"anio": anio, "hs2": h, "v_miles_usd": round(v, 2)})
            for h, v in sorted(mundo_acc.items()):
                mundo_filas.append({"anio": anio, "hs2": h, "v_miles_usd": round(v, 2)})
            print(f"{anio}: Perú {len(peru_acc)} capítulos, mundo {len(mundo_acc)} capítulos")

    pd.DataFrame(peru_filas).to_csv(OUT_DIR / "baci_peru_hs2.csv", index=False)
    pd.DataFrame(mundo_filas).to_csv(OUT_DIR / "baci_mundo_hs2.csv", index=False)
    print(f"\nEscrito {OUT_DIR / 'baci_peru_hs2.csv'} ({len(peru_filas)} filas)")
    print(f"Escrito {OUT_DIR / 'baci_mundo_hs2.csv'} ({len(mundo_filas)} filas)")


if __name__ == "__main__":
    main()
