# -*- coding: utf-8 -*-
"""
Paso 31 — H3 DEFINITIVA: exposición diferencial con intensidad contractual de
Nunn (2007) y efectos fijos PRODUCTO x SOCIO.

Especificación central (diseño de exposición diferencial):

    X_{pjt} = exp( b1*WGI_{j,t-1} + b2*(WGI_{j,t-1} x CI_p) + controles
                   + alpha_{pj} + mu_t + e )

donde CI_p es la intensidad contractual del producto (Nunn 2007; contraste con
Rauch 1999), D_{pjt} es la demanda del destino (importaciones del socio desde el
mundo, excluido Perú) y alpha_{pj} son efectos fijos producto-socio.

La especificación saturada añade FE producto-año y socio-año, con lo cual el
efecto de nivel de la gobernanza queda absorbido y sólo se identifica b2.

Salidas: results_avanzados/31_h3_definitiva.csv
         data/processed/panel_h3_definitiva_hs4.csv
"""
from pathlib import Path

import numpy as np
import pandas as pd
import pyfixest as pf

from _comun_gravedad import RAW, RESULTADOS, cargar_gravedad_socios, cargar_wgi_wide, guardar_csv

NUNN = RAW / "nunn"


def codigos() -> pd.DataFrame:
    return (pd.read_csv(RAW / "baci_country_codes.csv")[["country_code", "country_iso3"]]
            .rename(columns={"country_code": "partner_codigo", "country_iso3": "iso3"}))


