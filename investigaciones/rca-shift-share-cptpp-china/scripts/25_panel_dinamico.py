"""
Paso 25 — Panel dinámico: persistencia de las exportaciones y gobernanza.

El comercio es persistente (efectos de red, costos hundidos). Un panel dinámico
con la exportación rezagada como regresor es endógeno por construcción; se
estima por el método de Anderson-Hsiao: primeras diferencias + instrumentación
de la variable dependiente rezagada con su segundo rezago en niveles.

  Δlog(export)_{jt} = ρ Δlog(export)_{j,t-1} + β WGI_{j,t-1} + γ Δlog(PIB) + año FE + e

A. WGI exógeno (instrumento solo el rezago de la dependiente).
B. WGI endógeno (se instrumenta también con su rezago en niveles).

Salida: results_avanzados/25_panel_dinamico.csv (+ consola)
"""
import numpy as np
import pandas as pd
from linearmodels.iv import IV2SLS

from _comun_gravedad import RESULTADOS, panel_positivos


def construir_diferencias() -> tuple[pd.DataFrame, str, list[str]]:
    df = panel_positivos().sort_values(["iso3", "anio"]).copy()
    g = df.groupby("iso3")
    df["L1_lexp"] = g["log_exportaciones"].shift(1)
    df["L2_lexp"] = g["log_exportaciones"].shift(2)
    df["L1_wgi"] = g["wgi_promedio"].shift(1)
    df["L1_lpib"] = g["log_pib"].shift(1)

    df["d_lexp"] = df["log_exportaciones"] - df["L1_lexp"]
    df["d_llexp"] = df["L1_lexp"] - df["L2_lexp"]
    df["d_wgi"] = df["wgi_promedio"] - df["L1_wgi"]
    df["d_lpib"] = df["log_pib"] - df["L1_lpib"]
    df = df.dropna(subset=["d_lexp", "d_llexp", "d_wgi", "d_lpib", "L2_lexp", "L1_wgi"]).copy()

    year = sorted(df["anio"].unique())[1:]
    for a in year:
        df[f"y{a}"] = (df["anio"] == a).astype(int)
    ydum = " + ".join([f"y{a}" for a in year])
    return df, ydum, year


def main() -> None:
    df, ydum, year = construir_diferencias()
    print(f"Panel en diferencias: {len(df)} obs | {df['iso3'].nunique()} países")
    filas = []

    # A — WGI exógeno
    fmlA = (f"d_lexp ~ d_lpib + d_wgi + {ydum} + [d_llexp ~ L2_lexp]")
    rA = IV2SLS.from_formula(fmlA, data=df).fit(cov_type="clustered", clusters=df["iso3"])
    filas.append({"modelo": "A. WGI exógeno", "var": "rho (persistencia)",
                  "coef": rA.params["d_llexp"], "p": rA.pvalues["d_llexp"], "n": int(rA.nobs)})
    filas.append({"modelo": "A. WGI exógeno", "var": "beta (WGI)",
                  "coef": rA.params["d_wgi"], "p": rA.pvalues["d_wgi"], "n": int(rA.nobs)})

    # B — WGI endógeno
    fmlB = (f"d_lexp ~ d_lpib + {ydum} + [d_llexp + d_wgi ~ L2_lexp + L1_wgi]")
    rB = IV2SLS.from_formula(fmlB, data=df).fit(cov_type="clustered", clusters=df["iso3"])
    filas.append({"modelo": "B. WGI endógeno", "var": "rho (persistencia)",
                  "coef": rB.params["d_llexp"], "p": rB.pvalues["d_llexp"], "n": int(rB.nobs)})
    filas.append({"modelo": "B. WGI endógeno", "var": "beta (WGI)",
                  "coef": rB.params["d_wgi"], "p": rB.pvalues["d_wgi"], "n": int(rB.nobs)})

    # C — OLS en diferencias (WGI exógeno, sin instrumentar; comparación)
    import statsmodels.formula.api as smf
    rC = smf.ols(f"d_lexp ~ d_llexp + d_wgi + d_lpib + {ydum}", data=df).fit(
        cov_type="cluster", cov_kwds={"groups": df["iso3"]})
    filas.append({"modelo": "C. OLS en diferencias", "var": "rho (persistencia)",
                  "coef": rC.params["d_llexp"], "p": rC.pvalues["d_llexp"], "n": int(rC.nobs)})
    filas.append({"modelo": "C. OLS en diferencias", "var": "beta (WGI)",
                  "coef": rC.params["d_wgi"], "p": rC.pvalues["d_wgi"], "n": int(rC.nobs)})

    tabla = pd.DataFrame(filas)
    tabla.to_csv(RESULTADOS / "25_panel_dinamico.csv", index=False)
    pd.set_option("display.width", 160)
    print("\n" + "=" * 80)
    print("PANEL DINÁMICO — persistencia y gobernanza")
    print("=" * 80)
    print(tabla.to_string(index=False, float_format=lambda x: f"{x:,.4g}"))
    print("\nrho cercano a 1 indica fuerte persistencia; beta mide el efecto de la gobernanza"
          "\nen la variación dentro del país (primeras diferencias).")


if __name__ == "__main__":
    main()
