"""
Calcula la Ventaja Comparativa Revelada (RCA, Balassa 1965) de Perú por
capítulo arancelario y año, a partir de los flujos Comtrade ya exportados.

RCA_c = (X_peru,c / X_peru,total) / (X_mundo,c / X_mundo,total)

Usa reporter_code '604' (Perú) y '0' (agregado mundial), ambos con
partner_code '0' (comercio total con el mundo, no bilateral) — ver el
comentario de armado del agregado mundial en
mcp-server/src/ingest/comtrade-benchmark.ts.

Entrada:  ../data/raw/comtrade_flujos.csv
Salida:   ../data/processed/rca_peru.csv

Uso:
    python 04_calcular_rca.py
"""
from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw" / "comtrade_flujos.csv"
OUT = Path(__file__).parent / ".." / "data" / "processed" / "rca_peru.csv"


def main() -> None:
    df = pd.read_csv(RAW, dtype={"reporter_code": str, "partner_code": str, "cmd_code": str})
    df = df[(df["flujo"] == "X") & (df["partner_code"] == "0")]

    peru = df[df["reporter_code"] == "604"].set_index(["anio", "cmd_code"])["fob_usd"]
    mundo = df[df["reporter_code"] == "0"].set_index(["anio", "cmd_code"])["fob_usd"]

    filas = []
    for anio in sorted(df["anio"].unique()):
        try:
            x_peru_total = peru.loc[(anio, "TOTAL")]
            x_mundo_total = mundo.loc[(anio, "TOTAL")]
        except KeyError:
            continue  # año sin agregado TOTAL cargado, se omite
        for cmd in sorted(c for c in df["cmd_code"].unique() if c != "TOTAL"):
            if (anio, cmd) not in peru.index or (anio, cmd) not in mundo.index:
                continue
            x_peru_c = peru.loc[(anio, cmd)]
            x_mundo_c = mundo.loc[(anio, cmd)]
            if x_mundo_c == 0 or x_mundo_total == 0 or x_peru_total == 0:
                continue
            rca = (x_peru_c / x_peru_total) / (x_mundo_c / x_mundo_total)
            filas.append({"anio": anio, "cmd_code": cmd, "rca": round(rca, 4)})

    out_df = pd.DataFrame(filas).sort_values(["cmd_code", "anio"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(OUT, index=False)
    print(f"Escrito {OUT} ({len(out_df)} filas, {out_df['cmd_code'].nunique()} capítulos, "
          f"{out_df['anio'].nunique()} años)")


if __name__ == "__main__":
    main()
