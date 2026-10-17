"""
Paso 26 — Machine learning causal (DML), curva de especificaciones y Oster.

  1. DML (double/debiased ML, Robinson 1988; Chernozhukov et al. 2018): estima
     el coeficiente de la gobernanza en un modelo parcialmente lineal usando
     ML (gradient boosting) con validación cruzada para las funciones de
     molestia. Robusto a mal especificación funcional de los controles.
  2. Curva de especificaciones: reestima la asociación bajo muchas
     combinaciones (muestra, controles, rezago, estimador) y resume cuántas
     son positivas/significativas.
  3. Sesgo de variable omitida de Oster (2019): δ y β* para juzgar cuán sensible
     es el resultado a no-observables.

Salida: results_avanzados/26_dml_oster.csv y 26_curva_especificaciones.csv
"""
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import KFold

from _comun_gravedad import (RESULTADOS, cargar_atributos_pais, construir_panel,
                             panel_positivos)


# ---------------------------------------------------------------------------
# 1. DML (modelo parcialmente lineal con cross-fitting)
# ---------------------------------------------------------------------------
def dml_plr(df: pd.DataFrame, controls: list[str], k: int = 5, seed: int = 0):
    y = df["log_exportaciones"].values
    d = df["wgi_promedio"].values
    X = df[controls].astype(float).values
    y_res = np.zeros_like(y)
    d_res = np.zeros_like(d)
    kf = KFold(n_splits=k, shuffle=True, random_state=seed)
    for tr, te in kf.split(X):
        my = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05,
                                           max_iter=200, random_state=seed).fit(X[tr], y[tr])
        md = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05,
                                           max_iter=200, random_state=seed).fit(X[tr], d[tr])
        y_res[te] = y[te] - my.predict(X[te])
        d_res[te] = d[te] - md.predict(X[te])
    theta = float((d_res @ y_res) / (d_res @ d_res))
    # SE con clustering por país sobre la función de influencia
    A = float(d_res @ d_res)
    score = d_res * (y_res - theta * d_res)
    grupos = df["iso3"].values
    s = pd.Series(score).groupby(grupos).sum().values
    var = float((s @ s) / (A ** 2))
    se = np.sqrt(var)
    from scipy import stats
    t = theta / se
    p = 2 * (1 - stats.norm.cdf(abs(t)))
    return theta, se, p


# ---------------------------------------------------------------------------
# 3. Oster (2019)
# ---------------------------------------------------------------------------
def oster(df: pd.DataFrame, rmax_factor: float = 1.3):
    corto = smf.ols("log_exportaciones ~ wgi_promedio + C(anio)", data=df).fit()
    largo = smf.ols("log_exportaciones ~ wgi_promedio + log_pib + log_dist + contig "
                    "+ comlang_off + colony + C(anio)", data=df).fit()
    b_t, r_t = corto.params["wgi_promedio"], corto.rsquared
    b_l, r_l = largo.params["wgi_promedio"], largo.rsquared
    rmax = min(1.0, rmax_factor * r_l)
    delta = (b_l * (r_l - r_t)) / ((b_t - b_l) * (rmax - r_l)) if (b_t != b_l and rmax > r_l) else np.nan
    b_star = b_l - (b_t - b_l) * (rmax - r_l) / (r_l - r_t)
    return {"beta_corto": b_t, "R2_corto": r_t, "beta_largo": b_l, "R2_largo": r_l,
            "Rmax": rmax, "delta": delta, "beta_estrella": b_star}