def demanda_mundo_hs4() -> pd.DataFrame:
    """Importaciones del socio desde el mundo (excluido Perú), agregadas a HS4."""
    imp = pd.read_csv(RAW / "baci_partner_imports_hs6.csv")
    imp["hs4"] = (imp["hs6"] // 100).astype(int)
    return (imp.groupby(["partner_codigo", "hs4", "anio"])["v_miles_usd"].sum()
               .rename("demanda_mundo").reset_index())


def construir_panel(nivel: str = "hs4") -> pd.DataFrame:
    if nivel == "hs4":
        exp = pd.read_csv(RAW / "baci_peru_todos_socios_hs4.csv")
        exp["hs4"] = exp["hs4"].astype(int)
        ci = pd.read_csv(NUNN / "intensidad_contractual_hs4.csv")
        exp = exp.merge(ci, on="hs4", how="left")
        clave = "hs4"
    else:
        exp = pd.read_csv(RAW / "baci_peru_exports_hs6.csv")
        exp["hs6"] = exp["hs6"].astype(str).str.zfill(6)
        exp["hs4"] = exp["hs6"].str[:4].astype(int)
        ci = pd.read_csv(NUNN / "intensidad_contractual_hs6.csv", dtype={"hs6": str})
        ci["hs6"] = ci["hs6"].str.zfill(6)
        ci = ci.drop(columns=[c for c in ("hs4",) if c in ci.columns])
        exp = exp.merge(ci, on="hs6", how="left")
        clave = "hs6"

    exp = exp.merge(codigos(), on="partner_codigo", how="left")
    socios = cargar_gravedad_socios()[["iso3", "anio", "pib_usd", "poblacion"]]
    wgi = cargar_wgi_wide(rezago=1, dimensiones=False)
    dem = demanda_mundo_hs4()

    df = (exp.merge(socios, on=["iso3", "anio"], how="inner")
             .merge(wgi, on=["iso3", "anio"], how="inner")
             .merge(dem, on=["partner_codigo", "hs4", "anio"], how="left"))

    df = df[(df["v_miles_usd"] > 0) & (df["pib_usd"] > 0)].copy()
    df = df[df["ci_nunn_lib"].notna()].copy()
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_demanda"] = np.log(df["demanda_mundo"].clip(lower=1))
    df["log_exportaciones"] = np.log(df["v_miles_usd"])
    df["ci_c"] = df["ci_nunn_lib"] - df["ci_nunn_lib"].mean()
    df["wgi_c"] = df["wgi_promedio"] - df["wgi_promedio"].mean()
    # rauch: 1 = diferenciado; NA -> se conserva y el término se estima donde existe
    df["pj"] = pd.factorize(df[clave].astype(str) + "_" + df["iso3"])[0]
    df["pt"] = pd.factorize(df[clave].astype(str) + "_" + df["anio"].astype(str))[0]
    df["jt"] = pd.factorize(df["iso3"] + "_" + df["anio"].astype(str))[0]
    return df.reset_index(drop=True)


def registrar(filas, etiqueta, modelo):
    for v in modelo.coef().index:
        if "wgi" in v or "rauch" in v:
            filas.append({"modelo": etiqueta, "variable": v,
                          "coef": float(modelo.coef()[v]), "se": float(modelo.se()[v]),
                          "p": float(modelo.pvalue()[v]), "n": int(modelo._N),
                          "ratio": float(np.exp(modelo.coef()[v]))})


def main() -> None:
    filas: list[dict] = []

    for nivel, etiqueta_nivel in [("hs4", "HS4"), ("hs6", "HS6")]:
        df = construir_panel(nivel)
        if nivel == "hs4":
            guardar_csv(df, "panel_h3_definitiva_hs4.csv")
        col_prod = "hs6" if nivel == "hs6" else "hs4"
        print(f"\n[{etiqueta_nivel}] panel: {len(df):,} obs | {df['iso3'].nunique()} socios | "
              f"{df[col_prod].nunique()} productos")

        # --- A. PPML, FE producto x socio + año (log-demanda incluido) ---
        try:
            m = pf.fepois("v_miles_usd ~ wgi_c + wgi_c:ci_c + log_pib + log_demanda | pj + anio",
                          data=df, vcov={"CRV1": "iso3"})
            registrar(filas, f"A. PPML FE producto x socio + año ({etiqueta_nivel})", m)
        except Exception as e:  # noqa: BLE001
            print("  A falló:", e)

        # --- B. Saturada: FE producto-socio + socio-año (el nivel del WGI queda absorbido) ---
        # PPML; si el demeaning no converge, se recurre a OLS log-lineal con la misma FE.
        for nom, fn, formula in [("PPML", pf.fepois, "v_miles_usd ~ wgi_c:ci_c | pj + jt"),
                                 ("OLS", pf.feols, "log_exportaciones ~ wgi_c:ci_c | pj + jt")]:
            try:
                m = fn(formula, data=df, vcov={"CRV1": "iso3"})
                registrar(filas, f"B. {nom} FE producto-socio + socio-año ({etiqueta_nivel})", m)
                break
            except Exception as e:  # noqa: BLE001
                print(f"  B ({nom}) falló:", e)

        # --- B2. Saturada plena: FE producto-socio + producto-año + socio-año ---
        try:
            m = pf.feols("log_exportaciones ~ wgi_c:ci_c | pj + pt + jt",
                         data=df, vcov={"CRV1": "iso3"})
            registrar(filas, f"B2. OLS saturada FE pj+pt+jt ({etiqueta_nivel})", m)
        except Exception as e:  # noqa: BLE001
            print("  B2 falló:", e)

        # --- C. OLS log-lineal, FE producto x socio + año ---
        try:
            m = pf.feols("log_exportaciones ~ wgi_c + wgi_c:ci_c + log_pib + log_demanda | pj + anio",
                         data=df, vcov={"CRV1": "iso3"})
            registrar(filas, f"C. OLS FE producto x socio + año ({etiqueta_nivel})", m)
        except Exception as e:  # noqa: BLE001
            print("  C falló:", e)

        # --- D. Contraste Rauch (diferenciado vs homogéneo), FE producto x socio + año ---
        sub = df[df["rauch_lib_diff"].notna()].copy()
        try:
            m = pf.fepois("v_miles_usd ~ wgi_c + wgi_c:rauch_lib_diff + log_pib + log_demanda | pj + anio",
                          data=sub, vcov={"CRV1": "iso3"})
            registrar(filas, f"D. PPML FE producto x socio + año, Rauch ({etiqueta_nivel})", m)
        except Exception as e:  # noqa: BLE001
            print("  D falló:", e)

        # --- E/G. Por tercio de intensidad contractual (efecto de nivel del WGI) ---
        df["tercio_ci"] = pd.qcut(df["ci_nunn_lib"], 3, labels=["baja", "media", "alta"])
        for g in ["baja", "media", "alta"]:
            s = df[df["tercio_ci"] == g]
            try:
                mg = pf.fepois("v_miles_usd ~ wgi_c + log_pib + log_demanda | pj + anio",
                               data=s, vcov={"CRV1": "iso3"})
                registrar(filas, f"E. PPML FE pj+año, CI {g} ({etiqueta_nivel})", mg)
            except Exception as e:  # noqa: BLE001
                print(f"  E ({g}) falló:", e)

    tabla = pd.DataFrame(filas)
    tabla.to_csv(RESULTADOS / "31_h3_definitiva.csv", index=False)
    pd.set_option("display.width", 220)
    print("\n" + "=" * 100)
    print("H3 DEFINITIVA — exposición diferencial con Nunn (2007) y FE producto x socio")
    print("=" * 100)
    print(tabla.to_string(index=False, float_format=lambda x: f"{x:,.4g}"))
    print("\nratio = exp(coef). 'wgi_c' = efecto de nivel con CI en su media; 'wgi_c:ci_c' = cómo cambia por unidad de intensidad contractual.")


if __name__ == "__main__":
    main()
