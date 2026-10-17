"""
Paso 20 — PPML (Poisson pseudo-maximum-likelihood) sobre el modelo de gravedad.

Motivación (frente al OLS sobre log-exportaciones de 16_modelo_gravedad.py):
  1. El OLS log-lineal descarta los ceros (socios/año sin comercio) y sesga el
     efecto por la desigualdad de Jensen (Silva & Tenreyro 2006).
  2. El PPML estima E[export] = exp(Xb) en niveles, admite ceros y entrega el
     mismo coeficiente interpretable como semielasticidad.

Especificaciones:
  A. OLS log-lineal (réplica de 16_, referencia)
  B. PPML, sin FE de socio (controles de gravedad completos)
  C. PPML, con FE de socio y de año (identificación within-socio)
  D. PPML sobre el panel CON CEROS (A/C reestimados incluyendo el margen extensivo)
  E. Gamma PML (robustez al supuesto de varianza)
  F. Margen extensivo: LPM y Logit de exportar (exporta=1) ~ gobernanza

Salida: results_avanzados/20_ppml_gravedad.csv  (+ consola)
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

from _comun_gravedad import construir_panel, panel_positivos, RESULTADOS, guardar_csv

CLUSTER = dict(cov_type="cluster", cov_kwds={"groups": None})  # grupos se setean por modelo


def _fila(nombre, res, var, datos, r2=None):
    coef = res.params.get(var, np.nan)
    se = res.bse.get(var, np.nan)
    p = res.pvalues.get(var, np.nan)
    return {
        "modelo": nombre, "variable": var,
        "coef": coef, "se": se, "p": p, "n": int(res.nobs),
        "ratio_incidencia": np.exp(coef) if np.isfinite(coef) else np.nan,
        "r2": r2,
    }


def main() -> None:
    filas = []

    pos = panel_positivos()
    con_ceros = construir_panel(incluir_ceros=True)
    ancho = pd.read_csv(RESULTADOS.parent / "data" / "processed" / "panel_gravedad.csv")

    # --- A. OLS log-lineal (referencia) ------------------------------------
    res_a = smf.ols(
        "log_exportaciones ~ log_pib + log_dist + wgi_promedio + contig + comlang_off "
        "+ colony + C(anio)", data=pos
    ).fit(cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(_fila("A. OLS log-lineal (ref.)", res_a, "wgi_promedio", pos, res_a.rsquared))

    # --- B. PPML sin FE de socio -------------------------------------------
    f_b = ("v_miles_usd ~ log_pib + log_dist + wgi_promedio + contig + comlang_off "
           "+ colony + C(anio)")
    res_b = smf.glm(f_b, data=pos, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(_fila("B. PPML (sin FE socio)", res_b, "wgi_promedio", pos,
                       res_b.deviance / res_b.null_deviance))

    # --- C. PPML con FE de socio y año -------------------------------------
    f_c = "v_miles_usd ~ log_pib + wgi_promedio + C(iso3) + C(anio)"
    res_c = smf.glm(f_c, data=pos, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(_fila("C. PPML (FE socio+año)", res_c, "wgi_promedio", pos,
                       res_c.deviance / res_c.null_deviance))

    # --- D. PPML CON CEROS (margen extensivo incluido) ---------------------
    res_d1 = smf.glm(f_b, data=con_ceros, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": con_ceros["iso3"]})
    filas.append(_fila("D. PPML sin FE (con ceros)", res_d1, "wgi_promedio", con_ceros,
                       res_d1.deviance / res_d1.null_deviance))
    res_d2 = smf.glm(f_c, data=con_ceros, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": con_ceros["iso3"]})
    filas.append(_fila("D. PPML FE socio+año (con ceros)", res_d2, "wgi_promedio", con_ceros,
                       res_d2.deviance / res_d2.null_deviance))

    # --- E. Gamma PML -------------------------------------------------------
    res_e = smf.glm(f_b, data=pos,
                    family=sm.families.Gamma(link=sm.families.links.Log())).fit(
        cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(_fila("E. Gamma PML (sin FE)", res_e, "wgi_promedio", pos,
                       res_e.deviance / res_e.null_deviance))

    # --- F. Margen extensivo -----------------------------------------------
    f_f = "exporta ~ log_pib + log_dist + wgi_promedio + contig + comlang_off + colony + C(anio)"
    res_f = smf.ols(f_f, data=con_ceros).fit(
        cov_type="cluster", cov_kwds={"groups": con_ceros["iso3"]})
    filas.append(_fila("F. LPM margen extensivo", res_f, "wgi_promedio", con_ceros, res_f.rsquared))
    res_f2 = smf.logit(f_f, data=con_ceros).fit(
        disp=0, cov_type="cluster", cov_kwds={"groups": con_ceros["iso3"]})
    filas.append(_fila("F. Logit margen extensivo", res_f2, "wgi_promedio", con_ceros,
                       res_f2.prsquared))

    tabla = pd.DataFrame(filas)
    tabla.to_csv(RESULTADOS / "20_ppml_gravedad.csv", index=False)
    guardar_csv(con_ceros, "panel_gravedad_con_ceros.csv")

    pd.set_option("display.width", 200, "display.max_columns", 20)
    print("\n" + "=" * 96)
    print("PPML Y MÁRGENES — coeficiente de gobernanza (WGI promedio rezagado)")
    print("=" * 96)
    print(tabla.to_string(index=False, float_format=lambda x: f"{x:,.4g}"))
    print("\nRatio de incidencia = exp(coef): multiplicador de exportaciones por +1 unidad de WGI.")


if __name__ == "__main__":
    main()
