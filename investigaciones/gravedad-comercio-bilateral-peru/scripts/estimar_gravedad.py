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
RAW_EXPORTA = RAIZ / "data" / "raw" / "panel_bilateral_peru_2015_2024.json"
RAW_IMPORTA = RAIZ / "data" / "raw" / "panel_bilateral_peru_importaciones_2015_2024.json"
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


def cargar_panel(ruta: Path) -> pd.DataFrame:
    with open(ruta, "r", encoding="utf-8") as f:
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


def estimar_lado(df: pd.DataFrame, col_total: str, col_limpio: str, prefijo: str):
    """Corre las 3 especificaciones (cruda, sin commodities, final sin hubs) para
    un lado del comercio (exporta_* o importa_*). Devuelve (resultados, d3, m1, m2, m3)."""
    resultados = []

    m1, r1, d1 = ajustar_ppml(df, col_total)
    resultados.append(resumen(f"{prefijo}_1_crudo_total", m1, r1, len(d1)))
    print(f"\n[{prefijo} 1] Crudo (total): log_dist = {m1.params['log_dist']:+.3f} "
          f"(p={m1.pvalues['log_dist']:.3f})")

    m2, r2, d2 = ajustar_ppml(df, col_limpio)
    resultados.append(resumen(f"{prefijo}_2_sin_commodities", m2, r2, len(d2)))
    print(f"[{prefijo} 2] Sin oro/minerales/combustibles (HS26/71/27): "
          f"log_dist = {m2.params['log_dist']:+.3f} (p={m2.pvalues['log_dist']:.3f})")

    d3_base = df[~df["socio_iso3"].isin(HUBS_REEXPORTACION)].copy()
    m3, r3, d3 = ajustar_ppml(d3_base, col_limpio)
    resultados.append(resumen(f"{prefijo}_3_final_sin_hubs", m3, r3, len(d3)))
    print(f"[{prefijo} 3] FINAL (sin commodities, sin hubs {HUBS_REEXPORTACION}): "
          f"log_dist = {m3.params['log_dist']:+.3f} (p={m3.pvalues['log_dist']:.3f}), "
          f"pseudo-R2 = {r3:.3f}")

    return resultados, d3, m1, m2, m3


def main():
    df_exporta = cargar_panel(RAW_EXPORTA)
    print(f"Panel exportaciones: {len(df_exporta)} obs., {df_exporta['socio_iso3'].nunique()} socios, "
          f"{df_exporta['anio'].nunique()} años")
    res_exporta, d3_exporta, *_ = estimar_lado(
        df_exporta, "exporta_usd_total", "exporta_usd_sin_commodities", "exporta"
    )

    df_importa = cargar_panel(RAW_IMPORTA)
    print(f"\nPanel importaciones: {len(df_importa)} obs., {df_importa['socio_iso3'].nunique()} socios, "
          f"{df_importa['anio'].nunique()} años")
    res_importa, d3_importa, *_ = estimar_lado(
        df_importa, "importa_usd_total", "importa_usd_sin_commodities", "importa"
    )

    tabla = pd.concat(res_exporta + res_importa, ignore_index=True)
    tabla.to_csv(PROCESADO / "tabla_comparativa_especificaciones.csv", index=False)

    d3_exporta.to_csv(PROCESADO / "panel_final_estimacion_exportaciones.csv", index=False)
    d3_importa.to_csv(PROCESADO / "panel_final_estimacion_importaciones.csv", index=False)

    print("\n=== Asimetría exportaciones vs. importaciones (especificación final, log_dist) ===")
    fila_exp = tabla[(tabla.especificacion == "exporta_3_final_sin_hubs") & (tabla.variable == "log_dist")].iloc[0]
    fila_imp = tabla[(tabla.especificacion == "importa_3_final_sin_hubs") & (tabla.variable == "log_dist")].iloc[0]
    print(f"  Exportaciones: log_dist = {fila_exp.coef:+.3f} (p={fila_exp.p_valor:.3f}) — signo esperado")
    print(f"  Importaciones: log_dist = {fila_imp.coef:+.3f} (p={fila_imp.p_valor:.3f}) — signo contrario, "
          f"consistente con que China/EEUU/Alemania/Japón/Corea dominan la canasta importadora")


if __name__ == "__main__":
    main()
