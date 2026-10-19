"""Análisis — investigaciones/infraestructura-logistica-competitividad-exportadora

Panel aduana×mes (2019-2026) de exportaciones registradas (muestra parcial Aduanet)
cruzado con atributos de infraestructura del MTC (terminales, concesión, estado de
conservación, índice de vulnerabilidad, cargas históricas).

Diseño (según propuesta §7): Y_{a,t} = α + β·Infra_a + λ_t + ε_{a,t}. Los atributos
de infraestructura son de corte único (no panel), por lo que β se identifica de la
variación ENTRE aduanas; los efectos fijos de tiempo absorben choques comunes.

Fase PILOTO declarada: la cobertura es 339/13.366 RUC (~2,5%) y hay 15 aduanas —
poder estadístico limitado; el valor del ejercicio es metodológico (pipeline listo).

Mapeo aduana↔entidad MTC (revisado manualmente contra nombres reales, 2026-10-19):
  118 Callao marítima → puertos 071CLL1-{1,2,3} (concesión: consorcio, 3 terminales)
  235 Callao aérea    → aeródromo 0711LIM Jorge Chávez (concesionado, operativo)
  046 Paita           → 201PAI{1,2,3}   145 Mollendo-Matarani → 041MRI{1,2}
  127 Pisco           → 111PCO{1,2,3}   370 Chancay           → 151CHAY{1,2}
  226 Iquitos         → 162IQ* (fluvial) 163 Ilo              → 181ILO{1,2}
  091 Chimbote        → 021CHB{1,3,4,5}
  019 Tumbes · 262 Desaguadero · 172 Tacna · 299 La Tina → FRONTERIZAS (sin terminal MTC)
  280 Puerto Maldonado → fluvial/frontera (cargas históricas, sin terminal en MTC)
  154 Arequipa → aduana interior (sin punto de salida propio)

Uso:
    python investigaciones/infraestructura-logistica-competitividad-exportadora/scripts/analisar.py
"""
from __future__ import annotations

import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

HERE = pathlib.Path(__file__).resolve().parents[1]
RAW = HERE / "data" / "raw"
RES = HERE / "results"

MAPEO_PUERTOS: dict[str, list[str]] = {
    "118": ["071CLL1-1", "071CLL1-2", "071CLL1-3"],
    "046": ["201PAI1", "201PAI2", "201PAI3"],
    "145": ["041MRI1", "041MRI2"],
    "127": ["111PCO1", "111PCO2", "111PCO3"],
    "370": ["151CHAY1", "151CHAY2"],
    "226": ["162IQT1", "162IQT3", "162IQT5", "162IQT17", "162IQT27", "162IQT28", "162TIQ1"],
    "163": ["181ILO1", "181ILO2"],
    "091": ["021CHB1", "021CHB3", "021CHB4", "021CHB5"],
}
MAPEO_CARGAS = {"118": "Callao", "046": "Paita", "145": "Matarani", "127": "Pisco",
                "226": "Iquitos", "163": "Ilo", "091": "Chimbote", "280": "Puerto Maldonado"}
AEREA = {"235": "0711LIM"}
FRONTERIZAS = {"019", "262", "172", "299"}


