"""
Paso 33 — Pilar B: el espacio de productos explica la diversificacion de Peru,
donde la gobernanza no explico nada (scripts 16-18, 23, 31).

Parte 1 (clasico Hidalgo-Hausmann 2007): entre los productos HS4 que Peru NO
exportaba con RCA>=1 en 2015, ¿la densidad 2015 predice si logro RCA>=1 para
2024? Logit univariado, el test estandar de la literatura de espacio de
productos.

Parte 2 (bilateral, conecta con CPTPP/China): panel HS4 x socio-CPTPP/China x
anio (2016-2024), excluyendo HS4 de minerales/metales preciosos/combustibles
(capitulos 26,71,27 - mismo filtro que gravedad-comercio-bilateral-peru).
PPML: exporta_hs4_ijt ~ log(densidad_p) + wgi_jt-1 + log_pib_j + log_dist_j
      + contig + comlang + colony + FE producto + FE anio
Si log(densidad) es positivo y significativo mientras wgi sigue sin serlo,
confirma el pilar B.

Salidas:
  results_avanzados/33a_espacio_producto_logit.csv
  results_avanzados/33b_bilateral_densidad_vs_wgi.csv
  data/processed/densidad_hs4_2015.csv
"""
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

from _comun_gravedad import RAW, RESULTADOS, PROCESSED, cargar_geodist, cargar_wgi_wide, CPTPP

COMMODITIES_HS2 = {"26", "71", "27"}


def cargar_matriz(anio: int) -> pd.DataFrame:
    df = pd.read_csv(RAW / f"baci_pais_hs4_{anio}.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")[
        ["country_code", "country_iso3"]
    ].rename(columns={"country_code": "iso_i", "country_iso3": "iso3"})
    df = df.merge(codigos, on="iso_i", how="left").dropna(subset=["iso3"])
    return df.pivot_table(index="iso3", columns="hs4", values="v_miles_usd",
                           aggfunc="sum", fill_value=0.0)


def rca_binaria(X: pd.DataFrame, umbral: float = 1.0):
    total_c = X.sum(axis=1)
    total_p = X.sum(axis=0)
    total = X.values.sum()
    rca = (X.div(total_c, axis=0)).div(total_p / total, axis=1)
    return (rca >= umbral).astype(int), rca


def proximidad(R: pd.DataFrame) -> pd.DataFrame:
    M = R.values.astype(float)
    k_p = M.sum(axis=0)
    co = M.T @ M
    denom = np.maximum.outer(k_p, k_p)
    with np.errstate(invalid="ignore", divide="ignore"):
        phi = np.where(denom > 0, co / denom, 0.0)
    return pd.DataFrame(phi, index=R.columns, columns=R.columns)


def densidad_pais(R: pd.DataFrame, iso3: str) -> pd.Series:
    phi = proximidad(R)
    dens = (phi @ R.T).T / phi.sum(axis=1).values  # pais x producto
    return dens.loc[iso3]


def hs4_es_commodity(hs4: int) -> bool:
    hs2 = f"{hs4:04d}"[:2]
    return hs2 in COMMODITIES_HS2


def parte1_logit():
    print("=== Parte 1: ¿la densidad 2015 predice RCA ganado para 2024? ===")
    X15 = cargar_matriz(2015)
    X24 = cargar_matriz(2024)
    R15, _ = rca_binaria(X15)
    R24, _ = rca_binaria(X24)

    if "PER" not in R15.index or "PER" not in R24.index:
        print("PER no está en alguna de las matrices, se omite parte 1")
        return

    dens15 = densidad_pais(R15, "PER")
    rca_per_15 = R15.loc["PER"]
    rca_per_24 = R24.reindex(columns=R15.columns).loc["PER"].fillna(0).astype(int)

    panel = pd.DataFrame({
        "hs4": R15.columns,
        "densidad_2015": dens15.values,
        "rca_2015": rca_per_15.values,
        "rca_2024": rca_per_24.values,
    })
    panel["commodity"] = panel["hs4"].astype(int).map(hs4_es_commodity)

    sin_rca_2015 = panel[panel["rca_2015"] == 0].copy()
    print(f"Productos sin RCA en 2015: {len(sin_rca_2015)} "
          f"(de los cuales {sin_rca_2015['commodity'].sum()} son commodities HS26/71/27)")
    print(f"De esos, lograron RCA para 2024: {int(sin_rca_2015['rca_2024'].sum())}")

    for nombre, sub in [
        ("Todos los productos sin RCA 2015", sin_rca_2015),
        ("Excluyendo commodities HS26/71/27", sin_rca_2015[~sin_rca_2015["commodity"]]),
    ]:
        if sub["rca_2024"].nunique() < 2:
            print(f"{nombre}: sin variación suficiente en el resultado, se omite")
            continue
        m = smf.logit("rca_2024 ~ densidad_2015", data=sub).fit(disp=0)
        print(f"\n--- {nombre} (n={len(sub)}) ---")
        print(m.summary().tables[1])
        sub_out = sub.assign(especificacion=nombre)
        sub_out.to_csv(RESULTADOS / f"33a_espacio_producto_logit_{'todos' if 'Todos' in nombre else 'sin_commodities'}.csv", index=False)

    panel.to_csv(PROCESSED / "densidad_hs4_2015.csv", index=False)
    return panel


