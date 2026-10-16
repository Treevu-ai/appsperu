"""
Paso: las 6 dimensiones WGI por separado en el MODELO DE GRAVEDAD (N=184).

La propuesta §9.2 afirma que "efectividad gubernamental y calidad regulatoria
emergen como las más accionables" — esa afirmación se sustentaba solo en el
panel chico (N=12), donde la dimensión que pesaba era estabilidad política.
Este script corre las 6 dimensiones WGI por separado sobre el modelo de
gravedad (el diseño que sí detecta el efecto) para identificar cuáles pesan
allí, más una especificación conjunta con las 6 dimensiones simultáneamente.

Mismo panel que 16_modelo_gravedad.py (se reconstruye idéntico):

  log(exportaciones_jt) = b0 + b1*log(PIB_jt) + b2*log(distancia_j)
                            + b3*WGI_dim_{j,t-1} + b4*frontera_j + b5*idioma_j
                            + b6*colonia_j + efectos de año + e

Uso:
    python 17_gravedad_dimensiones_wgi.py
"""
from pathlib import Path
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

RAW = Path(__file__).parent / ".." / "data" / "raw"
PROCESSED = Path(__file__).parent / ".." / "data" / "processed"

DIMENSIONES = {
    "GOV_WGI_CC.EST": "Control de la corrupción",
    "GOV_WGI_GE.EST": "Efectividad gubernamental",
    "GOV_WGI_PV.EST": "Estabilidad política",
    "GOV_WGI_RL.EST": "Estado de derecho",
    "GOV_WGI_RQ.EST": "Calidad regulatoria",
    "GOV_WGI_VA.EST": "Voz y rendición de cuentas",
}


def cargar_panel_gravedad() -> pd.DataFrame:
    """Reconstruye el panel de gravedad idéntico a 16_modelo_gravedad.py,
    pero conservando cada dimensión WGI por separado (rezago t-1)."""
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

    wgi = wdi[wdi["indicador_codigo"].isin(DIMENSIONES)].copy()
    wgi["dimension"] = wgi["indicador_codigo"].map(
        {codigo: codigo.split("_")[-1].split(".")[0].lower() for codigo in DIMENSIONES}
    )
    wgi_wide = (
        wgi.pivot_table(index=["pais_iso3", "anio"], columns="dimension", values="valor")
        .reset_index()
        .rename(columns={"pais_iso3": "iso3"})
    )
    wgi_wide["anio"] = wgi_wide["anio"] + 1  # rezago t-1
    wgi_wide["wgi_promedio"] = wgi_wide[list(
        {codigo.split("_")[-1].split(".")[0].lower() for codigo in DIMENSIONES}
    )].mean(axis=1)

    df = exportaciones.merge(pib, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi_wide, on=["iso3", "anio"], how="inner")
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

    dimensiones = list({c.split("_")[-1].split(".")[0].lower() for c in DIMENSIONES})
    columnas_modelo = [
        "log_exportaciones", "log_pib", "log_dist", *dimensiones,
        "contig", "comlang_off", "colony", "anio", "iso3",
    ]
    return df.dropna(subset=columnas_modelo).reset_index(drop=True)


def estimar(df: pd.DataFrame, nombre_variable: str) -> dict:
    formula = (
        f"log_exportaciones ~ log_pib + log_dist + {nombre_variable} "
        "+ contig + comlang_off + colony + C(anio)"
    )
    modelo = smf.ols(formula, data=df).fit(
        cov_type="cluster", cov_kwds={"groups": df["iso3"]}
    )
    return {
        "coef": modelo.params[nombre_variable],
        "p": modelo.pvalues[nombre_variable],
        "n": int(modelo.nobs),
        "r2": modelo.rsquared,
    }


def main() -> None:
    df = cargar_panel_gravedad()
    print(f"Panel de gravedad: {len(df)} observaciones "
          f"({df['iso3'].nunique()} países, {df['anio'].nunique()} años)\n")

    resultados = {}
    print("=" * 78)
    print("SESIÓN A — Una dimensión WGI por vez (misma especificación que 16_)")
    print("=" * 78)
    for codigo, etiqueta in DIMENSIONES.items():
        nombre = codigo.split("_")[-1].split(".")[0].lower()
        r = estimar(df, nombre)
        resultados[etiqueta] = r
        significancia = "***" if r["p"] < 0.001 else "**" if r["p"] < 0.01 else "*" if r["p"] < 0.05 else ""
        print(f"  {etiqueta:38s}  coef = {r['coef']:+.3f}   p = {r['p']:.4f} {significancia}")

    print("\n" + "=" * 78)
    print("SESIÓN B — Las 6 dimensiones simultáneamente (multicolinealidad esperable)")
    print("=" * 78)
    dimensiones = [codigo.split("_")[-1].split(".")[0].lower() for codigo in DIMENSIONES]
    formula_conjunta = (
        "log_exportaciones ~ log_pib + log_dist + " + " + ".join(dimensiones)
        + " + contig + comlang_off + colony + C(anio)"
    )
    modelo_conjunto = smf.ols(formula_conjunta, data=df).fit(
        cov_type="cluster", cov_kwds={"groups": df["iso3"]}
    )
    inversa = pd.DataFrame({
        "coef": modelo_conjunto.params[dimensiones],
        "p": modelo_conjunto.pvalues[dimensiones],
    })
    etiquetas = {c.split("_")[-1].split(".")[0].lower(): e for c, e in DIMENSIONES.items()}
    inversa.index = [etiquetas[d] for d in inversa.index]
    print(inversa.to_string(float_format=lambda x: f"{x:.4f}"))
    print(f"\nR2 = {modelo_conjunto.rsquared:.3f} | N = {int(modelo_conjunto.nobs)}")
    print("(las 6 dimensiones WGI tienen correlaciones de ~0.7-0.9 entre sí:")
    print(" la sesión B es una referencia, no una especificación principal)")

    resultados_path = PROCESSED / "gravedad_dimensiones_wgi.csv"
    pd.DataFrame(
        [{"dimension": k, **v} for k, v in resultados.items()]
    ).to_csv(resultados_path, index=False)
    print(f"\nResultados guardados en {resultados_path}")


if __name__ == "__main__":
    main()
