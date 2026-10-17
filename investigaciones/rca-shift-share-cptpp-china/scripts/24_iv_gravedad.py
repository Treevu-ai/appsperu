"""
Paso 24 — Variables instrumentales (2SLS) para la gobernanza.

El modelo de gravedad muestra asociación positiva pero no causal (18_: no
sobrevive a primeras diferencias; precedencia inversa significativa). Aquí se
instrumenta la gobernanza del socio con dos variables clásicas:

  Z1 = |latitud| del socio (distancia al ecuador) — proxy histórico de
       instituciones (Acemoglu, Johnson & Robinson 2001; Hall & Jones 1999).
  Z2 = gobernanza promedio de la REGIÓN del socio ese año, excluyendo al propio
       país (leave-one-out) — variación externa regional.

Se reportan: 2SLS, F de primera etapa (Stock-Yogo), sobreidentificación
(Sargan) y comparación con OLS.

Salida: results_avanzados/24_iv_gravedad.csv (+ consola)
"""
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from linearmodels.iv import IV2SLS

from _comun_gravedad import (RESULTADOS, cargar_atributos_pais, cargar_wgi_wide,
                             panel_positivos)


def instrumento_region(rezago: int = 1) -> pd.DataFrame:
    """Gobernanza media de la región (leave-one-out) por país y año."""
    wgi = cargar_wgi_wide(rezago=rezago, dimensiones=False)
    attrs = cargar_atributos_pais()[["iso3", "region_id"]]
    d = wgi.merge(attrs, on="iso3", how="inner").dropna(subset=["wgi_promedio"])
    agg = d.groupby(["region_id", "anio"])["wgi_promedio"].agg(["sum", "count"])
    d = d.join(agg, on=["region_id", "anio"])
    d["wgi_region"] = (d["sum"] - d["wgi_promedio"]) / (d["count"] - 1)
    d.loc[d["count"] <= 1, "wgi_region"] = np.nan
    return d[["iso3", "anio", "wgi_region"]]


def columnas_independientes(df: pd.DataFrame, cols: list[str]) -> list[str]:
    """Devuelve el subconjunto de `cols` no colineal (con intercepto implícito)."""
    base = np.ones((len(df), 1))
    keep, cur = [], base
    rango = np.linalg.matrix_rank(base)
    for c in cols:
        cand = np.column_stack([cur, df[c].astype(float).values])
        nuevo = np.linalg.matrix_rank(cand)
        if nuevo > rango:
            keep.append(c)
            cur, rango = cand, nuevo
    eliminadas = [c for c in cols if c not in keep]
    if eliminadas:
        print(f"  (colineales omitidas: {eliminadas})")
    return keep


def main() -> None:
    df = panel_positivos()
    attrs = cargar_atributos_pais()
    df = df.merge(attrs[["iso3", "abs_latitud", "region_id"]], on="iso3", how="left")
    df = df.merge(instrumento_region(), on=["iso3", "anio"], how="left")
    df = df.dropna(subset=["abs_latitud", "wgi_region"]).reset_index(drop=True)
    df = pd.concat([df, pd.get_dummies(df["region_id"], prefix="reg").astype(int)], axis=1)
    year_dum = [f"y{a}" for a in sorted(df["anio"].unique())[1:]]
    for a in sorted(df["anio"].unique())[1:]:
        df[f"y{a}"] = (df["anio"] == a).astype(int)
    reg_dum = [c for c in df.columns if c.startswith("reg_")]
    print(f"Panel IV: {len(df)} obs | {df['iso3'].nunique()} países | "
          f"años {df['anio'].min()}-{df['anio'].max()}")

    filas = []

    def estimar(nombre, exog, instr):
        exog = columnas_independientes(df, exog)
        fml = (f"log_exportaciones ~ {' + '.join(exog)} "
               f"+ [wgi_promedio ~ {' + '.join(instr)}]")
        res = IV2SLS.from_formula(fml, data=df).fit(cov_type="clustered", clusters=df["iso3"])
        diag = res.first_stage.diagnostics
        f_stat = float(np.nanmin(diag["f.stat"].values)) if "f.stat" in diag else np.nan
        try:
            sargan_p = float(res.sargan.pval)
        except Exception:
            sargan_p = np.nan
        filas.append({"modelo": nombre, "coef": res.params["wgi_promedio"],
                      "se": res.std_errors["wgi_promedio"], "p": res.pvalues["wgi_promedio"],
                      "n": int(res.nobs), "F_1a_etapa": f_stat, "sargan_p": sargan_p})
        print(f"  {nombre:44s} coef={res.params['wgi_promedio']:+.3f} "
              f"p={res.pvalues['wgi_promedio']:.3f} F1={f_stat:.1f}")

    # OLS de referencia
    res_ols = smf.ols(f"log_exportaciones ~ log_pib + log_dist + wgi_promedio + contig "
                      f"+ comlang_off + colony + C(anio)", data=df).fit(
        cov_type="cluster", cov_kwds={"groups": df["iso3"]})
    filas.append({"modelo": "OLS (referencia)", "coef": res_ols.params["wgi_promedio"],
                  "se": res_ols.bse["wgi_promedio"], "p": res_ols.pvalues["wgi_promedio"],
                  "n": int(res_ols.nobs), "F_1a_etapa": np.nan, "sargan_p": np.nan})

    ctrl = ["log_pib", "log_dist", "contig", "comlang_off", "colony", *year_dum]
    estimar("IV — año FE", ctrl, ["abs_latitud", "wgi_region"])
    estimar("IV — año FE + región FE", [*ctrl, *reg_dum], ["abs_latitud", "wgi_region"])
    estimar("IV — solo latitud (just-id)", ctrl, ["abs_latitud"])
    estimar("IV — solo gobernanza regional (just-id)", ctrl, ["wgi_region"])

    tabla = pd.DataFrame(filas)
    tabla.to_csv(RESULTADOS / "24_iv_gravedad.csv", index=False)
    pd.set_option("display.width", 200)
    print("\n" + "=" * 96)
    print("2SLS — gobernanza del socio instrumentada")
    print("=" * 96)
    print(tabla.to_string(index=False, float_format=lambda x: f"{x:,.4g}"))
    print("\nF de 1a etapa > ~10 sugiere instrumentos no débiles (Stock-Yogo).")
    print("sargan_p > 0.05: no se rechaza la validez de las restricciones de exclusión.")


if __name__ == "__main__":
    main()