def parte2_bilateral(densidad: pd.DataFrame):
    print("\n=== Parte 2: panel bilateral HS4 x socio CPTPP/China, densidad vs WGI ===")
    exp = pd.read_csv(RAW / "baci_peru_todos_socios_hs4.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")[
        ["country_code", "country_iso3"]
    ].rename(columns={"country_code": "partner_codigo", "country_iso3": "iso3"})
    exp = exp.merge(codigos, on="partner_codigo", how="left")

    socios_objetivo = CPTPP | {"CHN"}
    exp = exp[exp["iso3"].isin(socios_objetivo)].copy()
    exp["commodity"] = exp["hs4"].astype(int).map(hs4_es_commodity)
    exp = exp[~exp["commodity"]].copy()
    print(f"Filas bilaterales HS4 no-commodity, socios CPTPP+China: {len(exp)}")

    dens = densidad[["hs4", "densidad_2015"]].copy()
    dens["hs4"] = dens["hs4"].astype(int)
    exp = exp.merge(dens, on="hs4", how="inner")
    exp = exp[exp["densidad_2015"] > 0].copy()
    exp["log_densidad"] = np.log(exp["densidad_2015"])

    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    pib = wdi[wdi["indicador_codigo"] == "NY.GDP.MKTP.CD"][["pais_iso3", "anio", "valor"]].rename(
        columns={"pais_iso3": "iso3", "valor": "pib_usd"})
    wgi = cargar_wgi_wide(rezago=1, dimensiones=False)
    geo = cargar_geodist()

    df = exp.merge(pib, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi, on=["iso3", "anio"], how="inner")
    df = df.merge(geo, on="iso3", how="inner")
    df = df[(df["pib_usd"] > 0) & (df["dist"] > 0)].copy()
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_dist"] = np.log(df["dist"])
    df["y_mill"] = df["v_miles_usd"] / 1000.0  # a millones de USD

    print(f"Panel final: {len(df)} filas, {df['hs4'].nunique()} productos, "
          f"{df['iso3'].nunique()} socios, {df['anio'].nunique()} años")

    # 'colony' es constante (0) para los 11 socios CPTPP+China -- Peru no tiene
    # vinculo colonial con ninguno; se excluye para evitar columna degenerada.
    for col in ["contig", "comlang_off", "colony"]:
        if df[col].nunique() < 2:
            print(f"(se excluye '{col}': varianza nula entre estos socios)")
    variables_geo = [c for c in ["contig", "comlang_off", "colony"] if df[c].nunique() >= 2]
    formula = ("y_mill ~ log_densidad + wgi_promedio + log_pib + log_dist "
               + "".join(f" + {v}" for v in variables_geo) + " + C(anio)")
    print(f"formula: {formula}")
    m = smf.glm(formula, data=df, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": df["iso3"]})
    print(m.summary())

    tabla = pd.DataFrame({
        "variable": ["log_densidad", "wgi_promedio", "log_pib", "log_dist"],
        "coef": [m.params.get(v, np.nan) for v in ["log_densidad", "wgi_promedio", "log_pib", "log_dist"]],
        "se": [m.bse.get(v, np.nan) for v in ["log_densidad", "wgi_promedio", "log_pib", "log_dist"]],
        "p": [m.pvalues.get(v, np.nan) for v in ["log_densidad", "wgi_promedio", "log_pib", "log_dist"]],
        "n": len(df),
    })
    tabla.to_csv(RESULTADOS / "33b_bilateral_densidad_vs_wgi.csv", index=False)


def main():
    panel = parte1_logit()
    if panel is not None:
        parte2_bilateral(panel)


if __name__ == "__main__":
    main()