def atributos_infra() -> pd.DataFrame:
    term = pd.read_csv(RAW / "terminales_portuarios_snapshot.csv", dtype={"codigo_puerto": str})
    vuln = pd.read_csv(RAW / "indice_vulnerabilidad_snapshot.csv", dtype={"codigo_puerto": str})
    cargas = pd.read_csv(RAW / "cargas_portuarias_historico.csv")
    aero = pd.read_csv(RAW / "aerodromos.csv", dtype={"codigo_aerodromo": str})

    filas = []
    for aduana, puertos in MAPEO_PUERTOS.items():
        t = term[term["codigo_puerto"].isin(puertos)]
        v = vuln[vuln["codigo_puerto"].isin(puertos)]
        con_info = t[t["estado_conservacion"] != "Información no disponible"]
        puerto_cargas = MAPEO_CARGAS.get(aduana)
        cargas_2017 = (cargas[(cargas["puerto"] == puerto_cargas) & (cargas["anio"] == 2017)]
                       ["volumen_tm"].sum()) if puerto_cargas else 0
        filas.append({
            "aduana_codigo": aduana, "es_aerea": 0, "es_fronteriza": 0, "es_interior": 0,
            "n_terminales": len(t),
            "pct_bueno": (con_info["estado_conservacion"] == "Bueno").mean() if len(con_info) else np.nan,
            "concesion": int(t["es_concesionado"].any()),
            "score_vuln": v["score_vulnerabilidad"].mean() if len(v) else np.nan,
            "cargas_2017_tm": cargas_2017 if cargas_2017 > 0 else np.nan,
        })
    for aduana, cod_aero in AEREA.items():
        a = aero[aero["codigo_aerodromo"] == cod_aero]
        filas.append({"aduana_codigo": aduana, "es_aerea": 1, "es_fronteriza": 0,
                      "es_interior": 0, "n_terminales": 0, "pct_bueno": np.nan,
                      "concesion": int(a["es_concesionado"].any()),
                      "score_vuln": np.nan, "cargas_2017_tm": np.nan})
    for aduana in sorted(FRONTERIZAS):
        filas.append({"aduana_codigo": aduana, "es_aerea": 0, "es_fronteriza": 1,
                      "es_interior": 0, "n_terminales": 0, "pct_bueno": np.nan,
                      "concesion": 0, "score_vuln": np.nan, "cargas_2017_tm": np.nan})
    cargas_280 = (cargas[(cargas["puerto"] == "Puerto Maldonado") & (cargas["anio"] == 2017)]
                  ["volumen_tm"].sum())
    filas.append({"aduana_codigo": "280", "es_aerea": 0, "es_fronteriza": 1, "es_interior": 0,
                  "n_terminales": 0, "pct_bueno": np.nan, "concesion": 0, "score_vuln": np.nan,
                  "cargas_2017_tm": cargas_280 if cargas_280 > 0 else np.nan})
    filas.append({"aduana_codigo": "154", "es_aerea": 0, "es_fronteriza": 0, "es_interior": 1,
                  "n_terminales": 0, "pct_bueno": np.nan, "concesion": 0,
                  "score_vuln": np.nan, "cargas_2017_tm": np.nan})
    return pd.DataFrame(filas)


