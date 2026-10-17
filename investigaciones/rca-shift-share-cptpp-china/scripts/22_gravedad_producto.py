"""
Paso 22 — Gravedad POR PRODUCTO con exposición diferencial a la gobernanza.

Hipótesis: la gobernanza del socio importa MÁS en bienes complejos/diferenciados
(donde los contratos son incompletos y pesa el entorno institucional) que en
bienes homogéneos. Si es así, la señal ausente en primeras diferencias agregadas
vive DENTRO de producto.

Datos:
  - baci_peru_todos_socios_hs4.csv (21_): exportaciones Perú->socio por HS4, 2015-2024
  - complejidad_hs4.csv (27_): PCI por producto (se usa el de 2015 como característica
    predeterminada, para evitar simultaneidad con los resultados 2016-2024)
  - gobernanza WGI rezagada t-1 y controles de gravedad

Especificación (PPML con FE de socio + año + HS2, ppmlhdfe vía pyfixest):
    export_{pjt} = exp( b1*WGI_{j,t-1} + b2*WGI_{j,t-1}*PCI_p + controles + FE + e )

Salida: results_avanzados/22_gravedad_producto.csv  (+ panel en data/processed/)
"""
import numpy as np
import pandas as pd
import pyfixest as pf
import statsmodels.formula.api as smf

from _comun_gravedad import (RAW, PROCESSED, RESULTADOS, cargar_geodist,
                             cargar_gravedad_socios, cargar_wgi_wide, guardar_csv)


def cargar_panel_producto() -> pd.DataFrame:
    exp = pd.read_csv(RAW / "baci_peru_todos_socios_hs4.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")[
        ["country_code", "country_iso3"]].rename(columns={"country_iso3": "iso3",
                                                          "country_code": "partner_codigo"})
    exp = exp.merge(codigos, on="partner_codigo", how="left")
    exp["hs2"] = exp["hs4"] // 100

    wgi = cargar_wgi_wide(rezago=1, dimensiones=False)          # solo promedio
    socios = cargar_gravedad_socios()[["iso3", "anio", "pib_usd", "poblacion"]]
    geo = cargar_geodist()
    pci = pd.read_csv(RESULTADOS / "complejidad_hs4.csv")[["hs4", "pci_2015"]]

    df = exp.merge(socios, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi, on=["iso3", "anio"], how="inner")
    df = df.merge(geo, on="iso3", how="inner")
    df = df.merge(pci, on="hs4", how="left")
    df = df[(df["v_miles_usd"] > 0) & (df["pib_usd"] > 0) & (df["pci_2015"].notna())].copy()
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_exportaciones"] = np.log(df["v_miles_usd"])
    return df.reset_index(drop=True)


def main() -> None:
    df = cargar_panel_producto()
    guardar_csv(df, "panel_gravedad_producto_hs4.csv")
    print(f"Panel producto: {len(df):,} filas | {df['iso3'].nunique()} socios | "
          f"{df['hs4'].nunique()} HS4 | años {df['anio'].min()}-{df['anio'].max()}")

    filas = []

    # --- PPML con FE de socio + año + HS2 ---
    m1 = pf.fepois("v_miles_usd ~ wgi_promedio + wgi_promedio:pci_2015 + log_pib "
                   "| iso3 + anio + hs2", data=df, vcov={"CRV1": "iso3"})
    for v in ["wgi_promedio", "wgi_promedio:pci_2015"]:
        filas.append({"modelo": "PPML FE socio+año+HS2", "variable": v,
                      "coef": m1.coef()[v], "se": m1.se()[v], "p": m1.pvalue()[v],
                      "n": int(m1._N), "ratio": np.exp(m1.coef()[v])})

    # --- PPML sin FE de producto (solo socio + año) ---
    m2 = pf.fepois("v_miles_usd ~ wgi_promedio + wgi_promedio:pci_2015 + log_pib "
                   "| iso3 + anio", data=df, vcov={"CRV1": "iso3"})
    for v in ["wgi_promedio", "wgi_promedio:pci_2015"]:
        filas.append({"modelo": "PPML FE socio+año", "variable": v,
                      "coef": m2.coef()[v], "se": m2.se()[v], "p": m2.pvalue()[v],
                      "n": int(m2._N), "ratio": np.exp(m2.coef()[v])})

    # --- OLS log-lineal con FE (comparación) ---
    df_sin_pib = df.dropna(subset=["log_exportaciones", "log_pib", "pci_2015"])
    m3 = pf.feols("log_exportaciones ~ wgi_promedio + wgi_promedio:pci_2015 + log_pib "
                  "| iso3 + anio + hs2", data=df_sin_pib, vcov={"CRV1": "iso3"})
    for v in ["wgi_promedio", "wgi_promedio:pci_2015"]:
        filas.append({"modelo": "OLS log FE socio+año+HS2", "variable": v,
                      "coef": m3.coef()[v], "se": m3.se()[v], "p": m3.pvalue()[v],
                      "n": int(m3._N), "ratio": np.nan})

    # --- Split por tercio de complejidad: PPML del WGI por grupo ---
    df["tercio_pci"] = pd.qcut(df["pci_2015"], 3, labels=["baja", "media", "alta"])
    for g in ["baja", "media", "alta"]:
        sub = df[df["tercio_pci"] == g]
        mg = pf.fepois("v_miles_usd ~ wgi_promedio + log_pib | iso3 + anio + hs2",
                       data=sub, vcov={"CRV1": "iso3"})
        filas.append({"modelo": f"PPML complejidad {g}", "variable": "wgi_promedio",
                      "coef": mg.coef()["wgi_promedio"], "se": mg.se()["wgi_promedio"],
                      "p": mg.pvalue()["wgi_promedio"], "n": int(mg._N),
                      "ratio": np.exp(mg.coef()["wgi_promedio"])})

    tabla = pd.DataFrame(filas)
    tabla.to_csv(RESULTADOS / "22_gravedad_producto.csv", index=False)
    pd.set_option("display.width", 220)
    print("\n" + "=" * 96)
    print("GRAVEDAD POR PRODUCTO — gobernanza e interacción con complejidad (PCI)")
    print("=" * 96)
    print(tabla.to_string(index=False, float_format=lambda x: f"{x:,.4g}"))
    print("\nratio = exp(coef): multiplicador por +1 unidad de WGI (o por +1 desv. de PCI en la interacción).")


if __name__ == "__main__":
    main()
