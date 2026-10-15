"""
Modelo de gravedad estándar (Tinbergen 1962) sobre TODOS los socios
comerciales reales de Perú (no solo CPTPP+China) — siguiendo el diseño de
la literatura real identificada (Abreo Villamizar et al. 2021; Riker 2022):
panel bilateral con muchos países y años, PIB y distancia como controles
estándar, gobernanza (WGI) rezagada como variable de interés.

  log(exportaciones_jt) = b0 + b1*log(PIB_jt) + b2*log(distancia_j)
                            + b3*WGI_{j,t-1} + b4*frontera_j + b5*idioma_j
                            + b6*colonia_j + efectos de año + e

Entradas:
  ../data/raw/baci_peru_todos_socios.csv  (Perú -> cada socio, código numérico, por año)
  ../data/raw/baci_country_codes.csv      (código numérico -> iso3)
  ../data/raw/geodist_peru.csv            (distancia, frontera, idioma, colonia; Perú -> cada iso3)
  ../data/raw/wdi_wgi.csv                 (PIB, población, WGI por iso3 y año)

Uso:
    python 16_modelo_gravedad.py
"""
from pathlib import Path
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

RAW = Path(__file__).parent / ".." / "data" / "raw"
PROCESSED = Path(__file__).parent / ".." / "data" / "processed"


def main() -> None:
    exportaciones = pd.read_csv(RAW / "baci_peru_todos_socios.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")
    geodist = pd.read_csv(RAW / "geodist_peru.csv")
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")

    exportaciones = exportaciones.merge(
        codigos[["country_code", "country_iso3"]],
        left_on="partner_codigo", right_on="country_code", how="left"
    ).rename(columns={"country_iso3": "iso3"})

    pib = wdi[wdi["indicador_codigo"] == "NY.GDP.MKTP.CD"][["pais_iso3", "anio", "valor"]].rename(
        columns={"pais_iso3": "iso3", "valor": "pib_usd"}
    )
    wgi_prom = (
        wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
        .groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio").reset_index()
        .rename(columns={"pais_iso3": "iso3"})
    )
    wgi_prom["anio"] = wgi_prom["anio"] + 1  # rezago t-1

    df = exportaciones.merge(pib, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi_prom, on=["iso3", "anio"], how="inner")
    df = df.merge(
        geodist.rename(columns={"iso_d": "iso3"})[["iso3", "dist", "contig", "comlang_off", "colony"]],
        on="iso3", how="inner",
    )

    df = df[(df["v_miles_usd"] > 0) & (df["pib_usd"] > 0) & (df["dist"] > 0)].copy()
    df["log_exportaciones"] = np.log(df["v_miles_usd"])
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_dist"] = np.log(df["dist"])

    columnas_modelo = [
        "log_exportaciones", "log_pib", "log_dist", "wgi_promedio",
        "contig", "comlang_off", "colony", "anio", "iso3",
    ]
    antes = len(df)
    df = df.dropna(subset=columnas_modelo).reset_index(drop=True)
    if len(df) < antes:
        print(f"(se descartaron {antes - len(df)} filas con valores faltantes en variables del modelo)")

    print(f"Observaciones en el panel de gravedad: {len(df)} ({df['iso3'].nunique()} países, "
          f"{df['anio'].nunique()} años)")

    df.to_csv(PROCESSED / "panel_gravedad.csv", index=False)

    formula = (
        "log_exportaciones ~ log_pib + log_dist + wgi_promedio + contig + comlang_off + colony "
        "+ C(anio)"
    )
    modelo = smf.ols(formula, data=df).fit(cov_type="cluster", cov_kwds={"groups": df["iso3"]})
    print("\n" + "=" * 70)
    print("MODELO DE GRAVEDAD — Perú vs. todos los socios comerciales reales")
    print("=" * 70)
    print(modelo.summary())


if __name__ == "__main__":
    main()
