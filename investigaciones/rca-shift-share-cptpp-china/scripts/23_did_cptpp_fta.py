"""
Paso 23 — Acuerdos comerciales y DiD del CPTPP.

Objetivo: separar el efecto "acuerdo comercial" (CEPII RTA) de la gobernanza, y
estimar un evento-estudio alrededor de la entrada en vigor del CPTPP para Perú
(19-sep-2021).

Nota sobre variables: `rta` = existe algún acuerdo comercial Perú<->socio
(735 celdas en el panel); `fta` = flag estrecho de "free trade agreement" del
CEPII (solo 27 celdas). Se usa `rta` como variable de acuerdo comercial.

Especificaciones:
  A. Gravedad de referencia (sin acuerdo) vs B. con control `rta`.
  C. DiD: log(export) ~ (CPTPP x post2022) + FE socio + FE año.
  D. Event study: año x CPTPP (año base 2019), FE socio + FE año.
  E. PPML de la DiD (niveles, con ceros).
  F. Efecto `rta` "puro" (sin FE de socio).

Salida: results_avanzados/23_did_cptpp_fta.csv (+ consola)
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

from _comun_gravedad import CPTPP, RESULTADOS, construir_panel, panel_positivos


def coef(res, var, nombre, est="OLS", r2=None):
    return {
        "modelo": nombre, "variable": var,
        "coef": res.params.get(var, np.nan),
        "se": res.bse.get(var, np.nan),
        "p": res.pvalues.get(var, np.nan),
        "n": int(res.nobs), "estimador": est, "r2": r2,
    }


def main() -> None:
    pos = panel_positivos(con_fta=True)
    pos["cptpp"] = pos["iso3"].isin(CPTPP).astype(int)
    pos["post"] = (pos["anio"] >= 2022).astype(int)
    pos["cp_post"] = pos["cptpp"] * pos["post"]

    ceros = construir_panel(incluir_ceros=True, con_fta=True)
    ceros["cptpp"] = ceros["iso3"].isin(CPTPP).astype(int)
    ceros["post"] = (ceros["anio"] >= 2022).astype(int)
    ceros["cp_post"] = ceros["cptpp"] * ceros["post"]

    filas = []

    # A/B — ¿el WGI sobrevive al control del acuerdo comercial?
    base = ("log_exportaciones ~ log_pib + log_dist + wgi_promedio + contig "
            "+ comlang_off + colony + C(anio)")
    res_a = smf.ols(base, data=pos).fit(cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(coef(res_a, "wgi_promedio", "A. Gravedad sin acuerdo", r2=res_a.rsquared))
    res_b = smf.ols(base + " + rta", data=pos).fit(cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(coef(res_b, "wgi_promedio", "B. Gravedad + acuerdo (rta)", r2=res_b.rsquared))
    filas.append(coef(res_b, "rta", "B. Gravedad + acuerdo (rta)", r2=res_b.rsquared))

    # C — DiD CPTPP con FE de socio y año (sin rta, absorbido por FE de socio)
    f_did = "log_exportaciones ~ cp_post + log_pib + C(iso3) + C(anio)"
    res_c = smf.ols(f_did, data=pos).fit(cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(coef(res_c, "cp_post", "C. DiD (CPTPP x post2022)", r2=res_c.rsquared))

    # D — Event study: año x CPTPP, base 2019
    base_anio = 2019
    pos["anio_cp"] = pos["anio"] * pos["cptpp"]
    inter = []
    for y in sorted(pos["anio"].unique()):
        if y == base_anio:
            continue
        col = f"cp_{y}"
        pos[col] = ((pos["anio"] == y) & (pos["cptpp"] == 1)).astype(int)
        inter.append(col)
    f_ev = "log_exportaciones ~ " + " + ".join(inter) + " + log_pib + C(iso3) + C(anio)"
    res_d = smf.ols(f_ev, data=pos).fit(cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    for c in inter:
        filas.append(coef(res_d, c, "D. Event study (año x CPTPP, base 2019)", r2=res_d.rsquared))

    # E — PPML de la DiD (con ceros)
    res_e = smf.glm("v_miles_usd ~ cp_post + log_pib + C(iso3) + C(anio)",
                    data=ceros, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": ceros["iso3"]})
    filas.append(coef(res_e, "cp_post", "E. PPML DiD (con ceros)", est="PPML",
                      r2=res_e.deviance / res_e.null_deviance))

    # F — Efecto rta "puro" (sin FE de socio)
    res_f = smf.ols("log_exportaciones ~ rta + log_pib + log_dist + wgi_promedio "
                    "+ contig + comlang_off + colony + C(anio)", data=pos).fit(
        cov_type="cluster", cov_kwds={"groups": pos["iso3"]})
    filas.append(coef(res_f, "rta", "F. Acuerdo (efecto puro, sin FE socio)", r2=res_f.rsquared))

    tabla = pd.DataFrame(filas)
    tabla.to_csv(RESULTADOS / "23_did_cptpp_fta.csv", index=False)
    pd.set_option("display.width", 200)
    print("\n" + "=" * 92)
    print("ACUERDOS COMERCIALES Y DiD DEL CPTPP")
    print("=" * 92)
    print(tabla[["modelo", "variable", "coef", "se", "p", "n", "estimador"]].to_string(
        index=False, float_format=lambda x: f"{x:,.4g}"))
    print(f"\nSocios CPTPP en el panel: {sorted(CPTPP & set(pos['iso3']))}")
    print(f"Celdas CPTPP: {int(pos['cptpp'].sum())} | rta=1: {int(pos['rta'].sum())}")


if __name__ == "__main__":
    main()
