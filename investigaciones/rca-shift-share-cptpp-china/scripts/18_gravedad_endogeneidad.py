"""
Batería de endogeneidad sobre el MODELO DE GRAVEDAD (N=184) — el hallazgo
robuste del proyecto. Análogo de 14_endogeneidad.py aplicado al diseño que sí
detecta el efecto. El chequeo de rezago t-2 ya se corrió sobre este modelo
(ver README, §pruebas de endogeneidad); este script añade los dos que faltan:

  I. Precedencia inversa: ¿las exportaciones de hoy predicen la gobernanza
     de mañana? (swap de la dirección de la regresión, con los controles de
     gravedad que no se absorbieron)

  J. Primeras diferencias: ¿el efecto sobrevive al eliminar los niveles
     (confusores fijos por país no absorbidos del todo por year FE)?

  K. (repetido aquí por completitud, para que el script 18 sea autónomo)
     Rezago t-2 en vez de t-1.

Uso:
    python 18_gravedad_endogeneidad.py
"""
from pathlib import Path
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

RAW = Path(__file__).parent / ".." / "data" / "raw"
PROCESSED = Path(__file__).parent / ".." / "data" / "processed"


def cargar_panel_con_wgi(rezago: int) -> pd.DataFrame:
    """Panel de gravedad idéntico a 16_/17_, con WGI promedio rezagado `rezago`
    años."""
    exportaciones = pd.read_csv(RAW / "baci_peru_todos_socios.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")
    geodist = pd.read_csv(RAW / "geodist_peru.csv")
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")

    exportaciones = exportaciones.merge(
        codigos[["country_code", "country_iso3"]],
        left_on="partner_codigo", right_on="country_code", how="left",
    ).rename(columns={"country_iso3": "iso3"})

    pib = wdi[wdi["indicador_codigo"] == "NY.GDP.MKTP.CD"][
        ["pais_iso3", "anio", "valor"]
    ].rename(columns={"pais_iso3": "iso3", "valor": "pib_usd"})
    wgi = (
        wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
        .groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio").reset_index()
        .rename(columns={"pais_iso3": "iso3"})
    )
    wgi["anio"] = wgi["anio"] + rezago  # rezago positivo = predictor adelantado

    df = exportaciones.merge(pib, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi, on=["iso3", "anio"], how="inner")
    df = df.merge(
        geodist.rename(columns={"iso_d": "iso3"})[
            ["iso3", "dist", "contig", "comlang_off", "colony"]
        ],
        on="iso3", how="inner",
    )
    df = df[(df["v_miles_usd"] > 0) & (df["pib_usd"] > 0) & (df["dist"] > 0)].copy()
    df["log_exportaciones"] = np.log(df["v_miles_usd"])
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_dist"] = np.log(df["dist"])
    columnas = [
        "log_exportaciones", "log_pib", "log_dist", "wgi_promedio",
        "contig", "comlang_off", "colony", "anio", "iso3",
    ]
    return df.dropna(subset=columnas).reset_index(drop=True)


def main() -> None:
    base_t1 = cargar_panel_con_wgi(rezago=1)

    print("=" * 78)
    print("K — WGI rezagado t-2 (referencia autónoma; replica el chequeo previo)")
    print("=" * 78)
    df_t2 = cargar_panel_con_wgi(rezago=2)
    formula = (
        "log_exportaciones ~ log_pib + log_dist + wgi_promedio "
        "+ contig + comlang_off + colony + C(anio)"
    )
    modelo_t2 = smf.ols(formula, data=df_t2).fit(
        cov_type="cluster", cov_kwds={"groups": df_t2["iso3"]}
    )
    print(f"  N = {int(modelo_t2.nobs)} | WGI(t-2): coef = {modelo_t2.params['wgi_promedio']:+.3f}, "
          f"p = {modelo_t2.pvalues['wgi_promedio']:.4f}")

    print("\n" + "=" * 78)
    print("J — Primeras diferencias (Δlog(export) ~ ΔWGI(t-1) + Δlog(PIB) + año FE)")
    print("=" * 78)
    df_fd = base_t1.sort_values(["iso3", "anio"]).copy()
    df_fd["d_log_exportaciones"] = df_fd.groupby("iso3")["log_exportaciones"].diff()
    df_fd["d_log_pib"] = df_fd.groupby("iso3")["log_pib"].diff()
    df_fd["d_wgi"] = df_fd.groupby("iso3")["wgi_promedio"].diff()
    df_fd = df_fd.dropna(subset=["d_log_exportaciones", "d_log_pib", "d_wgi"])
    df_fd["anio_fd"] = df_fd["anio"]  # efectos de año en diferencias
    print(f"  (las variables time-invariantes —distancia, frontera, idioma,"
          f" colonia— caen en primeras diferencias)")
    print(f"  N = {len(df_fd)} ({df_fd['iso3'].nunique()} países)")
    modelo_fd = smf.ols(
        "d_log_exportaciones ~ d_log_pib + d_wgi + C(anio_fd)", data=df_fd
    ).fit(cov_type="cluster", cov_kwds={"groups": df_fd["iso3"]})
    print(f"  ΔWGI:      coef = {modelo_fd.params['d_wgi']:+.3f}, "
          f"p = {modelo_fd.pvalues['d_wgi']:.4f}")
    print(f"  Δlog(PIB): coef = {modelo_fd.params['d_log_pib']:+.3f}, "
          f"p = {modelo_fd.pvalues['d_log_pib']:.4f}")

    print("\n" + "=" * 78)
    print("I — Precedencia inversa: WGI(t+1) ~ log(export) t + controles + año FE")
    print("=" * 78)
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    wgi_futuro = (
        wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
        .groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio").reset_index()
        .rename(columns={"pais_iso3": "iso3"})
    )
    wgi_futuro["anio"] = wgi_futuro["anio"] - 1  # WGI(t+1) alineado con fila t
    df_inv = base_t1.merge(wgi_futuro, on=["iso3", "anio"], how="inner",
                           suffixes=("", "_futuro"))
    df_inv = df_inv.rename(columns={"wgi_promedio_futuro": "wgi_futuro"})
    print(f"  N = {len(df_inv)} ({df_inv['iso3'].nunique()} países)")
    modelo_inv = smf.ols(
        "wgi_futuro ~ log_exportaciones + log_pib + log_dist "
        "+ contig + comlang_off + colony + C(anio)",
        data=df_inv,
    ).fit(cov_type="cluster", cov_kwds={"groups": df_inv["iso3"]})
    print(f"  log(exportaciones): coef = {modelo_inv.params['log_exportaciones']:+.4f}, "
          f"p = {modelo_inv.pvalues['log_exportaciones']:.4f}")
    print("  (si es significativo, hay evidencia de causalidad reversa")
    print("   paralela al efecto directo — interpretar con la batería completa)")


if __name__ == "__main__":
    main()
