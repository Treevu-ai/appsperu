"""
Descomposición shift-share (Tyszynski 1951; Leamer y Stern 1970) del
crecimiento exportador de Perú entre dos años, en tres componentes:

  1. Efecto de crecimiento de la demanda mundial (efecto estructural general)
  2. Efecto de composición estructural (mezcla de capítulos elegidos)
  3. Efecto de competitividad real (residual, "efecto neto")

Fórmula estándar (por capítulo c, entre año base 0 y año final 1):
  efecto_demanda_c    = X_peru,c,0 * g_mundo
  efecto_estructura_c = X_peru,c,0 * (g_mundo,c - g_mundo)
  efecto_competitividad_c = X_peru,c,1 - X_peru,c,0 * (1 + g_mundo,c)

donde g_mundo = tasa de crecimiento de las exportaciones mundiales totales,
g_mundo,c = tasa de crecimiento de las exportaciones mundiales del capítulo c.

FUENTE: BACI (CEPII, HS92, versión 202601) — cubre 2015-2024 completos,
sin los huecos que tenía Comtrade.

Entrada:
  ../data/raw/baci_peru_hs2.csv    (Perú por capítulo y año)
  ../data/raw/baci_mundo_hs2.csv   (mundo por capítulo y año)

Salida:
  ../data/processed/shift_share.csv

Uso:
    python 05_shift_share.py --anio-base 2015 --anio-final 2024
    python 05_shift_share.py --anio-base 2015 --anio-final 2019
    python 05_shift_share.py --anio-base 2019 --anio-final 2024
"""
import argparse
from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw"
OUT = Path(__file__).parent / ".." / "data" / "processed" / "shift_share.csv"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Shift-share del crecimiento exportador de Perú con datos BACI (CEPII)."
    )
    parser.add_argument(
        "--anio-base", type=int, required=True,
        help="Año inicial del período (ej. 2015, 2019)"
    )
    parser.add_argument(
        "--anio-final", type=int, required=True,
        help="Año final del período (ej. 2024)"
    )
    args = parser.parse_args()

    if args.anio_base >= args.anio_final:
        raise SystemExit(f"El año base ({args.anio_base}) debe ser menor que el final ({args.anio_final}).")

    peru = pd.read_csv(RAW / "baci_peru_hs2.csv", dtype={"hs2": str})
    mundo = pd.read_csv(RAW / "baci_mundo_hs2.csv", dtype={"hs2": str})

    anios_disponibles_peru = sorted(peru["anio"].unique())
    anios_disponibles_mundo = sorted(mundo["anio"].unique())

    if args.anio_base not in anios_disponibles_peru:
        raise SystemExit(
            f"Año base {args.anio_base} no está en baci_peru_hs2.csv. "
            f"Disponibles: {anios_disponibles_peru}"
        )
    if args.anio_final not in anios_disponibles_peru:
        raise SystemExit(
            f"Año final {args.anio_final} no está en baci_peru_hs2.csv. "
            f"Disponibles: {anios_disponibles_peru}"
        )

    p0 = peru[peru["anio"] == args.anio_base].set_index("hs2")["v_miles_usd"]
    p1 = peru[peru["anio"] == args.anio_final].set_index("hs2")["v_miles_usd"]
    m0 = mundo[mundo["anio"] == args.anio_base].set_index("hs2")["v_miles_usd"]
    m1 = mundo[mundo["anio"] == args.anio_final].set_index("hs2")["v_miles_usd"]

    g_mundo = m1.sum() / m0.sum() - 1
    g_peru  = p1.sum() / p0.sum() - 1

    print(
        f"Perú {args.anio_base}: US${p0.sum()/1e6:,.1f}M  |  "
        f"{args.anio_final}: US${p1.sum()/1e6:,.1f}M  |  "
        f"Δ = {g_peru*100:+.1f}%"
    )
    print(f"Mundo: g_mundo = {g_mundo*100:+.2f}%")

    filas = []
    for hs2 in sorted(p0.index):
        if hs2 not in p1.index or hs2 not in m0.index or hs2 not in m1.index:
            continue
        x0 = p0[hs2]
        g_c = m1[hs2] / m0[hs2] - 1
        efecto_demanda = x0 * g_mundo
        efecto_estructura = x0 * (g_c - g_mundo)
        efecto_competitividad = p1[hs2] - x0 * (1 + g_c)
        filas.append({
            "hs2": hs2,
            "x_peru_base": x0,
            "x_peru_final": p1[hs2],
            "g_mundo_capitulo": g_c,
            "efecto_demanda_mundial": round(efecto_demanda, 2),
            "efecto_estructura": round(efecto_estructura, 2),
            "efecto_competitividad": round(efecto_competitividad, 2),
        })

    df = pd.DataFrame(filas)

    total_demanda = df["efecto_demanda_mundial"].sum()
    total_estructura = df["efecto_estructura"].sum()
    total_competitividad = df["efecto_competitividad"].sum()
    crecimiento_obs = p1.sum() - p0.sum()
    discrepancia = crecimiento_obs - (total_demanda + total_estructura + total_competitividad)

    print(f"\nDescomposición ({args.anio_base} -> {args.anio_final}):")
    print(f"  Efecto demanda mundial:  US${total_demanda/1e6:+,.1f}M  "
          f"({total_demanda/crecimiento_obs*100:+.1f}%)")
    print(f"  Efecto estructura:      US${total_estructura/1e6:+,.1f}M  "
          f"({total_estructura/crecimiento_obs*100:+.1f}%)")
    print(f"  Efecto competitividad: US${total_competitividad/1e6:+,.1f}M  "
          f"({total_competitividad/crecimiento_obs*100:+.1f}%)")
    print(f"  Suma componentes:       US${(total_demanda+total_estructura+total_competitividad)/1e6:+,.1f}M")
    print(f"  Crecimiento observado:  US${crecimiento_obs/1e6:+,.1f}M")
    print(f"  Discrepancia:          US${discrepancia:+,.2f}")
    print(f"\n({len(df)} capítulos HS2, discrepancia {'< US$1' if abs(discrepancia)<1e3 else 'OK'})")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False)
    print(f"\nEscrito: {OUT}  ({len(df)} filas)")


if __name__ == "__main__":
    main()
