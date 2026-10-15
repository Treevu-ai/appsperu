"""
Calcula RCA (Balassa) y la descomposición shift-share usando los datos de
BACI (completos 2015-2024, sin los huecos que tenía Comtrade — ver
data/raw/README.md).

Entradas:
  ../data/raw/baci_peru_hs2.csv            (Perú, todos los destinos, por capítulo)
  ../data/raw/baci_mundo_hs2.csv           (mundo, por capítulo)
  ../data/raw/baci_peru_bilateral_hs2.csv  (Perú -> cada socio CPTPP+China, por capítulo)

Salidas:
  ../data/processed/rca_peru_baci.csv
  ../data/processed/shift_share_baci.csv (2015 -> 2024)

Uso:
    python 09_rca_shift_share_baci.py
"""
from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw"
OUT = Path(__file__).parent / ".." / "data" / "processed"


def calcular_rca() -> pd.DataFrame:
    peru = pd.read_csv(RAW / "baci_peru_hs2.csv", dtype={"hs2": str})
    mundo = pd.read_csv(RAW / "baci_mundo_hs2.csv", dtype={"hs2": str})

    peru_total = peru.groupby("anio")["v_miles_usd"].sum().rename("x_peru_total")
    mundo_total = mundo.groupby("anio")["v_miles_usd"].sum().rename("x_mundo_total")

    df = peru.merge(mundo, on=["anio", "hs2"], suffixes=("_peru", "_mundo"))
    df = df.join(peru_total, on="anio").join(mundo_total, on="anio")
    df["rca"] = (df["v_miles_usd_peru"] / df["x_peru_total"]) / (
        df["v_miles_usd_mundo"] / df["x_mundo_total"]
    )
    return df[["anio", "hs2", "v_miles_usd_peru", "v_miles_usd_mundo", "rca"]].round(4)


def calcular_shift_share(anio_base: int, anio_final: int) -> pd.DataFrame:
    mundo = pd.read_csv(RAW / "baci_mundo_hs2.csv", dtype={"hs2": str})
    peru = pd.read_csv(RAW / "baci_peru_hs2.csv", dtype={"hs2": str})

    m0 = mundo[mundo["anio"] == anio_base].set_index("hs2")["v_miles_usd"]
    m1 = mundo[mundo["anio"] == anio_final].set_index("hs2")["v_miles_usd"]
    p0 = peru[peru["anio"] == anio_base].set_index("hs2")["v_miles_usd"]
    p1 = peru[peru["anio"] == anio_final].set_index("hs2")["v_miles_usd"]

    g_mundo = m1.sum() / m0.sum() - 1

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
            "efecto_demanda_mundial": round(efecto_demanda, 2),
            "efecto_estructura": round(efecto_estructura, 2),
            "efecto_competitividad": round(efecto_competitividad, 2),
        })
    return pd.DataFrame(filas)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    rca = calcular_rca()
    rca.to_csv(OUT / "rca_peru_baci.csv", index=False)
    print(f"RCA: {len(rca)} filas, {rca['anio'].nunique()} años, {rca['hs2'].nunique()} capítulos")

    ss = calcular_shift_share(2015, 2024)
    ss.to_csv(OUT / "shift_share_baci.csv", index=False)
    print(f"Shift-share 2015->2024: {len(ss)} capítulos")

    total_competitividad = ss["efecto_competitividad"].sum()
    total_demanda = ss["efecto_demanda_mundial"].sum()
    total_estructura = ss["efecto_estructura"].sum()
    print(
        f"\nDescomposición agregada del crecimiento exportador 2015->2024 (miles USD):\n"
        f"  Efecto demanda mundial:   {total_demanda:,.0f}\n"
        f"  Efecto estructura:        {total_estructura:,.0f}\n"
        f"  Efecto competitividad:    {total_competitividad:,.0f}"
    )


if __name__ == "__main__":
    main()