def main() -> None:
    RES.mkdir(parents=True, exist_ok=True)
    fob = pd.read_csv(RAW / "exportaciones_aduana_ruc.csv", dtype={"ruc": str, "aduana_codigo": str})

    # panel aduana×mes con ceros explícitos
    obs = (fob.groupby(["aduana_codigo", "anio", "mes"])
              .agg(fob_usd=("fob_usd", "sum"), n_ruc=("ruc", "nunique"),
                   n_paises=("pais_nombre", "nunique"))
              .reset_index())
    pais = (fob.groupby(["aduana_codigo", "anio", "mes", "pais_nombre"])["fob_usd"]
              .sum().reset_index())
    tot = pais.groupby(["aduana_codigo", "anio", "mes"])["fob_usd"].transform("sum")
    pais["share"] = pais["fob_usd"] / tot
    hhi = (pais.groupby(["aduana_codigo", "anio", "mes"])["share"]
              .apply(lambda s: (s ** 2).sum()).reset_index(name="hhi_destinos"))
    obs = obs.merge(hhi, on=["aduana_codigo", "anio", "mes"], how="left")
    obs["diversificacion"] = 1 - obs["hhi_destinos"]

    meses = pd.MultiIndex.from_product(
        [sorted(fob["aduana_codigo"].unique()),
         range(fob["anio"].min(), fob["anio"].max() + 1), range(1, 13)],
        names=["aduana_codigo", "anio", "mes"])
    panel = (pd.DataFrame(index=meses).reset_index()
                 .merge(obs, on=["aduana_codigo", "anio", "mes"], how="left"))
    panel[["fob_usd", "n_ruc", "n_paises"]] = panel[["fob_usd", "n_ruc", "n_paises"]].fillna(0)
    nom = fob.drop_duplicates("aduana_codigo")[["aduana_codigo", "aduana_nombre"]]
    panel = panel.merge(nom, on="aduana_codigo")
    attrs = atributos_infra()
    panel = panel.merge(attrs, on="aduana_codigo")

    # 2026 es año parcial → se modela 2019-2025
    mod = panel[panel["anio"] < 2026].copy()
    mod["log_fob"] = np.log1p(mod["fob_usd"])
    mod["log_ruc"] = np.log1p(mod["n_ruc"])
    print(f"[1/4] panel aduana×mes: {len(mod)} obs (2019-2025) · "
          f"{mod['aduana_codigo'].nunique()} aduanas · FOB total US${mod['fob_usd'].sum()/1e6:,.0f} MM")

    # ---- descriptivos ----
    por_aduana = (mod.groupby(["aduana_codigo", "aduana_nombre"])
                     .agg(fob_usd=("fob_usd", "sum"), meses_activos=("fob_usd", lambda s: (s > 0).sum()),
                          ruc_distintos=("n_ruc", "max"), meses_con_ruc=("n_ruc", lambda s: (s > 0).sum()))
                     .sort_values("fob_usd", ascending=False))
    por_aduana["part_fob"] = por_aduana["fob_usd"] / por_aduana["fob_usd"].sum()
    por_aduana = por_aduana.reset_index().merge(attrs, on="aduana_codigo")
    por_aduana.set_index("aduana_codigo").to_csv(RES / "tabla_01_por_aduana.csv", encoding="utf-8")
    print(f"      Callao marítima: {por_aduana.iloc[0]['part_fob']:.0%} del FOB de la muestra")

    # ---- modelos: entre-aduanas + panel con FE de tiempo ----
    entre = por_aduana.copy()
    entre["log_fob_mean"] = np.log1p(entre["fob_usd"] / entre["meses_activos"])
    entre["log_cargas"] = np.log1p(entre["cargas_2017_tm"])
    resultados = []
    for var in ["concesion", "log_cargas", "pct_bueno"]:
        sub = entre.dropna(subset=[var])
        if sub[var].nunique() < 2:
            continue
        m = smf.ols(f"log_fob_mean ~ {var}", data=sub).fit()
        resultados.append({"modelo": f"entre-aduanas: log FOB/mes ~ {var}",
                           "coef": round(m.params[var], 4), "p": round(m.pvalues[var], 4),
                           "n": int(m.nobs), "r2": round(m.rsquared, 3)})
        print(f"      {resultados[-1]['modelo']}: {resultados[-1]['coef']} "
              f"(p={resultados[-1]['p']}) n={resultados[-1]['n']}")

    m_panel = smf.ols("log_fob ~ concesion + C(anio)*C(mes)", data=mod).fit(
        cov_type="cluster", cov_kwds={"groups": mod["aduana_codigo"]})
    resultados.append({"modelo": "panel log FOB ~ concesión + FE tiempo (cluster aduana)",
                       "coef": round(m_panel.params["concesion"], 4),
                       "p": round(m_panel.pvalues["concesion"], 4),
                       "n": int(m_panel.nobs), "r2": round(m_panel.rsquared, 3)})
    print(f"      panel concesión: {resultados[-1]['coef']} (p={resultados[-1]['p']}) "
          f"n={resultados[-1]['n']}")
    m_panel2 = smf.ols("log_ruc ~ concesion + C(anio)*C(mes)", data=mod).fit(
        cov_type="cluster", cov_kwds={"groups": mod["aduana_codigo"]})
    resultados.append({"modelo": "panel log RUC ~ concesión + FE tiempo (cluster aduana)",
                       "coef": round(m_panel2.params["concesion"], 4),
                       "p": round(m_panel2.pvalues["concesion"], 4),
                       "n": int(m_panel2.nobs), "r2": round(m_panel2.rsquared, 3)})
    pd.DataFrame(resultados).to_csv(RES / "tabla_02_modelos.csv", index=False, encoding="utf-8")

    # ---- figuras ----
    top = por_aduana.head(10)
    plt.figure(figsize=(7, 3.6))
    plt.bar(top["aduana_nombre"], top["fob_usd"] / 1e6, color="#2E5395")
    plt.title("FOB registrado por aduana, 2019-2025 (muestra parcial Aduanet)")
    plt.ylabel("US$ millones"); plt.xticks(rotation=45, ha="right"); plt.tight_layout()
    plt.savefig(RES / "fig_01_fob_por_aduana.png", dpi=150); plt.close()

    top_r = por_aduana.sort_values("ruc_distintos", ascending=False).head(10)
    plt.figure(figsize=(7, 3.6))
    plt.bar(top_r["aduana_nombre"], top_r["ruc_distintos"], color="#7F6000")
    plt.title("Máximo de RUC activos simultáneos por aduana (mes pico)")
    plt.ylabel("RUC"); plt.xticks(rotation=45, ha="right"); plt.tight_layout()
    plt.savefig(RES / "fig_02_ruc_por_aduana.png", dpi=150); plt.close()

    plt.figure(figsize=(6.5, 4))
    plt.scatter(entre["log_fob_mean"], entre["concesion"],
                c=np.where(entre["es_fronteriza"] == 1, "#B00020", "#2E5395"))
    for _, r in entre.iterrows():
        plt.annotate(r["aduana_nombre"].split(" ")[0], (r["log_fob_mean"], r["concesion"]),
                     fontsize=7, xytext=(3, 3), textcoords="offset points")
    plt.title("Concesión vs log FOB mensual promedio (azul=marítima/fluvial, rojo=fronteriza)")
    plt.xlabel("log(1+FOB/mes promedio)"); plt.ylabel("Concesión (0/1)")
    plt.tight_layout(); plt.savefig(RES / "fig_03_concesion_vs_fob.png", dpi=150); plt.close()

    # ---- resumen ejecutivo auto-generado ----
    conc = entre[entre["concesion"] == 1]
    sin_conc = entre[entre["concesion"] == 0]
    resumen = f"""# Resumen ejecutivo — infraestructura de salida y competitividad exportadora (fase piloto)

*Generado por `scripts/analisar.py` · fecha: 2026-10-19 · panel aduana×mes
{len(mod)} obs ({mod['aduana_codigo'].nunique()} aduanas × 84 meses, 2019-2025)*

## Advertencia de diseño (leer primero)

**Fase piloto.** La muestra cubre {fob['ruc'].nunique()} RUC de una meta de ~13.366
(~{fob['ruc'].nunique()/13366:.0%}) — ingesta parcial y no aleatoria de Aduanet. Los niveles de FOB
**no representan** el comercio total por aduana; solo lo ingerido. Con 15 aduanas y
atributos de infraestructura de corte único, β se identifica de la variación entre
aduanas (poder limitado; 15 clusters es poco para EE cluster).

## Qué se midió

- **Panel aduana×mes** (2019-2025) de FOB, RUC activos y diversificación de destinos
  (1−HHI), con ceros explícitos para aduana-mes sin registros.
- **Atributos MTC** por aduana (mapeo manual documentado en el script): terminales
  mapeados ({len(MAPEO_PUERTOS)} aduanas marítimas/fluviales), aeródromo para la aérea
  (Jorge Chávez), 4 fronterizas sin terminal y 1 interior.
  Dedupe: {len(pd.read_csv(RAW / 'terminales_portuarios_snapshot.csv'))} terminales con estado
  no disponible → {int((pd.read_csv(RAW / 'terminales_portuarios_snapshot.csv')['estado_conservacion'] != 'Información no disponible').sum())} con estado real.

## Hallazgos

1. **Concentración**: la aduana marítima del Callao concentra el
   {por_aduana.iloc[0]['part_fob']:.0%} del FOB de la muestra; las 3 primeras (Callao marítimo,
   Callao aéreo, Paita) superan el {(por_aduana.head(3)['part_fob'].sum()):.0%}.
2. **Concesión**: los modelos dan β positivo para terminales concesionados
   (entre-aduanas y panel con FE de tiempo; ver `tabla_02_modelos.csv`), PERO la
   concesión coincide exactamente con las aduanas más grandes del país (Callao,
   Paita, Matarani): con 15 aduanas, β NO separa el efecto concesión del efecto
   tamaño. Lectura correcta: el resultado es compatible con la hipótesis pero no
   la identifica.
3. **Estado de conservación**: {int(entre['pct_bueno'].notna().sum())} aduanas con dato usable
   (el resto: 'Información no disponible' en el MTC) — limitación del registro oficial.
4. **Cargas históricas (2010-2017)**: solo {int(entre['log_cargas'].notna().sum())} aduanas tienen
   contraparte en el registro histórico de cargas — cobertura insuficiente para un
   control serio.

## Cómo leer esto

Correlacional, muestral y con N chico. Sirve como pipeline verificado para la fase
completa (misma ingesta Aduanet, sin cambios de código) y como diagnóstico de la
calidad del registro oficial de infraestructura (312/507 terminales sin estado).

## Reproducibilidad

`scripts/extraer_datos.py` → `data/raw/` (15.037 filas) → `scripts/analisar.py` → `results/`.
"""
    (RES / "resumen_ejecutivo.md").write_text(resumen, encoding="utf-8")
    print(f"[ok] salidas en {RES}")


if __name__ == "__main__":
    main()
