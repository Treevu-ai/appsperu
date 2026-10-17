# -*- coding: utf-8 -*-
"""
Paso 32 — Resumen del panel HS6 (script 19) para el libro de resultados.

Describe el panel Perú -> mundo a nivel HS6 construido en el paso 19:
dimensión por año, cobertura de la intensidad contractual de Nunn (2007) y de
la clasificación Rauch (1999), y la magnitud de la demanda del destino.

Salida: results_avanzados/32_panel_hs6.csv
"""
from pathlib import Path

import pandas as pd

from _comun_gravedad import RAW, RESULTADOS

NUNN = RAW / "nunn"


def main() -> None:
    exp = pd.read_csv(RAW / "baci_peru_exports_hs6.csv")
    exp["hs6"] = exp["hs6"].astype(str).str.zfill(6)

    ci = pd.read_csv(NUNN / "intensidad_contractual_hs6.csv", dtype={"hs6": str})
    ci["hs6"] = ci["hs6"].str.zfill(6)
    exp = exp.merge(ci[["hs6", "ci_nunn_lib", "rauch_lib_diff"]], on="hs6", how="left")

    filas = []
    for anio, g in exp.groupby("anio"):
        con_nunn = g["ci_nunn_lib"].notna()
        con_rauch = g["rauch_lib_diff"].notna()
        valor = g["v_miles_usd"].sum()
        filas.append({
            "anio": int(anio),
            "productos_hs6": int(g["hs6"].nunique()),
            "socios": int(g["partner_codigo"].nunique()),
            "observaciones": int(len(g)),
            "valor_musd": round(valor / 1000, 1),  # v_miles_usd -> millones USD
            "obs_con_nunn": int(con_nunn.sum()),
            "pct_valor_con_nunn": round(100 * g.loc[con_nunn, "v_miles_usd"].sum() / valor, 1),
            "obs_con_rauch": int(con_rauch.sum()),
        })

    peru = pd.DataFrame(filas)

    # Demanda del destino (importaciones del socio desde el mundo, excl. Perú) por año.
    imp = pd.read_csv(RAW / "baci_partner_imports_hs6.csv")
    dem = (imp.groupby("anio")["v_miles_usd"].sum() / 1000).round(1).rename("demanda_mundo_musd")
    peru = peru.merge(dem, on="anio", how="left")

    total = {
        "anio": "TOTAL",
        "productos_hs6": int(exp["hs6"].nunique()),
        "socios": int(exp["partner_codigo"].nunique()),
        "observaciones": int(len(exp)),
        "valor_musd": round(exp["v_miles_usd"].sum() / 1000, 1),
        "obs_con_nunn": int(exp["ci_nunn_lib"].notna().sum()),
        "pct_valor_con_nunn": round(
            100 * exp.loc[exp["ci_nunn_lib"].notna(), "v_miles_usd"].sum() / exp["v_miles_usd"].sum(), 1),
        "obs_con_rauch": int(exp["rauch_lib_diff"].notna().sum()),
        "demanda_mundo_musd": float("nan"),
    }
    peru = pd.concat([peru, pd.DataFrame([total]).reindex(columns=peru.columns)], ignore_index=True)

    RESULTADOS.mkdir(exist_ok=True)
    peru.to_csv(RESULTADOS / "32_panel_hs6.csv", index=False)
    print(f"guardado: results_avanzados/32_panel_hs6.csv ({len(peru)} filas)")
    pd.set_option("display.width", 200)
    print(peru.to_string(index=False))


if __name__ == "__main__":
    main()
