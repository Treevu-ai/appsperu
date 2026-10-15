"""
Descomposición shift-share (Tyszynski 1951; Leamer y Stern 1970) del
crecimiento exportador de Perú entre dos años, en tres componentes:

  1. Efecto de crecimiento de la demanda mundial (structural/general)
  2. Efecto de composición estructural (mezcla de capítulos elegidos)
  3. Efecto de competitividad real (residual, "efecto neto")

Fórmula estándar (por capítulo c, entre año base 0 y año final 1):
  efecto_general_c   = X_peru,c,0 * g_mundo
  efecto_estructura_c = X_peru,c,0 * (g_mundo,c - g_mundo)
  efecto_competitividad_c = X_peru,c,1 - X_peru,c,0 * (1 + g_mundo,c)

donde g_mundo = tasa de crecimiento de las exportaciones mundiales totales,
g_mundo,c = tasa de crecimiento de las exportaciones mundiales del capítulo c.

Entrada:  ../data/raw/comtrade_flujos.csv
Salida:   ../data/processed/shift_share.csv

REQUIERE que el agregado mundial (reporter_code '0') esté cargado para
AMBOS años a comparar — hoy solo está cargado para 2019 (ver
../data/raw/README.md, sección "Huecos de datos"). Correr
`mcp-server/src/ingest/comtrade-benchmark.ts` para 2020-2024 antes de usar
este script con un año final distinto de 2019.

Uso:
    python 05_shift_share.py --anio-base 2019 --anio-final 2024
"""
import argparse
from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw" / "comtrade_flujos.csv"
OUT = Path(__file__).parent / ".." / "data" / "processed" / "shift_share.csv"


def cargar_mundo_y_peru(df: pd.DataFrame, anio: int) -> tuple[pd.Series, pd.Series]:
    sub = df[(df["anio"] == anio) & (df["flujo"] == "X") & (df["partner_code"] == "0")]
    peru = sub[sub["reporter_code"] == "604"].set_index("cmd_code")["fob_usd"]
    mundo = sub[sub["reporter_code"] == "0"].set_index("cmd_code")["fob_usd"]
    return peru, mundo


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--anio-base", type=int, required=True)
    parser.add_argument("--anio-final", type=int, required=True)
    args = parser.parse_args()

    df = pd.read_csv(RAW, dtype={"reporter_code": str, "partner_code": str, "cmd_code": str})

    peru_0, mundo_0 = cargar_mundo_y_peru(df, args.anio_base)
    peru_1, mundo_1 = cargar_mundo_y_peru(df, args.anio_final)

    if mundo_0.empty or mundo_1.empty:
        raise SystemExit(
            f"Falta el agregado mundial (reporter_code '0') para {args.anio_base} o "
            f"{args.anio_final}. Ver ../data/raw/README.md antes de continuar."
        )

    g_mundo = mundo_1["TOTAL"] / mundo_0["TOTAL"] - 1

    filas = []
    for cmd in sorted(c for c in peru_0.index if c != "TOTAL"):
        if cmd not in peru_1.index or cmd not in mundo_1.index:
            continue
        x_peru_0 = peru_0[cmd]
        g_mundo_c = mundo_1[cmd] / mundo_0[cmd] - 1 if mundo_0[cmd] else None
        if g_mundo_c is None:
            continue
        efecto_general = x_peru_0 * g_mundo
        efecto_estructura = x_peru_0 * (g_mundo_c - g_mundo)
        efecto_competitividad = peru_1[cmd] - x_peru_0 * (1 + g_mundo_c)
        filas.append(
            {
                "cmd_code": cmd,
                "x_peru_base": x_peru_0,
                "x_peru_final": peru_1[cmd],
                "efecto_demanda_mundial": round(efecto_general, 2),
                "efecto_estructura": round(efecto_estructura, 2),
                "efecto_competitividad": round(efecto_competitividad, 2),
            }
        )

    out_df = pd.DataFrame(filas)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(OUT, index=False)
    print(f"Escrito {OUT} ({len(out_df)} capítulos, {args.anio_base} -> {args.anio_final})")


if __name__ == "__main__":
    main()
