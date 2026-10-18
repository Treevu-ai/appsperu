"""
Estima el modelo de gravedad de las exportaciones peruanas (2015-2024).

Fuente: data/raw/panel_bilateral_peru_2015_2024.json, extraído de Neon
(bcrp_comercio_exterior) cruzando baci_flujos + baci_paises + wdi_indicadores
(NY.GDP.MKTP.CD) + geodist_diadas + gravity_acuerdos. 224 socios con distancia
conocida desde Perú, 2015-2024, con ceros reales (ausencia en BACI = sin
comercio ese año, no dato faltante).

Uso:
    python scripts/estimar_gravedad.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

RAIZ = Path(__file__).parent.parent
RAW = RAIZ / "data" / "raw" / "panel_bilateral_peru_2015_2024.json"
PROCESADO = RAIZ / "data" / "procesado"
PROCESADO.mkdir(parents=True, exist_ok=True)

# Hubs de reexportación según la literatura de comercio internacional
# (Rotterdam-Amberes-Singapur-Hong Kong-Panamá-Dubái), NO derivados de los
# residuos de este dataset: se fijan a priori para evitar data dredging.
HUBS_REEXPORTACION = ["NLD", "BEL", "SGP", "HKG", "PAN", "ARE"]

FORMULA = (
    "exporta_mill ~ log_gdp_socio + log_dist + contig + comlang_off "
    "+ colony + tiene_acuerdo + C(anio_f)"
)


def cargar_panel() -> pd.DataFrame:
    with open(RAW, "r", encoding="utf-8") as f:
        data = json.load(f)
    df = pd.DataFrame(data)
    df = df.dropna(subset=["gdp_socio", "dist"]).copy()
    df["log_gdp_socio"] = np.log(df["gdp_socio"])
    df["log_dist"] = np.log(df["dist"])
    df["anio_f"] = df["anio"].astype(str)
    return df


def ajustar_ppml(df: pd.DataFrame, columna_valor: str) -> tuple:
    d = df.copy()
    d["exporta_mill"] = d[columna_valor] / 1e6
    modelo = smf.glm(FORMULA, data=d, family=sm.families.Poisson()).fit(
        cov_type="cluster", cov_kwds={"groups": d["socio_iso3"]}
    )
    pred = modelo.predict(d)
    pseudo_r2 = float(np.corrcoef(pred, d["exporta_mill"])[0, 1] ** 2)
    return modelo, pseudo_r2, d


def resumen(nombre: str, modelo, pseudo_r2: float, n: int) -> pd.DataFrame:
    claves = ["log_gdp_socio", "log_dist", "contig", "comlang_off", "colony", "tiene_acuerdo"]
    filas = []
    for k in claves:
        filas.append(
            {
                "especificacion": nombre,
                "variable": k,
                "coef": modelo.params[k],
                "p_valor": modelo.pvalues[k],
                "n": n,
                "pseudo_r2": pseudo_r2,
            }
        )
    return pd.DataFrame(filas)


def main():
    df = cargar_panel()
    print(f"Panel: {len(df)} observaciones (socio x año), {df['socio_iso3'].nunique()} socios, "
          f"{df['anio'].nunique()} años")

    resultados = []

    # 1) Modelo crudo: exportaciones totales (contaminado por oro/cobre/gas)
    m1, r1, d1 = ajustar_ppml(df, "exporta_usd_total")
    resultados.append(resumen("1_crudo_total", m1, r1, len(d1)))
    print(f"\n[1] Crudo (exportaciones totales): log_dist = {m1.params['log_dist']:+.3f} "
          f"(p={m1.pvalues['log_dist']:.3f}) — signo incorrecto si es positivo")

    # 2) Sin HS26 (minerales/concentrados) ni HS71 (oro/plata) ni HS27 (combustibles)
    m2, r2, d2 = ajustar_ppml(df, "exporta_usd_sin_commodities")
    resultados.append(resumen("2_sin_commodities", m2, r2, len(d2)))
    print(f"[2] Sin oro/minerales/combustibles: log_dist = {m2.params['log_dist']:+.3f} "
          f"(p={m2.pvalues['log_dist']:.3f})")

    # 3) Además, sin los hubs de reexportación estándar de la literatura
    d3_base = df[~df["socio_iso3"].isin(HUBS_REEXPORTACION)].copy()
    m3, r3, d3 = ajustar_ppml(d3_base, "exporta_usd_sin_commodities")
    resultados.append(resumen("3_final_sin_hubs", m3, r3, len(d3)))
    print(f"[3] FINAL (sin commodities, sin hubs {HUBS_REEXPORTACION}): "
          f"log_dist = {m3.params['log_dist']:+.3f} (p={m3.pvalues['log_dist']:.3f}), "
          f"pseudo-R2 = {r3:.3f}")

    tabla = pd.concat(resultados, ignore_index=True)
    tabla.to_csv(PROCESADO / "tabla_comparativa_especificaciones.csv", index=False)

    d3.to_csv(PROCESADO / "panel_final_estimacion.csv", index=False)

    print("\n=== Tabla final de coeficientes (especificación 3, la publicable) ===")
    for k in ["log_gdp_socio", "log_dist", "contig", "comlang_off", "colony", "tiene_acuerdo"]:
        print(f"  {k:15s} {m3.params[k]:8.4f}   p={m3.pvalues[k]:.3f}")

    return m1, m2, m3, df, d3


if __name__ == "__main__":
    main()
