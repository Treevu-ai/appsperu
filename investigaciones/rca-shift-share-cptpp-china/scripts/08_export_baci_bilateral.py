"""
Extrae de BACI las exportaciones BILATERALES de Perú hacia cada socio
CPTPP+China, por capítulo arancelario (HS2) y año — reemplaza la necesidad
de Comtrade para el detalle por socio de este proyecto (ver
data/raw/README.md, sección BACI).

Entrada: ruta al BACI_HS92_V202601.zip (parámetro --zip)
Salida:  ../data/raw/baci_peru_bilateral_hs2.csv

Uso:
    python 08_export_baci_bilateral.py --zip "<ruta al zip>"
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

SOCIOS = {
    36: "Australia", 96: "Brunéi Darussalam", 124: "Canadá", 152: "Chile",
    156: "China", 392: "Japón", 458: "Malasia", 484: "México",
    554: "Nueva Zelanda", 702: "Singapur", 704: "Vietnam", 826: "Reino Unido",
}


def hs2(k: int) -> str:
    return f"{k:06d}"[:2]


def procesar_anio(zf: zipfile.ZipFile, anio: int) -> dict:
    nombre = f"BACI_HS92_Y{anio}_V202601.csv"
    acc: dict[tuple[int, str], float] = defaultdict(float)

    with zf.open(nombre) as f:
        for chunk in pd.read_csv(f, chunksize=CHUNK):
            sub = chunk[(chunk["i"] == PERU) & (chunk["j"].isin(SOCIOS.keys()))]
            if sub.empty:
                continue
            sub = sub.copy()
            sub["hs2"] = sub["k"].apply(hs2)
            g = sub.groupby(["j", "hs2"])["v"].sum()
            for (j, h), v in g.items():
                acc[(j, h)] += v
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
            for (j, h), v in sorted(acc.items()):
                filas.append({
                    "anio": anio, "partner_codigo": j, "partner_nombre": SOCIOS[j],
                    "hs2": h, "v_miles_usd": round(v, 2),
                })
            print(f"{anio}: {len(acc)} combinaciones socio-capítulo")

    pd.DataFrame(filas).to_csv(OUT_DIR / "baci_peru_bilateral_hs2.csv", index=False)
    print(f"\nEscrito {OUT_DIR / 'baci_peru_bilateral_hs2.csv'} ({len(filas)} filas)")


if __name__ == "__main__":
    main()
