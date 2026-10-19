"""
Prueba si el hallazgo de gobernanza (WGI) del modelo de gravedad de
rca-shift-share-cptpp-china (script 16_modelo_gravedad.py, OLS log-lineal
sobre exportaciones totales) sobrevive al mismo diagnostico de commodities
y hubs de reexportacion aplicado en gravedad-comercio-bilateral-peru.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

RAIZ = Path(__file__).parent
with open(RAIZ / "panel_bilateral_peru_2015_2024.json", encoding="utf-8") as f:
    panel = pd.DataFrame(json.load(f))
with open(RAIZ / "wgi_promedio_por_pais_anio.json", encoding="utf-8") as f:
    wgi = pd.DataFrame(json.load(f))

wgi = wgi.rename(columns={"anio": "anio_wgi"})
wgi["anio"] = wgi["anio_wgi"] + 1  # rezago t-1, igual que el script 16_

HUBS = ["NLD", "BEL", "SGP", "HKG", "PAN", "ARE"]

df = panel.merge(wgi[["iso3", "anio", "wgi_promedio"]], left_on=["socio_iso3", "anio"], right_on=["iso3", "anio"], how="inner")
df = df.dropna(subset=["gdp_socio", "dist", "wgi_promedio"]).copy()
df["log_gdp_socio"] = np.log(df["gdp_socio"])
df["log_dist"] = np.log(df["dist"])
df["anio_f"] = df["anio"].astype(str)

print(f"Panel combinado (exporta x WGI rezagado): {len(df)} obs, {df['socio_iso3'].nunique()} socios")


def ols_log(d, col):
    d = d[d[col] > 0].copy()
    d["log_y"] = np.log(d[col])
    f = "log_y ~ log_gdp_socio + log_dist + wgi_promedio + contig + comlang_off + colony + C(anio_f)"
    m = smf.ols(f, data=d).fit(cov_type="cluster", cov_kwds={"groups": d["socio_iso3"]})
    return m, len(d)


def ppml(d, col):
    d = d.copy()
    d["y_mill"] = d[col] / 1e6
    f = "y_mill ~ log_gdp_socio + log_dist + wgi_promedio + contig + comlang_off + colony + C(anio_f)"
    m = smf.glm(f, data=d, family=sm.families.Poisson()).fit(cov_type="cluster", cov_kwds={"groups": d["socio_iso3"]})
    return m, len(d)


print("\n=== Replica script 16_ (OLS log-lineal, exportaciones TOTALES) ===")
m1, n1 = ols_log(df, "exporta_usd_total")
print(f"n={n1}  wgi_promedio = {m1.params['wgi_promedio']:.4f}  p={m1.pvalues['wgi_promedio']:.4f}")

print("\n=== OLS log-lineal, SIN commodities (HS26/71/27) ===")
m2, n2 = ols_log(df, "exporta_usd_sin_commodities")
print(f"n={n2}  wgi_promedio = {m2.params['wgi_promedio']:.4f}  p={m2.pvalues['wgi_promedio']:.4f}")

print("\n=== PPML, exportaciones TOTALES (upgrade metodologico, con ceros reales) ===")
m3, n3 = ppml(df, "exporta_usd_total")
print(f"n={n3}  wgi_promedio = {m3.params['wgi_promedio']:.4f}  p={m3.pvalues['wgi_promedio']:.4f}")

print("\n=== PPML, SIN commodities, CON ceros reales ===")
m4, n4 = ppml(df, "exporta_usd_sin_commodities")
print(f"n={n4}  wgi_promedio = {m4.params['wgi_promedio']:.4f}  p={m4.pvalues['wgi_promedio']:.4f}")

print("\n=== PPML, SIN commodities, SIN hubs de reexportacion ===")
df_sin_hubs = df[~df["socio_iso3"].isin(HUBS)].copy()
m5, n5 = ppml(df_sin_hubs, "exporta_usd_sin_commodities")
print(f"n={n5}  wgi_promedio = {m5.params['wgi_promedio']:.4f}  p={m5.pvalues['wgi_promedio']:.4f}")

print("\n=== Resumen comparativo ===")
print(f"{'especificacion':45s} {'n':>6s} {'wgi_promedio':>14s} {'p':>8s}")
for nombre, m, n in [
    ("1 OLS total (= script 16_ original)", m1, n1),
    ("2 OLS sin commodities", m2, n2),
    ("3 PPML total", m3, n3),
    ("4 PPML sin commodities", m4, n4),
    ("5 PPML sin commodities, sin hubs", m5, n5),
]:
    print(f"{nombre:45s} {n:6d} {m.params['wgi_promedio']:14.4f} {m.pvalues['wgi_promedio']:8.4f}")