# ---------------------------------------------------------------------------
# 2. Curva de especificaciones
# ---------------------------------------------------------------------------
def curva_especificaciones() -> pd.DataFrame:
    attrs = cargar_atributos_pais()[["iso3", "region_id"]]
    pos1 = panel_positivos().merge(attrs, on="iso3", how="left")
    pos2 = panel_positivos(rezago=2).merge(attrs, on="iso3", how="left")
    filas = []
    controles = {
        "mínimos": "log_pib + log_dist",
        "completos": "log_pib + log_dist + contig + comlang_off + colony",
    }
    muestras = {"todas": lambda d: d,
                "sin China": lambda d: d[d["iso3"] != "CHN"],
                "sin CPTPP": lambda d: d[~d["iso3"].isin(
                    ["AUS", "BRN", "CAN", "CHL", "JPN", "MYS", "MEX", "NZL", "SGP", "VNM"])],
                "winsor 5%": lambda d: d[d["v_miles_usd"].between(
                    d["v_miles_usd"].quantile(0.05), d["v_miles_usd"].quantile(0.95))]}
    for etq_rez, base in [("t-1", pos1), ("t-2", pos2)]:
        for etq_m, fn in muestras.items():
            d = fn(base)
            for etq_c, ctrl in controles.items():
                for etq_fe, fe in [("año FE", "C(anio)"),
                                   ("año+región FE", "C(anio) + C(region_id)")]:
                    fml = f"log_exportaciones ~ wgi_promedio + {ctrl} + {fe}"
                    try:
                        r = smf.ols(fml, data=d).fit(cov_type="cluster",
                                                     cov_kwds={"groups": d["iso3"]})
                    except Exception:
                        continue
                    filas.append({"rezago": etq_rez, "muestra": etq_m, "controles": etq_c,
                                  "fe": etq_fe, "coef": r.params["wgi_promedio"],
                                  "p": r.pvalues["wgi_promedio"], "n": int(r.nobs)})
    return pd.DataFrame(filas)


def main() -> None:
    df = panel_positivos()
    attrs = cargar_atributos_pais()[["iso3", "region_id"]]
    df = df.merge(attrs, on="iso3", how="left")
    for a in sorted(df["anio"].unique())[1:]:
        df[f"y{a}"] = (df["anio"] == a).astype(int)
    year_dum = [f"y{a}" for a in sorted(df["anio"].unique())[1:]]
    region_dum = pd.get_dummies(df["region_id"], prefix="reg").astype(int)
    df = pd.concat([df, region_dum], axis=1)
    reg_cols = [c for c in df.columns if c.startswith("reg_")]

    print("=" * 80)
    print("1. DML — coeficiente de gobernanza (Robinson, cross-fitting K=5)")
    print("=" * 80)
    th1, se1, p1 = dml_plr(df, ["log_pib", "log_dist", "contig", "comlang_off", "colony", *year_dum])
    th2, se2, p2 = dml_plr(df, ["log_pib", "log_dist", "contig", "comlang_off", "colony",
                                *year_dum, *reg_cols])
    print(f"  controles completos:            theta = {th1:+.3f} (ee {se1:.3f}, p {p1:.4f})")
    print(f"  controles completos + región:   theta = {th2:+.3f} (ee {se2:.3f}, p {p2:.4f})")

    print("\n" + "=" * 80)
    print("2. Curva de especificaciones")
    print("=" * 80)
    curva = curva_especificaciones()
    curva.to_csv(RESULTADOS / "26_curva_especificaciones.csv", index=False)
    pos_sig = ((curva["coef"] > 0) & (curva["p"] < 0.05)).mean()
    neg_sig = ((curva["coef"] < 0) & (curva["p"] < 0.05)).mean()
    print(f"  {len(curva)} especificaciones | positivo y significativo (p<0.05): {pos_sig:.0%}"
          f" | negativo y significativo: {neg_sig:.0%} | no significativo: {1 - pos_sig - neg_sig:.0%}")
    print(f"  coeficiente: mediana {curva['coef'].median():+.3f} | "
          f"rango [{curva['coef'].min():+.3f}, {curva['coef'].max():+.3f}]")

    print("\n" + "=" * 80)
    print("3. Sesgo de variable omitida de Oster (2019)")
    print("=" * 80)
    ost = oster(df)
    for k, v in ost.items():
        print(f"  {k:14s} = {v:+.4f}" if isinstance(v, float) else f"  {k:14s} = {v}")
    print("  δ>1: haría falta que los no-observables pesaran MÁS que los observables")
    print("  para llevar el efecto a cero (δ>1 ⇒ resultado robusto a omisión).")

    pd.DataFrame([
        {"analisis": "DML controles completos", "coef": th1, "se": se1, "p": p1},
        {"analisis": "DML controles + región", "coef": th2, "se": se2, "p": p2},
        {"analisis": "Oster delta", "coef": ost["delta"], "se": np.nan, "p": np.nan},
        {"analisis": "Oster beta_estrella (delta=1)", "coef": ost["beta_estrella"],
         "se": np.nan, "p": np.nan},
    ]).to_csv(RESULTADOS / "26_dml_oster.csv", index=False)


if __name__ == "__main__":
    main()
